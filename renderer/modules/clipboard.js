// =============================================================================
//  renderer/modules/clipboard.js — Lo que copiaste (página Portapapeles)
// -----------------------------------------------------------------------------
//  Tarjetas en fila con los últimos 30 textos que copiaste, los fijados
//  primero. Pulsa una para copiarla otra vez (sube al principio).
//    • Cada tarjeta dice de qué programa vino y cuándo, y se dibuja según lo
//      que parece: un link (con el logo de la web si lo hay), un color, un
//      correo, una ruta, código o texto.
//    • 📌 la fija (hasta 10: no se borran con "Borrar") y ✕ la quita.
//    • "Buscar" filtra (empieza a escribir y va solo ahí); ⏸ pausa el historial.
//  main/clipboard.js guarda la lista (solo en memoria) y nos manda solo el
//  principio de cada texto. Todo se escribe con textContent: lo copiado
//  nunca se interpreta como HTML.
// =============================================================================

import { $, animate, setText, plural, trackScrollEdges } from './utils.js';
import { state } from './state.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { onClockTick } from './clock.js';
import { getSegment, isSegmentVisible, moveSegmentIndicator, onSegmentChange, setSegmentCount } from './clip-page.js';
import { testLight } from './light.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COPIED_MS = 1100; // lo que dura el "Copiado" sobre la tarjeta
const CONFIRM_MS = 3000; // "¿Borrar?" espera la confirmación este tiempo
const HINT_MS = 2600;
const KIND_ICONS = { link: 'i-w-links', email: 'i-k-mail', path: 'i-folder', code: 'i-k-code', text: 'i-k-text' };
const KIND_NAMES = { link: 'Link', email: 'Correo', color: 'Color', path: 'Ruta', code: 'Código', text: 'Texto' };

// Lo que se ve cuando no hay tarjetas (o en la cabecera, si las hay), según el estado
const STATUS_TEXT = {
  paused: { chip: 'En pausa', title: 'En pausa', text: 'No se guarda lo que copias. Pulsa ▶ para seguir.' },
  off: { chip: 'Apagado', title: 'Historial apagado', text: 'Actívalo con "clipboard": true en config/settings.json.' },
  'old-helper': { chip: 'Recompila el helper', title: 'Hay que recompilar el helper', text: 'Cierra Notch, ejecuta npm run build:helper y vuelve a abrirlo.' },
  'no-helper': { chip: 'Sin helper', title: 'Falta el helper de Windows', text: 'Compílalo con npm run build:helper (necesita el .NET 8 SDK).' },
  error: { chip: 'Error', title: 'No se pudo vigilar el portapapeles', text: '' },
};

const listEl = $('clips');
const emptyEl = $('clips-empty');
const emptyTitle = $('clips-empty-title');
const emptyText = $('clips-empty-text');
const stateChip = $('clip-state');
const searchInput = $('clip-search');
const pauseButton = $('clip-pause');
const clearButton = $('clip-clear');

let clips = { status: 'starting', message: '', paused: false, items: [] };
let query = '';
let dirty = true; // hay cambios sin dibujar (no dibujamos con la página oculta)
let lastMinute = -1;
let confirmTimer = null;
let hintTimer = null;
let focusId = null; // la tarjeta que acabas de copiar o fijar (que se vea al moverse)
let updateEdges = () => {};
const cards = new Map(); // id → tarjeta (se reutilizan al redibujar)
const changeListeners = [];

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

/** Lo que hay (para el widget de Home). */
export function getClips() {
  return clips;
}

/** Avisa a `listener()` cada vez que cambia la lista o el estado. */
export function onClipsChange(listener) {
  changeListeners.push(listener);
}

