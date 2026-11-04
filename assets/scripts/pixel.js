// Drawing the way the hero video is drawn (the way the hero used to be baked): a grid of cells, each one either
// a pixel, a diamond, a dot or nothing, picked from a brightness 0-255 with the same thresholds.
import { reducedMotion } from './common.js';

export const CELL = 10;                 // css px per cell
const GAP = 2;                          // px left empty between two cells
const LEVELS = [22, 60, 130];           // where dots, checkerboard and solid start

// The three drawn states of one cell, side by side: a dot, a diamond, a pixel (the same shapes as the text reveal).
function atlas(color, scale) {
    const size = CELL * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    const c = size / 2, square = (CELL - GAP) * scale;
    // dot
    const d = size * 0.28;
    ctx.fillRect(c - d / 2, c - d / 2, d, d);
    // diamond
    ctx.beginPath();
    ctx.moveTo(size + c, size * 0.04); ctx.lineTo(size * 1.96, c); ctx.lineTo(size + c, size * 0.96); ctx.lineTo(size * 1.04, c);
    ctx.fill();
    // pixel
    ctx.fillRect(size * 2, 0, square, square);
    return canvas;
}

// A canvas of cols x rows cells. paint() takes one brightness per cell.
export function cellCanvas(canvas, color) {
    const ctx = canvas.getContext('2d');
    let cols = 0, rows = 0, scale = 1, tiles = null;
    return {
        resize(c, r) {
            cols = c; rows = r;
            scale = Math.max(1, Math.round(devicePixelRatio));
            canvas.width = cols * CELL * scale;
            canvas.height = rows * CELL * scale;
            canvas.style.aspectRatio = `${cols} / ${rows}`;
            tiles = atlas(color, scale);
        },
        get cols() { return cols; },
        get rows() { return rows; },
        // `fx` (optional): { x, y, r, strength } in canvas pixels. Cells inside the circle are pushed away from its centre
        // and turned by their angle around it, more the closer they are.
        paint(brightness, fx) {
            const size = CELL * scale;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const live = fx && fx.strength > 0.002;
            for (let i = 0; i < brightness.length; i++) {
                const b = brightness[i];
                if (b < LEVELS[0]) continue;
                const state = b < LEVELS[1] ? 0 : b < LEVELS[2] ? 1 : 2;
                const x = (i % cols) * size, y = ((i / cols) | 0) * size;
                if (live) {
                    const cx = x + size / 2, cy = y + size / 2;
                    const dx = cx - fx.x, dy = cy - fx.y, d = Math.hypot(dx, dy);
                    if (d < fx.r) {
                        const u = 1 - d / fx.r, k = u * u * (3 - 2 * u) * fx.strength;
                        const push = k * size * 1.6 / (d || 1);
                        ctx.save();
                        ctx.translate(cx + dx * push, cy + dy * push);
                        ctx.rotate(k * Math.atan2(dy, dx));
                        ctx.drawImage(tiles, state * size, 0, size, size, -size / 2, -size / 2, size, size);
                        ctx.restore();
                        continue;
                    }
                }
                ctx.drawImage(tiles, state * size, 0, size, size, x, y, size, size);
            }
        },
    };
}

// ─── An SVG extruded into a block ─────────────────────────────────────────────

const MASK = 128;
const masks = new Map();

// The SVG's coverage on a MASK x MASK grid, with the outward normal of its outline at every point.
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
            // Outward normals from the gradient of the coverage (y up).
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

const DEPTH = 0.12;                                 // half the thickness of the block, the outline spanning 1.8
const TILT = 0.22;                                  // seen a little from above
const LIGHT = (() => { const l = [-0.45, 0.55, 0.7], n = Math.hypot(...l); return l.map(v => v / n); })();
const BASE_SPIN = 0.9;                              // rad/s, turning right

// Turns the SVG at `url` steadily on its vertical axis in `canvas`. Returns { show(url, cols), hide() }.
export function extrudedSvg(canvas, color) {
    const cells = cellCanvas(canvas, color);
    let mask = null, angle = -0.5, frame = 0, last = 0, running = false;
    let light = [0, 0, 0], brightness = new Uint8Array(0);

    const render = () => {
        const { solid, nx, ny, cx, cy, half } = mask;
        const cols = cells.cols, rows = cells.rows;
        const k = half / 0.9;                       // mask px per unit
        const cT = Math.cos(angle), sT = Math.sin(angle), cP = Math.cos(TILT), sP = Math.sin(TILT);
        // R = Rx(tilt)·Ry(angle), rows.
        const r0 = [cT, 0, sT], r1 = [sP * sT, cP, -sP * cT], r2 = [-cP * sT, sP, cP * cT];
        // The light in object space (Rᵀ·L): a normal in the object dotted with it gives the shade.
        for (let i = 0; i < 3; i++) light[i] = r0[i] * LIGHT[0] + r1[i] * LIGHT[1] + r2[i] * LIGHT[2];
        const step = 0.03, zMax = 1.35;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let sum = 0;
                for (let sy = 0; sy < 2; sy++) {
                    for (let sx = 0; sx < 2; sx++) {
                        const X = ((col + 0.25 + sx * 0.5) / cols) * 2 - 1;
                        const Y = 1 - ((row + 0.25 + sy * 0.5) / rows) * 2;
                        // Object point for view depth Z: Rᵀ·(X, Y, Z), marched from the front.
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
        // `urls`: the SVG to extrude, then the ones to fall back on if it does not exist.
        async show(urls, cols) {
            let next = null;
            for (const url of [].concat(urls)) {
                try { next = await loadMask(url); break; } catch { /* try the next one */ }
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
