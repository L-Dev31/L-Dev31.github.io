import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../general.js';

const PERIODS = {
    '1D': { interval: '5min', days: 1 },
    '1W': { interval: '30min', days: 7 },
    '1M': { interval: '2h', days: 31 },
    '6M': { interval: '1day', days: 183 },
    '1Y': { interval: '1day', days: 365 },
    '5Y': { interval: '1week', days: 1825 },
    'MAX': { interval: '1month', days: 7300 }
};

const cache = new Map();

export function getTwelveDataSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.twelve_data || stock.ticker || null;
}

export async function fetchFromTwelveData(ticker, period, symbol, stock, name, signal, apiKey) {
    const key = `${ticker}:${period}`;
    
    try {
        const sym = getTwelveDataSymbol(stock) || ticker;
        const cfg = PERIODS[period] || PERIODS['1D'];
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${cfg.interval}&outputsize=400&apikey=${apiKey}`;
        
        const r = await globalRateLimiter.executeIfNotLimited(
            () => fetch(url, { signal }),
            'twelvedata'
        );

        if (r.status === 429) {
            return { source: 'twelvedata', error: true, errorCode: 429, throttled: true };
        }

        const j = await r.json();
        if (j.status === 'error' || !j.values?.length) {
            return { source: 'twelvedata', error: true, errorCode: 404 };
        }

        const values = j.values.reverse();
        const cutoff = Math.floor((Date.now() - cfg.days * 86400000) / 1000);
        const filtered = values.filter(v => Math.floor(new Date(v.datetime).getTime() / 1000) >= cutoff);

        if (!filtered.length) return { source: 'twelvedata', error: true, errorCode: 404 };

        const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(
            filtered.map(v => Math.floor(new Date(v.datetime).getTime() / 1000)),
            filtered.map(v => parseFloat(v.open) || 0),
            filtered.map(v => parseFloat(v.high) || 0),
            filtered.map(v => parseFloat(v.low) || 0),
            filtered.map(v => parseFloat(v.close) || 0)
        );

        if (!timestamps.length) return { source: 'twelvedata', error: true, errorCode: 'NO_VALID_DATA' };

        const data = {
            source: 'twelvedata', timestamps, prices: closes, opens, highs, lows, closes,
            open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1]
        };
        data.change = data.price - data.open;
        data.changePercent = data.open ? (data.change / data.open) * 100 : 0;
        
        cache.set(key, { data, ts: Date.now() });
        return data;
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        return { source: 'twelvedata', error: true, errorCode: 500 };
    }
}
