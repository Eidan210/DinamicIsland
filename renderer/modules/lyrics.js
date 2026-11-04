// =============================================================================
//  renderer/modules/lyrics.js — La letra de la canción (página Música)
// -----------------------------------------------------------------------------
//  main/lyrics.js la busca en LRCLIB y nos la manda. Si tiene tiempos, se ve
//  como en Apple Music:
//    • La línea que suena va en el centro y sus palabras se iluminan de
//      izquierda a derecha mientras se canta (una animación CSS por palabra,
//      con su retraso y su duración calculados aquí).
//    • Al cambiar de línea, las líneas suben en cascada con un muelle.
//    • En las pausas instrumentales (y en la intro) salen tres puntos.
//    • Pulsar una línea salta a ese momento.
//
//  Sin sondeos: programamos UN temporizador justo para el instante de la
//  siguiente línea, y lo recalculamos si pausas, saltas o cambias de canción.
//  Solo funciona con la página Música a la vista: si no se ve, no gasta nada.
// =============================================================================

import { $, animate, isMotionReduced, setText, SPRING } from './utils.js';
import { state } from './state.js';
import { runOnFrames, stopOnBeat } from './beat.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { getMediaPosition, onMediaChange, seekTo } from './music.js';

const LEAD = 0.2; // s: la línea se enciende un poquito antes (así se siente a tiempo)
const INTRO_MIN = 4; // s: si la primera línea tarda más, ponemos los puntos de la intro
const INTERLUDE_MIN = 2.5; // s: pausas más cortas no llevan puntos
const STAGGER_MS = 45; // ms entre una línea y la siguiente al subir en cascada
const ENTER_MS = 900; // lo que dura la entrada en cascada de una letra nueva
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
let lines = []; // las líneas que se dibujan (las de LRCLIB, más los puntos de la intro)
let lineEls = [];
let currentIndex = null; // null = aún no se ha resaltado ninguna
let lineTimer = null;
let enterTimer = null;
let fillWords = []; // las palabras de la línea que se está iluminando: { element, from, to, fill, lift }

function isVisible() {
  return state.isExpanded && getCurrentTab() === 'music' && state.settings?.lyricsVisible !== false;
}

/** ¿La letra es de la canción que suena? (al cambiar de canción, un instante puede no serlo) */
function isForCurrentTrack() {
  const { title, artist, album } = state.media;
  return lyrics.key === (title ? `${title}\n${artist}\n${album}` : '');
}

/** main.js nos manda la letra (al cambiar de canción, al llegar de LRCLIB...). */
export function setLyrics(next) {
  const previousStatus = lyrics.status;
  lyrics = {
    key: String(next?.key || ''),
    status: String(next?.status || 'idle'),
    lines: Array.isArray(next?.lines) ? next.lines : null,
    plain: typeof next?.plain === 'string' ? next.plain : null,
  };
  renderLyrics(previousStatus);
}

function renderLyrics(previousStatus) {
  const { status } = lyrics;
  lyricsEl.dataset.status = status;
  setText(messageText, MESSAGES[status] ?? '');
  retryButton.hidden = status !== 'error';
  if (status !== previousStatus && MESSAGES[status]) {
    animate(messageText, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
      duration: 360,
      easing: SPRING,
    });
  }

  lines = [];
  if (status === 'synced' && lyrics.lines?.length) {
    // Intro larga: unos puntos al principio, como en Apple Music.
    if (lyrics.lines[0].time >= INTRO_MIN) lines.push({ time: 0, text: '' });
    lines.push(...lyrics.lines);
    lineEls = lines.map((line, index) => createLine(line, index));
  } else if (status === 'plain' && lyrics.plain) {
    lineEls = lyrics.plain.split(/\r?\n/).map((text, index) => {
      const line = createWords(text || ' ');
      line.style.setProperty('--d', String(Math.min(index, 6)));
      return line;
    });
  } else {
    lineEls = [];
  }
  linesEl.replaceChildren(...lineEls);
  currentIndex = null;
  lyricsEl.scrollTop = 0;

  // La letra nueva entra en cascada.
  if (lineEls.length) {
    clearTimeout(enterTimer);
    lyricsEl.classList.add('is-entering');
    enterTimer = setTimeout(() => lyricsEl.classList.remove('is-entering'), ENTER_MS);
  }
  syncLyrics({ animate: false });
}

