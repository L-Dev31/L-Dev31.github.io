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
                row.setAttribute('aria-label', `${project.title}, ${year}`);
                const title = el('span', 'index-title');
                title.setAttribute('aria-hidden', 'true');
                project.title.split(' ').forEach((text, i) => {
                    if (i) title.append(' ');
                    const word = el('span', 'index-word');
                    for (const char of text) word.append(el('span', 'index-char', char));
                    title.append(word);
                });
                row.append(title, el('span', 'index-slot'), el('span', 'index-year', year));
                item.append(row);
                list.append(item);
                rows.push({ project, row });
            }
            group.append(el('h3', 'index-category', category), list);
            return group;
        });
    const columns = el('div', 'index-groups');
    columns.append(...groups);
    container.replaceChildren(columns);
    return rows;
}

// The weight of every letter of the titles near the pointer rises with proximity (Satoshi is a variable font),
// so the bold spreads over the neighbouring letters and fades back as the pointer leaves. A focused row is bold.
function projectWeights(container, rows) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion) return;
    const MIN = 400, MAX = 900, RADIUS = 150;
    const letters = rows.flatMap(({ row }) => [...row.querySelectorAll('.index-char')].map(node => ({ node, row, weight: MIN })));
    let pointer = null, frame = 0;

    const tick = () => {
        let moving = false;
        for (const letter of letters) {
            let target = MIN;
            if (pointer) {
                const r = letter.node.getBoundingClientRect();
                const d = Math.hypot(pointer.x - (r.left + r.width / 2), (pointer.y - (r.top + r.height / 2)) * 0.6);
                target = MIN + (MAX - MIN) * Math.max(0, 1 - d / RADIUS) ** 2;
            } else if (letter.row === document.activeElement) target = 700;
            letter.weight += (target - letter.weight) * 0.2;
            if (Math.abs(target - letter.weight) > 1) moving = true;
            else letter.weight = target;
            letter.node.style.fontWeight = Math.round(letter.weight);
        }
        frame = moving || pointer ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
    container.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; wake(); });
    container.addEventListener('pointerleave', () => { pointer = null; wake(); });
    container.addEventListener('focusin', wake);
    container.addEventListener('focusout', wake);
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
    const rows = projectIndex(container, projects);
    projectPreview(container, rows);
    projectWeights(container, rows);
    refreshParallax();
}

initProjects();
journey(document.querySelector('.journey'));
clients(document.querySelector('.client-index'));
