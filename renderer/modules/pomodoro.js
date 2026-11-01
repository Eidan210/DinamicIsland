// =============================================================================
//  renderer/modules/pomodoro.js — Dibujar el Pomodoro
// -----------------------------------------------------------------------------
//  El temporizador "de verdad" vive en main/pomodoro.js. Aquí solo lo dibujamos
//  en cuatro sitios: la pestaña Focus, la tarjeta de Home, la isla (actividad
//  en vivo) y su burbuja (si otra actividad ocupa la isla). Con `endsAt`
//  calculamos el tiempo restante nosotros mismos.
// =============================================================================

import { $, animate, setText, setRollingText, formatCountdown, plural, SPRING, SPRING_POP } from './utils.js';
import { state } from './state.js';
import { getActivities, onShapeChange, updateShape } from './island.js';
import { onPanelChange } from './panel.js';

const POMODORO_LABELS = { idle: 'Listo', running: 'Enfocado', paused: 'En pausa', finished: '¡Hecho!' };
const POMODORO_BUTTON = { idle: 'Iniciar', running: 'Pausar', paused: 'Seguir', finished: 'Otra vez' };
const STEP_MINUTES = 5;
const MAX_MINUTES = 180;
const CELEBRATION_MS = 5000;

const island = $('island');
// Pestaña Focus...
const pomodoroEl = $('pomodoro');
const pomoRingWrap = $('pomo-ring-wrap');
const pomoProgress = $('pomo-progress');
const pomoTime = $('pomo-time');
const pomoLabel = $('pomo-label');
const pomoMinutes = $('pomo-minutes');
const pomoMinus = $('pomo-minus');
const pomoPlus = $('pomo-plus');
const pomoToggle = $('pomo-toggle');
const pomoToggleText = $('pomo-toggle-text');
const pomoReset = $('pomo-reset');
const pomoCount = $('pomo-count');
// ...tarjeta de Home...
const homePomoProgress = $('home-pomo-progress');
const homePomoTime = $('home-pomo-time');
const homePomoLabel = $('home-pomo-label');
const homePomoToggle = $('home-pomo-toggle');
// ...la isla y su burbuja.
const activityProgress = $('activity-progress');
const activityText = $('activity-text');
const bubbleProgress = $('bubble-pomo-progress');

let pomodoroTicker = null;

function getRemainingMs(pomodoro = state.pomodoro) {
  if (pomodoro.status === 'running' && pomodoro.endsAt) return Math.max(0, pomodoro.endsAt - Date.now());
  return pomodoro.remainingMs;
}

/** Cuánto llevas, de 0 (nada) a 1 (terminado). */
function getProgress(pomodoro = state.pomodoro) {
  if (pomodoro.status === 'finished') return 1;
  if (!pomodoro.durationMs) return 0;
  return Math.min(1, Math.max(0, 1 - getRemainingMs(pomodoro) / pomodoro.durationMs));
}

/** main.js nos manda el estado nuevo cada vez que cambia. */
function onPomodoroState(newState) {
  const previous = state.pomodoro;
  state.pomodoro = newState;
  // Si el progreso salta (reinicio, cambio de duración...), el anillo se anima.
  const jumped = Math.abs(getProgress(previous) - getProgress(newState)) > 0.02;
  renderPomodoro({ animateRings: jumped });
  if (previous.status === 'running' && newState.status === 'finished') celebrate();
  updateShape();
}

/** Dibuja el Pomodoro completo (textos, botones y anillos). */
export function renderPomodoro({ animateRings = false } = {}) {
  const { pomodoro } = state;
  const { status } = pomodoro;
  const time = formatCountdown(getRemainingMs());
  const label = POMODORO_LABELS[status] || '';
  const running = status === 'running';
  const locked = running || status === 'paused'; // a mitad de sesión no se cambia la duración

  // Pestaña Focus
  pomodoroEl.dataset.status = status;
  setRollingText(pomoTime, time, { countDown: true });
  setText(pomoLabel, label);
  setText(pomoMinutes, `${pomodoro.minutes} min`);
  setText(pomoCount, `${plural(pomodoro.completedToday, 'sesión', 'sesiones')} hoy`);
  setText(pomoToggleText, POMODORO_BUTTON[status] || 'Iniciar');
  pomoToggle.dataset.running = String(running);
  pomoToggle.classList.toggle('is-running', running);
  pomoReset.disabled = status === 'idle';
  pomoMinus.disabled = locked || pomodoro.minutes <= STEP_MINUTES;
  pomoPlus.disabled = locked || pomodoro.minutes >= MAX_MINUTES;

  // Tarjeta de Home
  setRollingText(homePomoTime, time, { countDown: true });
  setText(homePomoLabel, label);
  homePomoToggle.dataset.running = String(running);
  homePomoToggle.setAttribute('aria-label', running ? 'Pausar Pomodoro' : 'Iniciar Pomodoro');

  // Isla
  setRollingText(activityText, status === 'finished' ? '¡Listo!' : time, { countDown: true });

  setRings(getProgress(), animateRings);
}

