// =============================================================================
//  renderer/widgets/water.js — Widget Agua: vaso interactivo y botón +250 ml
// -----------------------------------------------------------------------------
//  Muestra el nivel de líquido en un vaso con animación de llenado suave,
//  el consumo actual frente a la meta diaria («750 / 2000 ml») y un botón
//  táctil interactivo para registrar un vaso rápido (+250 ml).
// =============================================================================

import { $, setText, animate, SPRING_POP } from '../modules/utils.js';

const amountEl = $('home-water-amount');
const percentEl = $('home-water-percent');
const fillEl = $('home-water-fill');
const btnEl = $('home-water-btn');

let waterData = { currentMl: 0, targetMl: 2000 };

async function loadWater() {
  if (window.notch?.water?.get) {
    try {
      const res = await window.notch.water.get();
      if (res) waterData = res;
    } catch {
      // Ignorar errores
    }
  }
}

function render() {
  if (!amountEl) return;
  const current = waterData.currentMl || 0;
  const target = waterData.targetMl || 2000;
  const ratio = Math.min(1, Math.max(0, current / target));
  const percent = Math.round(ratio * 100);

  setText(amountEl, `${current} / ${target} ml`);
  setText(percentEl, `${percent}% de tu meta`);

  if (fillEl) {
    fillEl.style.height = `${percent}%`;
  }
}

export const waterWidget = {
  type: 'water',
  name: 'Agua',
  description: 'Vaso interactivo: suma +250 ml al pulsar',
  icon: 'i-w-water',
  accent: '#06B6D4',
  sizes: ['1x1', '2x1'],
  goto: null,
  init() {
    loadWater().then(() => render());

    if (btnEl) {
      btnEl.addEventListener('click', (event) => {
        event.stopPropagation(); // Evita que se abra alguna página o se active edición
        animate(btnEl, [{ scale: '1' }, { scale: '0.84' }, { scale: '1.12' }, { scale: '1' }], {
          duration: 380,
          easing: SPRING_POP,
        });
        if (window.notch?.water?.drink) {
          window.notch.water.drink(250).then((res) => {
            if (res) {
              waterData = res;
              render();
            }
          });
        }
      });
    }

    if (window.notch?.water?.onChange) {
      window.notch.water.onChange((data) => {
        if (data) waterData = data;
        render();
      });
    }
  },
  render: () => render(),
  news: () => [],
};
