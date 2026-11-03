// =============================================================================
//  test/fase11-keyboard.test.js — Pruebas de Fase 11: Teclado y Mejoras Visuales
// =============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

describe('Fase 11 — Teclado y Mejoras Visuales', () => {
  describe('Ajustes de configuración (main/config.js)', () => {
    it('DEFAULT_SETTINGS incluye las opciones de teclado por defecto', () => {
      assert.strictEqual(DEFAULT_SETTINGS.keyboard, true);
      assert.strictEqual(DEFAULT_SETTINGS.keyboardShift, true);
      assert.strictEqual(DEFAULT_SETTINGS.keyboardCaps, true);
      assert.strictEqual(DEFAULT_SETTINGS.keyboardShortcuts, true);
      assert.strictEqual(DEFAULT_SETTINGS.keyboardRightCtrl, true);
    });

    it('validateSettings valida y ajusta opciones booleanas de teclado', () => {
      const valid = validateSettings({
        keyboard: false,
        keyboardShift: false,
        keyboardCaps: false,
        keyboardShortcuts: false,
        keyboardRightCtrl: false,
      });
      assert.strictEqual(valid.keyboard, false);
      assert.strictEqual(valid.keyboardShift, false);
      assert.strictEqual(valid.keyboardCaps, false);
      assert.strictEqual(valid.keyboardShortcuts, false);
      assert.strictEqual(valid.keyboardRightCtrl, false);

      const fallback = validateSettings({
        keyboard: 'yes',
        keyboardShift: 1,
      });
      assert.strictEqual(fallback.keyboard, true);
      assert.strictEqual(fallback.keyboardShift, true);
    });
  });

  describe('Módulo C# KeyboardModule.cs', () => {
    it('existe y define Raw Input con RIDEV_INPUTSINK', () => {
      const cs = fs.readFileSync(path.join(__dirname, '../helpers/WinHelper/KeyboardModule.cs'), 'utf8');
      assert.ok(cs.includes('RegisterRawInputDevices'), 'Debe usar RegisterRawInputDevices');
      assert.ok(cs.includes('RidevInputSink'), 'Debe definir RidevInputSink');
      assert.ok(cs.includes('VkShift'), 'Debe detectar Shift');
      assert.ok(cs.includes('VkCapital'), 'Debe detectar Bloq Mayús');
      assert.ok(cs.includes('VkRControl'), 'Debe detectar Ctrl derecho');
      assert.ok(cs.includes('VkKeyC'), 'Debe detectar Ctrl+C');
      assert.ok(cs.includes('VkKeyV'), 'Debe detectar Ctrl+V');
      assert.ok(cs.includes('VkKeyX'), 'Debe detectar Ctrl+X');
      assert.ok(cs.includes('FullscreenModule.IsFullscreen'), 'Debe pausarse en pantalla completa');
    });
  });

  describe('Aviso de carga estilo Apple Dynamic Island', () => {
    it('index.html contiene #charging-alert con rayo y nivel de batería', () => {
      const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
      assert.ok(html.includes('id="charging-alert"'), 'Debe contener #charging-alert');
      assert.ok(html.includes('id="charging-percent"'), 'Debe contener #charging-percent');
      assert.ok(html.includes('id="charging-battery-level"'), 'Debe contener #charging-battery-level');
      assert.ok(html.includes('charging-bolt-svg'), 'Debe contener icono de rayo de carga');
    });

    it('styles.css contiene la forma .island[data-shape="charging"] y oculta la línea blanca', () => {
      const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
      assert.ok(css.includes('.island[data-shape="charging"]'), 'Debe definir .island[data-shape="charging"]');
      assert.ok(css.includes('.charging-alert'), 'Debe definir .charging-alert');
      assert.ok(css.includes('.light-fill {\r\n  display: none !important;') || css.includes('.light-fill {\n  display: none !important;'), 'Debe ocultar la línea blanca plana');
    });

    it('las animaciones de banner son rápidas y ágiles', () => {
      const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
      assert.ok(css.includes('--size-duration: 380ms;'), 'El banner debe expandirse en 380ms');
      assert.ok(css.includes('animation-delay: 20ms;'), 'El texto debe iniciar sin retrasos prolongados');
    });
  });
});
