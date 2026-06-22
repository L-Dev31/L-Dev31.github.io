// Configuration MathJax améliorée pour l'impression
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true,
    packages: {'[+]': ['ams', 'newcommand', 'configmacros']},
    formatError: (jax, err) => {
      console.warn('[MathJax Oral] Erreur LaTeX ignorée:', err);
      return jax;
    }
  },
  chtml: {
    scale: 1,
    minScale: 0.5,
    mtextInheritFont: false,
    merrorInheritFont: false,
    fontURL: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2'
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    ignoreHtmlClass: 'no-print|noprint',
    processHtmlClass: 'tex2jax_process|mathjax_process',
    renderActions: {
      addMenu: [],
      checkLoading: []
    }
  },
  startup: {
    ready: () => {
      MathJax.startup.defaultReady();
      console.log('[MathJax] Configuration loaded successfully');
    }
  }
};

// Gestion des sujets dynamiques
let currentSubject = 'subject1';
let subjects = [];

// Charger la configuration des sujets
async function loadSubjects() {
  try {
    const response = await fetch('subjects.json');
    const data = await response.json();
    subjects = data.subjects;
    setupSubjectTabs();
    loadSubject(currentSubject);
  } catch (error) {
    console.error('Erreur lors du chargement des sujets:', error);
  }
}

// Configurer les onglets des sujets
function setupSubjectTabs() {
  const tabs = document.querySelectorAll('.print-tabs .tab');
  tabs.forEach((tab, index) => {
    if (subjects[index]) {
      tab.textContent = subjects[index].title;
      tab.setAttribute('data-subject', subjects[index].id);
      tab.addEventListener('click', () => switchSubject(subjects[index].id));
    }
  });
}

// Changer de sujet
async function switchSubject(subjectId) {
  if (currentSubject === subjectId) return;
  
  const mainContent = document.querySelector('#main-content');
  if (!mainContent) return;
  
  // Animation de sortie
  mainContent.classList.add('subject-loading');
  
  currentSubject = subjectId;
  
  // Mettre à jour les onglets
  document.querySelectorAll('.print-tabs .tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.getAttribute('data-subject') === subjectId) {
      tab.classList.add('active');
    }
  });
  
  // Charger le contenu du sujet avec délai pour l'animation
  setTimeout(async () => {
    await loadSubject(subjectId);
    
    // Animation d'entrée
    setTimeout(() => {
      mainContent.classList.remove('subject-loading');
    }, 50);
  }, 150);
}

// Charger le contenu d'un sujet
async function loadSubject(subjectId) {
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject) return;
  
  try {
    // Charger le contenu principal du sujet (qui contient maintenant tout)
    const response = await fetch(subject.file);
    const content = await response.text();
    
    // Remplacer le contenu principal ET les sections dynamiques
    const mainContent = document.querySelector('#main-content');
    const dynamicSections = document.querySelector('#dynamic-sections');
    
    if (mainContent && dynamicSections) {
      mainContent.innerHTML = content;
      dynamicSections.innerHTML = ''; // Vider les sections dynamiques car tout est dans le contenu principal
    }
    
    // Réinitialiser MathJax pour le nouveau contenu
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
    
    // Réinitialiser les animations
    setTimeout(() => {
      observeElements();
    }, 100);
    
  } catch (error) {
    console.error('Erreur lors du chargement du sujet:', error);
  }
}

// Fonctions d'impression
window.addEventListener('beforeprint', () => {
    console.log('[PRINT][Oral] Événement beforeprint détecté.');
    
    // Masquer tous les éléments de navigation et d'interface
    document.querySelectorAll('.no-print-oral, .print-tabs, .tab, .timer-container, .notes-toggle, .quick-notes-panel, .reading-progress, .print-btn-sticky, .notes-section, .back-button-container, .home-btn').forEach(el => {
        el.style.display = 'none';
        el.setAttribute('data-hidden-for-print', 'true');
    });
    
    // S'assurer que le contenu principal est visible
    document.querySelectorAll('#main-content, #dynamic-sections, .section').forEach(el => {
        if (el) {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        }
    });
    
    // Configurer les page breaks
    document.querySelectorAll('.page-break').forEach(pageBreak => {
        pageBreak.style.display = 'block';
        pageBreak.style.pageBreakBefore = 'always';
        pageBreak.style.breakBefore = 'page';
        pageBreak.style.height = '0';
        pageBreak.style.visibility = 'hidden';
    });
});

window.addEventListener('afterprint', () => {
    console.log('[PRINT][Oral] Événement afterprint détecté.');
    
    // Restaurer les éléments masqués
    document.querySelectorAll('[data-hidden-for-print="true"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-hidden-for-print');
    });
});

