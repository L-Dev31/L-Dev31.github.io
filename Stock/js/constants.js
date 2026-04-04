// Shared constants & micro-utilities used across multiple modules.

export const TYPE_ORDER = ['equity', 'commodity', 'crypto'];

export const TYPE_LABELS = {
    equity: 'Actions',
    commodity: 'Matières Premières',
    crypto: 'Cryptos'
};

export const TYPE_ICONS = {
    equity: 'fa-solid fa-building-columns',
    commodity: 'fa-solid fa-coins',
    crypto: 'fa-brands fa-bitcoin'
};

export const DEAD_ERROR_CODES = [404, 'NO_DATA', 'NO_VALID_DATA'];

export const hasTransactions = stock =>
    (stock.purchases?.length > 0) || (stock.sales?.length > 0);

export function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

export function typeLabel(type) {
    return TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

export function typeIcon(type) {
    return TYPE_ICONS[type] || 'fa-solid fa-layer-group';
}

export function periodToDays(period) {
    switch ((period || '').toUpperCase()) {
        case '1D': return 1;
        case '1W': return 7;
        case '1M': return 30;
        case '3M': return 90;
        case '6M': return 180;
        case '1Y': return 365;
        case '3Y': return 1095;
        case '5Y': return 1825;
        case 'MAX': return 36500;
        default: return 7;
    }
}
