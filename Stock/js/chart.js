import { getCurrency } from './state.js';

if (typeof Chart !== 'undefined' && Chart.register) {
    if (window.ChartZoom) Chart.register(window.ChartZoom);
    else if (typeof chartjsPluginZoom !== 'undefined') Chart.register(chartjsPluginZoom);
    else if (window.chartjs?.plugins?.zoom) Chart.register(window.chartjs.plugins.zoom);
}

const DEFAULT_LINE_COLOR = '#a8a2ff';

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

const resolveCssColor = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const buildLabel = (ts, period, interval) => {
    const d = new Date(ts * 1000);
    switch (period) {
        case '1D':
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        case '1W':
            // 5m/15m intervals: show time. 1h: show date + hour.
            if (!interval || interval === '5m' || interval === '15m')
                return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' }) + ' ' +
                d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        case '1M':
            // 15m/1h intervals on 1M: labels must include time, else every candle shows same date.
            if (!interval || interval === '15m' || interval === '1h')
                return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' }) + ' ' +
                    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            // daily fallback
            return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' });
        case '3M':
        case '6M':
            return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' });
        case '1Y':
        case 'YTD':
            return d.toLocaleDateString('en-US', { month: '2-digit', year: '2-digit' });
        case '3Y':
        case '5Y':
            return d.getFullYear().toString();
        default:
            return d.toLocaleDateString('en-US');
    }
};

const downsampleData = (ts, prices, opens, highs, lows, closes, maxPoints) => {
    if (ts.length <= maxPoints) return { ts, prices, opens, highs, lows, closes };
    const step = Math.ceil(ts.length / maxPoints);
    const lastIdx = ts.length - 1;
    const keep = (_, i) => i % step === 0 || i === lastIdx;

    return {
        ts: ts.filter(keep),
        prices: prices.filter(keep),
        opens: opens ? opens.filter(keep) : null,
        highs: highs ? highs.filter(keep) : null,
        lows: lows ? lows.filter(keep) : null,
        closes: closes ? closes.filter(keep) : null
    };
};

const buildTooltipBody = ({ ts, index, opens, highs, lows, closes }) => {
    const d = new Date(ts[index] * 1000);
    const body = [
        d.toLocaleDateString('en-US'),
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    ];

    if (opens && highs && lows && closes) {
        body.push('', `O: ${opens[index].toFixed(2)}`, `H: ${highs[index].toFixed(2)}`, `L: ${lows[index].toFixed(2)}`, `C: ${closes[index].toFixed(2)}`);
    }

    return body;
};

const getGainInfo = (symbol, price, positions) => {
    const shares = positions[symbol]?.shares || 0;
    const costBasis = positions[symbol]?.costBasis || 0;
    if (shares === 0) return null;
    const avgBuy = costBasis / shares;
    const gain = (price - avgBuy) * shares;
    return {
        gain,
        text: `Gain/Loss: ${(gain >= 0 ? '+' : '') + gain.toFixed(2)}${getCurrency()}`
    };
};

function buildChartOptions(type = 'line') {
    return {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 20, bottom: 75, left: 10, right: 10 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(26,29,46,0.95)',
                titleColor: '#a8a2ff',
                bodyColor: '#e8e9f3',
                borderColor: 'rgba(168,162,255,0.2)',
                borderWidth: 1,
                cornerRadius: 8,
                displayColors: false,
                padding: 12,
                titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 'bold' },
                bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
                footerFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 'bold' },
                footerSpacing: 4,
                footerMarginTop: 8
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true, modifierKey: 'shift', speed: 0.1 },
                    pinch: { enabled: true },
                    mode: 'x'
                },
                pan: { enabled: false }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#6b7280', font: { size: 8 } }
            },
            y: {
                position: 'right',
                beginAtZero: false,
                grace: '10%',
                grid: { color: 'rgba(168,162,255,0.05)', drawBorder: false },
                ticks: {
                    color: '#6b7280',
                    font: { size: 8 },
                    callback: v => v.toFixed(1) + getCurrency()
                }
            }
        },
        interaction: { intersect: false, mode: 'index' },
        animation: false
    };
}

function createChartInstance(canvas, targetType = 'line') {
    const ctx = canvas.getContext('2d');

    const initialData = targetType === 'line'
        ? { labels: [], datasets: [{ label: 'Price', data: [], borderColor: '#a8a2ff', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, spanGaps: true }] }
        : { labels: [], datasets: [] };

    return new Chart(ctx, { type: targetType, data: initialData, options: buildChartOptions(targetType) });
}

