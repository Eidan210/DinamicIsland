// =============================================================================
//  main/voice.js — Dictado por Voz Local estilo «Murmur» (Fase 15)
// -----------------------------------------------------------------------------
//  Controla la captura de audio por WinHelper, transcripción local con Whisper.net,
//  detección de permisos de privacidad del micrófono en Windows, ciclo de estados
//  y atajo global de dictado.
// =============================================================================

'use strict';

const electron = require('electron');
const app = electron?.app;
const clipboard = electron?.clipboard;
const shell = electron?.shell;

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { execFile, execFileSync } = require('node:child_process');
const { state, ROOT_DIR } = require('./state');
const { sendToRenderer } = require('./bridge');
const { sendToHelper, onHelperMessage, getHelperStatus } = require('./helper');
const { addNotice, clearNotice } = require('./notices');

const MODEL_FILENAME = 'ggml-base.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

let voiceState = 'idle'; // 'idle' | 'recording' | 'transcribing' | 'done' | 'error'
let lastTranscript = '';
let downloadRequest = null;
let errorTimer = null; // Temporizador para auto-recuperación de estado 'error' -> 'idle'

// Configuración y variables de caché para la comprobación de privacidad del micrófono
const MIC_CHECK_TTL_MS = 10000; // TTL de 10 segundos para evitar consultas redundantes a reg.exe
let cachedMicPermission = true;
let lastMicCheckTime = 0;
let micCheckPendingPromise = null;

/** Dónde debe buscarse el modelo si no se especifica ruta absoluta. */
function getModelsDirectory() {
  if (app && typeof app.isPackaged === 'boolean' && app.isPackaged && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'models');
  }
  return path.join(ROOT_DIR, 'models');
}

/** Resuelve la ruta efectiva del archivo ggml-base.bin en el sistema. */
function resolveModelPath() {
  const configured = state.settings?.voiceModelPath;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }

  const defaultDir = getModelsDirectory();
  const defaultPath = path.join(defaultDir, MODEL_FILENAME);
  if (fs.existsSync(defaultPath)) return defaultPath;

  if (app && typeof app.getPath === 'function') {
    try {
      const userDataPath = path.join(app.getPath('userData'), 'models', MODEL_FILENAME);
      if (fs.existsSync(userDataPath)) return userDataPath;
    } catch {
      // Ignorar error si no está disponible userData
    }
  }

  if (app && app.isPackaged && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'models', MODEL_FILENAME);
    if (fs.existsSync(resourcePath)) return resourcePath;
  }

  return defaultPath;
}

/** Comprueba si el modelo ggml-base.bin existe y tiene un tamaño válido (> 1 MB). */
function isModelAvailable() {
  const modelPath = resolveModelPath();
  try {
    return fs.existsSync(modelPath) && fs.statSync(modelPath).size > 1024 * 1024;
  } catch {
    return false;
  }
}

/** Evalúa si la salida del comando reg.exe indica acceso denegado. */
function isDeniedRegOutput(stdout) {
  return /Value\s+REG_SZ\s+Deny/i.test(stdout || '');
}

/** Ejecuta la consulta de registro síncrona (utilizada en arranque en frío o comprobación forzada). */
function queryMicPermissionSync() {
  if (process.platform !== 'win32') return true;

  try {
    // 1. Permiso global del usuario
    const globalOut = execFileSync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone', '/v', 'Value'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    );
    if (isDeniedRegOutput(globalOut)) {
      cachedMicPermission = false;
      lastMicCheckTime = Date.now();
      return false;
    }

    // 2. Permiso para aplicaciones de escritorio (NonPackaged)
    const nonPackagedOut = execFileSync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged', '/v', 'Value'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    );
    if (isDeniedRegOutput(nonPackagedOut)) {
      cachedMicPermission = false;
      lastMicCheckTime = Date.now();
      return false;
    }

    cachedMicPermission = true;
    lastMicCheckTime = Date.now();
    return true;
  } catch {
    // Si no se puede leer la clave, permitimos el intento y dejamos que WinHelper reporte error de hardware
    cachedMicPermission = true;
    lastMicCheckTime = Date.now();
    return true;
  }
}

