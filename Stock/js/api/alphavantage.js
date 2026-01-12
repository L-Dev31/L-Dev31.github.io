import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../utils.js';

const PERIODS = {
    '1D': 1, '1W': 7, '1M': 31, '6M': 183, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 7300
};

const cache = new Map();

export function getAlphaVantageSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.alpha_vantage || stock.ticker || null;
}

export async function fetchFromAlphaVantage(ticker, period, symbol, stock, name, signal, apiKey) {
    const key = `${ticker}:${period}`;

    try {
        const sym = getAlphaVantageSymbol(stock) || ticker || symbol;
        const url = `https://alpha-vantage.p.rapidapi.com/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(sym)}&outputsize=compact&datatype=json`;

        const r = await globalRateLimiter.executeIfNotLimited(
            () => fetch(url, {
                headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'alpha-vantage.p.rapidapi.com' },
                signal
            }),
            'alphavantage'
        );

        if (r.status === 429) {
            globalRateLimiter.setRateLimitForApi('alphavantage', 60000);
            return { source: 'alphavantage', error: true, errorCode: 429, throttled: true };
        }
        if (!r.ok) return { source: 'alphavantage', error: true, errorCode: r.status };

        const j = await r.json();
        if (j['Error Message'] || j['Note']) {
            if ((j['Error Message'] || j['Note'] || '').toLowerCase().includes('rate limit')) {
                globalRateLimiter.setRateLimitForApi('alphavantage', 60000);
            }
            return { source: 'alphavantage', error: true, errorCode: 429, throttled: true };
        }

        const ts = j['Time Series (Daily)'];
        if (!ts) return { source: 'alphavantage', error: true, errorCode: 404 };

        const dates = Object.keys(ts).sort();
        const days = PERIODS[period] || 1;
        const cutoff = new Date(Date.now() - days * 86400000);
        
        const relevant = period === '1D' ? [dates[dates.length - 1]] : dates.filter(d => new Date(d) >= cutoff);
        if (!relevant.length) return { source: 'alphavantage', error: true, errorCode: 404 };

        const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(
            relevant.map(d => Math.floor(new Date(d).getTime() / 1000)),
            relevant.map(d => parseFloat(ts[d]['1. open']) || 0),
            relevant.map(d => parseFloat(ts[d]['2. high']) || 0),
            relevant.map(d => parseFloat(ts[d]['3. low']) || 0),
            relevant.map(d => parseFloat(ts[d]['4. close']) || 0)
        );

        if (!timestamps.length) return { source: 'alphavantage', error: true, errorCode: 'NO_VALID_DATA' };

        const data = {
            source: 'alphavantage', timestamps, prices: closes, opens, highs, lows, closes,
            open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1]
        };
        data.change = data.price - data.open;
        data.changePercent = data.open ? (data.change / data.open) * 100 : 0;
        
        cache.set(key, { data, ts: Date.now() });
        return data;
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        return { source: 'alphavantage', error: true, errorCode: 500 };
    }
}
