import { proxyFetch } from './proxy-fetch.js';
import { Store } from './store.js';

const YAHOO = 'https://query2.finance.yahoo.com';
const SIX_HOURS = 6 * 60 * 60 * 1000;
const CHART_SNAPSHOT_TTL_MS = 45000;
const CHART_SNAPSHOT_ERROR_TTL_MS = 12000;
const INTRADAY_TTL_MS = 5 * 60 * 1000;
const DAILY_TTL_MS = 60 * 60 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;
// A history with fewer candles than this is only kept when no coarser candle size does better.
const MIN_VALID_CANDLES = 20;

// Symbols Yahoo answered 404/422 for (delisted, renamed, wrong suffix) are skipped for the rest of the session,
// so a stale constituent list cannot flood the network and the console again.
const deadTickers = new Set();

// How long a price history stays cached, by period; the others (1H, 4H, 1D, 3M, YTD) get the intraday time.
const PERIOD_TTL_MS = {
    '1W': 10 * 60 * 1000, '1M': 15 * 60 * 1000,
    '6M': DAILY_TTL_MS, '1Y': DAILY_TTL_MS, '3Y': DAILY_TTL_MS, '5Y': DAILY_TTL_MS, 'MAX': DAILY_TTL_MS,
};

// Candle sizes to try per period, finest first: Yahoo often refuses 1m/5m candles for thinly traded stocks.
const PERIOD_FALLBACKS = {
    '1H':  [{ interval: '1m',  range: '1h'  }, { interval: '2m',  range: '1h'  }, { interval: '5m', range: '1d' }],
    '4H':  [{ interval: '1m',  range: '4h'  }, { interval: '2m',  range: '4h'  }, { interval: '5m', range: '1d' }],
    '1D':  [{ interval: '1m',  range: '1d'  }, { interval: '5m',  range: '1d'  }, { interval: '15m', range: '1d'  }, { interval: '1h', range: '5d' }],
    '1W':  [{ interval: '5m',  range: '5d'  }, { interval: '15m', range: '5d'  }, { interval: '1h',  range: '5d'  }, { interval: '1d', range: '1mo' }],
    '1M':  [{ interval: '15m', range: '1mo' }, { interval: '1h',  range: '1mo' }, { interval: '1d',  range: '1mo' }],
    '3M':  [{ interval: '1d',  range: '3mo' }, { interval: '1wk', range: '3mo' }],
    '6M':  [{ interval: '1h',  range: '6mo' }, { interval: '1d',  range: '6mo' }],
    'YTD': [{ interval: '1d',  range: 'ytd' }, { interval: '1wk', range: 'ytd' }],
    '1Y':  [{ interval: '1d',  range: '1y'  }, { interval: '1wk', range: '1y'  }],
    '3Y':  [{ interval: '1wk', range: '3y'  }, { interval: '1mo', range: '3y'  }],
    '5Y':  [{ interval: '1wk', range: '5y'  }, { interval: '1mo', range: '5y'  }],
    'MAX': [{ interval: '1mo', range: 'max' }, { interval: '3mo', range: 'max' }],
};

// Answers that make the next candle size pointless: 401 wants a crumb, 422 is a dead ticker, NO_VALID_DATA is ours.
const PERMANENT_ERROR_CODES = new Set([401, 422, 'NO_VALID_DATA']);
// How long a failed answer is remembered, so a reload does not repeat the request (and the console error).
const errorTtl = code => ({ 401: SIX_HOURS, 404: SIX_HOURS, 422: SIX_HOURS, 500: 2 * 60 * 1000 }[code] ?? 60 * 1000);

const fail = () => ({ source: 'yahoo', error: true, errorCode: 500 });

// Market data is cached in IndexedDB with an expiry. Any storage failure is just a cache miss.
async function cacheGet(key) {
    try {
        const entry = await Store.get(`nemeris_cache_${key}`);
        return entry && Date.now() <= entry.expires ? entry.data : null;
    } catch { return null; }
}

