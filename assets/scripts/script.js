import { setupPageLoader, setupMobileMenu, setupCursor, setupCTACursor, setupSmoothAnchors, setupBackToTop } from './ui.js';
import { setupLenis, setupMagneticLinks, setupScrubbingText, setupHeader, setupTextReveal, setupScrollEffects, setupLiquifyAll } from './animations.js';
import { setupWebProjects, setupFeaturedProjects, setupHeightScroll } from './projects.js';
import { setupAboutHeroVideo, setupVideoVisibility } from './video.js';

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    // Initializations
    setupPageLoader();
    const lenis = setupLenis();
    setupMobileMenu(lenis);
    setupCursor();
    const ctaCursor = setupCTACursor();
    setupHeader();
    setupScrubbingText();
    
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) e.target.classList.add('visible');
            else if (e.boundingClientRect.top > 0) e.target.classList.remove('visible');
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    setupTextReveal(observer);

    setupWebProjects();
    setupHeightScroll('.featured-list', '.featured-project');

    const refreshParallax = setupScrollEffects();
    setupFeaturedProjects(ctaCursor, refreshParallax);
    
    setupLiquifyAll();
    setupSmoothAnchors(lenis);
    setupAboutHeroVideo(refreshParallax);
    setupVideoVisibility();
    setupBackToTop(lenis);
    setupMagneticLinks();
});
