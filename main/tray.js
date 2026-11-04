// =============================================================================
//  main/tray.js — La bandeja de archivos (página Portapapeles)
// -----------------------------------------------------------------------------
//  Sueltas archivos sobre la isla y se quedan en la bandeja hasta que los
//  arrastres a otro sitio (el escritorio, una carpeta, un correo, WhatsApp...).
//    • Se guardan como REFERENCIAS: la ruta de cada archivo, nunca una copia.
//      Si lo mueves o lo borras, la bandeja lo marca como "no está".
//    • La lista de rutas vive en tu carpeta de datos (bandeja.json), para que
//      siga ahí al reiniciar. Nada sale de tu PC.
//    • Al sacarlos se COPIAN (nunca se mueven): el original sigue en su sitio.
//    • La página nunca recibe las rutas: solo el nombre, el tamaño y el icono.
//      Para arrastrar uno pide su número y aquí empieza el arrastre de verdad
//      (webContents.startDrag).
// =============================================================================

'use strict';

const { app, dialog, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT_DIR, state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { stripBom } = require('./config');

const MAX_ITEMS = 24;
const MAX_PATH_CHARS = 4096;
const MAX_FILE_BYTES = 256 * 1024; // bandeja.json: solo rutas, nunca debería pesar tanto
const THUMB_SIZE = 96; // miniaturas de 96 px (se ven a 48: nítidas en pantallas con zoom)
const DRAG_ICON_SIZE = 64;

const tray = {
  items: [], // de la más nueva a la más vieja (ver describe())
  loading: null, // la primera lectura de bandeja.json (una promesa)
  saveQueue: Promise.resolve(),
  nextId: 1,
};

function getTrayPath() {
  const base = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'Notch');
  return path.join(base, 'bandeja.json');
}

/** En Windows, "C:\Fotos" y "c:\fotos" son la misma carpeta. */
function keyOf(filePath) {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

/** Una ruta que nos sirve (absoluta, sin caracteres raros), o ''. */
function cleanPath(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_PATH_CHARS || value.includes('\0')) return '';
  if (!path.isAbsolute(value)) return '';
  return path.resolve(value);
}

// -----------------------------------------------------------------------------
// Cada archivo: datos e icono
// -----------------------------------------------------------------------------

// Las carpetas de siempre, con el nombre que ves en el Explorador
// (en el disco se llaman Downloads, Desktop...).
const KNOWN_FOLDERS = [
  ['downloads', 'Descargas'],
  ['desktop', 'Escritorio'],
  ['documents', 'Documentos'],
  ['pictures', 'Imágenes'],
  ['videos', 'Vídeos'],
  ['music', 'Música'],
  ['home', 'Tu carpeta'],
];

/** "C:\Users\Eidan\Downloads" → "Descargas"; cualquier otra, su nombre. */
function folderName(dir) {
  for (const [name, label] of KNOWN_FOLDERS) {
    try {
      if (keyOf(app.getPath(name)) === keyOf(dir)) return label;
    } catch {
      // esa carpeta no existe en este sistema
    }
  }
  return path.basename(dir) || dir;
}

/** Lee el archivo (tamaño, si es carpeta...) y su icono. Si no existe, missing: true. */
async function describe(filePath, addedAt) {
  const item = {
    id: String(tray.nextId++),
    path: filePath,
    name: path.basename(filePath) || filePath,
    folder: folderName(path.dirname(filePath)),
    size: 0,
    isDir: false,
    addedAt,
    modified: 0,
    missing: false,
    icon: null, // nativeImage (también para el arrastre)
    iconUrl: '', // el mismo, como data: para la página
    thumbnail: false, // ¿es una miniatura (foto, vídeo, PDF) o el icono del tipo de archivo?
  };
  try {
    const stat = await fs.promises.stat(filePath);
    item.isDir = stat.isDirectory();
    item.size = stat.isFile() ? stat.size : 0;
    item.modified = stat.mtimeMs;
  } catch {
    item.missing = true;
    return item;
  }
  await loadIcon(item);
  return item;
}

/**
 * La miniatura (fotos, vídeos, PDF... la misma que enseña el Explorador) o,
 * si no tiene, el icono de su tipo de archivo. Las carpetas sin miniatura las
 * dibuja la página.
 */
