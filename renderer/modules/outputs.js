// =============================================================================
//  renderer/modules/outputs.js — Elegir la salida de audio (página Música)
// -----------------------------------------------------------------------------
//  El botón de la derecha de los controles abre la lista de salidas
//  (altavoces, auriculares, la tele por HDMI...). La predeterminada lleva un
//  ✓. Al elegir otra, main.js se lo pide al WinHelper; mientras Windows la
//  cambia, sale un círculo girando.
//  Si no hay helper (o es antiguo), el botón no aparece.
// =============================================================================

import { $ } from './utils.js';
import { onPanelChange } from './panel.js';
import { onTabChange } from './tabs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const panelEl = document.querySelector('.panel');
const button = $('media-output');
const buttonIcon = button.querySelector('use');
const popover = $('outputs');
const listEl = $('outputs-list');

let audio = { devices: [], pendingId: null };

/** Un icono según el nombre: auriculares, pantalla (HDMI) o altavoz. */
function iconFor(name = '') {
  if (/auricular|headphone|headset|casco|earbud|buds|airpods/i.test(name)) return 'i-headphones';
  if (/hdmi|displayport|monitor|pantalla|display|\btv\b|televisor/i.test(name)) return 'i-monitor';
  return 'i-speaker';
}

function createIcon(id, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

/** main.js nos manda la lista cada vez que cambia. */
export function setAudioState(next) {
  audio = {
    devices: Array.isArray(next?.devices) ? next.devices : [],
    pendingId: next?.pendingId || null,
  };
  renderOutputs();
}

function renderOutputs() {
  const current = audio.devices.find((device) => device.isDefault);
  button.hidden = audio.devices.length === 0;
  button.title = current ? `Salida de audio: ${current.name}` : 'Salida de audio';
  buttonIcon.setAttribute('href', `#${iconFor(current?.name)}`);
  listEl.replaceChildren(...audio.devices.map(createOutputItem));
  if (button.hidden) closeOutputs();
}

function createOutputItem(device) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'output';
  item.classList.toggle('is-default', device.isDefault);
  item.classList.toggle('is-pending', device.id === audio.pendingId);
  item.disabled = Boolean(audio.pendingId);
  item.setAttribute('aria-pressed', String(device.isDefault));

  const name = document.createElement('span');
  name.className = 'output-name';
  name.textContent = device.name; // textContent: el nombre nunca se interpreta como HTML
  item.append(createIcon(iconFor(device.name), 'output-icon'), name, createIcon('i-check-mark', 'output-check'));

  item.addEventListener('click', (event) => {
    // La lista se vuelve a dibujar al cambiar la salida: que el clic no llegue
    // al documento (lo tomaría por un "clic fuera" y cerraría la lista).
    event.stopPropagation();
    if (!device.isDefault && !audio.pendingId) window.notch.audio.setOutput(device.id);
  });
  return item;
}

function isOpen() {
  return popover.classList.contains('is-open');
}

/** La lista se abre hacia arriba, con su borde derecho alineado con el botón. */
function placeOutputs() {
  const panelRect = panelEl.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  popover.style.setProperty('--anchor-right', `${Math.round(panelRect.right - rect.right)}px`);
  popover.style.setProperty('--anchor-bottom', `${Math.round(panelRect.bottom - rect.top + 6)}px`);
}

function openOutputs() {
  placeOutputs();
  popover.classList.add('is-open');
  button.setAttribute('aria-expanded', 'true');
}

function closeOutputs() {
  if (!isOpen()) return;
  popover.classList.remove('is-open');
  button.setAttribute('aria-expanded', 'false');
}

export function initOutputs() {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente como "clic fuera" de la lista
    if (isOpen()) closeOutputs();
    else openOutputs();
  });

  // Clic en cualquier otro sitio → se cierra. (Dentro de la lista, no: eliges una salida.)
  document.addEventListener('click', (event) => {
    if (isOpen() && !popover.contains(event.target)) closeOutputs();
  });

  // Esc con la lista abierta: cierra la lista, no el panel (panel.js lo respeta).
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        closeOutputs();
        button.blur();
      }
    },
    true
  );

  onPanelChange((expanded) => {
    if (!expanded) closeOutputs();
  });
  onTabChange(closeOutputs);
  window.notch.audio.onChange(setAudioState);
}
