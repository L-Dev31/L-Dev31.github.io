import { reducedMotion, lowPower, clamp01 } from './common.js';
import { cellCanvas, CELL } from './pixel.js';
import { FLAGS as FLAG_SETTINGS } from './config.js';

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

const LAND = [

    [[-168, 66], [-163, 69], [-156, 71], [-141, 70], [-125, 70], [-110, 68], [-95, 68], [-94, 64], [-94, 59], [-87, 56], [-82, 55], [-80, 51], [-78, 56], [-77, 62], [-70, 61], [-65, 60], [-62, 56], [-56, 52], [-60, 50], [-66, 50], [-64, 47], [-61, 45], [-66, 44], [-70, 43], [-70, 41.5], [-74, 40.5], [-76, 37], [-76, 35], [-81, 31], [-80, 27], [-80, 25], [-83, 28], [-84, 30], [-89, 30], [-94, 29.5], [-97, 27.5], [-97.5, 22], [-96, 19], [-91, 18.5], [-90, 21], [-87, 21.5], [-88, 16], [-84, 15.5], [-83.5, 11], [-81, 8.5], [-77.5, 8.5], [-80, 7.5], [-84, 9], [-87, 13], [-92, 14.5], [-96, 15.7], [-101, 17.5], [-105.5, 20], [-106, 23.5], [-110, 27], [-114.5, 31], [-112, 26], [-110, 23], [-112, 25.5], [-114.5, 28], [-117, 32.5], [-120.5, 34.5], [-122.5, 37.5], [-124, 40.5], [-124, 46], [-124.5, 48.5], [-128, 51], [-131, 55], [-136, 58], [-141, 60], [-147, 61], [-152, 59], [-158, 56.5], [-164, 54.5], [-160, 58.5], [-165, 61], [-164.5, 64.5], [-168, 66]],

    [[-73, 78], [-60, 82], [-32, 83.5], [-19, 80], [-18, 76], [-22, 70.5], [-32, 67], [-40, 65], [-43.5, 60], [-49, 61.5], [-53, 66], [-54, 70], [-58, 75.5], [-67, 76.5]],

    [[-77.5, 8.5], [-75.5, 10.5], [-72, 12], [-68, 10.5], [-62, 10.5], [-57, 6], [-52, 5], [-50, 1.5], [-48, -1], [-44, -2.5], [-40, -3], [-35, -5.5], [-35, -9], [-38.5, -13], [-39, -18], [-41, -22], [-44.5, -23], [-48.5, -26], [-49, -29], [-53, -33.5], [-56, -35], [-58, -34.5], [-57, -38], [-62, -39], [-65, -41], [-65, -45], [-67.5, -46.5], [-69, -51], [-68.5, -53], [-71, -54.5], [-74.5, -51], [-75.5, -47], [-73.5, -42], [-73.5, -37], [-71.5, -30], [-70.5, -23], [-70.5, -18.5], [-76, -14], [-79, -8], [-81, -5], [-80, -1], [-79, 1.5], [-77.5, 4], [-77.5, 8.5]],

    [[-9.5, 37], [-9, 43], [-2, 43.5], [-1.5, 46.5], [-4.5, 48.5], [-1, 49.5], [2, 51], [5, 53], [8.5, 54], [8.5, 57], [10.5, 57.7], [12.5, 56], [11, 54], [14, 54], [19, 54.5], [21, 57], [24, 57.5], [23.5, 59.5], [30, 60], [23, 60.5], [21.5, 63], [25.5, 65.5], [22, 66], [17.5, 62.5], [18.5, 60], [16.5, 57], [12.5, 56.2], [10.5, 59], [6, 58], [5, 61], [8, 63.5], [14, 67.5], [18, 69.8], [25, 71], [31, 70], [40, 67.5], [44, 68.5], [54, 68.5], [60, 69.5], [68, 68.5], [73, 72.5], [80, 73.5], [87, 75], [100, 77], [107, 77], [113, 73.5], [127, 73.5], [140, 72], [152, 70.5], [161, 69.5], [170, 70], [180, 69], [180, 65], [178, 64], [173, 61], [163, 60], [162, 57], [156, 51], [156, 57.5], [151, 59.5], [142, 59.3], [137, 54], [141, 52.5], [140, 48], [132.5, 43], [129.5, 41], [129.5, 35.5], [126.5, 34.5], [125, 39.5], [121.5, 39], [122, 40.5], [119, 39], [119, 37], [122.5, 37], [120, 34.5], [122, 30.5], [121, 28], [119.5, 25.5], [116.5, 23], [113, 22], [109.5, 21.5], [108, 21.5], [106.5, 20], [106, 18], [108.5, 15], [109, 11.5], [105, 8.6], [103, 10.5], [100, 13.5], [99.5, 9], [101, 6.5], [103.5, 1.3], [101, 2.8], [98.5, 8], [98.5, 13], [97.5, 16.5], [94.5, 16], [94, 19.5], [92, 22], [90, 22], [87, 21.5], [86.5, 20], [84.5, 18.5], [80.5, 15.5], [80, 10], [77.5, 8], [76.5, 9], [74, 14.5], [72.8, 19], [72.5, 21], [70, 22.5], [68.5, 23.5], [66.5, 25.5], [61.5, 25.2], [57.5, 25.7], [56.3, 27.2], [52, 27.8], [50, 30], [48, 30], [50, 26.5], [51.5, 24.5], [54, 24], [56.5, 24.5], [56.3, 26.3], [59.8, 22.5], [58.5, 20.5], [55, 17], [52, 16], [45, 13], [43, 12.7], [42.7, 15.5], [39.5, 21], [38.5, 24], [35, 28], [34.5, 29.5], [32.5, 30], [34.5, 31.5], [35.5, 34], [36, 36.5], [32, 36.2], [29, 36.5], [26.5, 38.5], [26.5, 40], [29, 41], [28, 42], [28.5, 43.5], [30, 45.5], [33.5, 44.5], [36.5, 45.2], [38, 47], [41.5, 41.5], [36, 41.5], [31, 41.2], [29, 41], [26, 41], [23.5, 40], [22.5, 40.5], [24, 38], [22, 36.5], [21, 38.5], [19.5, 41.5], [19, 42.5], [16, 43.5], [13.5, 45.5], [12.3, 45.2], [14, 42.5], [16, 41.5], [18.5, 40.2], [16.5, 39], [15.6, 38], [16, 39.8], [15, 40.2], [12.5, 41.5], [10.5, 43], [8.7, 44.4], [6.5, 43.1], [3, 43.2], [3.2, 42], [0, 39.5], [-0.5, 38], [-2.2, 36.8], [-5.5, 36], [-7.5, 37.2], [-9.5, 37]],

    [[-5.7, 50], [1.4, 51.2], [1.7, 52.7], [0, 53.5], [-1.5, 55], [-2, 56], [-1.8, 57.6], [-3.3, 58.6], [-5, 58.6], [-5.6, 56.3], [-4.8, 54.8], [-3, 53.9], [-4.5, 53.3], [-4.8, 52.1], [-3, 51.4], [-5.7, 50]],
    [[-6, 52], [-6, 54], [-7.5, 55.3], [-10, 54.2], [-10, 51.6]],

    [[-22.5, 64], [-21, 66.2], [-15, 66.5], [-13.5, 65], [-18, 63.4]],

    [[-17, 21], [-16.5, 16], [-17.2, 14.7], [-15, 11], [-13, 8], [-11, 6.5], [-7.5, 4.4], [-2, 4.8], [2, 6.3], [6, 4.3], [8.5, 4.5], [9.8, 2.5], [9, -1], [12, -5], [13.5, -11], [12, -17], [14.5, -22.5], [16.5, -28.5], [18.5, -34.2], [22, -34], [26, -33.8], [30, -31], [32.5, -28.5], [33, -26], [35.5, -24], [35, -20], [40, -16], [40.5, -11], [39.5, -6], [41.5, -1.5], [44, 1.5], [48, 5], [51, 10.5], [51.2, 12], [48, 11.2], [44, 10.5], [43.3, 12], [41, 14.8], [38.5, 18.5], [37, 22], [35.5, 24], [34, 27], [32.5, 29.9], [30, 31.3], [25, 31.6], [20, 30.8], [19.5, 32.5], [15, 32.3], [11, 33.2], [10.3, 36.9], [7.5, 37], [3, 36.8], [-1.5, 35.2], [-5.5, 35.8], [-7, 34], [-9.8, 30.5], [-11, 28.2], [-13, 27.5], [-15, 24.5], [-17, 21]],

    [[49.3, -12], [50.5, -15.5], [49.5, -18], [47, -25], [44, -25], [43.5, -22], [44.5, -16.5], [47.5, -14]],

    [[130, 31.5], [131.5, 34], [133, 34.5], [135, 34], [136.5, 34.3], [140, 35.2], [141, 38], [142, 39.5], [141.5, 41.5], [140, 40.5], [139.5, 38], [137, 37], [136, 35.8], [132.5, 35.5], [130.8, 33.8]],
    [[140, 41.5], [141.7, 42.5], [143.5, 42], [145.5, 43.3], [142, 45.5], [140, 43.5]],

    [[95.3, 5.5], [98, 4], [104, -2], [106, -6], [104.5, -5.8], [101, -3], [98.5, 0], [95.5, 4]],
    [[105.5, -6.8], [110, -7], [114.5, -7.8], [114.5, -8.8], [110, -8.2], [106, -7.6]],
    [[109, 1.5], [110, -1.5], [114, -4], [116.5, -3.5], [118.5, 1], [117.5, 4.5], [116, 7], [113, 3.2], [111, 2]],
    [[119, -5.5], [120.5, 1], [125, 1.5], [121.5, -1], [123, -5.5]],
    [[131, -1], [134, -0.8], [138, -1.6], [141, -2.6], [145, -4], [147.5, -6], [150.5, -10.5], [147, -10], [144, -7.8], [141, -9.2], [138, -8.3], [137.5, -5], [133, -4], [131.5, -2.5]],
    [[120, 18.5], [122.5, 18.5], [124, 13.5], [126.5, 7], [125.5, 6], [122, 7], [123.5, 10.5], [121, 13.8]],

    [[113.5, -22], [114, -26.5], [115, -34], [118, -35], [123, -33.8], [129, -31.6], [134, -32.5], [137.8, -35.8], [140, -38], [144, -38.3], [147.5, -38], [150, -37.5], [153, -31], [153, -25.5], [150.5, -22.5], [146.3, -19], [145.3, -15], [142.5, -10.7], [141.5, -15], [140.8, -17.5], [139, -17], [135.5, -15], [136.5, -12], [132.5, -11.5], [130, -13], [127, -14], [125, -15.5], [122, -18], [121, -19.5], [117, -20.7], [113.5, -22]],
    [[145, -40.8], [148.3, -41], [147.5, -43.5], [146, -43.5]],

    [[172.7, -34.5], [174.5, -36], [178.5, -37.5], [177, -39.5], [175, -41.5], [174.5, -40], [173.8, -39]],
    [[172.5, -40.5], [174.3, -41.8], [171, -44.5], [169, -46.6], [166.5, -46], [168, -44]],

    [[79.8, 9.8], [81.9, 7.5], [81.3, 6.2], [80, 6.2]],
    [[-85, 21.8], [-82, 23.2], [-78, 22.4], [-74.2, 20.2], [-77.7, 19.9], [-80.5, 21.7], [-84.8, 21.4]],
    [[-74.5, 19.8], [-72.8, 19.9], [-69.8, 19.6], [-68.4, 18.6], [-71.4, 17.6], [-74.4, 18.4]],

    [[-180, -84], [-180, -78], [-160, -77.5], [-150, -76], [-130, -74], [-110, -74], [-100, -73], [-75, -73], [-62, -64], [-57, -63.5], [-60, -70], [-60, -75], [-45, -78], [-30, -76], [-10, -71], [10, -70], [30, -69.5], [50, -67], [70, -68], [90, -66.5], [110, -66], [130, -66.3], [150, -68.5], [165, -71], [170, -77.5], [180, -78], [180, -84]],
];

