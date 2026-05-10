/**
 * Nemeris Utils - Performance-critical helpers and DOM caching.
 */

const domCache = new Map();

export const getEl = (id) => {
    if (domCache.has(id)) return domCache.get(id);
    const el = document.getElementById(id);
    if (el) domCache.set(id, el);
    return el;
};

/**
 * Formats a number with currency symbol.
 * @param {number} val 
 * @param {string} currency 
 * @returns {string}
 */
export const formatCurrency = (val, currency = '$') => {
    return (val >= 0 ? '' : '-') + currency + Math.abs(val).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/**
 * Formats percentage.
 */
export const formatPct = (val) => {
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
};
