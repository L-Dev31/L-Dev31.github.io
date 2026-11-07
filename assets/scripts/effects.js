import { reducedMotion, lowPower, clamp01, throttled, breakpoint, track, entrance, heroEntrance } from './common.js';
import { cellCanvas, CELL, drawCell, dissolve } from './pixel.js';
import { TEXT_ENTRANCE, HERO_PICTURE_RAMP_SECONDS } from './config.js';

const isMobile = breakpoint.isMobile;

const TEXT = '.scrubbing-text, h1, h2, h3, p, li, time, dd, .journey-when, .journey-country';
const SKIP = '.navbar, .mobile-menu, .index-item, .hero-socials, .footer-sign, .clock, .page-loader, .showcase';
const scrubBlocks = [];
const scrubSeen = new WeakSet();
let scrubWired = false;

let introOrder = 0, introWired = false;
export function scrubbingText() {

    if (isMobile || reducedMotion) return;
    const SPREAD = 10;

    const touch = matchMedia('(max-width: 1024px)');
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
                const gone = touch.matches ? 0 : clamp01(heroTurn() / 0.5);
                const front = gone * (chars.length - 1 + SPREAD);
                const sig = `${Math.round(front * 100)}|${introSig(entry, intro)}`;
                if (sig === entry.sig) continue;
                entry.sig = sig;
                chars.forEach((char, i) => paintChar(char, Math.min(1 - clamp01((front - i) / SPREAD), clamp01((intro - i) / SPREAD))));
                drawCells(block, chars);
                continue;
            }

            const progress = turn
                ? (touch.matches ? 1 : clamp01((heroTurn() - 0.3) / 0.6))
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

export function scrollyScenes() {
    const SPREAD = 12;
    const scenes = [];
    const selector = '.project-main .case-intro, .project-main .case-pullquote, .project-main .case-chapter';

    if (isMobile || reducedMotion) {
        document.querySelectorAll(selector).forEach(section => {
            section.classList.add('case-scene', 'case-scene--static');
            section.querySelectorAll('.case-row').forEach(row => row.classList.add('visible'));
        });
        return;
    }

    for (const chapter of document.querySelectorAll('.project-main .case-chapter')) {
        const rows = [...chapter.querySelectorAll(':scope > .case-row')];
        if (rows.length < 2) continue;

        const title = chapter.querySelector(':scope > .title');
        const sequence = [...chapter.children];
        const fragment = document.createDocumentFragment();
        let rowIndex = 0;

        for (const child of sequence) {
            if (child.classList.contains('case-row')) {
                const scene = document.createElement('section');
                scene.className = 'case-chapter';
                if (rowIndex === 0 && chapter.id) scene.id = chapter.id;
                if (rowIndex === 0 && title) scene.append(title);
                scene.append(child);
                fragment.append(scene);
                rowIndex++;
            } else if (child !== title) {

                fragment.append(child);
            }
        }
        chapter.replaceWith(fragment);
    }

    for (const section of document.querySelectorAll(selector)) {
        section.classList.add('case-scene');
        const pin = document.createElement('div');
        pin.className = 'case-scene-pin';
        pin.append(...section.childNodes);
        section.append(pin);
        const chars = [];

        for (const el of pin.querySelectorAll('h1, h3, p, blockquote, li, figcaption')) chars.push(...splitChars(el));

        section.querySelectorAll('.case-row').forEach(el => el.classList.add('visible'));

        const padTop = pin.getBoundingClientRect().top - section.getBoundingClientRect().top;
        scenes.push({ section, pin, padTop, chars });
    }
    if (!scenes.length) return;

    const paintChars = (revealT, chars, host) => {
        const head = revealT * (chars.length - 1 + SPREAD);
        for (let i = 0; i < chars.length; i++) {
            const t = clamp01((head - i) / SPREAD);
            paintChar(chars[i], t);
        }
        if (host) drawCells(host, chars);
    };

    const paint = () => {
        const vh = innerHeight;
        for (const { section, pin, padTop, chars } of scenes) {
            const r = section.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vh) continue;
            const travel = Math.max(r.height - vh, 1);
            const pinH = pin.offsetHeight;

            const pinned = r.height - vh > vh * 0.3 && pinH <= vh;
            if (!pinned) {

                paintChars(clamp01(((vh * 0.9 - r.top) / travel) / 0.62), chars, pin);
                if (pin.dataset.scrubbed) {
                    pin.style.opacity = '';
                    pin.style.transform = '';
                    delete pin.dataset.scrubbed;
                }
                continue;
            }

            const topMax = (vh - pinH) / 2;
            const stuckMax = Math.max(r.height - padTop - pinH, 0);
            const stuck = Math.min(Math.max(topMax - r.top - padTop, 0), stuckMax);
            paintChars(clamp01(stuck / Math.max(stuckMax * 0.62, 1)), chars, pin);

            const fadeIn = clamp01(stuck / 150);
            const out = clamp01((stuck / Math.max(stuckMax, 1) - 0.80) / 0.20);
            pin.style.opacity = (fadeIn * (1 - out)).toFixed(3);
            pin.style.transform = stuck ? `translate3d(0, ${stuck.toFixed(1)}px, 0)` : '';
            pin.dataset.scrubbed = '1';
        }
    };

    const schedule = throttled(paint);
    ['scroll', 'resize', 'load'].forEach(event => addEventListener(event, schedule, { passive: true }));
    paint();
}

