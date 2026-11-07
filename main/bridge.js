// =============================================================================
//  main/bridge.js — Hablar con la página (IPC)
// -----------------------------------------------------------------------------
//  La página (renderer) y el proceso principal se comunican con mensajes IPC:
//    • main → página:   sendToRenderer('canal', datos)
//    • página → main:   onRendererMessage('canal', handler)   (aviso, sin respuesta)
//                        onRendererRequest('canal', handler)   (pregunta con respuesta)
//  La página solo puede usar los canales que expone preload.js.
// =============================================================================

'use strict';

const { ipcMain } = require('electron');
const { state } = require('./state');

// Avisos que la Casa de Clawd también necesita (para reflejar ajustes editados a mano).
const CASA_BROADCASTS = new Set(['settings:changed']);

/** Manda un mensaje a la página (si la ventana sigue viva). */
function sendToRenderer(channel, data) {
  const { win } = state;
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  if (CASA_BROADCASTS.has(channel)) {
    const casa = require('./casa-clawd').getCasaWindow(); // require tardío: evita dependencia circular
    if (casa) casa.webContents.send(channel, data);
  }
}

/** Solo aceptamos mensajes que vengan de nuestra propia ventana. */
function isFromNotch(event) {
  const { win } = state;
  return Boolean(win) && !win.isDestroyed() && event.sender.id === win.webContents.id;
}

/**
 * La Casa de Clawd es OTRA ventana (otro webContents): sin esto, todo lo que mandaba
 * (guardar ajustes, leerlos...) se descartaba en silencio.
 * Solo se le atienden los canales registrados con { casa: true }: lista cerrada.
 */
function isFromCasa(event) {
  const casa = require('./casa-clawd').getCasaWindow(); // require tardío: evita dependencia circular
  return Boolean(casa) && event.sender.id === casa.webContents.id;
}

/** Registra un aviso (send/on) que solo atiende a nuestra ventana (y a la Casa si casa:true). */
function onRendererMessage(channel, handler, { casa = false } = {}) {
  ipcMain.on(channel, (event, ...args) => {
    if (isFromNotch(event) || (casa && isFromCasa(event))) handler(...args);
  });
}

/** Registra una pregunta con respuesta (invoke/handle). */
function onRendererRequest(channel, handler, { casa = false } = {}) {
  ipcMain.handle(channel, (event, ...args) => (isFromNotch(event) || (casa && isFromCasa(event)) ? handler(...args) : null));
}

module.exports = { sendToRenderer, onRendererMessage, onRendererRequest };
