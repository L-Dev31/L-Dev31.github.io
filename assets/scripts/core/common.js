import { lowPower, reducedMotion, clamp01, breakpoint, isMobile, throttled, PICTURE } from './config.js';
import { pageLoader } from './intro.js';
import { cursor, magnets, pageTransitions } from '../fx/cursor.js';
import { loadProjects } from './projects.js';
import { contactScene, contactLanding } from '../blocks/contact.js';
import { socialLinks } from './components.js';
import { el, cssVariable, scrollPage } from './dom.js';
import { initContactParallax } from '../blocks/contact-parallax.js';


export function initPage() {
    document.querySelectorAll('[data-year]').forEach(node => node.textContent = new Date().getFullYear());
    clock();
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
    footerPortrait();
    contactScene();
    initContactParallax();
    // Last, so that on each scroll it reads the reveal and the Let's talk tone the parts above have just set.
    navTone();
    copyHandles();
    return lenis;
}

// The navbar at the top and the back-to-top ring at the bottom take the tone of what passes under them: the
// showcase's own colours (at once, since the showcase changes at once), dark ink on the red sections and on the
// light end of Let's talk, white everywhere else.
function navTone() {
    const bar = document.querySelector('.navbar');
    const ring = document.querySelector('.back-to-top');
    const reds = [...document.querySelectorAll('#my-story, #featured-projects, #projects-index, #promise, .contact-rest, .accent-section')];
    const stage = document.querySelector('.contact-stage');
    const footerSpace = document.querySelector('.footer-space');
    const footerName = document.querySelector('.footer-name');
    if (!bar) return;
    const coversAt = (node, y) => { const r = node.getBoundingClientRect(); return r.top <= y && r.bottom >= y; };
    // The capitals of the footer name rise about a quarter of its font size above its line box.
    const overName = box => {
        const r = footerName.getBoundingClientRect();
        return box.bottom > r.top - parseFloat(getComputedStyle(footerName).fontSize) * 0.25 && box.top < r.bottom;
    };
    const toneAt = (element, y, showcase) => {
        const covers = node => coversAt(node, y);
        const onShowcase = showcase?.dataset.paletteActive === 'true' && covers(showcase);
        if (onShowcase) element.style.color = getComputedStyle(showcase).getPropertyValue('--showcase-foreground').trim();
        else element.style.removeProperty('color');
        element.style.setProperty('--tone-fade', onShowcase ? '0s' : '');
        const onAccent = !onShowcase && (reds.some(covers) || (stage?.dataset.tone === 'light' && covers(stage)));
        element.classList.toggle('on-accent', onAccent);
        return onAccent;
    };
    const update = () => {
        const showcase = document.querySelector('.showcase-stage');
        document.documentElement.classList.toggle('on-accent', toneAt(bar, bar.offsetHeight / 2, showcase));
        if (ring) {
            const box = ring.getBoundingClientRect(), y = box.top + box.height / 2;
            toneAt(ring, y, showcase);
            ring.classList.toggle('on-name', !!footerName && coversAt(footerSpace, y) && overName(box));
        }
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    addEventListener('showcasepalettechange', update);
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
        for (const node of document.querySelectorAll('[data-clock]')) {
            node.innerHTML = `${day ? SUN : MOON}<span class="clock-place">French Riviera, FR</span><span class="clock-time">${clockTime}</span><span class="clock-zone">${offset}</span>`;
            node.setAttribute('aria-label', `French Riviera, ${clockTime}, ${offset}, ${day ? 'daytime' : 'night'}`);
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
    'legal.html': 'legal',
    '404.html': 'not-found',
    'project.html': `project:${new URLSearchParams(location.search).get('id')}`,
}[location.pathname.split('/').pop()] ?? 'home';

function menuLink(className, { label, href }, isCurrent) {
    const link = el('a', className);
    link.href = href;
    if (isCurrent) {
        link.setAttribute('aria-current', 'page');
        if (className === 'mobile-menu-link') {
            const arrow = el('span', 'menu-current', '\u2192');
            arrow.setAttribute('aria-hidden', 'true');
            link.append(arrow);
        }
    }
    link.append(label);
    return link;
}

function menuGroup(page, projects) {
    const group = el('div', 'mobile-menu-group');
    group.append(menuLink('mobile-menu-link', page, page.id === CURRENT_PAGE));

    let children = page.children === 'projects'
        ? projects.map(project => ({ id: `project:${project.id}`, label: project.title, href: `project.html?id=${project.id}` }))
        : page.children;
    if (page.id === 'home' && CURRENT_PAGE.startsWith('project:') && !children.some(child => child.id === CURRENT_PAGE)) {
        const label = document.querySelector('.article-header h1')?.textContent.trim() || 'This project';
        children = [...children, { id: CURRENT_PAGE, label, href: location.pathname + location.search }];
    }
    if (children.length) {
        const list = el('div', 'mobile-menu-sub');
        list.append(...children.map(child => menuLink('mobile-menu-sublink', child, child.id === CURRENT_PAGE)));
        group.append(list);
    }
    return group;
}

function renderMenu(nav, projects) {
    nav.replaceChildren(...PAGES.map(page => menuGroup(page, projects)));
    if (nav.nextElementSibling?.classList.contains('hero-socials')) return;
    const socials = el('nav', 'hero-socials');
    socials.setAttribute('aria-label', 'Social links, menu');
    const clock = el('p', 'clock');
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
    button.setAttribute('aria-label', 'Open menu');

    const nav = menu.querySelector('.mobile-menu-links');
    renderMenu(nav, []);
    loadProjects().then(projects => renderMenu(nav, projects), () => {});

    const picture = el('div', 'mobile-menu-picture');
    picture.setAttribute('aria-hidden', 'true');
    menu.prepend(picture);
    let pixels = null;
    const showPicture = async () => {
        pixels?.destroy();
        pixels = null;
        if (getComputedStyle(picture).display === 'none') return;
        const { pixelPicture } = await import('../fx/effects.js');
        const dark = document.documentElement.classList.contains('on-accent');
        pixels = pixelPicture(picture, dark ? 'assets/images/core/menu.webp' : 'assets/images/core/menu-accent.webp', {
            mirror: true,
            color: cssVariable(dark ? '--accent' : '--black'),
            active: () => menu.classList.contains('open'),
        });
    };

    const background = [...document.body.children].filter(child => child !== menu && !child.classList.contains('navbar'));

    const toggle = (open, returnFocus = false) => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', !open);
        menu.inert = !open;
        button.setAttribute('aria-expanded', open);
        button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.documentElement.classList.toggle('menu-open', open);
        background.forEach(child => { child.inert = open; });
        if (open) {
            showPicture();
            lenis?.stop();
            requestAnimationFrame(() => menu.querySelector('a')?.focus());
        } else {
            lenis?.start();
            if (returnFocus) button.focus();
        }
    };

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

    const pill = el('span', 'section-nav-pill');
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);

    links.forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        scrollPage(lenis, document.querySelector(link.hash), { duration: 1.2, offset: -100 });
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

    const update = () => {
        const line = innerHeight / 2;
        const first = sections[0].getBoundingClientRect().top, last = sections.at(-1).getBoundingClientRect().bottom;
        nav.classList.toggle('is-on', first < innerHeight * 0.6 && last > innerHeight * 0.4);
        const index = sections.findLastIndex(section => section.getBoundingClientRect().top <= line);
        links.forEach((link, i) => { if (i === index) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
        place();
    };
    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
}

function anchorLinks(lenis) {
    document.querySelectorAll('a[href^="#"]:not(.section-nav a)').forEach(link => link.addEventListener('click', e => {
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        e.preventDefault();
        const landing = target.id === 'contact' ? contactLanding() : null;
        scrollPage(lenis, landing ?? target, { duration: 1.2, offset: landing == null ? -100 : 0 });
    }));
}

// Back to top: fixed at the bottom right once the page's hero is behind. Its ring of text always turns, slowly, like the
// signature: scrolling down speeds it up, scrolling up turns it back, and under the pointer it slows down.
const RING = {
    // A turn in about 30 seconds while the page is still.
    idleDegreesPerSecond: 12,
    // What the scroll adds: down turns it forward, up turns it back.
    degreesPerScrolledPx: 0.12,
    // A long jump (back to the top, a section link) turns it quickly, never in a blur.
    maxDegreesPerSecond: 360,
    // Under the pointer it turns at this share of its speed.
    hoverShare: 0.3,
    // How quickly its speed follows the scroll and the pointer, per second.
    ease: 6,
};

function backToTop(lenis) {
    const button = document.querySelector('.back-to-top');
    if (!button) return;
    const ring = button.querySelector('.btt-text');

    const chars = [...ring.textContent];
    ring.replaceChildren(...chars.map((char, i) => {
        const span = el('span', '', char);
        span.style.transform = `rotate(${i * 360 / chars.length}deg)`;
        return span;
    }));

    button.addEventListener('click', () => scrollPage(lenis, 0));

    const hero = document.querySelector('.hero-spacer, .about-header, .project-hero, .all-head');
    const heroBottom = () => (hero ? hero.getBoundingClientRect().bottom : innerHeight - scrollY);
    const reveal = () => button.classList.toggle('is-shown', heroBottom() <= 0);
    addEventListener('scroll', throttled(reveal), { passive: true });
    addEventListener('resize', reveal, { passive: true });
    reveal();

    if (reducedMotion) return;
    let angle = 0;
    let speed = RING.idleDegreesPerSecond;
    let share = 1;
    let hovered = false;
    let lastY = scrollY;
    let lastFrame = performance.now();

    const turn = now => {
        requestAnimationFrame(turn);
        const seconds = Math.min(0.05, (now - lastFrame) / 1000);
        const scrolled = scrollY - lastY;
        lastFrame = now;
        lastY = scrollY;
        if (!seconds || !button.classList.contains('is-shown')) return;

        const target = RING.idleDegreesPerSecond + (scrolled / seconds) * RING.degreesPerScrolledPx;
        const limited = Math.max(-RING.maxDegreesPerSecond, Math.min(RING.maxDegreesPerSecond, target));
        const follow = 1 - Math.exp(-seconds * RING.ease);
        speed += (limited - speed) * follow;
        share += ((hovered ? RING.hoverShare : 1) - share) * follow;
        angle = (angle + speed * share * seconds) % 360;
        ring.style.rotate = `${angle.toFixed(2)}deg`;
    };
    requestAnimationFrame(turn);

    button.addEventListener('pointerenter', () => { hovered = true; });
    button.addEventListener('pointerleave', () => { hovered = false; });
}

function copyHandles() {
    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-copy]');
        if (!button) return;
        const label = button.textContent;
        try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; } catch { button.textContent = button.dataset.copy; }
        setTimeout(() => { button.textContent = label; }, 1600);
    });
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

// The portrait of the about page, in pixels, drawn here the way the about hero draws it.
function footerPortrait() {
    const host = document.querySelector('.footer-portrait');
    if (!host) return;
    const footer = host.closest('#footer');
    import('../fx/effects.js').then(({ pixelPicture, portraitFraming }) => {
        pixelPicture(host, host.dataset.picture, { gain: PICTURE.aboutHeroGain, color: cssVariable('--accent'), active: () => footer.classList.contains('is-near'), ...portraitFraming(0.4, { anchor: 0.7 }) });
    });
}
