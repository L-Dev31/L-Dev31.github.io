import { positions, loadApiConfig, selectedApi, lastApiBySymbol, getCurrency } from './state.js';
import { createTab, createCard, updateSectionDates, initChart, markTabAsSuspended, unmarkTabAsSuspended } from './ui.js';
import { fetchActiveSymbol } from './general.js';
import { fetchYahooSparkBatch, getYahooSymbol, isYahooSparkFriendly } from './yahoo-finance.js';
import rateLimiter from './rate-limiter.js';
import { TYPE_ORDER, hasTransactions, typeLabel, typeIcon } from './constants.js';



const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

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
    let totalInvestment = 0;
    let totalTransactionCosts = 0;

    for (const pos of Object.values(positions)) {
        totalShares += pos.shares || 0;
        if (typeof pos.investment === 'number') totalInvestment += pos.investment;

        const raw = pos.raw || {};
        totalTransactionCosts += Number(raw.transactionCost || 0);

        const purchases = raw.purchases || [];
        const sales = raw.sales || [];
        [...purchases, ...sales].forEach((tx) => {
            totalTransactionCosts += Number(tx.fee || tx.fees || tx.commission || 0);
        });
    }

    setText('total-shares', totalShares);
    setText('total-investment', totalInvestment.toFixed(2) + ' ' + getCurrency());
}

export async function loadStocks() {
    const config = await loadApiConfig();
    const list = [];
    for (const type of TYPE_ORDER) {
        try {
            const response = await fetch(`json/${type}.json`);
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
        const label = typeLabel(type);
        const icon = typeIcon(type);
        if (hasPortfolio) {
            const portSection = document.createElement('div');
            portSection.className = 'tab-type-section';
            portSection.id = `portfolio-section-${type}`;
            const portTitle = document.createElement('div');
            portTitle.className = 'tab-type-title';
            portTitle.innerHTML = `<i class="${icon} type-icon"></i>${label}`;
            portSection.appendChild(portTitle);
            document.getElementById('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${icon} type-icon"></i>${label}`;
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
            chartType: 'line',
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
    } else {

    }
    updatePortfolioSummary();
    // Scan léger en arrière-plan pour détecter les tickers morts (spark batch, quota minimal).
    setTimeout(() => backgroundSuspendedScan(), 2500);
}

// Scan de santé via /v7/finance/spark (pas de crumb requis, batch 30 symboles/call).
// Mark suspend si pas de données. Unmark si données reviennent (self-heal).
// Ne touche jamais les tickers du portefeuille (on veut les voir même suspendus).
async function backgroundSuspendedScan() {
    const BATCH_SIZE = 30;
    const BATCH_DELAY_MS = 1500;
    const candidates = Object.values(positions)
        .filter(p => {
            const inPortfolio = (p.shares || 0) > 0 || hasTransactions(p);
            return !inPortfolio;
        })
        .map(p => ({ symbol: p.symbol, yahoo: getYahooSymbol(p) || p.ticker }))
        .filter(x => x.yahoo && isYahooSparkFriendly(x.yahoo));

    if (!candidates.length) return;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        if (rateLimiter.isRateLimited('yahoo')) {
            await new Promise(r => setTimeout(r, 5000));
            i -= BATCH_SIZE;
            continue;
        }
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const yahooSymbols = batch.map(b => b.yahoo);
        let results;
        try {
            results = await fetchYahooSparkBatch(yahooSymbols, '1d', '1d');
        } catch { results = null; }

        if (results) {
            // Map yahoo-symbol → a un résultat non vide ?
            const alive = new Map();
            for (const r of results) {
                const hasData = r?.response?.[0]?.indicators?.quote?.[0]?.close?.some(v => v != null);
                if (r?.symbol) alive.set(r.symbol.toUpperCase(), !!hasData);
            }
            for (const { symbol, yahoo } of batch) {
                const isAlive = alive.get(yahoo.toUpperCase());
                if (isAlive === false) markTabAsSuspended(symbol);
                else if (isAlive === true) unmarkTabAsSuspended(symbol);
                // undefined = symbole absent de la réponse → on ne tranche pas
            }
        }

        if (i + BATCH_SIZE < candidates.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
}
