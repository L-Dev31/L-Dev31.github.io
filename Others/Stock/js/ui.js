import { positions, selectedApi, loadApiConfig, setSelectedApi, lastApiBySymbol } from './state.js';
import { calculateStockValues } from './portfolio.js';
import { fetchActiveSymbol } from './general.js';
import rateLimiter from './rate-limiter.js';
import { updateChart, initChart } from './chart.js';
import { updateSignal } from './signal-bot.js';
import { setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh, openNewsOverlay, openNewsPage, closeNewsPage } from './news.js';

export { initChart }; // Re-export for portfolio.js

export function createTab(stock, type) {
    const t = document.getElementById('tab-template');
    if (!t) return;
    const tab = t.content.firstElementChild.cloneNode(true);
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker;
    
    if (stock.suspended) {
        tab.classList.add('suspended');
    }
    
    const img = tab.querySelector('img');
    img.src = `icon/${stock.symbol}.png`;
    img.alt = stock.symbol;
    img.onerror = function () {
        const parent = this.parentElement;
        const ticker = (stock.ticker || stock.symbol || '').toUpperCase();
        parent.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'tab-logo-fallback';
        fallback.textContent = ticker;
        fallback.title = ticker;
        let fontSize = 12;
        if (ticker.length > 4) {
            fontSize = Math.max(6, 12 - (ticker.length - 4) * 2);
        }
        fallback.style.fontSize = fontSize + 'px';
        parent.appendChild(fallback);
    };
    
    const pos = positions[stock.symbol];
    const baseName = pos?.name || stock.symbol;
    tab.querySelector('.tab-name').textContent = baseName;
    
    const calculated = calculateStockValues(stock);
    tab.querySelector('.tab-shares').textContent = calculated.shares > 0 ? `(Actions possédées : ${calculated.shares})` : '';
    const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
    const isPortfolio = calculated.shares > 0 || hasTransactions;
    const sectionId = isPortfolio ? `portfolio-section-${type}` : `general-section-${type}`;
    document.getElementById(sectionId)?.appendChild(tab);
}

