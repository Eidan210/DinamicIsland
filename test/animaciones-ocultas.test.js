// Animaciones infinitas que corrían aunque su elemento no se viera (opacity:0 / visibility:hidden no las detienen).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');

describe('animaciones infinitas solo cuando se ven', () => {
  it('pulse-bolt solo corre con la isla en forma de carga', () => {
    const uses = [...css.matchAll(/([^{}]+)\{[^{}]*animation:\s*pulse-bolt/g)].map((m) => m[1].trim().split('\n').pop());
    assert.deepEqual(uses, ['.island[data-shape="charging"] .charging-bolt-wrap']);
  });

  it('el estado de la IA rápida respeta el atributo hidden', () => {
    assert.match(css, /\.ai-input-status\[hidden\]\s*\{\s*display:\s*none;/);
  });

  it('la voz y la IA rápida respetan el atributo hidden', () => {
    // voice.js y ai-quick.js los ocultan con .hidden; un display:flex de la clase lo anulaba.
    const rule = /:is\(([^)]*)\)\[hidden\]\s*\{\s*display:\s*none;/.exec(css);
    assert.ok(rule, 'falta la regla :is(...)[hidden]');
    for (const cls of ['.voice-waveform', '.voice-result-wrap', '.voice-actions', '.ai-input-response-wrap', '.ai-input-app-chip']) {
      assert.ok(rule[1].includes(cls), `${cls} no está en la regla`);
    }
  });

  it('las formas temporales no llevan colores sueltos fuera de la paleta', () => {
    const forbidden = ['#38bdf8', '#7dd3fc', '#818cf8', '#c4b5fd', '#a98bff', '#3b82f6', '#2563eb', '#22c55e', '#f87171'];
    const start = css.indexOf('Dictado por Voz Local');
    const section = css.slice(start, css.indexOf('Fase 16: Pulido de Botones'));
    for (const color of forbidden) assert.ok(!section.includes(color), `${color} sigue en la voz`);
    const quick = css.slice(css.indexOf('IA Rápida'), start);
    for (const color of forbidden) assert.ok(!quick.includes(color), `${color} sigue en la IA rápida`);
  });
});
