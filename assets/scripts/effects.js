import { reducedMotion, lowPower, clamp01, throttled, track, entrance, heroEntrance } from './common.js';
import { cellCanvas, CELL, drawCell, dissolve } from './pixel.js';
import { TEXT_ENTRANCE, TEXT_PIXELS, PICTURE, HERO_FRAMES } from './config.js';

const TEXT = '.scrubbing-text, h1, h2, h3, p, li, time, dd, .pullquote, .journey-when, .journey-country';
const SKIP = '.navbar, .mobile-menu, .index-item, .hero-socials, .footer-sign, .clock, .page-loader, .showcase, .project-hero';
const scrubBlocks = [];
const scrubSeen = new WeakSet();
let scrubWired = false;

let introOrder = 0, introWired = false;
export function scrubbingText() {

    if (lowPower) return;
    const SPREAD = TEXT_ENTRANCE.scrubSpreadLetters;

    for (const block of document.querySelectorAll(TEXT)) {
        if (scrubSeen.has(block) || block.closest(SKIP) || block.querySelector(TEXT)) continue;
        scrubSeen.add(block);
        const turn = block.dataset.scrub === 'turn';
        const r = block.getBoundingClientRect();
        const intro = !turn && entrance() === 0 && r.bottom > 0 && r.top < innerHeight ? TEXT_ENTRANCE.firstBlockDelaySeconds + TEXT_ENTRANCE.secondsBetweenBlocks * introOrder++ : null;
        const chars = splitChars(block);
        if (chars.length) scrubBlocks.push({ block, chars, turn, out: block.dataset.scrub === 'out', intro });
    }

    const introHead = entry => (entry.intro == null ? Infinity : (entrance() - entry.intro) * TEXT_ENTRANCE.lettersPerSecond);
    const introSig = (entry, head) => (head >= entry.chars.length - 1 + SPREAD ? 'in' : Math.round(head * 10));

    const paint = () => {
        const readingLine = innerHeight * 0.85;
        for (const entry of scrubBlocks) {
            const { block, chars, turn, out } = entry;
            const r = block.getBoundingClientRect();
            if (r.top > innerHeight || r.bottom < 0 || r.left > innerWidth || r.right < 0) continue;

            const intro = introHead(entry);
            if (out) {
                const gone = clamp01(heroTurn() / 0.5);
                const front = gone * (chars.length - 1 + SPREAD);
                const sig = `${Math.round(front * 100)}|${introSig(entry, intro)}`;
                if (sig === entry.sig) continue;
                entry.sig = sig;
                chars.forEach((char, i) => paintChar(char, Math.min(1 - clamp01((front - i) / SPREAD), clamp01((intro - i) / SPREAD))));
                drawCells(block, chars);
                continue;
            }

            const progress = turn
                ? clamp01((heroTurn() - 0.3) / 0.6)
                : clamp01((readingLine - r.top) / Math.max(r.height, 1));
            const head = progress * (chars.length - 1 + SPREAD);
            const sig = `${Math.round(head * 100)}|${introSig(entry, intro)}`;
            if (sig === entry.sig) continue;
            entry.sig = sig;
            chars.forEach((char, i) => paintChar(char, Math.min(clamp01((head - i) / SPREAD), clamp01((intro - i) / SPREAD))));
            drawCells(block, chars);
        }
    };

    scrubPaint = throttled(paint);
    if (!introWired) {
        introWired = true;

        heroEntrance.then(() => {
            const end = Math.max(0, ...scrubBlocks.filter(entry => entry.intro != null).map(entry => entry.intro + (entry.chars.length + SPREAD) / TEXT_ENTRANCE.lettersPerSecond));
            const frame = () => { scrubPaint(); if (entrance() < end + 0.1) requestAnimationFrame(frame); };
            requestAnimationFrame(frame);
        });
    }
    if (!scrubWired) {
        scrubWired = true;
        ['scroll', 'resize', 'load'].forEach(event => addEventListener(event, () => {
            if (event !== 'scroll') scrubBlocks.forEach(entry => { entry.sig = null; });
            scrubPaint();
        }, { passive: true }));
    }
    paint();
}
let scrubPaint = () => {};

