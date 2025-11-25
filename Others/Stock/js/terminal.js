import { fetchYahooSummary, fetchYahooFinancials, fetchYahooEarnings, fetchYahooDividends, fetchYahooOptions, fetchYahooAnalysis, fetchYahooNews, fetchFromYahoo } from './api/yahoo-finance.js';
import { fetchNews } from './api/news.js';
import { calculateBotSignal } from './signal-bot.js';
import { loadApiConfig } from './general.js';

const inputId = 'terminal-input';
const outputId = 'terminal-output';
const PROMPT = 'USER>';

const history = [];
let historyIndex = null;
let currentTerminalTask = null; // used to track streaming jobs

function cancelCurrentTerminalTask() {
    if (!currentTerminalTask) return false;
    try {
        if (currentTerminalTask.abort) {
            currentTerminalTask.abort();
        } else if (currentTerminalTask.abortController) {
            currentTerminalTask.abortController.abort();
        }
        if (currentTerminalTask.intervalId) clearInterval(currentTerminalTask.intervalId);
    } catch (e) { /* ignore */ }
    currentTerminalTask = null;
    return true;
}

function appendOutput(text, klass = 'terminal-log', allowHtml = false) {
    // Prefer the global helper if present, but DO NOT use it if we are inserting HTML
    if (!allowHtml && window.terminalLogGlobal && typeof window.terminalLogGlobal === 'function') {
        try { window.terminalLogGlobal(text); return; } catch (e) { /* fallback */ }
    }
    const out = document.getElementById(outputId);
    if (!out) return;
    const el = document.createElement('div');
    el.className = klass;
    if (allowHtml) el.innerHTML = text;
    else el.textContent = text;
    out.appendChild(el);
    // scroll to bottom to show latest
    out.scrollTop = out.scrollHeight;
    try {
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (e) {}
    // Always ensure input is visible after output
    setTimeout(() => {
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, 10);
}

function formatApiError(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    // err may be Error or an API response shaped like { error: true, errorCode }
    const code = err.errorCode || err.status || (err?.error && err?.errorCode) || err?.statusCode;
    if (code === 401) return '401 Unauthorized — Vérifiez votre clé API et la configuration.';
    if (code === 429) return '429 Too Many Requests — L\'API est en limite (rate-limited). Réessayez plus tard.';
    // Return readable message or JSON fallback
    if (err.message) return err.message;
    if (err.errorMessage) return err.errorMessage;
    return JSON.stringify(err);
}

function showHelp(target = null) {
    if (!target) {
        const commands = [
            {cmd: 'GO &lt;SYMBOL&gt; [PERIOD]', desc: '- Opens the symbol tab'},
            {cmd: 'NEWS &lt;SYMBOL&gt;', desc: '- Opens news overlay for the symbol'},
            {cmd: 'GIP &lt;SYMBOL&gt;', desc: '- Starts intraday streaming'},
            {cmd: 'HDS &lt;SYMBOL&gt; [PERIOD]', desc: '- Shows historical data'},
            {cmd: 'FA &lt;SYMBOL&gt;', desc: '- Displays financial statements'},
            {cmd: 'ANR &lt;SYMBOL&gt;', desc: '- Shows analyst ratings'},
            {cmd: 'ERN &lt;SYMBOL&gt;', desc: '- Displays earnings data'},
            {cmd: 'DVD &lt;SYMBOL&gt;', desc: '- Shows dividend information'},
            {cmd: 'OMON &lt;SYMBOL&gt;', desc: '- Displays options data'},
            {cmd: 'RV T1 T2...', desc: '- Performs relative valuation'},
            {cmd: 'CLEAR', desc: '- Clears the terminal output'},
            {cmd: 'HELP [CMD]', desc: '- Shows help information'}
        ];
        const html = 'Available Commands:<br>' + commands.map(c => `<span class="terminal-command">${c.cmd}</span> ${c.desc}`).join('<br>');
        appendOutput(html, 'terminal-log', true);
        return;
    }
    const cmd = target.toUpperCase();
    switch (cmd) {
        case 'NEWS':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Open news overlay`, 'terminal-log', true);
            break;
        case 'GO':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt; [PERIOD]</span> - Opens the symbol tab`, 'terminal-log', true);
            break;
        case 'GIP':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Start intraday streaming`, 'terminal-log', true);
            break;
        case 'HDS':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt; [PERIOD]</span> - Show historical data`, 'terminal-log', true);
            break;
        case 'FA':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Financial statements`, 'terminal-log', true);
            break;
        case 'ANR':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Analyst ratings`, 'terminal-log', true);
            break;
        case 'ERN':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Earnings`, 'terminal-log', true);
            break;
        case 'DVD':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Dividends`, 'terminal-log', true);
            break;
        case 'OMON':
            appendOutput(`<span class="terminal-command">${cmd} &lt;SYMBOL&gt;</span> - Options`, 'terminal-log', true);
            break;
        case 'RV':
            appendOutput(`<span class="terminal-command">${cmd} T1 T2...</span> - Relative valuation`, 'terminal-log', true);
            break;
        case 'CLEAR':
            appendOutput(`<span class="terminal-command">${cmd}</span> - Clear terminal`, 'terminal-log', true);
            break;
        case 'HELP':
            appendOutput(`<span class="terminal-command">${cmd} [CMD]</span> - Show help`, 'terminal-log', true);
            break;
        default:
            appendOutput(`Unknown: ${cmd}`);
            break;
    }
}

