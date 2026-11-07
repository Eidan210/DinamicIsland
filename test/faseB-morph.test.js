// =============================================================================
//  test/faseB-morph.test.js — Pruebas de la Fase B: El morph de la isla
// =============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf8');
const tabsCode = fs.readFileSync(path.join(ROOT, 'renderer', 'modules', 'tabs.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(ROOT, 'renderer', 'modules', 'utils.js'), 'utf8');

describe('Fase B: El morph de la isla (la animación más importante)', () => {
  // ---------------------------------------------------------------------------
  // B1. Abrir (compacta → expandida) · ~420 ms con rebote
  // ---------------------------------------------------------------------------
  describe('B1: Apertura (compacta → expandida)', () => {
    it('la cara se apaga de inmediato en 0-60 ms con --ease-in y translateY -4px', () => {
      assert.ok(styles.includes('.island[data-shape="expanded"] .face'), 'debe definir .face cuando expanded');
      assert.ok(styles.includes('translate: -50% -4px'), 'debe subir -4px al salir');
      assert.ok(styles.includes('calc(60ms * var(--motion-scale))'), 'debe desvanecerse en 60ms');
    });

    it('el ancho crece primero (250 ms) y el alto después (90-420 ms) con --ease-spring', () => {
      assert.ok(styles.includes('.island[data-motion="grow"][data-shape="expanded"]'));
      assert.ok(styles.includes('width calc(250ms * var(--motion-scale)) var(--ease-spring)'), 'ancho debe crecer primero en 250ms con --ease-spring');
      assert.ok(styles.includes('height calc(330ms * var(--motion-scale)) var(--ease-spring) calc(90ms * var(--motion-scale))'), 'alto debe comenzar a los 90ms y durar 330ms');
    });

    it('el contenido del panel entra escalonado a 40 ms (180ms, 220ms, 260ms) con --ease-out', () => {
      assert.ok(styles.includes('.island[data-shape="expanded"] .topbar'), 'debe definir retraso para .topbar');
      assert.ok(styles.includes('transition-delay: calc(180ms * var(--motion-scale))'), '.topbar debe tener delay de 180ms');
      assert.ok(styles.includes('.island[data-shape="expanded"] .views'), 'debe definir retraso para .views');
      assert.ok(styles.includes('transition-delay: calc(220ms * var(--motion-scale))'), '.views debe tener delay de 220ms (+40ms)');
      assert.ok(styles.includes('.island[data-shape="expanded"] .tabbar'), 'debe definir retraso para .tabbar');
      assert.ok(styles.includes('transition-delay: calc(260ms * var(--motion-scale))'), '.tabbar debe tener delay de 260ms (+40ms)');
      assert.ok(styles.includes('transition-timing-function: var(--ease-out)'), 'el contenido debe entrar con --ease-out');
      assert.ok(styles.includes('transition-duration: var(--d-base)'), 'duración de entrada de 220ms (--d-base)');
    });
  });

  // ---------------------------------------------------------------------------
  // B2. Cerrar (expandida → compacta) · ~300 ms sin rebote
  // ---------------------------------------------------------------------------
  describe('B2: Cierre (expandida → compacta)', () => {
    it('el contenido se va primero (0-120 ms) con --ease-in y translateY -4px', () => {
      assert.ok(styles.includes('.island:not([data-shape="expanded"]) :is(.topbar, .views)'), 'debe definir salida para .topbar y .views');
      assert.ok(styles.includes('translate: 0 -4px'), 'el contenido saliente debe desplazarse -4px');
      assert.ok(styles.includes('calc(120ms * var(--motion-scale)) var(--ease-in)'), 'debe desvanecerse en 120ms con --ease-in');
      assert.ok(styles.includes('.island:not([data-shape="expanded"]) .tabbar'), 'las pestañas deben ser las últimas en salir');
    });

    it('la isla se encoge en un solo movimiento simultáneo con --ease-drawer (80-300 ms)', () => {
      assert.ok(styles.includes('.island[data-motion="shrink"]:not([data-shape="expanded"])'));
      assert.ok(styles.includes('calc(80ms * var(--motion-scale))'), 'debe tener delay de 80ms para esperar al contenido');
      assert.ok(styles.includes('calc(220ms * var(--motion-scale)) var(--ease-drawer)'), 'debe encogerse en 220ms con --ease-drawer');
    });

    it('el contenido de la píldora reaparece al final (240-300 ms)', () => {
      assert.ok(styles.includes('.island[data-motion="shrink"]:is([data-shape="pill"], [data-shape="activity"]) .face'));
      assert.ok(styles.includes('calc(240ms * var(--motion-scale))'), 'la cara debe tener retraso de 240ms al reaparecer');
    });
  });

  // ---------------------------------------------------------------------------
  // B3. Cambio de forma sin desaparecer (pill ↔ activity ↔ banner)
  // ---------------------------------------------------------------------------
  describe('B3: Cambio de forma sin desaparecer', () => {
    it('las formas compactas cambian de tamaño en 320 ms con --ease-spring', () => {
      assert.ok(styles.includes('.island[data-motion="grow"]:is([data-shape="activity"], [data-shape="pill"], [data-shape="volume"])'));
      assert.ok(styles.includes('.island[data-motion="shrink"]:is([data-shape="activity"], [data-shape="pill"], [data-shape="volume"])'));
      assert.ok(styles.includes('calc(320ms * var(--motion-scale))'), 'debe durar 320ms');
    });

    it('el contenido viejo sale hacia arriba (-6 px, 120 ms) con --ease-in', () => {
      assert.ok(styles.includes('.island:not([data-shape="activity"]) .activity'));
      assert.ok(styles.includes('translate: 0 -6px'), 'la actividad saliente debe desplazarse -6px');
      assert.ok(styles.includes('.island:not([data-shape="banner"]) .banner'));
    });

    it('el nuevo contenido entra desde abajo (+6 px -> 0, 220 ms, delay 60 ms) con --ease-out', () => {
      assert.ok(styles.includes('.island[data-shape="activity"] .activity'));
      assert.ok(styles.includes('calc(220ms * var(--motion-scale)) var(--ease-out) calc(60ms * var(--motion-scale))'), 'actividad entrante debe tener 220ms y delay de 60ms');
      assert.ok(styles.includes('.island[data-shape="banner"] .banner'));
      assert.ok(styles.includes('animation: banner-enter-up calc(220ms * var(--motion-scale)) var(--ease-out) calc(60ms * var(--motion-scale)) backwards'));
    });
  });

  // ---------------------------------------------------------------------------
  // B4. Cambiar de página en el panel · 220 ms
  // ---------------------------------------------------------------------------
  describe('B4: Cambiar de página en el panel', () => {
    it('tabs.js cruza las páginas: sale en 140ms (--ease-in) y entra en 260ms (--ease-out, tras la salida, fill backwards)', () => {
      assert.ok(!tabsCode.includes('translateX'), 'ya no hay deslizamiento lateral brusco');
      assert.ok(tabsCode.includes("fill: 'backwards'"), 'la página nueva no debe pintarse durante el retraso (evita el parpadeo)');
      assert.ok(tabsCode.includes('exitDuration'), 'debe calcular exitDuration con motionScale');
      assert.ok(tabsCode.includes('enterDuration'), 'debe calcular enterDuration con motionScale');
      assert.ok(tabsCode.includes('enterDelay'), 'debe calcular enterDelay con motionScale');
      assert.ok(tabsCode.includes("cssEasing('--ease-out')"), 'entrada debe usar --ease-out');
      assert.ok(tabsCode.includes("cssEasing('--ease-in')"), 'salida debe usar --ease-in');
    });

    it('el fondo deslizante de la pestaña activa (.tab-indicator) se mueve en 220 ms con --ease-drawer', () => {
      assert.ok(styles.includes('.tab-indicator'));
      assert.ok(styles.includes('translate calc(220ms * var(--motion-scale)) var(--ease-drawer)'), 'indicador debe deslizarse en 220ms con --ease-drawer');
      assert.ok(styles.includes('width calc(220ms * var(--motion-scale)) var(--ease-drawer)'), 'ancho debe ajustarse en 220ms con --ease-drawer');
    });

    it('los badges contadores (.tab-badge) usan la curva viva --ease-pop', () => {
      assert.ok(styles.includes('.tab-badge'));
      assert.ok(styles.includes('animation: pop-in calc(220ms * var(--motion-scale)) var(--ease-pop)'), 'badge debe usar --ease-pop en 220ms');
    });
  });

  // ---------------------------------------------------------------------------
  // B5. Micro-respuestas
  // ---------------------------------------------------------------------------
  describe('B5: Micro-respuestas', () => {
    it('hover sobre botones y tarjetas aclara el fondo en 120 ms con --ease-out, sin agrandar', () => {
      assert.ok(!styles.includes('transform: scale(1.03)'), 'el hover ya no agranda');
      assert.ok(styles.includes('box-shadow calc(120ms * var(--motion-scale)) var(--ease-out)'), 'debe durar 120ms con --ease-out');
    });

    it('clic (:active) en botones y tarjetas escala a 0.97 en 80 ms y regresa con --ease-pop', () => {
      assert.ok(styles.includes('transform: scale(0.97)'), 'active debe escalar a 0.97');
      assert.ok(styles.includes('transform calc(80ms * var(--motion-scale)) ease'), 'active debe tardar 80ms');
      assert.ok(styles.includes('transform calc(150ms * var(--motion-scale)) var(--ease-pop)'), 'regreso debe usar --ease-pop');
    });

    it('hover sobre la isla compacta anticipa con scale 1.02 en 150 ms', () => {
      assert.ok(styles.includes('.island:is('));
      assert.ok(styles.includes('scale: 1.02;'), 'anticipación debe escalar a 1.02');
      assert.ok(styles.includes('transition: scale calc(150ms * var(--motion-scale)) var(--ease-out)'), 'anticipación debe durar 150ms con --ease-out');
    });
  });

  // ---------------------------------------------------------------------------
  // Utilidades de movimiento en utils.js
  // ---------------------------------------------------------------------------
  describe('Utilidades de movimiento en utils.js', () => {
    it('utils.js exporta getMotionScale', () => {
      assert.ok(utilsCode.includes('export function getMotionScale'), 'utils.js debe exportar getMotionScale');
    });
  });
});
