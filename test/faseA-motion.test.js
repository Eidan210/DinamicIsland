// =============================================================================
//  test/faseA-motion.test.js
// -----------------------------------------------------------------------------
//  Validaciones de arquitectura y funcionalidad para la Fase A:
//  Sistema de movimiento, tokens de animación, Director de Transiciones
//  y medidor de rendimiento en modo desarrollo.
// =============================================================================

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');

describe('Fase A: Sistema de Movimiento y Base de Transiciones', () => {

  // ---------------------------------------------------------------------------
  // Suite 1: Tokens CSS y Factor de Escala
  // ---------------------------------------------------------------------------
  describe('Suite 1: Tokens de Movimiento en styles.css', () => {
    const cssPath = path.join(ROOT_DIR, 'renderer', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    it('declara --motion-scale con valor inicial 1 en :root', () => {
      assert.match(css, /--motion-scale:\s*1;/, 'Debe existir --motion-scale: 1 en :root');
    });

    it('declara los 6 tokens semánticos de duración multiplicados por --motion-scale', () => {
      assert.match(css, /--d-instant:\s*calc\(80ms\s*\*\s*var\(--motion-scale\)\);/);
      assert.match(css, /--d-fast:\s*calc\(150ms\s*\*\s*var\(--motion-scale\)\);/);
      assert.match(css, /--d-base:\s*calc\(220ms\s*\*\s*var\(--motion-scale\)\);/);
      assert.match(css, /--d-open:\s*calc\(420ms\s*\*\s*var\(--motion-scale\)\);/);
      assert.match(css, /--d-close:\s*calc\(300ms\s*\*\s*var\(--motion-scale\)\);/);
      assert.match(css, /--d-slow:\s*calc\(600ms\s*\*\s*var\(--motion-scale\)\);/);
    });

    it('declara las 5 curvas maestras de aceleración requeridas', () => {
      assert.match(css, /--ease-out:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/);
      assert.match(css, /--ease-in:\s*cubic-bezier\(0\.64,\s*0,\s*0\.78,\s*0\);/);
      assert.match(css, /--ease-drawer:\s*cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\);/);
      assert.match(css, /--ease-spring:\s*linear\(/);
      assert.match(css, /--ease-pop:\s*linear\(/);
    });

    it('apaga las animaciones (--motion-scale: 0) en reduce-motion y animations: off', () => {
      const a11yMatch = css.match(/:root\[data-reduce-motion="true"\],\s*:root\[data-animations="off"\]\s*\{([^}]+)\}/);
      assert.ok(a11yMatch, 'Debe existir la regla combinada para data-reduce-motion y data-animations');
      assert.match(a11yMatch[1], /--motion-scale:\s*0\s*!important/);
    });

    it('no mantiene will-change permanente en la regla base .island', () => {
      const islandBaseMatch = css.match(/\.island\s*\{([^}]+)\}/);
      assert.ok(islandBaseMatch);
      assert.match(islandBaseMatch[1], /will-change:\s*auto;/);
      assert.doesNotMatch(islandBaseMatch[1], /will-change:\s*width,\s*height/);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Director de Transiciones (renderer/modules/island.js)
  // ---------------------------------------------------------------------------
  describe('Suite 2: Director de Transiciones en island.js', () => {
    function createMockElement(id) {
      return {
        id,
        style: {},
        dataset: {},
        classList: { contains: () => false, toggle: () => {}, add: () => {}, remove: () => {} },
        matches: () => false,
        addEventListener: () => {},
        querySelector: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
        querySelectorAll: () => [],
      };
    }

    beforeEach(() => {
      global.window = {
        notch: {
          setMouseInteractive: () => {},
          onFullscreenChange: () => {},
        },
      };
      global.document = {
        getElementById: (id) => createMockElement(id),
        querySelector: () => createMockElement('query'),
        querySelectorAll: () => [],
        documentElement: {
          style: {},
        },
        addEventListener: () => {},
      };
      global.getComputedStyle = () => ({
        getPropertyValue: (prop) => (prop === '--motion-scale' ? '1' : ''),
      });
    });

    afterEach(() => {
      delete require.cache[require.resolve('../renderer/modules/island.js')];
    });

    it('exporta transitionDirector con los métodos esperados', async () => {
      const islandModule = await import('../renderer/modules/island.js');
      assert.ok(islandModule.transitionDirector, 'Debe exportar transitionDirector');
      assert.strictEqual(typeof islandModule.transitionDirector.getGeneration, 'function');
      assert.strictEqual(typeof islandModule.transitionDirector.start, 'function');
      assert.strictEqual(typeof islandModule.transitionDirector.finish, 'function');
      assert.strictEqual(typeof islandModule.transitionDirector.getActiveTransition, 'function');
    });

    it('incrementa el número de generación con cada transición iniciada', async () => {
      const { transitionDirector } = await import('../renderer/modules/island.js');
      const gen1 = transitionDirector.start('pill', 'expanded');
      assert.ok(gen1 > 0);
      assert.strictEqual(transitionDirector.getGeneration(), gen1);

      const gen2 = transitionDirector.start('expanded', 'pill');
      assert.strictEqual(gen2, gen1 + 1);
      assert.strictEqual(transitionDirector.getGeneration(), gen2);
      transitionDirector.finish();
    });

    it('maneja interrupciones consecutivas sin colisiones de temporizador', async (t) => {
      t.mock.timers.enable();
      const { transitionDirector } = await import('../renderer/modules/island.js');

      // 1. Iniciar transición pill -> expanded
      const gen1 = transitionDirector.start('pill', 'expanded');
      assert.strictEqual(transitionDirector.getActiveTransition().toShape, 'expanded');

      // 2. Interrumpir a los 100ms hacia pill
      t.mock.timers.tick(100);
      const gen2 = transitionDirector.start('expanded', 'pill');
      assert.strictEqual(transitionDirector.getActiveTransition().toShape, 'pill');
      assert.strictEqual(transitionDirector.getActiveTransition().gen, gen2);

      // 3. Dejar que expire el tiempo de seguridad de la primera transición
      t.mock.timers.tick(700);
      assert.strictEqual(transitionDirector.getGeneration(), gen2);

      // 4. Concluir la transición activa
      transitionDirector.finish(gen2);
      assert.strictEqual(transitionDirector.getActiveTransition(), null);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Medidor de Rendimiento Dev en main/window.js
  // ---------------------------------------------------------------------------
  describe('Suite 3: Medidor de Rendimiento Dev en main/window.js', () => {
    it('exporta startDevMetricsLogger y stopDevMetricsLogger', () => {
      const windowModule = require('../main/window.js');
      assert.strictEqual(typeof windowModule.startDevMetricsLogger, 'function');
      assert.strictEqual(typeof windowModule.stopDevMetricsLogger, 'function');
    });

    it('no genera errores al invocar startDevMetricsLogger y stopDevMetricsLogger', () => {
      const windowModule = require('../main/window.js');
      assert.doesNotThrow(() => {
        windowModule.startDevMetricsLogger();
        windowModule.stopDevMetricsLogger();
      });
    });
  });
});
