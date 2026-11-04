// =============================================================================
//  main/casa-clawd.js — Ventana de Ajustes «Casa de Clawd» (Fase 16)
// -----------------------------------------------------------------------------
//  Ventana dedicada para la configuración modular de Notch organizada en
//  14 secciones estructuradas. Ventana singleton, oscura y con preload seguro.
// =============================================================================

'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

let casaWindow = null;

/**
 * Abre la Casa de Clawd o la enfoca si ya está abierta.
 * @returns {BrowserWindow}
 */
function openCasaClawd() {
  if (casaWindow && !casaWindow.isDestroyed()) {
    if (casaWindow.isMinimized()) casaWindow.restore();
    casaWindow.focus();
    return casaWindow;
  }

  casaWindow = new BrowserWindow({
    width: 840,
    height: 640,
    minWidth: 700,
    minHeight: 520,
    title: 'Casa de Clawd — Ajustes de Notch',
    backgroundColor: '#0c0c10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  casaWindow.loadFile(path.join(__dirname, '..', 'renderer', 'casa-clawd.html'));

  casaWindow.once('ready-to-show', () => {
    if (casaWindow && !casaWindow.isDestroyed()) {
      casaWindow.show();
      casaWindow.focus();
    }
  });

  casaWindow.on('closed', () => {
    casaWindow = null;
  });

  return casaWindow;
}

function getCasaWindow() {
  return casaWindow && !casaWindow.isDestroyed() ? casaWindow : null;
}

module.exports = {
  openCasaClawd,
  getCasaWindow,
};
