// =============================================================================
//  renderer/casa-clawd.js — Lógica de la ventana «Casa de Clawd» (Fase 16)
// =============================================================================

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.casa-section');

  // Navegación por pestañas
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.section;
      navItems.forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      sections.forEach((sec) => {
        sec.classList.toggle('is-active', sec.id === targetId);
      });
    });
  });

  // Cargar versión
  try {
    const version = await window.notch.getVersion?.();
    if (version) {
      const vText = `v${version}`;
      const sidebarEl = document.getElementById('sidebar-version');
      const aboutEl = document.getElementById('about-app-version');
      if (sidebarEl) sidebarEl.textContent = vText;
      if (aboutEl) aboutEl.textContent = version;
    }
  } catch (err) {
    console.warn('[casa-clawd] No se pudo obtener versión:', err);
  }

  // Cargar configuración
  let settings = {};
  try {
    settings = (await window.notch.getSettings()) || {};
  } catch (err) {
    console.warn('[casa-clawd] Error cargando settings:', err);
  }

  // La Casa sigue el tema de Notch: "auto" = el de Windows, "light" o "dark" lo fijan.
  const systemLight = window.matchMedia('(prefers-color-scheme: light)');
  function applyTheme(data) {
    const choice = data && data.theme;
    const light = choice === 'light' || (choice !== 'dark' && systemLight.matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }

  function applySettingsToUI(data) {
    if (!data) return;
    applyTheme(data);

    // Campos con data-key directo
    document.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      const val = data[key];
      if (val === undefined) return;

      if (input.type === 'checkbox') {
        input.checked = Boolean(val);
      } else {
        input.value = val;
      }
    });

    // Etiquetas dinámicas
    const scale = data.scale ?? 100;
    const valScale = document.getElementById('val-scale');
    if (valScale) valScale.textContent = `${scale}%`;

    const topGap = data.topGap ?? 8;
    const valTopGap = document.getElementById('val-topGap');
    if (valTopGap) valTopGap.textContent = `${topGap} px`;

    const lyricsOffset = Number(data.lyricsOffset ?? 0);
    const valOffset = document.getElementById('val-lyricsOffset');
    if (valOffset) valOffset.textContent = `${lyricsOffset > 0 ? '+' : ''}${lyricsOffset.toFixed(1)} s`;

    // Ciudades de reloj mundial (array a string)
    const worldClockInput = document.getElementById('setting-worldClockCities');
    if (worldClockInput && Array.isArray(data.worldClockCities)) {
      worldClockInput.value = data.worldClockCities.join(', ');
    }
  }

  applySettingsToUI(settings);
  systemLight.addEventListener('change', () => applyTheme(settings));

  // Guardar configuración al cambiar campos
  document.querySelectorAll('[data-key]').forEach((input) => {
    const key = input.dataset.key;

    input.addEventListener('change', async () => {
      let val;
      if (input.type === 'checkbox') {
        val = input.checked;
      } else if (input.type === 'number' || input.type === 'range') {
        val = Number(input.value);
      } else {
        val = input.value;
      }

      try {
        await window.notch.saveSetting(key, val);
      } catch (err) {
        console.warn(`[casa-clawd] Error guardando ${key}:`, err);
      }
    });

    // Actualización visual en vivo para sliders
    if (input.type === 'range') {
      input.addEventListener('input', () => {
        if (key === 'scale') {
          const valScale = document.getElementById('val-scale');
          if (valScale) valScale.textContent = `${input.value}%`;
        } else if (key === 'topGap') {
          const valTopGap = document.getElementById('val-topGap');
          if (valTopGap) valTopGap.textContent = `${input.value} px`;
        } else if (key === 'lyricsOffset') {
          const valOffset = document.getElementById('val-lyricsOffset');
          const num = Number(input.value);
          if (valOffset) valOffset.textContent = `${num > 0 ? '+' : ''}${num.toFixed(1)} s`;
        }
      });
    }
  });

  // Ciudades de reloj mundial
  const worldClockInput = document.getElementById('setting-worldClockCities');
  if (worldClockInput) {
    worldClockInput.addEventListener('change', async () => {
      const cities = worldClockInput.value
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await window.notch.saveSetting('worldClockCities', cities);
    });
  }

  // Restablecer desfase de letras a 0 s
  const btnResetOffset = document.getElementById('btn-reset-offset');
  if (btnResetOffset) {
    btnResetOffset.addEventListener('click', async () => {
      const slider = document.getElementById('setting-lyricsOffset');
      const valOffset = document.getElementById('val-lyricsOffset');
      if (slider) slider.value = '0.0';
      if (valOffset) valOffset.textContent = '0.0 s';
      await window.notch.saveSetting('lyricsOffset', 0);
    });
  }

  // Borrar caché de letras
  const btnClearLyrics = document.getElementById('btn-clear-lyrics-cache');
  const cacheFeedback = document.getElementById('lyrics-cache-feedback');
  if (btnClearLyrics) {
    btnClearLyrics.addEventListener('click', async () => {
      btnClearLyrics.disabled = true;
      try {
        await window.notch.lyrics.clearCache();
        if (cacheFeedback) {
          cacheFeedback.textContent = '✓ Caché borrada';
          cacheFeedback.hidden = false;
          setTimeout(() => {
            cacheFeedback.hidden = true;
          }, 3000);
        }
      } catch (err) {
        if (cacheFeedback) {
          cacheFeedback.textContent = 'Error al borrar caché';
          cacheFeedback.hidden = false;
        }
      } finally {
        btnClearLyrics.disabled = false;
      }
    });
  }

  // Abrir carpeta %APPDATA%\Notch
  const btnOpenAppData = document.getElementById('btn-open-appdata');
  if (btnOpenAppData) {
    btnOpenAppData.addEventListener('click', () => {
      window.notch.openDataFolder();
    });
  }

  // Estado del servidor Claude Code / IA
  async function updateAiServerStatus() {
    const dot = document.getElementById('server-status-dot');
    const label = document.getElementById('server-status-label');
    if (!dot || !label) return;
    try {
      const aiState = await window.notch.ai?.getState?.();
      const listening = aiState?.server?.listening === true;
      const port = aiState?.server?.port || settings.aiPort || 47823;
      if (listening) {
        dot.style.background = '#22c55e';
        dot.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.5)';
        label.textContent = `Servidor activo en http://127.0.0.1:${port}`;
      } else {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.5)';
        label.textContent = `Servidor inactivo o detenido (puerto ${port})`;
      }
    } catch {
      dot.style.background = '#ef4444';
      label.textContent = 'Servidor inactivo';
    }
  }
  updateAiServerStatus();

  // Botón para copiar bloque de configuración de Claude Code
  const btnCopyClaude = document.getElementById('btn-copy-claude-setup');
  const claudeFeedback = document.getElementById('claude-copy-feedback');
  if (btnCopyClaude) {
    btnCopyClaude.addEventListener('click', async () => {
      try {
        if (window.notch?.ai?.copySetup) {
          await window.notch.ai.copySetup('claude');
        } else {
          const preview = document.getElementById('claude-config-preview');
          if (preview) await navigator.clipboard.writeText(preview.textContent);
        }
        if (claudeFeedback) {
          claudeFeedback.hidden = false;
          setTimeout(() => {
            claudeFeedback.hidden = true;
          }, 3000);
        }
      } catch (err) {
        console.warn('[casa-clawd] Error copiando configuración:', err);
      }
    });
  }

  // Escuchar cambios de settings provenientes de main
  window.notch.onSettingsChange?.((newSettings) => {
    applySettingsToUI(newSettings);
    updateAiServerStatus();
  });
});
