import { resolveTickerDetails } from '../../data/ticker-catalog.js';

export async function goToTicker(options = {}) {
    const symbol = (options.symbol || '').trim().toUpperCase();
    if (!symbol) return { ok: false, reason: 'invalid-symbol' };
    if (typeof window.openCustomSymbol !== 'function') return { ok: false, reason: 'no-create-strategy' };

    const period = (options.period || '1W').toUpperCase();
    const existing = window.positions?.[symbol];

    if (existing) {
        existing.currentPeriod = period;
        await window.openCustomSymbol(symbol, existing.type || 'equity', options.itemData);
    } else {
        const resolved = await resolveTickerDetails(symbol, options.itemData || {}, { lookup: !options.itemData });
        // Unknown to the catalog and to Yahoo: never create a blank ticker page for it.
        if (!options.itemData && !resolved.record && !resolved.quote) return { ok: false, reason: 'not-found' };
        resolved.period = period;
        await window.openCustomSymbol(symbol, resolved.type, resolved);
    }

    const group = document.getElementById(`periods-${symbol}`);
    if (group) {
        const sel = group.querySelector('.period-select');
        if (sel) sel.value = period;
    }

    return { ok: true, symbol };
}

export async function runGoCommand({ parts, out, fmtErr }) {
    const symbol = (parts[1] || '').toUpperCase();
    const period = (parts[2] || '1W').toUpperCase();

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
