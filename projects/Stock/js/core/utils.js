import { L, LOCALE } from '../i18n/i18n.js';
const domCache = new Map();

export const getEl = (id) => {
    const hit = domCache.get(id);
    if (hit?.isConnected) return hit;
    const node = document.getElementById(id);
    if (node) domCache.set(id, node);
    else domCache.delete(id);
    return node;
};

const moneyFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCurrency = (val, currency = '$') => `${val < 0 ? '-' : ''}${moneyFormat.format(Math.abs(val))}\u00A0${currency}`;

const pctFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
export const formatPct = val => (val ? `${val > 0 ? '▲' : '▼'} ${pctFormat.format(val / 100)}` : pctFormat.format(0));

export function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
}

export const iconHtml = name => `<i class="i i-${name}" aria-hidden="true"></i>`;
export function icon(name) {
    const i = el('i', `i i-${name}`);
    i.setAttribute('aria-hidden', 'true');
    return i;
}

/** Shows one view: the card becomes active, its sidebar row too, everything else steps back. */
export function showCard(target) {
    const card = typeof target === 'string' ? document.getElementById(target) : target;
    if (!card) return null;
    for (const c of document.querySelectorAll('.card.active')) if (c !== card) c.classList.remove('active');
    card.classList.add('active');
    const sym = card.classList.contains('ticker-card') ? card.id.slice(5) : null;
    for (const t of document.querySelectorAll('.tab.active')) if (t.dataset.symbol !== sym) t.classList.remove('active');
    if (sym) for (const t of document.querySelectorAll(`.tab[data-symbol="${CSS.escape(sym)}"]`)) t.classList.add('active');
    window.scrollTo(0, 0);
    return card;
}

/** Symbol of the stock page on screen, or null. Lives here (leaf module) so the
 *  general ↔ ui import cycle cannot trap it uninitialized at load time. */
export const getActiveSymbol = () => document.querySelector('.ticker-card.active')?.id.slice(5) || null;

/** Orphan cells in dashboard grids stretch full width instead of leaving gaps.
 *  Add data-fill="orphans" on the grid; call after render (and when revealed).
 *  Measured, so it stays right at every breakpoint: a last row with fewer
 *  cells than the grid has tracks goes full-bleed. */
export function fillOrphans(scope = document) {
    for (const g of scope.querySelectorAll('[data-fill="orphans"]')) {
        const kids = [...g.children].filter(e => e.nodeType === 1 && e.offsetParent !== null);
        g.querySelectorAll('.span-full').forEach(e => e.classList.remove('span-full'));
        if (kids.length < 2) continue;
        const firstTop = kids[0].offsetTop;
        let tracks = 0;
        while (tracks < kids.length && kids[tracks].offsetTop === firstTop) tracks++;
        if (!tracks) continue;
        const lastTop = kids[kids.length - 1].offsetTop;
        const row = [];
        for (let i = kids.length - 1; i >= 0 && kids[i].offsetTop === lastTop; i--) row.unshift(kids[i]);
        if (row.length < tracks) row.forEach(e => e.classList.add('span-full'));
    }
}

export const termHtml = (key, text) => `<button type="button" class="term" data-term="${key}">${text}</button>`;

export function downloadText(filename, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Drag handle for a CSS width variable. side 'left' grows to the right, 'right' grows to the left. */
export function makeResizer(handle, { cssVar, storageKey, min, max, side = 'left', fallback, onChange }) {
    if (!handle || handle.dataset.bound) return;
    handle.dataset.bound = '1';
    const root = document.documentElement;
    const limit = w => Math.round(Math.max(min, Math.min(typeof max === 'function' ? max() : max, w)));
    const apply = w => { root.style.setProperty(cssVar, `${w}px`); onChange?.(w); };
    const saved = Number(localStorage.getItem(storageKey));
    if (saved) apply(limit(saved));
    let startX = 0, startW = 0, next = 0, frame = 0;
    const move = e => {
        next = limit(startW + (side === 'left' ? e.clientX - startX : startX - e.clientX));
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; apply(next); });
    };
    const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.body.classList.remove('is-resizing');
        if (next) try { localStorage.setItem(storageKey, String(next)); } catch { /* storage full */ }
    };
    handle.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        startX = e.clientX;
        startW = parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || fallback;
        next = 0;
        document.body.classList.add('is-resizing');
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    });
    handle.addEventListener('dblclick', () => {
        root.style.removeProperty(cssVar);
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        onChange?.(fallback);
    });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DONUT_R = 80;
const DONUT_C = 2 * Math.PI * DONUT_R;

