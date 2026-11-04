// Shared by every page: page loader, smooth scroll, menu, cursor, back-to-top, reveal on scroll.

// Single source of truth for device/breakpoint detection
const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp01 = value => Math.max(0, Math.min(1, value));

// Breakpoint manager - single source of truth for all modules
export const breakpoint = (() => {
    const BREAKPOINT_MOBILE = 768;
    const BREAKPOINT_TABLET = 1024;
    const mobileMQ = matchMedia(`(max-width: ${BREAKPOINT_MOBILE}px)`);
    const tabletMQ = matchMedia(`(max-width: ${BREAKPOINT_TABLET}px)`);
    
    // Fallback: also check innerWidth for cases where matchMedia doesn't update (devtools device toolbar)
    const getFromWidth = () => innerWidth <= BREAKPOINT_MOBILE ? 'mobile' : innerWidth <= BREAKPOINT_TABLET ? 'tablet' : 'desktop';
    let current = mobileMQ.matches ? 'mobile' : tabletMQ.matches ? 'tablet' : 'desktop';
    // Ensure initial value matches innerWidth as fallback
    if (current !== getFromWidth()) current = getFromWidth();
    
    const subscribers = new Set();

    const check = () => {
        // Use both matchMedia and innerWidth for reliability
        const mqResult = mobileMQ.matches ? 'mobile' : tabletMQ.matches ? 'tablet' : 'desktop';
        const widthResult = getFromWidth();
        const next = mqResult === widthResult ? mqResult : widthResult; // prefer width if mismatch
        if (next !== current) {
            current = next;
            subscribers.forEach(fn => fn(current));
        }
    };
    mobileMQ.addEventListener('change', check);
    tabletMQ.addEventListener('change', check);
    // Also listen to resize as ultimate fallback
    addEventListener('resize', check, { passive: true });

    return {
        get current() { return current; },
        get isMobile() { return current === 'mobile'; },
        get isTablet() { return current === 'tablet'; },
        get isDesktop() { return current === 'desktop'; },
        onChange: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
        BREAKPOINT_MOBILE,
        BREAKPOINT_TABLET
    };
})();

// Backwards compat - use breakpoint.isMobile instead
export const isMobile = breakpoint.isMobile;

// Visible case studies, newest first. Parked projects live in disabled-projects.json (not loaded).
export const loadProjects = () => fetch('assets/data/projects.json')
    .then(res => res.json())
    .then(data => data.projects
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));

// Wraps fn so it runs at most once per animation frame.
export function throttled(fn) {
    let queued = false;
    return () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            fn();
        });
    };
}

// Adds .visible to elements entering the viewport, and removes it when they leave through the bottom.
export function reveal(elements) {
    if (reducedMotion) {
        elements.forEach(el => el.classList.add('visible'));
        return;
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
        else if (entry.boundingClientRect.top > 0) entry.target.classList.remove('visible');
    }), { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    elements.forEach(el => observer.observe(el));
}

export function initPage() {
    document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
    clock();
    navTone();
    pageLoader();
    const lenis = smoothScroll();
    mobileMenu(lenis);
    cursor();
    anchorLinks(lenis);
    backToTop(lenis);
    magneticLinks();
    pauseOffscreenVideos();
    return lenis;
}

