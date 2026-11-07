import { reducedMotion, lowPower, track } from './common.js';

const cellFor = () => Math.max(3, Math.round(innerWidth / 180));
export let CELL = cellFor();
addEventListener('resize', () => { CELL = cellFor(); }, { passive: true });
const LEVELS = [20, 60, 130];

export function drawCell(ctx, state, x, y, c, fill) {
    const gap = Math.max(1, Math.round(c * 0.25));
    const s = fill === undefined ? c - gap : c * fill;
    if (state === 2) {
        ctx.fillRect(x, y, s, s);
        return;
    }
    const q = Math.max(1, Math.round(s / 5)), n = Math.floor(s / q);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (state === 1 ? (i + j) % 2 === 0 : i % 2 === 1 && j % 2 === 1) ctx.fillRect(x + i * q, y + j * q, q, q);
        }
    }
}

function tileSet(color, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = color;
    for (let state = 0; state < 3; state++) drawCell(ctx, state, state * size, 0, size);
    const px = new Uint32Array(ctx.getImageData(0, 0, size * 3, size).data.buffer);
    // tiles[state][row] is one row of packed pixels, ready to copy into the frame
    return [0, 1, 2].map(state => Array.from({ length: size }, (_, y) => px.slice(y * size * 3 + state * size, y * size * 3 + (state + 1) * size)));
}

export function cellCanvas(canvas, color) {
    const ctx = canvas.getContext('2d');
    let cols = 0, rows = 0, size = CELL, tiles = null, shown = new Uint8Array(0), image = null, frame = null;

    let noise = new Float32Array(0), view = new Uint8Array(0), beat = -1;
    const alive = brightness => {
        if (lowPower) return brightness;
        const now = performance.now();
        if (view.length !== brightness.length) {
            view = new Uint8Array(brightness.length);
            noise = new Float32Array(brightness.length);
            beat = -1;
        }
        if (Math.floor(now / 240) !== beat) {
            beat = Math.floor(now / 240);
            for (let i = 0; i < noise.length; i++) noise[i] = 0.78 + 0.44 * ((((i + 1) * 73856093) ^ (beat * 19349663)) >>> 0) / 4294967295;
        }
        for (let i = 0; i < view.length; i++) view[i] = Math.min(255, brightness[i] * noise[i]);
        return view;
    };
    return {
        resize(c, r) {
            cols = c; rows = r;
            size = CELL * (lowPower ? 1 : Math.min(2, Math.max(1, Math.round(devicePixelRatio))));
            canvas.width = cols * size;
            canvas.height = rows * size;
            canvas.style.aspectRatio = `${cols} / ${rows}`;
            tiles = tileSet(color, size);
            image = ctx.createImageData(canvas.width, canvas.height);
            frame = new Uint32Array(image.data.buffer);
            shown = new Uint8Array(0);
        },
        invalidate() { ctx.clearRect(0, 0, canvas.width, canvas.height); frame?.fill(0); shown = new Uint8Array(0); },
        // every cell is drawn again in the new colour at the next paint
        recolor(next) {
            if (next === color) return;
            color = next;
            if (cols) tiles = tileSet(color, size);
            shown = new Uint8Array(0);
        },
        get cols() { return cols; },
        get rows() { return rows; },
        // cells are copied into one typed array and sent to the canvas once, instead of one canvas call per cell
        paint(brightness) {
            const live = alive(brightness), width = cols * size;
            if (shown.length !== live.length) shown = new Uint8Array(live.length).fill(255);
            let x0 = cols, y0 = rows, x1 = -1, y1 = -1;
            for (let i = 0; i < live.length; i++) {
                const b = live[i];
                const state = b < LEVELS[0] ? 0 : b < LEVELS[1] ? 1 : b < LEVELS[2] ? 2 : 3;
                if (state === shown[i]) continue;
                shown[i] = state;
                const col = i % cols, row = (i / cols) | 0;
                let at = row * size * width + col * size;
                if (state) {
                    const tile = tiles[state - 1];
                    for (let y = 0; y < size; y++, at += width) frame.set(tile[y], at);
                } else {
                    for (let y = 0; y < size; y++, at += width) frame.fill(0, at, at + size);
                }
                if (col < x0) x0 = col;
                if (col > x1) x1 = col;
                if (row < y0) y0 = row;
                if (row > y1) y1 = row;
            }
            if (x1 >= 0) ctx.putImageData(image, 0, 0, x0 * size, y0 * size, (x1 - x0 + 1) * size, (y1 - y0 + 1) * size);
        },
    };
}

