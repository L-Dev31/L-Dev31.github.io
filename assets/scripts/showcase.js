import { reducedMotion, lowPower, breakpoint, clamp01, entrance } from './common.js';
import { extrudedSvg, CELL } from './pixel.js';
import { pixelWrite } from './effects.js';

const isMobile = breakpoint.isMobile;
const SIGNATURE = 'assets/images/core/logo.svg';
export const projectMark = project => project.svg || `assets/images/projects/icons/${project.id}.svg`;
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const smooth = t => t * t * (3 - 2 * t);

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

// the name is as large as the screen allows it: a long title gets a smaller size
const fit = title => `${Math.min(13, 88 / (title.length * 0.46)).toFixed(2)}vw`;

/**
 * The selected projects, one screen each: the section holds still while the scroll goes through
 * them, each with its name in large, its pixel mark in front of it, its role and a way in.
 * The list below it stays the way to reach them with a keyboard or a screen reader.
 */
export function showcase(container, projects, lenis) {
    if (!container || !projects.length) return null;
    const listeners = new Set();
    container.style.setProperty('--count', projects.length);
    container.setAttribute('aria-hidden', 'true');

    const stage = el('div', 'showcase-stage');
    const count = el('p', 'showcase-count');
    const title = el('p', 'showcase-title');
    const link = el('a', 'showcase-link');
    link.dataset.cursor = 'View';
    link.tabIndex = -1;
    link.append(title);
    const tags = el('ul', 'index-tags showcase-tags');
    const left = el('div', 'showcase-side showcase-left');
    left.append(tags);
    const role = el('p', 'index-role');
    const text = el('p', 'index-text');
    const go = el('a', 'index-go showcase-go', 'Read the case study ');
    go.append(el('span', '', '↗'));
    go.tabIndex = -1;
    const right = el('div', 'showcase-side showcase-right');
    right.append(role, text, go);
    const steps = el('div', 'showcase-steps');
    const anchor = el('div', 'showcase-anchor');
    stage.append(count, link, left, right, steps, anchor);
    container.replaceChildren(stage);

    // where the scroll is in the section, from 0 to 1
    const travel = () => Math.max(1, container.offsetHeight - innerHeight);
    const toStep = i => {
        const y = container.getBoundingClientRect().top + scrollY + ((i + 0.5) / projects.length) * travel();
        if (lenis) lenis.scrollTo(y, { duration: 1.1 });
        else scrollTo({ top: y, behavior: reducedMotion ? 'auto' : 'smooth' });
    };
    projects.forEach((project, i) => {
        const step = el('button', 'showcase-step');
        step.type = 'button';
        step.tabIndex = -1;
        step.dataset.cursor = String(i + 1).padStart(2, '0');
        step.addEventListener('click', () => toStep(i));
        steps.append(step);
    });

    // with no thread to carry it (a phone, reduced motion), each mark is a still picture
    let still = null;
    if (isMobile || reducedMotion) {
        still = el('img', 'showcase-mark');
        still.alt = '';
        anchor.append(still);
    }

    let index = -1;
    const set = i => {
        const first = index === -1;
        index = i;
        const project = projects[i];
        count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
        link.href = go.href = `project.html?id=${project.id}`;
        title.style.setProperty('--fit', fit(project.title));
        if (first) title.textContent = project.title;
        else pixelWrite(title, project.title);
        tags.replaceChildren(el('li', 'index-tag', project.category), ...(project.tags || []).slice(0, 3).map(tag => el('li', 'index-tag', tag)));
        role.textContent = `Role: ${project.role}`;
        text.textContent = project.subtitle;
        if (still) still.src = projectMark(project);
        stage.classList.remove('is-changing');
        void stage.offsetWidth;
        stage.classList.add('is-changing');
        [...steps.children].forEach((step, k) => step.classList.toggle('is-current', k === i));
        listeners.forEach(fn => fn(project));
    };

    let queued = false;
    const update = () => {
        queued = false;
        const p = clamp01(-container.getBoundingClientRect().top / travel());
        const next = Math.min(projects.length - 1, Math.floor(p * projects.length));
        if (next !== index) set(next);
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();

    return {
        anchor,
        current: () => projects[Math.max(0, index)],
        onChange: fn => listeners.add(fn),
    };
}

/**
 * The signature, carried from the intro through the page. Each dock is a part of the page with
 * the place the mark takes on screen while the scroll is in it, its shape and its colour; between
 * two docks the mark flies from one place to the other, and its pixels reassemble into the next
 * shape halfway.
 */
export function thread(docks) {
    if (isMobile || reducedMotion || !docks.length) return;
    const canvas = el('canvas', 'thread');
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const mark = extrudedSvg(canvas, docks[0].color());
    let shape = null, color = docks[0].color(), cols = 0, lastY = scrollY;

    const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, size: a.size + (b.size - a.size) * k });
    const introBox = () => {
        const size = parseFloat(getComputedStyle(document.querySelector('.page-loader')).getPropertyValue('--sign')) || 320;
        // the intro centres the signature above its bar and readout
        const sign = document.querySelector('.page-loader-sign')?.getBoundingClientRect();
        return sign?.width ? { x: sign.left + sign.width / 2, y: sign.top + sign.height / 2, size: sign.width } : { x: innerWidth / 2, y: innerHeight / 2, size };
    };

    const span = dock => {
        const r = dock.el.getBoundingClientRect();
        return [r.top + scrollY - innerHeight * 0.5, r.bottom + scrollY - innerHeight * 0.5];
    };

    const frame = () => {
        requestAnimationFrame(frame);
        const y = scrollY;
        const spans = docks.map(span);
        // between two docks the mark flies over at least 60 % of a screen
        const flight = innerHeight * 0.6;
        for (let i = 0; i < spans.length - 1; i++) {
            if (spans[i + 1][0] - spans[i][1] >= flight) continue;
            const mid = (spans[i][1] + spans[i + 1][0]) / 2;
            spans[i][1] = mid - flight / 2;
            spans[i + 1][0] = mid + flight / 2;
        }
        let from = docks.length - 1, t = 0;
        for (let i = 0; i < spans.length; i++) {
            if (y <= spans[i][1]) { from = i; break; }
            if (i < spans.length - 1 && y < spans[i + 1][0]) {
                from = i;
                t = (y - spans[i][1]) / (spans[i + 1][0] - spans[i][1]);
                break;
            }
        }
        const a = docks[from].box(), b = t > 0 ? docks[from + 1].box() : a;
        let box = mix(a, b, smooth(clamp01(t)));
        // it leaves the intro where the intro drew it, in the middle, and settles in its place
        const since = entrance();
        canvas.style.opacity = since > 0 ? '' : '0';
        if (since < 1.6) box = mix(introBox(), box, smooth(clamp01((since - 0.25) / 1.3)));
        canvas.style.width = `${box.size}px`;
        canvas.style.transform = `translate(${(box.x - box.size / 2).toFixed(1)}px, ${(box.y - box.size / 2).toFixed(1)}px)`;
        const size = box.size;

        const target = t > 0.5 ? docks[from + 1] : docks[from];
        // red like the intro while it leaves it, then the colour of the part it is in
        const nextColor = since < 1.1 ? token('--accent') : target.color();
        if (nextColor !== color) mark.recolor(color = nextColor);
        // as many cells as the size takes at the site's cell size, by fours, within what a frame can draw
        const nextCols = Math.max(16, Math.min(lowPower ? 32 : 44, Math.round(size / CELL / 4) * 4));
        const nextShape = target.shape();
        if (nextShape !== shape || nextCols !== cols) {
            shape = nextShape;
            cols = nextCols;
            mark.show([shape, SIGNATURE], cols);
        }
        // the scroll turns it a little more
        mark.nudge((y - lastY) * 0.003);
        lastY = y;
    };
    requestAnimationFrame(frame);
}

