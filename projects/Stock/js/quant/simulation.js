import { runQuant } from './quant-client.js';
import { fetchCloses } from './quant-shared.js';
import { getCurrency, positions, getInvestor } from '../core/state.js';
import { el, progressBar } from '../core/utils.js';
import { currentBank, investmentCosts, marketFor, formatMoney } from '../data/banks.js';
import { L, Ln, LOCALE } from '../i18n/i18n.js';

export const HORIZONS = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '3Y': 756, '5Y': 1260 };
export const RETURN_MODELS = {
    market: { label: L('Like the market, +7% a year'), hint: L('The long-run average of stock markets') },
    none: { label: L('No trend, only ups and downs'), hint: L('Assumes the price goes nowhere on average') },
    history: { label: L('Its own past trend'), hint: L('This stock keeps its average return of the last 2 years') },
};
const PROFILE_HORIZON = { lt2: '1Y', '2to5': '3Y', '5to10': '5Y', gt10: '5Y' };
const DEFAULTS = { amount: 1000, horizon: '1Y', model: 'market', paths: 2000 };
const prefs = { ...DEFAULTS };
try {
    const inv = getInvestor();
    if (inv.monthly > 0) prefs.amount = Math.round(inv.monthly);
    if (PROFILE_HORIZON[inv.horizon]) prefs.horizon = PROFILE_HORIZON[inv.horizon];
    Object.assign(prefs, JSON.parse(localStorage.getItem('nemeris_sim_prefs') || '{}'));
} catch { /* defaults */ }
const savePrefs = () => { try { localStorage.setItem('nemeris_sim_prefs', JSON.stringify({ amount: prefs.amount, horizon: prefs.horizon, model: prefs.model })); } catch { /* ignore */ } };

export function normalizeHorizon(h) {
    const s = String(h || '').trim().toUpperCase().replace(/\s+/g, '');
    if (HORIZONS[s]) return s;
    const m = s.match(/^(\d+(?:[.,]\d+)?)(D|J|W|S|M|MO|MOIS|Y|A|AN|ANS|YR|YRS|YEAR|YEARS|MONTH|MONTHS|WEEK|WEEKS|DAY|DAYS)?$/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    const u = m[2] || 'D';
    let days;
    if (/^(Y|A|AN|ANS|YR|YRS|YEAR|YEARS)$/.test(u)) days = n * 252;
    else if (/^(M|MO|MOIS|MONTH|MONTHS)$/.test(u)) days = n * 21;
    else if (/^(W|S|WEEK|WEEKS)$/.test(u)) days = n * 5;
    else days = n;
    return Math.max(5, Math.min(1260, Math.round(days)));
}
const horizonDays = h => typeof h === 'number' ? h : (HORIZONS[h] || normalizeHorizon(h) || 252);
export function horizonLabel(h) {
    if (typeof h === 'string' && HORIZONS[h]) return { '1W': L('1 week'), '1M': L('1 month'), '3M': L('3 months'), '6M': L('6 months'), '1Y': L('1 year'), '3Y': L('3 years'), '5Y': L('5 years') }[h];
    const d = horizonDays(h);
    if (d % 252 === 0) return Ln(d / 252, '{0} year', '{0} years');
    if (d % 21 === 0) return Ln(d / 21, '{0} month', '{0} months');
    return Ln(d, '{0} trading day', '{0} trading days');
}

function addTradingDays(date, n) {
    const d = new Date(date);
    let left = n;
    while (left > 0) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) left--;
    }
    return d;
}

