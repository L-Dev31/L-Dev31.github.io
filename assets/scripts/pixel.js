import { reducedMotion, lowPower } from './env.js';
import { track } from './intro.js';
import { PIXEL, SIGNATURE } from './config.js';

const computeCell = () => Math.max(PIXEL.minCellPx, Math.round(innerWidth / PIXEL.cellsAcrossScreen));
export let CELL = computeCell();
addEventListener('resize', () => { CELL = computeCell(); }, { passive: true });

const [DOT_THRESHOLD, CHECKER_THRESHOLD, SOLID_THRESHOLD] = PIXEL.brightnessLevels;

const DOTS = 0, CHECKER = 1, SOLID = 2;

export function drawCell(context, level, x, y, cellSize, fillShare) {
    const gap = Math.max(1, Math.round(cellSize * PIXEL.gapShare));
    const side = fillShare === undefined ? cellSize - gap : cellSize * fillShare;
    if (level === SOLID) {
        context.fillRect(x, y, side, side);
        return;
    }
    const dotSize = Math.max(1, Math.round(side / 5));
    const dotsPerSide = Math.floor(side / dotSize);
    for (let i = 0; i < dotsPerSide; i++) {
        for (let j = 0; j < dotsPerSide; j++) {
            const lit = level === CHECKER ? (i + j) % 2 === 0 : i % 2 === 1 && j % 2 === 1;
            if (lit) context.fillRect(x + i * dotSize, y + j * dotSize, dotSize, dotSize);
        }
    }
}

function buildTiles(color, size) {
    const sheet = document.createElement('canvas');
    sheet.width = size * 3;
    sheet.height = size;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    context.fillStyle = color;
    for (let level = DOTS; level <= SOLID; level++) drawCell(context, level, level * size, 0, size);

    const pixels = new Uint32Array(context.getImageData(0, 0, size * 3, size).data.buffer);
    return [DOTS, CHECKER, SOLID].map(level => Array.from({ length: size }, (_, y) => {
        const rowStart = y * size * 3 + level * size;
        return pixels.slice(rowStart, rowStart + size);
    }));
}

export function levelOf(brightness) {
    if (brightness < DOT_THRESHOLD) return 0;
    if (brightness < CHECKER_THRESHOLD) return 1;
    if (brightness < SOLID_THRESHOLD) return 2;
    return 3;
}

export function cellCanvas(canvas, color) {
    const context = canvas.getContext('2d');
    let cols = 0, rows = 0;
    let cellPx = CELL;
    let tiles = null;
    let shownLevels = new Uint8Array(0);
    let imageData = null;
    let frame = null;

    let shimmer = new Float32Array(0);
    let shimmered = new Uint8Array(0);
    let shimmerBeat = -1;

    function withShimmer(brightness) {
        if (lowPower) return brightness;
        if (shimmered.length !== brightness.length) {
            shimmered = new Uint8Array(brightness.length);
            shimmer = new Float32Array(brightness.length);
            shimmerBeat = -1;
        }
        const beat = Math.floor(performance.now() / PIXEL.shimmerBeatMs);
        if (beat !== shimmerBeat) {
            shimmerBeat = beat;
            const low = 1 - PIXEL.shimmerAmount, span = PIXEL.shimmerAmount * 2;
            for (let i = 0; i < shimmer.length; i++) {
                const hash = (((i + 1) * 73856093) ^ (beat * 19349663)) >>> 0;
                shimmer[i] = low + (span * hash) / 4294967295;
            }
        }
        for (let i = 0; i < shimmered.length; i++) shimmered[i] = Math.min(255, brightness[i] * shimmer[i]);
        return shimmered;
    }

    return {
        resize(newCols, newRows) {
            cols = newCols;
            rows = newRows;
            const ratio = lowPower ? 1 : Math.min(PIXEL.maxDevicePixelRatio, Math.max(1, Math.round(devicePixelRatio)));
            cellPx = CELL * ratio;
            canvas.width = cols * cellPx;
            canvas.height = rows * cellPx;
            canvas.style.aspectRatio = `${cols} / ${rows}`;
            tiles = buildTiles(color, cellPx);
            imageData = context.createImageData(canvas.width, canvas.height);
            frame = new Uint32Array(imageData.data.buffer);
            shownLevels = new Uint8Array(0);
        },
        invalidate() {
            context.clearRect(0, 0, canvas.width, canvas.height);
            frame?.fill(0);
            shownLevels = new Uint8Array(0);
        },
        recolor(newColor) {
            if (newColor === color) return;
            color = newColor;
            if (cols) tiles = buildTiles(color, cellPx);
            shownLevels = new Uint8Array(0);
        },
        get cols() { return cols; },
        get rows() { return rows; },
        paint(brightness) {
            const live = withShimmer(brightness);
            const rowWidth = cols * cellPx;
            if (shownLevels.length !== live.length) shownLevels = new Uint8Array(live.length).fill(255);

            let minCol = cols, minRow = rows, maxCol = -1, maxRow = -1;
            for (let i = 0; i < live.length; i++) {
                const level = levelOf(live[i]);
                if (level === shownLevels[i]) continue;
                shownLevels[i] = level;

                const col = i % cols, row = (i / cols) | 0;
                let offset = row * cellPx * rowWidth + col * cellPx;
                if (level) {
                    const tile = tiles[level - 1];
                    for (let y = 0; y < cellPx; y++, offset += rowWidth) frame.set(tile[y], offset);
                } else {
                    for (let y = 0; y < cellPx; y++, offset += rowWidth) frame.fill(0, offset, offset + cellPx);
                }
                minCol = Math.min(minCol, col);
                maxCol = Math.max(maxCol, col);
                minRow = Math.min(minRow, row);
                maxRow = Math.max(maxRow, row);
            }
            if (maxCol >= 0) {
                context.putImageData(imageData, 0, 0, minCol * cellPx, minRow * cellPx, (maxCol - minCol + 1) * cellPx, (maxRow - minRow + 1) * cellPx);
            }
        },
    };
}

