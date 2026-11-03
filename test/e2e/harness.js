/**
 * test/e2e/harness.js — Opaque-box E2E Test Harness for Notch
 * 
 * Provides pure vanilla Node.js utilities for inspecting DOM, CSS, IPC contracts,
 * Electron main process logic, beat animations, and repository integrity.
 * Zero external npm dependencies.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const Module = require('node:module');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Lee un archivo del proyecto Notch relativo a la raíz. */
function readProjectFile(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

/** Comprueba si un archivo existe dentro del proyecto. */
function fileExists(relPath) {
  return fs.existsSync(path.join(PROJECT_ROOT, relPath));
}

// -----------------------------------------------------------------------------
// Utilidades de inspección CSS
// -----------------------------------------------------------------------------

/** Extrae variables CSS definidas en :root o cualquier bloque del archivo styles.css. */
function extractCssVariables(css) {
  const vars = new Map();
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(css)) !== null) {
    vars.set(match[1].trim(), match[2].trim());
  }
  return vars;
}

/**
 * Busca bloques de reglas CSS cuyo selector coincida con un patrón.
 * Devuelve un array de objetos { selector, body, raw }.
 */
function findCssRules(css, selectorPattern) {
  const rules = [];
  const regex = typeof selectorPattern === 'string'
    ? new RegExp(`${escapeRegExp(selectorPattern)}\\s*\\{([^}]+)\\}`, 'g')
    : new RegExp(`([^{}]+)\\s*\\{([^}]+)\\}`, 'g');

  let match;
  while ((match = regex.exec(css)) !== null) {
    const selector = match[1].trim();
    const body = match[2].trim();
    if (typeof selectorPattern === 'string') {
      rules.push({ selector, body, raw: match[0] });
    } else if (selectorPattern.test(selector)) {
      rules.push({ selector, body, raw: match[0] });
    }
  }
  return rules;
}

/** Verifica si un cuerpo de regla CSS contiene una propiedad con un valor esperado. */
function ruleHasProperty(body, propertyName, valuePattern) {
  const propRegex = new RegExp(`(^|;)\\s*${escapeRegExp(propertyName)}\\s*:\\s*([^;]+)(;|$)`, 'im');
  const match = propRegex.exec(body);
  if (!match) return false;
  if (!valuePattern) return true;
  const val = match[2].trim();
  if (valuePattern instanceof RegExp) return valuePattern.test(val);
  return val.toLowerCase().includes(String(valuePattern).toLowerCase());
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -----------------------------------------------------------------------------
// Utilidades de inspección HTML
// -----------------------------------------------------------------------------

/** Extrae los atributos de un elemento con determinado ID. */
function extractElementById(html, id) {
  const regex = new RegExp(`<([a-zA-Z0-9]+)[^>]*id=["']${escapeRegExp(id)}["'][^>]*>`, 'i');
  const match = regex.exec(html);
  if (!match) return null;
  return {
    tag: match[1].toLowerCase(),
    raw: match[0],
    hasAttribute: (attr) => new RegExp(`\\b${escapeRegExp(attr)}(\\s*=\\s*["'][^"']*["'])?`, 'i').test(match[0]),
    getAttribute: (attr) => {
      const aMatch = new RegExp(`\\b${escapeRegExp(attr)}\\s*=\\s*["']([^"']*)["']`, 'i').exec(match[0]);
      return aMatch ? aMatch[1] : null;
    },
  };
}

/** Extrae elementos que coincidan con una clase CSS. */
function extractElementsByClass(html, className) {
  const regex = new RegExp(`<([a-zA-Z0-9]+)[^>]*class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>`, 'gi');
  const elements = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawTag = match[0];
    elements.push({
      tag: match[1].toLowerCase(),
      raw: rawTag,
      hasAttribute: (attr) => new RegExp(`\\b${escapeRegExp(attr)}(\\s*=\\s*["'][^"']*["'])?`, 'i').test(rawTag),
      getAttribute: (attr) => {
        const aMatch = new RegExp(`\\b${escapeRegExp(attr)}\\s*=\\s*["']([^"']*)["']`, 'i').exec(rawTag);
        return aMatch ? aMatch[1] : null;
      },
    });
  }
  return elements;
}