/** Monte Carlo on the stock's own volatility of the last 2 years. Same inputs, same numbers. */
export async function simulate({ ticker, amount = prefs.amount, horizon = prefs.horizon, model = prefs.model, paths = DEFAULTS.paths, onStage }) {
    const days = horizonDays(horizon);
    onStage?.('history', null, L('Loading 2 years of {0} prices', ticker));
    const closes = await fetchCloses(ticker, '2y', '1d');
    if (closes.length < 60) throw new Error(L('Not enough price history for {0} ({1} days).', ticker, closes.length));
    const logRet = [];
    for (let i = 1; i < closes.length; i++) logRet.push(Math.log(closes[i] / closes[i - 1]));
    const histAnnual = logRet.reduce((s, x) => s + x, 0) / logRet.length * 252;
    let drift = 0;
    if (model === 'market') drift = Math.log(1.07);
    else if (model === 'history') drift = Math.max(-0.5, Math.min(0.5, histAnnual));
    onStage?.('run', null, L('{0} paths over {1}', paths.toLocaleString(LOCALE), horizonLabel(horizon)));
    const res = await runQuant('monteCarlo', closes, days, paths, { drift, seed: `${ticker}|${days}|${model}|${closes.length}|${closes[closes.length - 1]}` });
    if (!res) throw new Error(L('Simulation failed.'));
    const k = amount / res.S0;
    const now = new Date();
    const step = Math.max(1, Math.ceil(days / 160));
    const idx = [];
    for (let i = 0; i < days; i += step) idx.push(i);
    if (idx[idx.length - 1] !== days - 1) idx.push(days - 1);
    const pick = arr => [amount, ...idx.map(i => arr[i] * k)];
    const dates = [now, ...idx.map(i => addTradingDays(now, i + 1))];
    const pos = Object.values(positions).find(p => p?.ticker === ticker);
    const instrumentCurrency = pos?.currency || (ticker.endsWith('.PA') ? 'EUR' : '');
    const bank = currentBank();
    const costs = bank ? investmentCosts(bank, { amount, endValue: res.finalP50 * k, years: days / 252, market: marketFor(instrumentCurrency) }) : null;
    return {
        ticker, name: pos?.name || ticker, amount, horizon, days, model, paths,
        currency: getCurrency(), instrumentCurrency,
        costs: costs?.total != null ? { ...costs, bank: bank.name } : null,
        driftAnnual: Math.exp(drift) - 1, historicalAnnual: Math.exp(histAnnual) - 1, sigmaAnnual: res.annualizedSigma,
        series: { dates, p5: pick(res.p5), p25: pick(res.p25), p50: pick(res.p50), p75: pick(res.p75), p95: pick(res.p95) },
        final: {
            p5: res.finalP5 * k, p25: res.finalP25 * k, p50: res.finalP50 * k, p75: res.finalP75 * k, p95: res.finalP95 * k,
            mean: amount * (1 + res.expectedReturn),
        },
        probLoss: res.probLoss, probUp10: res.probUp10, probDown10: res.probDown10,
        sample: closes.length, lastPrice: res.S0,
    };
}

export function summarize(r) {
    const c = r.currency;
    const m = v => `${Math.round(v).toLocaleString(LOCALE)} ${c}`;
    const pc = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
    return {
        instrument: `${r.name} (${r.ticker})`,
        invested: m(r.amount),
        horizon: horizonLabel(r.horizon),
        expected_return_assumption: `${RETURN_MODELS[r.model].label} (${pc(r.driftAnnual)} a year)`,
        volatility_used: `${(r.sigmaAnnual * 100).toFixed(0)}% a year`,
        median_value: `${m(r.final.p50)} (${pc(r.final.p50 / r.amount - 1)})`,
        average_value: `${m(r.final.mean)} (${pc(r.final.mean / r.amount - 1)})`,
        range_90pct: `${m(r.final.p5)} to ${m(r.final.p95)}`,
        range_50pct: `${m(r.final.p25)} to ${m(r.final.p75)}`,
        chance_of_loss: `${Math.round(r.probLoss * 100)}%`,
        chance_gain_10pct_or_more: `${Math.round(r.probUp10 * 100)}%`,
        chance_loss_10pct_or_more: `${Math.round(r.probDown10 * 100)}%`,
        currency_note: r.instrumentCurrency && r.instrumentCurrency !== 'EUR' && c === '€' ? `Priced in ${r.instrumentCurrency}: exchange-rate moves are not included.` : '',
        costs_at_your_bank: r.costs
            ? `${m(r.costs.total)} at ${r.costs.bank} (buying ${r.costs.buy ?? 'unknown'}, selling ${r.costs.sell ?? 'unknown'}${r.costs.fx ? `, currency conversion ${r.costs.fx}` : ''}${r.costs.custody ? `, custody ${r.costs.custody}` : ''}${r.costs.estimate ? ', estimated' : ''}). Likely value after costs: ${m(r.final.p50 - r.costs.total)}.`
            : 'The user has not chosen a bank: order fees and custody are not included.',
        caveat: 'Statistical projection from past volatility, not a forecast.',
    };
}

