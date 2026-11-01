// =============================================================================
//  renderer/modules/lyrics.js — La letra de la canción (página Música)
// -----------------------------------------------------------------------------
//  main/lyrics.js la busca en LRCLIB y nos la manda. Si tiene tiempos, se ven
//  unas 5 líneas: la que suena va en el centro, resaltada, y la lista se
//  desliza sola al llegar la siguiente. Pulsar una línea salta a ese momento.
//
//  Sin sondeos: programamos UN temporizador justo para el instante de la
//  siguiente línea, y lo recalculamos si pausas, saltas o cambias de canción.
//  Solo funciona con la página Música a la vista: si no se ve, no gasta nada.
// =============================================================================

import { $, setText } from './utils.js';
import { state } from './state.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { getMediaPosition, onMediaChange, seekTo } from './music.js';

const LEAD = 0.2; // s: la línea se enciende un poquito antes (así se siente a tiempo)
const MESSAGES = {
  off: '',
  idle: 'Pon una canción para ver su letra',
  loading: 'Buscando letra…',
  instrumental: 'Instrumental ♪',
  none: 'Sin letra disponible',
  error: 'No se pudo buscar la letra',
};

const lyricsEl = $('lyrics');
const linesEl = $('lyrics-lines');
const messageText = $('lyrics-message-text');
const retryButton = $('lyrics-retry');

let lyrics = { key: '', status: 'idle', lines: null, plain: null };
let lineEls = [];
let currentIndex = null; // null = aún no se ha resaltado ninguna
let lineTimer = null;

function isVisible() {
  return state.isExpanded && getCurrentTab() === 'music';
}

/** ¿La letra es de la canción que suena? (al cambiar de canción, un instante puede no serlo) */
function isForCurrentTrack() {
  const { title, artist, album } = state.media;
  return lyrics.key === (title ? `${title}\n${artist}\n${album}` : '');
}

/** main.js nos manda la letra (al cambiar de canción, al llegar de LRCLIB...). */
export function setLyrics(next) {
  lyrics = {
    key: String(next?.key || ''),
    status: String(next?.status || 'idle'),
    lines: Array.isArray(next?.lines) ? next.lines : null,
    plain: typeof next?.plain === 'string' ? next.plain : null,
  };
  renderLyrics();
}

function renderLyrics() {
  const { status } = lyrics;
  lyricsEl.dataset.status = status;
  setText(messageText, MESSAGES[status] ?? '');
  retryButton.hidden = status !== 'error';

  if (status === 'synced' && lyrics.lines) {
    lineEls = lyrics.lines.map((line, index) => createLine(line.text || '♪', index));
  } else if (status === 'plain' && lyrics.plain) {
    lineEls = lyrics.plain.split(/\r?\n/).map((text) => createLine(text || ' ', null));
  } else {
    lineEls = [];
  }
  linesEl.replaceChildren(...lineEls);
  currentIndex = null;
  lyricsEl.scrollTop = 0;
  syncLyrics({ animate: false });
}

function createLine(text, index) {
  const line = document.createElement('p');
  line.className = 'lyric';
  line.textContent = text; // textContent: la letra nunca se interpreta como HTML
  if (index !== null) line.dataset.index = String(index);
  return line;
}

/** La línea que suena en `position` (segundos), o -1 si aún no empezó la primera. */
function findLineIndex(position) {
  const { lines } = lyrics;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Resalta la línea que toca y programa el temporizador para la siguiente.
 * @param {{ animate?: boolean }} options  false = colocar sin deslizar (al abrir la página)
 */
function syncLyrics({ animate = true } = {}) {
  clearTimeout(lineTimer);
  lineTimer = null;
  if (lyrics.status !== 'synced' || !lyrics.lines || !isVisible() || !isForCurrentTrack()) return;

  const position = getMediaPosition() + LEAD;
  const index = findLineIndex(position);
  showLine(index, animate);

  if (state.media.status !== 'playing') return; // en pausa no hace falta temporizador
  const next = lyrics.lines[index + 1];
  if (!next) return;
  const wait = ((next.time - position) / (state.media.rate || 1)) * 1000;
  lineTimer = setTimeout(() => syncLyrics(), Math.max(40, wait + 15));
}

/** Resalta la línea `index` y desliza la lista para dejarla en el centro. */
function showLine(index, withAnimation) {
  if (index === currentIndex) return;
  currentIndex = index;
  const center = Math.max(index, 0); // antes de la primera línea, centramos la primera
  lineEls.forEach((line, i) => {
    line.classList.toggle('is-current', i === index);
    line.classList.toggle('is-far', Math.abs(i - center) > 2);
  });
  const target = lineEls[center];
  if (!target) return;
  const y = lyricsEl.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2);
  linesEl.classList.toggle('no-animation', !withAnimation);
  linesEl.style.setProperty('--lyrics-y', `${Math.round(y)}px`);
}

/** Al abrir la página Música (o volver a ella), la letra se coloca sin deslizarse. */
function onVisibilityChange() {
  currentIndex = null;
  syncLyrics({ animate: false });
}

export function initLyrics() {
  // Pulsar una línea → saltar a ese momento (si la app lo permite).
  linesEl.addEventListener('click', (event) => {
    const line = event.target.closest('.lyric');
    if (!line || line.dataset.index === undefined || lyrics.status !== 'synced') return;
    seekTo(lyrics.lines[Number(line.dataset.index)].time);
  });
  retryButton.addEventListener('click', () => window.notch.lyrics.retry());

  window.notch.lyrics.onChange(setLyrics);
  onMediaChange(() => syncLyrics()); // pausa, salto, canción nueva...
  onPanelChange(onVisibilityChange);
  onTabChange(onVisibilityChange);
}
