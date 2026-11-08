import { fetchYahooQuote } from './yahoo-finance.js';

// Market ids (and their short names) to the country they sit in.
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
// When the market says nothing, the currency is the best hint (every euro stock counts as French).
const CURRENCY_COUNTRY = { GBP: 'GB', EUR: 'FR', JPY: 'JP', CAD: 'CA', AUD: 'AU', CHF: 'CH', HKD: 'HK', KRW: 'KR', INR: 'IN' };
// Yahoo symbol suffix (BP.L, MC.PA...) to market id, for symbols the markets file does not list.
const SUFFIX_MARKET = { PA: 'euronext', EPA: 'euronext', L: 'lse', DE: 'xetra', T: 'tse', HK: 'hkex', TO: 'tsx', AX: 'asx', SW: 'six', NS: 'nse', BO: 'bse', SZ: 'szse', SS: 'sse', KS: 'krx', KQ: 'krx' };

const normalize = value => (value || '').trim().toUpperCase();
const baseOf = symbol => symbol.split('.')[0].split('-')[0].split('/')[0];

const loadJson = async path => {
    const response = await fetch(path);
    return response.ok ? response.json() : [];
};

let catalogPromise = null;
const loadCatalog = () => catalogPromise ||= Promise.all(['equity', 'crypto', 'commodity', 'markets'].map(name => loadJson(`json/${name}.json`)))
    .then(([equity, crypto, commodity, markets]) => {
        const bySymbol = new Map();
        const byTicker = new Map();
        for (const entry of [...equity, ...crypto, ...commodity].filter(Boolean)) {
            if (normalize(entry.symbol)) bySymbol.set(normalize(entry.symbol), entry);
            if (normalize(entry.ticker)) byTicker.set(normalize(entry.ticker), entry);
        }
        return { bySymbol, byTicker, markets: Array.isArray(markets) ? markets : [] };
    });

function inferMarket(upper, quoteType, markets) {
    const suffix = upper.split('.').pop();
    const listed = markets.find(m => Array.isArray(m.exchanges) && m.exchanges.includes(suffix));
    if (listed) return listed.id;
    if (quoteType === 'CRYPTOCURRENCY' || upper.endsWith('-USD')) return 'crypto';
    return (upper.includes('.') && SUFFIX_MARKET[suffix]) || 'other';
}

// Publishable Logo.dev key: meant to be used from the browser.
export const LOGO_DEV_KEY = 'pk_a9Yfpyg0R--W0TNaF1kGng';

/** Logo addresses to try one after the other, best coverage first. */
export function buildOnlineIconCandidates(symbol, market) {
    const upper = (symbol || '').toUpperCase();
    const base = baseOf(upper);
    const isCrypto = market === 'crypto' || upper.endsWith('-USD') || (upper.includes('-') && !upper.includes('.'));
    const urls = isCrypto
        ? ['color', 'black'].map(shade => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/${shade}/${base.toLowerCase()}.png`)
        : [upper, upper.replace('.', '-'), upper.split('.')[0], base].filter(Boolean).flatMap(v => [
            `https://img.logo.dev/ticker/${v}?token=${LOGO_DEV_KEY}`,
            `https://assets.parqet.com/logos/symbol/${v}?format=png`, // EU and global stocks
            `https://financialmodelingprep.com/image-stock/${v}.png`, // US and major globals
            `https://financialmodelingprep.com/image-stock/${v}.jpg`,
            `https://eodhd.com/img/logos/US/${v}.png`,
            `https://storage.googleapis.com/iex/api/logos/${v}.png`,
        ]);
    return [...new Set(urls)];
}

const quoteLookups = new Map();
function lookupYahooQuote(ticker) {
    if (!ticker) return null;
    if (!quoteLookups.has(ticker)) {
        quoteLookups.set(ticker, fetchYahooQuote(ticker).then(res => (res && !res.error ? res.quote || null : null), () => null));
    }
    return quoteLookups.get(ticker);
}

/** What the app knows about a symbol: the catalog record, else the given fallback, else a Yahoo quote, else a guess. */
export async function resolveTickerDetails(symbol, fallback = {}, opts = {}) {
    const upper = normalize(symbol);
    const base = baseOf(upper);
    const { bySymbol, byTicker, markets } = await loadCatalog();

    const record = [upper, base].flatMap(key => [bySymbol.get(key), byTicker.get(key)]).find(Boolean) || null;
    const quote = (!record && opts.lookup !== false) ? await lookupYahooQuote(upper) : null;

    const quoteType = fallback.quoteType || quote?.quoteType;
    const market = record?.market || record?.marketId || fallback.market || inferMarket(upper, quoteType, markets);
    const currency = record?.currency || fallback.currency || quote?.currency || 'USD';

    return {
        symbol: record?.symbol || base || upper,
        ticker: normalize(record?.ticker) || normalize(fallback.ticker) || normalize(quote?.symbol) || upper,
        name: record?.name || fallback.name || quote?.longName || quote?.shortName || upper,
        type: record?.type || fallback.type || (market === 'crypto' || quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'equity'),
        currency,
        country: record?.country || fallback.country || MARKET_COUNTRY[market] || CURRENCY_COUNTRY[currency] || 'US',
        market,
        isin: record?.isin || fallback.isin || '',
        record,
        quote,
    };
}
