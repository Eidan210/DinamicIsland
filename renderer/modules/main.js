// =============================================================================
//  renderer/modules/main.js — Arranque de la interfaz
// -----------------------------------------------------------------------------
//  La página corre SIN acceso a Node: todo lo que necesita se lo pide al
//  proceso principal mediante `window.notch`, la API que define preload.js.
//
//  Cada parte de la interfaz vive en su propio módulo de esta carpeta:
//    utils.js     utilidades (animate, setText, formatos de tiempo...)
//    state.js     estado compartido (configuración, forma de la isla...)
//    island.js    formas de la isla, clics que atraviesan, despertar/dormir
//    panel.js     abrir y cerrar el panel (clic, Esc, teclado)
//    tabs.js      pestañas
//    clock.js     fecha y hora
//    eyes.js      los ojos
//    pomodoro.js  el Pomodoro (pestaña, tarjeta e isla)
//    music.js     la música (pestaña, tarjeta, isla y aviso)
//    links.js     los links
//  Este archivo solo los pone en marcha, en orden.
// =============================================================================

import { state } from './state.js';
import { initIsland, keepAwakeFor, updateShape } from './island.js';
import { initPanel } from './panel.js';
import { initTabs, moveTabIndicator } from './tabs.js';
import { initClock, applyClockSettings } from './clock.js';
import { startEyes } from './eyes.js';
import { initPomodoro, renderPomodoro } from './pomodoro.js';
import { initMusic, loadInitialMedia, renderMedia } from './music.js';
import { initLinks, setLinks } from './links.js';

const HELLO_MS = 2400; // al arrancar, la isla se ve como píldora este tiempo

async function init() {
  // 1. Cada módulo registra sus botones y los avisos de main.js que le tocan.
  initIsland();
  initPanel();
  initTabs();
  initClock();
  initPomodoro();
  initMusic();
  initLinks();

  // Al guardar config/settings.json, se aplica al momento.
  window.notch.onSettingsChange((newSettings) => {
    state.settings = { ...state.settings, ...newSettings };
    applyClockSettings();
    updateShape();
  });

  // 2. Pedimos a main.js el estado actual de todo.
  try {
    const [savedSettings, pomodoroState, savedLinks, mediaState] = await Promise.all([
      window.notch.getSettings(),
      window.notch.pomodoro.getState(),
      window.notch.links.getAll(),
      window.notch.media.getState(),
    ]);
    if (savedSettings) state.settings = { ...state.settings, ...savedSettings };
    if (pomodoroState) state.pomodoro = pomodoroState;
    if (mediaState) loadInitialMedia(mediaState);
    setLinks(savedLinks);
  } catch (error) {
    console.warn('No se pudo cargar el estado inicial, uso valores por defecto:', error);
  }

  // 3. Lo dibujamos todo.
  applyClockSettings();
  renderPomodoro();
  renderMedia();
  moveTabIndicator(false);
  startEyes();

  // 4. Al arrancar se ve como píldora un momento, para que sepas que está funcionando.
  state.initialized = true;
  keepAwakeFor(HELLO_MS);
}

init();
