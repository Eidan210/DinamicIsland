// =============================================================================
//  renderer/modules/island.js — La forma de la isla y sus actividades
// -----------------------------------------------------------------------------
//   mini      → muesca pequeña pegada arriba: no hay nada que contar
//   pill      → píldora normal: al pasar el ratón por la mini (o al arrancar)
//   activity  → píldora ancha con información en vivo (Pomodoro, música)
//   volume    → barra de volumen, 1,5 s después de cambiarlo
//   banner    → aviso grande unos segundos (canción nueva)
//   alert     → aviso importante unos segundos (batería baja, un error...)
//   drop      → arrastras archivos encima: se abre para recibirlos (y, al
//               soltar, confirma que están en la bandeja; ver tray.js)
//   decision  → Claude Code espera tu respuesta (permiso, pregunta o plan):
//               salta por encima de todo menos del panel abierto y de soltar archivos
//   expanded  → el panel abierto
// computeShape() decide la forma a partir del estado; updateShape() la aplica.
//
// Puede haber hasta 3 actividades a la vez: la más importante se ve en la
// isla y las otras, en burbujas a su derecha (como en el iPhone).
//
// También gestiona los clics que atraviesan la ventana: la ventana es mucho
// más grande que la isla, así que main.js deja pasar los clics a las ventanas
// de abajo salvo cuando el ratón está sobre la isla o una burbuja (se lo avisamos).
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { wakeEyes, lookAt, resetLook, updateMood } from './eyes.js';

const island = $('island');
const activityEl = $('activity');
const bubbleEls = [...document.querySelectorAll('.bubble')];
const bubblePomodoro = $('bubble-pomodoro');

// De menor a mayor (al crecer la isla rebota; al encoger, no)
const SHAPE_ORDER = ['bar', 'mini', 'pill', 'activity', 'volume', 'banner', 'alert', 'drop', 'decision', 'expanded'];
let lastInteractionTime = Date.now();
let hoverOpenTimer = null;
let hoverCloseTimer = null;
const MAX_ACTIVITIES = 3; // 1 en la isla + 2 burbujas
const WAKE_DELAY = 200; // ms con el ratón sobre la mini-muesca para que se despierte
const SLEEP_DELAY = 800; // ms que espera antes de volver a encogerse cuando te alejas
const WAKE_MARGIN = 8; // px alrededor de la mini-muesca que también cuentan
const NEAR_DISTANCE = 28; // px alrededor de la píldora que cuentan como "cerca"

let awake = false; // ¿la despertaste pasando el ratón?
let keepAwakeUntil = 0; // saludo al arrancar
let chargingUntil = 0;
let volumeUntil = 0; // barra de volumen
let bannerUntil = 0; // aviso de canción nueva
let alertUntil = 0; // aviso importante
let dropUntil = 0; // "Guardado en la bandeja" tras soltar archivos
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

/** ¿Está el ratón encima de la isla o de una burbuja visible? */
function isPointerOnIsland() {
  if (state.shape === 'mini') return false; // la mini-muesca nunca "atrapa" el ratón
  return island.matches(':hover') || bubbleEls.some((bubble) => isBubbleVisible(bubble) && bubble.matches(':hover'));
}

function isBubbleVisible(bubble) {
  return bubble.classList.contains('is-visible');
}

// -----------------------------------------------------------------------------
// Actividades y forma de la isla
// -----------------------------------------------------------------------------

/** Avisa a `listener(forma)` cada vez que se revisa la forma (p. ej. para encender contadores). */
export function onShapeChange(listener) {
  shapeListeners.push(listener);
}

/**
 * Las actividades en vivo de ahora, de la más importante a la menos (hasta 3).
 * Para cambiar la prioridad, cambia el orden de los if.
 */
export function getActivities() {
  const { pomodoro, media, settings, ai } = state;
  const activities = [];

  // Claude Code (o Antigravity) trabajando o esperándote; al terminar, se ve
  // "Hecho" unos segundos.
  const aiLive = ai.sessions.some((session) => session.status === 'working' || session.status === 'waiting');
  if (aiLive || Date.now() < state.aiDoneUntil) activities.push('ai');

  const celebrating = Date.now() < state.celebrateUntil;
  if (celebrating || pomodoro.status === 'running' || pomodoro.status === 'paused') activities.push('pomodoro');

  // Al cambiar de canción, algunas apps pasan un instante por "changing": la
  // actividad aguanta 1,5 s para no parpadear.
  const musicOn = media.status === 'playing' || Date.now() < state.musicGraceUntil;
  if (settings.musicActivity && musicOn && media.title) activities.push('music');

  return activities.slice(0, MAX_ACTIVITIES);
}

