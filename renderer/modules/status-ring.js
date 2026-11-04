// =============================================================================
//  renderer/modules/status-ring.js — Anillo de estado perimetral (Fase D)
// -----------------------------------------------------------------------------
//  Dibuja un anillo fino de 2 px alrededor de la isla que se llena según la
//  actividad más prioritaria del momento (Pomodoro, batería cargando, agua del
//  día o canción).
//
//  Con Pomodoro utiliza una sola transición CSS lineal por todo el bloque restante,
//  lo que permite que la GPU interpole el avance con 0% de CPU en reposo.
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { onBatteryUpdate } from './battery.js';
import { onMediaChange } from './music.js';

const ringEl = $('status-ring');
const progressEl = $('status-ring-progress');

let currentSource = null;
let isLinearMode = false;
let flashTimer = null;
let entranceTimer = null;
let lastProgress = 0;

/** Determina cuál es la actividad activa con prioridad para el anillo. */
export function getActiveRingActivity() {
  const settings = state.settings || {};
  if (settings.statusRing === false) return null;

  const priorities = Array.isArray(settings.statusRingPriority) && settings.statusRingPriority.length > 0
    ? settings.statusRingPriority
    : ['pomodoro', 'charging', 'water', 'music'];

  for (const p of priorities) {
    if (p === 'pomodoro') {
      if (state.pomodoro && (state.pomodoro.status === 'running' || state.pomodoro.status === 'paused')) {
        return 'pomodoro';
      }
    } else if (p === 'charging') {
      if (state.battery && state.battery.charging && state.battery.level < 1.0) {
        return 'charging';
      }
    } else if (p === 'water') {
      const water = state.water || window.__lastWaterData;
      if (water && water.currentMl > 0 && water.targetMl > 0) {
        return 'water';
      }
    } else if (p === 'music') {
      if (state.media && state.media.status === 'playing' && state.media.duration > 0) {
        return 'music';
      }
    }
  }

  return null;
}

/** Obtiene el progreso de 0 a 1 para la fuente activa. */
export function getRingProgress(source = currentSource) {
  if (source === 'pomodoro') {
    const pomo = state.pomodoro;
    if (!pomo || !pomo.durationMs) return 0;
    if (pomo.status === 'finished') return 1;
    const remaining = pomo.status === 'running' && pomo.endsAt
      ? Math.max(0, pomo.endsAt - Date.now())
      : (pomo.remainingMs || 0);
    return Math.min(1, Math.max(0, 1 - remaining / pomo.durationMs));
  }
  if (source === 'charging') {
    return Math.min(1, Math.max(0, state.battery ? state.battery.level : 0));
  }
  if (source === 'water') {
    const water = state.water || window.__lastWaterData;
    if (!water || !water.targetMl) return 0;
    return Math.min(1, Math.max(0, water.currentMl / water.targetMl));
  }
  if (source === 'music') {
    if (!state.media || !state.media.duration) return 0;
    return Math.min(1, Math.max(0, (state.media.position || 0) / state.media.duration));
  }
  return 0;
}

/** Devuelve el color reactivo según la fuente y el progreso. */
export function getRingColor(source = currentSource, progress = 0) {
  if (source === 'pomodoro') {
    if (state.pomodoro && state.pomodoro.status === 'paused') {
      return 'var(--warning, #ffc94d)';
    }
    return '#ff6347'; // acento cálido de enfoque
  }
  if (source === 'charging') {
    const level = state.battery ? state.battery.level : progress;
    if (level <= 0.10) return 'var(--danger, #ff5f57)';
    if (level <= 0.20) return 'var(--warning, #ffc94d)';
    return 'var(--accent, #3dff8f)';
  }
  if (source === 'water') {
    return '#38bdf8'; // cian agua
  }
  if (source === 'music') {
    return 'var(--art-1, #a78bfa)';
  }
  return 'var(--accent, #3dff8f)';
}

