// =============================================================================
//  renderer/widgets/next-event.js — Widget Próximo evento con arco SVG Bézier
// -----------------------------------------------------------------------------
//  Muestra el nombre del evento en grande, cuenta relativa («en 2 h 44 min»)
//  y un arco con los eventos del día como puntos y uno brillante en la hora actual.
//  Se actualiza una vez por minuto (onClockTick).
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { onClockTick } from '../modules/clock.js';

const titleEl = $('home-event-title');
const timeEl = $('home-event-time');
const nowDot = $('home-event-now-dot');
const pointsGroup = $('home-event-points');

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

/** Calcula posición (x, y) sobre la curva cuadrática Bézier Q(10 30, 60 8, 110 30) */
function getArcPoint(t) {
  // B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
  const clampedT = Math.max(0, Math.min(1, t));
  const p0 = { x: 10, y: 30 };
  const p1 = { x: 60, y: 8 };
  const p2 = { x: 110, y: 30 };

  const x = (1 - clampedT) * (1 - clampedT) * p0.x + 2 * (1 - clampedT) * clampedT * p1.x + clampedT * clampedT * p2.x;
  const y = (1 - clampedT) * (1 - clampedT) * p0.y + 2 * (1 - clampedT) * clampedT * p1.y + clampedT * clampedT * p2.y;
  return { x: x.toFixed(1), y: y.toFixed(1) };
}

function formatRelative(minutesDiff) {
  if (minutesDiff <= 0) return 'Ahora mismo';
  if (minutesDiff < 60) return `en ${minutesDiff} min`;
  const hours = Math.floor(minutesDiff / 60);
  const remMinutes = minutesDiff % 60;
  return `en ${hours} h${remMinutes > 0 ? ` ${remMinutes} min` : ''}`;
}

function render(now = new Date()) {
  if (!titleEl) return;
  const todayDow = (now.getDay() + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Mover el punto brillante de la hora actual en el arco (de 0:00 a 24:00)
  const dayProgress = nowMinutes / (24 * 60);
  const nowPos = getArcPoint(dayProgress);
  if (nowDot) {
    nowDot.setAttribute('cx', String(nowPos.x));
    nowDot.setAttribute('cy', String(nowPos.y));
  }

  // Filtrar eventos de hoy
  const todayEvents = cachedSchedule
    .filter((e) => e.enabled && Array.isArray(e.days) && e.days.includes(todayDow))
    .map((e) => {
      const [h, m] = (e.time || '00:00').split(':').map(Number);
      return { ...e, minutes: h * 60 + m };
    })
    .sort((a, b) => a.minutes - b.minutes);

  // Pintar puntos en el arco para cada evento de hoy
  if (pointsGroup) {
    pointsGroup.replaceChildren();
    todayEvents.forEach((ev) => {
      const t = ev.minutes / (24 * 60);
      const pos = getArcPoint(t);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(pos.x));
      dot.setAttribute('cy', String(pos.y));
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', ev.minutes < nowMinutes ? 'rgba(255,255,255,0.3)' : '#fff');
      pointsGroup.appendChild(dot);
    });
  }

  // Encontrar el siguiente evento
  const upcoming = todayEvents.filter((e) => e.minutes >= nowMinutes);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    setText(titleEl, next.title);
    setText(timeEl, `${formatRelative(next.minutes - nowMinutes)} · ${next.time}`);
  } else if (todayEvents.length > 0) {
    setText(titleEl, 'Día completado');
    setText(timeEl, 'No hay más eventos hoy');
  } else {
    setText(titleEl, 'Sin eventos hoy');
    setText(timeEl, 'Configura tu horario');
  }
}

export const nextEventWidget = {
  type: 'next-event',
  name: 'Próximo evento',
  description: 'Cuenta atrás y arco del día',
  icon: 'i-w-event',
  accent: 'var(--accent)',
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