/** La actividad principal (la que se ve en la isla), o null. */
export function getActivity() {
  return getActivities()[0] || null;
}

function computeShape(activities) {
  const now = Date.now();
  if (state.isExpanded) return 'expanded';
  // Arrastrando archivos encima (o recién soltados): eso es lo que estás haciendo ahora
  if (state.fileDrag || now < dropUntil) return 'drop';
  if (state.ai.pending.length) return 'decision';
  if (now < chargingUntil) return 'charging';
  if (now < volumeUntil) return 'volume';
  // Los avisos no se van mientras tengas el ratón encima (para que te dé tiempo a leerlos).
  if (now < alertUntil || (state.shape === 'alert' && state.mouseInteractive)) return 'alert';
  if (now < bannerUntil || (state.shape === 'banner' && state.mouseInteractive)) return 'banner';
  if (activities.length) return 'activity';
  if (awake || now < keepAwakeUntil || !state.settings.autoHide) return 'pill';
  if (state.settings.autoHideIdle && (now - lastInteractionTime >= (state.settings.autoHideIdleSeconds || 30) * 1000)) return 'bar';
  return 'mini';
}

export function updateShape() {
  const activities = getActivities();
  const next = computeShape(activities);
  activityEl.dataset.kind = activities[0] || '';
  activityEl.dataset.status = Date.now() < state.celebrateUntil ? 'finished' : state.pomodoro.status;
  island.dataset.activity = activities[0] || ''; // p. ej. con música se tiñe con la carátula
  island.dataset.decision = String(state.ai.pending.length > 0); // con el panel abierto, la tarjeta sale encima

  if (next !== state.shape) {
    const previous = state.shape;
    state.shape = next;
    island.dataset.motion = SHAPE_ORDER.indexOf(next) > SHAPE_ORDER.indexOf(previous) ? 'grow' : 'shrink';
    island.dataset.shape = next; // ← esto dispara la animación CSS
    if (previous === 'mini' || previous === 'bar') {
      if (state.pointerInside) lookAt(state.lastPointer.x, state.lastPointer.y);
      wakeEyes();
    }
    if (next === 'mini' || next === 'bar') {
      setMouseInteractive(false); // la mini y la bar dejan pasar los clics
      resetLook();
    }
  }

  updateBubbles(activities);
  updateMood();
  scheduleShapeTimer();
  shapeListeners.forEach((listener) => listener(state.shape));
}

/**
 * Burbujas: la 2.ª y la 3.ª actividad. Solo se ven con la isla en forma de
 * actividad (con un aviso o el panel abierto, vuelven a meterse en la isla).
 */
function updateBubbles(activities) {
  const extra = state.shape === 'activity' ? activities.slice(1) : [];
  for (const bubble of bubbleEls) {
    const slot = extra.indexOf(bubble.dataset.kind);
    bubble.classList.toggle('is-visible', slot !== -1);
    if (slot !== -1) bubble.style.setProperty('--slot', String(slot));
  }
  bubblePomodoro.dataset.status = activityEl.dataset.status;
}

/** Revisa la forma justo cuando caduque el saludo, un aviso, la celebración... */
function scheduleShapeTimer() {
  clearTimeout(shapeTimer);
  const now = Date.now();
  const upcoming = [keepAwakeUntil, chargingUntil, volumeUntil, bannerUntil, alertUntil, dropUntil, state.celebrateUntil, state.musicGraceUntil, state.aiDoneUntil].filter(
    (time) => time > now
  );
  if (state.settings.autoHideIdle && !activities.length && !state.isExpanded && !awake) {
    const idleMs = (state.settings.autoHideIdleSeconds || 30) * 1000;
    const barAt = lastInteractionTime + idleMs;
    if (barAt > now) upcoming.push(barAt);
  }
  if (upcoming.length) shapeTimer = setTimeout(updateShape, Math.min(...upcoming) - now + 20);
}

/** La isla se queda como píldora `ms` milisegundos (saludo al arrancar). */
export function keepAwakeFor(ms) {
  keepAwakeUntil = Date.now() + ms;
  updateShape();
}

// Quien pide uno de estos llama después a updateShape().

/** Muestra el aviso de carga estilo Apple durante `ms` milisegundos. */
export function showCharging(ms) {
  chargingUntil = Date.now() + ms;
  updateShape();
}

/** Muestra la barra de volumen durante `ms` milisegundos. */
export function showVolume(ms) {
  volumeUntil = Date.now() + ms;
}

/** Muestra el aviso de canción nueva durante `ms` milisegundos. */
export function showBanner(ms) {
  bannerUntil = Date.now() + ms;
}

