import { resolveTickerDetails } from '../ticker-catalog.js';

function normalizeSymbol(rawSymbol) {
    return (rawSymbol || '').trim().toUpperCase();
}

function applyPeriodToSymbol(symbol, period) {
    if (!symbol || !window.positions?.[symbol]) return;

    const resolvedPeriod = (period || '1D').toUpperCase();
    window.positions[symbol].currentPeriod = resolvedPeriod;

    const periodsGroup = document.getElementById(`periods-${symbol}`);
    if (periodsGroup) {
        periodsGroup.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
        periodsGroup.querySelector(`.period-btn[data-period="${resolvedPeriod}"]`)?.classList.add('active');
    }
}

function activateTabAndRefresh(symbol) {
    if (!symbol) return { ok: false, reason: 'missing-symbol' };

    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab) return { ok: false, reason: 'tab-not-found' };

    tab.click();
    window.fetchActiveSymbol?.(true);
    return { ok: true, symbol };
}

export async function goToTicker(options = {}) {
    const symbol = normalizeSymbol(options.symbol);
    const period = (options.period || '1D').toUpperCase();
    const itemData = options.itemData || null;

    if (!symbol) return { ok: false, reason: 'invalid-symbol' };

    if (window.positions?.[symbol]) {
        applyPeriodToSymbol(symbol, period);
        return activateTabAndRefresh(symbol);
    }

    if (window.explorerModule?.openOrCreateTicker) {
        const created = await window.explorerModule.openOrCreateTicker(symbol, itemData);
        if (created?.ok && created.symbol) {
            applyPeriodToSymbol(created.symbol, period);
            return activateTabAndRefresh(created.symbol);
        }
    }

    if (window.openCustomSymbol) {
        const resolved = itemData || await resolveTickerDetails(symbol, {
            quoteType: options.quoteType,
            currency: options.currency,
            name: options.name,
            ticker: options.ticker
        });
        await window.openCustomSymbol(symbol, resolved?.type || 'equity', resolved);
        applyPeriodToSymbol(symbol, period);
        return activateTabAndRefresh(symbol);
    }

    return { ok: false, reason: 'no-create-strategy' };
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