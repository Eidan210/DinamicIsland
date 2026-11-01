// =============================================================================
//  renderer/widgets/battery.js — Widget Batería
// -----------------------------------------------------------------------------
//  Un anillo con el nivel (como el widget de baterías del iPhone), el
//  porcentaje y si está cargando o cuánto queda. Amarillo con 20 % o menos y
//  rojo con 10 % o menos, si no está enchufado. Brilla al bajar de ahí.
//  Lo sabe battery.js (por eventos de Windows, sin preguntar cada X segundos).
// =============================================================================

import { $, setText, setRollingText } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { CRITICAL_LEVEL, LOW_LEVEL, onBatteryUpdate } from '../modules/battery.js';
import { setRing } from '../modules/pomodoro.js';

const widget = $('home-battery');
const ring = $('home-battery-ring');
const levelEl = $('home-battery-level');
const noteEl = $('home-battery-note');

/** 4500 s → "1:15 h"; 1200 s → "20 min" (corto: el widget es pequeño). */
function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')} h` : `${minutes} min`;
}

function batteryState({ level, charging }) {
  if (charging) return 'charging';
  if (level <= CRITICAL_LEVEL) return 'critical';
  if (level <= LOW_LEVEL) return 'low';
  return 'ok';
}

function render() {
  const { level, charging, chargingTime, dischargingTime } = state.battery;
  const percent = Math.round(level * 100);
  widget.dataset.state = batteryState(state.battery);
  widget.dataset.charging = String(charging);
  setRollingText(levelEl, `${percent} %`, { countDown: !charging });

  let note;
  if (charging && percent >= 100) note = 'Enchufado';
  else if (charging) note = Number.isFinite(chargingTime) && chargingTime > 0 ? `Llena en ${formatDuration(chargingTime)}` : 'Cargando';
  else note = Number.isFinite(dischargingTime) && dischargingTime > 0 ? `Quedan ${formatDuration(dischargingTime)}` : 'Con batería';
  setText(noteEl, note);
  widget.title = `Batería: ${percent} %${charging ? ' (cargando)' : ''}`;
  setRing(ring, level, false);
}

export const batteryWidget = {
  type: 'battery',
  name: 'Batería',
  description: 'El nivel y cuánto te queda',
  icon: 'i-battery',
  accent: 'var(--accent)',
  sizes: ['1x1'],
  goto: null,
  init() {
    onBatteryUpdate(render);
  },
  render,
  // Novedad: queda poca (sin el cargador). Al 10 % vuelve a avisar.
  news() {
    const { level, charging } = state.battery;
    if (charging) return [];
    if (level <= CRITICAL_LEVEL) return ['critical'];
    if (level <= LOW_LEVEL) return ['low'];
    return [];
  },
};
