const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lowPower = reducedMotion || navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2 || !!navigator.connection?.saveData;
export const clamp01 = value => Math.max(0, Math.min(1, value));

// ---------------------------------------------------------------- what the page loads
// The intro's bar counts the resources the page really loads, one each: track() registers one,
// and every fetch made while the intro shows is registered on its own.

const loading = { total: 0, done: 0, open: true, last: '', changed: () => {} };
const nativeFetch = window.fetch.bind(window);

const fileName = url => {
    try {
        const { pathname, hostname } = new URL(url, location.href);
        const local = /assets\/(.+)$/.exec(pathname);
        if (local) return local[1];
        const file = pathname.split('/').pop() || 'index.html';
        return hostname === location.hostname ? file : `${hostname} ${file}`;
    } catch {
        return String(url);
    }
};

/** Counts one resource for the intro's bar, done once the promise settles; returns the promise. */
export function track(url, promise) {
    if (!loading.open) return promise;
    loading.total++;
    const settle = () => {
        loading.done++;
        if (url) loading.last = fileName(url);
        loading.changed();
    };
    Promise.resolve(promise).then(settle, settle);
    loading.changed();
    return promise;
}

// a fetch counts until its body has arrived, not only its headers
window.fetch = (input, init) => {
    const response = nativeFetch(input, init);
    if (loading.open) track(typeof input === 'string' ? input : input.url, response.then(r => r.clone().arrayBuffer()));
    return response;
};

let markLoaded = () => {};
/** Resolves when everything the page loads is in: the intro's solid then becomes the signature. */
export const introLoaded = new Promise(resolve => { markLoaded = resolve; });

let entranceAt = Infinity;
let startEntrance = () => {};
/** Resolves when the hero starts to appear, as the intro leaves. */
export const heroEntrance = new Promise(resolve => {
    startEntrance = () => { entranceAt = performance.now(); resolve(); };
});
/** Seconds since the hero started to appear: 0 while the intro shows, all of it at once with reduced motion. */
export const entrance = () => (reducedMotion ? 1e6 : entranceAt === Infinity ? 0 : (performance.now() - entranceAt) / 1000);

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

let projectList = null;
export const loadProjects = () => (projectList ??= fetch('assets/data/projects.json')
    .then(res => res.json())
    .then(data => data.projects
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))));
/** A project's mark, the svg its pixel solid is drawn from. */
export const projectMark = project => project.svg || `assets/images/projects/icons/${project.id}.svg`;
export const SIGNATURE = 'assets/images/core/logo.svg';
// while the page loads, the intro's solid goes through the marks of the projects, one every INTRO_STEP ms
export const INTRO_STEP = 550;

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
    magnets();
    pageTransitions();
    anchorLinks(lenis);
    backToTop(lenis);
    pauseOffscreenVideos();
    return lenis;
}

function navTone() {
    const bar = document.querySelector('.navbar');
    const reds = [...document.querySelectorAll('#my-story, #featured-projects, #footer, .accent-section')];
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
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Monaco', hour: '2-digit', minute: '2-digit', hour12: false });
    const zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Monaco', timeZoneName: 'shortOffset' });
    const tick = () => {
        const now = new Date();
        const day = daylight(now);
        const t = time.format(now);
        const offset = zone.formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
        for (const el of document.querySelectorAll('[data-clock]')) {
            el.innerHTML = `${day ? SUN : MOON}<span class="clock-place">Monaco, MC</span><span class="clock-time">${t}</span><span class="clock-zone">${offset}</span>`;
            el.setAttribute('aria-label', `Monaco, ${t}, ${offset}, ${day ? 'daytime' : 'night'}`);
        }
    };
    tickClock = tick;
    tick();
    setInterval(tick, 15000);
}

function pixelDissolve(loader, done) {
    if (reducedMotion) { loader.classList.add('done'); done(); return; }
    import('./pixel.js').then(({ dissolve }) => {
        const color = getComputedStyle(loader).backgroundColor;
        loader.classList.add('dissolving');
        dissolve(loader, { color, fixed: true }, () => { loader.classList.add('done'); done(); });
    });
}

/** The @font-face files, by family and style, so the readout can name the font it waited for. */
function fontFiles() {
    const files = new Map();
    for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
            if (!(rule instanceof CSSFontFaceRule)) continue;
            const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
            const url = /url\(["']?([^"')]+)/.exec(rule.style.getPropertyValue('src'))?.[1];
            if (url) files.set(`${family}|${rule.style.getPropertyValue('font-style') || 'normal'}`, new URL(url, sheet.href || location.href).href);
        }
    }
    return files;
}

