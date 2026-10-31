// =============================================================================
//  renderer/app.js — Lógica de la interfaz del notch
// -----------------------------------------------------------------------------
//  Este archivo corre dentro de la página (Chromium) SIN acceso a Node.
//  Todo lo que necesita del sistema se lo pide a main.js mediante
//  `window.notch`, la API que define preload.js.
//
//  ÍNDICE
//    0. Utilidades
//    1. Elementos y estado
//    2. Clics que atraviesan la ventana
//    3. Forma de la isla (mini, píldora, actividad, aviso, panel)
//    4. Abrir y cerrar el panel
//    5. Reloj
//    6. Pestañas (indicador deslizante y transición entre vistas)
//    7. Ojos (parpadeo, mirar alrededor, seguir al ratón y emociones)
//    8. Pomodoro
//    9. Música
//   10. Links
//   11. Arranque
// =============================================================================

'use strict';

// =============================================================================
// 0. Utilidades
// =============================================================================

// Curvas de animación (las mismas que en styles.css).
const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// Si en Windows desactivas "Efectos de animación", respetamos esa preferencia.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Lanza una animación con la Web Animations API (como un @keyframes de CSS,
 * pero desde JS). No hace nada si las animaciones están desactivadas.
 * @returns {Animation | null}
 */
function animate(element, keyframes, options) {
  if (!element || reducedMotion.matches) return null;
  return element.animate(keyframes, options);
}

/** Cambia el texto solo si es distinto (cada cambio obliga a redibujar). */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/** 1499000 ms → "24:59" (cuenta atrás del Pomodoro) */
function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 83.4 s → "1:23"; 3725 s → "1:02:05" (tiempos de canciones) */
function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** plural(1, 'sesión', 'sesiones') → "1 sesión" */
function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// =============================================================================
// 1. Elementos del HTML y estado
// =============================================================================

const $ = (id) => document.getElementById(id);

const island = $('island');
const faceEl = $('face');
const eyesEl = $('eyes');
const eyeEls = document.querySelectorAll('.eye');

const dateEl = $('date');
const clockMainEl = $('clock-main');
const clockSecondsEl = $('clock-seconds');

const tabbar = $('tabbar');
const tabIndicator = $('tab-indicator');
const tabButtons = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

// Actividad en vivo (píldora ancha) y aviso de canción
const activityEl = $('activity');
const activityProgress = $('activity-progress');
const activityText = $('activity-text');
const activityArt = $('activity-art');
const bannerArt = $('banner-art');
const bannerLabel = $('banner-label');
const bannerTitle = $('banner-title');
const bannerArtist = $('banner-artist');

// Pomodoro: pestaña Focus...
const pomodoroEl = $('pomodoro');
const pomoRingWrap = $('pomo-ring-wrap');
const pomoProgress = $('pomo-progress');
const pomoTime = $('pomo-time');
const pomoLabel = $('pomo-label');
const pomoMinutes = $('pomo-minutes');
const pomoMinus = $('pomo-minus');
const pomoPlus = $('pomo-plus');
const pomoToggle = $('pomo-toggle');
const pomoToggleText = $('pomo-toggle-text');
const pomoReset = $('pomo-reset');
const pomoCount = $('pomo-count');
// ...y su tarjeta de Home
const homePomoProgress = $('home-pomo-progress');
const homePomoTime = $('home-pomo-time');
const homePomoLabel = $('home-pomo-label');
const homePomoToggle = $('home-pomo-toggle');

// Música: pestaña...
const playerEl = $('player');
const playerArtWrap = $('player-art-wrap');
const playerArt = $('player-art');
const playerArtGlow = $('player-art-glow');
const playerApp = $('player-app');
const playerTitle = $('player-title');
const playerArtist = $('player-artist');
const playerBar = $('player-bar');
const playerElapsed = $('player-elapsed');
const playerRemaining = $('player-remaining');
const mediaPrev = $('media-prev');
const mediaToggle = $('media-toggle');
const mediaNext = $('media-next');
// ...y su tarjeta de Home
const homeMusicCard = $('home-music');
const homeMusicArtWrap = $('home-music-art-wrap');
const homeMusicArt = $('home-music-art');
const homeMusicTitle = $('home-music-title');
const homeMusicArtist = $('home-music-artist');
const homeMusicToggle = $('home-music-toggle');

// Links
const linksGrid = $('links-grid');
const linksEmpty = $('links-empty');
const homeLinks = $('home-links');
const homeLinksEmpty = $('home-links-empty');

// Estado. init() lo rellena con lo que diga main.js.
let settings = {
  shortcut: 'Control+Alt+T',
  locale: 'es-ES',
  hour12: false,
  autoHide: true,
  revealOnHover: true,
  pomodoroMinutes: 25,
  musicActivity: true,
};
let isExpanded = false; // ¿el panel está abierto?
let mouseInteractive = false; // ¿le hemos pedido a main que la ventana reciba clics?
let pointerInside = false; // ¿el ratón está dentro de la zona de la ventana?
let lastPointer = { x: 0, y: 0 }; // última posición conocida del ratón
let initialized = false; // init() terminó

// =============================================================================
// 2. Clics que atraviesan la ventana
// -----------------------------------------------------------------------------
// La ventana es mucho más grande que la isla. Cuando el ratón NO está sobre la
// isla, main.js deja pasar los clics a las ventanas de abajo. Para eso le
// avisamos cada vez que el ratón entra o sale de la isla.
// (La mini-muesca tiene pointer-events: none, así que nunca "atrapa" el ratón.)
// =============================================================================

