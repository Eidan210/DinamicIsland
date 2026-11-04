// =============================================================================
//  renderer/modules/notices.js — El centro de avisos
// -----------------------------------------------------------------------------
//  Los avisos de Notch: los que manda main.js (Pomodoro terminado, un error en
//  settings.json, un atajo ocupado, el helper...) y los de esta página (la
//  batería).
//    • La campana de la barra superior cuenta los que no has visto y, al
//      pulsarla, despliega la lista.
//    • Los importantes (alert) salen además en la isla unos segundos. Si pulsas
//      el aviso, se abre el panel con la lista.
//    • Un puntito azul en la mini-muesca recuerda que hay avisos sin ver.
//  Solo viven en memoria: al cerrar Notch se olvidan.
// =============================================================================

import { $, animate, setText, getMotionScale } from './utils.js';
import { state } from './state.js';
import { showAlert, updateShape } from './island.js';
import { onPanelChange } from './panel.js';

const MAX_NOTICES = 50;
const ALERT_MS = 4500; // lo que dura un aviso importante en la isla
const OPEN_LIST_DELAY = 160; // ms tras abrir el panel desde un aviso
const SVG_NS = 'http://www.w3.org/2000/svg';

// Icono de cada tipo de aviso (están en index.html, al principio)
const KIND_ICONS = { pomodoro: 'i-timer', battery: 'i-battery', error: 'i-warning', keyboard: 'i-keyboard', ai: 'i-claude', water: 'i-info', task: 'i-check' };
const TONE_ICONS = { success: 'i-check', warning: 'i-warning', danger: 'i-warning', info: 'i-info' };
const TONES = ['info', 'success', 'warning', 'danger'];

const island = $('island');
const bellButton = $('notices-button');
const countEl = $('notices-count');
const popover = $('notices');
const listEl = $('notices-list');
const emptyEl = $('notices-empty');
const clearButton = $('notices-clear');
const statusDot = $('status-dot');
const alertEl = $('alert');
const alertIcon = $('alert-icon');
const alertTitle = $('alert-title');
const alertBody = $('alert-body');

let notices = []; // del más antiguo al más nuevo
let localCount = 0;
let openOnExpand = false; // pulsaste un aviso de la isla: al abrirse el panel, enseñamos la lista

function iconFor(notice) {
  return KIND_ICONS[notice.kind] || TONE_ICONS[notice.tone] || 'i-info';
}

/** Revisa lo que llega (de main.js o de esta página) para no fiarnos de nada raro. */
function cleanNotice(notice) {
  return {
    id: String(notice.id),
    key: typeof notice.key === 'string' ? notice.key : '',
    kind: String(notice.kind || 'info'),
    tone: TONES.includes(notice.tone) ? notice.tone : 'info',
    title: String(notice.title || ''),
    text: String(notice.text || ''),
    alert: notice.alert === true,
    time: Number(notice.time) || Date.now(),
    unread: true,
  };
}

/** Guarda un aviso y, si es importante, lo enseña en la isla. */
function addNotice(rawNotice, { present = true } = {}) {
  const notice = cleanNotice(rawNotice);
  if (notices.some((item) => item.id === notice.id)) return; // ya lo teníamos
  // Un aviso con la misma clave sustituye al anterior (p. ej. "batería baja" → "muy baja").
  if (notice.key) notices = notices.filter((item) => item.key !== notice.key);
  notices.push(notice);
  if (notices.length > MAX_NOTICES) notices.shift();

  if (isOpen()) {
    renderList();
    notice.unread = false; // la lista está abierta: ya lo estás viendo
  } else if (state.isExpanded) {
    ringBell();
  }
  renderCount();
  if (present && notice.alert && !state.isExpanded) presentAlert(notice);
}

/** Avisos que nacen en la página (p. ej. la batería). */
export function addLocalNotice(notice) {
  localCount += 1;
  addNotice({ ...notice, id: `local-${localCount}`, time: Date.now() });
}

