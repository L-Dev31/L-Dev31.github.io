import { fetchFromYahoo } from '../data/yahoo-finance.js';
import { getProxyBaseUrl, setProxyBaseUrl, pingProxy } from '../data/proxy-fetch.js';
import { setPositions as setNewsPositions, setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh, openNewsPage, closeNewsPage, fetchCardNews } from '../ui/news.js';
import '../terminal/terminal.js';
import '../ui/explorer.js';
import '../ai/assistant.js';
import '../ui/bank-picker.js';
import { initCoach } from '../coach/coach.js';
import { DEAD_ERROR_CODES, periodToDays, periodPhrase } from './constants.js';
import { positions, selectedApi, setSelectedApi, globalPeriod, setGlobalPeriod, mainFetchController, setMainFetchController, globalRefreshTimer, setGlobalRefreshTimer, getUserSettings, saveUserSettings, getCurrency, comfortLevel, COMFORT_WORD, isExpert } from './state.js';
import { updatePortfolioSummary, loadStocks, batchPerformanceFetch, isBatchFetching, openPortfolio } from '../ui/portfolio.js';
import { updateUI, openTerminalCard, closeTerminalCard, openCustomSymbol, markTabAsSuspended, unmarkTabAsSuspended } from '../ui/ui.js';
import { getEl, el, icon, showCard, makeResizer, fillOrphans, getActiveSymbol } from './utils.js';
import { renderTickerAi } from '../ai/ai-lab.js';
import { syncAiGates, onAiChange } from '../ai/ai-core.js';
import { L, LANG, setLang } from '../i18n/i18n.js';

export { fetchActiveSymbol };

/* ── views ── */
const VIEWS = {
    home: () => showCard('card-home'),
    portfolio: () => openPortfolio(),
    explorer: () => window.explorerModule?.openExplorer(),
    news: () => openNewsPage(),
    terminal: () => openTerminalCard(),
    settings: () => { showCard('card-settings'); fillSettings(); },
    profile: () => showCard('card-profile'),
};
export const go = view => VIEWS[view]?.();

document.addEventListener('click', e => {
    const nav = e.target.closest('[data-go]');
    if (nav) { go(nav.dataset.go); return; }
    const tab = e.target.closest('.tab');
    if (tab) { openCustomSymbol(tab.dataset.symbol); return; }
    const toggle = e.target.closest('.list-toggle');
    if (toggle) toggleList(toggle);
});
document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('tab')) { e.preventDefault(); e.target.click(); }
});

getEl('me-card')?.addEventListener('click', () => go('portfolio'));
getEl('home-summary')?.addEventListener('click', () => go('portfolio'));
getEl('bottom-nav-home')?.addEventListener('click', () => go('home'));
getEl('bottom-nav-explorer')?.addEventListener('click', () => go('explorer'));
getEl('bottom-nav-news')?.addEventListener('click', () => go('news'));
getEl('bottom-nav-profile')?.addEventListener('click', () => go('profile'));

function toggleList(btn, force) {
    const open = force ?? btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    getEl(btn.getAttribute('aria-controls')).hidden = !open;
    try { localStorage.setItem(`nemeris_list_${btn.id}`, open ? '1' : '0'); } catch { /* ignore */ }
}
for (const btn of document.querySelectorAll('.list-toggle')) {
    try { if (localStorage.getItem(`nemeris_list_${btn.id}`) === '0') toggleList(btn, false); } catch { /* ignore */ }
}

const NAV_FOR_CARD = { 'card-home': 'home', 'card-portfolio': 'portfolio', 'card-explorer': 'explorer', 'card-news': 'news', 'card-terminal': 'terminal', 'card-settings': 'settings' };
const BOTTOM_FOR_CARD = { 'card-explorer': 'bottom-nav-explorer', 'card-news': 'bottom-nav-news', 'card-profile': 'bottom-nav-profile', 'card-settings': 'bottom-nav-profile', 'card-portfolio': 'bottom-nav-home' };

