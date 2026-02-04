import { makeOhlcAdapter } from './adapter.js';
import { dateCutoff } from '../utils.js';

const PERIODS = {
    '1D': 1, '1W': 7, '1M': 31, '6M': 183, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 7300
};

export function getMarketstackSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.marketstack || stock.ticker || null;
}

const parseMarketstack = (json, { period }) => {
    const raw = json?.data ? json.data : Array.isArray(json) ? json : [json];
    if (!raw.length) return null;
    const sorted = raw.length > 1 ? [...raw].sort((a, b) => new Date(a.date) - new Date(b.date)) : raw;
    const days = PERIODS[period] || 1;
    const cutoff = dateCutoff(days) * 1000;
    const filtered = sorted.filter(k => new Date(k.date).getTime() >= cutoff || period === '1D');
    if (!filtered.length) return null;
    return {
        timestamps: filtered.map(k => Math.floor(new Date(k.date).getTime() / 1000) + 57600),
        opens: filtered.map(k => k.open || 0),
        highs: filtered.map(k => k.high || 0),
        lows: filtered.map(k => k.low || 0),
        closes: filtered.map(k => k.close || 0),
        meta: { exchange: filtered[0]?.exchange || null }
    };
};

export const fetchFromMarketstack = makeOhlcAdapter({
    mapSymbol: (stock, ticker, symbol) => getMarketstackSymbol(stock) || symbol || ticker,
    buildUrl: ({ providerSymbol, period, apiKey }) => {
        const days = PERIODS[period] || 1;
        const to = new Date();
        const from = new Date(to.getTime() - days * 86400000);
        return period === '1D'
            ? `https://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${encodeURIComponent(providerSymbol)}`
            : `https://api.marketstack.com/v1/eod?access_key=${apiKey}&symbols=${encodeURIComponent(providerSymbol)}&date_from=${from.toISOString().split('T')[0]}&date_to=${to.toISOString().split('T')[0]}&limit=1000`;
    },
    parse: parseMarketstack,
    apiName: 'marketstack'
});
