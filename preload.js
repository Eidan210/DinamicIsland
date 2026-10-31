// =============================================================================
//  preload.js — El puente entre la página (renderer) y el proceso principal
// -----------------------------------------------------------------------------
//  La página NO tiene acceso a Node ni a Electron (nodeIntegration: false,
//  contextIsolation: true). Aquí exponemos con contextBridge una API pequeña
//  y controlada en `window.notch`: es lo ÚNICO que la página puede pedirle
//  a main.js. Nunca expongas ipcRenderer entero.
// =============================================================================

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Escucha un mensaje que manda main.js.
 * @returns {() => void} función para dejar de escuchar
 */
function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('notch', {
  // ---------- Ventana y configuración ----------

  /** Devuelve (Promise) config/settings.json con sus valores por defecto. */
  getSettings: () => ipcRenderer.invoke('settings:get'),

  /** true = el ratón está sobre el notch (recibir clics); false = dejar pasar los clics. */
  setMouseInteractive: (interactive) =>
    ipcRenderer.send('notch:set-mouse-interactive', interactive === true),

  /** Pide abrir el panel. */
  expand: () => ipcRenderer.send('notch:expand'),

  /** Pide cerrar el panel (y devolver el foco a la app que estabas usando). */
  collapse: () => ipcRenderer.send('notch:collapse'),

  /** Muestra el menú del clic derecho (abrir/cerrar, Pomodoro y salir). */
  showContextMenu: () => ipcRenderer.send('notch:context-menu'),

  /** Avisa cada vez que el panel se abre o se cierra: callback(expanded). */
  onExpandedChange: (callback) => subscribe('notch:expanded', (expanded) => callback(expanded === true)),

  /** Avisa cuando guardas config/settings.json: callback(settings). */
  onSettingsChange: (callback) => subscribe('settings:changed', callback),

  /** main.js pide mostrar una pestaña (p. ej. al pulsar la notificación): callback(nombre). */
  onShowTab: (callback) => subscribe('notch:show-tab', callback),

  // ---------- Pomodoro ----------
  pomodoro: {
    /** Devuelve (Promise) el estado actual del Pomodoro. */
    getState: () => ipcRenderer.invoke('pomodoro:get'),
    start: () => ipcRenderer.send('pomodoro:start'),
    pause: () => ipcRenderer.send('pomodoro:pause'),
    reset: () => ipcRenderer.send('pomodoro:reset'),
    /** Cambia la duración (solo si no está en marcha). Se guarda en settings.json. */
    setMinutes: (minutes) => ipcRenderer.send('pomodoro:set-minutes', Number(minutes)),
    /** Avisa de cada cambio de estado: callback(state). */
    onChange: (callback) => subscribe('pomodoro:state', callback),
  },

  // ---------- Links ----------
  links: {
    /** Devuelve (Promise) la lista de links (nombre, inicial, color...). */
    getAll: () => ipcRenderer.invoke('links:get'),
    /** Abre el link número `index` de la lista (la url la pone main.js, no la página). */
    open: (index) => ipcRenderer.send('links:open', Number(index)),
    /** Avisa cuando guardas config/links.json: callback(links). */
    onChange: (callback) => subscribe('links:changed', callback),
  },
});
