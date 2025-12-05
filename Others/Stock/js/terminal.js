import { fetchYahooFinancials, fetchYahooEarnings, fetchYahooDividends, fetchYahooOptions, fetchYahooAnalysis, fetchFromYahoo } from './api/yahoo-finance.js';
import { fetchNews } from './api/news.js';
import { calculateBotSignal } from './signal-bot.js';
import { loadApiConfig } from './general.js';

const INPUT_ID = 'terminal-input';
const OUTPUT_ID = 'terminal-output';
const PROMPT = 'USER>';

let history = [];
let historyIdx = null;
let currentTask = null;

function cancelTask() {
    if (!currentTask) return false;
    try { currentTask.abort?.() || currentTask.abortController?.abort(); if (currentTask.intervalId) clearInterval(currentTask.intervalId); } catch (e) {}
    currentTask = null;
    return true;
}

function out(text, cls = 'terminal-log', html = false) {
    if (!html && window.terminalLogGlobal) { try { window.terminalLogGlobal(text); return; } catch (e) {} }
    const el = document.getElementById(OUTPUT_ID);
    if (!el) return;
    const d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = text; else d.textContent = text;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    setTimeout(() => document.getElementById(INPUT_ID)?.scrollIntoView({ behavior: 'auto', block: 'end' }), 10);
}

function fmtErr(e) {
    if (!e) return 'Erreur';
    if (typeof e === 'string') return e;
    const c = e.errorCode || e.status || e.statusCode;
    if (c === 401) return '401 Unauthorized';
    if (c === 429) return '429 Too Many Requests';
    return e.message || e.errorMessage || JSON.stringify(e);
}

function periodToDays(p) { return { '1D': 1, '1W': 7, '1M': 30, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 36500 }[(p || '').toUpperCase()] || 7; }

function getTarget(parts) {
    const raw = (parts[1] || '').toUpperCase();
    const pos = window.positions || {};
    if (raw) {
        if (pos[raw]) return { symbol: raw, ticker: pos[raw].api_mapping?.yahoo || pos[raw].ticker || raw };
        for (const [s, p] of Object.entries(pos)) {
            if (!p) continue;
            if ((p.ticker || '').toUpperCase() === raw) return { symbol: s, ticker: p.api_mapping?.yahoo || p.ticker || raw };
            if ((p.api_mapping?.yahoo || '').toUpperCase() === raw) return { symbol: s, ticker: p.api_mapping.yahoo };
        }
        return { symbol: null, ticker: raw };
    }
    const active = window.getActiveSymbol?.();
    if (active && pos[active]) return { symbol: active, ticker: pos[active].api_mapping?.yahoo || pos[active].ticker || active };
    return null;
}

function showHelp(cmd) {
    const cmds = [
        { c: 'GO &lt;SYM&gt; [P]', d: 'Ouvre onglet' }, { c: 'NEWS &lt;SYM&gt;', d: 'Actualités' }, { c: 'GIP &lt;SYM&gt;', d: 'Streaming' },
        { c: 'HDS &lt;SYM&gt; [P]', d: 'Historique' }, { c: 'FA &lt;SYM&gt;', d: 'Financiers' }, { c: 'ANR &lt;SYM&gt;', d: 'Analystes' },
        { c: 'ERN &lt;SYM&gt;', d: 'Résultats' }, { c: 'DVD &lt;SYM&gt;', d: 'Dividendes' }, { c: 'OMON &lt;SYM&gt;', d: 'Options' },
        { c: 'RV T1 T2...', d: 'Comparaison' }, { c: 'CLEAR', d: 'Effacer' }, { c: 'HELP [CMD]', d: 'Aide' }
    ];
    if (!cmd) { out('Commandes:<br>' + cmds.map(x => `<span class="terminal-command">${x.c}</span> ${x.d}`).join('<br>'), 'terminal-log', true); return; }
    const c = cmd.toUpperCase();
    const found = cmds.find(x => x.c.startsWith(c));
    if (found) out(`<span class="terminal-command">${found.c}</span> ${found.d}`, 'terminal-log', true);
    else out(`Inconnu: ${c}`);
}

