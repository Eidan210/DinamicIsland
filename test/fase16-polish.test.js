// =============================================================================
//  test/fase16-polish.test.js — Pruebas de la Fase 16: Pulido y Ajustes
// -----------------------------------------------------------------------------
//  Valida exhaustivamente los 5 apartados de la Fase 16 de roadmap_doc.md:
//  - Suite 1: Versión y configuración de ajustes (package.json & main/config.js)
//  - Suite 2: Música y letras (limpieza de títulos en lrc.js, LRCLIB y caché)
//  - Suite 3: Bandeja de archivos (apertura de archivos con shell.openPath)
//  - Suite 4: Casa de Clawd (ventana dedicada y 14 secciones estructuradas)
//  - Suite 5: Preload seguro (saveSetting, openCasaDeClawd, openDataFolder, getVersion, tray.open, clearCache)
//  - Suite 6: Transiciones Glance, rodillo numérico, tabs badges y botones
//  - Suite 7: Integración en menú contextual e icono del sistema
// =============================================================================

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('Fase 16 — Pulido y Ajustes', () => {

  // ===========================================================================
  //  SUITE 1: Versión y configuración de ajustes (package.json & main/config.js)
  // ===========================================================================
  describe('Suite 1: Versión de Notch y configuración (package.json & main/config.js)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

    it('package.json tiene la versión 0.18.0', () => {
      assert.strictEqual(pkg.version, '0.18.0', 'La versión de package.json debe ser 0.18.0');
    });

    it('DEFAULT_SETTINGS incluye lyricsOffset (0) y lyricsVisible (true)', () => {
      assert.strictEqual(DEFAULT_SETTINGS.lyricsOffset, 0, 'lyricsOffset por defecto debe ser 0');
      assert.strictEqual(DEFAULT_SETTINGS.lyricsVisible, true, 'lyricsVisible por defecto debe ser true');
    });

    it('validateSettings valida el rango de lyricsOffset de -2 a +2 s y redondea a 1 decimal', () => {
      const valid1 = validateSettings({ lyricsOffset: 1.5 });
      assert.strictEqual(valid1.lyricsOffset, 1.5);

      const valid2 = validateSettings({ lyricsOffset: -1.23 });
      assert.strictEqual(valid2.lyricsOffset, -1.2);

      const valid3 = validateSettings({ lyricsOffset: 2.0 });
      assert.strictEqual(valid3.lyricsOffset, 2.0);

      const valid4 = validateSettings({ lyricsOffset: -2.0 });
      assert.strictEqual(valid4.lyricsOffset, -2.0);

      // Fuera de rango debe volver al valor por defecto
      const outOfRangeHigh = validateSettings({ lyricsOffset: 2.5 });
      assert.strictEqual(outOfRangeHigh.lyricsOffset, DEFAULT_SETTINGS.lyricsOffset);

      const outOfRangeLow = validateSettings({ lyricsOffset: -2.5 });
      assert.strictEqual(outOfRangeLow.lyricsOffset, DEFAULT_SETTINGS.lyricsOffset);

      const nanVal = validateSettings({ lyricsOffset: 'invalido' });
      assert.strictEqual(nanVal.lyricsOffset, DEFAULT_SETTINGS.lyricsOffset);
    });

    it('validateSettings conserva el booleano lyricsVisible', () => {
      const off = validateSettings({ lyricsVisible: false });
      assert.strictEqual(off.lyricsVisible, false);

      const on = validateSettings({ lyricsVisible: true });
      assert.strictEqual(on.lyricsVisible, true);

      const fallback = validateSettings({});
      assert.strictEqual(fallback.lyricsVisible, true);
    });
  });

  // ===========================================================================
  //  SUITE 2: Limpieza de títulos de canciones y letras (main/lrc.js & main/lyrics.js)
  // ===========================================================================
  describe('Suite 2: Limpieza de títulos en LRCLIB y borrado de caché (main/lrc.js & main/lyrics.js)', () => {
    const { cleanTitle } = require('../main/lrc');
    const lyricsModule = require('../main/lyrics');

    it('cleanTitle limpia expresiones de colaboración como (feat. ...), [feat. ...]', () => {
      assert.strictEqual(cleanTitle('Song Title (feat. Artist X)'), 'Song Title');
      assert.strictEqual(cleanTitle('Song Title [feat. Artist Y]'), 'Song Title');
      assert.strictEqual(cleanTitle('Song Title (ft. Artist Z)'), 'Song Title');
    });

    it('cleanTitle limpia sufijos de remasterización y versiones', () => {
      assert.strictEqual(cleanTitle('Bohemian Rhapsody - Remastered 2011'), 'Bohemian Rhapsody');
      assert.strictEqual(cleanTitle('Hotel California - 2013 Remaster'), 'Hotel California');
      assert.strictEqual(cleanTitle('Comfortably Numb - Live at Pompeii'), 'Comfortably Numb');
    });

    it('cleanTitle limpia etiquetas de video, audio y lyrics', () => {
      assert.strictEqual(cleanTitle('Shape of You (Official Video)'), 'Shape of You');
      assert.strictEqual(cleanTitle('Blinding Lights [Official Audio]'), 'Blinding Lights');
      assert.strictEqual(cleanTitle('Stay (Lyric Video)'), 'Stay');
      assert.strictEqual(cleanTitle('Despacito (Video Oficial)'), 'Despacito');
      assert.strictEqual(cleanTitle('Yesterday [Lyrics]'), 'Yesterday');
    });

    it('cleanTitle no altera títulos limpios estándar', () => {
      assert.strictEqual(cleanTitle('Imagine'), 'Imagine');
      assert.strictEqual(cleanTitle('Billie Jean'), 'Billie Jean');
    });

    it('cleanTitle limpia etiquetas de visualizer y videoclip', () => {
      assert.strictEqual(cleanTitle('Song [Official Visualizer]'), 'Song');
      assert.strictEqual(cleanTitle('Song (Videoclip Oficial)'), 'Song');
      assert.strictEqual(cleanTitle('Song (Clip Oficial)'), 'Song');
      assert.strictEqual(cleanTitle('Song - Visualizer'), 'Song');
    });

    it('main/lyrics.js exporta clearCache() y getLyricsState()', () => {
      assert.strictEqual(typeof lyricsModule.clearCache, 'function', 'clearCache debe ser función');
      assert.strictEqual(typeof lyricsModule.getLyricsState, 'function', 'getLyricsState debe ser función');
      const state = lyricsModule.getLyricsState();
      assert.ok(state && typeof state === 'object', 'getLyricsState debe devolver objeto');
    });

    it('clearCache() se ejecuta de forma segura y devuelve { ok: true }', async () => {
      const res = await lyricsModule.clearCache();
      assert.strictEqual(res.ok, true, 'clearCache debe devolver ok: true');
    });
  });

  // ===========================================================================
  //  SUITE 3: Bandeja de archivos (main/tray.js & IPC)
  // ===========================================================================
  describe('Suite 3: Apertura de archivos en Bandeja (main/tray.js)', () => {
    const trayModule = require('../main/tray');

    it('main/tray.js exporta la función openFile', () => {
      assert.strictEqual(typeof trayModule.openFile, 'function', 'openFile debe estar exportada');
    });

    it('openFile devuelve not_found si el id no existe', async () => {
      const res = await trayModule.openFile('archivo-inexistente-12345');
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error, 'not_found');
    });
  });

  // ===========================================================================
  //  SUITE 4: Casa de Clawd (Ajustes modulares en 14 secciones)
  // ===========================================================================
  describe('Suite 4: Arquitectura de la Casa de Clawd (main/casa-clawd.js y renderer/casa-clawd.*)', () => {
    const casaModule = require('../main/casa-clawd');

    it('main/casa-clawd.js exporta openCasaClawd y getCasaWindow', () => {
      assert.strictEqual(typeof casaModule.openCasaClawd, 'function');
      assert.strictEqual(typeof casaModule.getCasaWindow, 'function');
    });

    it('renderer/casa-clawd.html contiene las 14 secciones estructuradas requeridas', () => {
      const htmlPath = path.join(ROOT, 'renderer', 'casa-clawd.html');
      assert.ok(fs.existsSync(htmlPath), 'renderer/casa-clawd.html debe existir');
      const html = fs.readFileSync(htmlPath, 'utf8');

      const expectedSections = [
        '1. General',
        '2. Pantalla',
        '3. Apariencia y luz',
        '4. Música y letras',
        '5. Widgets',
        '6. Horario',
        '7. Tareas',
        '8. Focus',
        '9. Agua',
        '10. Bandeja',
        '11. Avisos',
        '12. Claude Code',
        '13. IA',
        '14. Voz & Acerca de',
      ];

      for (const sec of expectedSections) {
        assert.ok(html.includes(sec), `casa-clawd.html debe contener la sección "${sec}"`);
      }
    });

    it('renderer/casa-clawd.html incluye controles de Fase 16 (offset de letras, vaciar caché y abrir appdata)', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer', 'casa-clawd.html'), 'utf8');
      assert.ok(html.includes('id="setting-lyricsOffset"'), 'debe incluir input de lyricsOffset');
      assert.ok(html.includes('id="btn-reset-offset"'), 'debe incluir botón para resetear offset');
      assert.ok(html.includes('id="btn-clear-lyrics-cache"'), 'debe incluir botón de borrar caché de letras');
      assert.ok(html.includes('id="btn-open-appdata"'), 'debe incluir botón para abrir %APPDATA%\\Notch');
    });

    it('renderer/casa-clawd.html incluye bloque para Claude Code, botón Copiar e indicador de estado', () => {
      const html = fs.readFileSync(path.join(ROOT, 'renderer', 'casa-clawd.html'), 'utf8');
      assert.ok(html.includes('id="server-status-dot"'), 'debe incluir indicador de estado del servidor');
      assert.ok(html.includes('id="btn-copy-claude-setup"'), 'debe incluir botón para copiar configuración de Claude');
      assert.ok(html.includes('id="claude-config-preview"'), 'debe incluir previsualización del bloque de hooks');
    });

    it('renderer/casa-clawd.css define estilos para la aplicación, navegación y tarjetas', () => {
      const cssPath = path.join(ROOT, 'renderer', 'casa-clawd.css');
      assert.ok(fs.existsSync(cssPath), 'renderer/casa-clawd.css debe existir');
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.casa-app'), 'debe estilizar .casa-app');
      assert.ok(css.includes('.casa-sidebar'), 'debe estilizar .casa-sidebar');
      assert.ok(css.includes('.nav-item'), 'debe estilizar los botones de navegación');
      assert.ok(css.includes('.range-slider'), 'debe estilizar controles deslizantes');
    });

    it('renderer/casa-clawd.js contiene la lógica de navegación y sincronización', () => {
      const jsPath = path.join(ROOT, 'renderer', 'casa-clawd.js');
      assert.ok(fs.existsSync(jsPath), 'renderer/casa-clawd.js debe existir');
      const js = fs.readFileSync(jsPath, 'utf8');
      assert.ok(js.includes('saveSetting'), 'debe interactuar con saveSetting');
      assert.ok(js.includes('lyrics.clearCache'), 'debe llamar a lyrics.clearCache');
      assert.ok(js.includes('openDataFolder'), 'debe llamar a openDataFolder');
    });
  });

  // ===========================================================================
  //  SUITE 5: Puente Preload (preload.js)
  // ===========================================================================
  describe('Suite 5: Métodos de contextBridge en preload.js', () => {
    const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

    it('preload.js expone saveSetting, openCasaDeClawd, openDataFolder y getVersion', () => {
      assert.ok(preload.includes('saveSetting:'), 'preload debe exponer saveSetting');
      assert.ok(preload.includes('openCasaDeClawd:'), 'preload debe exponer openCasaDeClawd');
      assert.ok(preload.includes('openDataFolder:'), 'preload debe exponer openDataFolder');
      assert.ok(preload.includes('getVersion:'), 'preload debe exponer getVersion');
    });

    it('preload.js expone tray.open para abrir archivos con el SO', () => {
      assert.ok(preload.includes('tray:open'), 'preload debe invocar tray:open');
      assert.ok(preload.includes('open: (id) =>'), 'preload.tray debe incluir open');
    });

    it('preload.js expone lyrics.clearCache', () => {
      assert.ok(preload.includes('lyrics:clear-cache'), 'preload debe invocar lyrics:clear-cache');
      assert.ok(preload.includes('clearCache: () =>'), 'preload.lyrics debe incluir clearCache');
    });
  });

  // ===========================================================================
  //  SUITE 6: Transiciones Glance, rodillo numérico, badges y botones (styles.css y modules)
  // ===========================================================================
  describe('Suite 6: Animaciones Glance, rodillo cuentakilómetros y microinteracciones', () => {
    const styles = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf8');
    const utils = require('../renderer/modules/utils.js');
    const tabsModule = fs.readFileSync(path.join(ROOT, 'renderer', 'modules', 'tabs.js'), 'utf8');

    it('styles.css contiene transición de apertura: ancho primero y luego alto con rebote', () => {
      assert.ok(styles.includes('.island[data-motion="grow"][data-shape="expanded"]'));
      assert.ok(styles.includes('140ms'), 'el alto debe comenzar después del ancho');
      assert.ok(styles.includes('1.04'), 'debe tener un ligero rebote en el eje de apertura');
    });

    it('styles.css contiene transición de cierre: retraso de encogimiento para desvanecer contenido antes', () => {
      assert.ok(styles.includes('.island[data-motion="shrink"]:not([data-shape="expanded"])'));
      assert.ok(styles.includes('transition-delay: 110ms') || styles.includes('transition-delay: 100ms') || styles.includes('110ms'));
    });

    it('styles.css contiene animación de contenido viejo hacia arriba y nuevo desde abajo entre banner y pill', () => {
      assert.ok(styles.includes('translate: 0 -14px'), 'contenido saliente sale hacia arriba');
      assert.ok(styles.includes('@keyframes banner-enter-up'), 'contenido entrante sube desde abajo');
    });

    it('styles.css define .tab-badge con color de alerta naranja y tabular-nums', () => {
      assert.ok(styles.includes('.tab-badge'), 'debe definir .tab-badge');
      assert.ok(styles.includes('#f59e0b'), 'badge naranja para avisos');
      assert.ok(styles.includes('tabular-nums'), 'badge numérico con números tabulares');
    });

    it('tabs.js exporta setTabBadge', () => {
      assert.ok(tabsModule.includes('export function setTabBadge'), 'tabs.js debe exportar setTabBadge');
    });

    it('styles.css define hover escala 1.03 + brillo sutil y active escala 0.97 para botones y tarjetas', () => {
      assert.ok(styles.includes('scale(1.03)'), 'hover debe escalar a 1.03');
      assert.ok(styles.includes('rgba(255, 255, 255, 0.18)'), 'debe incluir brillo sutil en el borde');
      assert.ok(styles.includes('scale(0.97)'), 'active debe comprimir a 0.97');
    });

    it('styles.css define regla para ocultar completamente la letra cuando lyricsVisible es false', () => {
      assert.ok(styles.includes('.lyrics[data-visible="false"]'), 'debe definir .lyrics[data-visible="false"]');
      assert.ok(styles.includes('display: none'), 'debe ocultar las letras con display: none');
    });

    it('utils.js exporta setRollingText y createNumberRoller con soporte tabular-nums', () => {
      assert.strictEqual(typeof utils.setRollingText, 'function', 'setRollingText debe ser función');
      assert.strictEqual(typeof utils.createNumberRoller, 'function', 'createNumberRoller debe ser función');
    });

    it('createNumberRoller crea un controlador reutilizable con método set', () => {
      const mockEl = {
        style: {},
        dataset: {},
        textContent: '',
        replaceChildren: function (...nodes) {
          this.textContent = nodes.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');
        },
      };
      const roller = utils.createNumberRoller(mockEl);
      assert.strictEqual(mockEl.style.fontVariantNumeric, 'tabular-nums');
      assert.strictEqual(typeof roller.set, 'function');

      roller.set('42%');
      assert.strictEqual(mockEl.dataset.rollText, '42%');
    });
  });

  // ===========================================================================
  //  SUITE 7: Integración en bandeja del sistema y menú contextual
  // ===========================================================================
  describe('Suite 7: Menú contextual del Notch y menú de bandeja de Windows', () => {
    const sysTray = fs.readFileSync(path.join(ROOT, 'main', 'system-tray.js'), 'utf8');
    const winModule = fs.readFileSync(path.join(ROOT, 'main', 'window.js'), 'utf8');

    it('system-tray.js abre casa-clawd al pulsar "Casa de Clawd"', () => {
      assert.ok(sysTray.includes('casa-clawd'), 'system-tray debe requerir casa-clawd');
      assert.ok(sysTray.includes('openCasaClawd()'), 'system-tray debe llamar a openCasaClawd()');
    });

    it('window.js incluye opción "Casa de Clawd (Ajustes)" en el menú contextual', () => {
      assert.ok(winModule.includes('Casa de Clawd (Ajustes)'), 'menú contextual debe incluir Casa de Clawd');
      assert.ok(winModule.includes('openCasaClawd()'), 'menú contextual debe abrir openCasaClawd()');
    });
  });

});
