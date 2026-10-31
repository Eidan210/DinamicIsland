// =============================================================================
//  main/pomodoro.js — El temporizador Pomodoro
// -----------------------------------------------------------------------------
//  Vive aquí (y no en la página) para que el aviso llegue a su hora aunque la
//  página esté en segundo plano: Chromium frena los temporizadores de las
//  páginas que no se ven; los del proceso principal, no.
// =============================================================================

'use strict';

const { Notification, nativeImage } = require('electron');
const path = require('node:path');
const { ROOT_DIR, state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { clampMinutes, saveSetting } = require('./config');

const MINUTE_MS = 60 * 1000;

const pomodoro = {
  status: 'idle', // 'idle' (listo) | 'running' | 'paused' | 'finished'
  durationMs: 25 * MINUTE_MS,
  remainingMs: 25 * MINUTE_MS,
  endsAt: null, // momento exacto (Date.now()) en que termina, si está corriendo
  timer: null, // el único setTimeout: salta justo al terminar
  completedCount: 0, // Pomodoros terminados hoy
  completedDay: '', // día al que corresponde completedCount
};

let lastNotification = null; // referencia viva para que el clic en la notificación funcione
let onNotificationClick = () => {}; // main.js decide qué hacer (abrir la pestaña Focus)

/** "2026-10-31": sirve para reiniciar el contador de Pomodoros cada día. */
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Lo que la página necesita para dibujar el Pomodoro. */
function getPomodoroState() {
  const isRunning = pomodoro.status === 'running';
  return {
    status: pomodoro.status,
    durationMs: pomodoro.durationMs,
    remainingMs: isRunning ? Math.max(0, pomodoro.endsAt - Date.now()) : pomodoro.remainingMs,
    // Con endsAt la página calcula ella sola el tiempo que queda, segundo a
    // segundo, sin tener que preguntarnos.
    endsAt: isRunning ? pomodoro.endsAt : null,
    minutes: state.settings.pomodoroMinutes,
    completedToday: pomodoro.completedDay === todayKey() ? pomodoro.completedCount : 0,
  };
}

function sendPomodoroState() {
  sendToRenderer('pomodoro:state', getPomodoroState());
}

function startPomodoro() {
  if (pomodoro.status === 'running') return;
  if (pomodoro.status !== 'paused') {
    // Listo o terminado → empezamos una sesión nueva desde el principio.
    pomodoro.durationMs = state.settings.pomodoroMinutes * MINUTE_MS;
    pomodoro.remainingMs = pomodoro.durationMs;
  }
  pomodoro.status = 'running';
  pomodoro.endsAt = Date.now() + pomodoro.remainingMs;
  clearTimeout(pomodoro.timer);
  // UN solo temporizador que salta al terminar: nada de comprobar cada segundo.
  pomodoro.timer = setTimeout(finishPomodoro, pomodoro.remainingMs);
  sendPomodoroState();
}

function pausePomodoro() {
  if (pomodoro.status !== 'running') return;
  clearTimeout(pomodoro.timer);
  pomodoro.remainingMs = Math.max(0, pomodoro.endsAt - Date.now());
  pomodoro.endsAt = null;
  pomodoro.status = 'paused';
  sendPomodoroState();
}

function resetPomodoro() {
  clearTimeout(pomodoro.timer);
  pomodoro.status = 'idle';
  pomodoro.durationMs = state.settings.pomodoroMinutes * MINUTE_MS;
  pomodoro.remainingMs = pomodoro.durationMs;
  pomodoro.endsAt = null;
  sendPomodoroState();
}

function togglePomodoro() {
  if (pomodoro.status === 'running') pausePomodoro();
  else startPomodoro();
}

function isPomodoroRunning() {
  return pomodoro.status === 'running';
}

function finishPomodoro() {
  clearTimeout(pomodoro.timer);
  pomodoro.status = 'finished';
  pomodoro.remainingMs = 0;
  pomodoro.endsAt = null;

  const today = todayKey();
  if (pomodoro.completedDay !== today) {
    pomodoro.completedDay = today;
    pomodoro.completedCount = 0;
  }
  pomodoro.completedCount += 1;

  sendPomodoroState();
  notifyPomodoroFinished();
}

/** Cambia la duración (botones − / + de la pestaña Focus) y la guarda en settings.json. */
function setPomodoroMinutes(minutes) {
  // No se cambia a mitad de una sesión: primero hay que reiniciarla.
  if (pomodoro.status === 'running' || pomodoro.status === 'paused') return;
  const value = clampMinutes(minutes);
  if (value === state.settings.pomodoroMinutes && pomodoro.status === 'idle') return;
  state.settings.pomodoroMinutes = value;
  saveSetting('pomodoroMinutes', value);
  resetPomodoro();
}

/** Se llama al recargar settings.json: si está parado, aplica ya la nueva duración. */
function onSettingsChanged() {
  if (pomodoro.status === 'idle') resetPomodoro();
  else sendPomodoroState();
}

/** Notificación de Windows al terminar. Si la pulsas, se llama a onNotificationClick. */
function notifyPomodoroFinished() {
  if (!Notification.isSupported()) return;
  const minutes = Math.round(pomodoro.durationMs / MINUTE_MS);
  const count = pomodoro.completedCount;

  lastNotification = new Notification({
    title: '¡Pomodoro terminado! 🍅',
    body: `${minutes} min de foco completados (${count} hoy). Tómate un descanso.`,
    icon: nativeImage.createFromPath(path.join(ROOT_DIR, 'assets', 'icon.png')),
  });
  lastNotification.on('click', () => onNotificationClick());
  lastNotification.show();
}

/** main.js decide qué pasa al pulsar la notificación (así este módulo no depende de la ventana). */
function setNotificationClickHandler(handler) {
  onNotificationClick = handler;
}

module.exports = {
  getPomodoroState,
  sendPomodoroState,
  startPomodoro,
  pausePomodoro,
  resetPomodoro,
  togglePomodoro,
  isPomodoroRunning,
  setPomodoroMinutes,
  onSettingsChanged,
  setNotificationClickHandler,
};
