// Shared by every page: page loader, smooth scroll, menu, cursor, back-to-top, reveal on scroll.

export const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth <= 1024;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp01 = value => Math.max(0, Math.min(1, value));

// Case studies are the enabled projects, newest first.
export const loadProjects = () => fetch('assets/data/projects.json')
    .then(res => res.json())
    .then(data => data.projects
        .filter(p => !p.disabled)
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
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);

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
    if (reducedMotion || !window.Lenis) return null;
    const lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - 2 ** (-10 * t)), touchMultiplier: 2 });
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

    const toggle = open => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', !open);
        button.setAttribute('aria-expanded', open);
        if (open) lenis?.stop();
        else lenis?.start();
    };

    button.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => toggle(false)));
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

    const update = () => button.classList.toggle('visible', footer.getBoundingClientRect().top < innerHeight);
    addEventListener('scroll', update, { passive: true });
    button.addEventListener('click', () => {
        if (lenis) lenis.scrollTo(0);
        else scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
}

// Nav and footer links lean towards the mouse.
function magneticLinks() {
    if (isMobile || reducedMotion) return;
    document.querySelectorAll('.link, .footer-links a').forEach(link => {
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