function setMouseInteractive(interactive) {
  if (interactive === mouseInteractive) return; // no mandamos mensajes repetidos
  mouseInteractive = interactive;
  window.notch.setMouseInteractive(interactive);
}

island.addEventListener('mouseenter', () => {
  setMouseInteractive(true);
  cancelSleep();
});

island.addEventListener('mouseleave', () => {
  setMouseInteractive(false);
  if (shape === 'banner') updateShape(); // si el aviso ya caducó, ahora sí se va
});

// Cuando la isla termina de cambiar de forma, puede que el cursor (quieto) haya
// quedado dentro o fuera: lo comprobamos de nuevo.
island.addEventListener('transitionend', (event) => {
  if (event.target !== island) return;
  if (['height', 'width', 'translate'].includes(event.propertyName)) {
    setMouseInteractive(shape !== 'mini' && island.matches(':hover'));
  }
});

// =============================================================================
// 3. Forma de la isla
// -----------------------------------------------------------------------------
//   mini      → muesca pequeña pegada arriba: no hay nada que contar
//   pill      → píldora normal: al pasar el ratón por la mini (o al arrancar)
//   activity  → píldora ancha con información en vivo (Pomodoro, música)
//   banner    → aviso grande unos segundos (canción nueva)
//   expanded  → el panel abierto
// computeShape() decide la forma a partir del estado; updateShape() la aplica.
// =============================================================================

const SHAPE_ORDER = ['mini', 'pill', 'activity', 'banner', 'expanded']; // de menor a mayor
const WAKE_DELAY = 200; // ms con el ratón sobre la mini-muesca para que se despierte
const SLEEP_DELAY = 800; // ms que espera antes de volver a encogerse cuando te alejas
const WAKE_MARGIN = 8; // px alrededor de la mini-muesca que también cuentan
const NEAR_DISTANCE = 28; // px alrededor de la píldora que cuentan como "cerca"
const HELLO_MS = 2400; // al arrancar se ve como píldora este tiempo
const BANNER_MS = 4000; // duración del aviso de canción nueva

let shape = 'mini';
let awake = false; // ¿la despertaste pasando el ratón?
let keepAwakeUntil = 0; // saludo al arrancar
let bannerUntil = 0; // aviso de canción nueva
let wakeTimer = null;
let sleepTimer = null;
let shapeTimer = null;

/** ¿Qué actividad en vivo hay ahora? (por prioridad) */
function getActivity() {
  if (Date.now() < celebrateUntil) return 'pomodoro';
  if (pomodoro.status === 'running' || pomodoro.status === 'paused') return 'pomodoro';
  // Al cambiar de canción, algunas apps pasan un instante por "changing": la
  // actividad aguanta 1,5 s para no parpadear.
  const musicOn = isPlaying() || Date.now() < musicGraceUntil;
  if (settings.musicActivity && musicOn && media.title) return 'music';
  return null;
}

function computeShape() {
  const now = Date.now();
  if (isExpanded) return 'expanded';
  if (now < bannerUntil || (shape === 'banner' && mouseInteractive)) return 'banner';
  if (getActivity()) return 'activity';
  if (awake || now < keepAwakeUntil || !settings.autoHide) return 'pill';
  return 'mini';
}

function updateShape() {
  const next = computeShape();
  const activity = getActivity();
  activityEl.dataset.kind = activity || '';
  activityEl.dataset.status = Date.now() < celebrateUntil ? 'finished' : pomodoro.status;

  if (next !== shape) {
    const previous = shape;
    shape = next;
    // Al crecer usamos una curva con rebote; al encoger, una suave (ver styles.css).
    island.dataset.motion = SHAPE_ORDER.indexOf(next) > SHAPE_ORDER.indexOf(previous) ? 'grow' : 'shrink';
    island.dataset.shape = next; // ← esto dispara la animación CSS
    if (previous === 'mini') {
      if (pointerInside) lookAt(lastPointer.x, lastPointer.y);
      wakeEyes();
    }
    if (next === 'mini') {
      setMouseInteractive(false); // la mini deja pasar los clics
      resetLook();
    }
  }

  updateMood();
  scheduleShapeTimer();
  updatePomodoroTicker();
  updateMediaTicker();
}

/** Revisa la forma justo cuando caduque el saludo, el aviso o la celebración. */
function scheduleShapeTimer() {
  clearTimeout(shapeTimer);
  const now = Date.now();
  const upcoming = [keepAwakeUntil, bannerUntil, celebrateUntil, musicGraceUntil].filter((time) => time > now);
  if (upcoming.length) shapeTimer = setTimeout(updateShape, Math.min(...upcoming) - now + 20);
}

function wake() {
  cancelWake();
  cancelSleep();
  awake = true;
  updateShape();
}

function scheduleSleep(delay = SLEEP_DELAY) {
  if (!awake) return;
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(goToSleep, delay);
}

function goToSleep() {
  sleepTimer = null;
  if (mouseInteractive) return; // tienes el ratón encima: espera
  awake = false;
  updateShape();
}

function cancelSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = null;
}

function cancelWake() {
  clearTimeout(wakeTimer);
  wakeTimer = null;
}

/** ¿Está el ratón sobre la mini-muesca (o justo al lado)? */
function isOverMini(x, y) {
  const rect = island.getBoundingClientRect();
  return x >= rect.left - WAKE_MARGIN && x <= rect.right + WAKE_MARGIN && y <= rect.bottom + WAKE_MARGIN / 2;
}

/** ¿Está el ratón encima de la isla o muy cerca? */
function isNearIsland(x, y) {
  const rect = island.getBoundingClientRect();
  return x >= rect.left - NEAR_DISTANCE && x <= rect.right + NEAR_DISTANCE && y <= rect.bottom + NEAR_DISTANCE;
}

