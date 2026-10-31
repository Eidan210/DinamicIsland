// =============================================================================
//  main.js — Proceso principal de Electron (el "cerebro" de Notch)
// -----------------------------------------------------------------------------
//  Electron tiene dos mundos:
//    • Proceso principal (este archivo): es Node.js y tiene acceso al sistema.
//      Crea la ventana, registra el atajo global, lee archivos de config...
//    • Renderer (renderer/app.js): una página web que solo dibuja la interfaz.
//      Por seguridad NO tiene acceso a Node: nos pide cosas por IPC a través
//      del puente que define preload.js.
//
//  Fase 1: ventana transparente, atajo global, abrir/cerrar y clics que atraviesan.
//  Fase 2: Pomodoro con notificación de Windows, links de config/links.json y
//          recarga automática de config/ cuando guardas un archivo.
//  Fase 3: música. Lanzamos el helper en C# (helpers/MediaHelper) como proceso
//          hijo, leemos lo que suena y se lo pasamos a la página.
// =============================================================================

'use strict';

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  session,
  shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

// -----------------------------------------------------------------------------
// 1. Constantes
// -----------------------------------------------------------------------------

// `npm run dev` arranca con --dev: abre las DevTools y el panel NO se cierra al
// perder el foco (si no, se cerraría cada vez que haces clic en las DevTools).
const IS_DEV = process.argv.includes('--dev');

// Identificador de la app para Windows (notificaciones). Debe ser igual que
// "appId" en package.json.
const APP_ID = 'com.eidancuadros.notch';

// La ventana mide SIEMPRE lo mismo: el panel abierto + un margen transparente
// para la sombra (y para el pequeño rebote al abrirse). La animación se hace
// con CSS dentro de esta ventana fija, porque redimensionar ventanas
// transparentes en Windows produce parpadeos.
// ⚠️ Si cambias PANEL_* o TOP_GAP, cambia también las variables de renderer/styles.css.
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 260;
const TOP_GAP = 8; // separación entre el borde de arriba de la pantalla y el notch
const SHADOW_MARGIN = 50; // espacio extra alrededor para que la sombra no se corte
const WINDOW_WIDTH = PANEL_WIDTH + SHADOW_MARGIN * 2; // 820 px
const WINDOW_HEIGHT = TOP_GAP + PANEL_HEIGHT + SHADOW_MARGIN; // 318 px

// Valores por defecto de config/settings.json (si falta una clave, se usa esta).
const DEFAULT_SETTINGS = {
  shortcut: 'Control+Alt+T', // atajo global para abrir/cerrar
  locale: 'es-ES', // idioma para la fecha y la hora
  hour12: false, // true = reloj de 12 horas (a. m. / p. m.)
  autoHide: true, // cuando no lo usas, se encoge a una mini-muesca (no tapa pestañas)
  revealOnHover: true, // pasar el ratón por la mini-muesca la despierta
  pomodoroMinutes: 25, // duración del Pomodoro
  musicActivity: true, // mostrar la música en la isla mientras suena (y avisar al cambiar de canción)
};

const MINUTE_MS = 60 * 1000;
const POMODORO_MIN_MINUTES = 1;
const POMODORO_MAX_MINUTES = 180;

// Órdenes que la página puede mandar al helper de música (además de "seek").
const MEDIA_COMMANDS = ['play', 'pause', 'toggle', 'next', 'previous'];
// Si el helper se cierra solo, lo reiniciamos esperando cada vez más (2 s, 4 s... hasta 1 min).
const HELPER_RESTART_MIN_MS = 2000;
const HELPER_RESTART_MAX_MS = 60 * 1000;

// Nombres bonitos para las apps más comunes. Windows identifica cada app con
// un código raro, p. ej. "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App".
const KNOWN_MEDIA_APPS = [
  [/applemusic/i, 'Apple Music'],
  [/itunes/i, 'iTunes'],
  [/spotify/i, 'Spotify'],
  [/zunemusic|zunevideo/i, 'Reproductor multimedia'],
  [/msedge|microsoftedge/i, 'Microsoft Edge'],
  [/chrome/i, 'Google Chrome'],
  [/firefox/i, 'Firefox'],
  [/brave/i, 'Brave'],
  [/opera/i, 'Opera'],
  [/vlc/i, 'VLC'],
  [/deezer/i, 'Deezer'],
  [/tidal/i, 'TIDAL'],
  [/amazonmusic/i, 'Amazon Music'],
  [/foobar/i, 'foobar2000'],
  [/musicbee/i, 'MusicBee'],
];

