import { reducedMotion, lowPower, clamp01, breakpoint, isMobile, throttled } from './env.js';
import { pageLoader } from './intro.js';
import { cursor, magnets, pageTransitions } from './cursor.js';
import { loadProjects } from './projects.js';

export { reducedMotion, lowPower, clamp01, breakpoint, throttled } from './env.js';
export { track, entrance, heroEntrance, introLoaded } from './intro.js';
export { loadProjects, projectMark } from './projects.js';

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
    magnets();
    pageTransitions();
    sectionNav(document.querySelector('.section-nav'), lenis);
    anchorLinks(lenis);
    backToTop(lenis);
    footerReveal();
    copyHandles();
    pauseOffscreenVideos();
    return lenis;
}

function navTone() {
    const bar = document.querySelector('.navbar');
    const reds = [...document.querySelectorAll('#my-story, #featured-projects, .footer-space, .accent-section')];
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

let tickClock = () => {};

function clock() {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    const zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' });
    const tick = () => {
        const now = new Date();
        const day = daylight(now);
        const t = time.format(now);
        const offset = zone.formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
        for (const el of document.querySelectorAll('[data-clock]')) {
            el.innerHTML = `${day ? SUN : MOON}<span class="clock-place">French Riviera, FR</span><span class="clock-time">${t}</span><span class="clock-zone">${offset}</span>`;
            el.setAttribute('aria-label', `French Riviera, ${t}, ${offset}, ${day ? 'daytime' : 'night'}`);
        }
    };
    tickClock = tick;
    tick();
    setInterval(tick, 15000);
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
    { id: 'home', label: 'Home', href: 'index.html', children: 'projects' },
    { id: 'about', label: 'About', href: 'about.html', children: [{ id: 'culture', label: 'Culture', href: 'culture.html' }] },
    { id: 'contact', label: 'Contact', href: 'mailto:leotoskuepro@gmail.com' },
];

let menuProjects = [];

const SOCIALS = [
    { label: 'Instagram', href: 'https://www.instagram.com/ltosku31/' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/l%C3%A9o-tosku-de-vries-8432242a0/' },
    { label: 'GitHub', href: 'https://github.com/L-Dev31' },
];

function renderMenuLinks(nav) {
    const params = new URLSearchParams(location.search);
    const file = location.pathname.split('/').pop() || 'index.html';
    const here = { 'about.html': 'about', 'culture.html': 'culture', 'culture-all.html': 'culture', 'project.html': `project:${params.get('id')}` }[file] ?? 'home';
    const parentOf = here === 'culture' ? 'about' : here.startsWith('project:') ? 'home' : here;

    const createLink = (className, page, isCurrent) => {
        const link = document.createElement('a');
        link.className = className;
        link.href = page.href;
        if (isCurrent) {
            link.setAttribute('aria-current', 'page');
            if (className === 'mobile-menu-link') {
                const arrow = document.createElement('span');
                arrow.className = 'menu-current';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '\u2192';
                link.append(arrow);
            }
        }
        link.append(page.label);
        return link;
    };

    nav.replaceChildren(...PAGES.map(page => {
        const group = document.createElement('div');
        group.className = 'mobile-menu-group';
        if (page.id === parentOf && here !== page.id) group.classList.add('is-active-branch');
        group.append(createLink('mobile-menu-link', page, page.id === here));

        let children = page.children === 'projects'
            ? menuProjects.map(project => ({ id: `project:${project.id}`, label: project.title, href: `project.html?id=${project.id}` }))
            : page.children;
        if (page.id === 'home' && here.startsWith('project:') && !children.some(child => child.id === here)) {
            const title = document.querySelector('.article-header h1')?.textContent.trim() || 'This project';
            children = [...children, { id: here, label: title, href: location.pathname + location.search }];
        }
        if (children?.length) {
            const sub = document.createElement('div');
            sub.className = 'mobile-menu-sub';
            sub.append(...children.map(child => createLink('mobile-menu-sublink', child, child.id === here)));
            group.append(sub);
        }
        return group;
    }));
    if (!nav.nextElementSibling?.classList.contains('hero-socials')) {
        const socials = document.createElement('nav');
        socials.className = 'hero-socials';
        socials.setAttribute('aria-label', 'Social links');
        const clock = document.createElement('p');
        clock.className = 'clock';
        clock.dataset.clock = '';
        socials.append(clock, ...SOCIALS.map(({ label, href }) => {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            return link;
        }));
        nav.after(socials);
        tickClock();
    }
}

function mobileMenu(lenis) {
    const button = document.querySelector('.hamburger');
    const menu = document.querySelector('.mobile-menu');
    if (!button || !menu) return;

    menu.id ||= 'mobile-menu';
    button.setAttribute('aria-controls', menu.id);
    menu.inert = true;
    button.setAttribute('aria-label', 'Open menu');
    const nav = menu.querySelector('.mobile-menu-links');
    renderMenuLinks(nav);
    loadProjects().then(list => { menuProjects = list.filter(project => project.featured); renderMenuLinks(nav); }, () => {});

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
        picture = pixelPicture(host, dark ? 'assets/images/core/menu.webp' : 'assets/images/core/menu-accent.webp', {
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
        button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
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

export function sectionNav(nav, lenis) {
    if (!nav) return;
    const links = [...nav.querySelectorAll('a')].filter(link => document.querySelector(link.hash));
    if (!links.length) return;
    const sections = links.map(link => document.querySelector(link.hash));

    const pill = document.createElement('span');
    pill.className = 'section-nav-pill';
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);

    links.forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        const target = document.querySelector(link.hash);
        if (lenis) lenis.scrollTo(target, { duration: 1.2, offset: -100 });
        else target.scrollIntoView({ behavior: 'smooth' });
    }));

    let placed = false;
    const place = () => {
        const link = nav.querySelector('a[aria-current]');
        if (!link) { pill.style.opacity = '0'; return; }
        pill.style.transition = placed ? '' : 'none';
        pill.style.opacity = '1';
        pill.style.width = `${link.offsetWidth}px`;
        pill.style.transform = `translateX(${link.offsetLeft}px)`;
        if (!placed) { pill.offsetWidth; pill.style.transition = ''; placed = true; }
        if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
    };
    nav.addEventListener('relayout', place);

    let queued = false;
    const update = () => {
        queued = false;
        const line = innerHeight / 2;
        const first = sections[0].getBoundingClientRect().top, last = sections.at(-1).getBoundingClientRect().bottom;
        nav.classList.toggle('is-on', first < innerHeight * 0.6 && last > innerHeight * 0.4);
        const index = sections.findLastIndex(section => section.getBoundingClientRect().top <= line);
        links.forEach((link, i) => { if (i === index) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
        place();
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

function anchorLinks(lenis) {
    document.querySelectorAll('a[href^="#"]:not(.section-nav a)').forEach(link => link.addEventListener('click', e => {
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { duration: 1.2, offset: -100 });
        else target.scrollIntoView({ behavior: 'smooth' });
    }));
}

function backToTop(lenis) {
    const button = document.querySelector('.back-to-top');
    if (!button) return;
    const ring = button.querySelector('.btt-text');

    const chars = [...ring.textContent];
    ring.textContent = '';
    chars.forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.transform = `rotate(${i * 360 / chars.length}deg)`;
        ring.append(span);
    });

    button.addEventListener('click', () => {
        if (lenis) lenis.scrollTo(0);
        else scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function copyHandles() {
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
        const label = button.textContent;
        try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; } catch { button.textContent = button.dataset.copy; }
        setTimeout(() => { button.textContent = label; }, 1600);
    }));
}

function footerReveal() {
    const footer = document.getElementById('footer');
    const space = document.querySelector('.footer-space');
    if (!footer || !space) return;
    const sign = footer.querySelector('.footer-sign');
    let signStarted = false;
    const showSign = async () => {
        signStarted = true;
        const { pixelPicture } = await import('./effects.js');
        const black = getComputedStyle(document.documentElement).getPropertyValue('--black').trim();
        pixelPicture(sign, sign.dataset.picture, { color: black, fit: 'contain', focus: 0.76, anchor: 1, watch: true, active: () => footer.classList.contains('is-near') });
    };
    const update = () => {
        const top = space.getBoundingClientRect().top;
        footer.classList.toggle('is-near', top < innerHeight + 2);
        footer.style.setProperty('--reveal', clamp01(1 - top / innerHeight).toFixed(3));
        if (sign && !signStarted && top < innerHeight * 2.5) showSign();
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

function pauseOffscreenVideos() {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
    }), { threshold: 0.01 });
    document.querySelectorAll('video[autoplay]').forEach(video => observer.observe(video));
}
