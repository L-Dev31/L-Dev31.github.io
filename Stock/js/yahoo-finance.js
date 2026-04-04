import globalRateLimiter from './rate-limiter.js';
import { filterNullOHLCDataPoints, normalizeSymbol } from './utils.js';
import { proxyFetchSafe, proxyFetch } from './proxy-fetch.js';
import { cacheGet, cacheSet, ohlcKey, newsKey, TTL } from './cache.js';

const BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
let baseIndex = 0;
const YAHOO_RATE_LIMIT_MS = 120000;
const CHART_SNAPSHOT_TTL_MS = 45000;
const CHART_SNAPSHOT_ERROR_TTL_MS = 12000;

// OHLC CACHE TTL BY PERIOD
const PERIOD_TTL_MS = {
    '1D': TTL.OHLC_INTRA,
    '1W': 10 * 60 * 1000,
    '1M': 15 * 60 * 1000,
    '6M': TTL.OHLC_DAILY,
    '1Y': TTL.OHLC_DAILY,
    '3Y': TTL.OHLC_DAILY,
    '5Y': TTL.OHLC_DAILY,
    'MAX': TTL.OHLC_DAILY,
};
const chartSnapshotCache = new Map();
const chartSnapshotInflight = new Map();

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
    const remaining = globalRateLimiter.getRemainingSeconds('yahoo');
    if (remaining > 0) {
        return {
            error: true,
            errorCode: 429,
            throttled: true,
            retryAfter: remaining,
            message: `YAHOO_RATE_LIMIT_ACTIVE_${remaining}s`
        };
    }

    const j = await proxyFetchSafe(targetUrl, signal);
    if (j.error && j.errorCode === 429) {
        globalRateLimiter.setRateLimitForApi('yahoo', YAHOO_RATE_LIMIT_MS);
        return {
            ...j,
            errorCode: 429,
            throttled: true,
            retryAfter: Math.ceil(YAHOO_RATE_LIMIT_MS / 1000)
        };
    }
    return j;
}

export async function fetchFromYahoo(ticker, period, symbol, stock, name, signal) {
    const yahooSymbol = getYahooSymbol(stock) || ticker;

    // CHECK PERSISTENT CACHE
    const ck = ohlcKey(yahooSymbol, period);
    const cached = cacheGet(ck);
    if (cached) return cached;

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

            cacheSet(ck, data, PERIOD_TTL_MS[period] || TTL.OHLC_INTRA);
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
        const q = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData`, signal);
        if (!q.error) {
            const financials = q.quoteSummary?.result?.[0] || null;
            if (financials?.financialData) return { source: 'yahoo', financials };
        }

        const snap = await fetchYahooChartSnapshot(ticker, '6mo', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: q.errorCode || 500 };

        const meta = snap.meta || {};
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
        const price = meta.regularMarketPrice || 0;
        const financialData = {
            currentPrice: price ? { raw: price } : null,
            revenueGrowth: null,
            grossMargins: null,
            totalRevenue: null,
            trailingPE: null,
            forwardPE: null,
            marketCap: null,
            dayChangePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh != null ? { raw: meta.fiftyTwoWeekHigh } : null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow != null ? { raw: meta.fiftyTwoWeekLow } : null,
            regularMarketVolume: meta.regularMarketVolume ?? null
        };

        return { source: 'yahoo', financials: { financialData } };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooEarnings(ticker, signal) {
    try {
        const q = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=earnings,earningsHistory,earningsTrend`, signal);
        if (!q.error) {
            const earningsData = q.quoteSummary?.result?.[0]?.earnings || q.quoteSummary?.result?.[0] || null;
            if (earningsData) return { source: 'yahoo', earnings: earningsData };
        }

        const snap = await fetchYahooChartSnapshot(ticker, '1y', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: q.errorCode || 500 };
        const meta = snap.meta || {};
        const closes = snap?.indicators?.quote?.[0]?.close || [];
        const valid = closes.filter(v => v != null);
        const trailing = valid.length >= 2 ? valid[valid.length - 1] - valid[0] : null;

        return {
            source: 'yahoo',
            earnings: {
                epsCurrentYear: null,
                epsTrailingTwelveMonths: null,
                epsForward: null,
                earningsTimestamp: null,
                earningsTimestampStart: null,
                earningsTimestampEnd: null,
                regularMarketPrice: meta.regularMarketPrice ?? null,
                yearlyPriceDelta: trailing,
                yearlyPriceDeltaPercent: valid.length >= 2 && valid[0] ? (trailing / valid[0]) * 100 : null
            }
        };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooDividends(ticker, from, to, signal) {
    try {
        const cfg = PERIODS['5Y'];
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${cfg.interval}&range=${cfg.range}&events=div,splits`;
        const j = await yahooFetch(url, signal);
        if (!j.error) {
            const events = j?.chart?.result?.[0]?.events?.dividends || {};
            const items = Object.values(events)
                .map(d => ({
                    date: d?.date ? new Date(d.date * 1000).toISOString().slice(0, 10) : null,
                    dividend: Number(d?.amount || 0)
                }))
                .filter(d => d.date && Number.isFinite(d.dividend));
            if (items.length > 0) return { source: 'yahoo', dividends: items };
        }

        const p1 = Math.floor(new Date(from || '2000-01-01').getTime() / 1000);
        const p2 = Math.floor(new Date(to || new Date().toISOString().slice(0, 10)).getTime() / 1000);
        const targetUrl = `https://query2.finance.yahoo.com/v7/finance/download/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div`;
        const text = await proxyFetch(targetUrl, { signal, expect: 'text' });
        if (text.startsWith('<')) return { source: 'yahoo', error: true, errorCode: 'PROXY_HTML' };
        const items = text.trim().split('\n').slice(1).map(l => {
            const [date, div] = l.split(',');
            return { date, dividend: parseFloat(div) };
        }).filter(d => d.date && Number.isFinite(d.dividend));
        return { source: 'yahoo', dividends: items };
    } catch (e) {
        return { source: 'yahoo', error: true, errorCode: 500 };
    }
}

