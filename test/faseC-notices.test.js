// =============================================================================
//  test/faseC-notices.test.js — Pruebas de la Fase C: Avisos (C1 y C2)
// =============================================================================

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf8');
const noticesCode = fs.readFileSync(path.join(ROOT, 'renderer', 'modules', 'notices.js'), 'utf8');
const islandCode = fs.readFileSync(path.join(ROOT, 'renderer', 'modules', 'island.js'), 'utf8');

describe('Fase C: Avisos (La pastilla temporal y el aviso que baja)', () => {
  // ---------------------------------------------------------------------------
  // Suite 1: Tokens y Estilos CSS (C1 y C2)
  // ---------------------------------------------------------------------------
  describe('Suite 1: Tokens y Estilos CSS de Avisos', () => {
    it('declara las variables de degradado --notice-from y --notice-to', () => {
      assert.ok(styles.includes('--notice-from: #1E2A5E'), 'debe declarar --notice-from con #1E2A5E');
      assert.ok(styles.includes('--notice-to: #5B3FA6'), 'debe declarar --notice-to con #5B3FA6');
    });

    it('C1: forma de alert crece en 320 ms (--ease-spring) y encoge en 260 ms (--ease-drawer)', () => {
      assert.ok(styles.includes('.island[data-motion="grow"][data-shape="alert"]'));
      assert.ok(styles.includes('calc(320ms * var(--motion-scale))'));
      assert.ok(styles.includes('.island[data-motion="shrink"][data-shape="alert"]'));
      assert.ok(styles.includes('calc(260ms * var(--motion-scale))'));
    });

    it('C1: cascada interna: icono hace pop (180ms, --ease-pop), título entra a +50ms y texto a +100ms', () => {
      assert.ok(styles.includes('@keyframes alert-icon-pop'), 'debe definir animación @keyframes alert-icon-pop');
      assert.ok(styles.includes('calc(180ms * var(--motion-scale)) var(--ease-pop)'), 'icono debe durar 180ms con --ease-pop');
      assert.ok(styles.includes('.island[data-shape="alert"] .alert-title'));
      assert.ok(styles.includes('calc(50ms * var(--motion-scale))'), 'título debe entrar con retraso de 50ms');
      assert.ok(styles.includes('.island[data-shape="alert"] .alert-body'));
      assert.ok(styles.includes('calc(100ms * var(--motion-scale))'), 'texto debe entrar con retraso de 100ms');
    });

    it('C1: el texto sale hacia arriba (-6px en 120ms con --ease-in)', () => {
      assert.ok(styles.includes('.island:not([data-shape="alert"]) :is(.alert-title, .alert-body)'));
      assert.ok(styles.includes('translate: 0 -6px'));
      assert.ok(styles.includes('calc(120ms * var(--motion-scale)) var(--ease-in)'));
    });

    it('C2: aviso que baja del notch usa animación notice-notch-drop (460 ms, --ease-spring) y degradado', () => {
      assert.ok(styles.includes('.island[data-shape="alert"][data-alert-variant="notch-drop"]'));
      assert.ok(styles.includes('linear-gradient(135deg, var(--notice-from), var(--notice-to))'), 'debe usar degradado azul-violeta');
      assert.ok(styles.includes('@keyframes notice-notch-drop'), 'debe definir animación de bajada notice-notch-drop');
      assert.ok(styles.includes('translate: 0 -100%'), 'bajada debe iniciar en -100%');
      assert.ok(styles.includes('calc(460ms * var(--motion-scale)) var(--ease-spring)'));
    });

    it('C2: salida replegándose al notch con notice-notch-rise (280 ms, --ease-in)', () => {
      assert.ok(styles.includes('@keyframes notice-notch-rise'), 'debe definir animación notice-notch-rise');
      assert.ok(styles.includes('calc(280ms * var(--motion-scale)) var(--ease-in)'));
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Permanencia y Congelación de Tiempo (Hover Freeze) en island.js
  // ---------------------------------------------------------------------------
  describe('Suite 2: Permanencia y Hover Freeze en island.js', () => {
    it('island.js exporta showAlert con opciones de variante y funciones de estado', () => {
      assert.ok(islandCode.includes('export function showAlert'), 'debe exportar showAlert');
      assert.ok(islandCode.includes('export function isAlertFrozen'), 'debe exportar isAlertFrozen');
      assert.ok(islandCode.includes('export function getAlertVariant'), 'debe exportar getAlertVariant');
    });

    it('island.js congela el temporizador (hover freeze) cuando el cursor entra sobre el aviso', () => {
      assert.ok(islandCode.includes('alertFrozen = true'), 'debe marcar alertFrozen en true');
      assert.ok(islandCode.includes('alertRemaining = Math.max(0, alertUntil - Date.now())'), 'debe calcular alertRemaining');
      assert.ok(islandCode.includes('alertUntil = Infinity'), 'debe suspender el vencimiento durante hover');
    });

    it('island.js reanuda el tiempo restante cuando el cursor sale del aviso', () => {
      assert.ok(islandCode.includes('alertFrozen = false'), 'debe restablecer alertFrozen');
      assert.ok(islandCode.includes('alertUntil = Date.now() + Math.max(800, alertRemaining)'), 'debe reanudar tiempo restante');
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Clasificación y Centro de Avisos en notices.js
  // ---------------------------------------------------------------------------
  describe('Suite 3: Clasificación y Centro de Avisos en notices.js', () => {
    it('notices.js exporta getAlertVariant y clasifica C2 para agua, pomodoro y tareas', () => {
      assert.ok(noticesCode.includes('export function getAlertVariant'), 'debe exportar getAlertVariant');
      assert.ok(noticesCode.includes("notice.kind === 'water'"), 'agua debe usar notch-drop');
      assert.ok(noticesCode.includes("notice.kind === 'pomodoro'"), 'pomodoro debe usar notch-drop');
      assert.ok(noticesCode.includes("notice.kind === 'task'"), 'task debe usar notch-drop');
    });

    it('getAlertDuration asigna 5000 ms para notch-drop (C2) y 2500 ms para pill (C1)', () => {
      assert.ok(noticesCode.includes('variant === \'notch-drop\' ? 5000 : 2500'));
    });

    it('notices.js maneja sustitución fluida sin cerrar la forma si ya hay un aviso en pantalla', () => {
      assert.ok(noticesCode.includes('animateAlertSwap'), 'debe sustituir con animación B3');
      assert.ok(noticesCode.includes("state.shape === 'alert'"), 'debe verificar aviso activo');
    });

    it('notices.js exporta timeAgo en formato relativo limpio («ahora», «12 min», «1 h»)', () => {
      assert.ok(noticesCode.includes('export function timeAgo'), 'debe exportar timeAgo');
      assert.ok(noticesCode.includes("'ahora'"), 'debe devolver ahora para menos de 1 minuto');
      assert.ok(noticesCode.includes("`${minutes} min`"), 'debe formatear minutos');
      assert.ok(noticesCode.includes("`${hours} h`"), 'debe formatear horas');
    });

    it('notices.js exporta scheduleMinuteUpdate sincronizado al cambio de minuto exacto', () => {
      assert.ok(noticesCode.includes('export function scheduleMinuteUpdate'), 'debe exportar scheduleMinuteUpdate');
      assert.ok(noticesCode.includes('(60 - now.getSeconds()) * 1000 - now.getMilliseconds()'), 'debe sincronizar al :00 de cada minuto');
    });
  });
});
