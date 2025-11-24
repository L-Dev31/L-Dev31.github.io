/**
 * SCRIPT SPÉCIFIQUE POUR NSI
 * Fonctionnalités dédiées au sujet NSI
 */

// Initialisation spécifique à NSI
document.addEventListener('DOMContentLoaded', function() {
    console.log('[NSI] Initialisation des fonctionnalités spécifiques NSI');
    
    // Coloration syntaxique pour les blocs de code
    setupCodeHighlighting();
    
    // Initialiser les tooltips pour les termes techniques
    addNSITooltips();
    
    // Gestionnaire pour les exemples interactifs
    setupInteractiveExamples();
    
    // Écouter les événements de chargement dynamique
    document.addEventListener('contentLoaded', function() {
        console.log('[NSI] Contenu dynamique chargé, application des améliorations...');
        enhanceNSIContent();
    });
});

// Configuration de la coloration syntaxique
function setupCodeHighlighting() {
    const codeBlocks = document.querySelectorAll('.code-block');
    codeBlocks.forEach(block => {
        // Ajouter une classe pour identifier le langage si nécessaire
        if (!block.classList.contains('language-identified')) {
            block.classList.add('language-python'); // Par défaut Python pour NSI
            block.classList.add('language-identified');
        }
    });
}

// Ajouter des tooltips pour les termes techniques NSI
function addNSITooltips() {
    const nsiTerms = {
        'complexité': 'Mesure de l\'efficacité d\'un algorithme en temps ou en espace',
        'récursivité': 'Technique où une fonction s\'appelle elle-même',
        'pile': 'Structure de données LIFO (Last In, First Out)',
        'file': 'Structure de données FIFO (First In, First Out)',
        'arbre binaire': 'Structure hiérarchique où chaque nœud a au maximum deux enfants',
        'POO': 'Programmation Orientée Objet - paradigme basé sur les classes et objets',
        'encapsulation': 'Principe de POO qui consiste à cacher les détails internes d\'un objet',
        'SQL': 'Structured Query Language - langage pour manipuler les bases de données',
        'TCP/IP': 'Protocole de communication réseau en couches',
        'HTTP': 'Hypertext Transfer Protocol - protocole du web',
        'API': 'Application Programming Interface - interface de programmation',
        'chiffrement': 'Technique de transformation de données pour les protéger',
        'hachage': 'Fonction qui transforme des données en empreinte de taille fixe',
        'Big O': 'Notation pour exprimer la complexité asymptotique d\'un algorithme'
    };

    // Créer les tooltips pour chaque terme trouvé dans le document
    Object.keys(nsiTerms).forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const elements = document.querySelectorAll('p, li, .concept-box, .algorithm-box');
        
        elements.forEach(element => {
            if (element.innerHTML.match(regex)) {
                element.innerHTML = element.innerHTML.replace(regex, 
                    `<span class="nsi-tooltip" title="${nsiTerms[term]}">${term}</span>`);
            }
        });
    });
}

// Améliorer tout le contenu NSI
function enhanceNSIContent() {
    setupCodeHighlighting();
    addNSITooltips();
    setupInteractiveExamples();
}

// Configuration des exemples interactifs
function setupInteractiveExamples() {
    // Ajouter des boutons "Exécuter" aux blocs de code Python
    const codeBlocks = document.querySelectorAll('.code-block.language-python');
    codeBlocks.forEach((block, index) => {
        if (block.textContent.includes('def ') || block.textContent.includes('print(')) {
            const button = document.createElement('button');
            button.textContent = '▶ Tester ce code';
            button.className = 'run-code-btn';
            button.onclick = () => showCodeExplanation(block, index);
            
            const container = document.createElement('div');
            container.className = 'code-container';
            block.parentNode.insertBefore(container, block);
            container.appendChild(block);
            container.appendChild(button);
        }
    });
}

// Afficher l'explication d'un bloc de code
function showCodeExplanation(codeBlock, index) {
    const explanation = document.createElement('div');
    explanation.className = 'code-explanation';
    explanation.innerHTML = `
        <div class="explanation-header">
            <i class="fas fa-lightbulb"></i>
            Analyse du code
        </div>
        <p>Ce code illustre un concept important de NSI. Dans un environnement réel, 
        il serait exécuté dans un interpréteur Python.</p>
        <button onclick="this.parentElement.remove()" class="close-explanation">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    codeBlock.parentNode.insertBefore(explanation, codeBlock.nextSibling);
}

// Fonctions utilitaires spécifiques à NSI
const NSIUtils = {
    formatComplexity: function(complexity) {
        const complexityColors = {
            'O(1)': '#4caf50',
            'O(log n)': '#8bc34a', 
            'O(n)': '#ffc107',
            'O(n log n)': '#ff9800',
            'O(n²)': '#f44336',
            'O(2^n)': '#9c27b0'
        };
        
        return `<span class="complexity-badge" style="background-color: ${complexityColors[complexity] || '#757575'}">${complexity}</span>`;
    },

    addCodeLineNumbers: function(codeElement) {
        const lines = codeElement.textContent.split('\n');
        const numberedLines = lines.map((line, index) => 
            `<span class="line-number">${index + 1}</span>${line}`
        ).join('\n');
        
        codeElement.innerHTML = numberedLines;
        codeElement.classList.add('with-line-numbers');
    },

    highlightSyntax: function(code, language = 'python') {
        // Coloration syntaxique basique pour Python
        if (language === 'python') {
            return code
                .replace(/\b(def|class|if|else|elif|for|while|return|import|from|try|except|with|as)\b/g, 
                    '<span class="keyword">$1</span>')
                .replace(/\b(True|False|None)\b/g, 
                    '<span class="boolean">$1</span>')
                .replace(/#.*/g, 
                    '<span class="comment">$&</span>')
                .replace(/".*?"/g, 
                    '<span class="string">$&</span>')
                .replace(/\b\d+\b/g, 
                    '<span class="number">$&</span>');
        }
        return code;
    }
};

// Gestionnaire pour l'impression
window.addEventListener('beforeprint', function() {
    // Optimiser l'affichage pour l'impression
    document.querySelectorAll('.code-explanation').forEach(el => el.remove());
    document.querySelectorAll('.run-code-btn').forEach(el => el.style.display = 'none');
    
    // S'assurer que les page breaks sont respectés
    document.querySelectorAll('.page-break').forEach(pageBreak => {
        pageBreak.style.display = 'block';
        pageBreak.style.pageBreakBefore = 'always';
        pageBreak.style.breakBefore = 'page';
        pageBreak.style.height = '0';
        pageBreak.style.visibility = 'hidden';
    });
});

window.addEventListener('afterprint', function() {
    // Restaurer l'affichage normal après impression
    document.querySelectorAll('.run-code-btn').forEach(el => el.style.display = 'inline-block');
});

// Export pour utilisation dans d'autres scripts
window.NSIUtils = NSIUtils;
