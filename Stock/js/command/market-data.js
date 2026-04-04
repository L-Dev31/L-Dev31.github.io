import {
    fetchYahooFinancials,
    fetchYahooEarnings,
    fetchYahooDividends,
    fetchYahooAnalysis,
    fetchYahooChartSnapshot
} from '../yahoo-finance.js';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(value, maximumFractionDigits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="terminal-muted">—</span>';
    return Number(value).toLocaleString('fr-FR', { maximumFractionDigits });
}

function formatPercent(value, maximumFractionDigits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="terminal-muted">—</span>';
    const numeric = Number(value);
    const cls = numeric > 0 ? 'terminal-pos' : numeric < 0 ? 'terminal-neg' : 'terminal-muted';
    const sign = numeric > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${numeric.toFixed(maximumFractionDigits)}%</span>`;
}

function panel(title, content) {
    return `<div class="terminal-panel"><div class="terminal-panel-title">${esc(title)}</div>${content}</div>`;
}

function keyValueTable(rows) {
    const body = rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`).join('');
    return `<table class="terminal-mini-table"><tbody>${body}</tbody></table>`;
}

function dataTable(headers, rows) {
    const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
    const body = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
    return `<table class="terminal-data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export async function runFaCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Usage: FA <SYMBOL>');
        return;
    }

    out(`Financiers ${target.ticker}...`);
    try {
        const result = await fetchYahooFinancials(target.ticker, null);
        if (result && !result.error) {
            const financialData = result.financials?.financialData || {};
            const rows = [
                ['Ticker', esc(target.ticker)],
                ['Prix', formatNumber(financialData.currentPrice?.raw)],
                ['Variation jour', formatPercent(financialData.dayChangePercent)],
                ['52 semaines', financialData.fiftyTwoWeekLow?.raw != null && financialData.fiftyTwoWeekHigh?.raw != null
                    ? `${formatNumber(financialData.fiftyTwoWeekLow.raw)} → ${formatNumber(financialData.fiftyTwoWeekHigh.raw)}`
                    : '<span class="terminal-muted">—</span>'],
                ['Volume', formatNumber(financialData.regularMarketVolume, 0)],
                ['Croissance CA', formatPercent(financialData.revenueGrowth != null ? Number(financialData.revenueGrowth) * 100 : null)],
                ['Marges', financialData.grossMargins != null ? formatPercent(Number(financialData.grossMargins) * 100) : '<span class="terminal-muted">—</span>']
            ];
            out(panel(`Financiers ${target.ticker}`, keyValueTable(rows)), 'terminal-log', true);
        } else {
            out('Aucune donnée FA');
        }
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}

export async function runAnrCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Usage: ANR <SYMBOL>');
        return;
    }

    out(`Analystes ${target.ticker}...`);
    try {
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
                out(panel(`Analystes ${target.ticker}`, keyValueTable(rows)), 'terminal-log', true);
                return;
            }

            const fd = result.analysis?.financialData || {};
            const targetMean = fd.targetMeanPrice?.raw ?? fd.targetMeanPrice;
            const reco = fd.recommendationMean?.raw ?? fd.recommendationMean;
            const rows = [
                ['Target moyen', formatNumber(targetMean)],
                ['Recommendation mean', formatNumber(reco)]
            ];
            out(panel(`Analystes ${target.ticker}`, keyValueTable(rows)), 'terminal-log', true);
        } else {
            out('Aucune donnée ANR');
        }
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}

export async function runErnCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Usage: ERN <SYMBOL>');
        return;
    }

    out(`Résultats ${target.ticker}...`);
    try {
        const result = await fetchYahooEarnings(target.ticker, null);
        if (result && !result.error) {
            const e = result.earnings || {};
            let earningsDate = '<span class="terminal-muted">—</span>';
            if (e.earningsTimestamp) {
                const d = new Date((Number(e.earningsTimestamp) < 1e12 ? Number(e.earningsTimestamp) * 1000 : Number(e.earningsTimestamp)));
                if (!Number.isNaN(d.getTime())) earningsDate = esc(d.toISOString().slice(0, 10));
            }
            const rows = [
                ['Ticker', esc(target.ticker)],
                ['EPS TTM', formatNumber(e.epsTrailingTwelveMonths)],
                ['EPS Forward', formatNumber(e.epsForward)],
                ['EPS année', formatNumber(e.epsCurrentYear)],
                ['Prix', formatNumber(e.regularMarketPrice)],
                ['Variation 1 an', formatPercent(e.yearlyPriceDeltaPercent)],
                ['Date earnings', earningsDate]
            ];
            out(panel(`Résultats ${target.ticker}`, keyValueTable(rows)), 'terminal-log', true);
        } else out('Aucune donnée ERN');
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}

export async function runDvdCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Usage: DVD <SYMBOL>');
        return;
    }

    out(`Dividendes ${target.ticker}...`);
    try {
        const result = await fetchYahooDividends(target.ticker, null, null, null);
        if (result && !result.error) {
            const recent = (result.dividends || []).slice(-5).reverse();
            if (recent.length) {
                const rows = recent.map(d => [esc(d.date), formatNumber(d.dividend, 4)]);
                out(panel(`Dividendes ${target.ticker}`, dataTable(['Date', 'Dividende'], rows)), 'terminal-log', true);
            }
            else out('Aucun dividende');
        } else {
            out('Aucune donnée DVD');
        }
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}

export async function runRvCommand({ parts, out, fmtErr }) {
    const targets = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
    if (targets.length < 2) {
        out('Usage: RV T1 T2... (min 2)');
        return;
    }

    out(`Comparaison: ${targets.join(', ')}`);
    try {
        const results = [];
        for (const target of targets) {
            let ticker = target;
            if (window.positions?.[target]) ticker = window.positions[target].api_mapping?.yahoo || window.positions[target].ticker || ticker;
            const response = await fetchYahooFinancials(ticker, null);
            if (response && !response.error && response.financials?.financialData) {
                const financialData = response.financials.financialData;
                const price = financialData.currentPrice?.raw ?? null;
                const dayChangePercent = financialData.dayChangePercent ?? null;
                results.push({
                    ticker: target,
                    pe: financialData.trailingPE || financialData.forwardPE,
                    revenue: financialData.totalRevenue?.raw || financialData.totalRevenue,
                    price,
                    dayChangePercent
                });
            } else {
                const snap = await fetchYahooChartSnapshot(ticker, '1mo', '1d');
                const meta = snap?.meta || {};
                const price = meta.regularMarketPrice ?? null;
                const prev = meta.chartPreviousClose ?? null;
                const dayChangePercent = (price != null && prev) ? ((price - prev) / prev) * 100 : null;
                results.push({ ticker: target, pe: null, revenue: null, price, dayChangePercent });
            }
        }
        const rows = results.map(r => [
            esc(r.ticker),
            formatNumber(r.price),
            formatPercent(r.dayChangePercent),
            formatNumber(r.pe),
            r.revenue != null ? formatNumber(r.revenue, 0) : '<span class="terminal-muted">—</span>'
        ]);
        out(panel(`Comparaison (${targets.join(', ')})`, dataTable(['Ticker', 'Prix', 'Var jour', 'PE', 'CA'], rows)), 'terminal-log', true);
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}
