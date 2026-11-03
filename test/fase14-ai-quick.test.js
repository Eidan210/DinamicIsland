// =============================================================================
//  test/fase14-ai-quick.test.js — Pruebas de la Fase 14: IA Rápida
// =============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('Fase 14 — IA Rápida (estilo Sentient OS)', async (t) => {
  await t.test('Ajustes de configuración (main/config.js)', () => {
    const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

    assert.equal(DEFAULT_SETTINGS.aiShortcut, 'Control+Alt+I');
    assert.equal(DEFAULT_SETTINGS.aiActiveAppChip, false);
    assert.equal(DEFAULT_SETTINGS.aiQuickReplyRightCtrl, false);

    const validated = validateSettings({
      aiShortcut: 'Control+Alt+I',
      aiActiveAppChip: true,
      aiQuickReplyRightCtrl: true,
    });
    assert.equal(validated.aiShortcut, 'Control+Alt+I');
    assert.equal(validated.aiActiveAppChip, true);
    assert.equal(validated.aiQuickReplyRightCtrl, true);

    const fallback = validateSettings({
      aiShortcut: '',
      aiActiveAppChip: 'yes',
      aiQuickReplyRightCtrl: 1,
    });
    assert.equal(fallback.aiShortcut, 'Control+Alt+I');
    assert.equal(fallback.aiActiveAppChip, false);
    assert.equal(fallback.aiQuickReplyRightCtrl, false);
  });

  await t.test('Módulo C# ActiveAppModule.cs y WinHelper', () => {
    const activeAppCode = fs.readFileSync(path.join(ROOT, 'helpers/WinHelper/ActiveAppModule.cs'), 'utf8');
    assert.ok(activeAppCode.includes('SendKeyCombination'), 'ActiveAppModule debe definir SendKeyCombination');
    assert.ok(activeAppCode.includes('PasteToLastApp'), 'ActiveAppModule debe definir PasteToLastApp');
    assert.ok(activeAppCode.includes('OnForegroundChanged'), 'ActiveAppModule debe escuchar OnForegroundChanged');
    assert.ok(activeAppCode.includes('VkControl') && activeAppCode.includes('VkKeyV'), 'Debe enviar Ctrl+V');

    const programCode = fs.readFileSync(path.join(ROOT, 'helpers/WinHelper/Program.cs'), 'utf8');
    assert.ok(programCode.includes('ActiveAppModule.Start()'), 'Program.cs debe inicializar ActiveAppModule');
    assert.ok(programCode.includes('ActiveAppModule.TryRunCommand'), 'Program.cs debe procesar órdenes de ActiveAppModule');

    const fullscreenCode = fs.readFileSync(path.join(ROOT, 'helpers/WinHelper/FullscreenModule.cs'), 'utf8');
    assert.ok(fullscreenCode.includes('ActiveAppModule.OnForegroundChanged'), 'FullscreenModule debe notificar a ActiveAppModule');
  });

  await t.test('Módulo de backend main/ai-quick.js y atajos globales', () => {
    const aiQuick = require('../main/ai-quick');
    assert.equal(typeof aiQuick.initAiQuick, 'function');
    assert.equal(typeof aiQuick.openAiQuick, 'function');
    assert.equal(typeof aiQuick.closeAiQuick, 'function');
    assert.equal(typeof aiQuick.toggleAiQuick, 'function');
    assert.equal(typeof aiQuick.handleRightCtrlDoubleTap, 'function');
    assert.equal(typeof aiQuick.pasteToApp, 'function');
    assert.equal(typeof aiQuick.captureScreen, 'function');

    const shortcutsCode = fs.readFileSync(path.join(ROOT, 'main/shortcuts.js'), 'utf8');
    assert.ok(shortcutsCode.includes('state.settings.aiShortcut'), 'shortcuts.js debe registrar el atajo aiShortcut');

    const keyboardCode = fs.readFileSync(path.join(ROOT, 'main/keyboard.js'), 'utf8');
    assert.ok(keyboardCode.includes('aiQuickReplyRightCtrl'), 'keyboard.js debe contemplar aiQuickReplyRightCtrl');
  });

  await t.test('Preload e IPC de IA Rápida', () => {
    const ipcCode = fs.readFileSync(path.join(ROOT, 'main/ipc.js'), 'utf8');
    assert.ok(ipcCode.includes("'ai:quick-open'"), 'ipc.js debe registrar ai:quick-open');
    assert.ok(ipcCode.includes("'ai:quick-close'"), 'ipc.js debe registrar ai:quick-close');
    assert.ok(ipcCode.includes("'ai:paste-to-app'"), 'ipc.js debe registrar ai:paste-to-app');
    assert.ok(ipcCode.includes("'ai:capture-screen'"), 'ipc.js debe registrar ai:capture-screen');

    const preloadCode = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
    assert.ok(preloadCode.includes('aiQuick:'), 'preload.js debe exponer aiQuick');
    assert.ok(preloadCode.includes("'ai:quick-open'"));
    assert.ok(preloadCode.includes("'ai:paste-to-app'"));
  });

  await t.test('Estructura HTML y CSS de la caja de comandos', () => {
    const htmlCode = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
    assert.ok(htmlCode.includes('id="ai-input-view"'), 'index.html debe contener #ai-input-view');
    assert.ok(htmlCode.includes('id="ai-quick-input"'), 'index.html debe contener #ai-quick-input');
    assert.ok(htmlCode.includes('id="ai-btn-copy"'), 'index.html debe contener botón copiar');
    assert.ok(htmlCode.includes('id="ai-btn-paste"'), 'index.html debe contener botón pegar en la app');
    assert.ok(htmlCode.includes('id="ai-input-app-chip"'), 'index.html debe contener el chip de app activa');

    const cssCode = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
    assert.ok(cssCode.includes('.island[data-shape="ai-input"]'), 'styles.css debe definir forma ai-input');
    assert.ok(cssCode.includes('560px'), 'styles.css debe definir anchura de 560px');
    assert.ok(cssCode.includes('data-ai-expanded="true"'), 'styles.css debe manejar expansión de respuesta');
  });

  await t.test('Módulos de Renderer y forma island.js', () => {
    const islandCode = fs.readFileSync(path.join(ROOT, 'renderer/modules/island.js'), 'utf8');
    assert.ok(islandCode.includes("'ai-input'"), 'island.js debe incluir ai-input en SHAPE_ORDER');
    assert.ok(islandCode.includes('state.aiQuickOpen'), 'island.js computeShape debe verificar state.aiQuickOpen');

    const aiQuickModule = fs.readFileSync(path.join(ROOT, 'renderer/modules/ai-quick.js'), 'utf8');
    assert.ok(aiQuickModule.includes('export function initAiQuick'), 'ai-quick.js debe exportar initAiQuick');
  });

  await t.test('Versión del paquete incrementada a 0.16.0', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.version >= '0.16.0', `Versión actual ${pkg.version} debe ser >= 0.16.0`);
  });
});
