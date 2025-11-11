// chart.js - Chart.js chart initialization and update logic for stock app

// chart.js - Chart.js chart initialization and update logic for stock app

// Variable globale pour le tooltip Shift (un seul pour tous les charts)
let globalShiftTooltip = null
let globalShiftPressed = false

// Enregistrer le plugin zoom si disponible
if (typeof Chart !== 'undefined' && Chart.register) {
    console.log('Chart.js available, checking for zoom plugin...')

    // Vérifier ce qui est disponible dans le scope global
    console.log('window.ChartZoom:', window.ChartZoom)
    console.log('window.chartjsPluginZoom:', window.chartjsPluginZoom)
    console.log('Available global keys:', Object.keys(window).filter(key => key.toLowerCase().includes('zoom')))

    // Essayer d'enregistrer le plugin zoom depuis la CDN
    if (window.ChartZoom) {
        Chart.register(window.ChartZoom);
        console.log('Chart.js zoom plugin registered from window.ChartZoom');
    } else if (typeof chartjsPluginZoom !== 'undefined') {
        Chart.register(chartjsPluginZoom);
        console.log('Chart.js zoom plugin registered from chartjsPluginZoom');
    } else if (window.chartjs && window.chartjs.plugins && window.chartjs.plugins.zoom) {
        Chart.register(window.chartjs.plugins.zoom);
        console.log('Chart.js zoom plugin registered from window.chartjs.plugins.zoom');
    } else {
        console.warn('Chart.js zoom plugin not found in global scope, trying direct registration');
        // Essayer de charger le plugin directement depuis l'URL
        import('https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js')
            .then(zoomPlugin => {
                console.log('Zoom plugin loaded:', zoomPlugin)
                Chart.register(zoomPlugin.default || zoomPlugin);
                console.log('Chart.js zoom plugin registered via dynamic import');
            })
            .catch(err => {
                console.error('Failed to load zoom plugin:', err);
            });
    }
} else {
    console.warn('Chart.js not available for plugin registration');
}

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
                pointHoverRadius:4,
                spanGaps: true
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
                    zoom: {
                        wheel: {
                            enabled: true,
                            modifierKey: 'shift',
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

    // Gérer le changement de curseur pour ce canvas spécifique
    const updateCursor = () => {
        canvas.style.cursor = 'default'
    }

    // Mettre à jour le curseur initial
    updateCursor()

    // Appliquer un zoom initial pour montrer les données les plus récentes
    setTimeout(() => {
        if (positions[symbol].chart && positions[symbol].chart.data.labels && positions[symbol].chart.data.labels.length > 10) {
            // Zoomer pour montrer environ 30% des données les plus récentes
            const zoomLevel = Math.max(1, positions[symbol].chart.data.labels.length / (positions[symbol].chart.data.labels.length * 0.3))
            positions[symbol].chart.zoom(zoomLevel)
        }
    }, 100)
}

// Fonctions globales pour gérer le tooltip Shift
function showGlobalShiftTooltip() {
    if (globalShiftTooltip) {
        // Si le tooltip existe déjà, juste l'afficher
        globalShiftTooltip.classList.add('show')
        return
    }

    // Trouver le chart actif
    const activeCard = document.querySelector('.card.active')
    if (!activeCard) return

    const chartContainer = activeCard.querySelector('.chart-canvas')?.parentElement
    if (!chartContainer) return

    // Créer un tooltip simple
    globalShiftTooltip = document.createElement('div')
    globalShiftTooltip.className = 'shift-tooltip'
    globalShiftTooltip.innerHTML = `
        <div>
            <div class="shift-tooltip-content">
                <div class="shift-tooltip-item">
                    <i class="fas fa-search-plus"></i>
                    <span>Scroll pour zoomer</span>
                </div>
            </div>
        </div>
    `

    // Positionner dans le container du chart
    globalShiftTooltip.style.position = 'absolute'
    globalShiftTooltip.style.top = '10px'
    globalShiftTooltip.style.right = '10px'
    globalShiftTooltip.style.zIndex = '10'

    chartContainer.style.position = 'relative'
    chartContainer.appendChild(globalShiftTooltip)

    // Animation d'apparition
    setTimeout(() => {
        globalShiftTooltip.classList.add('show')
    }, 10)
}

function hideGlobalShiftTooltip() {
    if (!globalShiftTooltip) return

    globalShiftTooltip.classList.remove('show')
    setTimeout(() => {
        if (globalShiftTooltip && globalShiftTooltip.parentNode) {
            globalShiftTooltip.parentNode.removeChild(globalShiftTooltip)
        }
        globalShiftTooltip = null
    }, 300)
}

// Écouter les événements clavier globalement (une seule fois)
if (typeof window !== 'undefined' && !window.shiftTooltipInitialized) {
    window.shiftTooltipInitialized = true

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !globalShiftPressed) {
            globalShiftPressed = true
            showGlobalShiftTooltip()
        }
    })

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && globalShiftPressed) {
            globalShiftPressed = false
            hideGlobalShiftTooltip()
        }
    })

    // Écouter les changements de tab pour repositionner le tooltip
    document.addEventListener('click', (e) => {
        if (e.target.closest('.tab')) {
            if (globalShiftTooltip) {
                hideGlobalShiftTooltip()
            }
            if (globalShiftPressed) {
                setTimeout(showGlobalShiftTooltip, 100)
            }
        }
    })
}

export function updateChart(symbol, timestamps, prices, positions) {
    const c = positions[symbol].chart
    if (!c || !timestamps) return

    // Limiter à 300 points maximum pour éviter trop de labels
    if (timestamps.length > 300) {
        const step = Math.ceil(timestamps.length / 300);
        const sampledTimestamps = [];
        const sampledPrices = [];
        for (let i = 0; i < timestamps.length; i += step) {
            sampledTimestamps.push(timestamps[i]);
            sampledPrices.push(prices[i]);
        }
        timestamps = sampledTimestamps;
        prices = sampledPrices;
    }

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
