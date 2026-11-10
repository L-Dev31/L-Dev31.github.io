import { lowPower, reducedMotion, COMPACT } from '../core/config.js';

// The only parallax on the site. An element of the contact section opts in with data-contact-parallax-speed
// (100 follows the page, below 100 trails it, above 100 runs ahead of it), and data-contact-parallax-compact
// for phones and portrait screens. It returns a function that stops it and puts the elements back.
export function initContactParallax() {
    const items = [...document.querySelectorAll('#contact [data-contact-parallax-speed]')];
    if (!items.length || lowPower || reducedMotion) return () => {};

    const compact = matchMedia(COMPACT);
    let frame = 0;

    const update = () => {
        frame = 0;
        const viewportCenter = scrollY + innerHeight / 2;
        for (const item of items) {
            const box = item.getBoundingClientRect();
            const speed = Number((compact.matches && item.dataset.contactParallaxCompact) || item.dataset.contactParallaxSpeed);
            const distance = box.top + scrollY + box.height / 2 - viewportCenter;
            item.style.translate = `0 ${(distance * (speed / 100 - 1)).toFixed(1)}px`;
        }
    };

    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update);
    };

    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    compact.addEventListener('change', schedule);
    schedule();

    return () => {
        if (frame) cancelAnimationFrame(frame);
        removeEventListener('scroll', schedule);
        removeEventListener('resize', schedule);
        compact.removeEventListener('change', schedule);
        items.forEach(item => item.style.removeProperty('translate'));
    };
}
