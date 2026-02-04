import { makeOhlcAdapter } from './adapter.js';
import { dateCutoff } from '../utils.js';

const PERIODS = {
    '1D': 1, '1W': 7, '1M': 31, '6M': 183, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 7300
};

export function getAlphaVantageSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.alpha_vantage || stock.ticker || null;
}

const parseAlpha = (json, ctx) => {
    const period = ctx?.period;
    const ts = json['Time Series (Daily)'];
    if (!ts) return null;
    const dates = Object.keys(ts).sort();
    const days = PERIODS[period] || 1;
    const cutoff = dateCutoff(days) * 1000;
    const relevant = period === '1D' ? [dates[dates.length - 1]] : dates.filter(d => new Date(d).getTime() >= cutoff);
    if (!relevant.length) return null;
    return {
        timestamps: relevant.map(d => Math.floor(new Date(d).getTime() / 1000)),
        opens: relevant.map(d => parseFloat(ts[d]['1. open']) || 0),
        highs: relevant.map(d => parseFloat(ts[d]['2. high']) || 0),
        lows: relevant.map(d => parseFloat(ts[d]['3. low']) || 0),
        closes: relevant.map(d => parseFloat(ts[d]['4. close']) || 0)
    };
};

export const fetchFromAlphaVantage = makeOhlcAdapter({
    mapSymbol: (stock, ticker, symbol) => getAlphaVantageSymbol(stock) || ticker || symbol,
    buildUrl: ({ providerSymbol, apiKey }) => ({
        url: `https://alpha-vantage.p.rapidapi.com/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(providerSymbol)}&outputsize=compact&datatype=json`,
        options: {
            headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': 'alpha-vantage.p.rapidapi.com'
            }
        }
    }),
    parse: parseAlpha,
    apiName: 'alphavantage'
});
