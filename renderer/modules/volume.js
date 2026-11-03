// =============================================================================
//  renderer/modules/volume.js — El volumen de Windows en la isla
// -----------------------------------------------------------------------------
//  Cada vez que cambias el volumen (teclas, rueda, mezclador...), el WinHelper
//  avisa a main.js y nos llega aquí:
//    • Con el panel cerrado, la isla se convierte 1,5 s en una barra de volumen.
//    • Con el panel abierto, la barra sale 1,5 s en lugar de la fecha.
//  Windows 11 sigue enseñando su indicador (no se puede ocultar). Si prefieres
//  solo el de Windows: "volumeIndicator": false en settings.json.
// =============================================================================

import { $, setRollingText } from './utils.js';
import { state } from './state.js';
import { showVolume, updateShape } from './island.js';
import { onPanelChange } from './panel.js';
import { playLight } from './light.js';

const VOLUME_MS = 1500;

const volumeEl = $('volume');
const volumeValue = $('volume-value');
const topbar = $('topbar');
const topbarVolume = $('topbar-volume');
const topbarValue = $('topbar-volume-value');

let topbarTimer = null;

function renderVolume(previousLevel = state.volume.level) {
  const { level, muted } = state.volume;
  const countDown = level < previousLevel; // si baja, los números ruedan hacia abajo
  const percent = Math.round(level * 100);

  // Isla
  volumeEl.style.setProperty('--volume', String(level));
  volumeEl.dataset.muted = String(muted);
  volumeEl.dataset.level = percent === 0 ? 'zero' : level < 0.5 ? 'low' : 'high';
  setRollingText(volumeValue, String(percent), { countDown });

  // Barra superior del panel
  topbarVolume.style.setProperty('--volume', muted ? '0' : String(level));
  setRollingText(topbarValue, muted ? 'Silencio' : String(percent), { countDown });
}

/** Guarda el volumen sin enseñarlo (al arrancar). */
export function loadInitialVolume(volume) {
  if (!volume || !Number.isFinite(volume.level)) return;
  state.volume = { level: volume.level, muted: volume.muted === true };
  renderVolume();
}

function onVolumeChange(volume) {
  if (!volume || !Number.isFinite(volume.level)) return;
  const previousLevel = state.volume.level;
  state.volume = { level: Math.min(1, Math.max(0, volume.level)), muted: volume.muted === true };
  renderVolume(previousLevel);
  if (!state.settings.volumeIndicator) return;

  if (state.isExpanded) {
    topbar.classList.add('is-volume');
    clearTimeout(topbarTimer);
    topbarTimer = setTimeout(() => topbar.classList.remove('is-volume'), VOLUME_MS);
  } else {
    // Si sigues cambiándolo, la barra se queda: cada cambio le da otro 1,5 s.
    showVolume(VOLUME_MS);
    updateShape();
  }
}

export function initVolume() {
  window.notch.volume.onChange(onVolumeChange);
  onPanelChange((expanded) => {
    if (expanded) return;
    clearTimeout(topbarTimer);
    topbar.classList.remove('is-volume');
  });
}