export function pixelWrite(block, text, duration = 0.55) {
    cellLayers.delete(block);
    block.textContent = text;
    if (isMobile || reducedMotion) return;
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
                const state = stage === 1 ? (v > 0.15 ? 0 : -1) : stage === 2 ? (v > 0.25 ? 1 : -1) : v > 0.4 ? 2 : -1;
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

const RAMP = HERO_PICTURE_RAMP_SECONDS;
function appear(brightness, out) {
    const t = clamp01(entrance() / RAMP);
    if (t >= 1) return brightness;
    const k = 1 - (1 - t) ** 3;
    for (let i = 0; i < brightness.length; i++) out[i] = brightness[i] * k;
    return out;
}

const TURN_START = 1.1;
const TURN_LENGTH = 1.0;
const heroTurn = () => clamp01((scrollY / innerHeight - TURN_START) / TURN_LENGTH);

export function parallax() {
    const hero = document.querySelector('#header, .about-header');
    let items = [];

    const measure = () => {
        if (isMobile || reducedMotion) return;
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

function pixelHero(video) {
    const canvas = document.createElement('canvas');
    canvas.id = 'hero-pixels';
    canvas.setAttribute('aria-hidden', 'true');
    video.after(canvas);
    const cells = cellCanvas(canvas, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    let base = null, dim = null, lastTime = -1, lastBox = '';

    const gap = lowPower ? 80 : 33;
    let lastDraw = 0;

    const draw = now => {
        requestAnimationFrame(draw);
        if (now - lastDraw < gap) return;
        lastDraw = now;
        if (video.readyState < 2 || !video.videoWidth || canvas.style.visibility === 'hidden') return;
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        if (!w || !h) return;
        const box = `${w}x${h}`;
        if (box !== lastBox) {
            lastBox = box;
            const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
            cells.resize(cols, rows);
            sample.width = cols; sample.height = rows;
            base = new Uint8Array(cols * rows);
            dim = new Uint8Array(cols * rows);
            lastTime = -1;
        }
        if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;

            const va = video.videoWidth / video.videoHeight, ba = w / h;
            const sw = ba > va ? video.videoWidth : video.videoHeight * ba, sh = ba > va ? video.videoWidth / ba : video.videoHeight;
            sampleCtx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, cells.cols, cells.rows);
            const rgba = sampleCtx.getImageData(0, 0, cells.cols, cells.rows).data;
            for (let i = 0; i < base.length; i++) base[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
        }
        cells.paint(appear(base, dim));
    };
    requestAnimationFrame(draw);
    return canvas;
}

export function scrollScrubbedVideo() {
    const hero = document.querySelector('.about-header, #header');
    if (!hero) return;
    const home = hero.id === 'header';
    if (home) {

        const spacer = document.querySelector('.hero-spacer');
        const past = () => hero.classList.toggle('is-past', getComputedStyle(hero).position === 'fixed' && scrollY > (spacer?.offsetHeight || innerHeight) + innerHeight);
        addEventListener('scroll', throttled(past), { passive: true });
        addEventListener('resize', past, { passive: true });
        past();
    }
    const video = hero.querySelector('video');
    if (!video) return;
    pixelHero(video);
    const layers = hero.querySelectorAll('video, canvas, .about-header-overlay, .about-header-text');

    video.pause();
    if (reducedMotion) return;
    if (isMobile) {
        video.loop = true;
        video.play().catch(() => {});
        return;
    }
    video.currentTime = 0;

    let target = 0, frame = null, waitingForFrame = false;

    const seek = () => {
        frame = null;
        if (!video.duration) {
            frame = requestAnimationFrame(seek);
            return;
        }
        const diff = target - video.currentTime;
        if (Math.abs(diff) < 0.02) {
            video.pause();
            video.playbackRate = 1;
        } else if (diff > 0) {
            const rate = Math.min(8, Math.max(0.25, diff * 6));
            if (Math.abs(video.playbackRate - rate) > 0.05) video.playbackRate = rate;
            if (video.paused) video.play().catch(() => {});
            frame = requestAnimationFrame(seek);
        } else {
            video.pause();
            video.currentTime = Math.max(0, video.currentTime + diff * 0.35);
            if (!video.requestVideoFrameCallback) {
                frame = requestAnimationFrame(seek);
                return;
            }
            waitingForFrame = true;
            video.requestVideoFrameCallback(() => {
                waitingForFrame = false;
                frame = requestAnimationFrame(seek);
            });
        }
    };

    const spacer = home && document.querySelector('.hero-spacer');
    const onScroll = () => {
        if (!video.duration) return;
        if (home) {

            const sway = reducedMotion ? 0 : 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 2600)) * (1 - clamp01(heroTurn() * 6));
            target = heroTurn() * video.duration / 2 + sway;
        } else {
            const scrollable = hero.offsetHeight - innerHeight;
            if (scrollable <= 0) return;
            target = clamp01(-hero.getBoundingClientRect().top / scrollable) * video.duration;
        }
        if (!frame && !waitingForFrame) frame = requestAnimationFrame(seek);

        const scrolledPast = scrollY >= (home && spacer.offsetHeight || hero.offsetHeight);
        layers.forEach(el => el.style.visibility = scrolledPast ? 'hidden' : '');
    };

    if (home) setInterval(onScroll, 90);
    video.addEventListener('loadedmetadata', onScroll);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();
}

export function pixelPicture(host, src, { mirror = false, gain = 1.3, color = '#fff', active = () => true, intro = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);
    const cells = cellCanvas(canvas, color);
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
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
        const scale = Math.max(cols / source.naturalWidth, rows / source.naturalHeight);
        const w = source.naturalWidth * scale, h = source.naturalHeight * scale;
        sampleCtx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? cols : 0, 0);
        sampleCtx.drawImage(source, (cols - w) / 2, (rows - h) * 0.25, w, h);
        const rgba = sampleCtx.getImageData(0, 0, cols, rows).data;
        brightness = new Uint8Array(cols * rows);
        for (let i = 0; i < brightness.length; i++) { const luma = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114; brightness[i] = invert ? 255 - luma : Math.min(255, luma * gain); }
        paint();
    };

    source.onload = render;
    track(src, new Promise(resolve => { source.addEventListener('load', resolve, { once: true }); source.addEventListener('error', resolve, { once: true }); }));
    source.src = src;
    addEventListener('resize', render, { passive: true });
    const timer = setInterval(() => active() && paint(), lowPower ? 400 : 120);
    if (intro) heroEntrance.then(() => {
        const frame = () => { paint(); if (entrance() < RAMP) requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
    });
    return { destroy() { clearInterval(timer); removeEventListener('resize', render); canvas.remove(); } };
}

export function pixelCover(host, color, size) {
    let layer = null;
    const run = (reverse, done) => {
        layer?.remove();
        if (reducedMotion) { layer = null; done?.(); return; }
        layer = dissolve(host, { color, size, total: 800, reverse }, canvas => {
            if (!reverse) { canvas.remove(); layer = null; }
            done?.();
        });
    };
    return {
        show() { run(false); },
        hide(done) { run(true, done); },
    };
}