// Solo recibimos movimientos cuando el ratón pasa por la zona de la ventana
// (820x318 px arriba en el centro); el resto de la pantalla no nos llega.
document.addEventListener('mousemove', (event) => {
  pointerInside = true;
  const x = event.clientX;
  const y = event.clientY;
  lastPointer = { x, y };
  if (shape !== 'mini') lookAt(x, y);

  if (shape === 'mini') {
    // Si el ratón se queda un instante sobre la mini-muesca, se despierta.
    if (settings.revealOnHover && isOverMini(x, y)) {
      if (!wakeTimer) wakeTimer = setTimeout(wake, WAKE_DELAY);
    } else {
      cancelWake();
    }
  } else if (awake) {
    if (isNearIsland(x, y)) cancelSleep(); // sigues cerca: que no se encoja
    else if (!sleepTimer) scheduleSleep(); // te alejaste: se encoge en un momento
  }
});

// El ratón salió de la ventana entera (relatedTarget vacío = fuera de la página).
document.addEventListener('mouseout', (event) => {
  if (event.relatedTarget) return;
  pointerInside = false;
  cancelWake();
  resetLook();
  scheduleSleep();
});

// =============================================================================
// 4. Abrir y cerrar el panel
// -----------------------------------------------------------------------------
// Quien decide si el panel está abierto es main.js (porque el atajo global y el
// "clic fuera" ocurren allí). Nosotros solo pedimos cambios y animamos.
// =============================================================================

// Clic en la isla → abrir. Si muestra una actividad, se abre en su pestaña.
island.addEventListener('click', () => {
  if (isExpanded) return;
  const activity = getActivity();
  if (shape === 'banner' || (shape === 'activity' && activity === 'music')) showTab('music');
  else if (shape === 'activity' && activity === 'pomodoro') showTab('focus');
  window.notch.expand();
});

// Clic derecho → menú con Pomodoro, música y "Salir de Notch".
island.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.notch.showContextMenu();
});

// Teclado (solo con el panel abierto): Esc cierra, ← → cambian de pestaña.
document.addEventListener('keydown', (event) => {
  if (!isExpanded) return;
  if (event.key === 'Escape') window.notch.collapse();
  else if (event.key === 'ArrowRight') showTabByOffset(1);
  else if (event.key === 'ArrowLeft') showTabByOffset(-1);
});

// main.js nos avisa de cada cambio (atajo, Esc, clic fuera, clic en la isla...).
window.notch.onExpandedChange((expanded) => {
  isExpanded = expanded;
  cancelWake();

  if (expanded) {
    cancelSleep();
    bannerUntil = 0; // si había un aviso, el panel lo sustituye
    moveTabIndicator(false);
    renderPomodoro();
    renderMediaProgress();
    startClock();
    popEyes();
  } else {
    stopClock(); // con el panel cerrado el reloj no se ve: no gastamos nada
    // Quitamos el foco del botón pulsado, para que no quede marcado al reabrir.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // Si el ratón sigue cerca, se queda como píldora hasta que te alejes.
    awake = pointerInside;
    scheduleSleep();
  }
  updateShape();
});

// =============================================================================
// 5. Fecha y hora en vivo
// -----------------------------------------------------------------------------
// Solo corre con el panel abierto. Se actualiza una vez por segundo, justo
// cuando cambia el segundo (así nunca va "atrasado" medio segundo).
// =============================================================================

let dateFormatter = null;
let timeFormatter = null;
let clockTimer = null;

/** Crea los formateadores de fecha/hora (una sola vez: crearlos es lo caro). */
function createFormatters() {
  const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: settings.hour12 };
  try {
    dateFormatter = new Intl.DateTimeFormat(settings.locale, dateOptions);
    timeFormatter = new Intl.DateTimeFormat(settings.locale, timeOptions);
  } catch {
    // Un "locale" mal escrito en settings.json (p. ej. "es_ES") lanza error.
    console.warn(`Idioma no válido en settings.json: "${settings.locale}". Uso es-ES.`);
    dateFormatter = new Intl.DateTimeFormat('es-ES', dateOptions);
    timeFormatter = new Intl.DateTimeFormat('es-ES', timeOptions);
  }
}

function renderClock() {
  const now = new Date();

  // "sábado, 31 de octubre" → "Sábado, 31 de octubre"
  setText(dateEl, capitalize(dateFormatter.format(now)));

  // formatToParts separa horas, minutos, segundos y a. m./p. m. para poder
  // pintar los segundos más tenues que la hora.
  const parts = {};
  for (const part of timeFormatter.formatToParts(now)) parts[part.type] = part.value;

  setText(clockMainEl, `${parts.hour}:${parts.minute}`);
  setText(clockSecondsEl, `:${parts.second}` + (parts.dayPeriod ? ` ${parts.dayPeriod}` : ''));
}

