import { getCurrency } from '../core/state.js';
import { calculateRSISeries, calculateMACD } from '../quant/signal-bot.js';
import { fetchFromYahoo } from '../data/yahoo-finance.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { colors, alpha } from '../core/palette.js';

const P = colors();
const C = { line: P.accent, pos: P.pos, neg: P.neg, soft: P.text2, text: P.faint, grid: P.grid, tipBg: P.inverse, tipText: P.onInverse };
const FONT = "'Space Grotesk', system-ui, sans-serif";
const TOOLTIP = { backgroundColor: C.tipBg, titleColor: C.tipText, bodyColor: C.tipText, footerColor: C.tipText, borderWidth: 0, cornerRadius: 12, displayColors: false, titleFont: { family: FONT, size: 13, weight: '600' }, bodyFont: { family: FONT, size: 12, weight: '500' }, footerFont: { family: FONT, size: 12, weight: '600' } };
const RSI_THRESHOLDS = [30, 70];
const RSI_ZONE_COLOR = { over: C.neg, under: C.pos, mid: C.soft };

const benchmarkCache = new Map();

const hexToRgba = (hex, a) => {
    if (!hex?.startsWith('#')) return null;
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
};


export const buildLabel = (ts, period, interval) => {
    const d = new Date(ts * 1000);
    const time = () => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    const dm = () => d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
    switch (period) {
        case '1H':
        case '4H':
        case '1D': return time();
        case '1W': return (!interval || interval === '5m' || interval === '15m') ? time() : `${dm()} ${time()}`;
        case '1M': return (!interval || interval === '15m' || interval === '1h') ? `${dm()} ${time()}` : dm();
        case '3M':
        case '6M': return dm();
        case '1Y':
        case 'YTD': return d.toLocaleDateString(LOCALE, { month: '2-digit', year: '2-digit' });
        case '3Y':
        case '5Y': return d.getFullYear().toString();
        default: return d.toLocaleDateString(LOCALE);
    }
};

const getGainInfo = (symbol, price, positions) => {
    const shares = positions[symbol]?.shares || 0;
    const costBasis = positions[symbol]?.costBasis || 0;
    if (shares === 0) return null;
    const avgBuy = costBasis / shares;
    const gain = (price - avgBuy) * shares;
    return { gain, text: L('Your gain: {0} {1}', (gain >= 0 ? '+' : '') + gain.toFixed(2), getCurrency()) };
};

const candlePlugin = {
    id: 'nemerisCandles',
    afterDatasetsDraw(chart) {
        const data = chart.$candles;
        if (!data || !data.opens?.length) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || !scales.y) return;

        const { opens, highs, lows, closes } = data;
        const n = opens.length;
        if (n === 0) return;

        const pos = C.pos, neg = C.neg;
        const minIdx = scales.x.min !== undefined ? Math.max(0, scales.x.min) : 0;
        const maxIdx = scales.x.max !== undefined ? Math.min(n - 1, scales.x.max) : n - 1;
        const visibleCount = Math.max(1, maxIdx - minIdx + 1);

        const slot = (chartArea.right - chartArea.left) / visibleCount;
        const bodyW = Math.max(2, slot * 0.7);
        const wickW = Math.max(1, Math.min(2, slot * 0.12));
        const halfBody = bodyW / 2;
        const halfWick = wickW / 2;

        ctx.save();
        for (let i = Math.floor(minIdx); i <= Math.ceil(maxIdx) && i < n; i++) {
            const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
            if (o == null || h == null || l == null || c == null) continue;

            const x = scales.x.getPixelForValue(i);
            const yO = scales.y.getPixelForValue(o);
            const yH = scales.y.getPixelForValue(h);
            const yL = scales.y.getPixelForValue(l);
            const yC = scales.y.getPixelForValue(c);

            const color = c >= o ? pos : neg;
            ctx.fillStyle = color;

            ctx.fillRect(x - halfWick, yH, wickW, yL - yH);

            const top = Math.min(yO, yC);
            const h2 = Math.max(1, Math.abs(yC - yO));
            ctx.fillRect(x - halfBody, top, bodyW, h2);
        }
        ctx.restore();
    }
};