async function exec(raw) {
    if (!raw?.trim()) return;
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();

    if (cmd === 'NEWS') {
        const t = getTarget(parts);
        if (!t) { out('Usage: NEWS <SYMBOL>'); return; }
        out(`Actualités ${t.ticker}...`);
        try {
            if (t.symbol && window.positions?.[t.symbol]) {
                const period = window.positions[t.symbol].currentPeriod || '1D';
                const r = await window.fetchCardNews(t.symbol, true, 20, periodToDays(period), window.getSelectedApi?.() || window.selectedApi);
                out(`${(r || []).length} articles`);
                window.openNewsPage(t.symbol);
            } else {
                const cfg = await loadApiConfig();
                const r = await fetchNews(t.ticker, cfg, 50, 7, window.getSelectedApi?.() || window.selectedApi);
                out(`${(r?.items || []).length} articles`);
                window.openNewsPage(t.symbol);
            }
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'CLEAR') { document.getElementById(OUTPUT_ID).innerHTML = ''; out('Terminal v0.1'); cancelTask(); return; }
    if (cmd === 'HELP' || cmd === '?') { showHelp(parts[1]); return; }

    if (cmd === 'GO') {
        const raw = (parts[1] || '').toUpperCase();
        const period = (parts[2] || '1D').toUpperCase();
        if (!raw) { out('Usage: GO <SYMBOL> [PERIOD]'); return; }
        const t = getTarget(parts);
        let tab = t?.symbol ? document.querySelector(`.tab[data-symbol="${t.symbol}"]`) : null;
        if (!tab) tab = document.querySelector(`.tab[data-ticker="${t?.ticker || raw}"]`);
        const sym = t?.symbol || tab?.dataset.symbol;
        if (sym && window.positions?.[sym]) {
            window.positions[sym].currentPeriod = period;
            const g = document.getElementById(`periods-${sym}`);
            if (g) { g.querySelectorAll('.period-btn').forEach(x => x.classList.remove('active')); g.querySelector(`.period-btn[data-period="${period}"]`)?.classList.add('active'); }
        }
        if (tab) { tab.click(); out(`Ouvert: ${tab.dataset.symbol || t.ticker} ${period}`); await window.fetchActiveSymbol?.(true); }
        else out(`Non trouvé: ${raw}`);
        return;
    }

    if (cmd === 'GIP') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: GIP <SYMBOL>'); return; }
        if (currentTask) { out('Streaming actif. CTRL+C pour stopper.'); return; }
        if (!t.symbol || !window.positions?.[t.symbol]) { out(`Non trouvé: ${t.ticker}`); return; }
        window.positions[t.symbol].currentPeriod = '1D';
        document.querySelector(`.tab[data-symbol="${t.symbol}"]`)?.click();
        out(`Streaming ${t.ticker}. CTRL+C pour arrêter.`);
        const ac = new AbortController();
        currentTask = { type: 'stream', abortController: ac };
        await window.fetchActiveSymbol?.(true);
        currentTask.intervalId = setInterval(async () => { if (!currentTask) return; try { await window.fetchActiveSymbol?.(true); } catch (e) { out(`Erreur: ${e?.message}`); clearInterval(currentTask.intervalId); currentTask = null; } }, 5000);
        return;
    }

    if (cmd === 'HDS') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: HDS <SYMBOL> [PERIOD]'); return; }
        const period = (parts[2] || '5Y').toUpperCase();
        if (t.symbol && window.positions?.[t.symbol]) {
            window.positions[t.symbol].currentPeriod = period;
            document.querySelector(`.tab[data-symbol="${t.symbol}"]`)?.click();
            out(`Historique ${t.ticker} ${period}`);
            await window.fetchActiveSymbol?.(true);
        } else { out(`Non trouvé: ${t.ticker}`); try { await fetchFromYahoo(t.ticker, period, t.ticker, null, null, null); out('Données récupérées.'); } catch (e) { out(`Erreur: ${e?.message}`); } }
        return;
    }

    if (cmd === 'FA') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: FA <SYMBOL>'); return; }
        out(`Financiers ${t.ticker}...`);
        try {
            const r = await fetchYahooFinancials(t.ticker, null);
            if (r && !r.error) {
                const fd = r.financials?.financialData || {};
                const o = [];
                if (fd.revenueGrowth) o.push(`CA: ${(fd.revenueGrowth * 100).toFixed(2)}%`);
                if (fd.grossMargins) o.push(`Marges: ${fd.grossMargins}`);
                if (fd.currentPrice?.raw) o.push(`Prix: ${fd.currentPrice.raw}`);
                out(o.join(' | ') || 'Aucune donnée', 'terminal-log', true);
            } else out(`Aucune donnée FA`);
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'ANR') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: ANR <SYMBOL>'); return; }
        out(`Analystes ${t.ticker}...`);
        try {
            const r = await fetchYahooAnalysis(t.ticker, null);
            if (r && !r.error) {
                const rt = r.analysis?.recommendationTrend?.trend || r.analysis?.recommendationTrend;
                if (rt?.length) out(`Trend: ${JSON.stringify(rt[0])}`, 'terminal-log', true);
                else out('Aucun avis');
            } else out('Aucune donnée ANR');
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'ERN') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: ERN <SYMBOL>'); return; }
        out(`Résultats ${t.ticker}...`);
        try {
            const r = await fetchYahooEarnings(t.ticker, null);
            if (r && !r.error) out(`Earnings: ${JSON.stringify(r.earnings || {})}`, 'terminal-log', true);
            else out('Aucune donnée ERN');
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'DVD') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: DVD <SYMBOL>'); return; }
        out(`Dividendes ${t.ticker}...`);
        try {
            const r = await fetchYahooDividends(t.ticker, null, null, null);
            if (r && !r.error) {
                const last = (r.dividends || []).slice(-5).reverse();
                if (last.length) out(`Derniers: ${last.map(d => `${d.date} ${d.dividend}`).join(' | ')}`, 'terminal-log', true);
                else out('Aucun dividende');
            } else out('Aucune donnée DVD');
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'OMON') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: OMON <SYMBOL>'); return; }
        out(`Options ${t.ticker}...`);
        try {
            const r = await fetchYahooOptions(t.ticker, null, null);
            if (r && !r.error) out(`Expirations: ${JSON.stringify(r.options?.result?.[0]?.expirationDates?.slice(0, 5) || [])}`, 'terminal-log', true);
            else out('Aucune donnée OMON');
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'GFTT') {
        const t = getTarget(parts);
        if (!t?.ticker) { out('Usage: GFTT <SYMBOL>'); return; }
        out(`Analyse ${t.ticker}...`);
        try {
            if (t.symbol && window.positions?.[t.symbol]) {
                window.positions[t.symbol].currentPeriod = '1D';
                document.querySelector(`.tab[data-symbol="${t.symbol}"]`)?.click();
                await window.fetchActiveSymbol?.(true);
                const d = window.positions[t.symbol].lastData;
                if (!d || d.error) { out('Pas de données.'); return; }
                const sig = calculateBotSignal({ ...d, symbol: t.symbol });
                out(`Signal: ${sig.signalValue}% - ${sig.signalTitle} - ${sig.signalDesc}`, 'terminal-log', true);
            } else out(`Non trouvé: ${t.ticker}`);
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    if (cmd === 'RV') {
        const targets = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
        if (targets.length < 2) { out('Usage: RV T1 T2... (min 2)'); return; }
        out(`Comparaison: ${targets.join(', ')}`);
        try {
            const res = [];
            for (const t of targets) {
                let ticker = t;
                if (window.positions?.[t]) ticker = window.positions[t].api_mapping?.yahoo || window.positions[t].ticker || ticker;
                const r = await fetchYahooFinancials(ticker, null);
                if (r && !r.error && r.financials?.financialData) {
                    const fd = r.financials.financialData;
                    res.push({ ticker: t, pe: fd.trailingPE || fd.forwardPE, revenue: fd.totalRevenue?.raw || fd.totalRevenue });
                } else res.push({ ticker: t, pe: null, revenue: null });
            }
            out(`Résultats: ${JSON.stringify(res)}`, 'terminal-log', true);
        } catch (e) { out(`Erreur: ${fmtErr(e)}`); }
        return;
    }

    out(`Commande inconnue: ${raw}`);
}

function init() {
    const inp = document.getElementById(INPUT_ID);
    const el = document.getElementById(OUTPUT_ID);
    if (!inp || !el) return;
    out('Terminal v0.1 - HELP');

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = inp.value;
            if (v.trim()) history.push(v);
            historyIdx = null;
            out(`${PROMPT} ${v}`, 'terminal-log terminal-cmd');
            exec(v);
            inp.value = '';
            setTimeout(() => { inp.focus(); inp.scrollIntoView({ behavior: 'auto', block: 'end' }); }, 20);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!history.length) return;
            historyIdx = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
            inp.value = history[historyIdx] || '';
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!history.length) return;
            if (historyIdx === null) { inp.value = ''; return; }
            historyIdx = Math.min(history.length - 1, historyIdx + 1);
            inp.value = historyIdx >= history.length ? '' : history[historyIdx] || '';
        }
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const card = document.getElementById('card-terminal');
            if (card?.classList.contains('active')) window.closeTerminalCard?.();
            else { window.openTerminalCard?.(); inp.focus(); }
        }
        if (e.key === 'Escape') window.closeTerminalCard?.() || document.getElementById('card-terminal')?.classList.remove('active');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); if (cancelTask()) out('Streaming stoppé.'); }
    });

    document.getElementById('card-terminal')?.addEventListener('click', e => {
        if (e.target.closest('a, button, input, textarea, select, [contenteditable], .copy-btn')) return;
        inp.focus();
        inp.select?.();
    });
}

document.addEventListener('DOMContentLoaded', init);

export { init as initTerminal, exec as processCommand };