// =============================================================================
//  main/link-logos.js — Los logos de los links (Simple Icons, sin conexión)
// -----------------------------------------------------------------------------
//  Simple Icons (https://simpleicons.org, licencia CC0: se puede usar libremente)
//  trae más de 3000 logos de marcas, de un solo color. Vienen dentro del
//  paquete npm "simple-icons": no se descarga nada de internet.
//
//  Para cada link buscamos su logo, en este orden:
//    1. El campo "icon" de links.json: "spotify", "Google Drive"... (lo mismo
//       que sale en simpleicons.org). false o "none" = sin logo (la inicial).
//    2. Webs conocidas que comparten dominio: mail.google.com → Gmail,
//       calendar.google.com → Google Calendar, music.youtube.com → YouTube Music...
//    3. El nombre de la web: github.com → "github", claude.ai → "claude".
//    4. El nombre del link: "YouTube Music" → "youtubemusic".
//  Si no hay logo, la página pone la inicial, como siempre.
//
//  Algunas marcas pidieron salir de Simple Icons (Microsoft, LinkedIn, Slack,
//  Amazon...): esos links se quedan con la inicial.
//
//  No usa nada de Electron: así se puede probar con Node sin abrir la app.
// =============================================================================

'use strict';

const fs = require('node:fs');

// Webs conocidas que comparten dominio con otras (sin "www."). Una clave con
// "/" mira también el principio de la ruta: docs.google.com/spreadsheets → Sheets.
const KNOWN_SITES = {
  'mail.google.com': 'gmail',
  'calendar.google.com': 'googlecalendar',
  'drive.google.com': 'googledrive',
  'docs.google.com/spreadsheets': 'googlesheets',
  'docs.google.com/presentation': 'googleslides',
  'docs.google.com/forms': 'googleforms',
  'docs.google.com': 'googledocs',
  'sheets.google.com': 'googlesheets',
  'slides.google.com': 'googleslides',
  'forms.google.com': 'googleforms',
  'meet.google.com': 'googlemeet',
  'maps.google.com': 'googlemaps',
  'google.com/maps': 'googlemaps',
  'photos.google.com': 'googlephotos',
  'translate.google.com': 'googletranslate',
  'keep.google.com': 'googlekeep',
  'classroom.google.com': 'googleclassroom',
  'gemini.google.com': 'googlegemini',
  'news.google.com': 'googlenews',
  'play.google.com': 'googleplay',
  'music.youtube.com': 'youtubemusic',
  'studio.youtube.com': 'youtubestudio',
  'youtu.be': 'youtube',
  'twitter.com': 'x',
  'wa.me': 'whatsapp',
  't.me': 'telegram',
  'music.apple.com': 'applemusic',
  'tv.apple.com': 'appletv',
  'm.me': 'messenger',
};

const MAX_PATH_LENGTH = 60000; // el logo más complejo de Simple Icons ronda los 54 000 caracteres

let missingPackageWarned = false;

/** Carga lo que necesitamos de simple-icons. Si no está instalado, devuelve null. */
function loadSimpleIcons() {
  try {
    const sdk = require('simple-icons/sdk');
    // icons.json pesa unos 450 KB: lo leemos solo al cargar los links y no lo
    // guardamos (por eso fs y no require, que lo dejaría en memoria).
    const dataPath = require.resolve('simple-icons/icons.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const bySlug = new Map(data.map((icon) => [icon.slug, icon]));
    return { sdk, bySlug };
  } catch (error) {
    if (!missingPackageWarned) {
      missingPackageWarned = true;
      console.warn(`[links] No encuentro el paquete simple-icons (${error.message}). Ejecuta "npm install": mientras tanto, los links van con su inicial.`);
    }
    return null;
  }
}

/**
 * El "nombre" de una web: github.com → "github", www.notion.so → "notion",
 * eltiempo.com.co → "eltiempo", bbc.co.uk → "bbc".
 */
function siteName(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  // Dominios de país con dos partes (".com.co", ".co.uk"): el nombre va antes.
  if (parts.length >= 3 && last.length === 2 && second.length <= 3) return parts[parts.length - 3];
  return second;
}

/** Los slugs (nombres de archivo de Simple Icons) que probamos para un link, en orden. */
function candidateSlugs({ name, url }, titleToSlug) {
  const candidates = [];
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    // (links.js ya avisó de la url mala)
  }
  // Con mailto: no miramos el dominio: un correo a alguien@gmail.com se abre
  // con tu programa de correo, no con Gmail.
  if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const isIp = /^[\d.]+$/.test(host) || host.includes(':');
    if (!isIp) {
      const hostAndPath = `${host}${parsed.pathname}`;
      const known = Object.keys(KNOWN_SITES).find((key) => hostAndPath === key || hostAndPath.startsWith(key.includes('/') ? key : `${key}/`));
      if (known) candidates.push(KNOWN_SITES[known]);
      const site = siteName(host);
      if (site) candidates.push(titleToSlug(site));
    }
  }
  if (name) candidates.push(titleToSlug(name));
  return candidates.filter(Boolean);
}

/** Lee el dibujo (el "path" del SVG) de un logo. Devuelve null si algo no cuadra. */
function readLogo(icon, sdk) {
  try {
    const file = require.resolve(`simple-icons/icons/${icon.slug}.svg`);
    const path = sdk.svgToPath(fs.readFileSync(file, 'utf8'));
    // Solo dejamos pasar un dibujo SVG normal (letras de comandos y números).
    if (typeof path !== 'string' || path.length > MAX_PATH_LENGTH || !sdk.SVG_PATH_REGEX.test(path)) return null;
    return { slug: icon.slug, title: icon.title, hex: `#${icon.hex.toLowerCase()}`, path };
  } catch {
    return null;
  }
}

/**
 * Busca el logo de cada link.
 * @param {{ name: string, url: string, icon?: string | false }[]} requests
 *   icon: el campo "icon" de links.json (texto) o false = sin logo.
 * @returns {({ slug, title, hex, path } | null)[]} en el mismo orden que requests
 */
function findLogos(requests) {
  const results = requests.map(() => null);
  if (!requests.some((request) => request.icon !== false)) return results; // nadie quiere logo
  const icons = loadSimpleIcons();
  if (!icons) return results;
  const { sdk, bySlug } = icons;

  requests.forEach((request, index) => {
    if (request.icon === false) return;
    if (typeof request.icon === 'string') {
      // Pediste uno en concreto: por su slug ("googledrive") o su nombre ("Google Drive").
      const wanted = request.icon.trim();
      const icon = bySlug.get(wanted.toLowerCase()) || bySlug.get(sdk.titleToSlug(wanted));
      if (!icon) {
        console.warn(`[links] "${request.name}": no hay ningún logo "${wanted}" en Simple Icons (búscalo en simpleicons.org). Uso la inicial.`);
        return;
      }
      results[index] = readLogo(icon, sdk);
      return;
    }
    for (const slug of candidateSlugs(request, sdk.titleToSlug)) {
      const icon = bySlug.get(slug);
      if (!icon) continue;
      results[index] = readLogo(icon, sdk);
      if (results[index]) return;
    }
  });
  return results;
}

module.exports = { findLogos, siteName, candidateSlugs };
