
const SIGNAL_HISTORY = [];

const DEFAULT_OPTIONS = {
    accountCapital: 10000,
    accountRisk: 0.02,
    maxPosition: 0.2,
    slMult: 1.5,
    tpMult: 2.5,
    transactionCost: 0.0015,
    minLength: 30,
    weights: { rsi: 0.20, macd: 0.25, sma: 0.30, momentum: 0.15, volume: 0.10 }
};

// --- Utilitaires ---

const safeArray = (arr) => Array.isArray(arr) ? arr : [];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function validateData(data, opts = {}) {
    const prices = safeArray(data?.prices);
    return prices.length >= Math.max(30, opts.minLength || 30) && prices.every(x => x > 0);
}

// --- Indicateurs Techniques (Explicites) ---

/**
 * Relative Strength Index (RSI)
 * Mesure la vitesse et le changement des mouvements de prix.
 * @returns {number} 0-100
 */
function calculateRSI(prices, period = 14) {
    const p = safeArray(prices);
    if (p.length < period + 1) return 50;

    let gain = 0, loss = 0;
    // Première moyenne
    for (let i = 1; i <= period; i++) {
        const diff = p[i] - p[i - 1];
        if (diff > 0) gain += diff;
        else loss -= diff;
    }
    gain /= period;
    loss /= period;

    // Lissage exponentiel
    for (let i = period + 1; i < p.length; i++) {
        const diff = p[i] - p[i - 1];
        gain = (gain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        loss = (loss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }

    const rs = loss === 0 ? 100 : gain / loss;
    return 100 - (100 / (1 + rs));
}

/**
 * Moyenne Mobile Exponentielle (EMA)
 * Donne plus de poids aux prix récents.
 */
function calculateEMA(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;

    const k = 2 / (period + 1);
    // Initialisation avec SMA
    let ema = p.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < p.length; i++) {
        ema = p[i] * k + ema * (1 - k);
    }
    return ema;
}

/**
 * Moyenne Mobile Simple (SMA)
 */
function calculateSMA(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;
    return p.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * Indicateur de tendance et de momentum.
 */
function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    const p = safeArray(prices);
    if (p.length < slow) return { line: 0, signal: 0, hist: 0, series: [] };

    const kFast = 2 / (fast + 1);
    const kSlow = 2 / (slow + 1);

    // Initialisation
    let emaFast = p.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
    let emaSlow = p.slice(0, slow).reduce((a, b) => a + b, 0) / slow;

    const macdLineSeries = [];

    for (let i = 1; i < p.length; i++) {
        // Mise à jour des EMAs à chaque pas (approximation simplifiée pour la boucle)
        // Note: Pour être précis, il faudrait recalculer depuis le début, mais ici on simule le flux
        // Correction: On applique la formule EMA standard sur toute la série
        // Pour simplifier la lecture, on utilise une logique itérative simple ici
        // (La version précédente était correcte mathématiquement, on la garde lisible)
        
        // Recalcul propre pour l'itération courante si on avait l'historique complet des EMAs
        // Ici on simplifie en supposant que emaFast/Slow sont mis à jour
        if (i >= fast) emaFast = p[i] * kFast + emaFast * (1 - kFast);
        else emaFast = (emaFast * i + p[i]) / (i + 1); // SMA progressive au début

        if (i >= slow) emaSlow = p[i] * kSlow + emaSlow * (1 - kSlow);
        else emaSlow = (emaSlow * i + p[i]) / (i + 1);

        if (i >= slow - 1) {
            macdLineSeries.push(emaFast - emaSlow);
        }
    }

    const currentLine = macdLineSeries[macdLineSeries.length - 1] || 0;
    const currentSignal = calculateEMA(macdLineSeries, signal); // Signal est l'EMA de la ligne MACD

    return {
        line: currentLine,
        signal: currentSignal,
        hist: currentLine - currentSignal,
        series: macdLineSeries
    };
}

/**
 * Average True Range (ATR)
 * Mesure la volatilité.
 */
function calculateATR(highs, lows, closes, period = 14) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    
    if (n < 2) return 0;

    const trueRanges = [];
    for (let i = 1; i < n; i++) {
        const hl = h[i] - l[i];
        const hc = Math.abs(h[i] - c[i - 1]);
        const lc = Math.abs(l[i] - c[i - 1]);
        trueRanges.push(Math.max(hl, hc, lc));
    }

    if (trueRanges.length < period) return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;

    // Wilder's Smoothing
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    return atr;
}

