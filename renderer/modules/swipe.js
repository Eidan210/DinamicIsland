// =============================================================================
//  renderer/modules/swipe.js — Deslizar para cambiar de canción
// -----------------------------------------------------------------------------
//  Dos formas, como en el iPhone:
//    • Touchpad: dos dedos hacia un lado (llega como una "rueda" horizontal).
//    • Ratón: arrastrar hacia un lado y soltar.
//  Hacia la izquierda → siguiente canción; hacia la derecha → anterior.
//  (Con el touchpad depende de la dirección de desplazamiento de Windows; con
//  la de por defecto, la que sigue a tus dedos, funciona igual que con el ratón.)
// =============================================================================

import { animate, SPRING_POP } from './utils.js';

const WHEEL_THRESHOLD = 70; // px de desplazamiento horizontal acumulado para cambiar
const WHEEL_GESTURE_GAP = 250; // ms sin eventos de rueda = empieza otro gesto
const DRAG_START = 8; // px que hay que mover antes de que cuente como arrastre (si no, es un clic)
const DRAG_THRESHOLD = 48; // px arrastrados para cambiar de canción
const DRAG_FOLLOW = 0.45; // el contenido se mueve menos que el ratón (se siente "elástico")
const DRAG_MAX = 30; // lo máximo que se mueve el contenido

/**
 * Hace "deslizable" un elemento.
 * @param {HTMLElement} element  dónde se escuchan la rueda y el arrastre
 * @param {object} options
 * @param {() => boolean} options.enabled  ¿se puede deslizar ahora?
 * @param {(direction: 1 | -1) => void} options.onSwipe  1 = siguiente, -1 = anterior
 * @param {() => HTMLElement[]} [options.moving]  lo que sigue al ratón mientras arrastras
 * @param {(target: Element) => boolean} [options.ignoreDragFrom]  dónde NO empieza un arrastre (botones...)
 */
export function makeSwipeable(element, { enabled, onSwipe, moving = () => [], ignoreDragFrom = () => false }) {
  // ---------- Touchpad (rueda horizontal) ----------
  let wheelTotal = 0;
  let lastWheel = 0;
  let wheelDone = false; // en cada gesto solo se cambia una vez (el touchpad sigue mandando eventos)

  element.addEventListener(
    'wheel',
    (event) => {
      if (!enabled()) return;
      const now = performance.now();
      if (now - lastWheel > WHEEL_GESTURE_GAP) {
        wheelTotal = 0;
        wheelDone = false;
      }
      lastWheel = now;
      if (wheelDone || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return; // vertical: no es para nosotros
      wheelTotal += event.deltaX;
      if (Math.abs(wheelTotal) >= WHEEL_THRESHOLD) {
        wheelDone = true;
        onSwipe(wheelTotal > 0 ? 1 : -1);
      }
    },
    { passive: true }
  );

  // ---------- Ratón (arrastrar) ----------
  let drag = null; // { id, startX, startY, x, active }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !enabled() || ignoreDragFrom(event.target)) return;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: 0, active: false };
  });

  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(dy)) return;
      drag.active = true;
      // Capturar el puntero: aunque el ratón salga del elemento, seguimos recibiendo sus movimientos.
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
    }
    drag.x = dx;
    const offset = Math.max(-DRAG_MAX, Math.min(DRAG_MAX, dx * DRAG_FOLLOW));
    moving().forEach((item) => item.style.setProperty('--swipe-x', `${offset.toFixed(1)}px`));
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { active, x } = drag;
    drag = null;
    if (!active) return; // no se movió: era un clic normal
    element.classList.remove('is-dragging');
    suppressNextClick();
    // El contenido vuelve a su sitio con un rebote.
    moving().forEach((item) => {
      const from = item.style.getPropertyValue('--swipe-x') || '0px';
      item.style.setProperty('--swipe-x', '0px');
      animate(item, [{ translate: `${from} 0` }, { translate: '0px 0' }], { duration: 420, easing: SPRING_POP });
    });
    if (event.type === 'pointerup' && Math.abs(x) >= DRAG_THRESHOLD && enabled()) onSwipe(x < 0 ? 1 : -1);
  };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
}

/** Al soltar tras arrastrar, el navegador manda un "clic": lo anulamos (si no, abriría el panel). */
function suppressNextClick() {
  const stop = (event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}
