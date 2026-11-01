// =============================================================================
//  main/ai-server.js — El servidor local que escucha a Claude Code (y a agy)
// -----------------------------------------------------------------------------
//  Claude Code puede mandar sus eventos ("hooks" de tipo http) a una URL. Notch
//  abre un servidor pequeño SOLO en tu PC (127.0.0.1:47823) para recibirlos:
//    POST /claude        eventos de Claude Code (el JSON de cada hook)
//    POST /agy/<evento>  eventos de Antigravity (un hook con curl.exe; en prueba)
//    GET  /health        para comprobar que Notch está escuchando
//
//  Seguridad:
//    • Solo escucha en 127.0.0.1: nadie de fuera de tu PC puede conectarse.
//    • Cada petición debe traer "Authorization: Bearer <token>". El token se
//      crea al azar la primera vez y se guarda en tu carpeta de datos
//      (ai-token.txt). Sin él, todo se rechaza.
//    • Rechaza peticiones de navegadores (cabecera Origin) y con un Host que
//      no sea el nuestro (protege de páginas web maliciosas).
//    • Máximo 1 MB por petición.
//
//  Notch no se conecta a ningún sitio: solo recibe lo que Claude Code le manda.
// =============================================================================

'use strict';

const { app } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { state } = require('./state');
const { addNotice, clearNotice } = require('./notices');
const sessions = require('./ai-sessions');

const MAX_BODY = 1024 * 1024; // 1 MB
const TOKEN_FILE = 'ai-token.txt';

let server = null;
let token = null;

/** El token (lo crea la primera vez). */
function getToken() {
  if (token) return token;
  const filePath = path.join(app.getPath('userData'), TOKEN_FILE);
  try {
    const saved = fs.readFileSync(filePath, 'utf8').trim();
    if (/^[a-f0-9]{48}$/.test(saved)) token = saved;
  } catch {
    // no existe todavía: lo creamos abajo
  }
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, token, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      console.warn(`[ia] No se pudo guardar el token: ${error.message}`);
    }
  }
  return token;
}

/** ¿Trae el token bueno? (comparación en tiempo constante) */
function isAuthorized(header) {
  const match = /^Bearer\s+([a-f0-9]{48})$/i.exec(String(header || '').trim());
  if (!match) return false;
  const expected = Buffer.from(getToken());
  const received = Buffer.from(match[1].toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** Solo aceptamos peticiones dirigidas a 127.0.0.1 o localhost en nuestro puerto. */
function isLocalHost(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function reply(res, status, body = '') {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function replyJson(res, status, data) {
  reply(res, status, JSON.stringify(data));
}

/** Lee el cuerpo de la petición (máximo 1 MB). */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const port = state.settings.aiPort;
  if (!isLocalHost(String(req.headers.host || ''), port) || req.headers.origin) return reply(res, 403);
  if (!isAuthorized(req.headers.authorization)) return reply(res, 401);

  const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === 'GET' && pathname === '/health') return replyJson(res, 200, { ok: true, app: 'notch' });
  if (req.method !== 'POST') return reply(res, 405);

  const agyMatch = /^\/agy\/([A-Za-z]{1,40})$/.exec(pathname);
  if (pathname !== '/claude' && !agyMatch) return reply(res, 404);

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    return reply(res, error.status || 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(res, 400);

  if (agyMatch) {
    sessions.handleAgyEvent(agyMatch[1], payload);
    return replyJson(res, 200, {});
  }

  // Las decisiones pueden tardar (esperan tu respuesta). Si Claude Code cuelga
  // antes (respondiste en la terminal, se agotó su tiempo...), lo soltamos.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const response = await sessions.handleClaudeEvent(payload, controller.signal);
    // 200 vacío = "sin decisión": Claude Code sigue como siempre.
    if (response) replyJson(res, 200, response);
    else reply(res, 200);
  } catch (error) {
    console.warn(`[ia] Error con un evento de Claude Code: ${error.message}`);
    reply(res, 200);
  }
}

/** Arranca el servidor (si "ai" está activado en settings.json). */
function startAiServer() {
  if (server || !state.settings.ai) return;
  const port = state.settings.aiPort;
  getToken();
  server = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => reply(res, 500));
  });
  // El cuerpo debe llegar enseguida; la RESPUESTA sí puede tardar (decisiones).
  server.requestTimeout = 15 * 1000;
  server.headersTimeout = 10 * 1000;

  server.on('error', (error) => {
    const busy = error.code === 'EADDRINUSE';
    console.warn(`[ia] No se pudo abrir el servidor en el puerto ${port}: ${error.message}`);
    addNotice({
      key: 'ai:server',
      kind: 'ai',
      tone: 'warning',
      title: 'La IA no puede escuchar a Claude Code',
      text: busy
        ? `Otra app usa el puerto ${port}. Cambia "aiPort" en settings.json (y en tu configuración de Claude Code).`
        : error.message,
      alert: true,
    });
    sessions.setServerStatus({ listening: false, port, error: busy ? 'busy' : 'error' });
    server = null;
  });

  server.listen(port, '127.0.0.1', () => {
    clearNotice('ai:server');
    sessions.setServerStatus({ listening: true, port, error: '' });
    console.log(`[ia] Escuchando a Claude Code en http://127.0.0.1:${port}`);
  });
}

