import { runQuant } from '../quant-client.js';
import { fetchCloses } from './quant-shared.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable } from './market-data-shared.js';

export async function runMcCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) { out('Usage: MC <SYMBOL> [DAYS=252] [PATHS=1000]'); return; }
    const days = Math.max(5, Math.min(2520, parseInt(parts[2], 10) || 252));
    const paths = Math.max(100, Math.min(10000, parseInt(parts[3], 10) || 1000));

    out(`Monte Carlo ${target.ticker} — ${days}d × ${paths} paths...`);

    try {
        const closes = await fetchCloses(target.ticker, '2y', '1d');
        if (closes.length < 60) { out('Not enough history (need 60+ daily closes).'); return; }

        const res = await runQuant('monteCarlo', closes, days, paths);
        if (!res) { out('Simulation failed.'); return; }

        const ret = v => ((v - res.S0) / res.S0) * 100;
        const rows = [
            ['Ticker', esc(target.ticker)],
            ['Spot', formatNumber(res.S0)],
            ['Horizon', `${days} trading days`],
            ['Paths', String(paths)],
            ['P05 final', `${formatNumber(res.finalP5)} (${formatPercent(ret(res.finalP5))})`],
            ['P50 final', `${formatNumber(res.finalP50)} (${formatPercent(ret(res.finalP50))})`],
            ['P95 final', `${formatNumber(res.finalP95)} (${formatPercent(ret(res.finalP95))})`],
            ['Expected return', formatPercent(res.expectedReturn * 100)]
        ];
        out(panel(keyValueTable(rows, 'METRIC', 'VALUE')), 'terminal-log', true);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}