/** main.js manda la lista y el estado (al arrancar y en cada cambio). */
export function setClips(next) {
  if (!next || typeof next !== 'object') return;
  const previousTop = clips.items[0]?.id;
  clips = {
    status: String(next.status || 'starting'),
    message: String(next.message || ''),
    paused: next.paused === true,
    items: Array.isArray(next.items) ? next.items.filter((item) => item && typeof item.id === 'string') : [],
  };
  setSegmentCount('clips', clips.items.length);
  if (previousTop && clips.items[0]?.id && clips.items[0]?.id !== previousTop) {
    testLight('copy');
  }
  dirty = true;
  if (isSegmentVisible('clips')) render({ flip: true, scrollToStart: clips.items[0]?.id !== previousTop });
  changeListeners.forEach((listener) => listener());
}

/** Lo que se ve con el filtro de "Buscar": los fijados primero. */
function visibleItems() {
  const needle = normalize(query.trim());
  const matches = needle ? clips.items.filter((item) => normalize(`${item.preview} ${item.source}`).includes(needle)) : clips.items;
  return [...matches.filter((item) => item.pinned), ...matches.filter((item) => !item.pinned)];
}

/** Sin mayúsculas ni tildes ("Canción" = "cancion"), para buscar. */
function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// -----------------------------------------------------------------------------
// Dibujar
// -----------------------------------------------------------------------------

function render({ flip = false, scrollToStart = false } = {}) {
  dirty = false;
  const before = flip ? measure() : null;
  const items = visibleItems();
  const keep = new Set(items.map((item) => item.id));
  for (const [id, card] of cards) {
    if (keep.has(id)) continue;
    cards.delete(id);
    card.remove();
  }

  const now = Date.now();
  const nodes = [];
  items.forEach((item, index) => {
    // Una rayita separa los fijados de los demás
    if (index > 0 && !item.pinned && items[index - 1].pinned) nodes.push(createDivider());
    let card = cards.get(item.id);
    if (!card) {
      card = createCard(item.id);
      cards.set(item.id, card);
      if (state.initialized && state.isExpanded) card.classList.add('is-new');
    }
    updateCard(card, item, now);
    nodes.push(card);
  });
  listEl.replaceChildren(...nodes);
  if (before) playFlip(before);
  // Lo que acabas de copiar o fijar cambia de sitio: que no se pierda de vista.
  // Y si llega algo nuevo desde otra app, se ve al principio.
  const moved = focusId && cards.get(focusId);
  focusId = null;
  if (moved) reveal(moved);
  else if (scrollToStart && listEl.scrollLeft > 0) listEl.scrollTo({ left: 0, behavior: 'smooth' });
  renderStatus(items.length);
  updateEdges();
}

/**
 * Desplaza la fila lo justo para que se vea la tarjeta. (No scrollIntoView:
 * movería también la isla, que recorta lo que se sale.)
 */
function reveal(card) {
  const margin = 8;
  const start = card.offsetLeft - margin;
  const end = card.offsetLeft + card.offsetWidth + margin;
  if (start < listEl.scrollLeft) listEl.scrollTo({ left: Math.max(0, start), behavior: 'smooth' });
  else if (end > listEl.scrollLeft + listEl.clientWidth) listEl.scrollTo({ left: end - listEl.clientWidth, behavior: 'smooth' });
}

/** Lo de alrededor: el estado (pausa, sin helper...), "Buscar", vacío. */
function renderStatus(visibleCount) {
  const info = STATUS_TEXT[clips.status] || null;
  const total = clips.items.length;
  pauseButton.setAttribute('aria-pressed', String(clips.paused));
  pauseButton.title = clips.paused ? 'Seguir guardando lo que copio' : 'Pausar: no guardar lo que copie';
  pauseButton.setAttribute('aria-label', clips.paused ? 'Seguir' : 'Pausar');
  pauseButton.disabled = clips.status === 'off';
  clearButton.disabled = !clips.items.some((item) => !item.pinned);

  // Con tarjetas, el estado va en una etiqueta pequeña en la cabecera
  stateChip.hidden = !info || total === 0;
  if (info) {
    setText(stateChip, info.chip);
    stateChip.dataset.status = clips.status;
  }

  emptyEl.hidden = visibleCount > 0;
  listEl.hidden = visibleCount === 0;
  if (visibleCount > 0) return;
  emptyEl.dataset.status = info ? clips.status : '';
  if (total > 0) {
    setText(emptyTitle, 'Nada coincide');
    setText(emptyText, `No hay nada copiado con "${query.trim()}".`);
  } else if (info) {
    setText(emptyTitle, info.title);
    setText(emptyText, clips.status === 'error' ? clips.message || 'Windows no dejó escuchar el portapapeles.' : info.text);
  } else {
    setText(emptyTitle, 'Aún no has copiado nada');
    setText(emptyText, 'Copia un texto (Ctrl+C) y aparecerá aquí. Solo texto, solo en memoria y nunca contraseñas.');
  }
}

