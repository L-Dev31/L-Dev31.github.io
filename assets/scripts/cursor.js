import { reducedMotion, lowPower, isMobile } from './env.js';
import { CURSOR, MAGNET, PAGE_TRANSITION } from './config.js';

const CURSOR_WORDS = [
    ['[data-cursor]', element => element.dataset.cursor],
    ['a.index-row', () => 'Open'],
];

const POINTER_ON_LINK = 'a, button, [role="button"], label, summary';

const FONT_3X5 = {
    A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###',
    F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.',
    K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###', M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.',
    P: '##. #.# ##. #.. #..', Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
    U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#', Y: '#.# #.# .#. .#. .#.',
    Z: '### ..# .#. #.. ###', 0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
    4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.', 8: '### #.# ### #.# ###',
    9: '### #.# ### ..# ##.',
};

const ARROW_ROWS = ['.###', '..##', '.#.#', '#...'];

const centeredCells = (width, height, isOn) => {
    const cells = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isOn(x, y)) cells.push([x - Math.floor(width / 2), y - Math.floor(height / 2)]);
        }
    }
    return cells;
};

const SQUARE_CELLS = centeredCells(CURSOR.squareCells, CURSOR.squareCells, () => true);
const ARROW_CELLS = centeredCells(4, 4, (x, y) => ARROW_ROWS[y][x] === '#');

function wordCells(text) {
    const letters = [...text.toUpperCase()].filter(letter => FONT_3X5[letter] || letter === ' ');
    const widthInCells = letters.length * 4 - 1;
    const cells = [];
    letters.forEach((letter, index) => {
        const rows = FONT_3X5[letter]?.split(' ');
        if (!rows) return;
        rows.forEach((row, y) => [...row].forEach((pixel, x) => {
            if (pixel === '#') cells.push([index * 4 + x - Math.floor(widthInCells / 2), y - 2]);
        }));
    });
    return cells;
}

function shapeUnderPointer(target) {
    for (const [selector, getWord] of CURSOR_WORDS) {
        const element = target.closest(selector);
        if (element) return wordCells(getWord(element));
    }
    return target.closest(POINTER_ON_LINK) ? ARROW_CELLS : SQUARE_CELLS;
}

export function cursor() {
    const host = document.querySelector('.cursor');
    const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (isMobile || lowPower || !hasFinePointer) return;

    document.documentElement.classList.add('custom-cursor');
    const canvas = document.createElement('canvas');
    host.append(canvas);
    const context = canvas.getContext('2d');

    let pixelModule = null;
    import('./pixel.js').then(module => { pixelModule = module; });

    let pointerX = -100, pointerY = -100;
    let easedX = -100, easedY = -100;
    let shape = SQUARE_CELLS;
    let pressed = false;
    let insideWindow = false;
    let litCells = new Set();
    const leftAt = new Map();

    const resizeCanvas = () => {
        const ratio = Math.min(2, Math.max(1, Math.round(devicePixelRatio)));
        canvas.width = innerWidth * ratio;
        canvas.height = innerHeight * ratio;
    };
    resizeCanvas();
    addEventListener('resize', resizeCanvas, { passive: true });

    document.addEventListener('mousemove', event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!insideWindow) {
            easedX = pointerX;
            easedY = pointerY;
            insideWindow = true;
        }
    });
    document.addEventListener('mouseleave', () => { insideWindow = false; });
    document.addEventListener('mousedown', () => { pressed = true; });
    document.addEventListener('mouseup', () => { pressed = false; });
    document.addEventListener('mouseover', event => { shape = shapeUnderPointer(event.target); });

    const FULL_CELL = 2, CHECKER_CELL = 1, DOT_CELL = 0;
    const trailLevel = age => (age < 1 / 3 ? FULL_CELL : age < 2 / 3 ? CHECKER_CELL : DOT_CELL);

    const draw = now => {
        requestAnimationFrame(draw);
        if (!pixelModule) return;

        const cell = pixelModule.CELL;
        const pixelsPerCell = (canvas.width / innerWidth) * cell;
        easedX += (pointerX - easedX) * CURSOR.followEase;
        easedY += (pointerY - easedY) * CURSOR.followEase;
        const column = Math.round(easedX / cell);
        const row = Math.round(easedY / cell);

        const nowLit = new Set(insideWindow ? shape.map(([dx, dy]) => `${column + dx},${row + dy}`) : []);
        for (const key of litCells) if (!nowLit.has(key)) leftAt.set(key, now);
        for (const key of nowLit) leftAt.delete(key);
        litCells = nowLit;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff';

        for (const [key, since] of leftAt) {
            const age = (now - since) / 1000 / CURSOR.trailSeconds;
            if (age >= 1) {
                leftAt.delete(key);
                continue;
            }
            const [x, y] = key.split(',').map(Number);
            pixelModule.drawCell(context, trailLevel(age), x * pixelsPerCell, y * pixelsPerCell, pixelsPerCell);
        }
        for (const key of litCells) {
            const [x, y] = key.split(',').map(Number);
            pixelModule.drawCell(context, pressed ? CHECKER_CELL : FULL_CELL, x * pixelsPerCell, y * pixelsPerCell, pixelsPerCell);
        }
    };
    requestAnimationFrame(draw);
}