// Por seguridad, los links solo pueden ser páginas web o correos.
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// Colores para los links que no indican "color" en links.json.
const LINK_PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];

// -----------------------------------------------------------------------------
// 2. Estado de la app
// -----------------------------------------------------------------------------

let win = null; // la única ventana de la app
let settings = { ...DEFAULT_SETTINGS };
let links = []; // links ya validados (con su url): la página nunca recibe las urls
let isExpanded = false; // ¿el panel está abierto? La "verdad" vive aquí, en main.
let isQuitting = false; // pasa a true cuando el usuario elige "Salir"
let lastNotification = null; // referencia viva para que el clic en la notificación funcione

// El Pomodoro vive aquí (y no en la página) para que el aviso llegue a su hora
// aunque la página esté en segundo plano: Chromium frena los temporizadores
// de las páginas que no se ven, los de main no.
const pomodoro = {
  status: 'idle', // 'idle' (listo) | 'running' | 'paused' | 'finished'
  durationMs: DEFAULT_SETTINGS.pomodoroMinutes * MINUTE_MS,
  remainingMs: DEFAULT_SETTINGS.pomodoroMinutes * MINUTE_MS,
  endsAt: null, // momento exacto (Date.now()) en que termina, si está corriendo
  timer: null, // el único setTimeout: salta justo al terminar
  completedCount: 0, // Pomodoros terminados hoy
  completedDay: '', // día al que corresponde completedCount
};

// Música: el proceso del helper y lo último que nos contó.
const music = {
  process: null, // proceso hijo (MediaHelper.exe)
  restartDelay: HELPER_RESTART_MIN_MS,
  restartTimer: null,
  // available: 'starting' | 'ok' | 'missing' (no está compilado) | 'unsupported' (no es Windows) | 'error'
  state: { available: 'starting', status: 'none' },
  art: null, // carátula actual como "data URL" (o null)
};

// -----------------------------------------------------------------------------
// 3. Configuración (carpeta config/)
// -----------------------------------------------------------------------------

/** Carpeta donde viven settings.json y links.json. */
function getConfigDir() {
  // En desarrollo usamos la carpeta config/ del proyecto. En la app empaquetada
  // (npm run dist), electron-builder la copia a resources/config (ver package.json).
  return app.isPackaged
    ? path.join(process.resourcesPath, 'config')
    : path.join(__dirname, 'config');
}

/** Lee un archivo de texto JSON y lo convierte en objeto. Lanza error si está mal. */
function parseJsonFile(filePath) {
  // .replace() quita el BOM que a veces añade el Bloc de notas de Windows
  // (sin esto, JSON.parse falla con un error muy confuso).
  const text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text);
}

/** Lee un JSON de config/. Si falta o está mal escrito, avisa y devuelve undefined. */
function readConfigJson(fileName) {
  const filePath = path.join(getConfigDir(), fileName);
  try {
    return parseJsonFile(filePath);
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'no existe' : `tiene un error: ${error.message}`;
    console.warn(`[config] ${filePath} ${reason}. Uso valores por defecto.`);
    return undefined;
  }
}

/** settings.json mezclado con los valores por defecto y revisado. */
function loadSettings() {
  const data = readConfigJson('settings.json');
  const result = { ...DEFAULT_SETTINGS };
  if (data && typeof data === 'object' && !Array.isArray(data)) Object.assign(result, data);

  // Corregimos valores con el tipo equivocado para que nada falle más adelante.
  if (typeof result.shortcut !== 'string' || !result.shortcut.trim()) result.shortcut = DEFAULT_SETTINGS.shortcut;
  if (typeof result.locale !== 'string') result.locale = DEFAULT_SETTINGS.locale;
  result.hour12 = result.hour12 === true;
  result.autoHide = result.autoHide !== false;
  result.revealOnHover = result.revealOnHover !== false;
  result.pomodoroMinutes = clampMinutes(result.pomodoroMinutes);
  result.musicActivity = result.musicActivity !== false;
  return result;
}

/**
 * Guarda UNA clave en settings.json sin tocar las demás.
 * Si el archivo tiene un error de sintaxis no lo sobrescribimos: perderías lo que escribiste.
 */
function saveSetting(key, value) {
  const filePath = path.join(getConfigDir(), 'settings.json');
  try {
    const data = fs.existsSync(filePath) ? parseJsonFile(filePath) : {};
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('el archivo debe contener un objeto { ... }');
    }
    data[key] = value;
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn(`[config] No se pudo guardar "${key}" en settings.json: ${error.message}`);
  }
}