function startClock() {
  stopClock();
  const tick = () => {
    renderClock();
    // Esperamos justo hasta el siguiente cambio de segundo (1 vez por segundo).
    clockTimer = setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

function stopClock() {
  clearTimeout(clockTimer);
  clockTimer = null;
}

// =============================================================================
// 6. Pestañas (Home, Música, Focus, Claude)
// =============================================================================

const TAB_ORDER = ['home', 'music', 'focus', 'claude'];
let currentTab = 'home';

function getView(name) {
  return document.querySelector(`.view[data-view="${name}"]`);
}

function showTab(name) {
  if (!TAB_ORDER.includes(name)) return;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  moveTabIndicator(isExpanded);
  if (name === currentTab) return;

  const previousTab = currentTab;
  currentTab = name;
  const oldView = getView(previousTab);
  const newView = getView(name);
  oldView.classList.remove('is-active');
  newView.classList.add('is-active');
  if (!isExpanded) return; // con el panel cerrado no hace falta animar

  // La vista nueva entra por el lado hacia el que avanzas y la vieja sale por
  // el contrario (como pasar páginas).
  const direction = TAB_ORDER.indexOf(name) > TAB_ORDER.indexOf(previousTab) ? 1 : -1;
  animate(
    newView,
    [
      { opacity: 0, transform: `translateX(${30 * direction}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    { duration: 420, easing: SPRING }
  );
  animate(
    oldView,
    [
      // visibility: 'visible' mantiene la vista vieja a la vista mientras se va
      { opacity: 1, transform: 'translateX(0)', visibility: 'visible' },
      { opacity: 0, transform: `translateX(${-30 * direction}px)`, visibility: 'visible' },
    ],
    { duration: 200, easing: 'ease-in' }
  );
}

/** Pestaña siguiente (+1) o anterior (-1), dando la vuelta al llegar al final. */
function showTabByOffset(offset) {
  const index = (TAB_ORDER.indexOf(currentTab) + offset + TAB_ORDER.length) % TAB_ORDER.length;
  showTab(TAB_ORDER[index]);
}

/** Coloca el fondo deslizante debajo de la pestaña activa. */
function moveTabIndicator(withAnimation) {
  const activeButton = tabbar.querySelector('.tab.is-active');
  if (!activeButton) return;
  tabIndicator.classList.toggle('no-animation', !withAnimation);
  tabIndicator.style.setProperty('--indicator-x', `${activeButton.offsetLeft}px`);
  tabIndicator.style.setProperty('--indicator-width', `${activeButton.offsetWidth}px`);
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});

// Las tarjetas de Home llevan a su pestaña.
document.querySelectorAll('.card[data-goto]').forEach((card) => {
  card.addEventListener('click', () => showTab(card.dataset.goto));
});

// =============================================================================
// 7. Ojos
// -----------------------------------------------------------------------------
// Todo son animaciones cortas lanzadas de vez en cuando: nada se anima en
// bucle infinito (eso tendría a la GPU dibujando todo el rato).
// =============================================================================

/** Un parpadeo (a veces doble). */
function blink() {
  const times = Math.random() < 0.2 ? 2 : 1;
  eyeEls.forEach((eye) => {
    animate(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }], {
      duration: 180,
      iterations: times,
      easing: 'ease-in-out',
    });
  });
}

function scheduleBlink() {
  const delay = 2500 + Math.random() * 3500; // entre 2,5 y 6 segundos
  setTimeout(() => {
    if (shape !== 'banner') blink(); // en el aviso los ojos no se ven
    scheduleBlink();
  }, delay);
}

/** Al despertar, los ojos se abren como si el notch se levantara. */
function wakeEyes() {
  eyeEls.forEach((eye) => {
    animate(
      eye,
      [{ transform: 'scaleY(0.1)' }, { transform: 'scaleY(0.1)', offset: 0.4 }, { transform: 'scaleY(1)' }],
      { duration: 520, easing: SPRING_POP }
    );
  });
}

/** Al abrir el panel, los ojos dan un pequeño salto de alegría. */
function popEyes() {
  animate(eyesEl, [{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
}

/** Los ojos miran hacia el ratón (como mucho 3,5 px a los lados y 2,5 px arriba/abajo). */
function lookAt(x, y) {
  const rect = faceEl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  const strength = Math.min(1, distance / 140); // cerca del centro se mueven menos
  eyesEl.style.setProperty('--look-x', `${((dx / distance) * strength * 3.5).toFixed(2)}px`);
  eyesEl.style.setProperty('--look-y', `${((dy / distance) * strength * 2.5).toFixed(2)}px`);
}

function resetLook() {
  eyesEl.style.setProperty('--look-x', '0px');
  eyesEl.style.setProperty('--look-y', '0px');
}

/** De vez en cuando, si no tienes el ratón cerca, mira a un lado y a otro. */
function glance() {
  const side = Math.random() < 0.5 ? -1 : 1;
  animate(
    eyesEl,
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${3.5 * side}px)`, offset: 0.2 },
      { transform: `translateX(${3.5 * side}px)`, offset: 0.45 },
      { transform: `translateX(${-3.5 * side}px)`, offset: 0.6 },
      { transform: `translateX(${-3.5 * side}px)`, offset: 0.85 },
      { transform: 'translateX(0)' },
    ],
    { duration: 2200, easing: 'ease-in-out' }
  );
}

function scheduleGlance() {
  setTimeout(() => {
    if (shape !== 'mini' && shape !== 'banner' && !pointerInside) glance();
    scheduleGlance();
  }, 8000 + Math.random() * 7000); // entre 8 y 15 segundos
}

/** Expresión según lo que pasa: feliz al terminar un Pomodoro, concentrada durante. */
function updateMood() {
  const celebrating = Date.now() < celebrateUntil;
  faceEl.classList.toggle('is-happy', celebrating);
  faceEl.classList.toggle('is-focused', !celebrating && pomodoro.status === 'running');
}

// =============================================================================
// 8. Pomodoro
// -----------------------------------------------------------------------------
// El temporizador "de verdad" vive en main.js. Aquí solo lo dibujamos en tres
// sitios: la pestaña Focus, la tarjeta de Home y la píldora (actividad en vivo).
// Con `endsAt` calculamos el tiempo restante nosotros mismos, sin preguntar.
// =============================================================================

const POMODORO_LABELS = { idle: 'Listo', running: 'Enfocado', paused: 'En pausa', finished: '¡Hecho!' };
const POMODORO_BUTTON = { idle: 'Iniciar', running: 'Pausar', paused: 'Seguir', finished: 'Otra vez' };
const STEP_MINUTES = 5;
const MAX_MINUTES = 180;
const CELEBRATION_MS = 5000;

let pomodoro = {
  status: 'idle',
  durationMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  endsAt: null,
  minutes: 25,
  completedToday: 0,
};
let pomodoroTicker = null;
let celebrateUntil = 0;

function getRemainingMs(state = pomodoro) {
  if (state.status === 'running' && state.endsAt) return Math.max(0, state.endsAt - Date.now());
  return state.remainingMs;
}

/** Cuánto llevas, de 0 (nada) a 1 (terminado). */
function getProgress(state = pomodoro) {
  if (state.status === 'finished') return 1;
  if (!state.durationMs) return 0;
  return Math.min(1, Math.max(0, 1 - getRemainingMs(state) / state.durationMs));
}

/** main.js nos manda el estado nuevo cada vez que cambia. */
function onPomodoroState(state) {
  const previous = pomodoro;
  pomodoro = state;
  // Si el progreso salta (reinicio, cambio de duración...), el anillo se anima.
  const jumped = Math.abs(getProgress(previous) - getProgress(state)) > 0.02;
  renderPomodoro({ animateRings: jumped });
  if (previous.status === 'running' && state.status === 'finished') celebrate();
  updateShape();
}

/** Dibuja el Pomodoro completo (textos, botones y anillos). */
function renderPomodoro({ animateRings = false } = {}) {
  const { status } = pomodoro;
  const time = formatCountdown(getRemainingMs());
  const label = POMODORO_LABELS[status] || '';
  const running = status === 'running';
  const locked = running || status === 'paused'; // a mitad de sesión no se cambia la duración

  // Pestaña Focus
  pomodoroEl.dataset.status = status;
  setText(pomoTime, time);
  setText(pomoLabel, label);
  setText(pomoMinutes, `${pomodoro.minutes} min`);
  setText(pomoCount, `${plural(pomodoro.completedToday, 'sesión', 'sesiones')} hoy`);
  setText(pomoToggleText, POMODORO_BUTTON[status] || 'Iniciar');
  pomoToggle.dataset.running = String(running);
  pomoToggle.classList.toggle('is-running', running);
  pomoReset.disabled = status === 'idle';
  pomoMinus.disabled = locked || pomodoro.minutes <= STEP_MINUTES;
  pomoPlus.disabled = locked || pomodoro.minutes >= MAX_MINUTES;

  // Tarjeta de Home
  setText(homePomoTime, time);
  setText(homePomoLabel, label);
  homePomoToggle.dataset.running = String(running);
  homePomoToggle.setAttribute('aria-label', running ? 'Pausar Pomodoro' : 'Iniciar Pomodoro');

  // Píldora
  setText(activityText, status === 'finished' ? '¡Listo!' : time);

  setRings(getProgress(), animateRings);
}

/** Lo único que cambia cada segundo: el tiempo y los anillos. */
function renderPomodoroTick() {
  const time = formatCountdown(getRemainingMs());
  setText(pomoTime, time);
  setText(homePomoTime, time);
  setText(activityText, time);
  setRings(getProgress(), false);
}

function setRings(progress, withAnimation) {
  [pomoProgress, homePomoProgress, activityProgress].forEach((ring) => setRing(ring, progress, withAnimation));
}

/**
 * Pinta un anillo de progreso. Gracias a pathLength="100" en el HTML,
 * stroke-dashoffset 100 = vacío y 0 = completo.
 */
function setRing(circle, progress, withAnimation) {
  const offset = 100 * (1 - progress);
  const previousOffset = Number(circle.dataset.offset ?? 100);
  circle.dataset.offset = String(offset);
  circle.style.strokeDashoffset = String(offset);

  if (withAnimation && Math.abs(previousOffset - offset) > 1) {
    circle.classList.remove('is-empty');
    const animation = animate(circle, [{ strokeDashoffset: previousOffset }, { strokeDashoffset: offset }], {
      duration: 750,
      easing: SPRING,
    });
    if (animation) {
      // Al terminar, si se quedó a 0 %, ocultamos el puntito que dejaría.
      animation.onfinish = () => circle.classList.toggle('is-empty', Number(circle.dataset.offset) >= 99.9);
      return;
    }
  }
  circle.classList.toggle('is-empty', progress <= 0.001);
}

/**
 * Cuenta atrás en pantalla. Solo funciona si el Pomodoro está en marcha Y se
 * ve (panel abierto o píldora con la actividad): si no se ve, no gasta nada.
 */
function updatePomodoroTicker() {
  const visible = isExpanded || (shape === 'activity' && getActivity() === 'pomodoro');
  if (pomodoro.status !== 'running' || !visible) {
    clearTimeout(pomodoroTicker);
    pomodoroTicker = null;
    return;
  }
  if (pomodoroTicker) return; // ya está en marcha

  const tick = () => {
    renderPomodoroTick();
    const remaining = getRemainingMs();
    if (remaining <= 0) {
      pomodoroTicker = null; // main.js nos avisará de que terminó
      return;
    }
    // Esperamos justo hasta que cambie el segundo de la cuenta atrás (+20 ms de margen).
    pomodoroTicker = setTimeout(tick, (remaining % 1000 || 1000) + 20);
  };
  tick();
}

/** ¡Pomodoro terminado! Ojos felices, rebote y destello verde. */
function celebrate() {
  celebrateUntil = Date.now() + CELEBRATION_MS;
  updateShape(); // la isla muestra "¡Listo!" aunque estuviera encogida

  animate(island, [{ scale: '1' }, { scale: '1.12' }, { scale: '0.97' }, { scale: '1' }], {
    duration: 650,
    delay: 300,
    easing: 'ease-out',
  });
  animate(
    island,
    [{ boxShadow: '0 0 0 0 rgba(61, 255, 143, 0.6)' }, { boxShadow: '0 0 0 18px rgba(61, 255, 143, 0)' }],
    { duration: 1000, delay: 300, iterations: 2 }
  );
  if (isExpanded) {
    animate(pomoRingWrap, [{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 600, easing: SPRING_POP });
  }
}

function togglePomodoro() {
  if (pomodoro.status === 'running') window.notch.pomodoro.pause();
  else window.notch.pomodoro.start();
}

/** Botones − / +: de 5 en 5 minutos (entre 5 y 180). */
function changeMinutes(direction) {
  const current = pomodoro.minutes;
  const next =
    direction > 0
      ? Math.floor(current / STEP_MINUTES) * STEP_MINUTES + STEP_MINUTES
      : Math.ceil(current / STEP_MINUTES) * STEP_MINUTES - STEP_MINUTES;
  window.notch.pomodoro.setMinutes(Math.min(MAX_MINUTES, Math.max(STEP_MINUTES, next)));
  // El número entra desde arriba o desde abajo, según subas o bajes.
  animate(
    pomoMinutes,
    [
      { transform: `translateY(${direction > 0 ? 7 : -7}px)`, opacity: 0.2 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 280, easing: SPRING }
  );
}

pomoToggle.addEventListener('click', togglePomodoro);
pomoReset.addEventListener('click', () => window.notch.pomodoro.reset());
pomoMinus.addEventListener('click', () => changeMinutes(-1));
pomoPlus.addEventListener('click', () => changeMinutes(1));
homePomoToggle.addEventListener('click', (event) => {
  event.stopPropagation(); // que no cuente también como clic en la tarjeta
  togglePomodoro();
});

// =============================================================================
// 9. Música
// -----------------------------------------------------------------------------
// main.js nos pasa lo que cuenta el helper en C#: título, artista, estado,
// posición, duración y (solo cuando cambia) la carátula.
//
// La posición llega "a saltos" (las apps solo la actualizan de vez en cuando),
// así que guardamos la última posición y el momento en que se midió
// (timestamp) y, mientras suena, calculamos nosotros la actual:
//     posición ahora = posición + (ahora - timestamp) × velocidad
// =============================================================================

const MEDIA_MESSAGES = {
  starting: ['Conectando…', 'Buscando qué suena en Windows'],
  missing: ['Falta el helper de música', 'Compílalo con: npm run build:helper'],
  unsupported: ['Solo en Windows', 'La música se lee de la sesión multimedia de Windows'],
  error: ['El helper de música se cerró', 'Reintentando…'],
  empty: ['Nada sonando', 'Reproduce algo en Apple Music o en cualquier app'],
};

let media = {
  available: 'starting',
  status: 'none',
  title: '',
  artist: '',
  album: '',
  appName: '',
  position: 0,
  duration: 0,
  rate: 1,
  timestamp: 0,
  canPlayPause: false,
  canNext: false,
  canPrevious: false,
  canSeek: false,
};
let mediaArt = null; // carátula actual ("data URL") o null
let mediaTicker = null;
let skipDirection = 0; // +1 siguiente / -1 anterior: para animar la carátula hacia ese lado
let skipUntil = 0;
let musicGraceUntil = 0; // la actividad de música aguanta un momento al dejar de sonar
let lastBannerKey = ''; // última canción anunciada con el aviso "Ahora suena"
const MUSIC_GRACE_MS = 1500;

function isPlaying() {
  return media.status === 'playing';
}

/** ¿Hay algo cargado en alguna app (sonando o en pausa)? */
function hasTrack() {
  return media.available === 'ok' && Boolean(media.title) && !['none', 'closed'].includes(media.status);
}

/** "Título|Artista|Álbum": para saber si cambió la canción. */
function trackKey(state) {
  return state.title ? `${state.title}|${state.artist}|${state.album}` : '';
}

/** Posición actual en segundos, interpolada mientras suena. */
function getMediaPosition() {
  let position = media.position;
  if (isPlaying()) position += ((Date.now() - media.timestamp) / 1000) * (media.rate || 1);
  return media.duration > 0 ? Math.min(Math.max(position, 0), media.duration) : Math.max(position, 0);
}

/** main.js nos manda el estado nuevo cada vez que algo cambia. */
function onMediaState(state) {
  const previousKey = trackKey(media);
  const wasPlaying = isPlaying();
  const { art, ...rest } = state;
  media = { ...media, ...rest };
  if ('art' in state) setMediaArt(art);
  if (wasPlaying && !isPlaying()) musicGraceUntil = Date.now() + MUSIC_GRACE_MS;

  const key = trackKey(media);
  renderMedia({ trackChanged: key !== previousKey });

  // Suena una canción que aún no hemos anunciado → aviso "Ahora suena", como
  // la isla dinámica. (Comparamos con la última anunciada y no con el estado
  // anterior porque entre canciones algunas apps pasan por "changing".)
  if (key && isPlaying() && key !== lastBannerKey) {
    lastBannerKey = key;
    if (initialized && settings.musicActivity && !isExpanded) bannerUntil = Date.now() + BANNER_MS;
  }
  updateShape();
}

function setMediaArt(dataUrl) {
  mediaArt = dataUrl || null;
  for (const img of [playerArt, playerArtGlow, homeMusicArt, activityArt, bannerArt]) {
    if (mediaArt) img.src = mediaArt;
    else img.removeAttribute('src');
  }
  playerEl.dataset.hasArt = String(Boolean(mediaArt));
  homeMusicCard.dataset.hasArt = String(Boolean(mediaArt));
  updateMusicAccent();
}

/** Dibuja la música en la pestaña, la tarjeta de Home y el aviso. */
function renderMedia({ trackChanged = false } = {}) {
  const track = hasTrack();
  const playing = isPlaying();
  const state = media.available !== 'ok' ? media.available : track ? 'ok' : 'empty';
  const [emptyTitle, emptyHint] = MEDIA_MESSAGES[state] || MEDIA_MESSAGES.empty;
  const subtitle = [media.artist, media.album].filter(Boolean).join(' — ');

  // Pestaña Música
  playerEl.dataset.state = state;
  playerEl.dataset.playing = String(playing);
  playerEl.dataset.canSeek = String(media.canSeek && media.duration > 0);
  setText(playerApp, media.appName || 'Música');
  setText(playerTitle, track ? media.title : emptyTitle);
  setText(playerArtist, track ? subtitle : emptyHint);
  mediaToggle.dataset.running = String(playing);
  mediaToggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  mediaToggle.disabled = !media.canPlayPause;
  mediaPrev.disabled = !media.canPrevious;
  mediaNext.disabled = !media.canNext;

  // Tarjeta de Home
  homeMusicCard.dataset.playing = String(playing);
  setText(homeMusicTitle, track ? media.title : 'Nada sonando');
  setText(homeMusicArtist, track ? media.artist || media.appName : 'Apple Music o cualquier app');
  homeMusicToggle.hidden = !track || !media.canPlayPause;
  homeMusicToggle.dataset.running = String(playing);

  // Aviso "Ahora suena"
  setText(bannerLabel, media.appName ? `Ahora suena · ${media.appName}` : 'Ahora suena');
  setText(bannerTitle, media.title);
  setText(bannerArtist, media.artist);

  renderMediaProgress();
  if (trackChanged && track) animateTrackChange();
}

/** Barra de progreso y tiempos (lo único que cambia cada segundo). */
function renderMediaProgress() {
  const duration = media.duration;
  const position = getMediaPosition();
  playerBar.style.setProperty('--progress', duration > 0 ? (position / duration).toFixed(4) : '0');
  setText(playerElapsed, formatTime(position));
  setText(playerRemaining, duration > 0 ? `-${formatTime(duration - position)}` : '');
}

/** La barra avanza una vez por segundo, solo con el panel abierto y mientras suena. */
function updateMediaTicker() {
  if (!isPlaying() || !isExpanded) {
    clearTimeout(mediaTicker);
    mediaTicker = null;
    return;
  }
  if (mediaTicker) return; // ya está en marcha

  const tick = () => {
    renderMediaProgress();
    // Esperamos justo hasta que cambie el segundo de la canción (+20 ms de margen).
    const msToNextSecond = ((1 - (getMediaPosition() % 1)) * 1000) / (media.rate || 1);
    mediaTicker = setTimeout(tick, msToNextSecond + 20);
  };
  tick();
}

/** Canción nueva: la carátula llega desde el lado del botón que pulsaste. */
function animateTrackChange() {
  const direction = Date.now() < skipUntil ? skipDirection : 0;
  skipDirection = 0;
  const from = direction ? `translateX(${direction * 28}px) scale(0.92)` : 'scale(0.86)';
  animate(playerArtWrap, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], {
    duration: 560,
    easing: SPRING_POP,
  });
  animate(playerTitle, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
    duration: 400,
    delay: 60,
    easing: SPRING,
  });
  animate(playerArtist, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
    duration: 400,
    delay: 110,
    easing: SPRING,
  });
  animate(homeMusicArtWrap, [{ opacity: 0, scale: '0.7' }, { opacity: 1, scale: '1' }], {
    duration: 480,
    easing: SPRING_POP,
  });
}

/**
 * Saca el color "protagonista" de la carátula: la dibujamos en un canvas de
 * 16x16 y promediamos sus píxeles, dando más peso a los colores vivos que a
 * los grises. Ese color tiñe las barras, la barra de progreso y el brillo.
 */
function updateMusicAccent() {
  const root = document.documentElement;
  if (!mediaArt) {
    root.style.removeProperty('--music-accent');
    return;
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      const weight = (max - min) / 255 + 0.05; // cuanto más vivo el color, más cuenta
      r += pixels[i] * weight;
      g += pixels[i + 1] * weight;
      b += pixels[i + 2] * weight;
      total += weight;
    }
    root.style.setProperty('--music-accent', vividColor(r / total, g / total, b / total));
  };
  image.src = mediaArt;
}

