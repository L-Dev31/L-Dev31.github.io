// Home and about pages.
import { initPage, reveal, loadProjects, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo } from './effects.js';
import { extrudedSvg, CELL } from './pixel.js';
import { journey, clients } from './sections.js';

// ─── Shared constants ─────────────────────────────────────────────────────────
const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];

initPage();
const refreshParallax = parallax();
scrubbingText();
scrollScrubbedVideo();
reveal(document.querySelectorAll('section, .title'));

// ─── Project index ────────────────────────────────────────────────────────────
// Title with its category boxed under it, an empty column where the project's SVG turns in 3D on hover,
// and the year. Projects without an SVG of their own (the "svg" field) show the logo.
const DEFAULT_SVG = 'assets/images/core/logo.svg';

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

function projectIndex(container, projects) {
    const rows = projects.map(project => {
        const item = el('li', 'index-item');
        const row = el('a', 'index-row');
        row.href = `project.html?id=${project.id}`;
        const name = el('span', 'index-name');
        name.append(el('span', 'index-title', project.title), el('span', 'index-cat', project.category));
        row.append(name, el('span', 'index-slot'), el('span', 'index-year', (project.date || '').slice(0, 4)));
        item.append(row);
        return { project, row };
    });
    const list = el('ol', 'index-list');
    list.append(...rows.map(r => r.row.parentNode));
    container.replaceChildren(list);
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
        const cols = Math.max(16, Math.floor(slot.width / CELL));
        figure.style.left = `${slot.left - box.left + (slot.width - cols * CELL) / 2}px`;
        figure.style.top = `${r.top - box.top + r.height / 2}px`;
        figure.style.width = `${cols * CELL}px`;
        solid.show(project.svg || DEFAULT_SVG, cols).then(() => {
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
    projectPreview(container, projectIndex(container, projects));
    refreshParallax();
}

initProjects();
journey(document.querySelector('.journey'));
clients(document.querySelector('.client-index'));
