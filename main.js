// =============================================================================
//  main.js — Punto de entrada del proceso principal de Electron
// -----------------------------------------------------------------------------
//  Electron tiene dos mundos:
//    • Proceso principal (este archivo y la carpeta main/): es Node.js y tiene
//      acceso al sistema. Crea la ventana, registra atajos, lee archivos...
//    • Renderer (la carpeta renderer/): una página web que solo dibuja la
//      interfaz. Por seguridad NO tiene acceso a Node: nos pide cosas por IPC a
//      través del puente que define preload.js.
//
//  Este archivo solo arranca la app y conecta los módulos de main/:
//    state.js      estado compartido (la ventana, la configuración...)
//    bridge.js     hablar con la página (IPC)
//    config.js     config/settings.json y su recarga automática
//    window.js     la ventana: posición, abrir/cerrar, foco, clics, menú
//    shortcuts.js  atajos de teclado globales
//    pomodoro.js   el temporizador Pomodoro y su notificación
//    links.js      config/links.json
//    helper.js     el helper de Windows en C# (helpers/WinHelper)
//    music.js      la música que suena en Windows (vía el helper)
//    ipc.js        todo lo que la página puede pedir
// =============================================================================

'use strict';

const { app, Menu, powerMonitor, screen, session } = require('electron');
const { APP_ID, state } = require('./main/state');
const { sendToRenderer } = require('./main/bridge');
const config = require('./main/config');
const notchWindow = require('./main/window');
const shortcuts = require('./main/shortcuts');
const pomodoro = require('./main/pomodoro');
const links = require('./main/links');
const helper = require('./main/helper');
const { registerIpcHandlers } = require('./main/ipc');

/** Al guardar algo en config/, se aplica al momento (sin reiniciar). */
function onConfigChanged(changedFiles) {
  if (changedFiles.has('settings.json')) {
    const previousShortcut = state.settings.shortcut;
    state.settings = config.loadSettings();
    if (state.settings.shortcut !== previousShortcut) shortcuts.registerShortcuts();
    // Si el Pomodoro está parado, la nueva duración se aplica ya; si está en
    // marcha, se aplicará al reiniciarlo.
    pomodoro.onSettingsChanged();
    sendToRenderer('settings:changed', state.settings);
    console.log('[config] settings.json recargado.');
  }

  if (changedFiles.has('links.json')) {
    const count = links.loadLinks();
    sendToRenderer('links:changed', links.getLinksForRenderer());
    console.log(`[config] links.json recargado (${count} links).`);
  }
}

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

  app.on('second-instance', () => notchWindow.setExpanded(true));

  app.whenReady().then(() => {
    // Electron trae un corrector ortográfico que, al arrancar, descarga
    // diccionarios de servidores de Google (aunque esté desactivado). Notch no
    // tiene campos de texto: lo apagamos y mandamos esa descarga a tu propio
    // PC (127.0.0.1), donde falla sin salir a internet. Solo se permite LRCLIB.
    session.defaultSession.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:9/');
    session.defaultSession.setSpellCheckerEnabled(false);

    // Sin menú de aplicación: evita atajos por defecto como Ctrl+W (cerrar) o Ctrl+R.
    Menu.setApplicationMenu(null);

    state.settings = config.loadSettings();
    links.loadLinks();
    pomodoro.resetPomodoro(); // aplica la duración de settings.json
    // Al pulsar la notificación del Pomodoro, se abre la pestaña Focus.
    pomodoro.setNotificationClickHandler(() => notchWindow.openTab('focus'));

    registerIpcHandlers();
    notchWindow.createWindow();
    shortcuts.registerShortcuts();
    config.watchConfigFolder(onConfigChanged);
    helper.startHelper();

    // Si conectas/desconectas un monitor o cambias resolución/escala, recolocamos el notch.
    // (Son eventos del sistema: no hay ningún temporizador comprobando nada.)
    screen.on('display-metrics-changed', notchWindow.repositionWindow);
    screen.on('display-added', notchWindow.repositionWindow);
    screen.on('display-removed', notchWindow.repositionWindow);

    // Si el portátil se suspende, pausamos el Pomodoro: no estabas trabajando.
    powerMonitor.on('suspend', pomodoro.pausePomodoro);
  });

  app.on('before-quit', () => {
    state.isQuitting = true;
  });

  app.on('will-quit', () => {
    shortcuts.unregisterShortcuts();
    helper.stopHelper(); // el helper se cierra con nosotros
  });
}
