import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../utils.js';

const PERIODS = {
    '1D': 1, '1W': 7, '1M': 31, '6M': 183, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 7300
};

const cache = new Map();

export function getMarketstackSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.marketstack || stock.ticker || null;
}

export async function fetchFromMarketstack(ticker, period, symbol, stock, name, signal, apiKey) {
    const key = `${ticker}:${period}`;

    try {
        const sym = getMarketstackSymbol(stock) || symbol || ticker;
        const days = PERIODS[period] || 1;
        const to = new Date();
        const from = new Date(to.getTime() - days * 86400000);

        const url = period === '1D'
            ? `https://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${encodeURIComponent(sym)}`
            : `https://api.marketstack.com/v1/eod?access_key=${apiKey}&symbols=${encodeURIComponent(sym)}&date_from=${from.toISOString().split('T')[0]}&date_to=${to.toISOString().split('T')[0]}&limit=1000`;

        const r = await globalRateLimiter.executeIfNotLimited(
            () => fetch(url, { signal }),
            'marketstack'
        );

        if (!r.ok) return { source: 'marketstack', error: true, errorCode: r.status };

        const j = await r.json();
        const data = j?.data ? j.data : Array.isArray(j) ? j : [j];

        if (!data.length) return { source: 'marketstack', error: true, errorCode: 404 };

        const sorted = data.length > 1 ? [...data].sort((a, b) => new Date(a.date) - new Date(b.date)) : data;

        const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(
            sorted.map(k => Math.floor(new Date(k.date).getTime() / 1000) + 57600),
            sorted.map(k => k.open || 0),
            sorted.map(k => k.high || 0),
            sorted.map(k => k.low || 0),
            sorted.map(k => k.close || 0)
        );

        if (!timestamps.length) return { source: 'marketstack', error: true, errorCode: 'NO_VALID_DATA' };

        const result = {
            source: 'marketstack', timestamps, prices: closes, opens, highs, lows, closes,
            open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1],
            exchange: sorted[0]?.exchange || null
        };
        result.change = result.price - result.open;
        result.changePercent = result.open ? (result.change / result.open) * 100 : 0;

        cache.set(key, { data: result, ts: Date.now() });
        return result;
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        return { source: 'marketstack', error: true, errorCode: 500 };
    }
}
