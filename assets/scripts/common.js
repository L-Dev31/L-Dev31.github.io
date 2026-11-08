import { lowPower, clamp01, breakpoint, isMobile, throttled } from './config.js';
import { pageLoader } from './intro.js';
import { cursor, magnets, pageTransitions } from './cursor.js';
import { loadProjects } from './projects.js';
import { contactScene, contactLanding } from './contact.js';
import { socialLinks } from './components.js';
import { t, lang, setLanguage } from './i18n.js';

export { reducedMotion, lowPower, clamp01, breakpoint, throttled } from './config.js';
export { track, entrance, heroEntrance, introLoaded } from './intro.js';
export { loadProjects, projectMark } from './projects.js';

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
    contactScene();
    contactPictures();
    import('./effects.js').then(({ parallax }) => parallax());
    copyHandles();
    pauseOffscreenVideos();
    return lenis;
}

function navTone() {
    const bar = document.querySelector('.navbar');
    const reds = [...document.querySelectorAll('#my-story, #featured-projects, #promise, #experience, .contact-rest, .accent-section, .culture-section--light')];
    const stage = document.querySelector('.contact-stage');
    const showcase = document.querySelector('.showcase-stage');
    const aboutHero = document.querySelector('.about-header');
    const projects = document.getElementById('featured-projects');
    if (!bar) return;
    const update = () => {
        const y = bar.offsetHeight / 2;

        const overHero = aboutHero ? aboutHero.getBoundingClientRect().bottom > y : projects ? projects.getBoundingClientRect().top > y : false;
        bar.classList.toggle('on-dark', overHero);
        const covers = el => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; };
        const darkProject = showcase?.dataset.tone === 'dark' && covers(showcase);
        const onAccent = !darkProject && (reds.some(covers) || (stage?.dataset.tone === 'light' && covers(stage)));
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
        const clockTime = time.format(now);
        const offset = zone.formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
        for (const el of document.querySelectorAll('[data-clock]')) {
            el.innerHTML = `${day ? SUN : MOON}<span class="clock-place">${t('French Riviera, FR')}</span><span class="clock-time">${clockTime}</span><span class="clock-zone">${offset}</span>`;
            el.setAttribute('aria-label', `${t('French Riviera')}, ${clockTime}, ${offset}, ${day ? t('daytime') : t('night')}`);
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
];

const CURRENT_PAGE = {
    'about.html': 'about',
    'culture.html': 'culture',
    'culture-all.html': 'culture',
    'project.html': `project:${new URLSearchParams(location.search).get('id')}`,
}[location.pathname.split('/').pop()] ?? 'home';

const PARENT_OF_CURRENT = CURRENT_PAGE === 'culture' ? 'about' : CURRENT_PAGE.startsWith('project:') ? 'home' : CURRENT_PAGE;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function menuLink(className, { label, href }, isCurrent) {
    const link = element('a', className);
    link.href = href;
    if (isCurrent) {
        link.setAttribute('aria-current', 'page');
        if (className === 'mobile-menu-link') {
            const arrow = element('span', 'menu-current', '\u2192');
            arrow.setAttribute('aria-hidden', 'true');
            link.append(arrow);
        }
    }
    link.append(t(label));
    return link;
}

function menuGroup(page, projects) {
    const group = element('div', 'mobile-menu-group');
    group.append(menuLink('mobile-menu-link', page, page.id === CURRENT_PAGE));
    if (page.id === PARENT_OF_CURRENT && page.id !== CURRENT_PAGE) group.classList.add('is-active-branch');

    let children = page.children === 'projects'
        ? projects.map(project => ({ id: `project:${project.id}`, label: project.title, href: `project.html?id=${project.id}` }))
        : page.children;
    if (page.id === 'home' && CURRENT_PAGE.startsWith('project:') && !children.some(child => child.id === CURRENT_PAGE)) {
        const label = document.querySelector('.article-header h1')?.textContent.trim() || 'This project';
        children = [...children, { id: CURRENT_PAGE, label, href: location.pathname + location.search }];
    }
    if (children.length) {
        const list = element('div', 'mobile-menu-sub');
        list.append(...children.map(child => menuLink('mobile-menu-sublink', child, child.id === CURRENT_PAGE)));
        group.append(list);
    }
    return group;
}

function renderMenu(nav, projects) {
    nav.replaceChildren(...PAGES.map(page => menuGroup(page, projects)));
    if (nav.nextElementSibling?.classList.contains('hero-socials')) return;
    const socials = element('nav', 'hero-socials');
    socials.setAttribute('aria-label', t('Social links'));
    const clock = element('p', 'clock');
    clock.dataset.clock = '';
    socials.append(clock, socialLinks());
    nav.after(socials);
    tickClock();
}

function mobileMenu(lenis) {
    const button = document.querySelector('.hamburger');
    const menu = document.querySelector('.mobile-menu');
    if (!button || !menu) return;

    menu.id ||= 'mobile-menu';
    menu.inert = true;
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-label', t('Open menu'));

    const nav = menu.querySelector('.mobile-menu-links');
    renderMenu(nav, []);
    loadProjects().then(projects => renderMenu(nav, projects), () => {});

    const picture = element('div', 'mobile-menu-picture');
    picture.setAttribute('aria-hidden', 'true');
    menu.prepend(picture);
    let pixels = null;
    const showPicture = async () => {
        pixels?.destroy();
        pixels = null;
        if (getComputedStyle(picture).display === 'none') return;
        const { pixelPicture } = await import('./effects.js');
        const root = getComputedStyle(document.documentElement);
        const dark = document.documentElement.classList.contains('on-accent');
        pixels = pixelPicture(picture, dark ? 'assets/images/core/menu.webp' : 'assets/images/core/menu-accent.webp', {
            mirror: true,
            color: root.getPropertyValue(dark ? '--accent' : '--black').trim(),
            active: () => menu.classList.contains('open'),
        });
    };

    const background = [...document.body.children].filter(child => child !== menu && !child.classList.contains('navbar'));

    const toggle = (open, returnFocus = false) => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', !open);
        menu.inert = !open;
        button.setAttribute('aria-expanded', open);
        button.setAttribute('aria-label', open ? t('Close menu') : t('Open menu'));
        document.documentElement.classList.toggle('menu-open', open);
        background.forEach(child => { child.inert = open; });
        if (open) {
            showPicture();
            loadKofi();
            lenis?.stop();
            requestAnimationFrame(() => menu.querySelector('a')?.focus());
        } else {
            lenis?.start();
            if (returnFocus) button.focus();
        }
    };

    for (const option of menu.querySelectorAll('.lang-option')) {
        const current = option.dataset.lang === lang;
        option.setAttribute('aria-pressed', String(current));
        option.addEventListener('click', () => setLanguage(option.dataset.lang));
    }

    button.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.addEventListener('click', event => {
        if (event.target === menu || event.target.closest('a')) toggle(false);
    });
    document.addEventListener('keydown', event => {
        if (!menu.classList.contains('open')) return;
        if (event.key === 'Escape') return toggle(false, true);
        if (event.key !== 'Tab') return;
        const links = menu.querySelectorAll('a[href], button');
        const first = links[0], last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    breakpoint.onChange(size => { if (size === 'desktop' && menu.classList.contains('open')) toggle(false, true); });
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

    let placed = false, centred = null;
    const place = () => {
        const link = nav.querySelector('a[aria-current]');
        if (!link) { pill.style.opacity = '0'; return; }
        pill.style.transition = placed ? '' : 'none';
        pill.style.opacity = '1';
        pill.style.width = `${link.offsetWidth}px`;
        pill.style.transform = `translateX(${link.offsetLeft}px)`;
        if (!placed) { pill.offsetWidth; pill.style.transition = ''; placed = true; }
        if (link !== centred && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
        centred = link;
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
        const landing = target.id === 'contact' ? contactLanding() : null;
        if (lenis) lenis.scrollTo(landing ?? target, { duration: 1.2, offset: landing == null ? -100 : 0 });
        else if (landing != null) scrollTo({ top: landing, behavior: 'smooth' });
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
    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-copy]');
        if (!button) return;
        const label = button.textContent;
        try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = t('Copied'); } catch { button.textContent = button.dataset.copy; }
        setTimeout(() => { button.textContent = label; }, 1600);
    });
}