/** Al arrancar: los avisos que main.js guardó antes de que la página estuviera lista. */
export function loadInitialNotices(list) {
  if (!Array.isArray(list)) return;
  list.forEach((notice) => addNotice(notice, { present: false }));
  // Si alguno importante es de hace nada (p. ej. un error al arrancar), lo enseñamos.
  const recent = list.filter((notice) => notice.alert && Date.now() - notice.time < 15000).pop();
  if (recent) presentAlert(cleanNotice(recent));
}

function removeByKey(key) {
  const before = notices.length;
  notices = notices.filter((notice) => notice.key !== key);
  if (notices.length === before) return;
  renderCount();
  if (isOpen()) renderList();
}

function clearAll() {
  notices = [];
  window.notch.notices.clear();
  renderCount();
  renderList();
}

// -----------------------------------------------------------------------------
// Dibujar
// -----------------------------------------------------------------------------

/** Determina si el aviso usa C2 (notch-drop) o C1 (pastilla corta). */
export function getAlertVariant(notice) {
  if (notice.variant) return notice.variant;
  if (notice.kind === 'water' || notice.kind === 'pomodoro' || notice.kind === 'task') {
    return 'notch-drop';
  }
  return 'pill';
}

export function getAlertDuration(variant) {
  return variant === 'notch-drop' ? 5000 : 2500;
}

/**
 * Sustituye fluidamente el contenido del aviso actual (Fase C1 / B3)
 * sin contraer y reabrir la forma de la isla.
 */
function animateAlertSwap(notice, duration, variant) {
  const scale = typeof getMotionScale === 'function' ? getMotionScale() : 1;
  const exitDuration = Math.round(120 * scale);
  const enterDuration = Math.round(220 * scale);
  const enterDelay = Math.round(60 * scale);

  animate(
    alertTitle,
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-6px)' },
    ],
    { duration: exitDuration, easing: 'ease-in' }
  );
  animate(
    alertBody,
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-6px)' },
    ],
    { duration: exitDuration, easing: 'ease-in' }
  );

  setTimeout(() => {
    alertEl.dataset.tone = notice.tone;
    alertIcon.setAttribute('href', `#${iconFor(notice)}`);
    setText(alertTitle, notice.title);
    setText(alertBody, notice.text);
    showAlert(duration, { variant });
    updateShape();

    animate(
      alertTitle,
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: enterDuration, delay: enterDelay, easing: 'ease-out' }
    );
    animate(
      alertBody,
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: enterDuration, delay: enterDelay, easing: 'ease-out' }
    );
  }, exitDuration);
}

/** El aviso grande de la isla (Fase C: pastilla corta C1 o aviso que baja C2). */
function presentAlert(notice) {
  const variant = getAlertVariant(notice);
  const duration = getAlertDuration(variant);

  if (state.shape === 'alert') {
    // Si ya hay un aviso en pantalla, animación B3 sin cerrar y reabrir
    animateAlertSwap(notice, duration, variant);
  } else {
    alertEl.dataset.tone = notice.tone;
    alertIcon.setAttribute('href', `#${iconFor(notice)}`);
    setText(alertTitle, notice.title);
    setText(alertBody, notice.text);
    showAlert(duration, { variant });
    updateShape();
  }
}

/** El número de la campana y el punto azul de la mini-muesca. */
function renderCount() {
  const unread = notices.filter((notice) => notice.unread).length;
  countEl.hidden = unread === 0;
  setText(countEl, unread > 9 ? '9+' : String(unread));
  bellButton.setAttribute('aria-label', unread ? `Avisos: ${unread} sin ver` : 'Avisos');
  statusDot.classList.toggle('is-on', unread > 0);
  clearButton.disabled = notices.length === 0;
}

/** La lista, del más nuevo al más antiguo. */
function renderList() {
  const items = notices
    .slice()
    .reverse()
    .map((notice, index) => createNoticeItem(notice, index));
  listEl.replaceChildren(...items);
  emptyEl.hidden = notices.length > 0;
}

