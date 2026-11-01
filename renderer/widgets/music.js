// =============================================================================
//  renderer/widgets/music.js — Widget Música
// -----------------------------------------------------------------------------
//  1x1: la carátula (con play/pausa encima al pasar el ratón) y la canción.
//  2x1: además, anterior / play-pausa / siguiente y una barra de progreso.
//  Un toque fuera de los botones abre la página Música.
//  Todo lo de la música lo sabe music.js: aquí solo lo dibujamos.
//
//  La barra de progreso avanza sola con una animación del navegador (de
//  donde va la canción hasta el final, en lo que queda): sin temporizadores.
//  Solo se anima mientras se ve (panel abierto en Home y widget de 2x1).
// =============================================================================

import { $, animate, setText, SPRING_POP } from '../modules/utils.js';
import { state } from '../modules/state.js';
import {
  getMediaArt,
  getMediaPosition,
  hasTrack,
  isPlaying,
  onMediaChange,
  skipTrack,
  toggleMedia,
  trackKey,
} from '../modules/music.js';

const widget = $('home-music');
const artWrap = $('home-music-art-wrap');
const art = $('home-music-art');
const title = $('home-music-title');
const artist = $('home-music-artist');
const artToggle = $('home-music-toggle'); // 1x1: encima de la carátula
const prevButton = $('home-music-prev'); // 2x1
const playButton = $('home-music-play');
const nextButton = $('home-music-next');
const progressBar = $('home-music-progress');

let shownArt; // la carátula que tiene el <img> (undefined = aún ninguna)
let shownKey = null; // la canción que enseñamos (para animar al cambiar)
let progressAnimation = null;
let isVisible = () => false;

function render() {
  const { media } = state;
  const track = hasTrack();
  const playing = isPlaying();

  widget.dataset.playing = String(playing);
  widget.dataset.hasTrack = String(track);
  const currentArt = getMediaArt();
  if (currentArt !== shownArt) {
    shownArt = currentArt;
    if (currentArt) art.src = currentArt;
    else art.removeAttribute('src');
    widget.dataset.hasArt = String(Boolean(currentArt));
  }
  setText(title, track ? media.title : 'Nada sonando');
  setText(artist, track ? media.artist || media.appName : 'Apple Music o cualquier app');

  artToggle.hidden = !track || !media.canPlayPause;
  for (const button of [artToggle, playButton]) {
    button.dataset.running = String(playing);
    button.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  }
  playButton.disabled = !track || !media.canPlayPause;
  prevButton.disabled = !track || !media.canPrevious;
  nextButton.disabled = !track || !media.canNext;

  // Canción nueva: la carátula "salta" (no la primera vez que dibujamos)
  const key = track ? trackKey(media) : '';
  if (shownKey !== null && key && key !== shownKey && isVisible()) {
    animate(artWrap, [{ opacity: 0, scale: '0.7' }, { opacity: 1, scale: '1' }], { duration: 480, easing: SPRING_POP });
  }
  shownKey = key;

  renderProgress();
}

/** La barra de progreso (solo en 2x1). Se anima sola hasta el final de la canción. */
function renderProgress() {
  progressAnimation?.cancel();
  progressAnimation = null;
  const { duration, rate } = state.media;
  const known = hasTrack() && duration > 0;
  widget.dataset.hasProgress = String(known);
  if (!known) {
    progressBar.style.transform = 'scaleX(0)';
    return;
  }
  const position = getMediaPosition();
  const from = Math.min(1, position / duration);
  progressBar.style.transform = `scaleX(${from})`;
  if (!isPlaying() || !isVisible() || widget.dataset.size !== '2x1') return;
  const remainingMs = ((duration - position) * 1000) / (rate || 1);
  if (remainingMs <= 0) return;
  // (Sin utils.animate: la barra informa de por dónde va, también sin animaciones.)
  progressAnimation = progressBar.animate([{ transform: `scaleX(${from})` }, { transform: 'scaleX(1)' }], {
    duration: remainingMs,
    easing: 'linear',
    fill: 'forwards',
  });
}

/** Los botones del widget no cuentan como "tocar el widget" (que abre la página). */
function onButton(button, action) {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    action();
  });
}

export const musicWidget = {
  type: 'music',
  name: 'Música',
  description: 'Lo que suena, con sus controles',
  icon: 'i-w-music',
  accent: 'var(--music-color)',
  sizes: ['2x1', '1x1'],
  goto: 'music',
  init(context) {
    isVisible = context.isVisible;
    onButton(artToggle, toggleMedia);
    onButton(playButton, toggleMedia);
    onButton(prevButton, () => skipTrack(-1));
    onButton(nextButton, () => skipTrack(1));
    onMediaChange(render);
  },
  render,
  // Novedad: una canción que aún no habías visto en Home
  news: () => (hasTrack() ? [`track:${trackKey(state.media)}`] : []),
};
