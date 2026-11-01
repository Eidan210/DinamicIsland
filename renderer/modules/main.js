// =============================================================================
//  renderer/modules/main.js — Arranque de la interfaz
// -----------------------------------------------------------------------------
//  La página corre SIN acceso a Node: todo lo que necesita se lo pide al
//  proceso principal mediante `window.notch`, la API que define preload.js.
//
//  Cada parte de la interfaz vive en su propio módulo de esta carpeta:
//    utils.js     utilidades (animate, setText, formatos de tiempo...)
//    state.js     estado compartido (configuración, forma de la isla...)
//    island.js    formas de la isla, actividades y burbujas, clics que atraviesan
//    panel.js     abrir y cerrar el panel (clic, Esc, teclado)
//    tabs.js      las páginas (Home, Música, IA, Focus, Portapapeles, Nota)
//    clock.js     fecha y hora
//    eyes.js      los ojos
//    pomodoro.js  el Pomodoro (página, tarjeta, isla y burbuja)
//    music.js     la música (página, tarjeta, isla, burbuja y aviso)
//    colors.js    los colores de la carátula (k-means)
//    swipe.js     deslizar para cambiar de canción
//    lyrics.js    la letra sincronizada
//    outputs.js   elegir la salida de audio
//    links.js     los links
//    volume.js    la barra de volumen
//    notices.js   el centro de avisos (y los avisos en la isla)
//    battery.js   la batería
//    note.js      la nota rápida
//    theme.js     tema claro u oscuro del panel
//  Este archivo solo los pone en marcha, en orden.
// =============================================================================

import { state } from './state.js';
import { initIsland, keepAwakeFor, updateShape } from './island.js';
import { initPanel } from './panel.js';
import { initTabs, moveTabIndicator, applyTabShortcuts } from './tabs.js';
import { initClock, applyClockSettings } from './clock.js';
import { startEyes } from './eyes.js';
import { initPomodoro, renderPomodoro } from './pomodoro.js';
import { initMusic, loadInitialMedia, renderMedia, renderIslandToggle } from './music.js';
import { initLyrics, setLyrics } from './lyrics.js';
import { initOutputs, setAudioState } from './outputs.js';
import { initLinks, setLinks } from './links.js';
import { initVolume, loadInitialVolume } from './volume.js';
import { initNotices, loadInitialNotices } from './notices.js';
import { initBattery } from './battery.js';
import { initNote, loadNote } from './note.js';
import { initTheme, setTheme } from './theme.js';

const HELLO_MS = 2400; // al arrancar, la isla se ve como píldora este tiempo

/** Pide a main.js el estado de todo. Si algo falla, lo demás se carga igual. */
async function loadInitialState() {
  const requests = {
    settings: window.notch.getSettings(),
    theme: window.notch.theme.get(),
    pomodoro: window.notch.pomodoro.getState(),
    links: window.notch.links.getAll(),
    media: window.notch.media.getState(),
    lyrics: window.notch.lyrics.get(),
    audio: window.notch.audio.getState(),
    volume: window.notch.volume.getState(),
    notices: window.notch.notices.getAll(),
    note: window.notch.note.get(),
  };
  const names = Object.keys(requests);
  const results = await Promise.allSettled(Object.values(requests));
  const loaded = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      loaded[names[index]] = result.value;
    } else {
      console.warn(`No se pudo cargar "${names[index]}", uso valores por defecto:`, result.reason);
      loaded[names[index]] = null;
    }
  });
  return loaded;
}

async function init() {
  // 1. Cada módulo registra sus botones y los avisos de main.js que le tocan.
  initTheme();
  initIsland();
  initPanel();
  initTabs();
  initClock();
  initPomodoro();
  initMusic();
  initLyrics();
  initOutputs();
  initLinks();
  initVolume();
  initNotices();
  initNote();

  // Al guardar config/settings.json, se aplica al momento.
  window.notch.onSettingsChange((newSettings) => {
    state.settings = { ...state.settings, ...newSettings };
    applyClockSettings();
    applyTabShortcuts();
    renderIslandToggle();
    updateShape();
  });

  // 2. Pedimos a main.js el estado actual de todo.
  const loaded = await loadInitialState();
  if (loaded.settings) state.settings = { ...state.settings, ...loaded.settings };
  if (loaded.theme) setTheme(loaded.theme);
  if (loaded.pomodoro) state.pomodoro = loaded.pomodoro;
  if (loaded.media) loadInitialMedia(loaded.media);
  if (loaded.lyrics) setLyrics(loaded.lyrics);
  if (loaded.audio) setAudioState(loaded.audio);
  setLinks(loaded.links);
  loadInitialVolume(loaded.volume);
  loadNote(loaded.note); // si no se pudo leer, la nota queda en solo lectura

  // 3. Lo dibujamos todo.
  applyClockSettings();
  applyTabShortcuts();
  renderIslandToggle();
  renderPomodoro();
  renderMedia();
  moveTabIndicator(false);
  startEyes();

  // 4. Al arrancar se ve como píldora un momento, para que sepas que está
  //    funcionando (si hay un aviso importante, se ve el aviso).
  state.initialized = true;
  keepAwakeFor(HELLO_MS);
  loadInitialNotices(loaded.notices);
  initBattery();
}

init();
