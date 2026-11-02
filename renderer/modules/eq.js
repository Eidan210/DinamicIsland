// =============================================================================
//  renderer/modules/eq.js — Las barritas del ecualizador
// -----------------------------------------------------------------------------
//  Hay cuatro grupos: en la isla, en el aviso de canción nueva, en el widget
//  de Música (1x1) y en la página Música. Se mueven con suavidad a 24 dibujos
//  por segundo con el reloj de beat.js (runOnFrames, compartiendo fotogramas
//  con Clawd, la ola y la letra), sin @keyframes ni transition continuas:
//    • Cada barra sigue un paseo aleatorio entre ~0,25 y 1 a su propio ritmo,
//      acercándose a su objetivo con un muelle amortiguado (rebote muy leve).
//    • Al reproducir suben suave desde el reposo; al pausar bajan suave (~300 ms)
//      y en cuanto llegan al reposo se para el reloj.
//    • Solo se mueven las que se ven ahora mismo, y con "animations": "off"
//      quedan quietas.
// =============================================================================

import { $, isMotionReduced } from './utils.js';
import { state } from './state.js';
import { runOnFrames, stopOnBeat } from './beat.js';
import { onShapeChange } from './island.js';
import { onPanelChange } from './panel.js';
import { onTabChange } from './tabs.js';
import { isPlaying, onMediaChange } from './music.js';

// Cuándo está a la vista cada grupo: en la píldora con música, en el aviso de
// canción nueva, en la página Música (con canción cargada) o en el widget 1x1.
const LIVE =
  '.island[data-shape="activity"] .activity[data-kind="music"] .eq, ' +
  '.island[data-shape="banner"] .banner .eq, ' +
  '.island[data-shape="expanded"] .view.is-active .player[data-state="ok"] .eq, ' +
  '.island[data-shape="expanded"] .view.is-active .widget-music:not([hidden]):not([data-size="2x1"])[data-has-track="true"] .eq';

export const REST = 0.35; // altura de reposo (coincide con scaleY(0.35) en styles.css)
export const MIN_BAR = 0.25;
export const MAX_BAR = 1;

// Cada barra cambia de objetivo a su propio ritmo (ms entre cambios y tope)
// para que no vayan sincronizadas ni formen un bucle repetitivo.
const BAR_RHYTHMS = [
  { minMs: 165, maxMs: 285, peak: 0.92 },
  { minMs: 120, maxMs: 225, peak: 1.0 },
  { minMs: 135, maxMs: 245, peak: 1.0 },
  { minMs: 175, maxMs: 300, peak: 0.9 },
];

const OMEGA = 16; // rapidez del muelle al bailar (~250 ms en llegar)
const ZETA = 0.58; // amortiguamiento (< 1 deja un rebote leve y vivo)
const OMEGA_D = OMEGA * Math.sqrt(1 - ZETA * ZETA); // frecuencia amortiguada exacta
const CALM_TAU = 0.085; // s: constante de bajada al pausar (~300 ms hasta el reposo)
const REST_EPSILON = 0.012; // por debajo de esta diferencia ya no se aprecia movimiento

const groups = [...document.querySelectorAll('.eq')];
const bars = BAR_RHYTHMS.map(() => ({
  value: REST,
  velocity: 0,
  target: REST,
  nextAt: 0,
}));

let live = []; // los grupos que están visibles ahora
let running = false; // ¿apuntado a runOnFrames?
let wasActive = false; // ¿estaba sonando en la revisión anterior?
let lastTime = 0;

/** Paseo aleatorio entre MIN_BAR y `peak`: cuando está alto tiende a bajar y viceversa. */
export function nextBarTarget(current, peak = MAX_BAR, random = Math.random) {
  const span = peak - MIN_BAR;
  const normalized = Math.min(1, Math.max(0, (current - MIN_BAR) / span));
  const direction = random() < normalized ? -1 : 1;
  const delta = (0.28 + random() * 0.44) * span;
  return Math.min(peak, Math.max(MIN_BAR, current + direction * delta));
}

/** Al empezar a reproducir, reparte objetivos altos escalonados para que suban suave. */
export function wakeBars(barList, now, random = Math.random) {
  barList.forEach((bar, index) => {
    const rhythm = BAR_RHYTHMS[index % BAR_RHYTHMS.length];
    bar.target = Math.min(rhythm.peak, 0.58 + random() * 0.36);
    bar.nextAt = now + 180 + index * 40 + random() * 80;
  });
}

/**
 * Avanza las barras `dtMs` ms con la solución exacta de un muelle subamortiguado
 * (estable para cualquier `dtMs`, incluso si el PC salta algún fotograma).
 * Devuelve true mientras sigan moviéndose.
 */