export function magnets() {
    const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (isMobile || lowPower || !hasFinePointer) return;

    const leaning = new Map();
    let frame = 0;

    const animate = () => {
        frame = 0;
        for (const [element, lean] of leaning) {
            lean.x += (lean.targetX - lean.x) * MAGNET.ease;
            lean.y += (lean.targetY - lean.y) * MAGNET.ease;
            const arrived = Math.abs(lean.targetX - lean.x) < 0.05 && Math.abs(lean.targetY - lean.y) < 0.05;
            if (arrived && !lean.targetX && !lean.targetY) {
                element.style.translate = '';
                leaning.delete(element);
            } else {
                element.style.translate = `${lean.x.toFixed(2)}px ${lean.y.toFixed(2)}px`;
            }
        }
        if (leaning.size) frame = requestAnimationFrame(animate);
    };

    const clampToMax = value => Math.max(-MAGNET.maxPx, Math.min(MAGNET.maxPx, value));
    let hovered = null;

    document.addEventListener('pointermove', event => {
        const element = event.target.closest(MAGNET.selector);
        if (hovered && hovered !== element) {
            const previous = leaning.get(hovered);
            previous.targetX = previous.targetY = 0;
        }
        hovered = element;
        if (element) {
            const box = element.getBoundingClientRect();
            const lean = leaning.get(element) ?? { x: 0, y: 0, targetX: 0, targetY: 0 };
            lean.targetX = clampToMax((event.clientX - (box.left + box.width / 2) + lean.x) * MAGNET.pull);
            lean.targetY = clampToMax((event.clientY - (box.top + box.height / 2) + lean.y) * MAGNET.pull);
            leaning.set(element, lean);
        }
        if (leaning.size && !frame) frame = requestAnimationFrame(animate);
    }, { passive: true });
}

export function pageTransitions() {
    if (reducedMotion) return;

    document.addEventListener('click', event => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || event.button !== 0 || modified) return;

        const link = event.target.closest('a[href]');
        if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

        const url = new URL(link.href, location.href);
        const isSitePage = url.origin === location.origin && /(\.html|\/)$/.test(url.pathname);
        const isSamePage = url.pathname === location.pathname && url.search === location.search;
        if (!isSitePage || isSamePage) return;

        event.preventDefault();
        const cover = document.createElement('div');
        cover.className = 'page-cover';
        document.body.append(cover);

        import('./pixel.js').then(({ dissolve }) => {
            const color = getComputedStyle(document.documentElement).getPropertyValue('--black').trim();
            dissolve(cover, { color, fixed: true, reverse: true, total: PAGE_TRANSITION.coverMs }, () => { location.href = url.href; });
        });
        setTimeout(() => cover.remove(), PAGE_TRANSITION.giveUpMs);
    });

    addEventListener('pageshow', event => {
        if (event.persisted) document.querySelectorAll('.page-cover').forEach(cover => cover.remove());
    });
}
