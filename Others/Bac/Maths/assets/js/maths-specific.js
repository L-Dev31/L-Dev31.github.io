/**
 * SCRIPT SPÉCIFIQUE POUR MATHÉMATIQUES
 * Fonctionnalités dédiées au sujet Math
 */

// Initialisation spécifique à Math
document.addEventListener('DOMContentLoaded', function() {
    console.log('[MATHS] Initialisation des fonctionnalités spécifiques Math');
    
    // Initialiser MathJax après le chargement du contenu dynamique
    if (window.MathJax) {
        // Fonction pour reprocesser les formules MathJax après chargement dynamique
        window.reprocessMathJax = function() {
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise().catch(function (err) {
                    console.error('[MATHS] Erreur MathJax:', err);
                });
            }
        };
    }
    
    // Fonction pour améliorer l'affichage des formules
    setupMathFormulas();
    
    // Écouter les événements de chargement dynamique
    document.addEventListener('contentLoaded', function() {
        console.log('[MATHS] Contenu dynamique chargé, reprocessing MathJax...');
        if (window.reprocessMathJax) {
            setTimeout(window.reprocessMathJax, 100);
        }
        // Nettoyer les erreurs LaTeX après rechargement
        if (window.cleanLatexErrors) {
            setTimeout(window.cleanLatexErrors, 200);
        }
    });
    
    // Nettoyage périodique des erreurs LaTeX pour les maths
    setInterval(function() {
        if (window.cleanLatexErrors) {
            window.cleanLatexErrors();
        }
    }, 5000);
});

// Configuration spécifique des formules mathématiques
function setupMathFormulas() {
    // Ajouter des classes CSS spécifiques aux formules
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        // Rechercher les formules MathJax
                        const mathElements = node.querySelectorAll('.MathJax');
                        mathElements.forEach(function(element) {
                            element.classList.add('math-formula');
                        });
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Fonctions utilitaires spécifiques aux mathématiques
const MathUtils = {
    // Formater les durées pour les vidéos math
    formatDuration: function(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    // Détecter les formules dans le texte
    containsFormula: function(text) {
        return text.includes('$') || text.includes('\\(') || text.includes('\\[');
    },
    
    // Améliorer l'affichage des difficultés pour les math
    getDifficultyColor: function(difficulty) {
        const colors = {
            'facile': '#4CAF50',
            'moyen': '#FF9800', 
            'difficile': '#F44336',
            'expert': '#9C27B0'
        };
        return colors[difficulty] || '#757575';
    }
};

// Export pour utilisation dans d'autres scripts
window.MathUtils = MathUtils;
