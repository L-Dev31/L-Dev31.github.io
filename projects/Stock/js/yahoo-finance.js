import { proxyFetch } from './proxy-fetch.js';
import { cacheGet, cacheSet, ohlcKey, newsKey, TTL } from './cache.js';

const BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
let baseIndex = 0;

const CHART_SNAPSHOT_TTL_MS = 45000;
const CHART_SNAPSHOT_ERROR_TTL_MS = 12000;
const DEAD_TICKER_TTL_MS = 6 * 60 * 60 * 1000; // 404/422 ticker → suppress for the session

// Symbols Yahoo answered 404/422 for (delisted/renamed/wrong suffix). Skipped entirely
// on subsequent lookups so a stale constituent list can't re-flood the network/console.
const deadTickers = new Set();

// OHLC CACHE TTL BY PERIOD
const PERIOD_TTL_MS = {
    '1H': TTL.OHLC_INTRA,
    '4H': TTL.OHLC_INTRA,
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

export const PERIODS = {
    '1H': { interval: '1m', range: '1h' },
    '4H': { interval: '1m', range: '4h' },
    '1D': { interval: '1m', range: '1d' },
    '1W': { interval: '5m', range: '5d' },
    '1M': { interval: '15m', range: '1mo' },
    '3M': { interval: '1d', range: '3mo' },
    '6M': { interval: '1h', range: '6mo' },
    'YTD': { interval: '1d', range: 'ytd' },
    '1Y': { interval: '1d', range: '1y' },
    '3Y': { interval: '1wk', range: '3y' },
    '5Y': { interval: '1wk', range: '5y' },
    'MAX': { interval: '1mo', range: 'max' }
};

// Fallback chain by period — Yahoo refuse souvent 1m/5m pour small-caps peu liquides.
// On essaie du plus fin au plus grossier jusqu'à avoir de la donnée.
export const PERIOD_FALLBACKS = {
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
    'MAX': [{ interval: '1mo', range: 'max' }, { interval: '3mo', range: 'max' }]
};

function filterNullOHLCDataPoints(timestamps, opens, highs, lows, closes, volumes, adjcloses) {
    if (!timestamps || !opens || !highs || !lows || !closes ||
        timestamps.length !== opens.length ||
        timestamps.length !== highs.length ||
        timestamps.length !== lows.length ||
        timestamps.length !== closes.length) {
        return { timestamps: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
    }

    const hasVolumes = Array.isArray(volumes) && volumes.length === timestamps.length;
    const hasAdj = Array.isArray(adjcloses) && adjcloses.length === timestamps.length;

    const validData = timestamps.map((ts, index) => {
        const c = closes[index];
        const adjC = hasAdj ? adjcloses[index] : c;
        
        // Calcule le ratio d'ajustement (split/dividende) pour corriger O, H, L
        // afin que les bougies restent cohérentes avec le prix ajusté.
        const ratio = (hasAdj && c && c !== 0 && adjC !== null) ? (adjC / c) : 1;

        return {
            timestamp: ts,
            open: opens[index] !== null ? opens[index] * ratio : null,
            high: highs[index] !== null ? highs[index] * ratio : null,
            low: lows[index] !== null ? lows[index] * ratio : null,
            close: adjC !== null ? adjC : c,
            volume: hasVolumes ? (volumes[index] || 0) : 0
        };
    }).filter(item =>
        item.timestamp != null && !isNaN(item.timestamp) &&
        item.open != null && !isNaN(item.open) &&
        item.high != null && !isNaN(item.high) &&
        item.low != null && !isNaN(item.low) &&
        item.close != null && !isNaN(item.close)
    );

    return {
        timestamps: validData.map(item => item.timestamp),
        opens: validData.map(item => item.open),
        highs: validData.map(item => item.high),
        lows: validData.map(item => item.low),
        closes: validData.map(item => item.close),
        volumes: validData.map(item => item.volume)
    };
}

// Suffixes de marché Yahoo officiels — NE PAS convertir le point en tiret.
// Ex: .L (LSE), .PA (Euronext Paris), .DE (Xetra), etc.
const YAHOO_MARKET_SUFFIXES = new Set([
    'L','PA','DE','SW','AX','TO','HK','NS','BO','SZ','SS','T','KS','KQ',
    'SA','MX','MI','AS','BR','VI','ST','HE','CO','IR','OL','LS','MC','WA',
    'IS','TA','JO','BA','SN','F','BE','MU','DU','HM','HA','SG','CN','V',
    'NE','TW','JK','BK','SI','NZ'
]);

function normalizeSymbol(sym) {
    const upper = (sym || '').trim().toUpperCase();
    return upper
        // Ne transforme BRK.A → BRK-A que si le suffixe n'est PAS un suffixe marché
        .replace(/^([A-Z0-9]+)\.([A-Z]{1,3})$/, (match, base, suffix) =>
            YAHOO_MARKET_SUFFIXES.has(suffix) ? match : `${base}-${suffix}`)
        .replace(/^([A-Z0-9]+)\/P([A-Z0-9]+)$/, '$1-P$2')
        .replaceAll('/', '-');
}

export function getYahooSymbol(stock) {
    if (!stock) return null;
    if (typeof stock === 'string') return stock;
    return stock.ticker || null;
}

// Helper — retourne soit le JSON parsé, soit un objet d'erreur normalisé.
// Les callers existants checkent `j.error` puis lisent `j.chart`, `j.quoteResponse`, etc.
async function yahooFetch(targetUrl, signal) {

    // Attempt to rotate between query1 and query2 if we hit a wall
    const subdomains = ['query2', 'query1'];
    let lastError = null;

    for (const sub of subdomains) {
        const url = targetUrl.replace(/query[12]/, sub);
        const r = await proxyFetch(url, { signal });
        
        if (!r.error) return r.data;
        
        lastError = r;
        if (r.errorCode === 429) {
            return { ...r, throttled: true, retryAfter: 30 }; // Fixed 30s as fallback if 429
        }
        // 404 = ticker doesn't exist on Yahoo (not subdomain-specific) → don't retry query1.
        // 401 = crumb wall, identical on both hosts → don't retry either. Only retry on
        // transient/network errors where the other host might respond.
        if (r.errorCode === 401 || r.errorCode === 404) break;
    }
    
    return lastError;
}

// Codes qui indiquent un refus "définitif" côté Yahoo → ne pas retenter les intervals plus larges.
// 401 = Yahoo exige un crumb (v7/v10). 404/422 = ticker mort. NO_VALID_DATA = filtre post-parse.
const PERMANENT_ERROR_CODES = new Set([401, 422, 'NO_VALID_DATA']);
// TTL pour les réponses d'erreur (anti-spam console au reload)
const ERROR_TTL_MS = {
    401: 6 * 60 * 60 * 1000,   // endpoint qui demande crumb → inutile de retaper
    404: 6 * 60 * 60 * 1000,   // ticker probablement mort
    422: 6 * 60 * 60 * 1000,
    500: 2 * 60 * 1000,        // incident transitoire
    default: 60 * 1000
};

function errorTtl(code) {
    return ERROR_TTL_MS[code] ?? ERROR_TTL_MS.default;
}

// Nombre minimum de candles valides pour considérer un résultat "bon" (sinon on tente l'interval suivant).
// Sur le dernier fallback, on accepte n'importe quoi.
const MIN_VALID_CANDLES = 20;

async function tryFetchChart(yahooSymbol, cfg, signal) {
    const norm = normalizeYahooSymbol(yahooSymbol);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(norm)}?interval=${cfg.interval}&range=${cfg.range}`;
    let j = await yahooFetch(url, signal);


    if (j.error) return { error: true, errorCode: j.errorCode, throttled: j.throttled, retryAfter: j.retryAfter };

    const res = j.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!res || !q || !res.timestamp || res.timestamp.length === 0 || !q.close || q.close.length === 0) {
        return { error: true, errorCode: res?.meta ? 'NO_DATA' : 404 };
    }

    const adj = res?.indicators?.adjclose?.[0]?.adjclose;
    const { timestamps, opens, highs, lows, closes, volumes } = filterNullOHLCDataPoints(res.timestamp, q.open, q.high, q.low, q.close, q.volume, adj);
    if (!timestamps.length) return { error: true, errorCode: 'NO_VALID_DATA' };

    const data = {
        source: 'yahoo', timestamps, prices: closes, opens, highs, lows, closes, volumes,
        open: opens[0], high: Math.max(...highs), low: Math.min(...lows), price: closes[closes.length - 1],
        interval: cfg.interval
    };
    data.change = data.price - data.open;
    data.changePercent = data.open ? (data.change / data.open) * 100 : 0;
    return data;
}

export async function fetchFromYahoo(ticker, period, _symbol, stock, _name, signal) {
    const yahooSymbol = getYahooSymbol(stock) || ticker;

    // Known-dead ticker (404/422 seen this session) → don't hit the network again.
    if (deadTickers.has(normalizeYahooSymbol(yahooSymbol))) {
        return { source: 'yahoo', error: true, errorCode: 404 };
    }

    const ck = ohlcKey(yahooSymbol, period);
    const cached = await cacheGet(ck);
    if (cached) return cached;

    try {
            const fallbacks = PERIOD_FALLBACKS[period] || [PERIODS[period] || PERIODS['1D']];
            let lastError = null;
            let thinResult = null; // meilleur résultat "trop maigre" gardé en secours

            for (let i = 0; i < fallbacks.length; i++) {
                const cfg = fallbacks[i];
                const isLastFallback = i === fallbacks.length - 1;
                const result = await tryFetchChart(yahooSymbol, cfg, signal);

                if (!result.error) {
                    // Petits caps (AL2SI, ALUNT, etc.) : 1m renvoie parfois une poignée de candles
                    // à cause des trous de liquidité. On exige un minimum, sinon on tente l'interval plus large.
                    if (result.timestamps.length < MIN_VALID_CANDLES && !isLastFallback) {
                        if (!thinResult || result.timestamps.length > thinResult.timestamps.length) {
                            thinResult = result;
                        }
                        continue;
                    }
                    await cacheSet(ck, result, PERIOD_TTL_MS[period] || TTL.OHLC_INTRA);
                    return result;
                }

                lastError = result;
                if (result.throttled) break;
                if (PERMANENT_ERROR_CODES.has(result.errorCode)) break;
                // Sinon (NO_DATA, 500, timeout) → essayer interval suivant
            }
 
            // Aucun interval n'a atteint le seuil : on renvoie le meilleur résultat "maigre" plutôt que rien.
            if (thinResult) {
                await cacheSet(ck, thinResult, PERIOD_TTL_MS[period] || TTL.OHLC_INTRA);
                return thinResult;
            }
 
            const errorResponse = { source: 'yahoo', error: true, ...lastError };
            // Dead ticker (404/422) → remember it session-wide so other code paths skip it.
            if (lastError?.errorCode === 404 || lastError?.errorCode === 422) {
                deadTickers.add(normalizeYahooSymbol(yahooSymbol));
            }
            // Cache court pour éviter le spam console au reload
            if (!lastError?.throttled) {
                await cacheSet(ck, errorResponse, errorTtl(lastError?.errorCode));
            }
            return errorResponse;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return { source: 'yahoo', error: true, errorCode: 500 };
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

async function fetchYahooModules(ticker, modules, signal) {
    // v10/quoteSummary now requires a crumb token. v11 still serves modules without auth
    // through the proxy worker (same pattern as fetchYahooQuoteSummary above).
    try {
        const j = await yahooFetch(`https://query2.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`, signal);
        if (j.error) return { source: 'yahoo', ...j };
        return { source: 'yahoo', result: j.quoteSummary?.result?.[0] || null };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooFinancials(ticker, signal) {
    const q = await fetchYahooModules(ticker, 'financialData', signal);
    if (!q.error && q.result?.financialData) return { source: 'yahoo', financials: q.result };
    try {
        const snap = await fetchYahooChartSnapshot(ticker, '6mo', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: q.errorCode || 500 };
        const meta = snap.meta, price = meta.regularMarketPrice || 0, prev = meta.chartPreviousClose || meta.previousClose || 0;
        return { source: 'yahoo', financials: { financialData: {
            currentPrice: price ? { raw: price } : null,
            dayChangePercent: prev ? ((price - prev) / prev) * 100 : null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh != null ? { raw: meta.fiftyTwoWeekHigh } : null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow != null ? { raw: meta.fiftyTwoWeekLow } : null,
            regularMarketVolume: meta.regularMarketVolume ?? null
        }}};
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooEarnings(ticker, signal) {
    const q = await fetchYahooModules(ticker, 'earnings,earningsHistory,earningsTrend', signal);
    if (!q.error && q.result) return { source: 'yahoo', earnings: q.result.earnings || q.result };
    try {
        const snap = await fetchYahooChartSnapshot(ticker, '1y', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: q.errorCode || 500 };
        const meta = snap.meta, closes = (snap?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
        const trailing = closes.length >= 2 ? closes[closes.length - 1] - closes[0] : null;
        return { source: 'yahoo', earnings: {
            regularMarketPrice: meta.regularMarketPrice ?? null,
            yearlyPriceDelta: trailing,
            yearlyPriceDeltaPercent: (trailing && closes[0]) ? (trailing / closes[0]) * 100 : null
        }};
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
        const r = await proxyFetch(targetUrl, { signal, expect: 'text' });
        if (r.error || !r.data) return { source: 'yahoo', error: true, errorCode: r.errorCode || 500 };
        const text = r.data;
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
    baseIndex = (baseIndex + 1) % BASES.length;
    return base;
}

export async function fetchYahooScreener(scrIds, offset = 0, count = 200, signal) {
    const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrIds}&count=${count}&offset=${offset}`;
    const j = await yahooFetch(url, signal);
    const result = j?.finance?.result?.[0];
    return { quotes: result?.quotes || [], total: result?.total || 0 };
}

// Fetch index components (members) from Yahoo. Used to dynamically populate
// non-US market lists (CAC 40, FTSE 100, DAX, etc.) without hardcoding tickers.
// v10/quoteSummary?modules=components now requires crumb auth (401), so we
// fallback to the v1/finance/lookup endpoint which still works without crumb.
export async function fetchYahooIndexComponents(indexSymbol, signal) {
    const norm = normalizeYahooSymbol(indexSymbol);

    // Strategy 1: Try v1/finance/lookup (no crumb required)
    try {
        const lookupUrl = `https://query2.finance.yahoo.com/v1/finance/lookup?query=${encodeURIComponent(norm)}&type=equity&count=250`;
        const lj = await yahooFetch(lookupUrl, signal);
        if (!lj?.error) {
            const docs = lj?.finance?.result?.[0]?.documents;
            if (Array.isArray(docs) && docs.length > 0) {
                return docs.map(d => d.symbol).filter(Boolean);
            }
        }
    } catch { /* ignore, fall through */ }

    // quoteSummary?modules=components (v10/v11) now requires a crumb and returns 404/401
    // from the proxy, so it's no longer attempted. Return empty — caller falls back to
    // the local JSON constituent lists.
    return [];
}

export async function fetchYahooChartSnapshot(symbol, range = '1d', interval = '1m', signal) {
    const norm = normalizeYahooSymbol(symbol);
    if (deadTickers.has(norm)) return null; // known 404/422 — no network call
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
            // 404/422 = ticker doesn't exist on Yahoo (delisted/renamed/wrong suffix).
            // Suppress it for hours instead of 12s so a stale constituent list doesn't
            // re-flood the console every time the market reloads. Transient errors keep
            // the short TTL so they retry soon.
            const isDeadTicker = j.errorCode === 404 || j.errorCode === 422;
            const ttl = isDeadTicker ? DEAD_TICKER_TTL_MS : CHART_SNAPSHOT_ERROR_TTL_MS;
            if (isDeadTicker) deadTickers.add(norm);
            chartSnapshotCache.set(cacheKey, { expiresAt: Date.now() + ttl, data: null });
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

// v7/finance/spark ALWAYS returns 400 through the proxy now (deprecated/crumb-gated) — it
// will never succeed from the browser. Default to dead so we don't emit a guaranteed 400
// (browser-logged regardless of handling) on every load. fetchYahooPeriodChanges falls
// back to per-ticker v8/chart fetches. Flip to false to re-probe if Yahoo restores it.
let sparkEndpointDead = true;

export async function fetchYahooSparkBatch(symbols, range = '1d', interval = '1m', signal) {
    if (!symbols.length) return [];
    if (sparkEndpointDead) return [];
    const CHUNK_SIZE = 40;
    const chunks = [];
    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
        chunks.push(symbols.slice(i, i + CHUNK_SIZE));
    }
    try {
        const promises = chunks.map(async (chunk) => {
            const url = `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${chunk.join(',')}&range=${range}&interval=${interval}&includePrePost=false`;
            const j = await yahooFetch(url, signal);
            if (j?.error) {
                if (j.errorCode === 400 || j.errorCode === 401) sparkEndpointDead = true;
                return [];
            }
            return j?.spark?.result || [];
        });
        const results = await Promise.all(promises);
        return results.flat();
    } catch (err) {
        console.error('[Yahoo] Spark Batch Parallel Error:', err);
        return null;
    }
}

// v7/finance/quote requires a crumb and ALWAYS returns 401 through the proxy now — it
// will never succeed from the browser. We default to dead so we don't emit a guaranteed
// 401 (which the browser logs to the console regardless of how we handle it) on every
// load. Quotes are synthesized from v8/chart (crumb-free) instead. If Yahoo ever restores
// crumb-free access, flip this back to false to re-probe.
let quoteEndpointDead = true;

// Build a quote-shaped object from a v8/chart snapshot so callers (mapQuoteToItem,
// isYahooTickerActiveFromQuote) keep working without the v7/quote endpoint.
function synthesizeQuoteFromChart(symbol, chart) {
    const meta = chart?.meta;
    if (!meta) return null;
    const closes = chart?.indicators?.quote?.[0]?.close || [];
    let price = meta.regularMarketPrice || 0;
    if (!price) for (let i = closes.length - 1; i >= 0; i--) if (closes[i] != null) { price = closes[i]; break; }
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const change = prevClose ? price - prevClose : 0;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    return {
        symbol,
        shortName: meta.shortName || symbol,
        longName: meta.longName || meta.shortName || symbol,
        regularMarketPrice: price,
        regularMarketChange: change,
        regularMarketChangePercent: changePercent,
        regularMarketVolume: meta.regularMarketVolume || 0,
        regularMarketTime: meta.regularMarketTime || 0,
        exchange: meta.exchangeName || meta.fullExchangeName || '',
        fullExchangeName: meta.fullExchangeName || meta.exchangeName || '',
        currency: meta.currency || 'USD',
        quoteType: meta.instrumentType || meta.quoteType || '',
        marketCap: 0,
        industry: '',
        tradeable: meta.tradeable !== false
    };
}

async function fetchQuotesViaChart(symbols, signal) {
    const out = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
        const chunk = symbols.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(chunk.map(async (sym) => {
            try {
                const chart = await fetchYahooChartSnapshot(sym, '1d', '1m', signal);
                return synthesizeQuoteFromChart(sym, chart);
            } catch { return null; }
        }));
        for (const q of settled) if (q) out.push(q);
    }
    return out;
}

export async function fetchYahooQuotesBatch(symbols, signal) {
    if (!symbols.length) return [];

    // v7/quote is dead (crumb required) — go straight to the chart-based fallback.
    if (quoteEndpointDead) return fetchQuotesViaChart(symbols, signal);

    const CHUNK_SIZE = 40;
    const chunks = [];
    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
        chunks.push(symbols.slice(i, i + CHUNK_SIZE));
    }
    const fetchChunk = async (chunk) => {
        const encoded = chunk.map(s => encodeURIComponent(s)).join(',');
        const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encoded}`;
        const j = await yahooFetch(url, signal);
        if (j?.error) {
            if (j.errorCode === 401) quoteEndpointDead = true;
            return { failed: chunk };
        }
        return { quotes: j?.quoteResponse?.result || [] };
    };

    try {
        // Probe with the first chunk only. If v7/quote is crumb-walled (401) it fails
        // here, we flip quoteEndpointDead, and route ALL chunks through the chart
        // fallback — avoiding a parallel burst of identical 401s on every page load.
        const probe = await fetchChunk(chunks[0]);
        if (quoteEndpointDead) return fetchQuotesViaChart(symbols, signal);

        const quotes = [];
        const failed = [];
        (probe.quotes ? quotes : failed).push(...(probe.quotes || probe.failed));

        if (chunks.length > 1) {
            const rest = await Promise.all(chunks.slice(1).map(fetchChunk));
            for (const r of rest) {
                if (r.quotes) quotes.push(...r.quotes);
                else if (r.failed) failed.push(...r.failed);
            }
        }
        // Recover any individually-failed chunks via the crumb-free chart endpoint.
        if (failed.length) quotes.push(...await fetchQuotesViaChart(failed, signal));
        return quotes;
    } catch (err) {
        console.error('[Yahoo] Quote Batch Parallel Error:', err);
        return null;
    }
}

export async function fetchYahooPeriodChanges(tickers, period, signal) {
    if (!tickers.length) return {};
    const results = {};
    const periodConfig = PERIODS[period] || PERIODS['1D'];
    const { range, interval } = periodConfig;

    const safeTickers = tickers.filter(isYahooSparkFriendly);
    if (safeTickers.length > 0) {
        try {
            const batchResults = await fetchYahooSparkBatch(safeTickers, range, interval, signal);
            if (batchResults) {
                for (const entry of batchResults) {
                    const symbolKey = entry?.symbol;
                    if (!symbolKey) continue;
                    const parsed = parseChartPayload(entry, symbolKey);
                    if (parsed) results[symbolKey] = parsed;
                }
            }
        } catch (e) {
            console.warn('[Yahoo] Spark Batch failed, falling back to individual calls.', e);
        }
    }

    const missing = tickers.filter(t => !results[t]);
    if (missing.length > 0) {
        const CONCURRENCY = 3;
        for (let i = 0; i < missing.length; i += CONCURRENCY) {
            const chunk = missing.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async (ticker) => {
                try {
                    const data = await fetchFromYahoo(ticker, period, ticker, null, null, signal);
                    if (data && !data.error) {
                        // Normalize to the same shape parseChartPayload emits. fetchFromYahoo
                        // returns a FLAT result (prices/highs/lows/volumes at top level), but
                        // consumers (explorer SignalBot enrichment) gate on `.history`. Without
                        // this wrap, every fallback-path ticker had no history → SignalBot never
                        // ran → all scores defaulted to a neutral 50.
                        results[ticker] = {
                            change: data.change,
                            changePercent: data.changePercent,
                            price: data.price,
                            symbol: ticker,
                            history: {
                                prices: data.prices || data.closes || [],
                                highs: data.highs || [],
                                lows: data.lows || [],
                                volumes: data.volumes || []
                            }
                        };
                    }
                } catch (e) { /* ignore individual failure */ }
            }));
            if (i + CONCURRENCY < missing.length) await new Promise(r => setTimeout(r, 200));
        }
    }

    return results;
}

function parseChartPayload(payload, symbolKey) {
    if (!payload) return null;
    
    let resp = payload;
    if (payload.response && Array.isArray(payload.response)) {
        resp = payload.response[0];
    }
    
    if (!resp) return null;

    const quote = resp?.indicators?.quote?.[0];
    const closes = quote?.close;
    if (!closes || closes.length < 1) return null;

    const adjCloses = resp?.indicators?.adjclose?.[0]?.adjclose;
    
    const cleanData = { prices: [], highs: [], lows: [], volumes: [] };
    for (let k = 0; k < closes.length; k++) {
        if (closes[k] !== null && closes[k] !== undefined) {
            const c = closes[k];
            const adjC = (adjCloses && adjCloses[k] !== null && adjCloses[k] !== undefined) ? adjCloses[k] : c;
            const ratio = (adjCloses && c && c !== 0 && adjCloses[k] !== null) ? (adjC / c) : 1;

            cleanData.prices.push(adjC);
            const rawHigh = (quote.high && quote.high[k] !== null && quote.high[k] !== undefined) ? quote.high[k] : c;
            const rawLow = (quote.low && quote.low[k] !== null && quote.low[k] !== undefined) ? quote.low[k] : c;
            cleanData.highs.push(rawHigh * ratio);
            cleanData.lows.push(rawLow * ratio);
            cleanData.volumes.push((quote.volume && quote.volume[k] !== null) ? quote.volume[k] : 0);
        }
    }

    if (cleanData.prices.length === 0) return null;
    
    const firstPrice = cleanData.prices[0];
    const lastPrice = cleanData.prices[cleanData.prices.length - 1];

    return {
        change: lastPrice - firstPrice,
        changePercent: firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0,
        history: cleanData,
        price: lastPrice,
        symbol: symbolKey
    };
}

export async function fetchYahooAnalysis(ticker, signal) {
    const q = await fetchYahooModules(ticker, 'recommendationTrend,financialData', signal);
    if (!q.error && q.result) return { source: 'yahoo', analysis: q.result };
    try {
        const snap = await fetchYahooChartSnapshot(ticker, '3mo', '1d', signal);
        if (!snap?.meta) return { source: 'yahoo', error: true, errorCode: q.errorCode || 500 };
        const closes = (snap?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
        const perf = closes.length >= 2 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
        const rec = perf > 6 ? 'buy' : perf < -6 ? 'sell' : 'hold';
        return { source: 'yahoo', analysis: {
            recommendationTrend: { trend: [{ period: '3m', strongBuy: rec === 'buy' ? 1 : 0, buy: rec === 'buy' ? 1 : 0, hold: rec === 'hold' ? 1 : 0, sell: rec === 'sell' ? 1 : 0, strongSell: rec === 'sell' ? 1 : 0, recommendationKey: rec }] },
            financialData: { recommendationMean: rec === 'buy' ? { raw: 1.8 } : rec === 'sell' ? { raw: 3.8 } : { raw: 3.0 }, momentum3m: { raw: perf } }
        }};
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
}

export async function fetchYahooNews(ticker, limit = 10, signal) {
    const ck = newsKey(ticker);
    const cached = await cacheGet(ck);
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
        await cacheSet(ck, items, TTL.NEWS);
        return { source: 'yahoo', items };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, items: [] }; }
}

export async function fetchNews(symbol, limit = 20, days = 7) {
    try {
        const r = await fetchYahooNews(symbol, limit);
        if (!r?.items?.length) return { source: 'yahoo', items: [] };
        
        // If days is 1 (1D period), we still want to show at least some recent news, 
        // so we'll use a minimum of 3 days for the ticker-specific news pane.
        const effectiveDays = Math.max(days, 3);
        const cutoff = Date.now() - effectiveDays * 86400000;

        const items = r.items.map(i => {
            const n = Number(i.publishedAt);
            const ts = n && n < 1e12 ? n * 1000 : n;
            const d = new Date(ts);
            const iso = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();

            return {
                id: i.id || i.url || i.title,
                title: i.title,
                url: i.url,
                source: i.publisher || 'Yahoo Finance',
                publishedAt: iso,
                summary: i.summary || '',
                relatedTickers: Array.isArray(i.relatedTickers) ? i.relatedTickers : []
            };
        }).filter(i => new Date(i.publishedAt).getTime() >= cutoff);

        return { source: 'yahoo', items: items.slice(0, limit) };
    } catch (e) {
        console.error('[News Fetch] Error:', e);
        return { source: 'yahoo', error: true, items: [] };
    }
}

const quoteSummary404 = new Set();

export async function fetchYahooQuoteSummary(symbol, modules = ['calendarEvents', 'summaryDetail']) {
    const s = getYahooSymbol(symbol);
    const cacheKey = `${s}|${modules.join(',')}`;
    if (quoteSummary404.has(cacheKey)) return null;

    const url = `${getNextBase()}/v11/finance/quoteSummary/${s}?modules=${modules.join(',')}`;
    try {
        const res = await proxyFetch(url);
        if (res.error) {
            if (res.errorCode === 404 || res.errorCode === 422) quoteSummary404.add(cacheKey);
            return null;
        }
        return res.data?.quoteSummary?.result?.[0];
    } catch (e) {
        console.error(`QuoteSummary failed for ${symbol}:`, e);
        return null;
    }
}

