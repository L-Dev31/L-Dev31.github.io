import { positions, loadApiConfig, selectedApi, lastApiBySymbol, setPositions } from './state.js';
import { createTab, createCard, updateSectionDates, setApiStatus, initChart } from './ui.js';
import { fetchActiveSymbol } from './general.js'; 

export function calculateStockValues(stock) {
    let earliestPurchaseDate = stock.purchaseDate;
    let lots = [];
    let initialInvestment = stock.investment || 0;
    
    // 1. Establish initial lots and cost basis
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

    // 2. Process sales
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

    // 3. Calculate final totals from remaining lots and transactions
    const totalShares = lots.reduce((sum, l) => sum + l.shares, 0);
    
    let totalInvestment = 0;
    if (stock.purchases && stock.purchases.length > 0) {
        totalInvestment += stock.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
    } else {
        totalInvestment += initialInvestment;
    }
    if (stock.sales && stock.sales.length > 0) {
        totalInvestment += stock.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
    }
    
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
    let totalInvestment = 223.52; 
    let cashAccount = -0.15; 

    Object.values(positions).forEach(pos => {
        totalShares += pos.shares || 0;
    });

    const totalSharesEl = document.getElementById('total-shares');
    const totalInvestmentEl = document.getElementById('total-investment');
    const cashAccountEl = document.getElementById('cash-account');

    if (totalSharesEl) totalSharesEl.textContent = totalShares;
    if (totalInvestmentEl) totalInvestmentEl.textContent = totalInvestment.toFixed(2) + ' €';
    if (cashAccountEl) cashAccountEl.textContent = cashAccount.toFixed(2) + ' €';
}

export async function loadStocks() {
    const config = await loadApiConfig();
    const types = ['equity', 'commodity', 'crypto'];
    const list = [];

    for (const type of types) {
        try {
            const response = await fetch(`stock/${type}.json`);
            if (response.ok) {
                const stocks = await response.json();
                list.push(...stocks);
            } else {
                console.warn(`Impossible de charger stock/${type}.json`);
            }
        } catch (error) {
            console.warn(`Erreur lors du chargement de stock/${type}.json:`, error);
        }
    }

    const byType = {};
    list.forEach(s => {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push(s);
    });

    document.getElementById('portfolio-tabs').innerHTML = '';
    document.getElementById('general-tabs').innerHTML = '';

    const typeIcons = {
        equity: 'fa-solid fa-building-columns',
        commodity: 'fa-solid fa-coins',
        crypto: 'fa-brands fa-bitcoin',
    };
    Object.entries(byType).forEach(([type, stocks]) => {
        const hasPortfolio = stocks.some(s => {
            const calculated = calculateStockValues(s);
            const hasTransactions = (s.purchases && s.purchases.length > 0) || (s.sales && s.sales.length > 0);
            return calculated.shares > 0 || hasTransactions;
        });
        const hasGeneral = stocks.some(s => {
            const calculated = calculateStockValues(s);
            const hasTransactions = (s.purchases && s.purchases.length > 0) || (s.sales && s.sales.length > 0);
            return calculated.shares === 0 && !hasTransactions;
        });
        const typeLabel = {
            equity: 'Actions',
            commodity: 'Matières Premières',
            crypto: 'Cryptos',
        }[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const iconClass = typeIcons[type] || 'fa-solid fa-layer-group';

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
    });

    list.forEach(s => {
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
            currentPeriod: '1D'
        };
        lastApiBySymbol[s.symbol] = selectedApi;
        createTab(s, s.type);
        createCard(s);
    });

    Object.keys(positions).forEach(sym => initChart(sym, positions));

    Object.keys(positions).forEach(sym => {
        try { updateSectionDates(sym); } catch (e) {}
    });

    const first = document.querySelector('.sidebar .tab');
    if (first) {
        first.classList.add('active');
        const sym = first.dataset.symbol;
        document.getElementById(`card-${sym}`).classList.add('active');
        fetchActiveSymbol(true);
    }

    setApiStatus(null, 'active', { api: selectedApi });

    updatePortfolioSummary();
    
    setTimeout(() => checkSuspendedTickers(), 2000);
}

export async function checkSuspendedTickers() {
    const YAHOO_PROXY = 'https://corsproxy.io/?';
    const symbols = Object.keys(positions);
    
    console.log(`🔍 Vérification de ${symbols.length} tickers pour détecter les suspendus...`);
    
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (symbol) => {
            try {
                const pos = positions[symbol];
                if (!pos) return;
                
                const yahooSymbol = pos.api_mapping?.yahoo || pos.ticker || symbol;
                const url = `${YAHOO_PROXY}https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`;
                
                const r = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Origin': 'https://finance.yahoo.com',
                        'Referer': 'https://finance.yahoo.com/'
                    }
                });
                if (!r.ok) {
                    if (r.status === 404) {
                        markTabAsSuspended(symbol);
                    }
                    return;
                }
                
                const data = await r.json();
                const result = data.chart?.result?.[0];
                
                if (!result) {
                    markTabAsSuspended(symbol);
                    return;
                }
                
                const meta = result.meta || {};
                const closes = result.indicators?.quote?.[0]?.close || [];
                const volumes = result.indicators?.quote?.[0]?.volume || [];
                
                const validCloses = closes.filter(c => c !== null && c !== undefined);
                const hasNoData = validCloses.length === 0;
                
                const tradeable = meta.tradeable !== false;
                const regularMarketTime = meta.regularMarketTime || 0;
                const now = Math.floor(Date.now() / 1000);
                const daysSinceLastTrade = regularMarketTime > 0 ? (now - regularMarketTime) / (60 * 60 * 24) : 999;
                
                let totalVolume = 0;
                for (const v of volumes) {
                    if (v) totalVolume += v;
                }
                const volume = meta.regularMarketVolume || totalVolume;
                
                const price = meta.regularMarketPrice || 0;
                const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
                const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
                
                const hasNoVolume = volume === 0;
                const hasNoChange = Math.abs(changePercent) < 0.001;
                const noActivity = hasNoVolume && hasNoChange;
                
                const isSuspended = !tradeable || 
                                   hasNoData ||
                                   (noActivity && daysSinceLastTrade > 3) ||
                                   daysSinceLastTrade > 7;
                
                if (isSuspended) {
                    markTabAsSuspended(symbol);
                }
                
            } catch (e) {
                console.log(`⚠️ Erreur vérification ${symbol}:`, e.message);
            }
        }));
        
        if (i + batchSize < symbols.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    
    console.log(`✅ Vérification des tickers terminée`);
}

function markTabAsSuspended(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab || tab.classList.contains('suspended')) return;
    tab.classList.add('suspended');
    if (positions[symbol]) {
        positions[symbol].suspended = true;
    }
    console.log(`📛 Tab ${symbol} marqué comme suspendu`);
}
