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
//  Fase 1: ventana transparente con la píldora, atajo global para abrir/cerrar
//  y clics que atraviesan la ventana cuando el ratón no está sobre el notch.
// =============================================================================

'use strict';

const { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// -----------------------------------------------------------------------------
// 1. Constantes
// -----------------------------------------------------------------------------

// `npm run dev` arranca con --dev: abre las DevTools y el panel NO se cierra al
// perder el foco (si no, se cerraría cada vez que haces clic en las DevTools).
const IS_DEV = process.argv.includes('--dev');

// La ventana mide SIEMPRE lo mismo: el panel abierto + un margen transparente
// para que quepa la sombra. La animación píldora → panel se hace con CSS dentro
// de esta ventana fija, porque redimensionar ventanas transparentes en Windows
// produce parpadeos.
// ⚠️ Si cambias PANEL_* o TOP_GAP, cambia también las variables de renderer/styles.css.
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 260;
const TOP_GAP = 8; // separación entre el borde de arriba de la pantalla y el notch
const SHADOW_MARGIN = 40; // espacio extra alrededor para que la sombra no se corte
const WINDOW_WIDTH = PANEL_WIDTH + SHADOW_MARGIN * 2; // 800 px
const WINDOW_HEIGHT = TOP_GAP + PANEL_HEIGHT + SHADOW_MARGIN; // 308 px

// Valores por defecto de config/settings.json (si falta una clave, se usa esta).
const DEFAULT_SETTINGS = {
  shortcut: 'Control+Alt+T', // atajo global para abrir/cerrar
  locale: 'es-ES', // idioma para la fecha y la hora
  hour12: false, // true = reloj de 12 horas (a. m. / p. m.)
};

// -----------------------------------------------------------------------------
// 2. Estado de la app
// -----------------------------------------------------------------------------

let win = null; // la única ventana de la app
let settings = { ...DEFAULT_SETTINGS };
let isExpanded = false; // ¿el panel está abierto? La "verdad" vive aquí, en main.
let isQuitting = false; // pasa a true cuando el usuario elige "Salir"

// -----------------------------------------------------------------------------
// 3. Configuración (carpeta config/)
// -----------------------------------------------------------------------------

/** Carpeta donde viven settings.json (y en la Fase 2, links.json). */
function getConfigDir() {
  // En desarrollo usamos la carpeta config/ del proyecto. En la app empaquetada
  // (npm run dist), electron-builder la copia a resources/config (ver package.json).
  return app.isPackaged
    ? path.join(process.resourcesPath, 'config')
    : path.join(__dirname, 'config');
}

/**
 * Lee un JSON de config/ y lo mezcla con los valores por defecto.
 * Nunca lanza error: si el archivo falta o está mal escrito, avisa por consola
 * y devuelve los valores por defecto.
 */
function readConfigFile(fileName, defaults) {
  const filePath = path.join(getConfigDir(), fileName);
  try {
    // .replace() quita el BOM que a veces añade el Bloc de notas de Windows
    // (sin esto, JSON.parse falla con un error muy confuso).
    const text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('el archivo debe contener un objeto JSON { ... }');
    }
    return { ...defaults, ...data };
  } catch (error) {
    console.warn(`[config] No se pudo leer ${filePath}: ${error.message}. Uso valores por defecto.`);
    return { ...defaults };
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
  // así puede avisarnos cuando el cursor entra en la píldora (ver sección 6).
  win.setIgnoreMouseEvents(true, { forward: true });

  // showInactive = mostrar la ventana SIN robarle el foco a la app que uses.
  win.once('ready-to-show', () => win.showInactive());

  // Cada vez que la página (re)carga, le mandamos el estado actual. Así un
  // Ctrl+R en las DevTools no deja a main y al renderer desincronizados.
  win.webContents.on('did-finish-load', () => {
    setMouseInteractive(false);
    win.webContents.send('notch:expanded', isExpanded);
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

// -----------------------------------------------------------------------------
// 5. Abrir y cerrar el panel
// -----------------------------------------------------------------------------

/**
 * Abre (true) o cierra (false) el panel. El renderer hace la animación.
 * @param {boolean} expanded
 * @param {{ restoreFocus?: boolean }} [options]
 *   restoreFocus: al cerrar, devolver el foco a la app que estabas usando.
 *   (No hace falta cuando se cierra por un clic fuera: ese clic ya movió el foco.)
 */
function setExpanded(expanded, { restoreFocus = false } = {}) {
  if (!win || win.isDestroyed() || expanded === isExpanded) return;
  isExpanded = expanded;
  win.webContents.send('notch:expanded', isExpanded);

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
// clics pasan a la ventana de abajo. El renderer nos avisa cuando el cursor
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
  const menu = Menu.buildFromTemplate([
    { label: isExpanded ? 'Cerrar panel' : 'Abrir panel', click: toggleExpanded },
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
// 9. IPC: mensajes que llegan desde el renderer (a través de preload.js)
// -----------------------------------------------------------------------------

/** Solo aceptamos mensajes que vengan de nuestra propia ventana. */
function isFromNotch(event) {
  return Boolean(win) && !win.isDestroyed() && event.sender.id === win.webContents.id;
}

function registerIpcHandlers() {
  // invoke/handle = pregunta con respuesta (devuelve una Promise en el renderer).
  ipcMain.handle('settings:get', (event) => (isFromNotch(event) ? settings : null));

  // send/on = aviso sin respuesta.
  ipcMain.on('notch:set-mouse-interactive', (event, interactive) => {
    if (isFromNotch(event)) setMouseInteractive(interactive === true);
  });
  ipcMain.on('notch:expand', (event) => {
    if (isFromNotch(event)) setExpanded(true);
  });
  ipcMain.on('notch:collapse', (event) => {
    if (isFromNotch(event)) setExpanded(false, { restoreFocus: true });
  });
  ipcMain.on('notch:context-menu', (event) => {
    if (isFromNotch(event)) showContextMenu();
  });
}

// -----------------------------------------------------------------------------
// 10. Arranque
// -----------------------------------------------------------------------------

// Solo puede haber un Notch a la vez. Si lo abres otra vez, la copia nueva se
// cierra sola y la que ya estaba abierta despliega su panel.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => setExpanded(true));

  app.whenReady().then(() => {
    // Sin menú de aplicación: evita atajos por defecto como Ctrl+W (cerrar) o Ctrl+R.
    Menu.setApplicationMenu(null);

    settings = readConfigFile('settings.json', DEFAULT_SETTINGS);
    registerIpcHandlers();
    createWindow();
    registerShortcut();

    // Si conectas/desconectas un monitor o cambias resolución/escala, recolocamos el notch.
    // (Son eventos del sistema: no hay ningún temporizador comprobando nada.)
    screen.on('display-metrics-changed', repositionWindow);
    screen.on('display-added', repositionWindow);
    screen.on('display-removed', repositionWindow);
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
