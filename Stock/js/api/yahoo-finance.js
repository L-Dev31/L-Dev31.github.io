import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../utils.js';

const PROXIES = [        
    'https://corsproxy.io/?',                            
    'https://api.allorigins.win/raw?url=',          
    'https://proxy.cors.sh/',           
    'https://api.codetabs.com/v1/proxy?quest=',           
    'https://thingproxy.freeboard.io/fetch/',     
];
let currentProxyIndex = 0;

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
    let lastError = null;

    for (let i = 0; i < PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % PROXIES.length;
        const proxy = PROXIES[proxyIndex];
        const finalUrl = `${proxy}${targetUrl}`;

        try {
            const r = await fetch(finalUrl, { signal });

            if (r.status === 429) {
                globalRateLimiter.setRateLimitForApi('yahoo', 60000);
                lastError = { error: true, errorCode: 429, throttled: true, proxy: proxy };
                continue; // Try next proxy
            }

            if (!r.ok) {
                lastError = { error: true, errorCode: r.status, proxy: proxy };
                continue; // Try next proxy
            }

            currentProxyIndex = proxyIndex;

            const text = await r.text();
            try {
                return JSON.parse(text);
            } catch (jsonError) {
                lastError = { error: true, errorCode: 'INVALID_JSON', proxy: proxy };
                continue;
            }
        } catch (networkError) {
            lastError = { error: true, errorCode: 500, message: networkError.message, proxy: proxy };
        }
    }
    return lastError || { error: true, errorCode: 'ALL_PROXIES_FAILED' };
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

            const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(res.timestamp, q.open, q.high, q.low, q.close);
            
            if (!timestamps.length) return { source: 'yahoo', error: true, errorCode: 'NO_VALID_DATA' };

            const data = {
                source: 'yahoo', timestamps, prices: closes, opens, highs, lows, closes,
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
        
        const validCloses = closes.filter(c => c !== null && c !== undefined);
        const hasNoData = validCloses.length === 0;
        
        const tradeable = meta.tradeable !== false;
        const regularMarketTime = meta.regularMarketTime || 0;
        const now = Math.floor(Date.now() / 1000);
        const daysSinceLastTrade = regularMarketTime > 0 ? (now - regularMarketTime) / (60 * 60 * 24) : 999;
        
        let totalVolume = 0;
        for (const v of volumes) if (v) totalVolume += v;
        const volume = meta.regularMarketVolume || totalVolume;
        
        const price = meta.regularMarketPrice || 0;
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
        const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        
        const hasNoVolume = volume === 0;
        const hasNoChange = Math.abs(changePercent) < 0.001;
        const noActivity = hasNoVolume && hasNoChange;
        
        if (!tradeable) return true;
        if (hasNoData) return true;
        if (noActivity && daysSinceLastTrade > 3) return true;
        if (daysSinceLastTrade > 7) return true;

        return false;
    } catch (e) {
        return false;
    }
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
    
    let lastError = null;
    
    for (let i = 0; i < PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % PROXIES.length;
        const proxy = PROXIES[proxyIndex];
        
        try {
            const r = await fetch(`${proxy}${targetUrl}`, { signal });
            if (!r.ok) {
                lastError = { error: true, errorCode: r.status };
                continue;
            }
            
            currentProxyIndex = proxyIndex;
            
            const text = await r.text();
            if (text.startsWith('<')) {
                lastError = { source: 'yahoo', error: true, errorCode: 'PROXY_HTML' };
                continue;
            }

            const items = text.trim().split('\n').slice(1).map(l => {
                const [date, div] = l.split(',');
                return { date, dividend: parseFloat(div) };
            });
            return { source: 'yahoo', dividends: items };
        } catch(e) {
            lastError = { source: 'yahoo', error: true, errorCode: 500 };
        }
    }
    
    return lastError || { source: 'yahoo', error: true, errorCode: 'ALL_PROXIES_FAILED' };
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