/** Refresca asíncronamente los permisos de micrófono sin bloquear el bucle de eventos. */
function refreshMicPermissionAsync() {
  if (process.platform !== 'win32') {
    cachedMicPermission = true;
    lastMicCheckTime = Date.now();
    return Promise.resolve(true);
  }

  if (micCheckPendingPromise) {
    return micCheckPendingPromise;
  }

  micCheckPendingPromise = new Promise((resolve) => {
    const regKeyGlobal = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';
    const regKeyNonPackaged = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged';

    const queryKey = (key) =>
      new Promise((resKey) => {
        execFile(
          'reg.exe',
          ['query', key, '/v', 'Value'],
          { encoding: 'utf8', windowsHide: true },
          (err, stdout) => {
            if (err) return resKey('');
            resKey(stdout || '');
          }
        );
      });

    Promise.all([queryKey(regKeyGlobal), queryKey(regKeyNonPackaged)])
      .then(([globalOut, nonPackagedOut]) => {
        const denied = isDeniedRegOutput(globalOut) || isDeniedRegOutput(nonPackagedOut);
        const previous = cachedMicPermission;
        cachedMicPermission = !denied;
        lastMicCheckTime = Date.now();
        micCheckPendingPromise = null;

        // Si el estado de permisos cambió externamente, notificar al Renderer
        if (previous !== cachedMicPermission) {
          sendToRenderer('voice:status', getVoiceStatus());
        }
        resolve(cachedMicPermission);
      })
      .catch(() => {
        cachedMicPermission = true;
        lastMicCheckTime = Date.now();
        micCheckPendingPromise = null;
        resolve(true);
      });
  });

  return micCheckPendingPromise;
}

/**
 * Comprueba los permisos de privacidad de Windows para el micrófono.
 * Implementa caché con TTL de 10 segundos y patrón stale-while-revalidate no bloqueante.
 * 
 * @param {boolean|{forceRefresh?: boolean, sync?: boolean}} [options]
 * @returns {boolean} true si el micrófono está permitido; false si está denegado.
 */
function checkMicPermission(options = {}) {
  if (process.platform !== 'win32') return true;

  const force = typeof options === 'boolean' ? options : Boolean(options?.forceRefresh);
  const sync = typeof options === 'object' && options?.sync === true;
  const now = Date.now();

  // Si se solicita forzado síncrono explícito
  if (force && sync) {
    return queryMicPermissionSync();
  }

  // Si la caché es fresca y no se fuerza refresco, responder inmediatamente en 0 ms
  if (!force && lastMicCheckTime > 0 && (now - lastMicCheckTime) < MIC_CHECK_TTL_MS) {
    return cachedMicPermission;
  }

  // Arranque en frío (primera llamada sin caché previa): consulta síncrona
  if (lastMicCheckTime === 0) {
    return queryMicPermissionSync();
  }

  // Si la caché expiró: devolver valor en caché (stale) y actualizar en segundo plano (revalidate)
  refreshMicPermissionAsync();
  return cachedMicPermission;
}

/** Invalida la caché de permisos de micrófono para forzar una revalidación. */
function invalidateMicPermissionCache() {
  lastMicCheckTime = 1; // Marca como expirada pero ya inicializada
  return refreshMicPermissionAsync();
}

/** Abre la configuración de privacidad del micrófono de Windows 11 e invalida la caché. */
function openMicPrivacySettings() {
  invalidateMicPermissionCache();
  if (shell && typeof shell.openExternal === 'function') {
    shell.openExternal('ms-settings:privacy-microphone').catch((err) => {
      console.warn('[voice] No se pudo abrir configuración de privacidad:', err.message);
    });
  }
}

/** Actualiza el estado del módulo de voz, limpia timers previos y programa auto-recuperación ante error. */
function setVoiceState(newState, extra = {}) {
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }

  voiceState = newState;
  sendToRenderer('voice:status', { state: voiceState, ...extra });

  if (newState === 'error') {
    errorTimer = setTimeout(() => {
      errorTimer = null;
      if (voiceState === 'error') {
        setVoiceState('idle');
      }
    }, 3000);
  }
}

