// =============================================================================
//  main/window.js — La ventana del notch
// -----------------------------------------------------------------------------
//  Crea la ventana transparente, la coloca arriba del monitor principal, abre y
//  cierra el panel, gestiona el foco, los clics que atraviesan la ventana y el
//  menú del clic derecho.
// =============================================================================

'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('node:path');
const { IS_DEV, ROOT_DIR, state } = require('./state');
const { sendToRenderer } = require('./bridge');
const pomodoro = require('./pomodoro');
const music = require('./music');

// La ventana mide SIEMPRE lo mismo: el panel abierto + un margen transparente
// para la sombra (y para el pequeño rebote al abrirse). La animación se hace
// con CSS dentro de esta ventana fija, porque redimensionar ventanas
// transparentes en Windows produce parpadeos.
// ⚠️ Si cambias PANEL_* o TOP_GAP, cambia también las variables de renderer/styles.css.
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 360;
const TOP_GAP = 8; // separación entre el borde de arriba de la pantalla y el notch
const SHADOW_MARGIN = 50; // espacio extra alrededor para que la sombra no se corte
const WINDOW_WIDTH = PANEL_WIDTH + SHADOW_MARGIN * 2; // 820 px
const WINDOW_HEIGHT = TOP_GAP + PANEL_HEIGHT + SHADOW_MARGIN; // 418 px

/** Obtiene el monitor configurado o el principal. */
function getTargetDisplay() {
  const displays = screen.getAllDisplays();
  if (state.settings && state.settings.monitor && state.settings.monitor !== 'primary') {
    const match = displays.find((d) => String(d.id) === String(state.settings.monitor));
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
}

/** Calcula dónde va la ventana según el monitor, escala y margen superior. */
function getWindowBounds() {
  const display = getTargetDisplay();
  const zoomFactor = ((state.settings && state.settings.scale) || 100) / 100;
  const topGap = state.settings && Number.isFinite(state.settings.topGap) ? state.settings.topGap : TOP_GAP;
  const scaledWidth = Math.round(WINDOW_WIDTH * zoomFactor);
  const scaledHeight = Math.round((WINDOW_HEIGHT + (topGap - TOP_GAP)) * zoomFactor);
  // bounds = el monitor completo → centramos: display.bounds.width - WINDOW_WIDTH escalado
  return {
    x: Math.round(display.bounds.x + (display.bounds.width - scaledWidth) / 2),
    y: display.workArea.y,
    width: scaledWidth,
    height: scaledHeight,
  };
}

function createWindow() {
  const win = new BrowserWindow({
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
      preload: path.join(ROOT_DIR, 'preload.js'),
      contextIsolation: true, // la página no puede tocar el preload ni Node
      nodeIntegration: false, // nada de require() en la página
      sandbox: true,
      spellcheck: false,
    },
  });
  state.win = win;

  win.loadFile(path.join(ROOT_DIR, 'renderer', 'index.html'));

  // Empezamos en modo "atravesable": los clics pasan a las ventanas de abajo.
  // Con forward: true la página sigue recibiendo los MOVIMIENTOS del ratón, y
  // así sabe cuándo te acercas al notch.
  win.setIgnoreMouseEvents(true, { forward: true });

  // showInactive = mostrar la ventana SIN robarle el foco a la app que uses.
  win.once('ready-to-show', () => win.showInactive());

  // Cada vez que la página (re)carga, le mandamos el estado actual. Así un
  // Ctrl+R en las DevTools no deja a main y a la página desincronizados.
  win.webContents.on('did-finish-load', () => {
    const zoomFactor = ((state.settings && state.settings.scale) || 100) / 100;
    win.webContents.setZoomFactor(zoomFactor);
    setMouseInteractive(false);
    sendToRenderer('notch:expanded', state.isExpanded);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });

  // Clic fuera del panel (en otra ventana, el escritorio, el otro monitor...)
  // = nuestra ventana pierde el foco → cerramos el panel. Salvo mientras está
  // abierta la ventana de elegir archivos (la bandeja): esa se lleva el foco.
  win.on('blur', () => {
    if (state.isExpanded && !IS_DEV && !state.dialogOpen) setExpanded(false);
    if (state.aiQuickOpen && !IS_DEV) {
      const { closeAiQuick } = require('./ai-quick');
      closeAiQuick({ restoreFocus: false });
    }
  });

  // Alt+F4 con el panel abierto: lo cerramos en lugar de salir de la app.
  // Para salir de verdad: clic derecho en el notch → "Salir de Notch".
  win.on('close', (event) => {
    if (!state.isQuitting) {
      event.preventDefault();
      setExpanded(false, { restoreFocus: true });
    }
  });

  // Clic derecho en un cuadro de texto (la nota): menú de edición.
  win.webContents.on('context-menu', (_event, params) => {
    if (params.isEditable) showEditMenu();
  });

  // Seguridad: la página nunca navega a otra URL ni abre ventanas nuevas.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Si el proceso de la página se cae, lo recargamos: el notch no debe desaparecer.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (state.isQuitting || details.reason === 'clean-exit') return;
    console.error(`[notch] La página se cerró inesperadamente (${details.reason}). Recargando...`);
    state.isExpanded = false;
    win.reload();
  });

  if (IS_DEV) {
    win.webContents.openDevTools({ mode: 'detach' });
    startDevMetricsLogger();
  }
}