export function pixelWrite(block, text, duration = 0.55) {
    cellLayers.delete(block);
    block.textContent = text;
    if (lowPower) return;
    const SPREAD = 6;
    const chars = splitChars(block);
    const start = performance.now(), end = chars.length - 1 + SPREAD;
    const frame = now => {
        if (!block.isConnected || !chars[0]?.isConnected) return;
        const head = clamp01((now - start) / 1000 / duration) * end;
        chars.forEach((char, i) => paintChar(char, clamp01((head - i) / SPREAD)));
        drawCells(block, chars);
        if (head < end) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

function paintChar(char, t) {
    char.style.opacity = t >= 1 ? '1' : '0';
    const stage = t <= 0 || t >= 1 ? 0 : t < 0.34 ? 1 : t < 0.67 ? 2 : 3;
    if (stage) char.dataset.px = stage;
    else delete char.dataset.px;
}

const glyphGrids = new Map();
const cellLayers = new WeakMap();

function glyphGrid(char, rect, cell) {
    const style = getComputedStyle(char);
    const text = style.textTransform === 'uppercase' ? char.textContent.toUpperCase() : char.textContent;
    const key = `${text}|${style.font}|${style.webkitTextStrokeWidth}|${cell}`;
    let grid = glyphGrids.get(key);
    if (grid) return grid;
    const w = Math.max(1, Math.ceil(rect.width)), h = Math.max(1, Math.ceil(rect.height));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = style.font;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const baseline = (h - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    ctx.fillText(text, 0, baseline);
    const stroke = parseFloat(style.webkitTextStrokeWidth) || 0;
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeText(text, 0, baseline); }
    const data = ctx.getImageData(0, 0, w, h).data;
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    const cover = new Float32Array(cols * rows);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) cover[((y / cell) | 0) * cols + ((x / cell) | 0)] += data[(y * w + x) * 4 + 3] / 255;
    }
    for (let i = 0; i < cover.length; i++) cover[i] /= cell * cell;
    grid = { cols, rows, cover };
    glyphGrids.set(key, grid);
    return grid;
}

function drawCells(host, chars) {
    let layer = cellLayers.get(host);
    if (!layer) {
        const canvas = document.createElement('canvas');
        canvas.className = 'scrubbing-cells';
        canvas.setAttribute('aria-hidden', 'true');
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.append(canvas);
        layer = { canvas, ctx: canvas.getContext('2d') };
        cellLayers.set(host, layer);
    }
    const { canvas, ctx } = layer;
    const hr = host.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(hr.width * dpr), h = Math.round(hr.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    for (const char of chars) {
        const stage = +char.dataset.px;
        if (!stage) continue;
        const r = char.getBoundingClientRect();
        const style = getComputedStyle(char);

        const cell = CELL;
        const { cols, rows, cover } = glyphGrid(char, r, cell);
        ctx.fillStyle = style.color;
        const ox = (r.left - hr.left) * dpr, oy = (r.top - hr.top) * dpr, c = cell * dpr;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const v = cover[j * cols + i];
                const state = stage === 1 ? (v > TEXT_PIXELS.showDotsFromCoverage ? 0 : -1) : stage === 2 ? (v > TEXT_PIXELS.showCheckerFromCoverage ? 1 : -1) : v > TEXT_PIXELS.showSolidFromCoverage ? 2 : -1;
                if (state >= 0) drawCell(ctx, state, ox + i * c, oy + j * c, c);
            }
        }
    }
}

function splitChars(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
        const fragment = document.createDocumentFragment();

        for (const part of node.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
                fragment.append(part);
                continue;
            }
            const word = document.createElement('span');
            word.className = 'scrubbing-word';
            for (const char of part) {
                const span = document.createElement('span');
                span.className = 'scrubbing-char';
                span.textContent = char;
                word.append(span);
            }
            fragment.append(word);
        }
        node.replaceWith(fragment);
    }
    return [...block.querySelectorAll('.scrubbing-char')];
}

const RAMP = PICTURE.appearSeconds;
function appear(brightness, out) {
    const t = clamp01(entrance() / RAMP);
    if (t >= 1) return brightness;
    const k = 1 - (1 - t) ** 3;
    for (let i = 0; i < brightness.length; i++) out[i] = brightness[i] * k;
    return out;
}

const TURN_START = 1.1;
const TURN_LENGTH = 1.0;
let screenHeight = innerHeight;
const measureScreen = () => { screenHeight = document.getElementById('header')?.offsetHeight || innerHeight; };
measureScreen();
addEventListener('resize', measureScreen, { passive: true });
const heroTurn = () => clamp01((scrollY / screenHeight - TURN_START) / TURN_LENGTH);