/** Muestra el aviso importante durante `ms` milisegundos. */
export function showAlert(ms) {
  alertUntil = Date.now() + ms;
}

/** Tras soltar archivos, la isla cuenta cómo fue durante `ms` milisegundos. */
export function showDropResult(ms) {
  dropUntil = Date.now() + ms;
}

/** panel.js nos avisa de que el panel se abrió o se cerró. */
export function handlePanelToggle(expanded) {
  cancelWake();
  clearTimeout(hoverOpenTimer);
  clearTimeout(hoverCloseTimer);
  hoverOpenTimer = null;
  hoverCloseTimer = null;
  if (expanded) {
    cancelSleep();
    // El panel sustituye a lo que hubiera (el volumen sale en su barra superior
    // y los avisos, en la campana).
    volumeUntil = 0;
    bannerUntil = 0;
    alertUntil = 0;
    dropUntil = 0;
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
  // El ratón entra o sale de la isla (o de una burbuja) → la ventana acepta o
  // deja pasar los clics. (La mini-muesca tiene pointer-events: none, así que
  // nunca "atrapa" el ratón.)
  for (const element of [island, ...bubbleEls]) {
    element.addEventListener('mouseenter', () => {
      setMouseInteractive(true);
      cancelSleep();
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
      if (state.settings.hoverToOpen && !state.isExpanded && state.shape !== 'mini' && state.shape !== 'bar') {
        clearTimeout(hoverOpenTimer);
        hoverOpenTimer = setTimeout(() => {
          if (!state.isExpanded && isPointerOnIsland() && !state.fileDrag) {
            window.notch.expand();
          }
        }, 250);
      }
    });
    element.addEventListener('mouseleave', () => {
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = null;
      setMouseInteractive(isPointerOnIsland());
      // Si el aviso ya caducó, ahora sí se va.
      if (state.shape === 'banner' || state.shape === 'alert') updateShape();
      if (state.settings.hoverToOpen && state.isExpanded) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = setTimeout(() => {
          if (state.isExpanded && !isPointerOnIsland() && !state.dialogOpen) {
            window.notch.collapse();
          }
        }, 400);
      }
    });
  }

  const panelEl = document.querySelector('.panel');
  if (panelEl) {
    panelEl.addEventListener('mouseenter', () => {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    });
    panelEl.addEventListener('mouseleave', () => {
      if (state.settings.hoverToOpen && state.isExpanded) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = setTimeout(() => {
          if (state.isExpanded && !isPointerOnIsland() && !state.dialogOpen) {
            window.notch.collapse();
          }
        }, 400);
      }
    });
  }

  // Cuando la isla termina de cambiar de forma (o una burbuja de aparecer), puede
  // que el cursor (quieto) haya quedado dentro o fuera: lo comprobamos de nuevo.
  const recheckPointer = (event) => {
    if (event.target !== event.currentTarget) return;
    if (['height', 'width', 'translate', 'scale'].includes(event.propertyName)) setMouseInteractive(isPointerOnIsland());
  };
  island.addEventListener('transitionend', recheckPointer);
  bubbleEls.forEach((bubble) => bubble.addEventListener('transitionend', recheckPointer));

  // Solo recibimos movimientos cuando el ratón pasa por la zona de la ventana
  // (820x318 px arriba en el centro); el resto de la pantalla no nos llega.
  document.addEventListener('mousemove', (event) => {
    state.pointerInside = true;
    lastInteractionTime = Date.now();
    const x = event.clientX;
    const y = event.clientY;
    state.lastPointer = { x, y };
    if (state.shape !== 'mini' && state.shape !== 'bar') lookAt(x, y);

    if (state.shape === 'bar') {
      const rect = island.getBoundingClientRect();
      if (y <= 24 && x >= rect.left - 40 && x <= rect.right + 40) {
        wake();
      }
    }

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

    // Por si el ratón ya estaba encima sin "entrar" (p. ej. al volver de
    // arrastrar archivos fuera de la isla): que la isla vuelva a atraparlo.
    if (!state.mouseInteractive && state.shape !== 'mini' && isPointerOnIsland()) setMouseInteractive(true);
  });

  // El ratón salió de la ventana entera (relatedTarget vacío = fuera de la página).
  document.addEventListener('mouseout', (event) => {
    if (event.relatedTarget) return;
    state.pointerInside = false;
    cancelWake();
    resetLook();
    scheduleSleep();
  });

  if (window.notch.onFullscreenChange) {
    window.notch.onFullscreenChange((isFullscreen) => {
      if (isFullscreen) {
        clearTimeout(wakeTimer);
        clearTimeout(sleepTimer);
        clearTimeout(hoverOpenTimer);
        clearTimeout(hoverCloseTimer);
      }
    });
  }
}
