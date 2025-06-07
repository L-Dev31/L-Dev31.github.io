// Configuration MathJax
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']]
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
    // Actions à effectuer avant l'impression, si nécessaire
    // Par exemple, masquer des éléments non pertinents pour l'impression
    document.querySelectorAll('.no-print-oral').forEach(el => el.style.display = 'none');
});

window.addEventListener('afterprint', () => {
    console.log('[PRINT][Oral] Événement afterprint détecté.');
    // Actions à effectuer après l'impression
    // Par exemple, restaurer les éléments masqués
    document.querySelectorAll('.no-print-oral').forEach(el => el.style.display = '');
});

// Fonction d'impression appelée par le bouton
async function printPresentation() {
    console.log('[PRINT][Oral] Demande d\'impression pour la présentation orale.');
    
    const presentationContainer = document.getElementById('presentation-content') || document.querySelector('.main-content') || document.body;
    if (!presentationContainer) {
        console.error('[PRINT][Oral] Conteneur principal de la présentation non trouvé.');
        alert('Impossible de trouver le contenu principal de la présentation à imprimer.');
        return;
    }

    let title = document.title || 'Présentation Orale';
    const titleElement = document.querySelector('h1, .main-title');
    if (titleElement) title = titleElement.textContent.trim();
    if (title.length > 70) title = title.substring(0, 67) + "...";
    let contentHTML = presentationContainer.innerHTML;

    // Nettoyage du contenu pour l'impression
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHTML;
    // Supprimer les éléments interactifs ou non désirés pour l'impression
    tempDiv.querySelectorAll('.no-print, .noprint, button, input, textarea, select, .timer-container, .notes-section, .controls, #subject-tabs, .back-button-container, .home-btn').forEach(el => el.remove());
    // S'assurer que les sections de contenu sont bien visibles
    tempDiv.querySelectorAll('.section, .slide').forEach(el => {
        el.style.display = 'block'; // Forcer l'affichage pour l'impression
        el.style.opacity = '1'; // Forcer l'opacité
    });
    contentHTML = tempDiv.innerHTML;

    if (typeof bulletproofPrint === 'function') {
        console.log(`[PRINT][Oral] Utilisation de bulletproofPrint pour "${title}".`);
        await bulletproofPrint(contentHTML, title, 'Grand Oral');
    } else {
        console.warn('[PRINT][Oral] bulletproofPrint non trouvée. Tentative avec window.print() basique.');
        // Fallback très simple si bulletproofPrint n'est pas chargé (ce qui ne devrait pas arriver si common.js est inclus)
        try {
            const printWindow = window.open('', '_blank');
            printWindow.document.write('<html><head><title>' + title + '</title></head><body>' + contentHTML + '</body></html>');
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
            // printWindow.close(); // Laisser l'utilisateur fermer
        } catch (e) {
            console.error('[PRINT][Oral] Erreur avec le fallback window.print():', e);
            alert('La fonction d\'impression principale n\'est pas disponible et le mode de secours a échoué.');
        }
    }
}

// Animation d'apparition progressive des sections au scroll
function observeElements() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observer toutes les sections
  document.querySelectorAll('.section, .timeline-item, .qna').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
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
