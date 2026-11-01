// =============================================================================
//  renderer/widgets/ai.js — Widget IA: Claude Code (o Antigravity)
// -----------------------------------------------------------------------------
//  1x1: el proyecto y qué hace ("Editando clawd.js").
//  2x1: además, los pasos Leer → Editar → Probar → Hecho.
//  Un toque abre la página IA. Brilla cuando Claude te espera (un permiso,
//  una pregunta, un plan) o cuando termina.
// =============================================================================

import { $, setText, plural } from '../modules/utils.js';
import { state } from '../modules/state.js';
import { onAiChange, SOURCE, STEPS, verbOf } from '../modules/ai.js';

const widget = $('home-ai');
const iconUse = $('home-ai-icon');
const titleEl = $('home-ai-title');
const noteEl = $('home-ai-note');
const stepsEl = $('home-ai-steps');

// Los 4 pasos, creados una sola vez
const stepItems = STEPS.map(([key, label]) => {
  const item = document.createElement('li');
  item.dataset.step = key;
  item.textContent = label;
  stepsEl.append(item);
  return item;
});

function isLive(session) {
  return session.status === 'working' || session.status === 'waiting';
}

function render() {
  const { sessions, pending, lastEventAt, server } = state.ai;
  const live = sessions.filter(isLive);
  const session = live[0] || sessions[0];
  widget.dataset.status = pending.length ? 'waiting' : session?.status || '';
  iconUse.setAttribute('href', (SOURCE[session?.source] || SOURCE.claude).icon);
  titleEl.classList.toggle('is-dim', !session);

  if (!session) {
    setText(titleEl, 'Sin sesiones');
    setText(noteEl, !server.listening ? 'Servidor apagado' : lastEventAt ? 'Esperando a Claude Code' : 'Conecta Claude Code');
  } else {
    setText(titleEl, session.project);
    const target = session.status === 'working' && session.tool?.target ? ` ${session.tool.target}` : '';
    const more = live.length > 1 ? ` · ${plural(live.length, 'sesión', 'sesiones')}` : '';
    setText(noteEl, pending.length ? 'Te espera en Notch' : `${verbOf(session)}${target}${more}`);
  }

  // Pasos (2x1)
  stepItems.forEach((item) => {
    const key = item.dataset.step;
    const done = Boolean(session) && (key === 'done' ? session.step === 'done' : Boolean(session.steps?.[key]));
    item.dataset.done = String(done);
    item.dataset.current = String(Boolean(session) && session.step === key && session.status === 'working');
  });
}

export const aiWidget = {
  type: 'ai',
  name: 'IA',
  description: 'Claude Code: qué hace y por qué paso va',
  icon: 'i-w-ai',
  accent: 'var(--ai-color)',
  sizes: ['1x1', '2x1'],
  goto: 'ai',
  init() {
    onAiChange(render);
  },
  render,
  // Novedades: lo que te pide (permiso, pregunta, plan), la terminal te
  // pregunta algo, o terminó (cada turno terminado es una novedad nueva).
  news() {
    const causes = [];
    const { pending, sessions } = state.ai;
    for (const decision of pending) causes.push(`decision:${decision.id}`);
    for (const session of sessions) {
      if (session.status === 'waiting') causes.push(`waiting:${session.id}`);
      if ((session.status === 'done' || session.status === 'error') && session.endedAt) {
        causes.push(`${session.status}:${session.id}:${session.endedAt}`);
      }
    }
    return causes;
  },
};