/** Convierte un color RGB en una versión viva y clara (para que se vea sobre negro). */
function vividColor(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r / 255) hue = ((g - b) / 255 / delta) % 6;
    else if (max === g / 255) hue = (b - r) / 255 / delta + 2;
    else hue = (r - g) / 255 / delta + 4;
  }
  hue = Math.round(hue * 60 + 360) % 360;
  // Carátulas casi grises (blanco y negro) → el verde de siempre.
  if (delta < 0.08) return '#3dff8f';
  return `hsl(${hue} 85% 66%)`;
}

/** Al pulsar play/pausa cambiamos el botón al momento; el helper lo confirma enseguida. */
function toggleMediaOptimistic() {
  if (!media.canPlayPause) return;
  media.position = getMediaPosition();
  media.timestamp = Date.now();
  media.status = isPlaying() ? 'paused' : 'playing';
  window.notch.media.toggle();
  renderMedia();
  updateShape();
}

function skipTrack(direction) {
  skipDirection = direction;
  skipUntil = Date.now() + 4000;
  if (direction > 0) window.notch.media.next();
  else window.notch.media.previous();
}

mediaToggle.addEventListener('click', toggleMediaOptimistic);
mediaNext.addEventListener('click', () => skipTrack(1));
mediaPrev.addEventListener('click', () => skipTrack(-1));
homeMusicToggle.addEventListener('click', (event) => {
  event.stopPropagation(); // que no cuente también como clic en la tarjeta
  toggleMediaOptimistic();
});