/** Dispara un solo destello brillante de 500 ms al llegar al 100 %. */
export function triggerRingFlash() {
  if (!ringEl) return;
  ringEl.classList.remove('is-flashing');
  void ringEl.offsetWidth; // fuerza el reflujo para reiniciar la animación
  ringEl.classList.add('is-flashing');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (ringEl) ringEl.classList.remove('is-flashing');
  }, 520);
}

/** Inicia el avance continuo lineal en GPU para Pomodoro (0% CPU). */
export function applyPomodoroLinearProgress(remainingMs, totalMs) {
  if (!ringEl || !progressEl) return;
  const remainingSec = Math.max(0, remainingMs / 1000);
  if (remainingSec <= 0) return;

  const currentProgress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
  const startOffset = 100 * (1 - currentProgress);

  progressEl.dataset.mode = 'paused';
  progressEl.style.strokeDashoffset = String(startOffset);
  void progressEl.offsetHeight; // reflow

  progressEl.style.setProperty('--ring-linear-duration', `${remainingSec}s`);
  progressEl.dataset.mode = 'linear';
  progressEl.style.strokeDashoffset = '0';
  isLinearMode = true;
}

/** Congela instantáneamente la transición lineal al pausar. */
export function freezePomodoroLinearProgress() {
  if (!ringEl || !progressEl) return;
  if (isLinearMode) {
    try {
      const computedOffset = parseFloat(getComputedStyle(progressEl).strokeDashoffset);
      progressEl.dataset.mode = 'paused';
      if (!Number.isNaN(computedOffset)) {
        progressEl.style.strokeDashoffset = String(computedOffset);
      }
    } catch {
      progressEl.dataset.mode = 'paused';
    }
    isLinearMode = false;
  }
}

/** Actualiza el anillo de estado y sus transiciones. */
export function updateStatusRing({ animateEntrance = false } = {}) {
  if (!ringEl || !progressEl) return;

  const newSource = getActiveRingActivity();
  const wasNull = currentSource === null;
  const isNowActive = newSource !== null;

  currentSource = newSource;

  if (!isNowActive) {
    ringEl.dataset.active = 'false';
    isLinearMode = false;
    return;
  }

  ringEl.dataset.active = 'true';

  if (wasNull || animateEntrance) {
    ringEl.dataset.entering = 'true';
    clearTimeout(entranceTimer);
    entranceTimer = setTimeout(() => {
      if (ringEl) ringEl.dataset.entering = 'false';
    }, 650);
  }

  const progress = getRingProgress(newSource);
  const color = getRingColor(newSource, progress);
  progressEl.style.setProperty('--ring-color', color);

  if (newSource === 'pomodoro' && state.pomodoro?.status === 'running') {
    // Si Pomodoro está corriendo y no estamos aún en modo lineal, aplicamos la transición lineal
    if (!isLinearMode) {
      const remaining = state.pomodoro.endsAt
        ? Math.max(0, state.pomodoro.endsAt - Date.now())
        : (state.pomodoro.remainingMs || 0);
      applyPomodoroLinearProgress(remaining, state.pomodoro.durationMs || remaining);
    }
  } else if (newSource === 'pomodoro' && state.pomodoro?.status === 'paused') {
    freezePomodoroLinearProgress();
  } else {
    // Fuentes con transiciones estándar de 400 ms (batería, agua, música)
    isLinearMode = false;
    progressEl.dataset.mode = 'normal';
    const targetOffset = 100 * (1 - progress);
    progressEl.style.strokeDashoffset = String(targetOffset);
  }

  // Si recién alcanzó el 100 % (o 1.0) y antes no lo estaba, destello
  if (progress >= 0.999 && lastProgress < 0.999) {
    triggerRingFlash();
  }
  lastProgress = progress;
}

/** Inicializa los oyentes para mantener actualizado el anillo de estado. */
export function initStatusRing() {
  updateStatusRing({ animateEntrance: true });

  onBatteryUpdate(() => updateStatusRing());
  onMediaChange(() => updateStatusRing());

  // Escuchar cambios de agua
  if (window.notch?.water?.onChange) {
    window.notch.water.onChange((data) => {
      if (data) {
        window.__lastWaterData = data;
        state.water = data;
        updateStatusRing();
      }
    });
  }
}
