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
    
    // Initialiser le type de chart par défaut
    if (!positions[symbol].chartType) positions[symbol].chartType = 'line';

    // Gérer les boutons de type de chart
    const card = document.getElementById(`card-${symbol}`);
    if (card) {
        const typeBtns = card.querySelectorAll('.chart-type-btn');
        typeBtns.forEach(btn => {
            // Mettre à jour l'état actif initial
            if (btn.dataset.type === positions[symbol].chartType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }

            // Ajouter l'écouteur d'événement (en évitant les doublons)
            btn.onclick = (e) => {
                e.stopPropagation();
                const newType = btn.dataset.type;
                if (positions[symbol].chartType === newType) return;

                positions[symbol].chartType = newType;
                
                // Mettre à jour l'UI des boutons
                typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Re-créer le chart avec le nouveau type
                // On a besoin des dernières données pour redessiner
                if (positions[symbol].lastData) {
                    const d = positions[symbol].lastData;
                    // Si on a les données complètes (OHLC), on les utilise
                    // Sinon on utilise juste timestamps et prices
                    if (d.opens && d.closes) {
                        updateChart(symbol, d.timestamps, d.prices, positions, d.source, d);
                    } else {
                        updateChart(symbol, d.timestamps, d.prices, positions, d.source);
                    }
                }
            };
        });
    }

    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0,0,0,200)
    g.addColorStop(0,'rgba(168,162,255,0.3)')
    g.addColorStop(1,'rgba(168,162,255,0)')
    if (!window.Chart) return
    if (positions[symbol].chart) positions[symbol].chart.destroy()
    
    // Configuration de base commune
    const commonOptions = {
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
                filter: function(tooltipItem) {
                    return tooltipItem.parsed.y != null && !isNaN(tooltipItem.parsed.y);
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
                },
                pan: {
                    enabled: false
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
    };

    // Création initiale (toujours en line au début, sera mis à jour par updateChart)
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
                tension: 0.4,
                pointRadius:0,
                pointHoverRadius:4,
                spanGaps: true
            }]
        },
        options: commonOptions
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

    // Créer un tooltip simple à partir du template pour garder l'HTML dans index.html
    const tpl = document.getElementById('shift-tooltip-template');
    if (tpl) {
        const clone = tpl.content.firstElementChild.cloneNode(true);
        globalShiftTooltip = clone;
    } else {
        globalShiftTooltip = document.createElement('div');
        globalShiftTooltip.className = 'shift-tooltip';
    }

        // Positionner dans le container du chart — handled by CSS (.shift-tooltip and .chart-container)

    // chart container position handled by CSS
    chartContainer.appendChild(globalShiftTooltip)

    // Affichage immédiat
    globalShiftTooltip.classList.add('show')
}

