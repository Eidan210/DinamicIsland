// =============================================================================
//  renderer/modules/home-grid.js — Dónde va cada widget en la rejilla de Home
// -----------------------------------------------------------------------------
//  La rejilla tiene 4 columnas y 2 filas. Un widget "1x1" ocupa 1 celda y uno
//  "2x1", 2 celdas seguidas de la misma fila. Los widgets van en orden y cada
//  uno se coloca en el primer hueco donde cabe (de izquierda a derecha y de
//  arriba abajo): si uno de 2 celdas no cabe al final de una fila, baja a la
//  siguiente y el próximo de 1 celda rellena el hueco que dejó.
//
//  Son funciones puras (no tocan la página): se prueban con Node.
// =============================================================================

export const COLUMNS = 4;
export const ROWS = 2;
export const CELLS = COLUMNS * ROWS;

/** Celdas que ocupa un widget: "2x1" → 2, "1x1" → 1. */
export function widthOf(size) {
  return size === '2x1' ? 2 : 1;
}

/** Celdas que ocupan todos juntos. */
export function usedCells(widgets) {
  return widgets.reduce((sum, widget) => sum + widthOf(widget.size), 0);
}

/**
 * Coloca los widgets en la rejilla.
 * @param {{ type: string, size: string }[]} widgets  en orden
 * @returns {Map<string, { col: number, row: number, width: number }> | null}
 *   col y row empiezan en 1 (como grid-column y grid-row de CSS); null si no caben.
 */
export function placeWidgets(widgets) {
  const taken = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(false));
  const places = new Map();
  for (const widget of widgets) {
    const width = widthOf(widget.size);
    const spot = findSpot(taken, width);
    if (!spot) return null;
    for (let col = spot.col; col < spot.col + width; col++) taken[spot.row][col] = true;
    places.set(widget.type, { col: spot.col + 1, row: spot.row + 1, width });
  }
  return places;
}

/** El primer hueco con `width` celdas libres seguidas (fila a fila). */
function findSpot(taken, width) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col + width <= COLUMNS; col++) {
      if (taken[row].slice(col, col + width).every((busy) => !busy)) return { row, col };
    }
  }
  return null;
}

/** ¿Caben todos? */
export function fits(widgets) {
  return usedCells(widgets) <= CELLS && placeWidgets(widgets) !== null;
}

/** Las celdas que quedan libres: [{ col, row }] (los huecos con "+" del modo edición). */
export function freeCells(widgets) {
  const places = placeWidgets(widgets) || new Map();
  const free = [];
  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLUMNS; col++) {
      const busy = [...places.values()].some((place) => place.row === row && col >= place.col && col < place.col + place.width);
      if (!busy) free.push({ col, row });
    }
  }
  return free;
}

/**
 * Mientras arrastras un widget: en qué posición de la lista hay que ponerlo
 * para que empiece en la celda `cell` ({ col, row }). Si así no puede, vale
 * una posición en la que al menos la ocupe. Devuelve -1 si no hay ninguna.
 */
export function dropIndex(widgets, type, cell) {
  const dragged = widgets.find((widget) => widget.type === type);
  if (!dragged) return -1;
  const others = widgets.filter((widget) => widget !== dragged);
  let covering = -1;
  for (let index = 0; index <= others.length; index++) {
    const candidate = [...others.slice(0, index), dragged, ...others.slice(index)];
    const place = placeWidgets(candidate)?.get(type);
    if (!place || place.row !== cell.row) continue;
    if (place.col === cell.col) return index;
    if (covering < 0 && cell.col >= place.col && cell.col < place.col + place.width) covering = index;
  }
  return covering;
}
