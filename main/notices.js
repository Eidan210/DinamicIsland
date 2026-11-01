// =============================================================================
//  main/notices.js — Los avisos de Notch (centro de avisos)
// -----------------------------------------------------------------------------
//  Los avisos que nacen en el proceso principal (Pomodoro terminado, un error
//  en settings.json, un atajo que no se pudo registrar, el helper que falta...)
//  se guardan aquí y se mandan a la página. Ella los enseña en el centro de
//  avisos del panel y, si son importantes, también en la isla unos segundos.
//
//  Solo viven en memoria: al cerrar Notch se olvidan. Notch no lee las
//  notificaciones de otras apps (Windows solo lo permite a apps instaladas
//  desde la Microsoft Store).
// =============================================================================

'use strict';

const { sendToRenderer } = require('./bridge');

const MAX_NOTICES = 30; // guardamos solo los últimos

const notices = [];
let nextId = 1;

/**
 * Añade un aviso y se lo manda a la página.
 * @param {object} notice
 * @param {string} notice.title   el texto principal
 * @param {string} [notice.text]  una línea de detalle
 * @param {string} [notice.kind]  de qué va: 'pomodoro', 'battery', 'error'... (elige el icono)
 * @param {'info'|'success'|'warning'|'danger'} [notice.tone]  el color
 * @param {boolean} [notice.alert]  además, enseñarlo en la isla unos segundos
 * @param {string} [notice.key]   si ya hay un aviso con esta clave, este lo sustituye
 *                                 (así un mismo error no se repite diez veces)
 */
function addNotice({ title, text = '', kind = 'info', tone = 'info', alert = false, key = '' }) {
  if (key) removeFromList(key);
  const notice = {
    id: nextId++,
    key,
    kind,
    tone,
    title: String(title),
    text: String(text),
    alert: alert === true,
    time: Date.now(),
  };
  notices.push(notice);
  if (notices.length > MAX_NOTICES) notices.shift();

  console.log(`[aviso] ${notice.title}${notice.text ? ` — ${notice.text}` : ''}`);
  sendToRenderer('notice:add', notice);
  return notice;
}

/** Quita el aviso con esta clave (p. ej. cuando el error ya se arregló). */
function clearNotice(key) {
  if (removeFromList(key)) sendToRenderer('notice:remove', key);
}

function removeFromList(key) {
  const index = notices.findIndex((notice) => notice.key === key);
  if (index === -1) return false;
  notices.splice(index, 1);
  return true;
}

/** Todos los avisos guardados (la página los pide al arrancar). */
function getNotices() {
  return notices.slice();
}

/** "Borrar todo" en el centro de avisos. */
function clearAllNotices() {
  notices.length = 0;
}

module.exports = { addNotice, clearNotice, getNotices, clearAllNotices };
