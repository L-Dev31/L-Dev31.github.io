// Scroll and mouse effects used on the home, about and project pages.
import { reducedMotion, clamp01, throttled, breakpoint } from './common.js';
import { cellCanvas, CELL } from './pixel.js';

const isMobile = breakpoint.isMobile;

// Every character of .scrubbing-text fades in, flashing red, in reading order as the block scrolls up.
export function scrubbingText() {
    // Reading stays immediate on touch screens; splitting every character there
    // adds work without making the content easier to read.
    if (isMobile || reducedMotion) return;
    const SPREAD = 10; // how many characters are mid-transition at once

    const touch = matchMedia('(max-width: 1024px)');
    const blocks = [...document.querySelectorAll('.scrubbing-text')].map(block => ({
        block,
        chars: splitChars(block),
        turn: block.dataset.scrub === 'turn',
        small: parseFloat(getComputedStyle(block).fontSize) < 40,
        out: block.dataset.scrub === 'out',
    }));

    const paint = () => {
        const readingLine = innerHeight * 0.7;
        for (const { block, chars, turn, out } of blocks) {
            const r = block.getBoundingClientRect();
            if (r.top > innerHeight || r.bottom < 0) continue;
            // The hero name and subtitle scrub out in cells as the face turns.
            if (out) {
                const gone = touch.matches ? 0 : clamp01(heroTurn() / 0.5);
                const front = gone * (chars.length - 1 + SPREAD);
                chars.forEach((char, i) => paintChar(char, 1 - clamp01((front - i) / SPREAD)));
                drawCells(block, chars);
                continue;
            }
            // The home about brief burns in with the turn of the face, not with its own position (it does not move).
            const progress = turn
                ? (touch.matches ? 1 : clamp01((heroTurn() - 0.3) / 0.6))
                : clamp01((readingLine - r.top) / Math.max(r.height, 1));
            const head = progress * (chars.length - 1 + SPREAD);
            chars.forEach((char, i) => paintChar(char, clamp01((head - i) / SPREAD)));
            drawCells(block, chars);
        }
    };

    const schedule = throttled(paint);
    ['scroll', 'resize', 'load'].forEach(event => addEventListener(event, schedule, { passive: true }));
    paint();
}

