import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints, normalizeSymbol } from '../utils.js';
import { proxyFetchSafe, proxyFetch } from '../proxy-fetch.js';

const BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
let baseIndex = 0;

const PERIODS = {
    '1D': { interval: '1m', range: '1d' },
    '1W': { interval: '5m', range: '5d' },
    '1M': { interval: '15m', range: '1mo' },
    '6M': { interval: '1h', range: '6mo' },
    '1Y': { interval: '1d', range: '1y' },
    '3Y': { interval: '1wk', range: '3y' },
    '5Y': { interval: '1wk', range: '5y' },
    'MAX': { interval: '1mo', range: 'max' }
};

export function getYahooSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.api_mapping?.yahoo || stock.ticker || null;
}

async function yahooFetch(targetUrl, signal) {
    const j = await proxyFetchSafe(targetUrl, signal);
    if (j.error && j.errorCode === 429) {
        globalRateLimiter.setRateLimitForApi('yahoo', 60000);
    }
    return j;
}

export async function fetchFromYahoo(ticker, period, symbol, stock, name, signal) {
    const yahooSymbol = getYahooSymbol(stock) || ticker;
    return globalRateLimiter.executeIfNotLimited(async () => {
        try {
            const cfg = PERIODS[period] || PERIODS['1D'];
            const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${cfg.interval}&range=${cfg.range}`;
            const j = await yahooFetch(url, signal);
            
            if (j.error) return { source: 'yahoo', ...j };
            
            const res = j.chart?.result?.[0];
            const q = res?.indicators?.quote?.[0];
            
            if (!res || !q || !res.timestamp || res.timestamp.length === 0 || !q.close || q.close.length === 0) {
                return { source: 'yahoo', error: true, errorCode: res?.meta ? 'NO_DATA' : 404 };
            }

            const { timestamps, opens, highs, lows, closes, volumes } = filterNullOHLCDataPoints(res.timestamp, q.open, q.high, q.low, q.close, q.volume);
            
            if (!timestamps.length) return { source: 'yahoo', error: true, errorCode: 'NO_VALID_DATA' };

            const data = {
                source: 'yahoo', timestamps, prices: closes, opens, highs, lows, closes, volumes,
                open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1]
            };
            data.change = data.price - data.open;
            data.changePercent = (data.change / data.open) * 100;
            return data;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return { source: 'yahoo', error: true, errorCode: 500 };
        }
    }, 'yahoo');
}

export async function isYahooTickerSuspended(ticker) {
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m`;
        const j = await yahooFetch(url);
        
        if (j.error) {
            if (j.errorCode === 404) return true;
            return false;
        }

        const result = j.chart?.result?.[0];
        if (!result) return true;

        const meta = result.meta || {};
        const closes = result.indicators?.quote?.[0]?.close || [];
        const volumes = result.indicators?.quote?.[0]?.volume || [];
        return !isYahooTickerActiveFromChart(meta, closes, volumes);
    } catch (e) {
        return false;
    }
}

/**
 * Compute daysSinceLastTrade from a regularMarketTime unix timestamp.
 * Exported so consumers never need to recompute this.
 */
export function computeDaysSinceLastTrade(regularMarketTime) {
    if (!regularMarketTime || regularMarketTime <= 0) return 999;
    return (Math.floor(Date.now() / 1000) - regularMarketTime) / 86400;
}

export function isYahooTickerActiveFromChart(meta = {}, closes = [], volumes = []) {
    const validCloses = closes.filter(c => c !== null && c !== undefined);
    const hasData = validCloses.length > 0;
    const isCrypto = meta.instrumentType === 'CRYPTOCURRENCY' || meta.quoteType === 'CRYPTOCURRENCY' || meta.currency === 'CRYPTO';
    const price = meta.regularMarketPrice || validCloses[validCloses.length - 1] || 0;

    if (isCrypto) return price > 0 && hasData;

    const tradeable = meta.tradeable !== false;
    const daysSinceLastTrade = computeDaysSinceLastTrade(meta.regularMarketTime);
    
    let totalVolume = 0;
    for (const v of volumes) if (v) totalVolume += v;
    const volume = meta.regularMarketVolume || totalVolume;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    const hasNoVolume = volume === 0;
    const hasNoChange = Math.abs(changePercent) < 0.001;
    const noActivity = hasNoVolume && hasNoChange;

    if (!tradeable) return false;
    if (!hasData) return false;
    if (noActivity && daysSinceLastTrade > 3) return false;
    if (daysSinceLastTrade > 7) return false;
    return true;
}

export function isYahooTickerActiveFromQuote(q = {}) {
    const exchange = (q.exchange || '').toUpperCase();
    const isCrypto = q.quoteType === 'CRYPTOCURRENCY' || exchange === 'CCC' || q.currency === 'CRYPTO';

    const price = q.regularMarketPrice || q.price || 0;
    const changePercent = q.regularMarketChangePercent || 0;
    const volume = q.regularMarketVolume || 0;
    const daysSinceLastTrade = computeDaysSinceLastTrade(q.regularMarketTime);
    const tradeable = q.tradeable !== false;

    if (isCrypto) {
        if (!Number.isFinite(price) || price <= 0) return false;
        
        if (q.cryptoTradeable === false && volume < 50000) return false;
        
        return true;
    }

    const noActivity = volume === 0 && Math.abs(changePercent) < 0.001;

    if (!tradeable) return false;
    if (noActivity && daysSinceLastTrade > 3) return false;
    if (daysSinceLastTrade > 7) return false;

    return true;
}

export async function fetchYahooSummary(ticker, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,summaryProfile,price`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        const res = j.quoteSummary?.result?.[0];
        return { source: 'yahoo', summary: res?.assetProfile || res?.summaryProfile || null, price: res?.price || null };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooFinancials(ticker, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData,balanceSheetHistory,cashflowStatementHistory,earnings`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', financials: j.quoteSummary?.result?.[0] || null };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooEarnings(ticker, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=earnings`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', earnings: j.quoteSummary?.result?.[0]?.earnings || null };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooDividends(ticker, from, to, signal) {
    const p1 = Math.floor(new Date(from || '2000-01-01').getTime() / 1000);
    const p2 = Math.floor(new Date(to || new Date().toISOString().slice(0, 10)).getTime() / 1000);
    const targetUrl = `https://query2.finance.yahoo.com/v7/finance/download/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div`;
    
    try {
        const text = await proxyFetch(targetUrl, { signal, expect: 'text' });
        
        if (text.startsWith('<')) {
            return { source: 'yahoo', error: true, errorCode: 'PROXY_HTML' };
        }

        const items = text.trim().split('\n').slice(1).map(l => {
            const [date, div] = l.split(',');
            return { date, dividend: parseFloat(div) };
        });
        return { source: 'yahoo', dividends: items };
    } catch (e) {
        return { source: 'yahoo', error: true, errorCode: 500 };
    }
}

export const normalizeYahooSymbol = normalizeSymbol;

export function isYahooSparkFriendly(sym) {
    if (!sym) return false;
    const upper = sym.toUpperCase();
    if (!/^[A-Z0-9.-]{1,24}$/.test(upper)) return false;
    if (upper.includes('--') || upper.includes('..')) return false;
    return true;
}

function getNextBase() {
    const base = BASES[baseIndex % BASES.length];
    baseIndex += 1;
    return base;
}

export async function fetchYahooScreener(scrIds, offset = 0, count = 200, signal) {
    const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrIds}&count=${count}&offset=${offset}`;
    const j = await yahooFetch(url, signal);
    const result = j?.finance?.result?.[0];
    return { quotes: result?.quotes || [], total: result?.total || 0 };
}

export async function fetchYahooChartSnapshot(symbol, range = '1d', interval = '1m', signal) {
    const norm = normalizeYahooSymbol(symbol);
    const base = getNextBase();
    const url = `${base}/v8/finance/chart/${encodeURIComponent(norm)}?range=${range}&interval=${interval}`;
    const j = await yahooFetch(url, signal);
    if (j?.error) return null;
    return j?.chart?.result?.[0] || null;
}

export async function fetchYahooSparkBatch(symbols, range = '1d', interval = '1m', signal) {
    const base = getNextBase();
    const url = `${base}/v7/finance/spark?symbols=${symbols.join(',')}&range=${range}&interval=${interval}&includePrePost=false`;
    const j = await yahooFetch(url, signal);
    if (j?.error) return null;
    return j?.spark?.result || [];
}

export async function fetchYahooPeriodChanges(symbols, range, interval, onProgress) {
    if (!symbols.length) return {};
    const changes = {};
    const safeSymbols = symbols.filter(isYahooSparkFriendly);
    const batchSize = 20;
    const stepDelay = 600;
    let completed = 0;

    const parseChartPayload = (payload, symbolKey) => {
        const resp = payload?.response?.[0];
        const quote = resp?.indicators?.quote?.[0];
        const closes = quote?.close;
        if (!closes || closes.length < 2) return null;

        const cleanData = { prices: [], highs: [], lows: [], volumes: [] };
        for (let k = 0; k < closes.length; k++) {
            if (closes[k] !== null) {
                cleanData.prices.push(closes[k]);
                cleanData.highs.push(quote.high?.[k] || closes[k]);
                cleanData.lows.push(quote.low?.[k] || closes[k]);
                cleanData.volumes.push(quote.volume?.[k] || 0);
            }
        }

        if (cleanData.prices.length === 0) return null;
        const firstClose = cleanData.prices[0];
        const lastClose = cleanData.prices[cleanData.prices.length - 1];

        return {
            change: lastClose - firstClose,
            changePercent: ((lastClose - firstClose) / firstClose) * 100,
            history: cleanData,
            symbol: symbolKey
        };
    };

    const fetchSingleChart = async (sym) => {
        const res = await fetchYahooChartSnapshot(sym, range, interval);
        if (!res) return;
        const parsed = parseChartPayload({ response: [res] }, sym);
        if (parsed) changes[sym] = parsed;
    };

    for (let i = 0; i < safeSymbols.length; i += batchSize) {
        const batch = safeSymbols.slice(i, i + batchSize);
        let sparkFailed = false;

        try {
            const results = await fetchYahooSparkBatch(batch, range, interval);
            if (!results) {
                sparkFailed = true;
            } else {
                results.forEach(entry => {
                    const parsed = parseChartPayload(entry, entry.symbol);
                    if (parsed) changes[entry.symbol] = parsed;
                });
            }
        } catch (e) {
            sparkFailed = true;
        }

        if (sparkFailed) {
            for (const sym of batch) {
                await fetchSingleChart(sym);
                await new Promise(r => setTimeout(r, 120));
            }
        }

        completed += batch.length;
        if (onProgress) onProgress(completed, safeSymbols.length, false);

        if (i + batchSize < safeSymbols.length) {
            await new Promise(r => setTimeout(r, stepDelay));
        }
    }

    return changes;
}

export async function fetchYahooOptions(ticker, date, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}${date ? `?date=${date}` : ''}`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', options: j.optionChain || j.option || j };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooAnalysis(ticker, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=recommendationTrend,upgradeDowngradeHistory`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', analysis: j.quoteSummary?.result?.[0] || null };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooNews(ticker, limit = 10, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${limit}`, signal);
        if (j.error) return { source: 'yahoo', items: [], ...j };
        const items = (j?.news || []).slice(0, limit).map(i => ({
            id: i.uuid || i.link,
            title: i.title,
            url: i.link,
            publisher: i.publisher,
            publishedAt: i.providerPublishTime || i.unixTimeMs || Date.now(),
            summary: i.summary || '',
            relatedTickers: i.relatedTickers || []
        }));
        return { source: 'yahoo', items };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, items: [] }; }
}