async function cacheSet(key, data, ttlMs) {
    try { await Store.set(`nemeris_cache_${key}`, { data, expires: Date.now() + ttlMs }); } catch (e) { console.warn('[Cache] Set failed:', e); }
}

// One request per key at a time: callers asking for the same thing while it is in flight share its answer.
const inflight = new Map();
function once(key, task) {
    if (!inflight.has(key)) inflight.set(key, task().finally(() => inflight.delete(key)));
    return inflight.get(key);
}

// Market suffixes Yahoo really uses (.L London, .PA Paris...): only other dots are turned into dashes (BRK.B -> BRK-B).
const MARKET_SUFFIXES = new Set(('L PA DE SW AX TO HK NS BO SZ SS T KS KQ SA MX MI AS BR VI ST HE CO IR OL LS MC WA IS TA JO BA SN '
    + 'F BE MU DU HM HA SG CN V NE TW JK BK SI NZ').split(' '));

function normalizeSymbol(sym) {
    return (sym || '').trim().toUpperCase()
        .replace(/^([A-Z0-9]+)\.([A-Z]{1,3})$/, (match, base, suffix) => MARKET_SUFFIXES.has(suffix) ? match : `${base}-${suffix}`)
        .replace(/^([A-Z0-9]+)\/P([A-Z0-9]+)$/, '$1-P$2')
        .replaceAll('/', '-');
}

export const getYahooSymbol = stock => (typeof stock === 'string' ? stock : stock?.ticker) || null;

/** The parsed JSON, or an error object ({ error: true, errorCode }) that callers check before reading `.chart` etc. */
async function yahooFetch(url, signal) {
    let failure;
    for (const host of ['query2', 'query1']) {
        const r = await proxyFetch(url.replace(/query[12]/, host), { signal });
        if (!r.error) return r.data;
        failure = r;
        // Throttled (429), crumb wall (401) and unknown ticker (404) are the same on both hosts: only other errors are worth a retry.
        if ([429, 401, 404].includes(r.errorCode)) break;
    }
    return failure;
}

