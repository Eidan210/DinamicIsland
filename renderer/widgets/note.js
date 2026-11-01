// =============================================================================
//  renderer/widgets/note.js — Widget Nota: el principio de tu nota rápida
// -----------------------------------------------------------------------------
//  Enseña las primeras líneas de nota.md (1x1: estrecho; 2x1: ancho). Un
//  toque abre la página Nota con el cursor listo para escribir.
//  Brilla en rojo si la nota no se pudo guardar.
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { getNoteStatus, getNoteText, onNoteChange } from '../modules/note.js';

const PREVIEW_CHARS = 280; // de sobra para las 3 líneas que caben

const widget = $('home-note');
const textEl = $('home-note-text');

let isVisible = () => false;

function render() {
  // Mientras escribes en la página Nota, Home no se ve: lo dibujamos al volver.
  if (!isVisible() && textEl.dataset.ready === 'true') return;
  textEl.dataset.ready = 'true';
  // Sin líneas vacías de más (el widget es pequeño)
  const preview = getNoteText().slice(0, PREVIEW_CHARS).replace(/\n{2,}/g, '\n').trim();
  setText(textEl, preview);
  widget.dataset.empty = String(!preview);
}

export const noteWidget = {
  type: 'note',
  name: 'Nota',
  description: 'El principio de tu nota rápida',
  icon: 'i-w-note',
  accent: 'var(--warning)',
  sizes: ['2x1', '1x1'],
  goto: 'note',
  init(context) {
    isVisible = context.isVisible;
    onNoteChange(render);
  },
  render,
  news: () => (getNoteStatus() === 'error' ? ['error'] : []),
};