// The navigation bar is accent red, except over the accent red sections where it turns black.
function navTone() {
    const bar = document.querySelector('.navbar');
    const reds = [...document.querySelectorAll('#featured-projects')];
    const aboutHero = document.querySelector('.about-header');
    const projects = document.getElementById('featured-projects');
    if (!bar) return;
    const update = () => {
        const y = bar.offsetHeight / 2;
        // Over the dark hero the bar is coral rather than red.
        const overHero = aboutHero ? aboutHero.getBoundingClientRect().bottom > y : projects ? projects.getBoundingClientRect().top > y : false;
        bar.classList.toggle('on-dark', overHero);
        bar.classList.toggle('on-accent', reds.some(el => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

// The time in Monaco, to the minute, in the corner of the hero.
function clock() {
    const el = document.getElementById('hero-clock');
    if (!el) return;
    const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Monaco', hour: '2-digit', minute: '2-digit', hour12: false });
    const tick = () => { el.textContent = `Monaco ${format.format(new Date())}`; };
    tick();
    setInterval(tick, 15000);
}

function pageLoader() {
    const loader = document.querySelector('.page-loader');
    const bar = loader.firstElementChild;
    let finished = false;

    const finish = () => {
        if (finished) return;
        finished = true;
        bar.style.width = '100%';
        setTimeout(() => loader.classList.add('done'), 350);
    };

    requestAnimationFrame(() => bar.style.width = '85%');
    if (document.readyState === 'complete') return finish();
    addEventListener('load', finish, { once: true });
    setTimeout(finish, 2000);
}

function smoothScroll() {
    // Native scrolling is more reliable on touch screens and preserves browser
    // gestures such as pull-to-refresh and history navigation.
    if (isMobile || reducedMotion || !window.Lenis) return null;
    const lenis = new Lenis({ lerp: 0.06, wheelMultiplier: 0.85, touchMultiplier: 2 })   // a heavy glide: it keeps coasting after the wheel stops;
    const raf = time => {
        lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    return lenis;
}

function mobileMenu(lenis) {
    const button = document.querySelector('.hamburger');
    const menu = document.querySelector('.mobile-menu');
    if (!button || !menu) return;

    menu.id ||= 'mobile-menu';
    button.setAttribute('aria-controls', menu.id);
    menu.inert = true;

    const background = [...document.body.children]
        .filter(element => element !== menu && !element.classList.contains('navbar'));

    const toggle = (open, returnFocus = false) => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', !open);
        menu.inert = !open;
        button.setAttribute('aria-expanded', open);
        document.documentElement.classList.toggle('menu-open', open);
        background.forEach(element => { element.inert = open; });
        if (open) lenis?.stop();
        else lenis?.start();
        if (open) requestAnimationFrame(() => menu.querySelector('a')?.focus());
        else if (returnFocus) button.focus();
    };

    button.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => toggle(false)));
    menu.addEventListener('click', event => {
        if (event.target === menu) toggle(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.classList.contains('open')) {
            toggle(false, true);
            return;
        }
        if (event.key !== 'Tab' || !menu.classList.contains('open')) return;

        const links = [...menu.querySelectorAll('a[href]')];
        if (!links.length) return;
        const first = links[0];
        const last = links.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    // Close menu on breakpoint change to desktop
    breakpoint.onChange(bp => {
        if (bp === 'desktop' && menu.classList.contains('open')) {
            toggle(false, true);
        }
    });
}

// White dot that replaces the mouse pointer and shrinks over links and buttons.
function cursor() {
    const dot = document.querySelector('.cursor');
    if (isMobile || reducedMotion) return;

    let small = false;
    document.documentElement.classList.add('custom-cursor');
    document.addEventListener('mousemove', e => {
        dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)${small ? ' scale(0.5)' : ''}`;
    });
    document.addEventListener('mouseover', e => { if (e.target.closest('a, button')) small = true; });
    document.addEventListener('mouseout', e => { if (e.target.closest('a, button')) small = false; });
}

function anchorLinks(lenis) {
    document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', e => {
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { duration: 1.2, offset: -100 });
        else target.scrollIntoView({ behavior: 'smooth' });
    }));
}

function backToTop(lenis) {
    const button = document.querySelector('.back-to-top');
    const ring = button.querySelector('.btt-text');
    const footer = document.getElementById('footer');

    // Lay the label out in a circle: one rotated span per character.
    const chars = [...ring.textContent];
    ring.textContent = '';
    chars.forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.transform = `rotate(${i * 360 / chars.length}deg)`;
        ring.append(span);
    });

    // Shown once at least half of the footer is on screen
    const update = () => {
        const { top, height } = footer.getBoundingClientRect();
        button.classList.toggle('visible', innerHeight - top >= height / 2);
    };
    addEventListener('scroll', throttled(update), { passive: true });
    button.addEventListener('click', () => {
        if (lenis) lenis.scrollTo(0);
        else scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
}

// Nav and footer links lean towards the mouse.
function magneticLinks() {
    if (isMobile || reducedMotion) return;
    document.querySelectorAll('.footer-links a').forEach(link => {
        link.addEventListener('mousemove', e => {
            const r = link.getBoundingClientRect();
            const x = (e.clientX - r.left - r.width / 2) * 0.25;
            const y = (e.clientY - r.top - r.height / 2) * 0.25;
            link.style.transform = `translate(${x}px, ${y}px)`;
        });
        link.addEventListener('mouseleave', () => link.style.transform = '');
    });
}

function pauseOffscreenVideos() {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
    }), { threshold: 0.01 });
    document.querySelectorAll('video[autoplay]').forEach(video => observer.observe(video));
}
