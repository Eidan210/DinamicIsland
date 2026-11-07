// =============================================================================
//  renderer/modules/voice.js — Dictado por Voz Local (Fase 15, estilo Murmur)
// -----------------------------------------------------------------------------
//  Maneja la interfaz de dictado por voz en la isla dinámica:
//    • Visualización de ondas de micrófono reactivas a 24 Hz durante la grabación
//    • Cero consumo de CPU en reposo mediante beat.js (stopOnBeat)
//    • Botones post-transcripción: pegar en app activa, enviar a IA o copiar
//    • Tecla Escape para cancelar o cerrar
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { updateShape } from './island.js';
import { runOnFrames, stopOnBeat } from './beat.js';
import { startListenHalo, setListenLevel, stopListenHalo } from './light.js';

// Envolvente de habla para distribución armónica de las 7 barras
const ENVELOPE = [0.4, 0.7, 1.0, 1.2, 1.0, 0.7, 0.4];

let bannerEl = null;
let statusTextEl = null;
let shortcutHintEl = null;
let spinnerEl = null;
let waveformEl = null;
let barEls = [];
let resultWrapEl = null;
let transcriptEl = null;
let actionsEl = null;
let pasteBtnEl = null;
let aiBtnEl = null;
let copyBtnEl = null;
let closeBtnEl = null;

let currentLevel = 0;
let currentTranscript = '';
let isRecording = false;

/** Inicializa los listeners y enlaces de la interfaz de voz. */
// Altura de la tarjeta del resultado: cabecera + botones + filas de texto (hasta 6, luego hay scroll).
const CARD_BASE_PX = 110;
const CARD_ROW_PX = 21;
const CARD_MAX_ROWS = 6;

export function initVoice() {
  bannerEl = $('voice-banner');
  if (!bannerEl) return;

  statusTextEl = $('voice-status-text');
  shortcutHintEl = $('voice-shortcut-hint');
  spinnerEl = $('voice-spinner');
  waveformEl = $('voice-waveform');
  barEls = [...document.querySelectorAll('.voice-bar')];
  resultWrapEl = $('voice-result-wrap');
  transcriptEl = $('voice-transcript');
  actionsEl = $('voice-actions');
  pasteBtnEl = $('voice-btn-paste');
  aiBtnEl = $('voice-btn-ai');
  copyBtnEl = $('voice-btn-copy');
  closeBtnEl = $('voice-btn-close');

  // Acciones post-transcripción
  pasteBtnEl?.addEventListener('click', () => {
    pasteToApp(currentTranscript);
  });

  aiBtnEl?.addEventListener('click', () => {
    openInAiQuick(currentTranscript);
  });

  copyBtnEl?.addEventListener('click', () => {
    copyTranscript();
  });

  closeBtnEl?.addEventListener('click', () => {
    dismissVoice();
  });

  // Tecla Escape para detener grabación o descartar el banner
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.voice && state.voice.status !== 'idle') {
      if (isRecording) {
        window.notch.voice?.cancel();
      }
      dismissVoice();
    }
  });

  // Conexión con los eventos IPC desde preload
  if (window.notch.voice) {
    window.notch.voice.onStatus(handleVoiceStatus);
    window.notch.voice.onLevel(handleVoiceLevel);
    window.notch.voice.onTranscript(handleVoiceTranscript);
  }
}

/** Descarta la vista de voz y devuelve la isla a su estado anterior. */
export function dismissVoice() {
  // Si había una tarjeta de resultado, main sigue en 'done': se lo decimos para que vuelva a 'idle'.
  if (state.voice?.status === 'done') window.notch.voice?.cancel();
  stopWaveformAnimation();
  stopListenHalo();
  if (state.voice) {
    state.voice.status = 'idle';
    state.voice.level = 0;
    state.voice.error = null;
  }
  const island = $('island');
  if (island) {
    delete island.dataset.voiceState;
  }
  if (bannerEl) {
    bannerEl.hidden = true;
    bannerEl.dataset.state = 'idle';
  }
  isRecording = false;
  updateShape();
}

