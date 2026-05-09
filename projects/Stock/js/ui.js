import { positions, selectedApi, lastApiBySymbol, getCurrency, globalPeriod, getUserSettings } from './state.js';
import { hasTransactions, typeLabel, typeIcon } from './constants.js';
import { calculateStockValues } from './portfolio.js';
import { fetchActiveSymbol } from './general.js';
import { updateChart, initChart } from './chart.js';
import { updateSignal } from './signal-bot.js';
import { setupNewsSearch } from './news.js';
import { resolveTickerDetails, buildOnlineIconCandidates } from './ticker-catalog.js';
import { handleImageAssetError } from './assets.js';
import { getEl, formatCurrency, formatPct } from './utils.js';

export { initChart }; // Re-export for portfolio.js

export function createTab(stock, type) {
    const t = getEl('tab-template');
    if (!t) return;
    
    // Create tab for Desktop Sidebar
    const tab = createTabElement(t, stock, type);
    
    const calculated = calculateStockValues(stock);
    const hasShares = calculated.shares > 0;
    const isSuspended = tab.classList.contains('suspended');

    // Desktop Placement
    if (isSuspended) {
        ensureSection('suspended-tabs', type)?.appendChild(tab);
    } else if (hasShares) {
        ensureSection('portfolio-tabs', type)?.appendChild(tab);
    } else {
        ensureSection('general-tabs', type)?.appendChild(tab);
    }

    // Mobile Placement
    if (getEl('mobile-portfolio-tabs')) {
        const mobileTab = createTabElement(t, stock, type);
        if (isSuspended) {
            ensureSection('mobile-suspended-tabs', type)?.appendChild(mobileTab);
        } else if (hasShares) {
            ensureSection('mobile-portfolio-tabs', type)?.appendChild(mobileTab);
        } else {
            ensureSection('mobile-general-tabs', type)?.appendChild(mobileTab);
        }
    }
}

let _tabOrder = 0;

function createTabElement(template, stock, type) {
    const tab = template.content.firstElementChild.cloneNode(true);
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker;
    tab.dataset.tabOrder = String(_tabOrder++);
    
    if (stock.suspended || isSymbolSuspendedInStorage(stock.symbol)) {
        tab.classList.add('suspended');
    }
    
    const img = tab.querySelector('img');
    img.src = `img/icon/${stock.symbol}.png`;
    img.alt = stock.symbol;
    img.onerror = () => handleImageAssetError(img, stock.ticker || stock.symbol, stock.market, false);
    
    const pos = positions[stock.symbol];
    const baseName = pos?.name || stock.name || stock.symbol;
    const ticker = stock.ticker || stock.symbol;
    
    const tabNameEl = tab.querySelector('.tab-name');
    tabNameEl.textContent = `${baseName} (${ticker})`;
    
    const calculated = calculateStockValues(stock);
    tab.querySelector('.tab-shares').textContent = calculated.shares > 0 ? `${calculated.shares} shares` : '';
    
    return tab;
}