export function stepBars(barList, now, dtMs, playing, random = Math.random) {
  const seconds = Math.max(0, dtMs) / 1000;
  if (playing) {
    const decay = seconds > 0 ? Math.exp(-ZETA * OMEGA * seconds) : 1;
    const cos = seconds > 0 ? Math.cos(OMEGA_D * seconds) : 1;
    const sin = seconds > 0 ? Math.sin(OMEGA_D * seconds) : 0;

    barList.forEach((bar, index) => {
      const rhythm = BAR_RHYTHMS[index % BAR_RHYTHMS.length];
      if (now >= bar.nextAt) {
        bar.target = nextBarTarget(bar.target, rhythm.peak, random);
        bar.nextAt = now + rhythm.minMs + random() * (rhythm.maxMs - rhythm.minMs);
      }
      if (seconds > 0) {
        const offset = bar.value - bar.target;
        const coeff = (bar.velocity + ZETA * OMEGA * offset) / OMEGA_D;
        const nextValue = bar.target + decay * (offset * cos + coeff * sin);
        const nextVelocity =
          decay * (bar.velocity * cos - ((OMEGA * OMEGA * offset + ZETA * OMEGA * bar.velocity) / OMEGA_D) * sin);
        bar.value = Math.min(MAX_BAR, Math.max(MIN_BAR, nextValue));
        bar.velocity =
          (bar.value <= MIN_BAR && nextVelocity < 0) || (bar.value >= MAX_BAR && nextVelocity > 0) ? 0 : nextVelocity;
      }
    });
    return true;
  }

  let moving = false;
  const blend = seconds > 0 ? 1 - Math.exp(-seconds / CALM_TAU) : 0;
  for (const bar of barList) {
    bar.target = REST;
    bar.velocity = 0;
    bar.value += (REST - bar.value) * blend;
    if (Math.abs(bar.value - REST) < REST_EPSILON) {
      bar.value = REST;
    } else {
      moving = true;
    }
  }
  return moving;
}

function isAtRest() {
  return bars.every((bar) => Math.abs(bar.value - REST) < REST_EPSILON && Math.abs(bar.velocity) < REST_EPSILON);
}

function resetBars() {
  for (const bar of bars) {
    bar.value = REST;
    bar.velocity = 0;
    bar.target = REST;
    bar.nextAt = 0;
  }
}

/** Pinta la altura actual en los grupos visibles. */
function applyBars() {
  for (const group of live) {
    const children = group.children;
    for (let i = 0; i < children.length; i++) {
      children[i].style.transform = `scaleY(${bars[i % bars.length].value.toFixed(3)})`;
    }
  }
}

/** Vuelven a su altura de reposo (la del CSS). */
function rest(list) {
  for (const group of list) {
    for (const bar of group.children) bar.style.removeProperty('transform');
  }
}

function isMusicActive() {
  return isPlaying() && Boolean(state.media.title);
}

function onFrame(now) {
  const dt = now - lastTime;
  lastTime = now;
  if (isMotionReduced() || !live.length) {
    stopLoop();
    return;
  }
  if (stepBars(bars, now, dt, isMusicActive())) {
    applyBars();
  } else {
    stopLoop();
  }
}

function startLoop() {
  if (running || isMotionReduced()) return;
  running = true;
  lastTime = performance.now();
  runOnFrames('eq', onFrame, {
    onStop: () => {
      running = false;
      wasActive = false;
      resetBars();
      rest(live);
    },
  });
}

function stopLoop() {
  if (running) stopOnBeat('eq');
  running = false;
  wasActive = false;
  resetBars();
  rest(live);
}

/** ¿Qué grupos se ven ahora? Arranca, mantiene la bajada suave o para el reloj. */
function updateEq() {
  const active = isMusicActive();
  const still = isMotionReduced();
  const next = still ? [] : groups.filter((group) => group.matches(LIVE));
  rest(live.filter((group) => !next.includes(group)));
  live = next;

  if (!live.length || still) {
    wasActive = false;
    stopLoop();
    return;
  }

  if (active && !wasActive) {
    wakeBars(bars, performance.now());
  }
  wasActive = active;

  if (active || !isAtRest()) {
    if (running) applyBars();
    else startLoop();
  } else {
    stopLoop();
  }
}

/** Lo revisamos cuando acaba de cambiar todo lo de este momento (la página, el widget...). */
let pending = false;
function scheduleUpdate() {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    updateEq();
  });
}

export function initEq() {
  onShapeChange(scheduleUpdate);
  onPanelChange(scheduleUpdate);
  onTabChange(scheduleUpdate);
  onMediaChange(scheduleUpdate);
  const observer = new MutationObserver(scheduleUpdate);
  // Con "animations": "system", Windows puede cambiar data-reduce-motion sin cambiar la isla.
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduce-motion'],
  });
  const homeMusic = $('home-music');
  if (homeMusic) {
    observer.observe(homeMusic, {
      attributes: true,
      attributeFilter: ['hidden', 'data-size'],
    });
  }
}
