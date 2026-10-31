// =============================================================================
//  renderer/modules/music.js — La música (pestaña, tarjeta de Home, isla y aviso)
// -----------------------------------------------------------------------------
//  main.js nos pasa lo que cuenta el WinHelper: título, artista, estado,
//  posición, duración y (solo cuando cambia) la carátula.
//
//  La posición llega "a saltos" (las apps solo la actualizan de vez en cuando),
//  así que guardamos la última posición y el momento en que se midió
//  (timestamp) y, mientras suena, calculamos nosotros la actual:
//      posición ahora = posición + (ahora - timestamp) × velocidad
// =============================================================================

import { $, animate, setText, formatTime, SPRING, SPRING_POP } from './utils.js';
import { state } from './state.js';
import { onShapeChange, showBanner, updateShape } from './island.js';
import { onPanelChange } from './panel.js';

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
const playerArtist = $('player-artist');
const playerBar = $('player-bar');
const playerElapsed = $('player-elapsed');
const playerRemaining = $('player-remaining');
const mediaPrev = $('media-prev');
const mediaToggle = $('media-toggle');
const mediaNext = $('media-next');
// ...tarjeta de Home...
const homeMusicCard = $('home-music');
const homeMusicArtWrap = $('home-music-art-wrap');
const homeMusicArt = $('home-music-art');
const homeMusicTitle = $('home-music-title');
const homeMusicArtist = $('home-music-artist');
const homeMusicToggle = $('home-music-toggle');
// ...isla y aviso.
const activityArt = $('activity-art');
const bannerArt = $('banner-art');
const bannerLabel = $('banner-label');
const bannerTitle = $('banner-title');
const bannerArtist = $('banner-artist');

let mediaArt = null; // carátula actual ("data URL") o null
let mediaTicker = null;
let skipDirection = 0; // +1 siguiente / -1 anterior: para animar la carátula hacia ese lado
let skipUntil = 0;
let lastBannerKey = ''; // última canción anunciada con el aviso "Ahora suena"

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
  for (const img of [playerArt, playerArtGlow, homeMusicArt, activityArt, bannerArt]) {
    if (mediaArt) img.src = mediaArt;
    else img.removeAttribute('src');
  }
  playerEl.dataset.hasArt = String(Boolean(mediaArt));
  homeMusicCard.dataset.hasArt = String(Boolean(mediaArt));
  updateMusicAccent();
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
  playerEl.dataset.state = status;
  playerEl.dataset.playing = String(playing);
  playerEl.dataset.canSeek = String(media.canSeek && media.duration > 0);
  setText(playerApp, media.appName || 'Música');
  setText(playerTitle, track ? media.title : emptyTitle);
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
  if (trackChanged && track) animateTrackChange();
}

/** Barra de progreso y tiempos (lo único que cambia cada segundo). */
function renderMediaProgress() {
  const { duration } = state.media;
  const position = getMediaPosition();
  playerBar.style.setProperty('--progress', duration > 0 ? (position / duration).toFixed(4) : '0');
  setText(playerElapsed, formatTime(position));
  setText(playerRemaining, duration > 0 ? `-${formatTime(duration - position)}` : '');
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

/** Canción nueva: la carátula llega desde el lado del botón que pulsaste. */
function animateTrackChange() {
  const direction = Date.now() < skipUntil ? skipDirection : 0;
  skipDirection = 0;
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
 * Saca el color "protagonista" de la carátula: la dibujamos en un canvas de
 * 16x16 y promediamos sus píxeles, dando más peso a los colores vivos que a
 * los grises. Ese color tiñe las barras, la barra de progreso y el brillo.
 */
function updateMusicAccent() {
  const root = document.documentElement;
  if (!mediaArt) {
    root.style.removeProperty('--music-accent');
    return;
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      const weight = (max - min) / 255 + 0.05; // cuanto más vivo el color, más cuenta
      r += pixels[i] * weight;
      g += pixels[i + 1] * weight;
      b += pixels[i + 2] * weight;
      total += weight;
    }
    root.style.setProperty('--music-accent', vividColor(r / total, g / total, b / total));
  };
  image.src = mediaArt;
}

/** Convierte un color RGB en una versión viva y clara (para que se vea sobre negro). */
function vividColor(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r / 255) hue = ((g - b) / 255 / delta) % 6;
    else if (max === g / 255) hue = (b - r) / 255 / delta + 2;
    else hue = (r - g) / 255 / delta + 4;
  }
  hue = Math.round(hue * 60 + 360) % 360;
  // Carátulas casi grises (blanco y negro) → el verde de siempre.
  if (delta < 0.08) return '#3dff8f';
  return `hsl(${hue} 85% 66%)`;
}

/** Al pulsar play/pausa cambiamos el botón al momento; el helper lo confirma enseguida. */
function toggleMediaOptimistic() {
  const { media } = state;
  if (!media.canPlayPause) return;
  media.position = getMediaPosition();
  media.timestamp = Date.now();
  media.status = isPlaying() ? 'paused' : 'playing';
  window.notch.media.toggle();
  renderMedia();
  updateShape();
}

function skipTrack(direction) {
  skipDirection = direction;
  skipUntil = Date.now() + 4000;
  if (direction > 0) window.notch.media.next();
  else window.notch.media.previous();
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
    media.position = fraction * media.duration;
    media.timestamp = Date.now();
    renderMediaProgress();
    window.notch.media.seek(media.position);
  });

  window.notch.media.onChange(onMediaState);
  onPanelChange((expanded) => {
    if (expanded) renderMediaProgress();
  });
  // Cada vez que la isla cambia de forma, la barra se enciende o se apaga.
  onShapeChange(updateMediaTicker);
}
