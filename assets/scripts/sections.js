// Home sections built from data: the journey on a pixel Earth, and the clients.
import { reducedMotion, clamp01 } from './common.js';
import { cellCanvas, CELL } from './pixel.js';

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

// Coarse coastlines, [longitude, latitude]: enough for a globe a few dozen cells wide.
const LAND = [
    // North America
    [[-168, 66], [-163, 69], [-156, 71], [-141, 70], [-125, 70], [-110, 68], [-95, 68], [-94, 64], [-94, 59], [-87, 56], [-82, 55], [-80, 51], [-78, 56], [-77, 62], [-70, 61], [-65, 60], [-62, 56], [-56, 52], [-60, 50], [-66, 50], [-64, 47], [-61, 45], [-66, 44], [-70, 43], [-70, 41.5], [-74, 40.5], [-76, 37], [-76, 35], [-81, 31], [-80, 27], [-80, 25], [-83, 28], [-84, 30], [-89, 30], [-94, 29.5], [-97, 27.5], [-97.5, 22], [-96, 19], [-91, 18.5], [-90, 21], [-87, 21.5], [-88, 16], [-84, 15.5], [-83.5, 11], [-81, 8.5], [-77.5, 8.5], [-80, 7.5], [-84, 9], [-87, 13], [-92, 14.5], [-96, 15.7], [-101, 17.5], [-105.5, 20], [-106, 23.5], [-110, 27], [-114.5, 31], [-112, 26], [-110, 23], [-112, 25.5], [-114.5, 28], [-117, 32.5], [-120.5, 34.5], [-122.5, 37.5], [-124, 40.5], [-124, 46], [-124.5, 48.5], [-128, 51], [-131, 55], [-136, 58], [-141, 60], [-147, 61], [-152, 59], [-158, 56.5], [-164, 54.5], [-160, 58.5], [-165, 61], [-164.5, 64.5], [-168, 66]],
    // Greenland
    [[-73, 78], [-60, 82], [-32, 83.5], [-19, 80], [-18, 76], [-22, 70.5], [-32, 67], [-40, 65], [-43.5, 60], [-49, 61.5], [-53, 66], [-54, 70], [-58, 75.5], [-67, 76.5]],
    // South America
    [[-77.5, 8.5], [-75.5, 10.5], [-72, 12], [-68, 10.5], [-62, 10.5], [-57, 6], [-52, 5], [-50, 1.5], [-48, -1], [-44, -2.5], [-40, -3], [-35, -5.5], [-35, -9], [-38.5, -13], [-39, -18], [-41, -22], [-44.5, -23], [-48.5, -26], [-49, -29], [-53, -33.5], [-56, -35], [-58, -34.5], [-57, -38], [-62, -39], [-65, -41], [-65, -45], [-67.5, -46.5], [-69, -51], [-68.5, -53], [-71, -54.5], [-74.5, -51], [-75.5, -47], [-73.5, -42], [-73.5, -37], [-71.5, -30], [-70.5, -23], [-70.5, -18.5], [-76, -14], [-79, -8], [-81, -5], [-80, -1], [-79, 1.5], [-77.5, 4], [-77.5, 8.5]],
    // Europe and Asia
    [[-9.5, 37], [-9, 43], [-2, 43.5], [-1.5, 46.5], [-4.5, 48.5], [-1, 49.5], [2, 51], [5, 53], [8.5, 54], [8.5, 57], [10.5, 57.7], [12.5, 56], [11, 54], [14, 54], [19, 54.5], [21, 57], [24, 57.5], [23.5, 59.5], [30, 60], [23, 60.5], [21.5, 63], [25.5, 65.5], [22, 66], [17.5, 62.5], [18.5, 60], [16.5, 57], [12.5, 56.2], [10.5, 59], [6, 58], [5, 61], [8, 63.5], [14, 67.5], [18, 69.8], [25, 71], [31, 70], [40, 67.5], [44, 68.5], [54, 68.5], [60, 69.5], [68, 68.5], [73, 72.5], [80, 73.5], [87, 75], [100, 77], [107, 77], [113, 73.5], [127, 73.5], [140, 72], [152, 70.5], [161, 69.5], [170, 70], [180, 69], [180, 65], [178, 64], [173, 61], [163, 60], [162, 57], [156, 51], [156, 57.5], [151, 59.5], [142, 59.3], [137, 54], [141, 52.5], [140, 48], [132.5, 43], [129.5, 41], [129.5, 35.5], [126.5, 34.5], [125, 39.5], [121.5, 39], [122, 40.5], [119, 39], [119, 37], [122.5, 37], [120, 34.5], [122, 30.5], [121, 28], [119.5, 25.5], [116.5, 23], [113, 22], [109.5, 21.5], [108, 21.5], [106.5, 20], [106, 18], [108.5, 15], [109, 11.5], [105, 8.6], [103, 10.5], [100, 13.5], [99.5, 9], [101, 6.5], [103.5, 1.3], [101, 2.8], [98.5, 8], [98.5, 13], [97.5, 16.5], [94.5, 16], [94, 19.5], [92, 22], [90, 22], [87, 21.5], [86.5, 20], [84.5, 18.5], [80.5, 15.5], [80, 10], [77.5, 8], [76.5, 9], [74, 14.5], [72.8, 19], [72.5, 21], [70, 22.5], [68.5, 23.5], [66.5, 25.5], [61.5, 25.2], [57.5, 25.7], [56.3, 27.2], [52, 27.8], [50, 30], [48, 30], [50, 26.5], [51.5, 24.5], [54, 24], [56.5, 24.5], [56.3, 26.3], [59.8, 22.5], [58.5, 20.5], [55, 17], [52, 16], [45, 13], [43, 12.7], [42.7, 15.5], [39.5, 21], [38.5, 24], [35, 28], [34.5, 29.5], [32.5, 30], [34.5, 31.5], [35.5, 34], [36, 36.5], [32, 36.2], [29, 36.5], [26.5, 38.5], [26.5, 40], [29, 41], [28, 42], [28.5, 43.5], [30, 45.5], [33.5, 44.5], [36.5, 45.2], [38, 47], [41.5, 41.5], [36, 41.5], [31, 41.2], [29, 41], [26, 41], [23.5, 40], [22.5, 40.5], [24, 38], [22, 36.5], [21, 38.5], [19.5, 41.5], [19, 42.5], [16, 43.5], [13.5, 45.5], [12.3, 45.2], [14, 42.5], [16, 41.5], [18.5, 40.2], [16.5, 39], [15.6, 38], [16, 39.8], [15, 40.2], [12.5, 41.5], [10.5, 43], [8.7, 44.4], [6.5, 43.1], [3, 43.2], [3.2, 42], [0, 39.5], [-0.5, 38], [-2.2, 36.8], [-5.5, 36], [-7.5, 37.2], [-9.5, 37]],
    // Great Britain and Ireland
    [[-5.7, 50], [1.4, 51.2], [1.7, 52.7], [0, 53.5], [-1.5, 55], [-2, 56], [-1.8, 57.6], [-3.3, 58.6], [-5, 58.6], [-5.6, 56.3], [-4.8, 54.8], [-3, 53.9], [-4.5, 53.3], [-4.8, 52.1], [-3, 51.4], [-5.7, 50]],
    [[-6, 52], [-6, 54], [-7.5, 55.3], [-10, 54.2], [-10, 51.6]],
    // Iceland
    [[-22.5, 64], [-21, 66.2], [-15, 66.5], [-13.5, 65], [-18, 63.4]],
    // Africa
    [[-17, 21], [-16.5, 16], [-17.2, 14.7], [-15, 11], [-13, 8], [-11, 6.5], [-7.5, 4.4], [-2, 4.8], [2, 6.3], [6, 4.3], [8.5, 4.5], [9.8, 2.5], [9, -1], [12, -5], [13.5, -11], [12, -17], [14.5, -22.5], [16.5, -28.5], [18.5, -34.2], [22, -34], [26, -33.8], [30, -31], [32.5, -28.5], [33, -26], [35.5, -24], [35, -20], [40, -16], [40.5, -11], [39.5, -6], [41.5, -1.5], [44, 1.5], [48, 5], [51, 10.5], [51.2, 12], [48, 11.2], [44, 10.5], [43.3, 12], [41, 14.8], [38.5, 18.5], [37, 22], [35.5, 24], [34, 27], [32.5, 29.9], [30, 31.3], [25, 31.6], [20, 30.8], [19.5, 32.5], [15, 32.3], [11, 33.2], [10.3, 36.9], [7.5, 37], [3, 36.8], [-1.5, 35.2], [-5.5, 35.8], [-7, 34], [-9.8, 30.5], [-11, 28.2], [-13, 27.5], [-15, 24.5], [-17, 21]],
    // Madagascar
    [[49.3, -12], [50.5, -15.5], [49.5, -18], [47, -25], [44, -25], [43.5, -22], [44.5, -16.5], [47.5, -14]],
    // Arabia is part of Asia above. Japan
    [[130, 31.5], [131.5, 34], [133, 34.5], [135, 34], [136.5, 34.3], [140, 35.2], [141, 38], [142, 39.5], [141.5, 41.5], [140, 40.5], [139.5, 38], [137, 37], [136, 35.8], [132.5, 35.5], [130.8, 33.8]],
    [[140, 41.5], [141.7, 42.5], [143.5, 42], [145.5, 43.3], [142, 45.5], [140, 43.5]],
    // Indonesia, New Guinea, Philippines
    [[95.3, 5.5], [98, 4], [104, -2], [106, -6], [104.5, -5.8], [101, -3], [98.5, 0], [95.5, 4]],
    [[105.5, -6.8], [110, -7], [114.5, -7.8], [114.5, -8.8], [110, -8.2], [106, -7.6]],
    [[109, 1.5], [110, -1.5], [114, -4], [116.5, -3.5], [118.5, 1], [117.5, 4.5], [116, 7], [113, 3.2], [111, 2]],
    [[119, -5.5], [120.5, 1], [125, 1.5], [121.5, -1], [123, -5.5]],
    [[131, -1], [134, -0.8], [138, -1.6], [141, -2.6], [145, -4], [147.5, -6], [150.5, -10.5], [147, -10], [144, -7.8], [141, -9.2], [138, -8.3], [137.5, -5], [133, -4], [131.5, -2.5]],
    [[120, 18.5], [122.5, 18.5], [124, 13.5], [126.5, 7], [125.5, 6], [122, 7], [123.5, 10.5], [121, 13.8]],
    // Australia
    [[113.5, -22], [114, -26.5], [115, -34], [118, -35], [123, -33.8], [129, -31.6], [134, -32.5], [137.8, -35.8], [140, -38], [144, -38.3], [147.5, -38], [150, -37.5], [153, -31], [153, -25.5], [150.5, -22.5], [146.3, -19], [145.3, -15], [142.5, -10.7], [141.5, -15], [140.8, -17.5], [139, -17], [135.5, -15], [136.5, -12], [132.5, -11.5], [130, -13], [127, -14], [125, -15.5], [122, -18], [121, -19.5], [117, -20.7], [113.5, -22]],
    [[145, -40.8], [148.3, -41], [147.5, -43.5], [146, -43.5]],
    // New Zealand
    [[172.7, -34.5], [174.5, -36], [178.5, -37.5], [177, -39.5], [175, -41.5], [174.5, -40], [173.8, -39]],
    [[172.5, -40.5], [174.3, -41.8], [171, -44.5], [169, -46.6], [166.5, -46], [168, -44]],
    // Sri Lanka, Cuba, Hispaniola
    [[79.8, 9.8], [81.9, 7.5], [81.3, 6.2], [80, 6.2]],
    [[-85, 21.8], [-82, 23.2], [-78, 22.4], [-74.2, 20.2], [-77.7, 19.9], [-80.5, 21.7], [-84.8, 21.4]],
    [[-74.5, 19.8], [-72.8, 19.9], [-69.8, 19.6], [-68.4, 18.6], [-71.4, 17.6], [-74.4, 18.4]],
    // Antarctica
    [[-180, -84], [-180, -78], [-160, -77.5], [-150, -76], [-130, -74], [-110, -74], [-100, -73], [-75, -73], [-62, -64], [-57, -63.5], [-60, -70], [-60, -75], [-45, -78], [-30, -76], [-10, -71], [10, -70], [30, -69.5], [50, -67], [70, -68], [90, -66.5], [110, -66], [130, -66.3], [150, -68.5], [165, -71], [170, -77.5], [180, -78], [180, -84]],
];