/** Inicializa la escucha de eventos de voz procedentes de WinHelper. */
function initVoice() {
  // Calentamiento asíncrono preventivo de la caché de permisos (no bloquea el hilo principal)
  refreshMicPermissionAsync();

  onHelperMessage('voice', (msg) => {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.event) {
      case 'level':
        sendToRenderer('voice:onLevel', {
          level: Number(msg.level || 0),
          peak: Number(msg.peak || 0),
          rms: Number(msg.rms || 0),
        });
        break;

      case 'transcript':
        lastTranscript = String(msg.text || '').trim();
        // El texto va antes que el estado: cuando el renderer recibe 'done' ya lo tiene.
        sendToRenderer('voice:onTranscript', {
          text: lastTranscript,
          durationMs: Number(msg.durationMs || 0),
        });

        if (lastTranscript && state.settings?.voicePasteOnFinish) {
          setVoiceState('idle', { lastTranscript });
          pasteToApp(lastTranscript);
        } else {
          // 'done' deja la tarjeta con el resultado hasta que se elija una acción o se pulse Esc.
          // Antes se mandaba 'idle': el renderer lo toma por "descartar" y la tarjeta nunca se veía.
          setVoiceState(lastTranscript ? 'done' : 'idle', { lastTranscript });
        }
        break;

      case 'status':
        // Tras transcribir, el ayudante vuelve a 'idle' por su cuenta: la tarjeta no debe cerrarse por eso.
        if (msg.status === 'idle' && voiceState === 'done') break;
        if (msg.status === 'recording' || msg.status === 'transcribing' || msg.status === 'idle') {
          setVoiceState(msg.status);
        }
        break;

      case 'error':
        console.warn(`[voice] Error de WinHelper: ${msg.error} — ${msg.message}`);
        if (msg.error === 'mic_permission_denied') {
          addNotice({
            key: 'voice-mic-denied',
            kind: 'error',
            tone: 'danger',
            title: 'Micrófono bloqueado',
            text: 'Windows no permite el acceso al micrófono. Actívalo en Configuración de privacidad.',
            alert: true,
          });
        }
        setVoiceState('error', { error: msg.error, message: msg.message });
        break;
    }
  });
}

/** Alterna inicio o detención del dictado al presionar el atajo global (Control+Alt+D). */
function toggleVoice() {
  if (voiceState === 'recording') {
    stopVoice();
  } else if (voiceState === 'idle' || voiceState === 'error' || voiceState === 'done') {
    startVoice();
  }
}

/** Inicia la grabación del micrófono tras validar permisos y modelo. */
function startVoice() {
  if (voiceState === 'error' || voiceState === 'done') {
    setVoiceState('idle');
  }
  if (voiceState !== 'idle') return false;

  // 1. Verificación de permisos de privacidad
  let micAllowed = checkMicPermission();
  if (!micAllowed) {
    // Si la caché indicaba denegado, forzar revalidación síncrona por si el usuario lo activó en Windows Settings
    micAllowed = checkMicPermission({ forceRefresh: true, sync: true });
  }
  if (!micAllowed) {
    setVoiceState('error', { error: 'mic_permission_denied' });
    addNotice({
      key: 'voice-mic-denied',
      kind: 'error',
      tone: 'danger',
      title: 'Micrófono bloqueado',
      text: 'Windows no permite el acceso al micrófono. Pulsa aquí para abrir Privacidad.',
      alert: true,
    });
    return false;
  }
  clearNotice('voice-mic-denied');

  // 2. Verificación de existencia del modelo Whisper
  const modelPath = resolveModelPath();
  if (!isModelAvailable()) {
    setVoiceState('error', { error: 'model_missing', modelPath });
    addNotice({
      key: 'voice-model-missing',
      kind: 'error',
      tone: 'warning',
      title: 'Modelo Whisper no encontrado',
      text: `Coloca ${MODEL_FILENAME} en la carpeta models/ para habilitar el dictado.`,
      alert: true,
    });
    return false;
  }
  clearNotice('voice-model-missing');

  // 3. Verificación de estado de WinHelper
  if (getHelperStatus() !== 'ok') {
    setVoiceState('error', { error: 'helper_not_ready' });
    console.warn('[voice] No se puede iniciar: WinHelper no está listo.');
    return false;
  }

  // 4. Enviar orden a WinHelper
  const options = {
    modelPath,
    language: state.settings?.voiceLanguage || 'es',
  };

  sendToHelper(`voice start ${JSON.stringify(options)}`);
  setVoiceState('recording', { language: options.language });
  return true;
}

/** Detiene la grabación y activa la transcripción en WinHelper. */
function stopVoice() {
  if (voiceState !== 'recording') return false;
  setVoiceState('transcribing');
  sendToHelper('voice stop');
  return true;
}

/** Cancela la grabación sin transcribir o limpia el estado de error. */
function cancelVoice() {
  if (voiceState === 'recording') {
    sendToHelper('voice cancel');
    setVoiceState('idle');
    return true;
  }
  if (voiceState === 'error' || voiceState === 'done') {
    setVoiceState('idle');
    return true;
  }
  return false;
}

/** Pega texto en la aplicación activa previa mediante SendInput. */
function pasteToApp(text) {
  const content = typeof text === 'string' && text ? text : lastTranscript;
  if (!content) return;

  if (clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(content);
  }

  // Aseguramos que la ventana de Notch libere el foco
  const notchWindow = require('./window');
  if (notchWindow && typeof notchWindow.setExpanded === 'function') {
    notchWindow.setExpanded(false, { restoreFocus: false });
  }

  setTimeout(() => {
    sendToHelper('paste-to-app');
  }, 100);
}