/**
 * Vigila la carpeta config/: cuando guardas settings.json o links.json, se
 * aplica al momento, sin reiniciar. fs.watch usa avisos del sistema (no
 * comprueba nada periódicamente).
 */
function watchConfigFolder() {
  const changedFiles = new Set();
  let reloadTimer = null;
  try {
    fs.watch(getConfigDir(), (_eventType, fileName) => {
      // fileName puede venir vacío en algunos sistemas: entonces recargamos los dos.
      if (!fileName) {
        changedFiles.add('settings.json').add('links.json');
      } else if (fileName === 'settings.json' || fileName === 'links.json') {
        changedFiles.add(fileName);
      } else {
        return;
      }
      // Los editores guardan en varios pasos: esperamos medio segundo a que terminen.
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadConfig(changedFiles);
        changedFiles.clear();
      }, 500);
    });
  } catch (error) {
    console.warn(`[config] No se pueden vigilar los cambios de ${getConfigDir()}: ${error.message}`);
  }
}

/** Vuelve a leer los archivos de config/ que cambiaron y avisa a la página. */
function reloadConfig(changedFiles) {
  if (changedFiles.has('settings.json')) {
    const previousShortcut = settings.shortcut;
    settings = loadSettings();
    if (settings.shortcut !== previousShortcut) {
      globalShortcut.unregisterAll();
      registerShortcut();
    }
    // Si el Pomodoro está parado, la nueva duración se aplica ya; si está en
    // marcha, se aplicará al reiniciarlo.
    if (pomodoro.status === 'idle') resetPomodoro();
    sendToRenderer('settings:changed', settings);
    sendPomodoroState();
    console.log('[config] settings.json recargado.');
  }

  if (changedFiles.has('links.json')) {
    links = loadLinks();
    sendToRenderer('links:changed', getLinksForRenderer());
    console.log(`[config] links.json recargado (${links.length} links).`);
  }
}

// -----------------------------------------------------------------------------
// 4. La ventana del notch
// -----------------------------------------------------------------------------

/** Calcula dónde va la ventana: centrada arriba del monitor PRINCIPAL. */
function getWindowBounds() {
  const display = screen.getPrimaryDisplay();
  return {
    // bounds = el monitor completo → centramos respecto a la pantalla real.
    x: Math.round(display.bounds.x + (display.bounds.width - WINDOW_WIDTH) / 2),
    // workArea = la pantalla sin la barra de tareas → si la tuvieras arriba,
    // el notch quedaría justo debajo en vez de taparla.
    y: display.workArea.y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...getWindowBounds(),
    title: 'Notch',
    show: false, // la mostramos cuando el HTML esté listo (evita un destello)
    frame: false, // sin barra de título ni bordes
    transparent: true, // lo que no pinte el CSS se ve transparente
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true, // siempre por encima del resto de ventanas
    skipTaskbar: true, // sin icono en la barra de tareas
    type: 'toolbar', // en Windows es una "tool window": tampoco sale en Alt+Tab
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // la página no puede tocar el preload ni Node
      nodeIntegration: false, // nada de require() en la página
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Empezamos en modo "atravesable": los clics pasan a las ventanas de abajo.
  // Con forward: true la página sigue recibiendo los MOVIMIENTOS del ratón, y
  // así sabe cuándo te acercas al notch (ver sección 6).
  win.setIgnoreMouseEvents(true, { forward: true });

  // showInactive = mostrar la ventana SIN robarle el foco a la app que uses.
  win.once('ready-to-show', () => win.showInactive());

  // Cada vez que la página (re)carga, le mandamos el estado actual. Así un
  // Ctrl+R en las DevTools no deja a main y a la página desincronizados.
  win.webContents.on('did-finish-load', () => {
    setMouseInteractive(false);
    sendToRenderer('notch:expanded', isExpanded);
  });

  // Clic fuera del panel (en otra ventana, el escritorio, el otro monitor...)
  // = nuestra ventana pierde el foco → cerramos el panel.
  win.on('blur', () => {
    if (isExpanded && !IS_DEV) setExpanded(false);
  });

  // Alt+F4 con el panel abierto: lo cerramos en lugar de salir de la app.
  // Para salir de verdad: clic derecho en el notch → "Salir de Notch".
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      setExpanded(false, { restoreFocus: true });
    }
  });

  // Seguridad: la página nunca navega a otra URL ni abre ventanas nuevas.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Si el proceso de la página se cae, lo recargamos: el notch no debe desaparecer.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (isQuitting || details.reason === 'clean-exit') return;
    console.error(`[notch] La página se cerró inesperadamente (${details.reason}). Recargando...`);
    isExpanded = false;
    win.reload();
  });

  if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
}

