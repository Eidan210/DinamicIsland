'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
}

describe('Fase 9: La ventana — Validaciones de Arquitectura y Funcionalidad', () => {
  it('1. FullscreenModule.cs implementa SHAppBarMessage, SHQueryUserNotificationState y SetWinEventHook', () => {
    const cs = read('helpers/WinHelper/FullscreenModule.cs');
    assert.ok(cs.includes('SHAppBarMessage'), 'Debe usar SHAppBarMessage');
    assert.ok(cs.includes('SHQueryUserNotificationState'), 'Debe consultar SHQueryUserNotificationState');
    assert.ok(cs.includes('SetWinEventHook'), 'Debe enganchar EVENT_SYSTEM_FOREGROUND con SetWinEventHook');
    assert.ok(cs.includes('QUNS_RUNNING_D3D_FULL_SCREEN'), 'Debe contemplar Direct3D fullscreen');
    assert.ok(cs.includes('type = "fullscreen"'), 'Debe emitir JSON con type: fullscreen');
  });

  it('2. Program.cs inicializa FullscreenModule.Start()', () => {
    const prog = read('helpers/WinHelper/Program.cs');
    assert.ok(prog.includes('FullscreenModule.Start();'), 'Program.cs debe iniciar FullscreenModule');
  });

  it('3. main/system-tray.js gestiona el icono de la bandeja y sus opciones requeridas', () => {
    const tray = read('main/system-tray.js');
    assert.ok(tray.includes('new Tray'), 'Debe instanciar Electron Tray');
    assert.ok(tray.includes('Casa de Clawd'), 'Debe tener la opción Casa de Clawd');
    assert.ok(tray.includes('Pausar isla'), 'Debe tener la casilla Pausar isla');
    assert.ok(tray.includes('Iniciar con Windows'), 'Debe tener la casilla Iniciar con Windows');
    assert.ok(tray.includes('Salir'), 'Debe tener la opción Salir');
  });

  it('4. main/login-item.js maneja app.setLoginItemSettings de forma segura', () => {
    const login = read('main/login-item.js');
    assert.ok(login.includes('setLoginItemSettings'), 'Debe llamar a setLoginItemSettings');
    assert.ok(login.includes('isStartWithWindowsEnabled'), 'Debe exportar isStartWithWindowsEnabled');
    assert.ok(login.includes('setStartWithWindows'), 'Debe exportar setStartWithWindows');
  });

  it('5. main/config.js valida los ajustes de la Fase 9 (monitor, topGap, scale, autoHideIdle, hoverToOpen)', () => {
    const config = require('../main/config');
    const settings = config.loadSettings();
    assert.strictEqual(typeof settings.topGap, 'number', 'topGap debe ser numérico');
    assert.ok(settings.topGap >= 0 && settings.topGap <= 12, 'topGap debe estar entre 0 y 12');
    assert.strictEqual(typeof settings.scale, 'number', 'scale debe ser numérico');
    assert.ok(settings.scale >= 80 && settings.scale <= 130, 'scale debe estar entre 80 y 130');
    assert.strictEqual(typeof settings.autoHideIdle, 'boolean', 'autoHideIdle debe ser booleano');
    assert.strictEqual(typeof settings.hoverToOpen, 'boolean', 'hoverToOpen debe ser booleano');
  });

  it('6. main/window.js exporta setFullscreenHidden y aplica zoomFactor dinámico', () => {
    const winModule = require('../main/window');
    assert.strictEqual(typeof winModule.setFullscreenHidden, 'function', 'Debe exportar setFullscreenHidden');
    assert.strictEqual(typeof winModule.isFullscreenActive, 'function', 'Debe exportar isFullscreenActive');
  });

  it('7. renderer/styles.css define la forma "bar" (120x6 px) para auto-ocultación tras inactividad', () => {
    const css = read('renderer/styles.css');
    assert.ok(css.includes('.island[data-shape="bar"]'), 'Debe contener la regla CSS para data-shape="bar"');
    assert.ok(css.includes('width: 120px;'), 'La barra debe medir 120px de ancho');
    assert.ok(css.includes('height: 6px;'), 'La barra debe medir 6px de alto');
  });

  it('8. renderer/modules/island.js incluye "bar" en SHAPE_ORDER y maneja inactividad y hover-to-open', () => {
    const island = read('renderer/modules/island.js');
    assert.ok(island.includes("'bar'"), 'SHAPE_ORDER debe incluir bar');
    assert.ok(island.includes('autoHideIdle'), 'Debe evaluar autoHideIdle');
    assert.ok(island.includes('hoverToOpen'), 'Debe evaluar hoverToOpen');
    assert.ok(island.includes('250'), 'Debe esperar 250ms para abrir en hover');
    assert.ok(island.includes('400'), 'Debe esperar 400ms para cerrar tras salir');
  });

  it('9. renderer/modules/beat.js suspende sus temporizadores en pantalla completa y pausa', () => {
    const beat = read('renderer/modules/beat.js');
    assert.ok(beat.includes('setBeatSuspended'), 'Debe exportar setBeatSuspended');
    assert.ok(beat.includes('onFullscreenChange'), 'Debe escuchar onFullscreenChange');
    assert.ok(beat.includes('onPausedChange'), 'Debe escuchar onPausedChange');
  });

  it('10. package.json tiene la versión minor incrementada a 0.11.0', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.strictEqual(pkg.version, '0.11.0', 'La versión de package.json debe ser 0.11.0');
  });
});

console.log('✓ [PASS] Fase 9: Todos los 10 tests unitarios y de arquitectura pasaron con éxito.');
