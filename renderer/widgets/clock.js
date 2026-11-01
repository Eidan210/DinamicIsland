// =============================================================================
//  renderer/widgets/clock.js — Widget Reloj: esfera con agujas, hora y fecha
// -----------------------------------------------------------------------------
//  1x1: la esfera, la hora y la fecha corta ("Sáb, 1 nov").
//  2x1: la fecha completa y cuánto falta para que Clawd se despida
//       (la hora de "clawdByeTime" en settings.json).
//  No tiene temporizador propio: se mueve con el reloj de la barra superior
//  (clock.js), que solo corre con el panel abierto.
// =============================================================================

import { $, setText, setRollingText, capitalize } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { onClockTick } from '../modules/clock.js';

const timeEl = $('home-clock-time');
const periodEl = $('home-clock-period');
const dateEl = $('home-clock-date');
const longDateEl = $('home-clock-long');
const byeEl = $('home-clock-bye');
const hands = { hour: $('home-clock-hour'), minute: $('home-clock-minute'), second: $('home-clock-second') };

let formatters = null;
let formattersKey = '';

/** Los formateadores de hora y fecha, con el idioma de settings.json (crearlos es lo caro). */
function getFormatters() {
  const { locale, hour12 } = state.settings;
  const key = `${locale}|${hour12}`;
  if (formatters && key === formattersKey) return formatters;
  const make = (language) => ({
    time: new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit', hour12 }),
    short: new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }),
    long: new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }),
  });
  try {
    formatters = make(locale);
  } catch {
    formatters = make('es-ES'); // un "locale" mal escrito (ya avisa clock.js)
  }
  formattersKey = key;
  return formatters;
}

/** "Clawd se despide en 2 h 15 min" (o nada, si no hay hora de despedida). */
function byeText(now) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(state.settings.clawdByeTime || '');
  if (!match || state.settings.clawd === false) return '';
  const bye = new Date(now);
  bye.setHours(Number(match[1]), Number(match[2]), 0, 0);
  const minutes = Math.ceil((bye - now) / 60000);
  if (minutes <= 0) return 'Clawd ya se despidió hoy';
  const hours = Math.floor(minutes / 60);
  return `Clawd se despide en ${hours ? `${hours} h ` : ''}${minutes % 60} min`;
}

/** Gira una aguja (en grados, desde las 12). Solo toca el SVG si cambió. */
function setHand(hand, degrees) {
  const value = `rotate(${degrees.toFixed(1)} 24 24)`;
  if (hand.getAttribute('transform') !== value) hand.setAttribute('transform', value);
}

function render(now = new Date()) {
  const { time, short, long } = getFormatters();
  // formatToParts separa la hora del "a. m. / p. m." (que va más pequeño)
  const parts = {};
  for (const part of time.formatToParts(now)) parts[part.type] = part.value;
  setRollingText(timeEl, `${parts.hour}:${parts.minute}`);
  setText(periodEl, parts.dayPeriod ? ` ${parts.dayPeriod}` : '');
  setText(dateEl, capitalize(short.format(now)));
  setText(longDateEl, capitalize(long.format(now)));
  setText(byeEl, byeText(now));

  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  setHand(hands.second, seconds * 6);
  setHand(hands.minute, minutes * 6);
  setHand(hands.hour, ((now.getHours() % 12) + minutes / 60) * 30);
}

export const clockWidget = {
  type: 'clock',
  name: 'Reloj',
  description: 'La hora con agujas y la fecha',
  icon: 'i-w-clock',
  accent: 'var(--info)',
  sizes: ['1x1', '2x1'],
  goto: null,
  init() {
    onClockTick(render);
  },
  render: () => render(),
  news: () => [],
};