const rsiZonesPlugin = {
    id: 'rsiZones',
    beforeDatasetsDraw(chart, _args, opts) {
        if (!opts?.enabled) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.y) return;
        const yTop = scales.y.getPixelForValue(70);
        const yMid = scales.y.getPixelForValue(50);
        const yBot = scales.y.getPixelForValue(30);

        ctx.save();
        ctx.fillStyle = alpha(C.neg, 0.06);
        ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, yTop - chartArea.top);
        ctx.fillStyle = alpha(C.pos, 0.06);
        ctx.fillRect(chartArea.left, yBot, chartArea.right - chartArea.left, chartArea.bottom - yBot);

        const hLine = (y, stroke) => {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
        };
        hLine(yMid, C.grid);
        hLine(yTop, alpha(C.neg, 0.4));
        hLine(yBot, alpha(C.pos, 0.4));

        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = alpha(C.neg, 0.7);
        ctx.fillText('70', chartArea.left + 4, yTop - 3);
        ctx.fillStyle = alpha(C.pos, 0.7);
        ctx.fillText('30', chartArea.left + 4, yBot + 11);
        ctx.restore();
    }
};

const macdZeroPlugin = {
    id: 'macdZero',
    beforeDatasetsDraw(chart, _args, opts) {
        if (!opts?.enabled) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.y) return;
        const y0 = scales.y.getPixelForValue(0);
        ctx.save();
        ctx.strokeStyle = alpha(C.text, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.stroke();
        ctx.restore();
    }
};

if (typeof Chart !== 'undefined' && Chart.register && !Chart.__nemerisPluginsRegistered) {
    Chart.defaults.font.family = FONT;
    Chart.defaults.color = C.text;
    const zoomPlugin = window.ChartZoom || (typeof chartjsPluginZoom !== 'undefined' ? chartjsPluginZoom : null) || window.chartjs?.plugins?.zoom || null;
    if (zoomPlugin) Chart.register(zoomPlugin);
    Chart.register(rsiZonesPlugin, macdZeroPlugin, candlePlugin);
    Chart.__nemerisPluginsRegistered = true;
}

const buildTooltipBody = ({ ts, index, opens, highs, lows, closes }) => {
    const d = new Date(ts[index] * 1000);
    const body = [
        d.toLocaleDateString(LOCALE),
        d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
    ];
    if (opens && highs && lows && closes) {
        if (opens[index] != null && highs[index] != null && lows[index] != null && closes[index] != null) {
            body.push('',
                L('O: {0}', opens[index].toFixed(2)),
                L('H: {0}', highs[index].toFixed(2)),
                L('L: {0}', lows[index].toFixed(2)),
                L('C: {0}', closes[index].toFixed(2)));
        }
    }
    return body;
};

function syncSubcharts(mainChart, symbol, positions) {
    if (!positions || !positions[symbol]) return;
    const { min, max } = mainChart.scales.x;
    const rsi = positions[symbol].rsiChart;
    const macd = positions[symbol].macdChart;
    if (rsi && rsi.options.scales.x) {
        rsi.options.scales.x.min = min;
        rsi.options.scales.x.max = max;
        rsi.update('none');
    }
    if (macd && macd.options.scales.x) {
        macd.options.scales.x.min = min;
        macd.options.scales.x.max = max;
        macd.update('none');
    }
}

