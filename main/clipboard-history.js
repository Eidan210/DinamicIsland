// =============================================================================
//  main/clipboard-history.js — La lista de lo que copiaste (lógica pura)
// -----------------------------------------------------------------------------
//  Sin Electron ni archivos: solo la lista, para poder probarla con Node.
//  La usa main/clipboard.js.
//    • Hasta 30 textos, del más nuevo al más viejo. Al pasar de 30 se va el
//      más viejo que no esté fijado.
//    • Copiar otra vez algo que ya está no lo repite: sube arriba.
//    • Hasta 10 fijados (no se van al pasar de 30 ni con "Borrar").
//    • Todo en memoria: nada se escribe en el disco.
// =============================================================================

'use strict';

const MAX_ITEMS = 30;
const MAX_PINNED = 10;
// ⚠️ Igual que MaxTextChars en helpers/WinHelper/ClipboardModule.cs
const MAX_TEXT_CHARS = 100000;
const PREVIEW_CHARS = 1500; // lo que ve la página de cada texto (el resto se queda aquí)
const MAX_SOURCE_CHARS = 60;

/**
 * Qué parece el texto (la página lo dibuja distinto):
 * 'link' | 'email' | 'color' | 'path' | 'code' | 'text'
 */
function kindOf(text) {
  const value = text.trim();
  if (value.length <= 2048 && !/\s/.test(value)) {
    if (/^https?:\/\/[^/\s]+\.[^\s]+$|^https?:\/\/localhost(:\d+)?(\/\S*)?$/i.test(value)) return 'link';
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return 'email';
  }
  if (colorOf(value)) return 'color';
  if (!value.includes('\n') && /^([a-z]:\\|\\\\[^\\\s]+\\)/i.test(value)) return 'path';
  const lines = value.split('\n');
  const looksLikeCode =
    /[{};]\s*$|=>|^\s*(const|let|var|function|def|class|import|export|return|if|for|while|public|private|using|namespace|#include)\b|<\/?[a-z][\w-]*[^>]*>/im;
  if (lines.length >= 2 && looksLikeCode.test(value)) return 'code';
  return 'text';
}

/**
 * Si el texto es un color (#ff8800, #f80, rgb(255 136 0), hsl(...)) lo
 * devuelve tal cual; si no, ''. Solo dejamos pasar estas formas: la página lo
 * usa como color de verdad.
 */
function colorOf(text) {
  const value = text.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
  if (/^(rgb|hsl)a?\(\s*[\d.]+(deg|%)?(\s*[,\s]\s*[\d.]+%?){2}(\s*[,/]\s*[\d.]+%?)?\s*\)$/i.test(value)) return value;
  return '';
}

/** El dominio de un link, sin "www." ("" si no es un link). */
function hostOf(text) {
  try {
    return new URL(text.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Crea un historial vacío.
 * @param {{ now?: () => number }} [options]  now: el reloj (las pruebas usan uno falso)
 */
function createHistory({ now = Date.now } = {}) {
  let items = []; // del más nuevo al más viejo: { id, text, source, time, pinned, kind }
  let nextId = 1;

  function find(id) {
    return items.find((item) => item.id === String(id)) || null;
  }

  /** Sube un elemento arriba del todo (al copiarlo otra vez). */
  function moveToTop(item) {
    item.time = now();
    items = [item, ...items.filter((other) => other !== item)];
  }

  /** Al pasar de 30, se van los más viejos que no estén fijados. */
  function trim() {
    while (items.length > MAX_ITEMS) {
      const index = items.findLastIndex((item) => !item.pinned);
      if (index === -1) break;
      items.splice(index, 1);
    }
  }

  return {
    /**
     * Copiaste un texto.
     * @returns {{ item: object, isNew: boolean } | null}  null si no vale (vacío, enorme...)
     */
    add(text, source = '') {
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS) return null;
      const existing = items.find((item) => item.text === text);
      if (existing) {
        moveToTop(existing);
        return { item: existing, isNew: false };
      }
      const item = {
        id: String(nextId++),
        text,
        source: typeof source === 'string' ? source.trim().slice(0, MAX_SOURCE_CHARS) : '',
        time: now(),
        pinned: false,
        kind: kindOf(text),
      };
      items.unshift(item);
      trim();
      return { item, isNew: true };
    },

    /** El elemento con ese id (o null). */
    get: find,

    /** Lo vuelves a copiar: sube arriba. Devuelve el elemento (o null). */
    use(id) {
      const item = find(id);
      if (item) moveToTop(item);
      return item;
    },

    /** Fijar o soltar. Devuelve { ok, error? } (error: 'not-found' | 'too-many'). */
    setPinned(id, pinned) {
      const item = find(id);
      if (!item) return { ok: false, error: 'not-found' };
      if (pinned && !item.pinned && items.filter((other) => other.pinned).length >= MAX_PINNED) {
        return { ok: false, error: 'too-many' };
      }
      item.pinned = pinned === true;
      trim();
      return { ok: true };
    },

    /** Quita uno. Devuelve true si estaba. */
    remove(id) {
      const before = items.length;
      items = items.filter((item) => item.id !== String(id));
      return items.length !== before;
    },

    /** "Borrar": quita todo menos los fijados (o todo, con keepPinned: false). */
    clear({ keepPinned = true } = {}) {
      const before = items.length;
      items = keepPinned ? items.filter((item) => item.pinned) : [];
      return before - items.length;
    },

    /** Cuántos hay. */
    size: () => items.length,

    /**
     * Lo que ve la página: solo el principio de cada texto (los textos
     * enteros se quedan aquí). `extra(item)` añade campos (p. ej. el logo).
     */
    list(extra = () => ({})) {
      return items.map((item) => ({
        id: item.id,
        preview: item.text.slice(0, PREVIEW_CHARS),
        length: item.text.length,
        lines: item.text.trim().split('\n').length,
        source: item.source,
        time: item.time,
        pinned: item.pinned,
        kind: item.kind,
        color: item.kind === 'color' ? colorOf(item.text) : '',
        host: item.kind === 'link' ? hostOf(item.text) : '',
        ...extra(item),
      }));
    },
  };
}

module.exports = { createHistory, kindOf, colorOf, hostOf, MAX_ITEMS, MAX_PINNED, MAX_TEXT_CHARS, PREVIEW_CHARS };
