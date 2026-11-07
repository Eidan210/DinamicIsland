// =============================================================================
//  renderer/modules/topbar-actions.js — Botones de la barra superior del panel
// -----------------------------------------------------------------------------
//  Dictado por voz, IA rápida y Casa de Clawd tenían solo atajo de teclado o
//  clic derecho. Aquí tienen un botón visible; los atajos siguen funcionando.
//  Cada botón solo llama a lo que ya existe en main (no duplica lógica).
// =============================================================================

import { $, prettyAccelerator } from './utils.js';
import { state } from './state.js';

/** Texto del tooltip: "Dictado por voz · Ctrl+Alt+D" (sin atajo, solo el nombre). */
function withShortcut(name, accelerator) {
  return accelerator ? `${name} · ${prettyAccelerator(accelerator)}` : name;
}

/** Refresca los tooltips cuando cambian los atajos en settings.json. */
export function applyTopbarShortcuts() {
  const voice = $('topbar-voice');
  const quick = $('topbar-ai-quick');
  if (voice) voice.title = withShortcut('Dictado por voz', state.settings?.voiceShortcut);
  if (quick) quick.title = withShortcut('IA rápida', state.settings?.aiShortcut);
}

export function initTopbarActions() {
  const voiceBtn = $('topbar-voice');
  const quickBtn = $('topbar-ai-quick');
  const casaBtn = $('topbar-casa');

  // Micrófono: si ya graba, para; si no, empieza. main.js cierra el panel al grabar.
  voiceBtn?.addEventListener('click', () => {
    if (!window.notch.voice) return;
    if (state.voice?.status === 'recording') window.notch.voice.stop();
    else window.notch.voice.start();
  });

  // IA rápida: con el panel abierto la forma 'expanded' tiene prioridad, así que se
  // cierra primero (los mensajes IPC llegan en orden) y luego se abre la caja.
  quickBtn?.addEventListener('click', () => {
    window.notch.collapse();
    window.notch.aiQuick.open();
  });

  casaBtn?.addEventListener('click', () => window.notch.openCasaDeClawd());

  applyTopbarShortcuts();
}