function syncCard(card) {
    const active = card.classList.contains('active');
    card.setAttribute('aria-hidden', String(!active));
    card.inert = !active;
    if (!active) return;
    const view = NAV_FOR_CARD[card.id];
    for (const b of document.querySelectorAll('.nav-btn')) b.classList.toggle('active', b.dataset.go === view);
    const bottom = BOTTOM_FOR_CARD[card.id] || 'bottom-nav-home';
    for (const b of document.querySelectorAll('.bottom-nav-btn')) b.classList.toggle('active', b.id === bottom);
    if (card.classList.contains('ticker-card')) {
        syncPeriodPills();
        syncAdvanced(card);
        renderTickerAi(card, card.id.slice(5));
    }
    if (card.id !== 'card-news') closeNewsPage();
}
const cardObserver = new MutationObserver(list => { for (const m of list) syncCard(m.target); });
const watchCard = card => { if (card.dataset.watched) return; card.dataset.watched = '1'; cardObserver.observe(card, { attributes: true, attributeFilter: ['class'] }); syncCard(card); };
document.querySelectorAll('.card').forEach(watchCard);
new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('card')) watchCard(n);
}).observe(getEl('cards-container'), { childList: true });

/* ── tabs inside a view ── */
let fillTimer = 0;
window.addEventListener('resize', () => {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => fillOrphans(document), 150);
});
document.addEventListener('click', e => {
    const btn = e.target.closest('.card-tab-btn');
    if (!btn) return;
    const card = btn.closest('.card');
    for (const b of card.querySelectorAll('.card-tab-btn')) {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
    }
    for (const p of card.querySelectorAll('.card-tab-pane')) p.classList.toggle('active', p.dataset.pane === btn.dataset.target);
    fillOrphans(card);
    if (!card.classList.contains('ticker-card')) return;
    const symbol = card.id.slice(5);
    if (btn.dataset.target === 'overview') renderTickerAi(card, symbol);
    if (btn.dataset.target === 'news') {
        startCardNewsAutoRefresh(symbol);
        const pos = positions[symbol];
        if (!pos.news?.length || Date.now() - (pos.lastNewsFetch || 0) > 60000) fetchCardNews(symbol, true, 50, periodToDays(pos.currentPeriod || globalPeriod), selectedApi).catch(() => {});
    } else stopCardNewsAutoRefresh(symbol);
});

/* ── stock page: period, advanced view, comparison ── */
function syncPeriodPills(p = globalPeriod) {
    for (const b of document.querySelectorAll('.ticker-card .period-pills .pill')) {
        const on = b.dataset.period === p;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    }
}

const ADV_KEY = 'nemeris_show_indicators';
const advancedOn = () => { try { const v = localStorage.getItem(ADV_KEY); return v == null ? isExpert() : v === '1'; } catch { return isExpert(); } };
function syncAdvanced(card) {
    const on = advancedOn();
    const sym = card.id.slice(5);
    const pos = positions[sym];
    card.querySelector('.chart-container').classList.toggle('show-ind', on);
    card.querySelector('.ind-toggle').setAttribute('aria-pressed', String(on));
    const sel = card.querySelector('.bench-select');
    if (sel) sel.value = pos?.benchmark || '';
    if (pos && pos.chartType !== (on ? 'candle' : 'line')) {
        pos.chartType = on ? 'candle' : 'line';
        if (pos.lastData?.timestamps) updateUI(sym, pos.lastData);
    }
}

document.addEventListener('click', e => {
    const pill = e.target.closest('.ticker-card .period-pills .pill');
    if (pill) { setPeriod(pill.dataset.period); return; }
    const card = e.target.closest('.ticker-card');
    if (!card) return;
    if (e.target.closest('.ind-toggle')) {
        try { localStorage.setItem(ADV_KEY, advancedOn() ? '0' : '1'); } catch { /* ignore */ }
        syncAdvanced(card);
        window.dispatchEvent(new Event('resize'));
        return;
    }
});

document.addEventListener('change', e => {
    const sel = e.target.closest('.bench-select');
    if (!sel) return;
    const card = sel.closest('.ticker-card');
    const sym = card.id.slice(5);
    const pos = positions[sym];
    if (!pos) return;
    pos.benchmark = sel.value;
    if (pos.lastData?.timestamps) updateUI(sym, pos.lastData);
});

function setPeriod(p) {
    if (!p || p === globalPeriod) return;
    setGlobalPeriod(p);
    for (const pos of Object.values(positions)) pos.currentPeriod = p;
    for (const sel of document.querySelectorAll('.period-select')) sel.value = p;
    for (const label of document.querySelectorAll('.performance-period, .tk-period')) label.textContent = periodPhrase(p);
    syncPeriodPills(p);
    fetchActiveSymbol(true);
    batchPerformanceFetch(p);
}

/* ── data for the stock on screen ── */
const fetchInFlight = () => mainFetchController !== null && !mainFetchController.signal.aborted;