function createDivider() {
  const divider = document.createElement('span');
  divider.className = 'clip-divider';
  divider.setAttribute('aria-hidden', 'true');
  return divider;
}

/** Una tarjeta vacía (updateCard la rellena). */
function createCard(id) {
  const card = document.createElement('div');
  card.className = 'clip';
  card.dataset.id = id;
  card.tabIndex = 0;
  card.setAttribute('role', 'listitem');

  const top = el('span', 'clip-top');
  top.append(el('span', 'clip-kind'), el('span', 'clip-source'), el('span', 'clip-time'));
  const color = el('span', 'clip-color');
  const text = el('span', 'clip-text');
  const foot = el('span', 'clip-foot');

  // La chincheta, a la derecha del todo: en los fijados se ve siempre
  const actions = el('span', 'clip-actions');
  actions.append(iconButton('clip-remove', 'i-close', 'Quitar'), iconButton('clip-pin', 'i-pin', 'Fijar'));

  const copied = el('span', 'clip-copied');
  copied.append(svgIcon('i-check-mark'), document.createTextNode('Copiado'));

  card.append(top, color, text, foot, actions, copied);
  card.addEventListener('animationend', (event) => {
    if (event.target === card) card.classList.remove('is-new');
  });
  return card;
}

/** Pone en la tarjeta los datos de su elemento. */
function updateCard(card, item, now) {
  const kind = KIND_NAMES[item.kind] ? item.kind : 'text';
  card.dataset.kind = kind;
  card.dataset.pinned = String(item.pinned);

  const [top, color, text, foot, actions] = card.children;
  const [kindEl, sourceEl, timeEl] = top.children;
  fillKindIcon(kindEl, item, kind);
  setText(sourceEl, item.source || KIND_NAMES[kind]);
  setText(timeEl, timeAgo(item.time, now));
  timeEl.dataset.time = String(item.time);

  // Un color: la muestra grande
  const swatch = kind === 'color' && isColor(item.color) ? item.color : '';
  color.hidden = !swatch;
  if (swatch) {
    color.style.setProperty('--swatch', swatch);
    card.style.setProperty('--swatch-accent', swatch);
  }

  setText(text, previewText(item, kind));
  setText(foot, footText(item, kind));

  const pin = actions.querySelector('.clip-pin');
  pin.setAttribute('aria-pressed', String(item.pinned));
  pin.title = item.pinned ? 'Soltar' : 'Fijar';
  pin.setAttribute('aria-label', item.pinned ? 'Soltar' : 'Fijar');

  const what = item.source ? `de ${item.source}` : KIND_NAMES[kind].toLowerCase();
  card.title = `${item.preview.slice(0, 280)}${item.length > 280 ? '…' : ''}`;
  card.setAttribute('aria-label', `${KIND_NAMES[kind]} ${what}${item.pinned ? ', fijado' : ''}: ${item.preview.slice(0, 80)}`);
}

