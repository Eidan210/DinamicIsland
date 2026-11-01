// =============================================================================
//  main/idle.js — ¿Estás delante del PC? (para que Clawd se duerma)
// -----------------------------------------------------------------------------
//  Clawd se duerme cuando llevas un rato sin tocar el ratón ni el teclado
//  ("clawdSleepMinutes", 5 min por defecto) o cuando bloqueas el PC, y se
//  despierta (contento) al volver.
//
//  Windows no avisa de "el usuario volvió", así que preguntamos cuánto llevas
//  sin tocar nada (powerMonitor.getSystemIdleTime): cada 30 s mientras está
//  despierto y cada 3 s mientras duerme (para despertarse en cuanto vuelves).
//  Bloquear, desbloquear, suspender y reanudar sí son avisos del sistema.
// =============================================================================

'use strict';

const { powerMonitor } = require('electron');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');

// NOTCH_IDLE_CHECK_MS solo sirve para las pruebas (comprobar más a menudo).
const AWAKE_CHECK_MS = Number(process.env.NOTCH_IDLE_CHECK_MS) || 30 * 1000;
const ASLEEP_CHECK_MS = 3 * 1000;

let sleeping = false;
let locked = false; // el PC está bloqueado
let suspended = false; // el PC está suspendido
let timer = null;

function isSleeping() {
  return sleeping;
}

function setSleeping(next) {
  if (next === sleeping) return;
  sleeping = next;
  sendToRenderer('clawd:sleep', sleeping);
}

function check() {
  clearTimeout(timer);
  timer = null;
  if (!state.settings.clawd) {
    setSleeping(false);
    return; // sin Clawd no hace falta mirar nada
  }
  const idleSeconds = powerMonitor.getSystemIdleTime();
  setSleeping(locked || suspended || idleSeconds >= state.settings.clawdSleepMinutes * 60);
  timer = setTimeout(check, sleeping ? ASLEEP_CHECK_MS : AWAKE_CHECK_MS);
}

function startIdleWatch() {
  powerMonitor.on('lock-screen', () => {
    locked = true;
    check();
  });
  powerMonitor.on('unlock-screen', () => {
    locked = false;
    check();
  });
  powerMonitor.on('suspend', () => {
    suspended = true; // al suspender, a dormir
    check();
  });
  powerMonitor.on('resume', () => {
    suspended = false; // (si sigue bloqueado, sigue durmiendo hasta que desbloquees)
    check();
  });
  check();
}

/** Al guardar settings.json ("clawd", "clawdSleepMinutes"): se aplica al momento. */
function onSettingsChanged() {
  check();
}

module.exports = { startIdleWatch, isSleeping, onSettingsChanged };