// Fonction d'impression appelée par le bouton
async function printPresentation() {
    console.log('[PRINT][Oral] Demande d\'impression pour la présentation orale.');
    
    // Récupérer le contenu principal sans les onglets de navigation
    const mainContent = document.getElementById('main-content');
    const dynamicSections = document.getElementById('dynamic-sections');
    
    if (!mainContent) {
        console.error('[PRINT][Oral] Conteneur principal non trouvé.');
        alert('Impossible de trouver le contenu principal à imprimer.');
        return;
    }

    let title = document.title || 'Grand Oral';
    const titleElement = document.querySelector('h1, .main-title');
    if (titleElement) title = titleElement.textContent.trim();
    if (title.length > 70) title = title.substring(0, 67) + "...";
    
    // Combiner le contenu principal et les sections dynamiques
    let contentHTML = mainContent.innerHTML;
    if (dynamicSections && dynamicSections.innerHTML.trim()) {
        contentHTML += dynamicSections.innerHTML;
    }

    // Nettoyage spécifique du contenu pour l'impression
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHTML;
    
    // Supprimer tous les éléments de navigation et d'interface
    tempDiv.querySelectorAll('.no-print, .noprint, .print-tabs, .tab, button, input, textarea, select, .timer-container, .notes-section, .controls, .back-button-container, .home-btn, .notes-toggle, .quick-notes-panel, .reading-progress, .print-btn-sticky').forEach(el => el.remove());
    
    // S'assurer que les sections de contenu sont bien visibles pour l'impression
    tempDiv.querySelectorAll('.section, .slide, .math-section, .nsi-section, .cs-section').forEach(el => {
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
    });
    
    // S'assurer que les page-breaks sont correctement configurés
    tempDiv.querySelectorAll('.page-break').forEach(pageBreak => {
        pageBreak.style.display = 'block';
        pageBreak.style.pageBreakBefore = 'always';
        pageBreak.style.breakBefore = 'page';
        pageBreak.style.height = '0';
        pageBreak.style.margin = '0';
        pageBreak.style.padding = '0';
        pageBreak.style.visibility = 'hidden';
    });
    
    contentHTML = tempDiv.innerHTML;

    if (typeof bulletproofPrint === 'function') {
        console.log(`[PRINT][Oral] Utilisation de bulletproofPrint pour "${title}".`);
        await bulletproofPrint(contentHTML, title, 'Grand Oral');
    } else {
        console.warn('[PRINT][Oral] bulletproofPrint non trouvée. Utilisation du fallback.');
        // Fallback amélioré avec MathJax et styles d'impression
        try {
            const printWindow = window.open('', '_blank');            const printHTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <title>${title}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="../common.css">
    <link rel="stylesheet" href="styles.css">
    <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <script>
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true,
                processEnvironments: true
            },
            chtml: {
                scale: 1,
                minScale: 0.5,
                mtextInheritFont: false,
                merrorInheritFont: false,
                fontURL: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2'
            },
            startup: {
                ready: () => {
                    MathJax.startup.defaultReady();
                    MathJax.startup.promise.then(() => {
                        // Attendre un peu plus pour s'assurer que tout est rendu
                        setTimeout(() => {
                            window.focus();
                            window.print();
                        }, 1000);
                    });
                }
            },
            options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
                ignoreHtmlClass: 'no-print|noprint'
            }
        };
    </script>
    <style>
        @media screen {
            body { background: white; color: black; font-size: 12pt; line-height: 1.5; margin: 0; padding: 20px; }
            .container { max-width: none; margin: 0; padding: 0; }
        }
        @media print {
            body { background: white !important; color: black !important; font-size: 11pt !important; line-height: 1.4 !important; margin: 0 !important; padding: 0 !important; }
            .container { max-width: none !important; margin: 0 !important; padding: 12mm !important; }
            .page-break { page-break-before: always !important; break-before: page !important; height: 0 !important; visibility: hidden !important; margin: 0 !important; }
            .section { page-break-inside: avoid !important; margin-bottom: 12pt !important; background: white !important; padding: 8pt !important; }
            h1, h2, h3, h4 { page-break-after: avoid !important; color: black !important; margin-bottom: 8pt !important; }
            .no-print, .noprint { display: none !important; }
            
            /* Styles spécifiques pour les formules LaTeX */
            .math-formula-container { 
                background: #f8f8f8 !important; 
                border: 1pt solid #ccc !important; 
                border-radius: 3pt !important;
                padding: 8pt !important; 
                margin: 8pt 0 !important; 
                page-break-inside: avoid !important;
                text-align: center !important;
            }
            
            /* Elements MathJax */
            .MathJax, mjx-container, mjx-container[display="true"] { 
                background: transparent !important; 
                border: none !important; 
                padding: 2pt !important; 
                margin: 2pt 0 !important;
                page-break-inside: avoid !important;
                font-size: 11pt !important;
            }
            
            mjx-container[display="true"] {
                text-align: center !important;
                margin: 4pt auto !important;
            }
            
            /* Assurer que les matrices et équations complexes ne se coupent pas */
            mjx-math, mjx-mrow, mjx-mtable {
                page-break-inside: avoid !important;
            }
            
            /* Titres et sections */
            .section-title-large {
                color: black !important;
                border-bottom: 1pt solid #333 !important;
                padding-bottom: 6pt !important;
                margin-bottom: 12pt !important;
                font-size: 14pt !important;
            }
            
            .highlight-box {
                background: #f5f5f5 !important;
                color: black !important;
                border: 1pt solid #999 !important;
                border-radius: 3pt !important;
                padding: 10pt !important;
                margin: 10pt 0 !important;
                page-break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        ${contentHTML}
    </div>
</body>
</html>`;            printWindow.document.write(printHTML);
            printWindow.document.close();
            
            // Ne pas appeler print() ici car MathJax le fera quand il sera prêt
        } catch (e) {
            console.error('[PRINT][Oral] Erreur avec le fallback:', e);
            // Fallback amélioré avec MathJax pour support LaTeX complet
            const enhancedWindow = window.open('', '_blank');
            const enhancedHTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <title>${title}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Styles d'impression optimisés */
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 21cm; margin: 0 auto; padding: 1cm; background: white; }
        h1, h2, h3, h4, h5, h6 { color: #2d3748; margin-top: 1.5em; margin-bottom: 0.5em; page-break-inside: avoid; page-break-after: avoid; }
        h1 { font-size: 1.8em; border-bottom: 2px solid #38a169; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; color: #38a169; }
        h3 { font-size: 1.3em; color: #4a5568; }
        p, li { margin-bottom: 0.8em; orphans: 3; widows: 3; }
        ul, ol { padding-left: 1.5em; margin-bottom: 1em; }
        .math, .MathJax { display: inline-block !important; margin: 0.2em; }
        .page-break, .pagebreak { page-break-before: always; height: 0; margin: 0; padding: 0; }
        .math-formula-container { 
            background: #f8f8f8 !important; 
            border: 1pt solid #ccc !important; 
            border-radius: 4pt !important;
            padding: 10pt !important; 
            margin: 10pt 0 !important; 
            page-break-inside: avoid !important;
            text-align: center !important;
        }
        .highlight-box { background: #f8f9fa; padding: 1em; margin: 1em 0; border: 1px solid #38a169; border-radius: 8px; text-align: center; page-break-inside: avoid; }
        @media print { 
            body { margin: 0; padding: 0.5cm; } 
            .page-break, .pagebreak { page-break-before: always; } 
            .no-print { display: none !important; } 
            .math-formula-container { 
                background: #f5f5f5 !important; 
                border: 1pt solid #ddd !important; 
                border-radius: 2pt !important;
                padding: 8pt !important; 
                margin: 8pt auto !important; 
                page-break-inside: avoid !important;
                text-align: center !important;
            }
            mjx-container[display="true"] {
                background: #f5f5f5 !important;
                border: 1pt solid #ddd !important;
                border-radius: 2pt !important;
                padding: 8pt !important;
                margin: 8pt auto !important;
                page-break-inside: avoid !important;
                text-align: center !important;
            }
        }
        @page { margin: 1.5cm; size: A4; }
        
        /* Rendre les formules MathJax moins bold à l'impression */
        .MathJax, .mjx-math, mjx-container, .MathJax_Display, .mjx-display {
          font-weight: 400 !important;
          filter: contrast(0.85) brightness(1.05);
        }
        /* Pour SVG (MathJax v3 SVG output) */
        .MathJax_SVG, .mjx-svg {
          font-weight: 400 !important;
          filter: contrast(0.85) brightness(1.05);
        }
    </style>
    <script src="../mathJax.js"></script>
</head>
<body>
    <div class="print-header">
        <h1>${title}</h1>
    </div>
    <div class="print-content">
        ${contentHTML}
    </div>
    <script>
        // Fonction pour attendre que MathJax soit complètement chargé et traité
        function waitForMathJaxAndPrint() {
            console.log('[PRINT] Vérification MathJax fallback...');
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
                console.log('[PRINT] Lancement impression fallback...');
                window.focus();
                window.print();
            });
        }
        window.addEventListener('DOMContentLoaded', function() {
            console.log('[PRINT] Document fallback chargé, attente MathJax...');
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
            enhancedWindow.document.write(enhancedHTML);
            enhancedWindow.document.close();
        }
    }
}

// Affichage immédiat des sections
function observeElements() {
  // Plus d'animation - tout apparaît immédiatement
  document.querySelectorAll('.section, .timeline-item, .qna').forEach(el => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
}

// Navigation fluide avec indicateur de progression
function setupSmoothNavigation() {
  // Créer un indicateur de progression de lecture
  const progressBar = document.createElement('div');
  progressBar.className = 'reading-progress';
  progressBar.innerHTML = '<div class="progress-fill"></div>';
  document.body.prepend(progressBar);

  // Mettre à jour la barre de progression au scroll
  window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    document.querySelector('.progress-fill').style.width = scrolled + '%';
  });

  // Navigation avec les touches fléchées
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      window.scrollBy(0, window.innerHeight * 0.8);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      window.scrollBy(0, -window.innerHeight * 0.8);
    }
  });
}

// Chronomètre pour la présentation
function setupTimer() {
  let startTime = null;
  let timerInterval = null;
  let overtimeInterval = null;
  let overtimeStart = null;
  let overtimeDisplay = null;
  const timerContainer = document.createElement('div');
  timerContainer.className = 'timer-container';
  timerContainer.setAttribute('aria-label', 'Chronomètre de présentation');
  timerContainer.setAttribute('tabindex', '0');  timerContainer.innerHTML = `
    <div class="timer-display">00:00</div>
    <div class="timer-controls">
      <button class="timer-btn primary start-btn" onclick="startTimer()">
        <i class="fas fa-play"></i> Start
      </button>
      <button class="timer-btn reset-btn" onclick="resetTimer()">
        <i class="fas fa-stop"></i> Reset
      </button>
    </div>
  `;
  document.body.appendChild(timerContainer);

  // Créer le bouton d'impression séparé
  const printButton = document.createElement('button');
  printButton.className = 'print-btn-sticky';
  printButton.onclick = printPresentation;
  printButton.innerHTML = `
    <i class="fas fa-print"></i> Imprimer le Grand Oral Complet
  `;
  document.body.appendChild(printButton);

  function setTimerColor(color, fade = false) {
    const display = document.querySelector('.timer-display');
    display.style.color = color;
    if (fade) {
      display.style.animation = 'fade-redgray 1s infinite alternate';
    } else {
      display.style.animation = '';
    }
  }

  function showOvertime() {
    if (!overtimeDisplay) {
      overtimeDisplay = document.createElement('span');
      overtimeDisplay.className = 'timer-overtime';
      overtimeDisplay.style.marginLeft = '10px';
      overtimeDisplay.style.fontSize = '0.9em';
      overtimeDisplay.style.color = '#d32f2f';
      overtimeDisplay.textContent = '+00:00';
      document.querySelector('.timer-display').after(overtimeDisplay);
    }
  }

  function hideOvertime() {
    if (overtimeDisplay) {
      overtimeDisplay.remove();
      overtimeDisplay = null;
    }
  }

  window.startTimer = function() {
    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      document.querySelector('.start-btn').innerHTML = '<i class="fas fa-pause"></i> Pause';
      document.querySelector('.start-btn').classList.add('primary');
      document.querySelector('.start-btn').onclick = pauseTimer;
    }
  };

  window.pauseTimer = function() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      document.querySelector('.start-btn').innerHTML = '<i class="fas fa-play"></i> Resume';
      document.querySelector('.start-btn').classList.remove('primary');
      document.querySelector('.start-btn').onclick = resumeTimer;
    }
  };
  window.resumeTimer = function() {
    timerInterval = setInterval(updateTimer, 1000);
    document.querySelector('.start-btn').innerHTML = '<i class="fas fa-pause"></i> Pause';
    document.querySelector('.start-btn').classList.add('primary');
    document.querySelector('.start-btn').onclick = pauseTimer;
  };

  window.resetTimer = function() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (overtimeInterval) {
      clearInterval(overtimeInterval);
      overtimeInterval = null;
    }
    startTime = null;
    overtimeStart = null;
    document.querySelector('.timer-display').textContent = '00:00';
    setTimerColor('var(--accent-blue)', false);
    hideOvertime();
    document.querySelector('.start-btn').innerHTML = '<i class="fas fa-play"></i> Start';
    document.querySelector('.start-btn').classList.remove('primary');
    document.querySelector('.start-btn').onclick = startTimer;
  };

  function updateTimer() {
    if (startTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      document.querySelector('.timer-display').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      // Alerte à 4:30 (presque 5 minutes)
      if (elapsed >= 270 && elapsed < 300) {
        setTimerColor('#b71c1c', true); // fade rouge/gris
      } else if (elapsed < 270) {
        setTimerColor('var(--accent-blue)', false);
      }
      // Stop à 5:00
      if (elapsed === 300) {
        clearInterval(timerInterval);
        timerInterval = null;
        setTimerColor('#b71c1c', false); // reste rouge fixe
        showOvertime();
        overtimeStart = Date.now();
        overtimeInterval = setInterval(updateOvertime, 1000);
      }
    }
  }

  function updateOvertime() {
    if (overtimeStart) {
      const over = Math.floor((Date.now() - overtimeStart) / 1000);
      const min = Math.floor(over / 60);
      const sec = over % 60;
      if (overtimeDisplay) {
        overtimeDisplay.textContent = `+${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      }
    }
  }
}