export function initChart(symbol, positions) {
    const canvas = document.getElementById(`chart-${symbol}`);
    if (!canvas) return;
    if (!positions[symbol].chartType) positions[symbol].chartType = 'line';

    const card = document.getElementById(`card-${symbol}`);
    if (card) {
        card.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === positions[symbol].chartType);
            btn.onclick = e => {
                e.stopPropagation();
                const type = btn.dataset.type;
                if (positions[symbol].chartType === type) return;
                positions[symbol].chartType = type;
                card.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const d = positions[symbol].lastData;
                if (d) updateChart(symbol, d.timestamps, d.prices, positions, d.source, d.opens && d.closes ? d : null);
            };
        });
    }

    if (!window.Chart) return;
    if (positions[symbol].chart) positions[symbol].chart.destroy();

    const targetType = positions[symbol].chartType === 'candle' ? 'bar' : 'line';
    positions[symbol].chart = createChartInstance(canvas, targetType);

    canvas.style.cursor = 'default';
    setTimeout(() => { if (positions[symbol].chart?.data.labels?.length > 10) positions[symbol].chart.zoom(Math.max(1, positions[symbol].chart.data.labels.length / (positions[symbol].chart.data.labels.length * 0.3))); }, 100);
}

export function updateChart(symbol, timestamps, prices, positions, source, fullData) {
    let c = positions[symbol].chart;
    if (!c || !timestamps) return;

    const { ts, prices: p, opens, highs, lows, closes } =
        source !== 'yahoo' ? downsampleData(timestamps, prices, fullData?.opens, fullData?.highs, fullData?.lows, fullData?.closes, 300)
            : { ts: timestamps, prices, opens: fullData?.opens, highs: fullData?.highs, lows: fullData?.lows, closes: fullData?.closes };

    const period = positions[symbol].currentPeriod || '1D';
    const chartType = positions[symbol].chartType || 'line';
    const interval = positions[symbol].currentInterval || null;
    const labels = ts.map(t => buildLabel(t, period, interval));

    const type = (chartType === 'candle' && (!opens || !highs || !lows || !closes)) ? 'line' : chartType;
    const targetChartJsType = type === 'candle' ? 'bar' : 'line';

    // Switch between line and bar requires a full recreate (Chart.js v4 ne supporte pas
    // le changement de type en place). On recrée en passant directement le bon type —
    // évite la boucle infinie de l'ancien code qui appelait initChart (toujours 'line')
    // puis recurrait.
    if (c.config.type !== targetChartJsType) {
        c.destroy();
        const canvas = document.getElementById(`chart-${symbol}`);
        if (!canvas || !window.Chart) return;
        positions[symbol].chart = createChartInstance(canvas, targetChartJsType);
        c = positions[symbol].chart;
    }

    c.stop?.();

    // Deactivate tooltips to avoid internal errors during update
    if (c.tooltip) {
        try { c.tooltip.setActiveElements([], { x: 0, y: 0 }); } catch (e) { }
    }

    const tooltipOpts = c.options.plugins.tooltip;
    if (!tooltipOpts.callbacks) tooltipOpts.callbacks = {};

    if (type === 'candle') {
        const pos = resolveCssColor('--color-positive', '#4caf50');
        const neg = resolveCssColor('--color-negative', '#ef4444');

        const candleData = opens.map((o, i) => ({
            o, h: highs[i], l: lows[i], c: closes[i], i
        })).filter(d => d.o != null && d.h != null && d.l != null && d.c != null);

        const colors = candleData.map(d => d.c >= d.o ? pos : neg);
        const candleLabels = candleData.map(d => labels[d.i]);

        c.data = {
            labels: candleLabels,
            datasets: [
                {
                    label: 'Mèche',
                    data: candleData.map(d => [d.l, d.h]),
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 0,
                    barThickness: 2,
                    grouped: false,
                    order: 2
                },
                {
                    label: 'Corps',
                    data: candleData.map(d => [Math.min(d.o, d.c), Math.max(d.o, d.c)]),
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 0,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8,
                    minBarLength: 2,
                    grouped: false,
                    order: 1
                }
            ]
        };
        tooltipOpts.callbacks.title = ctx => {
            const idx = candleData[ctx?.[0]?.dataIndex]?.i;
            return idx != null ? (closes[idx]?.toFixed(2) + ' ' + getCurrency()) : '0.00 ' + getCurrency();
        };
        tooltipOpts.callbacks.label = ctx => {
            if (ctx.datasetIndex === 0) return null;
            const idx = candleData[ctx.dataIndex]?.i;
            if (idx == null) return null;
            return buildTooltipBody({ ts, index: idx, opens, highs, lows, closes });
        };
        tooltipOpts.callbacks.footer = ctx => {
            const item = ctx?.[0];
            if (!item) return null;
            const idx = candleData[item.dataIndex]?.i;
            if (idx == null) return null;
            const info = getGainInfo(symbol, closes[idx], positions);
            return info ? info.text : null;
        };
        tooltipOpts.footerColor = ctx => {
            const item = ctx.tooltipItems?.[0];
            if (!item) return '#e8e9f3';
            const idx = candleData[item.dataIndex]?.i;
            if (idx == null) return '#e8e9f3';
            const info = getGainInfo(symbol, closes[idx], positions);
            if (!info) return '#e8e9f3';
            return resolveCssColor(info.gain >= 0 ? '--color-positive' : '--color-negative', info.gain >= 0 ? '#65d981' : '#f87171');
        };
    } else if (type === 'baseline') {
        const baselineValue = p[0];
        const posColor = resolveCssColor('--color-positive', '#4caf50');
        const negColor = resolveCssColor('--color-negative', '#ef4444');

        c.data = {
            labels,
            datasets: [{
                label: 'Price',
                data: p,
                borderColor: (context) => {
                    const chart = context.chart;
                    const { ctx, chartArea, scales } = chart;
                    if (!chartArea || !scales.y) return posColor;
                    const yPixel = scales.y.getPixelForValue(baselineValue);
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    const height = chartArea.bottom - chartArea.top;
                    if (height <= 0) return posColor;
                    const stop = Math.max(0, Math.min(1, (yPixel - chartArea.top) / height));
                    gradient.addColorStop(0, posColor);
                    gradient.addColorStop(stop, posColor);
                    gradient.addColorStop(stop, negColor);
                    gradient.addColorStop(1, negColor);
                    return gradient;
                },
                fill: {
                    target: { value: baselineValue },
                    above: hexToRgba(posColor, 0.2),
                    below: hexToRgba(negColor, 0.2)
                },
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true
            }]
        };
        tooltipOpts.callbacks.title = ctx => (ctx?.[0]?.parsed?.y?.toFixed(2) || '0.00') + ' ' + getCurrency();
        tooltipOpts.callbacks.label = ctx => buildTooltipBody({ ts, index: ctx.dataIndex, opens, highs, lows, closes });
        tooltipOpts.callbacks.footer = ctx => {
            const item = ctx?.[0];
            if (!item) return null;
            const info = getGainInfo(symbol, p[item.dataIndex], positions);
            return info ? info.text : null;
        };
        tooltipOpts.footerColor = ctx => {
            const item = ctx.tooltipItems?.[0];
            if (!item) return '#e8e9f3';
            const info = getGainInfo(symbol, p[item.dataIndex], positions);
            if (!info) return '#e8e9f3';
            return resolveCssColor(info.gain >= 0 ? '--color-positive' : '--color-negative', info.gain >= 0 ? '#65d981' : '#f87171');
        };
    } else {
        let line = resolveCssColor('--color-line-default', DEFAULT_LINE_COLOR);
        let gs = 'rgba(168,162,255,0.3)';
        let ge = 'rgba(168,162,255,0)';
        if (p?.length) {
            const isPos = p[p.length - 1] >= p[0];
            const col = resolveCssColor(isPos ? '--color-positive' : '--color-negative', isPos ? '#65d981' : '#f87171');
            line = col;
            gs = hexToRgba(col, 0.3) || gs;
            ge = hexToRgba(col, 0) || ge;
        }

        c.data = {
            labels,
            datasets: [{
                label: 'Price',
                data: p,
                borderColor: line,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return gs;
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, gs);
                    gradient.addColorStop(1, ge);
                    return gradient;
                },
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true
            }]
        };
        tooltipOpts.callbacks.title = ctx => (ctx?.[0]?.parsed?.y?.toFixed(2) || '0.00') + ' ' + getCurrency();
        tooltipOpts.callbacks.label = ctx => buildTooltipBody({ ts, index: ctx.dataIndex, opens, highs, lows, closes });
        tooltipOpts.callbacks.footer = ctx => {
            const item = ctx?.[0];
            if (!item) return null;
            const info = getGainInfo(symbol, p[item.dataIndex], positions);
            return info ? info.text : null;
        };
        tooltipOpts.footerColor = ctx => {
            const item = ctx.tooltipItems?.[0];
            if (!item) return '#e8e9f3';
            const info = getGainInfo(symbol, p[item.dataIndex], positions);
            if (!info) return '#e8e9f3';
            return resolveCssColor(info.gain >= 0 ? '--color-positive' : '--color-negative', info.gain >= 0 ? '#65d981' : '#f87171');
        };
    }

    c.data.timestamps = ts;
    try {
        c.update('none');
    } catch (e) {
        console.warn('Chart update failed safely, attempting full refresh:', e);
        try {
            c.update();
        } catch (e2) {
            console.error('Fatal chart update error:', e2);
        }
    }
}
