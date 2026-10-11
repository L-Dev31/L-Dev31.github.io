import { fetchYahooChartSnapshot } from '../data/yahoo-finance.js';

export const fetchCloses = async (ticker, range = '1y', interval = '1d') => (await fetchSeries(ticker, range, interval)).closes;

// Clean { ts, closes }: one close per day, ts = unix days (day-floored), so series align across markets.
export async function fetchSeries(ticker, range = '1y', interval = '1d') {
    const snap = await fetchYahooChartSnapshot(ticker, range, interval);
    const series = { ts: [], closes: [] };
    const seenDay = new Set();
    (snap?.indicators?.quote?.[0]?.close || []).forEach((v, i) => {
        const t = snap.timestamp?.[i];
        if (v == null || !Number.isFinite(v) || t == null) return;
        const day = Math.floor(t / 86400);
        if (seenDay.has(day)) return;
        seenDay.add(day);
        series.ts.push(day);
        series.closes.push(v);
    });
    return series;
}

// Keeps only the days every series has. Returns { ts, pricesMap }.
export function alignSeries(seriesMap) {
    const tickers = Object.keys(seriesMap);
    if (!tickers.length) return { ts: [], pricesMap: {} };
    const dayMaps = Object.fromEntries(tickers.map(t => [t, new Map(seriesMap[t].ts.map((d, i) => [d, seriesMap[t].closes[i]]))]));
    const ts = [...dayMaps[tickers[0]].keys()].filter(d => tickers.every(t => dayMaps[t].has(d))).sort((a, b) => a - b);
    return { ts, pricesMap: Object.fromEntries(tickers.map(t => [t, ts.map(d => dayMaps[t].get(d))])) };
}

export function resolveTicker(token) {
    const raw = String(token || '').toUpperCase().trim();
    return raw ? window.positions?.[raw]?.ticker || raw : null;
}
