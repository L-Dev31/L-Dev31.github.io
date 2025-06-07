/**
 * Script d'amélioration des styles pour les notions de philosophie
 * Permet de structurer et formater automatiquement le contenu
 * Sans utiliser de couleurs ou d'ombres
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Enhanced Styles for Philosophy - Loading...');
    enhancePhilosophyContent();
});

/**
 * Fonction principale qui améliore tous les éléments de contenu
 */
function enhancePhilosophyContent() {
    // Structurer les définitions
    enhanceDefinitions();
    
    // Formater les citations
    enhanceCitations();
    
    // Identifier et formater les concepts clés
    enhanceKeyConcepts();
    
    // Transformer les listes de comparaison en tableaux
    transformComparisonLists();
    
    // Ajouter des sauts de page stratégiques
    addStrategicPageBreaks();
    
    console.log('Enhanced Styles for Philosophy - Complete');
}

/**
 * Améliore les définitions en les encapsulant dans des éléments spécifiques
 */
function enhanceDefinitions() {
    // Chercher les paragraphes contenant des définitions
    const paragraphs = document.querySelectorAll('p');
    
    paragraphs.forEach(paragraph => {
        const text = paragraph.textContent.trim();
        
        // Détecter les définitions par leurs caractéristiques textuelles
        if ((text.includes('Définition :') || text.includes(' : ')) && 
            (text.includes('est ') || text.includes('sont '))) {
            
            // Ne pas transformer si déjà dans un conteneur spécial
            if (!paragraph.closest('.definition') && 
                !paragraph.closest('.citation') && 
                !paragraph.closest('.key-concept')) {
                
                const wrapper = document.createElement('div');
                wrapper.className = 'definition';
                paragraph.parentNode.insertBefore(wrapper, paragraph);
                wrapper.appendChild(paragraph);
            }
        }
    });
}

/**
 * Améliore les citations en les encapsulant dans des éléments spécifiques
 */
function enhanceCitations() {
    // Chercher les paragraphes contenant des citations
    const paragraphs = document.querySelectorAll('p');
    
    paragraphs.forEach(paragraph => {
        // Détecter les citations par la présence de guillemets français ou anglais
        if ((paragraph.textContent.includes('«') && paragraph.textContent.includes('»')) ||
            (paragraph.textContent.includes('"') && paragraph.textContent.match(/"/g)?.length >= 2)) {
            
            // Ne pas transformer si déjà dans un conteneur spécial
            if (!paragraph.closest('.definition') && 
                !paragraph.closest('.citation') && 
                !paragraph.closest('.key-concept')) {
                
                const wrapper = document.createElement('div');
                wrapper.className = 'citation';
                paragraph.parentNode.insertBefore(wrapper, paragraph);
                wrapper.appendChild(paragraph);
            }
        }
    });
}

/**
 * Améliore les concepts clés en les encapsulant dans des éléments spécifiques
 */
function enhanceKeyConcepts() {
    // Chercher les éléments qui contiennent des concepts clés
    const elements = document.querySelectorAll('p strong, li strong, li b');
    
    elements.forEach(element => {
        // Vérifier que l'élément n'est pas déjà transformé
        if (!element.closest('.key-concept') &&
            !element.closest('.definition') &&
            !element.closest('.citation') &&
            element.textContent.length > 3) {
            
            // Trouver le paragraphe ou l'élément de liste parent
            const parent = element.closest('p') || element.closest('li');
            
            // Si cet élément commence par un terme en gras, c'est probablement un concept clé
            if (parent && 
                (parent.firstChild === element || 
                (parent.firstChild.nodeType === 3 && parent.firstChild.textContent.trim() === '' && 
                 parent.childNodes[1] === element))) {
                
                parent.classList.add('key-concept-container');
                
                // Ajouter l'élément titre du concept seulement si non déjà présent
                if (!parent.querySelector('.key-concept-title')) {
                    // Créer un span pour le titre du concept
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'key-concept-title';
                    
                    // Déplacer l'élément fort dans le span
                    const clone = element.cloneNode(true);
                    titleSpan.appendChild(clone);
                    
                    // Remplacer l'élément original
                    parent.insertBefore(titleSpan, element);
                    parent.removeChild(element);
                }
            }
        }
    });
}

/**
 * Transforme les listes de comparaison en tableaux pour une meilleure visualisation
 */
function transformComparisonLists() {
    // Chercher les listes qui contiennent des comparaisons
    const lists = document.querySelectorAll('ul');
    
    lists.forEach(list => {
        const items = list.querySelectorAll('li');
        let isComparisonList = true;
        
        // Vérifier si c'est une liste de comparaison
        if (items.length >= 2) {
            let hasPropertyPattern = 0;
            
            items.forEach(item => {
                if (item.textContent.includes(':') && 
                   (item.textContent.includes('Propriété') || 
                    item.textContent.includes('Caractéristique') || 
                    item.textContent.includes('Enjeu'))) {
                    hasPropertyPattern++;
                }
            });
            
            // Si au moins 2 éléments suivent ce motif, c'est une liste de comparaison
            isComparisonList = hasPropertyPattern >= 2;
            
            if (isComparisonList) {
                // Créer le tableau
                const table = document.createElement('table');
                table.className = 'comparison-table';
                
                // Créer l'en-tête
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                const headerCell1 = document.createElement('th');
                const headerCell2 = document.createElement('th');
                
                headerCell1.textContent = 'Caractéristique';
                headerCell2.textContent = 'Description';
                
                headerRow.appendChild(headerCell1);
                headerRow.appendChild(headerCell2);
                thead.appendChild(headerRow);
                table.appendChild(thead);
                
                // Créer le corps du tableau
                const tbody = document.createElement('tbody');
                
                // Ajouter les lignes
                items.forEach(item => {
                    const row = document.createElement('tr');
                    const cell1 = document.createElement('td');
                    const cell2 = document.createElement('td');
                    
                    // Diviser le contenu en titre et description
                    const parts = item.textContent.split(':');
                    
                    if (parts.length >= 2) {
                        cell1.textContent = parts[0].trim();
                        cell2.textContent = parts.slice(1).join(':').trim();
                    } else {
                        cell1.textContent = '';
                        cell2.textContent = item.textContent.trim();
                    }
                    
                    row.appendChild(cell1);
                    row.appendChild(cell2);
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                
                // Remplacer la liste par le tableau
                list.parentNode.insertBefore(table, list);
                list.parentNode.removeChild(list);
            }
        }
    });
}

/**
 * Ajoute des sauts de page aux endroits stratégiques pour l'impression
 */
function addStrategicPageBreaks() {
    // Ajouter des sauts de page après les sections principales si elles sont longues
    const sections = document.querySelectorAll('.course-section, .examples-section');
    
    sections.forEach(section => {
        // Si la section est suffisamment longue, ajouter un saut de page après
        if (section.offsetHeight > 500 && !section.nextElementSibling?.classList.contains('page-break')) {
            const pageBreak = document.createElement('div');
            pageBreak.className = 'page-break';
            section.parentNode.insertBefore(pageBreak, section.nextSibling);
        }
    });
}