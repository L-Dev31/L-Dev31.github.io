import { reducedMotion } from './config.js';

// A new element with an optional class and text (set as text, never as markup).
export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// The value of a custom property set on the root, such as '--accent'.
export const cssVariable = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Scrolls the page to an element or an offset: through Lenis when it runs, natively otherwise.
export function scrollPage(lenis, target, options = {}) {
    if (lenis) return lenis.scrollTo(target, options);
    const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY + (options.offset ?? 0);
    scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
}