/** Recoloca la ventana cuando cambian los monitores (resolución, escala, conectar/desconectar...). */
function repositionWindow() {
  if (win && !win.isDestroyed()) win.setBounds(getWindowBounds());
}

/** Manda un mensaje a la página (si la ventana sigue viva). */
function sendToRenderer(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// -----------------------------------------------------------------------------
// 5. Abrir y cerrar el panel
// -----------------------------------------------------------------------------

/**
 * Abre (true) o cierra (false) el panel. La página hace la animación.
 * @param {boolean} expanded
 * @param {{ restoreFocus?: boolean }} [options]
 *   restoreFocus: al cerrar, devolver el foco a la app que estabas usando.
 *   (No hace falta cuando se cierra por un clic fuera: ese clic ya movió el foco.)
 */
function setExpanded(expanded, { restoreFocus = false } = {}) {
  if (!win || win.isDestroyed() || expanded === isExpanded) return;
  isExpanded = expanded;
  sendToRenderer('notch:expanded', isExpanded);

  if (isExpanded) {
    // Tomamos el foco para (1) recibir la tecla Esc y (2) enterarnos con el
    // evento 'blur' de cuándo haces clic fuera del panel.
    win.focus();
  } else if (restoreFocus && win.isFocused()) {
    giveFocusBack();
  }
}

function toggleExpanded() {
  setExpanded(!isExpanded, { restoreFocus: true });
}

/** Abre el panel directamente en una pestaña (p. ej. al pulsar la notificación). */
function openTab(tabName) {
  setExpanded(true);
  sendToRenderer('notch:show-tab', tabName);
}

/**
 * Devuelve el foco a la app que estabas usando antes de abrir el notch, para
 * que puedas seguir escribiendo sin tener que hacer clic en ella.
 *
 * En Windows, win.blur() activa "la siguiente ventana visible" en el orden Z
 * (de arriba a abajo). Como el notch es always-on-top, esa ventana podría ser
 * la barra de tareas. Truco: salimos un instante del grupo always-on-top (así
 * la siguiente ventana es tu app), hacemos blur y volvemos arriba.
 */
function giveFocusBack() {
  win.setAlwaysOnTop(false);
  win.blur();
  // Nivel 'screen-saver': en Windows, el nivel por defecto ('floating') deja
  // la ventana DEBAJO de la barra de tareas; este la deja por encima de todo.
  win.setAlwaysOnTop(true, 'screen-saver');
}

// -----------------------------------------------------------------------------
// 6. Clics que atraviesan la ventana
// -----------------------------------------------------------------------------
// La ventana es más grande que la píldora (mide lo que el panel abierto). Para
// que no "bloquee" esa zona de la pantalla, normalmente ignora el ratón: los
// clics pasan a la ventana de abajo. La página nos avisa cuando el cursor
// entra o sale del notch y cambiamos de modo.

/**
 * @param {boolean} interactive
 *   true  → el cursor está sobre el notch: la ventana recibe los clics.
 *   false → el cursor está fuera: los clics pasan a la ventana de abajo
 *           (forward: true mantiene los eventos de movimiento en la página).
 */
function setMouseInteractive(interactive) {
  if (!win || win.isDestroyed()) return;
  if (interactive) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

// -----------------------------------------------------------------------------
// 7. Menú contextual (clic derecho sobre el notch)
// -----------------------------------------------------------------------------
// Como no hay icono en la barra de tareas, este menú es la forma de salir.

function showContextMenu() {
  const pomodoroRunning = pomodoro.status === 'running';
  const musicPlaying = music.state.status === 'playing';
  const hasMusic = musicPlaying || music.state.status === 'paused';
  const menu = Menu.buildFromTemplate([
    { label: isExpanded ? 'Cerrar panel' : 'Abrir panel', click: toggleExpanded },
    {
      label: pomodoroRunning ? 'Pausar Pomodoro' : 'Iniciar Pomodoro',
      click: () => (pomodoroRunning ? pausePomodoro() : startPomodoro()),
    },
    {
      label: musicPlaying ? 'Pausar música' : 'Reanudar música',
      enabled: hasMusic && music.state.canPlayPause,
      click: () => sendMediaCommand('toggle'),
    },
    { type: 'separator' },
    { label: 'Salir de Notch', click: () => app.quit() },
  ]);

  menu.popup({
    window: win,
    // Si cierras el menú sin elegir nada y el panel está cerrado, devolvemos
    // el foco a tu app (el clic derecho se lo había dado al notch).
    callback: () => {
      if (win && !win.isDestroyed() && !isExpanded && win.isFocused()) giveFocusBack();
    },
  });
}

// -----------------------------------------------------------------------------
// 8. Atajo global
// -----------------------------------------------------------------------------

function registerShortcut() {
  let registered = false;
  try {
    registered = globalShortcut.register(settings.shortcut, toggleExpanded);
  } catch (error) {
    // Pasa si el texto del atajo no es válido, p. ej. "Ctrl+Alt+" (falta la tecla).
    console.error(`[atajo] "${settings.shortcut}" no es un atajo válido: ${error.message}`);
  }
  if (!registered) {
    console.warn(
      `[atajo] No se pudo registrar "${settings.shortcut}". ` +
        '¿Lo usa otra app? Cámbialo en config/settings.json. Mientras tanto, haz clic en la píldora.'
    );
  }
}

// -----------------------------------------------------------------------------
// 9. Pomodoro
// -----------------------------------------------------------------------------

/** Ajusta los minutos a un número entero entre 1 y 180. */
function clampMinutes(value) {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return DEFAULT_SETTINGS.pomodoroMinutes;
  return Math.min(POMODORO_MAX_MINUTES, Math.max(POMODORO_MIN_MINUTES, minutes));
}

/** "2026-10-31": sirve para reiniciar el contador de Pomodoros cada día. */
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Lo que la página necesita para dibujar el Pomodoro. */
function getPomodoroState() {
  const isRunning = pomodoro.status === 'running';
  return {
    status: pomodoro.status,
    durationMs: pomodoro.durationMs,
    remainingMs: isRunning ? Math.max(0, pomodoro.endsAt - Date.now()) : pomodoro.remainingMs,
    // Con endsAt la página calcula ella sola el tiempo que queda, segundo a
    // segundo, sin tener que preguntarnos.
    endsAt: isRunning ? pomodoro.endsAt : null,
    minutes: settings.pomodoroMinutes,
    completedToday: pomodoro.completedDay === todayKey() ? pomodoro.completedCount : 0,
  };
}

function sendPomodoroState() {
  sendToRenderer('pomodoro:state', getPomodoroState());
}

function startPomodoro() {
  if (pomodoro.status === 'running') return;
  if (pomodoro.status !== 'paused') {
    // Listo o terminado → empezamos una sesión nueva desde el principio.
    pomodoro.durationMs = settings.pomodoroMinutes * MINUTE_MS;
    pomodoro.remainingMs = pomodoro.durationMs;
  }
  pomodoro.status = 'running';
  pomodoro.endsAt = Date.now() + pomodoro.remainingMs;
  clearTimeout(pomodoro.timer);
  // UN solo temporizador que salta al terminar: nada de comprobar cada segundo.
  pomodoro.timer = setTimeout(finishPomodoro, pomodoro.remainingMs);
  sendPomodoroState();
}

function pausePomodoro() {
  if (pomodoro.status !== 'running') return;
  clearTimeout(pomodoro.timer);
  pomodoro.remainingMs = Math.max(0, pomodoro.endsAt - Date.now());
  pomodoro.endsAt = null;
  pomodoro.status = 'paused';
  sendPomodoroState();
}

function resetPomodoro() {
  clearTimeout(pomodoro.timer);
  pomodoro.status = 'idle';
  pomodoro.durationMs = settings.pomodoroMinutes * MINUTE_MS;
  pomodoro.remainingMs = pomodoro.durationMs;
  pomodoro.endsAt = null;
  sendPomodoroState();
}

function finishPomodoro() {
  clearTimeout(pomodoro.timer);
  pomodoro.status = 'finished';
  pomodoro.remainingMs = 0;
  pomodoro.endsAt = null;

  const today = todayKey();
  if (pomodoro.completedDay !== today) {
    pomodoro.completedDay = today;
    pomodoro.completedCount = 0;
  }
  pomodoro.completedCount += 1;

  sendPomodoroState();
  notifyPomodoroFinished();
}

/** Cambia la duración (botones − / + de la pestaña Focus) y la guarda en settings.json. */
function setPomodoroMinutes(minutes) {
  // No se cambia a mitad de una sesión: primero hay que reiniciarla.
  if (pomodoro.status === 'running' || pomodoro.status === 'paused') return;
  const value = clampMinutes(minutes);
  if (value === settings.pomodoroMinutes && pomodoro.status === 'idle') return;
  settings.pomodoroMinutes = value;
  saveSetting('pomodoroMinutes', value);
  resetPomodoro();
}

/** Notificación de Windows al terminar. Si la pulsas, se abre la pestaña Focus. */
function notifyPomodoroFinished() {
  if (!Notification.isSupported()) return;
  const minutes = Math.round(pomodoro.durationMs / MINUTE_MS);
  const count = pomodoro.completedCount;

  lastNotification = new Notification({
    title: '¡Pomodoro terminado! 🍅',
    body: `${minutes} min de foco completados (${count} hoy). Tómate un descanso.`,
    icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
  });
  lastNotification.on('click', () => openTab('focus'));
  lastNotification.show();
}

// -----------------------------------------------------------------------------
// 10. Links (config/links.json)
// -----------------------------------------------------------------------------

/** Lee links.json y se queda solo con los links válidos. */
function loadLinks() {
  const data = readConfigJson('links.json');
  if (data === undefined) return [];
  if (!Array.isArray(data)) {
    console.warn('[links] links.json debe ser una lista: [ { "name": "...", "url": "..." } ]');
    return [];
  }
  return data.map(normalizeLink).filter(Boolean);
}

/** Revisa un link de links.json y completa lo que falte (color, inicial...). */
function normalizeLink(entry, index) {
  const label = `El link nº ${index + 1}`;
  if (!entry || typeof entry !== 'object') {
    console.warn(`[links] ${label} no es un objeto { ... }. Lo ignoro.`);
    return null;
  }

  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) {
    console.warn(`[links] ${label} no tiene "name". Lo ignoro.`);
    return null;
  }

  let url;
  try {
    url = new URL(String(entry.url ?? '').trim());
  } catch {
    console.warn(`[links] "${name}": la url no es válida. Lo ignoro.`);
    return null;
  }
  if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) {
    console.warn(`[links] "${name}": solo se permiten links http://, https:// o mailto:. Lo ignoro.`);
    return null;
  }

  const color = isHexColor(entry.color) ? expandHex(entry.color) : pickColor(name);
  // Array.from separa bien los emojis (que ocupan 2 "caracteres" en JS).
  const customInitial = typeof entry.initial === 'string' ? entry.initial.trim() : '';
  const initial = customInitial
    ? Array.from(customInitial).slice(0, 2).join('')
    : Array.from(name)[0].toUpperCase();

  return {
    name,
    url: url.href,
    color,
    initial,
    textColor: isLightColor(color) ? '#111111' : '#ffffff', // texto legible sobre el color
    host: url.protocol === 'mailto:' ? url.pathname : url.hostname,
  };
}