export function createCard(stock) {
    const t = getEl('view-template')
    if (!t) return
    const card = t.content.firstElementChild.cloneNode(true)
    card.id = `card-${stock.symbol}`

    const logo = card.querySelector('.logo img')
    logo.id = `logo-${stock.symbol}`
    logo.dataset.symbol = stock.symbol
    logo.src = `img/logo/${stock.symbol}.png`
    logo.onerror = () => handleImageAssetError(logo, stock.symbol, stock.market, true);

    const generalTitle = card.querySelector('h3.section-title');
    if (generalTitle) {
        generalTitle.id = `general-title-${stock.symbol}`;
        const genDate = generalTitle.nextElementSibling;
        if (genDate && genDate.classList.contains('section-date')) {
            genDate.id = `general-date-${stock.symbol}`;
            genDate.textContent = '';
        }
    }

    const sh = card.querySelector('.important-shares span')
    sh.id = `shares-${stock.symbol}`
    const calculated = calculateStockValues(stock);
    sh.textContent = calculated.shares

    const investmentSection = card.querySelector('.investment-section');
    if (investmentSection) {
        investmentSection.style.display = calculated.shares > 0 ? '' : 'none';
    }

    const isin = card.querySelector('.isin-val')
    if (isin) {
        isin.id = `isin-${stock.symbol}`
        isin.textContent = stock.isin || ''
        if (!stock.isin) isin.parentElement.style.display = 'none'
    }

    const tk = card.querySelector('.ticker-val')
    if (tk) {
        tk.id = `ticker-${stock.symbol}`
        tk.textContent = stock.ticker || stock.symbol
    }

    const symInfo = card.querySelector('.symbol-val')
    if (symInfo) {
        symInfo.id = `symbol-info-${stock.symbol}`
        symInfo.textContent = stock.symbol
    }

    const cn = card.querySelector('.country-name')
    if (cn) cn.textContent = stock.country || ''

    const flag = card.querySelector('.flag-icon')
    if (flag) {
        flag.id = `flag-${stock.symbol}`
        flag.dataset.country = stock.country || ''
        flag.src = `img/flag/${(stock.country||'').toLowerCase()}.png`
    }

    const group = card.querySelector('.periods-group')
    group.id = `periods-${stock.symbol}`
    group.querySelectorAll('.period-btn').forEach(btn=>{
        btn.dataset.symbol = stock.symbol
        if (btn.dataset.period==='1D') btn.classList.add('active')
    })

    const c = card.querySelector('.chart-canvas')
    c.id = `chart-${stock.symbol}`

    const pf = card.querySelector('.performance-value')
    pf.id = `perf-${stock.symbol}`
    pf.textContent = '--'

    const upd = card.querySelector('.update-center')
    if (upd) {
        upd.id = `update-center-${stock.symbol}`
        upd.textContent = '--'
    }

    const courseTitle = card.querySelector('.course-title');
    if (courseTitle) {
        courseTitle.id = `course-title-${stock.symbol}`;
        const courseDate = courseTitle.nextElementSibling;
        if (courseDate && courseDate.classList.contains('section-date')) {
            courseDate.id = `course-date-${stock.symbol}`;
            courseDate.textContent = '';
        }
    }

    const invTitle = card.querySelector('.investment-title')
    if (invTitle) {
        invTitle.id = `investment-title-${stock.symbol}`;
        const invDate = invTitle.nextElementSibling;
        if (invDate && invDate.classList.contains('section-date')) {
            invDate.id = `investment-date-${stock.symbol}`;
        }
    }

    const tds = card.querySelectorAll('.investment-section tbody td')
    if (tds.length===8) {
        tds[1].id=`invest-${stock.symbol}`
        tds[2].id=`value-${stock.symbol}`
        tds[3].id=`profit-${stock.symbol}`
        tds[5].id=`invest-per-${stock.symbol}`
        tds[6].id=`value-per-${stock.symbol}`
        tds[7].id=`profit-per-${stock.symbol}`
    }

    const hasEverInvested = hasTransactions(stock);

    const investmentTabBtn = card.querySelector('.card-tab-btn[data-target="investment"]');
    if (investmentTabBtn) {
        investmentTabBtn.style.display = hasEverInvested ? '' : 'none';
    }

    const currency = getCurrency();
    if (calculated.shares > 0) {
        const displayInvestment = typeof calculated.costBasis === 'number' ? calculated.costBasis : Math.abs(calculated.investment || 0);
        tds[1].textContent = formatCurrency(displayInvestment, currency);
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        const displayInvestPerShare = calculated.shares ? (displayInvestment / calculated.shares) : 0;
        tds[5].textContent = calculated.shares ? formatCurrency(displayInvestPerShare, currency) : '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    } else {
        tds[1].textContent = formatCurrency(0, currency);
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        tds[5].textContent = '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    }

    const cardTableContainer = card.querySelector('.investment-section .table-container')
    if (cardTableContainer) {
        cardTableContainer.style.display = '';
    }

    const investmentTitle = card.querySelector('.investment-title')
    if (investmentTitle) {
        investmentTitle.style.display = '';
        const investmentDate = investmentTitle.nextElementSibling;
        if (investmentDate && investmentDate.classList.contains('section-date')) {
            investmentDate.style.display = '';
        }
    }

    const detailsTitle = card.querySelector('.details-title')
    if (detailsTitle) {
        detailsTitle.id = `details-title-${stock.symbol}`;
        const detDate = detailsTitle.nextElementSibling;
        if (detDate && detDate.classList.contains('section-date')) {
            detDate.id = `details-date-${stock.symbol}`;
            detDate.textContent = '';
        }
    }

    const signalTitle = card.querySelector('.signal-title')
    if (signalTitle) {
        signalTitle.id = `signal-title-${stock.symbol}`;
        const signalDate = signalTitle.nextElementSibling;
        if (signalDate && signalDate.classList.contains('section-date')) {
            signalDate.id = `signal-date-${stock.symbol}`;
            signalDate.textContent = '';
        }
    }

    const signalCursor = card.querySelector('.signal-cursor');
    const signalValue = card.querySelector('.signal-state-title');
    const signalDescription = card.querySelector('.signal-state-description');

    if (signalCursor) signalCursor.id = `signal-cursor-${stock.symbol}`;
    if (signalValue) signalValue.id = `signal-value-${stock.symbol}`;
    if (signalDescription) signalDescription.id = `signal-description-${stock.symbol}`;

    const info = card.querySelectorAll('.card-tab-pane[data-pane="overview"] .info-value')
    if (info.length===4) {
        info[0].id=`open-${stock.symbol}`
        info[1].id=`high-${stock.symbol}`
        info[2].id=`low-${stock.symbol}`
        info[3].id=`close-${stock.symbol}`
        info.forEach(el=>el.textContent='--')
    }

    const transactionTitle = card.querySelector('.history-title')
    if (transactionTitle) {
        transactionTitle.id = `history-title-${stock.symbol}`;
        transactionTitle.style.display = '';
    }

    const transactionContainer = card.querySelector('.history-container')
    if (transactionContainer) {
        transactionContainer.style.display = '';
        const tbody = card.querySelector('.history-body');
        const hasTransactionsLocal = hasTransactions(stock);
        if (tbody && hasTransactionsLocal) {
            let transactions = [];
            if (stock.purchases) {
                stock.purchases.forEach(p => transactions.push({date: p.date, amount: p.amount, shares: p.shares, type: 'Buy'}));
            }
            if (stock.sales) {
                stock.sales.forEach(s => transactions.push({date: s.date, amount: s.amount, shares: s.shares, type: 'Sell'}));
            }
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            const rowTpl = document.getElementById('transaction-row-template');
            tbody.innerHTML = '';
            transactions.forEach(t => {
                const row = rowTpl ? rowTpl.content.firstElementChild.cloneNode(true) : document.createElement('tr');
                row.classList.add(t.type === 'Buy' ? 'transaction-buy' : 'transaction-sell');
                const dateEl = row.querySelector('.trans-date');
                const typeEl = row.querySelector('.trans-type');
                const amountEl = row.querySelector('.trans-amount');
                const sharesEl = row.querySelector('.trans-shares');
                const priceEl = row.querySelector('.trans-price');
                if (dateEl) dateEl.textContent = new Date(t.date).toLocaleDateString('en-US');
                if (typeEl) typeEl.textContent = t.type;
                if (amountEl) amountEl.textContent = Math.abs(t.amount).toFixed(2) + ' ' + getCurrency();
                if (sharesEl) sharesEl.textContent = t.shares;
                if (priceEl) priceEl.textContent = (Math.abs(t.amount) / t.shares).toFixed(2) + ' ' + getCurrency();
                tbody.appendChild(row);
            });
        }
    }

    const nl = card.querySelector('.news-list');
    if (nl) nl.id = `news-list-${stock.symbol}`;

    getEl('cards-container')?.appendChild(card)
    
    setupNewsSearch(stock.symbol);
}
export function updateUI(symbol, data) {
    if (!data || data.error) {
        clearPeriodDisplay(symbol);
        return;
    }

    try {
        const cardRoot = getEl(`card-${symbol}`);
        if (cardRoot) {
            const chartContainer = cardRoot.querySelector('.chart-container');
            if (chartContainer) chartContainer.classList.remove('empty');

            const detailsTitle = cardRoot.querySelector('.details-title');
            if (detailsTitle) {
                detailsTitle.classList.remove('hidden-by-bot');
                const detDate = detailsTitle.nextElementSibling;
                if (detDate && detDate.classList.contains('section-date')) detDate.classList.remove('hidden-by-bot');
            }
            const infoGrid = cardRoot.querySelector('.info-grid');
            if (infoGrid) infoGrid.classList.remove('hidden-by-bot');

            const signalTitle = cardRoot.querySelector('.signal-title');
            if (signalTitle) {
                signalTitle.classList.remove('hidden-by-bot');
                const sigDate = signalTitle.nextElementSibling;
                if (sigDate && sigDate.classList.contains('section-date')) sigDate.classList.remove('hidden-by-bot');
            }
            const signalContainer = cardRoot.querySelector('.signal-container');
            if (signalContainer) signalContainer.classList.remove('hidden-by-bot');
            const labelsEl = cardRoot.querySelector('.signal-labels');
            if (labelsEl) labelsEl.classList.remove('hidden-by-bot');
            const barEl = cardRoot.querySelector('.signal-bar');
            if (barEl) barEl.classList.remove('hidden-by-bot');
        }
    } catch (e) { /* ignore UI restore errors */ }

    if (data.timestamps && data.prices) {
        positions[symbol].calculated = calculateStockValues(positions[symbol]);
        updateChart(symbol, data.timestamps, data.prices, positions, data.source, data);
    }

    const currency = getCurrency();
    const openEl = getEl(`open-${symbol}`);
    const highEl = getEl(`high-${symbol}`);
    const lowEl = getEl(`low-${symbol}`);
    const closeEl = getEl(`close-${symbol}`);

    if (openEl) openEl.textContent = data.open ? formatCurrency(data.open, currency) : '--';
    if (highEl) highEl.textContent = data.high ? formatCurrency(data.high, currency) : '--';
    if (lowEl) lowEl.textContent = data.low ? formatCurrency(data.low, currency) : '--';
    if (closeEl) closeEl.textContent = data.price ? formatCurrency(data.price, currency) : '--';

    const perfEl = getEl(`perf-${symbol}`);
    if (perfEl) {
        if (data.changePercent !== undefined) {
            const isPositive = data.change >= 0;
            perfEl.textContent = formatPct(data.changePercent);
            perfEl.className = `performance-value ${isPositive ? 'positive' : 'negative'}`;
            perfEl.style.display = '';
        } else {
            perfEl.textContent = '--';
            perfEl.className = 'performance-value';
        }
    }

    const valueEl = getEl(`value-${symbol}`);
    const valuePerEl = getEl(`value-per-${symbol}`);
    const profitEl = getEl(`profit-${symbol}`);
    const profitPerEl = getEl(`profit-per-${symbol}`);

    if (data.price && positions[symbol]) {
        const currentPrice = data.price;
        const shares = positions[symbol].shares || 0;
        const investment = positions[symbol].investment || 0;
        const isShortPosition = investment < 0;

        const purchaseDate = positions[symbol].purchaseDate;
        let isOutdated = false;
        if (purchaseDate && data.timestamps && data.timestamps.length > 0) {
            const latestTimestamp = Math.max(...data.timestamps) * 1000; 
            const purchaseTime = new Date(purchaseDate).getTime();
            isOutdated = latestTimestamp < purchaseTime;
        }

        if (isOutdated) {
            if (valueEl) { valueEl.textContent = 'Data unavailable'; valueEl.className = 'outdated'; }
            if (valuePerEl) { valuePerEl.textContent = 'Data unavailable'; valuePerEl.className = 'outdated'; }
            if (profitEl) { profitEl.textContent = 'Data unavailable'; profitEl.className = 'outdated'; }
            if (profitPerEl) { profitPerEl.textContent = 'Data unavailable'; profitPerEl.className = 'outdated'; }
        } else {
            const totalValue = currentPrice * shares;
            const costBasis = positions[symbol].costBasis || 0;
            const currency = getCurrency();

            if (valueEl) {
                valueEl.textContent = formatCurrency(totalValue, currency);
                valueEl.className = totalValue >= costBasis ? 'positive' : 'negative';
            }

            if (valuePerEl) {
                valuePerEl.textContent = formatCurrency(currentPrice, currency);
                const perShareCost = shares ? costBasis / shares : 0;
                valuePerEl.className = currentPrice >= perShareCost ? 'positive' : 'negative';
            }

            const totalProfit = totalValue - costBasis;
            if (profitEl) {
                profitEl.textContent = formatCurrency(totalProfit, currency);
                profitEl.className = totalProfit >= 0 ? 'positive' : 'negative';
            }

            const profitPerShare = currentPrice - (shares ? (costBasis / shares) : 0);
            if (profitPerEl) {
                profitPerEl.textContent = formatCurrency(profitPerShare, currency);
                profitPerEl.className = profitPerShare >= 0 ? 'positive' : 'negative';
            }
        }
    }

    const updateEl = getEl(`update-center-${symbol}`);
    if (updateEl) {
        let timeString = '--';
        let latencyMin = null;
        if (data.timestamps && data.timestamps.length > 0) {
            const latestTimestamp = Math.max(...data.timestamps);
            const dataDate = new Date(latestTimestamp * 1000);
            const dateStr = dataDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dataDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            timeString = `${dateStr} ${timeStr}`;
            latencyMin = Math.round((Date.now() - dataDate.getTime()) / 60000);
        }
        const isCached = !!data.fromCache;
        const sourceLabel = (data.source || 'yahoo').toUpperCase();
        let freshLabel = 'CACHED';
        if (!isCached) {
            if (latencyMin == null) freshLabel = '--';
            else if (latencyMin <= 20) freshLabel = 'LIVE (delayed)';
            else if (latencyMin <= 24 * 60) freshLabel = `${latencyMin}m old`;
            else freshLabel = `${Math.round(latencyMin / 60 / 24)}d old`;
        }
        updateEl.innerHTML = `
            <div class="data-source-strip" role="status" aria-label="Data source and freshness">
                <span class="src-pill"><span class="src-key">Status</span><span class="src-val">${freshLabel}</span></span>
                <span class="src-pill"><span class="src-key">Source</span><span class="src-val">${sourceLabel}</span></span>
                <span class="src-pill"><span class="src-key">As of</span><span class="src-val">${timeString}</span></span>
            </div>
        `;
    }

    if (data && data.name && positions[symbol] && positions[symbol].name === symbol) {
        positions[symbol].name = data.name;
        updateTabTitle(symbol);
    }
    try {
        const investEl = getEl(`invest-${symbol}`);
        const investPerEl = getEl(`invest-per-${symbol}`);
        const currency = getCurrency();
        if (investEl) {
            const inv = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            investEl.textContent = formatCurrency(inv, currency);
            investEl.classList.remove('positive', 'negative');
        }
        if (investPerEl) {
            const costBasis = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            const invPer = (positions[symbol].shares && positions[symbol].shares > 0) ? (costBasis / positions[symbol].shares) : 0;
            investPerEl.textContent = positions[symbol].shares ? formatCurrency(invPer, currency) : '--';
        }
    } catch(e) { /* ignore if cells missing */ }
    
    updateTabTitle(symbol);
    updateCardTitle(symbol);
    try { updateSectionDates(symbol); } catch (e) { /* ignore */ }

    const currentPeriod = positions[symbol]?.currentPeriod || globalPeriod;
    updateSignal(symbol, data, { period: currentPeriod });
    updateSidebarPerformance(symbol);
}

export function updateSidebarPerformance(symbol) {
    const tabs = document.querySelectorAll(`.tab[data-symbol="${symbol}"]`);
    if (tabs.length === 0) return;
    
    const pos = positions[symbol];
    const data = pos?.lastData;
    const settings = getUserSettings();

    tabs.forEach(tab => {
        const perfWrapper = tab.querySelector('.tab-performance');
        if (!perfWrapper) return;

        if (!settings.performanceViewerEnabled) {
            perfWrapper.style.display = 'none';
            tab.classList.remove('tab-perf-positive', 'tab-perf-negative');
            return;
        }

        if (!data || data.changePercent === undefined) {
            perfWrapper.style.display = 'none';
            tab.classList.remove('tab-perf-positive', 'tab-perf-negative');
            return;
        }
        
        perfWrapper.style.display = 'flex';
        const isPositive = data.change >= 0;
        
        tab.classList.remove('tab-perf-positive', 'tab-perf-negative');
        perfWrapper.classList.remove('positive', 'negative');
        
        tab.classList.add(isPositive ? 'tab-perf-positive' : 'tab-perf-negative');
        perfWrapper.classList.add(isPositive ? 'positive' : 'negative');
        
        const valEl = perfWrapper.querySelector('.perf-value');
        if (valEl) {
            valEl.textContent = formatPct(data.changePercent);
        }
        const perEl = perfWrapper.querySelector('.perf-period');
        if (perEl) {
            perEl.textContent = globalPeriod;
        }
    });
}

function clearChartData(symbol) {
    if (!positions[symbol]?.chart) return;
    positions[symbol].chart.data.labels = [];
    if (positions[symbol].chart.data.datasets && positions[symbol].chart.data.datasets[0]) {
        positions[symbol].chart.data.datasets[0].data = [];
    }
    positions[symbol].chart.data.timestamps = [];
    try { positions[symbol].chart.update('none'); } catch (e) { /* ignore */ }
}

function resetPricePerformanceAndUpdate(symbol) {
    const openEl = getEl(`open-${symbol}`);
    const highEl = getEl(`high-${symbol}`);
    const lowEl = getEl(`low-${symbol}`);
    const closeEl = getEl(`close-${symbol}`);

    if (openEl) openEl.textContent = '--';
    if (highEl) highEl.textContent = '--';
    if (lowEl) lowEl.textContent = '--';
    if (closeEl) closeEl.textContent = '--';

    const perfEl = getEl(`perf-${symbol}`);
    if (perfEl) {
        perfEl.textContent = '--';
        perfEl.className = 'performance-value';
    }

    const updateEl = getEl(`update-center-${symbol}`);
    if (updateEl) updateEl.textContent = '--';
}

function resetSignalDisplay(symbol, description) {
    const signalCursor = getEl(`signal-cursor-${symbol}`);
    const signalValue = getEl(`signal-value-${symbol}`);
    const signalDescription = getEl(`signal-description-${symbol}`);

    if (signalCursor) signalCursor.style.left = '50%';
    if (signalValue) {
        signalValue.textContent = 'Neutral';
        signalValue.style.color = '#a8a2ff';
    }
    if (signalDescription) signalDescription.textContent = description;
}

export function resetSymbolDisplay(symbol) {
    if (!positions[symbol]) return

    clearChartData(symbol);
    resetPricePerformanceAndUpdate(symbol);

    const valueEl = getEl(`value-${symbol}`);
    const valuePerEl = getEl(`value-per-${symbol}`);
    const profitEl = getEl(`profit-${symbol}`);
    const profitPerEl = getEl(`profit-per-${symbol}`);

    if (valueEl) valueEl.textContent = '--'
    if (valuePerEl) valuePerEl.textContent = '--'
    if (profitEl) profitEl.textContent = '--'
    if (profitPerEl) profitPerEl.textContent = '--'

    resetSignalDisplay(symbol, 'Running technical analysis...');
}

export function clearPeriodDisplay(symbol) {
    if (!positions[symbol]) return;
    clearChartData(symbol);
    resetPricePerformanceAndUpdate(symbol);
    resetSignalDisplay(symbol, 'No data for this period');

    const cardRoot = document.querySelector(`#card-${symbol}`);
    if (cardRoot) {
        const chartContainer = cardRoot.querySelector('.chart-container');
        if (chartContainer) {
            chartContainer.classList.add('empty');
            const emptyText = chartContainer.querySelector('.chart-empty-text');
            if (emptyText) emptyText.textContent = 'No data for this period';
        }

        const labelsEl = cardRoot.querySelector('.signal-labels');
        const barEl = cardRoot.querySelector('.signal-bar');
        const signalExplanation = cardRoot.querySelector('.signal-explanation');
        const explanationContent = cardRoot.querySelector('.explanation-content');
        if (labelsEl) labelsEl.classList.add('hidden-by-bot');
        if (barEl) barEl.classList.add('hidden-by-bot');
        if (signalExplanation) signalExplanation.classList.add('hidden-by-bot');
        if (explanationContent) explanationContent.innerHTML = '';
        const detailsTitle = cardRoot.querySelector('.details-title');
        if (detailsTitle) {
            detailsTitle.classList.add('hidden-by-bot');
            const detDate = detailsTitle.nextElementSibling;
            if (detDate && detDate.classList.contains('section-date')) detDate.classList.add('hidden-by-bot');
        }
        const infoGrid = cardRoot.querySelector('.info-grid');
        if (infoGrid) infoGrid.classList.add('hidden-by-bot');

        const signalTitle = cardRoot.querySelector('.signal-title');
        if (signalTitle) {
            signalTitle.classList.add('hidden-by-bot');
            const sigDate = signalTitle.nextElementSibling;
            if (sigDate && sigDate.classList.contains('section-date')) sigDate.classList.add('hidden-by-bot');
        }
        const signalContainer = cardRoot.querySelector('.signal-container');
        if (signalContainer) signalContainer.classList.add('hidden-by-bot');
    }
}

export function updateTabTitle(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab) return;
    const nameEl = tab.querySelector('.tab-name');
    if (!nameEl) return;
    const pos = positions[symbol];
    const baseName = pos?.name || symbol;
    nameEl.textContent = baseName;
}

