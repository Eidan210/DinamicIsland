// =============================================================================
//  main/lrc.js — Leer letras sincronizadas y elegir la mejor de LRCLIB
// -----------------------------------------------------------------------------
//  Funciones "puras": no usan Electron ni internet, así que se prueban fácil.
//
//  Una letra sincronizada (formato LRC) tiene cada verso con su instante:
//      [00:17.12] I feel your breath upon my neck
//      [01:02.50][02:10.00] Un estribillo que se repite
//  Puede traer etiquetas como [ar:Artista] (se ignoran) y [offset:+500]
//  (adelanta toda la letra medio segundo).
// =============================================================================

'use strict';

const MAX_LINES = 2000; // de sobra para cualquier canción

// [mm:ss], [mm:ss.xx] o [mm:ss:xx]
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
// Marcas de palabra del LRC "mejorado": <00:12.34>
const WORD_TIMESTAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

/**
 * Texto LRC → lista de versos ordenada: [{ time (segundos), text }].
 * Los versos vacíos (pausas instrumentales) se quedan, con text: ''.
 */
function parseLrc(lrc) {
  const lines = [];
  let offset = 0;
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const offsetTag = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
    if (offsetTag) {
      offset = Number(offsetTag[1]) / 1000;
      continue;
    }
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue; // [ar:...], [ti:...] o una línea sin tiempo
    const text = raw.replace(/\[[^\]]*\]/g, '').replace(WORD_TIMESTAMP, '').trim();
    for (const stamp of stamps) {
      const seconds = Number(stamp[1]) * 60 + Number(stamp[2].replace(':', '.'));
      if (Number.isFinite(seconds)) lines.push({ time: seconds, text });
    }
    if (lines.length > MAX_LINES) break;
  }
  // [offset:+500] = la letra debe salir medio segundo ANTES.
  return lines
    .map((line) => ({ time: Math.max(0, Math.round((line.time - offset) * 1000) / 1000), text: line.text }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Quita lo que suele sobrar en los títulos para buscar mejor:
 * "Canción (feat. Alguien)" → "Canción", "Canción - Remastered 2011" → "Canción".
 */
function cleanTitle(title) {
  const original = String(title || '').trim();
  const cleaned = original
    .replace(/\s*[([](?:feat|ft|with|con)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(?:official\s+video|official\s+music\s+video|video\s+oficial|videoclip|clip\s+oficial|official\s+audio|audio\s+oficial|lyrics?|letras?|lyric\s+video|visualizer|official\s+visualizer|audio|video)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(?:remaster|version|versión|live|en vivo|edit|mono|stereo|deluxe|bonus)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+[^-]*(?:remaster|version|versión|live|en vivo|edit|mono|stereo|official\s+video|official\s+audio|lyrics?|audio|visualizer)[^-]*$/i, '')
    .trim();
  return cleaned || original;
}

/** Para comparar textos: minúsculas, sin tildes ni signos. Sirve con cualquier alfabeto. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // las tildes, separadas de su letra por normalize('NFD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * De los resultados de /api/search, el que más se parece a la canción que
 * suena (o null si ninguno se parece lo bastante).
 */
function pickBest(records, { title, artist, duration }) {
  if (!Array.isArray(records)) return null;
  const wantTitle = normalize(cleanTitle(title));
  const wantArtist = normalize(artist);
  if (!wantTitle) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const record of records) {
    if (!record || (!record.syncedLyrics && !record.plainLyrics && !record.instrumental)) continue;
    const gotTitle = normalize(cleanTitle(record.trackName));
    const gotArtist = normalize(record.artistName);

    let score = 0;
    if (gotTitle === wantTitle) score += 4;
    else if (gotTitle && (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle))) score += 2;
    else continue; // otra canción

    if (wantArtist) {
      if (gotArtist === wantArtist) score += 3;
      else if (gotArtist && (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist))) score += 1;
      else score -= 3;
    }

    const recordDuration = Number(record.duration) || 0;
    if (duration > 0 && recordDuration > 0) {
      const difference = Math.abs(recordDuration - duration);
      if (difference <= 2) score += 3;
      else if (difference <= 5) score += 1;
      else if (difference > 15) score -= 4; // seguramente otra versión
    }

    if (record.syncedLyrics) score += 2; // mejor con tiempos

    if (score > bestScore) {
      best = record;
      bestScore = score;
    }
  }
  return bestScore >= 4 ? best : null;
}

/**
 * Un resultado de LRCLIB → lo que necesita la página:
 *   { status: 'synced', lines } | { status: 'plain', plain } | { status: 'instrumental' } | { status: 'none' }
 */
function recordToLyrics(record) {
  if (!record) return { status: 'none' };
  if (record.instrumental === true) return { status: 'instrumental' };
  const lines = parseLrc(record.syncedLyrics);
  if (lines.some((line) => line.text)) return { status: 'synced', lines };
  const plain = String(record.plainLyrics || '').trim();
  if (plain) return { status: 'plain', plain };
  return { status: 'none' };
}

module.exports = { parseLrc, cleanTitle, normalize, pickBest, recordToLyrics };