function createNoticeItem(notice, index) {
  const item = document.createElement('li');
  item.className = 'notice';
  item.classList.toggle('is-unread', notice.unread);
  item.dataset.tone = notice.tone;
  item.style.setProperty('--i', String(Math.min(index, 6))); // para la entrada en cascada

  const icon = document.createElement('span');
  icon.className = 'notice-icon';
  icon.append(createIcon(iconFor(notice)));

  // textContent (no innerHTML): el texto nunca se interpreta como HTML.
  const title = document.createElement('span');
  title.className = 'notice-title';
  title.textContent = notice.title;
  const time = document.createElement('span');
  time.className = 'notice-time';
  time.textContent = timeAgo(notice.time);
  const top = document.createElement('div');
  top.className = 'notice-top';
  top.append(title, time);

  const body = document.createElement('div');
  body.className = 'notice-body';
  body.append(top);
  if (notice.text) {
    const text = document.createElement('p');
    text.className = 'notice-text';
    text.textContent = notice.text;
    body.append(text);
  }

  item.append(icon, body);
  return item;
}

/** <svg><use href="#i-..."></use></svg> */
function createIcon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

let minuteScheduleTimer = null;

/** Programa la actualización de los textos relativos al segundo exacto :00 de cada minuto. */
export function scheduleMinuteUpdate() {
  clearTimeout(minuteScheduleTimer);
  const now = new Date();
  const msToNext = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  minuteScheduleTimer = setTimeout(() => {
    if (isOpen()) {
      renderList();
    }
    scheduleMinuteUpdate();
  }, Math.max(1000, msToNext));
}

/** "ahora", "12 min", "1 h" o la fecha (Fase C1, actualizado una vez por minuto). */
export function timeAgo(time) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  try {
    return new Date(time).toLocaleDateString(state.settings.locale, { day: 'numeric', month: 'short' });
  } catch {
    return new Date(time).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
}

/** La campana se balancea al llegar un aviso con el panel abierto. */
function ringBell() {
  animate(
    bellButton,
    [
      { rotate: '0deg' },
      { rotate: '16deg' },
      { rotate: '-13deg' },
      { rotate: '8deg' },
      { rotate: '-4deg' },
      { rotate: '0deg' },
    ],
    { duration: 650, easing: 'ease-in-out' }
  );
}

// -----------------------------------------------------------------------------
// Abrir y cerrar la lista
// -----------------------------------------------------------------------------

function isOpen() {
  return popover.classList.contains('is-open');
}

function openList() {
  renderList(); // con el punto azul en los que no habías visto...
  popover.classList.add('is-open');
  bellButton.setAttribute('aria-expanded', 'true');
  notices.forEach((notice) => {
    notice.unread = false; // ...que a partir de ahora cuentan como vistos
  });
  renderCount();
}

function closeList() {
  if (!isOpen()) return;
  popover.classList.remove('is-open');
  bellButton.setAttribute('aria-expanded', 'false');
}

export function initNotices() {
  bellButton.addEventListener('click', (event) => {
    event.stopPropagation(); // que el clic no cuente como "clic fuera" de la lista
    if (isOpen()) closeList();
    else openList();
  });
  clearButton.addEventListener('click', clearAll);

  // Clic en cualquier otro sitio del panel → se cierra la lista.
  document.addEventListener('click', (event) => {
    if (isOpen() && !popover.contains(event.target)) closeList();
  });

  // Esc con la lista abierta: cierra la lista, no el panel (panel.js lo respeta).
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        closeList();
        bellButton.blur(); // sin el anillo de foco en la campana
      }
    },
    true
  );

  // Pulsar un aviso de la isla abre el panel con la lista desplegada.
  // (capture: así nos enteramos antes de que panel.js pida abrir el panel)
  island.addEventListener(
    'click',
    () => {
      openOnExpand = !state.isExpanded && state.shape === 'alert';
    },
    { capture: true }
  );
  onPanelChange((expanded) => {
    // La lista sale un momento después, cuando el panel ya está creciendo
    // (y así el mismo clic que abrió el panel no la cierra al llegar al documento).
    if (expanded && openOnExpand) {
      setTimeout(() => {
        if (state.isExpanded) openList();
      }, OPEN_LIST_DELAY);
    } else if (!expanded) {
      closeList();
    }
    openOnExpand = false;
  });

  window.notch.notices.onAdd((notice) => addNotice(notice));
  window.notch.notices.onRemove(removeByKey);
  renderCount();
  scheduleMinuteUpdate();
}
