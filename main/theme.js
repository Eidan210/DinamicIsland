// =============================================================================
//  main/theme.js — Tema claro u oscuro del panel
// -----------------------------------------------------------------------------
//  settings.json → "theme": "auto" (igual que Windows), "light" o "dark".
//
//  1. Se lo decimos a Electron con nativeTheme.themeSource: así el menú del
//     clic derecho también sale claro u oscuro.
//  2. Calculamos el tema que toca de verdad ("auto" → el modo de las apps de
//     Windows) y se lo mandamos a la página, que lo pone en <html data-theme>.
//     (No nos fiamos solo de la consulta CSS prefers-color-scheme: en algunas
//     versiones de Electron no se actualiza al cambiar themeSource.)
//  Con "auto", si cambias el modo de Windows, el panel cambia solo.
//
//  El tema solo afecta al panel abierto: la isla compacta es siempre negra.
// =============================================================================

'use strict';

const { nativeTheme } = require('electron');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');

// Nuestro nombre → el de Electron ("system" = seguir a Windows).
const THEME_SOURCES = { auto: 'system', light: 'light', dark: 'dark' };

/** 'light' o 'dark': el tema que se ve ahora. */
function getEffectiveTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function sendTheme() {
  sendToRenderer('theme:changed', getEffectiveTheme());
}

let watchingWindows = false;

/** Aplica "theme" de settings.json (al arrancar y cada vez que lo guardas). */
function applyTheme() {
  if (!watchingWindows) {
    // La primera vez nos suscribimos: Windows avisa cuando cambias entre modo
    // claro y oscuro (es un evento, no se comprueba periódicamente).
    watchingWindows = true;
    nativeTheme.on('updated', sendTheme);
  }
  nativeTheme.themeSource = THEME_SOURCES[state.settings.theme] || 'system';
  sendTheme();
}

module.exports = { applyTheme, getEffectiveTheme };
