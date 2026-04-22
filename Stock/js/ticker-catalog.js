import { fetchYahooQuote } from './yahoo-finance.js';

const JSON_FILES = {
    equity: 'json/equity.json',
    crypto: 'json/crypto.json',
    commodity: 'json/commodity.json',
    markets: 'json/markets.json'
};

const quoteLookupCache = new Map();

const MARKET_COUNTRY = {
    australia: 'AU', asx: 'AU',
    uk: 'GB', lse: 'GB',
    germany: 'DE', xetra: 'DE',
    france: 'FR', euronext: 'FR',
    switzerland: 'CH', six: 'CH',
    japan: 'JP', tse: 'JP',
    canada: 'CA', tsx: 'CA',
    india: 'IN', nse: 'IN', bse: 'IN',
    china: 'CN', sse: 'CN', szse: 'CN',
    hongkong: 'HK', hkex: 'HK',
    korea: 'KR', krx: 'KR'
};

let catalogPromise = null;

const normalize = value => (value || '').trim().toUpperCase();
const baseSymbol = value => normalize(value).split('.')[0].split('-')[0].split('/')[0];

async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) return [];
    return response.json();
}

async function loadCatalog() {
    if (!catalogPromise) {
        catalogPromise = Promise.all([
            loadJson(JSON_FILES.equity),
            loadJson(JSON_FILES.crypto),
            loadJson(JSON_FILES.commodity),
            loadJson(JSON_FILES.markets)
        ]).then(([equity, crypto, commodity, markets]) => {
            const entries = [...equity, ...crypto, ...commodity].filter(Boolean);
            const bySymbol = new Map();
            const byTicker = new Map();
            const byYahoo = new Map();
            const cryptoSymbols = new Set();

            entries.forEach(entry => {
                const symbol = normalize(entry.symbol);
                const ticker = normalize(entry.ticker);
                const yahoo = normalize(entry.api_mapping?.yahoo);
                if (symbol) bySymbol.set(symbol, entry);
                if (ticker) byTicker.set(ticker, entry);
                if (yahoo) byYahoo.set(yahoo, entry);
                if (entry.type === 'crypto' && symbol) cryptoSymbols.add(symbol);
            });

            return { entries, bySymbol, byTicker, byYahoo, cryptoSymbols, markets: Array.isArray(markets) ? markets : [] };
        });
    }

    return catalogPromise;
}

function inferMarketFromSymbol(symbol, quoteType, markets) {
    const upper = normalize(symbol);
    const suffix = upper.split('.').pop();
    const market = markets.find(m => Array.isArray(m.exchanges) && m.exchanges.includes(suffix));
    if (market) return market.id;
    if (quoteType === 'CRYPTOCURRENCY' || upper.endsWith('-USD')) return 'crypto';
    if (upper.endsWith('.PA') || upper.endsWith('.EPA')) return 'euronext';
    if (upper.endsWith('.L')) return 'lse';
    if (upper.endsWith('.DE')) return 'xetra';
    if (upper.endsWith('.T')) return 'tse';
    if (upper.endsWith('.HK')) return 'hkex';
    if (upper.endsWith('.TO')) return 'tsx';
    if (upper.endsWith('.AX')) return 'asx';
    if (upper.endsWith('.SW')) return 'six';
    if (upper.endsWith('.NS')) return 'nse';
    if (upper.endsWith('.BO')) return 'bse';
    if (upper.endsWith('.SZ')) return 'szse';
    if (upper.endsWith('.SS')) return 'sse';
    if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return 'krx';
    return 'other';
}

function inferCountryFromMarket(marketId, currency) {
    if (marketId && MARKET_COUNTRY[marketId]) return MARKET_COUNTRY[marketId];
    if (currency === 'GBP') return 'GB';
    if (currency === 'EUR') return 'FR';
    if (currency === 'JPY') return 'JP';
    if (currency === 'CAD') return 'CA';
    if (currency === 'AUD') return 'AU';
    if (currency === 'CHF') return 'CH';
    if (currency === 'HKD') return 'HK';
    if (currency === 'KRW') return 'KR';
    if (currency === 'INR') return 'IN';
    return 'US';
}

function resolveIconSymbol(record, symbol, cryptoSymbols) {
    const exact = normalize(record?.symbol);
    const ticker = normalize(record?.ticker);
    const upper = normalize(symbol);
    const base = baseSymbol(upper);

    if (exact) return exact;
    if (ticker) return ticker;
    if (base) {
        if (upper.includes('.') && cryptoSymbols.has(base)) return null;
        return base;
    }
    return null;
}

async function lookupYahooQuote(ticker) {
    if (!ticker) return null;
    if (quoteLookupCache.has(ticker)) return quoteLookupCache.get(ticker);
    const promise = (async () => {
        try {
            const res = await fetchYahooQuote(ticker);
            return res && !res.error ? res.quote || null : null;
        } catch {
            return null;
        }
    })();
    quoteLookupCache.set(ticker, promise);
    return promise;
}

export async function resolveTickerDetails(symbol, fallback = {}, opts = {}) {
    const upper = normalize(symbol);
    const base = baseSymbol(upper);
    const catalog = await loadCatalog();

    const record = catalog.bySymbol.get(upper)
        || catalog.byTicker.get(upper)
        || catalog.byYahoo.get(upper)
        || catalog.bySymbol.get(base)
        || catalog.byTicker.get(base)
        || catalog.byYahoo.get(base)
        || null;

    const quote = (!record && opts.lookup !== false) ? await lookupYahooQuote(upper) : null;

    const quoteType = fallback.quoteType || quote?.quoteType;
    const ticker = normalize(record?.ticker) || normalize(fallback.ticker) || normalize(quote?.symbol) || upper;
    const market = record?.market || record?.marketId || fallback.market
        || inferMarketFromSymbol(upper, quoteType, catalog.markets);
    const currency = record?.currency || fallback.currency || quote?.currency || 'USD';
    const country = record?.country || fallback.country || inferCountryFromMarket(market, currency);
    const name = record?.name || fallback.name || quote?.longName || quote?.shortName || upper;
    const isCrypto = market === 'crypto' || quoteType === 'CRYPTOCURRENCY';
    const type = record?.type || fallback.type || (isCrypto ? 'crypto' : 'equity');
    const isin = record?.isin || fallback.isin || '';
    const api_mapping = record?.api_mapping || fallback.api_mapping || { yahoo: ticker };
    const iconSymbol = resolveIconSymbol(record, upper, catalog.cryptoSymbols) || fallback.iconSymbol || null;

    return {
        symbol: record?.symbol || base || upper,
        ticker,
        name,
        type,
        currency,
        country,
        market,
        isin,
        api_mapping,
        iconSymbol,
        jsonSymbol: record?.symbol || null,
        record,
        quote
    };
}