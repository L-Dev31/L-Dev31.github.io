// PROXY CONFIG
const PROXY_STORAGE_KEY = 'nemeris_proxy_url';
const DEFAULT_WORKER_URL = 'https://nemeris.leotoskuepro.workers.dev';

function getProxyBaseUrl() {
    try {
        const saved = localStorage.getItem(PROXY_STORAGE_KEY)?.trim();
        if (saved) return saved;
    } catch (e) {
        // localStorage may be unavailable in some contexts; fallback to default.
    }
    return DEFAULT_WORKER_URL;
}

function buildProxiedUrl(targetUrl) {
    const baseUrl = getProxyBaseUrl();

    if (!baseUrl) throw new Error('PROXY_NOT_CONFIGURED');

    // Support advanced worker patterns like: https://worker.dev/?target={url}
    if (baseUrl.includes('{url}')) {
        return baseUrl.replace('{url}', encodeURIComponent(targetUrl));
    }

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
}

// FETCH
export async function proxyFetch(targetUrl, opts = {}) {
    const { signal, fetchOptions = {}, expect = 'json' } = opts;

    const proxied = buildProxiedUrl(targetUrl);
    const mergedOptions = { ...fetchOptions, cache: 'no-store' };
    if (signal) mergedOptions.signal = signal;

    const r = await fetch(proxied, mergedOptions);

    if (r.status === 429) throw new Error('HTTP_429');
    if (r.status === 403) throw new Error('HTTP_403');
    if (!r.ok) throw new Error(`HTTP_${r.status}`);

    const text = await r.text();
    return expect === 'text' ? text : JSON.parse(text);
}

export async function proxyFetchSafe(targetUrl, signal) {
    try {
        return await proxyFetch(targetUrl, { signal, expect: 'json' });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        const match = e.message?.match(/HTTP_(\d+)/);
        const code = match ? parseInt(match[1]) : 500;
        return { error: true, errorCode: code || 'FETCH_FAILED', throttled: code === 429, message: e.message };
    }
}
