import { reducedMotion, lowPower, breakpoint, clamp01, entrance, loadProjects, projectMark, SIGNATURE, INTRO_STEP, introLoaded } from './common.js';
import { extrudedSvg, CELL } from './pixel.js';
import { pixelWrite } from './effects.js';

const isMobile = breakpoint.isMobile;
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

const rgb = color => (color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number));
const lerpColor = (from, to, k) => {
    const a = rgb(from), b = rgb(to);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
};
// a box is a centre, a width (size) and a height as a share of the width (aspect)
const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, size: a.size + (b.size - a.size) * k, aspect: (a.aspect ?? 1) + ((b.aspect ?? 1) - (a.aspect ?? 1)) * k });

/**
 * The signature, one object from the intro to the end of the page. It turns in the middle of the
 * intro, above it, then flies to the navbar and stays there. Each dock is a part of the page with
 * the place the mark takes on screen while the scroll is in it, its shape and its colour; between
 * two docks the mark flies from one place to the other, its pixels reassemble into the next shape
 * and its colour moves to the next one on the way.
 */
export function thread(first) {
    if (isMobile || reducedMotion || !first.length) return null;
    let docks = first;
    docks.forEach(dock => dock.claim?.());
    const canvas = el('canvas', 'thread is-intro');
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const mark = extrudedSvg(canvas, token('--accent'), { morph: true });
    // the signature of the navbar is this pixel solid: the drawn logo is only kept for the link under it
    const logo = document.querySelector('.brand a');
    if (logo) logo.style.opacity = '0';
    let shape = null, color = '', cols = 0, rows = 0, lastY = scrollY, introFrame = null;
    // in the intro it goes through the projects while the page loads, then becomes the signature
    let introMarks = [], loaded = false;
    loadProjects().then(list => { introMarks = list.map(projectMark); }, () => {});
    introLoaded.then(() => { loaded = true; });

    // where the intro put the signature: read while it shows, then kept for the flight
    const introBox = () => {
        const sign = document.querySelector('.page-loader-sign')?.getBoundingClientRect();
        if (sign?.width && entrance() <= 0) introFrame = { x: sign.left + sign.width / 2, y: sign.top + sign.height / 2, size: sign.width };
        return introFrame ?? { x: innerWidth / 2, y: innerHeight / 2, size: 320 };
    };

    const span = dock => {
        const r = dock.el.getBoundingClientRect();
        // a dock that is not tall (the hero on a tablet) still holds while the page is at the top
        return [r.top + scrollY - innerHeight * 0.5, Math.max(0, r.bottom + scrollY - innerHeight * 0.5)];
    };

    const frame = () => {
        requestAnimationFrame(frame);
        const y = scrollY;
        const spans = docks.map(dock => (dock.span ? dock.span() : span(dock)));
        // between two docks the mark flies over at least 60 % of a screen
        const flight = innerHeight * 0.6;
        for (let i = 0; i < spans.length - 1; i++) {
            if (docks[i + 1].late || spans[i + 1][0] - spans[i][1] >= flight) continue;
            const mid = (spans[i][1] + spans[i + 1][0]) / 2;
            spans[i][1] = mid - flight / 2;
            spans[i + 1][0] = mid + flight / 2;
        }
        // a late dock is only flown to at the end, over the last 40 % of a screen before it
        for (let i = 1; i < spans.length; i++) {
            if (docks[i].late) spans[i - 1][1] = Math.max(spans[i - 1][1], spans[i][0] - innerHeight * 0.4);
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
        const next = t > 0 ? docks[from + 1] : docks[from], k = smooth(clamp01(t));
        let box = mix(docks[from].box(), next.box(), k);
        let tint = lerpColor(docks[from].color(), next.color(), k);

        // in the intro it turns where the intro drew it, in red; then it settles in its place and takes its colour
        const since = entrance();
        if (since < 1.6) {
            const m = since <= 0 ? 0 : smooth(clamp01((since - 0.25) / 1.3));
            box = mix(introBox(), box, m);
            tint = lerpColor(token('--accent'), tint, m);
        } else if (canvas.classList.contains('is-intro')) {
            canvas.classList.remove('is-intro');
        }
        // the grid is the site's cell size times a whole number of cells (by fours, so a flight does not
        // rebuild it at every step), and the canvas exactly that size: its pixels are everyone's pixels
        const nextCols = Math.max(4, Math.min(lowPower ? 96 : 400, Math.round(box.size / CELL / 4) * 4));
        const nextRows = Math.max(4, Math.round(nextCols * (box.aspect ?? 1)));
        canvas.style.width = `${nextCols * CELL}px`;
        canvas.style.height = `${nextRows * CELL}px`;
        canvas.style.transform = `translate(${(box.x - (nextCols * CELL) / 2).toFixed(1)}px, ${(box.y - (nextRows * CELL) / 2).toFixed(1)}px)`;

        if (tint !== color) mark.recolor(color = tint);
        mark.face(!!(t > 0.5 ? next : docks[from]).face);
        const target = t > 0.5 ? next : docks[from];
        const nextShape = since <= 0 && !loaded && introMarks.length ? introMarks[Math.floor(performance.now() / INTRO_STEP) % introMarks.length] : target.shape();
        if (nextShape !== shape || nextCols !== cols || nextRows !== rows) {
            shape = nextShape;
            cols = nextCols;
            rows = nextRows;
            mark.show([shape, SIGNATURE], cols, rows);
        }
        // the scroll turns it a little more
        mark.nudge((y - lastY) * 0.003);
        lastY = y;
    };
    requestAnimationFrame(frame);
    return { setDocks: list => { if (!list.length) return; docks = list; docks.forEach(dock => dock.claim?.()); } };
}

const logoBox = () => {
    const r = document.querySelector('.brand img').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width };
};
// at rest the signature sits in the navbar, in the colour the navbar gives its logo
const logoColor = () => getComputedStyle(document.querySelector('.brand a')).color;
const atRest = el => ({ el, color: logoColor, shape: () => SIGNATURE, box: logoBox });

