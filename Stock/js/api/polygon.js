import { makeOhlcAdapter } from './adapter.js';

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

const parsePolygon = (json) => {
    if (json.error || !json.results?.length) return null;
    const results = json.results;
    return {
        timestamps: results.map(x => Math.floor(x.t / 1000)),
        opens: results.map(x => x.o),
        highs: results.map(x => x.h),
        lows: results.map(x => x.l),
        closes: results.map(x => x.c)
    };
};

export const fetchFromPolygon = makeOhlcAdapter({
    mapSymbol: (stock, ticker, symbol) => getPolygonSymbol(stock) || symbol || ticker,
    buildUrl: ({ providerSymbol, period, apiKey }) => {
        const cfg = PERIODS[period] || PERIODS['1D'];
        const to = new Date();
        to.setDate(to.getDate() - 1);
        const from = new Date(to.getTime() - cfg.days * 86400000);
        return `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(providerSymbol)}/range/${cfg.multiplier}/${cfg.timespan}/${from.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?apiKey=${apiKey}`;
    },
    parse: parsePolygon,
    transform: (data, ctx) => {
        const stock = ctx.stock || {};
        const type = typeof stock === 'object' ? stock.type : null;
        const currency = stock?.currency || 'USD';
        const eurRate = stock?.eurRate || 1;
        const convert = (type === 'commodity' || type === 'crypto') && currency === 'EUR' && eurRate !== 1;
        if (!convert) return data;
        const rate = eurRate;
        return {
            ...data,
            prices: data.prices.map(p => p * rate),
            opens: data.opens.map(p => p * rate),
            highs: data.highs.map(p => p * rate),
            lows: data.lows.map(p => p * rate),
            closes: data.closes.map(p => p * rate),
            open: data.open * rate,
            high: data.high * rate,
            low: data.low * rate,
            price: data.price * rate,
            change: (data.price * rate) - (data.open * rate),
            changePercent: data.changePercent
        };
    },
    apiName: 'massive'
});