export function drawDonut({ svg, legend, tooltip, items, format }) {
    const total = items.reduce((s, x) => s + x.value, 0);
    svg.replaceChildren();
    legend.replaceChildren();
    if (!(total > 0)) return;
    const gap = items.length > 1 ? 3 : 0;
    let offset = 0;
    const frag = document.createDocumentFragment();
    const rows = document.createDocumentFragment();
    for (const item of items) {
        const pct = item.value / total;
        const len = Math.max(0, pct * DONUT_C - gap);
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '100');
        c.setAttribute('cy', '100');
        c.setAttribute('r', String(DONUT_R));
        c.setAttribute('stroke', item.color);
        c.setAttribute('stroke-dasharray', `${len} ${DONUT_C - len}`);
        c.setAttribute('stroke-dashoffset', String(-offset));
        c.setAttribute('class', 'donut-seg');
        c.dataset.label = item.label;
        c.dataset.pct = (pct * 100).toFixed(1);
        c.dataset.value = format ? format(item.value) : '';
        frag.append(c);
        offset += pct * DONUT_C;

        const row = el('div', 'legend-row');
        if (item.symbol) { row.dataset.symbol = item.symbol; row.tabIndex = 0; }
        const sw = el('span', 'swatch');
        sw.style.background = item.color;
        row.append(sw, el('span', 'legend-label', item.label), el('span', 'legend-pct', `${(pct * 100).toFixed(1)}%`));
        rows.append(row);
    }
    svg.append(frag);
    legend.append(rows);
    if (!tooltip || svg.dataset.bound) return;
    svg.dataset.bound = '1';
    svg.addEventListener('pointermove', e => {
        const seg = e.target.closest?.('.donut-seg');
        if (!seg) { tooltip.hidden = true; return; }
        tooltip.textContent = `${seg.dataset.label} · ${seg.dataset.pct}%${seg.dataset.value ? ` · ${seg.dataset.value}` : ''}`;
        const box = svg.getBoundingClientRect();
        tooltip.style.transform = `translate(${e.clientX - box.left + 12}px, ${e.clientY - box.top - 36}px)`;
        tooltip.hidden = false;
    });
    svg.addEventListener('pointerleave', () => { tooltip.hidden = true; });
}

function fmtEta(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '';
    return sec < 60 ? L('about {0} s left', Math.max(1, Math.round(sec))) : L('about {0} min left', Math.round(sec / 60));
}

export function progressBar({ label = '', detail = '', compact = false, eta = true } = {}) {
    const root = el('div', `pbar${compact ? ' pbar-compact' : ''} is-busy`);
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');
    const head = el('div', 'pbar-head');
    const $label = el('span', 'pbar-label');
    const $detail = el('span', 'pbar-detail');
    const track = el('div', 'pbar-track');
    const $fill = el('div', 'pbar-fill');
    head.append($label, $detail);
    track.append($fill);
    root.append(head, track);
    let started = 0, lastFrac = 0;
    const setText = (l, d) => {
        if (l != null) { $label.textContent = l; root.setAttribute('aria-label', l); }
        if (d != null) $detail.textContent = d;
    };
    setText(label, detail);
    const api = {
        el: root,
        set(frac, l, d) {
            const f = Math.max(0, Math.min(1, Number(frac) || 0));
            if (!started && f > 0) started = performance.now();
            root.classList.remove('is-busy', 'is-failed');
            $fill.style.transform = `scaleX(${f})`;
            root.setAttribute('aria-valuenow', String(Math.round(f * 100)));
            let dd = d;
            if (eta && d != null && started && f > 0.04 && f < 0.995 && f > lastFrac) {
                const elapsed = (performance.now() - started) / 1000;
                if (elapsed > 2) dd = [d, fmtEta(elapsed * (1 - f) / f)].filter(Boolean).join(' · ');
            }
            lastFrac = f;
            setText(l, dd);
            return api;
        },
        busy(l, d = '') { root.classList.add('is-busy'); root.removeAttribute('aria-valuenow'); setText(l, d); return api; },
        done(l) { api.set(1, l ?? $label.textContent, ''); root.classList.add('is-done'); return api; },
        fail(msg) { root.classList.remove('is-busy'); root.classList.add('is-failed'); setText(msg, ''); return api; },
        remove() { root.remove(); },
    };
    return api;
}

export function stages(bar, list) {
    const total = list.reduce((s, x) => s + (x[2] || 1), 0);
    let offset = 0;
    const map = {};
    for (const [key, label, w = 1] of list) { map[key] = { label, start: offset / total, span: w / total }; offset += w; }
    return {
        go(key, frac = 0, detail = '', label) {
            const s = map[key];
            if (s) bar.set(s.start + s.span * Math.max(0, Math.min(1, frac)), label || s.label, detail);
        },
        busy(key, detail = '', label) { const s = map[key]; if (s) bar.busy(label || s.label, detail); },
    };
}

/* Top-of-page global activity bar removed: each screen already shows its own progress bar tied to what it's actually doing. Kept as no-ops so callers don't need changes. */
export const activity = {
    start() {},
    update() {},
    end() {},
};

/* Average color of a ticker's icon, for tinting things with it (donut slices, the ticker-page glow). Cached in memory + localStorage since an icon's color never changes. */
const ICON_COLOR_KEY = 'nemeris_icon_colors';
const iconColorCache = new Map();
let iconColorStore = null;
function iconColorStoreGet() {
    if (!iconColorStore) { try { iconColorStore = JSON.parse(localStorage.getItem(ICON_COLOR_KEY) || '{}'); } catch { iconColorStore = {}; } }
    return iconColorStore;
}
export function iconColor(symbol) {
    if (!symbol) return Promise.resolve(null);
    if (iconColorCache.has(symbol)) return iconColorCache.get(symbol);
    const stored = iconColorStoreGet()[symbol];
    if (stored) { const p = Promise.resolve(stored); iconColorCache.set(symbol, p); return p; }
    const p = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = c.height = 16;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, 16, 16);
                const data = ctx.getImageData(0, 0, 16, 16).data;
                let r = 0, g = 0, b = 0, n = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 80) continue;
                    const rr = data[i], gg = data[i + 1], bb = data[i + 2];
                    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
                    if (max > 240 && min > 220) continue;
                    if (max < 20) continue;
                    r += rr; g += gg; b += bb; n++;
                }
                if (!n) { resolve(null); return; }
                const color = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
                iconColorStoreGet()[symbol] = color;
                try { localStorage.setItem(ICON_COLOR_KEY, JSON.stringify(iconColorStore)); } catch { /* ignore */ }
                resolve(color);
            } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = `img/icon/${symbol}.png`;
    });
    iconColorCache.set(symbol, p);
    return p;
}
