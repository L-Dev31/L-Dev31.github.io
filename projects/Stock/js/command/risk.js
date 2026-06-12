import { runQuant } from '../quant-client.js';
import { fetchCloses } from './quant-shared.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable } from './market-data-shared.js';

export async function runRiskCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) { out('Usage: RISK <SYMBOL> [RANGE]'); return; }
    const range = (parts[2] || '1y').toLowerCase();

    out(`Risk profile ${target.ticker} (${range})...`);

    try {
        const closes = await fetchCloses(target.ticker, range, '1d');
        if (closes.length < 30) { out('Not enough data (need 30+ daily closes).'); return; }

        const [annVol, sharpe, sortino, maxDD, var95, cvar95, outlierP] = await Promise.all([
            runQuant('annualizedVolatility', closes),
            runQuant('calculateSharpeRatio', closes),
            runQuant('calculateSortinoRatio', closes),
            runQuant('calculateMaxDrawdown', closes),
            runQuant('calculateVaR', closes, 0.95),
            runQuant('calculateCVaR', closes, 0.95),
            runQuant('priceOutlierPValue', closes, 60)
        ]);
        const dailyVol = annVol / Math.sqrt(252);

        // Colour-code the outlier p-value: green = normal, orange = notable, red = extreme.
        const outlierLabel = outlierP < 0.01
            ? `<span class="terminal-neg">${formatNumber(outlierP, 4)} ★ extreme</span>`
            : outlierP < 0.05
                ? `<span class="terminal-warning">${formatNumber(outlierP, 4)} notable</span>`
                : `<span class="terminal-muted">${formatNumber(outlierP, 4)} normal</span>`;

        const rows = [
            ['Ticker', esc(target.ticker)],
            ['Samples', String(closes.length)],
            ['Daily volatility', formatPercent(dailyVol * 100)],
            ['Annualized volatility', formatPercent(annVol * 100)],
            ['Sharpe (rf=4%)', formatNumber(sharpe, 3)],
            ['Sortino', formatNumber(sortino, 3)],
            ['Max drawdown', formatPercent(maxDD)],
            ['VaR 95% (1d)', formatPercent(var95)],
            ['CVaR 95% (1d)', formatPercent(cvar95)],
            ['Last move p-value', outlierLabel]
        ];
        out(panel(keyValueTable(rows, 'METRIC', 'VALUE')), 'terminal-log', true);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}

