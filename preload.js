// =============================================================================
//  preload.js — El puente entre la página (renderer) y el proceso principal
// -----------------------------------------------------------------------------
//  La página NO tiene acceso a Node ni a Electron (nodeIntegration: false,
//  contextIsolation: true). Aquí exponemos con contextBridge una API pequeña
//  y controlada en `window.notch`: es lo ÚNICO que la página puede pedirle
//  a main.js. Nunca expongas ipcRenderer entero.
// =============================================================================

'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  saveSetting: (key, value) => ipcRenderer.invoke('settings:save-key', String(key), value),
  openCasaDeClawd: () => ipcRenderer.send('casa:open'),
  openDataFolder: () => ipcRenderer.send('app:open-data-folder'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),

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

  /** Avisa cuando una app entra o sale de pantalla completa: callback(isFullscreen). */
  onFullscreenChange: (callback) => subscribe('notch:fullscreen', (active) => callback(active === true)),

  /** Avisa cuando Notch se pausa desde la bandeja: callback(isPaused). */
  onPausedChange: (callback) => subscribe('notch:paused', (isPaused) => callback(isPaused === true)),

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
    /** Devuelve (Promise) la lista de links (nombre, inicial, color y logo). */
    getAll: () => ipcRenderer.invoke('links:get'),
    /** Abre el link número `index` de la lista (la url la pone main.js, no la página). */
    open: (index) => ipcRenderer.send('links:open', Number(index)),
    /** Avisa cuando guardas config/links.json: callback(links). */
    onChange: (callback) => subscribe('links:changed', callback),
  },

  // ---------- Home: los widgets ----------
  home: {
    /** Devuelve (Promise) { widgets: [{ type, size }] }: los widgets de Home, en orden. */
    get: () => ipcRenderer.invoke('home:get'),
    /** Guarda los widgets (en tu carpeta de datos, home.json). Devuelve (Promise) { ok, error? }. */
    save: (widgets) => ipcRenderer.invoke('home:save', widgets),
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
    clearCache: () => ipcRenderer.invoke('lyrics:clear-cache'),
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

  // ---------- Portapapeles: lo que copias (solo texto, solo en memoria) ----------
  clipboard: {
    /** Devuelve (Promise) { status, message, paused, items }. Cada item trae solo el principio del texto. */
    getState: () => ipcRenderer.invoke('clipboard:get'),
    /** Avisa de cada cambio (copiaste algo, fijaste...): callback(estado). */
    onChange: (callback) => subscribe('clipboard:state', callback),
    /** Vuelve a copiar el texto entero de un elemento. Devuelve (Promise) true si se copió. */
    copy: (id) => ipcRenderer.invoke('clipboard:copy', String(id)),
    /** Fijar (true) o soltar (false). Devuelve (Promise) { ok, error? }. */
    pin: (id, pinned) => ipcRenderer.invoke('clipboard:pin', String(id), pinned === true),
    remove: (id) => ipcRenderer.send('clipboard:remove', String(id)),
    /** "Borrar": todo menos lo fijado. */
    clear: () => ipcRenderer.send('clipboard:clear'),
    /** Pausar (true) o volver a guardar lo que copias (false). */
    pause: (paused) => ipcRenderer.send('clipboard:pause', paused === true),
  },

  // ---------- Bandeja de archivos ----------
  tray: {
    /** Devuelve (Promise) { items, max }. Sin las rutas: solo nombre, tamaño e icono. */
    getState: () => ipcRenderer.invoke('tray:get'),
    /** Avisa de cada cambio: callback(estado). */
    onChange: (callback) => subscribe('tray:state', callback),
    /**
     * Añade los archivos que soltaste: un ARRAY de File (p. ej.
     * Array.from(event.dataTransfer.files); un FileList no cruza este puente).
     * Las rutas las saca este puente y van directas a main.js: la página no las ve.
     * Devuelve (Promise) { ok, added, duplicate, missing, full }.
     */
    addFiles: (files) => {
      const paths = (Array.isArray(files) ? files : []).slice(0, 200).map((file) => {
        try {
          return webUtils.getPathForFile(file);
        } catch {
          return ''; // no es un archivo de verdad
        }
      }).filter(Boolean);
      return ipcRenderer.invoke('tray:add', paths);
    },
    /** "Añadir…": elegir archivos con la ventana de Windows. Devuelve (Promise) lo mismo que addFiles. */
    pick: () => ipcRenderer.invoke('tray:pick'),
    remove: (id) => ipcRenderer.send('tray:remove', String(id)),
    /** "Vaciar" (los archivos siguen en su sitio). */
    clear: () => ipcRenderer.send('tray:clear'),
    /** Comprueba que los archivos siguen en su sitio (al abrir la página). */
    refresh: () => ipcRenderer.send('tray:refresh'),
    /** Empieza a arrastrar estos archivos hacia fuera (en el dragstart de la página). */
    startDrag: (ids) => ipcRenderer.send('tray:drag', Array.from(ids || [], String)),
    /** Avisa cuando termina ese arrastre (soltaste o lo cancelaste). */
    onDragEnd: (callback) => subscribe('tray:drag-end', callback),
    /** Abre el Explorador con el archivo marcado. */
    open: (id) => ipcRenderer.invoke('tray:open', String(id)),
    showInFolder: (id) => ipcRenderer.send('tray:show', String(id)),
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
    /** Copia al portapapeles el texto completo de un mensaje por su id. */
    copy: (id) => ipcRenderer.invoke('chat:copy', String(id)),
    /** Para la respuesta que se está escribiendo. */
    cancel: () => ipcRenderer.send('chat:cancel'),
    /** Nueva conversación (se olvida la anterior). */
    clear: () => ipcRenderer.send('chat:clear'),
    /** Avisa de cada mensaje nuevo o actualizado: callback({ message, busy }). */
    onUpdate: (callback) => subscribe('chat:update', callback),
    onChange: (callback) => subscribe('chat:update', (payload) => callback(payload?.message || payload)),
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

  // ---------- Tareas (Fase 12) ----------
  tasks: {
    get: () => ipcRenderer.invoke('tasks:get'),
    add: (data) => ipcRenderer.invoke('tasks:add', data),
    toggle: (id) => ipcRenderer.invoke('tasks:toggle', String(id)),
    remove: (id) => ipcRenderer.invoke('tasks:remove', String(id)),
    onChange: (callback) => subscribe('tasks:state', callback),
  },

  // ---------- Agua / Hidratación (Fase 12) ----------
  water: {
    get: () => ipcRenderer.invoke('water:get'),
    drink: (ml) => ipcRenderer.invoke('water:drink', ml),
    onChange: (callback) => subscribe('water:state', callback),
  },

  // ---------- Horario (Fase 12) ----------
  schedule: {
    get: () => ipcRenderer.invoke('schedule:get'),
    add: (data) => ipcRenderer.invoke('schedule:add', data),
    remove: (id) => ipcRenderer.invoke('schedule:remove', String(id)),
    toggle: (id) => ipcRenderer.invoke('schedule:toggle', String(id)),
    onChange: (callback) => subscribe('schedule:state', callback),
  },

  // ---------- Focus Stats (Fase 12) ----------
  focusStats: {
    get: () => ipcRenderer.invoke('focus:get-stats'),
    onChange: (callback) => subscribe('focus:stats', callback),
  },

  // ---------- Clima (Fase 13) ----------
  weather: {
    get: () => ipcRenderer.invoke('weather:get'),
  },

  // ---------- IA Rápida (Fase 14) ----------
  aiQuick: {
    open: () => ipcRenderer.send('ai:quick-open'),
    close: () => ipcRenderer.send('ai:quick-close'),
    pasteToApp: (text) => ipcRenderer.send('ai:paste-to-app', String(text || '')),
    captureScreen: () => ipcRenderer.invoke('ai:capture-screen'),
    getActiveApp: () => ipcRenderer.invoke('ai:get-active-app'),
    onShow: (callback) => subscribe('ai:quick-show', callback),
    onHide: (callback) => subscribe('ai:quick-hide', callback),
    onActiveApp: (callback) => subscribe('ai:active-app', callback),
  },

  // ---------- Motor de luz (Fase 10 / 12) ----------
  light: {
    onTrigger: (callback) => {
      const off1 = subscribe('light:trigger', (event) => callback(typeof event === 'string' ? { event } : event));
      const off2 = subscribe('light:urgentTask', (data) => callback({ event: 'urgentTask', data }));
      const off3 = subscribe('light:waterReminder', (data) => callback({ event: 'waterReminder', data }));
      const off4 = subscribe('light:celebrateWater', (data) => callback({ event: 'celebrateWater', data }));
      return () => { off1?.(); off2?.(); off3?.(); off4?.(); };
    },
  },

  // ---------- Teclado (Fase 11) ----------
  keyboard: {
    onEvent: (callback) => subscribe('keyboard:event', callback),
  },

  // ---------- Dictado por Voz Local (Fase 15) ----------
  voice: {
    /** Inicia la grabación del micrófono. */
    start: () => ipcRenderer.send('voice:start'),
    /** Detiene la grabación y activa la transcripción en WinHelper. */
    stop: () => ipcRenderer.send('voice:stop'),
    /** Cancela la grabación sin transcribir. */
    cancel: () => ipcRenderer.send('voice:cancel'),
    /** Devuelve (Promise) el estado actual: { state, modelAvailable, micAllowed, language, shortcut }. */
    getStatus: () => ipcRenderer.invoke('voice:status'),
    /** Pega el texto proporcionado (o el último transcrito) en la aplicación activa previa. */
    paste: (text) => ipcRenderer.send('voice:paste', String(text || '')),
    /** Abre la configuración de privacidad del micrófono de Windows 11. */
    openPrivacySettings: () => ipcRenderer.send('voice:open-privacy'),
    /** Inicia la descarga automática del modelo ggml-base.bin si no existe. */
    downloadModel: () => ipcRenderer.invoke('voice:download-model'),
    /** Avisa de cambios de estado: callback({ state, error?, ... }). */
    onStatus: (callback) => subscribe('voice:status', callback),
    /** Avisa de variaciones de nivel de audio (0 a 1): callback({ level, peak, rms }). */
    onLevel: (callback) => subscribe('voice:onLevel', callback),
    /** Avisa de transcripción completada: callback({ text, durationMs }). */
    onTranscript: (callback) => subscribe('voice:onTranscript', callback),
    /** Avisa del progreso de descarga del modelo: callback({ percent, downloadedBytes, totalBytes }). */
    onDownloadProgress: (callback) => subscribe('voice:download-progress', callback),
  },

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
