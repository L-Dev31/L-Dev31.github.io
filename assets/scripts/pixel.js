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
            const live = alive(brightness);
            if (shown.length !== live.length) shown = new Uint8Array(live.length).fill(255);
            for (let i = 0; i < live.length; i++) {
                const b = live[i];
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
