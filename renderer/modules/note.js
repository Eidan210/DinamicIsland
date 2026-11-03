// =============================================================================
//  renderer/modules/note.js — La nota rápida y tareas (página Nota, Ctrl+Alt+6)
// -----------------------------------------------------------------------------
//  Un control segmentado arriba permite alternar entre:
//    • Nota: cuadro de texto que se guarda solo en nota.md
//    • Tareas: lista rápida de tareas pendientes/urgentes (tasks.js)
//  Al abrir la página con su atajo, el cursor se coloca automáticamente.
//  El widget de Home (renderer/widgets/note.js) enseña el principio de la nota.
// =============================================================================

import { $, setText, plural, animate, cssEasing } from './utils.js';
import { state } from './state.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { initTasksModule, loadInitialTasks } from './tasks.js';

const SAVE_DELAY = 500; // ms sin escribir antes de guardar
const STATUS_TEXT = {
  idle: '',
  typing: 'Sin guardar…',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se pudo guardar',
};

const SEGMENTS = ['note', 'tasks'];
let currentSegment = 'note';

const notePage = $('note-page');
const noteSegmentIndicator = $('note-segment-indicator');
const segmentButtons = [...document.querySelectorAll('#note-segments .segment')];

const noteEl = $('note');
const textarea = $('note-text');
const statusEl = $('note-status');
const countEl = $('note-count');

let saveTimer = null;
const changeListeners = [];
let dirty = false; // ¿hay cambios sin guardar?
let editable = false; // hasta cargar la nota no se puede escribir (no la pisamos)
let caretPlaced = false;

function setStatus(status, text = STATUS_TEXT[status] || '') {
  if (noteEl) noteEl.dataset.state = status;
  if (statusEl) setText(statusEl, text);
  changeListeners.forEach((listener) => listener());
}

/** El texto de la nota. */
export function getNoteText() {
  return textarea ? textarea.value : '';
}

/** Cómo va la nota: 'idle', 'typing', 'saving', 'saved', 'error' o 'readonly'. */
export function getNoteStatus() {
  return noteEl?.dataset?.state || 'idle';
}

/** Avisa a `listener()` cuando la nota cambia de estado (al cargarla, al escribir, al guardar...). */
export function onNoteChange(listener) {
  changeListeners.push(listener);
}

function updateCount() {
  if (!textarea || !countEl) return;
  // Contamos como palabra lo que tenga alguna letra o número (no los guiones de una lista).
  const words = textarea.value.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  setText(countEl, words ? plural(words, 'palabra', 'palabras') : '');
}

/** Pone la nota guardada en el cuadro (al arrancar). */
export function loadNote(result) {
  if (!textarea) return;
  if (!result || result.error) {
    // Si no se pudo leer, no dejamos escribir: así nunca se borra lo que tenías.
    editable = false;
    textarea.readOnly = true;
    const reason =
      result?.error === 'too-big' ? 'nota.md pesa más de 1 MB: ábrela con otro editor' : 'No se pudo abrir nota.md';
    setStatus('readonly', reason);
    return;
  }
  textarea.value = String(result.text || '');
  editable = true;
  textarea.readOnly = false;
  updateCount();
  setStatus('idle');
}

function onInput() {
  if (!editable) return;
  dirty = true;
  setStatus('typing');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, SAVE_DELAY);
}

/** Guarda ya, si hay cambios. */
async function saveNote() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !editable || !textarea) return;
  dirty = false;
  updateCount();
  setStatus('saving');

  let result = null;
  try {
    result = await window.notch.note.save(textarea.value);
  } catch {
    result = { ok: false };
  }
  if (dirty) return; // seguiste escribiendo mientras se guardaba: ya viene otro guardado
  if (result?.ok) {
    setStatus('saved');
  } else {
    dirty = true; // se reintentará en el próximo guardado
    setStatus('error', result?.error === 'too-long' ? 'Es demasiado larga para guardarla' : STATUS_TEXT.error);
  }
}

/** Pone el cursor en la nota (la primera vez, al final del texto). */
function focusNote() {
  if (!editable || !textarea) return;
  // Esperamos un fotograma: el panel tiene que ser visible para recibir el foco.
  requestAnimationFrame(() => {
    if (!state.isExpanded || getCurrentTab() !== 'note' || currentSegment !== 'note') return;
    textarea.focus({ preventScroll: true });
    if (!caretPlaced) {
      caretPlaced = true;
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      textarea.scrollTop = textarea.scrollHeight;
    }
  });
}

/** Cambia la parte activa entre 'note' y 'tasks'. */
export function setNoteSegment(name) {
  if (!SEGMENTS.includes(name)) return;
  const previous = currentSegment;
  currentSegment = name;
  if (notePage) notePage.dataset.segment = name;

  segmentButtons.forEach((btn) => {
    const active = btn.dataset.segment === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  const visible = state.isExpanded && getCurrentTab() === 'note';
  moveNoteSegmentIndicator(visible);

  if (name === 'note') {
    focusNote();
  } else if (name === 'tasks') {
    saveNote();
    const tasksInput = $('tasks-input');
    if (visible && tasksInput) {
      requestAnimationFrame(() => tasksInput.focus({ preventScroll: true }));
    }
  }

  if (name !== previous && visible) {
    const activePane = notePage?.querySelector(`.note-pane[data-note-pane="${name}"]`);
    if (activePane) {
      const direction = SEGMENTS.indexOf(name) > SEGMENTS.indexOf(previous) ? 1 : -1;
      animate(
        activePane,
        [
          { opacity: 0, transform: `translateX(${20 * direction}px)`, filter: 'blur(3px)' },
          { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' },
        ],
        { duration: 380, easing: cssEasing('--spring-open') }
      );
    }
  }
}

/** Desplaza el indicador deslizante del segmento activo. */
export function moveNoteSegmentIndicator(withAnimation) {
  if (!noteSegmentIndicator) return;
  const active = segmentButtons.find((btn) => btn.dataset.segment === currentSegment);
  if (!active) return;
  noteSegmentIndicator.classList.toggle('no-animation', !withAnimation);
  noteSegmentIndicator.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
  noteSegmentIndicator.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
}

export function initNote() {
  if (textarea) {
    textarea.readOnly = true; // hasta que loadNote ponga lo guardado
    textarea.addEventListener('input', onInput);
  }

  segmentButtons.forEach((btn) => {
    btn.addEventListener('click', () => setNoteSegment(btn.dataset.segment));
  });
  moveNoteSegmentIndicator(false);

  // Módulo de tareas (Fase 12)
  initTasksModule();
  loadInitialTasks();

  onTabChange((tab, previousTab) => {
    if (previousTab === 'note') saveNote();
    if (tab === 'note' && state.isExpanded) {
      moveNoteSegmentIndicator(false);
      if (currentSegment === 'note') focusNote();
      else if (currentSegment === 'tasks') {
        const input = $('tasks-input');
        if (input) requestAnimationFrame(() => input.focus({ preventScroll: true }));
      }
    }
  });

  onPanelChange((expanded) => {
    if (!expanded) {
      saveNote();
    } else if (getCurrentTab() === 'note') {
      moveNoteSegmentIndicator(false);
      if (currentSegment === 'note') focusNote();
      else if (currentSegment === 'tasks') {
        const input = $('tasks-input');
        if (input) requestAnimationFrame(() => input.focus({ preventScroll: true }));
      }
    }
  });

  document.addEventListener('contextmenu', () => saveNote());
  window.addEventListener('beforeunload', () => saveNote());
}
