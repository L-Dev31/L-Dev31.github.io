import { positions, selectedApi, lastApiBySymbol, getCurrency, globalPeriod } from '../core/state.js';
import { typeLabel, periodPhrase } from '../core/constants.js';
import { calculateStockValues, recordTrade, deleteTrade } from './portfolio.js';
import { fetchActiveSymbol } from '../core/general.js';
import { updateChart, initChart } from './chart.js';
import { updateSignal } from '../quant/signal-bot.js';
import { setupNewsSearch } from './news.js';
import { resolveTickerDetails } from '../data/ticker-catalog.js';
import { handleImageAssetError } from '../data/assets.js';
import { getEl, el, icon, formatCurrency, formatPct, showCard, termHtml } from '../core/utils.js';
import { L, Ln, LANG, LOCALE } from '../i18n/i18n.js';
import { currentBank, orderFee, isEstimate, marketFor, formatMoney } from '../data/banks.js';
import { flagUrl } from '../data/country.js';

export { initChart };

let regionNames = null;
export function countryName(code) {
    if (!code || code.length !== 2) return code || '';
    try { regionNames ||= new Intl.DisplayNames([LANG], { type: 'region' }); return regionNames.of(code.toUpperCase()) || code; } catch { return code; }
}

const BENCH = { USD: ['^GSPC', 'S&P 500'], EUR: ['^FCHI', 'CAC 40'] };
export function benchFor(symbol) {
    const p = positions[symbol];
    const cur = String(p?.currency || p?.raw?.currency || p?.lastData?.currency || '').toUpperCase();
    const [sym, label] = BENCH[cur] || (/^(FR|DE|NL|BE|IT|ES|PT|IE|FI|AT)$/i.test(p?.raw?.country || '') ? BENCH.EUR : BENCH.USD);
    return { symbol: sym, label };
}

/* ── sidebar rows ── */
const heldShares = symbol => (positions[symbol]?.shares ?? 0) > 0;
let rowOrder = 0;

function ensureGroup(containerId, type) {
    const container = getEl(containerId);
    if (!container) return null;
    const id = `${containerId}-${type}`;
    let group = getEl(id);
    if (!group) {
        group = el('div', 'tab-group');
        group.id = id;
        group.dataset.type = type;
        group.append(el('h3', 'group-title', typeLabel(type)));
        container.append(group);
    }
    return group;
}

function fillRow(tab, stock) {
    const pos = positions[stock.symbol];
    tab.querySelector('.tab-name').textContent = pos?.name || stock.name || stock.symbol;
    const shares = pos?.shares ?? calculateStockValues(stock).shares;
    tab.querySelector('.tab-sub').textContent = shares > 0 ? Ln(shares, '{0} share', '{0} shares') : (stock.ticker || stock.symbol);
    tab.classList.toggle('is-paused', !!pos?.suspended);
    tab.hidden = !!pos?.suspended && !(shares > 0);
}

function buildRow(stock) {
    const tab = getEl('tab-template').content.firstElementChild.cloneNode(true);
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker || stock.symbol;
    tab.dataset.order = String(rowOrder++);
    const img = tab.querySelector('img');
    img.src = `img/icon/${stock.symbol}.png`;
    img.onerror = () => handleImageAssetError(img, stock.ticker || stock.symbol, stock.market);
    fillRow(tab, stock);
    return tab;
}

/** Puts every row of a symbol in "My stocks" or "Watchlist", keeping the original order. */
export function placeTabs(symbol) {
    const pos = positions[symbol];
    if (!pos) return;
    const held = heldShares(symbol);
    for (const tab of document.querySelectorAll(`.tab[data-symbol="${CSS.escape(symbol)}"]`)) {
        const mobile = !!tab.closest('#card-home');
        const target = ensureGroup(`${mobile ? 'mobile-' : ''}${held ? 'portfolio' : 'general'}-tabs`, pos.type || 'equity');
        fillRow(tab, pos.raw || pos);
        if (tab.parentElement !== target) {
            const after = [...target.querySelectorAll('.tab')].find(t => Number(t.dataset.order) > Number(tab.dataset.order));
            target.insertBefore(tab, after || null);
        }
    }
    for (const group of document.querySelectorAll('.tab-group')) group.hidden = !group.querySelector('.tab:not([hidden])');
}