const MASK = 128;
const ALPHA_THRESHOLD = 100;
const NORMAL_REACH = 2;
const maskCache = new Map();

function computeNormals(solid) {
    const normalX = new Float32Array(solid.length);
    const normalY = new Float32Array(solid.length);
    const isSolid = (x, y) => solid[Math.min(MASK - 1, Math.max(0, y)) * MASK + Math.min(MASK - 1, Math.max(0, x))];

    for (let y = 0; y < MASK; y++) {
        for (let x = 0; x < MASK; x++) {
            let gradientX = 0, gradientY = 0;
            for (let d = -NORMAL_REACH; d <= NORMAL_REACH; d++) {
                gradientX += isSolid(x + NORMAL_REACH, y + d) - isSolid(x - NORMAL_REACH, y + d);
                gradientY += isSolid(x + d, y - NORMAL_REACH) - isSolid(x + d, y + NORMAL_REACH);
            }
            const length = Math.hypot(gradientX, gradientY) || 1;
            normalX[y * MASK + x] = -gradientX / length;
            normalY[y * MASK + x] = -gradientY / length;
        }
    }
    return { normalX, normalY };
}

function loadMask(url) {
    if (maskCache.has(url)) return maskCache.get(url);

    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = MASK;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const width = image.naturalWidth || 300, height = image.naturalHeight || 300;
            const fit = MASK / Math.max(width, height);
            context.drawImage(image, (MASK - width * fit) / 2, (MASK - height * fit) / 2, width * fit, height * fit);
            const rgba = context.getImageData(0, 0, MASK, MASK).data;

            const solid = new Uint8Array(MASK * MASK);
            let minX = MASK, minY = MASK, maxX = 0, maxY = 0;
            for (let i = 0; i < solid.length; i++) {
                if (rgba[i * 4 + 3] < ALPHA_THRESHOLD) continue;
                solid[i] = 1;
                const x = i % MASK, y = (i / MASK) | 0;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }

            const { normalX, normalY } = computeNormals(solid);
            resolve({
                solid,
                normalX,
                normalY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                halfSize: Math.max(maxX - minX, maxY - minY) / 2 || 1,
            });
        };
        image.onerror = reject;
        image.src = url;
    });
    maskCache.set(url, track(url, promise));
    return promise;
}

const LIGHT_DIRECTION = (() => {
    const light = [-0.45, 0.55, 0.7];
    const length = Math.hypot(...light);
    return light.map(value => value / length);
})();