const MASK = 128;
const masks = new Map();

function loadMask(url) {
    if (masks.has(url)) return masks.get(url);
    const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = MASK;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const w = img.naturalWidth || 300, h = img.naturalHeight || 300;
            const fit = MASK / Math.max(w, h);
            ctx.drawImage(img, (MASK - w * fit) / 2, (MASK - h * fit) / 2, w * fit, h * fit);
            const rgba = ctx.getImageData(0, 0, MASK, MASK).data;
            const solid = new Uint8Array(MASK * MASK);
            let x0 = MASK, y0 = MASK, x1 = 0, y1 = 0;
            for (let i = 0; i < solid.length; i++) {
                if (rgba[i * 4 + 3] < 100) continue;
                solid[i] = 1;
                const x = i % MASK, y = (i / MASK) | 0;
                x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }

            const nx = new Float32Array(solid.length), ny = new Float32Array(solid.length);
            const at = (x, y) => solid[Math.min(MASK - 1, Math.max(0, y)) * MASK + Math.min(MASK - 1, Math.max(0, x))];
            for (let y = 0; y < MASK; y++) {
                for (let x = 0; x < MASK; x++) {
                    let gx = 0, gy = 0;
                    for (let d = -2; d <= 2; d++) {
                        gx += at(x + 2, y + d) - at(x - 2, y + d);
                        gy += at(x + d, y - 2) - at(x + d, y + 2);
                    }
                    const len = Math.hypot(gx, gy) || 1;
                    nx[y * MASK + x] = -gx / len;
                    ny[y * MASK + x] = -gy / len;
                }
            }
            resolve({ solid, nx, ny, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: Math.max(x1 - x0, y1 - y0) / 2 || 1 });
        };
        img.onerror = reject;
        img.src = url;
    });
    masks.set(url, track(url, promise));
    return promise;
}

const DEPTH = 0.12;
const TILT = 0.22;
const LIGHT = (() => { const l = [-0.45, 0.55, 0.7], n = Math.hypot(...l); return l.map(v => v / n); })();
const BASE_SPIN = 0.9;

const MORPH = 0.45; // seconds for the cells to go from one shape to the next