// Clic en la barra de progreso → saltar a ese punto (si la app lo permite).
playerBar.addEventListener('click', (event) => {
  if (!media.canSeek || media.duration <= 0) return;
  const rect = playerBar.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  media.position = fraction * media.duration;
  media.timestamp = Date.now();
  renderMediaProgress();
  window.notch.media.seek(media.position);
});

// =============================================================================
// 10. Links
// -----------------------------------------------------------------------------
// main.js nos manda nombre, inicial y color de cada link (no las urls): para
// abrir uno le decimos su número y main.js lo abre en tu navegador.
// =============================================================================

const HOME_LINKS_MAX = 6; // círculos que caben en la tarjeta de Home
let links = [];

function renderLinks() {
  // Pestaña Focus: todos
  linksGrid.replaceChildren(...links.map((link, index) => createLinkButton(link, index)));
  linksEmpty.hidden = links.length > 0;

  // Tarjeta de Home: hasta 6. Si hay más, el último hueco es "+N".
  const visible = links.length > HOME_LINKS_MAX ? links.slice(0, HOME_LINKS_MAX - 1) : links;
  const items = visible.map((link, index) => createMiniLink(link, index));
  if (links.length > HOME_LINKS_MAX) items.push(createMoreChip(links.length - visible.length));
  homeLinks.replaceChildren(...items);
  homeLinksEmpty.hidden = links.length > 0;
}

