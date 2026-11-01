// =============================================================================
//  renderer/modules/clip-page.js — La página Portapapeles: sus dos partes
// -----------------------------------------------------------------------------
//  Arriba a la izquierda se elige qué se ve (como un control segmentado de iOS):
//    clips → lo que copiaste (clipboard.js)
//    files → la bandeja de archivos (tray.js)
//  El fondo del botón elegido se desliza de uno a otro, y cada parte entra
//  desde su lado. Este módulo solo cambia de parte y lleva los contadores.
// =============================================================================

import { $, animate, cssEasing, setText } from './utils.js';
import { state } from './state.js';
import { getCurrentTab } from './tabs.js';

const SEGMENTS = ['clips', 'files'];

const page = $('clip-page');
const indicator = $('clip-segment-indicator');
const buttons = [...document.querySelectorAll('#clip-segments .segment')];
const counts = { clips: $('clips-count'), files: $('files-count') };
const listeners = [];

let segment = 'clips';

/** La parte que se ve ahora: 'clips' o 'files'. */
export function getSegment() {
  return segment;
}

/** ¿Se está viendo esta parte ahora mismo (panel abierto en Portapapeles)? */
export function isSegmentVisible(name) {
  return state.isExpanded && getCurrentTab() === 'clipboard' && segment === name;
}

/** Avisa a `listener(parte)` cada vez que cambia la parte que se ve. */
export function onSegmentChange(listener) {
  listeners.push(listener);
}

/** El número junto a cada parte ("12"); 0 = sin número. */
export function setSegmentCount(name, count) {
  if (!counts[name]) return;
  setText(counts[name], count ? String(count) : '');
  moveSegmentIndicator(false); // el número cambia el ancho de los botones
}

/** Coloca el fondo deslizante debajo del botón elegido. */
export function moveSegmentIndicator(withAnimation) {
  const active = buttons.find((button) => button.dataset.segment === segment);
  if (!active) return;
  indicator.classList.toggle('no-animation', !withAnimation);
  indicator.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
  indicator.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
}

/** Enseña una de las dos partes. */
export function showSegment(name) {
  if (!SEGMENTS.includes(name)) return;
  const previous = segment;
  segment = name;
  page.dataset.segment = name;
  buttons.forEach((button) => {
    const active = button.dataset.segment === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const visible = state.isExpanded && getCurrentTab() === 'clipboard';
  moveSegmentIndicator(visible);
  if (name === previous) return;

  // La parte nueva entra desde su lado (Bandeja está a la derecha)
  if (visible) {
    const direction = SEGMENTS.indexOf(name) > SEGMENTS.indexOf(previous) ? 1 : -1;
    animate(
      page.querySelector(`.clip-pane[data-pane="${name}"]`),
      [
        { opacity: 0, transform: `translateX(${24 * direction}px)`, filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' },
      ],
      { duration: 460, easing: cssEasing('--spring-open') }
    );
  }
  listeners.forEach((listener) => listener(name, previous));
}

export function initClipPage() {
  buttons.forEach((button) => button.addEventListener('click', () => showSegment(button.dataset.segment)));
  moveSegmentIndicator(false);
}