// the big name of the footer, drawn as a mask in its own typeface so the signature can become it
let nameMask = null;
const bigName = () => document.querySelector('.footer-sign .big-name');
const nameShape = () => {
    if (nameMask) return nameMask;
    const name = bigName(), style = getComputedStyle(name);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontWeight} 200px ${style.fontFamily}`;
    const width = ctx.measureText(name.textContent).width;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${Math.floor(200 * 1000 / width)}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.textContent, 512, 512);
    return (nameMask = canvas.toDataURL('image/png'));
};
// the box that puts the mask's letters on the letters of the page: the shape spans 90 % of its canvas
const nameBox = () => {
    const range = document.createRange();
    range.selectNodeContents(bigName());
    const r = range.getBoundingClientRect();
    const style = getComputedStyle(bigName());
    const cap = parseFloat(style.fontSize) * 0.7;
    // a band, not a square: the word is wide and the grid only as tall as the word needs
    return { x: r.left + r.width / 2, y: r.bottom - parseFloat(style.fontSize) * 0.25 - cap / 2, size: r.width / 0.9, aspect: 0.34 };
};
// the drawn name gives its place to the signature that becomes it (only where the signature travels)
const footerDock = footer => ({
    // the name is at the very bottom: the signature reaches it when the page does
    el: footer, face: true, late: true,
    span: () => { const end = document.documentElement.scrollHeight - innerHeight; return [end - 2, Infinity]; }, color: () => getComputedStyle(bigName()).color, shape: nameShape, box: nameBox,
    claim: () => { bigName().style.visibility = 'hidden'; },
});

/** A page with no travelling to do: the signature stays in the navbar, then becomes the name of the footer. */
export const restDocks = () => {
    const footer = document.querySelector('#footer');
    const main = document.querySelector('main');
    return footer && main && bigName() ? [atRest(main), footerDock(footer)] : [atRest(document.body)];
};

/** The docks of the home page: the hero, the showcase, the promise, then the name of the footer. */
export function homeDocks(stage) {
    const black = () => token('--black');
    const docks = [];
    const hero = document.querySelector('.hero-spacer');
    if (hero) docks.push(atRest(hero));
    if (stage) docks.push({
        el: stage.anchor.closest('.showcase'), color: black, shape: () => projectMark(stage.current()),
        box: () => { const r = stage.anchor.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }; },
    });
    const promise = document.querySelector('#promise');
    if (promise) docks.push(atRest(promise));
    const footer = document.querySelector('#footer');
    if (footer && bigName()) docks.push(footerDock(footer));
    return docks;
}
