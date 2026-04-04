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

    // Fast path: symbol already exists in runtime positions.
    if (window.positions?.[symbol]) {
        applyPeriodToSymbol(symbol, period);
        return activateTabAndRefresh(symbol);
    }

    // Preferred path for explorer-driven symbols: create rich dynamic card/tab.
    if (window.explorerModule?.openOrCreateTicker) {
        const created = await window.explorerModule.openOrCreateTicker(symbol, itemData);
        if (created?.ok && created.symbol) {
            applyPeriodToSymbol(created.symbol, period);
            return activateTabAndRefresh(created.symbol);
        }
    }

    // Fallback path: create a minimal custom symbol card/tab.
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
