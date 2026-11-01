// =============================================================================
//  renderer/widgets/clipboard.js — Widget Portapapeles
// -----------------------------------------------------------------------------
//  1x1: el principio de lo último que copiaste.
//  2x1: además, la bandeja (hasta 3 iconos de sus archivos y cuántos hay).
//  Un toque abre la página Portapapeles. Brilla cuando sueltas archivos
//  nuevos en la bandeja (lo que copias no: sería a todas horas).
// =============================================================================

import { $, plural, setText } from '../modules/utils.js';
import { getClips, onClipsChange } from '../modules/clipboard.js';
import { getTray, onTrayChange } from '../modules/tray.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ICONS = 3;

const widget = $('home-clipboard');
const labelEl = $('home-clip-label');
const textEl = $('home-clip-text');
const trayEl = $('home-clip-tray');
const filesEl = $('home-clip-files');
const trayTextEl = $('home-clip-tray-text');

let isVisible = () => false;
let drawnFiles = null; // los iconos que hay dibujados (para no rehacerlos)

function render() {
  if (!isVisible() && widget.dataset.ready === 'true') return; // se dibuja al volver a Home
  widget.dataset.ready = 'true';

  // Lo último copiado: el primero que no sea un fijado viejo (el más reciente)
  const { items, paused, status } = getClips();
  const last = [...items].sort((a, b) => b.time - a.time)[0];
  const preview = last ? last.preview.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  setText(textEl, preview);
  setText(labelEl, paused || status === 'paused' ? 'En pausa' : last?.source ? `De ${last.source}` : 'Lo último copiado');
  widget.dataset.empty = String(!preview);

  // La bandeja
  const files = getTray().items;
  trayEl.dataset.count = String(files.length);
  setText(trayTextEl, files.length ? plural(files.length, 'archivo', 'archivos') : 'Bandeja vacía');
  const shown = files.slice(0, MAX_ICONS);
  const key = shown.map((file) => `${file.id}:${file.icon.length}`).join('|');
  if (key !== drawnFiles) {
    drawnFiles = key;
    filesEl.replaceChildren(...(shown.length ? shown.map(createIcon) : [createEmptyIcon()]));
  }
  widget.title = files.length ? `Portapapeles · ${plural(files.length, 'archivo', 'archivos')} en la bandeja` : 'Portapapeles';
}

/** Bandeja vacía: su icono, apagado. */
function createEmptyIcon() {
  const wrap = document.createElement('span');
  wrap.className = 'clipw-file is-empty';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#i-tray');
  svg.append(use);
  wrap.append(svg);
  return wrap;
}

/** Un icono de la bandeja (la miniatura, o uno dibujado). */
function createIcon(file, index) {
  const wrap = document.createElement('span');
  wrap.className = 'clipw-file';
  wrap.style.setProperty('--i', String(index));
  if (file.icon && file.icon.startsWith('data:image/')) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = file.icon;
    wrap.append(img);
  } else {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', file.isDir ? '#i-folder' : '#i-doc');
    svg.append(use);
    wrap.append(svg);
  }
  return wrap;
}

export const clipboardWidget = {
  type: 'clipboard',
  name: 'Portapapeles',
  description: 'Lo último que copiaste y tu bandeja',
  icon: 'i-clipboard',
  accent: 'var(--info)',
  sizes: ['2x1', '1x1'],
  goto: 'clipboard',
  init(context) {
    isVisible = context.isVisible;
    onClipsChange(render);
    onTrayChange(render);
  },
  render,
  // Novedad: llegaron archivos nuevos a la bandeja (el número del más nuevo:
  // quitar uno no cuenta como novedad)
  news: () => {
    const ids = getTray().items.map((file) => Number(file.id)).filter(Number.isFinite);
    return ids.length ? [`tray:${Math.max(...ids)}`] : [];
  },
};
