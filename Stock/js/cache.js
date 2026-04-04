// CACHE KEYS
const PREFIX = 'nemeris_cache_';

// TTL CONSTANTS (ms)
export const TTL = {
    OHLC_INTRA:   5  * 60 * 1000,
    OHLC_DAILY:   60 * 60 * 1000,
    NEWS:         30 * 60 * 1000,
    FUNDAMENTALS: 6  * 60 * 60 * 1000,
};

// READ
export function cacheGet(key) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (!raw) return null;
        const { data, expires } = JSON.parse(raw);
        if (Date.now() > expires) { localStorage.removeItem(PREFIX + key); return null; }
        return data;
    } catch { return null; }
}

// WRITE
export function cacheSet(key, data, ttlMs) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ data, expires: Date.now() + ttlMs }));
    } catch {
        evictOldest();
        try { localStorage.setItem(PREFIX + key, JSON.stringify({ data, expires: Date.now() + ttlMs })); } catch { /* ignore */ }
    }
}

// CLEAR
export function cacheClear() {
    try {
        Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
}

// EVICTION
function evictOldest() {
    try {
        const entries = Object.keys(localStorage)
            .filter(k => k.startsWith(PREFIX))
            .map(k => { try { return { key: k, expires: JSON.parse(localStorage.getItem(k)).expires }; } catch { return { key: k, expires: 0 }; } })
            .sort((a, b) => a.expires - b.expires);
        entries.slice(0, Math.ceil(entries.length / 3)).forEach(e => localStorage.removeItem(e.key));
    } catch { /* ignore */ }
}

// KEY BUILDERS
export function ohlcKey(symbol, period) { return `ohlc_${symbol}_${period}`; }
export function newsKey(symbol) { return `news_${symbol}`; }
export function fundamentalsKey(symbol, module) { return `fund_${symbol}_${module}`; }