export function createCard(stock) {
    const t = document.getElementById('card-template')
    if (!t) return
    const card = t.content.firstElementChild.cloneNode(true)
    card.id = `card-${stock.symbol}`

    const logo = card.querySelector('.logo img')
    logo.id = `logo-${stock.symbol}`
    logo.dataset.symbol = stock.symbol
    logo.src = `logo/${stock.symbol}.png`
    logo.onerror = function(){
        try {
            const parent = this.parentElement;
            parent.innerHTML = '';
            const name = stock.name || stock.symbol;
            const wrapper = document.createElement('div');
            wrapper.className = 'logo-fallback';
            const nEl = document.createElement('div');
            nEl.className = 'logo-name';
            nEl.textContent = name;
            nEl.title = name;
            wrapper.appendChild(nEl);
            parent.appendChild(wrapper);
        } catch(e) { this.parentElement.innerHTML = stock.symbol.slice(0,2); }
    }

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

    const isin = card.querySelector('.general-row strong + span')
    if (isin) {
        isin.id = `isin-${stock.symbol}`
        isin.textContent = stock.isin || ''
        if (!stock.isin) isin.parentElement.style.display='none'
    }

    const arr = card.querySelectorAll('.general-row strong + span')
    const tk = arr[1]
    if (tk) {
        tk.id = `ticker-${stock.symbol}`
        tk.textContent = stock.ticker || stock.symbol
    }

    const symInfo = card.querySelector('#symbol-info')
    if (symInfo) symInfo.textContent = stock.symbol

    const cn = card.querySelector('.country-name')
    if (cn) cn.textContent = stock.country || ''

    const flag = card.querySelector('.flag-icon')
    if (flag) {
        flag.id = `flag-${stock.symbol}`
        flag.dataset.country = stock.country || ''
        flag.src = `flag/${(stock.country||'').toLowerCase()}.png`
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
        upd.textContent = 'Dernière mise à jour : --'
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

    const tds = card.querySelectorAll('.card-table-td')
    if (tds.length===8) {
        tds[1].id=`invest-${stock.symbol}`
        tds[2].id=`value-${stock.symbol}`
        tds[3].id=`profit-${stock.symbol}`
        tds[5].id=`invest-per-${stock.symbol}`
        tds[6].id=`value-per-${stock.symbol}`
        tds[7].id=`profit-per-${stock.symbol}`
    }

    const hasEverInvested = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);

    const investmentTabBtn = card.querySelector('.card-tab-btn[data-target="investment"]');
    if (investmentTabBtn) {
        investmentTabBtn.style.display = hasEverInvested ? '' : 'none';
    }

    if (calculated.shares > 0) {
        const displayInvestment = typeof calculated.costBasis === 'number' ? calculated.costBasis : Math.abs(calculated.investment || 0);
        tds[1].textContent = `${displayInvestment.toFixed(2)} €`;
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        const displayInvestPerShare = calculated.shares ? (displayInvestment / calculated.shares) : 0;
        tds[5].textContent = calculated.shares ? `${displayInvestPerShare.toFixed(2)} €` : '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    } else {
        tds[1].textContent = '0.00 €';
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        tds[5].textContent = '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    }

    const cardTableContainer = card.querySelector('.card-table-container')
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

    const info = card.querySelectorAll('.info-value')
    if (info.length===4) {
        info[0].id=`open-${stock.symbol}`
        info[1].id=`high-${stock.symbol}`
        info[2].id=`low-${stock.symbol}`
        info[3].id=`close-${stock.symbol}`
        info.forEach(el=>el.textContent='--')
    }

    const transactionTitle = card.querySelector('.transaction-history-title')
    if (transactionTitle) {
        transactionTitle.id = `transaction-history-title-${stock.symbol}`;
        transactionTitle.style.display = '';
    }

    const transactionContainer = card.querySelector('.transaction-history-container')
    if (transactionContainer) {
        transactionContainer.style.display = '';
        const tbody = card.querySelector('.transaction-history-body');
        const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
        if (tbody && hasTransactions) {
            let transactions = [];
            if (stock.purchases) {
                stock.purchases.forEach(p => transactions.push({date: p.date, amount: p.amount, shares: p.shares, type: 'Achat'}));
            }
            if (stock.sales) {
                stock.sales.forEach(s => transactions.push({date: s.date, amount: s.amount, shares: s.shares, type: 'Vente'}));
            }
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            const rowTpl = document.getElementById('transaction-row-template');
            tbody.innerHTML = '';
            transactions.forEach(t => {
                const row = rowTpl ? rowTpl.content.firstElementChild.cloneNode(true) : document.createElement('tr');
                row.classList.add(t.type === 'Achat' ? 'transaction-buy' : 'transaction-sell');
                const dateEl = row.querySelector('.trans-date');
                const typeEl = row.querySelector('.trans-type');
                const amountEl = row.querySelector('.trans-amount');
                const sharesEl = row.querySelector('.trans-shares');
                const priceEl = row.querySelector('.trans-price');
                if (dateEl) dateEl.textContent = new Date(t.date).toLocaleDateString('fr-FR');
                if (typeEl) typeEl.textContent = t.type;
                if (amountEl) amountEl.textContent = Math.abs(t.amount).toFixed(2) + ' €';
                if (sharesEl) sharesEl.textContent = t.shares;
                if (priceEl) priceEl.textContent = (Math.abs(t.amount) / t.shares).toFixed(2) + ' €';
                tbody.appendChild(row);
            });
        }
    }

    const nl = card.querySelector('.news-list');
    if (nl) nl.id = `news-list-${stock.symbol}`;

    document.getElementById('cards-container')?.appendChild(card)
    
    setupNewsSearch(stock.symbol);
}

export function updateUI(symbol, data) {
    if (!data || data.error) {
        if (data && data.throttled) {
            setApiStatus(symbol, 'fetching', { api: data?.source, loadingFallback: true });
            return;
        }
        if (data && data.errorCode === 429 && data.throttled) {
            setApiStatus(symbol, 'fetching', { api: data?.source, loadingFallback: true, errorCode: 429 });
            const el = document.getElementById('api-status-indicator');
            if (el) {
                const text = el.querySelector('[data-role="status-text"]');
                if (text) text.textContent = 'Limite atteinte, veuillez patienter…';
            }
            return;
        }
        
        const deadErrorCodes = [404, 'NO_DATA', 'NO_VALID_DATA'];
        if (data && deadErrorCodes.includes(data.errorCode)) {
            markTabAsSuspended(symbol);
        }
        
        clearPeriodDisplay(symbol);
        setApiStatus(symbol, 'noinfo', { api: data?.source, errorCode: data?.errorCode });
        return;
    }
    
    unmarkTabAsSuspended(symbol);

    try {
        const cardRoot = document.getElementById(`card-${symbol}`);
        if (cardRoot) {
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
        updateChart(symbol, data.timestamps, data.prices, positions, data.source, data);
    }

    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);

    if (openEl) openEl.textContent = data.open ? data.open.toFixed(2) + ' €' : '--';
    if (highEl) highEl.textContent = data.high ? data.high.toFixed(2) + ' €' : '--';
    if (lowEl) lowEl.textContent = data.low ? data.low.toFixed(2) + ' €' : '--';
    if (closeEl) closeEl.textContent = data.price ? data.price.toFixed(2) + ' €' : '--';

    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl && data.changePercent !== undefined) {
        const changePercent = data.changePercent;
        const change = data.change || 0;
        const isPositive = change >= 0;
        
        perfEl.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;
        perfEl.className = `performance-value ${isPositive ? 'positive' : 'negative'}`;
    }

    const valueEl = document.getElementById(`value-${symbol}`);
    const valuePerEl = document.getElementById(`value-per-${symbol}`);
    const profitEl = document.getElementById(`profit-${symbol}`);
    const profitPerEl = document.getElementById(`profit-per-${symbol}`);

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
            if (valueEl) { valueEl.textContent = 'Données obsolètes'; valueEl.className = 'outdated'; }
            if (valuePerEl) { valuePerEl.textContent = 'Données obsolètes'; valuePerEl.className = 'outdated'; }
            if (profitEl) { profitEl.textContent = 'Données obsolètes'; profitEl.className = 'outdated'; }
            if (profitPerEl) { profitPerEl.textContent = 'Données obsolètes'; profitPerEl.className = 'outdated'; }
        } else {
            const totalValue = currentPrice * shares;
            if (valueEl) {
                valueEl.textContent = totalValue.toFixed(2) + ' €';
                const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
                valueEl.className = totalValue >= costBasis ? 'positive' : 'negative';
            }

            if (valuePerEl) {
                valuePerEl.textContent = currentPrice.toFixed(2) + ' €';
                const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
                const perShareCost = shares ? costBasis / shares : 0;
                valuePerEl.className = currentPrice >= perShareCost ? 'positive' : 'negative';
            }

            const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
            const totalProfit = totalValue - costBasis;
            if (profitEl) {
                profitEl.textContent = `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} €`;
                profitEl.className = totalProfit >= 0 ? 'positive' : 'negative';
            }

            const profitPerShare = currentPrice - (shares ? (costBasis / shares) : 0);
            if (profitPerEl) {
                profitPerEl.textContent = `${profitPerShare >= 0 ? '+' : ''}${profitPerShare.toFixed(2)} €`;
                profitPerEl.className = profitPerShare >= 0 ? 'positive' : 'negative';
            }
        }
    }

    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) {
        let timeString = '--';
        if (data.timestamps && data.timestamps.length > 0) {
            const latestTimestamp = Math.max(...data.timestamps);
            const dataDate = new Date(latestTimestamp * 1000);
            const dateStr = dataDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dataDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            timeString = `${dateStr} à ${timeStr}`;
        }
        updateEl.textContent = `Dernière mise à jour : ${timeString}`;
    }

    if (data && data.name && positions[symbol] && positions[symbol].name === symbol) {
        positions[symbol].name = data.name;
        updateTabTitle(symbol);
    }
    try {
        const investEl = document.getElementById(`invest-${symbol}`);
        const investPerEl = document.getElementById(`invest-per-${symbol}`);
        if (investEl) {
            const inv = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            investEl.textContent = `${inv.toFixed(2)} €`;
            investEl.classList.remove('positive');
            investEl.classList.remove('negative');
        }
        if (investPerEl) {
            const costBasis = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            const invPer = (positions[symbol].shares && positions[symbol].shares > 0) ? (costBasis / positions[symbol].shares) : 0;
            investPerEl.textContent = positions[symbol].shares ? `${invPer.toFixed(2)} €` : '--';
        }
    } catch(e) { /* ignore if cells missing */ }
    
    updateTabTitle(symbol);
    updateCardTitle(symbol);
    try { updateSectionDates(symbol); } catch (e) { /* ignore */ }

    const currentPeriod = positions[symbol]?.currentPeriod || '1D';
    updateSignal(symbol, data, { period: currentPeriod });
}

