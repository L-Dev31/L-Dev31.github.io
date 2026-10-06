// The user's bank or broker (Settings › Profile) and what its public fees mean in money.
// Data: json/banks.json. Fee rules there: flat, pct, min/max, upTo tiers, or "at" examples.
import { getUserSettings, saveUserSettings } from '../core/state.js';
import { LOGO_DEV_KEY } from './ticker-catalog.js';
import { LOCALE } from '../i18n/i18n.js';

let catalog = { asOf: '', banks: [] };
export const banksReady = fetch('json/banks.json')
    .then(r => r.json())
    .then(data => { catalog = data; })
    .catch(() => {});

export const allBanks = () => catalog.banks;
export function formatMoney(n, currency = 'EUR') {
    const digits = Number.isInteger(n) ? 0 : 2;
    try { return n.toLocaleString(LOCALE, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch { return `${n} ${currency}`; }
}
export const banksAsOf = () => {
    const [year, month] = String(catalog.asOf).split('-').map(Number);
    return year && month ? new Date(year, month - 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : catalog.asOf;
};
export const bankLogo = domain => `https://img.logo.dev/${domain}?token=${LOGO_DEV_KEY}&size=64&format=png&retina=true`;

/** The chosen bank: one from the list, the fees the user typed in, or null. */
export function currentBank() {
    const choice = getUserSettings().bank;
    if (!choice) return null;
    if (choice.custom) return choice.custom;
    return catalog.banks.find(b => b.id === choice.id) || null;
}

export const chooseBank = id => saveUserSettings({ bank: id ? { id } : null });
export const saveCustomBank = custom => saveUserSettings({ bank: { custom: { id: 'custom', kind: 'custom', ...custom } } });

/** Fee for one order, in the bank's currency, or null when the bank does not publish it. market: 'home' or 'us'. */
export function orderFee(bank, amount, market = 'home') {
    const rule = bank?.orders?.[market];
    if (!rule || !(amount > 0)) return null;
    let fee;
    if (rule.upTo) {
        const tier = rule.upTo.find(([limit]) => amount <= limit);
        fee = tier ? tier[1] : amount * (rule.pct || 0) / 100;
    } else if (rule.at) {
        fee = fromExamples(rule.at, amount);
    } else {
        fee = (rule.flat || 0) + amount * (rule.pct || 0) / 100;
    }
    if (rule.min != null) fee = Math.max(fee, rule.min);
    if (rule.max != null) fee = Math.min(fee, rule.max);
    return Math.round(fee * 100) / 100;
}

/** True when the fee comes from published examples rather than an exact rule. */
export const isEstimate = (bank, market = 'home') => !!bank?.orders?.[market]?.at;

// Straight line between two published examples; below the first, its fee (banks have minimums);
// above the last, the same rate as the last.
function fromExamples(at, amount) {
    const points = Object.entries(at).map(([a, fee]) => [Number(a), fee]).sort((x, y) => x[0] - y[0]);
    const [firstAmount, firstFee] = points[0];
    const [lastAmount, lastFee] = points[points.length - 1];
    if (amount <= firstAmount) return firstFee;
    if (amount >= lastAmount) return lastFee * amount / lastAmount;
    const i = points.findIndex(([a]) => a >= amount);
    const [a0, f0] = points[i - 1], [a1, f1] = points[i];
    return f0 + (f1 - f0) * (amount - a0) / (a1 - a0);
}

/** Yearly custody fee for a portfolio, or null when unknown. */
export function custodyPerYear(bank, value, lines = 1) {
    const c = bank?.custody;
    if (!c || c.pct == null) return null;
    return Math.round((value * c.pct / 100 + (c.perLine || 0) * lines) * 100) / 100;
}

/** Order market for an instrument: US-listed ones use the bank's US price. */
export const marketFor = instrumentCurrency => (instrumentCurrency === 'USD' ? 'us' : 'home');

/**
 * Everything one investment costs at the user's bank: buying, selling at the end, currency conversion both ways
 * and custody over the years held. Amounts in the bank's currency. Null parts are unknown.
 */
export function investmentCosts(bank, { amount, endValue = amount, years = 1, market = 'home', foreignCurrency = market === 'us' }) {
    const buy = orderFee(bank, amount, market);
    const sell = orderFee(bank, endValue, market);
    const fx = foreignCurrency && bank?.fx != null ? (amount + endValue) * bank.fx / 100 : null;
    const custody = bank?.custody?.pct != null ? ((amount + endValue) / 2) * bank.custody.pct / 100 * years : null;
    const parts = [buy, sell, fx, custody].filter(x => x != null);
    return {
        buy, sell, fx, custody,
        total: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 : null,
        estimate: isEstimate(bank, market),
        currency: bank?.currency || null,
    };
}

const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The bank in plain sentences for AI prompts. Empty when none is chosen. */
export function bankContext(bank = currentBank()) {
    if (!bank) return '';
    const cur = bank.currency || '';
    const fee = (amount, market) => {
        const f = orderFee(bank, amount, market);
        return f == null ? null : `${fmt(amount)} ${cur} order → ${isEstimate(bank, market) ? 'about ' : ''}${fmt(f)} ${cur}`;
    };
    const home = [500, 1000, 5000].map(a => fee(a, 'home')).filter(Boolean);
    const us = [1000, 5000].map(a => fee(a, 'us')).filter(Boolean);
    const lines = [`The user invests through ${bank.name}${bank.country ? ` (${bank.country})` : ''}.`];
    if (bank.accounts?.length) lines.push(`Accounts it offers: ${bank.accounts.join(', ')}.`);
    lines.push(home.length ? `Order fees on its home market: ${home.join('; ')}.` : 'Its order fees on the home market are unknown.');
    if (us.length) lines.push(`Order fees on US stocks: ${us.join('; ')}.`);
    if (bank.fx != null) lines.push(`Currency conversion: ${bank.fx} % of the amount converted.`);
    if (bank.custody?.text) lines.push(`Custody: ${bank.custody.text}.`);
    if (bank.note) lines.push(bank.note);
    lines.push(bank.kind === 'custom'
        ? 'These fees were typed in by the user.'
        : `Fees from its public price list (${catalog.asOf}); they can change, so mention that when exact amounts matter.`);
    return lines.join(' ');
}
