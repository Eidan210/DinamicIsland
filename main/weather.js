// =============================================================================
//  main/weather.js — Consulta de clima con Open-Meteo (opcional)
// -----------------------------------------------------------------------------
//  Solo se activa si el usuario pone "weather": true en settings.json.
//  No envía ningún dato personal ni clave de API, únicamente coordenadas.
//  Dispone de caché de 15 minutos, timeout de 10 s y 1 reintento.
// =============================================================================

'use strict';

const https = require('node:https');
const { loadSettings } = require('./config');

const CACHE_MS = 15 * 60 * 1000; // 15 minutos
const TIMEOUT_MS = 10000; // 10 segundos

let cachedWeather = null;
let lastFetchTime = 0;

// Códigos WMO de Open-Meteo traducidos al español y asociados a icono local
const WEATHER_CODES = {
  0: { label: 'Despejado', icon: 'sun' },
  1: { label: 'Cielo despejado', icon: 'sun' },
  2: { label: 'Parcialmente nublado', icon: 'cloud-sun' },
  3: { label: 'Nublado', icon: 'cloud' },
  45: { label: 'Niebla', icon: 'cloud' },
  48: { label: 'Niebla con escarcha', icon: 'cloud' },
  51: { label: 'Llovizna ligera', icon: 'rain' },
  53: { label: 'Llovizna moderada', icon: 'rain' },
  55: { label: 'Llovizna densa', icon: 'rain' },
  56: { label: 'Llovizna helada', icon: 'rain' },
  57: { label: 'Llovizna helada densa', icon: 'rain' },
  61: { label: 'Lluvia leve', icon: 'rain' },
  63: { label: 'Lluvia moderada', icon: 'rain' },
  65: { label: 'Lluvia intensa', icon: 'rain' },
  66: { label: 'Lluvia helada leve', icon: 'rain' },
  67: { label: 'Lluvia helada fuerte', icon: 'rain' },
  71: { label: 'Nieve leve', icon: 'snow' },
  73: { label: 'Nieve moderada', icon: 'snow' },
  75: { label: 'Nieve intensa', icon: 'snow' },
  77: { label: 'Granizo', icon: 'snow' },
  80: { label: 'Chubascos leves', icon: 'rain' },
  81: { label: 'Chubascos moderados', icon: 'rain' },
  82: { label: 'Chubascos violentos', icon: 'rain' },
  85: { label: 'Chubascos de nieve', icon: 'snow' },
  86: { label: 'Nevadas fuertes', icon: 'snow' },
  95: { label: 'Tormenta eléctrica', icon: 'thunder' },
  96: { label: 'Tormenta con granizo leve', icon: 'thunder' },
  99: { label: 'Tormenta con granizo fuerte', icon: 'thunder' },
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || { label: 'Parcialmente nublado', icon: 'cloud-sun' };
}

function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Notch-DynamicIsland/0.15' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Timeout de conexión'));
    });

    req.on('error', reject);
  });
}

async function fetchWithRetry(url, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchJson(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Obtiene el clima actual y del día.
 * Devuelve { enabled: false } si está desactivado en ajustes.
 */
async function getWeather() {
  const settings = loadSettings();
  if (!settings.weather) {
    return { enabled: false };
  }

  const now = Date.now();
  if (cachedWeather && now - lastFetchTime < CACHE_MS) {
    return { enabled: true, ...cachedWeather, cached: true };
  }

  const lat = settings.weatherLat ?? 7.1193;
  const lon = settings.weatherLon ?? -73.1227;
  const city = settings.weatherCity || 'Bucaramanga';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

  try {
    const data = await fetchWithRetry(url, 1);
    const temp = Math.round(data?.current?.temperature_2m ?? 0);
    const code = Number(data?.current?.weather_code ?? 0);
    const min = Math.round(data?.daily?.temperature_2m_min?.[0] ?? temp);
    const max = Math.round(data?.daily?.temperature_2m_max?.[0] ?? temp);
    const { label, icon } = describeWeatherCode(code);

    cachedWeather = {
      city,
      temp,
      min,
      max,
      code,
      label,
      icon,
      updatedAt: now,
    };
    lastFetchTime = now;
    return { enabled: true, ...cachedWeather, cached: false };
  } catch (error) {
    if (cachedWeather) {
      return {
        enabled: true,
        ...cachedWeather,
        offline: true,
        error: error.message,
      };
    }
    return {
      enabled: true,
      error: error.message,
      city,
      temp: '--',
      min: '--',
      max: '--',
      label: 'Sin conexión',
      icon: 'cloud',
      updatedAt: 0,
    };
  }
}

module.exports = {
  getWeather,
  describeWeatherCode,
  WEATHER_CODES,
};