function hideGlobalShiftTooltip() {
    if (!globalShiftTooltip) return

    globalShiftTooltip.classList.remove('show')
    
    if (globalShiftTooltip && globalShiftTooltip.parentNode) {
        globalShiftTooltip.parentNode.removeChild(globalShiftTooltip)
    }
    globalShiftTooltip = null
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

export function updateChart(symbol, timestamps, prices, positions, source, fullData) {
    const c = positions[symbol].chart
    if (!c || !timestamps) return

    // Les données sont déjà filtrées à la source, pas besoin de refiltrer
    let finalTimestamps = timestamps
    let finalPrices = prices
    let finalOpens = fullData?.opens;
    let finalHighs = fullData?.highs;
    let finalLows = fullData?.lows;
    let finalCloses = fullData?.closes;

    // Limiter à 300 points maximum pour éviter trop de labels, SAUF pour Yahoo Finance
    if (source !== 'yahoo' && finalTimestamps.length > 300) {
        const step = Math.ceil(finalTimestamps.length / 300);
        const sampledTimestamps = [];
        const sampledPrices = [];
        const sampledOpens = [];
        const sampledHighs = [];
        const sampledLows = [];
        const sampledCloses = [];
        
        for (let i = 0; i < finalTimestamps.length; i += step) {
            sampledTimestamps.push(finalTimestamps[i]);
            sampledPrices.push(finalPrices[i]);
            if (finalOpens) sampledOpens.push(finalOpens[i]);
            if (finalHighs) sampledHighs.push(finalHighs[i]);
            if (finalLows) sampledLows.push(finalLows[i]);
            if (finalCloses) sampledCloses.push(finalCloses[i]);
        }
        finalTimestamps = sampledTimestamps;
        finalPrices = sampledPrices;
        if (finalOpens) finalOpens = sampledOpens;
        if (finalHighs) finalHighs = sampledHighs;
        if (finalLows) finalLows = sampledLows;
        if (finalCloses) finalCloses = sampledCloses;
    }

    console.log(`📊 Mise à jour chart ${symbol}: ${finalTimestamps.length} timestamps (déjà filtrés), ${finalPrices.length} prices`)

    const period = positions[symbol].currentPeriod || '1D'
    const chartType = positions[symbol].chartType || 'line';

    // Générer les labels
    const labels = finalTimestamps.map((ts, index) => {
        const d = new Date(ts * 1000)
        switch(period) {
            case '1D': return d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})
            case '1W': return d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})
            case '1M': return d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})
            case '6M': return d.toLocaleDateString('fr-FR', {month:'2-digit', year:'2-digit'})
            case '1Y': return d.toLocaleDateString('fr-FR', {month:'2-digit', year:'2-digit'})
            case '5Y': return d.getFullYear().toString()
            default: return d.toLocaleDateString('fr-FR')
        }
    });

    // Si le type demandé est 'candle' mais qu'on n'a pas les données OHLC, on force 'line'
    const effectiveType = (chartType === 'candle' && (!finalOpens || !finalHighs || !finalLows || !finalCloses)) ? 'line' : chartType;

    if (effectiveType === 'candle') {
        // Configuration pour le chart en bougies (simulé avec des barres)
        // Dataset 0: Mèches (Low à High)
        // Dataset 1: Corps (Open à Close)
        
        const posColor = getComputedStyle(document.documentElement).getPropertyValue('--color-positive').trim() || '#4caf50';
        const negColor = getComputedStyle(document.documentElement).getPropertyValue('--color-negative').trim() || '#ef4444';

        const colors = finalOpens.map((o, i) => {
            const c = finalCloses[i];
            return c >= o ? posColor : negColor;
        });

        // Données pour les mèches: [low, high]
        const wickData = finalLows.map((l, i) => [l, finalHighs[i]]);
        
        // Données pour les corps: [open, close]
        // Note: Chart.js bar chart [min, max] draws from min to max.
        // To distinguish direction, we rely on color.
        const bodyData = finalOpens.map((o, i) => [Math.min(o, finalCloses[i]), Math.max(o, finalCloses[i])]);

        c.config.type = 'bar';
        c.data = {
            labels: labels,
            datasets: [
                {
                    label: 'Mèche',
                    data: wickData,
                    backgroundColor: '#ffffff', // Blanc pour la mèche
                    borderColor: '#ffffff',     // Blanc pour la mèche
                    borderWidth: 1,
                    barThickness: 1, // Très fin pour la mèche
                    grouped: false, // Permet la superposition
                    order: 2
                },
                {
                    label: 'Corps',
                    data: bodyData,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 0,
                    barPercentage: 1.0, // 100% de la largeur disponible (pas de gap)
                    categoryPercentage: 1.0, // 100% de la catégorie
                    minBarLength: 2, // Assure une visibilité minimale si Open == Close
                    grouped: false, // Permet la superposition
                    order: 1
                }
            ]
        };

        // Mise à jour des tooltips pour le mode candle
        c.options.plugins.tooltip.callbacks.title = function(ctx) {
            const i = ctx[0].dataIndex;
            return finalCloses[i].toFixed(2) + ' €';
        };
        c.options.plugins.tooltip.callbacks.label = function(ctx) {
            // On veut afficher O, H, L, C une seule fois
            if (ctx.datasetIndex === 0) return null; // Ignorer le tooltip de la mèche
            
            const i = ctx.dataIndex;
            const d = new Date(finalTimestamps[i] * 1000);
            const o = finalOpens[i];
            const h = finalHighs[i];
            const l = finalLows[i];
            const cl = finalCloses[i];
            
            return [
                d.toLocaleDateString('fr-FR'),
                d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
                '',
                `O: ${o.toFixed(2)}`,
                `H: ${h.toFixed(2)}`,
                `L: ${l.toFixed(2)}`,
                `C: ${cl.toFixed(2)}`
            ];
        };

    } else {
        // Configuration pour le chart en ligne (classique)
        const ctx = c.ctx;
        
        // Determine color based on performance
        let colorLine = getComputedStyle(document.documentElement).getPropertyValue('--color-line-default').trim() || '#a8a2ff';
        let colorGradientStart = 'rgba(168,162,255,0.3)';
        let colorGradientEnd = 'rgba(168,162,255,0)';

        if (finalPrices && finalPrices.length > 0) {
            const startPrice = finalPrices[0];
            const endPrice = finalPrices[finalPrices.length - 1];
            const isPositive = endPrice >= startPrice;
            
            // Helper to convert hex to rgba
            const hexToRgba = (hex, alpha) => {
                if (!hex || !hex.startsWith('#')) return null;
                let r = 0, g = 0, b = 0;
                if (hex.length === 4) {
                    r = parseInt(hex[1] + hex[1], 16);
                    g = parseInt(hex[2] + hex[2], 16);
                    b = parseInt(hex[3] + hex[3], 16);
                } else if (hex.length === 7) {
                    r = parseInt(hex[1] + hex[2], 16);
                    g = parseInt(hex[3] + hex[4], 16);
                    b = parseInt(hex[5] + hex[6], 16);
                }
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            if (isPositive) {
                const posColor = getComputedStyle(document.documentElement).getPropertyValue('--color-positive').trim() || '#65d981';
                colorLine = posColor;
                const rgbaStart = hexToRgba(posColor, 0.3);
                const rgbaEnd = hexToRgba(posColor, 0);
                if (rgbaStart && rgbaEnd) {
                    colorGradientStart = rgbaStart;
                    colorGradientEnd = rgbaEnd;
                } else {
                    colorGradientStart = 'rgba(101, 217, 129, 0.3)';
                    colorGradientEnd = 'rgba(101, 217, 129, 0)';
                }
            } else {
                const negColor = getComputedStyle(document.documentElement).getPropertyValue('--color-negative').trim() || '#f87171';
                colorLine = negColor;
                const rgbaStart = hexToRgba(negColor, 0.3);
                const rgbaEnd = hexToRgba(negColor, 0);
                if (rgbaStart && rgbaEnd) {
                    colorGradientStart = rgbaStart;
                    colorGradientEnd = rgbaEnd;
                } else {
                    colorGradientStart = 'rgba(248, 113, 113, 0.3)';
                    colorGradientEnd = 'rgba(248, 113, 113, 0)';
                }
            }
        } else {
            // Use default line color for empty data
            const defaultLineColor = getComputedStyle(document.documentElement).getPropertyValue('--color-line-default').trim() || '#a8a2ff';
            colorLine = defaultLineColor;
            const rgbaStart = hexToRgba(defaultLineColor, 0.3);
            const rgbaEnd = hexToRgba(defaultLineColor, 0);
            if (rgbaStart && rgbaEnd) {
                colorGradientStart = rgbaStart;
                colorGradientEnd = rgbaEnd;
            }
        }

        const g = ctx.createLinearGradient(0,0,0,200);
        g.addColorStop(0, colorGradientStart);
        g.addColorStop(1, colorGradientEnd);

        c.config.type = 'line';
        c.data = {
            labels: labels,
            datasets: [{
                label: 'Prix',
                data: finalPrices,
                borderColor: colorLine,
                backgroundColor: g,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true
            }]
        };

        // Restaurer les tooltips classiques (avec OHLC si disponible)
        c.options.plugins.tooltip.callbacks.title = function(ctx){
            return ctx[0].parsed.y.toFixed(2) + ' €'
        };
        c.options.plugins.tooltip.callbacks.label = function(ctx){
            const i = ctx.dataIndex
            const ts = finalTimestamps[i]
            const d = new Date(ts*1000)
            
            const lines = [
                d.toLocaleDateString('fr-FR'),
                d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
            ];

            if (finalOpens && finalHighs && finalLows && finalCloses) {
                lines.push('');
                lines.push(`O: ${finalOpens[i].toFixed(2)}`);
                lines.push(`H: ${finalHighs[i].toFixed(2)}`);
                lines.push(`L: ${finalLows[i].toFixed(2)}`);
                lines.push(`C: ${finalCloses[i].toFixed(2)}`);
            }

            return lines;
        };
    }

    c.data.timestamps = finalTimestamps
    c.update('none') // 'none' mode to avoid animation glitch when switching types
    
    // Reset complètement le zoom lors du changement de période
    if (c.resetZoom) {
        c.resetZoom()
    }
    
    console.log(`✅ Chart ${symbol} mis à jour avec ${c.data.labels.length} labels (Type: ${effectiveType})`)
}
