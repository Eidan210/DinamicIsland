// =============================================================================
//  renderer/modules/island.js — La forma de la isla
// -----------------------------------------------------------------------------
//   mini      → muesca pequeña pegada arriba: no hay nada que contar
//   pill      → píldora normal: al pasar el ratón por la mini (o al arrancar)
//   activity  → píldora ancha con información en vivo (Pomodoro, música)
//   banner    → aviso grande unos segundos (canción nueva)
//   expanded  → el panel abierto
// computeShape() decide la forma a partir del estado; updateShape() la aplica.
//
// También gestiona los clics que atraviesan la ventana: la ventana es mucho
// más grande que la isla, así que main.js deja pasar los clics a las ventanas
// de abajo salvo cuando el ratón está sobre la isla (se lo avisamos).
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { wakeEyes, lookAt, resetLook, updateMood } from './eyes.js';

const island = $('island');
const activityEl = $('activity');

const SHAPE_ORDER = ['mini', 'pill', 'activity', 'banner', 'expanded']; // de menor a mayor
const WAKE_DELAY = 200; // ms con el ratón sobre la mini-muesca para que se despierte
const SLEEP_DELAY = 800; // ms que espera antes de volver a encogerse cuando te alejas
const WAKE_MARGIN = 8; // px alrededor de la mini-muesca que también cuentan
const NEAR_DISTANCE = 28; // px alrededor de la píldora que cuentan como "cerca"

let awake = false; // ¿la despertaste pasando el ratón?
let keepAwakeUntil = 0; // saludo al arrancar
let bannerUntil = 0; // aviso de canción nueva
let wakeTimer = null;
let sleepTimer = null;
let shapeTimer = null;
const shapeListeners = [];

// -----------------------------------------------------------------------------
// Clics que atraviesan la ventana
// -----------------------------------------------------------------------------

/** true = la ventana recibe clics (ratón sobre la isla); false = los deja pasar. */
export function setMouseInteractive(interactive) {
  if (interactive === state.mouseInteractive) return; // no mandamos mensajes repetidos
  state.mouseInteractive = interactive;
  window.notch.setMouseInteractive(interactive);
}

// -----------------------------------------------------------------------------
// Forma de la isla
// -----------------------------------------------------------------------------

/** Avisa a `listener(forma)` cada vez que se revisa la forma (p. ej. para encender contadores). */
export function onShapeChange(listener) {
  shapeListeners.push(listener);
}

/** ¿Qué actividad en vivo hay ahora? (por prioridad) */
export function getActivity() {
  const { pomodoro, media, settings } = state;
  if (Date.now() < state.celebrateUntil) return 'pomodoro';
  if (pomodoro.status === 'running' || pomodoro.status === 'paused') return 'pomodoro';
  // Al cambiar de canción, algunas apps pasan un instante por "changing": la
  // actividad aguanta 1,5 s para no parpadear.
  const musicOn = media.status === 'playing' || Date.now() < state.musicGraceUntil;
  if (settings.musicActivity && musicOn && media.title) return 'music';
  return null;
}

function computeShape() {
  const now = Date.now();
  if (state.isExpanded) return 'expanded';
  if (now < bannerUntil || (state.shape === 'banner' && state.mouseInteractive)) return 'banner';
  if (getActivity()) return 'activity';
  if (awake || now < keepAwakeUntil || !state.settings.autoHide) return 'pill';
  return 'mini';
}

export function updateShape() {
  const next = computeShape();
  activityEl.dataset.kind = getActivity() || '';
  activityEl.dataset.status = Date.now() < state.celebrateUntil ? 'finished' : state.pomodoro.status;

  if (next !== state.shape) {
    const previous = state.shape;
    state.shape = next;
    // Al crecer usamos una curva con rebote; al encoger, una suave (ver styles.css).
    island.dataset.motion = SHAPE_ORDER.indexOf(next) > SHAPE_ORDER.indexOf(previous) ? 'grow' : 'shrink';
    island.dataset.shape = next; // ← esto dispara la animación CSS
    if (previous === 'mini') {
      if (state.pointerInside) lookAt(state.lastPointer.x, state.lastPointer.y);
      wakeEyes();
    }
    if (next === 'mini') {
      setMouseInteractive(false); // la mini deja pasar los clics
      resetLook();
    }
  }

  updateMood();
  scheduleShapeTimer();
  shapeListeners.forEach((listener) => listener(state.shape));
}

/** Revisa la forma justo cuando caduque el saludo, el aviso, la celebración... */
function scheduleShapeTimer() {
  clearTimeout(shapeTimer);
  const now = Date.now();
  const upcoming = [keepAwakeUntil, bannerUntil, state.celebrateUntil, state.musicGraceUntil].filter(
    (time) => time > now
  );
  if (upcoming.length) shapeTimer = setTimeout(updateShape, Math.min(...upcoming) - now + 20);
}

/** La isla se queda como píldora `ms` milisegundos (saludo al arrancar). */
export function keepAwakeFor(ms) {
  keepAwakeUntil = Date.now() + ms;
  updateShape();
}

/** Muestra el aviso grande durante `ms` milisegundos (quien lo pide llama luego a updateShape). */
export function showBanner(ms) {
  bannerUntil = Date.now() + ms;
}

/** panel.js nos avisa de que el panel se abrió o se cerró. */
export function handlePanelToggle(expanded) {
  cancelWake();
  if (expanded) {
    cancelSleep();
    bannerUntil = 0; // si había un aviso, el panel lo sustituye
  } else {
    // Si el ratón sigue cerca, se queda como píldora hasta que te alejes.
    awake = state.pointerInside;
    scheduleSleep();
  }
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
  if (state.mouseInteractive) return; // tienes el ratón encima: espera
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

export function initIsland() {
  // El ratón entra o sale de la isla → la ventana acepta o deja pasar los clics.
  // (La mini-muesca tiene pointer-events: none, así que nunca "atrapa" el ratón.)
  island.addEventListener('mouseenter', () => {
    setMouseInteractive(true);
    cancelSleep();
  });
  island.addEventListener('mouseleave', () => {
    setMouseInteractive(false);
    if (state.shape === 'banner') updateShape(); // si el aviso ya caducó, ahora sí se va
  });

  // Cuando la isla termina de cambiar de forma, puede que el cursor (quieto) haya
  // quedado dentro o fuera: lo comprobamos de nuevo.
  island.addEventListener('transitionend', (event) => {
    if (event.target !== island) return;
    if (['height', 'width', 'translate'].includes(event.propertyName)) {
      setMouseInteractive(state.shape !== 'mini' && island.matches(':hover'));
    }
  });

  // Solo recibimos movimientos cuando el ratón pasa por la zona de la ventana
  // (820x318 px arriba en el centro); el resto de la pantalla no nos llega.
  document.addEventListener('mousemove', (event) => {
    state.pointerInside = true;
    const x = event.clientX;
    const y = event.clientY;
    state.lastPointer = { x, y };
    if (state.shape !== 'mini') lookAt(x, y);

    if (state.shape === 'mini') {
      // Si el ratón se queda un instante sobre la mini-muesca, se despierta.
      if (state.settings.revealOnHover && isOverMini(x, y)) {
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
    state.pointerInside = false;
    cancelWake();
    resetLook();
    scheduleSleep();
  });
}