/** Recoloca la ventana cuando cambian los monitores (resolución, escala, conectar/desconectar...). */
function repositionWindow() {
  const { win } = state;
  if (win && !win.isDestroyed()) {
    win.setBounds(getWindowBounds());
    const zoomFactor = ((state.settings && state.settings.scale) || 100) / 100;
    win.webContents.setZoomFactor(zoomFactor);
  }
}

let metricsInterval = null;

/** Medidor de consumo de CPU y memoria exclusivo para modo desarrollo (npm run dev). */
function startDevMetricsLogger() {
  if (metricsInterval || !IS_DEV) return;
  metricsInterval = setInterval(() => {
    try {
      if (!app || typeof app.getAppMetrics !== 'function') return;
      const metrics = app.getAppMetrics();
      const totalCpu = metrics.reduce((acc, m) => acc + (m.cpu?.percentCPUUsage || 0), 0);
      const rssMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
      console.log(`[dev:perf] CPU: ${totalCpu.toFixed(1)}% | RAM (main): ${rssMb} MB | Procesos: ${metrics.length}`);
    } catch {}
  }, 5000);
  if (metricsInterval.unref) metricsInterval.unref();
}

function stopDevMetricsLogger() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

let isFullscreenHidden = false;

/** Oculta o muestra la ventana de Notch al entrar o salir de pantalla completa. */
function setFullscreenHidden(active) {
  const { win } = state;
  if (!win || win.isDestroyed()) return;
  isFullscreenHidden = Boolean(active);
  if (isFullscreenHidden) {
    if (state.isExpanded) setExpanded(false);
    win.hide();
  } else {
    if (!state.isPaused) win.showInactive();
  }
  sendToRenderer('notch:fullscreen', isFullscreenHidden);
}

function isFullscreenActive() {
  return isFullscreenHidden;
}

// -----------------------------------------------------------------------------
// Abrir y cerrar el panel
// -----------------------------------------------------------------------------

/**
 * Abre (true) o cierra (false) el panel. La página hace la animación.
 * @param {boolean} expanded
 * @param {{ restoreFocus?: boolean }} [options]
 *   restoreFocus: al cerrar, devolver el foco a la app que estabas usando.
 *   (No hace falta cuando se cierra por un clic fuera: ese clic ya movió el foco.)
 */
function setExpanded(expanded, { restoreFocus = false } = {}) {
  const { win } = state;
  if (!win || win.isDestroyed() || expanded === state.isExpanded) return;
  state.isExpanded = expanded;
  sendToRenderer('notch:expanded', expanded);

  if (expanded) {
    // Tomamos el foco para (1) recibir la tecla Esc y (2) enterarnos con el
    // evento 'blur' de cuándo haces clic fuera del panel.
    win.focus();
  } else if (restoreFocus && win.isFocused()) {
    giveFocusBack();
  }
}

function toggleExpanded() {
  setExpanded(!state.isExpanded, { restoreFocus: true });
}

/** Respondiste algo en la isla con el panel cerrado: el foco vuelve a tu app. */
function releaseFocus() {
  const { win } = state;
  if (win && !win.isDestroyed() && !state.isExpanded && win.isFocused()) giveFocusBack();
}

