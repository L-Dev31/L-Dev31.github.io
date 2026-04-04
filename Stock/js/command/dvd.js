import { fetchYahooDividends } from '../yahoo-finance.js';
import { formatNumber, panel, keyValueTable, runTickerCommand } from './market-data-shared.js';

export async function runDvdCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: DVD <SYMBOL>',
        loadingPrefix: 'Dividendes',
        onRun: async target => {
            const result = await fetchYahooDividends(target.ticker, null, null, null);
            if (result && !result.error) {
                const recent = (result.dividends || []).slice(-5).reverse();
                if (recent.length) {
                    const rows = recent.map(d => [d.date, formatNumber(d.dividend, 4)]);
                    out(panel(keyValueTable(rows, 'DATE', 'DIVIDENDE')), 'terminal-log', true);
                    return;
                }

                out('Aucun dividende');
                return;
            }

            out('Aucune donnée DVD');
        }
    });
}