export function parallax() {
    const hero = document.querySelector('#header, .about-header');
    let items = [];

    const measure = () => {
        if (reducedMotion) return;
        items = [...document.querySelectorAll('[data-parallax-speed]')].map(el => {
            el.style.transform = '';
            const r = el.getBoundingClientRect();
            return { el, factor: el.dataset.parallaxSpeed / 100 - 1, center: r.top + scrollY + r.height / 2 };
        });
    };

    const update = () => {
        const start = Math.max(0, hero.offsetHeight - innerHeight);
        const length = Math.min(hero.offsetHeight, innerHeight) || 1;
        hero.style.setProperty('--hero-progress', clamp01((scrollY - start) / length).toFixed(4));
        if (hero.id === 'header') {
            const turn = heroTurn();
            hero.style.setProperty('--turn', turn.toFixed(4));
            hero.classList.toggle('is-turned', turn > 0.45);
        }

        const viewportCenter = scrollY + innerHeight / 2;
        for (const { el, factor, center } of items) {
            if (factor) el.style.transform = `translateY(${(center - viewportCenter) * factor}px)`;
        }
    };

    const refresh = () => {
        measure();
        update();
    };

    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', refresh, { passive: true });
    addEventListener('load', refresh);
    refresh();
    return refresh;
}

function pixelHero(host) {
    const { url, width, height, columns, turnFrames, swayFrames } = HERO_FRAMES;
    const canvas = document.createElement('canvas');
    canvas.id = 'hero-pixels';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const cells = cellCanvas(canvas, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });

    const frames = new Image();
    track(url, new Promise(resolve => { frames.addEventListener('load', resolve, { once: true }); frames.addEventListener('error', resolve, { once: true }); }));
    frames.src = url;

    const sways = !reducedMotion && matchMedia('(hover: hover)').matches;
    const gap = lowPower ? HERO_FRAMES.refreshMsLowPower : HERO_FRAMES.refreshMs;
    let base = null, dim = null, shown = 0, lastIndex = -1, lastBox = '', lastDraw = 0;

    const draw = now => {
        requestAnimationFrame(draw);
        if (now - lastDraw < gap) return;
        lastDraw = now;
        if (!frames.naturalWidth || canvas.style.visibility === 'hidden') return;
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        if (!w || !h) return;
        const box = `${w}x${h}`;
        if (box !== lastBox) {
            lastBox = box;
            cells.resize(Math.ceil(w / CELL), Math.ceil(h / CELL));
            sample.width = cells.cols; sample.height = cells.rows;
            base = new Uint8Array(cells.cols * cells.rows);
            dim = new Uint8Array(cells.cols * cells.rows);
            lastIndex = -1;
        }

        const turn = reducedMotion ? 0 : heroTurn();
        const sway = sways ? swayFrames * (0.5 + 0.5 * Math.sin(now / 2600)) * (1 - clamp01(turn * 6)) : 0;
        shown += (turn * (turnFrames - 1) + sway - shown) * 0.2;
        const index = Math.min(turnFrames, Math.round(shown));
        if (index !== lastIndex) {
            lastIndex = index;
            const boxShape = w / h, frameShape = width / height;
            const sw = boxShape > frameShape ? width : height * boxShape, sh = boxShape > frameShape ? width / boxShape : height;
            // The head drifts left as it turns: on a narrow crop, follow it so it stays in frame.
            const sx = Math.max(0, Math.min(width - sw, width * (0.5 - 0.09 * turn) - sw / 2));
            const fx = (index % columns) * width, fy = Math.floor(index / columns) * height;
            sampleCtx.drawImage(frames, fx + sx, fy + (height - sh) / 2, sw, sh, 0, 0, cells.cols, cells.rows);
            const rgba = sampleCtx.getImageData(0, 0, cells.cols, cells.rows).data;
            for (let i = 0; i < base.length; i++) base[i] = rgba[i * 4];
        }
        cells.paint(appear(base, dim));
    };
    requestAnimationFrame(draw);
    return canvas;
}

