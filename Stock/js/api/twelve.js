import { makeOhlcAdapter } from './adapter.js';
import { dateCutoff } from '../utils.js';

const PERIODS = {
    '1D': { interval: '5min', days: 1 },
    '1W': { interval: '30min', days: 7 },
    '1M': { interval: '2h', days: 31 },
    '6M': { interval: '1day', days: 183 },
    '1Y': { interval: '1day', days: 365 },
    '5Y': { interval: '1week', days: 1825 },
    'MAX': { interval: '1month', days: 7300 }
};

export function getTwelveDataSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.twelve_data || stock.ticker || null;
}

const parseTwelve = (json, ctx) => {
    if (json.status === 'error' || !json.values?.length) return null;
    const cfg = PERIODS[ctx.period] || PERIODS['1D'];
    const values = json.values.reverse();
    const cutoff = dateCutoff(cfg.days);
    const filtered = values.filter(v => Math.floor(new Date(v.datetime).getTime() / 1000) >= cutoff);
    if (!filtered.length) return null;
    return {
        timestamps: filtered.map(v => Math.floor(new Date(v.datetime).getTime() / 1000)),
        opens: filtered.map(v => parseFloat(v.open) || 0),
        highs: filtered.map(v => parseFloat(v.high) || 0),
        lows: filtered.map(v => parseFloat(v.low) || 0),
        closes: filtered.map(v => parseFloat(v.close) || 0)
    };
};

export const fetchFromTwelveData = makeOhlcAdapter({
    mapSymbol: (stock, ticker) => getTwelveDataSymbol(stock) || ticker,
    buildUrl: ({ providerSymbol, period, apiKey }) => {
        const cfg = PERIODS[period] || PERIODS['1D'];
        return `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(providerSymbol)}&interval=${cfg.interval}&outputsize=400&apikey=${apiKey}`;
    },
    parse: parseTwelve,
    apiName: 'twelvedata'
});