// Land on a 720 x 360 grid, two cells per degree (fine enough for the Earth filling the screen).
const GRID = 2;
function landGrid() {
    const canvas = document.createElement('canvas');
    canvas.width = 360 * GRID; canvas.height = 180 * GRID;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.scale(GRID, GRID);
    ctx.fillStyle = '#fff';
    for (const shape of LAND) {
        ctx.beginPath();
        shape.forEach(([lon, lat], i) => ctx[i ? 'lineTo' : 'moveTo'](lon + 180, 90 - lat));
        ctx.closePath();
        ctx.fill();
    }
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const land = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < land.length; i++) land[i] = rgba[i * 4 + 3] > 100 ? 1 : 0;
    return land;
}

const RAD = Math.PI / 180;
const SUN = (() => { const l = [-0.5, 0.45, 0.75], n = Math.hypot(...l); return l.map(v => v / n); })();

// Slow clouds: smooth value noise over longitude and latitude, periodic around the Earth so there is no seam.
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (i, j) => hash(((i % period) + period) % period, j);
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
}
const cloud = (lon, lat, t) => {
    const x = (lon + 180 + t * 0.9) / 12, y = (lat + 90) / 9;   // drifts about 1° a second
    return noise(x, y, 30) * 0.65 + noise(x * 2.3, y * 2.3, 69) * 0.35;
};