/**
 * Momentum
 * Différence de prix sur N périodes.
 */
function calculateMomentum(prices, period = 10) {
    const p = safeArray(prices);
    if (p.length < period + 1) return 0;
    const current = p[p.length - 1];
    const prev = p[p.length - period - 1];
    return prev === 0 ? 0 : ((current - prev) / prev) * 100;
}

// --- Logique du Bot ---

function calculateBotSignal(data, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };

    // 1. Validation des données
    if (!validateData(data, options)) {
        return {
            signalValue: 50,
            signalTitle: 'Données insuffisantes',
            signalDesc: 'Analyse impossible',
            explanation: 'Attendre plus d\'historique de marché ou choisir une période plus grande.',
            details: {},
            isInsufficient: true
        };
    }

    // 2. Extraction des séries
    const prices = safeArray(data.prices);
    const highs = safeArray(data.highs || prices);
    const lows = safeArray(data.lows || prices);
    const volumes = safeArray(data.volumes);
    const currentPrice = prices[prices.length - 1];

    // 3. Calcul des indicateurs
    const rsiVal = calculateRSI(prices, 14);
    const macdVal = calculateMACD(prices);
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const sma200 = calculateSMA(prices, 200);
    const momVal = calculateMomentum(prices, 10);
    const atrVal = calculateATR(highs, lows, prices, 14);

    // 3b. Analyse du Risque (Shitcoin Detector - Échelle 1 à 10)
    const volatilityPct = (atrVal / currentPrice) * 100;
    let riskLevel = '';
    let riskDesc = '';
    let riskScore = 1;

    if (currentPrice < 0.001 || volatilityPct > 20) {
        riskScore = 10; riskLevel = 'Extrême ☠️'; riskDesc = 'Shitcoin / Danger Mortel';
    } else if (currentPrice < 0.01 || volatilityPct > 15) {
        riskScore = 9; riskLevel = 'Critique ⚠️'; riskDesc = 'Ultra Spéculatif';
    } else if (currentPrice < 0.1 || volatilityPct > 10) {
        riskScore = 8; riskLevel = 'Très Élevé'; riskDesc = 'Penny Stock / Volatil';
    } else if (volatilityPct > 7) {
        riskScore = 7; riskLevel = 'Élevé'; riskDesc = 'Forte Volatilité';
    } else if (volatilityPct > 5) {
        riskScore = 6; riskLevel = 'Soutenu'; riskDesc = 'Mouvements Brusques';
    } else if (volatilityPct > 3.5) {
        riskScore = 5; riskLevel = 'Moyen'; riskDesc = 'Volatilité Standard Crypto';
    } else if (volatilityPct > 2) {
        riskScore = 4; riskLevel = 'Modéré'; riskDesc = 'Standard Bourse';
    } else if (volatilityPct > 1) {
        riskScore = 3; riskLevel = 'Faible'; riskDesc = 'Stable';
    } else if (volatilityPct > 0.5) {
        riskScore = 2; riskLevel = 'Très Faible'; riskDesc = 'Très Stable';
    } else {
        riskScore = 1; riskLevel = 'Nul'; riskDesc = 'Quasi-Immobile';
    }

    // 4. Calcul du Score Composite (-1 à 1)
    
    // Score RSI (Inverse: <30 est haussier, >70 est baissier)
    let rsiScore = 0;
    if (rsiVal < 30) rsiScore = 1;       // Survente -> Achat
    else if (rsiVal > 70) rsiScore = -1; // Surachat -> Vente
    else rsiScore = -((rsiVal - 50) / 20); // Linéaire entre les deux

    // Score MACD (Histogramme positif = haussier)
    const macdScore = Math.max(-1, Math.min(1, macdVal.hist / (currentPrice * 0.005))); // Normalisé approximativement

    // Score Tendance (SMA)
    let trendScore = 0;
    if (currentPrice > sma20) trendScore += 0.5; else trendScore -= 0.5;
    if (currentPrice > sma50) trendScore += 0.3; else trendScore -= 0.3;
    if (currentPrice > sma200) trendScore += 0.2; else trendScore -= 0.2;

    // Score Momentum
    const momScore = Math.max(-1, Math.min(1, momVal / 5));

    // Pondération finale
    const w = options.weights;
    let totalScore = (
        rsiScore * w.rsi +
        macdScore * w.macd +
        trendScore * w.sma +
        momScore * w.momentum
    );

    // Intégration du Risque dans le Score Global
    // Si le risque est élevé (>4), on pénalise le score
    if (riskScore > 4) {
        const penalty = (riskScore - 4) * 0.15; // Pénalité forte pour les shitcoins
        totalScore -= penalty;
    }

    // Limiter entre -1 et 1
    totalScore = Math.max(-1, Math.min(1, totalScore));

    // 5. Conversion en Signal (0-100)
    // 0 = Vente Forte, 50 = Neutre, 100 = Achat Fort
    const signalValue = Math.round(50 + (totalScore * 50));

    // 6. Interprétation textuelle
    let title = 'Garder';
    let desc = 'Neutre';
    
    if (signalValue >= 80) { title = 'Acheter'; desc = 'Achat fort'; }
    else if (signalValue >= 60) { title = 'Acheter'; desc = 'Achat modéré'; }
    else if (signalValue <= 20) { title = 'Vendre'; desc = 'Vente forte'; }
    else if (signalValue <= 40) { title = 'Vendre'; desc = 'Vente modérée'; }

    // 7. Gestion des Stops (Risk Management)
    const slDist = atrVal * options.slMult;
    const tpDist = atrVal * options.tpMult;
    const stopLoss = currentPrice - (totalScore > 0 ? slDist : -slDist); // Si achat, SL plus bas. Si vente, SL plus haut.
    const takeProfit = currentPrice + (totalScore > 0 ? tpDist : -tpDist);

    return {
        symbol: data.symbol,
        period: options.period,
        signalValue: signalValue,
        signalTitle: title,
        signalDesc: desc,
        risk: { level: riskLevel, desc: riskDesc, score: riskScore, volatility: volatilityPct },
        explanation: {
            rsi: rsiVal,
            macdHistogram: macdVal.hist,
            sma20, sma50, sma200,
            momentum: momVal,
            atr: atrVal,
            weightedScore: totalScore,
            stopLoss,
            takeProfit,
            currentPrice,
            rsiScore,
            macdScore,
            trendScore,
            momScore
        },
        details: {
            rsi: rsiVal.toFixed(2),
            macd: macdVal.hist.toFixed(4),
            sma20: sma20.toFixed(2),
            momentum: momVal.toFixed(2) + '%',
            score: totalScore.toFixed(2)
        }
    };
}