export function resetSymbolDisplay(symbol) {
    if (!positions[symbol]) return
    
    if (positions[symbol].chart) {
        positions[symbol].chart.data.labels = []
        positions[symbol].chart.data.datasets[0].data = []
        positions[symbol].chart.data.timestamps = []
        positions[symbol].chart.update('none')
    }
    
    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);
    
    if (openEl) openEl.textContent = '--'
    if (highEl) highEl.textContent = '--'
    if (lowEl) lowEl.textContent = '--'
    if (closeEl) closeEl.textContent = '--'
    
    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl) {
        perfEl.textContent = '--'
        perfEl.className = 'performance-value'
    }
    
    const valueEl = document.getElementById(`value-${symbol}`);
    const valuePerEl = document.getElementById(`value-per-${symbol}`);
    const profitEl = document.getElementById(`profit-${symbol}`);
    const profitPerEl = document.getElementById(`profit-per-${symbol}`);
    
    if (valueEl) valueEl.textContent = '--'
    if (valuePerEl) valuePerEl.textContent = '--'
    if (profitEl) profitEl.textContent = '--'
    if (profitPerEl) profitPerEl.textContent = '--'
    
    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) {
        updateEl.textContent = 'Dernière mise à jour : --'
    }

    const signalCursor = document.getElementById(`signal-cursor-${symbol}`);
    const signalValue = document.getElementById(`signal-value-${symbol}`);
    const signalDescription = document.getElementById(`signal-description-${symbol}`);

    if (signalCursor) signalCursor.style.left = '50%';
    if (signalValue) {
        signalValue.textContent = 'Neutre';
        signalValue.style.color = '#a8a2ff';
    }
    if (signalDescription) signalDescription.textContent = 'Analyse technique en cours...';
}

