// =============================================================================
//  main/links.js — Los links de config/links.json
// -----------------------------------------------------------------------------
//  Lee y valida los links. La página solo recibe nombre, inicial y color: para
//  abrir uno pide su número y aquí lo abrimos con shell.openExternal.
// =============================================================================

'use strict';

const { shell } = require('electron');
const { readConfigJson } = require('./config');

// Por seguridad, los links solo pueden ser páginas web o correos.
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// Colores para los links que no indican "color" en links.json.
const LINK_PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];

let links = []; // links ya validados (con su url): la página nunca recibe las urls

/** Lee links.json y se queda solo con los links válidos. Devuelve cuántos hay. */
function loadLinks() {
  const data = readConfigJson('links.json');
  if (data === undefined) {
    links = [];
  } else if (!Array.isArray(data)) {
    console.warn('[links] links.json debe ser una lista: [ { "name": "...", "url": "..." } ]');
    links = [];
  } else {
    links = data.map(normalizeLink).filter(Boolean);
  }
  return links.length;
}

/** Revisa un link de links.json y completa lo que falte (color, inicial...). */
function normalizeLink(entry, index) {
  const label = `El link nº ${index + 1}`;
  if (!entry || typeof entry !== 'object') {
    console.warn(`[links] ${label} no es un objeto { ... }. Lo ignoro.`);
    return null;
  }

  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) {
    console.warn(`[links] ${label} no tiene "name". Lo ignoro.`);
    return null;
  }

  let url;
  try {
    url = new URL(String(entry.url ?? '').trim());
  } catch {
    console.warn(`[links] "${name}": la url no es válida. Lo ignoro.`);
    return null;
  }
  if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) {
    console.warn(`[links] "${name}": solo se permiten links http://, https:// o mailto:. Lo ignoro.`);
    return null;
  }

  const color = isHexColor(entry.color) ? expandHex(entry.color) : pickColor(name);
  // Array.from separa bien los emojis (que ocupan 2 "caracteres" en JS).
  const customInitial = typeof entry.initial === 'string' ? entry.initial.trim() : '';
  const initial = customInitial
    ? Array.from(customInitial).slice(0, 2).join('')
    : Array.from(name)[0].toUpperCase();

  return {
    name,
    url: url.href,
    color,
    initial,
    textColor: isLightColor(color) ? '#111111' : '#ffffff', // texto legible sobre el color
    host: url.protocol === 'mailto:' ? url.pathname : url.hostname,
  };
}

/** Lo que ve la página: todo menos la url (para abrir un link, pide su número). */
function getLinksForRenderer() {
  return links.map(({ name, color, initial, textColor, host }) => ({ name, color, initial, textColor, host }));
}

function openLink(index) {
  const link = Number.isInteger(index) ? links[index] : undefined;
  if (!link) return;
  shell.openExternal(link.url).catch((error) => {
    console.warn(`[links] No se pudo abrir ${link.url}: ${error.message}`);
  });
}

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** "#abc" → "#aabbcc" */
function expandHex(value) {
  const hex = value.trim().slice(1);
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return `#${full.toLowerCase()}`;
}

/** Elige siempre el mismo color de la paleta para el mismo nombre. */
function pickColor(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return LINK_PALETTE[hash % LINK_PALETTE.length];
}

/** ¿Es un color claro? (entonces el texto encima va en negro) */
function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

module.exports = { loadLinks, getLinksForRenderer, openLink };