// --- Fonctions UI et Export ---

function updateSignalUI(symbol, result) {
    const card = document.getElementById(`card-${symbol}`);
    if (!card) return;

    const cursor = document.getElementById(`signal-cursor-${symbol}`);
    const valueEl = document.getElementById(`signal-value-${symbol}`);
    const descEl = document.getElementById(`signal-description-${symbol}`);
    const bar = card.querySelector('.signal-bar');
    const explanationContainer = card.querySelector('.signal-explanation');
    const explanationContent = card.querySelector('.explanation-content');
    const stateContainer = card.querySelector('.signal-state-container');

    if (cursor) cursor.style.left = `${result.signalValue}%`;
    
    if (valueEl) {
        // Formatage de la période pour l'affichage
        const periodMap = {
            '1D': 'sur 1 jour',
            '1W': 'sur 1 semaine',
            '1M': 'sur 1 mois',
            '3M': 'sur 3 mois',
            '6M': 'sur 6 mois',
            '1Y': 'sur 1 an',
            '3Y': 'sur 3 ans',
            '5Y': 'sur 5 ans',
            'YTD': 'depuis le début de l\'année',
            'MAX': 'sur le long terme'
        };
        const periodText = periodMap[result.period] || '';
        
        valueEl.textContent = result.signalTitle + (periodText ? ` ${periodText}` : '');
        
        // Couleur dynamique
        if (result.isInsufficient) valueEl.style.color = '#6b7280';
        else if (result.signalValue >= 60) valueEl.style.color = '#4ade80'; // Vert
        else if (result.signalValue <= 40) valueEl.style.color = '#f87171'; // Rouge
        else valueEl.style.color = '#fbbf24'; // Jaune
    }

    if (stateContainer) {
        stateContainer.classList.remove('buy-state', 'sell-state', 'closed-state');
        if (result.isInsufficient) stateContainer.classList.add('closed-state');
        else if (result.signalValue >= 60) stateContainer.classList.add('buy-state');
        else if (result.signalValue <= 40) stateContainer.classList.add('sell-state');
    }

    if (descEl) {
        descEl.textContent = result.signalDesc;
    }
    
    // Animation simple
    if (cursor) {
        cursor.classList.remove('animated');
        void cursor.offsetWidth; // Trigger reflow
        cursor.classList.add('animated');
    }

    // Afficher l'explication détaillée
    if (explanationContainer && explanationContent) {
        explanationContainer.classList.remove('hidden-by-bot');
        
        // Cas où les données sont insuffisantes
        if (result.isInsufficient) {
             const html = `
                <div class="signal-state-description" style="margin-top: 10px; text-align: center;">
                    ${result.explanation}
                </div>
            `;
            explanationContent.innerHTML = html;
            return;
        }

        const e = result.explanation;
        const price = e.currentPrice;
        
        // Helper pour couleur
        const colorClass = (val, isBullish) => {
            if (isBullish) return val > 0 ? 'positive' : (val < 0 ? 'negative' : 'neutral');
            return val > 0 ? 'negative' : (val < 0 ? 'positive' : 'neutral');
        };

        // Interprétation RSI
        let rsiText = 'Neutre';
        let rsiClass = 'neutral';
        if (e.rsi < 30) { rsiText = 'Survente (Opportunité d\'achat)'; rsiClass = 'positive'; }
        else if (e.rsi > 70) { rsiText = 'Surachat (Risque de baisse)'; rsiClass = 'negative'; }

        // Interprétation MACD
        let macdText = 'Neutre';
        let macdClass = 'neutral';
        if (e.macdHistogram > 0) { macdText = 'Haussier (Momentum positif)'; macdClass = 'positive'; }
        else { macdText = 'Baissier (Momentum négatif)'; macdClass = 'negative'; }

        // Interprétation Tendance
        let trendText = 'Neutre';
        let trendClass = 'neutral';
        if (price > e.sma200) {
            if (price > e.sma50) { trendText = 'Haussière forte'; trendClass = 'positive'; }
            else { trendText = 'Correction dans tendance haussière'; trendClass = 'warning'; }
        } else {
            if (price < e.sma50) { trendText = 'Baissière forte'; trendClass = 'negative'; }
            else { trendText = 'Rebond dans tendance baissière'; trendClass = 'warning'; }
        }

        // Déterminer la couleur des en-têtes en fonction du signal
        let headerColor = '#fbbf24'; // Jaune (Garder/Neutre) par défaut
        if (result.signalValue >= 60) headerColor = '#4ade80'; // Vert (Achat)
        else if (result.signalValue <= 40) headerColor = '#f87171'; // Rouge (Vente)

        // Logique d'Horizon dynamique
        let horizonLabel = 'Moyen Terme';
        let horizonDesc = 'Swing Trading (Semaines)';
        const p = result.period;
        
        const horizonMap = {
            '1D': { label: 'Court Terme', desc: 'Intraday (24h)' },
            '1W': { label: 'Court Terme', desc: 'Swing (1 Semaine)' },
            '1M': { label: 'Moyen Terme', desc: 'Swing (1 Mois)' },
            '3M': { label: 'Moyen Terme', desc: 'Tendance (3 Mois)' },
            '6M': { label: 'Moyen/Long Terme', desc: 'Tendance (6 Mois)' },
            '1Y': { label: 'Long Terme', desc: 'Investissement (1 An)' },
            '3Y': { label: 'Long Terme', desc: 'Investissement (3 Ans)' },
            '5Y': { label: 'Long Terme', desc: 'Investissement (5 Ans)' },
            'YTD': { label: 'Année en cours', desc: 'Depuis le 1er Janvier' },
            'MAX': { label: 'Très Long Terme', desc: 'Historique Complet' }
        };

        if (horizonMap[p]) {
            horizonLabel = horizonMap[p].label;
            horizonDesc = horizonMap[p].desc;
        }

        // Helper pour la couleur du risque (1-10)
        const getRiskColorClass = (s) => {
            if (s >= 9) return 'negative'; // Rouge vif (Critique/Extrême)
            if (s >= 7) return 'negative'; // Rouge (Élevé)
            if (s >= 4) return 'warning';  // Orange/Jaune (Moyen/Modéré)
            return 'positive';             // Vert (Faible)
        };

        const html = `
            <div class="transaction-history-container" style="margin: 0;">
                <table class="transaction-history-table">
                    <thead>
                        <tr>
                            <th style="color: ${headerColor} !important;">Indicateur</th>
                            <th style="color: ${headerColor} !important;">Valeur</th>
                            <th style="color: ${headerColor} !important;">Interprétation</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>RSI (14)</td>
                            <td class="${rsiClass}">${e.rsi.toFixed(1)}</td>
                            <td>${rsiText}</td>
                        </tr>
                        <tr>
                            <td>MACD</td>
                            <td class="${macdClass}">${e.macdHistogram.toFixed(4)}</td>
                            <td>${macdText}</td>
                        </tr>
                        <tr>
                            <td>Tendance</td>
                            <td class="${trendClass}">${trendText}</td>
                            <td>vs SMA200 (${e.sma200.toFixed(2)})</td>
                        </tr>
                        <tr>
                            <td>Momentum</td>
                            <td class="${e.momentum > 0 ? 'positive' : 'negative'}">${e.momentum.toFixed(2)}%</td>
                            <td>Variation récente</td>
                        </tr>
                        <tr>
                            <td>Horizon</td>
                            <td class="neutral">${horizonLabel}</td>
                            <td>${horizonDesc}</td>
                        </tr>
                        <tr>
                            <td>Risque</td>
                            <td class="${getRiskColorClass(result.risk.score)}">${result.risk.level} (${result.risk.score}/10)</td>
                            <td>${result.risk.desc}</td>
                        </tr>
                        <tr>
                            <td>Stop Loss</td>
                            <td class="negative">${e.stopLoss.toFixed(2)} €</td>
                            <td>Seuil de protection</td>
                        </tr>
                        <tr>
                            <td>Take Profit</td>
                            <td class="positive">${e.takeProfit.toFixed(2)} €</td>
                            <td>Objectif de gain</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="risk-note" style="margin-top: 8px; font-size: 10px; color: #6b7280; text-align: right; font-style: italic;">
                Calculé sur la volatilité (ATR: ${e.atr.toFixed(2)})
            </div>
        `;
        
        explanationContent.innerHTML = html;
    }
}

function updateSignal(symbol, data, options = {}) {
    // Vérification basique si suspendu
    const volume = data?.volumes?.[data.volumes.length - 1] || data?.volume || 0;
    const change = data?.changePercent || 0;
    
    // Si pas de volume et pas de changement sur une longue période, c'est probablement suspendu
    // (Logique simplifiée ici, gérée plus finement ailleurs)
    
    const result = calculateBotSignal({ ...data, symbol }, options);
    updateSignalUI(symbol, result);
    return result;
}

// Export pour utilisation dans d'autres modules
export { 
    calculateBotSignal, 
    updateSignal, 
    updateSignalUI,
    calculateRSI,
    calculateSMA,
    calculateEMA,
    calculateMACD
};

// Exposition globale pour les scripts non-modules (comme explorer.js)
window.SignalBot = {
    calculateBotSignal,
    updateSignal,
    updateSignalUI
};
