// =============================================================================
//  renderer/modules/backdrop.js — El fondo de la página Música
// -----------------------------------------------------------------------------
//  Tres manchas con los colores de la carátula que se desplazan muy despacio
//  (van y vuelven, saliendo y llegando suave). Se mueven con el reloj de
//  beat.js (8 pasos por segundo), en los mismos instantes que la ola, la letra
//  y Clawd: a esa velocidad no se nota que va a pasos, y Chromium no tiene que
//  dibujar de más. Solo con la página Música a la vista y la música sonando;
//  en pausa se quedan donde estaban.
// =============================================================================

import { state } from './state.js';
import { runOnBeat, stopOnBeat } from './beat.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { isPlaying, onMediaChange } from './music.js';

// Hasta dónde va cada mancha (en % de su tamaño), cuánto crece y cuánto tarda en ir
const DRIFT = [
  { x: 24, y: 34, scale: 1.22, seconds: 21 },
  { x: -28, y: -26, scale: 0.84, seconds: 27 },
  { x: -34, y: 40, scale: 1.3, seconds: 33 },
];

const blobs = [...document.querySelectorAll('.music-backdrop i')];
let movedMs = 0; // lo que llevan moviéndose (se para con la música)
let since = 0;

/** Sale y llega despacio (como ease-in-out). */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function place(ms) {
  blobs.forEach((blob, index) => {
    const { x, y, scale, seconds } = DRIFT[index % DRIFT.length];
    const cycle = (ms / 1000 / seconds) % 2;
    const progress = ease(cycle <= 1 ? cycle : 2 - cycle); // ida y vuelta
    blob.style.translate = `${(x * progress).toFixed(2)}% ${(y * progress).toFixed(2)}%`;
    blob.style.scale = (1 + (scale - 1) * progress).toFixed(4);
  });
}

function onTick() {
  place(movedMs + (Date.now() - since));
}

function updateBackdrop() {
  const moving = state.isExpanded && getCurrentTab() === 'music' && isPlaying();
  if (moving) {
    if (!since) since = Date.now();
    runOnBeat('backdrop', onTick, {
      onStop: () => {
        movedMs += Date.now() - since; // se quedan donde estaban
        since = 0;
      },
    });
  } else {
    stopOnBeat('backdrop');
  }
}

export function initBackdrop() {
  place(0);
  onPanelChange(updateBackdrop);
  onTabChange(updateBackdrop);
  onMediaChange(updateBackdrop);
}
