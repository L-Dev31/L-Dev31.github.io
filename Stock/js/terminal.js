import { fetchYahooSummary, fetchYahooFinancials, fetchYahooEarnings, fetchYahooDividends, fetchYahooOptions, fetchYahooAnalysis, fetchYahooNews, fetchFromYahoo } from './api/yahoo-finance.js';
import { calculateBotSignal } from './signal-bot.js';

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

function showHelp(target = null) {
    if (!target) {
        appendOutput('Tracker Terminal v0.1 ALPHA - Aide des commandes', 'terminal-help');
        appendOutput('<span class="term-cmd">SYMBOL</span> - Ouvrir/sélectionner un onglet par symbole (ex: AAPL, BTC).', 'terminal-help', true);
        appendOutput('<span class="term-cmd">NEWS</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Ouvrir l\'overlay d\'actualités pour le symbole', 'terminal-help', true);
        appendOutput('<span class="term-cmd">DES</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Afficher la description (Summary/Profile)', 'terminal-help', true);
        appendOutput('<span class="term-cmd">GP</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> [PERIOD] - Ouvrir graphique historique', 'terminal-help', true);
        appendOutput('<span class="term-cmd">GIP</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Démarrer streaming intraday (CTRL+C pour arrêter)', 'terminal-help', true);
        appendOutput('<span class="term-cmd">HDS</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> [PERIOD] - Afficher données historiques', 'terminal-help', true);
        appendOutput('<span class="term-cmd">FA</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Afficher états financiers', 'terminal-help', true);
        appendOutput('<span class="term-cmd">ANR</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Avis analystes', 'terminal-help', true);
        appendOutput('<span class="term-cmd">ERN</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Résultats (earnings)', 'terminal-help', true);
        appendOutput('<span class="term-cmd">DVD</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Derniers dividendes', 'terminal-help', true);
        appendOutput('<span class="term-cmd">OMON</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Chaîne d\'options', 'terminal-help', true);
        appendOutput('<span class="term-cmd">RV</span> <span class="term-cmd">TICKER1</span> <span class="term-cmd">TICKER2</span> ... - Comparaison valeur relative (P/E, CA)', 'terminal-help', true);
        appendOutput('<span class="term-cmd">GO</span> - Actualiser le symbole actif', 'terminal-help', true);
        appendOutput('<span class="term-cmd">CLEAR</span> - Effacer l\'historique du terminal', 'terminal-help', true);
        appendOutput('<span class="term-cmd">HELP</span> <span class="term-cmd">[COMMANDE]</span> - Afficher l\'aide; ex: <span class="term-cmd">HELP NEWS</span>', 'terminal-help', true);
        appendOutput('Astuces: Entrez simplement un symbole pour basculer vers son onglet.', 'terminal-help');
        appendOutput('Exemples: <span class="term-cmd">AAPL</span> | <span class="term-cmd">NEWS AAPL</span> | <span class="term-cmd">GO</span> | <span class="term-cmd">CLEAR</span> | <span class="term-cmd">HELP NEWS</span>', 'terminal-help', true);
        return;
    }
    const cmd = target.toUpperCase();
    switch (cmd) {
        case 'DES':
            appendOutput('<span class="term-cmd">DES</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Affiche la description/summary du symbole', 'terminal-help', true);
            appendOutput('Ex: <span class="term-cmd">DES AAPL</span>', 'terminal-help', true);
            break;
        case 'NEWS':
                    case 'GP':
                        appendOutput('<span class="term-cmd">GP</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> [PERIOD] - Ouvre le graphique historique pour le symbole', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">GP AAPL 1Y</span>', 'terminal-help', true);
                        break;
                    case 'GIP':
                        appendOutput('<span class="term-cmd">GIP</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Lance un streaming intraday; appuyez sur CTRL+C pour arrêter', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">GIP AAPL</span>', 'terminal-help', true);
                        break;
                    case 'HDS':
                        appendOutput('<span class="term-cmd">HDS</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> [PERIOD] - Données historiques', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">HDS AAPL 5Y</span>', 'terminal-help', true);
                        break;
                    case 'FA':
                        appendOutput('<span class="term-cmd">FA</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - États financiers', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">FA AAPL</span>', 'terminal-help', true);
                        break;
                    case 'ANR':
                        appendOutput('<span class="term-cmd">ANR</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Avis analystes', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">ANR AAPL</span>', 'terminal-help', true);
                        break;
                    case 'ERN':
                        appendOutput('<span class="term-cmd">ERN</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Résultats', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">ERN AAPL</span>', 'terminal-help', true);
                        break;
                    case 'DVD':
                        appendOutput('<span class="term-cmd">DVD</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Dividendes historiques', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">DVD AAPL</span>', 'terminal-help', true);
                        break;
                    case 'OMON':
                        appendOutput('<span class="term-cmd">OMON</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Options (chain)', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">OMON AAPL</span>', 'terminal-help', true);
                        break;
                    case 'RV':
                        appendOutput('<span class="term-cmd">RV</span> <span class="term-cmd">TICKER1</span> <span class="term-cmd">TICKER2</span> - Compare P/E and revenue', 'terminal-help', true);
                        appendOutput('Ex: <span class="term-cmd">RV AAPL MSFT</span>', 'terminal-help', true);
                        break;
            appendOutput('<span class="term-cmd">NEWS</span> <span class="term-cmd">&lt;SYMBOL&gt;</span> - Récupère et ouvre l\'overlay des actualités pour <span class="term-cmd">SYMBOL</span>', 'terminal-help', true);
            appendOutput('Ex: <span class="term-cmd">NEWS AAPL</span>', 'terminal-help', true);
            break;
        case 'GO':
            appendOutput('<span class="term-cmd">GO</span> - Rafraîchit le suivi du symbole actif (si présent)', 'terminal-help', true);
            appendOutput('Ex: <span class="term-cmd">GO</span>', 'terminal-help', true);
            break;
        case 'CLEAR':
            appendOutput('<span class="term-cmd">CLEAR</span> - Efface toutes les lignes du terminal', 'terminal-help', true);
            appendOutput('Ex: <span class="term-cmd">CLEAR</span>', 'terminal-help', true);
            break;
        case 'HELP':
            appendOutput('<span class="term-cmd">HELP</span> <span class="term-cmd">[COMMANDE]</span> - Affiche l\'aide du terminal. Sans argument affiche toutes les commandes', 'terminal-help', true);
            appendOutput('Ex: <span class="term-cmd">HELP NEWS</span>', 'terminal-help', true);
            break;
        default:
            appendOutput(`Aide non disponible pour: ${cmd}. Entrez HELP pour la liste des commandes.`, 'terminal-help');
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
            if (posMap[raw]) return { symbol: raw, ticker: (posMap[raw].api_mapping && posMap[raw].api_mapping.yahoo) || posMap[raw].ticker || raw };
            for (const [sym, p] of Object.entries(posMap)) {
                if ((p.ticker || '').toUpperCase() === raw) return { symbol: sym, ticker: (p.api_mapping && p.api_mapping.yahoo) || p.ticker || raw };
                if ((p.api_mapping && (p.api_mapping.yahoo || '').toUpperCase()) === raw) return { symbol: sym, ticker: p.api_mapping.yahoo };
            }
            return { symbol: null, ticker: raw };
        }
        const active = window.getActiveSymbol && window.getActiveSymbol();
        if (active && posMap[active]) return { symbol: active, ticker: (posMap[active].api_mapping && posMap[active].api_mapping.yahoo) || posMap[active].ticker || active };
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
                window.openNewsOverlay(internalSym);
            } catch (err) { appendOutput(`Erreur: ${err?.message || err}`); }
        } else {
            // fallback: try fetching yahoo news with ticker
            appendOutput(`Récupération des actualités pour ${yahooTicker} ...`);
            try {
                const config = await loadApiConfig();
                const r = await fetchNews(yahooTicker, config);
                appendOutput(`Actualités récupérées pour ${yahooTicker} (${(r?.items||[]).length || 0} items)`);
                window.openNewsOverlay(internalSym || null);
            } catch (err) { appendOutput(`Erreur: ${err?.message || err}`); }
        }
            // keep input prompt in the input control (no log prompt appended)
        return;
    }
    // (removed duplicate incomplete DES block)
    if (cmd === 'CLEAR') {
        const out = document.getElementById(outputId);
        if (out) out.innerHTML = '';
        // Remettre les messages de début
        appendOutput('Tracker Terminal v0.1 ALPHA');
        appendOutput('use <span class="term-cmd">HELP</span> for list of commands', 'terminal-log', true);
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

    if (cmd === 'DES') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: DES <SYMBOL>'); return; }
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`Récupération des détails pour ${yahooTicker}...`);
        try {
            const r = await fetchYahooSummary(yahooTicker, null);
            if (r && !r.error) {
                const profile = r.summary || {};
                // Debug: if there's no profile, try to show price info or raw data
                if (!profile || Object.keys(profile).length === 0) {
                    if (r.price) {
                        const price = r.price;
                        appendOutput(`Prix actuel: ${price.regularMarketPrice?.raw || price.regularMarketPrice || '--'} (${price.currency || ''})`, 'terminal-log', true);
                    } else {
                        appendOutput('Aucun profil disponible; tentative de récupérer des actualités et des informations de base...');
                        try {
                            const news = await fetchYahooNews(yahooTicker, 5, null);
                            if (news && news.items && news.items.length) {
                                appendOutput(`Dernières actualités: ${news.items.slice(0,3).map(i => i.title).join(' | ')}`, 'terminal-log', true);
                            }
                        } catch (err) { /* ignore */ }
                        appendOutput('Affichage brut (voir console)');
                        appendOutput(JSON.stringify(r).slice(0, 1000), 'terminal-log', true);
                    }
                }
                const out = [];
                out.push(`<strong>${profile.longBusinessSummary ? (profile.longBusinessSummary.slice(0, 200) + (profile.longBusinessSummary.length>200?'...':'')) : (profile.longBusinessSummary || '')}</strong>`);
                if (profile.sector) out.push(`Secteur: ${profile.sector}`);
                if (profile.industry) out.push(`Industrie: ${profile.industry}`);
                if (profile.fullTimeEmployees) out.push(`Employés: ${profile.fullTimeEmployees}`);
                if (profile.website) out.push(`<a href="${profile.website}" target="_blank" rel="noopener noreferrer">${profile.website}</a>`);
                appendOutput(out.join(' | '), 'terminal-log', true);
            } else {
                appendOutput(`Aucun détail trouvé pour ${yahooTicker}`);
                if (r && r.error) appendOutput(`Erreur: ${r.errorCode || r.errorMessage || 'unknown'}`);
            }
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
        return;
    }

    if (cmd === 'GP') {
        const resolved = getTargetSymbol(parts);
        if (!resolved || !resolved.ticker) { appendOutput('Usage: GP <SYMBOL> [PERIOD]'); return; }
        const period = (parts[2] || '1Y').toUpperCase();
        const yahooTicker = resolved.ticker;
        const internalSym = resolved.symbol;
        appendOutput(`(debug) resolved -> internal: ${internalSym || '(none)'}, ticker: ${yahooTicker}`);
        if (internalSym && window.positions && window.positions[internalSym]) {
            window.positions[internalSym].currentPeriod = period;
            const tab = document.querySelector(`.tab[data-symbol="${internalSym}"]`);
            if (tab) tab.click();
            appendOutput(`Ouverture du graphique ${yahooTicker} (${internalSym}) période ${period}`);
            try { await window.fetchActiveSymbol(true); } catch(e) { /* ignore */ }
        } else {
            // fallback: attempt to find a position by ticker; if not, just fetch data using yahooTicker
            appendOutput(`Symbole non trouvé dans les positions: ${yahooTicker}. Affichage en mode lecture seule.`);
            // try to update a temporary or fallback card? For now, we just fetch to ensure data is reachable
            try { await fetchFromYahoo(yahooTicker, period, yahooTicker, null, null, null); appendOutput('Données récupérées (check console/updates).'); } catch (e) { appendOutput(`Erreur GP: ${e?.message || e}`); }
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
            try { await window.fetchActiveSymbol(true); } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur: ${e?.message || e}`); }
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
        } catch (e) { appendOutput(`Erreur RV: ${e?.message || e}`); }
        return;
    }

    // SYMBOL-only: open tab (fallback if not a recognized keyword)
    if (/^[A-Z0-9.\-]{1,8}$/.test(cmd)) {
        const sym = cmd;
        const tab = document.querySelector(`.tab[data-symbol="${sym}"]`);
        if (tab) {
            tab.click();
            appendOutput(`Ouvert / sélectionné : ${sym}`);
        } else {
            appendOutput(`Symbole non trouvé : ${sym}`);
        }
        // keep input prompt in the input control (no log prompt appended)
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
    appendOutput('Tracker Terminal v0.1 ALPHA');
    appendOutput('use <span class="term-cmd">HELP</span> for list of commands', 'terminal-log', true);

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

}

// Auto-init when module loaded
document.addEventListener('DOMContentLoaded', () => {
    initTerminal();
});

export { initTerminal, processCommand };