/** Manejo de cambios de estado del motor de voz. */
function handleVoiceStatus(payload) {
  if (!payload) return;
  const status = payload.state || payload.status || 'idle';
  const error = payload.error || null;

  if (!state.voice) {
    state.voice = { status: 'idle', level: 0, transcript: '', error: null };
  }
  state.voice.status = status;
  state.voice.error = error;

  const island = $('island');

  if (status === 'recording') {
    isRecording = true;
    currentLevel = 0;
    currentTranscript = '';
    if (bannerEl) {
      bannerEl.hidden = false;
      bannerEl.dataset.state = 'recording';
    }
    if (island) delete island.dataset.voiceState;
    if (statusTextEl) statusTextEl.textContent = 'Escuchando…';
    if (shortcutHintEl) shortcutHintEl.textContent = `${payload.shortcut || 'Ctrl+Alt+D'} para detener (o Esc)`;
    if (spinnerEl) spinnerEl.hidden = true;
    if (waveformEl) waveformEl.hidden = false;
    if (resultWrapEl) resultWrapEl.hidden = true;
    if (actionsEl) actionsEl.hidden = true;
    startWaveformAnimation();
    startListenHalo();
  } else if (status === 'transcribing') {
    isRecording = false;
    stopWaveformAnimation();
    stopListenHalo();
    if (bannerEl) {
      bannerEl.hidden = false;
      bannerEl.dataset.state = 'transcribing';
    }
    if (island) delete island.dataset.voiceState;
    if (statusTextEl) statusTextEl.textContent = 'Transcribiendo…';
    if (shortcutHintEl) shortcutHintEl.textContent = 'Whisper.net local';
    if (spinnerEl) spinnerEl.hidden = false;
    if (waveformEl) waveformEl.hidden = true;
    if (resultWrapEl) resultWrapEl.hidden = true;
    if (actionsEl) actionsEl.hidden = true;
  } else if (status === 'done' || status === 'transcribed') {
    isRecording = false;
    stopWaveformAnimation();
    stopListenHalo();
    if (bannerEl) {
      bannerEl.hidden = false;
      bannerEl.dataset.state = 'done';
    }
    if (island) island.dataset.voiceState = 'done';
    if (statusTextEl) statusTextEl.textContent = 'Dictado listo';
    if (shortcutHintEl) shortcutHintEl.textContent = 'Elige una acción o pulsa Esc';
    if (spinnerEl) spinnerEl.hidden = true;
    if (waveformEl) waveformEl.hidden = true;
    if (resultWrapEl) resultWrapEl.hidden = false;
    const text = currentTranscript || payload.lastTranscript || payload.text || 'Sin texto';
    if (transcriptEl) transcriptEl.textContent = text;
    // shortcut: filas estimadas por nº de caracteres (≈52 por línea a 14,5 px), no medidas; ajustar si cambia la fuente o el ancho.
    const rows = Math.min(CARD_MAX_ROWS, Math.max(1, Math.ceil(text.length / 52)));
    if (island) island.style.setProperty('--voice-card-h', `${CARD_BASE_PX + rows * CARD_ROW_PX}px`);
    if (actionsEl) actionsEl.hidden = false;
  } else if (status === 'error') {
    isRecording = false;
    stopWaveformAnimation();
    stopListenHalo();
    if (bannerEl) {
      bannerEl.hidden = false;
      bannerEl.dataset.state = 'error';
    }
    if (island) delete island.dataset.voiceState;
    if (statusTextEl) statusTextEl.textContent = error || 'Error de micrófono';
    if (shortcutHintEl) shortcutHintEl.textContent = 'Comprueba privacidad o hardware';
    if (spinnerEl) spinnerEl.hidden = true;
    if (waveformEl) waveformEl.hidden = true;
    if (resultWrapEl) resultWrapEl.hidden = true;
    if (actionsEl) actionsEl.hidden = true;
    setTimeout(() => {
      if (state.voice?.status === 'error') dismissVoice();
    }, 3500);
  } else if (status === 'idle') {
    dismissVoice();
    return;
  }

  updateShape();
}

/** Streaming de nivel de volumen de audio. */
function handleVoiceLevel(payload) {
  if (!payload || !isRecording) return;
  currentLevel = typeof payload.level === 'number' ? payload.level : 0;
  setListenLevel(currentLevel);
  if (state.voice) state.voice.level = currentLevel;
}

/** Recepción de transcripción completada o parcial. */
function handleVoiceTranscript(payload) {
  if (!payload) return;
  const text = payload.text || '';
  currentTranscript = text;
  if (state.voice) state.voice.transcript = text;
  if (transcriptEl) transcriptEl.textContent = text;
}

/** Inicia la animación de barras de onda a 24 Hz con runOnFrames (beat.js). */
function startWaveformAnimation() {
  runOnFrames('voice-wave', () => {
    if (!isRecording) return;
    const base = Math.max(0.08, currentLevel);
    barEls.forEach((bar, idx) => {
      const weight = ENVELOPE[idx % ENVELOPE.length] || 1.0;
      const height = Math.min(30, Math.max(4, Math.round(base * weight * 26)));
      bar.style.height = `${height}px`;
    });
  });
}

/** Detiene la animación con stopOnBeat garantizando 0% de CPU en reposo. */
function stopWaveformAnimation() {
  stopOnBeat('voice-wave');
  barEls.forEach((bar) => {
    bar.style.height = '6px';
  });
}

/** Pega el texto en la aplicación activa previa (SendInput de WinHelper). */
export function pasteToApp(text) {
  const content = text || currentTranscript;
  if (window.notch.voice?.paste) {
    window.notch.voice.paste(content);
  }
  dismissVoice();
}

/** Abre la caja de comandos de IA rápida (ai-quick) con la transcripción. */
export function openInAiQuick(text) {
  const content = text || currentTranscript;
  dismissVoice();
  // Insertar en el textarea de ai-quick si existe
  const aiInput = $('ai-quick-input');
  if (aiInput) {
    aiInput.value = content;
    aiInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Abrir la caja de comandos
  window.notch.aiQuick?.open();
}

/** Copia la transcripción al portapapeles. */
export function copyTranscript() {
  if (!currentTranscript) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(currentTranscript);
  } else if (window.notch.clipboard?.writeText) {
    window.notch.clipboard.writeText(currentTranscript);
  }

  if (copyBtnEl) {
    const orig = copyBtnEl.innerHTML;
    copyBtnEl.textContent = '¡Copiado!';
    setTimeout(() => {
      if (copyBtnEl) copyBtnEl.innerHTML = orig;
    }, 1500);
  }
}