let kofiRequested = false;

function loadKofi() {
    if (kofiRequested) return;
    kofiRequested = true;
    const script = document.createElement('script');
    script.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
    script.onload = () => window.kofiWidgetOverlay?.draw('leotosku', {
        'type': 'floating-chat',
        'floating-chat.donateButton.text': t('Support me'),
        'floating-chat.donateButton.background-color': '#F6F2F2',
        'floating-chat.donateButton.text-color': '#210710',
    });
    document.head.append(script);
}

function footerReveal() {
    const footer = document.getElementById('footer');
    const space = document.querySelector('.footer-space');
    if (!footer || !space) return;
    const update = () => {
        const top = space.getBoundingClientRect().top;
        footer.classList.toggle('is-near', top < innerHeight + 2);
        footer.style.setProperty('--reveal', clamp01((innerHeight - top) / Math.max(space.offsetHeight, 1)).toFixed(3));
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

function contactPictures() {
    const hosts = [...document.querySelectorAll('.contact-picture')];
    if (!hosts.length) return;
    const start = async host => {
        const { pixelPicture } = await import('./effects.js');
        const black = getComputedStyle(document.documentElement).getPropertyValue('--black').trim();
        const onScreen = () => { const { top, bottom } = host.getBoundingClientRect(); return bottom > 0 && top < innerHeight; };
        pixelPicture(host, host.dataset.picture, { color: black, center: Number(host.dataset.center ?? 0.5), anchor: Number(host.dataset.anchor ?? 0.5), watch: true, active: onScreen });
    };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        start(entry.target);
    }), { rootMargin: '250% 0px' });
    hosts.forEach(host => observer.observe(host));
}

function pauseOffscreenVideos() {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
    }), { threshold: 0.01 });
    document.querySelectorAll('video[autoplay]').forEach(video => observer.observe(video));
}