/** Lo que ve la página: todo menos la url (para abrir un link, pide su número). */
function getLinksForRenderer() {
  return links.map(({ name, color, initial, textColor, host }) => ({ name, color, initial, textColor, host }));
}

function openLink(index) {
  const link = Number.isInteger(index) ? links[index] : undefined;
  if (!link) return;
  shell.openExternal(link.url).catch((error) => {
    console.warn(`[links] No se pudo abrir ${link.url}: ${error.message}`);
  });
}

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** "#abc" → "#aabbcc" */
function expandHex(value) {
  const hex = value.trim().slice(1);
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return `#${full.toLowerCase()}`;
}

/** Elige siempre el mismo color de la paleta para el mismo nombre. */
function pickColor(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return LINK_PALETTE[hash % LINK_PALETTE.length];
}

/** ¿Es un color claro? (entonces el texto encima va en negro) */
function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

// -----------------------------------------------------------------------------
// 11. Música: el helper en C# (helpers/MediaHelper)
// -----------------------------------------------------------------------------
// El helper lee la sesión multimedia de Windows y nos escribe una línea JSON
// por cada cambio (ver el comentario de arriba de Program.cs). Nosotros le
// mandamos órdenes (play, pause, next...) escribiendo en su stdin.

/** Dónde está MediaHelper.exe (se puede cambiar con la variable NOTCH_MEDIA_HELPER). */
function getMediaHelperPath() {
  if (process.env.NOTCH_MEDIA_HELPER) return process.env.NOTCH_MEDIA_HELPER;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'MediaHelper', 'MediaHelper.exe')
    : path.join(__dirname, 'helpers', 'MediaHelper', 'publish', 'MediaHelper.exe');
}

