// =============================================================================
//  renderer/modules/colors.js — Los colores de la carátula
// -----------------------------------------------------------------------------
//  Reducimos la carátula a 16x16 píxeles y buscamos sus 3 colores principales
//  con k-means: agrupa los píxeles parecidos y se queda con el color medio de
//  cada grupo. Con ellos se pintan los degradados de la página Música, la
//  tarjeta de Home y la isla; y el más vivo es el color de acento (barras,
//  progreso, ecualizador).
//  dominantColors y paletteFromColors no tocan la página: se pueden probar con Node.
// =============================================================================

const SAMPLE_SIZE = 16; // 16x16 = 256 píxeles: de sobra para sacar los colores
const ITERATIONS = 8;
const DEFAULT_ACCENT = '#3dff8f'; // el verde de siempre (carátulas en blanco y negro)

function distance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function nearest(point, centers) {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const d = distance(point, center);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

/**
 * Centros iniciales SIN azar (la misma carátula da siempre los mismos colores):
 * el color medio y, después, el píxel más distinto de los ya elegidos.
 */
function initialCenters(points, k) {
  const mean = [0, 0, 0];
  points.forEach((p) => {
    mean[0] += p[0];
    mean[1] += p[1];
    mean[2] += p[2];
  });
  const centers = [mean.map((value) => value / points.length)];
  while (centers.length < k) {
    let farthest = points[0];
    let farthestDistance = -1;
    for (const point of points) {
      const d = Math.min(...centers.map((center) => distance(point, center)));
      if (d > farthestDistance) {
        farthestDistance = d;
        farthest = point;
      }
    }
    centers.push([...farthest]);
  }
  return centers;
}

/**
 * Los k colores principales de unos píxeles RGBA (como los de un canvas):
 * [{ r, g, b, weight }], del más abundante al menos (weight de 0 a 1).
 */
export function dominantColors(pixels, k = 3) {
  const points = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // los píxeles transparentes no cuentan
    points.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (points.length === 0) return [];

  const centers = initialCenters(points, Math.min(k, points.length));
  const groups = new Array(points.length).fill(0);
  for (let round = 0; round < ITERATIONS; round++) {
    // 1. Cada píxel va al grupo del centro más parecido...
    points.forEach((point, i) => {
      groups[i] = nearest(point, centers);
    });
    // 2. ...y cada centro pasa a ser el color medio de su grupo.
    const sums = centers.map(() => [0, 0, 0, 0]);
    points.forEach((point, i) => {
      const sum = sums[groups[i]];
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2];
      sum[3] += 1;
    });
    sums.forEach((sum, index) => {
      if (sum[3] > 0) centers[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }

  const counts = centers.map(() => 0);
  groups.forEach((group) => {
    counts[group] += 1;
  });
  return centers
    .map((center, index) => ({
      r: Math.round(center[0]),
      g: Math.round(center[1]),
      b: Math.round(center[2]),
      weight: counts[index] / points.length,
    }))
    .filter((color) => color.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** RGB (0-255) → HSL: h de 0 a 360, s y l de 0 a 1. */
export function toHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: Math.round(h * 60 + 360) % 360, s: Math.min(1, s), l };
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Un color de la carátula, ajustado para pintar un fondo que se vea bien. */
function backgroundColor({ h, s, l }) {
  if (s < 0.12) return hsl(h, s, clamp(l, 0.2, 0.42)); // grises: siguen siendo grises
  return hsl(h, clamp(s * 1.1 + 0.08, 0.35, 0.85), clamp(l, 0.32, 0.55));
}

/**
 * Colores principales → lo que usa el CSS:
 *   { accent: color vivo para barras y textos, art: [3 colores de fondo] }
 */
export function paletteFromColors(colors) {
  if (!colors.length) return null;
  const tones = colors.map((color) => ({ ...toHsl(color), weight: color.weight }));

  // Acento: el color más vivo (saturado y ni casi negro ni casi blanco), si
  // ocupa algo de la carátula. Si todo es gris, el verde de siempre.
  const vivid = tones
    .map((tone) => ({ tone, score: tone.s * (1 - Math.abs(tone.l - 0.5) * 1.4) * (0.4 + tone.weight) }))
    .sort((a, b) => b.score - a.score)[0].tone;
  const accent = vivid.s < 0.18 || vivid.l < 0.06 || vivid.l > 0.96 ? DEFAULT_ACCENT : hsl(vivid.h, 0.85, 0.66);

  // Fondos: los 3 colores. Si la carátula tiene menos, variamos el primero.
  const base = tones[0];
  const fallback = (shift) => ({ ...base, h: (base.h + shift + 360) % 360, l: clamp(base.l + shift / 400, 0, 1) });
  const art = [tones[0], tones[1] || fallback(28), tones[2] || fallback(-28)].map(backgroundColor);
  return { accent, art };
}

/** La paleta de una carátula ya cargada (<img>), o null si no se puede leer. */
export function readPalette(image) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return paletteFromColors(dominantColors(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
}
