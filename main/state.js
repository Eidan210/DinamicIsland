// =============================================================================
//  main/state.js — Estado compartido del proceso principal
// -----------------------------------------------------------------------------
//  Varios módulos necesitan saber lo mismo (la ventana, la configuración, si el
//  panel está abierto...). En vez de pasarlo de un lado a otro, vive aquí, en
//  un único objeto `state` que todos importan y leen en el momento de usarlo.
// =============================================================================

'use strict';

const path = require('node:path');

// `npm run dev` arranca con --dev: abre las DevTools y el panel NO se cierra al
// perder el foco (si no, se cerraría cada vez que haces clic en las DevTools).
const IS_DEV = process.argv.includes('--dev');

// Identificador de la app para Windows (notificaciones). Debe ser igual que
// "appId" en package.json.
const APP_ID = 'com.eidancuadros.notch';

// Carpeta raíz del proyecto (donde está main.js). Este archivo está en main/.
const ROOT_DIR = path.join(__dirname, '..');

const state = {
  win: null, // la única ventana de la app (la crea main/window.js)
  settings: {}, // config/settings.json ya revisado (lo rellena main/config.js)
  isExpanded: false, // ¿el panel está abierto? La "verdad" vive aquí, no en la página.
  isQuitting: false, // pasa a true cuando el usuario elige "Salir"
};

module.exports = { IS_DEV, APP_ID, ROOT_DIR, state };
