// =============================================================================
//  renderer/modules/backdrop.js — Fondos ambientales sutiles (Música e IA)
// -----------------------------------------------------------------------------
//  Tres manchas con degradados suaves que se desplazan muy despacio (ida y
//  vuelta, saliendo y llegando suave). Se mueven con el metrónomo central de
//  beat.js (8 pasos por segundo), en los mismos instantes que la ola, la letra
//  y Clawd: a esa velocidad no se nota que va a pasos, y Chromium no tiene que
//  dibujar de más ni activar composición a 60 fps.
//  Solo se mueven con su sección a la vista (Música reproduciendo, IA abierta);
//  al cerrar el panel, cambiar de pestaña o activar reducción de movimiento,
//  se pausan al instante (consumo cero de CPU en reposo).
// =============================================================================

import { state } from './state.js';
import { runOnBeat, stopOnBeat } from './beat.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { isPlaying, onMediaChange } from './music.js';
import { isMotionReduced } from './utils.js';

// Hasta dónde va cada mancha (en % de su tamaño), cuánto crece y cuánto tarda en ir
const DRIFT = [
  { x: 24, y: 34, scale: 1.22, seconds: 21 },
  { x: -28, y: -26, scale: 0.84, seconds: 27 },
  { x: -34, y: 40, scale: 1.3, seconds: 33 },
];

// Configuración de deriva para las manchas del chat de IA (R3)
const AI_DRIFT = [
  { x: 26, y: 32, scale: 1.2, seconds: 24 },
  { x: -28, y: -24, scale: 0.86, seconds: 30 },
  { x: -22, y: 36, scale: 1.24, seconds: 36 },
];

let blobs = typeof document !== 'undefined' ? [...document.querySelectorAll('.music-backdrop i')] : [];
let aiBlobs = typeof document !== 'undefined' ? [...document.querySelectorAll('.ai-backdrop i')] : [];

let movedMs = 0; // lo que llevan moviéndose (se para con la música)
let since = 0;

let aiMovedMs = 0; // tiempo acumulado del fondo de IA
let aiSince = 0;

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

function placeAi(ms) {
  aiBlobs.forEach((blob, index) => {
    const { x, y, scale, seconds } = AI_DRIFT[index % AI_DRIFT.length];
    const cycle = (ms / 1000 / seconds) % 2;
    const progress = ease(cycle <= 1 ? cycle : 2 - cycle); // ida y vuelta
    blob.style.translate = `${(x * progress).toFixed(2)}% ${(y * progress).toFixed(2)}%`;
    blob.style.scale = (1 + (scale - 1) * progress).toFixed(4);
  });
}

function onTick() {
  place(movedMs + (Date.now() - since));
}

function onAiTick() {
  placeAi(aiMovedMs + (Date.now() - aiSince));
}

function updateBackdrop() {
  const moving = state.isExpanded && getCurrentTab() === 'music' && isPlaying() && !isMotionReduced();
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

/** Sincroniza el fondo ambiental de IA con la visibilidad y preferencias de movimiento. */
export function updateAiBackdrop() {
  if (!aiBlobs.length && typeof document !== 'undefined') {
    aiBlobs = [...document.querySelectorAll('.ai-backdrop i')];
  }
  const moving = state.isExpanded && getCurrentTab() === 'ai' && !isMotionReduced();
  if (moving) {
    if (!aiSince) aiSince = Date.now();
    runOnBeat('ai-backdrop', onAiTick, {
      onStop: () => {
        aiMovedMs += Date.now() - aiSince;
        aiSince = 0;
      },
    });
  } else {
    stopOnBeat('ai-backdrop');
  }
}

function updateBackdrops() {
  updateBackdrop();
  updateAiBackdrop();
}

export function initBackdrop() {
  if (!blobs.length && typeof document !== 'undefined') {
    blobs = [...document.querySelectorAll('.music-backdrop i')];
  }
  if (!aiBlobs.length && typeof document !== 'undefined') {
    aiBlobs = [...document.querySelectorAll('.ai-backdrop i')];
  }
  place(0);
  placeAi(0);
  onPanelChange(updateBackdrops);
  onTabChange(updateBackdrops);
  onMediaChange(updateBackdrop);

  // Escuchar cambios en la preferencia de animaciones del sistema o configuración
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
    const motionObserver = new MutationObserver(updateBackdrops);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduce-motion'],
    });
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', updateBackdrops);
  }
}
