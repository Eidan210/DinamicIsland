// =============================================================================
//  test/fase15-voice.test.js — Pruebas de la Fase 15: Dictado por Voz Local
// -----------------------------------------------------------------------------
//  Valida la arquitectura completa de dictado por voz estilo «Murmur»:
//  - Suite 1: Configuración por defecto y validación de esquema (main/config.js)
//  - Suite 2: Arquitectura C# en WinHelper (VoiceModule.cs, WinHelper.csproj, Program.cs)
//  - Suite 3: Backend del proceso principal, atajos e IPC (main/voice.js, shortcuts.js, ipc.js)
//  - Suite 4: Puente seguro Preload (preload.js window.notch.voice)
//  - Suite 5: Estructura HTML y CSS de la muesca (renderer/index.html, styles.css)
//  - Suite 6: Módulos del Renderer y ciclo de vida (renderer/modules/voice.js, island.js, main.js)
//  - Suite 7: Versión del paquete y empaquetado (package.json versión y native runtimes)
// =============================================================================

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('Fase 15 — Dictado por Voz Local (estilo Murmur)', () => {

  // ===========================================================================
  //  SUITE 1: Config defaults & schema validation (main/config.js)
  // ===========================================================================
  describe('Suite 1: Ajustes de configuración y validación de esquema (main/config.js)', () => {
    const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

    it('DEFAULT_SETTINGS incluye voiceShortcut, voiceLanguage, voiceModelPath y voicePasteOnFinish con sus valores por defecto', () => {
      assert.strictEqual(
        DEFAULT_SETTINGS.voiceShortcut,
        'Control+Alt+D',
        'DEFAULT_SETTINGS.voiceShortcut debe ser "Control+Alt+D"'
      );
      assert.strictEqual(
        DEFAULT_SETTINGS.voiceLanguage,
        'es',
        'DEFAULT_SETTINGS.voiceLanguage debe ser "es"'
      );
      assert.strictEqual(
        DEFAULT_SETTINGS.voiceModelPath,
        '',
        'DEFAULT_SETTINGS.voiceModelPath debe ser cadena vacía para autodescubrimiento'
      );
      assert.strictEqual(
        DEFAULT_SETTINGS.voicePasteOnFinish,
        false,
        'DEFAULT_SETTINGS.voicePasteOnFinish debe ser false por defecto'
      );
    });

    it('validateSettings conserva valores válidos de configuración de voz (Tier 1)', () => {
      const customConfig = {
        voiceShortcut: 'Control+Alt+V',
        voiceLanguage: 'en',
        voiceModelPath: 'C:\\modelos\\ggml-base.bin',
        voicePasteOnFinish: true,
      };

      const validated = validateSettings(customConfig);
      assert.strictEqual(validated.voiceShortcut, 'Control+Alt+V');
      assert.strictEqual(validated.voiceLanguage, 'en');
      assert.strictEqual(validated.voiceModelPath, 'C:\\modelos\\ggml-base.bin');
      assert.strictEqual(validated.voicePasteOnFinish, true);
    });

    it('validateSettings aplica fallback y saneamiento ante valores vacíos o tipos erróneos (Tier 2)', () => {
      const fallbackCases = validateSettings({
        voiceShortcut: '',
        voiceLanguage: '   ',
        voiceModelPath: null,
        voicePasteOnFinish: 'yes',
      });

      assert.strictEqual(
        fallbackCases.voiceShortcut,
        'Control+Alt+D',
        'Atajo vacío debe restaurar el valor por defecto Control+Alt+D'
      );
      assert.strictEqual(
        fallbackCases.voiceLanguage,
        'es',
        'Idioma en blanco debe restaurar el valor por defecto "es"'
      );
      assert.strictEqual(
        fallbackCases.voiceModelPath,
        '',
        'Ruta de modelo nula o no-string debe restaurar cadena vacía'
      );
      assert.strictEqual(
        fallbackCases.voicePasteOnFinish,
        false,
        'Valor no booleano estricto debe normalizarse a false'
      );
    });

    it('validateSettings normaliza idiomas a minúsculas y recorta espacios en cadenas (Tier 2)', () => {
      const normalized = validateSettings({
        voiceShortcut: '  Control+Alt+D  ',
        voiceLanguage: '  ES-MX  ',
        voiceModelPath: '  C:\\whisper\\model.bin  ',
        voicePasteOnFinish: false,
      });

      assert.strictEqual(normalized.voiceShortcut, 'Control+Alt+D');
      assert.strictEqual(normalized.voiceLanguage, 'es-mx');
      assert.strictEqual(normalized.voiceModelPath, 'C:\\whisper\\model.bin');
      assert.strictEqual(normalized.voicePasteOnFinish, false);
    });

    it('validateSettings exige booleano estricto para voicePasteOnFinish (Tier 2)', () => {
      const truthyInvalid = [1, 'true', '1', {}, [], () => {}];
      for (const val of truthyInvalid) {
        const res = validateSettings({ voicePasteOnFinish: val });
        assert.strictEqual(
          res.voicePasteOnFinish,
          false,
          `voicePasteOnFinish=${JSON.stringify(val)} debe resultar en false`
        );
      }

      const validTrue = validateSettings({ voicePasteOnFinish: true });
      assert.strictEqual(validTrue.voicePasteOnFinish, true);
    });

    it('main/config.js define explícitamente los campos de voz en el código fuente', () => {
      const configCode = fs.readFileSync(path.join(ROOT, 'main/config.js'), 'utf8');
      assert.ok(configCode.includes('voiceShortcut'), 'config.js debe contener la clave voiceShortcut');
      assert.ok(configCode.includes('voiceLanguage'), 'config.js debe contener la clave voiceLanguage');
      assert.ok(configCode.includes('voiceModelPath'), 'config.js debe contener la clave voiceModelPath');
      assert.ok(configCode.includes('voicePasteOnFinish'), 'config.js debe contener la clave voicePasteOnFinish');
    });
  });

  // ===========================================================================
  //  SUITE 2: WinHelper C# architecture & dependencies
  // ===========================================================================
  describe('Suite 2: Arquitectura C# en WinHelper (VoiceModule.cs, WinHelper.csproj, Program.cs)', () => {
    it('WinHelper.csproj incluye los paquetes NuGet requeridos: NAudio 2.2.1, Whisper.net 1.9.1 y Whisper.net.Runtime 1.9.1 (Tier 1)', () => {
      const csprojPath = path.join(ROOT, 'helpers/WinHelper/WinHelper.csproj');
      assert.ok(fs.existsSync(csprojPath), 'helpers/WinHelper/WinHelper.csproj debe existir');
      const csproj = fs.readFileSync(csprojPath, 'utf8');

      assert.ok(
        csproj.includes('NAudio') && csproj.includes('2.2.1'),
        'WinHelper.csproj debe incluir referencia a NAudio versión 2.2.1'
      );
      assert.ok(
        csproj.includes('Whisper.net') && csproj.includes('1.9.1'),
        'WinHelper.csproj debe incluir referencia a Whisper.net versión 1.9.1'
      );
      assert.ok(
        csproj.includes('Whisper.net.Runtime') && csproj.includes('1.9.1'),
        'WinHelper.csproj debe incluir referencia a Whisper.net.Runtime versión 1.9.1'
      );
    });

    it('VoiceModule.cs existe y define captura de audio en memoria a 16 kHz mono 16-bit PCM (Tier 1)', () => {
      const voiceCsPath = path.join(ROOT, 'helpers/WinHelper/VoiceModule.cs');
      assert.ok(fs.existsSync(voiceCsPath), 'helpers/WinHelper/VoiceModule.cs debe existir');

      const voiceCs = fs.readFileSync(voiceCsPath, 'utf8');
      assert.ok(
        voiceCs.includes('WaveInEvent'),
        'VoiceModule.cs debe capturar audio utilizando NAudio.Wave.WaveInEvent'
      );
      assert.ok(
        voiceCs.includes('16000') && voiceCs.includes('16') && voiceCs.includes('1'),
        'VoiceModule.cs debe configurar el formato de captura a 16 kHz, 16 bits y 1 canal (mono)'
      );
      assert.ok(
        voiceCs.includes('MemoryStream'),
        'VoiceModule.cs debe capturar en memoria (MemoryStream) con cero escrituras residuales a disco'
      );
    });

    it('VoiceModule.cs calcula volumen RMS en tiempo real y transmite niveles a Electron (Tier 1 & Tier 2)', () => {
      const voiceCsPath = path.join(ROOT, 'helpers/WinHelper/VoiceModule.cs');
      assert.ok(fs.existsSync(voiceCsPath), 'VoiceModule.cs debe existir');

      const voiceCs = fs.readFileSync(voiceCsPath, 'utf8');
      assert.ok(
        voiceCs.includes('rms') || voiceCs.includes('Math.Sqrt'),
        'VoiceModule.cs debe calcular el valor RMS de las muestras de audio'
      );
      assert.ok(
        voiceCs.includes('Math.Clamp') || voiceCs.includes('level'),
        'VoiceModule.cs debe normalizar y acotar el nivel de volumen entre 0.0 y 1.0'
      );
      assert.ok(
        voiceCs.includes('"level"'),
        'VoiceModule.cs debe emitir eventos JSON de nivel ("level") hacia Electron'
      );
    });

    it('VoiceModule.cs transcribe audio bajo demanda con Whisper.net y emite la transcripción (Tier 1)', () => {
      const voiceCsPath = path.join(ROOT, 'helpers/WinHelper/VoiceModule.cs');
      assert.ok(fs.existsSync(voiceCsPath), 'VoiceModule.cs debe existir');

      const voiceCs = fs.readFileSync(voiceCsPath, 'utf8');
      assert.ok(
        voiceCs.includes('WhisperFactory'),
        'VoiceModule.cs debe instanciar WhisperFactory para procesar el modelo local'
      );
      assert.ok(
        voiceCs.includes('ProcessAsync') || voiceCs.includes('WhisperProcessor'),
        'VoiceModule.cs debe ejecutar la transcripción de forma asíncrona con WhisperProcessor'
      );
      assert.ok(
        voiceCs.includes('"transcript"'),
        'VoiceModule.cs debe emitir el evento JSON "transcript" con el texto reconocido'
      );
    });

    it('VoiceModule.cs implementa liberación de memoria a 0 MB residuales y 0% CPU en reposo (Tier 4)', () => {
      const voiceCsPath = path.join(ROOT, 'helpers/WinHelper/VoiceModule.cs');
      assert.ok(fs.existsSync(voiceCsPath), 'VoiceModule.cs debe existir');

      const voiceCs = fs.readFileSync(voiceCsPath, 'utf8');
      assert.ok(
        voiceCs.includes('Dispose()') || voiceCs.includes('Dispose'),
        'VoiceModule.cs debe liberar explícitamente los recursos de WaveIn y Whisper al finalizar'
      );
      assert.ok(
        voiceCs.includes('GC.Collect'),
        'VoiceModule.cs debe forzar recolección de basura con GC.Collect tras la transcripción'
      );
      assert.ok(
        voiceCs.includes('EmptyWorkingSet') || voiceCs.includes('SetProcessWorkingSetSize'),
        'VoiceModule.cs debe purgar el working set con EmptyWorkingSet para garantizar 0 MB residuales'
      );
    });

    it('VoiceModule.cs detecta permisos de micrófono en el registro de Windows y fallos de hardware (Tier 3)', () => {
      const voiceCsPath = path.join(ROOT, 'helpers/WinHelper/VoiceModule.cs');
      assert.ok(fs.existsSync(voiceCsPath), 'VoiceModule.cs debe existir');

      const voiceCs = fs.readFileSync(voiceCsPath, 'utf8');
      assert.ok(
        voiceCs.includes('ConsentStore') || voiceCs.includes('DeviceCount') || voiceCs.includes('MmException'),
        'VoiceModule.cs debe validar permisos de ConsentStore o capturar MmException / ausencia de micrófono'
      );
      assert.ok(
        voiceCs.includes('"error"') || voiceCs.includes('mic_permission_denied'),
        'VoiceModule.cs debe reportar errores estructurados en caso de micrófono denegado o ausente'
      );
    });

    it('Program.cs enruta las órdenes de voz y soporta paste-to-app (Tier 3 & Tier 4)', () => {
      const programPath = path.join(ROOT, 'helpers/WinHelper/Program.cs');
      assert.ok(fs.existsSync(programPath), 'helpers/WinHelper/Program.cs debe existir');

      const programCs = fs.readFileSync(programPath, 'utf8');
      assert.ok(
        programCs.includes('VoiceModule') || programCs.includes('voice'),
        'Program.cs debe despachar comandos de voz hacia VoiceModule'
      );

      const activeAppPath = path.join(ROOT, 'helpers/WinHelper/ActiveAppModule.cs');
      assert.ok(fs.existsSync(activeAppPath), 'ActiveAppModule.cs debe existir');
      const activeAppCs = fs.readFileSync(activeAppPath, 'utf8');
      assert.ok(
        activeAppCs.includes('paste-to-app') || activeAppCs.includes('PasteToLastApp'),
        'ActiveAppModule debe proporcionar soporte para la orden paste-to-app'
      );
    });
  });

  // ===========================================================================
  //  SUITE 3: Main process backend & shortcuts (main/voice.js, shortcuts.js, ipc.js)
  // ===========================================================================
  describe('Suite 3: Backend del proceso principal, atajos e IPC (main/voice.js, shortcuts.js, ipc.js)', () => {
    it('main/voice.js existe y exporta las funciones requeridas del ciclo de vida (Tier 1)', () => {
      const voiceJsPath = path.join(ROOT, 'main/voice.js');
      assert.ok(fs.existsSync(voiceJsPath), 'main/voice.js debe existir');

      if (fs.existsSync(voiceJsPath)) {
        const voice = require('../main/voice');
        assert.strictEqual(typeof voice.initVoice, 'function', 'initVoice debe ser una función');
        assert.strictEqual(typeof voice.startVoice, 'function', 'startVoice debe ser una función');
        assert.strictEqual(typeof voice.stopVoice, 'function', 'stopVoice debe ser una función');
        assert.strictEqual(typeof voice.cancelVoice, 'function', 'cancelVoice debe ser una función');
        assert.strictEqual(typeof voice.getVoiceStatus, 'function', 'getVoiceStatus debe ser una función');
        assert.strictEqual(typeof voice.pasteToApp, 'function', 'pasteToApp debe ser una función');
      }
    });

    it('main/voice.js consulta la privacidad de micrófono de Windows con reg.exe query (Tier 3)', () => {
      const voiceJsPath = path.join(ROOT, 'main/voice.js');
      assert.ok(fs.existsSync(voiceJsPath), 'main/voice.js debe existir');

      if (fs.existsSync(voiceJsPath)) {
        const voiceCode = fs.readFileSync(voiceJsPath, 'utf8');
        assert.ok(
          voiceCode.includes('reg.exe') && voiceCode.includes('query'),
          'main/voice.js debe invocar reg.exe query para comprobar permisos del micrófono'
        );
        assert.ok(
          voiceCode.includes('ConsentStore') && voiceCode.includes('microphone'),
          'main/voice.js debe inspeccionar la clave CapabilityAccessManager\\ConsentStore\\microphone'
        );
        assert.ok(
          voiceCode.includes('Deny') || voiceCode.includes('Allow'),
          'main/voice.js debe evaluar si el valor de privacidad es Deny o Allow'
        );
      }
    });

    it('main/voice.js gestiona la búsqueda y resolución de rutas del modelo ggml-base.bin (Tier 2)', () => {
      const voiceJsPath = path.join(ROOT, 'main/voice.js');
      assert.ok(fs.existsSync(voiceJsPath), 'main/voice.js debe existir');

      if (fs.existsSync(voiceJsPath)) {
        const voiceCode = fs.readFileSync(voiceJsPath, 'utf8');
        assert.ok(
          voiceCode.includes('ggml-base.bin'),
          'main/voice.js debe referenciar el nombre de archivo ggml-base.bin'
        );
        assert.ok(
          voiceCode.includes('voiceModelPath') || voiceCode.includes('userData') || voiceCode.includes('models'),
          'main/voice.js debe contemplar rutas de modelo configuradas, en userData o en carpeta models/'
        );
      }
    });

    it('main/voice.js implementa comunicación bidireccional con WinHelper y reenvío a Renderer (Tier 3 & Tier 4)', () => {
      const voiceJsPath = path.join(ROOT, 'main/voice.js');
      assert.ok(fs.existsSync(voiceJsPath), 'main/voice.js debe existir');

      if (fs.existsSync(voiceJsPath)) {
        const voiceCode = fs.readFileSync(voiceJsPath, 'utf8');
        assert.ok(
          voiceCode.includes('sendToHelper'),
          'main/voice.js debe enviar órdenes a WinHelper vía sendToHelper'
        );
        assert.ok(
          voiceCode.includes('onHelperMessage'),
          'main/voice.js debe registrar escucha de mensajes con onHelperMessage'
        );
        assert.ok(
          voiceCode.includes('sendToRenderer'),
          'main/voice.js debe retransmitir estado y eventos a la página con sendToRenderer'
        );
      }
    });

    it('main/shortcuts.js registra el atajo global de voz configurable (Tier 1)', () => {
      const shortcutsPath = path.join(ROOT, 'main/shortcuts.js');
      assert.ok(fs.existsSync(shortcutsPath), 'main/shortcuts.js debe existir');

      const shortcutsCode = fs.readFileSync(shortcutsPath, 'utf8');
      assert.ok(
        shortcutsCode.includes('voiceShortcut'),
        'shortcuts.js debe referenciar el ajuste voiceShortcut para registrar el atajo global'
      );
    });

    it('main.js incluye voiceShortcut en shortcutsKey para recarga en caliente (Tier 3)', () => {
      const mainPath = path.join(ROOT, 'main.js');
      assert.ok(fs.existsSync(mainPath), 'main.js debe existir');

      const mainCode = fs.readFileSync(mainPath, 'utf8');
      assert.ok(
        mainCode.includes('voiceShortcut'),
        'main.js shortcutsKey debe incluir voiceShortcut para permitir hot-reload sin reiniciar'
      );
    });

    it('main/ipc.js registra todos los canales IPC de voz requeridos (Tier 1 & Tier 3)', () => {
      const ipcPath = path.join(ROOT, 'main/ipc.js');
      assert.ok(fs.existsSync(ipcPath), 'main/ipc.js debe existir');

      const ipcCode = fs.readFileSync(ipcPath, 'utf8');
      const requiredChannels = [
        'voice:start',
        'voice:stop',
        'voice:cancel',
        'voice:status',
        'voice:paste',
        'voice:open-privacy',
        'voice:download-model',
      ];

      for (const channel of requiredChannels) {
        assert.ok(
          ipcCode.includes(`'${channel}'`) || ipcCode.includes(`"${channel}"`),
          `ipc.js debe registrar el canal IPC "${channel}"`
        );
      }
    });
  });

  // ===========================================================================
  //  SUITE 4: Preload bridge (preload.js window.notch.voice)
  // ===========================================================================
  describe('Suite 4: Puente seguro Preload (preload.js window.notch.voice)', () => {
    it('preload.js expone window.notch.voice a través del contextBridge (Tier 1)', () => {
      const preloadPath = path.join(ROOT, 'preload.js');
      assert.ok(fs.existsSync(preloadPath), 'preload.js debe existir');

      const preloadCode = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(
        preloadCode.includes('voice:'),
        'preload.js debe exponer la sección voice en la API pública de Notch'
      );
    });

    it('window.notch.voice define todos los métodos de acción requeridos (Tier 1 & Tier 3)', () => {
      const preloadCode = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
      const requiredMethods = [
        'start',
        'stop',
        'cancel',
        'getStatus',
        'paste',
        'openPrivacySettings',
        'downloadModel',
      ];

      for (const method of requiredMethods) {
        assert.ok(
          preloadCode.includes(`${method}:`) || preloadCode.includes(`${method}(`),
          `preload.js debe definir el método voice.${method}`
        );
      }
    });

    it('window.notch.voice define las suscripciones a eventos de estado, nivel y transcripción (Tier 1 & Tier 2)', () => {
      const preloadCode = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
      const requiredSubscriptions = [
        'onStatus',
        'onLevel',
        'onTranscript',
        'onDownloadProgress',
      ];

      for (const sub of requiredSubscriptions) {
        assert.ok(
          preloadCode.includes(`${sub}:`) || preloadCode.includes(`${sub}(`),
          `preload.js debe definir el listener de eventos voice.${sub}`
        );
      }
    });

    it('window.notch.voice vincula correctamente con los canales IPC correspondientes (Tier 1)', () => {
      const preloadCode = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
      assert.ok(preloadCode.includes("'voice:start'"), 'preload.js debe invocar voice:start');
      assert.ok(preloadCode.includes("'voice:stop'"), 'preload.js debe invocar voice:stop');
      assert.ok(preloadCode.includes("'voice:cancel'"), 'preload.js debe invocar voice:cancel');
      assert.ok(preloadCode.includes("'voice:status'"), 'preload.js debe invocar voice:status');
      assert.ok(preloadCode.includes("'voice:paste'"), 'preload.js debe invocar voice:paste');
    });
  });

  // ===========================================================================
  //  SUITE 5: HTML & CSS structure (renderer/index.html, styles.css)
  // ===========================================================================
  describe('Suite 5: Estructura HTML y CSS de la muesca (renderer/index.html, styles.css)', () => {
    it('index.html contiene el contenedor #voice-banner en la isla dinámica (Tier 1)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
      assert.ok(
        html.includes('id="voice-banner"'),
        'index.html debe contener el contenedor con id="voice-banner"'
      );
    });

    it('index.html define el símbolo SVG #i-mic en el catálogo de iconos (Tier 1)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
      assert.ok(
        html.includes('id="i-mic"'),
        'index.html debe definir el símbolo SVG id="i-mic"'
      );
    });

    it('index.html contiene el contenedor de forma de onda con al menos 7 barras (Tier 1 & Tier 2)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
      assert.ok(
        html.includes('id="voice-waveform"'),
        'index.html debe contener el contenedor id="voice-waveform"'
      );

      const barMatches = (html.match(/class="[^"]*voice-bar[^"]*"/g) || []).length;
      assert.ok(
        barMatches >= 7,
        `index.html debe contener al menos 7 barras .voice-bar para la onda (encontradas: ${barMatches})`
      );
    });

    it('index.html incluye los botones de acción post-transcripción: pegar, IA, copiar y cerrar (Tier 1 & Tier 3)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
      assert.ok(html.includes('id="voice-btn-paste"'), 'index.html debe contener el botón #voice-btn-paste');
      assert.ok(html.includes('id="voice-btn-ai"'), 'index.html debe contener el botón #voice-btn-ai');
      assert.ok(html.includes('id="voice-btn-copy"'), 'index.html debe contener el botón #voice-btn-copy');
      assert.ok(html.includes('id="voice-btn-close"'), 'index.html debe contener el botón #voice-btn-close');
    });

    it('index.html incluye indicadores de estado y contenedor de transcripción (Tier 1)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
      assert.ok(html.includes('id="voice-status-text"'), 'index.html debe contener #voice-status-text');
      assert.ok(html.includes('id="voice-shortcut-hint"'), 'index.html debe contener #voice-shortcut-hint');
      assert.ok(html.includes('id="voice-transcript"'), 'index.html debe contener #voice-transcript');
      assert.ok(html.includes('id="voice-spinner"'), 'index.html debe contener #voice-spinner');
    });

    it('styles.css define la forma de isla data-shape="voice" con dimensiones 460px y 76px/84px (Tier 1)', () => {
      const css = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
      assert.ok(
        css.includes('.island[data-shape="voice"]'),
        'styles.css debe definir el selector .island[data-shape="voice"]'
      );
      assert.ok(
        css.includes('460px'),
        'styles.css debe fijar un ancho de 460px para el modo voice'
      );
      assert.ok(
        css.includes('76px'),
        'styles.css debe fijar una altura de 76px para el modo voice en grabación'
      );
      assert.ok(
        css.includes('84px'),
        'styles.css debe permitir expansión a 84px al completar la transcripción'
      );
    });

    it('styles.css oculta otros elementos de la isla cuando data-shape="voice" está activo (Tier 3)', () => {
      const css = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
      assert.ok(
        css.includes('.island[data-shape="voice"]') && css.includes('display: none !important'),
        'styles.css debe ocultar las otras vistas (face, panel, alert, ai-input-view) cuando la voz está activa'
      );
    });

    it('styles.css define reglas de movimiento reducido para las barras de onda de voz (Tier 3)', () => {
      const css = fs.readFileSync(path.join(ROOT, 'renderer/styles.css'), 'utf8');
      assert.ok(
        css.includes('reduce-motion') && (css.includes('voice-bar') || css.includes('voice-waveform')),
        'styles.css debe contemplar reducción de movimiento (data-reduce-motion o prefers-reduced-motion) para la onda'
      );
    });
  });

  // ===========================================================================
  //  SUITE 6: Renderer modules & lifecycle (voice.js, island.js, main.js)
  // ===========================================================================
  describe('Suite 6: Módulos del Renderer y ciclo de vida (renderer/modules/voice.js, island.js, main.js)', () => {
    it('renderer/modules/voice.js existe y exporta initVoice y dismissVoice (Tier 1)', () => {
      const voiceModulePath = path.join(ROOT, 'renderer/modules/voice.js');
      assert.ok(fs.existsSync(voiceModulePath), 'renderer/modules/voice.js debe existir');

      if (fs.existsSync(voiceModulePath)) {
        const voiceCode = fs.readFileSync(voiceModulePath, 'utf8');
        assert.ok(
          voiceCode.includes('export function initVoice'),
          'voice.js debe exportar la función initVoice'
        );
        assert.ok(
          voiceCode.includes('export function dismissVoice'),
          'voice.js debe exportar la función dismissVoice'
        );
      }
    });

    it('voice.js implementa envolvente de habla para animación natural de las 7 barras (Tier 2)', () => {
      const voiceModulePath = path.join(ROOT, 'renderer/modules/voice.js');
      assert.ok(fs.existsSync(voiceModulePath), 'renderer/modules/voice.js debe existir');

      if (fs.existsSync(voiceModulePath)) {
        const voiceCode = fs.readFileSync(voiceModulePath, 'utf8');
        assert.ok(
          voiceCode.includes('ENVELOPE') || voiceCode.includes('0.4') || voiceCode.includes('0.7'),
          'voice.js debe implementar distribución de envolvente para modular las barras de onda'
        );
      }
    });

    it('voice.js se integra con beat.js mediante runOnFrames y stopOnBeat para 0% CPU en reposo (Tier 4)', () => {
      const voiceModulePath = path.join(ROOT, 'renderer/modules/voice.js');
      assert.ok(fs.existsSync(voiceModulePath), 'renderer/modules/voice.js debe existir');

      if (fs.existsSync(voiceModulePath)) {
        const voiceCode = fs.readFileSync(voiceModulePath, 'utf8');
        assert.ok(
          voiceCode.includes('runOnFrames'),
          'voice.js debe utilizar runOnFrames para animar la onda a 24 Hz durante la grabación'
        );
        assert.ok(
          voiceCode.includes('stopOnBeat'),
          'voice.js debe invocar stopOnBeat al detenerse para garantizar 0% de CPU en reposo'
        );
      }
    });

    it('voice.js gestiona la tecla Escape para detener grabación o descartar el banner (Tier 2)', () => {
      const voiceModulePath = path.join(ROOT, 'renderer/modules/voice.js');
      assert.ok(fs.existsSync(voiceModulePath), 'renderer/modules/voice.js debe existir');

      if (fs.existsSync(voiceModulePath)) {
        const voiceCode = fs.readFileSync(voiceModulePath, 'utf8');
        assert.ok(
          voiceCode.includes('Escape'),
          'voice.js debe escuchar la tecla Escape para cancelar grabación o cerrar'
        );
      }
    });

    it('voice.js vincula las acciones post-transcripción (pegar en app, enviar a IA, copiar) (Tier 3)', () => {
      const voiceModulePath = path.join(ROOT, 'renderer/modules/voice.js');
      assert.ok(fs.existsSync(voiceModulePath), 'renderer/modules/voice.js debe existir');

      if (fs.existsSync(voiceModulePath)) {
        const voiceCode = fs.readFileSync(voiceModulePath, 'utf8');
        assert.ok(
          voiceCode.includes('pasteToApp') || voiceCode.includes('paste'),
          'voice.js debe implementar acción de pegado en aplicación activa previa'
        );
        assert.ok(
          voiceCode.includes('aiQuick') || voiceCode.includes('ai-quick-input') || voiceCode.includes('prompt'),
          'voice.js debe implementar acción para abrir la transcripción en la IA rápida'
        );
        assert.ok(
          voiceCode.includes('clipboard') || voiceCode.includes('writeText'),
          'voice.js debe implementar acción para copiar texto al portapapeles'
        );
      }
    });

    it('island.js incluye voice en SHAPE_ORDER y evalúa prioridad en computeShape() (Tier 1 & Tier 3)', () => {
      const islandPath = path.join(ROOT, 'renderer/modules/island.js');
      assert.ok(fs.existsSync(islandPath), 'renderer/modules/island.js debe existir');

      const islandCode = fs.readFileSync(islandPath, 'utf8');
      assert.ok(
        islandCode.includes("'voice'"),
        "island.js debe incluir la forma 'voice' en SHAPE_ORDER"
      );
      assert.ok(
        islandCode.includes('state.voice') || islandCode.includes("status !== 'idle'") || islandCode.includes("=== 'voice'"),
        'island.js computeShape() debe evaluar el estado activo de la voz para cambiar a forma voice'
      );
      assert.ok(
        islandCode.includes("shape === 'voice'") || islandCode.includes("'voice'"),
        'island.js isPointerOnIsland() debe considerar interactiva la forma voice para recibir clics'
      );
    });

    it('renderer/modules/main.js inicializa el módulo de voz en el ciclo de vida (Tier 1)', () => {
      const mainPath = path.join(ROOT, 'renderer/modules/main.js');
      assert.ok(fs.existsSync(mainPath), 'renderer/modules/main.js debe existir');

      const mainCode = fs.readFileSync(mainPath, 'utf8');
      assert.ok(
        mainCode.includes('initVoice'),
        'renderer/modules/main.js debe importar y llamar a initVoice() en el arranque'
      );
    });
  });

  // ===========================================================================
  //  SUITE 7: Package version & packaging (package.json)
  // ===========================================================================
  describe('Suite 7: Versión del paquete y empaquetado (package.json versión y runtimes)', () => {
    it('package.json especifica la versión 0.17.0 de Fase 15 (Tier 1)', () => {
      const pkgPath = path.join(ROOT, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json debe existir');

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(
        pkg.version,
        '0.17.0',
        `package.json debe tener la versión 0.17.0 (actual: ${pkg.version})`
      );
    });

    it('package.json extraResources incluye el filtro de native runtimes para Whisper.net (Tier 4)', () => {
      const pkgPath = path.join(ROOT, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json debe existir');

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const extraResources = pkg.build?.extraResources || [];

      const winHelperResource = extraResources.find(
        (entry) => entry.to === 'WinHelper' || (entry.from && entry.from.includes('WinHelper'))
      );

      assert.ok(
        winHelperResource,
        'package.json extraResources debe tener una entrada para WinHelper'
      );

      const filterList = Array.isArray(winHelperResource.filter)
        ? winHelperResource.filter
        : [];

      const includesRuntimes = filterList.some(
        (filter) => filter.includes('runtimes') || filter === '**/*'
      );

      assert.ok(
        includesRuntimes,
        'package.json extraResources para WinHelper debe incluir "runtimes/**/*" para las DLLs de Whisper'
      );
    });
  });
});
