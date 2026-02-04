import { makeOhlcAdapter } from './adapter.js';

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

export function getFinnhubSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.finnhub || stock.ticker || null;
}

const parseFinnhub = (json) => {
    if (json.s !== 'ok' || !json.t?.length) return null;
    return { timestamps: json.t, opens: json.o, highs: json.h, lows: json.l, closes: json.c };
};

export const fetchFromFinnhub = makeOhlcAdapter({
    mapSymbol: (stock, ticker, symbol) => getFinnhubSymbol(stock) || ticker || symbol,
    buildUrl: ({ providerSymbol, period, apiKey }) => {
        const cfg = PERIODS[period] || PERIODS['1D'];
        const to = Math.floor(Date.now() / 1000);
        const from = to - cfg.days * 86400;
        return `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(providerSymbol)}&resolution=${cfg.res}&from=${from}&to=${to}&token=${apiKey}`;
    },
    parse: parseFinnhub,
    apiName: 'finnhub'
});
