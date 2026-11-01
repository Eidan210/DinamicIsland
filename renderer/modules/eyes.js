// =============================================================================
//  renderer/modules/eyes.js — La cara de la isla (los ojos o Clawd)
// -----------------------------------------------------------------------------
//  Parpadea, mira alrededor, sigue al ratón y cambia de expresión.
//  Todo son animaciones cortas lanzadas de vez en cuando: nada se anima en
//  bucle infinito (eso tendría a la GPU dibujando todo el rato).
//  Desde la Fase 5 la cara es Clawd (clawd.js): cada gesto se hace en los
//  dos (los ojos de siempre y Clawd); solo se ve el que toca ("clawd" en
//  settings.json).
// =============================================================================

import { $, animate, SPRING_POP } from './utils.js';
import { state } from './state.js';
import { blinkClawd, glanceClawd, popClawd, updateClawd, wakeClawd } from './clawd.js';

const faceEl = $('face');
const eyesEl = $('eyes');
const eyeEls = document.querySelectorAll('.eye');

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
  blinkClawd(times);
}

function scheduleBlink() {
  const delay = 2500 + Math.random() * 3500; // entre 2,5 y 6 segundos
  setTimeout(() => {
    if (state.shape !== 'banner') blink(); // en el aviso los ojos no se ven
    scheduleBlink();
  }, delay);
}

/** Al despertar, los ojos se abren como si el notch se levantara. */
export function wakeEyes() {
  eyeEls.forEach((eye) => {
    animate(
      eye,
      [{ transform: 'scaleY(0.1)' }, { transform: 'scaleY(0.1)', offset: 0.4 }, { transform: 'scaleY(1)' }],
      { duration: 520, easing: SPRING_POP }
    );
  });
  wakeClawd();
}

/** Al abrir el panel, los ojos dan un pequeño salto de alegría. */
export function popEyes() {
  animate(eyesEl, [{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
  popClawd();
}

/**
 * Los ojos miran hacia el ratón (como mucho 3,5 px a los lados y 2,5 px
 * arriba/abajo). Las variables van en la cara: las usan los ojos y Clawd.
 */
export function lookAt(x, y) {
  const rect = faceEl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  const strength = Math.min(1, distance / 140); // cerca del centro se mueven menos
  faceEl.style.setProperty('--look-x', `${((dx / distance) * strength * 3.5).toFixed(2)}px`);
  faceEl.style.setProperty('--look-y', `${((dy / distance) * strength * 2.5).toFixed(2)}px`);
}

export function resetLook() {
  faceEl.style.setProperty('--look-x', '0px');
  faceEl.style.setProperty('--look-y', '0px');
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
  glanceClawd(side);
}

function scheduleGlance() {
  setTimeout(() => {
    if (state.shape !== 'mini' && state.shape !== 'banner' && !state.pointerInside) glance();
    scheduleGlance();
  }, 8000 + Math.random() * 7000); // entre 8 y 15 segundos
}

/** Expresión según lo que pasa: feliz al terminar un Pomodoro, concentrada durante. */
export function updateMood() {
  const celebrating = Date.now() < state.celebrateUntil;
  faceEl.classList.toggle('is-happy', celebrating);
  faceEl.classList.toggle('is-focused', !celebrating && state.pomodoro.status === 'running');
  updateClawd(); // Clawd decide lo suyo (trabajar, bailar, dormir...)
}

/** Empieza a parpadear y a mirar alrededor. */
export function startEyes() {
  scheduleBlink();
  scheduleGlance();
}
