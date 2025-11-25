// Simple news API wrappers for the demo POC
import { fetchYahooNews } from './yahoo-finance.js';

export async function fetchNewsFinnhub(symbol, apiKey, limit = 5, days = 7) {
    if (!apiKey) return { error: true, errorMessage: 'Missing API key', items: [] };
    try {
        const to = new Date();
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const fromStr = from.toISOString().slice(0,10);
        const toStr = to.toISOString().slice(0,10);
        const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${apiKey}`;
        const r = await fetch(url);
        if (!r.ok) return { error: true, errorMessage: `HTTP ${r.status}`, items: [] };
        const j = await r.json();
        // Convert to normalized shape used by updateNewsUI
        const items = (j || []).slice(0, limit).map(i => ({
            id: i.id || (i.url + i.datetime),
            title: i.headline || i.summary || i.title || '',
            url: i.url,
            source: i.source || 'finhub',
            publishedAt: i.datetime ? new Date(i.datetime * 1000).toISOString() : new Date().toISOString(),
            summary: i.summary || ''
        }));
        return { source: 'finnhub', items };
    } catch (err) {
        return { error: true, errorMessage: err.message, items: [] };
    }
}

export async function fetchNews(symbol, config, limit = 8, days = 7, apiName = null) {
    // config should contain mapping of providers + apiKeys. Keep it minimal for now.
    if (!config) return { error: true, items: [] };
    const apiToUse = apiName || (config.ui && config.ui.defaultApi) || 'finnhub';
    // Implemented providers: finnhub, yahoo
    if (apiToUse === 'finnhub' && config.apis && config.apis.finnhub && config.apis.finnhub.enabled) {
        return fetchNewsFinnhub(symbol, config.apis.finnhub.apiKey, limit, days);
    }
    if (apiToUse === 'yahoo' && config.apis && config.apis.yahoo && config.apis.yahoo.enabled) {
        // Yahoo's news endpoint doesn't accept days parameter; use limit only.
        try {
            const r = await fetchYahooNews(symbol, limit);
            // Normalize publisher -> source for UI compatibility
            if (r && Array.isArray(r.items)) {
                const mapped = r.items.map(i => ({
                    id: i.id,
                    title: i.title,
                    url: i.url,
                    source: i.publisher || i.source || 'yahoo',
                    publishedAt: (function(p){ try { if (!p) return new Date().toISOString(); const n = Number(p); const ts = n && n < 1e12 ? n * 1000 : n; const d = new Date(ts); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); } catch(e) { return new Date().toISOString(); } })(i.publishedAt),
                    summary: i.summary || ''
                }));
                // If days is specified, filter items to that timeframe
                if (days && Number(days) > 0) {
                    const cutoff = Date.now() - (Number(days) * 24 * 60 * 60 * 1000);
                    const filtered = mapped.filter(it => {
                        const t = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
                        return !isNaN(t) && t >= cutoff;
                    });
                    return { source: 'yahoo', items: filtered.slice(0, limit) };
                }
                return { source: 'yahoo', items: mapped };
            }
            return { source: 'yahoo', items: [] };
        } catch (err) {
            return { source: 'yahoo', error: true, errorMessage: err.message, items: [] };
        }
    }
    // Fallback: return empty
    return { source: 'none', items: [] };
}
