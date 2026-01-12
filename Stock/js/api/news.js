import { fetchYahooNews } from './yahoo-finance.js';

export async function fetchNewsFinnhub(symbol, apiKey, limit = 5, days = 7) {
    if (!apiKey) return { error: true, items: [] };
    try {
        const to = new Date();
        const from = new Date(Date.now() - days * 86400000);
        const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}&token=${apiKey}`);
        if (!r.ok) return { error: true, items: [] };
        const j = await r.json();
        return {
            source: 'finnhub',
            items: (j || []).slice(0, limit).map(i => ({
                id: i.id || (i.url + i.datetime),
                title: i.headline || i.summary || '',
                url: i.url,
                source: i.source || 'finnhub',
                publishedAt: i.datetime ? new Date(i.datetime * 1000).toISOString() : new Date().toISOString(),
                summary: i.summary || ''
            }))
        };
    } catch (e) { return { error: true, items: [] }; }
}

export async function fetchNews(symbol, config, limit = 8, days = 7, apiName = null) {
    if (!config) return { error: true, items: [] };
    const api = apiName || config.ui?.defaultApi || 'finnhub';

    if (api === 'finnhub' && config.apis?.finnhub?.enabled) {
        return fetchNewsFinnhub(symbol, config.apis.finnhub.apiKey, limit, days);
    }

    if (api === 'yahoo' && config.apis?.yahoo?.enabled) {
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

    return { source: 'none', items: [] };
}
