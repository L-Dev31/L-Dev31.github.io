// What the user holds right now, as plain rows: used by the assistant and the coach.
// A stock is priced in its own currency and its trades keep the currency they were paid in;
// totals are in the user's currency, at the ECB rate of the day.
import { positions, currencyCode } from '../core/state.js';
import { convert } from './rates.js';

export const round = (x, d = 2) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;

const FUND_WORDS = /\b(ETF|UCITS|ETC|ETN|fonds|fund|index|indice|tracker|MSCI|S&P|STOXX|Monde|World|SICAV|FCP)\b/i;
export const kindOf = p => (p.type === 'crypto' ? 'crypto' : FUND_WORDS.test(`${p.name || ''} ${p.raw?.name || ''}`) ? 'fund' : 'stock');

/** The currency a position's price is quoted in. */
export const priceCurrency = p => p?.currency || p?.raw?.currency || p?.lastData?.currency || 'USD';
/** The currency its trades were paid in (trades saved before currencies were recorded were in euros). */
export const paidCurrency = p => p?.costCurrency || 'EUR';

/** What a position is worth now and what it cost, in the user's currency (or another one). */
export function positionMoney(p, to = currencyCode()) {
    const cost = convert(p.costBasis || 0, paidCurrency(p), to);
    const value = p.lastData?.price ? convert(p.lastData.price * p.shares, priceCurrency(p), to) : cost;
    return { value, cost };
}

/** Every line with shares, biggest first. Value, cost and gain in the user's currency; price and average cost in their own. */
export function holdingRows() {
    const rows = [];
    let total = 0;
    for (const [sym, p] of Object.entries(positions)) {
        if (!(p?.shares > 0)) continue;
        const { value, cost } = positionMoney(p);
        total += value;
        rows.push({ symbol: sym, name: p.name, ticker: p.ticker, kind: kindOf(p), shares: p.shares, avg_cost: round(p.costBasis / p.shares), cost_currency: paidCurrency(p), price: round(p.lastData?.price || null), currency: priceCurrency(p), value: round(value), cost: round(cost), pl: round(value - cost), pl_pct: round(cost ? (value / cost - 1) * 100 : 0, 1), change_pct: round(p.lastData?.changePercent, 2), country: p.raw?.country || p.country || '', first_buy: p.purchaseDate || null });
    }
    for (const r of rows) r.weight_pct = total ? round(r.value / total * 100, 1) : null;
    rows.sort((a, b) => b.value - a.value);
    return { rows, total };
}