/** El icono de arriba a la izquierda: el logo de la web, la muestra de color o el del tipo. */
function fillKindIcon(element, item, kind) {
  const key = item.logo?.path ? `logo:${item.logo.path.length}:${item.logo.hex}` : `${kind}:${item.color || ''}`;
  if (element.dataset.key === key) return;
  element.dataset.key = key;
  element.dataset.logo = String(Boolean(item.logo?.path));
  element.style.removeProperty('--logo-color');
  element.style.removeProperty('--swatch');

  if (item.logo?.path) {
    // El logo (de Simple Icons) con el color de su marca, como los links de Focus
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('clip-logo');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', item.logo.path);
    svg.append(path);
    element.replaceChildren(svg);
    if (/^#[0-9a-f]{6}$/i.test(item.logo.hex)) element.style.setProperty('--logo-color', item.logo.hex);
    return;
  }
  if (kind === 'color' && isColor(item.color)) {
    element.replaceChildren(el('span', 'clip-dot'));
    element.style.setProperty('--swatch', item.color);
    return;
  }
  element.replaceChildren(svgIcon(KIND_ICONS[kind] || 'i-k-text'));
}

/** Lo que se lee en la tarjeta. */
function previewText(item, kind) {
  let text = item.preview;
  if (kind === 'link') text = text.trim().replace(/^https?:\/\/(www\.)?/i, '');
  if (kind === 'text') text = text.replace(/\n{3,}/g, '\n\n');
  // Sin líneas vacías al principio ni espacios al final (la tarjeta es pequeña)
  return text.replace(/^\s*\n/, '').trimEnd();
}

/** La línea de abajo: el dominio, cuántas líneas o cuántos caracteres. */
function footText(item, kind) {
  if (kind === 'link') return item.host || 'Link';
  if (kind === 'email') return 'Correo';
  if (kind === 'color') return 'Color';
  if (kind === 'path') return 'Ruta';
  if (item.lines > 1) return plural(item.lines, 'línea', 'líneas');
  return plural(item.length, 'carácter', 'caracteres').replace(/^\d+/, (n) => Number(n).toLocaleString('es-ES'));
}

/** "ahora", "5 min", "2 h", "ayer"... */
function timeAgo(time, now) {
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 45) return 'ahora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `${days} d`;
}

function isColor(value) {
  return typeof value === 'string' && value.length < 64 && CSS.supports('color', value);
}

// Pequeños ayudantes para crear elementos
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
  const button = el('button', `clip-action ${className}`);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(svgIcon(symbol));
  return button;
}

// -----------------------------------------------------------------------------
// FLIP: al subir una tarjeta al principio, las demás se deslizan a su sitio
// -----------------------------------------------------------------------------

function measure() {
  const positions = new Map();
  for (const [id, card] of cards) if (card.isConnected) positions.set(id, card.getBoundingClientRect().left);
  return positions;
}

function playFlip(before) {
  for (const [id, card] of cards) {
    const old = before.get(id);
    if (old === undefined) continue;
    const dx = old - card.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) continue;
    const animation = animate(card, [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
      duration: 520,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    });
    // La que se mueve hacia el principio pasa por encima de las demás
    if (animation && dx > 0) {
      card.style.zIndex = '2';
      animation.finished.finally(() => card.style.removeProperty('z-index')).catch(() => {});
    }
  }
}

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------

async function copyCard(card) {
  focusId = card.dataset.id;
  const ok = await window.notch.clipboard.copy(card.dataset.id);
  if (!ok) return;
  card.classList.remove('is-copied');
  void card.offsetWidth; // para que la animación empiece otra vez si pulsas dos veces
  card.classList.add('is-copied');
  animate(card, [{ scale: 1 }, { scale: 0.95 }, { scale: 1.02 }, { scale: 1 }], { duration: 420, easing: 'ease-out' });
  clearTimeout(card.copiedTimer);
  card.copiedTimer = setTimeout(() => card.classList.remove('is-copied'), COPIED_MS);
}

