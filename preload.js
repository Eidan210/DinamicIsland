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

  /** Tema del panel: 'light' o 'dark' (ya resuelto: "auto" = el modo de Windows). */
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    onChange: (callback) => subscribe('theme:changed', callback),
  },

  /** main.js pide mostrar una página (atajos Ctrl+Alt+1…6, la notificación...): callback(nombre). */
  onShowTab: (callback) => subscribe('notch:show-tab', callback),

  /** Le cuenta a main.js qué página se ve (para que el atajo de esa página cierre el panel). */
  setCurrentTab: (tab) => ipcRenderer.send('notch:tab-changed', String(tab)),

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

  // ---------- Música (Fase 3) ----------
  media: {
    /** Devuelve (Promise) lo que suena ahora, con la carátula. */
    getState: () => ipcRenderer.invoke('media:get'),
    /** Órdenes para la app que suena. */
    play: () => ipcRenderer.send('media:command', 'play'),
    pause: () => ipcRenderer.send('media:command', 'pause'),
    toggle: () => ipcRenderer.send('media:command', 'toggle'),
    next: () => ipcRenderer.send('media:command', 'next'),
    previous: () => ipcRenderer.send('media:command', 'previous'),
    /** Salta al segundo indicado (si la app lo permite). */
    seek: (seconds) => ipcRenderer.send('media:command', 'seek', Number(seconds)),
    /**
     * Avisa de cada cambio: callback(state). Si la carátula cambió, state.art
     * trae la nueva (o null); si no viene "art", es la misma de antes.
     */
    onChange: (callback) => subscribe('media:state', callback),
    /** Mostrar (true) u ocultar (false) la música en la isla. Se guarda en settings.json. */
    setActivity: (enabled) => ipcRenderer.send('media:set-activity', enabled === true),
  },

  // ---------- Letras (LRCLIB) ----------
  lyrics: {
    /** Devuelve (Promise) la letra de la canción: { status, lines, plain }. */
    get: () => ipcRenderer.invoke('lyrics:get'),
    /** Vuelve a buscarla (tras un error de conexión). */
    retry: () => ipcRenderer.send('lyrics:retry'),
    /** Avisa cuando cambia (otra canción, ya llegó...): callback(estado). */
    onChange: (callback) => subscribe('lyrics:state', callback),
  },

  // ---------- Salidas de audio ----------
  audio: {
    /** Devuelve (Promise) { devices: [{ id, name, isDefault }], pendingId }. */
    getState: () => ipcRenderer.invoke('audio:get'),
    /** Pide usar otra salida (el id viene de la lista). */
    setOutput: (id) => ipcRenderer.send('audio:set-output', String(id)),
    /** Avisa cuando cambia la lista o la salida: callback(estado). */
    onChange: (callback) => subscribe('audio:state', callback),
  },

  // ---------- Volumen de Windows ----------
  volume: {
    /** Devuelve (Promise) el último volumen conocido: { level (0 a 1 o null), muted }. */
    getState: () => ipcRenderer.invoke('volume:get'),
    /** Avisa cada vez que cambias el volumen o el silencio: callback({ level, muted }). */
    onChange: (callback) => subscribe('volume:changed', callback),
  },

  // ---------- Nota rápida ----------
  note: {
    /** Devuelve (Promise) { text } o, si no se pudo leer, { text: '', error }. */
    get: () => ipcRenderer.invoke('note:get'),
    /** Guarda el texto. Devuelve (Promise) { ok, error? }. */
    save: (text) => ipcRenderer.invoke('note:save', String(text)),
  },

  // ---------- IA: Claude Code y Antigravity ----------
  ai: {
    /** Devuelve (Promise) { server, lastEventAt, sessions, pending }. */
    getState: () => ipcRenderer.invoke('ai:get'),
    /** Avisa de cada cambio: callback(estado). */
    onChange: (callback) => subscribe('ai:state', callback),
    /**
     * Responde a una decisión pendiente. Devuelve (Promise) true si se aplicó.
     * decision: 'allow' | 'always' | 'deny' | 'answer' | 'approve' | 'reject' | 'terminal'
     * data: { answers: { "pregunta": "respuesta" } } en las preguntas
     */
    decide: (id, decision, data) => ipcRenderer.invoke('ai:decide', String(id), String(decision), data ?? null),
    /** Copia al portapapeles la configuración para pegar: 'claude' o 'agy'. */
    copySetup: (kind) => ipcRenderer.invoke('ai:copy-setup', String(kind)),
  },

  // ---------- Chat (Claude y Gemini) ----------
  chat: {
    /** Devuelve (Promise) { messages, busy, provider, claudeModel }. */
    getState: () => ipcRenderer.invoke('chat:get'),
    /** Manda un mensaje. options: { provider, claudeModel }. Devuelve (Promise) { ok, error? }. */
    send: (text, options) => ipcRenderer.invoke('chat:send', String(text), options ?? {}),
    /** Para la respuesta que se está escribiendo. */
    cancel: () => ipcRenderer.send('chat:cancel'),
    /** Nueva conversación (se olvida la anterior). */
    clear: () => ipcRenderer.send('chat:clear'),
    /** Avisa de cada mensaje nuevo o actualizado: callback({ message, busy }). */
    onUpdate: (callback) => subscribe('chat:update', callback),
    /** Avisa cuando se borra la conversación. */
    onClear: (callback) => subscribe('chat:cleared', callback),
  },

  // ---------- Clawd ----------
  clawd: {
    /** Devuelve (Promise) { sleeping }: si llevas un rato sin tocar el PC (o está bloqueado). */
    getState: () => ipcRenderer.invoke('clawd:get'),
    /** Avisa cuando se duerme (true) o se despierta (false): callback(sleeping). */
    onSleepChange: (callback) => subscribe('clawd:sleep', (sleeping) => callback(sleeping === true)),
  },

  /** Tras responder en la isla con el panel cerrado: devolver el foco a tu app. */
  releaseFocus: () => ipcRenderer.send('notch:release-focus'),

  // ---------- Centro de avisos ----------
  notices: {
    /** Devuelve (Promise) los avisos del proceso principal (Pomodoro, errores...). */
    getAll: () => ipcRenderer.invoke('notices:get'),
    /** Avisa de cada aviso nuevo: callback(aviso). */
    onAdd: (callback) => subscribe('notice:add', callback),
    /** Avisa cuando un aviso ya no hace falta (p. ej. el error se arregló): callback(clave). */
    onRemove: (callback) => subscribe('notice:remove', callback),
    /** "Borrar todo". */
    clear: () => ipcRenderer.send('notices:clear'),
  },
});
