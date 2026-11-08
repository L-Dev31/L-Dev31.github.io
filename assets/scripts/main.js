import './components.js';
import { initPage, reveal, loadProjects, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, pixelPicture, pixelCover } from './effects.js';
import { extrudedSvg, CELL } from './pixel.js';
import { journey } from './sections.js';
import { PICTURE } from './config.js';
import { showcase, thread, homeDocks, restDocks } from './showcase.js';

const CATEGORIES = ['Graphic Design', 'Webdesign', 'Marketing', 'Dev'];

const lenis = initPage();
if (!document.querySelector('#header')) reveal(document.querySelectorAll('section, .title'));
const refreshParallax = parallax();
const cover = document.querySelector('.about-header-picture');
if (cover) pixelPicture(cover, cover.dataset.picture, { gain: PICTURE.aboutHeroGain, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), active: () => scrollY < innerHeight * 2, intro: true });
const story = document.querySelector('.promise-picture');
if (story) {
    let visible = false;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(story);
    pixelPicture(story, story.dataset.picture, { color: getComputedStyle(document.documentElement).getPropertyValue(story.closest('#promise') ? '--accent' : '--black').trim(), active: () => visible });
}
scrubbingText();
scrollScrubbedVideo();

const DEFAULT_SVG = 'assets/images/core/logo.svg';

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

function projectIndex(container, projects) {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const entries = [];
    let current = null;

    const build = entry => {
        const { project, detail } = entry;
        const media = el('div', 'index-media');
        if (project.video) {
            const video = el('video');
            Object.assign(video, { src: project.video, poster: project.heroImage, muted: true, loop: true, playsInline: true, preload: 'none' });
            entry.video = video;
            media.append(video);
        } else {
            const img = el('img');
            Object.assign(img, { src: project.cover || project.heroImage, alt: '', decoding: 'async' });
            entry.ready = img.decode().catch(() => {});
            media.append(img);
        }
        const info = el('div', 'index-info');
        const tags = el('ul', 'index-tags');
        tags.append(...(project.tags || []).map(tag => el('li', 'index-tag', tag)));
        const go = el('a', 'index-go', 'Read the case study ');
        go.href = `project.html?id=${project.id}`;
        go.append(el('span', '', '\u2197'));
        info.append(el('div', 'index-role', `Role: ${project.role}`), el('div', 'index-text', project.subtitle), tags, go);
        const inner = el('div', 'index-detail-inner');
        inner.append(media, info);
        detail.append(inner);
        entry.cover = pixelCover(media, color);
    };
    const open = entry => {
        if (current && current !== entry) close(current);
        if (!entry.cover) build(entry);
        current = entry;
        entry.item.classList.add('is-open');
        entry.row.setAttribute('aria-expanded', 'true');
        (entry.ready || Promise.resolve()).then(() => entry.cover.show());
        entry.video?.play().catch(() => {});
    };
    const close = entry => {
        if (current === entry) current = null;
        entry.item.classList.remove('is-open');
        entry.row.setAttribute('aria-expanded', 'false');
        entry.cover?.hide(() => entry.video?.pause());
    };

    const groups = [...new Set(projects.map(p => p.category))]
        .sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
        .map(category => {
            const group = el('div', 'index-group');
            const list = el('ul', 'index-list');
            for (const project of projects.filter(p => p.category === category)) {
                const item = el('li', 'index-item');
                const row = el('a', 'index-row');
                row.href = `project.html?id=${project.id}`;
                row.setAttribute('role', 'button');
                row.setAttribute('aria-expanded', 'false');
                row.append(el('span', 'index-title', project.title), el('span', 'index-slot'), el('span', 'index-year', (project.date || '').slice(0, 4)));
                const detail = el('div', 'index-detail');
                item.append(row, detail);
                list.append(item);
                const entry = { project, item, row, detail };
                row.addEventListener('click', event => {
                    event.preventDefault();
                    item.classList.contains('is-open') ? close(entry) : open(entry);
                });
                entries.push(entry);
            }
            const heading = el('h3', 'index-category');
            heading.append(el('span', '', category), el('span', 'index-count', String(list.children.length).padStart(2, '0')));
            group.append(heading, list);
            return group;
        });
    const columns = el('div', 'index-groups');
    columns.append(...groups);
    container.replaceChildren(columns);
    return entries;
}

function projectPreview(container, entries) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const figure = el('figure', 'index-preview');
    figure.setAttribute('aria-hidden', 'true');
    const canvas = el('canvas');
    figure.append(canvas);
    container.append(figure);
    const solid = extrudedSvg(canvas, getComputedStyle(container).color);
    let current = null;

    const show = (row, project) => {
        if (row.parentElement.classList.contains('is-open')) return;
        current = row;
        const box = container.getBoundingClientRect();
        const slot = row.querySelector('.index-slot').getBoundingClientRect();
        const r = row.getBoundingClientRect();

        const cols = Math.max(16, Math.floor((slot.width - 16) / CELL / 4) * 4);
        figure.style.left = `${slot.left - box.left + (slot.width - cols * CELL) / 2}px`;
        figure.style.top = `${r.top - box.top + r.height / 2}px`;
        figure.style.width = `${cols * CELL}px`;
        solid.show([project.svg || `assets/images/projects/icons/${project.id}.svg`, DEFAULT_SVG], cols).then(() => {
            if (current !== row) return;
            figure.offsetWidth;
            figure.classList.add('is-on');
        });
    };
    const hide = row => {
        if (current !== row) return;
        current = null;
        figure.classList.remove('is-on');
        solid.hide();
    };

    for (const { row, project } of entries) {
        row.addEventListener('pointerenter', () => show(row, project));
        row.addEventListener('pointerleave', () => hide(row));
        row.addEventListener('focus', () => show(row, project));
        row.addEventListener('blur', () => hide(row));
        row.addEventListener('click', () => hide(row));
    }
}