// Candles without a usable time or price are dropped. Open, high and low are scaled by the split/dividend
// adjustment of the close, so the candles stay consistent with the adjusted price.
function cleanCandles(ts, { open, high, low, close, volume }, adjclose) {
    const clean = { timestamps: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
    if (![open, high, low, close].every(a => a?.length === ts.length)) return clean;
    const hasAdj = adjclose?.length === ts.length;
    const hasVolume = volume?.length === ts.length;
    const ok = v => v != null && !isNaN(v);
    ts.forEach((t, i) => {
        const c = close[i];
        const adjC = hasAdj ? adjclose[i] : c;
        const ratio = hasAdj && c && adjC !== null ? adjC / c : 1;
        const scale = v => v !== null ? v * ratio : null;
        const row = [t, scale(open[i]), scale(high[i]), scale(low[i]), adjC !== null ? adjC : c];
        if (!row.every(ok)) return;
        clean.timestamps.push(t);
        clean.opens.push(row[1]);
        clean.highs.push(row[2]);
        clean.lows.push(row[3]);
        clean.closes.push(row[4]);
        clean.volumes.push(hasVolume ? volume[i] || 0 : 0);
    });
    return clean;
}

async function tryFetchChart(symbol, cfg, signal) {
    const j = await yahooFetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`, signal);
    if (j.error) return { error: true, errorCode: j.errorCode, throttled: j.throttled };

    const res = j.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!res || !q || !res.timestamp?.length || !q.close?.length) return { error: true, errorCode: res?.meta ? 'NO_DATA' : 404 };

    const { timestamps, opens, highs, lows, closes, volumes } = cleanCandles(res.timestamp, q, res.indicators.adjclose?.[0]?.adjclose);
    if (!timestamps.length) return { error: true, errorCode: 'NO_VALID_DATA' };

    const open = opens[0], price = closes[closes.length - 1];
    return {
        source: 'yahoo', timestamps, prices: closes, opens, highs, lows, closes, volumes,
        open, high: Math.max(...highs), low: Math.min(...lows), price, interval: cfg.interval,
        change: price - open, changePercent: open ? (price - open) / open * 100 : 0,
    };
}

export async function fetchFromYahoo(ticker, period, _symbol, stock, _name, signal) {
    const yahooSymbol = getYahooSymbol(stock) || ticker;
    const symbol = normalizeSymbol(yahooSymbol);
    if (deadTickers.has(symbol)) return { source: 'yahoo', error: true, errorCode: 404 };

    const key = `ohlc_${yahooSymbol}_${period}`;
    const cached = await cacheGet(key);
    if (cached) return cached;

    const ttl = PERIOD_TTL_MS[period] || INTRADAY_TTL_MS;
    try {
        const sizes = PERIOD_FALLBACKS[period] || [PERIOD_FALLBACKS['1D'][0]];
        let lastError = null;
        let thin = null; // the best too-short history so far, kept in case nothing better comes

        for (const [i, cfg] of sizes.entries()) {
            const result = await tryFetchChart(symbol, cfg, signal);
            if (!result.error) {
                // Small caps often get only a handful of 1m candles: ask for a coarser size instead.
                if (result.timestamps.length < MIN_VALID_CANDLES && i < sizes.length - 1) {
                    if (!thin || result.timestamps.length > thin.timestamps.length) thin = result;
                    continue;
                }
                await cacheSet(key, result, ttl);
                return result;
            }
            lastError = result;
            if (result.throttled || PERMANENT_ERROR_CODES.has(result.errorCode)) break;
        }

        if (thin) {
            await cacheSet(key, thin, ttl);
            return thin;
        }
        const failure = { source: 'yahoo', error: true, ...lastError };
        if (lastError?.errorCode === 404 || lastError?.errorCode === 422) deadTickers.add(symbol);
        if (!lastError?.throttled) await cacheSet(key, failure, errorTtl(lastError?.errorCode));
        return failure;
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        return fail();
    }
}

export function computeDaysSinceLastTrade(regularMarketTime) {
    if (!regularMarketTime || regularMarketTime <= 0) return 999;
    return (Math.floor(Date.now() / 1000) - regularMarketTime) / 86400;
}

/** False for delisted, suspended or long-silent instruments. */
export function isYahooTickerActiveFromQuote(q = {}) {
    const isCrypto = q.quoteType === 'CRYPTOCURRENCY' || (q.exchange || '').toUpperCase() === 'CCC' || q.currency === 'CRYPTO';
    const price = q.regularMarketPrice || q.price || 0;
    const volume = q.regularMarketVolume || 0;
    if (isCrypto) return Number.isFinite(price) && price > 0 && !(q.cryptoTradeable === false && volume < 50000);

    const days = computeDaysSinceLastTrade(q.regularMarketTime);
    const noActivity = volume === 0 && Math.abs(q.regularMarketChangePercent || 0) < 0.001;
    return q.tradeable !== false && !(noActivity && days > 3) && !(days > 7);
}

const closesOf = snap => (snap.indicators?.quote?.[0]?.close || []).filter(v => v != null);

// Tries the quoteSummary modules first (fromSummary turns them into the answer, or nothing). Yahoo now often
// refuses them without a crumb, so the chart (crumb-free) gives a thinner answer instead (fromChart).
async function summaryOrChart(ticker, modules, range, signal, fromSummary, fromChart) {
    const j = await yahooFetch(`${YAHOO}/v11/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`, signal).catch(() => ({ error: true }));
    const result = j?.error ? null : j?.quoteSummary?.result?.[0];
    const answer = result && fromSummary(result);
    if (answer) return { source: 'yahoo', ...answer };
    try {
        const snap = await fetchYahooChartSnapshot(ticker, range, '1d', signal);
        return snap?.meta ? { source: 'yahoo', ...fromChart(snap) } : { source: 'yahoo', error: true, errorCode: j?.errorCode || 500 };
    } catch { return fail(); }
}

export const fetchYahooFinancials = (ticker, signal) => summaryOrChart(ticker, 'financialData', '6mo', signal,
    r => r.financialData && { financials: r },
    ({ meta }) => {
        const price = meta.regularMarketPrice || 0, prev = meta.chartPreviousClose || meta.previousClose || 0;
        const raw = v => v != null ? { raw: v } : null;
        return { financials: { financialData: {
            currentPrice: price ? { raw: price } : null,
            dayChangePercent: prev ? (price - prev) / prev * 100 : null,
            fiftyTwoWeekHigh: raw(meta.fiftyTwoWeekHigh),
            fiftyTwoWeekLow: raw(meta.fiftyTwoWeekLow),
            regularMarketVolume: meta.regularMarketVolume ?? null,
        } } };
    });

export const fetchYahooEarnings = (ticker, signal) => summaryOrChart(ticker, 'earnings,earningsHistory,earningsTrend', '1y', signal,
    r => ({ earnings: r.earnings || r }),
    snap => {
        const closes = closesOf(snap);
        const delta = closes.length >= 2 ? closes.at(-1) - closes[0] : null;
        return { earnings: {
            regularMarketPrice: snap.meta.regularMarketPrice ?? null,
            yearlyPriceDelta: delta,
            yearlyPriceDeltaPercent: delta && closes[0] ? delta / closes[0] * 100 : null,
        } };
    });

// Without analyst data, the 3-month price move stands in for a recommendation.
export const fetchYahooAnalysis = (ticker, signal) => summaryOrChart(ticker, 'recommendationTrend,financialData', '3mo', signal,
    r => ({ analysis: r }),
    snap => {
        const closes = closesOf(snap);
        const perf = closes.length >= 2 ? (closes.at(-1) - closes[0]) / closes[0] * 100 : 0;
        const rec = perf > 6 ? 'buy' : perf < -6 ? 'sell' : 'hold';
        const n = key => (rec === key ? 1 : 0);
        return { analysis: {
            recommendationTrend: { trend: [{ period: '3m', strongBuy: n('buy'), buy: n('buy'), hold: n('hold'), sell: n('sell'), strongSell: n('sell'), recommendationKey: rec }] },
            financialData: { recommendationMean: { raw: { buy: 1.8, sell: 3.8, hold: 3.0 }[rec] }, momentum3m: { raw: perf } },
        } };
    });

export async function fetchYahooDividends(ticker, signal) {
    try {
        const j = await yahooFetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y&events=div,splits`, signal);
        if (!j.error) {
            const items = Object.values(j?.chart?.result?.[0]?.events?.dividends || {})
                .map(d => ({ date: d?.date ? new Date(d.date * 1000).toISOString().slice(0, 10) : null, dividend: Number(d?.amount || 0) }))
                .filter(d => d.date && Number.isFinite(d.dividend));
            if (items.length > 0) return { source: 'yahoo', dividends: items };
        }

        // Second try: the CSV download, from 2000 to the start of today (UTC).
        const today = Math.floor(Date.now() / 86400000) * 86400;
        const r = await proxyFetch(`${YAHOO}/v7/finance/download/${encodeURIComponent(ticker)}?period1=946684800&period2=${today}&interval=1d&events=div`, { signal, expect: 'text' });
        if (r.error || !r.data) return { source: 'yahoo', error: true, errorCode: r.errorCode || 500 };
        if (r.data.startsWith('<')) return { source: 'yahoo', error: true, errorCode: 'PROXY_HTML' };
        const items = r.data.trim().split('\n').slice(1).map(line => {
            const [date, div] = line.split(',');
            return { date, dividend: parseFloat(div) };
        }).filter(d => d.date && Number.isFinite(d.dividend));
        return { source: 'yahoo', dividends: items };
    } catch {
        return fail();
    }
}

