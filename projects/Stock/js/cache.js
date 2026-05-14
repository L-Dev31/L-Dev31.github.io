import { Store } from './store.js';

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
export async function cacheGet(key) {
    try {
        const entry = await Store.get(PREFIX + key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            // We don't necessarily need to delete it immediately, 
            // Store.set will overwrite it later, but good for hygiene.
            return null; 
        }
        return entry.data;
    } catch { return null; }
}

// WRITE
export async function cacheSet(key, data, ttlMs) {
    try {
        await Store.set(PREFIX + key, {
            data,
            expires: Date.now() + ttlMs
        });
    } catch (e) {
        console.warn('[Cache] Set failed:', e);
    }
}

// KEY BUILDERS
export function ohlcKey(symbol, period) { return `ohlc_${symbol}_${period}`; }
export function newsKey(symbol) { return `news_${symbol}`; }
export function fundamentalsKey(symbol, module) { return `fund_${symbol}_${module}`; }
