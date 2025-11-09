// chart.js - Chart.js chart initialization and update logic for stock app

export function initChart(symbol, positions) {
    const canvas = document.getElementById(`chart-${symbol}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(168, 162, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(168, 162, 255, 0)');

    if (typeof Chart === 'undefined') {
        console.error('Chart.js library is not loaded');
        return;
    }

    if (positions[symbol] && positions[symbol].chart) {
        try {
            positions[symbol].chart.destroy();
        } catch (e) {}
    }

    positions[symbol].chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Prix',
                data: [],
                borderColor: '#a8a2ff',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#a8a2ff',
                pointHoverBorderColor: '#e8e9f3',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 75,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: function(context) {
                        let tooltipEl = document.getElementById('chartjs-tooltip');
                        if (!tooltipEl) {
                            tooltipEl = document.createElement('div');
                            tooltipEl.id = 'chartjs-tooltip';
                            document.body.appendChild(tooltipEl);
                        }
                        if (context.tooltip.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }
                        if (context.tooltip.body && context.tooltip.body.length > 0) {
                            const dataIndex = context.tooltip.dataPoints[0].dataIndex;
                            const ts = context.chart.data.timestamps[dataIndex];
                            const date = new Date(ts * 1000);
                            const dateStr = date.toLocaleDateString('fr-FR');
                            const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            const price = context.tooltip.dataPoints[0].parsed.y.toFixed(2) + ' €';
                            tooltipEl.innerHTML = `
                                <div style="background: rgba(26, 29, 46, 0.95); color: #e8e9f3; border: 1px solid rgba(168, 162, 255, 0.2); padding: 12px; border-radius: 4px; font-family: Poppins; font-size: 12px; line-height: 1.4;">
                                    <div style="color: #a8a2ff; font-weight: 500;">${dateStr}</div>
                                    <div>${timeStr}</div>
                                    <div style="color: #a8a2ff; font-weight: 500;">${price}</div>
                                </div>
                            `;
                        }
                        const position = context.chart.canvas.getBoundingClientRect();
                        tooltipEl.style.opacity = 1;
                        tooltipEl.style.position = 'absolute';
                        tooltipEl.style.left = (position.left + context.tooltip.caretX + 10) + 'px';
                        tooltipEl.style.top = (position.top + context.tooltip.caretY - 10) + 'px';
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.zIndex = '9999';
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 8 }
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: {
                        color: 'rgba(168, 162, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: (value) => value.toFixed(1) + '€',
                        font: { size: 8 }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

export function updateChart(symbol, timestamps, prices, positions) {
    const chart = positions[symbol].chart;
    if (!chart || !timestamps || !timestamps.length) return;

    let labels;
    if (timestamps.length >= 2 && (timestamps[timestamps.length-1] - timestamps[0]) > 24*60*60) {
        labels = timestamps.map(ts => new Date(ts * 1000).toLocaleDateString('fr-FR'));
    } else {
        labels = timestamps.map(ts => {
            const date = new Date(ts * 1000);
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        });
    }

    chart.data.labels = labels;
    chart.data.datasets[0].data = prices;
    chart.data.timestamps = timestamps;
    chart.update('none');
}
