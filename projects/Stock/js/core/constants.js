import { L } from '../i18n/i18n.js';
export const TYPE_ORDER = ['equity', 'commodity', 'crypto'];

const TYPE_LABELS = { equity: L('Stocks'), commodity: L('Commodities'), crypto: 'Crypto' };

export const DEAD_ERROR_CODES = [404, 'NO_DATA', 'NO_VALID_DATA', 'PARSE_ERROR'];

export const hasTransactions = stock => stock.purchases?.length > 0 || stock.sales?.length > 0;

export const typeLabel = type => TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);

const PERIOD_DAYS = { '1H': 1, '4H': 1, '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 36500 };
export const periodToDays = period => PERIOD_DAYS[(period || '').toUpperCase()] || 7;

export function debounce(fn, delay) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
