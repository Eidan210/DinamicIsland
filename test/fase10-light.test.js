// =============================================================================
//  test/fase10-light.test.js — Pruebas de Fase 10: Motor de luz («Light Engine»)
// =============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

describe('Fase 10 — Motor de luz («Light Engine»)', () => {
  describe('Ajustes de configuración (main/config.js)', () => {
    it('DEFAULT_SETTINGS incluye las opciones de luz por defecto', () => {
      assert.strictEqual(DEFAULT_SETTINGS.light, true);
      assert.strictEqual(DEFAULT_SETTINGS.lightIntensity, 100);
      assert.strictEqual(DEFAULT_SETTINGS.lightSpill, true);
    });

    it('validateSettings valida y ajusta light, lightIntensity y lightSpill', () => {
      const valid = validateSettings({
        light: false,
        lightIntensity: 75,
        lightSpill: false,
      });
      assert.strictEqual(valid.light, false);
      assert.strictEqual(valid.lightIntensity, 75);
      assert.strictEqual(valid.lightSpill, false);

      // Valores dentro de rango permitido (40 a 200)
      const validHigh = validateSettings({ lightIntensity: 150 });
      assert.strictEqual(validHigh.lightIntensity, 150);

      // Valores fuera de rango (menor a 40 o mayor a 200) restauran por defecto
      const clampedLow = validateSettings({ lightIntensity: 20 });
      assert.strictEqual(clampedLow.lightIntensity, 100);

      const clampedHigh = validateSettings({ lightIntensity: 250 });
      assert.strictEqual(clampedHigh.lightIntensity, 100);

      // Valores inválidos recuperan por defecto
      const fallback = validateSettings({
        light: 'not-bool',
        lightIntensity: 'high',
        lightSpill: 42,
      });
      assert.strictEqual(fallback.light, true);
      assert.strictEqual(fallback.lightIntensity, 100);
      assert.strictEqual(fallback.lightSpill, true);
    });
  });

  describe('Elementos en DOM y Estilos CSS', () => {
    it('index.html contiene #island-light y #island-spill', () => {
      const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
      assert.ok(html.includes('id="island-spill"'), 'Debe existir #island-spill en #stage');
      assert.ok(html.includes('id="island-light"'), 'Debe existir #island-light en #island');
      assert.ok(html.includes('class="light-edge"'), 'Debe existir .light-edge');
      assert.ok(html.includes('class="light-sweep"'), 'Debe existir .light-sweep');
      assert.ok(html.includes('class="light-fill"'), 'Debe existir .light-fill');
    });

    it('styles.css contiene las animaciones y estilos de luz', () => {
      const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
      assert.ok(css.includes('.island-light'), 'Debe incluir estilos para .island-light');
      assert.ok(css.includes('.island-spill'), 'Debe incluir estilos para .island-spill');
      assert.ok(css.includes('@keyframes light-breathe'), 'Debe definir @keyframes light-breathe');
      assert.ok(css.includes('@keyframes light-sweep-ltr'), 'Debe definir @keyframes light-sweep-ltr');
      assert.ok(css.includes('@keyframes light-sweep-rtl'), 'Debe definir @keyframes light-sweep-rtl');
    });
  });

  describe('Lógica del módulo Light (renderer/modules/light.js)', () => {
    it('exporta el catálogo completo de 16 eventos con sus prioridades y efectos', async () => {
      const lightModule = await import('../renderer/modules/light.js');
      const { LIGHT_EVENTS } = lightModule;
      assert.ok(LIGHT_EVENTS, 'LIGHT_EVENTS debe existir');

      const expectedEvents = [
        'permission',
        'autoApproved',
        'claudeDone',
        'aiWorking',
        'chargerConnected',
        'chargerDisconnected',
        'batteryLow',
        'shiftCaps',
        'copy',
        'cut',
        'paste',
        'volume',
        'focusDone',
        'waterReminder',
        'urgentTask',
        'music',
      ];

      for (const ev of expectedEvents) {
        assert.ok(LIGHT_EVENTS[ev], `El evento ${ev} debe estar definido en LIGHT_EVENTS`);
        assert.ok(LIGHT_EVENTS[ev].effect, `El evento ${ev} debe tener effect`);
        assert.ok(LIGHT_EVENTS[ev].priority, `El evento ${ev} debe tener priority`);
        assert.ok(LIGHT_EVENTS[ev].color, `El evento ${ev} debe tener color`);
      }

      assert.strictEqual(LIGHT_EVENTS.permission.priority, 'critical');
      assert.strictEqual(LIGHT_EVENTS.permission.effect, 'breathe');
      assert.strictEqual(LIGHT_EVENTS.claudeDone.priority, 'high');
      assert.strictEqual(LIGHT_EVENTS.claudeDone.effect, 'sweep');
      assert.strictEqual(LIGHT_EVENTS.music.priority, 'ambient');
      assert.strictEqual(LIGHT_EVENTS.copy.direction, 'ltr');
      assert.strictEqual(LIGHT_EVENTS.paste.direction, 'rtl');
    });

    it('implementa prioridad y preclusión (preemption) de luz', async () => {
      // Mock de DOM y state
      const mockStyleLight = new Map();
      const mockStyleSpill = new Map();
      const mockChild = {
        style: { setProperty: () => {} },
      };
      const mockLightEl = {
        style: {
          setProperty: (k, v) => mockStyleLight.set(k, v),
        },
        dataset: {},
        querySelector: () => mockChild,
      };
      const mockSpillEl = {
        style: {
          setProperty: (k, v) => mockStyleSpill.set(k, v),
        },
        dataset: {},
      };

      global.document = {
        getElementById: (id) => (id === 'island-light' ? mockLightEl : id === 'island-spill' ? mockSpillEl : null),
      };

      const lightModule = await import('../renderer/modules/light.js');
      const { initLight, playLight, stopLight, getCurrentLight } = lightModule;
      const { state } = await import('../renderer/modules/state.js');

      state.settings = { light: true, lightIntensity: 100, lightSpill: true };
      initLight();

      // 1. Iniciar luz ambiente (música)
      const musicId = playLight('border', {
        name: 'music',
        priority: 'ambient',
        color: '#3dff8f',
        durationMs: Infinity,
      });
      assert.ok(musicId, 'La música debe activarse');
      assert.strictEqual(getCurrentLight().name, 'music');
      assert.strictEqual(mockLightEl.dataset.active, 'true');

      // 2. Evento crítico (permiso) debe desplazar la luz ambiente
      const permId = playLight('breathe', {
        name: 'permission',
        priority: 'critical',
        color: '#F59E0B',
        durationMs: Infinity,
      });
      assert.ok(permId, 'El permiso debe activarse y desplazar la música');
      assert.strictEqual(getCurrentLight().name, 'permission');
      assert.strictEqual(mockLightEl.dataset.effect, 'breathe');

      // 3. Evento de menor prioridad (ej. copy, medium) debe ser ignorado mientras permiso está activo
      const copyId = playLight('sweep', {
        name: 'copy',
        priority: 'medium',
        color: '#3B82F6',
        durationMs: 700,
      });
      assert.strictEqual(copyId, null, 'Evento de menor prioridad debe ser ignorado');
      assert.strictEqual(getCurrentLight().name, 'permission');

      // 4. Al detener el permiso, la música ambiental guardada se restaura automáticamente
      stopLight(permId);
      assert.strictEqual(getCurrentLight().name, 'music', 'La música debe restaurarse tras terminar el permiso');
      assert.strictEqual(mockLightEl.dataset.effect, 'border');

      // 5. Al detener la música, queda inactivo
      stopLight();
      assert.strictEqual(getCurrentLight(), null);
      assert.strictEqual(mockLightEl.dataset.active, 'false');
    });
  });
});
