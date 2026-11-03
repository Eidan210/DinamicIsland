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
  // "always": animar siempre | "system": como Windows (si tienes los "Efectos de
  // animación" apagados, no anima) | "off": nunca
  animations: 'always',
  locale: 'es-ES', // idioma para la fecha y la hora
  hour12: false, // true = reloj de 12 horas (a. m. / p. m.)
  autoHide: true, // cuando no lo usas, se encoge a una mini-muesca (no tapa pestañas)
  revealOnHover: true, // pasar el ratón por la mini-muesca la despierta
  pomodoroMinutes: 25, // duración del Pomodoro
  musicActivity: true, // mostrar la música en la isla mientras suena (y avisar al cambiar de canción)
  lyrics: true, // buscar las letras en LRCLIB (la única conexión a internet de Notch)
  volumeIndicator: true, // al cambiar el volumen, la isla enseña una barra 1,5 s
  glow: true, // brillo de color alrededor de la isla (colores en renderer/styles.css, sección 1b)
  clipboard: true, // historial del portapapeles: los últimos 30 textos que copias (solo en memoria)
  // Clawd (Fase 5)
  clawd: true, // Clawd vive en la isla en lugar de los ojos (false = los ojos de siempre)
  clawdSleepMinutes: 5, // se duerme tras estos minutos sin tocar el PC (o al bloquearlo)
  clawdByeTime: '18:00', // a esta hora se despide hasta mañana ("" = nunca)
  clawdCostume: 'auto', // disfraz: "auto" (según la fecha), "none", "halloween" o "christmas"
  // IA (Fase 3)
  ai: true, // escuchar a Claude Code y Antigravity (servidor solo en tu PC, 127.0.0.1)
  aiPort: 47823, // su puerto (si lo cambias, cambia también la URL en la configuración de Claude Code)
  chatProvider: 'gemini', // chat: "gemini", "claude" o "both" (los dos a la vez)
  claudeModel: 'sonnet', // modelo de Claude en el chat: "opus", "sonnet", "haiku" o "fable"
  geminiModel: '', // modelo de Gemini en el chat ("" = el que use por defecto agy o Gemini CLI)
  geminiCli: 'auto', // "auto" (Antigravity y, si falla, Gemini CLI), "agy" o "gemini"
  // Fase 9: La ventana
  startWithWindows: false, // iniciar con Windows
  monitor: 'primary', // monitor: 'primary' o ID numérico
  topGap: 8, // margen superior (de 0 a 12 px)
  scale: 100, // escala de la isla (del 80 al 130 %)
  autoHideIdle: false, // auto-ocultar a rayita de 120x6 tras inactividad
  autoHideIdleSeconds: 30, // segundos sin actividad para auto-ocultar
  hoverToOpen: false, // abrir el panel al pasar el ratón (250 ms / 400 ms)
  // Fase 10: Motor de luz («Light Engine»)
  light: true, // activar motor de luz
  lightIntensity: 100, // intensidad: 60, 100 o 140 %
  lightSpill: true, // derrame difuso hacia abajo
};

const THEMES = ['auto', 'light', 'dark'];
const CHAT_PROVIDERS = ['gemini', 'claude', 'both'];
const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
const GEMINI_CLIS = ['auto', 'agy', 'gemini'];
const CLAWD_COSTUMES = ['auto', 'none', 'halloween', 'christmas'];
const ANIMATION_MODES = ['always', 'system', 'off'];
const POMODORO_MIN_MINUTES = 1;
const POMODORO_MAX_MINUTES = 180;

