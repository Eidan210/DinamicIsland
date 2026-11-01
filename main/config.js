// =============================================================================
//  main/config.js — La carpeta config/ (settings.json y links.json)
// -----------------------------------------------------------------------------
//  Lee y revisa la configuración, guarda cambios sueltos (p. ej. la duración del
//  Pomodoro) y vigila la carpeta para aplicar al momento lo que guardes.
//  Si un archivo tiene un error, se usa lo de por defecto y sale un aviso en la
//  isla (y en el centro de avisos) diciendo qué pasa.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT_DIR, PAGES } = require('./state');
const { addNotice, clearNotice } = require('./notices');

// Valores por defecto de config/settings.json (si falta una clave, se usa esta).
const DEFAULT_SETTINGS = {
  shortcut: 'Control+Alt+T', // atajo global para abrir/cerrar
  // Un atajo por página del panel. "" = esa página sin atajo.
  pageShortcuts: {
    home: 'Control+Alt+1',
    music: 'Control+Alt+2',
    ai: 'Control+Alt+3',
    focus: 'Control+Alt+4',
    clipboard: 'Control+Alt+5',
    note: 'Control+Alt+6',
  },
  theme: 'auto', // tema del panel: "auto" (como Windows), "light" (claro) o "dark" (oscuro)
  locale: 'es-ES', // idioma para la fecha y la hora
  hour12: false, // true = reloj de 12 horas (a. m. / p. m.)
  autoHide: true, // cuando no lo usas, se encoge a una mini-muesca (no tapa pestañas)
  revealOnHover: true, // pasar el ratón por la mini-muesca la despierta
  pomodoroMinutes: 25, // duración del Pomodoro
  musicActivity: true, // mostrar la música en la isla mientras suena (y avisar al cambiar de canción)
  volumeIndicator: true, // al cambiar el volumen, la isla enseña una barra 1,5 s
};

const THEMES = ['auto', 'light', 'dark'];
const POMODORO_MIN_MINUTES = 1;
const POMODORO_MAX_MINUTES = 180;

/** Carpeta donde viven settings.json y links.json. */
function getConfigDir() {
  // En desarrollo usamos la carpeta config/ del proyecto. En la app empaquetada
  // (npm run dist), electron-builder la copia a resources/config (ver package.json).
  return app.isPackaged ? path.join(process.resourcesPath, 'config') : path.join(ROOT_DIR, 'config');
}

/** Quita el BOM: un carácter invisible que el Bloc de notas a veces pone al principio. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Lee un archivo de texto JSON y lo convierte en objeto. Lanza error si está mal. */
function parseJsonFile(filePath) {
  // Sin quitar el BOM, JSON.parse falla con un error muy confuso.
  return JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')));
}

/** Lee un JSON de config/. Si falta o está mal escrito, avisa y devuelve undefined. */
function readConfigJson(fileName) {
  const filePath = path.join(getConfigDir(), fileName);
  const noticeKey = `config:${fileName}`;
  try {
    const data = parseJsonFile(filePath);
    clearNotice(noticeKey); // si había un aviso de error, ya está arreglado
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[config] ${filePath} no existe. Uso valores por defecto.`);
    } else {
      console.warn(`[config] ${filePath} tiene un error: ${error.message}. Uso valores por defecto.`);
      addNotice({
        key: noticeKey,
        kind: 'error',
        tone: 'danger',
        title: `${fileName} tiene un error`,
        text: `${error.message}. Mientras tanto uso lo de por defecto.`,
        alert: true,
      });
    }
    return undefined;
  }
}

/** Ajusta los minutos del Pomodoro a un número entero entre 1 y 180. */
function clampMinutes(value) {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return DEFAULT_SETTINGS.pomodoroMinutes;
  return Math.min(POMODORO_MAX_MINUTES, Math.max(POMODORO_MIN_MINUTES, minutes));
}

/**
 * Atajos de las páginas: los de settings.json encima de los de por defecto.
 * "" (o false/null) deja esa página sin atajo; las páginas que no pongas
 * conservan el suyo.
 */
function normalizePageShortcuts(value) {
  const result = { ...DEFAULT_SETTINGS.pageShortcuts };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const page of PAGES) {
    if (!(page in value)) continue;
    const accelerator = value[page];
    if (accelerator === '' || accelerator === false || accelerator === null) result[page] = '';
    else if (typeof accelerator === 'string' && accelerator.trim()) result[page] = accelerator.trim();
  }
  return result;
}

/** settings.json mezclado con los valores por defecto y revisado. */
function loadSettings() {
  const data = readConfigJson('settings.json');
  const result = { ...DEFAULT_SETTINGS };
  if (data && typeof data === 'object' && !Array.isArray(data)) Object.assign(result, data);

  // Corregimos valores con el tipo equivocado para que nada falle más adelante.
  if (typeof result.shortcut !== 'string' || !result.shortcut.trim()) result.shortcut = DEFAULT_SETTINGS.shortcut;
  result.shortcut = result.shortcut.trim();
  result.pageShortcuts = normalizePageShortcuts(result.pageShortcuts);
  if (!THEMES.includes(result.theme)) result.theme = DEFAULT_SETTINGS.theme;
  if (typeof result.locale !== 'string') result.locale = DEFAULT_SETTINGS.locale;
  result.hour12 = result.hour12 === true;
  result.autoHide = result.autoHide !== false;
  result.revealOnHover = result.revealOnHover !== false;
  result.pomodoroMinutes = clampMinutes(result.pomodoroMinutes);
  result.musicActivity = result.musicActivity !== false;
  result.volumeIndicator = result.volumeIndicator !== false;
  return result;
}

/**
 * Guarda UNA clave en settings.json sin tocar las demás.
 * Si el archivo tiene un error de sintaxis no lo sobrescribimos: perderías lo que escribiste.
 */
function saveSetting(key, value) {
  const filePath = path.join(getConfigDir(), 'settings.json');
  try {
    const data = fs.existsSync(filePath) ? parseJsonFile(filePath) : {};
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('el archivo debe contener un objeto { ... }');
    }
    data[key] = value;
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn(`[config] No se pudo guardar "${key}" en settings.json: ${error.message}`);
  }
}

/**
 * Vigila la carpeta config/: cuando guardas settings.json o links.json, llama
 * a onChange(archivosQueCambiaron) para aplicarlo al momento, sin reiniciar.
 * fs.watch usa avisos del sistema (no comprueba nada periódicamente).
 * @param {(changedFiles: Set<string>) => void} onChange
 */
function watchConfigFolder(onChange) {
  const changedFiles = new Set();
  let reloadTimer = null;
  try {
    fs.watch(getConfigDir(), (_eventType, fileName) => {
      // fileName puede venir vacío en algunos sistemas: entonces recargamos los dos.
      if (!fileName) {
        changedFiles.add('settings.json').add('links.json');
      } else if (fileName === 'settings.json' || fileName === 'links.json') {
        changedFiles.add(fileName);
      } else {
        return;
      }
      // Los editores guardan en varios pasos: esperamos medio segundo a que terminen.
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        onChange(new Set(changedFiles));
        changedFiles.clear();
      }, 500);
    });
  } catch (error) {
    console.warn(`[config] No se pueden vigilar los cambios de ${getConfigDir()}: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  clampMinutes,
  stripBom,
  readConfigJson,
  loadSettings,
  saveSetting,
  watchConfigFolder,
};
