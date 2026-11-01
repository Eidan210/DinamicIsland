// =============================================================================
//  renderer/modules/home.js — Home: la rejilla de widgets y el modo edición
// -----------------------------------------------------------------------------
//  Home es una rejilla de 4 columnas × 2 filas. Cada widget (renderer/widgets/)
//  ocupa 1 celda (1x1) o 2 seguidas (2x1). Cuáles se ven, en qué orden y de
//  qué tamaño lo guarda main/home.js en home.json (en tu carpeta de datos).
//  Dónde cae cada uno lo calcula home-grid.js.
//
//  Modo edición (mantén pulsado 0,6 s sobre Home):
//    • los widgets tiemblan; arrástralos para cambiarlos de sitio,
//    • ✕ quita un widget y ⤢ cambia su tamaño (1x1 ⇄ 2x1),
//    • en lugar de las pestañas: Añadir (el catálogo), Diseños (3 ya hechos)
//      y Listo. Esc, cerrar el panel o cambiar de página también terminan.
//
//  Novedades: cada widget dice las suyas (news() en su archivo). Si hay alguna
//  que aún no viste, el widget brilla; se da por vista al pasar el ratón por
//  encima, al tocarlo o al abrir su página.
// =============================================================================

import { $, animate, cssEasing, isMotionReduced } from './utils.js';
import { state } from './state.js';
import { onShapeChange } from './island.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange, showTab } from './tabs.js';
import { addLocalNotice } from './notices.js';
import { CELLS, COLUMNS, ROWS, dropIndex, fits, freeCells, placeWidgets, usedCells } from './home-grid.js';
import { DEFAULT_LAYOUT, LAYOUT_PRESETS, WIDGETS, WIDGET_BY_TYPE } from '../widgets/index.js';

const LONG_PRESS_MS = 600; // mantener pulsado este tiempo para editar
const PRESS_TOLERANCE = 8; // px que se puede mover el ratón sin cancelar la pulsación
const DRAG_THRESHOLD = 4; // px para empezar a arrastrar (en el modo edición)
const DRAG_OVERSHOOT = 10; // px que el widget arrastrado puede salirse de la rejilla
const SAVE_DELAY = 400; // ms tras el último cambio para guardar home.json
const HINT_MS = 2600; // lo que dura un mensaje en la barra de edición
const DEFAULT_HINT = 'Arrastra para mover';
const NO_ROOM = 'No cabe: quita un widget o haz otro pequeño';
const SVG_NS = 'http://www.w3.org/2000/svg';

const panelEl = document.querySelector('.panel');
const homeEl = $('home');
const grid = $('widgets');
const emptyEl = $('home-empty');
const addButton = $('home-add');
const layoutsButton = $('home-layouts');
const doneButton = $('home-done');
const hintEl = $('home-hint');
const catalogEl = $('catalog');
const catalogList = $('catalog-list');
const catalogFree = $('catalog-free');
const layoutsEl = $('layouts');
const layoutsList = $('layouts-list');

const elements = new Map(); // tipo → <article> del widget
const slots = []; // los huecos con "+" del modo edición
const seen = new Map(); // tipo → novedades que ya viste

let layout = cloneLayout(DEFAULT_LAYOUT); // [{ type, size }] en orden
let editing = false;
let press = null; // pulsación larga en marcha: { timer, x, y, type, pointerId }
let drag = null; // arrastre: { type, el, pointerId, startX, startY, started, moved, grabX, grabY, metrics }
let suppressClick = false; // tras la pulsación larga, el clic al soltar no abre nada
let saveTimer = null;
let hintTimer = null;
let newsReady = false; // hasta arrancar, lo que haya cuenta como visto

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function cloneLayout(list) {
  return list.map(({ type, size }) => ({ type, size }));
}

/** ¿Se ve Home? (panel abierto en la página Home) */
function isHomeVisible() {
  return state.isExpanded && getCurrentTab() === 'home';
}

/**
 * Revisa una lista de widgets (la de home.json o la de un diseño): solo tipos
 * que existen, sin repetir, con un tamaño que admitan y que quepan.
 * Devuelve null si no es una lista.
 */
