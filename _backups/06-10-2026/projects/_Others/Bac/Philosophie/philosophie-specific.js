/**
 * SCRIPT SPÉCIFIQUE POUR PHILOSOPHIE
 * Fonctionnalités dédiées au sujet Philosophie
 */

// Initialisation spécifique à Philosophie
document.addEventListener('DOMContentLoaded', function() {
    console.log('[PHILO] Initialisation des fonctionnalités spécifiques Philosophie');
    
    // Améliorer l'affichage des notions philosophiques
    setupPhilosophyFeatures();
    
    // Écouter les événements de chargement dynamique
    document.addEventListener('contentLoaded', function() {
        console.log('[PHILO] Contenu dynamique chargé, application des améliorations...');
        enhancePhilosophyContent();
    });
});

// Configuration spécifique aux notions philosophiques
function setupPhilosophyFeatures() {
    // Ajouter des fonctionnalités spécifiques à la philosophie
    document.body.classList.add('philosophy-mode');
    
    // Observer les changements de contenu pour les notions
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        enhancePhilosophyElements(node);
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

// Améliorer les éléments spécifiques à la philosophie
function enhancePhilosophyElements(container) {
    // Améliorer les citations
    const quotes = container.querySelectorAll('.quote, .citation');
    quotes.forEach(function(quote) {
        quote.classList.add('philosophy-quote');
        
        // Ajouter des guillemets décoratifs
        if (!quote.querySelector('.quote-decoration')) {
            const decoration = document.createElement('span');
            decoration.className = 'quote-decoration';
            decoration.innerHTML = '❝';
            quote.insertBefore(decoration, quote.firstChild);
        }
    });
    
    // Améliorer les concepts clés
    const concepts = container.querySelectorAll('.concept, .notion-key');
    concepts.forEach(function(concept) {
        concept.classList.add('philosophy-concept');
    });
}

// Améliorer tout le contenu de philosophie
function enhancePhilosophyContent() {
    enhancePhilosophyElements(document);
    
    // Ajouter des tooltips pour les termes philosophiques
    addPhilosophyTooltips();
}

// Ajouter des tooltips pour les termes philosophiques courants
function addPhilosophyTooltips() {
    const philosophyTerms = {
        'dialectique': 'Méthode de raisonnement qui procède par contradiction et dépassement',
        'phénoménologie': 'Étude des phénomènes de conscience et de leur structure',
        'empirisme': 'Doctrine qui fonde la connaissance sur l\'expérience sensible',
        'rationalisme': 'Doctrine qui accorde la primauté à la raison dans la connaissance',
        'métaphysique': 'Partie de la philosophie qui étudie les principes premiers de la réalité',
        'épistémologie': 'Étude critique des sciences et de la connaissance scientifique',
        'ontologie': 'Partie de la métaphysique qui s\'interroge sur l\'être en tant qu\'être',
        'herméneutique': 'Art et science de l\'interprétation des textes',
        'maïeutique': 'Méthode socratique qui consiste à faire découvrir la vérité par questionnement',
        'catharsis': 'Purification des passions par l\'art, notamment la tragédie'
    };
    
    // Ajouter les tooltips
    Object.keys(philosophyTerms).forEach(function(term) {
        const regex = new RegExp('\\b' + term + '\\b', 'gi');
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        textNodes.forEach(function(textNode) {
            if (regex.test(textNode.textContent)) {
                const parent = textNode.parentNode;
                const newHTML = textNode.textContent.replace(regex, function(match) {
                    return `<span class="philosophy-term" title="${philosophyTerms[term.toLowerCase()]}">${match}</span>`;
                });
                
                if (newHTML !== textNode.textContent) {
                    const wrapper = document.createElement('span');
                    wrapper.innerHTML = newHTML;
                    parent.replaceChild(wrapper, textNode);
                }
            }
        });
    });
}

// Fonctions utilitaires spécifiques à la philosophie
const PhilosophyUtils = {
    // Formater les auteurs
    formatAuthor: function(author) {
        return author.charAt(0).toUpperCase() + author.slice(1);
    },
    
    // Détecter les citations
    isQuote: function(text) {
        return text.includes('"') || text.includes('«') || text.includes('❝');
    },
    
    // Améliorer l'affichage des difficultés pour la philosophie
    getDifficultyColor: function(difficulty) {
        const colors = {
            'initiation': '#4CAF50',
            'apprentissage': '#2196F3',
            'maîtrise': '#FF9800', 
            'expertise': '#F44336'
        };
        return colors[difficulty] || '#757575';
    },
    
    // Analyser la complexité d'un texte philosophique
    analyzeComplexity: function(text) {
        const complexWords = ['dialectique', 'phénoménologie', 'épistémologie', 'herméneutique', 'ontologie'];
        const complexity = complexWords.filter(word => 
            text.toLowerCase().includes(word)
        ).length;
        
        if (complexity >= 3) return 'expertise';
        if (complexity >= 2) return 'maîtrise';
        if (complexity >= 1) return 'apprentissage';
        return 'initiation';
    }
};

// Export pour utilisation dans d'autres scripts
window.PhilosophyUtils = PhilosophyUtils;
