import { runQuant } from '../quant-client.js';
import { fetchCloses } from './quant-shared.js';
import { esc, formatNumber, panel, keyValueTable } from './market-data-shared.js';

// Default benchmark for the euro-focused context (EURO STOXX 50). Beta against a USD index for
// a euro-quoted stock blends market risk with EUR/USD risk; the user can still pass any benchmark
// as the 2nd argument (e.g. BETA AAPL ^GSPC for a US stock).
const DEFAULT_BENCHMARK = '^STOXX50E';

export async function runBetaCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) { out('Usage: BETA <SYMBOL> [BENCHMARK]'); return; }
    const benchmark = (parts[2] || DEFAULT_BENCHMARK).toUpperCase();

    out(`Beta ${target.ticker} vs ${benchmark}...`);

    try {
        const [asset, bench] = await Promise.all([
            fetchCloses(target.ticker, '1y', '1d'),
            fetchCloses(benchmark, '1y', '1d')
        ]);
        if (asset.length < 30 || bench.length < 30) {
            out('Not enough overlap (need 30+ daily closes for both).');
            return;
        }

        const [beta, corr] = await Promise.all([
            runQuant('calculateBeta', asset, bench),
            runQuant('calculateCorrelation', asset, bench)
        ]);

        const rows = [
            ['Asset', esc(target.ticker)],
            ['Benchmark', esc(benchmark)],
            ['Beta', formatNumber(beta, 3)],
            ['Correlation', formatNumber(corr, 3)],
            ['Reading', betaLabel(beta)]
        ];
        out(panel(keyValueTable(rows, 'METRIC', 'VALUE')), 'terminal-log', true);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}

function betaLabel(b) {
    if (b > 1.2) return '<span class="terminal-neg">Aggressive</span>';
    if (b < 0.8 && b > 0) return '<span class="terminal-pos">Defensive</span>';
    if (b < 0) return '<span class="terminal-pos">Inverse</span>';
    return '<span class="terminal-muted">Market-like</span>';
}
