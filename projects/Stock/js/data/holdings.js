// What the user holds right now, as plain rows: used by the assistant and the coach.
import { positions } from '../core/state.js';

export const round = (x, d = 2) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;

const FUND_WORDS = /\b(ETF|UCITS|ETC|ETN|fonds|fund|index|indice|tracker|MSCI|S&P|STOXX|Monde|World|SICAV|FCP)\b/i;
export const kindOf = p => (p.type === 'crypto' ? 'crypto' : FUND_WORDS.test(`${p.name || ''} ${p.raw?.name || ''}`) ? 'fund' : 'stock');

/** Every line with shares, biggest first. Values use the last loaded price, in the instrument's own currency. */
export function holdingRows() {
    const rows = [];
    let total = 0;
    for (const [sym, p] of Object.entries(positions)) {
        if (!(p?.shares > 0)) continue;
        const price = p.lastData?.price || (p.costBasis && p.shares ? p.costBasis / p.shares : 0);
        const value = price * p.shares;
        total += value;
        rows.push({ symbol: sym, name: p.name, ticker: p.ticker, kind: kindOf(p), shares: p.shares, avg_cost: round(p.costBasis / p.shares), price: round(price), value: round(value), cost: round(p.costBasis), pl: round(value - p.costBasis), pl_pct: round(p.costBasis ? (value / p.costBasis - 1) * 100 : 0, 1), change_pct: round(p.lastData?.changePercent, 2), currency: p.raw?.currency || '', country: p.raw?.country || p.country || '', first_buy: p.purchaseDate || null });
    }
    for (const r of rows) r.weight_pct = total ? round(r.value / total * 100, 1) : null;
    rows.sort((a, b) => b.value - a.value);
    return { rows, total };
}