async function loadIcon(item) {
  let image = null;
  item.thumbnail = false;
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      image = await nativeImage.createThumbnailFromPath(item.path, { width: THUMB_SIZE, height: THUMB_SIZE });
      item.thumbnail = !image.isEmpty();
    } catch {
      image = null; // no tiene miniatura (un .zip, un .txt...)
    }
  }
  // El icono del tipo de archivo (Windows lo elige por la extensión: con
  // las carpetas saldría el de un archivo cualquiera, así que ahí no).
  if ((!image || image.isEmpty()) && !item.isDir) {
    try {
      image = await app.getFileIcon(item.path, { size: 'large' });
    } catch {
      image = null;
    }
  }
  item.icon = image && !image.isEmpty() ? image : null;
  item.iconUrl = item.icon ? item.icon.toDataURL() : '';
}

/** Lo que ve la página de cada archivo (sin la ruta). */
function forRenderer(item) {
  return {
    id: item.id,
    name: item.name,
    folder: item.folder,
    ext: item.isDir ? '' : path.extname(item.name).slice(1).toLowerCase().slice(0, 8),
    size: item.size,
    isDir: item.isDir,
    missing: item.missing,
    icon: item.iconUrl,
    thumbnail: item.thumbnail,
  };
}

// -----------------------------------------------------------------------------
// bandeja.json
// -----------------------------------------------------------------------------

/** Lee bandeja.json la primera vez que hace falta. */
function ensureLoaded() {
  if (!tray.loading) tray.loading = readTrayFile();
  return tray.loading;
}

async function readTrayFile() {
  const filePath = getTrayPath();
  let entries = [];
  try {
    const { size } = await fs.promises.stat(filePath);
    if (size > MAX_FILE_BYTES) throw new Error('pesa demasiado');
    const data = JSON.parse(stripBom(await fs.promises.readFile(filePath, 'utf8')));
    entries = Array.isArray(data?.items) ? data.items : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[bandeja] No se pudo leer ${filePath} (${error.message}). Empiezo vacía.`);
    return;
  }

  const seen = new Set();
  const wanted = [];
  for (const entry of entries) {
    const filePath = cleanPath(entry?.path);
    if (!filePath || seen.has(keyOf(filePath)) || wanted.length >= MAX_ITEMS) continue;
    seen.add(keyOf(filePath));
    const addedAt = Number(entry.addedAt);
    wanted.push({ filePath, addedAt: Number.isFinite(addedAt) ? addedAt : Date.now() });
  }
  // Las que ya no existen se quedan marcadas ("no está"): quizá estaban en un USB.
  tray.items = await Promise.all(wanted.map(({ filePath, addedAt }) => describe(filePath, addedAt)));
}

/** Guarda la lista de rutas (de una en una y sin dejar el archivo a medias). */
function saveTray() {
  const text = `${JSON.stringify({ version: 1, items: tray.items.map(({ path: filePath, addedAt }) => ({ path: filePath, addedAt })) }, null, 2)}\n`;
  const job = tray.saveQueue.then(() => writeTrayFile(text));
  tray.saveQueue = job;
  return job;
}

async function writeTrayFile(text) {
  const filePath = getTrayPath();
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tempPath, text, 'utf8');
    try {
      await fs.promises.rename(tempPath, filePath);
    } catch {
      await fs.promises.writeFile(filePath, text, 'utf8');
      await fs.promises.rm(tempPath, { force: true });
    }
  } catch (error) {
    console.warn(`[bandeja] No se pudo guardar ${filePath}: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// Lo que pide la página
// -----------------------------------------------------------------------------

/** La bandeja para la página: { items: [...] }. */
async function getTrayState() {
  await ensureLoaded();
  return { items: tray.items.map(forRenderer), max: MAX_ITEMS };
}

async function sendState() {
  sendToRenderer('tray:state', await getTrayState());
}

/**
 * Añade archivos (las rutas las saca preload.js de lo que sueltas).
 * @returns {Promise<{ ok: boolean, added: number, duplicate: number, missing: number, full: number }>}
 */
async function addPaths(paths) {
  await ensureLoaded();
  const result = { ok: true, added: 0, duplicate: 0, missing: 0, full: 0 };
  if (!Array.isArray(paths)) return { ...result, ok: false };

  const known = new Set(tray.items.map((item) => keyOf(item.path)));
  const fresh = [];
  for (const value of paths.slice(0, 200)) {
    const filePath = cleanPath(value);
    if (!filePath) {
      result.missing++;
    } else if (known.has(keyOf(filePath))) {
      result.duplicate++;
    } else if (tray.items.length + fresh.length >= MAX_ITEMS) {
      result.full++;
    } else {
      known.add(keyOf(filePath));
      fresh.push(filePath);
    }
  }

  const now = Date.now();
  const described = await Promise.all(fresh.map((filePath) => describe(filePath, now)));
  const added = described.filter((item) => !item.missing);
  result.missing += described.length - added.length;
  result.added = added.length;
  if (added.length) {
    tray.items = [...added, ...tray.items]; // las nuevas, delante
    await sendState();
    saveTray();
  }
  return result;
}

/** El botón "Añadir…": elegir archivos con la ventana de Windows. */
async function pickFiles() {
  const { win } = state;
  if (!win || win.isDestroyed()) return { ok: false };
  // Mientras la ventana de elegir está abierta, el panel no se cierra (main/window.js).
  state.dialogOpen = true;
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Añadir a la bandeja',
      buttonLabel: 'Añadir',
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || !filePaths.length) return { ok: true, added: 0, duplicate: 0, missing: 0, full: 0 };
    return await addPaths(filePaths);
  } finally {
    state.dialogOpen = false;
    if (!win.isDestroyed() && state.isExpanded) win.focus();
  }
}