function buildMainOptions(symbol, positions) {
    const isMobile = window.innerWidth <= 768;
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 12, bottom: 4, left: 4, right: 4 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...TOOLTIP,
                enabled: true,
                padding: 12,
                footerSpacing: 4,
                footerMarginTop: 8,
                callbacks: {}
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true, speed: 0.1, modifierKey: 'ctrl' },
                    pinch: { enabled: true },
                    drag: { enabled: false },
                    mode: 'x',
                    onZoom: function({ chart }) { syncSubcharts(chart, symbol, positions); }
                },
                pan: { 
                    enabled: true, 
                    mode: 'x',
                    onPan: function({ chart }) { syncSubcharts(chart, symbol, positions); }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: C.text, font: { family: FONT, size: 12, weight: '600' }, autoSkip: true, maxRotation: 0, maxTicksLimit: isMobile ? 4 : 7 }
            },
            y: {
                position: 'right',
                beginAtZero: false,
                grace: '10%',
                grid: { color: C.grid },
                border: { display: false },
                ticks: {
                    color: C.text,
                    font: { family: FONT, size: 12, weight: '600' },
                    maxTicksLimit: 7,
                    callback: v => v.toFixed(v >= 100 ? 0 : 2) + ' ' + getCurrency()
                }
            },
            y2: {
                position: 'left',
                display: false,
                grid: { display: false },
                ticks: {
                    color: C.soft,
                    font: { family: FONT, size: 11, weight: '600' },
                    callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
                }
            }
        },
        interaction: { intersect: false, mode: 'index' },
        animation: false
    };
}

export function createMainChart(canvas, symbol, positions) {
    // Idempotent: a previous chart may still own this canvas when a ticker page
    // is rebuilt (e.g. opened while the portfolio was still loading).
    try { window.Chart?.getChart(canvas)?.destroy(); } catch (_) {}
    return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: L('Price'),
                data: [],
                borderColor: C.line,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true
            }]
        },
        options: buildMainOptions(symbol, positions)
    });
}

export function renderLine(chart, { labels, prices, ts, opens, highs, lows, closes, symbol, positions }) {
    const isPos = prices?.length ? prices[prices.length - 1] >= prices[0] : true;
    const lineCol = isPos ? C.pos : C.neg;
    const gs = hexToRgba(lineCol, 0.16);
    const ge = hexToRgba(lineCol, 0);

    chart.data.labels = labels;
    chart.data.datasets = [{
        label: L('Price'),
        data: prices,
        borderColor: lineCol,
        backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return gs;
            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, gs);
            g.addColorStop(1, ge);
            return g;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
        yAxisID: 'y'
    }];

    const tt = chart.options.plugins.tooltip;
    tt.callbacks.title = ctx => (ctx?.[0]?.parsed?.y?.toFixed(2) || '0.00') + ' ' + getCurrency();
    tt.callbacks.label = ctx => buildTooltipBody({ ts, index: ctx.dataIndex, opens, highs, lows, closes });
    tt.callbacks.footer = ctx => {
        const item = ctx?.[0];
        if (!item) return null;
        const info = getGainInfo(symbol, prices[item.dataIndex], positions);
        return info ? info.text : null;
    };
    tt.footerColor = ctx => {
        const item = ctx.tooltipItems?.[0];
        const info = item && getGainInfo(symbol, prices[item.dataIndex], positions);
        return info ? (info.gain >= 0 ? C.pos : C.neg) : C.soft;
    };
}

function renderCandle(chart, { labels, ts, opens, highs, lows, closes, symbol, positions }) {
    chart.$candles = { opens, highs, lows, closes };
    chart.data.labels = labels;
    
    chart.data.datasets = [
        {
            label: L('Highs'), data: highs,
            borderColor: 'transparent', backgroundColor: 'transparent',
            pointRadius: 0, pointHitRadius: 5, pointHoverRadius: 0, fill: false, spanGaps: true, tension: 0, yAxisID: 'y'
        },
        {
            label: L('Lows'), data: lows,
            borderColor: 'transparent', backgroundColor: 'transparent',
            pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0, fill: false, spanGaps: true, tension: 0, yAxisID: 'y'
        }
    ];

    const tt = chart.options.plugins.tooltip;
    tt.callbacks.title = ctx => {
        const i = ctx?.[0]?.dataIndex;
        if (i == null || closes[i] == null) return '0.00 ' + getCurrency();
        return closes[i].toFixed(2) + ' ' + getCurrency();
    };
    tt.callbacks.label = ctx => {
        if (ctx.datasetIndex !== 0) return null;
        return buildTooltipBody({ ts, index: ctx.dataIndex, opens, highs, lows, closes });
    };
    tt.callbacks.footer = ctx => {
        const item = ctx?.[0];
        if (!item) return null;
        const info = getGainInfo(symbol, closes[item.dataIndex], positions);
        return info ? info.text : null;
    };
    tt.footerColor = ctx => {
        const item = ctx.tooltipItems?.[0];
        const info = item && getGainInfo(symbol, closes[item.dataIndex], positions);
        return info ? (info.gain >= 0 ? C.pos : C.neg) : C.soft;
    };
}

