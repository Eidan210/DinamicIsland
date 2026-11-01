// =============================================================================
//  renderer/modules/links.js — Los links (pestaña Focus y widget de Home)
// -----------------------------------------------------------------------------
//  main.js nos manda nombre, inicial, color y logo de cada link (no las urls):
//  para abrir uno le decimos su número y main.js lo abre en tu navegador.
//  El logo (de Simple Icons) es un dibujo SVG de un solo color: va en blanco o
//  en negro sobre el círculo de su color. Sin logo, la inicial como siempre.
//  El widget de Home está en renderer/widgets/links.js.
// =============================================================================

import { $, animate } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const linksGrid = $('links-grid');
const linksEmpty = $('links-empty');

let links = [];
const changeListeners = [];

/** Los links que hay ahora. */
export function getLinks() {
  return links;
}

/** Avisa a `listener()` cada vez que cambian los links (al guardar links.json). */
export function onLinksChange(listener) {
  changeListeners.push(listener);
}

/** Guarda la lista nueva y la dibuja. */
export function setLinks(newLinks) {
  links = Array.isArray(newLinks) ? newLinks : [];
  renderLinks();
  changeListeners.forEach((listener) => listener());
}

/** Pestaña Focus: todos los links. */
function renderLinks() {
  linksGrid.replaceChildren(...links.map((link, index) => createLinkButton(link, index)));
  linksEmpty.hidden = links.length > 0;
}

/** Botón redondo grande con el logo (o la inicial) y el nombre debajo (pestaña Focus). */
function createLinkButton(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-btn';
  button.title = `${link.name} · ${link.host}`;
  paintLink(button, link, index);

  const circle = document.createElement('span');
  circle.className = 'link-circle';
  fillLinkCircle(circle, link);
  const name = document.createElement('span');
  name.className = 'link-name';
  name.textContent = link.name;
  button.append(circle, name);

  button.addEventListener('click', () => openLink(index, circle));
  return button;
}

/**
 * Pone dentro de `element` el logo del link (un <svg> con su dibujo) o, si
 * no tiene, su inicial. Siempre con createElementNS/textContent: nunca
 * innerHTML, así nada de links.json puede ejecutar código.
 */
export function fillLinkCircle(element, link) {
  if (link.logo?.path) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('link-logo');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', link.logo.path);
    svg.append(path);
    element.replaceChildren(svg);
    element.dataset.logo = 'true';
  } else {
    element.textContent = link.initial; // textContent (no innerHTML): nunca ejecuta nada
    element.dataset.logo = 'false';
  }
}

/** Color, color del dibujo y posición (para la entrada en cascada) como variables CSS. */
export function paintLink(element, link, index) {
  element.style.setProperty('--link-color', link.color);
  element.style.setProperty('--link-text', link.textColor);
  element.style.setProperty('--i', String(index));
}

/** Abre el link número `index` con un pequeño rebote de `circle`. */
export function openLink(index, circle) {
  animate(circle, [{ scale: '1' }, { scale: '0.85' }, { scale: '1.15' }, { scale: '1' }], {
    duration: 420,
    easing: 'ease-out',
  });
  window.notch.links.open(index);
}

export function initLinks() {
  // Al guardar config/links.json, main.js nos manda la lista nueva.
  window.notch.links.onChange(setLinks);
}