function startMediaHelper() {
  music.restartTimer = null;
  const helperPath = getMediaHelperPath();

  if (process.platform !== 'win32' && !process.env.NOTCH_MEDIA_HELPER) {
    setMusicAvailability('unsupported');
    return;
  }
  if (!fs.existsSync(helperPath)) {
    console.warn(`[música] No encuentro ${helperPath}. Compílalo con: npm run build:helper`);
    setMusicAvailability('missing');
    return;
  }

  // windowsHide: que no aparezca una ventana de consola negra.
  const child = spawn(helperPath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  music.process = child;

  // readline corta la salida en líneas: cada línea es un JSON completo.
  readline.createInterface({ input: child.stdout }).on('line', handleHelperLine);

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text) => console.warn(`[música] ${text.trim()}`));
  child.stdin.on('error', () => {}); // si el helper muere, escribirle falla: lo ignoramos
  child.on('error', (error) => {
    console.warn(`[música] No se pudo arrancar el helper: ${error.message}`);
    onHelperGone(child);
  });
  child.on('exit', (code) => {
    if (!isQuitting) console.warn(`[música] El helper se cerró (código ${code}).`);
    onHelperGone(child);
  });
}

/** El helper se cerró o no pudo arrancar: lo reiniciamos un poco más tarde. */
function onHelperGone(child) {
  if (music.process !== child) return; // ya lo habíamos gestionado
  music.process = null;
  if (isQuitting || music.restartTimer) return;
  setMusicAvailability('error');
  console.warn(`[música] Lo reinicio en ${music.restartDelay / 1000} s.`);
  music.restartTimer = setTimeout(startMediaHelper, music.restartDelay);
  music.restartDelay = Math.min(music.restartDelay * 2, HELPER_RESTART_MAX_MS);
}

