let globalShiftTooltip = null, globalShiftPressed = false;

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

const buildLabel = (ts, period) => {
    const d = new Date(ts * 1000);
    switch (period) {
        case '1D':
            return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        case '1W':
        case '1M':
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        case '6M':
        case '1Y':
            return d.toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' });
        case '5Y':
            return d.getFullYear().toString();
        default:
            return d.toLocaleDateString('fr-FR');
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

const buildGainLines = ({ ts, index, positions, symbol, price, opens, highs, lows, closes }) => {
    const d = new Date(ts[index] * 1000);
    const shares = positions[symbol]?.shares || 0;
    const costBasis = positions[symbol]?.costBasis || 0;
    const avgBuy = shares > 0 ? costBasis / shares : 0;
    const gain = shares > 0 ? (price - avgBuy) * shares : 0;
    const gainStr = `Gain/Perte: ${(gain >= 0 ? '+' : '') + gain.toFixed(2)}€`;

    const lines = [
        d.toLocaleDateString('fr-FR'),
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    ];

    if (opens && highs && lows && closes) {
        lines.push('', `O: ${opens[index].toFixed(2)}`, `H: ${highs[index].toFixed(2)}`, `L: ${lows[index].toFixed(2)}`, `C: ${closes[index].toFixed(2)}`);
    }

    lines.push(gainStr);
    return lines;
};

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

    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, 'rgba(168,162,255,0.3)');
    g.addColorStop(1, 'rgba(168,162,255,0)');

    if (!window.Chart) return;
    if (positions[symbol].chart) positions[symbol].chart.destroy();

    positions[symbol].chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Prix', data: [], borderColor: '#a8a2ff', backgroundColor: g, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, spanGaps: true }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 10, bottom: 75, left: 10, right: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true, backgroundColor: 'rgba(26,29,46,0.95)', titleColor: '#a8a2ff', bodyColor: '#e8e9f3', borderColor: 'rgba(168,162,255,0.2)', borderWidth: 1, cornerRadius: 4, displayColors: false, padding: 12, titleFont: { family: 'Poppins', size: 12, weight: 'bold' }, bodyFont: { family: 'Poppins', size: 12 }, filter: i => i.parsed.y != null && !isNaN(i.parsed.y) },
                zoom: { zoom: { wheel: { enabled: true, modifierKey: 'shift', speed: 0.1 }, pinch: { enabled: true }, mode: 'x', limits: { x: { min: 'original', max: 'original' } } }, pan: { enabled: false } }
            },
            scales: { x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 8 } } }, y: { position: 'right', grid: { color: 'rgba(168,162,255,0.05)', drawBorder: false }, ticks: { color: '#6b7280', font: { size: 8 }, callback: v => v.toFixed(1) + '€' } } },
            interaction: { intersect: false, mode: 'index' },
            animation: false
        }
    });

    canvas.style.cursor = 'default';
    setTimeout(() => { if (positions[symbol].chart?.data.labels?.length > 10) positions[symbol].chart.zoom(Math.max(1, positions[symbol].chart.data.labels.length / (positions[symbol].chart.data.labels.length * 0.3))); }, 100);
}



export function updateChart(symbol, timestamps, prices, positions, source, fullData) {
    const c = positions[symbol].chart;
    if (!c || !timestamps) return;

    const { ts, prices: p, opens, highs, lows, closes } =
        source !== 'yahoo' ? downsampleData(timestamps, prices, fullData?.opens, fullData?.highs, fullData?.lows, fullData?.closes, 300)
            : { ts: timestamps, prices, opens: fullData?.opens, highs: fullData?.highs, lows: fullData?.lows, closes: fullData?.closes };

    const period = positions[symbol].currentPeriod || '1D';
    const chartType = positions[symbol].chartType || 'line';
    const labels = ts.map(t => buildLabel(t, period));

    const type = (chartType === 'candle' && (!opens || !highs || !lows || !closes)) ? 'line' : chartType;

    if (type === 'candle') {
        const pos = resolveCssColor('--color-positive', '#4caf50');
        const neg = resolveCssColor('--color-negative', '#ef4444');
        const colors = opens.map((o, i) => closes[i] >= o ? pos : neg);
        c.config.type = 'bar';
        c.data = {
            labels,
            datasets: [
                {
                    label: 'Mèche',
                    data: lows.map((l, i) => [l, highs[i]]),
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 0,
                    barThickness: 2,
                    grouped: false,
                    order: 2
                },
                {
                    label: 'Corps',
                    data: opens.map((o, i) => [Math.min(o, closes[i]), Math.max(o, closes[i])]),
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
        c.options.plugins.tooltip.callbacks.title = ctx => closes[ctx[0].dataIndex].toFixed(2) + ' €';
        c.options.plugins.tooltip.callbacks.label = ctx => {
            if (ctx.datasetIndex === 0) return null;
            return buildGainLines({
                ts,
                index: ctx.dataIndex,
                positions,
                symbol,
                price: closes[ctx.dataIndex],
                opens,
                highs,
                lows,
                closes
            });
        };
    } else if (type === 'baseline') {
        const baselineValue = p[0];
        const posColor = resolveCssColor('--color-positive', '#4caf50');
        const negColor = resolveCssColor('--color-negative', '#ef4444');
        
        c.config.type = 'line';
        c.data = {
            labels,
            datasets: [{
                label: 'Prix',
                data: p,
                borderColor: (context) => {
                    const chart = context.chart;
                    const { ctx, chartArea, scales } = chart;
                    if (!chartArea) return null;
                    const yPixel = scales.y.getPixelForValue(baselineValue);
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    const stop = Math.max(0, Math.min(1, (yPixel - chartArea.top) / (chartArea.bottom - chartArea.top)));
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
        c.options.plugins.tooltip.callbacks.title = ctx => ctx[0].parsed.y.toFixed(2) + ' €';
        c.options.plugins.tooltip.callbacks.label = ctx => buildGainLines({
            ts,
            index: ctx.dataIndex,
            positions,
            symbol,
            price: p[ctx.dataIndex],
            opens,
            highs,
            lows,
            closes
        });
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
        const g = c.ctx.createLinearGradient(0, 0, 0, 200);
        g.addColorStop(0, gs);
        g.addColorStop(1, ge);
        c.config.type = 'line';
        c.data = { labels, datasets: [{ label: 'Prix', data: p, borderColor: line, backgroundColor: g, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, spanGaps: true }] };
        c.options.plugins.tooltip.callbacks.title = ctx => ctx[0].parsed.y.toFixed(2) + ' €';
        c.options.plugins.tooltip.callbacks.label = ctx => buildGainLines({
            ts,
            index: ctx.dataIndex,
            positions,
            symbol,
            price: p[ctx.dataIndex],
            opens,
            highs,
            lows,
            closes
        });
    }

    c.data.timestamps = ts;
    c.update('none');
    c.resetZoom?.();
}