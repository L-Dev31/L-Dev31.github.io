import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../general.js';

const PERIODS = {
    '1D': { res: '1', days: 1 },
    '1W': { res: '5', days: 7 },
    '1M': { res: '15', days: 31 },
    '6M': { res: '60', days: 183 },
    '1Y': { res: 'D', days: 365 },
    '3Y': { res: 'W', days: 1095 },
    '5Y': { res: 'M', days: 1825 },
    'MAX': { res: 'M', days: 7300 }
};

const cache = new Map();

export function getFinnhubSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.finnhub || stock.ticker || null;
}

export async function fetchFromFinnhub(ticker, period = '1D', symbol, stock, name, signal, apiKey) {
    const key = `${ticker}:${period}`;
    if (cache.has(key)) return cache.get(key).data;

    return globalRateLimiter.executeIfNotLimited(async () => {
        try {
            const sym = getFinnhubSymbol(stock) || ticker || symbol;
            const cfg = PERIODS[period] || PERIODS['1D'];
            const to = Math.floor(Date.now() / 1000);
            const from = to - cfg.days * 86400;
            
            const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${cfg.res}&from=${from}&to=${to}&token=${apiKey}`, { signal });
            
            if (r.status === 429) {
                globalRateLimiter.setRateLimitForApi('finnhub', 60000);
                return { source: 'finnhub', error: true, errorCode: 429, throttled: true };
            }
            
            const j = await r.json();
            if (j.s !== 'ok' || !j.t?.length) return { source: 'finnhub', error: true, errorCode: 404 };

            const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(j.t, j.o, j.h, j.l, j.c);
            if (!timestamps.length) return { source: 'finnhub', error: true, errorCode: 'NO_VALID_DATA' };

            const data = {
                source: 'finnhub', timestamps, prices: closes, opens, highs, lows, closes,
                open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1]
            };
            data.change = data.price - data.open;
            data.changePercent = data.open ? (data.change / data.open) * 100 : 0;
            
            cache.set(key, { data, ts: Date.now() });
            return data;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return { source: 'finnhub', error: true, errorCode: 500 };
        }
    }, 'finnhub');
}
