// =============================================================================
//  main/system-tray.js — Icono en la bandeja del sistema de Windows
// -----------------------------------------------------------------------------
//  Muestra el icono de Notch junto al reloj de Windows (System Tray).
//  Menú contextual:
//    - «Casa de Clawd» (abre ajustes e historial)
//    - «Pausar isla» (casilla de verificación para pausar/ocultar Notch)
//    - «Iniciar con Windows» (casilla de verificación)
//    - «Salir»
//  Clic izquierdo en el icono: abre o cierra el panel de Notch.
// =============================================================================

'use strict';

const { app, Tray, Menu } = require('electron');
const path = require('node:path');
const { ROOT_DIR, state } = require('./state');
const { sendToRenderer } = require('./bridge');
const loginItem = require('./login-item');

let tray = null;
let isPaused = false;

/**
 * Devuelve si Notch está pausado por el usuario desde la bandeja.
 * @returns {boolean}
 */
function isIslandPaused() {
  return isPaused;
}

/**
 * Pausa o reanuda la isla.
 * @param {boolean} pause
 */
function setIslandPaused(pause) {
  isPaused = Boolean(pause);
  state.isPaused = isPaused;

  const { win } = state;
  if (win && !win.isDestroyed()) {
    if (isPaused) {
      if (state.isExpanded) {
        state.isExpanded = false;
        sendToRenderer('notch:expanded', false);
      }
      win.hide();
    } else {
      win.showInactive();
    }
  }

  sendToRenderer('notch:paused', isPaused);
  updateTrayMenu();
}

/**
 * Abre o enfoca la Casa de Clawd (ajustes).
 */
function openCasaDeClawd() {
  // Si la ventana está minimizada o cerrada, se muestra
  const { win } = state;
  if (isPaused) setIslandPaused(false);
  if (win && !win.isDestroyed()) {
    // Abre el panel en la vista Home o en configuración
    const windowModule = require('./window');
    windowModule.openTab('home');
  }
}

/**
 * Reconstruye el menú contextual del Tray para reflejar los estados actuales.
 */
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  const startWithWindows = loginItem.isStartWithWindowsEnabled();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Casa de Clawd',
      click: openCasaDeClawd,
    },
    { type: 'separator' },
    {
      label: 'Pausar isla',
      type: 'checkbox',
      checked: isPaused,
      click: (item) => setIslandPaused(item.checked),
    },
    {
      label: 'Iniciar con Windows',
      type: 'checkbox',
      checked: startWithWindows,
      click: (item) => {
        loginItem.setStartWithWindows(item.checked);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Inicializa el icono en la bandeja del sistema.
 */
function initSystemTray() {
  if (tray) return;

  const iconPath = path.join(ROOT_DIR, 'assets', 'icon.png');
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Notch — Isla dinámica para Windows 11');
    updateTrayMenu();

    // Clic izquierdo en el icono: abre/cierra el panel
    tray.on('click', () => {
      if (isPaused) {
        setIslandPaused(false);
        return;
      }
      const windowModule = require('./window');
      windowModule.toggleExpanded();
    });
  } catch (error) {
    console.warn(`[tray] No se pudo inicializar el icono de bandeja: ${error.message}`);
  }
}

/**
 * Destruye el icono del Tray al cerrar la aplicación.
 */
function destroySystemTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  initSystemTray,
  destroySystemTray,
  updateTrayMenu,
  isIslandPaused,
  setIslandPaused,
};
