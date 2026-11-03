// =============================================================================
//  renderer/widgets/world-clock.js — Widget Reloj mundial: dos ciudades
// -----------------------------------------------------------------------------
//  Muestra la hora en dos ciudades configurables (Bogotá y Madrid por defecto)
//  utilizando Intl.DateTimeFormat con su respectivo timeZone.
//  Indica el nombre de la ciudad, la hora actual y la diferencia horaria relativa.
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { onClockTick } from '../modules/clock.js';

const city1NameEl = $('home-city1-name');
const city1TimeEl = $('home-city1-time');
const city1OffsetEl = $('home-city1-offset');

const city2NameEl = $('home-city2-name');
const city2TimeEl = $('home-city2-time');
const city2OffsetEl = $('home-city2-offset');

function cleanCityName(tz) {
  if (!tz) return 'Ciudad';
  const parts = tz.split('/');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

function getOffsetString(tz, now) {
  try {
    const localOffset = -now.getTimezoneOffset(); // minutos locales respecto a UTC
    // Obtener la hora UTC y la hora de la zona para calcular la diferencia en horas
    const invDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const diffMs = invDate.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));

    if (diffHours === 0) return 'Local';
    return `${diffHours > 0 ? '+' : ''}${diffHours} h`;
  } catch {
    return '';
  }
}

function formatCityTime(tz, now, hour12) {
  try {
    const formatter = new Intl.DateTimeFormat('es-ES', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: Boolean(hour12),
    });
    return formatter.format(now);
  } catch {
    return '--:--';
  }
}

function render(now = new Date()) {
  if (!city1NameEl || !city2NameEl) return;
  const cities = state.settings?.worldClockCities || ['America/Bogota', 'Europe/Madrid'];
  const hour12 = state.settings?.hour12;

  const tz1 = cities[0] || 'America/Bogota';
  const tz2 = cities[1] || 'Europe/Madrid';

  setText(city1NameEl, cleanCityName(tz1));
  setText(city1TimeEl, formatCityTime(tz1, now, hour12));
  setText(city1OffsetEl, getOffsetString(tz1, now));

  setText(city2NameEl, cleanCityName(tz2));
  setText(city2TimeEl, formatCityTime(tz2, now, hour12));
  setText(city2OffsetEl, getOffsetString(tz2, now));
}

export const worldClockWidget = {
  type: 'world-clock',
  name: 'Reloj mundial',
  description: 'Dos ciudades y sus husos horarios',
  icon: 'i-w-world',
  accent: 'var(--info)',
  sizes: ['2x1', '1x1'],
  goto: null,
  init() {
    onClockTick((now) => render(now));
  },
  render: () => render(),
  news: () => [],
};