export function heroPortrait() {
    const hero = document.querySelector('.about-header, #header');
    if (!hero) return;
    const home = hero.id === 'header';
    const spacer = document.querySelector('.hero-spacer');
    const past = () => hero.classList.toggle('is-past', home
        ? scrollY > (spacer?.offsetHeight || innerHeight) + innerHeight
        : scrollY > hero.offsetHeight);
    addEventListener('scroll', throttled(past), { passive: true });
    addEventListener('resize', past, { passive: true });
    past();
    if (!home) return;

    const canvas = pixelHero(hero);
    const hideWhenCovered = () => { canvas.style.visibility = scrollY >= spacer.offsetHeight ? 'hidden' : ''; };
    addEventListener('scroll', throttled(hideWhenCovered), { passive: true });
    hideWhenCovered();
}

export function pixelReveal(hosts) {
    if (reducedMotion) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--black').trim();
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        const start = () => {
            target.classList.remove('is-waiting');
            pixelCover(target, color).show();
        };
        const image = target.querySelector('img');
        if (image) image.decode().then(start, start);
        else start();
    }), { threshold: 0.12 });
    hosts.forEach(host => {
        host.classList.add('is-waiting');
        observer.observe(host);
    });
}

export function pixelPicture(host, src, { mirror = false, gain = PICTURE.defaultGain, color = '#fff', active = () => true, intro = false, anchor = 0.25, center = 0.5, fit = 'cover', focus = 0, watch = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);
    const cells = cellCanvas(canvas, color);
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    sampleCtx.imageSmoothingQuality = 'high';
    const source = new Image();
    let brightness = null, dim = null;

    const paint = () => {
        if (!brightness) return;
        if (!intro) return cells.paint(brightness);
        if (dim?.length !== brightness.length) dim = new Uint8Array(brightness.length);
        cells.paint(appear(brightness, dim));
    };

    const render = () => {
        const cols = Math.ceil(host.clientWidth / CELL), rows = Math.ceil(host.clientHeight / CELL);
        if (!cols || !rows || !source.naturalWidth) return;
        const invert = getComputedStyle(host).getPropertyValue('--invert').trim() === '1';
        cells.resize(cols, rows);
        sample.width = cols; sample.height = rows;
        let scale = (fit === 'contain' ? Math.min : Math.max)(cols / source.naturalWidth, rows / source.naturalHeight);
        if (focus) scale = Math.max(scale, Math.min(cols / (source.naturalWidth * focus), rows / source.naturalHeight));
        const w = source.naturalWidth * scale, h = source.naturalHeight * scale;
        sampleCtx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? cols : 0, 0);
        sampleCtx.fillStyle = invert ? '#fff' : '#000';
        sampleCtx.fillRect(0, 0, cols, rows);
        sampleCtx.drawImage(source, cols / 2 - center * w, (rows - h) * anchor, w, h);
        const rgba = sampleCtx.getImageData(0, 0, cols, rows).data;
        brightness = new Uint8Array(cols * rows);
        for (let i = 0; i < brightness.length; i++) { const luma = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114; brightness[i] = invert ? 255 - luma : Math.min(255, luma * gain); }
        paint();
    };

    source.onload = render;
    track(src, new Promise(resolve => { source.addEventListener('load', resolve, { once: true }); source.addEventListener('error', resolve, { once: true }); }));
    source.src = src;
    addEventListener('resize', render, { passive: true });
    const watcher = watch ? new ResizeObserver(render) : null;
    watcher?.observe(host);
    const timer = setInterval(() => active() && paint(), lowPower ? PICTURE.refreshMsLowPower : PICTURE.refreshMs);
    if (intro) heroEntrance.then(() => {
        const frame = () => { paint(); if (entrance() < RAMP) requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
    });
    return { destroy() { clearInterval(timer); watcher?.disconnect(); removeEventListener('resize', render); canvas.remove(); } };
}

// A host marked "is-covered" keeps its picture hidden until the cover has painted its first frame.
export function pixelCover(host, color, size) {
    let layer = null;
    const run = (reverse, done) => {
        const previous = layer;
        if (reducedMotion) {
            previous?.remove();
            layer = null;
            host.classList.remove('is-covered');
            done?.();
            return;
        }
        layer = dissolve(host, { color, size, total: 800, reverse }, canvas => {
            if (!reverse) { canvas.remove(); layer = null; }
            done?.();
        });
        host.classList.remove('is-covered');
        previous?.remove();
    };
    return {
        show() { run(false); },
        hide(done) { run(true, done); },
    };
}