function setLoading(symbol, on) {
    const box = getEl(`card-${symbol}`)?.querySelector('.chart-container');
    if (!box) return;
    box.classList.toggle('is-loading', on);
    box.querySelector('.chart-empty-text').textContent = on ? L('Loading prices') : L('No data for this period');
}

async function fetchActiveSymbol(force) {
    const symbol = getActiveSymbol();
    const pos = positions[symbol];
    if (!pos || (!force && fetchInFlight())) return;
    mainFetchController?.abort();
    const controller = new AbortController();
    setMainFetchController(controller);
    const { signal } = controller;
    setLoading(symbol, true);
    const period = pos.currentPeriod || globalPeriod;
    fetchCardNews(symbol, false, 50, periodToDays(period), selectedApi).catch(() => {});
    try {
        const d = await fetchFromYahoo(pos.ticker, period, symbol, pos, pos.name || null, signal, '');
        if (signal.aborted) return;
        pos.lastFetch = Date.now();
        pos.lastData = d;
        if (d?.interval) pos.currentInterval = d.interval;
        if (d?.error && DEAD_ERROR_CODES.includes(d.errorCode)) markTabAsSuspended(symbol);
        else if (d && !d.error) unmarkTabAsSuspended(symbol);
        updateUI(symbol, d);
        updatePortfolioSummary();
        if (d && !d.error && !d.throttled) startRefreshLoop();
    } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
    } finally {
        if (!signal.aborted) { setLoading(symbol, false); setMainFetchController(null); }
    }
}

function startRefreshLoop() {
    if (globalRefreshTimer) return;
    setGlobalRefreshTimer(setInterval(() => { if (!document.hidden && !isBatchFetching) batchPerformanceFetch(globalPeriod); }, 300000));
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden || !globalRefreshTimer) return;
    fetchActiveSymbol(false);
    batchPerformanceFetch(globalPeriod);
});

/* ── settings: saved as you type ── */
let savedTimer = 0;
function flashSaved() {
    const note = getEl('profile-saved');
    if (!note) return;
    note.textContent = L('Saved');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { note.textContent = ''; }, 1600);
}

function applyProfile(s = getUserSettings()) {
    for (const n of [getEl('profile-name'), getEl('mobile-profile-name')]) if (n) n.textContent = s.name && s.name !== 'Nemeris User' ? s.name : L('Nemeris user');
    for (const img of document.querySelectorAll('.profile-photo')) img.src = s.pfp || 'img/icon/favicon.png';
}

function applyExpert(on = isExpert()) {
    for (const n of document.querySelectorAll('[data-expert]')) {
        if (n.tagName === 'DETAILS') n.open = on;
        else n.hidden = !on;
    }
}

function renderComfort(inv) {
    const out = getEl('comfort-readout');
    const level = comfortLevel(inv);
    out.hidden = !level;
    if (!level) return;
    out.innerHTML = `<button type="button" class="term" data-term="comfort">${L('Comfort with risk')}</button>: <b>${level}/7</b>, ${COMFORT_WORD[level].toLowerCase()}`;
}

function fillSettings() {
    const s = getUserSettings();
    getEl('settings-user-name').value = s.name === 'Nemeris User' ? '' : s.name || '';
    getEl('settings-pfp-preview').src = s.pfp || 'img/icon/favicon.png';
    getEl('settings-expert').checked = !!s.expert;
    for (const r of document.querySelectorAll('input[name="app-lang"]')) r.checked = r.value === LANG;
    getEl('settings-proxy-url').value = s.proxyUrl || '';
    const inv = s.investor || {};
    for (const set of document.querySelectorAll('#about-you .question')) {
        for (const r of set.querySelectorAll('input[type="radio"]')) r.checked = r.value === inv[set.dataset.key];
    }
    getEl('inv-monthly').value = inv.monthly || '';
    getEl('inv-monthly-unit').textContent = getCurrency();
    getEl('inv-notes').value = inv.notes || '';
    renderComfort(inv);
}

function readInvestor() {
    const inv = {};
    for (const set of document.querySelectorAll('#about-you .question')) {
        const on = set.querySelector('input:checked');
        if (on) inv[set.dataset.key] = on.value;
    }
    const monthly = Number(getEl('inv-monthly').value);
    if (monthly > 0) inv.monthly = monthly;
    const notes = getEl('inv-notes').value.trim();
    if (notes) inv.notes = notes;
    return inv;
}

