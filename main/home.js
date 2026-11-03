// =============================================================================
//  main/home.js — Los widgets de Home: cuáles se ven, en qué orden y de qué tamaño
// -----------------------------------------------------------------------------
//  Home es una rejilla de 4 columnas y 2 filas. Cada widget ocupa 1 celda
//  ("1x1") o 2 celdas seguidas en la misma fila ("2x1"). Lo que eliges en el
//  modo edición se guarda en tu carpeta de datos:
//      %APPDATA%\Notch\home.json
//      { "version": 1, "widgets": [ { "type": "music", "size": "2x1" }, ... ] }
//  Los widgets van en orden: la página los coloca uno tras otro y rellena los
//  huecos. Si el archivo no existe o está mal, se usa el de por defecto.
//
//  ⚠️ Los tipos y tamaños, iguales que en renderer/widgets/index.js.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { stripBom } = require('./config');

const GRID_CELLS = 8; // 4 columnas × 2 filas
const MAX_FILE_BYTES = 64 * 1024;

// Los widgets que hay y los tamaños que admite cada uno (el primero, el de por defecto).
const WIDGET_SIZES = {
  clock: ['1x1', '2x1'],
  music: ['2x1', '1x1'],
  focus: ['1x1', '2x1'],
  ai: ['1x1', '2x1'],
  links: ['2x1', '1x1'],
  battery: ['1x1'],
  note: ['2x1', '1x1'],
  clipboard: ['2x1', '1x1'],
  week: ['2x1', '1x1'],
  'next-event': ['2x1', '1x1'],
  'focus-today': ['1x1', '2x1'],
  water: ['1x1', '2x1'],
  tasks: ['2x1', '1x1'],
  'world-clock': ['2x1', '1x1'],
  countdown: ['1x1', '2x1'],
  weather: ['1x1', '2x1'],
};

// Home la primera vez (o si home.json está mal)
const DEFAULT_WIDGETS = [
  { type: 'music', size: '2x1' },
  { type: 'focus', size: '1x1' },
  { type: 'ai', size: '1x1' },
  { type: 'links', size: '2x1' },
  { type: 'note', size: '2x1' },
];

let widgets = null; // lo último que se cargó o guardó
let saveQueue = Promise.resolve();

function getHomePath() {
  return path.join(app.getPath('userData'), 'home.json');
}

/** Celdas que ocupa un widget: "2x1" → 2. */
function cellsOf(size) {
  return size === '2x1' ? 2 : 1;
}

/**
 * Revisa una lista de widgets. Se queda con los buenos y cuenta los problemas:
 * tipos que no existen, repetidos, tamaños que no admite o más de 8 celdas.
 * @returns {{ widgets: { type: string, size: string }[], problems: string[] }}
 */
function checkWidgets(list) {
  const result = [];
  const problems = [];
  if (!Array.isArray(list)) return { widgets: result, problems: ['"widgets" no es una lista'] };
  let cells = 0;
  for (const item of list) {
    const type = item && typeof item === 'object' ? item.type : undefined;
    if (!Object.hasOwn(WIDGET_SIZES, type)) {
      problems.push(`no existe el widget ${JSON.stringify(type)}`);
      continue;
    }
    if (result.some((widget) => widget.type === type)) {
      problems.push(`"${type}" está repetido`);
      continue;
    }
    const sizes = WIDGET_SIZES[type];
    let size = item.size;
    if (!sizes.includes(size)) {
      if (size !== undefined) problems.push(`"${type}" no puede medir ${JSON.stringify(size)}`);
      size = sizes[0];
    }
    if (cells + cellsOf(size) > GRID_CELLS) {
      problems.push(`"${type}" ya no cabe (solo hay ${GRID_CELLS} celdas)`);
      continue;
    }
    cells += cellsOf(size);
    result.push({ type, size });
  }
  return { widgets: result, problems };
}

/**
 * Los widgets de Home (los lee de home.json la primera vez).
 * @returns {Promise<{ widgets: { type: string, size: string }[] }>}
 */
async function getHomeLayout() {
  if (!widgets) widgets = await readHomeFile();
  return { widgets: widgets.map((widget) => ({ ...widget })) };
}

async function readHomeFile() {
  const filePath = getHomePath();
  try {
    const { size } = await fs.promises.stat(filePath);
    if (size > MAX_FILE_BYTES) throw new Error('pesa demasiado');
    const data = JSON.parse(stripBom(await fs.promises.readFile(filePath, 'utf8')));
    const { widgets: list, problems } = checkWidgets(data?.widgets);
    if (problems.length) console.warn(`[home] home.json: ${problems.join('; ')}. Uso el resto.`);
    // Si no quedó nada bueno pero el archivo traía widgets, mejor el de por defecto.
    if (!list.length && Array.isArray(data?.widgets) && data.widgets.length) return DEFAULT_WIDGETS.map((w) => ({ ...w }));
    return list;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[home] No se pudo leer ${filePath} (${error.message}). Uso el Home de por defecto.`);
    return DEFAULT_WIDGETS.map((widget) => ({ ...widget }));
  }
}

/**
 * Guarda los widgets que eligió el modo edición.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function saveHomeLayout(list) {
  const { widgets: checked, problems } = checkWidgets(list);
  if (problems.length) {
    console.warn(`[home] No guardo Home: ${problems.join('; ')}.`);
    return Promise.resolve({ ok: false, error: 'invalid' });
  }
  widgets = checked;
  const text = `${JSON.stringify({ version: 1, widgets: checked }, null, 2)}\n`;
  // Encadenamos cada guardado al anterior: nunca se escriben dos a la vez.
  const job = saveQueue.then(() => writeHomeFile(text));
  saveQueue = job;
  return job;
}

async function writeHomeFile(text) {
  const filePath = getHomePath();
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tempPath, text, 'utf8');
    try {
      await fs.promises.rename(tempPath, filePath); // cambia el archivo viejo por el nuevo de golpe
    } catch {
      await fs.promises.writeFile(filePath, text, 'utf8');
      await fs.promises.rm(tempPath, { force: true });
    }
    return { ok: true };
  } catch (error) {
    console.warn(`[home] No se pudo guardar ${filePath}: ${error.message}`);
    return { ok: false, error: 'write' };
  }
}

module.exports = { getHomeLayout, saveHomeLayout, checkWidgets, WIDGET_SIZES, DEFAULT_WIDGETS, GRID_CELLS };