/** Abre el panel directamente en una página (atajos Ctrl+Alt+1…6, la notificación...). */
function openTab(tabName) {
  const { win } = state;
  if (!win || win.isDestroyed()) return;
  state.currentTab = tabName;
  // Primero cambiamos de página y después abrimos: así el panel se abre ya en
  // ella, sin verse antes la anterior.
  sendToRenderer('notch:show-tab', tabName);
  if (state.isExpanded) win.focus(); // ya abierto: el foco, para poder escribir (p. ej. en la Nota)
  else setExpanded(true);
}

/** Atajo de una página: la abre y, si ya se estaba viendo, cierra el panel. */
function togglePage(tabName) {
  if (state.isExpanded && state.currentTab === tabName) setExpanded(false, { restoreFocus: true });
  else openTab(tabName);
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
  const { win } = state;
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(false);
    win.blur();
    win.setAlwaysOnTop(true, 'screen-saver');
  } catch (err) {
    console.warn('[window] Error devolviendo el foco:', err.message);
  }
}

// -----------------------------------------------------------------------------
// Clics que atraviesan la ventana
// -----------------------------------------------------------------------------
// La ventana es más grande que la isla (mide lo que el panel abierto). Para que
// no "bloquee" esa zona de la pantalla, normalmente ignora el ratón: los clics
// pasan a la ventana de abajo. La página nos avisa cuando el cursor entra o sale
// de la isla y cambiamos de modo.

/**
 * @param {boolean} interactive
 *   true  → el cursor está sobre la isla: la ventana recibe los clics.
 *   false → el cursor está fuera: los clics pasan a la ventana de abajo
 *           (forward: true mantiene los eventos de movimiento en la página).
 */
function setMouseInteractive(interactive) {
  const { win } = state;
  if (!win || win.isDestroyed()) return;
  if (interactive) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

// -----------------------------------------------------------------------------
// Menú contextual (clic derecho sobre la isla)
// -----------------------------------------------------------------------------
// Como no hay icono en la barra de tareas, este menú es la forma de salir.

function showContextMenu() {
  const { win } = state;
  const musicPlaying = music.isMusicPlaying();
  const menu = Menu.buildFromTemplate([
    { label: state.isExpanded ? 'Cerrar panel' : 'Abrir panel', click: toggleExpanded },
    {
      label: pomodoro.isPomodoroRunning() ? 'Pausar Pomodoro' : 'Iniciar Pomodoro',
      click: pomodoro.togglePomodoro,
    },
    {
      label: musicPlaying ? 'Pausar música' : 'Reanudar música',
      enabled: music.canToggleMusic(),
      click: () => music.sendMediaCommand('toggle'),
    },
    {
      label: 'Música en la isla',
      type: 'checkbox',
      checked: state.settings.musicActivity,
      click: (item) => music.setMusicActivity(item.checked),
    },
    { type: 'separator' },
    {
      label: 'Casa de Clawd (Ajustes)',
      click: () => {
        const casaClawd = require('./casa-clawd');
        casaClawd.openCasaClawd();
      },
    },
    { label: 'Salir de Notch', click: () => app.quit() },
  ]);

  menu.popup({
    window: win,
    // Si cierras el menú sin elegir nada y el panel está cerrado, devolvemos
    // el foco a tu app (el clic derecho se lo había dado al notch).
    callback: () => {
      if (win && !win.isDestroyed() && !state.isExpanded && win.isFocused()) giveFocusBack();
    },
  });
}

/** Menú de edición para los cuadros de texto (Ctrl+C, Ctrl+V... también funcionan). */
function showEditMenu() {
  Menu.buildFromTemplate([
    { role: 'undo', label: 'Deshacer' },
    { role: 'redo', label: 'Rehacer' },
    { type: 'separator' },
    { role: 'cut', label: 'Cortar' },
    { role: 'copy', label: 'Copiar' },
    { role: 'paste', label: 'Pegar' },
    { type: 'separator' },
    { role: 'selectAll', label: 'Seleccionar todo' },
  ]).popup({ window: state.win });
}

module.exports = {
  startDevMetricsLogger,
  stopDevMetricsLogger,
  createWindow,
  repositionWindow,
  setExpanded,
  toggleExpanded,
  releaseFocus,
  giveFocusBack,
  openTab,
  togglePage,
  setMouseInteractive,
  showContextMenu,
  setFullscreenHidden,
  isFullscreenActive,
};
