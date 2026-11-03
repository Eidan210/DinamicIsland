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
//    pomodoro.js  el Pomodoro (página, isla y burbuja)
//    music.js     la música (página, isla, burbuja y aviso)
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
//    motion.js    animar siempre, como Windows o nunca (ajuste "animations")
//    wave.js      la ola de la barra de progreso de la música
//    beat.js      el reloj de pasos de lo que se mueve sin parar (gasta poco)
//    eq.js        las barritas del ecualizador (suaves, con muelle)
//    backdrop.js  el fondo de la página Música (manchas que se mueven despacio)
//    ai.js        Claude Code y Antigravity: isla, decisiones y página IA
//    chat.js      el chat con Claude y Gemini (página IA)
//    glow.js      el brillo de color alrededor de la isla
//    clawd.js     Clawd, la mascota (en lugar de los ojos)
//    home.js      Home: la rejilla de widgets y el modo edición
//    home-grid.js dónde cae cada widget en la rejilla de 4×2
//    clip-page.js la página Portapapeles: sus dos partes (Copiado y Bandeja)
//    clipboard.js lo que copiaste (tarjetas para volver a copiar)
//    tray.js      la bandeja de archivos y soltar archivos sobre la isla
//  Y en renderer/widgets/, un archivo por widget de Home (index.js es el catálogo).
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
import { initEq } from './eq.js';
import { initBackdrop } from './backdrop.js';
import { initLyrics, setLyrics } from './lyrics.js';
import { initOutputs, setAudioState } from './outputs.js';
import { initLinks, setLinks } from './links.js';
import { initVolume, loadInitialVolume } from './volume.js';
import { initNotices, loadInitialNotices } from './notices.js';
import { initBattery } from './battery.js';
import { initNote, loadNote } from './note.js';
import { initTheme, setTheme } from './theme.js';
import { initMotion, applyMotionSetting } from './motion.js';
import { initAi, setAiState } from './ai.js';
import { initChat, loadChat, applyChatSettings } from './chat.js';
import { initGlow } from './glow.js';
import { initClawd, scheduleBye, setClawdSleeping } from './clawd.js';
import { initClipPage } from './clip-page.js';
import { initClipboard, loadClipboard } from './clipboard.js';
import { initTray, loadTray } from './tray.js';
import { initHome, loadHome, startHome } from './home.js';
import { initLight, applyLightSettings, playLight, stopLight, testLight, LIGHT_EVENTS } from './light.js';

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
    ai: window.notch.ai.getState(),
    chat: window.notch.chat.getState(),
    clawd: window.notch.clawd.getState(),
    home: window.notch.home.get(),
    clipboard: window.notch.clipboard.getState(),
    tray: window.notch.tray.getState(),
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
  initMotion();
  initLight();
  initIsland();
  initPanel();
  initTabs();
  initClock();
  initPomodoro();
  initMusic();
  initEq();
  initBackdrop();
  initLyrics();
  initOutputs();
  initLinks();
  initVolume();
  initNotices();
  initNote();
  initChat();
  initAi();
  initGlow();
  initClawd({ keepAwakeFor });
  initClipPage();
  initClipboard();
  initTray();
  initHome(); // después de los demás: cada widget se apunta a los avisos de su módulo

  // Al guardar config/settings.json, se aplica al momento.
  window.notch.onSettingsChange((newSettings) => {
    state.settings = { ...state.settings, ...newSettings };
    applyMotionSetting();
    applyLightSettings();
    if (typeof state.settings.topGap === "number") document.documentElement.style.setProperty("--top-gap", `${state.settings.topGap}px`);
    applyClockSettings();
    applyTabShortcuts();
    renderIslandToggle();
    applyChatSettings();
    scheduleBye(); // "clawdByeTime" puede haber cambiado
    updateShape(); // (también revisa el glow y a Clawd)
  });

  // 2. Pedimos a main.js el estado actual de todo.
  const loaded = await loadInitialState();
  if (loaded.settings) state.settings = { ...state.settings, ...loaded.settings };
  applyMotionSetting();
  if (state.settings && typeof state.settings.topGap === "number") document.documentElement.style.setProperty("--top-gap", `${state.settings.topGap}px`);
  if (loaded.theme) setTheme(loaded.theme);
  if (loaded.pomodoro) state.pomodoro = loaded.pomodoro;
  if (loaded.media) loadInitialMedia(loaded.media);
  if (loaded.lyrics) setLyrics(loaded.lyrics);
  if (loaded.audio) setAudioState(loaded.audio);
  setLinks(loaded.links);
  loadInitialVolume(loaded.volume);
  loadNote(loaded.note); // si no se pudo leer, la nota queda en solo lectura
  loadChat(loaded.chat);
  if (loaded.ai) setAiState(loaded.ai);
  if (loaded.clawd) setClawdSleeping(loaded.clawd.sleeping);
  scheduleBye();
  loadClipboard(loaded.clipboard);
  loadTray(loaded.tray);
  loadHome(loaded.home); // si no se pudo leer, el Home de por defecto

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
  startHome(); // lo que ya había no brilla como novedad
  state.initialized = true;
  keepAwakeFor(HELLO_MS);
  loadInitialNotices(loaded.notices);
  initBattery();
  // 5. Escucha de teclado y portapapeles global (Fase 11)
  if (window.notch.keyboard?.onEvent) {
    window.notch.keyboard.onEvent((event) => {
      if (!event) return;
      if (event.action === 'copy') testLight('copy');
      else if (event.action === 'cut') testLight('cut');
      else if (event.action === 'paste') testLight('paste');
      else if (event.action === 'caps-lock' && event.active) testLight('shiftCaps');
      else if (event.action === 'shift' && event.down) testLight('shiftCaps');
    });
  }

  // Respaldos directos de eventos del navegador para cuando Notch tiene el foco
  window.addEventListener('copy', () => testLight('copy'), true);
  window.addEventListener('cut', () => testLight('cut'), true);
  window.addEventListener('paste', () => testLight('paste'), true);

  // Escucha de eventos de luz disparados desde backend (Fase 12: tareas, agua, etc.)
  if (window.notch.light?.onTrigger) {
    window.notch.light.onTrigger((payload) => {
      if (payload?.event) testLight(payload.event);
    });
  }
}

init();


// Para pruebas de luz en consola o scripts
window.__notchLight = { playLight, stopLight, testLight, LIGHT_EVENTS };