export function clearPeriodDisplay(symbol) {
    if (!positions[symbol]) return;
    if (positions[symbol].chart) {
        positions[symbol].chart.data.labels = [];
        if (positions[symbol].chart.data.datasets && positions[symbol].chart.data.datasets[0]) {
            positions[symbol].chart.data.datasets[0].data = [];
        }
        positions[symbol].chart.data.timestamps = [];
        try { positions[symbol].chart.update('none'); } catch (e) { /* ignore */ }
    }

    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);
    if (openEl) openEl.textContent = '--';
    if (highEl) highEl.textContent = '--';
    if (lowEl) lowEl.textContent = '--';
    if (closeEl) closeEl.textContent = '--';

    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl) { perfEl.textContent = '--'; perfEl.className = 'performance-value'; }
    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) updateEl.textContent = 'Dernière mise à jour : --';

    const signalCursor = document.getElementById(`signal-cursor-${symbol}`);
    const signalValue = document.getElementById(`signal-value-${symbol}`);
    const signalDescription = document.getElementById(`signal-description-${symbol}`);
    if (signalCursor) signalCursor.style.left = '50%';
    if (signalValue) { signalValue.textContent = 'Neutre'; signalValue.style.color = '#a8a2ff'; }
    if (signalDescription) signalDescription.textContent = 'Pas de données pour cette période';

    const cardRoot = document.querySelector(`#card-${symbol}`);
    if (cardRoot) {
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
    const dateStr = getLastDataDate(symbol);
    if (!dateStr) return;
    const titleEl = document.getElementById(`course-title-${symbol}`);
    if (!titleEl) return;
    titleEl.textContent = `Cours de l'action (${dateStr})`;
}