function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const result = [];
  for (const item of list) {
    const widget = WIDGET_BY_TYPE.get(item?.type);
    if (!widget || result.some((entry) => entry.type === widget.type)) continue;
    const size = widget.sizes.includes(item.size) ? item.size : widget.sizes[0];
    if (fits([...result, { type: widget.type, size }])) result.push({ type: widget.type, size });
  }
  return result;
}

function iconSvg(id, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function textSpan(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// -----------------------------------------------------------------------------
// Colocar los widgets
// -----------------------------------------------------------------------------

/**
 * Pone cada widget en su celda y esconde los que no están. Con flip, los que
 * cambian de sitio se deslizan desde donde estaban (técnica FLIP: medir antes,
 * colocar, medir después y animar la diferencia). `skip`: el que arrastras.
 */
function applyLayout({ flip = false, skip = null } = {}) {
  const before = flip ? measure() : null;
  const places = placeWidgets(layout) || new Map();
  layout.forEach((widget, index) => elements.get(widget.type).style.setProperty('--j', String(index)));
  for (const [type, el] of elements) {
    const place = places.get(type);
    el.hidden = !place;
    if (!place) continue;
    el.dataset.size = layout.find((widget) => widget.type === type).size;
    el.style.gridColumn = `${place.col} / span ${place.width}`;
    el.style.gridRow = String(place.row);
  }
  renderSlots();
  emptyEl.hidden = layout.length > 0;
  renderWidgets();
  updateNews();
  if (before) playFlip(before, skip);
}

function measure() {
  const rects = new Map();
  for (const [type, el] of elements) {
    if (!el.hidden) rects.set(type, { rect: el.getBoundingClientRect(), size: el.dataset.size });
  }
  return rects;
}

function playFlip(before, skip) {
  if (isMotionReduced()) return;
  const easing = cssEasing('--spring-open');
  for (const [type, el] of elements) {
    if (el.hidden || type === skip) continue;
    const old = before.get(type);
    if (!old) {
      // Recién añadido: aparece con un rebote
      animate(el, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: cssEasing('--spring-bouncy') });
      continue;
    }
    const rect = el.getBoundingClientRect();
    const dx = old.rect.left - rect.left;
    const dy = old.rect.top - rect.top;
    if (old.size !== el.dataset.size) {
      // Cambió de tamaño: un pequeño "pop" desde donde estaba
      animate(el, [{ opacity: 0.6, transform: `translate(${dx}px, ${dy}px) scale(0.92)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing });
    } else if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
      animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing });
    }
  }
}

/** Los huecos libres (solo se ven en el modo edición): un "+" que abre el catálogo. */
function renderSlots() {
  const free = freeCells(layout);
  while (slots.length < free.length) {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'widget-slot';
    slot.tabIndex = -1;
    slot.setAttribute('aria-label', 'Añadir un widget');
    slot.append(iconSvg('i-plus'));
    slot.addEventListener('click', (event) => {
      event.stopPropagation();
      openPopover(catalogEl, addButton, { toggle: false });
    });
    grid.append(slot);
    slots.push(slot);
  }
  slots.forEach((slot, index) => {
    const cell = free[index];
    slot.hidden = !cell;
    if (!cell) return;
    slot.style.gridColumn = String(cell.col);
    slot.style.gridRow = String(cell.row);
  });
}

/** Cada widget se dibuja (los que no se ven paran lo que gaste algo, como la barra de la música). */
function renderWidgets() {
  for (const widget of WIDGETS) widget.render();
}

// -----------------------------------------------------------------------------
// Novedades
// -----------------------------------------------------------------------------

/** Revisa las novedades de cada widget: brilla el que tiene alguna sin ver. */
function updateNews() {
  for (const widget of WIDGETS) {
    const causes = widget.news();
    let known = seen.get(widget.type);
    if (!known) {
      known = new Set();
      seen.set(widget.type, known);
    }
    if (!newsReady) causes.forEach((cause) => known.add(cause));
    // Olvidamos las que ya no están (si vuelven, vuelven a brillar)
    for (const cause of known) if (!causes.includes(cause)) known.delete(cause);
    const value = causes.some((cause) => !known.has(cause)) ? 'true' : '';
    const el = elements.get(widget.type);
    if (el.dataset.news !== value) el.dataset.news = value;
  }
}

/** Lo que tenía de nuevo ese widget, ya está visto. */
function markSeen(type) {
  const widget = WIDGET_BY_TYPE.get(type);
  const known = seen.get(type);
  if (!widget || !known) return;
  widget.news().forEach((cause) => known.add(cause));
  updateNews();
}

// -----------------------------------------------------------------------------
// Modo edición
// -----------------------------------------------------------------------------

function enterEditMode() {
  if (editing) return;
  editing = true;
  homeEl.dataset.editing = 'true';
  panelEl.dataset.editing = 'true';
  showHint(DEFAULT_HINT, { sticky: true });
}

function exitEditMode() {
  if (!editing) return;
  cancelDrag();
  closePopovers();
  editing = false;
  homeEl.dataset.editing = 'false';
  panelEl.dataset.editing = 'false';
  flushSave();
}

/** Un mensaje en la barra de edición (vuelve al de siempre a los 2,6 s). */
function showHint(text, { tone = '', sticky = false } = {}) {
  clearTimeout(hintTimer);
  hintEl.textContent = text;
  hintEl.dataset.tone = tone;
  if (!sticky) hintTimer = setTimeout(() => showHint(DEFAULT_HINT, { sticky: true }), HINT_MS);
}

/** "No": un pequeño temblor de lado a lado y el motivo en la barra. */
function refuse(el, text) {
  animate(el, [{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '0 0' }], {
    duration: 340,
    easing: 'ease-in-out',
  });
  showHint(text, { tone: 'warning' });
}

function removeWidget(type) {
  const index = layout.findIndex((widget) => widget.type === type);
  if (index < 0) return;
  layout.splice(index, 1);
  const el = elements.get(type);
  // Se encoge y desaparece; después los demás se recolocan
  const leaving = animate(el, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.5' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
  const finish = () => {
    leaving?.cancel();
    applyLayout({ flip: true });
    scheduleSave();
  };
  if (leaving) leaving.onfinish = finish;
  else finish();
  showHint(`Quitaste ${WIDGET_BY_TYPE.get(type).name}`);
}

function toggleSize(type) {
  const widget = WIDGET_BY_TYPE.get(type);
  const current = layout.find((entry) => entry.type === type);
  if (!widget || !current) return;
  const size = current.size === '2x1' ? '1x1' : '2x1';
  if (!widget.sizes.includes(size)) return;
  const next = layout.map((entry) => (entry.type === type ? { type, size } : entry));
  if (!fits(next)) {
    refuse(elements.get(type), NO_ROOM);
    return;
  }
  layout = next;
  applyLayout({ flip: true });
  scheduleSave();
}

function addWidget(type, size) {
  if (!WIDGET_BY_TYPE.has(type) || layout.some((entry) => entry.type === type)) return;
  const next = [...layout, { type, size }];
  if (!fits(next)) {
    showHint(NO_ROOM, { tone: 'warning' });
    return;
  }
  layout = next;
  closePopovers();
  applyLayout({ flip: true });
  scheduleSave();
  showHint(`Añadiste ${WIDGET_BY_TYPE.get(type).name}`);
}

function applyPreset(preset) {
  layout = sanitize(preset.widgets) || cloneLayout(DEFAULT_LAYOUT);
  closePopovers();
  applyLayout({ flip: true });
  scheduleSave();
  showHint(`Diseño «${preset.name}»`);
}

// -----------------------------------------------------------------------------
// Guardar (home.json, en tu carpeta de datos)
// -----------------------------------------------------------------------------

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveNow();
}

async function saveNow() {
  saveTimer = null;
  let result = null;
  try {
    result = await window.notch.home.save(cloneLayout(layout));
  } catch {
    result = null;
  }
  if (result?.ok) return;
  addLocalNotice({
    key: 'home',
    kind: 'error',
    tone: 'warning',
    title: 'No se pudo guardar Home',
    text: 'Los widgets se quedan así hasta que cierres Notch, pero no se guardaron en home.json.',
  });
}

// -----------------------------------------------------------------------------
// Catálogo y diseños (desplegables de la barra de edición)
// -----------------------------------------------------------------------------

function renderCatalog() {
  const missing = WIDGETS.filter((widget) => !layout.some((entry) => entry.type === widget.type));
  const free = CELLS - usedCells(layout);
  catalogFree.textContent = free === 1 ? 'Queda 1 hueco' : `Quedan ${free} huecos`;
  if (!missing.length) {
    catalogList.replaceChildren(textSpan('catalog-empty', 'Ya tienes todos los widgets en Home'));
    return;
  }
  catalogList.replaceChildren(
    ...missing.map((widget, index) => {
      const item = document.createElement('div');
      item.className = 'catalog-item';
      item.style.setProperty('--widget-accent', widget.accent);
      item.style.setProperty('--i', String(index));
      const text = document.createElement('span');
      text.className = 'catalog-text';
      text.append(textSpan('catalog-name', widget.name), textSpan('catalog-desc', widget.description));
      const sizes = document.createElement('span');
      sizes.className = 'catalog-sizes';
      for (const size of [...widget.sizes].sort()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'catalog-size';
        button.textContent = size === '2x1' ? '2×1' : '1×1';
        button.title = size === '2x1' ? 'Añadir ancho (2 celdas)' : 'Añadir pequeño (1 celda)';
        button.disabled = !fits([...layout, { type: widget.type, size }]);
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          addWidget(widget.type, size);
        });
        sizes.append(button);
      }
      item.append(iconSvg(widget.icon, 'catalog-icon'), text, sizes);
      return item;
    })
  );
}

function renderLayouts() {
  const current = JSON.stringify(layout);
  layoutsList.replaceChildren(
    ...LAYOUT_PRESETS.map((preset, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layout-option';
      button.style.setProperty('--i', String(index));
      // La miniatura: la misma rejilla de 4×2 en pequeño, con el icono de cada widget
      const preview = document.createElement('span');
      preview.className = 'layout-preview';
      const places = placeWidgets(preset.widgets) || new Map();
      for (const entry of preset.widgets) {
        const widget = WIDGET_BY_TYPE.get(entry.type);
        const place = places.get(entry.type);
        if (!widget || !place) continue;
        const block = document.createElement('span');
        block.className = 'layout-block';
        block.style.gridColumn = `${place.col} / span ${place.width}`;
        block.style.gridRow = String(place.row);
        block.style.setProperty('--widget-accent', widget.accent);
        block.append(iconSvg(widget.icon, 'layout-block-icon'));
        preview.append(block);
      }
      button.append(preview, textSpan('layout-name', preset.name));
      button.setAttribute('aria-pressed', String(JSON.stringify(sanitize(preset.widgets)) === current));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        applyPreset(preset);
      });
      return button;
    })
  );
}

function isPopoverOpen() {
  return catalogEl.classList.contains('is-open') || layoutsEl.classList.contains('is-open');
}

/** Abre el catálogo o los diseños (y cierra el otro). Con toggle, si ya estaba abierto, lo cierra. */
function openPopover(popover, button, { toggle = true } = {}) {
  const wasOpen = popover.classList.contains('is-open');
  closePopovers();
  if (wasOpen && toggle) return;
  if (popover === catalogEl) renderCatalog();
  else renderLayouts();
  popover.classList.add('is-open', 'is-entering');
  button.setAttribute('aria-expanded', 'true');
  setTimeout(() => popover.classList.remove('is-entering'), 700);
}

function closePopovers() {
  for (const [popover, button] of [
    [catalogEl, addButton],
    [layoutsEl, layoutsButton],
  ]) {
    popover.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  }
}

// -----------------------------------------------------------------------------
// Ratón: tocar, mantener pulsado y arrastrar
// -----------------------------------------------------------------------------

function onPointerDown(event) {
  if (event.button !== 0) return;
  suppressClick = false;
  if (event.target.closest('.widget-badge, .widget-slot')) return;
  const el = event.target.closest('.widget');
  if (editing) {
    if (el) startDrag(el, event);
    return;
  }
  cancelPress();
  press = {
    x: event.clientX,
    y: event.clientY,
    type: el?.dataset.widget || null,
    pointerId: event.pointerId,
    timer: setTimeout(onLongPress, LONG_PRESS_MS),
  };
  el?.classList.add('is-pressing');
}

/** Mantuviste pulsado 0,6 s: modo edición (y, sin soltar, ya puedes arrastrar). */
function onLongPress() {
  const current = press;
  press = null;
  if (!current) return;
  const el = current.type ? elements.get(current.type) : null;
  el?.classList.remove('is-pressing');
  suppressClick = true;
  enterEditMode();
  animate(el || grid, [{ scale: '1' }, { scale: '1.04' }, { scale: '1' }], { duration: 320, easing: 'ease-out' });
  if (el) startDrag(el, { clientX: current.x, clientY: current.y, pointerId: current.pointerId });
}

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  if (press.type) elements.get(press.type)?.classList.remove('is-pressing');
  press = null;
}

function onPointerMove(event) {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > PRESS_TOLERANCE) cancelPress();
  if (drag && event.pointerId === drag.pointerId) moveDrag(event);
}

function onPointerUp(event) {
  cancelPress();
  if (drag && event.pointerId === drag.pointerId) endDrag();
  // Si el clic no llega (soltaste fuera), que no se quede bloqueado el siguiente.
  setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function startDrag(el, event) {
  drag = { type: el.dataset.widget, el, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, started: false, moved: false };
  try {
    el.setPointerCapture(event.pointerId); // el arrastre sigue aunque el ratón se salga del widget
  } catch {
    // (el botón ya no estaba pulsado)
  }
}

/** Medidas de la rejilla para saber en qué celda cae el widget. */
function gridMetrics() {
  const style = getComputedStyle(grid);
  const gapX = parseFloat(style.columnGap) || 0;
  const gapY = parseFloat(style.rowGap) || 0;
  const cellWidth = (grid.clientWidth - gapX * (COLUMNS - 1)) / COLUMNS;
  const cellHeight = (grid.clientHeight - gapY * (ROWS - 1)) / ROWS;
  return { cellWidth, cellHeight, colStep: cellWidth + gapX, rowStep: cellHeight + gapY };
}

function moveDrag(event) {
  if (!drag.started) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.started = true;
    closePopovers();
    // Dónde lo agarraste, respecto a su esquina (offsetLeft/Top: su sitio en la rejilla, sin animaciones)
    const gridRect = grid.getBoundingClientRect();
    drag.grabX = drag.startX - gridRect.left - drag.el.offsetLeft;
    drag.grabY = drag.startY - gridRect.top - drag.el.offsetTop;
    drag.metrics = gridMetrics();
    drag.el.classList.add('is-dragging');
    showHint('Suelta donde lo quieras', { sticky: true });
  }
  const gridRect = grid.getBoundingClientRect();
  // Su esquina, dentro de la rejilla (sin salirse del panel, que lo recortaría)
  const left = clamp(event.clientX - gridRect.left - drag.grabX, -DRAG_OVERSHOOT, grid.clientWidth - drag.el.offsetWidth + DRAG_OVERSHOOT);
  const top = clamp(event.clientY - gridRect.top - drag.grabY, -DRAG_OVERSHOOT, grid.clientHeight - drag.el.offsetHeight + DRAG_OVERSHOOT);
  // La celda donde cae su primera celda (el centro de su parte izquierda)
  const { cellWidth, cellHeight, colStep, rowStep } = drag.metrics;
  const cell = {
    col: clamp(Math.floor((left + cellWidth / 2) / colStep) + 1, 1, COLUMNS),
    row: clamp(Math.floor((top + cellHeight / 2) / rowStep) + 1, 1, ROWS),
  };
  const index = dropIndex(layout, drag.type, cell);
  const currentIndex = layout.findIndex((widget) => widget.type === drag.type);
  if (index >= 0 && index !== currentIndex) {
    const [moved] = layout.splice(currentIndex, 1);
    layout.splice(index, 0, moved);
    drag.moved = true;
    applyLayout({ flip: true, skip: drag.type });
  }
  // Sigue al ratón, desde su sitio (nuevo) en la rejilla
  drag.el.style.translate = `${left - drag.el.offsetLeft}px ${top - drag.el.offsetTop}px`;
}

/** Al soltar: vuelve a su sitio con un muelle y, si cambió algo, se guarda. */
function endDrag() {
  const { el, started, moved } = drag;
  drag = null;
  if (!started) return;
  const from = el.style.translate || '0px 0px';
  el.style.translate = '';
  el.classList.remove('is-dragging');
  animate(el, [{ translate: from }, { translate: '0px 0px' }], { duration: 380, easing: cssEasing('--spring-bouncy') });
  showHint(DEFAULT_HINT, { sticky: true });
  if (moved) scheduleSave();
}

function cancelDrag() {
  if (drag) endDrag();
}

/** Antes que nadie: tras la pulsación larga (y en edición) los clics no abren nada. */
function onGridClickCapture(event) {
  if (suppressClick) {
    suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
    return;
  }
  if (editing && !event.target.closest('.widget-badge, .widget-slot')) {
    event.stopPropagation();
    event.preventDefault();
  }
}

/** Tocar un widget: su acción (Focus: el Pomodoro) o abrir su página. */
function onGridClick(event) {
  if (editing) return;
  const el = event.target.closest('.widget');
  const widget = el && WIDGET_BY_TYPE.get(el.dataset.widget);
  if (!widget) return;
  markSeen(widget.type);
  if (widget.tap) widget.tap();
  else if (widget.goto) showTab(widget.goto);
}

/** Los botones ✕ y ⤢ de cada widget (solo se ven y funcionan en el modo edición). */
function addBadges(el, widget) {
  const make = (className, icon, label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `widget-badge ${className}`;
    button.tabIndex = -1;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(iconSvg(icon));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (editing) action();
    });
    el.append(button);
  };
  make('widget-remove', 'i-close', `Quitar ${widget.name}`, () => removeWidget(widget.type));
  if (widget.sizes.length > 1) make('widget-resize', 'i-resize', 'Cambiar el tamaño', () => toggleSize(widget.type));
}

// -----------------------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------------------

/** Los widgets que guardaste (home.json). */
export function loadHome(data) {
  layout = sanitize(data?.widgets) ?? cloneLayout(DEFAULT_LAYOUT);
  applyLayout();
}

/** Al terminar de arrancar: lo que ya hubiera cuenta como visto (no brilla nada viejo). */
export function startHome() {
  newsReady = false;
  updateNews();
  newsReady = true;
}

export function initHome() {
  homeEl.dataset.editing = 'false';
  panelEl.dataset.editing = 'false';

  for (const widget of WIDGETS) {
    const el = grid.querySelector(`.widget[data-widget="${widget.type}"]`);
    elements.set(widget.type, el);
    addBadges(el, widget);
    // Pasar el ratón por encima: sus novedades ya están vistas
    el.addEventListener('pointerenter', () => {
      if (el.dataset.news === 'true' && !editing) markSeen(widget.type);
    });
    widget.init({ isVisible: () => isHomeVisible() && !el.hidden });
  }

  grid.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  grid.addEventListener('click', onGridClickCapture, true);
  grid.addEventListener('click', onGridClick);
  // Mantener pulsado en una pantalla táctil abre el menú del clic derecho: aquí no.
  grid.addEventListener(
    'contextmenu',
    (event) => {
      if (!editing && event.pointerType !== 'touch') return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  addButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openPopover(catalogEl, addButton);
  });
  layoutsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openPopover(layoutsEl, layoutsButton);
  });
  doneButton.addEventListener('click', (event) => {
    event.stopPropagation();
    exitEditMode();
  });
  // Clic fuera del catálogo o de los diseños → se cierran
  document.addEventListener('click', (event) => {
    if (isPopoverOpen() && !catalogEl.contains(event.target) && !layoutsEl.contains(event.target)) closePopovers();
  });

  // En edición, Esc cierra el desplegable o sale del modo edición (no cierra el
  // panel) y las flechas no cambian de página. Va antes que panel.js (captura).
  document.addEventListener(
    'keydown',
    (event) => {
      if (!editing || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isPopoverOpen()) closePopovers();
        else exitEditMode();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
      }
    },
    true
  );

  onPanelChange((expanded) => {
    if (!expanded) {
      cancelPress();
      exitEditMode();
    }
    renderWidgets(); // p. ej. la barra de la música solo se anima con el panel abierto
  });
  onTabChange((tab, previousTab) => {
    if (tab !== 'home') exitEditMode();
    // Abrir la página de un widget = ver sus novedades
    for (const widget of WIDGETS) if (widget.goto === tab) markSeen(widget.type);
    if (tab === 'home' || previousTab === 'home') renderWidgets();
  });
  // Cada vez que cambia algo (la IA, la música, el Pomodoro, la batería...),
  // island.js revisa su forma y nos avisa: revisamos las novedades.
  onShapeChange(updateNews);
  // Si Notch se cierra a mitad de una edición, guardamos lo que haya.
  window.addEventListener('beforeunload', flushSave);

  applyLayout();
}
