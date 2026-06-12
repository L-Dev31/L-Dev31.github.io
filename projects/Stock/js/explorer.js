import { fetchYahooScreener, fetchYahooChartSnapshot, fetchYahooPeriodChanges, fetchYahooIndexComponents, isYahooTickerActiveFromQuote, isYahooTickerActiveFromChart, computeDaysSinceLastTrade, fetchYahooQuotesBatch } from './yahoo-finance.js';
import { handleImageAssetError } from './assets.js';
import { debounce } from './constants.js';
import { getCurrency } from './state.js';
import { buildOnlineIconCandidates } from './ticker-catalog.js';

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

    const PERIOD_LABELS = { '1H': '1H', '4H': '4H', '1D': '1D', '1W': '1W', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1Y', 'YTD': 'YTD' };
    const PERIOD_CONFIG = {
        '1H': { range: '1h', interval: '1m' },
        '4H': { range: '4h', interval: '1m' },
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
        euronext: { country: 'FR' }, lse: { country: 'GB' }, xetra: { country: 'DE' },
        asx: { country: 'AU' }, tsx: { country: 'CA' }, six: { country: 'CH' },
        tse: { country: 'JP' }, hkex: { country: 'HK' }, sse: { country: 'CN' },
        szse: { country: 'CN' }, nse: { country: 'IN' }, bse: { country: 'IN' }, krx: { country: 'KR' }
    };

    const getMaxAllowed = () => Math.min(state.maxFetchTickers, HARD_MAX_RESULTS);

    let stockIconMap = {};
    let yahooToJsonSymbol = {};
    let cryptoSymbols = new Set();
    let localSymbolsByMarket = new Map();

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
        select.innerHTML = '<option value="">Select...</option>';
        marketsData.filter(m => !m.disabled).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        });

        const eligibilitySelect = document.getElementById('explorer-eligibility');
        if (eligibilitySelect?.parentElement) eligibilitySelect.parentElement.style.display = 'none';
    }

    function selectMarket(marketId) {
        const select = document.getElementById('explorer-market');
        if (select) {
            const marketDef = marketsData.find(m => m.id === marketId);
            if (marketDef?.disabled) {
                select.value = '';
                return;
            }
            select.value = marketId;
            
            const eligibilitySelect = document.getElementById('explorer-eligibility');
            if (eligibilitySelect && eligibilitySelect.parentElement) {
                const hasLists = marketDef && marketDef.type === 'list' && marketDef.lists && Object.keys(marketDef.lists).length > 0;
                
                if (hasLists) {
                    eligibilitySelect.innerHTML = '<option value="">All</option>';
                    Object.keys(marketDef.lists).forEach(listKey => {
                        const opt = document.createElement('option');
                        opt.value = listKey;
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
        const files = ['json/equity.json', 'json/crypto.json', 'json/commodity.json'];
        const results = await Promise.allSettled(files.map(f => fetch(f).then(r => r.json())));
        localSymbolsByMarket = new Map();
        
        results.forEach((res, i) => {
            if (res.status !== 'fulfilled') return;
            const isCrypto = files[i].includes('crypto');
            res.value.forEach(s => {
                const sym = s.symbol;
                if (s.ticker) { stockIconMap[s.ticker] = sym; yahooToJsonSymbol[s.ticker] = sym; }
                if (sym) { stockIconMap[sym] = sym; yahooToJsonSymbol[sym] = sym; }
                if (isCrypto && sym) cryptoSymbols.add(sym);

                const marketId = inferMarketFromLocalSymbol(s);
                const yahooSymbol = (s.ticker || s.symbol || '').toUpperCase();
                if (marketId && yahooSymbol) {
                    if (!localSymbolsByMarket.has(marketId)) localSymbolsByMarket.set(marketId, new Set());
                    localSymbolsByMarket.get(marketId).add(yahooSymbol);
                }
            });
        });
    }

    function inferMarketFromLocalSymbol(stock) {
        const yahoo = (stock?.ticker || stock?.symbol || '').toUpperCase();
        const country = (stock?.country || '').toUpperCase();

        if (yahoo.endsWith('.PA') || yahoo.endsWith('.EPA')) return 'euronext';
        if (yahoo.endsWith('.L')) return 'lse';
        if (yahoo.endsWith('.DE')) return 'xetra';
        if (yahoo.endsWith('.SW')) return 'six';
        if (yahoo.endsWith('.AX')) return 'asx';
        if (yahoo.endsWith('.TO')) return 'tsx';
        if (yahoo.endsWith('.HK')) return 'hkex';
        if (yahoo.endsWith('.NS')) return 'nse';
        if (yahoo.endsWith('.BO')) return 'bse';
        if (yahoo.endsWith('.SZ')) return 'szse';
        if (yahoo.endsWith('.SS')) return 'sse';
        if (yahoo.endsWith('.T')) return 'tse';
        if (yahoo.endsWith('.KS') || yahoo.endsWith('.KQ')) return 'krx';
        if (yahoo.endsWith('-USD') || stock?.type === 'crypto') return 'crypto';

        if (country === 'FR') return 'euronext';
        if (country === 'GB') return 'lse';
        if (country === 'DE') return 'xetra';
        if (country === 'CH') return 'six';
        if (country === 'AU') return 'asx';
        if (country === 'CA') return 'tsx';
        if (country === 'JP') return 'tse';
        if (country === 'HK') return 'hkex';
        if (country === 'IN') return 'nse';
        if (country === 'CN') return 'sse';
        if (country === 'KR') return 'krx';

        return null;
    }

    function getLocalSymbolsForMarket(marketId) {
        const set = localSymbolsByMarket.get(marketId);
        if (!set) return [];
        return [...set].slice(0, getMaxAllowed());
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
            if (sym.includes('.') && cryptoSymbols.has(mapped)) return null;
            return mapped;
        }
        return null;
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
        const foundMarket = marketsData.find(m => m.exchanges?.includes(exchange));
        if (foundMarket) {
            market = foundMarket.id;
        } else {
            if (['NMS', 'NGS', 'NCM', 'NASDAQ'].includes(exchange)) market = 'nasdaq';
            else if (['NYQ', 'NYSE', 'NYS', 'PCX', 'ASE'].includes(exchange)) market = 'nyse';
            else if (exchange === 'PAR' || exchange === 'EPA' || symbol.endsWith('.PA')) market = 'euronext';
            else if (exchange === 'CCC' || q.quoteType === 'CRYPTOCURRENCY') market = 'crypto';
            else if (fullExchange.includes('nasdaq')) market = 'nasdaq';
            else if (fullExchange.includes('nyse') || fullExchange.includes('new york')) market = 'nyse';
            else if (fullExchange.includes('paris') || fullExchange.includes('euronext')) market = 'euronext';
        }

        // PEA / PEA-PME eligibility CANNOT be fully determined from a price quote.
        // Legal criteria (Code monétaire et financier, art. L221-32-2): issuer domiciled in
        // the EU/EEA and subject to corporate tax, fewer than 5 000 employees, AND
        // (revenue < 1.5 Bn€ OR balance sheet < 2 Bn€); a *listed* issuer additionally needs
        // market cap < 1 Bn€. We only have market cap + currency here, so we infer a LIKELY
        // status and mark it unverified rather than asserting it. Market cap is only comparable
        // to the 1 Bn€ threshold when it is denominated in euros.
        let eligibility = 'cto';
        let eligibilityVerified = false;
        const isEea = market === 'euronext' || q.currency === 'EUR';
        if (isEea) {
            const capEur = q.currency === 'EUR' ? q.marketCap : null;
            eligibility = (capEur && capEur < 1e9) ? 'pea-pme' : 'pea';
            // employees/revenue/balance-sheet + EEA HQ tests are not checkable from a quote.
            eligibilityVerified = false;
        }

        const isSuspended = !isYahooTickerActiveFromQuote(q);

        return {
            symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
            price, change, changePercent, volume, market, eligibility, eligibilityVerified,
            currency: q.currency || 'USD', marketCap: q.marketCap, industry: q.industry || '',
            isClosed: isSuspended, isSuspended,
            daysSinceLastTrade: Math.round(computeDaysSinceLastTrade(q.regularMarketTime)),
            score: 50, signal: 'hold', riskScore: 1
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

                return {
                    symbol: sym, name: meta.shortName || meta.longName || sym.replace(/\.[A-Z]+$/, ''),
                    price, change, changePercent, volume,
                    market: marketId, eligibility: defaultEligibility,
                    currency: meta.currency || 'USD', marketCap: 0, industry: '',
                    isClosed: isSuspended, isSuspended,
                    daysSinceLastTrade: Math.round(computeDaysSinceLastTrade(meta.regularMarketTime)),
                    score: 50, signal: 'hold', riskScore: 1
                };
            } catch (e) { return null; }
        };

        return fetchOne(symbol);
    }

    async function fetchStocksBatch(symbols, defaultEligibility = 'pea', marketId = 'euronext') {
        const uniqueSymbols = [...new Set((symbols || []).filter(Boolean))];
        const limitedSymbols = uniqueSymbols.slice(0, getMaxAllowed());
        showLoadingProgress(0, `Loading (${limitedSymbols.length})...`);
        if (!limitedSymbols.length) return [];

        try {
            const quotes = await fetchYahooQuotesBatch(limitedSymbols);
            if (!quotes) {
                showError('Failed to fetch batch data');
                return [];
            }

            const items = quotes
                .map(q => {
                    const item = mapQuoteToItem(q);
                    if (item) {
                        item.market = marketId;
                        item.eligibility = defaultEligibility;
                    }
                    return item;
                })
                .filter(Boolean);

            showLoadingProgress(items.length, limitedSymbols.length);
            return items;
        } catch (e) {
            console.error('[Explorer Batch] Error:', e);
            return [];
        }
    }



    function deriveFilters() {
        return {
            search: document.getElementById('explorer-search')?.value.trim().toLowerCase() || '',
            sort: document.getElementById('explorer-sort')?.value || 'trending',
            market: document.getElementById('explorer-market')?.value || '',
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

        marketsData.filter(m => !m.disabled).forEach(m => {
            const btn = document.createElement('button');
            btn.className = 'market-grid-btn';
            btn.title = m.name;
            btn.onclick = () => selectMarket(m.id);

            const img = document.createElement('img');
            img.src = m.logo;
            img.alt = m.name;
            img.onerror = () => handleImageAssetError(img, m.name, 'other', true);

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
        return result;
    }

    // ---- Trending rank (bullish-biased composite) ----
    // Previous version ranked by |signal-50|, so a Strong SELL surfaced as high as a Strong
    // Buy — "trending" listed assets the bot wanted to dump. The composite is now:
    //   conviction  — bullish distance from neutral only (sells get 0 and sink below holds)
    //   trendQuality— ADX × confluence: conviction in a trendless/contradictory tape is noise
    //   momentum    — tanh-squashed period return, so one +80% microcap print can't dominate
    //   liquidity   — CROSS-SECTIONAL volume percentile. Raw volume is only meaningful
    //                 relative to the current universe (microstructure: thin books produce
    //                 outsized % moves that are not tradeable at displayed prices)
    //   risk        — graduated penalty instead of a cliff at 7/9.
    function computeTrendingRank(item, volPctile) {
        const signal = item.score !== undefined ? item.score : 50; // SignalBot signalValue 0-100
        const adx = item.botAdx || 0;             // ADX trend strength
        const conf = item.botConfluence || 0;     // confluence ratio 0-1
        const risk = item.riskScore || 1;         // 1-10
        const chg = Number.isFinite(item.changePercent) ? item.changePercent : 0;

        const conviction = (signal - 50) / 50;           // [-1,+1] — bearish items now sink
        const trendQuality = Math.min(adx / 40, 1) * conf; // [0,1]
        const momentum = Math.tanh(chg / 10);            // [-1,1], saturates ±~30%
        const riskMalus = risk >= 9 ? 2 : Math.max(0, (risk - 5) * 0.08);

        return conviction * 0.45
            + trendQuality * 0.20
            + momentum * 0.20
            + (volPctile ?? 0.5) * 0.15
            - riskMalus;
    }

    // Percentile rank of each item's log-volume within the active universe (Map symbol→0-1).
    function computeVolumePercentiles(items) {
        const logs = items.map(i => Math.log10(1 + (i.volume || 0)));
        const sorted = [...logs].sort((a, b) => a - b);
        const n = sorted.length;
        const pct = new Map();
        items.forEach((item, idx) => {
            // binary search for rank of logs[idx]
            let lo = 0, hi = n - 1, v = logs[idx];
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (sorted[mid] <= v) lo = mid + 1; else hi = mid - 1;
            }
            pct.set(item.symbol, n > 1 ? (lo - 1) / (n - 1) : 0.5);
        });
        return pct;
    }

    function sortItems(items, sort) {
        const active = items.filter(i => !i.isSuspended);
        const suspended = items.filter(i => i.isSuspended);

        switch (sort) {
            case 'trending': {
                const volPct = computeVolumePercentiles(active);
                const rank = new Map(active.map(i => [i.symbol, computeTrendingRank(i, volPct.get(i.symbol))]));
                // Enriched items (have real signal data) always rank above unenriched.
                // Within unenriched items, fall back to changePercent (momentum-only).
                active.sort((a, b) => {
                    const aEnriched = a.enriched ? 1 : 0;
                    const bEnriched = b.enriched ? 1 : 0;
                    if (bEnriched !== aEnriched) return bEnriched - aEnriched;
                    if (a.enriched) return rank.get(b.symbol) - rank.get(a.symbol);
                    return b.changePercent - a.changePercent;
                });
                break;
            }
            case 'signal':
                // Enriched items first (sorted by score desc), unenriched appended at bottom
                // sorted by changePercent so they're not random.
                active.sort((a, b) => {
                    const aEnriched = a.enriched ? 1 : 0;
                    const bEnriched = b.enriched ? 1 : 0;
                    if (bEnriched !== aEnriched) return bEnriched - aEnriched;
                    if (a.enriched) return b.score - a.score;
                    return b.changePercent - a.changePercent;
                });
                break;
            case 'gainers':
                active.sort((a, b) => b.changePercent - a.changePercent);
                break;
            case 'losers':
                active.sort((a, b) => a.changePercent - b.changePercent);
                break;
            case 'volume':
                active.sort((a, b) => b.volume - a.volume);
                break;
            case 'name':
                active.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        return [...active, ...suspended];
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
                showLoadingProgress(0, `Yahoo API limited, resuming in ${remaining}s...`);
            }, 1000);
        };

        const stopYahooCooldownLoader = () => {
            if (!cooldownTimer) return;
            clearInterval(cooldownTimer);
            cooldownTimer = null;
        };

        try {
            showLoadingProgress(0, `Analysis ${PERIOD_LABELS[period]}...`);
            startYahooCooldownLoader();
            // fetchYahooPeriodChanges expects (tickers, periodKey, signal)
            // periodKey must be a PERIODS key like '1D', '1W', etc.
            changes = await fetchYahooPeriodChanges(
                enrichItems.map(i => i.symbol),
                period
            );
        } catch (e) {
            changes = {};
        } finally {
            stopYahooCooldownLoader();
        }

        return items.map(item => {
            const pd = changes[item.symbol];
            if (!pd) return item;

            item.change = pd.change;
            item.changePercent = pd.changePercent;

            if (window.SignalBot && pd.history) {
                try {
                    const bot = window.SignalBot.calculateBotSignal({
                        symbol: item.symbol,
                        prices: pd.history.prices,
                        highs: pd.history.highs,
                        lows: pd.history.lows,
                        volumes: pd.history.volumes
                    }, { period: state.currentPeriod });

                    const score = bot.signalValue;
                    const riskScore = bot.risk?.score ?? 1;
                    // Directional signal comes from the score ONLY. Previously riskScore>=9 forced
                    // a 'sell' label, so a bullish-but-volatile name was mislabelled as a sell
                    // signal — conflating "risky" with "bearish". Risk is surfaced separately via
                    // riskScore (and highRisk) so the user sees direction and danger independently.
                    const signal = score >= 60 ? 'buy' : score <= 40 ? 'sell' : 'hold';
                    const highRisk = riskScore >= 9;

                    return {
                        ...item,
                        score,
                        signal,
                        riskScore,
                        highRisk,
                        enriched: true,           // flag so sort can deprioritize unenriched items
                        dataQuality: bot.dataQuality ?? null,
                        botRegime: bot.regime?.label ?? '',
                        botRegimeType: bot.regime?.type ?? '',
                        botAdx: bot.regime?.strength ?? 0,
                        botConfluence: bot.confluence?.ratio ?? 0
                    };
                } catch (_) { return item; }
            }
            return item;
        });
    }

    async function fetchSymbolsFromIndices(indices) {
        const all = [];
        const seen = new Set();
        for (const idx of indices) {
            showLoadingProgress(0, `Index ${idx}...`);
            try {
                const components = await fetchYahooIndexComponents(idx);
                for (const sym of components) {
                    const upper = (sym || '').toUpperCase();
                    if (!upper || seen.has(upper)) continue;
                    seen.add(upper);
                    all.push(upper);
                }
            } catch (e) { /* ignore single-index failure */ }
        }
        return all;
    }

    const marketTickerCache = new Map();
    async function loadMarketFallbackTickers(marketId) {
        if (marketTickerCache.has(marketId)) return marketTickerCache.get(marketId);
        try {
            const r = await fetch(`json/markets/${marketId}.json`);
            if (r.ok) {
                const tickers = await r.json();
                if (Array.isArray(tickers) && tickers.length > 0) {
                    marketTickerCache.set(marketId, tickers);
                    return tickers;
                }
            }
        } catch { /* file doesn't exist for this market */ }
        marketTickerCache.set(marketId, []);
        return [];
    }

    async function resolveMarketItems(filters, marketDef) {
        if (!marketDef) return [];

        if (Array.isArray(marketDef.indices) && marketDef.indices.length > 0) {
            let symbols = await fetchSymbolsFromIndices(marketDef.indices);
            if (!symbols.length) {
                showLoadingProgress(0, 'Loading market tickers...');
                const fallbackTickers = await loadMarketFallbackTickers(marketDef.id);
                if (fallbackTickers.length) {
                    symbols = fallbackTickers;
                } else {
                    const localSymbols = getLocalSymbolsForMarket(marketDef.id);
                    if (localSymbols.length) symbols = localSymbols;
                }
            }
            symbols = symbols.slice(0, getMaxAllowed());
            const defaultEligibility = marketDef.id === 'euronext' ? 'pea' : 'cto';
            return fetchStocksBatch(symbols, defaultEligibility, marketDef.id);
        }

        if (marketDef.type === 'list' && marketDef.lists && Object.keys(marketDef.lists).length > 0) {
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

        if (marketDef.type === 'list') {
            const localSymbols = getLocalSymbolsForMarket(marketDef.id);
            if (localSymbols.length > 0) {
                return fetchStocksBatch(localSymbols, 'cto', marketDef.id);
            }
        }

        const screeners = marketDef.screeners || YAHOO_SCREENERS;
        const targetMarket = marketDef.filterMarket || filters.market;
        return (await fetchMultipleScreeners(screeners))
            .map(mapQuoteToItem)
            .filter(i => i && (!targetMarket || i.market === targetMarket));
    }

    async function loadData() {
        if (state.isLoading) return;

        const filters = deriveFilters();
        state.currentPeriod = filters.period;

        const selectedMarket = marketsData.find(m => m.id === filters.market);
        if (selectedMarket?.disabled) {
            state.results = [];
            state.total = 0;
            state.currentPage = 1;
            renderMarketChooser();
            return;
        }

        if (!filters.market) {
            state.results = [];
            state.total = 0;
            state.currentPage = 1;
            renderMarketChooser();
            return;
        }

        const paramsKey = JSON.stringify({
            market: filters.market,
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

                state.cachedItems = items;
                state.lastParams = paramsKey;
            } catch (e) {
                console.error('Explorer load failed', e);
                showError('Loading error');
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
        if (list && show) list.innerHTML = '<div class="explorer-loading"><i class="fa-solid fa-spinner fa-spin"></i><span id="explorer-loading-text">Loading data...</span></div>';
    }

    function showLoadingProgress(loaded, totalOrText) {
        const text = document.getElementById('explorer-loading-text');
        if (text) text.textContent = typeof totalOrText === 'string' ? totalOrText : `Loading data... ${loaded}/${totalOrText}`;
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

            const valueEl = document.getElementById('explorer-limit-value');
            if (valueEl) valueEl.textContent = clamped;

            ticksEl.querySelectorAll('.explorer-limit-tick').forEach(t => {
                const v = Number(t.dataset.value || 0);
                t.classList.toggle('active', v === clamped);
            });

            const range = MAX_TICKERS_MAX - MAX_TICKERS_MIN;
            const safePos = Math.max(0, Math.min(100, ((YAHOO_SAFE_LIMIT - MAX_TICKERS_MIN) / range) * 100));
            slider.style.backgroundImage = `linear-gradient(90deg, var(--color-positive) 0%, var(--color-positive) ${safePos}%, var(--color-negative) ${safePos}%, var(--color-negative) 100%)`;
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
        if (typeof window.goToTicker !== 'function') return;
        const itemData = state.results.find(i => i.symbol === yahooSymbol) || null;
        const period = state.currentPeriod || '1D';
        const result = await window.goToTicker({ symbol: yahooSymbol, period, itemData });
        if (result?.ok && itemData?.isSuspended) window.markTabAsSuspended?.(result.symbol);
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
            list.innerHTML = '<div class="explorer-empty"><i class="fa-solid fa-chart-line" style="font-size:2rem;margin-bottom:10px;opacity:0.3"></i><br>No results found</div>';
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

            let cIndex = 0;
            img.onload = () => { el.innerHTML = `<img src="${img.src}" alt="${ticker}" />`; };
            img.onerror = () => {
                if (cIndex < candidates.length) {
                    img.src = candidates[cIndex++];
                } else {
                    setFallbackText();
                }
            };

            if (iconSymbol) {
                img.src = `img/icon/${iconSymbol}.png`;
            } else if (cIndex < candidates.length) {
                img.src = candidates[cIndex++];
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
        const signalText = isSuspended ? 'Suspended' : item.isClosed ? 'Closed' : item.signal === 'buy' ? 'Buy' : item.signal === 'sell' ? 'Sell' : 'Neutral';
        const formatPrice = p => p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
        const curr = getCurrency();

        let riskIcon = '';
        if (item.riskScore >= 9) riskIcon = '<i class="fa-solid fa-skull-crossbones" style="color:#ef4444;margin-left:5px;" title="Extreme Risk"></i>';
        else if (item.riskScore >= 7) riskIcon = '<i class="fa-solid fa-triangle-exclamation" style="color:#f97316;margin-left:5px;" title="High Risk"></i>';

        const regimeLabel = item.botRegime ? `<div class="explorer-item-regime">${item.botRegime}</div>` : '';

        return `<div class="explorer-item ${isSuspended ? 'suspended' : ''}" data-symbol="${item.symbol}">
            <div class="explorer-item-logo">${item.symbol.slice(0, 2).toUpperCase()}</div>
            <div class="explorer-item-info">
                <div class="explorer-item-name">${item.name}</div>
                <div class="explorer-item-ticker">${item.symbol}${riskIcon}</div>
                ${regimeLabel}
            </div>
            <div class="explorer-item-price"><div class="explorer-item-current">${formatPrice(priceValue)} ${curr}</div><div class="explorer-item-change ${changeClass}">${changeSign}${changePercent.toFixed(2)}% <span class="explorer-period-label">${PERIOD_LABELS[state.currentPeriod]}</span></div></div>
            <div class="explorer-item-signal"><span class="explorer-signal-badge ${signalClass}">${signalText}</span><span class="explorer-signal-score">${item.score}/100</span></div>
        </div>`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.explorerModule = { openExplorer, loadData };
}