function stopMediaHelper() {
  clearTimeout(music.restartTimer);
  music.restartTimer = null;
  if (music.process) {
    music.process.kill();
    music.process = null;
  }
}

function handleHelperLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.warn(`[música] El helper mandó algo que no es JSON: ${line.slice(0, 120)}`);
    return;
  }

  if (message.type === 'media') {
    updateMusic(message);
  } else if (message.type === 'ready') {
    music.restartDelay = HELPER_RESTART_MIN_MS; // arrancó bien: la próxima espera vuelve a ser corta
    console.log('[música] Helper listo.');
  } else if (message.type === 'error') {
    console.warn(`[música] ${message.message}`);
  }
}

/** Guarda lo que mandó el helper y se lo pasa a la página. */
function updateMusic(message) {
  // "art" solo viene cuando la carátula cambia ("" = sin carátula).
  const artChanged = typeof message.art === 'string';
  if (artChanged) music.art = message.art ? `data:image/jpeg;base64,${message.art}` : null;

  // timestamp = cuándo midió el helper la posición. Si viniera raro, usamos "ahora".
  const timestamp = Number(message.timestamp);
  music.state = {
    available: 'ok',
    status: String(message.status || 'none'),
    title: String(message.title || ''),
    artist: String(message.artist || ''),
    album: String(message.album || ''),
    appName: friendlyAppName(String(message.app || '')),
    position: Number(message.position) || 0, // segundos
    duration: Number(message.duration) || 0, // segundos (0 = la app no lo dice)
    rate: Number(message.rate) || 1,
    timestamp: Number.isFinite(timestamp) && Math.abs(timestamp - Date.now()) < 5000 ? timestamp : Date.now(),
    canPlayPause: message.canPlayPause === true,
    canNext: message.canNext === true,
    canPrevious: message.canPrevious === true,
    canSeek: message.canSeek === true,
  };

  // La carátula (decenas de KB) solo viaja a la página cuando cambia.
  sendToRenderer('media:state', artChanged ? { ...music.state, art: music.art } : music.state);
}

function setMusicAvailability(available) {
  music.state = { available, status: 'none' };
  music.art = null;
  sendToRenderer('media:state', { ...music.state, art: null });
}

/** Manda una orden al helper (solo las de la lista; "seek" con un número de segundos). */
function sendMediaCommand(command, value) {
  const stdin = music.process?.stdin;
  if (!stdin || !stdin.writable) return;
  if (MEDIA_COMMANDS.includes(command)) {
    stdin.write(`${command}\n`);
  } else if (command === 'seek' && Number.isFinite(value) && value >= 0) {
    stdin.write(`seek ${value.toFixed(2)}\n`);
  }
}

