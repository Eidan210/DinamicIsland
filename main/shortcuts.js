// =============================================================================
//  main/shortcuts.js — Atajos de teclado globales
// -----------------------------------------------------------------------------
//  Funcionan aunque estés en otra app. Hoy: el atajo para abrir/cerrar
//  (Ctrl+Alt+T por defecto, configurable en settings.json).
// =============================================================================

'use strict';

const { globalShortcut } = require('electron');
const { state } = require('./state');
const { toggleExpanded } = require('./window');

/** Registra (o vuelve a registrar, si cambió settings.json) los atajos globales. */
function registerShortcuts() {
  globalShortcut.unregisterAll();

  const { shortcut } = state.settings;
  let registered = false;
  try {
    registered = globalShortcut.register(shortcut, toggleExpanded);
  } catch (error) {
    // Pasa si el texto del atajo no es válido, p. ej. "Ctrl+Alt+" (falta la tecla).
    console.error(`[atajo] "${shortcut}" no es un atajo válido: ${error.message}`);
  }
  if (!registered) {
    console.warn(
      `[atajo] No se pudo registrar "${shortcut}". ` +
        '¿Lo usa otra app? Cámbialo en config/settings.json. Mientras tanto, haz clic en la isla.'
    );
  }
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterShortcuts };
