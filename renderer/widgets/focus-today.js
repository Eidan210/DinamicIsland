// =============================================================================
//  renderer/widgets/focus-today.js — Widget Focus de hoy: avance hacia tu meta diaria
// -----------------------------------------------------------------------------
//  Muestra los minutos de concentración acumulados hoy (focus-stats.js) y el
//  avance en el anillo hacia la meta diaria configurable (120 min por defecto).
//  Al tocarlo, abre la pestaña Focus (Ctrl+Alt+4).
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { setRing } from '../modules/pomodoro.js';

const minutesEl = $('home-focus-today-minutes');
const targetEl = $('home-focus-today-target');
const countEl = $('home-focus-today-count');
const ringEl = $('home-focus-today-ring');

let cachedStats = { todayMinutes: 0, completedSessions: 0 };

async function loadStats() {
  if (window.notch?.focusStats?.get) {
    try {
      const res = await window.notch.focusStats.get();
      if (res) cachedStats = res;
    } catch {
      // Ignorar errores
    }
  }
}

function render() {
  if (!minutesEl) return;
  const target = state.settings?.focusTargetMinutes || 120;
  const minutes = cachedStats.todayMinutes || 0;
  const sessions = cachedStats.completedSessions || 0;
  const progress = Math.min(1, Math.max(0, minutes / target));

  setText(minutesEl, `${minutes} min`);
  setText(targetEl, `Meta: ${target} min (${Math.round(progress * 100)}%)`);
  setText(countEl, `${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'} hoy`);

  if (ringEl) {
    setRing(ringEl, progress, false);
  }
}

export const focusTodayWidget = {
  type: 'focus-today',
  name: 'Focus de hoy',
  description: 'Minutos acumulados hacia tu meta diaria',
  icon: 'i-w-focus',
  accent: 'var(--accent)',
  sizes: ['1x1', '2x1'],
  goto: 'focus',
  init() {
    loadStats().then(() => render());
    if (window.notch?.focusStats?.onChange) {
      window.notch.focusStats.onChange((data) => {
        if (data) cachedStats = data;
        render();
      });
    }
  },
  render: () => render(),
  news: () => [],
};