async function getBenchmarkSeries(symbol, period) {
    const key = `${symbol}|${period}`;
    if (benchmarkCache.has(key)) return benchmarkCache.get(key);
    try {
        const data = await fetchFromYahoo(symbol, period, symbol, { ticker: symbol }, symbol);
        if (!data || data.error || !data.timestamps || !data.prices) return null;
        const result = { timestamps: data.timestamps, prices: data.prices };
        if (benchmarkCache.size >= 20) benchmarkCache.delete(benchmarkCache.keys().next().value);
        benchmarkCache.set(key, result);
        return result;
    } catch (_) { return null; }
}

function rebaseToPct(values) {
    if (!values?.length) return [];
    const base = values.find(v => v != null && v > 0);
    if (!base) return values.map(() => 0);
    return values.map(v => v == null ? null : ((v / base) - 1) * 100);
}

export function alignBenchmarkToTimestamps(targetTs, benchTs, benchPrices) {
    const aligned = new Array(targetTs.length).fill(null);
    if (!benchTs.length) return aligned;
    let j = 0;
    for (let i = 0; i < targetTs.length; i++) {
        const t = targetTs[i];
        while (j < benchTs.length - 1 && benchTs[j + 1] <= t) j++;
        if (benchPrices[j] != null) aligned[i] = benchPrices[j];
    }
    return aligned;
}

async function applyBenchmarkOverlay(symbol, benchSymbol, ts, prices, positions, period, chart) {
    const bench = await getBenchmarkSeries(benchSymbol, period);
    if (!bench || !bench.timestamps?.length) return;
    if (positions[symbol].benchmark !== benchSymbol) return;

    const aligned = alignBenchmarkToTimestamps(ts, bench.timestamps, bench.prices);
    const benchPct = rebaseToPct(aligned);
    const stockPct = rebaseToPct(prices);
    const color = C.soft;
    const benchLabel = { '^GSPC': 'S&P 500', '^FCHI': 'CAC 40', '^IXIC': 'Nasdaq' }[benchSymbol] || benchSymbol.replace('^', '');

    if (chart.options.scales.y2) {
        chart.options.scales.y2.display = true;
        if (chart.options.scales.y2.ticks) chart.options.scales.y2.ticks.color = color;
    }

    chart.data.datasets.push({
        label: benchLabel,
        data: benchPct,
        borderColor: color,
        borderWidth: 1.4,
        borderDash: [5, 4],
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        spanGaps: true,
        yAxisID: 'y2',
        order: 5
    });

    const lastBench = benchPct[benchPct.length - 1];
    const lastStock = stockPct[stockPct.length - 1];
    const label = document.getElementById(`card-${symbol}`)?.querySelector('.bench-label');
    if (label && lastBench != null && lastStock != null) {
        const diff = lastStock - lastBench;
        label.textContent = L('{0} the {1} by {2}%', diff >= 0 ? L('Beats') : L('Trails'), benchLabel, Math.abs(diff).toFixed(1));
        label.className = `bench-label ${diff >= 0 ? 'positive' : 'negative'}`;
    }

    if (chart._nemerisRendered) {
        chart.update('none');
    }
}

