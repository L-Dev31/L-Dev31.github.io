/**
 * Nemeris Utils - Performance-critical helpers and DOM caching.
 */

// DOM Cache to prevent repetitive getElementById/querySelector calls.
const domCache = new Map();

/**
 * Fast element getter with caching.
 * @param {string} id - The element ID.
 * @returns {HTMLElement|null}
 */
export const getEl = (id) => {
    if (domCache.has(id)) return domCache.get(id);
    const el = document.getElementById(id);
    if (el) domCache.set(id, el);
    return el;
};

/**
 * Clear the DOM cache (useful when large parts of the UI are rebuilt).
 */
export const clearDomCache = () => domCache.clear();

/**
 * Simple throttle to prevent high-frequency execution.
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The time limit in ms.
 */
export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
};

/**
 * Debounce utility.
 */
export const debounce = (func, wait) => {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
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
