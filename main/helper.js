// =============================================================================
//  main/helper.js — El helper de Windows (helpers/WinHelper)
// -----------------------------------------------------------------------------
//  WinHelper.exe es un programa en C# que habla con Windows por nosotros (la
//  música que suena, el volumen, las salidas de audio y el portapapeles).
//
//  Lo lanzamos como proceso hijo:
//    • Él nos escribe una línea JSON por cada novedad: {"type":"media", ...}
//      Este módulo reparte cada línea, según su "type", a quien se haya
//      suscrito con onHelperMessage('media', handler).
//    • Nosotros le mandamos órdenes escribiendo en su stdin (sendToHelper).
//  Si se cierra solo, lo reiniciamos esperando cada vez más (2 s, 4 s... 1 min).
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const { ROOT_DIR, state } = require('./state');
const { addNotice } = require('./notices');

const RESTART_MIN_MS = 2000;
const RESTART_MAX_MS = 60 * 1000;

const helper = {
  process: null, // el proceso hijo (WinHelper.exe)
  restartDelay: RESTART_MIN_MS,
  restartTimer: null,
  // 'starting' | 'ok' | 'missing' (no está compilado) | 'unsupported' (no es Windows) | 'error'
  status: 'starting',
};

const messageHandlers = new Map(); // "type" → lista de funciones
const statusListeners = [];

/** Dónde está WinHelper.exe (se puede cambiar con la variable NOTCH_HELPER, útil para pruebas). */
function getHelperPath() {
  if (process.env.NOTCH_HELPER) return process.env.NOTCH_HELPER;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'WinHelper', 'WinHelper.exe')
    : path.join(ROOT_DIR, 'helpers', 'WinHelper', 'publish', 'WinHelper.exe');
}

/** Suscribirse a un tipo de mensaje del helper (p. ej. 'media'). */
function onHelperMessage(type, handler) {
  if (!messageHandlers.has(type)) messageHandlers.set(type, []);
  messageHandlers.get(type).push(handler);
}

/** Enterarse de si el helper funciona: 'starting', 'ok', 'missing', 'unsupported' o 'error'. */
function onHelperStatus(listener) {
  statusListeners.push(listener);
}

/** Cómo está ahora: 'starting', 'ok', 'missing', 'unsupported' o 'error'. */
function getHelperStatus() {
  return helper.status;
}

function setStatus(status) {
  const previous = helper.status;
  helper.status = status;
  statusListeners.forEach((listener) => listener(status));

  // Avisos en la isla. Si se cae varias veces seguidas, solo avisamos la
  // primera (la clave 'helper' hace que no se repita en la lista).
  if (status === 'missing') {
    addNotice({
      key: 'helper',
      kind: 'error',
      tone: 'warning',
      title: 'Falta el helper de Windows',
      text: app.isPackaged
        ? 'Sin él no hay música, volumen ni portapapeles. Reinstala Notch.'
        : 'Sin él no hay música, volumen ni portapapeles. Compílalo con: npm run build:helper',
      alert: true,
    });
  } else if (status === 'error' && previous !== 'error') {
    addNotice({
      key: 'helper',
      kind: 'error',
      tone: 'warning',
      title: 'El helper de Windows se cerró',
      text: 'Lo vuelvo a abrir solo en unos segundos.',
    });
  }
}

function startHelper() {
  helper.restartTimer = null;
  const helperPath = getHelperPath();

  if (process.platform !== 'win32' && !process.env.NOTCH_HELPER) {
    setStatus('unsupported');
    return;
  }
  if (!fs.existsSync(helperPath)) {
    console.warn(`[helper] No encuentro ${helperPath}. Compílalo con: npm run build:helper`);
    setStatus('missing');
    return;
  }

  // windowsHide: que no aparezca una ventana de consola negra.
  const child = spawn(helperPath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  helper.process = child;

  // readline corta la salida en líneas: cada línea es un JSON completo.
  readline.createInterface({ input: child.stdout }).on('line', handleHelperLine);

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text) => console.warn(`[helper] ${text.trim()}`));
  child.stdin.on('error', () => {}); // si el helper muere, escribirle falla: lo ignoramos
  child.on('error', (error) => {
    console.warn(`[helper] No se pudo arrancar: ${error.message}`);
    onHelperGone(child);
  });
  child.on('exit', (code) => {
    if (!state.isQuitting) console.warn(`[helper] Se cerró (código ${code}).`);
    onHelperGone(child);
  });
}

/** El helper se cerró o no pudo arrancar: lo reiniciamos un poco más tarde. */
function onHelperGone(child) {
  if (helper.process !== child) return; // ya lo habíamos gestionado
  helper.process = null;
  if (state.isQuitting || helper.restartTimer) return;
  setStatus('error');
  console.warn(`[helper] Lo reinicio en ${helper.restartDelay / 1000} s.`);
  helper.restartTimer = setTimeout(startHelper, helper.restartDelay);
  helper.restartDelay = Math.min(helper.restartDelay * 2, RESTART_MAX_MS);
}

function stopHelper() {
  clearTimeout(helper.restartTimer);
  helper.restartTimer = null;
  if (helper.process) {
    helper.process.kill();
    helper.process = null;
  }
}

/** Manda una línea de texto (una orden) al helper. */
function sendToHelper(line) {
  const stdin = helper.process?.stdin;
  if (stdin && stdin.writable) stdin.write(`${line}\n`);
}

function handleHelperLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.warn(`[helper] Mandó algo que no es JSON: ${line.slice(0, 120)}`);
    return;
  }

  if (message.type === 'ready') {
    helper.restartDelay = RESTART_MIN_MS; // arrancó bien: la próxima espera vuelve a ser corta
    setStatus('ok');
    console.log('[helper] Listo.');
  } else if (message.type === 'error') {
    console.warn(`[helper] ${message.message}`);
  } else {
    (messageHandlers.get(message.type) || []).forEach((handler) => handler(message));
  }
}

module.exports = { startHelper, stopHelper, sendToHelper, onHelperMessage, onHelperStatus, getHelperStatus };
