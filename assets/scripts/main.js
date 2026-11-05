import { initPage, reveal, loadProjects, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, pixelPicture, pixelCover } from './effects.js';
import { extrudedSvg, CELL } from './pixel.js';
import { journey } from './sections.js';

const CATEGORIES = ['Graphic Design', 'Webdesign', 'Marketing', 'Dev'];

initPage();
if (!document.querySelector('#header')) reveal(document.querySelectorAll('section, .title'));
const refreshParallax = parallax();
const cover = document.querySelector('.about-header-picture');
if (cover) pixelPicture(cover, cover.dataset.picture, { gain: 3.2, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), active: () => scrollY < innerHeight * 2 });
const story = document.querySelector('.promise-picture');
if (story) {
    let visible = false;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(story);
    pixelPicture(story, story.dataset.picture, { color: getComputedStyle(document.documentElement).getPropertyValue('--black').trim(), active: () => visible });
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
        const go = el('a', 'index-go', 'How I did it ');
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
    projectPreview(container, projectIndex(container, projects));
    refreshParallax();
}

Promise.all([initProjects(), journey(document.querySelector('.journey'))])
    .then(() => { scrubbingText(); refreshParallax(); });