const GRID = 2;
function landGrid() {
    const canvas = document.createElement('canvas');
    canvas.width = 360 * GRID; canvas.height = 180 * GRID;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.scale(GRID, GRID);
    ctx.fillStyle = '#F6F2F2';
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
const TILT = 42;
const WIDTH = 360 * GRID;
const LAT_ROW = Uint16Array.from({ length: 4096 }, (_, i) => Math.min(180 * GRID - 1, Math.floor((90 - Math.asin(Math.min(1, Math.max(-1, i / 2047.5 - 1))) / RAD) * GRID)));
const SUN = (() => { const l = [-0.5, 0.45, 0.75], n = Math.hypot(...l); return l.map(v => v / n); })();

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const FLAG_WAVE = FLAG_SETTINGS.waveAmount;
const SHADES = FLAG_SETTINGS.shades;
const FLAGS = {};
const cache = new Map();
const load = url => cache.get(url) ?? cache.set(url, fetch(url).then(r => r.json())).get(url);

function waving(host, key) {
    const spec = FLAGS[key];
    if (!spec) return null;
    const canvas = el('canvas', 'journey-flag-canvas');
    host.append(canvas);
    const ctx = canvas.getContext('2d');
    const rgb = spec.palette.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));

    const fills = rgb.map(c => Array.from({ length: SHADES }, (_, s) => {
        const f = 0.5 + s * 0.6 / (SHADES - 1);
        return `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
    }));
    let cols = 0, rows = 0, pad = 0, scale = 1, texture = null;
    const build = () => {
        const h = host.clientHeight;
        if (!h) return false;

        const nr = Math.max(3, Math.round(h / CELL)), nc = Math.round(nr * spec.aspect);
        const dpr = Math.max(1, Math.round(devicePixelRatio));
        if (nr === rows && nc === cols && dpr === scale && canvas.dataset.cell === String(CELL)) return true;
        canvas.dataset.cell = CELL;
        rows = nr; cols = nc; scale = dpr;
        pad = Math.ceil(FLAG_WAVE * rows) + 1;
        canvas.width = cols * CELL * scale;
        canvas.height = (rows + 2 * pad) * CELL * scale;
        canvas.style.width = `${cols * CELL}px`;
        canvas.style.height = `${(rows + 2 * pad) * CELL}px`;

        const tw = cols * 2, th = rows * 2;
        texture = new Uint8Array(tw * th);
        const gh = spec.grid.length, gw = spec.grid[0].length;
        for (let y = 0; y < th; y++) {
            const line = spec.grid[Math.min(gh - 1, Math.floor(y / th * gh))];
            for (let x = 0; x < tw; x++) texture[y * tw + x] = line.charCodeAt(Math.min(gw - 1, Math.floor(x / tw * gw))) - 48;
        }
        return true;
    };

    return (p, time) => {
        if (p <= 0.001 || !build()) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        const tw = cols * 2, th = rows * 2, size = CELL * scale, side = Math.max(1, Math.round(size * 0.25));
        const sq = size - side, t = time / 1000 * 2.6;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const span = Math.max(1, Math.round(cols * p)), x0 = Math.round((cols - span) / 2);
        const high = Math.max(1, Math.round(rows * p)), y0 = Math.round((rows - high) / 2);
        for (let i = 0; i < span; i++) {
            const u = (i + 0.5) / span;
            const a = Math.PI * 2 * 1.3 * u - t;
            const dy = FLAG_WAVE * u * Math.sin(a) * p;
            const slope = FLAG_WAVE * (Math.sin(a) + u * Math.PI * 2 * 1.3 * Math.cos(a));
            const shade = Math.max(0, Math.min(SHADES - 1, Math.round((0.7 - 0.5 * slope) * (SHADES - 1))));
            const tx = Math.min(tw - 1, Math.floor(u * tw));
            for (let j = 0; j < high; j++) {
                const v = (j + 0.5) / high;
                const ty = Math.floor((v - dy / Math.max(p, 0.001)) * th);
                if (ty < 0 || ty >= th) continue;
                ctx.fillStyle = fills[texture[ty * tw + tx]][shade];
                const row = y0 + j + Math.round(dy * rows) + pad;
                ctx.fillRect((x0 + i) * size, row * size, sq, sq);
            }
        }
    };
}

export async function journey(container) {
    if (!container) return;
    const track = container.dataset.layout === 'track';
    const [data, places, flagData] = await Promise.all([load(container.dataset.src || 'assets/data/journey.json'), load('assets/data/places.json'), load('assets/data/flags.json')]);
    Object.assign(FLAGS, flagData);
    const stops = data.stops.map((entry, i) => {
        const stop = typeof entry === 'string' ? { id: entry } : entry, place = places[stop.id];
        return {
            ...place, flag: stop.id, label: place.name, place: stop.title ?? place.name, country: stop.caption ?? place.region,
            when: stop.when ?? (track ? String(i + 1).padStart(2, '0') : ''), what: stop.what,
        };
    });

    const stage = el('div', 'journey-stage');
    const canvas = el('canvas', 'journey-globe');
    const marks = el('canvas', 'journey-globe');
    canvas.setAttribute('aria-hidden', 'true');
    marks.setAttribute('aria-hidden', 'true');
    stage.append(canvas, marks);
    const list = el('ol', track ? 'travel-track' : 'journey-stops');
    const items = stops.map(stop => {
        const item = el('li', track ? 'travel-stop' : 'journey-stop');
        item.tabIndex = 0;

        const words = stop.place.split(' '), cut = Math.ceil(words.length / 2);
        const place = el('h3', 'journey-place'), slot = el('span', 'journey-flag');
        place.setAttribute('aria-label', stop.place);
        slot.setAttribute('aria-hidden', 'true');
        slot.style.setProperty('--aspect', FLAGS[stop.flag]?.aspect ?? 1.5);
        place.append(el('span', 'journey-half scrubbing-text', words.slice(0, cut).join(' ')), slot,
            el('span', 'journey-half scrubbing-text', words.slice(cut).join(' ')));
        const body = track ? item : el('div', 'journey-card');
        body.append(...[stop.when && el('span', 'journey-when', stop.when), place,
            el('span', 'journey-country', stop.country), stop.what && el('p', 'journey-what scrubbing-text', stop.what)].filter(Boolean));
        if (!track) item.append(body);
        list.append(item);
        return item;
    });
    const flags = stops.map((stop, i) => ({ paint: waving(items[i].querySelector('.journey-flag'), stop.flag), slot: items[i].querySelector('.journey-flag'), open: 0, at: 0 }));
    const openFlags = (time, instant) => flags.forEach((f, i) => {
        if (!f.paint) return;
        const r = items[i].getBoundingClientRect();
        const near = instant ? 1 : track
            ? clamp01(pos - i + 1)
            : clamp01(1 - Math.max(0, r.top + r.height / 2 - innerHeight / 2) / (innerHeight * 0.24));
        f.open = ease(near);
        f.slot.style.setProperty('--open', f.open.toFixed(3));
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || (f.open === f.shown && (lowPower || f.open === 0 || time - f.at < 66))) return;
        f.shown = f.open;
        f.at = time;
        f.paint(f.open, lowPower ? 0 : time);
    });
    if (track) {
        stage.append(list);
        container.style.setProperty('--stops', stops.length);
        container.replaceChildren(stage);
    } else {
        container.replaceChildren(stage, list);
    }

    const land = landGrid();
    const root = getComputedStyle(document.documentElement);
    const ink = getComputedStyle(container).color;
    const red = root.getPropertyValue('--accent').trim();
    const cells = cellCanvas(canvas, red);
    const pins = cellCanvas(marks, ink);
    const tags = stops.map(stop => {
        const tag = el('span', 'globe-label', stop.label);
        tag.hidden = true;
        tag.setAttribute('aria-hidden', 'true');
        stage.append(tag);
        return tag;
    });
    const xs = new Float32Array(2048);
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

    const touch = matchMedia('(max-width: 1024px)');
    const view = p => {
        const W = stage.clientWidth, H = stage.clientHeight, e = ease(p);
        if (track) {
            const r = Math.max(W * 0.56, H * 0.7);
            return { r, cx: W / 2, cy: H * 0.44 + r, lon: 0, lat: 0 };
        }
        const r0 = Math.max(W * 0.62, H * 0.95), y0 = H * 0.22 + r0;
        const r1 = touch.matches ? Math.min(W * 0.42, H * 0.26) : Math.min(H * 0.36, W * 0.25);
        const x1 = touch.matches ? W * 0.5 : W * 0.72, y1 = touch.matches ? H * 0.3 : H * 0.5;
        return {
            r: r0 * (r1 / r0) ** e,
            cx: W / 2 + (x1 - W / 2) * e,
            cy: y0 + (y1 - y0) * e,
            lon: stops[0].lon - 360 * (1 - e),
            lat: 30 + (stops[0].lat - 30) * e,
        };
    };

    let active = 0, hovered = -1, pos = 0, lastKey = '', lastPaint = 0;
    const draw = time => {
        if (!cols) return;
        const introLength = innerHeight * 1.4;
        const p = track || reducedMotion ? 1 : clamp01(-container.getBoundingClientRect().top / introLength);
        const v = view(p);
        let lon0 = v.lon, lat0 = v.lat;
        if (p >= 1) {

            const i = Math.min(stops.length - 2, Math.floor(pos)), f = clamp01(pos - i);
            const from = stops[i], to = stops[Math.min(stops.length - 1, i + 1)];
            lon0 = from.lon + (((to.lon - from.lon + 540) % 360) - 180) * f;
            lat0 = from.lat + (to.lat - from.lat) * f - (track ? TILT : 0);
        }

        const blink = Math.floor(time / 450) % 2 === 0;
        const key = `${lon0.toFixed(2)} ${lat0.toFixed(2)} ${v.r.toFixed(1)} ${v.cx.toFixed(1)} ${v.cy.toFixed(1)} ${cols} ${rows} ${pos.toFixed(3)} ${active} ${hovered} ${blink}`;
        if (key === lastKey) {
            if (time - lastPaint > 90) { lastPaint = time; cells.paint(brightness); }
            return;
        }
        if (time - lastPaint < 30) return;
        lastKey = key;
        lastPaint = time;

        const sinL = Math.sin(lat0 * RAD), cosL = Math.cos(lat0 * RAD);
        brightness.fill(0);
        pinBrightness.fill(0);
        const c0 = Math.max(0, Math.floor((v.cx - v.r) / CELL)), c1 = Math.min(cols - 1, Math.ceil((v.cx + v.r) / CELL));
        const r0 = Math.max(0, Math.floor((v.cy - v.r) / CELL)), r1 = Math.min(rows - 1, Math.ceil((v.cy + v.r) / CELL));
        for (let col = c0; col <= c1; col++) xs[col] = ((col + 0.5) * CELL - v.cx) / v.r;
        for (let row = r0; row <= r1; row++) {
            const y = (v.cy - (row + 0.5) * CELL) / v.r, yy = y * y, yc = y * cosL, ys = y * sinL, base = row * cols;
            for (let col = c0; col <= c1; col++) {
                const x = xs[col], rr = x * x + yy;
                if (rr > 1) continue;
                const z = Math.sqrt(1 - rr);
                const gy = LAT_ROW[Math.min(4095, ((z * sinL + yc + 1) * 2047.5) | 0)];
                const gx = ((((lon0 + 180 + Math.atan2(x, z * cosL - ys) / RAD) * GRID) % WIDTH) + WIDTH) % WIDTH | 0;
                const lit = Math.max(0, x * SUN[0] + y * SUN[1] + z * SUN[2]);
                brightness[base + col] = land[gy * WIDTH + gx] ? 80 + 175 * lit : 10 + 45 * lit;
            }
        }

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
                const steps = Math.max(24, Math.ceil(omega * v.r * 3 / CELL));
                for (let k = 0; k <= steps * done; k++) {
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
                const ring = isActive && blink;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const d = Math.max(Math.abs(dx), Math.abs(dy));
                        const x = pt.x + dx * CELL, y = pt.y + dy * CELL;
                        if (d === 0) put(x, y, 255, true);
                        else if (d === 1) put(x, y, 0, true);
                        else if (ring) put(x, y, 100, false);
                    }
                }
                shown.push({ i, pt, isActive });
            });
        }
        cells.paint(brightness);
        pins.paint(pinBrightness);

        const written = [], on = new Set();
        for (const here of shown) {
            const { i, pt, isActive } = here;
            const close = o => o !== here && Math.hypot(o.pt.x - pt.x, o.pt.y - pt.y) < 60;
            if (!isActive && (shown.some(o => close(o) && o.isActive) || written.some(close))) continue;
            written.push(here);
            on.add(i);
            tags[i].classList.toggle('is-active', isActive);
            const width = tags[i].offsetWidth;
            const tagX = pt.x + 14 + width > stage.clientWidth ? pt.x - 14 - width : pt.x + 14;
            tags[i].style.transform = `translate3d(${Math.round(tagX)}px, ${Math.round(pt.y - 12)}px, 0)`;
        }
        tags.forEach((tag, i) => { if (tag.hidden === on.has(i)) tag.hidden = !on.has(i); });
    };

    let scrollPos = 0;
    const pick = () => {
        if (track) {
            const r = container.getBoundingClientRect();
            scrollPos = clamp01(-r.top / Math.max(1, r.height - innerHeight)) * (stops.length - 1);
            return;
        }
        const centres = items.map(item => { const r = item.getBoundingClientRect(); return r.top + r.height / 2 - innerHeight / 2; });
        let i = 0;
        while (i < items.length - 1 && centres[i + 1] <= 0) i++;
        const frac = i < items.length - 1 ? clamp01(-centres[i] / (centres[i + 1] - centres[i])) : 0;
        scrollPos = i + frac;
    };
    const mark = () => items.forEach((item, i) => item.classList.toggle('is-active', i === (hovered >= 0 ? hovered : active)));
    if (!track) {
        items.forEach((item, i) => {
            const on = () => { hovered = i; mark(); };
            const off = () => { hovered = -1; mark(); };
            item.addEventListener('pointerenter', on);
            item.addEventListener('pointerleave', off);
            item.addEventListener('focus', on);
            item.addEventListener('blur', off);
        });
    }

    let bases = [], extras = [], gap = 0;
    const measure = () => {
        if (!track) return;
        flags.forEach(f => f.slot.style.setProperty('--open', 0));
        bases = items.map(item => item.offsetWidth);
        extras = flags.map((f, i) => parseFloat(getComputedStyle(f.slot).fontSize) * ((FLAGS[stops[i].flag]?.aspect ?? 1.5) * 0.7 + 0.3));
        gap = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft - bases[0] : 0;
    };
    const slide = at => {
        if (!bases.length) measure();
        let left = 0;
        const centres = items.map((_, i) => {
            const width = bases[i] + ease(clamp01(at - i + 1)) * extras[i];
            const centre = left + width / 2;
            left += width + gap;
            return centre;
        });
        const a = Math.min(stops.length - 1, Math.floor(at)), b = Math.min(stops.length - 1, a + 1);
        const x = stage.clientWidth / 2 - (centres[a] + (centres[b] - centres[a]) * (at - a));
        list.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    };
    document.fonts?.ready.then(measure);

    fit();
    if (reducedMotion) {
        pos = stops.length - 1;
        mark();
        const still = () => { fit(); measure(); if (track) slide(pos); draw(0); openFlags(0, true); };
        still();
        addEventListener('resize', still, { passive: true });
        return;
    }
    addEventListener('resize', () => { fit(); measure(); }, { passive: true });
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
    let frameAt = 0, glide = 0, markedActive = -1, markedHover = -2;
    const loop = time => {
        requestAnimationFrame(loop);
        if (!visible || (lowPower && time - frameAt < 66)) return;
        const dt = Math.min(0.1, (time - frameAt) / 1000 || 0);
        frameAt = time;
        pick();
        if (track) {
            glide += (scrollPos - glide) * (1 - Math.exp(-dt * 7));
            slide(glide);
            pos = glide;
        } else {
            pos += ((hovered >= 0 ? hovered : scrollPos) - pos) * (1 - Math.exp(-dt * 4));
        }
        active = Math.round(pos);
        if (active !== markedActive || hovered !== markedHover) { markedActive = active; markedHover = hovered; mark(); }
        draw(time);
        openFlags(time);
    };
    requestAnimationFrame(loop);
}
