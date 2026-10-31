// =============================================================================
//  preload.js — El puente entre la página (renderer) y el proceso principal
// -----------------------------------------------------------------------------
//  La página NO tiene acceso a Node ni a Electron (nodeIntegration: false,
//  contextIsolation: true). Aquí exponemos con contextBridge una API pequeña
//  y controlada en `window.notch`: es lo ÚNICO que el renderer puede pedirle
//  a main.js. Nunca expongas ipcRenderer entero.
// =============================================================================

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notch', {
  /** Devuelve (Promise) el contenido de config/settings.json con sus valores por defecto. */
  getSettings: () => ipcRenderer.invoke('settings:get'),

  /** true = el ratón está sobre el notch (recibir clics); false = dejar pasar los clics. */
  setMouseInteractive: (interactive) =>
    ipcRenderer.send('notch:set-mouse-interactive', interactive === true),

  /** Pide abrir el panel. */
  expand: () => ipcRenderer.send('notch:expand'),

  /** Pide cerrar el panel (y devolver el foco a la app que estabas usando). */
  collapse: () => ipcRenderer.send('notch:collapse'),

  /** Muestra el menú del clic derecho (abrir/cerrar y salir). */
  showContextMenu: () => ipcRenderer.send('notch:context-menu'),

  /**
   * Avisa cada vez que el panel se abre o se cierra (por el atajo, Esc, clic fuera...).
   * @param {(expanded: boolean) => void} callback
   * @returns {() => void} función para dejar de escuchar
   */
  onExpandedChange: (callback) => {
    const listener = (_event, expanded) => callback(expanded === true);
    ipcRenderer.on('notch:expanded', listener);
    return () => ipcRenderer.removeListener('notch:expanded', listener);
  },
});