// ─── Journey ──────────────────────────────────────────────────────────────────
// The Earth, red with slow checkerboard clouds, fills the screen when the section arrives. Scrolling turns it a full
// 360° while it shrinks and moves to the right; there it stays while the stops of the path scroll by on the left and
// the path, in white like the pins, draws itself between them.
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export async function journey(container) {
    if (!container) return;
    const { stops } = await fetch('assets/data/journey.json').then(r => r.json());

    const stage = el('div', 'journey-stage');
    const canvas = el('canvas', 'journey-globe');
    const marks = el('canvas', 'journey-globe');
    canvas.setAttribute('aria-hidden', 'true');
    marks.setAttribute('aria-hidden', 'true');
    stage.append(canvas, marks);
    const list = el('ol', 'journey-stops');
    const items = stops.map(stop => {
        const item = el('li', 'journey-stop');
        item.tabIndex = 0;
        item.append(el('span', 'journey-when', stop.when), el('h3', 'journey-place scrubbing-text', stop.place),
            el('span', 'journey-country', stop.country), el('p', 'journey-what scrubbing-text', stop.what));
        list.append(item);
        return item;
    });
    container.replaceChildren(stage, list);

    const land = landGrid();
    const root = getComputedStyle(document.documentElement);
    const ink = getComputedStyle(container).color, paper = root.getPropertyValue('--black').trim();
    const red = root.getPropertyValue('--accent').trim();
    const cells = cellCanvas(canvas, red);   // the Earth in red, like the face
    const pins = cellCanvas(marks, ink);     // the path and the pins in white
    const labels = marks.getContext('2d');
    let cols = 0, rows = 0, brightness = null, pinBrightness = null;
    const fit = () => {
        const c = Math.ceil(stage.clientWidth / CELL), r = Math.ceil(stage.clientHeight / CELL);
        if (c === cols && r === rows) return;
        cols = c; rows = r;
        cells.resize(c, r);
        pins.resize(c, r);
        brightness = new Uint8Array(c * r);
        pinBrightness = new Uint8Array(c * r);
    };

    // The globe for the intro at p (0 → 1): its centre and radius in px, and the point it faces.
    const touch = matchMedia('(max-width: 1024px)');
    const view = p => {
        const W = stage.clientWidth, H = stage.clientHeight, e = ease(p);
        const r0 = Math.max(W * 0.62, H * 0.95), y0 = H * 0.22 + r0;            // huge, only its top in view
        const r1 = touch.matches ? Math.min(W * 0.42, H * 0.26) : Math.min(H * 0.36, W * 0.25);
        const x1 = touch.matches ? W * 0.5 : W * 0.72, y1 = touch.matches ? H * 0.3 : H * 0.5;
        return {
            r: r0 * (r1 / r0) ** e,
            cx: W / 2 + (x1 - W / 2) * e,
            cy: y0 + (y1 - y0) * e,
            lon: stops[0].lon - 360 * (1 - e),                                   // one full turn
            lat: 30 + (stops[0].lat - 30) * e,
        };
    };

    let active = 0, hovered = -1, pos = 0;
    const draw = time => {
        if (!cols) return;
        const introLength = innerHeight * 1.4;
        const p = reducedMotion ? 1 : clamp01(-container.getBoundingClientRect().top / introLength);
        const v = view(p);
        let lon0 = v.lon, lat0 = v.lat;
        if (p >= 1) {
            // Settled: the view follows the path between the two stops it is on.
            const i = Math.min(stops.length - 2, Math.floor(pos)), f = clamp01(pos - i);
            const from = stops[i], to = stops[Math.min(stops.length - 1, i + 1)];
            lon0 = from.lon + (((to.lon - from.lon + 540) % 360) - 180) * f;
            lat0 = from.lat + (to.lat - from.lat) * f;
        }
        const sinL = Math.sin(lat0 * RAD), cosL = Math.cos(lat0 * RAD);
        brightness.fill(0);
        pinBrightness.fill(0);
        const c0 = Math.max(0, Math.floor((v.cx - v.r) / CELL)), c1 = Math.min(cols - 1, Math.ceil((v.cx + v.r) / CELL));
        const r0 = Math.max(0, Math.floor((v.cy - v.r) / CELL)), r1 = Math.min(rows - 1, Math.ceil((v.cy + v.r) / CELL));
        for (let row = r0; row <= r1; row++) {
            const y = (v.cy - (row + 0.5) * CELL) / v.r;
            for (let col = c0; col <= c1; col++) {
                const x = ((col + 0.5) * CELL - v.cx) / v.r;
                const rr = x * x + y * y;
                if (rr > 1) continue;
                const z = Math.sqrt(1 - rr);
                const lat = Math.asin(z * sinL + y * cosL) / RAD;
                const lon = ((lon0 + Math.atan2(x, z * cosL - y * sinL) / RAD) % 360 + 540) % 360 - 180;
                const gx = Math.min(360 * GRID - 1, Math.floor((lon + 180) * GRID)), gy = Math.min(180 * GRID - 1, Math.floor((90 - lat) * GRID));
                const lit = Math.max(0, x * SUN[0] + y * SUN[1] + z * SUN[2]);
                const ground = land[gy * 360 * GRID + gx] ? 80 + 175 * lit : 10 + 45 * lit;
                brightness[row * cols + col] = cloud(lon, lat, time / 1000) > 0.62 ? 100 + 40 * lit : ground;   // clouds: a checkerboard
            }
        }

        // Once the globe has settled: the path, a white arc lifted off the globe, drawn as far as the visit has got,
        // and the stops, a white cell in a cleared halo, the one being read ringed.
        const settled = clamp01((p - 0.9) / 0.1);
        const where = (lat, lon, lift = 1) => {
            const la = lat * RAD, dl = (lon - lon0) * RAD;
            return {
                x: v.cx + Math.cos(la) * Math.sin(dl) * v.r * lift,
                y: v.cy - (cosL * Math.sin(la) - sinL * Math.cos(la) * Math.cos(dl)) * v.r * lift,
                z: sinL * Math.sin(la) + cosL * Math.cos(la) * Math.cos(dl),
            };
        };
        const put = (x, y, value, clear) => {
            const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
            if (col < 0 || row < 0 || col >= cols || row >= rows) return;
            if (value) pinBrightness[row * cols + col] = value;
            if (clear) brightness[row * cols + col] = 0;
        };
        const shown = [];
        if (settled > 0) {
            const vec = stop => { const la = stop.lat * RAD, lo = stop.lon * RAD; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
            for (let j = 0; j < stops.length - 1; j++) {
                const done = clamp01(pos - j);
                if (done <= 0) continue;
                const a = vec(stops[j]), b = vec(stops[j + 1]);
                const omega = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) || 1e-6;
                for (let k = 0, steps = 200; k <= steps * done; k++) {
                    const t = k / steps;
                    const wa = Math.sin((1 - t) * omega) / Math.sin(omega), wb = Math.sin(t * omega) / Math.sin(omega);
                    const q = [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]];
                    const pt = where(Math.asin(q[2]) / RAD, Math.atan2(q[1], q[0]) / RAD, 1 + 0.14 * Math.sin(Math.PI * t));
                    if (pt.z > 0) put(pt.x, pt.y, 255, true);
                }
            }
            stops.forEach((stop, i) => {
                const pt = where(stop.lat, stop.lon);
                if (pt.z < 0.08) return;
                const isActive = i === (hovered >= 0 ? hovered : active);
                const ring = isActive && Math.floor(time / 450) % 2 === 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const d = Math.max(Math.abs(dx), Math.abs(dy));
                        const x = pt.x + dx * CELL, y = pt.y + dy * CELL;
                        if (d === 0) put(x, y, 255, true);
                        else if (d === 1) put(x, y, 0, true);
                        else if (ring) put(x, y, 100, false);
                    }
                }
                shown.push({ stop, pt, isActive });
            });
        }
        cells.paint(brightness);
        pins.paint(pinBrightness);

        // The names of the stops, small and square-cornered: the stop being read is inverted.
        if (shown.length) {
            const k = marks.width / stage.clientWidth;
            labels.save();
            labels.scale(k, k);
            labels.font = '500 13px Satoshi, sans-serif';
            labels.textBaseline = 'middle';
            for (const { stop, pt, isActive } of shown) {
                const w = labels.measureText(stop.place).width;
                const x = pt.x + 22, y = pt.y;
                labels.fillStyle = isActive ? ink : paper;
                labels.fillRect(x - 8, y - 12, w + 16, 24);
                labels.fillStyle = isActive ? paper : ink;
                labels.fillText(stop.place, x, y + 1);
            }
            labels.restore();
        }
    };

    // Where the visit stands, in stops: the stop centred on screen, plus how far the next one has come up.
    let scrollPos = 0;
    const pick = () => {
        const centres = items.map(item => { const r = item.getBoundingClientRect(); return r.top + r.height / 2 - innerHeight / 2; });
        let i = 0;
        while (i < items.length - 1 && centres[i + 1] <= 0) i++;
        const frac = i < items.length - 1 ? clamp01(-centres[i] / (centres[i + 1] - centres[i])) : 0;
        scrollPos = i + frac;
    };
    const mark = () => items.forEach((item, i) => item.classList.toggle('is-active', i === (hovered >= 0 ? hovered : active)));
    items.forEach((item, i) => {
        const on = () => { hovered = i; mark(); };
        const off = () => { hovered = -1; mark(); };
        item.addEventListener('pointerenter', on);
        item.addEventListener('pointerleave', off);
        item.addEventListener('focus', on);
        item.addEventListener('blur', off);
    });

    fit();
    if (reducedMotion) {
        pos = stops.length - 1;
        mark();
        const still = () => { fit(); draw(0); };
        still();
        addEventListener('resize', still, { passive: true });
        return;
    }
    addEventListener('resize', fit, { passive: true });
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
    let last = 0;
    const loop = time => {
        requestAnimationFrame(loop);
        if (!visible) return;
        const dt = Math.min(0.05, (time - last) / 1000 || 0);
        last = time;
        pick();
        pos += ((hovered >= 0 ? hovered : scrollPos) - pos) * (1 - Math.exp(-dt * 4));
        active = Math.round(pos);
        mark();
        draw(time);
    };
    requestAnimationFrame(loop);
}

// ─── Clients ──────────────────────────────────────────────────────────────────
export async function clients(container) {
    if (!container) return;
    const { clients } = await fetch('assets/data/clients.json').then(r => r.json());
    const list = el('ul', 'client-list');
    for (const client of clients) {
        const item = el('li', 'client-item');
        const row = el(client.project ? 'a' : 'div', 'client-row');
        if (client.project) row.href = `project.html?id=${client.project}`;
        row.append(el('span', 'client-name scrubbing-text', client.name), el('span', 'client-what scrubbing-text', client.what), el('span', 'client-year', client.year));
        item.append(row);
        list.append(item);
    }
    container.replaceChildren(list);
}
