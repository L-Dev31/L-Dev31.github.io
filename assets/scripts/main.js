import { initPage, reveal, loadProjects, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, pixelPicture } from './effects.js';
import { extrudedSvg, CELL } from './pixel.js';
import { journey } from './sections.js';

const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];

initPage();
if (!document.querySelector('#header')) reveal(document.querySelectorAll('section, .title'));
const refreshParallax = parallax();
const story = document.querySelector('.promise-picture');
if (story) {
    let visible = false;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(story);
    pixelPicture(story, story.dataset.picture, { mirror: true, color: getComputedStyle(document.documentElement).getPropertyValue('--black').trim(), active: () => visible });
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
    const rows = [];
    const groups = [...new Set(projects.map(p => p.category))]
        .sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
        .map(category => {
            const group = el('div', 'index-group');
            const list = el('ul', 'index-list');
            for (const project of projects.filter(p => p.category === category)) {
                const item = el('li', 'index-item');
                const row = el('a', 'index-row');
                row.href = `project.html?id=${project.id}`;
                const year = (project.date || '').slice(0, 4);
                const title = el('span', 'index-title', project.title);
                row.append(title, el('span', 'index-slot'), el('span', 'index-year', year));
                item.append(row);
                list.append(item);
                rows.push({ project, row });
            }
            const heading = el('h3', 'index-category', category);
            heading.append(el('span', 'index-count', String(list.children.length).padStart(2, '0')));
            group.append(heading, list);
            return group;
        });
    const columns = el('div', 'index-groups');
    columns.append(...groups);
    container.replaceChildren(columns);
    return rows;
}

function projectPreview(container, rows) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const figure = el('figure', 'index-preview');
    figure.setAttribute('aria-hidden', 'true');
    const canvas = el('canvas');
    figure.append(canvas);
    container.append(figure);
    const solid = extrudedSvg(canvas, getComputedStyle(container).color);
    let current = null;

    const show = (row, project) => {
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

    for (const { row, project } of rows) {
        row.addEventListener('pointerenter', () => show(row, project));
        row.addEventListener('pointerleave', () => hide(row));
        row.addEventListener('focus', () => show(row, project));
        row.addEventListener('blur', () => hide(row));
    }
}

async function initProjects() {
    const container = document.querySelector('.project-index');
    if (!container) return;
    const projects = (await loadProjects()).filter(p => CATEGORIES.includes(p.category));
    const rows = projectIndex(container, projects);
    projectPreview(container, rows);
    refreshParallax();
}

Promise.all([initProjects(), journey(document.querySelector('.journey'))])
    .then(() => { scrubbingText(); refreshParallax(); });
