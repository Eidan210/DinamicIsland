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

/** Manda un mensaje a la página (si la ventana sigue viva). */
function sendToRenderer(channel, data) {
  const { win } = state;
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

/** Solo aceptamos mensajes que vengan de nuestra propia ventana. */
function isFromNotch(event) {
  const { win } = state;
  return Boolean(win) && !win.isDestroyed() && event.sender.id === win.webContents.id;
}

/** Registra un aviso (send/on) que solo atiende a nuestra ventana. */
function onRendererMessage(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (isFromNotch(event)) handler(...args);
  });
}

/** Registra una pregunta con respuesta (invoke/handle). */
function onRendererRequest(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => (isFromNotch(event) ? handler(...args) : null));
}

module.exports = { sendToRenderer, onRendererMessage, onRendererRequest };