export async function fetchYahooQuote(ticker, signal) {
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        const quote = j?.quoteResponse?.result?.[0] || null;
        return { source: 'yahoo', quote };
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
    const cacheKey = `${norm}|${range}|${interval}`;
    const now = Date.now();

    const cached = chartSnapshotCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;

    if (chartSnapshotInflight.has(cacheKey)) return chartSnapshotInflight.get(cacheKey);

    const run = (async () => {
        const base = getNextBase();
        const url = `${base}/v8/finance/chart/${encodeURIComponent(norm)}?range=${range}&interval=${interval}`;
        const j = await yahooFetch(url, signal);
        if (j?.error) {
            chartSnapshotCache.set(cacheKey, { expiresAt: Date.now() + CHART_SNAPSHOT_ERROR_TTL_MS, data: null });
            return null;
        }
        const parsed = j?.chart?.result?.[0] || null;
        chartSnapshotCache.set(cacheKey, { expiresAt: Date.now() + CHART_SNAPSHOT_TTL_MS, data: parsed });
        return parsed;
    })();

    chartSnapshotInflight.set(cacheKey, run);
    try {
        return await run;
    } finally {
        chartSnapshotInflight.delete(cacheKey);
    }
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
    const batchSize = 12;
    const stepDelay = 900;
    const singleFallbackCap = 4;
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

    const waitForYahooCooldownIfNeeded = async () => {
        const remaining = globalRateLimiter.getRemainingSeconds('yahoo');
        if (remaining <= 0) return false;
        if (onProgress) onProgress(completed, safeSymbols.length, true, `API Yahoo limitée (${remaining}s)`);
        await new Promise(r => setTimeout(r, remaining * 1000));
        return true;
    };

    for (let i = 0; i < safeSymbols.length; i += batchSize) {
        await waitForYahooCooldownIfNeeded();

        const batch = safeSymbols.slice(i, i + batchSize);
        let sparkFailed = false;

        try {
            const results = await fetchYahooSparkBatch(batch, range, interval);
            if (!results) {
                sparkFailed = true;
            } else {
                for (const entry of results) {
                    const symbolKey = entry?.symbol;
                    if (!symbolKey) continue;
                    const parsed = parseChartPayload(entry, symbolKey);
                    if (parsed) changes[symbolKey] = parsed;
                }
            }
        } catch (e) {
            sparkFailed = true;
        }

        if (sparkFailed) {
            if (await waitForYahooCooldownIfNeeded()) continue;
            for (const sym of batch.slice(0, singleFallbackCap)) {
                if (await waitForYahooCooldownIfNeeded()) break;
                await fetchSingleChart(sym);
                await new Promise(r => setTimeout(r, 180));
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
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=recommendationTrend,financialData`, signal);
        if (!j.error) {
            const analysis = j.quoteSummary?.result?.[0] || null;
            if (analysis) return { source: 'yahoo', analysis };
        }

        const snap = await fetchYahooChartSnapshot(ticker, '3mo', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: j.errorCode || 500 };
        const closes = snap?.indicators?.quote?.[0]?.close || [];
        const valid = closes.filter(v => v != null);
        const first = valid[0] || 0;
        const last = valid[valid.length - 1] || 0;
        const perf = first ? ((last - first) / first) * 100 : 0;
        const recommendationKey = perf > 6 ? 'buy' : perf < -6 ? 'sell' : 'hold';

        return {
            source: 'yahoo',
            analysis: {
                recommendationTrend: { trend: [{ period: '3m', strongBuy: recommendationKey === 'buy' ? 1 : 0, buy: recommendationKey === 'buy' ? 1 : 0, hold: recommendationKey === 'hold' ? 1 : 0, sell: recommendationKey === 'sell' ? 1 : 0, strongSell: recommendationKey === 'sell' ? 1 : 0, recommendationKey }] },
                financialData: {
                    targetMeanPrice: null,
                    targetHighPrice: null,
                    targetLowPrice: null,
                    recommendationMean: recommendationKey === 'buy' ? { raw: 1.8 } : recommendationKey === 'sell' ? { raw: 3.8 } : { raw: 3.0 },
                    momentum3m: { raw: perf }
                }
            }
        };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooNews(ticker, limit = 10, signal) {
    // CHECK PERSISTENT CACHE
    const ck = newsKey(ticker);
    const cached = cacheGet(ck);
    if (cached) return { source: 'yahoo', items: cached };

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
        cacheSet(ck, items, TTL.NEWS);
        return { source: 'yahoo', items };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, items: [] }; }
}

// FETCH NEWS
export async function fetchNews(symbol, config, limit = 8, days = 7) {
    if (!config) return { error: true, items: [] };
    try {
        const r = await fetchYahooNews(symbol, limit);
        if (!r?.items?.length) return { source: 'yahoo', items: [] };
        const cutoff = Date.now() - days * 86400000;
        const items = r.items.map(i => ({
            id: i.id,
            title: i.title,
            url: i.url,
            source: i.publisher || 'yahoo',
            publishedAt: (() => {
                const n = Number(i.publishedAt);
                const ts = n && n < 1e12 ? n * 1000 : n;
                const d = new Date(ts);
                return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            })(),
            summary: i.summary || ''
        })).filter(i => new Date(i.publishedAt).getTime() >= cutoff);
        return { source: 'yahoo', items: items.slice(0, limit) };
    } catch (e) { return { source: 'yahoo', error: true, items: [] }; }
}
