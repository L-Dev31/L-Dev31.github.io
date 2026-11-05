const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lowPower = reducedMotion || navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2 || !!navigator.connection?.saveData;
export const clamp01 = value => Math.max(0, Math.min(1, value));

export const breakpoint = (() => {
    const BREAKPOINT_MOBILE = 768;
    const BREAKPOINT_TABLET = 1024;
    const mobileMQ = matchMedia(`(max-width: ${BREAKPOINT_MOBILE}px)`);
    const tabletMQ = matchMedia(`(max-width: ${BREAKPOINT_TABLET}px)`);

    const getFromWidth = () => innerWidth <= BREAKPOINT_MOBILE ? 'mobile' : innerWidth <= BREAKPOINT_TABLET ? 'tablet' : 'desktop';
    let current = mobileMQ.matches ? 'mobile' : tabletMQ.matches ? 'tablet' : 'desktop';

    if (current !== getFromWidth()) current = getFromWidth();

    const subscribers = new Set();

    const check = () => {

        const mqResult = mobileMQ.matches ? 'mobile' : tabletMQ.matches ? 'tablet' : 'desktop';
        const widthResult = getFromWidth();
        const next = mqResult === widthResult ? mqResult : widthResult;
        if (next !== current) {
            current = next;
            subscribers.forEach(fn => fn(current));
        }
    };
    mobileMQ.addEventListener('change', check);
    tabletMQ.addEventListener('change', check);

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

const isMobile = breakpoint.isMobile;

export const loadProjects = () => fetch('assets/data/projects.json')
    .then(res => res.json())
    .then(data => data.projects
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));

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
    pauseOffscreenVideos();
    return lenis;
}

