// =============================================================================
//  main/lyrics.js — Letras de las canciones (LRCLIB)
// -----------------------------------------------------------------------------
//  LRCLIB (https://lrclib.net) es una base de datos libre de letras. Es la
//  ÚNICA conexión a internet de Notch, y solo le mandamos el título, el
//  artista, el álbum y la duración de la canción que suena. Se apaga con
//  "lyrics": false en settings.json.
//
//  Al cambiar de canción:
//    1. Miramos la caché (carpeta lyrics/ dentro de los datos de Notch).
//    2. Si no está, esperamos un momento (por si estás pasando canciones) y
//       preguntamos a LRCLIB: primero /api/get (búsqueda exacta) y, si no la
//       encuentra, /api/search (aproximada).
//    3. Guardamos la respuesta en la caché (también el "no hay letra", que se
//       vuelve a buscar a los 7 días) y se la mandamos a la página.
//
//  Estados que ve la página: off (apagadas) | idle (no suena nada) | loading |
//  synced (con tiempos) | plain (sin tiempos) | instrumental | none | error.
// =============================================================================

'use strict';

const { app, net } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');
const music = require('./music');
const { cleanTitle, pickBest, recordToLyrics } = require('./lrc');

// NOTCH_LRCLIB_URL solo sirve para las pruebas (un LRCLIB falso en tu PC).
const LRCLIB_URL = process.env.NOTCH_LRCLIB_URL || 'https://lrclib.net';
const FETCH_DELAY = 1500; // ms tras cambiar de canción antes de preguntar a LRCLIB
const REQUEST_TIMEOUT = 10 * 1000; // si LRCLIB no contesta en 10 s, lo dejamos
const NOT_FOUND_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // "no hay letra" se vuelve a buscar a los 7 días
const CACHE_VERSION = 1;

const lyrics = {
  key: '', // de qué canción es (título + artista + álbum)
  status: 'idle',
  lines: null, // [{ time, text }] si status es 'synced'
  plain: null, // texto si status es 'plain'
};

let pendingTrack = null; // la canción que espera su turno para preguntar a LRCLIB
let fetchTimer = null;

/** LRCLIB pide que cada app se presente con su nombre, versión y web. */
function getUserAgent() {
  return `Notch/${app.getVersion()} (https://github.com/Eidan210/DinamicIsland)`;
}

function trackKey(track) {
  return track.title ? `${track.title}\n${track.artist}\n${track.album}` : '';
}

function getLyricsState() {
  return { ...lyrics };
}

function setLyrics(next) {
  lyrics.key = next.key;
  lyrics.status = next.status;
  lyrics.lines = next.status === 'synced' ? next.lines : null;
  lyrics.plain = next.status === 'plain' ? next.plain : null;
  sendToRenderer('lyrics:state', getLyricsState());
}

// -----------------------------------------------------------------------------
// Cambio de canción
// -----------------------------------------------------------------------------

async function onTrackChange(track, { force = false } = {}) {
  const key = trackKey(track);
  if (!state.settings.lyrics) {
    cancelFetch();
    setLyrics({ key, status: 'off' });
    return;
  }
  if (!key) {
    cancelFetch();
    setLyrics({ key: '', status: 'idle' });
    return;
  }
  if (key === lyrics.key && !force) {
    // La misma canción: quizá ahora sabemos su duración (sirve para buscarla mejor).
    if (pendingTrack && trackKey(pendingTrack) === key) pendingTrack = { ...track };
    return;
  }

  cancelFetch();
  setLyrics({ key, status: 'loading' });

  const cached = await readCache(key);
  if (lyrics.key !== key) return; // mientras leíamos, cambiaste de canción
  if (cached) {
    setLyrics({ key, ...cached });
    return;
  }

  pendingTrack = { ...track };
  fetchTimer = setTimeout(() => fetchPending(key), FETCH_DELAY);
}

function cancelFetch() {
  clearTimeout(fetchTimer);
  fetchTimer = null;
  pendingTrack = null;
}

async function fetchPending(key) {
  const track = pendingTrack;
  fetchTimer = null;
  pendingTrack = null;
  if (!track || trackKey(track) !== key) return;

  let result;
  try {
    result = await findLyrics(track);
  } catch (error) {
    console.warn(`[letras] No se pudo buscar "${track.title}": ${error.message}`);
    if (lyrics.key === key) setLyrics({ key, status: 'error' });
    return;
  }
  await writeCache(key, result);
  if (lyrics.key === key) setLyrics({ key, ...result });
}

/** Botón "Reintentar" de la página (tras un error de conexión). */
function retryLyrics() {
  onTrackChange(music.getCurrentTrack(), { force: true });
}

/** Al guardar settings.json: si cambió "lyrics", se aplica al momento. */
function onSettingsChanged() {
  const shouldBeOff = !state.settings.lyrics;
  if (shouldBeOff !== (lyrics.status === 'off')) onTrackChange(music.getCurrentTrack(), { force: true });
}

// -----------------------------------------------------------------------------
// LRCLIB
// -----------------------------------------------------------------------------

/** Busca la letra: primero exacta (/api/get) y, si no, aproximada (/api/search). */
async function findLyrics({ title, artist, album, duration }) {
  // Sin artista (un vídeo cualquiera en el navegador...) no buscamos: con
  // solo el título saldría la letra de otra canción que se llame igual.
  if (!artist) return { status: 'none' };
  if (duration > 0) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    params.set('duration', String(Math.round(duration)));
    const record = await requestJson(`/api/get?${params}`);
    if (record) return recordToLyrics(record);
  }

  const params = new URLSearchParams({ track_name: cleanTitle(title), artist_name: artist });
  const results = await requestJson(`/api/search?${params}`);
  return recordToLyrics(pickBest(results, { title, artist, duration }));
}

/** Pide un JSON a LRCLIB. Devuelve null si no lo encuentra (404). */
async function requestJson(pathAndQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    // net.fetch usa la red de Chromium: respeta el proxy que tengas configurado en Windows.
    const response = await net.fetch(`${LRCLIB_URL}${pathAndQuery}`, {
      headers: { 'User-Agent': getUserAgent(), Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`LRCLIB respondió ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Caché (un archivo JSON por canción)
// -----------------------------------------------------------------------------

function cachePath(key) {
  const name = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(app.getPath('userData'), 'lyrics', `${name}.json`);
}

async function readCache(key) {
  try {
    const data = JSON.parse(await fs.promises.readFile(cachePath(key), 'utf8'));
    if (data.version !== CACHE_VERSION || data.key !== key) return null;
    if (data.status === 'none' && Date.now() - data.savedAt > NOT_FOUND_MAX_AGE) return null;
    if (!['synced', 'plain', 'instrumental', 'none'].includes(data.status)) return null;
    return { status: data.status, lines: data.lines, plain: data.plain };
  } catch {
    return null; // no está (o el archivo está mal): se busca de nuevo
  }
}

async function writeCache(key, result) {
  const filePath = cachePath(key);
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify({ version: CACHE_VERSION, key, savedAt: Date.now(), ...result }));
  } catch (error) {
    console.warn(`[letras] No se pudo guardar en la caché: ${error.message}`);
  }
}

// Nos enteramos de cada cambio de canción.
music.onTrackChange((track) => onTrackChange(track));

module.exports = { getLyricsState, retryLyrics, onSettingsChanged };