/** Extrae todas las opciones (<option>) de un <select> por su ID. */
function extractSelectOptions(html, selectId) {
  const selectRegex = new RegExp(`<select[^>]*id=["']${escapeRegExp(selectId)}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i');
  const match = selectRegex.exec(html);
  if (!match) return [];
  const options = [];
  const optRegex = /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let optMatch;
  while ((optMatch = optRegex.exec(match[1])) !== null) {
    options.push({
      value: optMatch[1],
      label: optMatch[2].trim(),
    });
  }
  return options;
}

// -----------------------------------------------------------------------------
// Mock de Electron y carga aislada de módulos de Notch
// -----------------------------------------------------------------------------

let electronMockInstalled = false;

function installElectronMock() {
  if (electronMockInstalled) return;

  const mockElectron = {
    app: {
      getPath: (name) => path.join(PROJECT_ROOT, '.tmp_test_userdata', name || ''),
      isPackaged: false,
    },
    BrowserWindow: class MockBrowserWindow {
      constructor(options) {
        this.options = options;
      }
      loadURL() {}
      loadFile() {}
      show() {}
      hide() {}
      close() {}
    },
    screen: {
      getPrimaryDisplay: () => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      }),
    },
    Menu: {
      buildFromTemplate: () => ({ popup: () => {} }),
    },
    clipboard: {
      _content: '',
      writeText(text) { this._content = String(text); },
      readText() { return this._content; },
    },
    ipcMain: {
      _handlers: new Map(),
      _listeners: new Map(),
      handle(channel, handler) { this._handlers.set(channel, handler); },
      on(channel, listener) {
        if (!this._listeners.has(channel)) this._listeners.set(channel, []);
        this._listeners.get(channel).push(listener);
      },
    },
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return mockElectron;
    }
    return origLoad.apply(this, arguments);
  };

  electronMockInstalled = true;
}

/**
 * Carga `main/ai-chat.js` limpiando la caché de require para garantizar aislamiento.
 */
function loadFreshAiChat() {
  installElectronMock();
  const aiChatPath = path.join(PROJECT_ROOT, 'main', 'ai-chat.js');
  const aiParsePath = path.join(PROJECT_ROOT, 'main', 'ai-chat-parse.js');
  const statePath = path.join(PROJECT_ROOT, 'main', 'state.js');
  const bridgePath = path.join(PROJECT_ROOT, 'main', 'bridge.js');
  const configPath = path.join(PROJECT_ROOT, 'main', 'config.js');

  delete require.cache[require.resolve(aiChatPath)];
  delete require.cache[require.resolve(aiParsePath)];
  delete require.cache[require.resolve(statePath)];
  delete require.cache[require.resolve(bridgePath)];
  delete require.cache[require.resolve(configPath)];

  const aiChat = require(aiChatPath);
  const stateModule = require(statePath);

  return { aiChat, state: stateModule.state };
}

/**
 * Carga o extrae las constantes de `main/window.js`.
 */
function getWindowGeometry() {
  const content = readProjectFile('main/window.js');
  const getConst = (name) => {
    const match = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`).exec(content);
    if (!match) return null;
    try {
      // Evalúa de forma segura expresiones como 'PANEL_WIDTH + SHADOW_MARGIN * 2'
      return eval(match[1]); // eval de expresión matemática simple
    } catch {
      return parseInt(match[1], 10) || match[1].trim();
    }
  };

  // Extraer valores literales
  const panelWidthMatch = content.match(/const\s+PANEL_WIDTH\s*=\s*(\d+)/);
  const panelHeightMatch = content.match(/const\s+PANEL_HEIGHT\s*=\s*(\d+)/);
  const topGapMatch = content.match(/const\s+TOP_GAP\s*=\s*(\d+)/);
  const shadowMarginMatch = content.match(/const\s+SHADOW_MARGIN\s*=\s*(\d+)/);

  const panelWidth = panelWidthMatch ? parseInt(panelWidthMatch[1], 10) : 720;
  const panelHeight = panelHeightMatch ? parseInt(panelHeightMatch[1], 10) : 260;
  const topGap = topGapMatch ? parseInt(topGapMatch[1], 10) : 8;
  const shadowMargin = shadowMarginMatch ? parseInt(shadowMarginMatch[1], 10) : 50;

  const windowWidth = panelWidth + shadowMargin * 2;
  const windowHeight = topGap + panelHeight + shadowMargin;

  return {
    PANEL_WIDTH: panelWidth,
    PANEL_HEIGHT: panelHeight,
    TOP_GAP: topGap,
    SHADOW_MARGIN: shadowMargin,
    WINDOW_WIDTH: windowWidth,
    WINDOW_HEIGHT: windowHeight,
  };
}

// -----------------------------------------------------------------------------
// Verificación sintáctica y de Git
// -----------------------------------------------------------------------------

/** Ejecuta node --check para verificar sintaxis JS. */
function checkSyntax(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  const result = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
  return {
    valid: result.status === 0,
    error: result.stderr || result.stdout,
  };
}

/**
 * Verifica si los archivos restringidos (config/settings.json, config/links.json)
 * están en el área de preparación (staged) de git.
 */
function checkGitStaging() {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    const stagedFiles = [];
    output.split(/\r?\n/).forEach((line) => {
      if (!line) return;
      const indexStatus = line[0];
      const filePath = line.slice(3).trim();
      if (indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== 'U') {
        stagedFiles.push(filePath);
      }
    });

    const forbiddenStaged = stagedFiles.filter(
      (f) => f.includes('config/settings.json') || f.includes('config/links.json')
    );

    return {
      clean: forbiddenStaged.length === 0,
      forbiddenStaged,
      stagedFiles,
    };
  } catch (error) {
    return { clean: false, error: error.message };
  }
}

/**
 * Verifica package.json para confirmar que no se han añadido dependencias
 * no autorizadas.
 */
function checkPackageDependencies() {
  const pkgContent = readProjectFile('package.json');
  const pkg = JSON.parse(pkgContent);
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  // En la rama original: dependencies tiene solo simple-icons
  const extraDeps = deps.filter((d) => d !== 'simple-icons');

  return {
    ok: extraDeps.length === 0,
    dependencies: deps,
    devDependencies: devDeps,
    extraDependencies: extraDeps,
  };
}

module.exports = {
  PROJECT_ROOT,
  readProjectFile,
  fileExists,
  extractCssVariables,
  findCssRules,
  ruleHasProperty,
  extractElementById,
  extractElementsByClass,
  extractSelectOptions,
  installElectronMock,
  loadFreshAiChat,
  getWindowGeometry,
  checkSyntax,
  checkGitStaging,
  checkPackageDependencies,
};