/** Una línea: cada palabra en su cajita (para iluminarlas una a una), o los puntos de una pausa. */
function createLine(line, index) {
  const element = line.text ? createWords(line.text) : createInterlude(line, index);
  element.dataset.index = String(index);
  return element;
}

function createWords(text) {
  const element = document.createElement('p');
  element.className = 'lyric';
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      element.append(' ');
    } else {
      const word = document.createElement('span');
      word.className = 'lyric-word';
      word.textContent = part; // textContent: la letra nunca se interpreta como HTML
      element.append(word);
    }
  }
  return element;
}

function createInterlude(line, index) {
  const element = document.createElement('p');
  element.className = 'lyric is-interlude';
  if (lineGap(index, line) < INTERLUDE_MIN) element.classList.add('is-short');
  const dots = document.createElement('span');
  dots.className = 'interlude';
  dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  element.append(dots);
  return element;
}

/** Cuánto dura una línea: hasta que empieza la siguiente (la última, 5 s). */
function lineGap(index, line = lines[index]) {
  const next = lines[index + 1];
  return next ? Math.max(0.3, next.time - line.time) : 5;
}

/** La línea que suena en `position` (segundos), o -1 si aún no empezó la primera. */
function findLineIndex(position) {
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
 * @param {{ animate?: boolean, resync?: boolean }} options
 *   animate: false = colocar sin deslizar (al abrir la página)
 *   resync: la música cambió (pausa, salto...): volver a cuadrar las palabras con ella
 */
function syncLyrics({ animate: withAnimation = true, resync = false } = {}) {
  clearTimeout(lineTimer);
  lineTimer = null;
  if (lyrics.status !== 'synced' || !lines.length || !isVisible() || !isForCurrentTrack()) {
    stopOnBeat('lyrics'); // no se ve: las palabras dejan de iluminarse
    return;
  }

  const playing = state.media.status === 'playing';
  lyricsEl.classList.toggle('is-paused', !playing);
  const offset = Number(state.settings?.lyricsOffset || 0);
  const position = getMediaPosition() + LEAD + offset;
  const index = findLineIndex(position);
  if (index !== currentIndex) showLine(index, withAnimation);
  else if (resync && index >= 0) startLineFill(index); // la misma línea, pero otra posición

  if (!playing) return; // en pausa no hace falta temporizador
  const next = lines[index + 1];
  if (!next) return;
  const wait = ((next.time - position) / (state.media.rate || 1)) * 1000;
  lineTimer = setTimeout(() => syncLyrics(), Math.max(40, wait + 15));
}

/** Resalta la línea `index` y sube la lista en cascada para dejarla en el centro. */
function showLine(index, withAnimation) {
  currentIndex = index;
  const center = Math.max(index, 0); // antes de la primera línea, centramos la primera
  lineEls.forEach((line, i) => {
    const distance = Math.abs(i - center);
    line.classList.toggle('is-current', i === index);
    if (i !== index) line.classList.remove('is-filling');
    line.style.setProperty('--d', String(Math.min(distance, 6)));
    // Cascada: empieza la de encima de la actual y las de debajo la siguen,
    // cada una un poco más tarde (las lejanas, sin esperar: no se ven).
    const order = i - center + 1;
    const delay = withAnimation && order >= 0 && order <= 7 ? order * STAGGER_MS : 0;
    line.style.setProperty('--delay', `${delay}ms`);
  });

  const target = lineEls[center];
  if (target) {
    const y = lyricsEl.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2);
    linesEl.classList.toggle('no-animation', !withAnimation);
    linesEl.style.setProperty('--lyrics-y', `${Math.round(y)}px`);
  }
  if (index >= 0) startLineFill(index);
}

/**
 * Ilumina las palabras de la línea `index` al ritmo de la canción. Cada
 * palabra recibe su parte del tiempo de la línea (las largas, más); si ya
 * íbamos por la mitad, empieza por donde toca. Las pinta paintFill con el
 * reloj de beat.js (24 veces por segundo, en los mismos instantes que la ola).
 */
