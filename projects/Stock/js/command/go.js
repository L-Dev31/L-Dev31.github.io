import { resolveTickerDetails } from '../ticker-catalog.js';

function normalizeSymbol(rawSymbol) {
    return (rawSymbol || '').trim().toUpperCase();
}

function syncPeriodButtons(symbol, period) {
    const group = document.getElementById(`periods-${symbol}`);
    if (!group) return;
    group.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
    group.querySelector(`.period-btn[data-period="${period}"]`)?.classList.add('active');
}

export async function goToTicker(options = {}) {
    const symbol = normalizeSymbol(options.symbol);
    if (!symbol) return { ok: false, reason: 'invalid-symbol' };
    if (typeof window.openCustomSymbol !== 'function') return { ok: false, reason: 'no-create-strategy' };

    const period = (options.period || '1D').toUpperCase();

    if (window.positions?.[symbol]) {
        window.positions[symbol].currentPeriod = period;
        syncPeriodButtons(symbol, period);
        await window.openCustomSymbol(symbol);
        return { ok: true, symbol };
    }

    const resolved = await resolveTickerDetails(symbol, options.itemData || options, {
        lookup: !options.itemData
    });
    resolved.period = period;

    await window.openCustomSymbol(symbol, resolved.type, resolved);
    syncPeriodButtons(symbol, period);
    return { ok: true, symbol };
}

export async function runGoCommand({ parts, out, fmtErr }) {
    const raw = (parts[1] || '').toUpperCase();
    const period = (parts[2] || '1D').toUpperCase();

    if (!raw) {
        out('Usage: GO <SYMBOL> [PERIOD]');
        return;
    }

    try {
        const result = await goToTicker({ symbol: raw, period });
        if (result?.ok) out(`Ouvert: ${result.symbol || raw} ${period}`);
        else out(`Non trouvé: ${raw}`);
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}