/** The docks of the home page: the hero, the showcase, then the promise and the footer. */
export function homeDocks(stage) {
    const accent = () => token('--accent'), black = () => token('--black'), white = () => token('--white');
    const edge = () => parseFloat(getComputedStyle(document.querySelector('.header-content') || document.body).left) || 40;
    const small = () => Math.max(96, Math.min(150, Math.min(innerWidth, innerHeight) * 0.14));
    const corner = () => {
        // under the menu button, on the right
        const s = small(), bar = document.querySelector('.navbar')?.getBoundingClientRect().bottom ?? 80;
        return { x: innerWidth - edge() - s / 2, y: bar + 24 + s / 2, size: s };
    };
    const docks = [];
    const hero = document.querySelector('.hero-spacer');
    if (hero) docks.push({
        // white over the red pixels of the portrait
        el: hero, color: white, shape: () => SIGNATURE,
        // low on the right, level with the title
        box: () => { const s = small(); return { x: innerWidth - edge() - s / 2, y: innerHeight - edge() - s / 2, size: s }; },
    });
    if (stage) docks.push({
        el: stage.anchor.closest('.showcase'), color: black, shape: () => projectMark(stage.current()),
        box: () => { const r = stage.anchor.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }; },
    });
    const promise = document.querySelector('#promise');
    if (promise) docks.push({ el: promise, color: accent, shape: () => SIGNATURE, box: corner });
    const footer = document.querySelector('#footer');
    if (footer) docks.push({ el: footer, color: black, shape: () => SIGNATURE, box: corner });
    return docks;
}