/** Devuelve el estado actual completo para el Renderer. */
function getVoiceStatus() {
  return {
    state: voiceState,
    modelAvailable: isModelAvailable(),
    modelPath: resolveModelPath(),
    micAllowed: checkMicPermission(),
    language: state.settings?.voiceLanguage || 'es',
    shortcut: state.settings?.voiceShortcut || 'Control+Alt+D',
    lastTranscript,
  };
}

/** Descarga automática opcional del modelo Whisper ggml-base.bin si falta. */
async function downloadModel() {
  if (isModelAvailable()) {
    clearNotice('voice-model-missing');
    if (voiceState === 'error') {
      setVoiceState('idle');
    }
    return { ok: true, alreadyExists: true };
  }

  if (downloadRequest) {
    return { ok: false, error: 'download_in_progress' };
  }

  const targetDir = getModelsDirectory();
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const targetFile = path.join(targetDir, MODEL_FILENAME);
  const tempFile = `${targetFile}.tmp`;

  return new Promise((resolve) => {
    let resolved = false;
    let fileStream = null;
    let activeRes = null;

    function cleanup(err) {
      if (resolved) return;
      resolved = true;
      downloadRequest = null;

      if (activeRes) {
        try { activeRes.destroy(); } catch {}
        activeRes = null;
      }

      if (fileStream) {
        try { fileStream.destroy(); } catch {}
        fileStream = null;
      }

      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {}

      resolve({ ok: false, error: err ? (err.message || String(err)) : 'download_failed' });
    }

    function onSuccess() {
      if (resolved) return;
      resolved = true;
      downloadRequest = null;
      activeRes = null;
      fileStream = null;

      try {
        fs.renameSync(tempFile, targetFile);
        clearNotice('voice-model-missing');
        setVoiceState('idle');
        sendToRenderer('voice:status', getVoiceStatus());
        resolve({ ok: true });
      } catch (err) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        } catch {}
        resolve({ ok: false, error: err.message });
      }
    }

    const MAX_REDIRECTS = 5;

    function getWithRedirects(urlStr, redirectCount = 0) {
      if (redirectCount > MAX_REDIRECTS) {
        cleanup(new Error('Demasiadas redirecciones al descargar el modelo'));
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(urlStr);
      } catch (urlErr) {
        cleanup(new Error(`URL de descarga inválida: ${urlErr.message}`));
        return;
      }

      const client = parsedUrl.protocol === 'http:' ? http : https;

      const req = client.get(parsedUrl, (res) => {
        // 1. Manejo de redirecciones HTTP (301, 302, 303, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // Consumir flujo para liberar socket de inmediato
          let nextUrl;
          try {
            nextUrl = new URL(res.headers.location, parsedUrl).toString();
          } catch {
            cleanup(new Error(`Cabecera Location de redirección inválida: ${res.headers.location}`));
            return;
          }
          getWithRedirects(nextUrl, redirectCount + 1);
          return;
        }

        // 2. Manejo de error de código de estado HTTP (no 200)
        if (res.statusCode !== 200) {
          res.resume(); // Consumir flujo de error para liberar socket
          cleanup(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        // 3. Respuesta 200 OK — Crear flujo de escritura en disco
        activeRes = res;

        res.on('error', (err) => {
          cleanup(err);
        });

        fileStream = fs.createWriteStream(tempFile);
        fileStream.on('error', (err) => {
          cleanup(err);
        });

        fileStream.on('finish', () => {
          fileStream.close((err) => {
            if (err) {
              cleanup(err);
            } else {
              onSuccess();
            }
          });
        });

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          sendToRenderer('voice:download-progress', {
            percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
            downloadedBytes,
            totalBytes,
          });
        });

        res.pipe(fileStream);
      });

      downloadRequest = req;

      req.on('error', (err) => {
        cleanup(err);
      });
    }

    getWithRedirects(MODEL_URL);
  });
}

/** Cancela la grabación en curso y limpia timers/descargas activas si la aplicación va a cerrarse. */
function stopVoiceModule() {
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
  if (voiceState === 'recording') {
    cancelVoice();
  }
  if (downloadRequest) {
    try { downloadRequest.destroy(); } catch {}
    downloadRequest = null;
  }
}

module.exports = {
  initVoice,
  toggleVoice,
  startVoice,
  stopVoice,
  cancelVoice,
  pasteToApp,
  getVoiceStatus,
  resolveModelPath,
  isModelAvailable,
  checkMicPermission,
  openMicPrivacySettings,
  invalidateMicPermissionCache,
  downloadModel,
  stopVoiceModule,
};