const charts = new WeakMap();
const money = (v, c) => `${Math.round(v).toLocaleString(LOCALE)}\u00A0${c}`;
const signedPct = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
const tickerOf = symbol => positions[symbol]?.ticker || symbol;
const HORIZON_WORD = { '1W': L('1 week'), '1M': L('1 month'), '3M': L('3 months'), '6M': L('6 months'), '1Y': L('1 year'), '3Y': L('3 years'), '5Y': L('5 years') };
const HORIZON_SHORT = { '1W': '1S', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1A', '3Y': '3A', '5Y': '5A' };

function drawForm(params, onRun) {
    const cur = getCurrency();
    const form = el('form', 'sim-form');
    form.noValidate = true;
    const amountField = el('label', 'field');
    const unit = el('span', 'input-unit');
    const amount = el('input');
    amount.type = 'number';
    amount.min = '1';
    amount.step = '10';
    amount.inputMode = 'decimal';
    amount.value = String(params.amount);
    unit.append(amount, el('span', 'unit', cur));
    amountField.append(el('span', null, L('If I invest')), unit);

    const hz = el('div', 'field');
    hz.setAttribute('role', 'group');
    const hzLabel = el('span', null, L('Across'));
    hzLabel.id = `sim-for-${Math.random().toString(36).slice(2, 8)}`;
    hz.setAttribute('aria-labelledby', hzLabel.id);
    hz.append(hzLabel);
    const pills = el('div', 'pills');
    for (const h of Object.keys(HORIZONS)) {
        const b = el('button', `pill${h === params.horizon ? ' active' : ''}`, HORIZON_SHORT[h]);
        b.type = 'button';
        b.title = HORIZON_WORD[h];
        b.setAttribute('aria-pressed', String(h === params.horizon));
        b.addEventListener('click', () => { params.horizon = h; onRun(); });
        pills.append(b);
    }
    hz.append(pills);

    const modelField = el('label', 'field');
    const sel = el('select');
    for (const [k, v] of Object.entries(RETURN_MODELS)) { const o = new Option(v.label, k); o.title = v.hint; sel.append(o); }
    sel.value = params.model;
    sel.addEventListener('change', () => { params.model = sel.value; onRun(); });
    modelField.append(el('span', null, L('Growth to assume')), sel);

    form.append(amountField, hz, modelField);
    const commit = () => {
        const v = Number(amount.value);
        if (Number.isFinite(v) && v > 0 && v !== params.amount) { params.amount = v; onRun(); }
    };
    amount.addEventListener('change', commit);
    form.addEventListener('submit', e => { e.preventDefault(); commit(); });
    return form;
}

function scenario(tone, label, value, amount, c, hint) {
    const box = el('div', `scenario ${tone}`);
    const delta = value / amount - 1;
    box.append(el('span', 'scenario-label', label), el('span', 'scenario-value', money(value, c)), el('span', 'scenario-delta', signedPct(delta)));
    if (hint) box.append(el('span', 'meta', hint));
    return box;
}

function drawResult(box, r) {
    box.replaceChildren();
    const c = r.currency;
    const when = horizonLabel(r.horizon);
    const cards = el('div', 'scenarios');
    cards.append(
        scenario('negative', L('If things go badly'), r.final.p5, r.amount, c, L('1 chance in 20 of worse')),
        scenario('accent', L('Most likely'), r.final.p50, r.amount, c, L('Half the futures end above')),
        scenario('positive', L('If things go well'), r.final.p95, r.amount, c, L('1 chance in 20 of better')),
    );
    const lossPct = Math.round(r.probLoss * 100);
    const loss = el('div', 'loss-meter');
    const label = el('p', 'loss-label');
    label.innerHTML = L('<strong>{0}%</strong> chance of losing money', lossPct);
    const track = el('div', 'loss-track');
    const fill = el('span', 'loss-fill');
    fill.style.transform = `scaleX(${r.probLoss})`;
    track.append(fill);
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', L('{0} percent chance of a loss', lossPct));
    loss.append(label, track);

    const wrap = el('div', 'sim-chart');
    const canvas = el('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', L('Possible value of {0} over {1}: most likely {2}, between {3} and {4} in 9 cases out of 10.', money(r.amount, c), when, money(r.final.p50, c), money(r.final.p5, c), money(r.final.p95, c)));
    wrap.append(canvas);

    const note = el('p', 'meta sim-note');
    const bits = [L('{0} simulated futures from 2 years of prices.', r.paths.toLocaleString(LOCALE))];
    if (r.instrumentCurrency && r.instrumentCurrency !== 'EUR' && c === '€') bits.push(L('{0} price: exchange rate not included.', r.instrumentCurrency));
    bits.push(L('A range, not a promise.'));
    note.textContent = bits.join(' ');

    box.append(cards, loss);
    if (r.costs) {
        const costs = el('p', 'sim-costs');
        const parts = [L('buying'), L('selling'), r.costs.fx ? L('currency conversion') : null, r.costs.custody ? L('custody') : null].filter(Boolean).join(', ');
        costs.textContent = L('Fees at {0}: {1} ({2}). Most likely after fees: {3}.', r.costs.bank, `${r.costs.estimate ? '≈ ' : ''}${formatMoney(r.costs.total, r.costs.currency)}`, parts, money(r.final.p50 - r.costs.total, c));
        box.append(costs);
    }
    box.append(wrap, note);
    drawChart(canvas, r);
}

const BAND = { bad: 'rgba(255,107,142,0.16)', mid: 'rgba(169,156,255,0.24)', good: 'rgba(79,224,163,0.16)' };
function drawChart(canvas, r) {
    if (!window.Chart) return;
    charts.get(canvas)?.destroy();
    const long = r.days > 300;
    const labels = r.series.dates.map(d => d.toLocaleDateString(LOCALE, long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }));
    const line = (label, data, color, extra = {}) => ({ label, data, borderColor: color, borderWidth: 0, pointRadius: 0, tension: 0.25, fill: false, ...extra });
    const chart = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                line(L('If things go badly'), r.series.p5, 'transparent'),
                line('25th', r.series.p25, 'transparent', { fill: '-1', backgroundColor: BAND.bad }),
                line('75th', r.series.p75, 'transparent', { fill: '-1', backgroundColor: BAND.mid }),
                line(L('If things go well'), r.series.p95, 'transparent', { fill: '-1', backgroundColor: BAND.good }),
                line(L('Most likely'), r.series.p50, '#A99CFF', { borderWidth: 2.4 }),
                line(L('Your stake'), r.series.p50.map(() => r.amount), '#726B8C', { borderWidth: 1.2, borderDash: [4, 4] }),
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#272038', borderColor: 'rgba(196,184,255,0.16)', borderWidth: 1, titleColor: '#F5F3FF', bodyColor: '#DCD7EF', padding: 10, cornerRadius: 10,
                    filter: item => !/^(25th|75th)/.test(item.dataset.label),
                    itemSort: (a, b) => b.parsed.y - a.parsed.y,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${money(ctx.parsed.y, r.currency)}` },
                },
                zoom: false,
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#726B8C', maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { family: 'Space Grotesk', size: 12 } } },
                y: { position: 'right', grid: { color: 'rgba(196,184,255,0.06)' }, border: { display: false }, ticks: { color: '#726B8C', font: { family: 'Space Grotesk', size: 12 }, callback: v => money(v, r.currency) } },
            },
        },
    });
    charts.set(canvas, chart);
}

const running = new WeakMap();
/** Renders a stock's Simulate tab and runs it. params: { amount, horizon, model }. */
export async function renderSimulationTab(cardEl, symbol, params = {}) {
    const root = cardEl.querySelector('.card-tab-pane[data-pane="simulation"] .sim');
    if (!root) return null;
    const p = root.__params || (root.__params = { ...prefs });
    Object.assign(p, Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')));
    if (params.horizon && !HORIZONS[params.horizon]) p.horizon = normalizeHorizon(params.horizon) || p.horizon;
    const rerun = () => { prefs.amount = p.amount; if (HORIZONS[p.horizon]) prefs.horizon = p.horizon; prefs.model = p.model; savePrefs(); renderSimulationTab(cardEl, symbol); };
    const title = el('h2', 'panel-title');
    title.innerHTML = L('What could happen <button type="button" class="term" data-term="simulation" aria-label="How does this work?"><i class="i i-help" aria-hidden="true"></i></button>');
    const bar = progressBar({ label: L('Simulating') });
    const out = el('div', 'sim-out');
    root.replaceChildren(title, drawForm(p, rerun), bar.el, out);
    const token = {};
    running.set(root, token);
    root.__busy = true;
    try {
        const r = await simulate({
            ticker: tickerOf(symbol), amount: p.amount, horizon: p.horizon, model: p.model,
            onStage: (k, f, d) => bar.set(k === 'history' ? 0.15 : 0.55, k === 'history' ? L('Loading prices') : L('Simulating'), d),
        });
        if (running.get(root) !== token) return r;
        bar.remove();
        drawResult(out, r);
        root.__last = r;
        return r;
    } catch (e) {
        if (running.get(root) === token) bar.fail(e.message || L('Simulation failed.'));
        return null;
    } finally {
        if (running.get(root) === token) root.__busy = false;
    }
}

/** Opens a stock's Simulate tab with parameters (assistant and SIM command). */
export async function openSimulation(symbol, params = {}) {
    const card = document.getElementById(`card-${symbol}`);
    if (!card) return null;
    const btn = card.querySelector('.card-tab-btn[data-target="simulation"]');
    if (btn && !btn.classList.contains('active')) {
        for (const b of card.querySelectorAll('.card-tab-btn')) { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); }
        for (const pn of card.querySelectorAll('.card-tab-pane')) pn.classList.toggle('active', pn.dataset.pane === 'simulation');
    }
    return renderSimulationTab(card, symbol, params);
}

document.addEventListener('click', e => {
    const btn = e.target.closest?.('.card-tab-btn[data-target="simulation"]');
    const card = btn?.closest('.ticker-card');
    const symbol = card?.id.slice(5);
    if (!symbol || !positions[symbol]) return;
    const root = card.querySelector('.card-tab-pane[data-pane="simulation"] .sim');
    if (!root.__last && !root.__busy) setTimeout(() => { if (!root.__busy && !root.__last) renderSimulationTab(card, symbol); }, 0);
});
