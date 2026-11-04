// Home and about pages.
import { initPage, loadProjects, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo } from './effects.js';
import { extrudedSvg, CELL } from './pixel.js';
import { journey, clients } from './sections.js';

// ─── Shared constants ─────────────────────────────────────────────────────────
const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];

initPage();
const refreshParallax = parallax();
scrubbingText();
scrollScrubbedVideo();

// ─── Project index ────────────────────────────────────────────────────────────
// Title with its category boxed under it, an empty column where the project's SVG turns in 3D on hover,
// and the year. A project's SVG is assets/images/projects/icons/{id}.svg; without one it shows the logo.
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
                const title = el('span', 'index-title scrubbing-text', project.title);
                row.append(title, el('span', 'index-slot'), el('span', 'index-year', year));
                item.append(row);
                list.append(item);
                rows.push({ project, row });
            }
            const heading = el('h3', 'index-category scrubbing-text', category);
            heading.append(el('span', 'index-count', String(list.children.length).padStart(2, '0')));
            group.append(heading, list);
            return group;
        });
    const columns = el('div', 'index-groups');
    columns.append(...groups);
    container.replaceChildren(columns);
    return rows;
}

// On a pointer device the hovered (or focused) row shows its SVG in its own column, extruded and drawn
// in black cells like the hero; a tall drawing simply runs over the rows around it.
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
        // Inside the column with a margin of 8px on each side, in a round number of cells (a multiple of 4).
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

// Text that arrives with its data scrubs in too, once it exists.
Promise.all([initProjects(), journey(document.querySelector('.journey')), clients(document.querySelector('.client-index'))])
    .then(() => { scrubbingText(); refreshParallax(); });
