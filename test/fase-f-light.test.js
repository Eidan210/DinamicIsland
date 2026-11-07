// Fase F: luz de escucha y borde de agente. Pruebas estáticas que habrían cazado el bug de 'aiDone'.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const modules = fs.readdirSync(path.join(__dirname, '..', 'renderer', 'modules')).filter((f) => f.endsWith('.js'));

describe('Fase F: eventos de luz', () => {
  const light = read('renderer/modules/light.js');
  const eventsBlock = light.slice(light.indexOf('export const LIGHT_EVENTS'), light.indexOf('export function testLight'));
  const declared = new Set([...eventsBlock.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]));

  it('todo testLight(\'x\') del código existe en LIGHT_EVENTS', () => {
    const missing = [];
    for (const file of modules) {
      const src = read(`renderer/modules/${file}`);
      for (const m of src.matchAll(/testLight\('(\w+)'\)/g)) if (!declared.has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    assert.deepEqual(missing, [], `eventos sin definir: ${missing.join(', ')}`);
  });

  it('existen los eventos nuevos de F2', () => {
    assert.ok(declared.has('agentWorking') && declared.has('agentDone'));
  });

  it('los avisos que respiran lo hacen un número finito de veces', () => {
    assert.match(eventsBlock, /permission: \{[^}]*breaths: 4/s);
    assert.match(eventsBlock, /aiWorking: \{[^}]*breaths: 3/s);
  });
});

describe('Fase F: halo y borde de agente', () => {
  const css = read('renderer/styles.css');

  it('el halo solo anima opacity/scale y el borde de agente no gira sin parar', () => {
    const block = css.slice(css.indexOf('Fase F · Luz de escucha'));
    // \S tras el lookahead evita que \s* retroceda y tome "filter: none" como incumplimiento
    assert.ok(!/filter:\s*(?!none)\S/.test(block), 'sin filter (salvo filter: none) en la fase F');
    assert.ok(!/animation:[^;]*infinite/.test(block), 'sin animaciones infinitas en la fase F');
  });

  it('ai.js apaga la luz de permiso cuando no quedan decisiones y dispara la luz de agente', () => {
    const ai = read('renderer/modules/ai.js');
    assert.match(ai, /stopLightByName\('permission'\)/);
    assert.match(ai, /testLight\('agentWorking'\)/);
    assert.match(ai, /testLight\('agentDone'\)/);
  });

  it('voice.js arranca y para el halo', () => {
    const voice = read('renderer/modules/voice.js');
    assert.match(voice, /startListenHalo\(\)/);
    assert.ok((voice.match(/stopListenHalo\(\)/g) || []).length >= 4, 'se para al transcribir, terminar, fallar y descartar');
  });

  it('agentSweep se valida como booleano y arranca apagado', () => {
    const { validateSettings, DEFAULT_SETTINGS } = require('../main/config');
    assert.equal(DEFAULT_SETTINGS.agentSweep, false);
    assert.equal(validateSettings({ agentSweep: 'si' }).agentSweep, false);
    assert.equal(validateSettings({ agentSweep: true }).agentSweep, true);
  });
});