function startLineFill(index) {
  const element = lineEls[index];
  const line = lines[index];
  if (!element || !line) return;
  const rate = state.media.rate || 1;
  const gap = lineGap(index);
  const offset = Number(state.settings?.lyricsOffset || 0);
  const elapsed = Math.max(0, getMediaPosition() + LEAD + offset - line.time);
  clearFill();

  if (element.classList.contains('is-interlude')) {
    element.style.setProperty('--gap', `${(gap / rate).toFixed(3)}s`);
    element.style.setProperty('--elapsed', `${(elapsed / rate).toFixed(3)}s`);
    // Quitar y volver a poner la clase reinicia los puntos con los tiempos nuevos.
    element.classList.remove('is-filling');
    void element.offsetWidth;
    element.classList.add('is-filling');
    return;
  }

  // Sin animaciones, la línea se ve entera iluminada (el --fill del CSS, 100 %).
  if (isMotionReduced()) return;
  const words = [...element.querySelectorAll('.lyric-word')];
  const letters = words.reduce((sum, word) => sum + word.textContent.length + 1, 0) || 1;
  // Una línea no se canta durante todo su hueco: la llenamos en un poco
  // menos, y nunca más despacio de lo que se tarda en cantar sus letras.
  const fill = Math.min(Math.max(gap * 0.88, 0.5), letters * 0.075 + 0.5);
  const now = performance.now();
  let start = 0;
  fillWords = words.map((word) => {
    const share = ((word.textContent.length + 1) / letters) * fill;
    const from = now + ((start - elapsed) * 1000) / rate;
    start += share;
    return { element: word, from, to: from + (share * 1000) / rate, fill: null, lift: null };
  });
  paintFill(now);
  // En pausa se queda como está (al seguir, syncLyrics vuelve a cuadrarla)
  if (state.media.status === 'playing') runOnFrames('lyrics', paintFill);
}

/**
 * Pinta cada palabra: el degradado avanza (--fill, de -14 % a 114 %) y sube
 * 3 px, uno a uno (con medios píxeles, las letras temblarían).
 */
function paintFill(now) {
  let done = true;
  for (const word of fillWords) {
    const progress = Math.min(1, Math.max(0, (now - word.from) / (word.to - word.from)));
    if (progress < 1) done = false;
    const fill = Math.round(-140 + 1280 * progress) / 10;
    const lift = 2 - Math.ceil(progress * 3);
    if (fill !== word.fill) {
      word.fill = fill;
      word.element.style.setProperty('--fill', `${fill}%`);
    }
    if (lift !== word.lift) {
      word.lift = lift;
      word.element.style.translate = `0 ${lift}px`;
    }
  }
  if (done) stopOnBeat('lyrics');
}

/** La línea anterior vuelve a su aspecto normal. */
function clearFill() {
  stopOnBeat('lyrics');
  for (const { element } of fillWords) {
    element.style.removeProperty('--fill');
    element.style.removeProperty('translate');
  }
  fillWords = [];
}

/** Al abrir la página Música (o volver a ella), la letra se coloca sin deslizarse. */
function onVisibilityChange() {
  currentIndex = null;
  syncLyrics({ animate: false });
}

export function initLyrics() {
  // Pulsar una línea → saltar a ese momento (si la app lo permite), con un pequeño pulso.
  linesEl.addEventListener('click', (event) => {
    const line = event.target.closest('.lyric');
    if (!line || line.dataset.index === undefined || lyrics.status !== 'synced') return;
    animate(line, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], {
      duration: 360,
      easing: 'ease-out',
    });
    seekTo(lines[Number(line.dataset.index)].time);
  });
  retryButton.addEventListener('click', () => window.notch.lyrics.retry());

  window.notch.lyrics.onChange(setLyrics);
  onMediaChange(() => syncLyrics({ resync: true })); // pausa, salto, canción nueva...
  onPanelChange(onVisibilityChange);
  onTabChange(onVisibilityChange);
}
