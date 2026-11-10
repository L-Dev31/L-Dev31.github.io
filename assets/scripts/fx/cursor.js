import { reducedMotion, lowPower, isMobile, CURSOR, MAGNET, PAGE_TRANSITION } from '../core/config.js';

const CURSOR_WORDS = [
    ['[data-cursor]', element => element.dataset.cursor],
    ['a.index-row', () => 'Open'],
];

const POINTER_ON_LINK = 'a, button, [role="button"], label, summary';

export function cursor() {
    const host = document.querySelector('.cursor');
    const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (isMobile || lowPower || !hasFinePointer) return;

    document.documentElement.classList.add('custom-cursor');
    const dot = document.createElement('span');
    dot.className = 'cursor-dot';
    const label = document.createElement('span');
    label.className = 'cursor-label';
    dot.append(label);
    host.append(dot);

    host.style.setProperty('--cursor-size', `${CURSOR.dotSizePx}px`);
    const setSize = px => host.style.setProperty('--cursor-size', `${px}px`);

    let pointerX = -100, pointerY = -100;
    let easedX = -100, easedY = -100;
    let insideWindow = false;
    let restingSize = CURSOR.dotSizePx;
    let pressed = false;

    document.addEventListener('mousemove', event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!insideWindow) {
            easedX = pointerX;
            easedY = pointerY;
            insideWindow = true;
            host.classList.add('is-visible');
        }
    });
    document.addEventListener('mouseleave', () => {
        insideWindow = false;
        host.classList.remove('is-visible');
    });
    document.addEventListener('mousedown', () => { pressed = true; setSize(CURSOR.pressedSizePx); });
    document.addEventListener('mouseup', () => { pressed = false; setSize(restingSize); });

    document.addEventListener('mouseover', event => {
        const named = CURSOR_WORDS.map(([selector, getWord]) => [event.target.closest(selector), getWord]).find(([element]) => element);
        if (named) {
            label.textContent = named[1](named[0]);
            restingSize = CURSOR.overWordSizePx;
        } else {
            label.textContent = '';
            restingSize = event.target.closest(POINTER_ON_LINK) ? CURSOR.overLinkSizePx : CURSOR.dotSizePx;
        }
        if (!pressed) setSize(restingSize);
    });

    function follow() {
        requestAnimationFrame(follow);
        easedX += (pointerX - easedX) * CURSOR.followEase;
        easedY += (pointerY - easedY) * CURSOR.followEase;
        host.style.transform = `translate(${easedX.toFixed(1)}px, ${easedY.toFixed(1)}px)`;
    }
    requestAnimationFrame(follow);
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

// A page the pointer is on its way to is fetched before the click, so the next page is there when the cover is.
const isSitePage = url => url.origin === location.origin && /(\.html|\/)$/.test(url.pathname);

function prefetchPages() {
    const asked = new Set();
    const prefetch = event => {
        const link = event.target.closest?.('a[href]');
        if (!link || link.target || link.hasAttribute('download')) return;
        const url = new URL(link.href, location.href);
        if (!isSitePage(url) || asked.has(url.href)) return;
        asked.add(url.href);
        const hint = document.createElement('link');
        hint.rel = 'prefetch';
        hint.href = url.href;
        document.head.append(hint);
    };
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('touchstart', prefetch, { passive: true });
}

export function pageTransitions() {
    prefetchPages();
    if (reducedMotion) return;

    document.addEventListener('click', event => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || event.button !== 0 || modified) return;

        const link = event.target.closest('a[href]');
        if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

        const url = new URL(link.href, location.href);
        const isSamePage = url.pathname === location.pathname && url.search === location.search;
        if (!isSitePage(url) || isSamePage) return;

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