function buildIndicatorOptions({ yMin, yMax, tooltip = {}, plugins = {} }) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 32, bottom: 4, left: 8, right: 36 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...TOOLTIP,
                enabled: true,
                padding: 10,
                ...tooltip
            },
            zoom: false,
            ...plugins
        },
        scales: {
            x: { display: false, grid: { display: false } },
            y: {
                position: 'right',
                min: yMin, max: yMax,
                grid: { display: false },
                border: { display: false },
                ticks: { color: C.text, font: { family: FONT, size: 11, weight: '600' }, maxTicksLimit: 3, padding: 4 }
            }
        },
        interaction: { intersect: false, mode: 'index' },
        animation: false
    };
}

const rsiZoneAt = (v) => v == null ? null : v >= 70 ? 'over' : v <= 30 ? 'under' : 'mid';
const rsiZoneLabel = (v) => {
    if (v == null) return '';
    if (v >= 70) return L('Overbought, possible drop');
    if (v <= 30) return L('Oversold, possible bounce');
    if (v >= 55) return L('Bullish momentum');
    if (v <= 45) return L('Bearish momentum');
    return L('Neutral');
};
const macdState = (h) => h == null ? '' : h > 0 ? L('Bullish momentum') : h < 0 ? L('Bearish momentum') : L('Neutral');

function createRsiChart(canvas) {
    const opts = buildIndicatorOptions({
        yMin: 0, yMax: 100,
        plugins: { rsiZones: { enabled: true } },
        tooltip: {
            callbacks: {
                title: ctx => {
                    const v = ctx?.[0]?.parsed?.y;
                    return v == null ? 'RSI' : `RSI ${v.toFixed(1)}`;
                },
                label: ctx => rsiZoneLabel(ctx?.parsed?.y)
            }
        }
    });
    opts.scales.y.ticks.stepSize = 30;
    opts.scales.y.afterBuildTicks = (axis) => { axis.ticks = [{ value: 30 }, { value: 70 }]; };

    return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'RSI', data: [],
                borderColor: C.soft, borderWidth: 1.8,
                pointRadius: 0, fill: false, tension: 0, spanGaps: true,
                segment: {
                    borderColor: ctx => {
                        const y0 = ctx.p0.parsed.y, y1 = ctx.p1.parsed.y;
                        if (y0 == null || y1 == null) return RSI_ZONE_COLOR.mid;
                        const z0 = rsiZoneAt(y0), z1 = rsiZoneAt(y1);
                        if (z0 === z1) return RSI_ZONE_COLOR[z0];
                        if (z0 === 'over' || z1 === 'over') return RSI_ZONE_COLOR.over;
                        if (z0 === 'under' || z1 === 'under') return RSI_ZONE_COLOR.under;
                        return RSI_ZONE_COLOR.mid;
                    }
                }
            }]
        },
        options: opts
    });
}

