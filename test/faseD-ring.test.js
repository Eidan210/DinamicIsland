// =============================================================================
//  test/faseD-ring.test.js — Pruebas para Fase D (Anillo de estado y temporizador)
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const configJs = fs.readFileSync(path.join(ROOT, 'main/config.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
const statusRingJs = fs.readFileSync(path.join(ROOT, 'renderer/modules/status-ring.js'), 'utf8');
const pomodoroJs = fs.readFileSync(path.join(ROOT, 'renderer/modules/pomodoro.js'), 'utf8');

describe('Fase D: Anillos de estado y temporizador en la píldora', () => {

  describe('D1: Configuración y Validación de Ajustes', () => {
    it('DEFAULT_SETTINGS incluye statusRing y statusRingPriority con el orden por defecto', async () => {
      const { DEFAULT_SETTINGS } = await import('../main/config.js');
      assert.strictEqual(DEFAULT_SETTINGS.statusRing, true, 'statusRing debe ser true por defecto');
      assert.deepStrictEqual(
        DEFAULT_SETTINGS.statusRingPriority,
        ['pomodoro', 'charging', 'water', 'music'],
        'Prioridad por defecto debe ser pomodoro > charging > water > music'
      );
    });

    it('validateSettings valida y respeta statusRing: false', async () => {
      const { validateSettings } = await import('../main/config.js');
      const valid = validateSettings({ statusRing: false });
      assert.strictEqual(valid.statusRing, false);
    });

    it('validateSettings normaliza statusRingPriority filtrando valores desconocidos', async () => {
      const { validateSettings } = await import('../main/config.js');
      const custom = validateSettings({ statusRingPriority: ['water', 'invalid_thing', 'music', 'pomodoro'] });
      assert.deepStrictEqual(custom.statusRingPriority, ['water', 'music', 'pomodoro']);

      // Si todo es inválido, recurre al valor por defecto
      const fallback = validateSettings({ statusRingPriority: ['nonsense'] });
      assert.deepStrictEqual(fallback.statusRingPriority, ['pomodoro', 'charging', 'water', 'music']);
    });
  });

  describe('D1: Estructura SVG del Anillo en index.html', () => {
    it('index.html contiene el SVG #status-ring con track y progress', () => {
      assert.ok(indexHtml.includes('id="status-ring"'), 'Debe existir el SVG #status-ring');
      assert.ok(indexHtml.includes('class="status-ring-track"'), 'Debe existir la pista status-ring-track');
      assert.ok(indexHtml.includes('id="status-ring-progress"'), 'Debe existir el trazo status-ring-progress');
      assert.ok(indexHtml.includes('pathLength="100"'), 'Los rectángulos deben tener pathLength="100"');
    });

    it('index.html contiene el icono de temporizador #activity-timer-icon en la píldora', () => {
      assert.ok(indexHtml.includes('id="activity-timer-icon"'), 'Debe existir #activity-timer-icon');
      assert.ok(indexHtml.includes('href="#i-timer"'), 'El icono debe referenciar #i-timer');
    });
  });

  describe('D1: Estilos CSS y Dinámica del Movimiento en styles.css', () => {
    it('define --island-rx adaptativo para seguir el morph de la isla', () => {
      assert.ok(stylesCss.includes('--island-rx: var(--pill-radius);'), 'Debe definir --island-rx base');
      assert.ok(stylesCss.includes('.island[data-shape="mini"] { --island-rx: 10px; }'), 'Mini debe tener 10px');
      assert.ok(stylesCss.includes('.island[data-shape="expanded"] { --island-rx: var(--panel-radius); }'), 'Expanded debe tener panel-radius');
    });

    it('el anillo tiene trazo de 2 px y rect adaptativo', () => {
      assert.ok(stylesCss.includes('stroke-width: 2px;'), 'Grosor debe ser 2px');
      assert.ok(stylesCss.includes('rx: var(--island-rx, 20px);'), 'rx debe tomar --island-rx');
    });

    it('el anillo se dibuja al aparecer en 600 ms con --ease-out', () => {
      assert.ok(
        stylesCss.includes('calc(600ms * var(--motion-scale)) var(--ease-out)'),
        'La entrada debe durar 600 ms con --ease-out'
      );
    });

    it('cada cambio regular de valor es una transición de 400 ms con --ease-out', () => {
      assert.ok(
        stylesCss.includes('calc(400ms * var(--motion-scale)) var(--ease-out)'),
        'El cambio regular debe durar 400 ms con --ease-out'
      );
    });

    it('el color cambia con transición de 300 ms', () => {
      assert.ok(
        stylesCss.includes('stroke calc(300ms * var(--motion-scale)) ease'),
        'El cambio de color debe durar 300 ms'
      );
    });

    it('define la animación status-ring-flash de 500 ms al llegar al 100%', () => {
      assert.ok(stylesCss.includes('@keyframes status-ring-flash'), 'Debe existir @keyframes status-ring-flash');
      assert.ok(stylesCss.includes('calc(500ms * var(--motion-scale)) ease-out 1'), 'El destello dura 500 ms');
    });

    it('soporta modo lineal continuo en Pomodoro para 0% CPU', () => {
      assert.ok(
        stylesCss.includes('.status-ring-progress[data-mode="linear"]'),
        'Debe existir selector para modo lineal'
      );
      assert.ok(
        stylesCss.includes('stroke-dashoffset var(--ring-linear-duration, 1s) linear'),
        'Debe aplicar transición lineal por el bloque'
      );
      assert.ok(
        stylesCss.includes('.status-ring-progress[data-mode="paused"]'),
        'Pausar debe congelar la transición'
      );
    });
  });

  describe('D2: Temporizador en la Píldora Compacta y Rodillo Numérico', () => {
    it('.roll-up y .roll-down están calibrados a 150 ms (--d-fast) con tabular-nums', () => {
      assert.ok(
        stylesCss.includes('animation: roll-up calc(var(--d-fast) * var(--motion-scale)) var(--ease-out) both;'),
        'El rodillo debe durar 150 ms con --d-fast'
      );
      assert.ok(
        stylesCss.includes('font-variant-numeric: tabular-nums;'),
        'Debe aplicar tabular-nums para evitar oscilaciones de dígitos'
      );
    });

    it('.activity-timer-icon se activa en actividad de pomodoro', () => {
      assert.ok(
        stylesCss.includes('.activity[data-kind="pomodoro"] .activity-timer-icon'),
        'El icono de temporizador se muestra cuando la actividad es pomodoro'
      );
    });

    it('pomodoro.js dispara aviso C1 y destello del anillo al terminar el bloque', () => {
      assert.ok(pomodoroJs.includes('triggerRingFlash()'), 'Debe invocar triggerRingFlash al celebrar');
      assert.ok(pomodoroJs.includes("kind: 'pomodoro'"), 'Debe crear aviso con kind pomodoro');
      assert.ok(pomodoroJs.includes('¡Bloque terminado!'), 'Debe notificar fin de bloque');
    });
  });

  describe('Lógica del Módulo status-ring.js', () => {
    it('status-ring.js exporta las funciones esenciales', () => {
      assert.ok(statusRingJs.includes('export function getActiveRingActivity'), 'Debe exportar getActiveRingActivity');
      assert.ok(statusRingJs.includes('export function getRingProgress'), 'Debe exportar getRingProgress');
      assert.ok(statusRingJs.includes('export function getRingColor'), 'Debe exportar getRingColor');
      assert.ok(statusRingJs.includes('export function triggerRingFlash'), 'Debe exportar triggerRingFlash');
      assert.ok(statusRingJs.includes('export function applyPomodoroLinearProgress'), 'Debe exportar applyPomodoroLinearProgress');
      assert.ok(statusRingJs.includes('export function freezePomodoroLinearProgress'), 'Debe exportar freezePomodoroLinearProgress');
      assert.ok(statusRingJs.includes('export function updateStatusRing'), 'Debe exportar updateStatusRing');
    });

    it('asigna colores según umbrales de batería (<10% rojo, 10-20% ámbar, >20% verde)', () => {
      // Regex o verificación de ramas de código en getRingColor
      assert.ok(statusRingJs.includes('level <= 0.10'), 'Umbral <= 10%');
      assert.ok(statusRingJs.includes('level <= 0.20'), 'Umbral <= 20%');
      assert.ok(statusRingJs.includes('#ff6347'), 'Color naranja tomate para Pomodoro');
      assert.ok(statusRingJs.includes('#38bdf8'), 'Color agua');
    });
  });
});
