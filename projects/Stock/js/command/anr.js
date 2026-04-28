import { fetchYahooAnalysis } from '../yahoo-finance.js';
import { esc, formatNumber, panel, keyValueTable, runTickerCommand } from './market-data-shared.js';

export async function runAnrCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: ANR <SYMBOL>',
        loadingPrefix: 'Analystes',
        onRun: async target => {
            const result = await fetchYahooAnalysis(target.ticker, null);
            if (result && !result.error) {
                const trend = result.analysis?.recommendationTrend?.trend || result.analysis?.recommendationTrend;
                if (trend?.length) {
                    const t = trend[0] || {};
                    const reco = String(t.recommendationKey || 'hold').toLowerCase();
                    const cls = reco === 'buy' ? 'terminal-pos' : reco === 'sell' ? 'terminal-neg' : 'terminal-muted';
                    const rows = [
                        ['Recommandation', `<span class="${cls}">${esc(reco.toUpperCase())}</span>`],
                        ['Strong Buy', formatNumber(t.strongBuy, 0)],
                        ['Buy', formatNumber(t.buy, 0)],
                        ['Hold', formatNumber(t.hold, 0)],
                        ['Sell', formatNumber(t.sell, 0)],
                        ['Strong Sell', formatNumber(t.strongSell, 0)]
                    ];
                    out(panel(keyValueTable(rows, 'VALEUR', 'RESULTAT')), 'terminal-log', true);
                    return;
                }

                const fd = result.analysis?.financialData || {};
                const targetMean = fd.targetMeanPrice?.raw ?? fd.targetMeanPrice;
                const reco = fd.recommendationMean?.raw ?? fd.recommendationMean;
                const rows = [
                    ['Target moyen', formatNumber(targetMean)],
                    ['Recommendation mean', formatNumber(reco)]
                ];
                out(panel(keyValueTable(rows, 'VALEUR', 'RESULTAT')), 'terminal-log', true);
                return;
            }

            out('No analyst data available');
        }
    });
}