getEl('about-you')?.addEventListener('input', () => {
    const investor = readInvestor();
    saveUserSettings({ investor });
    renderComfort(investor);
    flashSaved();
});
getEl('settings-user-name')?.addEventListener('input', e => {
    saveUserSettings({ name: e.target.value.trim() || 'Nemeris User' });
    applyProfile();
});
getEl('settings-user-pfp-file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const side = 160, c = document.createElement('canvas');
            c.width = c.height = side;
            const k = Math.max(side / img.width, side / img.height);
            c.getContext('2d').drawImage(img, (side - img.width * k) / 2, (side - img.height * k) / 2, img.width * k, img.height * k);
            saveUserSettings({ pfp: c.toDataURL('image/jpeg', 0.86) });
            applyProfile();
            getEl('settings-pfp-preview').src = getUserSettings().pfp;
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});
for (const r of document.querySelectorAll('input[name="app-lang"]')) r.addEventListener('change', () => { if (r.checked) setLang(r.value); });
getEl('settings-expert')?.addEventListener('change', e => {
    saveUserSettings({ expert: e.target.checked });
    try { localStorage.removeItem(ADV_KEY); } catch { /* ignore */ }
    applyExpert(e.target.checked);
    const card = document.querySelector('.ticker-card.active');
    if (card) syncAdvanced(card);
});
getEl('settings-proxy-url')?.addEventListener('change', async e => {
    const url = e.target.value.trim();
    const status = getEl('settings-proxy-status');
    if (url && !/^https:\/\//.test(url)) { status.textContent = L('The address must start with https://'); return; }
    setProxyBaseUrl(url);
    renderRelayNotice();
    if (!url) { status.textContent = L('API removed. Prices cannot load without a financial data API.'); return; }
    status.textContent = L('Checking the API');
    status.textContent = await pingProxy(url) ? L('Saved. The API is responding.') : L('Saved, but the API is not responding. Check the address.');
    if (getProxyBaseUrl()) { batchPerformanceFetch(globalPeriod); fetchActiveSymbol(true); }
});

function renderRelayNotice(message) {
    let box = getEl('app-notice');
    const text = message || (getProxyBaseUrl() ? '' : L('No financial data API configured.'));
    if (!text) { box?.remove(); return; }
    if (!box) {
        box = el('div', 'app-notice');
        box.id = 'app-notice';
        box.setAttribute('role', 'status');
        document.querySelector('.container').prepend(box);
    }
    const btn = el('button', 'btn btn-quiet', L('Open settings'));
    btn.type = 'button';
    btn.addEventListener('click', () => { go('settings'); document.querySelector('#card-settings .card-tab-btn[data-target="settings-general"]').click(); });
    box.replaceChildren(icon('info'), el('span', null, text), btn);
}
window.addEventListener('workerFailure', () => renderRelayNotice(L('The financial data API is not responding. Displayed prices may be outdated.')));
window.addEventListener('workerRecovered', () => renderRelayNotice());

document.addEventListener('error', e => { if (e.target.classList?.contains('row-logo')) e.target.hidden = true; }, true);

/* ── start ── */
window.addEventListener('load', async () => {
    // Published late on purpose: reading other modules' bindings here (not at
    // import time) keeps the general ↔ ui cycle from ever trapping TDZ at load.
    Object.assign(window, {
        positions, selectedApi, openNewsPage, closeNewsPage, openCustomSymbol, openTerminalCard, closeTerminalCard, getActiveSymbol,
        markTabAsSuspended, unmarkTabAsSuspended, fetchCardNews, fetchActiveSymbol, setupNewsSearch,
        getSelectedApi: () => selectedApi,
        setSelectedApi,
        terminalLogGlobal: msg => { const out = getEl('terminal-output'); if (!out) return; out.append(el('div', 'terminal-log', msg)); out.scrollTop = out.scrollHeight; },
        nemeris: { positions, go, settings: { get: getUserSettings, save: saveUserSettings } },
    });
    applyProfile();
    applyExpert();
    renderRelayNotice();
    makeResizer(document.querySelector('.sidebar-resize'), { cssVar: '--sidebar-w', storageKey: 'nemeris_sidebar_w', min: 220, max: 480, side: 'left', fallback: 280 });
    await loadStocks();
    initCoach({ go, openSymbol: openCustomSymbol });
    setNewsPositions(positions);
    syncAiGates();
    onAiChange(() => syncAiGates());
    startRefreshLoop();
});