function navTone() {
    const bar = document.querySelector('.navbar');
    const reds = [...document.querySelectorAll('#promise, #my-story, #featured-projects, #footer')];
    const aboutHero = document.querySelector('.about-header');
    const projects = document.getElementById('featured-projects');
    if (!bar) return;
    const update = () => {
        const y = bar.offsetHeight / 2;

        const overHero = aboutHero ? aboutHero.getBoundingClientRect().bottom > y : projects ? projects.getBoundingClientRect().top > y : false;
        bar.classList.toggle('on-dark', overHero);
        const onAccent = reds.some(el => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
        bar.classList.toggle('on-accent', onAccent);
        document.documentElement.classList.toggle('on-accent', onAccent);
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

const MONACO = { lat: 43.73, lon: 7.42 };
const pixelIcon = rows => `<svg class="clock-icon" viewBox="0 0 7 7" aria-hidden="true">${rows
    .flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')))
    .join('')}</svg>`;
const SUN = pixelIcon(['...#...', '.#...#.', '..###..', '#.###.#', '..###..', '.#...#.', '...#...']);
const MOON = pixelIcon(['..###..', '.###...', '###....', '###....', '###....', '.###...', '..###..']);

function daylight(date) {
    const rad = Math.PI / 180;
    const day = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10)) * rad;
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + MONACO.lon / 15;
    const hourAngle = (hours - 12) * 15 * rad, lat = MONACO.lat * rad;
    const elevation = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
    return elevation > Math.sin(-0.833 * rad);
}

function clock() {
    const clocks = document.querySelectorAll('[data-clock]');
    if (!clocks.length) return;
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Monaco', hour: '2-digit', minute: '2-digit', hour12: false });
    const zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Monaco', timeZoneName: 'shortOffset' });
    const tick = () => {
        const now = new Date();
        const day = daylight(now);
        const t = time.format(now);
        const offset = zone.formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
        for (const el of clocks) {
            el.innerHTML = `${day ? SUN : MOON}<span class="clock-place">Monaco, MC</span><span class="clock-time">${t}</span><span class="clock-zone">${offset}</span>`;
            el.setAttribute('aria-label', `Monaco, ${t}, ${offset}, ${day ? 'daytime' : 'night'}`);
        }
    };
    tick();
    setInterval(tick, 15000);
}

function pixelDissolve(loader) {
    if (reducedMotion) { loader.classList.add('done'); return; }
    import('./pixel.js').then(({ dissolve }) => {
        const color = getComputedStyle(loader).backgroundColor;
        loader.classList.add('dissolving');
        dissolve(loader, { color, fixed: true }, () => loader.classList.add('done'));
    });
}

function pageLoader() {
    const loader = document.querySelector('.page-loader');
    const bar = loader.firstElementChild;
    let finished = false;

    const finish = () => {
        if (finished) return;
        finished = true;
        bar.style.width = '100%';
        setTimeout(() => pixelDissolve(loader), 350);
    };

    requestAnimationFrame(() => bar.style.width = '85%');
    if (document.readyState === 'complete') return finish();
    addEventListener('load', finish, { once: true });
    setTimeout(finish, 2000);
}

function smoothScroll() {

    if (isMobile || lowPower || !window.Lenis) return null;
    const lenis = new Lenis({ lerp: 0.06, wheelMultiplier: 0.85, touchMultiplier: 2 })
    const raf = time => {
        lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    return lenis;
}

const PAGES = [
    { id: 'home', label: 'Home', href: 'index.html' },
    { id: 'about', label: 'About', href: 'about.html' },
    { id: 'contact', label: 'Contact', href: 'mailto:leotoskuepro@gmail.com' },
];

const SOCIALS = [
    { label: 'Instagram', href: 'https://www.instagram.com/l_dev31/' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/léo-tosku' },
    { label: 'GitHub', href: 'https://github.com/L-Dev31' },
];

function renderMenuLinks(nav) {
    const file = location.pathname.split('/').pop() || 'index.html';
    const here = file === 'about.html' ? 'about' : file === 'project.html' ? 'project' : 'home';
    const pages = [...PAGES];
    if (here === 'project') {
        const title = document.querySelector('.article-header h1, .project-hero h1')?.textContent.trim() || document.title.split(' — ')[0] || 'Project';
        pages.splice(1, 0, { id: 'project', label: title, href: location.pathname + location.search });
    }
    nav.replaceChildren(...pages.map(page => {
        const link = document.createElement('a');
        link.className = 'mobile-menu-link';
        link.href = page.href;
        if (page.id === here) {
            link.setAttribute('aria-current', 'page');
            const arrow = document.createElement('span');
            arrow.className = 'menu-current';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '\u2192';
            link.append(arrow);
        }
        link.append(page.label);
        return link;
    }));
    if (!nav.nextElementSibling?.classList.contains('mobile-menu-socials')) {
        const socials = document.createElement('div');
        socials.className = 'mobile-menu-socials';
        socials.append(...SOCIALS.map(({ label, href }) => {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            return link;
        }));
        nav.after(socials);
    }
}

function mobileMenu(lenis) {
    const button = document.querySelector('.hamburger');
    const menu = document.querySelector('.mobile-menu');
    if (!button || !menu) return;

    menu.id ||= 'mobile-menu';
    button.setAttribute('aria-controls', menu.id);
    menu.inert = true;
    const nav = menu.querySelector('.mobile-menu-links');
    renderMenuLinks(nav);

    const host = document.createElement('div');
    host.className = 'mobile-menu-picture';
    host.setAttribute('aria-hidden', 'true');
    menu.prepend(host);
    let picture = null;
    const showPicture = async () => {
        picture?.destroy();
        picture = null;
        if (getComputedStyle(host).display === 'none') return;
        const { pixelPicture } = await import('./effects.js');
        const root = getComputedStyle(document.documentElement);
        const dark = document.documentElement.classList.contains('on-accent');
        picture = pixelPicture(host, 'assets/images/core/menu.webp', {
            mirror: true,
            color: root.getPropertyValue(dark ? '--accent' : '--black').trim(),
            active: () => menu.classList.contains('open'),
        });
    };

    const background = [...document.body.children]
        .filter(element => element !== menu && !element.classList.contains('navbar'));

    const toggle = (open, returnFocus = false) => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', !open);
        menu.inert = !open;
        button.setAttribute('aria-expanded', open);
        document.documentElement.classList.toggle('menu-open', open);
        background.forEach(element => { element.inert = open; });
        if (open) { renderMenuLinks(nav); showPicture(); lenis?.stop(); }
        else lenis?.start();
        if (open) requestAnimationFrame(() => menu.querySelector('a')?.focus());
        else if (returnFocus) button.focus();
    };

    button.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.addEventListener('click', event => {
        if (event.target.closest('a')) toggle(false);
    });
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

    breakpoint.onChange(bp => {
        if (bp === 'desktop' && menu.classList.contains('open')) {
            toggle(false, true);
        }
    });
}

function cursor() {
    const dot = document.querySelector('.cursor');
    if (isMobile || lowPower) return;

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

    const chars = [...ring.textContent];
    ring.textContent = '';
    chars.forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.transform = `rotate(${i * 360 / chars.length}deg)`;
        ring.append(span);
    });

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

function pauseOffscreenVideos() {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
    }), { threshold: 0.01 });
    document.querySelectorAll('video[autoplay]').forEach(video => observer.observe(video));
}