// Animation des formules mathématiques
function animateMathFormulas() {
  // Attendre que MathJax soit chargé
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise().then(() => {
      document.querySelectorAll('.math').forEach((formula, index) => {
        formula.style.opacity = '0';
        formula.style.transform = 'scale(0.8)';
        formula.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        
        setTimeout(() => {
          formula.style.opacity = '1';
          formula.style.transform = 'scale(1)';
        }, index * 200);
      });
    });
  }
}

// Mode notes rapides pour la présentation
function setupQuickNotes() {
  const notesToggle = document.createElement('button');
  notesToggle.className = 'notes-toggle';
  notesToggle.innerHTML = '<i class="fas fa-sticky-note"></i>';
  notesToggle.title = 'Afficher/masquer les notes rapides';
  
  const notesPanel = document.createElement('div');
  notesPanel.className = 'quick-notes-panel hidden';
  notesPanel.innerHTML = `
    <div class="notes-header">
      <h3><i class="fas fa-sticky-note"></i> Notes rapides</h3>
      <button class="close-notes" onclick="toggleNotes()">×</button>
    </div>
    <div class="notes-content">
      <div class="note-item">
        <strong>Introduction :</strong> Jeu vidéo → immersion → maths
      </div>
      <div class="note-item">
        <strong>Partie I :</strong> Translation, rotation, homothétie → matrices 4×4
      </div>
      <div class="note-item">
        <strong>Partie II :</strong> 60 FPS → 6M calculs/sec → optimisation GPU
      </div>
      <div class="note-item">
        <strong>Partie III :</strong> Château médiéval → modding → ambitions
      </div>
      <div class="note-item">
        <strong>Conclusion :</strong> Maths → réalité virtuelle → avenir
      </div>
    </div>
  `;
  
  notesToggle.onclick = toggleNotes;
  
  document.body.appendChild(notesToggle);
  document.body.appendChild(notesPanel);
  
  window.toggleNotes = function() {
    notesPanel.classList.toggle('hidden');
  };
}