export function createTab(stock) {
    const held = calculateStockValues(stock).shares > 0;
    const type = stock.type || 'equity';
    for (const prefix of ['', 'mobile-']) {
        const group = ensureGroup(`${prefix}${held ? 'portfolio' : 'general'}-tabs`, type);
        if (group) group.append(buildRow(stock));
    }
}

export function updateSidebarPerformance(symbol) {
    const d = positions[symbol]?.lastData;
    const has = d && Number.isFinite(d.changePercent);
    for (const tab of document.querySelectorAll(`.tab[data-symbol="${CSS.escape(symbol)}"]`)) {
        const c = tab.querySelector('.tab-change');
        c.textContent = has ? formatPct(d.changePercent) : '';
        c.className = `tab-change${has ? (d.changePercent >= 0 ? ' positive' : ' negative') : ''}`;
        c.title = has ? periodPhrase(globalPeriod) : '';
        tab.classList.toggle('is-up', has && d.changePercent > 0);
        tab.classList.toggle('is-down', has && d.changePercent < 0);
    }
}

const SUSPENDED_PREFIX = 'nemeris_suspended_';
export const isSymbolSuspendedInStorage = symbol => { try { return localStorage.getItem(SUSPENDED_PREFIX + symbol) === '1'; } catch { return false; } };

function setSuspended(symbol, on) {
    const pos = positions[symbol];
    if (!pos || !!pos.suspended === on) return;
    pos.suspended = on;
    try { on ? localStorage.setItem(SUSPENDED_PREFIX + symbol, '1') : localStorage.removeItem(SUSPENDED_PREFIX + symbol); } catch { /* ignore */ }
    placeTabs(symbol);
}
export const markTabAsSuspended = symbol => setSuspended(symbol, true);
export const unmarkTabAsSuspended = symbol => setSuspended(symbol, false);

/* ── stock page ── */
export function createCard(stock) {
    const sym = stock.symbol;
    // Idempotent: drop a stale card with the same id (and its charts) instead of
    // duplicating ids when a ticker page is rebuilt mid-load.
    const stale = getEl(`card-${sym}`);
    if (stale) {
        try {
            for (const c of stale.querySelectorAll('canvas')) window.Chart?.getChart(c)?.destroy();
        } catch (_) {}
        stale.remove();
    }
    const card = getEl('view-template').content.firstElementChild.cloneNode(true);
    card.id = `card-${sym}`;

    const logo = card.querySelector('.tk-logo img');
    logo.dataset.symbol = sym;
    logo.src = `img/icon/${sym}.png`;
    logo.onerror = () => handleImageAssetError(logo, stock.ticker || sym, stock.market);

    card.querySelector('.tk-name').textContent = stock.name || sym;
    card.querySelector('.tk-sub-text').textContent = [stock.ticker || sym, countryName(stock.country)].filter(Boolean).join(' · ');
    const flag = card.querySelector('.flag');
    if (stock.country) {
        flag.src = stock.country.length === 2 ? flagUrl(stock.country) : `img/flag/${stock.country.toLowerCase()}.png`;
        flag.onload = () => { flag.hidden = false; };
        flag.onerror = () => flag.remove();
    } else flag.remove();

    card.querySelector('.tk-period').textContent = periodPhrase(globalPeriod);
    card.querySelector('.tk-range-period').textContent = periodPhrase(globalPeriod);
    card.querySelector('.period-select').dataset.symbol = sym;
    card.querySelector('.chart-canvas').id = `chart-${sym}`;
    card.querySelector('.performance-value').id = `perf-${sym}`;
    card.querySelector('.update-center').id = `update-center-${sym}`;
    card.querySelector('.news-list').id = `news-list-${sym}`;
    getEl('cards-container').append(card);
    renderTrades(card, sym);
    setupNewsSearch(sym);
}