async function initProjects() {
    const container = document.querySelector('.project-index');
    if (!container) return;
    const projects = (await loadProjects()).filter(p => CATEGORIES.includes(p.category));

    const stage = showcase(document.querySelector('.showcase'), projects.filter(project => project.featured), lenis);
    signature?.setDocks(homeDocks(stage));
    projectPreview(container, projectIndex(container, projects));
    refreshParallax();
}

const PLATFORMS = { nes: 'NES', snes: 'SNES', n64: 'Nintendo 64', gb: 'Game Boy', gbc: 'Game Boy Color', gba: 'Game Boy Advance', ds: 'DS', '3ds': '3DS', wii: 'Wii', wiiu: 'Wii U', switch: 'Switch', steam: 'PC', pc: 'PC', android: 'Android', web: 'Web', mame: 'Arcade' };

const when = item => (item.released ? Date.parse(item.released) : Date.UTC(item.year, 0, 1));

function cultureList(container, items, kind) {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const list = el('ul', 'index-list');
    const entries = [...items].sort((a, b) => when(b) - when(a)).map(item => {
        const row = el('div', 'index-row');
        row.tabIndex = 0;
        const title = el('span', 'index-title', item.title.replace(/ \([^)]*\)$/, ''));
        const note = item.platform ? PLATFORMS[item.platform] || item.platform : item.note || item.author;
        if (note) title.append(el('small', 'index-platform', ` ${note}`));
        row.append(title, el('span', 'index-slot'), el('span', 'index-year', item.date ?? String(item.year)));
        const li = el('li', 'index-item');
        li.append(row);
        list.append(li);
        return { item, row };
    });

    const clips = kind === 'games';
    const figure = el('figure', 'culture-preview');
    figure.setAttribute('aria-hidden', 'true');
    const img = el('img');
    img.alt = '';
    img.hidden = clips;
    const clip = el('video');
    Object.assign(clip, { muted: true, loop: true, playsInline: true, preload: 'auto' });
    clip.hidden = !clips;
    figure.append(clip, img);
    container.replaceChildren(list, figure);
    const cover = pixelCover(figure, color);
    let current = null, leaving = 0;

    const follow = (row, x) => {
        const box = container.getBoundingClientRect(), r = row.getBoundingClientRect();
        const title = row.querySelector('.index-title').getBoundingClientRect(), year = row.querySelector('.index-year').getBoundingClientRect();
        const half = figure.offsetWidth / 2, gap = 24;
        const low = title.right + gap + half, high = year.left - gap - half;
        const middle = (title.right + year.left) / 2;

        let target = middle;
        if (x != null) {
            const right = x + 216 + half, left = x - 216 - half;
            target = right <= high ? right : left >= low ? left : (high - right > left - low ? right : left);
        }
        target = low <= high ? Math.min(high, Math.max(low, target)) : middle;
        figure.style.setProperty('--x', `${Math.round(target - box.left - half)}px`);
        figure.style.setProperty('--y', `${Math.round(r.top - box.top + r.height / 2 - figure.offsetHeight / 2)}px`);
    };
    let pointerX = null;

    const show = async entry => {
        const { item, row } = entry;
        clearTimeout(leaving);
        if (current === row) return;
        current = row;
        figure.classList.remove('is-on');
        if (clips) {
            clip.src = `assets/videos/culture/${item.id}.mp4`;
            if (!await new Promise(done => { clip.onloadeddata = () => done(true); clip.onerror = () => done(false); })) return;
            clip.play().catch(() => {});
        } else {
            img.src = `assets/images/culture/${kind}/${item.id}.webp`;
            if (!await img.decode().then(() => true, () => false)) return;
        }
        if (current !== row) return;
        follow(row, pointerX);
        cover.show();
        requestAnimationFrame(() => { if (current === row) figure.classList.add('is-on'); });
    };
    const hide = row => {
        if (current !== row) return;
        leaving = setTimeout(() => {
            current = null;
            cover.hide(() => { if (!current) figure.classList.remove('is-on'); });
        }, 80);
    };

    const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    for (const entry of entries) {
        if (hover) {
            entry.row.addEventListener('pointerenter', event => { pointerX = event.clientX; show(entry); });
            entry.row.addEventListener('pointermove', event => { pointerX = event.clientX; if (current === entry.row) follow(entry.row, pointerX); });
            entry.row.addEventListener('pointerleave', () => hide(entry.row));
        }
        entry.row.addEventListener('focus', () => { pointerX = null; show(entry); });
        entry.row.addEventListener('blur', () => hide(entry.row));
    }
}

async function initCulture() {
    const lists = document.querySelectorAll('[data-culture]');
    if (!lists.length) return;
    const data = await fetch('assets/data/culture.json').then(r => r.json());
    const shown = (kind, list) => list.filter(item => item.featured);
    lists.forEach(container => cultureList(container, shown(container.dataset.culture, data[container.dataset.culture] || []), container.dataset.culture));
    const travels = await fetch('assets/data/travels.json').then(r => r.json());
    const totals = { ...Object.fromEntries(Object.entries(data).map(([kind, list]) => [kind, shown(kind, list).length])), travels: travels.stops.length };
    document.querySelectorAll('.section-nav [data-count]').forEach(count => { count.textContent = totals[count.dataset.count] ?? ''; });
    document.querySelector('.section-nav')?.dispatchEvent(new Event('relayout'));
}

const signature = thread(restDocks());

Promise.all([initProjects(), initCulture(), ...[...document.querySelectorAll('.journey')].map(journey)])
    .then(() => { scrubbingText(); refreshParallax(); });
