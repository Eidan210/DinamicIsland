// =============================================================================
//  renderer/modules/music.js — La música (página, tarjeta de Home, isla, burbuja y aviso)
// -----------------------------------------------------------------------------
//  main.js nos pasa lo que cuenta el WinHelper: título, artista, estado,
//  posición, duración y (solo cuando cambia) la carátula.
//
//  La posición llega "a saltos" (las apps solo la actualizan de vez en cuando),
//  así que guardamos la última posición y el momento en que se midió
//  (timestamp) y, mientras suena, calculamos nosotros la actual:
//      posición ahora = posición + (ahora - timestamp) × velocidad
//
//  También: los colores de la carátula (colors.js), deslizar para cambiar de
//  canción (swipe.js) y el botón "Mostrar en la isla".
// =============================================================================

import { $, animate, setText, formatTime, SPRING, SPRING_POP } from './utils.js';
import { state } from './state.js';
import { getActivity, onShapeChange, showBanner, updateShape } from './island.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { readPalette } from './colors.js';
import { makeSwipeable } from './swipe.js';

const MEDIA_MESSAGES = {
  starting: ['Conectando…', 'Buscando qué suena en Windows'],
  missing: ['Falta el helper de Windows', 'Compílalo con: npm run build:helper'],
  unsupported: ['Solo en Windows', 'La música se lee de la sesión multimedia de Windows'],
  error: ['El helper de Windows se cerró', 'Reintentando…'],
  empty: ['Nada sonando', 'Reproduce algo en Apple Music o en cualquier app'],
};
const BANNER_MS = 4000; // duración del aviso de canción nueva
const MUSIC_GRACE_MS = 1500;

// Pestaña Música...
const playerEl = $('player');
const playerArtWrap = $('player-art-wrap');
const playerArt = $('player-art');
const playerArtGlow = $('player-art-glow');
const playerApp = $('player-app');
const playerTitle = $('player-title');
const playerTitleText = $('player-title-text');
const playerArtist = $('player-artist');
const playerBar = $('player-bar');
const playerElapsed = $('player-elapsed');
const playerRemaining = $('player-remaining');
const mediaPrev = $('media-prev');
const mediaToggle = $('media-toggle');
const mediaNext = $('media-next');
const mediaIsland = $('media-island');
// ...tarjeta de Home...
const homeMusicCard = $('home-music');
const homeMusicArtWrap = $('home-music-art-wrap');
const homeMusicArt = $('home-music-art');
const homeMusicTitle = $('home-music-title');
const homeMusicArtist = $('home-music-artist');
const homeMusicToggle = $('home-music-toggle');
// ...isla, burbuja y aviso.
const island = $('island');
const activityEl = $('activity');
const bannerEl = $('banner');
const activityArt = $('activity-art');
const bubbleMusic = $('bubble-music');
const bubbleArt = $('bubble-art');
const bannerArt = $('banner-art');
const bannerLabel = $('banner-label');
const bannerTitle = $('banner-title');
const bannerArtist = $('banner-artist');

let mediaArt = null; // carátula actual ("data URL") o null
let mediaTicker = null;
let skipDirection = 0; // +1 siguiente / -1 anterior: para animar la carátula hacia ese lado
let skipUntil = 0;
let lastBannerKey = ''; // última canción anunciada con el aviso "Ahora suena"
let artFling = null; // la carátula saliendo hacia un lado tras deslizar
let progressMotion = null; // la barra de progreso avanzando de forma continua
const mediaListeners = [];

/** Avisa a `listener()` cada vez que cambia algo de la música (la usa la letra). */
export function onMediaChange(listener) {
  mediaListeners.push(listener);
}

function notifyMediaChange() {
  mediaListeners.forEach((listener) => listener());
}

function isPlaying() {
  return state.media.status === 'playing';
}

/** ¿Hay algo cargado en alguna app (sonando o en pausa)? */
function hasTrack() {
  const { media } = state;
  return media.available === 'ok' && Boolean(media.title) && !['none', 'closed'].includes(media.status);
}

/** "Título|Artista|Álbum": para saber si cambió la canción. */
function trackKey(media) {
  return media.title ? `${media.title}|${media.artist}|${media.album}` : '';
}

/** Posición actual en segundos, interpolada mientras suena. */
export function getMediaPosition() {
  const { media } = state;
  let position = media.position;
  if (isPlaying()) position += ((Date.now() - media.timestamp) / 1000) * (media.rate || 1);
  return media.duration > 0 ? Math.min(Math.max(position, 0), media.duration) : Math.max(position, 0);
}

