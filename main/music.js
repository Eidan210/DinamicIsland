// =============================================================================
//  main/music.js — La música que suena en Windows
// -----------------------------------------------------------------------------
//  Recibe del WinHelper los mensajes {"type":"media", ...} (título, artista,
//  estado, posición, duración, app y, solo cuando cambia, la carátula) y se
//  los pasa a la página. También le reenvía las órdenes (play, pause...).
// =============================================================================

'use strict';

const { sendToRenderer } = require('./bridge');
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

const music = {
  // available: 'starting' | 'ok' | 'missing' (helper sin compilar) | 'unsupported' (no es Windows) | 'error'
  state: { available: 'starting', status: 'none' },
  art: null, // carátula actual como "data URL" (o null)
};

/** Guarda lo que mandó el helper y se lo pasa a la página. */
function updateMusic(message) {
  // "art" solo viene cuando la carátula cambia ("" = sin carátula).
  const artChanged = typeof message.art === 'string';
  if (artChanged) music.art = message.art ? `data:image/jpeg;base64,${message.art}` : null;

  // timestamp = cuándo midió el helper la posición. Si viniera raro, usamos "ahora".
  const timestamp = Number(message.timestamp);
  music.state = {
    available: 'ok',
    status: String(message.status || 'none'),
    title: String(message.title || ''),
    artist: String(message.artist || ''),
    album: String(message.album || ''),
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
}

function setMusicAvailability(available) {
  music.state = { available, status: 'none' };
  music.art = null;
  sendToRenderer('media:state', { ...music.state, art: null });
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

module.exports = { getMusicState, isMusicPlaying, canToggleMusic, sendMediaCommand };
