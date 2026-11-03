// =============================================================================
//  renderer/modules/battery.js — La batería del portátil
// -----------------------------------------------------------------------------
//  Usa la API de batería de Chromium (navigator.getBattery), que avisa con
//  eventos cuando cambia el nivel o cuando enchufas o desenchufas el cargador:
//  nada de preguntar cada X segundos.
//    • Barra superior del panel: la pila del iPhone, con el porcentaje dentro
//      (si no está llena y enchufada).
//    • Mini-muesca y píldora: la pila, solo cuando queda poca y no está cargando.
//    • Aviso en la isla al bajar del 20 % y del 10 % sin el cargador.
//    • El widget de Home (renderer/widgets/battery.js) se entera con onBatteryUpdate.
// =============================================================================

import { $, setRollingText } from './utils.js';
import { state } from './state.js';
import { addLocalNotice } from './notices.js';
import { updateShape, showCharging } from './island.js';
import { testLight } from './light.js';

const LOW_LEVEL = 0.2; // 20 %
const CRITICAL_LEVEL = 0.1; // 10 %

const batteryEl = $('battery');
// El número va dos veces dentro de la pila: claro (sobre lo vacío) y oscuro,
// recortado justo donde llega la carga (ver index.html).
const batteryText = $('battery-text');
const batteryTextFill = $('battery-text-fill');
const statusBattery = $('status-battery');
const statusBatteryText = $('status-battery-text');
const chargingPercent = $('charging-percent');
const chargingBatteryLevel = $('charging-battery-level');
const chargingLabel = $('charging-label');

let battery = null;
const warned = { low: false, critical: false }; // para avisar solo una vez de cada
const updateListeners = [];
let previousCharging = null;

export { LOW_LEVEL, CRITICAL_LEVEL };

/** Avisa a `listener()` cada vez que cambia la batería (nivel, cargador o tiempo restante). */
export function onBatteryUpdate(listener) {
  updateListeners.push(listener);
}

function getBatteryState({ level, charging }) {
  if (charging) return 'charging';
  if (level <= CRITICAL_LEVEL) return 'critical';
  if (level <= LOW_LEVEL) return 'low';
  return 'ok';
}

function renderBattery() {
  const { level, charging } = state.battery;
  const percent = Math.round(level * 100);
  const batteryState = getBatteryState(state.battery);

  // Barra superior del panel. Llena y enchufada no hay nada que contar (y así
  // tampoco sale en un PC de sobremesa, que no tiene batería).
  batteryEl.hidden = charging && percent >= 100;
  batteryEl.dataset.state = batteryState;
  batteryEl.style.setProperty('--level', String(level));
  batteryEl.title = `Batería: ${percent} %${charging ? ' (cargando)' : ''}`;
  batteryText.textContent = String(percent);
  batteryTextFill.textContent = String(percent);

  // Mini-muesca y píldora
  statusBattery.classList.toggle('is-on', !charging && level <= LOW_LEVEL);
  statusBattery.dataset.state = batteryState;
  statusBattery.style.setProperty('--level', String(level));
  setRollingText(statusBatteryText, `${percent}%`, { countDown: !charging });
  if (chargingPercent) chargingPercent.textContent = `${percent}%`;
  if (chargingBatteryLevel) chargingBatteryLevel.setAttribute('width', String(Math.max(2, Math.round(percent * 0.26))));
  if (chargingLabel) chargingLabel.textContent = 'Conectado';
}

function checkWarnings() {
  const { level, charging } = state.battery;
  if (charging) {
    // Enchufado: la próxima vez que baje, volveremos a avisar.
    warned.low = false;
    warned.critical = false;
    return;
  }
  const percent = Math.round(level * 100);
  if (level <= CRITICAL_LEVEL && !warned.critical) {
    warned.critical = true;
    warned.low = true;
    testLight('batteryLow');
    addLocalNotice({
      key: 'battery',
      kind: 'battery',
      tone: 'danger',
      title: 'Batería muy baja',
      text: `Queda un ${percent} %. Conecta el cargador ya.`,
      alert: true,
    });
  } else if (level <= LOW_LEVEL && !warned.low) {
    warned.low = true;
    addLocalNotice({
      key: 'battery',
      kind: 'battery',
      tone: 'warning',
      title: 'Batería baja',
      text: `Queda un ${percent} %. Conecta el cargador.`,
      alert: true,
    });
  }
}

function onBatteryChange() {
  if (previousCharging !== null && previousCharging !== battery.charging) {
    if (battery.charging) {
      showCharging(2600);
      testLight('chargerConnected');
    }
    else testLight('chargerDisconnected');
  }
  previousCharging = battery.charging;
  state.battery = {
    level: battery.level,
    charging: battery.charging,
    // Segundos para llenarse o para vaciarse (Infinity si Windows aún no lo sabe)
    chargingTime: battery.chargingTime,
    dischargingTime: battery.dischargingTime,
  };
  renderBattery();
  checkWarnings();
  updateShape(); // con poca batería, Clawd se ve cansado
  updateListeners.forEach((listener) => listener());
}

export async function initBattery() {
  if (typeof navigator.getBattery !== 'function') return; // sin API de batería: no enseñamos nada
  try {
    battery = await navigator.getBattery();
  } catch {
    return;
  }
  battery.addEventListener('levelchange', onBatteryChange);
  battery.addEventListener('chargingchange', onBatteryChange);
  battery.addEventListener('chargingtimechange', onBatteryChange);
  battery.addEventListener('dischargingtimechange', onBatteryChange);
  onBatteryChange();
}


// Para probar la animación de carga estilo Apple en consola
window.__notchTestCharging = (percent = 85) => {
  state.battery = { ...state.battery, level: percent / 100, charging: true };
  renderBattery();
  showCharging(2600);
  testLight('chargerConnected');
};
