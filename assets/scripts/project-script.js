import { setupPageLoader, setupMobileMenu, setupCursor, setupBackToTop } from './ui.js';
import { setupLenis, setupMagneticLinks } from './animations.js';
import { setupProjectPage } from './project.js';

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    setupPageLoader();
    const lenis = setupLenis();
    setupMobileMenu(lenis);
    setupCursor();
    setupBackToTop(lenis);
    setupMagneticLinks();
    setupProjectPage(lenis);
});