export async function fetchYahooQuote(ticker, signal) {
    try {
        const j = await yahooFetch(`${YAHOO}/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', quote: j?.quoteResponse?.result?.[0] || null };
    } catch {
        return fail();
    }
}

/** Symbols made of plain letters, digits, dots and dashes. */
export function isYahooSparkFriendly(sym) {
    const upper = (sym || '').toUpperCase();
    return /^[A-Z0-9.-]{1,24}$/.test(upper) && !upper.includes('--') && !upper.includes('..');
}

export async function fetchYahooScreener(scrIds, offset = 0, count = 200, signal) {
    const j = await yahooFetch(`${YAHOO}/v1/finance/screener/predefined/saved?scrIds=${scrIds}&count=${count}&offset=${offset}`, signal);
    const result = j?.finance?.result?.[0];
    return { quotes: result?.quotes || [], total: result?.total || 0 };
}

// Members of an index (CAC 40, FTSE 100, DAX...) so those market lists need no hardcoded tickers. The lookup
// endpoint works without a crumb; when it has nothing, the caller falls back to the local constituent lists.
export async function fetchYahooIndexComponents(indexSymbol, signal) {
    try {
        const j = await yahooFetch(`${YAHOO}/v1/finance/lookup?query=${encodeURIComponent(normalizeSymbol(indexSymbol))}&type=equity&count=250`, signal);
        const docs = j?.error ? null : j?.finance?.result?.[0]?.documents;
        if (Array.isArray(docs) && docs.length > 0) return docs.map(d => d.symbol).filter(Boolean);
    } catch { /* no members: the caller has a fallback */ }
    return [];
}

const chartSnapshots = new Map();

export async function fetchYahooChartSnapshot(symbol, range = '1d', interval = '1m', signal) {
    const norm = normalizeSymbol(symbol);
    if (deadTickers.has(norm)) return null;
    const key = `${norm}|${range}|${interval}`;
    const cached = chartSnapshots.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    return once(`chart:${key}`, async () => {
        const j = await yahooFetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(norm)}?range=${range}&interval=${interval}`, signal);
        if (j?.error) {
            // A ticker Yahoo does not know is remembered for hours; other errors retry soon.
            const dead = j.errorCode === 404 || j.errorCode === 422;
            if (dead) deadTickers.add(norm);
            chartSnapshots.set(key, { expiresAt: Date.now() + (dead ? SIX_HOURS : CHART_SNAPSHOT_ERROR_TTL_MS), data: null });
            return null;
        }
        const data = j?.chart?.result?.[0] || null;
        chartSnapshots.set(key, { expiresAt: Date.now() + CHART_SNAPSHOT_TTL_MS, data });
        return data;
    });
}