async function processCommand(raw) {
    if (!raw) return;
    const input = raw.trim();
    if (!input) return;
        // Input prompts are shown in the input row; do not echo the prompt in output

    const parts = input.split(/\s+/);
    const cmd = parts[0].toUpperCase();

    // Key helpers and commands
    // Helper to resolve a target symbol or ticker into { symbol, ticker }
    function getTargetSymbol(parts) {
        const raw = (parts[1] || '').toUpperCase();
        const posMap = window.positions || {};
        if (raw) {
            const entry = posMap[raw];
            if (entry) return { symbol: raw, ticker: ((entry.api_mapping && entry.api_mapping.yahoo) || entry.ticker || raw) };
            for (const [sym, p] of Object.entries(posMap)) {
                if (!p) continue; // skip if the position object is null/undefined
                if ((p.ticker || '').toUpperCase() === raw) return { symbol: sym, ticker: ((p.api_mapping && p.api_mapping.yahoo) || p.ticker || raw) };
                if ((p.api_mapping && (p.api_mapping.yahoo || '').toUpperCase()) === raw) return { symbol: sym, ticker: p.api_mapping.yahoo };
            }
            return { symbol: null, ticker: raw };
        }
        const active = window.getActiveSymbol && window.getActiveSymbol();
        if (active && posMap[active]) {
            const p = posMap[active];
            if (p) return { symbol: active, ticker: ((p.api_mapping && p.api_mapping.yahoo) || p.ticker || active) };
        }
        return null;
    }

    // KEYWORD COMMANDS: HELP, NEWS, GO, CLEAR etc.

    if (cmd === 'NEWS') {
        const resolved = getTargetSymbol(parts);
        if (!resolved) { appendOutput('Usage: NEWS <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        if (internalSym && window.positions && window.positions[internalSym]) {
            appendOutput(`Récupération des actualités pour ${internalSym} ...`);
            try {
                const r = await window.fetchCardNews(internalSym, true, 20);
                appendOutput(`Actualités récupérées pour ${internalSym} (${(r||[]).length || 0} items)`);
                window.openNewsPage(internalSym);
            } catch (err) { appendOutput(`Erreur: ${formatApiError(err)}`); }
        } else {
            // fallback: try fetching yahoo news with ticker
            appendOutput(`Récupération des actualités pour ${yahooTicker} ...`);
            try {
                const config = await loadApiConfig();
                const r = await fetchNews(yahooTicker, config);
                appendOutput(`Actualités récupérées pour ${yahooTicker} (${(r?.items||[]).length || 0} items)`);
                window.openNewsPage(internalSym || null);
            } catch (err) { appendOutput(`Erreur: ${formatApiError(err)}`); }
        }
            // keep input prompt in the input control (no log prompt appended)
        return;
    }
    // (removed duplicate incomplete DES block)
    if (cmd === 'CLEAR') {
        const out = document.getElementById(outputId);
        if (out) out.innerHTML = '';
        // Remettre les messages de début
        appendOutput('Terminal v0.1 - HELP for commands');
        // Cancel any running stream
        cancelCurrentTerminalTask();
        return;
    }
    if (cmd === 'HELP' || cmd === '?') {
        const arg = (parts[1] || '').toUpperCase();
        if (arg) showHelp(arg);
        else showHelp();
        // keep input prompt in the input control (no log prompt appended)
        return;
    }

    // Additional commands mapping to Yahoo (helper defined within processCommand)

    if (cmd === 'GO') {
        const rawArg = (parts[1] || '').toUpperCase();
        const period = (parts[2] || '1D').toUpperCase();
        if (!rawArg) { appendOutput('Usage: GO <SYMBOL> [PERIOD]'); return; }
        const resolved = getTargetSymbol(parts);
        const internalSym = resolved && resolved.symbol ? resolved.symbol : null;
        const ticker = resolved && resolved.ticker ? resolved.ticker : rawArg;

        // Prefer the internal symbol tab, otherwise try to match by ticker
        let tab = null;
        if (internalSym) tab = document.querySelector(`.tab[data-symbol="${internalSym}"]`);
        if (!tab) tab = document.querySelector(`.tab[data-ticker="${ticker}"]`);

        // Set period on the internal position if possible
        const targetSym = internalSym || (tab ? tab.dataset.symbol : null);
        if (targetSym && window.positions && window.positions[targetSym]) {
            window.positions[targetSym].currentPeriod = period;
            const g = document.getElementById(`periods-${targetSym}`);
            if (g) {
                g.querySelectorAll('.period-btn').forEach(x => x.classList.remove('active'));
                const activeBtn = g.querySelector(`.period-btn[data-period="${period}"]`);
                if (activeBtn) activeBtn.classList.add('active');
            }
        }

        if (tab) {
            tab.click();
            appendOutput(`Ouvert / sélectionné : ${tab.dataset.symbol || ticker} période ${period}`);
            try { await window.fetchActiveSymbol(true); } catch(e) { /* ignore */ }
        } else {
            appendOutput(`Symbole non trouvé : ${rawArg}`);
        }
        return;
    }

    if (cmd === 'GIP') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: GIP <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        // Start streaming intraday: set currentPeriod to 1D and fetch repeatedly until CTRL+C
        if (currentTerminalTask) { appendOutput('Un autre streaming est en cours. Utilisez CTRL+C pour annuler.'); return; }
        if (!internalSym || !window.positions || !window.positions[internalSym]) { appendOutput(`Symbole non trouvé: ${yahooTicker}`); return; }
        window.positions[internalSym].currentPeriod = '1D';
        const tab = document.querySelector(`.tab[data-symbol="${internalSym}"]`);
        if (tab) tab.click();
        appendOutput(`Démarrage du streaming intraday pour ${yahooTicker}. Appuyez sur CTRL+C pour arrêter.`);
        const abortController = new AbortController();
        currentTerminalTask = { type: 'stream', abortController };
        const interval = 5000;
        try {
            await window.fetchActiveSymbol(true);
        } catch (e) { /* ignore */ }
        const id = setInterval(async () => {
            try {
                if (!currentTerminalTask) { clearInterval(id); return; }
                await window.fetchActiveSymbol(true);
            } catch (e) {
                appendOutput(`Erreur streaming: ${e?.message || e}`);
                clearInterval(id);
                currentTerminalTask = null;
            }
        }, interval);
        currentTerminalTask.intervalId = id;
        return;
    }

    if (cmd === 'HDS') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: HDS <SYMBOL> [PERIOD]'); return; }
        const period = (parts[2] || '5Y').toUpperCase();
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`(debug) resolved -> internal: ${internalSym || '(none)'}, ticker: ${yahooTicker}`);
        if (internalSym && window.positions && window.positions[internalSym]) {
            window.positions[internalSym].currentPeriod = period;
            const tab = document.querySelector(`.tab[data-symbol="${internalSym}"]`);
            if (tab) tab.click();
            appendOutput(`Ouverture des données historiques ${yahooTicker} (${internalSym}) période ${period}`);
            try { await window.fetchActiveSymbol(true); } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        } else {
            appendOutput(`Symbole non trouvé: ${yahooTicker}. Affichage en lecture seule.`);
            try { await fetchFromYahoo(yahooTicker, period, yahooTicker, null, null, null); appendOutput('Données récupérées (check console).'); } catch(e) { appendOutput(`Erreur HDS: ${e?.message || e}`); }
        }
        return;
    }

    if (cmd === 'FA') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: FA <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des états financiers pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooFinancials(yahooTicker, null);
            if (r && !r.error) {
                const fin = r.financials || {};
                const out = [];
                if (fin.financialData) {
                    const fd = fin.financialData;
                    if (fd.revenueGrowth) out.push(`Croissance CA: ${(fd.revenueGrowth*100).toFixed(2)}%`);
                    if (fd.grossMargins) out.push(`Marges: ${fd.grossMargins}`);
                    if (fd.currentPrice && fd.currentPrice.raw) out.push(`Cours: ${fd.currentPrice.raw}`);
                }
                appendOutput(out.join(' | ') || 'Aucune donnée financière disponible', 'terminal-log', true);
            } else {
                appendOutput(`Aucune donnée FA pour ${yahooTicker}`);
            }
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'ANR') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: ANR <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des avis analystes pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooAnalysis(yahooTicker, null);
            if (r && !r.error) {
                const rt = r.analysis?.recommendationTrend?.trend || r.analysis?.recommendationTrend || null;
                if (rt && Array.isArray(rt) && rt.length) {
                    const latest = rt[0];
                    appendOutput(`Trend: ${JSON.stringify(latest)}`, 'terminal-log', true);
                } else appendOutput('Aucun avis analyste disponible');
            } else appendOutput(`Aucune donnée ANR pour ${yahooTicker}`);
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'ERN') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: ERN <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des résultats pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooEarnings(yahooTicker, null);
            if (r && !r.error) {
                appendOutput(`Earnings: ${JSON.stringify(r.earnings || {})}`, 'terminal-log', true);
            } else appendOutput(`Aucune donnée ERN pour ${yahooTicker}`);
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'DVD') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: DVD <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des dividendes pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooDividends(yahooTicker, null, null, null);
            if (r && !r.error) {
                const latest = (r.dividends || []).slice(-5).reverse();
                if (latest.length) {
                    appendOutput(`Derniers dividendes: ${latest.map(d => `${d.date} ${d.dividend}`).join(' | ')}`, 'terminal-log', true);
                } else appendOutput('Aucun dividende trouvé');
            } else appendOutput(`Aucune donnée DVD pour ${yahooTicker}`);
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'OMON') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: OMON <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des options pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooOptions(yahooTicker, null, null);
            if (r && !r.error) {
                appendOutput(`Options expirations: ${JSON.stringify(r.options?.result?.[0]?.expirationDates?.slice(0,5) || [])}`, 'terminal-log', true);
            } else appendOutput(`Aucune donnée OMON pour ${yahooTicker}`);
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'GFTT') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: GFTT <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Calcul technique pour ${yahooTicker}...`);
        try {
            if (internalSym && window.positions && window.positions[internalSym]) {
                window.positions[internalSym].currentPeriod = '1D';
                const tab = document.querySelector(`.tab[data-symbol="${internalSym}"]`);
                if (tab) tab.click();
                await window.fetchActiveSymbol(true);
                const d = window.positions[internalSym].lastData;
                if (!d || d.error) { appendOutput('Pas de données pour analyser.'); return; }
                const signal = calculateBotSignal({ ...d, symbol: internalSym });
                appendOutput(`Signal: ${signal.signalValue}% - ${signal.signalTitle} - ${signal.signalDesc}`, 'terminal-log', true);
            } else appendOutput(`Symbole non trouvé: ${yahooTicker}`);
        } catch (e) { appendOutput(`Erreur: ${formatApiError(e)}`); }
        return;
    }

    if (cmd === 'RV') {
        const targets = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
        if (targets.length < 2) { appendOutput('Usage: RV TICKER1 TICKER2 ... (au moins 2)', 'terminal-log'); return; }
        appendOutput(`Récupération des données pour la comparaison : ${targets.join(', ')}`);
        try {
            const results = [];
            for (const t of targets) {
                // resolve ticker to yahoo ticker if provided as internal symbol
                let tTicker = t;
                if (window.positions && window.positions[t]) {
                    const p = window.positions[t];
                    tTicker = (p.api_mapping && p.api_mapping.yahoo) || p.ticker || tTicker;
                }
                const r = await fetchYahooFinancials(tTicker, null);
                if (r && !r.error && r.financials && r.financials.financialData) {
                    const fd = r.financials.financialData;
                    results.push({ ticker: t, pe: fd.trailingPE || fd.forwardPE || null, revenue: fd.totalRevenue ? (fd.totalRevenue.raw || fd.totalRevenue) : null });
                } else results.push({ ticker: t, pe: null, revenue: null });
            }
            appendOutput(`RV résultats: ${JSON.stringify(results)}`, 'terminal-log', true);
        } catch (e) { appendOutput(`Erreur RV: ${formatApiError(e)}`); }
        return;
    }

    appendOutput(`Commande inconnue: ${input}`);
        // keep input prompt in the input control (no log prompt appended)
}

    // (Helper defined earlier in processCommand scope)

function initTerminal() {
    const input = document.getElementById(inputId);
    const out = document.getElementById(outputId);
    if (!input || !out) return;
    // Display Windows-like greeting as normal output messages
    appendOutput('Terminal v0.1 - HELP for commands');

    // Ensure focus and caret
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value;
            if (val.trim()) {
                history.push(val);
            }
            historyIndex = null;
            // Echo command into output history
            appendOutput(`${PROMPT} ${val}`, 'terminal-log terminal-cmd');
            processCommand(val);
            input.value = '';
            // Focus and ensure input remains visible at the bottom
            setTimeout(()=>{
                try{
                    input.focus();
                    input.scrollIntoView({behavior:'auto', block:'end'});
                }catch(e){}
            }, 20);
            // Scroll output to bottom and keep focus
            setTimeout(()=>{
                const out = document.getElementById(outputId);
                if (out) out.scrollTop = out.scrollHeight;
                input.focus();
                input.scrollIntoView({behavior:'auto', block:'end'});
            }, 20);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length === 0) return;
            if (historyIndex === null) historyIndex = history.length - 1;
            else historyIndex = Math.max(0, historyIndex - 1);
            input.value = history[historyIndex] || '';
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (history.length === 0) return;
            if (historyIndex === null) { input.value = ''; return; }
            historyIndex = Math.min(history.length - 1, historyIndex + 1);
            if (historyIndex >= history.length) { historyIndex = null; input.value = ''; }
            else input.value = history[historyIndex] || '';
        }
    });

    // Ctrl/Cmd+K toggles terminal visibility as a convenience
    document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            // Use global helper if available to behave like a tab
            if (window.openTerminalCard && typeof window.openTerminalCard === 'function') {
                const card = document.getElementById('card-terminal');
                    if (card && card.classList.contains('active')) {
                        if (window.closeTerminalCard && typeof window.closeTerminalCard === 'function') window.closeTerminalCard();
                    } else {
                    // Open terminal and clear any active tabs/cards
                    window.openTerminalCard();
                    }
                input.focus();
            } else {
                const card = document.getElementById('card-terminal');
                if (!card) return;
                if (card.classList.contains('active')) {
                    card.classList.remove('active');
                    card.setAttribute('aria-hidden', 'true');
                } else {
                    card.classList.add('active');
                    card.setAttribute('aria-hidden', 'false');
                    input.focus();
                }
            }
        }
        if (e.key === 'Escape') {
            // Close terminal via Escape if visible
            if (window.closeTerminalCard && typeof window.closeTerminalCard === 'function') {
                window.closeTerminalCard();
            } else {
                const card = document.getElementById('card-terminal');
                if (card) {
                    card.classList.remove('active');
                    card.setAttribute('aria-hidden', 'true');
                }
            }
        }
        // Ctrl/Cmd+C to cancel a running streaming task
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (cancelCurrentTerminalTask()) {
                appendOutput('Streaming stoppé (CTRL+C)', 'terminal-log');
            }
        }
    });

    // Focus input when clicking anywhere inside the terminal card (except interactive elements)
    // This makes it easier for users to click anywhere in the terminal to begin typing.
    const terminalCard = document.getElementById('card-terminal');
    if (terminalCard) {
        terminalCard.addEventListener('click', (e) => {
            // Only care about primary (left) clicks
            try {
                if (e.button && e.button !== 0) return;
            } catch (err) { /* ignore */ }
            // If the clicked element or an ancestor is an interactive element, don't steal focus
            let el = e.target;
            if (!el) return;
            if (!(el instanceof Element)) el = el.parentElement;
            try {
                if (el && el.closest && el.closest('a, button, input, textarea, select, [contenteditable], .copy-btn')) return;
            } catch (err) {}
            // Otherwise, focus and select the input so the user can type immediately
            try {
                input.focus();
                // If there's existing text, select it so it can be quickly replaced
                if (typeof input.select === 'function') input.select();
            } catch (err) { /* ignore */ }
        });
    }

}

// Auto-init when module loaded
document.addEventListener('DOMContentLoaded', () => {
    initTerminal();
});

export { initTerminal, processCommand };