// with `morph`, a new shape is reached by its cells reassembling; otherwise it simply replaces the old one
export function extrudedSvg(canvas, color, { morph = false } = {}) {
    const cells = cellCanvas(canvas, color);
    let mask = null, from = null, morphStart = 0, angle = -0.5, frame = 0, last = 0, running = false, facing = false, drawn = '';
    let light = [0, 0, 0], brightness = new Uint8Array(0), before = new Uint8Array(0), order = new Float32Array(0);
    let r0 = [], r1 = [], r2 = [];

    // the shape seen through the current rotation, one brightness per cell
    const march = ({ solid, nx, ny, cx, cy, half }, out) => {
        const cols = cells.cols, rows = cells.rows;
        const k = half / 0.9;
        const step = 0.03, zMax = 1.35;
        // a wide grid keeps square cells: the height spans rows / cols of the width
        const tall = rows / cols;
        // a large grid is drawn with one ray a cell instead of four, so a frame keeps its time
        const n = cols * rows > 2500 ? 1 : 2, off = 0.5 / n;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let sum = 0;
                for (let sy = 0; sy < n; sy++) {
                    for (let sx = 0; sx < n; sx++) {
                        const X = ((col + off + sx / n) / cols) * 2 - 1;
                        const Y = (1 - ((row + off + sy / n) / rows) * 2) * tall;

                        let u = r0[0] * X + r1[0] * Y + r2[0] * zMax;
                        let v = r0[1] * X + r1[1] * Y + r2[1] * zMax;
                        let w = r0[2] * X + r1[2] * Y + r2[2] * zMax;
                        const du = -r2[0] * step, dv = -r2[1] * step, dw = -r2[2] * step;
                        let inSlab = false;
                        for (let z = zMax; z > -zMax; z -= step, u += du, v += dv, w += dw) {
                            if (w > DEPTH || w < -DEPTH) { inSlab = false; continue; }
                            const mx = (cx + u * k) | 0, my = (cy - v * k) | 0;
                            if (mx < 0 || my < 0 || mx >= MASK || my >= MASK) { inSlab = true; continue; }
                            const m = my * MASK + mx;
                            if (solid[m]) {
                                const d = inSlab ? nx[m] * light[0] + ny[m] * light[1] : Math.sign(w) * light[2];
                                sum += 255 * (0.14 + 0.86 * Math.max(0, d));
                                break;
                            }
                            inSlab = true;
                        }
                    }
                }
                out[row * cols + col] = sum / (n * n);
            }
        }
    };

    const render = () => {
        // holding still (a word facing the viewer, no morph): the cells are only repainted
        const state = `${angle.toFixed(4)}|${cells.cols}x${cells.rows}`;
        if (!from && state === drawn) return cells.paint(brightness);
        drawn = state;
        const cT = Math.cos(angle), sT = Math.sin(angle), cP = Math.cos(TILT), sP = Math.sin(TILT);
        r0 = [cT, 0, sT]; r1 = [sP * sT, cP, -sP * cT]; r2 = [-cP * sT, sP, cP * cT];
        for (let i = 0; i < 3; i++) light[i] = r0[i] * LIGHT[0] + r1[i] * LIGHT[1] + r2[i] * LIGHT[2];
        march(mask, brightness);
        const t = from ? (performance.now() - morphStart) / 1000 / MORPH : 1;
        if (t < 1) {
            // each cell leaves the old shape for the new one at its own moment: the pixels reassemble
            march(from, before);
            for (let i = 0; i < brightness.length; i++) if (order[i] > t) brightness[i] = before[i];
        } else {
            from = null;
        }
        cells.paint(brightness);
    };

    const tick = now => {
        const dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        if (facing) {
            // it turns back to face the viewer, the nearest way round, and holds
            const front = Math.round(angle / (2 * Math.PI)) * 2 * Math.PI;
            angle += (front - angle) * Math.min(1, dt * 5);
            if (Math.abs(front - angle) < 1e-3) angle = front;
        } else {
            angle += BASE_SPIN * dt;
        }
        render();
        frame = running ? requestAnimationFrame(tick) : 0;
    };

    return {

        /** Draws the first of `urls` that loads, on a grid of cols by rows cells (rows = cols by default). */
        async show(urls, cols, rows = cols) {
            let next = null;
            for (const url of [].concat(urls)) {
                try { next = await loadMask(url); break; } catch {}
            }
            if (!next) return;
            if (morph && mask && next !== mask && !reducedMotion) {
                from = mask;
                morphStart = performance.now();
                order = Float32Array.from({ length: cols * rows }, () => Math.random());
            }
            if (next !== mask) drawn = '';
            mask = next;
            if (cols !== cells.cols || rows !== cells.rows) {
                cells.resize(cols, rows);
                brightness = new Uint8Array(cols * rows);
                before = new Uint8Array(cols * rows);
                if (order.length !== cols * rows) order = Float32Array.from({ length: cols * rows }, () => Math.random());
            }
            if (reducedMotion) return render();
            if (!running) {
                running = true;
                last = performance.now();
                frame = requestAnimationFrame(tick);
            }
        },
        hide() {
            running = false;
            cancelAnimationFrame(frame);
        },
        /** Turns the shape a little more, by an angle in radians. */
        nudge(radians) { angle += radians; },
        /** Stops turning and faces the viewer (a word must be read), or turns again. */
        face(on) { facing = on; },
        recolor(next) { cells.recolor(next); },
    };
}

export function dissolve(host, { color, size = CELL, total = 900, reverse = false, fixed = false }, done) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};inset:0;width:100%;height:100%`;
    host.append(canvas);
    const cols = Math.ceil((fixed ? innerWidth : host.clientWidth) / size);
    const rows = Math.ceil((fixed ? innerHeight : host.clientHeight) / size);
    const dpr = Math.min(2, devicePixelRatio || 1), cell = size * dpr;
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    const delay = Array.from({ length: cols * rows }, (_, i) => (i % cols) / cols * 0.55 + Math.random() * 0.35);
    const start = performance.now(), END = 1.15;
    const frame = now => {
        if (!canvas.isConnected) return;
        const t = Math.min(END, (now - start) / total * 1.45);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < delay.length; i++) {
            const p = (reverse ? END - t : t) - delay[i];
            const state = p < 0 ? 2 : p < 0.1 ? 1 : p < 0.2 ? 0 : -1;
            if (state >= 0) drawCell(ctx, state, (i % cols) * cell, ((i / cols) | 0) * cell, cell, 1);
        }
        if (t < END) requestAnimationFrame(frame);
        else done?.(canvas);
    };
    requestAnimationFrame(frame);
    return canvas;
}
