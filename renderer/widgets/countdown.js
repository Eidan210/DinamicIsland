// =============================================================================
//  renderer/widgets/countdown.js — Widget Cuenta regresiva hacia tu evento
// -----------------------------------------------------------------------------
//  Muestra los días que faltan hacia una fecha configurable (countdownDate)
//  con el nombre del evento (countdownTitle, ej. «Fin de Campuslands»).
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { onClockTick } from '../modules/clock.js';

const daysEl = $('home-countdown-days');
const titleEl = $('home-countdown-title');

function calculateDaysLeft(targetIso, now) {
  if (!targetIso) return null;
  const [y, m, d] = targetIso.split('-').map(Number);
  const target = new Date(y, m - 1, d, 0, 0, 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const diffMs = target.getTime() - startOfToday.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return diffDays;
}

function render(now = new Date()) {
  if (!daysEl) return;
  const targetDate = state.settings?.countdownDate || '2026-12-31';
  const title = state.settings?.countdownTitle || 'Fin de Campuslands';

  const days = calculateDaysLeft(targetDate, now);

  if (days === null || Number.isNaN(days)) {
    setText(daysEl, '-- días');
  } else if (days < 0) {
    const passed = Math.abs(days);
    setText(daysEl, `Hace ${passed} d`);
  } else if (days === 0) {
    setText(daysEl, '¡Es hoy!');
  } else {
    setText(daysEl, `${days} días`);
  }

  setText(titleEl, title);
}

export const countdownWidget = {
  type: 'countdown',
  name: 'Cuenta regresiva',
  description: 'Días que faltan hacia tu evento especial',
  icon: 'i-w-countdown',
  accent: '#A855F7',
  sizes: ['1x1', '2x1'],
  goto: null,
  init() {
    onClockTick((now) => render(now));
  },
  render: () => render(),
  news: () => [],
};