/** Lo único que cambia cada segundo: el tiempo y los anillos. */
function renderPomodoroTick() {
  const time = formatCountdown(getRemainingMs());
  // Los dígitos que cambian ruedan hacia abajo (es una cuenta atrás).
  setRollingText(pomoTime, time, { countDown: true });
  setRollingText(homePomoTime, time, { countDown: true });
  setRollingText(activityText, time, { countDown: true });
  setRings(getProgress(), false);
}

function setRings(progress, withAnimation) {
  [pomoProgress, homePomoProgress, activityProgress, bubbleProgress].forEach((ring) =>
    setRing(ring, progress, withAnimation)
  );
}

/**
 * Pinta un anillo de progreso. Gracias a pathLength="100" en el HTML,
 * stroke-dashoffset 100 = vacío y 0 = completo.
 */
function setRing(circle, progress, withAnimation) {
  const offset = 100 * (1 - progress);
  const previousOffset = Number(circle.dataset.offset ?? 100);
  circle.dataset.offset = String(offset);
  circle.style.strokeDashoffset = String(offset);

  if (withAnimation && Math.abs(previousOffset - offset) > 1) {
    circle.classList.remove('is-empty');
    const animation = animate(circle, [{ strokeDashoffset: previousOffset }, { strokeDashoffset: offset }], {
      duration: 750,
      easing: SPRING,
    });
    if (animation) {
      // Al terminar, si se quedó a 0 %, ocultamos el puntito que dejaría.
      animation.onfinish = () => circle.classList.toggle('is-empty', Number(circle.dataset.offset) >= 99.9);
      return;
    }
  }
  circle.classList.toggle('is-empty', progress <= 0.001);
}

/**
 * Cuenta atrás en pantalla. Solo funciona si el Pomodoro está en marcha Y se
 * ve (panel abierto, o la isla o una burbuja con él): si no se ve, no gasta nada.
 */
function updatePomodoroTicker() {
  const visible = state.isExpanded || (state.shape === 'activity' && getActivities().includes('pomodoro'));
  if (state.pomodoro.status !== 'running' || !visible) {
    clearTimeout(pomodoroTicker);
    pomodoroTicker = null;
    return;
  }
  if (pomodoroTicker) return; // ya está en marcha

  const tick = () => {
    renderPomodoroTick();
    const remaining = getRemainingMs();
    if (remaining <= 0) {
      pomodoroTicker = null; // main.js nos avisará de que terminó
      return;
    }
    // Esperamos justo hasta que cambie el segundo de la cuenta atrás (+20 ms de margen).
    pomodoroTicker = setTimeout(tick, (remaining % 1000 || 1000) + 20);
  };
  tick();
}

/** ¡Pomodoro terminado! Ojos felices, rebote y destello verde. */
function celebrate() {
  state.celebrateUntil = Date.now() + CELEBRATION_MS;
  updateShape(); // la isla muestra "¡Listo!" aunque estuviera encogida

  animate(island, [{ scale: '1' }, { scale: '1.12' }, { scale: '0.97' }, { scale: '1' }], {
    duration: 650,
    delay: 300,
    easing: 'ease-out',
  });
  animate(
    island,
    [{ boxShadow: '0 0 0 0 rgba(61, 255, 143, 0.6)' }, { boxShadow: '0 0 0 18px rgba(61, 255, 143, 0)' }],
    { duration: 1000, delay: 300, iterations: 2 }
  );
  if (state.isExpanded) {
    animate(pomoRingWrap, [{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 600, easing: SPRING_POP });
  }
}

function togglePomodoro() {
  if (state.pomodoro.status === 'running') window.notch.pomodoro.pause();
  else window.notch.pomodoro.start();
}

/** Botones − / +: de 5 en 5 minutos (entre 5 y 180). */
function changeMinutes(direction) {
  const current = state.pomodoro.minutes;
  const next =
    direction > 0
      ? Math.floor(current / STEP_MINUTES) * STEP_MINUTES + STEP_MINUTES
      : Math.ceil(current / STEP_MINUTES) * STEP_MINUTES - STEP_MINUTES;
  window.notch.pomodoro.setMinutes(Math.min(MAX_MINUTES, Math.max(STEP_MINUTES, next)));
  // El número entra desde arriba o desde abajo, según subas o bajes.
  animate(
    pomoMinutes,
    [
      { transform: `translateY(${direction > 0 ? 7 : -7}px)`, opacity: 0.2 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 280, easing: SPRING }
  );
}

export function initPomodoro() {
  pomoToggle.addEventListener('click', togglePomodoro);
  pomoReset.addEventListener('click', () => window.notch.pomodoro.reset());
  pomoMinus.addEventListener('click', () => changeMinutes(-1));
  pomoPlus.addEventListener('click', () => changeMinutes(1));
  homePomoToggle.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente también como clic en la tarjeta
    togglePomodoro();
  });

  window.notch.pomodoro.onChange(onPomodoroState);
  onPanelChange((expanded) => {
    if (expanded) renderPomodoro();
  });
  // Cada vez que la isla cambia de forma, la cuenta atrás se enciende o se apaga.
  onShapeChange(updatePomodoroTicker);
}
