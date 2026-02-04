import { positions, loadApiConfig, selectedApi, lastApiBySymbol, setPositions } from './state.js';
import { createTab, createCard, updateSectionDates, setApiStatus, initChart, markTabAsSuspended } from './ui.js';
import { fetchActiveSymbol } from './general.js'; 
import { isYahooTickerSuspended } from './api/yahoo-finance.js';

const TYPE_ORDER = ['equity', 'commodity', 'crypto'];
const TYPE_LABELS = {
    equity: 'Actions',
    commodity: 'Matières Premières',
    crypto: 'Cryptos'
};
const TYPE_ICONS = {
    equity: 'fa-solid fa-building-columns',
    commodity: 'fa-solid fa-coins',
    crypto: 'fa-brands fa-bitcoin'
};
const DEFAULT_TOTAL_INVESTMENT = 223.52;
const DEFAULT_CASH_ACCOUNT = -0.15;

const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

const hasTransactions = stock => (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);

export function calculateStockValues(stock) {
    let earliestPurchaseDate = stock.purchaseDate;
    let lots = [];
    let initialInvestment = stock.investment || 0;
    
    if (stock.purchases && stock.purchases.length > 0) {
        const dates = stock.purchases.map(p => p.date).filter(d => d).sort();
        earliestPurchaseDate = dates.length > 0 ? dates[0] : null;
        lots = stock.purchases.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).map(p => ({
            shares: p.shares || 0,
            amount: Math.abs(p.amount || 0),
            perShare: ((Math.abs(p.amount || 0)) / (p.shares || 1))
        }));
    } else if (stock.shares > 0) {
        const initialCost = Math.abs(initialInvestment);
        lots.push({ shares: stock.shares || 0, amount: initialCost, perShare: initialCost / (stock.shares || 1) });
    }

    let costBasis = lots.reduce((sum, l) => sum + l.amount, 0);

    if (stock.sales && stock.sales.length > 0) {
        const salesSorted = stock.sales.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
        salesSorted.forEach(s => {
            let remainingToRemove = s.shares || 0;
            while (remainingToRemove > 0 && lots.length > 0) {
                const lot = lots[0];
                if (lot.shares <= remainingToRemove) {
                    remainingToRemove -= lot.shares;
                    costBasis -= lot.amount;
                    lots.shift();
                } else {
                    const removedShares = remainingToRemove;
                    const removedAmount = lot.perShare * removedShares;
                    lot.shares -= removedShares;
                    lot.amount -= removedAmount;
                    costBasis -= removedAmount;
                    remainingToRemove = 0;
                }
            }
        });
    }

    const totalShares = lots.reduce((sum, l) => sum + l.shares, 0);
    
    let totalInvestment = stock.purchases && stock.purchases.length > 0
        ? stock.purchases.reduce((sum, p) => sum + (p.amount || 0), 0)
        : initialInvestment;
    if (stock.sales && stock.sales.length > 0) totalInvestment += stock.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
    
    const displayInvestment = totalShares > 0 ? totalInvestment : 0;
    return {
        investment: displayInvestment,
        shares: totalShares,
        costBasis: Math.max(0, costBasis),
        purchaseDate: earliestPurchaseDate,
        realizedPL: totalShares === 0 ? totalInvestment : 0 
    };
}

export function updatePortfolioSummary() {
    let totalShares = 0;
    let totalInvestment = DEFAULT_TOTAL_INVESTMENT;
    let cashAccount = DEFAULT_CASH_ACCOUNT;
    for (const pos of Object.values(positions)) totalShares += pos.shares || 0;
    setText('total-shares', totalShares);
    setText('total-investment', totalInvestment.toFixed(2) + ' €');
    setText('cash-account', cashAccount.toFixed(2) + ' €');
}

export async function loadStocks() {
    const config = await loadApiConfig();
    const list = [];
    for (const type of TYPE_ORDER) {
        try {
            const response = await fetch(`stock/${type}.json`);
            if (response.ok) list.push(...(await response.json()));
        } catch (error) {}
    }
    const byType = {};
    for (const s of list) {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push(s);
    }
    document.getElementById('portfolio-tabs').innerHTML = '';
    document.getElementById('general-tabs').innerHTML = '';
    for (const [type, stocks] of Object.entries(byType)) {
        const hasPortfolio = stocks.some(s => {
            const calculated = calculateStockValues(s);
            return calculated.shares > 0 || hasTransactions(s);
        });
        const hasGeneral = stocks.some(s => {
            const calculated = calculateStockValues(s);
            return calculated.shares === 0 && !hasTransactions(s);
        });
        const typeLabel = TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const iconClass = TYPE_ICONS[type] || 'fa-solid fa-layer-group';
        if (hasPortfolio) {
            const portSection = document.createElement('div');
            portSection.className = 'tab-type-section';
            portSection.id = `portfolio-section-${type}`;
            const portTitle = document.createElement('div');
            portTitle.className = 'tab-type-title';
            portTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            portSection.appendChild(portTitle);
            document.getElementById('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            genSection.appendChild(genTitle);
            document.getElementById('general-tabs').appendChild(genSection);
        }
    }
    for (const s of list) {
        const calculated = calculateStockValues(s);
        positions[s.symbol] = {
            symbol: s.symbol,
            ticker: s.ticker,
            name: s.name,
            type: s.type,
            currency: s.currency,
            api_mapping: s.api_mapping,
            shares: calculated.shares,
            investment: calculated.investment,
            costBasis: calculated.costBasis || 0,
            purchaseDate: calculated.purchaseDate,
            purchases: s.purchases || [],
            news: [],
            lastNewsFetch: 0,
            chart: null,
            lastFetch: 0,
            lastData: null,
            currentPeriod: '1D',
            raw: s
        };
        lastApiBySymbol[s.symbol] = selectedApi;
        createTab(s, s.type);
        createCard(s);
    }
    for (const sym of Object.keys(positions)) initChart(sym, positions);
    for (const sym of Object.keys(positions)) {
        try { updateSectionDates(sym); } catch (e) {}
    }
    const first = document.querySelector('.sidebar .tab');
    if (first) {
        first.classList.add('active');
        const sym = first.dataset.symbol;
        document.getElementById(`card-${sym}`)?.classList.add('active');
        fetchActiveSymbol(true);
    }
    setApiStatus(null, 'active', { api: selectedApi });
    updatePortfolioSummary();
    setTimeout(() => checkSuspendedTickers(), 3000);
}

export async function checkSuspendedTickers() {
    const symbols = Object.keys(positions);
    const batchSize = 2;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        await Promise.all(batch.map(async (symbol) => {
            try {
                const pos = positions[symbol];
                if (!pos) return;
                const yahooSymbol = pos.api_mapping?.yahoo || pos.ticker || symbol;
                
                const suspended = await isYahooTickerSuspended(yahooSymbol);
                
                if (suspended) markTabAsSuspended(symbol);
            } catch (e) {}
        }));
        if (i + batchSize < symbols.length) await new Promise(r => setTimeout(r, 1500));
    }
}
