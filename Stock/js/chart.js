// chart.js - Chart.js chart initialization and update logic for stock app

export function initChart(symbol, positions) {
    const canvas = document.getElementById(`chart-${symbol}`)
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0,0,0,200)
    g.addColorStop(0,'rgba(168,162,255,0.3)')
    g.addColorStop(1,'rgba(168,162,255,0)')
    if (!window.Chart) return
    if (positions[symbol].chart) positions[symbol].chart.destroy()
    positions[symbol].chart = new Chart(ctx,{
        type:'line',
        data:{
            labels:[],
            datasets:[{
                label:'Prix',
                data:[],
                borderColor:'#a8a2ff',
                backgroundColor:g,
                borderWidth:2,
                fill:true,
                tension:0.4,
                pointRadius:0,
                pointHoverRadius:4
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            layout:{ padding:{ top:10, bottom:75, left:10, right:10 }},
            plugins:{
                legend:{ display:false },
                tooltip:{
                    enabled:true,
                    backgroundColor:'rgba(26,29,46,0.95)',
                    titleColor:'#a8a2ff',
                    bodyColor:'#e8e9f3',
                    borderColor:'rgba(168,162,255,0.2)',
                    borderWidth:1,
                    cornerRadius:4,
                    displayColors:false,
                    padding:12,
                    titleFont:{family:'Poppins', size:12, weight:'bold'},
                    bodyFont:{family:'Poppins', size:12},
                    callbacks:{
                        title:function(ctx){
                            return ctx[0].parsed.y.toFixed(2) + ' €'
                        },
                        label:function(ctx){
                            const i = ctx.dataIndex
                            const ts = ctx.chart.data.timestamps[i]
                            const d = new Date(ts*1000)
                            return [
                                d.toLocaleDateString('fr-FR'),
                                d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
                            ]
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl'
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x',
                        limits: {
                            x: { min: 'original', max: 'original' }
                        }
                    }
                }
            },
            scales:{
                x:{
                    grid:{ display:false },
                    ticks:{ color:'#6b7280', font:{size:8}}
                },
                y:{
                    position:'right',
                    grid:{ color:'rgba(168,162,255,0.05)', drawBorder:false},
                    ticks:{ color:'#6b7280', font:{size:8}, callback:v=>v.toFixed(1)+'€'}
                }
            },
            interaction:{ intersect:false, mode:'index' },
            animation: false
        }
    })

    // Appliquer un zoom initial pour montrer les données les plus récentes
    setTimeout(() => {
        if (positions[symbol].chart && positions[symbol].chart.data.labels && positions[symbol].chart.data.labels.length > 10) {
            // Zoomer pour montrer environ 30% des données les plus récentes
            const zoomLevel = Math.max(1, positions[symbol].chart.data.labels.length / (positions[symbol].chart.data.labels.length * 0.3))
            positions[symbol].chart.zoom(zoomLevel)
        }
    }, 100)
}

export function updateChart(symbol, timestamps, prices, positions) {
    const c = positions[symbol].chart
    if (!c || !timestamps) return

    console.log(`📊 Mise à jour chart ${symbol}: ${timestamps.length} timestamps, ${prices.length} prices`)

    const period = positions[symbol].currentPeriod || '1D'

    // Logique d'affichage des labels selon la période
    c.data.labels = timestamps.map((ts, index) => {
        const d = new Date(ts * 1000)

        switch(period) {
            case '1D':
                // Pour 1D, afficher l'heure:minute si c'est intraday
                return d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})

            case '1W':
                // Pour 1W, afficher jour/mois
                return d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})

            case '1M':
                // Pour 1M, afficher jour/mois
                return d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})

            case '6M':
                // Pour 6M, afficher mois/année
                return d.toLocaleDateString('fr-FR', {month:'2-digit', year:'2-digit'})

            case '1Y':
                // Pour 1Y, afficher mois/année
                return d.toLocaleDateString('fr-FR', {month:'2-digit', year:'2-digit'})

            case '5Y':
                // Pour 5Y, afficher l'année
                return d.getFullYear().toString()

            default:
                // Par défaut, afficher date complète
                return d.toLocaleDateString('fr-FR')
        }
    })

    c.data.datasets[0].data = prices
    c.data.timestamps = timestamps
    c.update('none')
    
    // Reset complètement le zoom lors du changement de période
    if (c.resetZoom) {
        c.resetZoom()
    }
    
    console.log(`✅ Chart ${symbol} mis à jour avec ${c.data.labels.length} labels`)
}
