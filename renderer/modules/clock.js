// =============================================================================
//  renderer/modules/clock.js — Fecha y hora en vivo (barra superior del panel)
// -----------------------------------------------------------------------------
//  Solo corre con el panel abierto. Se actualiza una vez por segundo, justo
//  cuando cambia el segundo (así nunca va "atrasado" medio segundo).
// =============================================================================

import { $, setText, capitalize } from './utils.js';
import { state } from './state.js';
import { onPanelChange } from './panel.js';

const dateEl = $('date');
const clockMainEl = $('clock-main');
const clockSecondsEl = $('clock-seconds');

let dateFormatter = null;
let timeFormatter = null;
let clockTimer = null;

/** Crea los formateadores de fecha/hora con el idioma de settings.json (crearlos es lo caro). */
function createFormatters() {
  const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: state.settings.hour12 };
  try {
    dateFormatter = new Intl.DateTimeFormat(state.settings.locale, dateOptions);
    timeFormatter = new Intl.DateTimeFormat(state.settings.locale, timeOptions);
  } catch {
    // Un "locale" mal escrito en settings.json (p. ej. "es_ES") lanza error.
    console.warn(`Idioma no válido en settings.json: "${state.settings.locale}". Uso es-ES.`);
    dateFormatter = new Intl.DateTimeFormat('es-ES', dateOptions);
    timeFormatter = new Intl.DateTimeFormat('es-ES', timeOptions);
  }
}

function renderClock() {
  const now = new Date();

  // "sábado, 31 de octubre" → "Sábado, 31 de octubre"
  setText(dateEl, capitalize(dateFormatter.format(now)));

  // formatToParts separa horas, minutos, segundos y a. m./p. m. para poder
  // pintar los segundos más tenues que la hora.
  const parts = {};
  for (const part of timeFormatter.formatToParts(now)) parts[part.type] = part.value;

  setText(clockMainEl, `${parts.hour}:${parts.minute}`);
  setText(clockSecondsEl, `:${parts.second}` + (parts.dayPeriod ? ` ${parts.dayPeriod}` : ''));
}

function startClock() {
  stopClock();
  const tick = () => {
    renderClock();
    // Esperamos justo hasta el siguiente cambio de segundo (1 vez por segundo).
    clockTimer = setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

function stopClock() {
  clearTimeout(clockTimer);
  clockTimer = null;
}

/** Al arrancar y cada vez que cambia settings.json (idioma, formato de 12 h). */
export function applyClockSettings() {
  createFormatters();
  if (state.isExpanded) renderClock();
}

export function initClock() {
  // Con el panel cerrado el reloj no se ve: no gastamos nada.
  onPanelChange((expanded) => (expanded ? startClock() : stopClock()));
}