const RAY_STEP = 0.03;
const RAY_START_DEPTH = 1.35;
const SHAPE_SCALE = 0.9;
const MAX_CELLS_FOR_ANTIALIASING = 2500;

function samplingGrid(cols, rows) {
    const raysPerSide = cols * rows > MAX_CELLS_FOR_ANTIALIASING ? 1 : 2;
    return { raysPerSide, offset: 0.5 / raysPerSide, tall: rows / cols };
}

function rotationAxes(angle) {
    const turn = { cos: Math.cos(angle), sin: Math.sin(angle) };
    const tilt = { cos: Math.cos(SIGNATURE.tilt), sin: Math.sin(SIGNATURE.tilt) };
    return {
        right: [turn.cos, 0, turn.sin],
        up: [tilt.sin * turn.sin, tilt.cos, -tilt.sin * turn.cos],
        toward: [-tilt.cos * turn.sin, tilt.sin, tilt.cos * turn.cos],
    };
}

function sampleExtruded(mask, axes, light, cols, rows, output) {
    const { solid, normalX, normalY, centerX, centerY, halfSize } = mask;
    const { right, up, toward } = axes;
    const scale = halfSize / SHAPE_SCALE;
    const { raysPerSide, offset, tall } = samplingGrid(cols, rows);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let brightnessSum = 0;
            for (let sampleY = 0; sampleY < raysPerSide; sampleY++) {
                for (let sampleX = 0; sampleX < raysPerSide; sampleX++) {
                    const x = ((col + offset + sampleX / raysPerSide) / cols) * 2 - 1;
                    const y = (1 - ((row + offset + sampleY / raysPerSide) / rows) * 2) * tall;

                    let u = right[0] * x + up[0] * y + toward[0] * RAY_START_DEPTH;
                    let v = right[1] * x + up[1] * y + toward[1] * RAY_START_DEPTH;
                    let w = right[2] * x + up[2] * y + toward[2] * RAY_START_DEPTH;
                    const stepU = -toward[0] * RAY_STEP, stepV = -toward[1] * RAY_STEP, stepW = -toward[2] * RAY_STEP;

                    let insideSlab = false;
                    for (let depth = RAY_START_DEPTH; depth > -RAY_START_DEPTH; depth -= RAY_STEP, u += stepU, v += stepV, w += stepW) {
                        if (w > SIGNATURE.depth || w < -SIGNATURE.depth) {
                            insideSlab = false;
                            continue;
                        }
                        const maskX = (centerX + u * scale) | 0, maskY = (centerY - v * scale) | 0;
                        if (maskX < 0 || maskY < 0 || maskX >= MASK || maskY >= MASK) {
                            insideSlab = true;
                            continue;
                        }
                        const index = maskY * MASK + maskX;
                        if (solid[index]) {
                            const lighting = insideSlab
                                ? normalX[index] * light[0] + normalY[index] * light[1]
                                : Math.sign(w) * light[2];
                            brightnessSum += 255 * (0.14 + 0.86 * Math.max(0, lighting));
                            break;
                        }
                        insideSlab = true;
                    }
                }
            }
            output[row * cols + col] = brightnessSum / (raysPerSide * raysPerSide);
        }
    }
}