/** Carpeta donde viven settings.json y links.json. */
function getConfigDir() {
  // En desarrollo usamos la carpeta config/ del proyecto. En la app empaquetada
  // (npm run dist), electron-builder la copia a resources/config (ver package.json).
  return (app && app.isPackaged) ? path.join(process.resourcesPath, 'config') : path.join(ROOT_DIR, 'config');
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

/** Valida y corrige cualquier objeto de ajustes asegurando tipos válidos. */
function validateSettings(data) {
  const result = { ...DEFAULT_SETTINGS };
  if (data && typeof data === 'object' && !Array.isArray(data)) Object.assign(result, data);

  // Corregimos valores con el tipo equivocado para que nada falle más adelante.
  if (typeof result.shortcut !== 'string' || !result.shortcut.trim()) result.shortcut = DEFAULT_SETTINGS.shortcut;
  result.shortcut = result.shortcut.trim();
  result.pageShortcuts = normalizePageShortcuts(result.pageShortcuts);
  if (!THEMES.includes(result.theme)) result.theme = DEFAULT_SETTINGS.theme;
  if (!ANIMATION_MODES.includes(result.animations)) result.animations = DEFAULT_SETTINGS.animations;
  if (typeof result.locale !== 'string') result.locale = DEFAULT_SETTINGS.locale;
  result.hour12 = result.hour12 === true;
  result.autoHide = result.autoHide !== false;
  result.revealOnHover = result.revealOnHover !== false;
  result.pomodoroMinutes = clampMinutes(result.pomodoroMinutes);
  result.musicActivity = result.musicActivity !== false;
  result.lyrics = result.lyrics !== false;
  result.volumeIndicator = result.volumeIndicator !== false;
  result.glow = result.glow !== false;
  result.clipboard = result.clipboard !== false;
  result.clawd = result.clawd !== false;
  const sleepMinutes = Math.round(Number(result.clawdSleepMinutes));
  result.clawdSleepMinutes =
    Number.isFinite(sleepMinutes) && sleepMinutes >= 1 && sleepMinutes <= 240 ? sleepMinutes : DEFAULT_SETTINGS.clawdSleepMinutes;
  // "HH:MM" (de 00:00 a 23:59) o "" para que no se despida
  if (typeof result.clawdByeTime !== 'string' || !/^(([01]?\d|2[0-3]):[0-5]\d)?$/.test(result.clawdByeTime.trim())) {
    result.clawdByeTime = DEFAULT_SETTINGS.clawdByeTime;
  }
  result.clawdByeTime = result.clawdByeTime.trim();
  if (!CLAWD_COSTUMES.includes(result.clawdCostume)) result.clawdCostume = DEFAULT_SETTINGS.clawdCostume;
  result.ai = result.ai !== false;
  const port = Math.round(Number(result.aiPort));
  result.aiPort = Number.isFinite(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_SETTINGS.aiPort;
  if (!CHAT_PROVIDERS.includes(result.chatProvider)) result.chatProvider = DEFAULT_SETTINGS.chatProvider;
  if (!CLAUDE_MODELS.includes(result.claudeModel)) result.claudeModel = DEFAULT_SETTINGS.claudeModel;
  // El modelo de Gemini va a la línea de comandos: solo letras, números y . _ : -
  if (typeof result.geminiModel !== 'string' || !/^[A-Za-z0-9._:-]{0,60}$/.test(result.geminiModel)) {
    result.geminiModel = DEFAULT_SETTINGS.geminiModel;
  }
  if (!GEMINI_CLIS.includes(result.geminiCli)) result.geminiCli = DEFAULT_SETTINGS.geminiCli;

  // Fase 9: La ventana
  result.startWithWindows = result.startWithWindows === true;
  result.monitor = typeof result.monitor === 'string' || typeof result.monitor === 'number' ? String(result.monitor).trim() : DEFAULT_SETTINGS.monitor;
  const topGap = Math.round(Number(result.topGap));
  result.topGap = Number.isFinite(topGap) && topGap >= 0 && topGap <= 12 ? topGap : DEFAULT_SETTINGS.topGap;
  const scale = Math.round(Number(result.scale));
  result.scale = Number.isFinite(scale) && scale >= 80 && scale <= 130 ? scale : DEFAULT_SETTINGS.scale;
  result.autoHideIdle = result.autoHideIdle === true;
  const idleSecs = Math.round(Number(result.autoHideIdleSeconds));
  result.autoHideIdleSeconds = Number.isFinite(idleSecs) && idleSecs >= 5 && idleSecs <= 300 ? idleSecs : DEFAULT_SETTINGS.autoHideIdleSeconds;
  result.hoverToOpen = result.hoverToOpen === true;

  // Fase 10: Motor de luz («Light Engine»)
  result.light = result.light !== false;
  const intensity = Math.round(Number(result.lightIntensity));
  result.lightIntensity = Number.isFinite(intensity) && intensity >= 40 && intensity <= 200 ? intensity : DEFAULT_SETTINGS.lightIntensity;
  result.lightSpill = result.lightSpill !== false;

  return result;
}

/** settings.json mezclado con los valores por defecto y revisado. */
function loadSettings() {
  const data = readConfigJson('settings.json');
  return validateSettings(data);
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
  validateSettings,
  clampMinutes,
  stripBom,
  readConfigJson,
  loadSettings,
  saveSetting,
  watchConfigFolder,
};