async function togglePin(card) {
  const pinned = card.dataset.pinned !== 'true';
  focusId = card.dataset.id;
  const result = await window.notch.clipboard.pin(card.dataset.id, pinned);
  if (result?.error === 'too-many') showHint('Como mucho 10 fijados');
}

function removeCard(card) {
  card.classList.add('is-leaving');
  // Esperamos a que se vaya (o enseguida, sin animaciones) y se lo pedimos a main.js
  const done = () => window.notch.clipboard.remove(card.dataset.id);
  const animation = animate(card, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  if (animation) animation.finished.then(done, done);
  else done();
}

/** "Borrar" pide confirmación: el primer clic lo pone en rojo ("¿Borrar?"). */
function onClearClick() {
  if (clearButton.dataset.confirm !== 'true') {
    clearButton.dataset.confirm = 'true';
    setText(clearButton, '¿Borrar?');
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(resetClearButton, CONFIRM_MS);
    return;
  }
  resetClearButton();
  window.notch.clipboard.clear();
}

function resetClearButton() {
  clearTimeout(confirmTimer);
  clearButton.dataset.confirm = 'false';
  setText(clearButton, 'Borrar');
}

/** Un mensaje corto en la cabecera (en el sitio de la etiqueta de estado). */
function showHint(text) {
  stateChip.hidden = false;
  stateChip.dataset.status = 'hint';
  setText(stateChip, text);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => renderStatus(visibleItems().length), HINT_MS);
}

/** Las horas ("5 min") se ponen al día una vez por minuto mientras se ven. */
function refreshTimes(now) {
  const minute = Math.floor(now.getTime() / 60000);
  if (minute === lastMinute || !isSegmentVisible('clips')) return;
  lastMinute = minute;
  for (const timeEl of listEl.querySelectorAll('.clip-time')) setText(timeEl, timeAgo(Number(timeEl.dataset.time), now.getTime()));
}

/** Al enseñar la página: dibuja lo pendiente. */
function onShow() {
  moveSegmentIndicator(false);
  if (dirty || getSegment() === 'clips') render();
}

export function initClipboard() {
  updateEdges = trackScrollEdges(listEl);

  // Pulsar una tarjeta la copia; sus botones fijan o quitan.
  listEl.addEventListener('click', (event) => {
    const card = event.target.closest('.clip');
    if (!card || card.classList.contains('is-leaving')) return;
    if (event.target.closest('.clip-pin')) togglePin(card);
    else if (event.target.closest('.clip-remove')) removeCard(card);
    else copyCard(card);
  });
  listEl.addEventListener('keydown', (event) => {
    const card = event.target.closest?.('.clip');
    if (!card || event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      copyCard(card);
    } else if (event.key === 'Delete') {
      removeCard(card);
    }
  });

  // La rueda del ratón desplaza la fila hacia los lados
  listEl.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      listEl.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false }
  );

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    render();
  });
  searchInput.addEventListener('keydown', (event) => {
    // Esc borra la búsqueda (y, si ya está vacía, cierra el panel como siempre)
    if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      searchInput.value = '';
      query = '';
      render();
    }
  });

  // Empieza a escribir en la página y va directo a "Buscar"
  document.addEventListener('keydown', (event) => {
    if (!isSegmentVisible('clips') || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key.length !== 1 || event.key === ' ') return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
    searchInput.focus();
  });

  pauseButton.addEventListener('click', () => window.notch.clipboard.pause(!clips.paused));
  clearButton.addEventListener('click', onClearClick);

  onClockTick(refreshTimes);
  onPanelChange((expanded) => {
    if (expanded && getCurrentTab() === 'clipboard') onShow();
    if (!expanded) resetClearButton();
  });
  onTabChange((tab) => {
    if (tab === 'clipboard') onShow();
  });
  onSegmentChange((name) => {
    if (name === 'clips') render();
  });
  window.notch.clipboard.onChange(setClips);
}

/** El estado inicial (al arrancar). */
export function loadClipboard(initial) {
  if (initial) setClips(initial);
  else renderStatus(0);
}

