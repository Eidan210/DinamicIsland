// =============================================================================
//  renderer/modules/tray.js — La bandeja de archivos y soltar en la isla
// -----------------------------------------------------------------------------
//  1. Soltar: arrastra archivos (del Explorador, del escritorio...) hasta la
//     isla. Al pasar por encima se abre para recibirlos ("Suelta para
//     guardarlo") y, al soltar, confirma que están en la bandeja. Con el panel
//     abierto, todo el panel recibe los archivos.
//     Truco: la ventana deja pasar el ratón salvo encima de la isla. Al
//     arrastrar, la isla atrapa el ratón (island.js) y entonces Windows ya nos
//     deja recibir los archivos; si sales de la isla, el arrastre vuelve a
//     pasar a las ventanas de abajo.
//  2. La bandeja (página Portapapeles → Bandeja): los archivos en fila.
//     Arrastra uno (o "Arrastrar todo") a otro sitio y se copia allí; doble
//     clic lo enseña en su carpeta; ✕ lo quita de la bandeja.
//  main/tray.js guarda la lista (solo las rutas). La página nunca ve las
//  rutas: preload.js las saca de lo que sueltas y se las pasa a main.js.
// =============================================================================

import { $, animate, plural, setText, trackScrollEdges } from './utils.js';
import { state } from './state.js';
import { setMouseInteractive, showDropResult, updateShape } from './island.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange, showTab } from './tabs.js';
import { isSegmentVisible, moveSegmentIndicator, onSegmentChange, setSegmentCount, showSegment } from './clip-page.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RESULT_MS = 1900; // lo que se ve el "Guardado en la bandeja" en la isla
const SAVING_MAX_MS = 6000; // mientras main.js los apunta, la isla espera como mucho esto
const DROP_MARGIN = 14; // px alrededor de la isla que también reciben los archivos
const STUCK_MS = 3000; // si deja de llegar "dragover" tanto tiempo, el arrastre se fue
const HINT_MS = 2600;
const CONFIRM_MS = 3000;

const island = $('island');
const dropEl = $('drop');
const dropTitle = $('drop-title');
const dropSub = $('drop-sub');
const listEl = $('files');
const emptyEl = $('files-empty');
const hintEl = $('tray-hint');
const dragAllEl = $('tray-drag-all');
const addButton = $('tray-add');
const clearButton = $('tray-clear');

let tray = { items: [], max: 24 };
let dragDepth = 0; // dragenter suma y dragleave resta: 0 = el arrastre se fue
let draggingOut = false; // estás sacando un archivo de la bandeja (no es para recibir)
let stuckTimer = null;
let hintTimer = null;
let confirmTimer = null;
let freshIds = new Set(); // los recién llegados (entran con una animación)
let updateEdges = () => {};
const tiles = new Map(); // id → elemento (se reutilizan al redibujar)
const changeListeners = [];

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

/** Lo que hay en la bandeja (para el widget de Home). */
export function getTray() {
  return tray;
}

/** Avisa a `listener()` cada vez que cambia la bandeja. */
export function onTrayChange(listener) {
  changeListeners.push(listener);
}

export function setTray(next) {
  if (!next || typeof next !== 'object') return;
  const known = new Set(tray.items.map((item) => item.id));
  tray = {
    items: Array.isArray(next.items) ? next.items.filter((item) => item && typeof item.id === 'string') : [],
    max: Number(next.max) || 24,
  };
  if (state.initialized) for (const item of tray.items) if (!known.has(item.id)) freshIds.add(item.id);
  setSegmentCount('files', tray.items.length);
  render();
  changeListeners.forEach((listener) => listener());
}

// -----------------------------------------------------------------------------
// Dibujar la bandeja
// -----------------------------------------------------------------------------

function render() {
  const keep = new Set(tray.items.map((item) => item.id));
  for (const [id, tile] of tiles) {
    if (keep.has(id)) continue;
    tiles.delete(id);
    tile.remove();
  }
  const nodes = tray.items.map((item, index) => {
    let tile = tiles.get(item.id);
    if (!tile) {
      tile = createTile(item.id);
      tiles.set(item.id, tile);
    }
    if (freshIds.has(item.id)) {
      tile.classList.add('is-new');
      tile.style.setProperty('--i', String(index));
    }
    updateTile(tile, item);
    return tile;
  });
  freshIds = new Set();
  listEl.replaceChildren(...nodes);
  listEl.hidden = nodes.length === 0;
  emptyEl.hidden = nodes.length > 0;
  clearButton.disabled = nodes.length === 0;
  addButton.disabled = tray.items.length >= tray.max;
  dragAllEl.hidden = tray.items.filter((item) => !item.missing).length < 2;
  if (freshCount(nodes) && listEl.scrollLeft > 0) listEl.scrollTo({ left: 0, behavior: 'smooth' }); // los nuevos van delante
  updateEdges();
}

