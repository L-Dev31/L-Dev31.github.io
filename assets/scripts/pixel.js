import { reducedMotion, lowPower } from './common.js';

export const CELL = 8;
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

function atlas(color, scale) {
    const size = CELL * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    for (let state = 0; state < 3; state++) drawCell(ctx, state, state * size, 0, size);
    return canvas;
}

export function cellCanvas(canvas, color) {
    const ctx = canvas.getContext('2d');
    let cols = 0, rows = 0, scale = 1, tiles = null, shown = new Uint8Array(0);
    return {
        resize(c, r) {
            cols = c; rows = r;
            scale = lowPower ? 1 : Math.min(2, Math.max(1, Math.round(devicePixelRatio)));
            canvas.width = cols * CELL * scale;
            canvas.height = rows * CELL * scale;
            canvas.style.aspectRatio = `${cols} / ${rows}`;
            tiles = atlas(color, scale);
            shown = new Uint8Array(0);
        },
        invalidate() { ctx.clearRect(0, 0, canvas.width, canvas.height); shown = new Uint8Array(0); },
        get cols() { return cols; },
        get rows() { return rows; },
        paint(brightness) {
            const size = CELL * scale;
            if (shown.length !== brightness.length) shown = new Uint8Array(brightness.length).fill(255);
            for (let i = 0; i < brightness.length; i++) {
                const b = brightness[i];
                const state = b < LEVELS[0] ? 0 : b < LEVELS[1] ? 1 : b < LEVELS[2] ? 2 : 3;
                if (state === shown[i]) continue;
                shown[i] = state;
                const x = (i % cols) * size, y = ((i / cols) | 0) * size;
                ctx.clearRect(x, y, size, size);
                if (state) ctx.drawImage(tiles, (state - 1) * size, 0, size, size, x, y, size, size);
            }
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
    masks.set(url, promise);
    return promise;
}

const DEPTH = 0.12;
const TILT = 0.22;
const LIGHT = (() => { const l = [-0.45, 0.55, 0.7], n = Math.hypot(...l); return l.map(v => v / n); })();
const BASE_SPIN = 0.9;

export function extrudedSvg(canvas, color) {
    const cells = cellCanvas(canvas, color);
    let mask = null, angle = -0.5, frame = 0, last = 0, running = false;
    let light = [0, 0, 0], brightness = new Uint8Array(0);

    const render = () => {
        const { solid, nx, ny, cx, cy, half } = mask;
        const cols = cells.cols, rows = cells.rows;
        const k = half / 0.9;
        const cT = Math.cos(angle), sT = Math.sin(angle), cP = Math.cos(TILT), sP = Math.sin(TILT);

        const r0 = [cT, 0, sT], r1 = [sP * sT, cP, -sP * cT], r2 = [-cP * sT, sP, cP * cT];

        for (let i = 0; i < 3; i++) light[i] = r0[i] * LIGHT[0] + r1[i] * LIGHT[1] + r2[i] * LIGHT[2];
        const step = 0.03, zMax = 1.35;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let sum = 0;
                for (let sy = 0; sy < 2; sy++) {
                    for (let sx = 0; sx < 2; sx++) {
                        const X = ((col + 0.25 + sx * 0.5) / cols) * 2 - 1;
                        const Y = 1 - ((row + 0.25 + sy * 0.5) / rows) * 2;

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
                brightness[row * cols + col] = sum / 4;
            }
        }
        cells.paint(brightness);
    };

    const tick = now => {
        const dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        angle += BASE_SPIN * dt;
        render();
        frame = running ? requestAnimationFrame(tick) : 0;
    };

    return {

        async show(urls, cols) {
            let next = null;
            for (const url of [].concat(urls)) {
                try { next = await loadMask(url); break; } catch {}
            }
            if (!next) return;
            mask = next;
            if (cols !== cells.cols) {
                cells.resize(cols, cols);
                brightness = new Uint8Array(cols * cols);
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
    };
}