/** Botón redondo grande con la inicial y el nombre debajo (pestaña Focus). */
function createLinkButton(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-btn';
  button.title = `${link.name} · ${link.host}`;
  paintLink(button, link, index);

  const circle = document.createElement('span');
  circle.className = 'link-circle';
  circle.textContent = link.initial; // textContent (no innerHTML): nunca ejecuta nada
  const name = document.createElement('span');
  name.className = 'link-name';
  name.textContent = link.name;
  button.append(circle, name);

  button.addEventListener('click', () => openLink(index, circle));
  return button;
}

/** Círculo pequeño (tarjeta de Home). */
function createMiniLink(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-link';
  button.title = `${link.name} · ${link.host}`;
  button.textContent = link.initial;
  paintLink(button, link, index);
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente también como clic en la tarjeta
    openLink(index, button);
  });
  return button;
}

/** "+3": al pulsarlo, la tarjeta te lleva a Focus, donde están todos. */
function createMoreChip(count) {
  const chip = document.createElement('span');
  chip.className = 'mini-link more';
  chip.textContent = `+${count}`;
  chip.style.setProperty('--i', String(HOME_LINKS_MAX - 1));
  return chip;
}

/** Color, color del texto y posición (para la entrada en cascada) como variables CSS. */
function paintLink(element, link, index) {
  element.style.setProperty('--link-color', link.color);
  element.style.setProperty('--link-text', link.textColor);
  element.style.setProperty('--i', String(index));
}