function freshCount(nodes) {
  return nodes.filter((node) => node.classList.contains('is-new')).length;
}

function createTile(id) {
  const tile = document.createElement('div');
  tile.className = 'file';
  tile.dataset.id = id;
  tile.tabIndex = 0;
  tile.draggable = true;
  tile.setAttribute('role', 'listitem');

  const icon = el('span', 'file-icon');
  const name = el('span', 'file-name');
  const meta = el('span', 'file-meta');
  const actions = el('span', 'file-actions');
  actions.append(iconButton('file-show', 'i-folder', 'Mostrar en la carpeta'), iconButton('file-remove', 'i-close', 'Quitar de la bandeja'));
  tile.append(icon, name, meta, actions);
  tile.addEventListener('animationend', (event) => {
    if (event.target === tile) tile.classList.remove('is-new');
  });
  return tile;
}

function updateTile(tile, item) {
  tile.dataset.missing = String(item.missing === true);
  tile.dataset.dir = String(item.isDir === true);
  tile.draggable = !item.missing;
  const [icon, name, meta] = tile.children;
  fillIcon(icon, item);
  setText(name, item.name);
  setText(meta, item.missing ? 'No está' : [item.isDir ? 'Carpeta' : formatSize(item.size), item.folder].filter(Boolean).join(' · '));
  tile.title = item.missing
    ? `${item.name}: ya no está donde estaba (se movió o se borró)`
    : `${item.name}${item.folder ? ` · en ${item.folder}` : ''}\nArrástralo para copiarlo · doble clic: abrir · botón: mostrar en la carpeta`;
  tile.setAttribute('aria-label', `${item.name}${item.missing ? ', no está' : ''}`);
}

/** La miniatura o el icono de Windows; si no hay, uno dibujado con su extensión. */
function fillIcon(element, item) {
  const key = `${item.icon ? item.icon.length : 0}:${item.icon.slice(-24)}:${item.isDir}:${item.ext}`;
  if (element.dataset.key === key) return;
  element.dataset.key = key;
  element.dataset.thumbnail = String(item.thumbnail === true && Boolean(item.icon));
  if (item.icon && item.icon.startsWith('data:image/')) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = item.icon;
    element.replaceChildren(img);
    return;
  }
  const svg = svgIcon(item.isDir ? 'i-folder' : 'i-doc');
  if (item.isDir || !item.ext) {
    element.replaceChildren(svg);
    return;
  }
  const ext = el('span', 'file-ext');
  ext.textContent = item.ext.toUpperCase();
  element.replaceChildren(svg, ext);
}

/** 2481512 → "2,4 MB" */
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: digits })} ${units[unit]}`;
}

function el(tag, className) {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function svgIcon(symbol) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbol}`);
  svg.append(use);
  return svg;
}

function iconButton(className, symbol, label) {
  const button = el('button', `file-action ${className}`);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.draggable = false;
  button.append(svgIcon(symbol));
  return button;
}

/** Un mensaje corto junto a los botones de la bandeja. */
function showHint(text) {
  setText(hintEl, text);
  hintEl.classList.add('is-visible');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('is-visible'), HINT_MS);
}

// -----------------------------------------------------------------------------
// Sacar archivos (arrastrar hacia fuera)
// -----------------------------------------------------------------------------

/** Empieza el arrastre de verdad (lo hace main.js: así el archivo sale de Notch). */
function dragOut(event, ids) {
  event.preventDefault(); // el arrastre "de página web" no sirve: lo hace main.js
  if (!ids.length) return;
  draggingOut = true;
  window.notch.tray.startDrag(ids);
}

// -----------------------------------------------------------------------------
// Recibir archivos (soltar sobre la isla o el panel)
// -----------------------------------------------------------------------------