/** main.js nos manda el estado nuevo cada vez que algo cambia. */
function onMediaState(newState) {
  const previousKey = trackKey(state.media);
  const wasPlaying = isPlaying();
  const { art, ...rest } = newState;
  state.media = { ...state.media, ...rest };
  if ('art' in newState) setMediaArt(art);
  if (wasPlaying && !isPlaying()) state.musicGraceUntil = Date.now() + MUSIC_GRACE_MS;

  const key = trackKey(state.media);
  renderMedia({ trackChanged: key !== previousKey });

  // Suena una canción que aún no hemos anunciado → aviso "Ahora suena", como
  // la isla dinámica. (Comparamos con la última anunciada y no con el estado
  // anterior porque entre canciones algunas apps pasan por "changing".)
  if (key && isPlaying() && key !== lastBannerKey) {
    lastBannerKey = key;
    if (state.initialized && state.settings.musicActivity && !state.isExpanded) showBanner(BANNER_MS);
  }
  updateShape();
  notifyMediaChange();
}

/** Estado inicial al arrancar (lo que ya sonaba no se anuncia otra vez). */
export function loadInitialMedia(mediaState) {
  const { art, ...rest } = mediaState;
  state.media = { ...state.media, ...rest };
  setMediaArt(art);
  lastBannerKey = trackKey(state.media);
}

function setMediaArt(dataUrl) {
  mediaArt = dataUrl || null;
  for (const img of [playerArt, playerArtGlow, homeMusicArt, activityArt, bubbleArt, bannerArt]) {
    if (mediaArt) img.src = mediaArt;
    else img.removeAttribute('src');
  }
  for (const element of [playerEl, homeMusicCard, bubbleMusic]) element.dataset.hasArt = String(Boolean(mediaArt));
  updateMusicColors();
}

/** Dibuja la música en la pestaña, la tarjeta de Home y el aviso. */
export function renderMedia({ trackChanged = false } = {}) {
  const { media } = state;
  const track = hasTrack();
  const playing = isPlaying();
  const status = media.available !== 'ok' ? media.available : track ? 'ok' : 'empty';
  const [emptyTitle, emptyHint] = MEDIA_MESSAGES[status] || MEDIA_MESSAGES.empty;
  const subtitle = [media.artist, media.album].filter(Boolean).join(' — ');

  // Pestaña Música
  document.documentElement.dataset.musicPlaying = String(playing); // el fondo animado solo se mueve sonando
  playerEl.dataset.state = status;
  playerEl.dataset.playing = String(playing);
  playerEl.dataset.canSeek = String(media.canSeek && media.duration > 0);
  setText(playerApp, media.appName || 'Música');
  const titleChanged = playerTitleText.textContent !== (track ? media.title : emptyTitle);
  setText(playerTitleText, track ? media.title : emptyTitle);
  setText(playerArtist, track ? subtitle : emptyHint);
  mediaToggle.dataset.running = String(playing);
  mediaToggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  mediaToggle.disabled = !media.canPlayPause;
  mediaPrev.disabled = !media.canPrevious;
  mediaNext.disabled = !media.canNext;

  // Tarjeta de Home
  homeMusicCard.dataset.playing = String(playing);
  setText(homeMusicTitle, track ? media.title : 'Nada sonando');
  setText(homeMusicArtist, track ? media.artist || media.appName : 'Apple Music o cualquier app');
  homeMusicToggle.hidden = !track || !media.canPlayPause;
  homeMusicToggle.dataset.running = String(playing);

  // Aviso "Ahora suena"
  setText(bannerLabel, media.appName ? `Ahora suena · ${media.appName}` : 'Ahora suena');
  setText(bannerTitle, media.title);
  setText(bannerArtist, media.artist);

  renderMediaProgress();
  updateProgressMotion();
  if (titleChanged) updateTitleMarquee();
  if (trackChanged && track) animateTrackChange();
}

/** Barra de progreso y tiempos (los tiempos cambian una vez por segundo). */
function renderMediaProgress() {
  const { duration } = state.media;
  const position = getMediaPosition();
  playerBar.style.setProperty('--progress', duration > 0 ? (position / duration).toFixed(4) : '0');
  setText(playerElapsed, formatTime(position));
  setText(playerRemaining, duration > 0 ? `-${formatTime(duration - position)}` : '');
}

/**
 * La barra avanza de forma continua, no a saltos cada segundo: una única
 * animación de --progress desde donde va hasta el final, al ritmo de la
 * canción. Se rehace al pausar, saltar o cambiar de canción, y solo existe
 * con la página Música a la vista y la música sonando.
 */
function updateProgressMotion() {
  progressMotion?.cancel();
  progressMotion = null;
  const { duration, rate } = state.media;
  if (!isPlaying() || !state.isExpanded || getCurrentTab() !== 'music' || duration <= 0) return;
  const position = getMediaPosition();
  const remainingMs = ((duration - position) / (rate || 1)) * 1000;
  if (remainingMs <= 0) return;
  progressMotion = animate(playerBar, [{ '--progress': position / duration }, { '--progress': 1 }], {
    duration: remainingMs,
    easing: 'linear',
    fill: 'forwards',
  });
}