// Project pages: case study text pins in place while scrolling (JS-driven so it
// works regardless of the scroll container). Its characters fade in with scroll
// progress (scrubbing), then the whole scene fades out so the next one can
// take over. On mobile / reduced motion there is no pin, just a progressive reveal.
export function scrollyScenes() {
    const SPREAD = 12; // how many characters are mid-transition at once
    const scenes = [];
    const selector = '.project-main .case-intro, .project-main .case-pullquote, .project-main .case-chapter';

    // Mobile and tablet use a normal reading flow. It keeps every paragraph and
    // image visible immediately, avoids pinned sections, and uses less battery.
    if (isMobile || reducedMotion) {
        document.querySelectorAll(selector).forEach(section => {
            section.classList.add('case-scene', 'case-scene--static');
            section.querySelectorAll('.case-row').forEach(row => row.classList.add('visible'));
        });
        return;
    }

    // A chapter with several rows is too tall to pin as one unit. Split it into
    // row-sized chapters so each visual/text pair gets its own scroll scene.
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
                // Keep galleries and other supporting content in their original
                // order between the row scenes, where they can scroll naturally.
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
        // Titles (.title) are left untouched: no scrubbing, exactly as before.
        for (const el of pin.querySelectorAll('h1, h3, p, blockquote, li, figcaption')) chars.push(...splitChars(el));
        // Rows skip the IntersectionObserver reveal (the scrub drives their
        // contents); titles keep the standard index reveal animation.
        section.querySelectorAll('.case-row').forEach(el => el.classList.add('visible'));
        // Distance from the section top to the pin top (section padding): the pin
        // is explicitly centered, so any padding is compensated instead of eaten.
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
            // Pin only if the scene is tall and the pin fits on screen: the pin
            // floats centered (never top-anchored full-bleed). Otherwise natural
            // scroll with a plain progressive reveal.
            const pinned = r.height - vh > vh * 0.3 && pinH <= vh;
            if (!pinned) {
                // Natural scroll: progressive reveal, no fade-out.
                paintChars(clamp01(((vh * 0.9 - r.top) / travel) / 0.62), chars, pin);
                if (pin.dataset.scrubbed) {
                    pin.style.opacity = '';
                    pin.style.transform = '';
                    delete pin.dataset.scrubbed;
                }
                continue;
            }
            // Glue the pin to the viewport center while its section travels, keeping
            // it inside the section. Reveal runs during the stuck phase; the fade-out
            // ends exactly at handoff so the next scene takes over without a gap.
            const topMax = (vh - pinH) / 2;
            const stuckMax = Math.max(r.height - padTop - pinH, 0);
            const stuck = Math.min(Math.max(topMax - r.top - padTop, 0), stuckMax);
            paintChars(clamp01(stuck / Math.max(stuckMax * 0.62, 1)), chars, pin);
            // No rise-and-fade: the pin stays invisible while traveling, fades in
            // once centered, then fades out at handoff.
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

// A character of a reveal at t (0 hidden, 1 shown) is drawn as terminal cells that ignore its outline, so the shape is
// deformed rather than clipped: dots, then diamonds, then pixels, then the crisp glyph.
function paintChar(char, t) {
    char.style.opacity = t >= 1 ? '1' : '0';
    const stage = t <= 0 || t >= 1 ? 0 : t < 0.34 ? 1 : t < 0.67 ? 2 : 3;
    if (stage) char.dataset.px = stage;
    else delete char.dataset.px;
}

const glyphGrids = new Map();
const cellLayers = new WeakMap();

// Coverage of the glyph on a grid of cells, cached per character and font.
function glyphGrid(char, rect, cell) {
    const style = getComputedStyle(char);
    const key = `${char.textContent}|${style.font}|${style.webkitTextStrokeWidth}|${cell}`;
    let grid = glyphGrids.get(key);
    if (grid) return grid;
    const w = Math.max(1, Math.ceil(rect.width)), h = Math.max(1, Math.ceil(rect.height));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = style.font;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(char.textContent);
    const baseline = (h - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    ctx.fillText(char.textContent, 0, baseline);
    const stroke = parseFloat(style.webkitTextStrokeWidth) || 0;
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeText(char.textContent, 0, baseline); }
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

// Draws the characters in a stage on a canvas laid over `host`.
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
        const cell = Math.max(3, Math.round(parseFloat(style.fontSize) * 0.13));
        const { cols, rows, cover } = glyphGrid(char, r, cell);
        ctx.fillStyle = style.color;
        const ox = (r.left - hr.left) * dpr, oy = (r.top - hr.top) * dpr, c = cell * dpr;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const v = cover[j * cols + i];
                const x = ox + i * c, y = oy + j * c;
                if (stage === 1 && v > 0.18) ctx.fillRect(x + c * 0.36, y + c * 0.36, c * 0.28, c * 0.28);
                else if (stage === 2 && v > 0.3) {
                    ctx.beginPath();
                    ctx.moveTo(x + c / 2, y); ctx.lineTo(x + c, y + c / 2); ctx.lineTo(x + c / 2, y + c); ctx.lineTo(x, y + c / 2);
                    ctx.fill();
                } else if (stage === 3 && v > 0.4) ctx.fillRect(x, y, c * 0.86, c * 0.86);
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
        // Each word is kept whole (the characters are boxes, which could otherwise break anywhere).
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

// Home hero timeline, counted in screens of scroll: the hero takes three screens (the name holds, then the face turns
// and has turned at 3), the about brief the next three (it reads, then the projects slide over; the spacer is 6 screens).
const TURN_START = 0.9;
const TURN_LENGTH = 2.1;
const heroTurn = () => clamp01((scrollY / innerHeight - TURN_START) / TURN_LENGTH);

// [data-parallax-speed] elements drift relative to the viewport centre: 100 is static, 90 lags behind, 110 runs ahead.
// Also exposes the hero's scroll progress (0 → 1) as --hero-progress for the CSS fade, and on the home
// page the turn (0 → 1) as --turn, with .is-turned once the about brief is on screen.
// Returns a function to call after the layout changes.
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

// The hero video follows the scroll position instead of playing on its own.
// About page: over its tall hero. Home page: during the turn of the hero timeline above (the hero is fixed,
// the spacer under it is what scrolls); its clip runs forward then backward so phones can loop it cleanly,
// and the scroll drives the forward half.
// The hero face (home and About): the plain face video is drawn again as terminal cells, the way it used to be baked
// used to bake it, but live: each frame is averaged down to one brightness per cell and painted as solid,
// checkerboard, dots or nothing in the accent red. The video itself stays invisible and only provides frames.
function pixelHero(video) {
    const canvas = document.createElement('canvas');
    canvas.id = 'hero-pixels';
    canvas.setAttribute('aria-hidden', 'true');
    video.after(canvas);
    const cells = cellCanvas(canvas, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    let brightness = null, lastTime = -1, lastBox = '', wasLive = false;

    // The pointer opens a 200px circle in the cells (pixelcells push away and turn), eased in and out.
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, target: 0 };
    if (fine) {
        addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && scrollY < innerHeight * 3;
            pointer.target = inside ? 1 : 0;
            pointer.tx = e.clientX - r.left; pointer.ty = e.clientY - r.top;
            if (inside && !pointer.strength) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
        }, { passive: true });
        document.addEventListener('pointerleave', () => { pointer.target = 0; });
    }

    const draw = () => {
        requestAnimationFrame(draw);
        if (video.readyState < 2 || !video.videoWidth) return;
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        if (!w || !h) return;
        const box = `${w}x${h}`;
        if (box !== lastBox) {
            lastBox = box;
            const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
            cells.resize(cols, rows);
            sample.width = cols; sample.height = rows;
            brightness = new Uint8Array(cols * rows);
            lastTime = -1;
        }
        pointer.strength += (pointer.target - pointer.strength) * 0.12;
        pointer.x += (pointer.tx - pointer.x) * 0.25;
        pointer.y += (pointer.ty - pointer.y) * 0.25;
        const fx = pointer.strength > 0.002 ? { x: pointer.x * (canvas.width / w), y: pointer.y * (canvas.height / h), r: 100 * (canvas.width / w), strength: pointer.strength } : null;
        if (video.currentTime === lastTime) {
            if (fx || wasLive) cells.paint(brightness, fx);   // the circle is still moving, or has just closed
            wasLive = !!fx;
            return;
        }
        wasLive = !!fx;
        lastTime = video.currentTime;
        // object-fit: cover
        const va = video.videoWidth / video.videoHeight, ba = w / h;
        const sw = ba > va ? video.videoWidth : video.videoHeight * ba, sh = ba > va ? video.videoWidth / ba : video.videoHeight;
        sampleCtx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, cells.cols, cells.rows);
        const rgba = sampleCtx.getImageData(0, 0, cells.cols, cells.rows).data;
        for (let i = 0; i < brightness.length; i++) brightness[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
        cells.paint(brightness, fx);
    };
    requestAnimationFrame(draw);
    return canvas;
}

export function scrollScrubbedVideo() {
    const hero = document.querySelector('.about-header, #header');
    if (!hero) return;
    const home = hero.id === 'header';
    const video = hero.querySelector('video');
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

    // Videos can't play backwards: play forwards (faster the further behind), step backwards by hand.
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
            target = heroTurn() * video.duration / 2;
        } else {
            const scrollable = hero.offsetHeight - innerHeight;
            if (scrollable <= 0) return;
            target = clamp01(-hero.getBoundingClientRect().top / scrollable) * video.duration;
        }
        if (!frame && !waitingForFrame) frame = requestAnimationFrame(seek);

        // Touch layouts hide the spacer: the hero then simply scrolls away.
        const scrolledPast = scrollY >= (home && spacer.offsetHeight || hero.offsetHeight);
        layers.forEach(el => el.style.visibility = scrolledPast ? 'hidden' : '');
    };

    video.addEventListener('loadedmetadata', onScroll);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();
}