/** ¿Es un arrastre de archivos? (no de texto) */
function hasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

/** ¿Es un arrastre de archivos de fuera? (no lo que sacas de la bandeja) */
function isFileDrag(event) {
  return !draggingOut && hasFiles(event);
}

/** ¿Está ese punto sobre la isla (o el panel abierto), con un pequeño margen? */
function isOverDropZone(x, y) {
  if (state.shape === 'mini' && !state.fileDrag) return false;
  const rect = island.getBoundingClientRect();
  return x >= rect.left - DROP_MARGIN && x <= rect.right + DROP_MARGIN && y >= rect.top - DROP_MARGIN && y <= rect.bottom + DROP_MARGIN;
}

/** Empieza o termina "hay archivos encima" (la isla se abre para recibirlos). */
function setFileDrag(over) {
  clearTimeout(stuckTimer);
  if (over) stuckTimer = setTimeout(() => endFileDrag(), STUCK_MS);
  if (state.fileDrag === over) return;
  state.fileDrag = over;
  island.dataset.drop = over ? 'over' : '';
  if (over) {
    dropEl.dataset.state = 'over';
    setText(dropTitle, 'Suelta para guardarlo');
    setText(dropSub, 'en la bandeja de Notch');
  }
  updateShape();
}

function endFileDrag() {
  dragDepth = 0;
  setFileDrag(false);
}

function onDragEnter(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth++;
  if (isOverDropZone(event.clientX, event.clientY)) setFileDrag(true);
}

function onDragOver(event) {
  if (!hasFiles(event)) return;
  if (!isOverDropZone(event.clientX, event.clientY)) {
    // Fuera de la isla: que el arrastre pase a las ventanas de abajo (el
    // escritorio, otra app...). Al volver a la isla, island.js la reactiva.
    // (También al sacar un archivo de la bandeja: así puedes soltarlo justo debajo.)
    event.dataTransfer.dropEffect = 'none';
    setMouseInteractive(false);
    if (!draggingOut) setFileDrag(false);
    return;
  }
  if (draggingOut) return; // lo que sacas, sobre la propia isla: aquí no se suelta
  event.preventDefault(); // = aquí se puede soltar
  event.dataTransfer.dropEffect = 'copy';
  setFileDrag(true);
}

function onDragLeave(event) {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) setFileDrag(false);
}

async function onDrop(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  if (!types.includes('Files')) return;
  event.preventDefault(); // (si no, Chromium intentaría abrir el archivo)
  const onIsland = state.fileDrag || isOverDropZone(event.clientX, event.clientY);
  const files = Array.from(event.dataTransfer.files);
  if (draggingOut || !onIsland || !files.length) {
    endFileDrag(); // (lo que sacabas, soltado sobre la propia isla)
    return;
  }
  // Mientras main.js los apunta (y saca las miniaturas), la isla sigue abierta
  // diciendo "Guardando…": así no se encoge para volver a crecer enseguida.
  if (!state.isExpanded) {
    setText(dropTitle, 'Guardando…');
    setText(dropSub, files.length === 1 ? files[0].name : plural(files.length, 'archivo', 'archivos'));
    showDropResult(SAVING_MAX_MS);
  }
  endFileDrag();

  let result;
  try {
    result = await window.notch.tray.addFiles(files);
  } catch {
    result = null;
  }
  showDropFeedback(result, files);
}

/** Cuenta cómo fue: en la isla (cerrada) o llevándote a la bandeja (abierta). */
function showDropFeedback(result, files) {
  const added = result?.added || 0;
  let tone = 'done';
  let title;
  let sub;
  if (added > 0) {
    title = 'Guardado en la bandeja';
    sub = added === 1 ? files.find((file) => file.name)?.name || '1 archivo' : plural(added, 'archivo', 'archivos');
    if (result.full) sub += ` · ${result.full} no cabían`;
  } else if (result?.full) {
    tone = 'full';
    title = 'La bandeja está llena';
    sub = `Caben ${tray.max}: saca o quita alguno`;
  } else if (result?.duplicate) {
    title = 'Ya estaba en la bandeja';
    sub = files.length === 1 ? files[0].name : plural(result.duplicate, 'archivo', 'archivos');
  } else {
    tone = 'full';
    title = 'No se pudo guardar';
    sub = 'Suelta archivos de una carpeta o del escritorio';
  }

  if (state.isExpanded) {
    // Con el panel abierto: a la bandeja, para verlos llegar
    showTab('clipboard');
    showSegment('files');
    showHint(added > 0 ? `${title} ✓` : title);
    return;
  }
  dropEl.dataset.state = tone;
  setText(dropTitle, title);
  setText(dropSub, sub);
  showDropResult(RESULT_MS);
  updateShape();
}