// The spark endpoint (a batch of mini charts) answers 400 through the proxy now and can never succeed from the
// browser, so there is nothing to fetch: callers fall back to charts one ticker at a time.
export const fetchYahooSparkBatch = async () => [];

// A quote built from the chart, in the shape of Yahoo's v7/quote (which needs a crumb and always answers 401).
function synthesizeQuoteFromChart(symbol, chart) {
    const meta = chart?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice || chart.indicators?.quote?.[0]?.close?.filter(v => v != null).pop() || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const change = prevClose ? price - prevClose : 0;
    return {
        symbol,
        shortName: meta.shortName || symbol,
        longName: meta.longName || meta.shortName || symbol,
        regularMarketPrice: price,
        regularMarketChange: change,
        regularMarketChangePercent: prevClose ? change / prevClose * 100 : 0,
        regularMarketVolume: meta.regularMarketVolume || 0,
        regularMarketTime: meta.regularMarketTime || 0,
        exchange: meta.exchangeName || meta.fullExchangeName || '',
        fullExchangeName: meta.fullExchangeName || meta.exchangeName || '',
        currency: meta.currency || 'USD',
        quoteType: meta.instrumentType || meta.quoteType || '',
        marketCap: 0,
        industry: '',
        tradeable: meta.tradeable !== false,
    };
}