export function updateSectionDates(symbol) {
    const dateStr = getBestDataDate(symbol);
    const courseTitle = document.getElementById(`course-title-${symbol}`);
    if (courseTitle) {
        const courseDate = courseTitle.nextElementSibling;
        if (courseDate && courseDate.classList.contains('section-date')) {
            courseDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    const invTitle = document.getElementById(`investment-title-${symbol}`);
    if (invTitle) {
        const invDate = invTitle.nextElementSibling;
        if (invDate && invDate.classList.contains('section-date')) {
            invDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    const detTitle = document.getElementById(`details-title-${symbol}`);
    if (detTitle) {
        const detDate = detTitle.nextElementSibling;
        if (detDate && detDate.classList.contains('section-date')) {
            detDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    const signalTitle = document.getElementById(`signal-title-${symbol}`);
    if (signalTitle) {
        const signalDate = signalTitle.nextElementSibling;
        if (signalDate && signalDate.classList.contains('section-date')) {
            signalDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
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
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }
    return '';
}

export function markTabAsSuspended(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab || tab.classList.contains('suspended')) return;
    tab.classList.add('suspended');
    if (positions[symbol]) {
        positions[symbol].suspended = true;
    }
    console.log(`📛 Tab ${symbol} marqué comme suspendu`);
}

export function unmarkTabAsSuspended(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab || !tab.classList.contains('suspended')) return;
    tab.classList.remove('suspended');
    if (positions[symbol]) {
        positions[symbol].suspended = false;
    }
}

export async function setApiStatus(symbol, status, opts = {}) {
    const config = await loadApiConfig();
    if (opts && typeof opts.errorCode !== 'undefined' && opts.errorCode !== null) {
        status = 'noinfo';
    }

    let el = document.getElementById('api-status-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'api-status-indicator';
        document.body.appendChild(el);
    }
    const template = document.getElementById('api-indicator-template');
    if (!template) return;
    const content = template.content.cloneNode(true);
    const dot = content.querySelector('.api-dot');
    if (dot) {
        dot.className = 'api-dot ' + (status === 'active' ? 'active' : (status === 'noinfo' ? 'noinfo' : (status === 'fetching' ? 'fetching' : 'inactive')));
    }
    const logo = content.querySelector('.api-indicator-logo');
    if (logo) {
        let api = opts.api || selectedApi;
        const apiConfig = config.apis[api];
        logo.src = apiConfig.logo;
        logo.alt = apiConfig.name;
    }
    const text = content.querySelector('[data-role="status-text"]');
    if (text) {
        if (status === 'noinfo') {
            text.textContent = `Err. ${opts.errorCode || 404}`;
        } else if (status === 'fetching') {
            text.textContent = 'loading...';
        } else {
            text.textContent = status === 'active' ? 'actif' : 'inactif';
        }
    }

    try {
        const apiToCheck = opts.api || selectedApi;
        if (rateLimiter.isRateLimited(apiToCheck)) {
            if (status !== 'noinfo') {
                status = 'fetching';
            }
            opts = Object.assign({}, opts, { rateLimited: true });
            const remainingMs = rateLimiter.getRemainingSeconds(apiToCheck) * 1000;
            updateApiCountdown(Math.ceil(remainingMs / 1000));
        }
    } catch (e) { /* ignore */ }
    const expanded = content.querySelector('.api-expanded');
    if (expanded) {
        expanded.innerHTML = '';
        const optTpl = document.getElementById('api-option-template');
        config.ui.validApis.forEach(api => {
            const opt = optTpl ? optTpl.content.firstElementChild.cloneNode(true) : document.createElement('div');
            opt.classList.add('api-option');
            opt.dataset.api = api;
            opt.textContent = config.apis[api].name;
            expanded.appendChild(opt);
        });
    }
    const spinner = content.querySelector('[data-role="spinner"]');
    if (spinner && opts.loadingFallback) {
        spinner.classList.remove('hidden-by-bot');
        if (!spinner.querySelector('.api-spinner')) {
            const s = document.createElement('span');
            s.className = 'api-spinner';
            spinner.appendChild(s);
        }
    }
    el.innerHTML = '';
    el.appendChild(content);
    el.title = symbol || '';
    el.className = 'api-status-indicator ' + status;

    const apiToCheck = opts.api || selectedApi;
    if (rateLimiter.isRateLimited(apiToCheck)) {
        const remainingSec = rateLimiter.getRemainingSeconds(apiToCheck);
        updateApiCountdown(remainingSec);
    }
}

export function updateApiCountdown(seconds) {
    const el = document.getElementById('api-status-indicator');
    if (!el) return;

    let spinner = el.querySelector('[data-role="spinner"]');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.setAttribute('data-role', 'spinner');
        spinner.classList.add('api-indicator-spinner-row', 'column');
        el.appendChild(spinner);
    }

    const spinnerRow = el.querySelector('[data-role="spinner"]');
    if (spinnerRow) {
        spinnerRow.classList.add('column');
        spinnerRow.innerHTML = '';
        let wrapper = document.createElement('div');
        wrapper.className = 'api-countdown-wrapper';

        const textElem = document.createElement('div');
        textElem.className = 'countdown-text';
        textElem.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;

        const spinnerElem = document.createElement('div');
        spinnerElem.className = 'api-spinner-wrapper';
        if (!spinnerElem.querySelector('.api-spinner')) {
            const s = document.createElement('span');
            s.className = 'api-spinner';
            spinnerElem.appendChild(s);
        }

        wrapper.appendChild(textElem);
        wrapper.appendChild(spinnerElem);
        spinnerRow.appendChild(wrapper);
        return;
    }
}

export function updateDropdownSelection() {
    const el = document.getElementById('api-status-indicator')
    if (!el) return
    const opts = el.querySelectorAll('.api-option')
    opts.forEach(o => o.classList.remove('active'))
    const active = el.querySelector(`[data-api="${selectedApi}"]`)
    if (active) active.classList.add('active')
}

export function getActiveSymbol() {
    const t = document.querySelector('.tab.active')
    return t? t.dataset.symbol:null
}

export function openTerminalCard(prefill = '') {
    const card = document.getElementById('card-terminal');
    const input = document.getElementById('terminal-input');
    if (!card || !input) return;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    try { document.getElementById('open-terminal-btn')?.classList.add('active'); } catch(e) {}
    try { document.getElementById('news-overlay')?.setAttribute('aria-hidden', 'true'); } catch(e) {}
    input.value = prefill;
    card.style.display = '';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    try { const out = document.getElementById('terminal-output'); if (out) out.scrollTop = out.scrollHeight; } catch(e) {}
}

export function closeTerminalCard() {
    const card = document.getElementById('card-terminal');
    if (!card) return;
    card.classList.remove('active');
    card.style.display = '';
    card.setAttribute('aria-hidden', 'true');
    try { document.getElementById('open-terminal-btn')?.classList.remove('active'); } catch(e) {}
}

export async function openCustomSymbol(symbol, type = 'equity') {
    if (positions[symbol]) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
        if (tab) {
            tab.classList.add('active');
            const card = document.getElementById(`card-${symbol}`);
            if (card) card.classList.add('active');
        }
        fetchActiveSymbol(true);
        return;
    }

    const stock = {
        symbol: symbol,
        ticker: symbol,
        name: symbol,
        type: type,
        currency: 'USD',
        api_mapping: {},
        purchases: [],
        sales: []
    };

    positions[symbol] = {
        symbol: symbol,
        ticker: symbol,
        name: symbol,
        type: type,
        currency: 'USD',
        api_mapping: {},
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
        currentPeriod: '1D'
    };

    lastApiBySymbol[symbol] = selectedApi;

    const hasGeneral = true; 
    if (hasGeneral) {
        let genSection = document.getElementById(`general-section-${type}`);
        if (!genSection) {
            genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            const typeIcons = {
                equity: 'fa-solid fa-building-columns',
                commodity: 'fa-solid fa-coins',
                crypto: 'fa-brands fa-bitcoin',
            };
            const iconClass = typeIcons[type] || 'fa-solid fa-layer-group';
            const typeLabel = {
                equity: 'Actions',
                commodity: 'Matières Premières',
                crypto: 'Cryptos',
            }[type] || type.charAt(0).toUpperCase() + type.slice(1);
            genTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            genSection.appendChild(genTitle);
            document.getElementById('general-tabs').appendChild(genSection);
        }
        createTab(stock, type);
    }

    createCard(stock);
    initChart(symbol, positions);

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (tab) {
        tab.classList.add('active');
        const card = document.getElementById(`card-${symbol}`);
        if (card) card.classList.add('active');
    }

    fetchActiveSymbol(true);
}
