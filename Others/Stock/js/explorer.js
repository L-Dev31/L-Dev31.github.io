(function() {
    'use strict';

    const YAHOO_PROXY = 'https://corsproxy.io/?';
    const ITEMS_PER_PAGE = 10;
    const SCREENER_BATCH_SIZE = 250;
    const MAX_TOTAL_RESULTS = 1000;

    let currentPage = 1;
    let currentResults = [];
    let totalResults = 0;
    let isLoading = false;
    let currentPeriod = '1D';

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
    const EURONEXT_CAC40 = ['MC.PA', 'OR.PA', 'RMS.PA', 'TTE.PA', 'SAN.PA', 'AI.PA', 'AIR.PA', 'SU.PA', 'BNP.PA', 'CS.PA', 'DG.PA', 'SAF.PA', 'RI.PA', 'CAP.PA', 'BN.PA', 'DSY.PA', 'ENGI.PA', 'VIE.PA', 'SGO.PA', 'ACA.PA', 'LR.PA', 'PUB.PA', 'STMPA.PA', 'ORA.PA', 'GLE.PA', 'ML.PA', 'VIV.PA', 'EN.PA', 'WLN.PA', 'TEP.PA', 'URW.PA', 'HO.PA', 'MT.PA', 'ALO.PA', 'ERA.PA'];
    const EURONEXT_PME = ['ALUNT.PA', 'AL2SI.PA', 'ALCAR.PA', 'ALNEV.PA', 'ALTHE.PA', 'ALMII.PA', 'ALDRV.PA', 'ALMDG.PA', 'ALMOU.PA', 'ALGBE.PA', 'ALNXT.PA', 'ALVU.PA', 'ALSEN.PA', 'ALVDM.PA', 'ALTXC.PA', 'ALDBL.PA'];

    let stockIconMap = {};
    let yahooToJsonSymbol = {};

    async function init() {
        await loadStockMappings();
        bindEvents();
    }

    async function loadStockMappings() {
        for (const file of ['stock/equity.json', 'stock/crypto.json', 'stock/commodity.json']) {
            try {
                const r = await fetch(file);
                if (!r.ok) continue;
                const stocks = await r.json();
                stocks.forEach(s => {
                    if (s.ticker) stockIconMap[s.ticker] = s.symbol;
                    if (s.symbol) stockIconMap[s.symbol] = s.symbol;
                    if (s.api_mapping?.yahoo) yahooToJsonSymbol[s.api_mapping.yahoo] = s.symbol;
                    if (s.ticker) yahooToJsonSymbol[s.ticker] = s.symbol;
                    if (s.symbol) yahooToJsonSymbol[s.symbol] = s.symbol;
                });
            } catch (e) {}
        }
    }

    function getJsonSymbol(sym) {
        if (yahooToJsonSymbol[sym]) return yahooToJsonSymbol[sym];
        const base = sym.split('.')[0].split('-')[0];
        return yahooToJsonSymbol[base] || null;
    }

    function getIconSymbol(sym) {
        if (stockIconMap[sym]) return stockIconMap[sym];
        const base = sym.split('.')[0].split('-')[0];
        return stockIconMap[base] || null;
    }

    async function fetchScreener(scrIds, offset = 0, count = SCREENER_BATCH_SIZE) {
        try {
            const r = await fetch(`${YAHOO_PROXY}https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrIds}&count=${count}&offset=${offset}`);
            if (!r.ok) return { quotes: [], total: 0 };
            const j = await r.json();
            const result = j.finance?.result?.[0];
            return { quotes: result?.quotes || [], total: result?.total || 0 };
        } catch (e) {
            return { quotes: [], total: 0 };
        }
    }

    async function fetchAllScreenerResults(scrIds) {
        let allQuotes = [];
        const first = await fetchScreener(scrIds, 0, SCREENER_BATCH_SIZE);
        allQuotes = first.quotes;
        let total = first.total;

        while (allQuotes.length < total && allQuotes.length < MAX_TOTAL_RESULTS && first.quotes.length === SCREENER_BATCH_SIZE) {
            showLoadingProgress(allQuotes.length, Math.min(total, MAX_TOTAL_RESULTS));
            const batch = await fetchScreener(scrIds, allQuotes.length, SCREENER_BATCH_SIZE);
            if (batch.quotes.length === 0) break;
            allQuotes = allQuotes.concat(batch.quotes);
            if (batch.quotes.length < SCREENER_BATCH_SIZE) break;
        }
        return allQuotes;
    }

    async function fetchMultipleScreeners() {
        const allQuotes = [];
        const seen = new Set();
        for (const scrId of YAHOO_SCREENERS) {
            showLoadingProgress(allQuotes.length, `${scrId}...`);
            try {
                const quotes = await fetchAllScreenerResults(scrId);
                quotes.forEach(q => {
                    if (!seen.has(q.symbol)) {
                        seen.add(q.symbol);
                        allQuotes.push(q);
                    }
                });
                if (allQuotes.length >= MAX_TOTAL_RESULTS) break;
            } catch (e) {}
        }
        return allQuotes;
    }

    function mapQuoteToItem(q) {
        const price = q.regularMarketPrice || q.price || 0;
        const change = q.regularMarketChange || 0;
        const changePercent = q.regularMarketChangePercent || 0;
        const volume = q.regularMarketVolume || 0;
        const exchange = (q.exchange || '').toUpperCase();
        const fullExchange = (q.fullExchangeName || '').toLowerCase();
        const symbol = q.symbol || '';

        let market = 'other';
        if (['NMS', 'NGS', 'NCM', 'NASDAQ'].includes(exchange)) market = 'nasdaq';
        else if (['NYQ', 'NYSE', 'NYS', 'PCX', 'ASE'].includes(exchange)) market = 'nyse';
        else if (exchange === 'PAR' || exchange === 'EPA' || symbol.endsWith('.PA')) market = 'euronext';
        else if (exchange === 'CCC' || q.quoteType === 'CRYPTOCURRENCY') market = 'crypto';
        else if (fullExchange.includes('nasdaq')) market = 'nasdaq';
        else if (fullExchange.includes('nyse') || fullExchange.includes('new york')) market = 'nyse';
        else if (fullExchange.includes('paris') || fullExchange.includes('euronext')) market = 'euronext';

        const yahooSector = (q.sector || q.industry || '').toLowerCase();
        let sector = 'other';
        if (yahooSector.match(/tech|software|semiconductor|computer|electronic/)) sector = 'technology';
        else if (yahooSector.match(/health|pharma|biotech|medical/)) sector = 'healthcare';
        else if (yahooSector.match(/financ|bank|insurance|capital/)) sector = 'finance';
        else if (yahooSector.match(/energy|oil|gas|petrol/)) sector = 'energy';
        else if (yahooSector.match(/consumer|retail|food|beverage|apparel/)) sector = 'consumer';

        let eligibility = 'cto';
        if (market === 'euronext') eligibility = q.marketCap && q.marketCap < 1e9 ? 'pea-pme' : 'pea';

        const tradeable = q.tradeable !== false;
        const regularMarketTime = q.regularMarketTime || 0;
        const now = Math.floor(Date.now() / 1000);
        const daysSinceLastTrade = (now - regularMarketTime) / 86400;
        const noActivity = volume === 0 && Math.abs(changePercent) < 0.001;
        const isSuspended = !tradeable || (noActivity && daysSinceLastTrade > 3) || daysSinceLastTrade > 7;

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

    async function fetchEuronextStock(symbol) {
        try {
            const r = await fetch(`${YAHOO_PROXY}https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`);
            if (!r.ok) return null;
            const data = await r.json();
            const result = data.chart?.result?.[0];
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

            const tradeable = meta.tradeable !== false;
            const regularMarketTime = meta.regularMarketTime || 0;
            const now = Math.floor(Date.now() / 1000);
            const daysSinceLastTrade = regularMarketTime > 0 ? (now - regularMarketTime) / 86400 : 999;

            const validCloses = closes.filter(c => c !== null);
            const noActivity = volume === 0 && Math.abs(changePercent) < 0.001;
            const isSuspended = !tradeable || validCloses.length === 0 || (noActivity && daysSinceLastTrade > 3) || daysSinceLastTrade > 7;

            let score = Math.max(0, Math.min(100, 50 + changePercent * 3 + Math.min(volume / 50000000, 15)));
            let signal = score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold';

            return {
                symbol, name: meta.shortName || meta.longName || symbol.replace('.PA', ''),
                price, change, changePercent, volume,
                market: 'euronext', sector: 'other', eligibility: 'pea',
                currency: meta.currency || 'EUR', marketCap: 0, industry: '',
                isClosed: isSuspended, isSuspended,
                daysSinceLastTrade: Math.round(daysSinceLastTrade),
                score: Math.round(score), signal
            };
        } catch (e) {
            return null;
        }
    }

    async function fetchEuronextStocks(symbols, defaultEligibility = 'pea') {
        const items = [];
        let completed = 0;
        showLoadingProgress(0, `Euronext (${symbols.length})...`);

        const batchSize = 10;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const results = await Promise.allSettled(batch.map(s => fetchEuronextStock(s)));
            results.forEach((r, idx) => {
                if (r.status === 'fulfilled' && r.value) {
                    r.value.eligibility = EURONEXT_PME.includes(batch[idx]) ? 'pea-pme' : 'pea';
                    items.push(r.value);
                }
            });
            completed += batch.length;
            showLoadingProgress(completed, symbols.length);
            if (i + batchSize < symbols.length) await new Promise(r => setTimeout(r, 100));
        }
        return items;
    }

    async function fetchPeriodChanges(symbols, period, onProgress) {
        if (!symbols.length || period === '1D') return {};
        const config = PERIOD_CONFIG[period];
        const changes = {};
        let completed = 0;
        const batchSize = 10;

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const results = await Promise.allSettled(batch.map(async sym => {
                try {
                    const r = await fetch(`${YAHOO_PROXY}https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${config.range}&interval=${config.interval}`);
                    if (!r.ok) return null;
                    const data = await r.json();
                    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
                    if (!closes || closes.length < 2) return null;

                    let firstClose = null, lastClose = null;
                    for (let j = 0; j < closes.length; j++) if (closes[j] !== null) { firstClose = closes[j]; break; }
                    for (let j = closes.length - 1; j >= 0; j--) if (closes[j] !== null) { lastClose = closes[j]; break; }
                    if (!firstClose || !lastClose || firstClose === 0) return null;

                    return { change: lastClose - firstClose, changePercent: ((lastClose - firstClose) / firstClose) * 100 };
                } catch (e) { return null; }
            }));

            results.forEach((r, idx) => { if (r.status === 'fulfilled' && r.value) changes[batch[idx]] = r.value; });
            completed += batch.length;
            if (onProgress) onProgress(completed, symbols.length);
            if (i + batchSize < symbols.length) await new Promise(r => setTimeout(r, 50));
        }
        return changes;
    }

    async function loadData() {
        if (isLoading) return;

        const search = document.getElementById('explorer-search')?.value.trim().toLowerCase() || '';
        const sort = document.getElementById('explorer-sort')?.value || 'trending';
        const market = document.getElementById('explorer-market')?.value || '';
        const sector = document.getElementById('explorer-sector')?.value || '';
        const eligibility = document.getElementById('explorer-eligibility')?.value || '';
        const period = document.getElementById('explorer-period')?.value || '1D';
        currentPeriod = period;

        isLoading = true;
        showLoading(true);

        try {
            let items = [];

            if (eligibility === 'pea-pme') {
                items = await fetchEuronextStocks(EURONEXT_PME, 'pea-pme');
            } else if (eligibility === 'pea') {
                items = await fetchEuronextStocks([...EURONEXT_CAC40, ...EURONEXT_PME], 'pea');
            } else if (market === 'euronext') {
                items = await fetchEuronextStocks([...EURONEXT_CAC40, ...EURONEXT_PME], 'pea');
            } else if (market === 'crypto') {
                items = (await fetchAllScreenerResults('all_cryptocurrencies_us')).map(mapQuoteToItem);
            } else if (market === 'nasdaq') {
                items = (await fetchMultipleScreeners()).map(mapQuoteToItem).filter(i => i.market === 'nasdaq');
            } else if (market === 'nyse') {
                items = (await fetchMultipleScreeners()).map(mapQuoteToItem).filter(i => i.market === 'nyse');
            } else {
                const usItems = (await fetchMultipleScreeners()).map(mapQuoteToItem);
                const euItems = await fetchEuronextStocks([...EURONEXT_CAC40, ...EURONEXT_PME], 'pea');
                const cryptoItems = (await fetchAllScreenerResults('all_cryptocurrencies_us')).map(mapQuoteToItem);
                items = [...usItems, ...euItems, ...cryptoItems];
            }

            const seen = new Set();
            items = items.filter(i => i.symbol && !seen.has(i.symbol) && seen.add(i.symbol));

            if (period !== '1D' && items.length > 0) {
                showLoadingProgress(0, `Calcul ${PERIOD_LABELS[period]}...`);
                const changes = await fetchPeriodChanges(items.map(i => i.symbol), period, (done, total) => {
                    showLoadingProgress(done, `${PERIOD_LABELS[period]} ${done}/${total}`);
                });
                items = items.map(item => {
                    const pd = changes[item.symbol];
                    if (pd) {
                        const score = Math.max(0, Math.min(100, 50 + pd.changePercent * 3 + Math.min(item.volume / 50000000, 15)));
                        return { ...item, change: pd.change, changePercent: pd.changePercent, score: Math.round(score), signal: score >= 65 ? 'buy' : score <= 35 ? 'sell' : 'hold' };
                    }
                    return item;
                });
            }

            if (search) items = items.filter(i => i.symbol.toLowerCase().includes(search) || i.name.toLowerCase().includes(search));
            if (sector) items = items.filter(i => i.sector === sector);

            const open = items.filter(i => !i.isClosed);
            const closed = items.filter(i => i.isClosed);

            switch (sort) {
                case 'gainers': open.sort((a, b) => b.changePercent - a.changePercent); break;
                case 'losers': open.sort((a, b) => a.changePercent - b.changePercent); break;
                case 'volume': open.sort((a, b) => b.volume - a.volume); break;
                case 'signal': open.sort((a, b) => b.score - a.score); break;
                case 'name': open.sort((a, b) => a.name.localeCompare(b.name)); break;
                default: 
                    // Shuffle for trending/default view to mix markets
                    for (let i = open.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [open[i], open[j]] = [open[j], open[i]];
                    }
                    break;
            }
            closed.sort((a, b) => a.name.localeCompare(b.name));

            currentResults = [...open, ...closed];
            totalResults = currentResults.length;
            currentPage = 1;
            render();
        } catch (e) {
            showError('Erreur de chargement');
        } finally {
            isLoading = false;
            showLoading(false);
        }
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
        document.getElementById('explorer-search')?.addEventListener('input', debounce(() => { currentPage = 1; loadData(); }, 500));
        document.getElementById('explorer-market')?.addEventListener('change', () => { currentPage = 1; loadData(); });
        document.getElementById('explorer-sort')?.addEventListener('change', () => { currentPage = 1; loadData(); });
        document.getElementById('explorer-sector')?.addEventListener('change', () => { currentPage = 1; loadData(); });
        document.getElementById('explorer-eligibility')?.addEventListener('change', () => { currentPage = 1; loadData(); });
        document.getElementById('explorer-period')?.addEventListener('change', () => { currentPage = 1; loadData(); });
        document.getElementById('explorer-prev')?.addEventListener('click', () => changePage(-1));
        document.getElementById('explorer-next')?.addEventListener('click', () => changePage(1));
        document.getElementById('explorer-list')?.addEventListener('click', e => {
            const item = e.target.closest('.explorer-item');
            if (item?.dataset.symbol) openStock(item.dataset.symbol);
        });
    }

    async function openStock(yahooSymbol) {
        const itemData = currentResults.find(i => i.symbol === yahooSymbol);
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
        if (itemData.market === 'euronext' || symbol.endsWith('.PA')) country = 'FR';
        else if (itemData.currency === 'GBP') country = 'GB';

        const iconSymbol = getIconSymbol(symbol);
        const logo = card.querySelector('.logo img');
        if (logo) {
            logo.id = `logo-${symbol}`;
            logo.dataset.symbol = symbol;
            logo.src = iconSymbol ? `icon/${iconSymbol}.png` : `logo/${symbol}.png`;
            logo.onerror = function() {
                this.parentElement.innerHTML = `<div class="logo-fallback"><div class="logo-name" title="${itemData.name || symbol}">${itemData.name || symbol}</div></div>`;
            };
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
        const signalValue = card.querySelector('.signal-value');
        const signalDescription = card.querySelector('.signal-description');
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
            const typeLabels = { crypto: 'Cryptos', equity: 'Actions', commodity: 'Matières Premières' };
            const typeIcons = { crypto: 'fa-brands fa-bitcoin', equity: 'fa-solid fa-building-columns', commodity: 'fa-solid fa-coins' };
            const title = document.createElement('div');
            title.className = 'tab-type-title';
            title.innerHTML = `<i class="${typeIcons[type] || 'fa-solid fa-layer-group'} type-icon"></i> ${typeLabels[type] || 'Autre'}`;
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

        if (iconSymbol) {
            const img = document.createElement('img');
            img.src = `icon/${iconSymbol}.png`;
            img.alt = yahooSymbol;
            img.onerror = function() {
                this.parentElement.innerHTML = `<div class="tab-logo-fallback" title="${yahooSymbol}">${yahooSymbol.slice(0, 4).toUpperCase()}</div>`;
            };
            tabLogo.appendChild(img);
        } else {
            const ticker = yahooSymbol.split('.')[0].toUpperCase();
            const fallback = document.createElement('div');
            fallback.className = 'tab-logo-fallback';
            fallback.textContent = ticker.length > 4 ? ticker.slice(0, 4) : ticker;
            fallback.title = yahooSymbol;
            fallback.style.fontSize = ticker.length > 4 ? Math.max(6, 12 - (ticker.length - 4) * 2) + 'px' : '12px';
            tabLogo.appendChild(fallback);
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
        const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE) || 1;
        const newPage = currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) { currentPage = newPage; render(); }
    }

    function render() {
        const list = document.getElementById('explorer-list');
        if (!list) return;

        const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE) || 1;
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageData = currentResults.slice(start, start + ITEMS_PER_PAGE);

        if (!pageData.length) {
            list.innerHTML = '<div class="explorer-empty"><i class="fa-solid fa-chart-line" style="font-size:2rem;margin-bottom:10px;opacity:0.3"></i><br>Aucun résultat trouvé</div>';
        } else {
            list.innerHTML = pageData.map(renderItem).join('');
            loadItemIcons();
        }

        document.getElementById('explorer-page-info').textContent = `Page ${currentPage} / ${totalPages}`;
        document.getElementById('explorer-prev').disabled = currentPage <= 1;
        document.getElementById('explorer-next').disabled = currentPage >= totalPages;
    }

    function loadItemIcons() {
        document.querySelectorAll('.explorer-item-logo').forEach(el => {
            const ticker = el.parentElement.dataset.symbol;
            if (!ticker) return;
            const iconSymbol = getIconSymbol(ticker);
            if (iconSymbol) {
                const img = new Image();
                img.onload = () => { el.innerHTML = `<img src="icon/${iconSymbol}.png" alt="${ticker}" />`; };
                img.onerror = () => { el.innerHTML = ticker.slice(0, 2).toUpperCase(); };
                img.src = `icon/${iconSymbol}.png`;
            } else {
                el.innerHTML = ticker.slice(0, 2).toUpperCase();
            }
        });
    }

    function renderItem(item) {
        const changeClass = item.changePercent >= 0 ? 'positive' : 'negative';
        const changeSign = item.changePercent >= 0 ? '+' : '';
        const signalClass = item.isSuspended ? 'suspended' : item.isClosed ? 'closed' : item.signal;
        const signalText = item.isSuspended ? 'Suspendu' : item.isClosed ? 'Fermé' : item.signal === 'buy' ? 'Achat' : item.signal === 'sell' ? 'Vente' : 'Neutre';
        const formatPrice = p => p >= 1000 ? p.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
        const curr = item.currency === 'EUR' ? '€' : item.currency === 'GBP' ? '£' : '$';

        return `<div class="explorer-item" data-symbol="${item.symbol}">
            <div class="explorer-item-logo">${item.symbol.slice(0, 2).toUpperCase()}</div>
            <div class="explorer-item-info"><div class="explorer-item-ticker">${item.symbol}</div><div class="explorer-item-name">${item.name}</div></div>
            <div class="explorer-item-price"><div class="explorer-item-current">${formatPrice(item.price)} ${curr}</div><div class="explorer-item-change ${changeClass}">${changeSign}${item.changePercent.toFixed(2)}% <span class="explorer-period-label">${PERIOD_LABELS[currentPeriod]}</span></div></div>
            <div class="explorer-item-signal"><span class="explorer-signal-badge ${signalClass}">${signalText}</span><span class="explorer-signal-score">${item.score}/100</span></div>
        </div>`;
    }

    function debounce(fn, delay) {
        let timeout;
        return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), delay); };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.explorerModule = { openExplorer, loadData };
})();