function tradeList(symbol) {
    const pos = positions[symbol];
    if (!pos) return [];
    const list = [
        ...(pos.purchases || []).map(t => ({ ...t, side: 'buy' })),
        ...(pos.sales || []).map(t => ({ ...t, side: 'sell' })),
    ];
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function renderTrades(card, symbol) {
    card ||= getEl(`card-${symbol}`);
    const host = card?.querySelector('.trades');
    if (!host) return;
    const cur = getCurrency();
    const trades = tradeList(symbol);
    host.replaceChildren();
    if (!trades.length) {
        host.append(el('p', 'empty', L('Bought it? Add the trade and Nemeris tracks it.')));
    }
    for (const t of trades) {
        const row = el('div', `row trade-row ${t.side === 'buy' ? 'is-buy' : 'is-sell'}`);
        const main = el('div', 'row-main');
        const shares = Number(t.shares) || 0;
        main.append(
            el('span', 'row-title', t.side === 'buy' ? Ln(shares, 'Bought {0} share', 'Bought {0} shares') : Ln(shares, 'Sold {0} share', 'Sold {0} shares')),
            el('span', 'row-sub', new Date(t.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })),
        );
        const end = el('div', 'row-end');
        const amount = Math.abs(Number(t.amount) || 0);
        end.append(el('span', 'row-value', formatCurrency(amount, cur)), el('span', 'row-sub', shares ? L('{0} each', formatCurrency(amount / shares, cur)) : ''));
        row.append(main, end);
        if (t.local) {
            const del = el('button', 'icon-btn trade-del');
            del.type = 'button';
            del.dataset.trade = t.id;
            del.setAttribute('aria-label', L('Delete this trade'));
            del.title = L('Delete this trade');
            del.append(icon('delete'));
            row.append(del);
        }
        host.append(row);
    }
}

// What this order costs at the user's bank, and what share of the order that is.
function showOrderFee(form, pos) {
    const note = form.querySelector('.trade-fee');
    const bank = currentBank();
    const amount = Number(form.amount.value || form.amount.placeholder);
    const fee = bank && amount > 0 ? orderFee(bank, amount, marketFor(pos?.currency)) : null;
    note.hidden = fee == null;
    if (fee == null) return;
    const share = fee / amount * 100;
    const cost = `${isEstimate(bank, marketFor(pos?.currency)) ? '≈ ' : ''}${formatMoney(fee, bank.currency)}`;
    note.textContent = L('At {0}, this order costs {1} in fees, {2}% of it.', bank.name, cost, share.toLocaleString(LOCALE, { maximumFractionDigits: share < 1 ? 2 : 1 }))
        + (share >= 1 ? ` ${L('That is a lot: grouping small orders into fewer, bigger ones costs less.')}` : '');
}

