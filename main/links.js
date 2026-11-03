// =============================================================================
//  main/links.js — Los links de config/links.json
// -----------------------------------------------------------------------------
//  Lee y valida los links. La página solo recibe nombre, inicial, color y
//  logo: para abrir uno pide su número y aquí lo abrimos con shell.openExternal.
//  Los logos salen de Simple Icons, sin conexión (main/link-logos.js).
// =============================================================================

'use strict';

const { shell } = require('electron');
const { readConfigJson } = require('./config');
const { findLogos } = require('./link-logos');

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
  addLogos(links);
  return links.length;
}

/**
 * Pone a cada link su logo (si lo hay). Sin "color" en links.json, el círculo
 * toma el color de la marca (el verde de Spotify, el rojo de YouTube...).
 */
function addLogos(list) {
  const logos = findLogos(list.map(({ name, url, iconRequest }) => ({ name, url, icon: iconRequest })));
  list.forEach((link, index) => {
    const logo = logos[index];
    link.logo = logo ? { path: logo.path, title: logo.title } : null;
    if (logo && !link.hasColor) {
      link.color = logo.hex;
      link.textColor = isLightColor(logo.hex) ? '#111111' : '#ffffff';
    }
  });
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

  let url = null;
  let localPath = null;
  if (typeof entry.path === 'string' && entry.path.trim()) {
    localPath = entry.path.trim();
  } else {
    try {
      url = new URL(String(entry.url ?? '').trim());
      if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) {
        console.warn(`[links] "${name}": solo se permiten links http://, https:// o mailto:. Lo ignoro.`);
        return null;
      }
    } catch {
      console.warn(`[links] "${name}": debe tener una "url" válida o una ruta "path" local. Lo ignoro.`);
      return null;
    }
  }

  const hasColor = isHexColor(entry.color);
  const color = hasColor ? expandHex(entry.color) : pickColor(name);
  // Array.from separa bien los emojis (que ocupan 2 "caracteres" en JS).
  const customInitial = typeof entry.initial === 'string' ? entry.initial.trim() : '';
  const initial = customInitial
    ? Array.from(customInitial).slice(0, 2).join('')
    : Array.from(name)[0].toUpperCase();

  return {
    name,
    url: url ? url.href : null,
    path: localPath,
    color,
    hasColor,
    initial,
    textColor: isLightColor(color) ? '#111111' : '#ffffff', // texto legible sobre el color
    host: localPath ? 'local' : url.protocol === 'mailto:' ? url.pathname : url.hostname,
    iconRequest: readIconField(entry, name, Boolean(customInitial)),
  };
}

/**
 * El campo "icon" de links.json:
 *   "spotify" o "Google Drive" → ese logo de Simple Icons
 *   false o "none"             → sin logo (la inicial)
 *   (sin "icon")               → lo buscamos solos; si pusiste "initial", la inicial
 * Devuelve el texto, false (sin logo) o undefined (buscarlo solos).
 */
function readIconField(entry, name, hasCustomInitial) {
  const { icon } = entry;
  if (icon === false || icon === null) return false;
  if (typeof icon === 'string') {
    const text = icon.trim();
    return !text || text.toLowerCase() === 'none' ? false : text;
  }
  if (icon !== undefined) console.warn(`[links] "${name}": "icon" debe ser un texto ("spotify") o false. Lo ignoro.`);
  return hasCustomInitial ? false : undefined;
}

/** Lo que ve la página: todo menos la url (para abrir un link, pide su número). */
function getLinksForRenderer() {
  return links.map(({ name, color, initial, textColor, host, logo }) => ({ name, color, initial, textColor, host, logo }));
}

function openLink(index) {
  const link = Number.isInteger(index) ? links[index] : undefined;
  if (!link) return;
  if (link.path) {
    shell.openPath(link.path).then((err) => {
      if (err) console.warn(`[links] No se pudo abrir ruta ${link.path}: ${err}`);
    }).catch((error) => {
      console.warn(`[links] Error abriendo ruta ${link.path}: ${error.message}`);
    });
  } else if (link.url) {
    shell.openExternal(link.url).catch((error) => {
      console.warn(`[links] No se pudo abrir ${link.url}: ${error.message}`);
    });
  }
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
