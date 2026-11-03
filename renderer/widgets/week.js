// =============================================================================
//  renderer/widgets/week.js — Widget Esta semana: los 7 días y tu próximo evento
// -----------------------------------------------------------------------------
//  Muestra los 7 días (L M X J V S D) con su número de mes. El día actual
//  destacado con un círculo de acento.
//  Debajo: «Todo listo por hoy» o «Próximo: {título} a las {hora}».
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { onClockTick } from '../modules/clock.js';

const daysEl = $('home-week-days');
const eventEl = $('home-week-event');

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

let cachedSchedule = [];

async function loadSchedule() {
  if (window.notch?.schedule?.get) {
    try {
      const state = await window.notch.schedule.get();
      cachedSchedule = state?.events || [];
    } catch {
      cachedSchedule = [];
    }
  }
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // ajustar cuando el domingo es 0
  return new Date(date.setDate(diff));
}

function formatNextEvent(now) {
  if (!cachedSchedule || cachedSchedule.length === 0) return 'Todo listo por hoy';
  const todayDow = (now.getDay() + 6) % 7; // 0=Lunes..6=Domingo
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Buscar eventos activos hoy que aún no hayan pasado
  const upcomingToday = cachedSchedule
    .filter((e) => e.enabled && Array.isArray(e.days) && e.days.includes(todayDow))
    .map((e) => {
      const [h, m] = (e.time || '00:00').split(':').map(Number);
      return { ...e, minutes: h * 60 + m };
    })
    .filter((e) => e.minutes >= nowMinutes)
    .sort((a, b) => a.minutes - b.minutes);

  if (upcomingToday.length > 0) {
    const next = upcomingToday[0];
    return `Próximo: ${next.title} (${next.time})`;
  }

  return 'Todo listo por hoy';
}

function render(now = new Date()) {
  if (!daysEl) return;
  const monday = getMonday(now);
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();

  daysEl.replaceChildren();

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = d.getDate() === todayDate && d.getMonth() === todayMonth;

    const cell = document.createElement('div');
    cell.className = `week-col${isToday ? ' is-today' : ''}`;

    const letter = document.createElement('span');
    letter.className = 'week-letter';
    letter.textContent = DAY_LETTERS[i];

    const num = document.createElement('span');
    num.className = 'week-num';
    num.textContent = String(d.getDate());

    cell.append(letter, num);
    daysEl.append(cell);
  }

  setText(eventEl, formatNextEvent(now));
}

export const weekWidget = {
  type: 'week',
  name: 'Esta semana',
  description: 'Los 7 días y tu próximo evento',
  icon: 'i-w-week',
  accent: 'var(--info)',
  sizes: ['2x1', '1x1'],
  goto: null,
  init() {
    loadSchedule();
    if (window.notch?.schedule?.onChange) {
      window.notch.schedule.onChange(() => {
        loadSchedule().then(() => render());
      });
    }
    onClockTick((now) => render(now));
  },
  render: () => render(),
  news: () => [],
};