async function removeItem(id) {
  await ensureLoaded();
  const before = tray.items.length;
  tray.items = tray.items.filter((item) => item.id !== String(id));
  if (tray.items.length === before) return;
  await sendState();
  saveTray();
}

/** "Vaciar": quita todo de la bandeja (los archivos siguen en su sitio). */
async function clearTray() {
  await ensureLoaded();
  if (!tray.items.length) return;
  tray.items = [];
  await sendState();
  saveTray();
}

/** Al abrir la página: ¿sigue todo en su sitio? (Solo entonces: no se vigila nada.) */
async function refreshTray() {
  await ensureLoaded();
  let changed = false;
  await Promise.all(
    tray.items.map(async (item) => {
      try {
        const stat = await fs.promises.stat(item.path);
        const size = stat.isFile() ? stat.size : 0;
        if (item.missing || size !== item.size || stat.mtimeMs !== item.modified) {
          // Volvió a aparecer o cambió (p. ej. editaste la foto): icono nuevo
          Object.assign(item, { missing: false, size, isDir: stat.isDirectory(), modified: stat.mtimeMs });
          await loadIcon(item);
          changed = true;
        }
      } catch {
        if (!item.missing) {
          item.missing = true;
          changed = true;
        }
      }
    })
  );
  if (changed) await sendState();
}

/** El icono que se ve bajo el cursor al arrastrar (como mucho de 64 px). */
function dragIconFor(item) {
  let icon = item?.icon;
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(path.join(ROOT_DIR, 'assets', 'icon.png'));
  if (icon.isEmpty()) return null;
  const { width, height } = icon.getSize();
  const scale = DRAG_ICON_SIZE / Math.max(width, height);
  return scale < 1 ? icon.resize({ width: Math.round(width * scale), height: Math.round(height * scale) }) : icon;
}

/**
 * Empieza a arrastrar uno o varios archivos hacia fuera. Mientras arrastras,
 * startDrag no termina; al soltar (o cancelar), avisamos a la página.
 */
function startDragOut(ids) {
  const { win } = state;
  if (!win || win.isDestroyed() || !Array.isArray(ids)) return;
  const wanted = new Set(ids.map(String));
  const chosen = tray.items.filter((item) => wanted.has(item.id) && !item.missing);
  const items = chosen.filter((item) => fs.existsSync(item.path));
  if (items.length !== chosen.length) refreshTray(); // alguno ya no está: que la página lo vea
  const icon = dragIconFor(items[0]);
  if (!items.length || !icon) {
    sendToRenderer('tray:drag-end');
    return;
  }
  try {
    win.webContents.startDrag({ files: items.map((item) => item.path), icon });
  } catch (error) {
    console.warn(`[bandeja] No se pudo arrastrar: ${error.message}`);
  } finally {
    sendToRenderer('tray:drag-end');
  }
}

/** "Mostrar en la carpeta": abre el Explorador con el archivo marcado. */
function showInFolder(id) {
  const item = tray.items.find((other) => other.id === String(id));
  if (item && !item.missing) shell.showItemInFolder(item.path);
}

/**
 * Abre el archivo directamente en el sistema operativo mediante shell.openPath (Fase 16).
 */
async function openFile(id) {
  await ensureLoaded();
  const item = tray.items.find((other) => other.id === String(id));
  if (item && !item.missing) {
    if (typeof shell?.openPath !== 'function') return { ok: true, fallback: true };
    const error = await shell.openPath(item.path);
    if (error) {
      console.warn(`[bandeja] No se pudo abrir ${item.path}: ${error}`);
      return { ok: false, error };
    }
    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

module.exports = {
  getTrayState,
  addPaths,
  pickFiles,
  removeItem,
  clearTray,
  refreshTray,
  startDragOut,
  showInFolder,
  openFile,
  MAX_ITEMS,
};
