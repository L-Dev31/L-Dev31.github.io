import { fetchYahooChartSnapshot } from '../yahoo-finance.js';

// Returns a clean Number[] of closes for a ticker.
export async function fetchCloses(ticker, range = '1y', interval = '1d') {
    const series = await fetchSeries(ticker, range, interval);
    return series.closes;
}

// Returns aligned-by-day { ts:number[] (unix sec, day-floored), closes:number[] }.
export async function fetchSeries(ticker, range = '1y', interval = '1d') {
    const snap = await fetchYahooChartSnapshot(ticker, range, interval);
    if (!snap) return { ts: [], closes: [] };
    const rawTs = snap.timestamp || [];
    const rawCl = snap.indicators?.quote?.[0]?.close || [];
    const ts = [];
    const closes = [];
    const seenDay = new Set();
    for (let i = 0; i < rawCl.length; i++) {
        const v = rawCl[i];
        const t = rawTs[i];
        if (v == null || !Number.isFinite(v) || t == null) continue;
        const day = Math.floor(t / 86400);
        if (seenDay.has(day)) continue;
        seenDay.add(day);
        ts.push(day);
        closes.push(v);
    }
    return { ts, closes };
}

// Intersects multiple series by day-floored timestamp. Returns { ts, pricesMap }.
export function alignSeries(seriesMap) {
    const tickers = Object.keys(seriesMap);
    if (tickers.length === 0) return { ts: [], pricesMap: {} };

    // Build day -> price lookup per ticker.
    const dayMaps = {};
    let commonDays = null;
    for (const t of tickers) {
        const s = seriesMap[t];
        const m = new Map();
        for (let i = 0; i < s.ts.length; i++) m.set(s.ts[i], s.closes[i]);
        dayMaps[t] = m;
        const keys = new Set(m.keys());
        commonDays = commonDays === null ? keys : new Set([...commonDays].filter(d => keys.has(d)));
    }

    const ts = [...commonDays].sort((a, b) => a - b);
    const pricesMap = {};
    for (const t of tickers) {
        const m = dayMaps[t];
        pricesMap[t] = ts.map(d => m.get(d));
    }
    return { ts, pricesMap };
}

export function resolveTicker(token) {
    const raw = String(token || '').toUpperCase().trim();
    if (!raw) return null;
    const pos = window.positions?.[raw];
    return pos?.ticker || raw;
}
