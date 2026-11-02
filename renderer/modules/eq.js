// =============================================================================
//  renderer/modules/eq.js — Las barritas del ecualizador
// -----------------------------------------------------------------------------
//  Hay cuatro grupos: en la isla, en el aviso de canción nueva, en el widget
//  de Música y en la página Música. Bailan solo mientras suena y se ven, a
//  pasos con el reloj de beat.js (8 por segundo): con una animación CSS
//  continua, Chromium redibujaría la ventana 60 veces por segundo (era lo que
//  más gastaba con música sonando).
// =============================================================================

import { state } from './state.js';
import { runOnBeat, stopOnBeat } from './beat.js';
import { onShapeChange } from './island.js';
import { onPanelChange } from './panel.js';
import { onTabChange } from './tabs.js';
import { isPlaying, onMediaChange } from './music.js';

// Cuándo se ve cada grupo: en la píldora con la música, en el aviso de canción
// nueva o, con el panel abierto, en la página que se ve (si está sonando)
const LIVE =
  '.island[data-shape="activity"] .activity[data-kind="music"] .eq, ' +
  '.island[data-shape="banner"] .banner .eq, ' +
  '.island[data-shape="expanded"] .view.is-active [data-playing="true"] .eq';

// La altura de cada barra en cada paso. Ciclos de distinta longitud para que
// no se repitan juntas: parece que siguen la música.
const PATTERNS = [
  [0.3, 0.75, 0.95, 0.55, 0.4, 0.8, 0.5],
  [0.85, 0.45, 0.3, 0.7, 1, 0.6, 0.35, 0.9],
  [0.5, 0.95, 0.65, 0.35, 0.55, 0.85, 0.4, 0.7, 1],
  [0.7, 0.4, 0.9, 0.5, 0.3, 0.65],
];

const groups = [...document.querySelectorAll('.eq')];
let live = []; // los grupos que se ven y bailan ahora

function onTick(step) {
  for (const group of live) {
    [...group.children].forEach((bar, index) => {
      const pattern = PATTERNS[index % PATTERNS.length];
      bar.style.transform = `scaleY(${pattern[step % pattern.length]})`;
    });
  }
}

/** Vuelven a su altura de reposo (la del CSS). */
function rest(list) {
  for (const group of list) for (const bar of group.children) bar.style.removeProperty('transform');
}

/** ¿Qué grupos bailan ahora? Arranca o para el reloj. */
function updateEq() {
  const next = isPlaying() && state.media.title ? groups.filter((group) => group.matches(LIVE)) : [];
  rest(live.filter((group) => !next.includes(group)));
  live = next;
  if (live.length) runOnBeat('eq', onTick, { onStop: () => rest(live) });
  else stopOnBeat('eq');
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
}