// -----------------------------------------------------------------------------
// Botones
// -----------------------------------------------------------------------------

async function onAddClick() {
  const result = await window.notch.tray.pick();
  if (!result || !result.ok) return;
  if (result.full) showHint(`La bandeja está llena (caben ${tray.max})`);
  else if (result.duplicate && !result.added) showHint('Ya estaba en la bandeja');
}

function onClearClick() {
  if (clearButton.dataset.confirm !== 'true') {
    clearButton.dataset.confirm = 'true';
    setText(clearButton, '¿Vaciar?');
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(resetClearButton, CONFIRM_MS);
    return;
  }
  resetClearButton();
  window.notch.tray.clear();
}

function resetClearButton() {
  clearTimeout(confirmTimer);
  clearButton.dataset.confirm = 'false';
  setText(clearButton, 'Vaciar');
}

function removeTile(tile) {
  const done = () => window.notch.tray.remove(tile.dataset.id);
  const animation = animate(tile, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  if (animation) animation.finished.then(done, done);
  else done();
}

/** Al enseñar la bandeja: ¿siguen los archivos en su sitio? */
function checkFiles() {
  moveSegmentIndicator(false);
  updateEdges();
  if (isSegmentVisible('files') && tray.items.length) window.notch.tray.refresh();
}

export function initTray() {
  updateEdges = trackScrollEdges(listEl);

  // Soltar archivos: en toda la ventana (la isla decide si los recibe)
  document.addEventListener('dragenter', onDragEnter);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('drop', onDrop);
  window.notch.tray.onDragEnd(() => {
    draggingOut = false;
  });

  // Pulsar la isla mientras dice "Guardado en la bandeja" abre la bandeja
  // (panel.js abre el panel justo después).
  island.addEventListener(
    'click',
    () => {
      if (state.shape !== 'drop' || state.isExpanded) return;
      showTab('clipboard');
      showSegment('files');
    },
    true
  );

  // Sacar archivos: arrastrando uno...
  listEl.addEventListener('dragstart', (event) => {
    const tile = event.target.closest?.('.file');
    if (!tile || tile.dataset.missing === 'true') {
      event.preventDefault();
      return;
    }
    dragOut(event, [tile.dataset.id]);
  });

  // ...o todos a la vez
  dragAllEl.addEventListener('dragstart', (event) => {
    dragOut(event, tray.items.filter((item) => !item.missing).map((item) => item.id));
  });

  listEl.addEventListener('click', (event) => {
    const tile = event.target.closest('.file');
    if (!tile) return;
    if (event.target.closest('.file-remove')) removeTile(tile);
    else if (event.target.closest('.file-show')) window.notch.tray.showInFolder(tile.dataset.id);
  });
  listEl.addEventListener('dblclick', (event) => {
    const tile = event.target.closest('.file');
    if (tile && !event.target.closest('.file-action') && tile.dataset.missing !== 'true') window.notch.tray.open(tile.dataset.id);
  });
  listEl.addEventListener('keydown', (event) => {
    const tile = event.target;
    if (!(tile instanceof HTMLElement) || !tile.classList.contains('file')) return;
    if (event.key === 'Enter') window.notch.tray.showInFolder(tile.dataset.id);
    else if (event.key === 'Delete') removeTile(tile);
  });
  listEl.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      listEl.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false }
  );

  addButton.addEventListener('click', onAddClick);
  clearButton.addEventListener('click', onClearClick);

  onPanelChange((expanded) => {
    if (expanded && getCurrentTab() === 'clipboard') checkFiles();
    if (!expanded) resetClearButton();
  });
  onTabChange((tab) => {
    if (tab === 'clipboard') checkFiles();
  });
  onSegmentChange((name) => {
    if (name === 'files') checkFiles();
  });
  window.notch.tray.onChange(setTray);
}

/** El estado inicial (al arrancar). */
export function loadTray(initial) {
  if (initial) setTray(initial);
  else render();
}
