// =============================================================================
//  main/note.js — La nota rápida (página Nota, Ctrl+Alt+6)
// -----------------------------------------------------------------------------
//  Es un archivo de texto normal en la carpeta de datos de Notch:
//    %APPDATA%\Notch\nota.md
//  Puedes abrirlo con cualquier editor (es Markdown, o sea, texto).
//
//  La página nos manda el texto medio segundo después de que dejes de escribir
//  (y al cerrar el panel). Los guardados van de uno en uno y en orden, y se
//  escriben primero en un archivo temporal: si se apaga el PC a mitad, la
//  nota anterior sigue entera.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { stripBom } = require('./config');

// ⚠️ Igual que maxlength de la nota en renderer/index.html.
const MAX_NOTE_CHARS = 200000; // unas 100 páginas: de sobra para una nota rápida
const MAX_FILE_BYTES = 1024 * 1024; // un archivo de más de 1 MB no lo abrimos aquí

let saveQueue = Promise.resolve();

function getNotePath() {
  return path.join(app.getPath('userData'), 'nota.md');
}

/**
 * Lee la nota.
 * @returns {Promise<{ text: string, error?: 'too-big' | 'read' }>}
 *   Si hay error, la página no deja editar: así nunca pisamos el archivo.
 */
async function readNote() {
  const filePath = getNotePath();
  try {
    const { size } = await fs.promises.stat(filePath);
    if (size > MAX_FILE_BYTES) return { text: '', error: 'too-big' };
    return { text: stripBom(await fs.promises.readFile(filePath, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return { text: '' }; // aún no has escrito nada
    console.warn(`[nota] No se pudo leer ${filePath}: ${error.message}`);
    return { text: '', error: 'read' };
  }
}

/**
 * Guarda la nota.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function saveNote(text) {
  if (typeof text !== 'string') return Promise.resolve({ ok: false, error: 'invalid' });
  if (text.length > MAX_NOTE_CHARS) return Promise.resolve({ ok: false, error: 'too-long' });
  // Encadenamos cada guardado al anterior: nunca se escriben dos a la vez.
  const job = saveQueue.then(() => writeNoteFile(text));
  saveQueue = job;
  return job;
}

async function writeNoteFile(text) {
  const filePath = getNotePath();
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tempPath, text, 'utf8');
    try {
      await fs.promises.rename(tempPath, filePath); // cambia la nota vieja por la nueva de golpe
    } catch {
      // Windows no deja renombrar si otro programa tiene la nota abierta de
      // cierta forma: entonces la escribimos directamente.
      await fs.promises.writeFile(filePath, text, 'utf8');
      await fs.promises.rm(tempPath, { force: true });
    }
    return { ok: true };
  } catch (error) {
    console.warn(`[nota] No se pudo guardar ${filePath}: ${error.message}`);
    return { ok: false, error: 'write' };
  }
}

module.exports = { readNote, saveNote };
