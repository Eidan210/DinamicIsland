// =============================================================================
//  main/clipboard.js — El historial del portapapeles (página Portapapeles)
// -----------------------------------------------------------------------------
//  El WinHelper nos avisa cada vez que copias TEXTO (Windows le avisa a él:
//  no se mira nada cada X segundos):
//    {"type":"clipboard","text":"...","source":"Google Chrome"}
//  y aquí guardamos los últimos 30 (clipboard-history.js), SOLO EN MEMORIA:
//  nunca se escriben en el disco ni salen de tu PC, y al cerrar Notch se
//  olvidan (también los fijados).
//
//  Lo que los programas marcan como privado (gestores de contraseñas) ni
//  llega: el helper no lo lee. Con el botón de pausa de la página, o con
//  "clipboard": false en settings.json, el helper deja de mirar el
//  portapapeles (y con false, además, se borra lo que había).
//
//  La página recibe solo el principio de cada texto, para dibujarlo. Al
//  pulsar uno, aquí se vuelve a copiar el texto entero.
// =============================================================================

'use strict';

const { clipboard } = require('electron');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { getHelperStatus, onHelperMessage, onHelperStatus, sendToHelper } = require('./helper');
const { createHistory } = require('./clipboard-history');
const { findLogos } = require('./link-logos');

// Un helper antiguo (sin recompilar) no conoce la orden "clipboard on" y no
// contesta: si en 5 s no dice nada, la página te pide recompilarlo.
const STATUS_TIMEOUT = 5000;
const MAX_LOGO_CACHE = 64;

const history = createHistory();
const logoCache = new Map(); // dominio → logo de Simple Icons (o null)

const watch = {
  paused: false, // el botón de pausa de la página (no se guarda: al reiniciar, vuelve a escuchar)
  // 'starting' | 'on' | 'paused' | 'off' (apagado en settings.json) | 'error' (el
  // helper no pudo) | 'old-helper' (hay que recompilarlo) | 'no-helper' (no hay helper)
  status: 'starting',
  message: '',
  timer: null,
};

/** ¿Quieres que se guarde lo que copias ahora mismo? */
function isWanted() {
  return state.settings.clipboard !== false && !watch.paused;
}

/** Lo que ve la página. */
function getClipboardState() {
  return {
    status: watch.status,
    message: watch.message,
    paused: watch.paused,
    items: history.list((item) => (item.logo ? { logo: item.logo } : {})),
  };
}

function sendState() {
  sendToRenderer('clipboard:state', getClipboardState());
}

function setStatus(status, message = '') {
  clearTimeout(watch.timer);
  watch.timer = null;
  watch.status = status;
  watch.message = message;
  sendState();
}

/** Le dice al helper si debe mirar el portapapeles o no (al arrancar, al pausar...). */
function applyWatching() {
  const helperStatus = getHelperStatus();
  if (state.settings.clipboard === false) {
    if (helperStatus === 'ok') sendToHelper('clipboard off');
    setStatus('off');
    return;
  }
  if (helperStatus !== 'ok') {
    // 'starting' o 'error' (se está reiniciando): cuando arranque, onHelperStatus vuelve aquí.
    setStatus(helperStatus === 'missing' || helperStatus === 'unsupported' ? 'no-helper' : 'starting');
    return;
  }
  if (watch.paused) {
    sendToHelper('clipboard off');
    setStatus('paused');
    return;
  }
  sendToHelper('clipboard on');
  setStatus('starting');
  watch.timer = setTimeout(() => setStatus('old-helper'), STATUS_TIMEOUT);
}

/** El logo de la web de un link (de Simple Icons, sin conexión), o null. */
function logoFor(item) {
  if (item.kind !== 'link') return null;
  let host;
  try {
    host = new URL(item.text.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!logoCache.has(host)) {
    const [logo] = findLogos([{ name: '', url: `https://${host}/` }]);
    if (logoCache.size >= MAX_LOGO_CACHE) logoCache.delete(logoCache.keys().next().value);
    logoCache.set(host, logo ? { path: logo.path, hex: logo.hex, title: logo.title } : null);
  }
  return logoCache.get(host);
}

// -----------------------------------------------------------------------------
// Lo que manda el helper
// -----------------------------------------------------------------------------

onHelperMessage('clipboard', (message) => {
  if (!isWanted()) return; // llegó justo al pausar
  const result = history.add(message.text, message.source);
  if (!result) return;
  if (result.isNew && result.item.kind === 'link') {
    // Los links de webs conocidas (YouTube, GitHub...) llevan su logo, como
    // los de Focus. Sale de Simple Icons, sin conexión: el link nunca se visita.
    result.item.logo = logoFor(result.item);
  }
  sendState();
});

onHelperMessage('clipboard-status', (message) => {
  if (message.state === 'on') setStatus(isWanted() ? 'on' : 'paused');
  else if (message.state === 'off') setStatus(state.settings.clipboard === false ? 'off' : 'paused');
  else if (message.state === 'error') setStatus('error', String(message.message || '').slice(0, 200));
});

// El helper arrancó (o se reinició): hay que volver a decirle que mire.
onHelperStatus(() => applyWatching());

// -----------------------------------------------------------------------------
// Lo que pide la página
// -----------------------------------------------------------------------------

/** Vuelve a copiar un elemento (el texto entero) y lo sube arriba. */
function copyClip(id) {
  const item = history.use(String(id));
  if (!item) return false;
  // El helper verá este cambio y nos lo mandará: como el texto ya está en la
  // lista, no se repite (solo sube arriba).
  clipboard.writeText(item.text);
  sendState();
  return true;
}

/** Fijar (true) o soltar (false). Devuelve { ok, error? }. */
function pinClip(id, pinned) {
  const result = history.setPinned(String(id), pinned === true);
  if (result.ok) sendState();
  return result;
}

function removeClip(id) {
  if (history.remove(String(id))) sendState();
}

/** "Borrar": todo menos lo fijado. */
function clearClips() {
  if (history.clear()) sendState();
}

/** Pausar (true) o volver a escuchar (false). */
function setClipboardPaused(paused) {
  watch.paused = paused === true;
  applyWatching();
}

/** settings.json cambió: "clipboard": false lo apaga (y olvida lo que había). */
function onSettingsChanged(previous) {
  if (previous.clipboard === state.settings.clipboard) return;
  if (state.settings.clipboard === false) history.clear({ keepPinned: false });
  applyWatching();
}

module.exports = {
  getClipboardState,
  copyClip,
  pinClip,
  removeClip,
  clearClips,
  setClipboardPaused,
  onSettingsChanged,
};