/** Cierra el servidor (lo pendiente vuelve a la terminal). */
function stopAiServer() {
  if (!server) return;
  sessions.releaseAll();
  server.close();
  server.closeAllConnections?.();
  server = null;
  sessions.setServerStatus({ listening: false, port: state.settings.aiPort, error: '' });
}

/** Al guardar settings.json: encender, apagar o cambiar de puerto al momento. */
function onSettingsChanged(previous) {
  if (previous.ai === state.settings.ai && previous.aiPort === state.settings.aiPort) return;
  stopAiServer();
  startAiServer();
}

// -----------------------------------------------------------------------------
// La configuración para pegar (Notch NO toca tus archivos: la copia y tú la pegas)
// -----------------------------------------------------------------------------

/** El bloque "hooks" para ~/.claude/settings.json, con tu token y tu puerto. */
function getClaudeHooksConfig() {
  const url = `http://127.0.0.1:${state.settings.aiPort}/claude`;
  const headers = { Authorization: `Bearer ${getToken()}` };
  const hook = (timeout, extra = {}) => [{ hooks: [{ type: 'http', url, headers, timeout, ...extra }] }];
  const toolHook = (timeout, extra = {}) => [{ matcher: '*', hooks: [{ type: 'http', url, headers, timeout, ...extra }] }];
  return {
    hooks: {
      SessionStart: hook(5),
      UserPromptSubmit: hook(5),
      // Espera tu respuesta en las preguntas (AskUserQuestion) y los planes (ExitPlanMode)
      PreToolUse: toolHook(600),
      // Espera tu respuesta en los permisos
      PermissionRequest: toolHook(600, { statusMessage: 'Esperando tu respuesta en Notch…' }),
      PostToolUse: toolHook(5),
      PostToolUseFailure: toolHook(5),
      Notification: hook(5),
      Stop: hook(5),
      StopFailure: hook(5),
      SessionEnd: hook(2),
    },
  };
}

/** El hook de Antigravity (hooks.json) — en prueba: solo informa, nunca decide. */
function getAgyHooksConfig() {
  const url = `http://127.0.0.1:${state.settings.aiPort}/agy/PostToolUse`;
  const command = `curl.exe -s -m 3 -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${getToken()}" --data-binary @- ${url}`;
  return { PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command }] }] };
}

function getSetupText(kind) {
  const config = kind === 'agy' ? getAgyHooksConfig() : getClaudeHooksConfig();
  return `${JSON.stringify(config, null, 2)}\n`;
}

module.exports = { startAiServer, stopAiServer, onSettingsChanged, getSetupText, getToken };