/**
 * Si el título no cabe, se desplaza de lado a lado (marquesina), como en
 * Apple Music. --marquee = cuánto hay que moverlo; --marquee-time, en cuánto.
 */
function updateTitleMarquee() {
  playerTitle.classList.remove('is-marquee');
  const overflow = playerTitleText.scrollWidth - playerTitle.clientWidth;
  if (overflow <= 4) return;
  playerTitle.style.setProperty('--marquee', `${-overflow - 12}px`);
  playerTitle.style.setProperty('--marquee-time', `${Math.max(5, overflow / 22 + 3).toFixed(1)}s`);
  playerTitle.classList.add('is-marquee');
}

/** La barra avanza una vez por segundo, solo con el panel abierto y mientras suena. */
function updateMediaTicker() {
  if (!isPlaying() || !state.isExpanded) {
    clearTimeout(mediaTicker);
    mediaTicker = null;
    return;
  }
  if (mediaTicker) return; // ya está en marcha

  const tick = () => {
    renderMediaProgress();
    // Esperamos justo hasta que cambie el segundo de la canción (+20 ms de margen).
    const msToNextSecond = ((1 - (getMediaPosition() % 1)) * 1000) / (state.media.rate || 1);
    mediaTicker = setTimeout(tick, msToNextSecond + 20);
  };
  tick();
}

/** Canción nueva: la carátula llega desde el lado del botón que pulsaste (o del gesto). */
function animateTrackChange() {
  const direction = Date.now() < skipUntil ? skipDirection : 0;
  skipDirection = 0;
  artFling?.cancel(); // la carátula que salió al deslizar deja paso a la nueva
  artFling = null;
  const from = direction ? `translateX(${direction * 28}px) scale(0.92)` : 'scale(0.86)';
  animate(playerArtWrap, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], {
    duration: 560,
    easing: SPRING_POP,
  });
  animate(playerTitle, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
    duration: 400,
    delay: 60,
    easing: SPRING,
  });
  animate(playerArtist, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
    duration: 400,
    delay: 110,
    easing: SPRING,
  });
  animate(homeMusicArtWrap, [{ opacity: 0, scale: '0.7' }, { opacity: 1, scale: '1' }], {
    duration: 480,
    easing: SPRING_POP,
  });
}

/**
 * Los colores de la carátula (colors.js): --music-accent (el más vivo: barras,
 * progreso, ecualizador) y --art-1/2/3 (los 3 principales: degradados de
 * fondo). Las variables están registradas con @property en styles.css, así
 * que pasan de una canción a otra con suavidad.
 */
function updateMusicColors() {
  const root = document.documentElement;
  root.dataset.hasArt = String(Boolean(mediaArt));
  if (!mediaArt) {
    ['--music-accent', '--art-1', '--art-2', '--art-3'].forEach((name) => root.style.removeProperty(name));
    return;
  }
  const art = mediaArt;
  const image = new Image();
  image.onload = () => {
    if (art !== mediaArt) return; // mientras cargaba, ya cambió la carátula
    const palette = readPalette(image);
    if (!palette) return;
    root.style.setProperty('--music-accent', palette.accent);
    palette.art.forEach((color, index) => root.style.setProperty(`--art-${index + 1}`, color));
  };
  image.src = art;
}

/** Al pulsar play/pausa cambiamos el botón al momento; el helper lo confirma enseguida. */
function toggleMediaOptimistic() {
  const { media } = state;
  if (!media.canPlayPause) return;
  media.position = getMediaPosition();
  media.timestamp = Date.now();
  media.status = isPlaying() ? 'paused' : 'playing';
  window.notch.media.toggle();
  renderMedia(); // (rehace también la barra continua)
  updateShape();
  notifyMediaChange();
}

function skipTrack(direction) {
  skipDirection = direction;
  skipUntil = Date.now() + 4000;
  // La flecha del botón da un pequeño salto hacia su lado.
  const icon = (direction > 0 ? mediaNext : mediaPrev).querySelector('svg');
  animate(icon, [{ translate: '0 0' }, { translate: `${direction * 5}px 0` }, { translate: '0 0' }], {
    duration: 380,
    easing: SPRING_POP,
  });
  if (direction > 0) window.notch.media.next();
  else window.notch.media.previous();
}