const LOADER_LIMIT = 8000; // the intro never holds the page longer than this
const until = (target, events) => new Promise(resolve => events.forEach(event => target.addEventListener(event, resolve, { once: true })));

// The intro: the signature turning in pixels while the bar follows what really loads, then the hero
function pageLoader() {
    const loader = document.querySelector('.page-loader');
    const root = document.documentElement;
    const bar = loader.querySelector('.page-loader-bar');
    const count = loader.querySelector('.page-loader-count');
    const file = loader.querySelector('.page-loader-file');
    let shown = 0, finished = false, pageLoaded = document.readyState === 'complete', mark = null, settling = 0;
    if (!reducedMotion) root.classList.add('intro-waiting');
    // where the signature travels (see showcase.js), it is the one that turns here, above the intro, and the
    // canvas of the intro only keeps its place; elsewhere the intro draws its own
    const travels = !isMobile && !reducedMotion;
    loader.classList.toggle('has-thread', travels);

    import('./pixel.js').then(({ extrudedSvg, CELL }) => {
        if (finished) return;
        const cols = Math.max(16, Math.min(40, Math.floor((Math.min(innerWidth, innerHeight) * 0.42) / CELL / 4) * 4));
        loader.style.setProperty('--sign', `${cols * CELL}px`);
        if (travels) return;
        mark = extrudedSvg(loader.querySelector('.page-loader-sign'), getComputedStyle(root).getPropertyValue('--accent').trim(), { morph: true });
        mark.show(SIGNATURE, cols);
        // the projects one after the other while the page loads, the signature to end
        loadProjects().then(list => {
            const marks = list.map(projectMark);
            let i = 0;
            const next = () => {
                if (finished || !marks.length) return;
                mark.show(marks[i++ % marks.length], cols);
                setTimeout(next, INTRO_STEP);
            };
            next();
        }, () => {});
        introLoaded.then(() => mark.show(SIGNATURE, cols));
    });

    const leave = () => {
        loader.classList.add('is-leaving');
        setTimeout(() => {
            root.classList.remove('intro-waiting');
            root.classList.add('intro-in');
            startEntrance();
            pixelDissolve(loader, () => mark?.hide());
            setTimeout(() => root.classList.remove('intro-in'), 2400);
        }, reducedMotion ? 0 : 280);
    };

    const finish = complete => {
        if (finished) return;
        finished = true;
        loading.open = false;
        window.fetch = nativeFetch;
        markLoaded();
        if (complete) {
            bar.style.transform = 'scaleX(1)';
            count.textContent = '100%';
        }
        // long enough for the solid to become the signature before it leaves
        setTimeout(leave, reducedMotion ? 0 : 750);
    };

    // the fonts the layout asked for, and those it asks for while the intro shows: they are looked
    // for on every paint, since the 'loading' event only fires when no other font was loading
    const fonts = fontFiles(), counted = new WeakSet();
    const trackFace = face => {
        if (counted.has(face) || face.status === 'unloaded') return;
        counted.add(face);
        track(fonts.get(`${face.family.replace(/["']/g, '')}|${face.style}`) || face.family, face.loaded);
    };

    const paint = () => {
        if (finished) return;
        document.fonts.forEach(trackFace);
        // until the page's own load event, something not counted may still be on its way
        const ceiling = pageLoaded ? 1 : 0.99;
        shown = Math.max(shown, loading.total ? Math.min(ceiling, loading.done / loading.total) : 0);
        bar.style.transform = `scaleX(${shown})`;
        count.textContent = `${String(Math.floor(shown * 100)).padStart(3, '0')}%`;
        file.textContent = loading.last;
        // everything in, and still everything in a moment later: nothing new started meanwhile
        clearTimeout(settling);
        if (pageLoaded && loading.done === loading.total) settling = setTimeout(() => { document.fonts.forEach(trackFace); if (loading.done === loading.total) finish(true); }, 120);
    };
    loading.changed = throttled(paint);

    // what is already there counts as loaded
    track(location.href, Promise.resolve());
    for (const el of document.querySelectorAll('link[rel="stylesheet"][href], script[src]')) track(el.href || el.src, Promise.resolve());
    for (const img of document.images) {
        if (!img.getAttribute('src') || img.loading === 'lazy') continue;
        track(img.src, img.complete ? Promise.resolve() : until(img, ['load', 'error']));
    }
    for (const video of document.querySelectorAll('video[preload="auto"]')) {
        // a phone may keep the video until a tap: it is not waited for longer than 3 s
        track(video.currentSrc || video.src, video.readyState >= 2 ? Promise.resolve() : Promise.race([until(video, ['loadeddata', 'error']), new Promise(resolve => setTimeout(resolve, 3000))]));
    }
    document.fonts.forEach(trackFace);
    document.fonts.addEventListener('loading', event => event.fontfaces.forEach(trackFace));

    if (!pageLoaded) addEventListener('load', () => { pageLoaded = true; loading.changed(); }, { once: true });
    setTimeout(() => finish(false), LOADER_LIMIT);
    loading.changed();
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
    { id: 'culture', label: 'Culture', href: 'culture.html' },
    { id: 'contact', label: 'Contact', href: 'mailto:leotoskuepro@gmail.com' },
];