function openLink(index, circle) {
  animate(circle, [{ scale: '1' }, { scale: '0.85' }, { scale: '1.15' }, { scale: '1' }], {
    duration: 420,
    easing: 'ease-out',
  });
  window.notch.links.open(index);
}

// =============================================================================
// 11. Arranque
// =============================================================================

/** Aplica la configuración (al arrancar y cada vez que guardas settings.json). */
function applySettings() {
  createFormatters();
  if (isExpanded) renderClock();
  updateShape();
}

// Avisos de main.js (se registran ya, antes de que termine init()).
window.notch.onSettingsChange((newSettings) => {
  settings = { ...settings, ...newSettings };
  applySettings();
});
window.notch.pomodoro.onChange(onPomodoroState);
window.notch.media.onChange(onMediaState);
window.notch.links.onChange((newLinks) => {
  links = Array.isArray(newLinks) ? newLinks : [];
  renderLinks();
});
window.notch.onShowTab((name) => showTab(name));

async function init() {
  try {
    const [savedSettings, pomodoroState, savedLinks, mediaState] = await Promise.all([
      window.notch.getSettings(),
      window.notch.pomodoro.getState(),
      window.notch.links.getAll(),
      window.notch.media.getState(),
    ]);
    if (savedSettings) settings = { ...settings, ...savedSettings };
    if (pomodoroState) pomodoro = pomodoroState;
    if (Array.isArray(savedLinks)) links = savedLinks;
    if (mediaState) {
      const { art, ...rest } = mediaState;
      media = { ...media, ...rest };
      setMediaArt(art);
      lastBannerKey = trackKey(media); // lo que ya sonaba no se anuncia otra vez
    }
  } catch (error) {
    console.warn('No se pudo cargar el estado inicial, uso valores por defecto:', error);
  }

  createFormatters();
  renderPomodoro();
  renderMedia();
  renderLinks();
  moveTabIndicator(false);
  scheduleBlink();
  scheduleGlance();

  // Al arrancar se ve como píldora un momento, para que sepas que está funcionando.
  keepAwakeUntil = Date.now() + HELLO_MS;
  initialized = true;
  updateShape();
}

init();
