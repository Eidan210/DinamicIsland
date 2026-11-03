// =============================================================================
//  main/login-item.js — Iniciar Notch al arrancar Windows
// -----------------------------------------------------------------------------
//  Permite que Notch se inicie automáticamente con Windows 11 utilizando la API
//  nativa app.setLoginItemSettings de Electron.
//  En modo desarrollo (--dev) registra la preferencia en configuración y avisa
//  de forma amigable que el arranque en el login requiere la app empaquetada.
// =============================================================================

'use strict';

const { app } = require('electron');
const { state } = require('./state');
const { saveSetting } = require('./config');

/**
 * Devuelve si Notch está configurado para iniciar con Windows.
 * @returns {boolean}
 */
function isStartWithWindowsEnabled() {
  if (app.isPackaged) {
    return app.getLoginItemSettings().openAtLogin;
  }
  return Boolean(state.settings.startWithWindows);
}

/**
 * Activa o desactiva el inicio automático con Windows.
 * @param {boolean} enable
 */
function setStartWithWindows(enable) {
  const shouldEnable = Boolean(enable);
  state.settings.startWithWindows = shouldEnable;
  saveSetting('startWithWindows', shouldEnable);

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: shouldEnable,
      path: process.execPath,
      args: ['--hidden'],
    });
    console.log(`[login-item] Iniciar con Windows: ${shouldEnable ? 'activado' : 'desactivado'}.`);
  } else {
    console.log(
      `[login-item] Iniciar con Windows guardado como ${shouldEnable}. (Tendrá efecto completo al compilar con npm run pack o npm run dist).`
    );
  }
}

/**
 * Sincroniza el estado de inicio con Windows al arrancar Notch.
 */
function syncLoginItemState() {
  if (app.isPackaged && typeof state.settings.startWithWindows === 'boolean') {
    const current = app.getLoginItemSettings().openAtLogin;
    if (current !== state.settings.startWithWindows) {
      app.setLoginItemSettings({
        openAtLogin: state.settings.startWithWindows,
        path: process.execPath,
        args: ['--hidden'],
      });
    }
  }
}

module.exports = {
  isStartWithWindowsEnabled,
  setStartWithWindows,
  syncLoginItemState,
};