/** "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App" → "Apple Music" */
function friendlyAppName(appId) {
  if (!appId) return '';
  const known = KNOWN_MEDIA_APPS.find(([pattern]) => pattern.test(appId));
  if (known) return known[1];
  // Para el resto, limpiamos el código: quitamos ".exe", "!App", el editor...
  const base = appId
    .split('!')[0]
    .split('\\')
    .pop()
    .replace(/\.exe$/i, '')
    .replace(/_[a-z0-9]{13}$/i, '');
  return base.split('.').pop() || base;
}

// -----------------------------------------------------------------------------
// 12. IPC: mensajes que llegan desde la página (a través de preload.js)
// -----------------------------------------------------------------------------

/** Solo aceptamos mensajes que vengan de nuestra propia ventana. */
function isFromNotch(event) {
  return Boolean(win) && !win.isDestroyed() && event.sender.id === win.webContents.id;
}

/** Atajo para registrar un aviso (send/on) que solo atiende a nuestra ventana. */
function onRendererMessage(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (isFromNotch(event)) handler(...args);
  });
}

/** Atajo para registrar una pregunta con respuesta (invoke/handle). */
function onRendererRequest(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => (isFromNotch(event) ? handler(...args) : null));
}

function registerIpcHandlers() {
  // Ventana
  onRendererRequest('settings:get', () => settings);
  onRendererMessage('notch:set-mouse-interactive', (interactive) => setMouseInteractive(interactive === true));
  onRendererMessage('notch:expand', () => setExpanded(true));
  onRendererMessage('notch:collapse', () => setExpanded(false, { restoreFocus: true }));
  onRendererMessage('notch:context-menu', () => showContextMenu());

  // Pomodoro
  onRendererRequest('pomodoro:get', () => getPomodoroState());
  onRendererMessage('pomodoro:start', () => startPomodoro());
  onRendererMessage('pomodoro:pause', () => pausePomodoro());
  onRendererMessage('pomodoro:reset', () => resetPomodoro());
  onRendererMessage('pomodoro:set-minutes', (minutes) => setPomodoroMinutes(minutes));

  // Links
  onRendererRequest('links:get', () => getLinksForRenderer());
  onRendererMessage('links:open', (index) => openLink(index));

  // Música
  onRendererRequest('media:get', () => ({ ...music.state, art: music.art }));
  onRendererMessage('media:command', (command, value) => sendMediaCommand(String(command), Number(value)));
}

// -----------------------------------------------------------------------------
// 13. Arranque
// -----------------------------------------------------------------------------

// Solo puede haber un Notch a la vez. Si lo abres otra vez, la copia nueva se
// cierra sola y la que ya estaba abierta despliega su panel.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  // Chromium puede escribir antes algún error de "cache" (Acceso denegado):
  // es esta copia intentando usar la caché de la que ya está abierta. Es inofensivo.
  console.log('[notch] Notch ya estaba abierto: le pido que abra su panel y cierro esta copia.');
  app.quit();
} else {
  // Windows agrupa las notificaciones por este identificador.
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => setExpanded(true));

  app.whenReady().then(() => {
    // Electron trae un corrector ortográfico que, al arrancar, descarga
    // diccionarios de servidores de Google (aunque esté desactivado). Notch no
    // tiene campos de texto: lo apagamos y mandamos esa descarga a tu propio
    // PC (127.0.0.1), donde falla sin salir a internet. Solo se permite LRCLIB.
    session.defaultSession.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:9/');
    session.defaultSession.setSpellCheckerEnabled(false);

    // Sin menú de aplicación: evita atajos por defecto como Ctrl+W (cerrar) o Ctrl+R.
    Menu.setApplicationMenu(null);

    settings = loadSettings();
    links = loadLinks();
    resetPomodoro(); // aplica la duración de settings.json

    registerIpcHandlers();
    createWindow();
    registerShortcut();
    watchConfigFolder();
    startMediaHelper();

    // Si conectas/desconectas un monitor o cambias resolución/escala, recolocamos el notch.
    // (Son eventos del sistema: no hay ningún temporizador comprobando nada.)
    screen.on('display-metrics-changed', repositionWindow);
    screen.on('display-added', repositionWindow);
    screen.on('display-removed', repositionWindow);

    // Si el portátil se suspende, pausamos el Pomodoro: no estabas trabajando.
    powerMonitor.on('suspend', pausePomodoro);
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopMediaHelper(); // el helper se cierra con nosotros
  });
}
