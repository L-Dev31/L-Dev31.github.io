// SYSTÈME UNIFIÉ POUR MATHS ET PHILOSOPHIE
// Version robuste basée sur l'implémentation fonctionnelle du dossier Oral - Juin 2025

// ============================================================================
// FONCTION D'IMPRESSION UNIVERSELLE - Version Oral Améliorée
// ============================================================================

// Fonction d'impression robuste et optimisée - Basée sur la version fonctionnelle du dossier Oral
async function bulletproofPrint(contentHTML, title = 'Document', subject = '') {
    console.log(`[PRINT] Début impression: "${title}" pour ${subject}`);
    
    // Validation des paramètres
    if (!contentHTML || typeof contentHTML !== 'string' || contentHTML.trim().length === 0) {
        console.error('[PRINT] Contenu HTML vide ou invalide fourni');
        alert('Aucun contenu à imprimer trouvé.');
        return;
    }
    
    // Nettoyage du titre
    const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '').substring(0, 100);
    
    try {
        // Création et nettoyage du contenu
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHTML;
        
        // Supprimer les éléments non imprimables
        tempDiv.querySelectorAll('.no-print, .noprint, button, input, textarea, select, .timer-container, .notes-section, .controls, #subject-tabs, .back-button-container, .home-btn, .lesson-checkbox, .progress-bar-container').forEach(el => el.remove());
        
        // S'assurer que les sections de contenu sont bien visibles
        tempDiv.querySelectorAll('.section, .slide, .lesson-content, .theme-content').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
        });
        
        const cleanedContent = tempDiv.innerHTML;
        
        // Ouverture de la fenêtre d'impression
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            console.error('[PRINT] Impossible d\'ouvrir la fenêtre d\'impression (popup bloqué?)');
            alert('Impossible d\'ouvrir la fenêtre d\'impression. Vérifiez que les popups ne sont pas bloqués.');
            return;
        }        // Déterminer la couleur de la matière
        let subjectColor = '#e53e3e'; // Rouge par défaut (Maths)
        if (subject.toLowerCase().includes('philosophie') || window.location.href.includes('/Philosophie/')) {
            subjectColor = '#805ad5'; // Violet pour Philosophie
        } else if (subject.toLowerCase().includes('oral') || window.location.href.includes('/Oral/')) {
            subjectColor = '#ff7f00'; // Orange pour Oral
        } else if (subject.toLowerCase().includes('nsi') || window.location.href.includes('/NSI/')) {
            subjectColor = '#2196f3'; // Bleu pour NSI
        }
        
        // Construction du document d'impression
        const printDocument = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${cleanTitle}</title>    <style>
        /* Styles d'impression optimisés */
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 21cm; margin: 0 auto; padding: 1cm; background: white; }
        h1, h2, h3, h4, h5, h6 { color: #2d3748; margin-top: 1.5em; margin-bottom: 0.5em; page-break-inside: avoid; page-break-after: avoid; }
        h1 { font-size: 1.8em; border-bottom: 2px solid ${subjectColor}; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; color: ${subjectColor}; }
        h3 { font-size: 1.3em; color: #4a5568; }
        p, li { margin-bottom: 0.8em; orphans: 3; widows: 3; }
        ul, ol { padding-left: 1.5em; margin-bottom: 1em; }
        .page-break, .pagebreak { page-break-before: always; height: 0; margin: 0; padding: 0; }
        .calculator-button { display: inline-block; padding: 4px 8px; margin: 1px; border: 1px solid #ccc; border-radius: 3px; font-size: 10px; background: #f0f0f0; }
        .calculator-section { border: 1px solid ${subjectColor}; border-radius: 8px; padding: 1em; margin: 1em 0; page-break-inside: avoid; }
        .function-group { background: #f8f9fa; padding: 0.8em; margin: 0.5em 0; border-left: 3px solid ${subjectColor}; }
        
        /* Styles LaTeX pour l'Oral - comme dans index.html */
        .math-formula-container {
            background: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
            border-radius: 8px !important;
            padding: 15px !important;
            margin: 15px 0 !important;
            text-align: center !important;
            page-break-inside: avoid !important;
        }
          /* Containers de formules LaTeX - pas de fond pour éviter le double container */
        .MathJax, .mjx-container, mjx-container {
            page-break-inside: avoid !important;
            display: block !important;
        }
        
        /* Formules display (centrées) - sans fond pour éviter le conflit avec math-formula-container */
        mjx-container[display="true"] {
            text-align: center !important;
            page-break-inside: avoid !important;
        }
        
        /* Formules inline - styling minimal */
        mjx-container:not([display="true"]) {
            display: inline-block !important;
        }          /* Styles pour les blocs de code */
        .code-block, pre, code {
            background: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
            border-radius: 4px !important;
            padding: 12px !important;
            margin: 12px 0 !important;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
            color: #000 !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
        }
        
        .code-block {
            border-left: 3px solid ${subjectColor} !important;
        }
        
        /* Préserver les espaces et sauts de ligne dans le code */
        .code-block *, pre *, code * {
            white-space: pre-wrap !important;
        }
          /* Styles pour les commentaires de code */
        .code-block .comment {
            color: #6a9955 !important;
            font-style: italic !important;
        }
        
        /* Styles pour les tableaux */
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 15px 0 !important;
            page-break-inside: avoid !important;
            font-size: 11px !important;
        }
        
        th, td {
            padding: 8px 12px !important;
            border: 1px solid #dee2e6 !important;
            text-align: left !important;
            vertical-align: top !important;
            page-break-inside: avoid !important;
        }
        
        th {
            background-color: #f8f9fa !important;
            font-weight: bold !important;
            color: #2d3748 !important;
            border-bottom: 2px solid ${subjectColor} !important;
        }
        
        tr:nth-child(even) {
            background-color: #f8f9fa !important;
        }
        
        tr:hover {
            background-color: #e8f4f8 !important;
        }
        
        /* Variables CSS pour les tableaux NSI */
        table th[style*="--nsi-light"], 
        table th[style*="var(--nsi-light)"] {
            background-color: #e3f2fd !important;
        }
        
        table td[style*="--nsi-border"], 
        table td[style*="var(--nsi-border)"],
        table th[style*="--nsi-border"], 
        table th[style*="var(--nsi-border)"] {
            border-color: #2196f3 !important;
        }
          @media print {
            body { margin: 0; padding: 0.5cm; } 
            .page-break, .pagebreak { page-break-before: always; } 
            .no-print { display: none !important; }
            .math-formula-container, .MathJax, mjx-container { page-break-inside: avoid !important; }
            .code-block, pre, code {
                background: #f8f8f8 !important;
                border: 1px solid #ccc !important;
                page-break-inside: avoid !important;
                white-space: pre-wrap !important;
                font-size: 10px !important;
                line-height: 1.3 !important;
                word-wrap: break-word !important;
            }            .code-block .comment {
                color: #6a9955 !important;
                font-style: italic !important;
            }
            
            /* Styles d'impression pour les tableaux */
            table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin: 10px 0 !important;
                page-break-inside: auto !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
            }
            
            th, td {
                padding: 6px 8px !important;
                border: 1px solid #666 !important;
                text-align: left !important;
                vertical-align: top !important;
                page-break-inside: avoid !important;
                word-wrap: break-word !important;
            }
            
            th {
                background-color: #f0f0f0 !important;
                font-weight: bold !important;
                color: #000 !important;
                border-bottom: 2px solid #333 !important;
            }
            
            tr {
                page-break-inside: avoid !important;
            }
            
            /* Gestion des très grandes tables */
            table.large-table {
                page-break-inside: auto !important;
            }
            
            table.large-table th,
            table.large-table td {
                page-break-inside: avoid !important;
            }
        }
        @media (max-width: 768px) { body { font-size: 11pt !important; } .container { padding: 8pt !important; } h1 { font-size: 1.6em !important; } h2 { font-size: 1.4em !important; } h3 { font-size: 1.2em !important; } }
        @page { margin: 1.5cm; size: A4; }    </style>    <!-- Configuration MathJax centralisée -->
    <script src="../mathJax.js"></script>
</head>
<body>    <div class="print-header">
        <h1>${cleanTitle}</h1>
    </div>
    <div class="print-content">
        ${cleanedContent}
    </div>
    <script>
        // Fonction pour attendre que MathJax soit complètement chargé et traité
        function waitForMathJaxAndPrint() {
            console.log('[PRINT] Vérification MathJax...');
            function checkMathJaxReady() {
                return new Promise((resolve) => {
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        console.log('[PRINT] MathJax disponible, traitement en cours...');
                        window.MathJax.typesetPromise().then(() => {
                            console.log('[PRINT] MathJax traitement terminé');
                            setTimeout(() => { resolve(); }, 1000);
                        }).catch(err => {
                            console.error('[PRINT] Erreur MathJax:', err);
                            setTimeout(() => { resolve(); }, 1000);
                        });
                    } else {
                        console.log('[PRINT] MathJax pas encore disponible, nouvelle tentative...');
                        setTimeout(() => { checkMathJaxReady().then(resolve); }, 500);
                    }
                });
            }
            checkMathJaxReady().then(() => {
                console.log('[PRINT] Lancement impression...');
                window.focus();
                window.print();
            });
        }
        window.addEventListener('DOMContentLoaded', function() {
            console.log('[PRINT] Document chargé, attente MathJax...');
            waitForMathJaxAndPrint();
        });
        window.addEventListener('beforeprint', function() {
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise();
            }
        });
    </script>
</body>
</html>`;
        printWindow.document.write(printDocument);
        printWindow.document.close();
        
        // Le script dans la fenêtre d'impression gérera automatiquement 
        // l'attente de MathJax et l'impression
        console.log(`[PRINT] Document d'impression créé pour "${cleanTitle}", MathJax prendra le relais`);
        
    } catch (error) {
        console.error('[PRINT] Erreur lors de l\'impression:', error);
        alert(`Erreur lors de l'impression: ${error.message}`);
    }
}

// ============================================================================
// EXPOSITION GLOBALE DES FONCTIONS
// ============================================================================

// Fonction d'impression accessible globalement
if (typeof window !== 'undefined') {
    window.bulletproofPrint = bulletproofPrint;
    
    // Debug pour vérifier que la fonction est bien chargée
    console.log('[COMMON] bulletproofPrint chargé:', typeof window.bulletproofPrint);
}