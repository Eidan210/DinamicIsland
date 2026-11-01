// =============================================================================
//  renderer/modules/note.js — La nota rápida (página Nota, Ctrl+Alt+6)
// -----------------------------------------------------------------------------
//  Un cuadro de texto que se guarda solo en nota.md (en tu carpeta de datos):
//    • medio segundo después de que dejes de escribir,
//    • al cerrar el panel o al cambiar de página,
//    • y antes de abrir el menú del clic derecho (por si eliges "Salir").
//  Al abrir la página con su atajo, el cursor ya está listo para escribir.
//  El widget de Home (renderer/widgets/note.js) enseña el principio de la nota.
// =============================================================================

import { $, setText, plural } from './utils.js';
import { state } from './state.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';

const SAVE_DELAY = 500; // ms sin escribir antes de guardar
const STATUS_TEXT = {
  idle: '',
  typing: 'Sin guardar…',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se pudo guardar',
};

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
  noteEl.dataset.state = status;
  setText(statusEl, text);
  changeListeners.forEach((listener) => listener());
}

/** El texto de la nota. */
export function getNoteText() {
  return textarea.value;
}

/** Cómo va la nota: 'idle', 'typing', 'saving', 'saved', 'error' o 'readonly'. */
export function getNoteStatus() {
  return noteEl.dataset.state || 'idle';
}

/** Avisa a `listener()` cuando la nota cambia de estado (al cargarla, al escribir, al guardar...). */
export function onNoteChange(listener) {
  changeListeners.push(listener);
}

function updateCount() {
  // Contamos como palabra lo que tenga alguna letra o número (no los guiones de una lista).
  const words = textarea.value.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  setText(countEl, words ? plural(words, 'palabra', 'palabras') : '');
}

/** Pone la nota guardada en el cuadro (al arrancar). */
export function loadNote(result) {
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
  if (!dirty || !editable) return;
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
  if (!editable) return;
  // Esperamos un fotograma: el panel tiene que ser visible para recibir el foco.
  requestAnimationFrame(() => {
    if (!state.isExpanded || getCurrentTab() !== 'note') return;
    textarea.focus({ preventScroll: true });
    if (!caretPlaced) {
      caretPlaced = true;
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      textarea.scrollTop = textarea.scrollHeight;
    }
  });
}

export function initNote() {
  textarea.readOnly = true; // hasta que loadNote ponga lo guardado
  textarea.addEventListener('input', onInput);

  onTabChange((tab, previousTab) => {
    if (previousTab === 'note') saveNote();
    if (tab === 'note' && state.isExpanded) focusNote();
  });
  onPanelChange((expanded) => {
    if (!expanded) saveNote();
    else if (getCurrentTab() === 'note') focusNote();
  });
  document.addEventListener('contextmenu', () => saveNote());
  window.addEventListener('beforeunload', () => saveNote());
}