/** Salta al segundo indicado (barra de progreso o una línea de la letra), si la app lo permite. */
export function seekTo(seconds) {
  const { media } = state;
  if (!media.canSeek || !Number.isFinite(seconds)) return;
  media.position = media.duration > 0 ? Math.min(Math.max(seconds, 0), media.duration) : Math.max(seconds, 0);
  media.timestamp = Date.now();
  renderMediaProgress();
  updateProgressMotion();
  window.notch.media.seek(media.position);
  notifyMediaChange();
}

/**
 * Deslizar (swipe) para cambiar de canción, en la isla, en la burbuja o en la
 * página. En la página, la carátula sale hacia el lado del gesto y la nueva
 * entra por el otro (animateTrackChange); en la isla, la isla da un pequeño
 * empujón hacia ese lado y luego llega el aviso "Ahora suena".
 */
function swipeTrack(direction) {
  const { media } = state;
  const allowed = direction > 0 ? media.canNext : media.canPrevious;
  const target = state.isExpanded ? playerArtWrap : island;
  if (!allowed) {
    // La app no deja: un pequeño "no" con la cabeza.
    animate(target, [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '0 0' }], {
      duration: 320,
      easing: 'ease-in-out',
    });
    return;
  }
  skipTrack(direction);
  if (state.isExpanded) {
    artFling?.cancel();
    const fling = animate(
      playerArtWrap,
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: `translateX(${-40 * direction}px) scale(0.9)` },
      ],
      { duration: 220, easing: 'ease-in', fill: 'forwards' }
    );
    artFling = fling;
    // Si la app tarda en mandar la canción nueva, la carátula vuelve igualmente.
    setTimeout(() => {
      if (artFling !== fling) return;
      fling?.cancel();
      artFling = null;
    }, 1500);
  } else {
    animate(island, [{ translate: '0 0' }, { translate: `${-12 * direction}px 0` }, { translate: '0 0' }], {
      duration: 420,
      easing: SPRING_POP,
    });
  }
}

/** ¿Se ve la música en la isla (o en el aviso), para poder deslizarla ahí? */
function canSwipeIsland() {
  if (state.isExpanded || !hasTrack()) return false;
  return state.shape === 'banner' || (state.shape === 'activity' && getActivity() === 'music');
}

/** El botón "Mostrar en la isla" refleja el ajuste musicActivity. */
export function renderIslandToggle() {
  const on = state.settings.musicActivity;
  mediaIsland.setAttribute('aria-pressed', String(on));
  mediaIsland.title = on ? 'Se muestra en la isla (pulsa para ocultarla)' : 'No se muestra en la isla (pulsa para mostrarla)';
}

export function initMusic() {
  mediaToggle.addEventListener('click', toggleMediaOptimistic);
  mediaNext.addEventListener('click', () => skipTrack(1));
  mediaPrev.addEventListener('click', () => skipTrack(-1));
  homeMusicToggle.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente también como clic en la tarjeta
    toggleMediaOptimistic();
  });

  // Clic en la barra de progreso → saltar a ese punto (si la app lo permite).
  playerBar.addEventListener('click', (event) => {
    const { media } = state;
    if (!media.canSeek || media.duration <= 0) return;
    const rect = playerBar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    seekTo(fraction * media.duration);
  });

  // "Mostrar en la isla": se guarda en settings.json (musicActivity).
  mediaIsland.addEventListener('click', () => {
    state.settings.musicActivity = !state.settings.musicActivity;
    renderIslandToggle();
    window.notch.media.setActivity(state.settings.musicActivity);
    updateShape();
  });

  // Deslizar para cambiar de canción: en la isla, en la burbuja y en la página.
  makeSwipeable(island, { enabled: canSwipeIsland, onSwipe: swipeTrack, moving: () => [activityEl, bannerEl] });
  makeSwipeable(bubbleMusic, {
    enabled: () => !state.isExpanded && bubbleMusic.classList.contains('is-visible') && hasTrack(),
    onSwipe: swipeTrack,
  });
  makeSwipeable(playerEl, {
    enabled: () => state.isExpanded && hasTrack(),
    onSwipe: swipeTrack,
    moving: () => [playerArtWrap],
    // Desde un botón, la barra o la letra no se arrastra (ahí se hace clic).
    ignoreDragFrom: (target) => Boolean(target.closest('button, .bar, .lyrics')),
  });

  window.notch.media.onChange(onMediaState);
  onPanelChange((expanded) => {
    if (expanded) {
      renderMediaProgress();
      updateTitleMarquee();
    }
    updateProgressMotion(); // con el panel cerrado, la barra continua se para
  });
  onTabChange((tab) => {
    if (tab === 'music') {
      renderMediaProgress();
      updateTitleMarquee();
    }
    updateProgressMotion(); // en otra página, la barra continua se para
  });
  // Cada vez que la isla cambia de forma, la barra se enciende o se apaga.
  onShapeChange(updateMediaTicker);
}
