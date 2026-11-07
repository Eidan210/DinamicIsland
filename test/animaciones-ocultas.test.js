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
});
