// =============================================================================
//  main/music.js — La música que suena en Windows
// -----------------------------------------------------------------------------
//  Recibe del WinHelper los mensajes {"type":"media", ...} (título, artista,
//  estado, posición, duración, app y, solo cuando cambia, la carátula) y se
//  los pasa a la página. También le reenvía las órdenes (play, pause...) y
//  avisa a quien lo pida (las letras) cada vez que cambia la canción.
// =============================================================================

'use strict';

const { state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { saveSetting } = require('./config');
const { onHelperMessage, onHelperStatus, sendToHelper } = require('./helper');

// Órdenes que la página puede mandar (además de "seek").
const MEDIA_COMMANDS = ['play', 'pause', 'toggle', 'next', 'previous'];

// Nombres bonitos para las apps más comunes. Windows identifica cada app con
// un código raro, p. ej. "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App".
const KNOWN_MEDIA_APPS = [
  [/applemusic/i, 'Apple Music'],
  [/itunes/i, 'iTunes'],
  [/spotify/i, 'Spotify'],
  [/zunemusic|zunevideo/i, 'Reproductor multimedia'],
  [/msedge|microsoftedge/i, 'Microsoft Edge'],
  [/chrome/i, 'Google Chrome'],
  [/firefox/i, 'Firefox'],
  [/brave/i, 'Brave'],
  [/opera/i, 'Opera'],
  [/vlc/i, 'VLC'],
  [/deezer/i, 'Deezer'],
  [/tidal/i, 'TIDAL'],
  [/amazonmusic/i, 'Amazon Music'],
  [/foobar/i, 'foobar2000'],
  [/musicbee/i, 'MusicBee'],
];

// Apple Music e iTunes mandan "Artista — Álbum" en el artista y el álbum vacío.
const ARTIST_ALBUM_SEPARATOR = ' — ';

const music = {
  // available: 'starting' | 'ok' | 'missing' (helper sin compilar) | 'unsupported' (no es Windows) | 'error'
  state: { available: 'starting', status: 'none' },
  art: null, // carátula actual como "data URL" (o null)
};

const trackListeners = [];
let lastTrack = { key: '', duration: 0 };

/** "Artista — Álbum" (con el álbum vacío) → ["Artista", "Álbum"]. */
function splitArtistAlbum(artist, album) {
  const index = artist.indexOf(ARTIST_ALBUM_SEPARATOR);
  if (album || index <= 0) return [artist, album];
  return [artist.slice(0, index).trim(), artist.slice(index + ARTIST_ALBUM_SEPARATOR.length).trim()];
}

/** Guarda lo que mandó el helper y se lo pasa a la página. */
function updateMusic(message) {
  // "art" solo viene cuando la carátula cambia ("" = sin carátula).
  const artChanged = typeof message.art === 'string';
  if (artChanged) music.art = message.art ? `data:image/jpeg;base64,${message.art}` : null;

  // timestamp = cuándo midió el helper la posición. Si viniera raro, usamos "ahora".
  const timestamp = Number(message.timestamp);
  const [artist, album] = splitArtistAlbum(String(message.artist || ''), String(message.album || ''));
  music.state = {
    available: 'ok',
    status: String(message.status || 'none'),
    title: String(message.title || ''),
    artist,
    album,
    appName: friendlyAppName(String(message.app || '')),
    position: Number(message.position) || 0, // segundos
    duration: Number(message.duration) || 0, // segundos (0 = la app no lo dice)
    rate: Number(message.rate) || 1,
    timestamp: Number.isFinite(timestamp) && Math.abs(timestamp - Date.now()) < 5000 ? timestamp : Date.now(),
    canPlayPause: message.canPlayPause === true,
    canNext: message.canNext === true,
    canPrevious: message.canPrevious === true,
    canSeek: message.canSeek === true,
  };

  // La carátula (decenas de KB) solo viaja a la página cuando cambia.
  sendToRenderer('media:state', artChanged ? { ...music.state, art: music.art } : music.state);
  checkTrackChange();
}

function setMusicAvailability(available) {
  music.state = { available, status: 'none' };
  music.art = null;
  sendToRenderer('media:state', { ...music.state, art: null });
  checkTrackChange();
}

// -----------------------------------------------------------------------------
// Cambios de canción (para las letras)
// -----------------------------------------------------------------------------

/** Avisa a `listener(canción)` cuando cambia la canción (o se sabe su duración). */
function onTrackChange(listener) {
  trackListeners.push(listener);
}

/** La canción de ahora: { title, artist, album, duration } (title vacío = no suena nada). */
function getCurrentTrack() {
  const { title = '', artist = '', album = '', duration = 0 } = music.state;
  return { title, artist, album, duration };
}

function checkTrackChange() {
  const track = getCurrentTrack();
  const key = track.title ? `${track.title}\n${track.artist}\n${track.album}` : '';
  // Algunas apps dicen la duración un momento después del título: también avisamos.
  const durationArrived = key === lastTrack.key && track.duration > 0 && lastTrack.duration <= 0;
  if (key === lastTrack.key && !durationArrived) return;
  lastTrack = { key, duration: track.duration };
  trackListeners.forEach((listener) => listener(track));
}

/** El botón "Mostrar en la isla" de la página Música (y el menú del clic derecho). */
function setMusicActivity(enabled) {
  const value = enabled === true;
  if (state.settings.musicActivity === value) return;
  state.settings.musicActivity = value;
  saveSetting('musicActivity', value);
  sendToRenderer('settings:changed', state.settings);
}

/** Lo que suena ahora, con la carátula (para cuando la página arranca o se recarga). */
function getMusicState() {
  return { ...music.state, art: music.art };
}

function isMusicPlaying() {
  return music.state.status === 'playing';
}

/** ¿Hay algo cargado que se pueda pausar o reanudar? */
function canToggleMusic() {
  return ['playing', 'paused'].includes(music.state.status) && music.state.canPlayPause === true;
}

/** Manda una orden al helper (solo las de la lista; "seek" con un número de segundos). */
function sendMediaCommand(command, value) {
  if (MEDIA_COMMANDS.includes(command)) {
    sendToHelper(command);
  } else if (command === 'seek' && Number.isFinite(value) && value >= 0) {
    sendToHelper(`seek ${value.toFixed(2)}`);
  }
}

/** "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App" → "Apple Music" */
function friendlyAppName(appId) {
  if (!appId) return '';
  const known = KNOWN_MEDIA_APPS.find(([pattern]) => pattern.test(appId));
  if (known) return known[1];
  // Para el resto, limpiamos el código: quitamos ".exe", "!App", el editor...
  const base = appId
    .split('!')[0]
    .split('\\')
    .pop()
    .replace(/\.exe$/i, '')
    .replace(/_[a-z0-9]{13}$/i, '');
  return base.split('.').pop() || base;
}

// Nos suscribimos al helper: mensajes de música y cambios de estado.
onHelperMessage('media', updateMusic);
onHelperStatus((status) => {
  // 'ok' no cambia nada: esperamos al primer mensaje "media", que llega enseguida.
  if (status !== 'ok') setMusicAvailability(status);
});

module.exports = {
  getMusicState,
  isMusicPlaying,
  canToggleMusic,
  sendMediaCommand,
  onTrackChange,
  getCurrentTrack,
  setMusicActivity,
};