function createMacdChart(canvas) {
    const opts = buildIndicatorOptions({
        yMin: undefined, yMax: undefined,
        plugins: { macdZero: { enabled: true } },
        tooltip: {
            filter: item => item.datasetIndex === 0,
            callbacks: {
                title: ctx => {
                    const v = ctx?.[0]?.parsed?.y;
                    if (v == null) return 'MACD';
                    return `Histogram ${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
                },
                label: ctx => macdState(ctx?.parsed?.y)
            }
        }
    });
    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                type: 'bar', label: 'Hist', data: [],
                backgroundColor: C.line,
                borderWidth: 0, barPercentage: 1.0, categoryPercentage: 0.95, order: 3
            }]
        },
        options: opts
    });
}

function splitRsiAtThresholds(values, labels) {
    const outV = [], outL = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        outV.push(v); outL.push(labels[i]);
        const next = values[i + 1];
        if (v == null || next == null) continue;
        const crossings = [];
        for (const t of RSI_THRESHOLDS) {
            if ((v < t && next > t) || (v > t && next < t)) {
                crossings.push({ t, ratio: (t - v) / (next - v) });
            }
        }
        crossings.sort((a, b) => a.ratio - b.ratio);
        for (const c of crossings) { outV.push(c.t); outL.push(labels[i + 1]); }
    }
    return { values: outV, labels: outL };
}

function updateIndicatorSubcharts(symbol, prices, positions) {
    if (!positions[symbol]) return;
    const card = document.getElementById(`card-${symbol}`);
    if (!card) return;
    const rsiCanvas = card.querySelector('.rsi-canvas');
    const macdCanvas = card.querySelector('.macd-canvas');
    if (!rsiCanvas || !macdCanvas) return;

    const rsiPane = card.querySelector('.stack-rsi');
    const macdPane = card.querySelector('.stack-macd');
    const enough = Array.isArray(prices) && prices.length >= 30;
    if (rsiPane) rsiPane.classList.toggle('hide-indicator', !enough);
    if (macdPane) macdPane.classList.toggle('hide-indicator', !enough);
    if (!enough) return;

    const rsiSeries = calculateRSISeries(prices, 14);
    const macd = calculateMACD(prices, 12, 26, 9);
    const N = prices.length;

    const rsiAligned = Array(N - rsiSeries.length).fill(null).concat(rsiSeries);
    const macdLine = macd.series || [];
    const sigK = 2 / (9 + 1);
    const sigSeries = [];
    let emaSig = macdLine[0] || 0;
    for (let i = 0; i < macdLine.length; i++) {
        if (i > 0) emaSig = macdLine[i] * sigK + emaSig * (1 - sigK);
        sigSeries.push(emaSig);
    }
    const macdPad = N - macdLine.length;
    const macdAligned = Array(macdPad).fill(null).concat(macdLine);
    const sigAligned = Array(macdPad).fill(null).concat(sigSeries);
    const histAligned = macdAligned.map((m, i) => (m == null || sigAligned[i] == null) ? null : m - sigAligned[i]);

    if (!positions[symbol].rsiChart) positions[symbol].rsiChart = createRsiChart(rsiCanvas);
    if (!positions[symbol].macdChart) positions[symbol].macdChart = createMacdChart(macdCanvas);

    const rsiCh = positions[symbol].rsiChart;
    const macdCh = positions[symbol].macdChart;
    const labels = prices.map((_, i) => i);

    const rsiSplit = splitRsiAtThresholds(rsiAligned, labels);
    rsiCh.data.labels = rsiSplit.labels;
    rsiCh.data.datasets[0].data = rsiSplit.values;
    try { rsiCh.update('none'); } catch (_) {}

    let peak = 0;
    for (const v of histAligned) {
        if (v != null) { const a = Math.abs(v); if (a > peak) peak = a; }
    }
    if (peak === 0) peak = 1;
    const histColors = histAligned.map(v => {
        if (v == null) return alpha(C.text, 0.4);
        const a = Math.min(1, 0.35 + (Math.abs(v) / peak) * 0.65).toFixed(2);
        return alpha(v >= 0 ? C.pos : C.neg, a);
    });

    macdCh.data.labels = labels;
    macdCh.data.datasets[0].data = histAligned;
    macdCh.data.datasets[0].backgroundColor = histColors;
    try { macdCh.update('none'); } catch (_) {}

    const lastRsi = rsiAligned[rsiAligned.length - 1];
    const lastHist = histAligned[histAligned.length - 1];
    const rsiValEl = card.querySelector('.rsi-value');
    const macdValEl = card.querySelector('.macd-value');
    const rsiStateEl = card.querySelector('.rsi-state');
    const macdStateEl = card.querySelector('.macd-state');

    if (rsiValEl && lastRsi != null) {
        rsiValEl.textContent = lastRsi.toFixed(1);
        rsiValEl.className = 'subchart-value rsi-value ' + (lastRsi >= 70 ? 'negative' : lastRsi <= 30 ? 'positive' : '');
    }
    if (rsiStateEl) {
        rsiStateEl.textContent = rsiZoneLabel(lastRsi);
        rsiStateEl.className = 'readout-state rsi-state ' + (lastRsi >= 70 ? 'negative' : lastRsi <= 30 ? 'positive' : '');
    }
    if (macdValEl && lastHist != null) {
        macdValEl.textContent = (lastHist >= 0 ? '+' : '') + lastHist.toFixed(4);
        macdValEl.className = 'subchart-value macd-value ' + (lastHist >= 0 ? 'positive' : 'negative');
    }
    if (macdStateEl) {
        macdStateEl.textContent = macdState(lastHist);
        macdStateEl.className = 'readout-state macd-state ' + (lastHist == null ? '' : (lastHist > 0 ? 'positive' : 'negative'));
    }
}

export function initChart(symbol, positions) {
    const canvas = document.getElementById(`chart-${symbol}`);
    if (!canvas) return;
    if (!positions[symbol].chartType) positions[symbol].chartType = 'line';

    if (!window.Chart) return;
    if (positions[symbol].chart) { try { positions[symbol].chart.destroy(); } catch (_) {} }
    if (positions[symbol].rsiChart) { try { positions[symbol].rsiChart.destroy(); } catch (_) {} positions[symbol].rsiChart = null; }
    if (positions[symbol].macdChart) { try { positions[symbol].macdChart.destroy(); } catch (_) {} positions[symbol].macdChart = null; }

    positions[symbol].chart = createMainChart(canvas, symbol, positions);
}

export function updateChart(symbol, timestamps, prices, positions, _source, fullData) {
    const chart = positions[symbol]?.chart;
    if (!chart) return;

    const period = positions[symbol].currentPeriod || '1D';
    const lastPeriod = chart._nemerisLastPeriod;
    chart._nemerisLastPeriod = period;

    if (lastPeriod && lastPeriod !== period) {
        if (typeof chart.resetZoom === 'function') {
            try {
                chart.resetZoom();
                const rsi = positions[symbol].rsiChart;
                const macd = positions[symbol].macdChart;
                if (rsi && rsi.options.scales.x) {
                    rsi.options.scales.x.min = undefined;
                    rsi.options.scales.x.max = undefined;
                }
                if (macd && macd.options.scales.x) {
                    macd.options.scales.x.min = undefined;
                    macd.options.scales.x.max = undefined;
                }
            } catch (_) {}
        }
    }

    if (!timestamps?.length) {
        try { updateIndicatorSubcharts(symbol, [], positions); } catch (_) {}
        return;
    }

    const ts = timestamps;
    const opens = fullData?.opens ?? null;
    const highs = fullData?.highs ?? null;
    const lows = fullData?.lows ?? null;
    const closes = fullData?.closes ?? null;

    const interval = positions[symbol].currentInterval || null;
    const requested = positions[symbol].chartType || 'line';
    const hasOhlc = opens && highs && lows && closes;
    const type = requested === 'candle' && hasOhlc ? 'candle' : 'line';

    const labels = ts.map(t => buildLabel(t, period, interval));

    if (chart.options.scales.y2) chart.options.scales.y2.display = false;
    const benchLabel = document.getElementById(`card-${symbol}`)?.querySelector('.bench-label');
    if (benchLabel && !positions[symbol].benchmark) { benchLabel.textContent = benchLabel.dataset.base || benchLabel.textContent; benchLabel.className = 'bench-label'; }
    chart.$candles = null;
    chart.data.datasets = [];

    const ctx = { labels, prices, ts, opens, highs, lows, closes, symbol, positions };

    if (type === 'candle') renderCandle(chart, ctx);
    else renderLine(chart, ctx);

    chart.data.timestamps = ts;

    const bench = positions[symbol].benchmark;
    if (bench) {
        applyBenchmarkOverlay(symbol, bench, ts, prices, positions, period, chart).catch(() => {});
    }

    if (!chart._nemerisRendered) {
        chart.update();
        chart._nemerisRendered = true;
    } else {
        chart.update('none');
    }

    try { updateIndicatorSubcharts(symbol, prices, positions); } catch (_) {}
}