function tradeForm(card, symbol) {
    const cur = getCurrency();
    const form = el('form', 'trade-form');
    form.innerHTML = `
        <fieldset class="seg">
            <legend class="sr-only">${L('Buy or sell')}</legend>
            <label><input type="radio" name="side" value="buy" checked><span>${L('I bought')}</span></label>
            <label><input type="radio" name="side" value="sell"><span>${L('I sold')}</span></label>
        </fieldset>
        <div class="trade-fields">
            <label class="field"><span>Date</span><input name="date" type="date" required></label>
            <label class="field"><span>${L('Shares')}</span><input name="shares" type="number" min="0" step="any" inputmode="decimal" required></label>
            <label class="field"><span class="amount-label">${L('Total paid, fees included')}</span><span class="input-unit"><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" required><span class="unit">${cur}</span></span></label>
        </div>
        <p class="meta trade-fee" hidden></p>
        <div class="form-foot">
            <button class="btn btn-quiet" type="button" data-cancel>${L('Cancel')}</button>
            <button class="btn btn-primary" type="submit">${L('Save')}</button>
        </div>`;
    form.date.value = new Date().toISOString().slice(0, 10);
    form.date.max = form.date.value;
    const price = positions[symbol]?.lastData?.price;
    form.addEventListener('input', e => {
        if (e.target.name === 'side') form.querySelector('.amount-label').textContent = form.side.value === 'buy' ? L('Total paid, fees included') : L('Total received, after fees');
        if (e.target.name === 'shares' && price > 0) form.amount.placeholder = (Number(form.shares.value) * price).toFixed(2);
        showOrderFee(form, positions[symbol]);
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => form.remove());
    form.addEventListener('submit', e => {
        e.preventDefault();
        const shares = Number(form.shares.value), amount = Number(form.amount.value || form.amount.placeholder);
        if (!(shares > 0) || !(amount > 0)) return;
        recordTrade(symbol, { side: form.side.value, date: form.date.value, shares, amount });
        form.remove();
    });
    return form;
}

document.addEventListener('click', e => {
    const add = e.target.closest('.add-trade-btn');
    if (add) {
        const card = add.closest('.ticker-card');
        const slot = card.querySelector('.trade-form-slot');
        if (!slot.firstChild) slot.append(tradeForm(card, card.id.slice(5)));
        slot.querySelector('input[name="shares"]')?.focus();
        return;
    }
    const del = e.target.closest('.trade-del');
    if (del) deleteTrade(del.closest('.ticker-card').id.slice(5), del.dataset.trade);
});

/** Refreshes everything on a stock page that depends on the trades. */
export function refreshPositionViews(symbol) {
    const card = getEl(`card-${symbol}`);
    if (!card) return;
    renderTrades(card, symbol);
    renderPositionSummary(card, symbol, positions[symbol]?.lastData?.price);
}

function renderPositionSummary(card, symbol, price) {
    const host = card?.querySelector('.pos-summary');
    const pos = positions[symbol];
    if (!host || !pos) return;
    const shares = pos.shares || 0;
    if (!(shares > 0) || !(price > 0)) { host.replaceChildren(); return; }
    const cur = getCurrency();
    const value = shares * price;
    const cost = pos.costBasis || 0;
    const gain = value - cost;
    const pct = cost > 0 ? (gain / cost) * 100 : 0;
    const tone = gain >= 0 ? 'positive' : 'negative';
    host.innerHTML = `
        <h2 class="sr-only">${L('Your position')}</h2>
        <div class="kpi-row">
            <div class="kpi kpi-hero"><span class="kpi-label">${L('Worth now')}</span><span class="kpi-value">${formatCurrency(value, cur)}</span><span class="kpi-sub">${Ln(shares, '{0} share at {1}', '{0} shares at {1}', formatCurrency(price, cur))}</span></div>
            <div class="kpi"><span class="kpi-label">${L('You put in')}</span><span class="kpi-value">${formatCurrency(cost, cur)}</span><span class="kpi-sub">${L('{0} per share on average', formatCurrency(cost / shares, cur))}</span></div>
            <div class="kpi"><span class="kpi-label">${gain >= 0 ? L('You gained') : L('You lost')}</span><span class="kpi-value ${tone}">${gain >= 0 ? '+' : ''}${formatCurrency(gain, cur)}</span><span class="kpi-sub ${tone}">${L('{0} on what you put in', formatPct(pct))}</span></div>
        </div>`;
}

function renderRange(card, data) {
    const host = card?.querySelector('.tk-range');
    if (!host) return;
    const { low, high, open, price } = data || {};
    if (!(low > 0 && high >= low && price > 0 && open > 0)) { host.innerHTML = L('<p class="empty">No range for this period yet.</p>'); return; }
    const cur = getCurrency();
    const span = Math.max(high - low, 1e-9);
    const at = v => Math.max(0, Math.min(100, ((v - low) / span) * 100));
    const tone = price >= open ? 'positive' : 'negative';
    host.innerHTML = `
        <div class="rng-track" role="img" aria-label="${L('Lowest {0}, highest {1}, now {2}', formatCurrency(low, cur), formatCurrency(high, cur), formatCurrency(price, cur))}">
            <span class="rng-fill ${tone}" style="left:${Math.min(at(open), at(price)).toFixed(2)}%;width:${Math.abs(at(price) - at(open)).toFixed(2)}%"></span>
            <span class="rng-open" style="left:${at(open).toFixed(2)}%"></span>
            <span class="rng-now ${tone}" style="left:${at(price).toFixed(2)}%"></span>
        </div>
        <div class="rng-labels">
            <span><small>${L('Lowest')}</small>${formatCurrency(low, cur)}</span>
            <span><small>${L('At the start')}</small>${formatCurrency(open, cur)}</span>
            <span><small>${L('Highest')}</small>${formatCurrency(high, cur)}</span>
        </div>`;
}

function renderSource(symbol, data) {
    const host = getEl(`update-center-${symbol}`);
    if (!host) return;
    const last = data.timestamps?.length ? data.timestamps[data.timestamps.length - 1] : null;
    const when = last ? new Date(last * 1000) : null;
    const age = when ? Math.round((Date.now() - when.getTime()) / 60000) : null;
    const fresh = data.fromCache ? L('Saved copy') : age == null ? '' : age <= 20 ? L('Live, slightly delayed') : age < 1440 ? L('Updated {0} min ago', age) : L('Updated {0} d ago', Math.round(age / 1440));
    const src = String(data.source || 'yahoo').replace(/-.*/, '');
    const isin = positions[symbol]?.raw?.isin || positions[symbol]?.isin;
    host.innerHTML = [fresh, `Source ${src.charAt(0).toUpperCase()}${src.slice(1)}`, when ? when.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '', isin ? `${termHtml('isin', 'ISIN')} ${isin}` : '', L('Not financial advice')]
        .filter(Boolean).join(' · ');
}

export function updateUI(symbol, data) {
    const pos = positions[symbol];
    if (!pos) return;
    if (!data || data.error) { clearPeriodDisplay(symbol); return; }
    const card = getEl(`card-${symbol}`);
    card?.querySelector('.chart-container')?.classList.remove('empty');

    if (data.timestamps && data.prices) updateChart(symbol, data.timestamps, data.prices, positions, data.source, data);

    const cur = getCurrency();
    const period = pos.currentPeriod || globalPeriod;
    if (card) {
        card.querySelector('.tk-price').textContent = data.price ? formatCurrency(data.price, cur) : '--';
        card.querySelector('.tk-period').textContent = periodPhrase(period);
        renderRange(card, data);
        renderPositionSummary(card, symbol, data.price);
    }
    const perf = getEl(`perf-${symbol}`);
    if (perf) {
        const has = Number.isFinite(data.changePercent);
        perf.textContent = has ? formatPct(data.changePercent) : '--';
        perf.className = `performance-value${has ? (data.changePercent >= 0 ? ' positive' : ' negative') : ''}`;
    }
    renderSource(symbol, data);

    if (data.name && pos.name === symbol) pos.name = data.name;
    if (card) card.querySelector('.tk-name').textContent = pos.name || symbol;
    for (const t of document.querySelectorAll(`.tab[data-symbol="${CSS.escape(symbol)}"] .tab-name`)) t.textContent = pos.name || symbol;

    const sig = updateSignal(symbol, data, { period });
    if (sig) {
        const ld = pos.lastData || (pos.lastData = {});
        ld.score = sig.signalValue;
        ld.riskScore = sig.risk?.score ?? 1;
    }
    updateSidebarPerformance(symbol);
}

export function clearPeriodDisplay(symbol) {
    const pos = positions[symbol];
    if (!pos) return;
    const chart = pos.chart;
    if (chart) {
        chart.data.labels = [];
        chart.data.datasets.forEach(d => { d.data = []; });
        chart.data.timestamps = [];
        try { chart.update('none'); } catch { /* chart gone */ }
    }
    const card = getEl(`card-${symbol}`);
    if (!card) return;
    card.querySelector('.tk-price').textContent = '--';
    const perf = getEl(`perf-${symbol}`);
    perf.textContent = '--';
    perf.className = 'performance-value';
    getEl(`update-center-${symbol}`).textContent = '';
    const box = card.querySelector('.chart-container');
    box.classList.add('empty');
    box.querySelector('.chart-empty-text').textContent = L('No data for this period');
    card.querySelector('.explanation-content').innerHTML = L('<p class="empty">No price data for this period, so no signal.</p>');
}

let beforeTerminal = null;
/** focus: false when the assistant shows a result there, so the user's typing stays in the chat. */
export function openTerminalCard(prefill = '', { focus = true } = {}) {
    const card = getEl('card-terminal');
    const input = getEl('terminal-input');
    if (!card || !input) return;
    const current = document.querySelector('.card.active');
    if (current !== card) beforeTerminal = current;
    showCard(card);
    if (focus) {
        input.value = prefill;
        input.focus();
        input.setSelectionRange(prefill.length, prefill.length);
    }
    const out = getEl('terminal-output');
    out.scrollTop = out.scrollHeight;
}

export function closeTerminalCard() {
    const card = getEl('card-terminal');
    if (!card?.classList.contains('active')) return false;
    showCard(beforeTerminal?.isConnected ? beforeTerminal : window.innerWidth < 900 ? 'card-home' : 'card-portfolio');
    beforeTerminal = null;
    return true;
}

export async function openCustomSymbol(symbol, type = 'equity', itemData = null) {
    if (!positions[symbol]) {
        const resolved = itemData || await resolveTickerDetails(symbol, { type });
        const stock = {
            symbol, ticker: resolved.ticker || symbol, name: resolved.name || symbol, type: resolved.type || type,
            currency: resolved.currency || 'USD', country: resolved.country || '', isin: resolved.isin || '', purchases: [], sales: [],
        };
        positions[symbol] = {
            ...stock, shares: 0, investment: 0, costBasis: 0, realizedPL: 0, purchaseDate: null,
            news: [], lastNewsFetch: 0, chart: null, lastFetch: 0, lastData: null,
            currentPeriod: String(resolved.period || globalPeriod || '1W').toUpperCase(), raw: stock,
        };
        const q = resolved.quote;
        if (q) positions[symbol].lastData = { price: q.regularMarketPrice || q.price || 0, change: q.regularMarketChange || 0, changePercent: q.regularMarketChangePercent || 0, name: q.longName || q.shortName || symbol, currency: q.currency || stock.currency, source: 'yahoo-quote' };
        else if (itemData?.price !== undefined) positions[symbol].lastData = { ...itemData };
        lastApiBySymbol[symbol] = selectedApi;
        createTab(stock);
        createCard(stock);
        initChart(symbol, positions);
    } else if (itemData) positions[symbol].lastData = { ...itemData };
    showCard(`card-${symbol}`);
    syncBackButton(symbol);
    if (positions[symbol].lastData) updateUI(symbol, positions[symbol].lastData);
    fetchActiveSymbol(true);
}

/** Top-left way back, only when this ticker was opened from the Explorer. */
function syncBackButton(symbol) {
    const card = getEl(`card-${symbol}`);
    if (!card) return;
    card.querySelector('.tk-back-row')?.remove();
    const from = window.__navFrom;
    window.__navFrom = null;
    if (from !== 'explorer' || typeof window.explorerModule?.openExplorer !== 'function') return;
    card.dataset.from = 'explorer';
    const row = el('div', 'tk-back-row');
    const back = el('button', 'btn btn-quiet tk-back');
    back.type = 'button';
    back.append(icon('chevron-left'), el('span', null, L('Back to Explorer')));
    back.setAttribute('aria-label', L('Back to Explorer'));
    back.addEventListener('click', () => window.explorerModule.openExplorer());
    row.append(back);
    card.prepend(row);
}
