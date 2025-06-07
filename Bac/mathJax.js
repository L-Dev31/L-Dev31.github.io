// Configuration MathJax standardisée pour tout le site
// Ce fichier assure une configuration cohérente pour toutes les pages

window.MathJax = {
    tex: {
        // Utiliser uniquement les délimiteurs $...$ pour les formules inline
        inlineMath: [['$', '$']],
        // Pas de formules display (centrées) - tableau vide
        displayMath: [],
        // Packages LaTeX disponibles
        packages: {'[+]': ['ams', 'base', 'color']},
        // Macros personnalisées pour des raccourcis LaTeX
        macros: {
            // Fraction en taille normale (pas réduite)
            frac: ["\\dfrac{#1}{#2}", 2],
            // Vecteurs avec flèche
            vec: ["\\overrightarrow{#1}", 1],
            // Ensemble des réels, entiers, etc.
            R: "\\mathbb{R}",
            N: "\\mathbb{N}",
            Z: "\\mathbb{Z}",
            Q: "\\mathbb{Q}",
            C: "\\mathbb{C}"
        },
        // Configuration avancée
        tags: 'none',  // Pas de numérotation automatique des équations
        processEscapes: true,  // Traiter les caractères d'échappement
        processEnvironments: true
    },
    // Configuration du rendu SVG (meilleure qualité)
    svg: {
        fontCache: 'global',
        displayAlign: 'left',  // Alignement à gauche pour le inline
        displayIndent: '0em'   // Pas d'indentation
    },
    // Configuration du rendu HTML+CSS (fallback)
    chtml: {
        displayAlign: 'left',
        displayIndent: '0em'
    },
    // Options générales
    options: {
        // Ignorer les erreurs de syntaxe LaTeX au lieu de planter
        ignoreHtmlClass: 'tex2jax_ignore',
        processHtmlClass: 'tex2jax_process',
        renderActions: {
            // Action personnalisée pour forcer l'affichage inline
            forceInline: [200, function() {
                // Force tous les éléments MathJax à s'afficher inline
                const displays = document.querySelectorAll('.MathJax_Display, .mjx-display');
                displays.forEach(function(element) {
                    element.style.display = 'inline';
                    element.style.textAlign = 'inherit';
                    element.style.margin = '0';
                    element.style.padding = '0 0.2em';
                });
            }, function() {}]
        }
    },
    // Configuration du chargement
    loader: {
        load: ['[tex]/ams', '[tex]/color']
    },
    // Configuration startup
    startup: {
        ready: function() {
            MathJax.startup.defaultReady();
            
            // CSS additionnels pour forcer l'affichage inline
            const style = document.createElement('style');
            style.textContent = `
                /* Force tous les éléments MathJax à s'afficher inline */
                .MathJax_Display,
                .mjx-display {
                    display: inline !important;
                    text-align: inherit !important;
                    margin: 0 !important;
                    padding: 0 0.2em !important;
                }
                
                /* Assure que les containers MathJax ne prennent pas toute la largeur */
                .MathJax,
                .mjx-container {
                    display: inline !important;
                    margin: 0 !important;
                }
                
                /* Style pour les formules dans le texte */
                .mjx-math {
                    display: inline !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
};

// Charger MathJax automatiquement
(function() {
    var script = document.createElement('script');
    script.id = 'MathJax-script';
    script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    document.head.appendChild(script);
})();

// Fonction utilitaire pour retraiter MathJax après des modifications dynamiques
function retypeMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().then(function() {
            // Force l'affichage inline après le retraitement
            const displays = document.querySelectorAll('.MathJax_Display, .mjx-display');
            displays.forEach(function(element) {
                element.style.display = 'inline';
                element.style.textAlign = 'inherit';
                element.style.margin = '0';
                element.style.padding = '0 0.2em';
            });
        });
    }
}

// Export de la fonction pour usage global
window.retypeMathJax = retypeMathJax;

// Configuration pour l'impression (optionnel)
window.addEventListener('beforeprint', function() {
    // Ajustements spécifiques pour l'impression si nécessaire
    document.querySelectorAll('.mjx-display').forEach(function(element) {
        element.style.display = 'inline';
    });
});
