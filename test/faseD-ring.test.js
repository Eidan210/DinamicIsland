// =============================================================================
//  test/faseD-ring.test.js — Pruebas para Fase D (Animación de batería y diseño limpio)
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
const pomodoroJs = fs.readFileSync(path.join(ROOT, 'renderer/modules/pomodoro.js'), 'utf8');

describe('Fase D: Animación de batería y cápsula limpia (sin anillo invasivo)', () => {

  describe('D1: Eliminación del anillo invasivo', () => {
    it('index.html NO contiene el SVG #status-ring (cápsula limpia)', () => {
      assert.strictEqual(indexHtml.includes('id="status-ring"'), false, 'No debe existir el SVG #status-ring');
      assert.strictEqual(indexHtml.includes('class="status-ring-track"'), false, 'No debe existir status-ring-track');
    });

    it('styles.css NO contiene reglas de .status-ring invasivas', () => {
      assert.strictEqual(stylesCss.includes('.status-ring {'), false, 'No debe haber reglas de .status-ring');
      assert.strictEqual(stylesCss.includes('status-ring-flash'), false, 'No debe haber animación de flash en el anillo');
    });
  });

  describe('D2: Animación de batería limpia estilo Apple Dynamic Island', () => {
    it('index.html contiene el aviso de carga .charging-alert', () => {
      assert.ok(indexHtml.includes('id="charging-alert"'), 'Debe existir #charging-alert');
      assert.ok(indexHtml.includes('charging-bolt-svg'), 'Debe existir el rayo verde');
      assert.ok(indexHtml.includes('charging-battery-svg'), 'Debe existir la pila con su nivel');
    });

    it('styles.css contiene las animaciones y geometría de charging', () => {
      assert.ok(stylesCss.includes('.island[data-shape="charging"]'), 'Debe tener estilos para data-shape="charging"');
      assert.ok(stylesCss.includes('charging-slide-l'), 'Debe animar la entrada del rayo');
      assert.ok(stylesCss.includes('charging-slide-r'), 'Debe animar la entrada de la batería');
    });
  });

  describe('D3: Temporizador limpio y micro-respuestas', () => {
    it('.roll-up y .roll-down conservan tabular-nums y aceleración ágil', () => {
      assert.ok(stylesCss.includes('font-variant-numeric: tabular-nums;'), 'Debe tener tabular-nums');
      assert.ok(stylesCss.includes('animation: roll-up calc(var(--d-fast) * var(--motion-scale))'), 'Usa --d-fast');
    });

    it('pomodoro.js dispara aviso C1 al concluir el bloque', () => {
      assert.ok(pomodoroJs.includes("kind: 'pomodoro'"), 'Debe crear aviso con kind pomodoro');
      assert.ok(pomodoroJs.includes('¡Bloque terminado!'), 'Debe notificar fin de bloque');
    });
  });
});
