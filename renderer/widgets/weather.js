// =============================================================================
//  renderer/widgets/weather.js — Widget Clima con Open-Meteo (opcional)
// -----------------------------------------------------------------------------
//  Muestra la temperatura actual, el estado del cielo y la ciudad.
//  Si "weather": false en ajustes, muestra un estado informativo desactivado
//  sin realizar ninguna conexión a internet.
// =============================================================================

import { $, setText } from '../modules/utils.js';
import { state } from '../modules/state.js';

const tempEl = $('home-weather-temp');
const cityEl = $('home-weather-city');
const descEl = $('home-weather-desc');

let cachedData = null;
let lastUpdate = 0;
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 min

async function fetchWeather(force = false) {
  if (!state.settings?.weather) {
    cachedData = null;
    render();
    return;
  }

  const now = Date.now();
  if (!force && cachedData && now - lastUpdate < REFRESH_INTERVAL) {
    render();
    return;
  }

  if (window.notch?.weather?.get) {
    try {
      const res = await window.notch.weather.get();
      if (res) {
        cachedData = res;
        lastUpdate = now;
      }
    } catch {
      // Ignorar errores de red
    }
  }
  render();
}

function render() {
  if (!tempEl) return;
  const isEnabled = state.settings?.weather;

  if (!isEnabled) {
    setText(tempEl, '--°');
    setText(cityEl, 'Clima');
    setText(descEl, 'Desactivado en ajustes');
    return;
  }

  if (!cachedData) {
    setText(tempEl, '--°');
    setText(cityEl, state.settings?.weatherCity || 'Bucaramanga');
    setText(descEl, 'Cargando clima…');
    return;
  }

  if (cachedData.error && cachedData.temp === '--') {
    setText(tempEl, '--°');
    setText(cityEl, cachedData.city || 'Bucaramanga');
    setText(descEl, 'Sin conexión');
    return;
  }

  setText(tempEl, `${cachedData.temp}°`);
  setText(cityEl, cachedData.city || 'Bucaramanga');
  setText(descEl, cachedData.label || 'Despejado');
}

export const weatherWidget = {
  type: 'weather',
  name: 'Clima',
  description: 'Temperatura y pronóstico con Open-Meteo',
  icon: 'i-w-weather',
  accent: '#F59E0B',
  sizes: ['1x1', '2x1'],
  goto: null,
  init(context) {
    // Solo consultar cuando Home es visible
    if (context?.isVisible?.()) {
      fetchWeather();
    }
  },
  render(context) {
    if (context?.isVisible?.() && Date.now() - lastUpdate > REFRESH_INTERVAL) {
      fetchWeather();
    } else {
      render();
    }
  },
  news: () => [],
};