export function extrudedSvg(canvas, color, { morph = false } = {}) {
    const cells = cellCanvas(canvas, color);

    let mask = null;
    let previousMask = null;
    let morphStartedAt = 0;
    let angle = -0.5;
    let animationFrame = 0;
    let lastTick = 0;
    let running = false;
    let lastDrawnState = '';

    let brightness = new Uint8Array(0);
    let previousBrightness = new Uint8Array(0);
    let morphOrder = new Float32Array(0);
    let axes = rotationAxes(angle);
    const light = [0, 0, 0];

    function march(shape, output) {
        sampleExtruded(shape, axes, light, cells.cols, cells.rows, output);
    }

    function render() {
        const state = `${angle.toFixed(4)}|${cells.cols}x${cells.rows}`;
        if (!previousMask && state === lastDrawnState) {
            cells.paint(brightness);
            return;
        }
        lastDrawnState = state;

        axes = rotationAxes(angle);
        for (let i = 0; i < 3; i++) {
            light[i] = axes.right[i] * LIGHT_DIRECTION[0] + axes.up[i] * LIGHT_DIRECTION[1] + axes.toward[i] * LIGHT_DIRECTION[2];
        }
        march(mask, brightness);

        const morphProgress = previousMask ? (performance.now() - morphStartedAt) / 1000 / SIGNATURE.morphSeconds : 1;
        if (morphProgress < 1) {
            march(previousMask, previousBrightness);
            for (let i = 0; i < brightness.length; i++) {
                if (morphOrder[i] > morphProgress) brightness[i] = previousBrightness[i];
            }
        } else {
            previousMask = null;
        }
        cells.paint(brightness);
    }

    function tick(now) {
        const seconds = Math.min(0.05, (now - lastTick) / 1000 || 0);
        lastTick = now;
        angle += SIGNATURE.spinRadiansPerSecond * seconds;
        render();
        animationFrame = running ? requestAnimationFrame(tick) : 0;
    }

    const randomOrder = count => Float32Array.from({ length: count }, () => Math.random());

    return {
        async show(urls, cols, rows = cols) {
            let nextMask = null;
            for (const url of [].concat(urls)) {
                try {
                    nextMask = await loadMask(url);
                    break;
                } catch {}
            }
            if (!nextMask) return;

            if (morph && mask && nextMask !== mask && !reducedMotion) {
                previousMask = mask;
                morphStartedAt = performance.now();
                morphOrder = randomOrder(cols * rows);
            }
            if (nextMask !== mask) lastDrawnState = '';
            mask = nextMask;

            if (cols !== cells.cols || rows !== cells.rows) {
                cells.resize(cols, rows);
                brightness = new Uint8Array(cols * rows);
                previousBrightness = new Uint8Array(cols * rows);
                if (morphOrder.length !== cols * rows) morphOrder = randomOrder(cols * rows);
            }

            if (reducedMotion) return render();
            if (!running) {
                running = true;
                lastTick = performance.now();
                animationFrame = requestAnimationFrame(tick);
            }
        },
        hide() {
            running = false;
            cancelAnimationFrame(animationFrame);
        },
        nudge(radians) { angle += radians; },
        recolor(newColor) { cells.recolor(newColor); },
    };
}

const DISSOLVE_DELAY_BY_COLUMN = 0.55;
const DISSOLVE_DELAY_RANDOM = 0.35;
const DISSOLVE_SPEED = 1.45;
const DISSOLVE_END = 1.15;
const DISSOLVE_DOTS_UNTIL = 0.2, DISSOLVE_CHECKER_UNTIL = 0.1;

export function dissolve(host, { color, size = CELL, total = PIXEL.dissolveDurationMs, reverse = false, fixed = false }, done) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};inset:0;width:100%;height:100%`;
    host.append(canvas);

    const cols = Math.ceil((fixed ? innerWidth : host.clientWidth) / size);
    const rows = Math.ceil((fixed ? innerHeight : host.clientHeight) / size);
    const ratio = Math.min(PIXEL.maxDevicePixelRatio, devicePixelRatio || 1);
    const cellPx = size * ratio;
    canvas.width = cols * cellPx;
    canvas.height = rows * cellPx;

    const context = canvas.getContext('2d');
    context.fillStyle = color;
    const delays = Array.from({ length: cols * rows }, (_, i) => ((i % cols) / cols) * DISSOLVE_DELAY_BY_COLUMN + Math.random() * DISSOLVE_DELAY_RANDOM);
    const startedAt = performance.now();

    function frame(now) {
        if (!canvas.isConnected) return;
        const progress = Math.min(DISSOLVE_END, ((now - startedAt) / total) * DISSOLVE_SPEED);
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < delays.length; i++) {
            const remaining = (reverse ? DISSOLVE_END - progress : progress) - delays[i];
            const level = remaining < 0 ? SOLID : remaining < DISSOLVE_CHECKER_UNTIL ? CHECKER : remaining < DISSOLVE_DOTS_UNTIL ? DOTS : -1;
            if (level >= 0) drawCell(context, level, (i % cols) * cellPx, ((i / cols) | 0) * cellPx, cellPx, 1);
        }
        if (progress < DISSOLVE_END) requestAnimationFrame(frame);
        else done?.(canvas);
    }
    requestAnimationFrame(frame);
    return canvas;
}
