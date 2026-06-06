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
const currencyFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

export const formatCurrency = (val, currency = '$') => {
    return (val >= 0 ? '' : '-') + currency + currencyFormatter.format(Math.abs(val));
};

/**
 * Formats percentage.
 */
export const formatPct = (val) => {
    if (val === 0) return '0.00%';
    const arrow = val > 0 ? '▲ ' : '▼ ';
    return arrow + (val > 0 ? '+' : '') + val.toFixed(2) + '%';
};