export function updateCardTitle(symbol) {
    const titleEl = getEl(`course-title-${symbol}`);
    if (!titleEl) return;
    titleEl.textContent = `Stock Price`;
}

export function updateSectionDates(symbol) {
    const dateStr = getBestDataDate(symbol);
    ['course', 'investment', 'details', 'signal'].forEach(key => {
        const title = getEl(`${key}-title-${symbol}`);
        const dateEl = title?.nextElementSibling;
        if (dateEl?.classList.contains('section-date')) dateEl.textContent = dateStr || '';
    });
}

function getLastDataDate(symbol) {
    const pos = positions[symbol];
    if (!pos || !pos.lastData || !pos.lastData.timestamps || pos.lastData.timestamps.length === 0) {
        return null;
    }
    const latestTimestamp = Math.max(...pos.lastData.timestamps);
    const date = new Date(latestTimestamp * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

function getBestDataDate(symbol) {
    const pos = positions[symbol];
    if (!pos) return '';
    if (pos.lastData && Array.isArray(pos.lastData.timestamps) && pos.lastData.timestamps.length > 0) {
        const numericTimestamps = pos.lastData.timestamps.filter(t => typeof t === 'number' && !isNaN(t) && t > 0);
        if (numericTimestamps.length > 0) {
            const latest = Math.max(...numericTimestamps);
            const d = new Date(latest * 1000);
            return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }
    return '';
}

function ensureSection(containerId, type) {
    const container = getEl(containerId);
    if (!container) return null;
    
    const prefix = containerId.replace('tabs', 'section');
    const sectionId = `${prefix}-${type}`;
    
    let section = getEl(sectionId);
    if (!section) {
        section = document.createElement('div');
        section.className = 'tab-type-section';
        section.id = sectionId;
        
        const title = document.createElement('div');
        title.className = 'tab-type-title';
        title.innerHTML = `<i class="${typeIcon(type)} type-icon"></i>${typeLabel(type)}`;
        
        section.appendChild(title);
        container.appendChild(section);
    }
    return section;
}

const SUSPENDED_KEY_PREFIX = 'nemeris_suspended_';

export function isSymbolSuspendedInStorage(symbol) {
    try { return localStorage.getItem(SUSPENDED_KEY_PREFIX + symbol) === '1'; }
    catch { return false; }
}

function setSymbolSuspendedInStorage(symbol, suspended) {
    try {
        if (suspended) localStorage.setItem(SUSPENDED_KEY_PREFIX + symbol, '1');
        else localStorage.removeItem(SUSPENDED_KEY_PREFIX + symbol);
    } catch { }
}

export function toggleSymbolSuspension(symbol, isSuspended) {
    const tabs = document.querySelectorAll(`.tab[data-symbol="${symbol}"]`);
    if (tabs.length === 0) return;

    if (positions[symbol]) positions[symbol].suspended = isSuspended;
    setSymbolSuspendedInStorage(symbol, isSuspended);

    tabs.forEach(tab => {
        const isMobile = tab.closest('#card-home') !== null;
        if (isSuspended) {
            tab.classList.add('suspended');
            const pos = positions[symbol];
            if (!pos) return;
            const section = ensureSection(isMobile ? 'mobile-suspended-tabs' : 'suspended-tabs', pos.type || 'equity');
            if (section) { section.appendChild(tab); sortSection(section); }
        } else {
            tab.classList.remove('suspended');
            const pos = positions[symbol];
            if (!pos) return;
            const isPortfolio = (pos.shares ?? 0) > 0;
            const targetContainer = isMobile
                ? (isPortfolio ? 'mobile-portfolio-tabs' : 'mobile-general-tabs')
                : (isPortfolio ? 'portfolio-tabs' : 'general-tabs');
            const section = ensureSection(targetContainer, pos.type);
            if (section) { section.appendChild(tab); sortSection(section); }
        }
    });
}

function sortSection(section) {
    const title = section.querySelector('.tab-type-title');
    const tabs = Array.from(section.querySelectorAll('.tab'));
    tabs.sort((a, b) => Number(a.dataset.tabOrder ?? 0) - Number(b.dataset.tabOrder ?? 0));
    tabs.forEach(t => section.appendChild(t));
    if (title) section.insertBefore(title, section.firstChild);
}

export const markTabAsSuspended = (symbol) => toggleSymbolSuspension(symbol, true);
export const unmarkTabAsSuspended = (symbol) => toggleSymbolSuspension(symbol, false);

export function getActiveSymbol() {
    const t = document.querySelector('.tab.active')
    return t? t.dataset.symbol:null
}

export function openTerminalCard(prefill = '') {
    const card = getEl('card-terminal');
    const input = getEl('terminal-input');
    if (!card || !input) return;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    try { getEl('open-terminal-btn')?.classList.add('active'); } catch(e) {}
    input.value = prefill;
    card.style.display = '';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    try { const out = getEl('terminal-output'); if (out) out.scrollTop = out.scrollHeight; } catch(e) {}
}

export function closeTerminalCard() {
    const card = getEl('card-terminal');
    if (!card) return;
    card.classList.remove('active');
    card.style.display = '';
    card.setAttribute('aria-hidden', 'true');
    try { getEl('open-terminal-btn')?.classList.remove('active'); } catch(e) {}
}

export async function openCustomSymbol(symbol, type = 'equity', itemData = null) {
    if (positions[symbol]) {
        if (itemData) {
            positions[symbol].lastData = { ...itemData };
            updateUI(symbol, positions[symbol].lastData);
        }

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
        if (tab) {
            tab.classList.add('active');
            const card = getEl(`card-${symbol}`);
            if (card) card.classList.add('active');
        }
        fetchActiveSymbol(true);
        return;
    }

    const resolved = itemData || await resolveTickerDetails(symbol, { type });

    const stock = {
        symbol,
        ticker: resolved.ticker || symbol,
        name: resolved.name || symbol,
        type: resolved.type || type,
        currency: resolved.currency || 'USD',
        country: resolved.country || '',
        isin: resolved.isin || '',
        purchases: [],
        sales: []
    };

    positions[symbol] = {
        symbol: symbol,
        ticker: stock.ticker,
        name: stock.name,
        type: stock.type,
        currency: stock.currency,
        country: stock.country,
        isin: stock.isin,

        shares: 0,
        investment: 0,
        costBasis: 0,
        purchaseDate: null,
        purchases: [],
        news: [],
        lastNewsFetch: 0,
        chart: null,
        lastFetch: 0,
        lastData: null,
        currentPeriod: (resolved.period || '1D').toUpperCase()
    };

    // Pre-populate lastData if quote is available (for instant feel when using 'go')
    if (resolved.quote) {
        const q = resolved.quote;
        positions[symbol].lastData = {
            price: q.regularMarketPrice || q.price || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent || 0,
            name: q.longName || q.shortName || symbol,
            currency: q.currency || resolved.currency || 'USD',
            source: 'yahoo-quote'
        };
    } else if (itemData && itemData.price !== undefined) {
        positions[symbol].lastData = { ...itemData };
    }

    lastApiBySymbol[symbol] = selectedApi;

    ensureSection('general-tabs', type);
    createTab(stock, stock.type);

    createCard(stock);
    initChart(symbol, positions);

    if (positions[symbol].lastData) {
        updateUI(symbol, positions[symbol].lastData);
    }

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (tab) {
        tab.classList.add('active');
        const card = getEl(`card-${symbol}`);
        if (card) card.classList.add('active');
    }

    fetchActiveSymbol(true);
}

export function initMobileSidebar() {
    const homeBtn = getEl('bottom-nav-home');
    if (homeBtn) {
        homeBtn.onclick = () => {
            document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            getEl('card-home')?.classList.add('active');
            setBottomNavActive('bottom-nav-home');
        };
    }
}

export function setBottomNavActive(id, clearSidebar = true) {
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    getEl(id)?.classList.add('active');
    
    if (clearSidebar) document.body.classList.remove('sidebar-open');
}
