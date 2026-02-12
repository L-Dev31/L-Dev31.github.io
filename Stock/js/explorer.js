import { fetchYahooScreener, fetchYahooChartSnapshot, fetchYahooPeriodChanges, isYahooTickerActiveFromQuote, isYahooTickerActiveFromChart, computeDaysSinceLastTrade } from './api/yahoo-finance.js';
import { typeLabel, typeIcon, debounce } from './constants.js';
import { fetchAllTradingViewRows } from './api/tradingview.js';

// Removed IIFE wrapper
{
    'use strict';
    const ITEMS_PER_PAGE = 10;
    const SCREENER_BATCH_SIZE = 250;
    const HARD_MAX_RESULTS = 1000;
    const YAHOO_SAFE_LIMIT = 150;
    const MAX_TICKERS_MIN = 50;
    const MAX_TICKERS_MAX = 600;
    const PERIOD_ENRICH_MAX = 120;
    const DEFAULT_MAX_TICKERS = YAHOO_SAFE_LIMIT;
    const state = {
        maxFetchTickers: DEFAULT_MAX_TICKERS,
        currentPage: 1,
        results: [],
        total: 0,
        isLoading: false,
        currentPeriod: '1D',
        cachedItems: null,
        lastParams: null
    };

    const PERIOD_LABELS = { '1D': '1J', '1W': '1S', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1A', 'YTD': 'YTD' };
    const PERIOD_CONFIG = {
        '1D': { range: '1d', interval: '1m' },
        '1W': { range: '5d', interval: '1h' },
        '1M': { range: '1mo', interval: '1d' },
        '3M': { range: '3mo', interval: '1d' },
        '6M': { range: '6mo', interval: '1d' },
        '1Y': { range: '1y', interval: '1wk' },
        'YTD': { range: 'ytd', interval: '1d' }
    };

    const YAHOO_SCREENERS = ['day_gainers', 'day_losers', 'most_actives', 'undervalued_growth_stocks', 'growth_technology_stocks', 'undervalued_large_caps', 'aggressive_small_caps', 'small_cap_gainers'];

    const MARKET_CONFIG = {
        australia: { suffix: '.AX', country: 'AU' },
        uk: { suffix: '.L', country: 'GB' },
        germany: { suffix: '.DE', country: 'DE' },
        france: { suffix: '.PA', country: 'FR' },
        switzerland: { suffix: '.SW', country: 'CH' },
        japan: { suffix: '.T', country: 'JP' },
        canada: { suffix: '.TO', country: 'CA', transform: t => t.replace('.', '-').toUpperCase() },
        india: { country: 'IN', resolve: (t, e) => e === 'BSE' ? `${t}.BO` : `${t}.NS` },
        china: { country: 'CN', resolve: (t, e) => e === 'SZSE' ? `${t}.SZ` : `${t}.SS` },
        hongkong: { country: 'HK', resolve: t => `${t.padStart(4, '0')}.HK` },
        korea: { country: 'KR', resolve: (t, e) => e === 'KOSDAQ' ? `${t}.KQ` : `${t}.KS` },
        // Market ID mappings
        euronext: { country: 'FR' }, lse: { country: 'GB' }, xetra: { country: 'DE' },
        asx: { country: 'AU' }, tsx: { country: 'CA' }, six: { country: 'CH' },
        tse: { country: 'JP' }, hkex: { country: 'HK' }, sse: { country: 'CN' },
        szse: { country: 'CN' }, nse: { country: 'IN' }, bse: { country: 'IN' }, krx: { country: 'KR' }
    };

    const getMaxAllowed = () => Math.min(state.maxFetchTickers, HARD_MAX_RESULTS);

    let stockIconMap = {};
    let yahooToJsonSymbol = {};
    let cryptoSymbols = new Set();

    let marketsData = [];

    async function loadMarkets() {
        try {
            const r = await fetch('json/markets.json');
            if (r.ok) {
                marketsData = await r.json();
                renderMarketSelect();
            }
        } catch (e) { console.error('Failed to load markets', e); }
    }

    function renderMarketSelect() {
        const select = document.getElementById('explorer-market');
        if (!select) return;
        select.innerHTML = '<option value="">Sélectionner...</option>';
        marketsData.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        });

        // Initialize visibility
        const eligibilitySelect = document.getElementById('explorer-eligibility');
        if (eligibilitySelect && eligibilitySelect.parentElement) {
            eligibilitySelect.parentElement.style.display = 'none';
        }
    }

    function selectMarket(marketId) {
        const select = document.getElementById('explorer-market');
        if (select) {
            select.value = marketId;
            
            const eligibilitySelect = document.getElementById('explorer-eligibility');
            if (eligibilitySelect && eligibilitySelect.parentElement) {
                const marketDef = marketsData.find(m => m.id === marketId);
                const hasLists = marketDef && marketDef.type === 'list' && marketDef.lists && Object.keys(marketDef.lists).length > 0;
                
                if (hasLists) {
                    // Dynamic population from JSON
                    eligibilitySelect.innerHTML = '<option value="">Tous</option>';
                    Object.keys(marketDef.lists).forEach(listKey => {
                        const opt = document.createElement('option');
                        opt.value = listKey;
                        // Simple capitalization for label
                        opt.textContent = listKey.charAt(0).toUpperCase() + listKey.slice(1); 
                        eligibilitySelect.appendChild(opt);
                    });
                    eligibilitySelect.parentElement.style.display = 'flex';
                } else {
                    eligibilitySelect.parentElement.style.display = 'none';
                    eligibilitySelect.value = '';
                }
            }

            loadData();
        }
    }

    async function init() {
        await loadMarkets();
        await loadStockMappings();
        bindEvents();
    }

    async function loadStockMappings() {
        const files = ['stock/equity.json', 'stock/crypto.json', 'stock/commodity.json'];
        const results = await Promise.allSettled(files.map(f => fetch(f).then(r => r.json())));
        
        results.forEach((res, i) => {
            if (res.status !== 'fulfilled') return;
            const isCrypto = files[i].includes('crypto');
            res.value.forEach(s => {
                const sym = s.symbol;
                if (s.ticker) { stockIconMap[s.ticker] = sym; yahooToJsonSymbol[s.ticker] = sym; }
                if (sym) { stockIconMap[sym] = sym; yahooToJsonSymbol[sym] = sym; }
                if (s.api_mapping?.yahoo) yahooToJsonSymbol[s.api_mapping.yahoo] = sym;
                if (isCrypto && sym) cryptoSymbols.add(sym);
            });
        });
    }

    function getJsonSymbol(sym) {
        if (yahooToJsonSymbol[sym]) return yahooToJsonSymbol[sym];
        const base = sym.split('.')[0].split('-')[0];
        return yahooToJsonSymbol[base] || null;
    }

    function getIconSymbol(sym) {
        if (stockIconMap[sym]) return stockIconMap[sym];
        const base = sym.split('.')[0].split('-')[0];
        const mapped = stockIconMap[base];
        
        if (mapped) {
            // Prevent regional stocks (with dot suffix) from matching crypto symbols (e.g. SOL.AX -> SOL)
            if (sym.includes('.') && cryptoSymbols.has(mapped)) {
                return null;
            }
            return mapped;
        }
        return null;
    }

    function buildOnlineIconCandidates(symbol, market) {
        const candidates = [];
        const seen = new Set();
        const upper = (symbol || '').toUpperCase();
        const base = upper.split('.')[0].split('-')[0].split('/')[0];
        const isCrypto = market === 'crypto' || cryptoSymbols.has(base) || upper.endsWith('-USD');

        const add = (url) => {
            if (url && !seen.has(url)) {
                seen.add(url);
                candidates.push(url);
            }
        };

        if (isCrypto) {
            const lower = base.toLowerCase();
            add(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${lower}.png`);
            add(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/black/${lower}.png`);
        } else {
            const variants = [upper, upper.replace('.', '-'), upper.split('.')[0], base].filter(Boolean);
            variants.forEach(v => add(`https://storage.googleapis.com/iex/api/logos/${v}.png`));
        }

        return candidates;
    }

    async function fetchScreener(scrIds, offset = 0, count = SCREENER_BATCH_SIZE) {
        try {
            return await fetchYahooScreener(scrIds, offset, count);
        } catch (e) {
            return { quotes: [], total: 0 };
        }
    }

    async function fetchAllScreenerResults(scrIds) {
        let allQuotes = [];
        const first = await fetchScreener(scrIds, 0, SCREENER_BATCH_SIZE);
        allQuotes = first.quotes;
        const total = Number(first.total) || 0;
        const maxTotal = getMaxAllowed();
        let lastBatchCount = first.quotes.length;

        while (allQuotes.length < total && allQuotes.length < maxTotal && lastBatchCount === SCREENER_BATCH_SIZE) {
            showLoadingProgress(allQuotes.length, Math.min(total, maxTotal));
            const batch = await fetchScreener(scrIds, allQuotes.length, SCREENER_BATCH_SIZE);
            lastBatchCount = batch.quotes.length;
            if (lastBatchCount === 0) break;
            allQuotes = allQuotes.concat(batch.quotes);
            if (lastBatchCount < SCREENER_BATCH_SIZE) break;
        }
        if (allQuotes.length > maxTotal) allQuotes = allQuotes.slice(0, maxTotal);
        return allQuotes;
    }

    async function fetchMultipleScreeners(screenerIds = YAHOO_SCREENERS) {
        const allQuotes = [];
        const seen = new Set();
        const maxAllowed = getMaxAllowed();
        for (const scrId of screenerIds) {
            showLoadingProgress(allQuotes.length, `${scrId}...`);
            try {
                const quotes = await fetchAllScreenerResults(scrId);
                for (const q of quotes.filter(Boolean)) {
                    if (!q?.symbol || seen.has(q.symbol)) continue;
                        seen.add(q.symbol);
                        allQuotes.push(q);
                    if (allQuotes.length >= maxAllowed) break;
                }
                if (allQuotes.length >= maxAllowed) break;
            } catch (e) {}
        }
        return allQuotes.slice(0, maxAllowed);
    }

    function mapQuoteToItem(q) {
        if (!q) return null;
        const price = q.regularMarketPrice || q.price || 0;
        const change = q.regularMarketChange || 0;
        const changePercent = q.regularMarketChangePercent || 0;
        const volume = q.regularMarketVolume || 0;
        const exchange = (q.exchange || '').toUpperCase();
        const fullExchange = (q.fullExchangeName || '').toLowerCase();
        const symbol = q.symbol || '';

        let market = 'other';
        
        // Dynamic market detection from marketsData
        const foundMarket = marketsData.find(m => 
            (m.exchanges && m.exchanges.includes(exchange))
        );

        if (foundMarket) {
            market = foundMarket.id;
        } else {
            // Fallbacks
            if (['NMS', 'NGS', 'NCM', 'NASDAQ'].includes(exchange)) market = 'nasdaq';
            else if (['NYQ', 'NYSE', 'NYS', 'PCX', 'ASE'].includes(exchange)) market = 'nyse';
            else if (exchange === 'PAR' || exchange === 'EPA' || symbol.endsWith('.PA')) market = 'euronext';
            else if (exchange === 'CCC' || q.quoteType === 'CRYPTOCURRENCY') market = 'crypto';
            else if (fullExchange.includes('nasdaq')) market = 'nasdaq';
            else if (fullExchange.includes('nyse') || fullExchange.includes('new york')) market = 'nyse';
            else if (fullExchange.includes('paris') || fullExchange.includes('euronext')) market = 'euronext';
        }

        const yahooSector = (q.sector || q.industry || '').toLowerCase();
        let sector = 'other';
        if (yahooSector.match(/tech|software|semiconductor|computer|electronic/)) sector = 'technology';
        else if (yahooSector.match(/health|pharma|biotech|medical/)) sector = 'healthcare';
        else if (yahooSector.match(/financ|bank|insurance|capital/)) sector = 'finance';
        else if (yahooSector.match(/energy|oil|gas|petrol/)) sector = 'energy';
        else if (yahooSector.match(/consumer|retail|food|beverage|apparel/)) sector = 'consumer';

        let eligibility = 'cto';
        if (market === 'euronext') eligibility = q.marketCap && q.marketCap < 1e9 ? 'pea-pme' : 'pea';

        const daysSinceLastTrade = computeDaysSinceLastTrade(q.regularMarketTime);
        const isSuspended = !isYahooTickerActiveFromQuote(q);

        let score = Math.max(0, Math.min(100, 50 + changePercent * 3 + Math.min(volume / 50000000, 15)));
        let signal = score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold';

        return {
            symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
            price, change, changePercent, volume, market, sector, eligibility,
            currency: q.currency || 'USD', marketCap: q.marketCap, industry: q.industry || '',
            isClosed: isSuspended, isSuspended,
            daysSinceLastTrade: Math.round(daysSinceLastTrade),
            score: Math.round(score), signal
        };
    }

    async function fetchStockDetails(symbol, marketId = 'euronext', defaultEligibility = 'cto') {
        const fetchOne = async (sym) => {
            try {
                const result = await fetchYahooChartSnapshot(sym, '1d', '1m');
                if (!result) return null;

                const meta = result.meta || {};
                const closes = result.indicators?.quote?.[0]?.close || [];
                const volumes = result.indicators?.quote?.[0]?.volume || [];

                let price = meta.regularMarketPrice || 0;
                if (!price) for (let i = closes.length - 1; i >= 0; i--) if (closes[i] !== null) { price = closes[i]; break; }

                const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
                const change = prevClose ? price - prevClose : 0;
                const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

                let totalVolume = volumes.reduce((a, v) => a + (v || 0), 0);
                const volume = meta.regularMarketVolume || totalVolume;

                const isSuspended = !isYahooTickerActiveFromChart(meta, closes, volumes);
                const daysSinceLastTrade = computeDaysSinceLastTrade(meta.regularMarketTime);

                let score = Math.max(0, Math.min(100, 50 + changePercent * 3 + Math.min(volume / 50000000, 15)));
                let signal = score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold';

                return {
                    symbol: sym, name: meta.shortName || meta.longName || sym.replace(/\.[A-Z]+$/, ''),
                    price, change, changePercent, volume,
                    market: marketId, sector: 'other', eligibility: defaultEligibility,
                    currency: meta.currency || 'USD', marketCap: 0, industry: '',
                    isClosed: isSuspended, isSuspended,
                    daysSinceLastTrade: Math.round(daysSinceLastTrade),
                    score: Math.round(score), signal
                };
            } catch (e) { return null; }
        };

        return fetchOne(symbol);
    }

    async function fetchStocksBatch(symbols, defaultEligibility = 'pea', marketId = 'euronext') {
        const uniqueSymbols = [...new Set((symbols || []).filter(Boolean))];
        const limitedSymbols = uniqueSymbols.slice(0, getMaxAllowed());
        const items = [];
        let completed = 0;
        showLoadingProgress(0, `Loading (${limitedSymbols.length})...`);
        if (!limitedSymbols.length) return items;

        const BATCH_SIZE = 3;
        const STEP_DELAY = 320;
        const COOLDOWN_EVERY = 60;
        const COOLDOWN_MS = 3000;

        for (let i = 0; i < limitedSymbols.length; i += BATCH_SIZE) {
            const batch = limitedSymbols.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(s => fetchStockDetails(s, marketId, defaultEligibility)));
            results.forEach((r) => {
                if (r.status === 'fulfilled' && r.value) {
                    items.push(r.value);
                }
            });
            completed += batch.length;
            showLoadingProgress(completed, limitedSymbols.length);

            if (completed < limitedSymbols.length) {
                if (completed % COOLDOWN_EVERY === 0) {
                    await new Promise(r => setTimeout(r, COOLDOWN_MS));
                } else {
                    await new Promise(r => setTimeout(r, STEP_DELAY));
                }
            }
        }
        return items;
    }


    async function fetchTradingViewStocks(region, exchangeFilter) {
        const maxTotal = getMaxAllowed();
        if (maxTotal <= 0) return [];

        const allowedExchanges = Array.isArray(exchangeFilter)
            ? exchangeFilter.filter(Boolean)
            : (exchangeFilter ? [exchangeFilter] : []);

        const rawFetchTarget = exchangeFilter
            ? Math.min(HARD_MAX_RESULTS, Math.max(maxTotal, maxTotal * 4))
            : maxTotal;
        const rows = await fetchAllTradingViewRows(region, rawFetchTarget);

        const symbols = [];
        const seen = new Set();
        for (const d of rows) {
            const pair = (d?.s || '').split(':');
            const exch = pair[0];
            const ticker = pair[1];
            if (!ticker) continue;
            if (allowedExchanges.length && !allowedExchanges.includes(exch)) continue;

            const config = MARKET_CONFIG[region];
            let resolved = ticker;

            if (config) {
                if (config.resolve) resolved = config.resolve(ticker, exch);
                else if (config.transform) resolved = config.transform(ticker) + (config.suffix || '');
                else resolved = ticker + (config.suffix || '');
            }

            if (!seen.has(resolved)) {
                seen.add(resolved);
                symbols.push(resolved);
            }

            if (symbols.length >= maxTotal) break;
        }

        return symbols;
    }

    function deriveFilters() {
        return {
            search: document.getElementById('explorer-search')?.value.trim().toLowerCase() || '',
            sort: document.getElementById('explorer-sort')?.value || 'trending',
            market: document.getElementById('explorer-market')?.value || '',
            sector: document.getElementById('explorer-sector')?.value || '',
            eligibility: document.getElementById('explorer-eligibility')?.value || '',
            period: document.getElementById('explorer-period')?.value || '1D'
        };
    }

    function renderMarketChooser() {
        const list = document.getElementById('explorer-list');
        const pagination = document.getElementById('explorer-pagination');
        if (pagination) pagination.style.display = 'none';
        if (!list) return;

        list.innerHTML = '';
        const emptyState = document.createElement('div');
        emptyState.className = 'explorer-market-grid';

        marketsData.forEach(m => {
            const btn = document.createElement('button');
            btn.className = 'market-grid-btn';
            btn.title = m.name;
            btn.onclick = () => selectMarket(m.id);

            const img = document.createElement('img');
            img.src = m.logo;
            img.alt = m.name;
            img.onerror = function() {
                this.style.display = 'none';
                const fallback = document.createElement('div');
                fallback.className = 'market-fallback-name';
                fallback.textContent = m.name;
                this.parentElement.appendChild(fallback);
            };

            btn.appendChild(img);
            emptyState.appendChild(btn);
        });

        list.appendChild(emptyState);
    }

    function dedupeItems(items) {
        const seen = new Set();
        return items.filter(i => {
            if (!i.symbol || seen.has(i.symbol)) return false;
            seen.add(i.symbol);
            return true;
        });
    }

    function applyFilters(items, filters) {
        let result = items;
        if (filters.search) {
            const needle = filters.search;
            result = result.filter(i => (i.symbol || '').toLowerCase().includes(needle) || (i.name || '').toLowerCase().includes(needle));
        }
        if (filters.sector) result = result.filter(i => i.sector === filters.sector);
        return result;
    }

    function computeTrendingScores(items) {
        return items.map(item => {
            const vol = item.volume || 0;
            const change = Math.abs(item.changePercent || 0);

            let riskPenalty = 1;
            if ((item.riskScore || 1) >= 9) riskPenalty = 0.01;
            else if ((item.riskScore || 1) >= 7) riskPenalty = 0.2;

            const volumeScore = Math.log10(vol + 1);
            const volatilityScore = Math.sqrt(change) + 1;

            return { ...item, trendingScore: (volumeScore * volatilityScore * 10) * riskPenalty };
        });
    }

    function sortItems(items, sort) {
        const sorted = [...items];
        if (sort === 'trending') {
            sorted.sort((a, b) => {
                if (a.isSuspended && !b.isSuspended) return 1;
                if (!a.isSuspended && b.isSuspended) return -1;
                return (b.trendingScore || 0) - (a.trendingScore || 0);
            });
            return sorted;
        }

        switch (sort) {
            case 'gainers': sorted.sort((a, b) => b.changePercent - a.changePercent); break;
            case 'losers': sorted.sort((a, b) => a.changePercent - b.changePercent); break;
            case 'volume': sorted.sort((a, b) => b.volume - a.volume); break;
            case 'signal': sorted.sort((a, b) => b.score - a.score); break;
            case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
            default: break;
        }
        return sorted;
    }

    async function enrichWithPeriodChanges(items, period) {
        if (!items.length) return items;
        let changes = {};
        let cooldownTimer = null;
        const enrichItems = items.slice(0, PERIOD_ENRICH_MAX);

        const startYahooCooldownLoader = () => {
            if (cooldownTimer) return;
            cooldownTimer = setInterval(() => {
                const activeApi = window.__rateLimitedApi;
                const endTime = Number(window.__rateLimitEndTime || 0);
                if (activeApi !== 'yahoo' || endTime <= Date.now()) return;
                const remaining = Math.max(1, Math.ceil((endTime - Date.now()) / 1000));
                showLoadingProgress(0, `API Yahoo limitée, reprise dans ${remaining}s...`);
            }, 1000);
        };

        const stopYahooCooldownLoader = () => {
            if (!cooldownTimer) return;
            clearInterval(cooldownTimer);
            cooldownTimer = null;
        };

        try {
            showLoadingProgress(0, `Analyse ${PERIOD_LABELS[period]}...`);
            startYahooCooldownLoader();
            const config = PERIOD_CONFIG[period] || PERIOD_CONFIG['1D'];
            changes = await fetchYahooPeriodChanges(
                enrichItems.map(i => i.symbol),
                config.range,
                config.interval,
                (done, total, isPaused, msg) => {
                    if (msg) showLoadingProgress(done, `${msg} ${done}/${total}`);
                    else if (isPaused) showLoadingProgress(done, `Pause API (Protection)... ${done}/${total}`);
                    else showLoadingProgress(done, `Analyse ${done}/${total}`);
                }
            );
        } catch (e) {
            changes = {};
        } finally {
            stopYahooCooldownLoader();
        }

        return items.map(item => {
            const pd = changes[item.symbol];
            let score = item.score;
            let signal = item.signal;
            let riskScore = 1;

            if (pd) {
                const vol = Number.isFinite(item.volume) ? item.volume : 0;
                const fallbackScore = Math.max(0, Math.min(100, 50 + pd.changePercent * 3 + Math.min(vol / 50000000, 15)));

                item.change = pd.change;
                item.changePercent = pd.changePercent;

                if (window.SignalBot && pd.history) {
                    try {
                        const botResult = window.SignalBot.calculateBotSignal({
                            symbol: item.symbol,
                            prices: pd.history.prices,
                            highs: pd.history.highs,
                            lows: pd.history.lows,
                            volumes: pd.history.volumes
                        }, { period: state.currentPeriod });

                        score = botResult.signalValue;
                        riskScore = botResult.risk ? botResult.risk.score : 1;
                        
                        if (score >= 60) signal = 'buy';
                        else if (score <= 40) signal = 'sell';
                        else signal = 'hold';
                        
                        if (riskScore >= 9) signal = 'sell';
                    } catch (e) {
                        score = fallbackScore;
                        signal = score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold';
                    }
                } else {
                    score = fallbackScore;
                    signal = score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold';
                }
            }
            
            return { ...item, score: Math.round(score), signal, riskScore };
        });
    }

    async function resolveMarketItems(filters, marketDef) {
        if (!marketDef) return [];

        if (marketDef.tvRegion) {
            showLoadingProgress(0, `Fetching from TradingView (${marketDef.tvRegion})...`);
            const tvSymbols = await fetchTradingViewStocks(marketDef.tvRegion, marketDef.tvExchange);
            const limitedTvSymbols = tvSymbols.slice(0, getMaxAllowed());
            if (limitedTvSymbols.length > 0) return fetchStocksBatch(limitedTvSymbols, 'cto', marketDef.id);

            if (marketDef.lists) {
                const allLists = Object.values(marketDef.lists);
                const allSymbols = [].concat(...allLists);
                const limitedSymbols = [...new Set(allSymbols)].slice(0, getMaxAllowed());
                return fetchStocksBatch(limitedSymbols, 'cto', marketDef.id);
            }
            return [];
        }

        if (marketDef.type === 'list' && marketDef.lists) {
            let symbolsToFetch = [];
            let currentEligibility = 'pea';

            if (filters.eligibility && marketDef.lists[filters.eligibility]) {
                symbolsToFetch = marketDef.lists[filters.eligibility];
                currentEligibility = filters.eligibility;
            } else {
                const allLists = Object.values(marketDef.lists);
                const allSymbols = [].concat(...allLists);
                symbolsToFetch = [...new Set(allSymbols)];
            }

            symbolsToFetch = symbolsToFetch.slice(0, getMaxAllowed());
            const fetched = await fetchStocksBatch(symbolsToFetch, currentEligibility, marketDef.id);

            if (!filters.eligibility && marketDef.lists) {
                fetched.forEach(item => {
                    for (const [listName, symbols] of Object.entries(marketDef.lists)) {
                        if (symbols.includes(item.symbol)) {
                            item.eligibility = listName;
                            break;
                        }
                    }
                });
            }

            return fetched;
        }

        const screeners = marketDef.screeners || YAHOO_SCREENERS;
        return (await fetchMultipleScreeners(screeners)).map(mapQuoteToItem).filter(i => i && i.market === filters.market);
    }

    async function loadData() {
        if (state.isLoading) return;

        const filters = deriveFilters();
        state.currentPeriod = filters.period;

        if (!filters.market) {
            state.results = [];
            state.total = 0;
            state.currentPage = 1;
            renderMarketChooser();
            return;
        }

        const paramsKey = JSON.stringify({
            market: filters.market,
            sector: filters.sector,
            eligibility: filters.eligibility,
            period: filters.period,
            search: filters.search
        });
        let items = [];

        if (state.cachedItems && state.lastParams === paramsKey) {
            items = [...state.cachedItems];
        } else {
            state.isLoading = true;
            showLoading(true);

            try {
                const marketDef = marketsData.find(m => m.id === filters.market);
                items = await resolveMarketItems(filters, marketDef);
                items = dedupeItems(items);
                items = applyFilters(items, filters);
                items = items.slice(0, getMaxAllowed());
                items = await enrichWithPeriodChanges(items, filters.period);
                items = computeTrendingScores(items);

                state.cachedItems = items;
                state.lastParams = paramsKey;
            } catch (e) {
                console.error('Explorer load failed', e);
                showError('Erreur de chargement');
                return;
            } finally {
                state.isLoading = false;
                showLoading(false);
            }
        }

        items = applyFilters(items, filters);
        state.results = sortItems(items, filters.sort);
        state.total = state.results.length;
        state.currentPage = 1;
        render();
    }

    function showLoading(show) {
        const list = document.getElementById('explorer-list');
        if (list && show) list.innerHTML = '<div class="explorer-loading"><i class="fa-solid fa-spinner fa-spin"></i><span id="explorer-loading-text">Chargement...</span></div>';
    }

    function showLoadingProgress(loaded, totalOrText) {
        const text = document.getElementById('explorer-loading-text');
        if (text) text.textContent = typeof totalOrText === 'string' ? totalOrText : `Chargement... ${loaded}/${totalOrText}`;
    }

    function showError(msg) {
        const list = document.getElementById('explorer-list');
        if (list) list.innerHTML = `<div class="explorer-empty"><i class="fa-solid fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;opacity:0.5"></i><br>${msg}</div>`;
    }

    function bindEvents() {
        document.getElementById('open-explorer')?.addEventListener('click', openExplorer);
        document.getElementById('explorer-search')?.addEventListener('input', debounce(() => { state.currentPage = 1; loadData(); }, 500));
        document.getElementById('explorer-market')?.addEventListener('change', (e) => { state.currentPage = 1; selectMarket(e.target.value); });
        document.getElementById('explorer-sort')?.addEventListener('change', () => { state.currentPage = 1; loadData(); });
        document.getElementById('explorer-sector')?.addEventListener('change', () => { state.currentPage = 1; loadData(); });
        document.getElementById('explorer-eligibility')?.addEventListener('change', () => { state.currentPage = 1; loadData(); });
        document.getElementById('explorer-period')?.addEventListener('change', () => { state.currentPage = 1; loadData(); });
        document.getElementById('explorer-prev')?.addEventListener('click', () => changePage(-1));
        document.getElementById('explorer-next')?.addEventListener('click', () => changePage(1));
        document.getElementById('explorer-list')?.addEventListener('click', e => {
            const item = e.target.closest('.explorer-item');
            if (item?.dataset.symbol) openStock(item.dataset.symbol);
        });
        setupMaxTickerControl();
    }

    function setupMaxTickerControl() {
        const slider = document.getElementById('explorer-max-tickers');
        const ticksEl = document.getElementById('explorer-limit-ticks');
        const allToggle = document.getElementById('explorer-max-all');
        if (!slider || !ticksEl || !allToggle) return;

        const renderTicks = () => {
            ticksEl.innerHTML = '';
            for (let v = MAX_TICKERS_MIN; v <= MAX_TICKERS_MAX; v += 50) {
                const tick = document.createElement('span');
                tick.className = `explorer-limit-tick ${v <= YAHOO_SAFE_LIMIT ? 'safe' : 'danger'}`;
                tick.dataset.value = String(v);
                tick.textContent = String(v);
                ticksEl.appendChild(tick);
            }
        };

        const applyValue = (raw) => {
            const numeric = Number(raw) || DEFAULT_MAX_TICKERS;
            const clamped = Math.min(MAX_TICKERS_MAX, Math.max(MAX_TICKERS_MIN, numeric));
            state.maxFetchTickers = clamped;
            slider.value = clamped;
            state.cachedItems = null;
            state.lastParams = null;

            ticksEl.querySelectorAll('.explorer-limit-tick').forEach(t => {
                const v = Number(t.dataset.value || 0);
                t.classList.toggle('active', v === clamped);
            });

            const range = MAX_TICKERS_MAX - MAX_TICKERS_MIN;
            const safePos = Math.max(0, Math.min(100, ((YAHOO_SAFE_LIMIT - MAX_TICKERS_MIN) / range) * 100));
            slider.style.background = `linear-gradient(90deg, var(--color-positive) 0%, var(--color-positive) ${safePos}%, var(--color-negative) ${safePos}%, var(--color-negative) 100%)`;
        };

        const applyAllMode = (enabled) => {
            slider.disabled = enabled;
            ticksEl.classList.toggle('disabled', enabled);
            if (enabled) {
                state.maxFetchTickers = HARD_MAX_RESULTS;
                state.cachedItems = null;
                state.lastParams = null;
                ticksEl.querySelectorAll('.explorer-limit-tick').forEach(t => t.classList.remove('active'));
            } else {
                applyValue(slider.value);
            }
        };

        slider.min = MAX_TICKERS_MIN;
        slider.max = MAX_TICKERS_MAX;
        slider.step = 50;
        slider.value = state.maxFetchTickers;
        renderTicks();
        applyValue(slider.value);
        applyAllMode(allToggle.checked);

        slider.addEventListener('input', (e) => {
            applyValue(e.target.value);
        });

        allToggle.addEventListener('change', (e) => {
            applyAllMode(e.target.checked);
        });
    }

    async function openStock(yahooSymbol) {
        const itemData = state.results.find(i => i.symbol === yahooSymbol);
        if (!itemData) return;

        const jsonSymbol = getJsonSymbol(yahooSymbol);
        let card = document.getElementById(`card-${yahooSymbol}`) || (jsonSymbol && document.getElementById(`card-${jsonSymbol}`));
        const isExisting = !!card;

        if (!card) {
            card = await createDynamicCard(itemData);
            if (!card) return;
        }

        document.querySelectorAll('.card').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-hidden', 'true'); });
        card.classList.add('active');
        card.setAttribute('aria-hidden', 'false');
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

        const tab = document.querySelector(`.tab[data-symbol="${jsonSymbol || yahooSymbol}"]`) || document.querySelector(`.tab[data-symbol="${yahooSymbol}"]`);
        if (tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (isExisting) window.fetchActiveSymbol?.(true);
        else window.activateStock?.(yahooSymbol);
    }

    async function createDynamicCard(itemData) {
        const jsonSymbol = getJsonSymbol(itemData.symbol);
        if (jsonSymbol) return document.getElementById(`card-${jsonSymbol}`);

        const template = document.getElementById('card-template');
        if (!template) return null;

        const symbol = itemData.symbol;
        const card = template.content.firstElementChild.cloneNode(true);
        card.id = `card-${symbol}`;

        let country = 'US';
        const m = itemData.market;
        
        // Try to find country from config based on market ID
        if (MARKET_CONFIG[m]?.country) country = MARKET_CONFIG[m].country;
        // Or try to find by suffix
        else {
             const suffix = symbol.includes('.') ? '.' + symbol.split('.').pop() : '';
             const region = Object.values(MARKET_CONFIG).find(c => c.suffix === suffix);
             if (region) country = region.country;
             else if (itemData.currency === 'GBP') country = 'GB';
        }

        const iconSymbol = getIconSymbol(symbol);
        const logo = card.querySelector('.logo img');
        if (logo) {
            logo.id = `logo-${symbol}`;
            logo.dataset.symbol = symbol;
            logo.onerror = function() {
                this.onerror = null;
                this.parentElement.innerHTML = `<div class="logo-fallback"><div class="logo-name" title="${itemData.name || symbol}">${itemData.name || symbol}</div></div>`;
            };
            logo.src = iconSymbol ? `icon/${iconSymbol}.png` : `logo/${symbol}.png`;
        }

        const generalTitle = card.querySelector('h3.section-title');
        if (generalTitle) {
            generalTitle.id = `general-title-${symbol}`;
            const genDate = generalTitle.nextElementSibling;
            if (genDate?.classList.contains('section-date')) genDate.id = `general-date-${symbol}`;
        }

        const sharesEl = card.querySelector('.important-shares span');
        if (sharesEl) { sharesEl.id = `shares-${symbol}`; sharesEl.textContent = '0'; }

        const investmentSection = card.querySelector('.investment-section');
        if (investmentSection) investmentSection.style.display = 'none';

        card.querySelectorAll('.general-row').forEach(row => {
            const strong = row.querySelector('strong');
            const span = row.querySelector('span');
            if (!strong || !span) return;
            const label = strong.textContent.trim().toLowerCase();
            if (label.includes('isin')) { span.id = `isin-${symbol}`; span.textContent = ''; row.style.display = 'none'; }
            else if (label.includes('ticker') || label.includes('symbole')) { span.id = `ticker-${symbol}`; span.textContent = symbol; }
        });

        const countryName = card.querySelector('.country-name');
        const flagIcon = card.querySelector('.flag-icon');
        if (countryName) countryName.textContent = country;
        if (flagIcon) { flagIcon.id = `flag-${symbol}`; flagIcon.dataset.country = country; flagIcon.src = `flag/${country.toLowerCase()}.png`; }

        const periodsGroup = card.querySelector('.periods-group');
        if (periodsGroup) {
            periodsGroup.id = `periods-${symbol}`;
            periodsGroup.querySelectorAll('.period-btn').forEach(btn => {
                btn.dataset.symbol = symbol;
                if (btn.dataset.period === '1D') btn.classList.add('active');
            });
        }

        const chartCanvas = card.querySelector('.chart-canvas');
        if (chartCanvas) chartCanvas.id = `chart-${symbol}`;

        const perfValue = card.querySelector('.performance-value');
        if (perfValue) {
            perfValue.id = `perf-${symbol}`;
            const cp = itemData.changePercent || 0;
            perfValue.textContent = `${cp >= 0 ? '+' : ''}${cp.toFixed(2)}%`;
            perfValue.className = `performance-value ${cp >= 0 ? 'positive' : 'negative'}`;
        }

        const updateCenter = card.querySelector('.update-center');
        if (updateCenter) { updateCenter.id = `update-center-${symbol}`; updateCenter.textContent = 'Dernière mise à jour : --'; }

        const courseTitle = card.querySelector('.course-title');
        if (courseTitle) {
            courseTitle.id = `course-title-${symbol}`;
            const courseDate = courseTitle.nextElementSibling;
            if (courseDate?.classList.contains('section-date')) courseDate.id = `course-date-${symbol}`;
        }

        const invTitle = card.querySelector('.investment-title');
        if (invTitle) {
            invTitle.id = `investment-title-${symbol}`;
            const invDate = invTitle.nextElementSibling;
            if (invDate?.classList.contains('section-date')) invDate.id = `investment-date-${symbol}`;
        }

        const detailsTitle = card.querySelector('.details-title');
        if (detailsTitle) {
            detailsTitle.id = `details-title-${symbol}`;
            const detDate = detailsTitle.nextElementSibling;
            if (detDate?.classList.contains('section-date')) detDate.id = `details-date-${symbol}`;
        }

        const transactionTitle = card.querySelector('.transaction-history-title');
        if (transactionTitle) {
            transactionTitle.id = `transaction-history-title-${symbol}`;
        }

        const tds = card.querySelectorAll('.card-table-td');
        if (tds.length >= 8) {
            tds[1].id = `invest-${symbol}`; tds[2].id = `value-${symbol}`; tds[3].id = `profit-${symbol}`;
            tds[5].id = `invest-per-${symbol}`; tds[6].id = `value-per-${symbol}`; tds[7].id = `profit-per-${symbol}`;
        }

        const signalTitle = card.querySelector('.signal-title');
        if (signalTitle) {
            signalTitle.id = `signal-title-${symbol}`;
            const signalDate = signalTitle.nextElementSibling;
            if (signalDate?.classList.contains('section-date')) signalDate.id = `signal-date-${symbol}`;
        }

        const signalCursor = card.querySelector('.signal-cursor');
        const signalValue = card.querySelector('.signal-state-title');
        const signalDescription = card.querySelector('.signal-state-description');
        if (signalCursor) signalCursor.id = `signal-cursor-${symbol}`;
        if (signalValue) signalValue.id = `signal-value-${symbol}`;
        if (signalDescription) signalDescription.id = `signal-description-${symbol}`;

        const infoValues = card.querySelectorAll('.info-value');
        if (infoValues.length === 4) {
            infoValues[0].id = `open-${symbol}`; infoValues[1].id = `high-${symbol}`;
            infoValues[2].id = `low-${symbol}`; infoValues[3].id = `close-${symbol}`;
        }

        const investmentTabBtn = card.querySelector('.card-tab-btn[data-target="investment"]');
        if (investmentTabBtn) investmentTabBtn.style.display = 'none';

        document.getElementById('cards-container')?.appendChild(card);

        window.registerDynamicPosition?.({
            symbol, ticker: symbol, name: itemData.name,
            type: itemData.market === 'crypto' ? 'crypto' : 'equity',
            currency: itemData.currency || 'USD',
            api_mapping: { yahoo: symbol },
            shares: 0, investment: 0, costBasis: 0,
            purchases: [], sales: [], news: [],
            lastNewsFetch: 0, chart: null, lastFetch: 0, lastData: null, currentPeriod: '1D'
        });

        const newsList = card.querySelector('.news-list');
        if (newsList) newsList.id = `news-list-${symbol}`;

        createDynamicTab(itemData);
        window.setupNewsSearch?.(symbol);

        return card;
    }

    function createDynamicTab(itemData) {
        const yahooSymbol = itemData.symbol;
        const type = itemData.market === 'crypto' ? 'crypto' : 'equity';

        if (getJsonSymbol(yahooSymbol)) return;
        if (document.querySelector(`.tab[data-symbol="${yahooSymbol}"]`)) return;

        let section = document.getElementById(`general-section-${type}`);
        if (!section) {
            const generalTabs = document.getElementById('general-tabs');
            if (!generalTabs) return;
            section = document.createElement('div');
            section.className = 'tab-type-section';
            section.id = `general-section-${type}`;
            const title = document.createElement('div');
            title.className = 'tab-type-title';
            title.innerHTML = `<i class="${typeIcon(type)} type-icon"></i> ${typeLabel(type)}`;
            section.appendChild(title);
            generalTabs.appendChild(section);
        }

        const tab = document.createElement('div');
        tab.className = itemData.isSuspended ? 'tab suspended' : 'tab';
        tab.dataset.symbol = yahooSymbol;
        tab.dataset.ticker = yahooSymbol;

        const tabLogo = document.createElement('div');
        tabLogo.className = 'tab-logo';
        const iconSymbol = getIconSymbol(yahooSymbol);
        const candidates = buildOnlineIconCandidates(yahooSymbol, itemData.market);

        const img = document.createElement('img');
        img.alt = yahooSymbol;
        img.onerror = function() {
            if (candidates.length > 0) {
                this.src = candidates.shift();
                return;
            }
            this.onerror = null;
            const ticker = yahooSymbol.split('.')[0].toUpperCase();
            const fallback = document.createElement('div');
            fallback.className = 'tab-logo-fallback';
            fallback.textContent = ticker.length > 4 ? ticker.slice(0, 4) : ticker;
            fallback.title = yahooSymbol;
            fallback.style.fontSize = ticker.length > 4 ? Math.max(6, 12 - (ticker.length - 4) * 2) + 'px' : '12px';
            const parent = this.parentElement || tabLogo;
            if (!parent) return;
            parent.innerHTML = '';
            parent.appendChild(fallback);
        };

        tabLogo.appendChild(img);
        if (iconSymbol) {
            img.src = `icon/${iconSymbol}.png`;
        } else if (candidates.length > 0) {
            img.src = candidates.shift();
        } else {
            img.onerror();
        }

        const tabInfo = document.createElement('div');
        tabInfo.className = 'tab-info';
        tabInfo.innerHTML = `<div class="tab-name">${itemData.name || yahooSymbol}</div><div class="tab-shares"></div>`;

        tab.appendChild(tabLogo);
        tab.appendChild(tabInfo);
        tab.addEventListener('click', () => openStock(yahooSymbol));
        section.appendChild(tab);
    }

    function openExplorer() {
        document.querySelectorAll('.card').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-hidden', 'true'); });
        const explorerCard = document.getElementById('card-explorer');
        if (explorerCard) { explorerCard.classList.add('active'); explorerCard.setAttribute('aria-hidden', 'false'); }
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('open-explorer')?.classList.add('active');
        loadData();
    }

    function changePage(delta) {
        const totalPages = Math.ceil(state.total / ITEMS_PER_PAGE) || 1;
        const newPage = state.currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) { state.currentPage = newPage; render(); }
    }

    function render() {
        const list = document.getElementById('explorer-list');
        const pagination = document.getElementById('explorer-pagination');
        if (!list) return;

        const totalPages = Math.ceil(state.total / ITEMS_PER_PAGE) || 1;
        const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const pageData = state.results.slice(start, start + ITEMS_PER_PAGE);

        if (!pageData.length) {
            list.innerHTML = '<div class="explorer-empty"><i class="fa-solid fa-chart-line" style="font-size:2rem;margin-bottom:10px;opacity:0.3"></i><br>Aucun résultat trouvé</div>';
            if (pagination) pagination.style.display = 'none';
        } else {
            list.innerHTML = pageData.map(renderItem).join('');
            loadItemIcons();
            if (pagination) pagination.style.display = 'flex';
        }

        document.getElementById('explorer-page-info').textContent = `Page ${state.currentPage} / ${totalPages}`;
        document.getElementById('explorer-prev').disabled = state.currentPage <= 1;
        document.getElementById('explorer-next').disabled = state.currentPage >= totalPages;
    }

    function loadItemIcons() {
        document.querySelectorAll('.explorer-item-logo').forEach(el => {
            const ticker = el.parentElement.dataset.symbol;
            if (!ticker) return;
            const iconSymbol = getIconSymbol(ticker);
            const item = state.results.find(i => i.symbol === ticker);
            const candidates = buildOnlineIconCandidates(ticker, item?.market);

            const img = new Image();
            const setFallbackText = () => { el.innerHTML = ticker.slice(0, 2).toUpperCase(); };

            img.onload = () => { el.innerHTML = `<img src="${img.src}" alt="${ticker}" />`; };
            img.onerror = () => {
                if (candidates.length > 0) {
                    img.src = candidates.shift();
                } else {
                    setFallbackText();
                }
            };

            if (iconSymbol) {
                img.src = `icon/${iconSymbol}.png`;
            } else if (candidates.length > 0) {
                img.src = candidates.shift();
            } else {
                setFallbackText();
            }
        });
    }

    function renderItem(item) {
        const changePercent = Number.isFinite(item.changePercent) ? item.changePercent : 0;
        const priceValue = Number.isFinite(item.price) ? item.price : 0;
        const changeClass = changePercent >= 0 ? 'positive' : 'negative';
        const changeSign = changePercent >= 0 ? '+' : '';
        const isSuspended = !!item.isSuspended;
        const signalClass = isSuspended ? 'suspended' : item.isClosed ? 'closed' : item.signal;
        const signalText = isSuspended ? 'Suspendu' : item.isClosed ? 'Fermé' : item.signal === 'buy' ? 'Achat' : item.signal === 'sell' ? 'Vente' : 'Neutre';
        const formatPrice = p => p >= 1000 ? p.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
        const curr = item.currency === 'EUR' ? '€' : item.currency === 'GBP' ? '£' : '$';
        
        // Indicateur de risque visuel
        let riskIcon = '';
        if (item.riskScore >= 9) riskIcon = '<i class="fa-solid fa-skull-crossbones" style="color:#ef4444;margin-left:5px;" title="Risque Extrême (Shitcoin)"></i>';
        else if (item.riskScore >= 7) riskIcon = '<i class="fa-solid fa-triangle-exclamation" style="color:#f97316;margin-left:5px;" title="Risque Élevé"></i>';

        const formatVolume = v => {
            if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
            if (v >= 1e3) return (v / 1e3).toFixed(2) + 'k';
            return v;
        };
        
        const trendInfo = `<div style="font-size:0.75rem;opacity:0.6;margin-top:2px;">Score: ${Math.round(item.trendingScore || 0)} • Vol: ${formatVolume(item.volume)}</div>`;

        return `<div class="explorer-item ${isSuspended ? 'suspended' : ''}" data-symbol="${item.symbol}">
            <div class="explorer-item-logo">${item.symbol.slice(0, 2).toUpperCase()}</div>
            <div class="explorer-item-info">
                <div class="explorer-item-name">${item.name}</div>
                <div class="explorer-item-ticker">${item.symbol}${riskIcon}</div>
                ${trendInfo}
            </div>
            <div class="explorer-item-price"><div class="explorer-item-current">${formatPrice(priceValue)} ${curr}</div><div class="explorer-item-change ${changeClass}">${changeSign}${changePercent.toFixed(2)}% <span class="explorer-period-label">${PERIOD_LABELS[state.currentPeriod]}</span></div></div>
            <div class="explorer-item-signal"><span class="explorer-signal-badge ${signalClass}">${signalText}</span><span class="explorer-signal-score">${item.score}/100</span></div>
        </div>`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.explorerModule = { openExplorer, loadData };
}
