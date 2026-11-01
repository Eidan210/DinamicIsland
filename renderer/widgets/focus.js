// =============================================================================
//  renderer/widgets/focus.js — Widget Focus: el Pomodoro
// -----------------------------------------------------------------------------
//  Un toque empieza el Pomodoro (o lo pausa, o empieza otro si ya terminó).
//  1x1: el anillo con play/pausa dentro, el tiempo y cómo va.
//  2x1: además, las sesiones de hoy y el botón de reiniciar.
//  El temporizador vive en main/pomodoro.js; pomodoro.js nos avisa de cada
//  cambio y de cada segundo (solo con el panel abierto).
// =============================================================================

import { $, animate, setText, setRollingText, formatCountdown, plural, SPRING_POP } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { getProgress, getRemainingMs, onPomodoroRender, POMODORO_LABELS, setRing, togglePomodoro } from '../modules/pomodoro.js';

const ACTIONS = { idle: 'Empezar', running: 'Pausar', paused: 'Seguir', finished: 'Empezar otro' };

const widget = $('home-focus');
const ringWrap = widget.querySelector('.widget-ring');
const ring = $('home-pomo-progress');
const timeEl = $('home-pomo-time');
const labelEl = $('home-pomo-label');
const countEl = $('home-pomo-count');
const resetButton = $('home-pomo-reset');

function render({ animateRings = false } = {}) {
  const { pomodoro } = state;
  const { status } = pomodoro;
  widget.dataset.status = status;
  setRollingText(timeEl, formatCountdown(getRemainingMs()), { countDown: true });
  setText(labelEl, POMODORO_LABELS[status] || '');
  setText(countEl, `${plural(pomodoro.completedToday, 'sesión', 'sesiones')} hoy · ${pomodoro.minutes} min`);
  resetButton.disabled = status === 'idle';
  widget.title = `${ACTIONS[status] || 'Empezar'} el Pomodoro`;
  setRing(ring, getProgress(), animateRings);
}

/** Solo cambia el tiempo y el anillo (cada segundo de la cuenta atrás). */
function renderTick() {
  setRollingText(timeEl, formatCountdown(getRemainingMs()), { countDown: true });
  setRing(ring, getProgress(), false);
}

export const focusWidget = {
  type: 'focus',
  name: 'Focus',
  description: 'El Pomodoro: un toque y a concentrarse',
  icon: 'i-w-focus',
  accent: 'var(--accent)',
  sizes: ['1x1', '2x1'],
  goto: 'focus',
  // Un toque en el widget empieza (o pausa) el Pomodoro, en lugar de abrir Focus
  tap() {
    togglePomodoro();
    animate(ringWrap, [{ scale: '1' }, { scale: '0.86' }, { scale: '1.08' }, { scale: '1' }], { duration: 460, easing: SPRING_POP });
  },
  init() {
    resetButton.addEventListener('click', (event) => {
      event.stopPropagation(); // que no cuente también como tocar el widget
      window.notch.pomodoro.reset();
    });
    onPomodoroRender(({ animateRings, tick }) => (tick ? renderTick() : render({ animateRings })));
  },
  render: () => render(),
  // Novedad: el Pomodoro terminó y aún no lo habías visto
  news: () => (state.pomodoro.status === 'finished' ? [`finished:${state.pomodoro.completedToday}`] : []),
};
