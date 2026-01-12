import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints } from '../utils.js';

const PROXY = 'https://corsproxy.io/?';
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

async function yahooFetch(url, signal) {
    const r = await fetch(`${PROXY}${url}`, { 
        signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com/'
        }
    });
    if (r.status === 429) {
        globalRateLimiter.setRateLimitForApi('yahoo', 60000);
        return { error: true, errorCode: 429, throttled: true };
    }
    if (!r.ok) return { error: true, errorCode: r.status };
    return r.json();
}

export async function fetchFromYahoo(ticker, period, symbol, stock, name, signal) {
    const yahooSymbol = getYahooSymbol(stock) || ticker;
    return globalRateLimiter.executeIfNotLimited(async () => {
        try {
            const cfg = PERIODS[period] || PERIODS['1D'];
            const j = await yahooFetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${cfg.interval}&range=${cfg.range}`, signal);
            if (j.error) return { source: 'yahoo', ...j };
            
            const res = j.chart?.result?.[0];
            const q = res?.indicators?.quote?.[0];
            if (!res || !q || !res.timestamp?.length || !q.close?.length) {
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
    try {
        const p1 = Math.floor(new Date(from || '2000-01-01').getTime() / 1000);
        const p2 = Math.floor(new Date(to || new Date().toISOString().slice(0, 10)).getTime() / 1000);
        const r = await fetch(`${PROXY}?https://query2.finance.yahoo.com/v7/finance/download/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div`, { 
            signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://finance.yahoo.com',
                'Referer': 'https://finance.yahoo.com/'
            }
        });
        if (!r.ok) return { error: true, errorCode: r.status };
        const text = await r.text();
        const items = text.trim().split('\n').slice(1).map(l => {
            const [date, div] = l.split(',');
            return { date, dividend: parseFloat(div) };
        });
        return { source: 'yahoo', dividends: items };
    } catch (e) { return { source: 'yahoo', error: true, errorCode: 500 }; }
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
