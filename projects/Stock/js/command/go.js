import { resolveTickerDetails } from '../ticker-catalog.js';

export async function goToTicker(options = {}) {
    const symbol = (options.symbol || '').trim().toUpperCase();
    if (!symbol) return { ok: false, reason: 'invalid-symbol' };
    if (typeof window.openCustomSymbol !== 'function') return { ok: false, reason: 'no-create-strategy' };

    const period = (options.period || '1D').toUpperCase();
    const existing = window.positions?.[symbol];

    if (existing) {
        existing.currentPeriod = period;
        await window.openCustomSymbol(symbol, existing.type || 'equity', options.itemData);
    } else {
        const resolved = await resolveTickerDetails(symbol, options.itemData || {}, { lookup: !options.itemData });
        resolved.period = period;
        await window.openCustomSymbol(symbol, resolved.type, resolved);
    }

    const group = document.getElementById(`periods-${symbol}`);
    if (group) {
        group.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
        group.querySelector(`.period-btn[data-period="${period}"]`)?.classList.add('active');
    }

    return { ok: true, symbol };
}

export async function runGoCommand({ parts, out, fmtErr }) {
    const symbol = (parts[1] || '').toUpperCase();
    const period = (parts[2] || '1D').toUpperCase();

    if (!symbol) {
        out('Usage: GO <SYMBOL> [PERIOD]');
        return;
    }

    try {
        const result = await goToTicker({ symbol, period });
        out(result?.ok ? `Opened: ${result.symbol} ${period}` : `Not found: ${symbol}`);
    } catch (error) {
        out(`Error: ${fmtErr(error)}`);
    }
}
