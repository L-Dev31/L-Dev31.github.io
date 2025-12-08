import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../utils.js';

const PERIODS = {
    '1D': { multiplier: 1, timespan: 'minute', days: 1 },
    '1W': { multiplier: 5, timespan: 'minute', days: 5 },
    '1M': { multiplier: 15, timespan: 'minute', days: 30 },
    '6M': { multiplier: 1, timespan: 'hour', days: 180 },
    '1Y': { multiplier: 1, timespan: 'day', days: 365 },
    '3Y': { multiplier: 1, timespan: 'week', days: 1095 },
    '5Y': { multiplier: 1, timespan: 'month', days: 1825 },
    'MAX': { multiplier: 1, timespan: 'month', days: 7300 }
};

export function getPolygonSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.polygon || stock.ticker || null;
}

export async function fetchFromPolygon(ticker, period, symbol, stock, name, signal, apiKey) {
    const polygonSymbol = getPolygonSymbol(stock) || symbol || ticker;
    const type = typeof stock === 'object' ? stock?.type : stock;
    const currency = stock?.currency || 'USD';
    const eurRate = stock?.eurRate || 1;

    return globalRateLimiter.executeIfNotLimited(async () => {
        try {
            const cfg = PERIODS[period] || PERIODS['1D'];
            const to = new Date();
            to.setDate(to.getDate() - 1);
            const from = new Date(to.getTime() - cfg.days * 86400000);
            
            const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polygonSymbol)}/range/${cfg.multiplier}/${cfg.timespan}/${from.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?apiKey=${apiKey}`, { signal });

            if (r.status === 429) {
                globalRateLimiter.setRateLimitForApi('massive', 60000);
                return { source: 'massive', error: true, errorCode: 429, throttled: true };
            }
            if (!r.ok) return { source: 'massive', error: true, errorCode: r.status };

            const j = await r.json();
            if (j.error || !j.results?.length) return { source: 'massive', error: true, errorCode: 404 };

            const results = j.results;
            const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(
                results.map(x => Math.floor(x.t / 1000)),
                results.map(x => x.o),
                results.map(x => x.h),
                results.map(x => x.l),
                results.map(x => x.c)
            );
            if (!timestamps.length) return { source: 'massive', error: true, errorCode: 'NO_VALID_DATA' };

            const convert = (type === 'commodity' || type === 'crypto') && currency === 'EUR' && eurRate !== 1;
            const rate = convert ? eurRate : 1;

            const data = {
                source: 'massive', timestamps,
                prices: closes.map(p => p * rate),
                opens: opens.map(p => p * rate),
                highs: highs.map(p => p * rate),
                lows: lows.map(p => p * rate),
                closes: closes.map(p => p * rate),
                open: opens[0] * rate,
                high: Math.max(...highs) * rate,
                low: Math.min(...lows) * rate,
                price: closes[closes.length - 1] * rate
            };
            data.change = data.price - data.open;
            data.changePercent = (data.change / data.open) * 100;
            return data;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return { source: 'massive', error: true, errorCode: 500 };
        }
    }, 'massive');
}
