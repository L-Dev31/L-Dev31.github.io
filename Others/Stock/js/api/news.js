// Simple news API wrappers for the demo POC

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

export async function fetchNews(symbol, config) {
    // config should contain mapping of providers + apiKeys. Keep it minimal for now.
    if (!config) return { error: true, items: [] };
    if (config.apis && config.apis.finnhub && config.apis.finnhub.enabled) {
        return fetchNewsFinnhub(symbol, config.apis.finnhub.apiKey, 8, 7);
    }
    // Fallback: return empty
    return { source: 'none', items: [] };
}