const SOCIALS = [
    { label: 'Instagram', href: 'https://www.instagram.com/ltosku31/' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/l%C3%A9o-tosku-de-vries-8432242a0/' },
    { label: 'GitHub', href: 'https://github.com/L-Dev31' },
];

function renderMenuLinks(nav) {
    const file = location.pathname.split('/').pop() || 'index.html';
    const here = file === 'about.html' ? 'about' : file === 'culture.html' ? 'culture' : file === 'project.html' ? 'project' : 'home';
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

// what the cursor says over a zone: an element can name it with data-cursor
const CURSOR_LABELS = [['[data-cursor]', el => el.dataset.cursor], ['a.index-row', () => 'Open']];

function cursor() {
    const dot = document.querySelector('.cursor');
    if (isMobile || lowPower) return;

    const label = document.createElement('span');
    label.className = 'cursor-label';
    dot.append(label);
    let small = false;
    document.documentElement.classList.add('custom-cursor');
    document.addEventListener('mousemove', e => {
        dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)${small ? ' scale(0.5)' : ''}`;
    });
    // over a link or a button the dot shrinks, over a zone that says what it does it grows and says it
    document.addEventListener('mouseover', e => {
        const named = CURSOR_LABELS.map(([selector, text]) => [e.target.closest(selector), text]).find(([el]) => el);
        const word = named ? named[1](named[0]) : '';
        if (word) label.textContent = word;
        dot.classList.toggle('is-label', !!word);
        small = !word && !!e.target.closest('a, button');
    });
}

// pills and buttons lean towards the cursor while it is over them, and settle back when it leaves
const MAGNETIC = '.hero-socials a, .button, .hamburger, .brand a, .index-go, .culture-nav a, .showcase-step';

function magnets() {
    if (isMobile || lowPower || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const moving = new Map(); // element -> { x, y, tx, ty }
    let frame = 0;
    const step = () => {
        frame = 0;
        for (const [el, m] of moving) {
            m.x += (m.tx - m.x) * 0.2;
            m.y += (m.ty - m.y) * 0.2;
            const settled = Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05;
            if (settled && !m.tx && !m.ty) {
                el.style.translate = '';
                moving.delete(el);
            } else {
                el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
            }
        }
        if (moving.size) frame = requestAnimationFrame(step);
    };
    let current = null;
    document.addEventListener('pointermove', e => {
        const el = e.target.closest(MAGNETIC);
        if (current && current !== el) moving.get(current).tx = moving.get(current).ty = 0;
        current = el;
        if (el) {
            const r = el.getBoundingClientRect();
            const m = moving.get(el) ?? { x: 0, y: 0, tx: 0, ty: 0 };
            // a third of the way to the cursor, never more than 10 px
            m.tx = Math.max(-10, Math.min(10, (e.clientX - (r.left + r.width / 2) + m.x) * 0.3));
            m.ty = Math.max(-10, Math.min(10, (e.clientY - (r.top + r.height / 2) + m.y) * 0.3));
            moving.set(el, m);
        }
        if (moving.size && !frame) frame = requestAnimationFrame(step);
    }, { passive: true });
}

// another page of the site opens behind a curtain of pixels, the way the intro leaves
function pageTransitions() {
    if (reducedMotion) return;
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !/(\.html|\/)$/.test(url.pathname)) return;
        if (url.pathname === location.pathname && url.search === location.search) return;
        event.preventDefault();
        const cover = document.createElement('div');
        cover.className = 'page-cover';
        document.body.append(cover);
        import('./pixel.js').then(({ dissolve }) => {
            dissolve(cover, { color: getComputedStyle(document.documentElement).getPropertyValue('--black').trim(), fixed: true, reverse: true, total: 620 }, () => { location.href = url.href; });
        });
        // a navigation that does not happen must not leave the curtain down
        setTimeout(() => cover.remove(), 4000);
    });
    // back through the history, the page comes back with its curtain: lift it
    addEventListener('pageshow', event => { if (event.persisted) document.querySelectorAll('.page-cover').forEach(cover => cover.remove()); });
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

function pauseOffscreenVideos() {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
    }), { threshold: 0.01 });
    document.querySelectorAll('video[autoplay]').forEach(video => observer.observe(video));
}