// Raccourcis clavier pour la présentation
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+N pour les notes
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      window.toggleNotes();
    }
    
    // Ctrl+T pour le timer
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      if (window.startTimer) window.startTimer();
    }
    
    // Ctrl+R pour reset timer
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      if (window.resetTimer) window.resetTimer();
    }
    
    // Échap pour fermer les notes
    if (e.key === 'Escape') {
      const notesPanel = document.querySelector('.quick-notes-panel');
      if (notesPanel && !notesPanel.classList.contains('hidden')) {
        window.toggleNotes();
      }
    }
  });
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  observeElements();
  setupSmoothNavigation();
  setupTimer();
  setupQuickNotes();
  setupKeyboardShortcuts();
  
  // Attendre un peu pour MathJax
  setTimeout(animateMathFormulas, 1000);
  
  // Message de bienvenue dans la console
  console.log('🎓 Grand Oral - Léo Tosku');
  console.log('📐 Transformations géométriques 3D');
  console.log('⌨️  Raccourcis: Ctrl+N (notes), Ctrl+T (timer), Ctrl+R (reset), F11 (plein écran)');
});

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  loadSubjects();
  observeElements();
  setupSmoothNavigation();
});

// Export pour utilisation externe
window.GrandOralUtils = {
  printPresentation,
  startTimer: () => window.startTimer(),
  resetTimer: () => window.resetTimer(),
  switchSubject
};