export async function fetchYahooQuotesBatch(symbols, signal) {
    const quotes = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
        const chunk = symbols.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(chunk.map(async sym => {
            try { return synthesizeQuoteFromChart(sym, await fetchYahooChartSnapshot(sym, '1d', '1m', signal)); } catch { return null; }
        }));
        quotes.push(...settled.filter(Boolean));
    }
    return quotes;
}

export async function fetchYahooPeriodChanges(tickers, period, signal, onProgress) {
    const results = {};
    if (!tickers.length) return results;
    let done = 0;
    const report = () => { try { onProgress?.(Math.min(done, tickers.length), tickers.length); } catch { /* a broken progress callback must not stop the fetch */ } };
    report();

    const CONCURRENCY = 3;
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        await Promise.all(tickers.slice(i, i + CONCURRENCY).map(async ticker => {
            try {
                const data = await fetchFromYahoo(ticker, period, ticker, null, null, signal);
                if (data && !data.error) {
                    // The shape the Explorer's SignalBot enrichment expects: it needs `.history`.
                    results[ticker] = {
                        change: data.change,
                        changePercent: data.changePercent,
                        price: data.price,
                        symbol: ticker,
                        history: { prices: data.prices || data.closes || [], highs: data.highs || [], lows: data.lows || [], volumes: data.volumes || [] },
                    };
                }
            } catch { /* one failing ticker must not stop the others */ }
            done++;
            report();
        }));
        if (i + CONCURRENCY < tickers.length) await new Promise(r => setTimeout(r, 200));
    }
    return results;
}

// Cached news of one ticker, in the shape fetchNews returns (the days filter comes after).
async function yahooNews(ticker, limit) {
    const key = `news2_${ticker}`;
    const cached = await cacheGet(key);
    if (cached) return cached;
    const j = await yahooFetch(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${limit}`);
    if (!j || j.error) return [];
    const items = (j.news || []).slice(0, limit).map(i => {
        const n = Number(i.providerPublishTime || i.unixTimeMs || Date.now());
        const date = new Date(n && n < 1e12 ? n * 1000 : n);
        return {
            id: i.uuid || i.link || i.title,
            title: i.title,
            url: i.link,
            source: i.publisher || 'Yahoo Finance',
            publishedAt: (isNaN(date) ? new Date() : date).toISOString(),
            summary: i.summary || '',
            relatedTickers: Array.isArray(i.relatedTickers) ? i.relatedTickers : [],
        };
    });
    await cacheSet(key, items, NEWS_TTL_MS);
    return items;
}

export async function fetchNews(symbol, limit = 20, days = 7) {
    try {
        // Even for the 1D period, show at least three days: the ticker's news pane would be empty too often.
        const cutoff = Date.now() - Math.max(days, 3) * 86400000;
        const items = (await yahooNews(symbol, limit)).filter(i => new Date(i.publishedAt).getTime() >= cutoff);
        return { source: 'yahoo', items: items.slice(0, limit) };
    } catch (e) {
        console.error('[News Fetch] Error:', e);
        return { source: 'yahoo', error: true, items: [] };
    }
}

const missingSummaries = new Set();

export function fetchYahooQuoteSummary(symbol, modules = ['calendarEvents', 'summaryDetail']) {
    const s = getYahooSymbol(symbol);
    const key = `${s}|${modules.join(',')}`;
    if (missingSummaries.has(key)) return Promise.resolve(null);
    return once(`summary:${key}`, async () => {
        try {
            const res = await proxyFetch(`${YAHOO}/v11/finance/quoteSummary/${s}?modules=${modules.join(',')}`);
            if (res.error) {
                if (res.errorCode === 404 || res.errorCode === 422) missingSummaries.add(key);
                return null;
            }
            return res.data?.quoteSummary?.result?.[0];
        } catch (e) {
            console.error(`QuoteSummary failed for ${symbol}:`, e);
            return null;
        }
    });
}
