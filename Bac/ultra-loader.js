/**
 * SYSTÈME DE CHARGEMENT DYNAMIQUE ULTRA-OPTIMISÉ
 * Version 3.0 - 100% JSON-driven, HTML minimaliste
 * Fichiers HTML réduits de 95%+
 */

class UltraOptimizedLoader {
    constructor() {
        this.config = null;
        this.currentSubject = null;
        this.currentData = null;
        this.cache = new Map();
        this.templates = new Map();
        this.initialized = false;
    }    // Initialisation ultra-rapide
    async init() {
        try {
            console.log('[ULTRA-LOADER] 🚀 Démarrage du système ultra-optimisé...');
            
            // Détection du sujet et chemin config
            this.detectCurrentSubject();
            console.log('[ULTRA-LOADER] 📍 Sujet détecté:', this.currentSubject);
            
            const configPath = this.getConfigPath();
            console.log('[ULTRA-LOADER] 📂 Chemin config:', configPath);
            
            // Chargement en parallèle pour performance maximale
            const [config, subjectData] = await Promise.all([
                this.loadJSON(configPath),
                this.loadSubjectData()
            ]);
            
            console.log('[ULTRA-LOADER] ✅ Config chargée:', config);
            console.log('[ULTRA-LOADER] ✅ Données du sujet chargées:', subjectData);
            
            this.config = config;
            this.currentData = subjectData;
            
            // Génération ultra-rapide du contenu
            this.generateAllContent();
            this.initializeFeatures();
            
            this.initialized = true;
            console.log('[ULTRA-LOADER] ✅ Système initialisé en mode ultra-optimisé');
            
        } catch (error) {
            console.error('[ULTRA-LOADER] ❌ Erreur détaillée:', error);
            console.error('[ULTRA-LOADER] ❌ Stack trace:', error.stack);
            this.showError(`Erreur de chargement ultra-optimisé: ${error.message}`);
        }
    }

    // Détection ultra-rapide du sujet
    detectCurrentSubject() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/maths/')) this.currentSubject = 'maths';
        else if (path.includes('/philosophie/')) this.currentSubject = 'philosophie';
        else if (path.includes('/oral/')) this.currentSubject = 'oral';
        else this.currentSubject = 'home';
        
        console.log('[ULTRA-LOADER] 📍 Sujet détecté:', this.currentSubject);
    }

    // Chemin config optimisé
    getConfigPath() {
        return '../config.json';
    }    // Chargement JSON avec cache ultra-optimisé
    async loadJSON(url) {
        console.log(`[ULTRA-LOADER] 📥 Tentative de chargement: ${url}`);
        
        if (this.cache.has(url)) {
            console.log(`[ULTRA-LOADER] 💾 Trouvé en cache: ${url}`);
            return this.cache.get(url);
        }

        try {
            console.log(`[ULTRA-LOADER] 🌐 Fetch en cours: ${url}`);
            const response = await fetch(url);
            console.log(`[ULTRA-LOADER] 📡 Réponse reçue:`, response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText} pour ${url}`);
            }
            
            const data = await response.json();
            console.log(`[ULTRA-LOADER] ✅ JSON parsé avec succès pour ${url}:`, Object.keys(data));
            
            this.cache.set(url, data);
            return data;
            
        } catch (error) {
            console.error(`[ULTRA-LOADER] ❌ Erreur pour ${url}:`, error);
            console.error(`[ULTRA-LOADER] ❌ Type d'erreur:`, error.constructor.name);
            throw error;
        }
    }

    // Chargement des données du sujet
    async loadSubjectData() {
        if (!this.currentSubject || this.currentSubject === 'home') {
            console.log('[ULTRA-LOADER] 🏠 Pas de données à charger pour la page d\'accueil');
            return null;
        }
        
        try {
            console.log('[ULTRA-LOADER] 📥 Chargement de la config...');
            // Configuration du sujet
            const tempConfig = await this.loadJSON(this.getConfigPath());
            console.log('[ULTRA-LOADER] ✅ Config chargée:', tempConfig);
            
            const subjectConfig = tempConfig.subjects[this.currentSubject];
            
            if (!subjectConfig) {
                throw new Error(`Sujet ${this.currentSubject} non trouvé dans la config`);
            }            
            console.log('[ULTRA-LOADER] 📚 Config du sujet:', subjectConfig);
              // Chargement en parallèle des données principales et des vidéos
            // Les fichiers de données sont dans le même dossier que la page courante
            const dataPath = subjectConfig.dataFile;
            const videosPath = `${this.currentSubject}-videos.json`;
            
            console.log('[ULTRA-LOADER] 📄 Chargement des données:', dataPath);
            console.log('[ULTRA-LOADER] 🎬 Chargement des vidéos:', videosPath);
            
            const [data, videosData] = await Promise.all([
                this.loadJSON(dataPath),
                this.loadJSON(videosPath).catch(err => {
                    console.log('[ULTRA-LOADER] ℹ️ Pas de fichier vidéos spécifique:', err.message);
                    return { videos: [] };
                })
            ]);// Fusion des données
            data.videos = videosData.videos || [];
            data.chaptersVideos = videosData.chaptersVideos || [];
            
            console.log('[ULTRA-LOADER] ✅ Données chargées:', data);
            console.log('[ULTRA-LOADER] 🎬 Vidéos fusionnées:', data.videos?.length || 0, 'vidéos trouvées');
            
            return data;
        } catch (error) {
            console.error('[ULTRA-LOADER] ❌ Erreur dans loadSubjectData:', error);
            throw error;
        }
    }    // Génération COMPLÈTE du contenu HTML
    generateAllContent() {
        console.log('[ULTRA-LOADER] 🎨 Génération du contenu pour:', this.currentSubject);
        console.log('[ULTRA-LOADER] 📊 Config disponible:', !!this.config);
        console.log('[ULTRA-LOADER] 📊 Données disponibles:', !!this.currentData);
        
        this.generateHeader();
        this.generateMainContent();
        this.generateFooter();
    }    // Génération du header dynamique
    generateHeader() {
        const headerContainer = document.getElementById('ultra-header') || document.getElementById('dynamic-header');
        if (!headerContainer) {
            console.warn('[ULTRA-LOADER] ⚠️ Container header non trouvé');
            return;
        }

        if (!this.config || !this.config.subjects[this.currentSubject]) {
            console.warn('[ULTRA-LOADER] ⚠️ Config manquante pour generateHeader');
            headerContainer.innerHTML = '<div class="error">Configuration manquante</div>';
            return;
        }

        const subjectConfig = this.config.subjects[this.currentSubject];
        headerContainer.innerHTML = `
            <div class="header">
                <h1 class="main-title">${subjectConfig.title}</h1>
                <div class="student-info">
                    <h2 class="student-name">${this.config.student.name}</h2>
                    <p class="student-details">${subjectConfig.subtitle}</p>
                    <p class="student-details">Révisions Baccalauréat ${this.config.student.year}</p>
                </div>
                <div class="back-button-container">
                    <a href="../index.html" class="back-button">
                        <i class="fas fa-arrow-left"></i>
                        Retour au menu principal
                    </a>
                </div>
            </div>
        `;
    }    // Génération du contenu principal ultra-optimisée
    generateMainContent() {
        const contentContainer = document.getElementById('ultra-content') || document.getElementById('dynamic-content');
        if (!contentContainer) {
            console.warn('[ULTRA-LOADER] ⚠️ Container content non trouvé');
            return;
        }

        if (!this.currentData) {
            console.warn('[ULTRA-LOADER] ⚠️ Pas de données pour generateMainContent');
            contentContainer.innerHTML = '<div class="error">Aucune donnée disponible</div>';
            return;
        }

        // Ajouter la classe spécifique au sujet sur le body
        document.body.className = document.body.className.replace(/\b(maths|philosophie|oral)-page\b/g, '');
        document.body.classList.add(`${this.currentSubject}-page`);

        let html = '';

        // Section Leçons/Notions
        if (this.currentData.themes) {
            html += this.generateLessonsSection();
        }

        // Section Vidéos
        if (this.hasVideos()) {
            html += this.generateVideosSection();
        }

        // Section Examens
        if (this.currentData.exams) {
            html += this.generateExamsSection();
        }

        contentContainer.innerHTML = html;
        
        // Ajouter la progress bar après l'insertion du contenu
        this.addProgressBar();
    }

    // Génération optimisée des leçons
    generateLessonsSection() {
        const sectionTitle = this.currentSubject === 'philosophie' ? 'Notions philosophiques' : 'Programme de révisions';
        const sectionIcon = this.currentSubject === 'philosophie' ? 'fas fa-brain' : 'fas fa-book';
        
        let html = `
            <div class="section lessons-section">
                <h2 class="section-title">
                    <i class="${sectionIcon}"></i>
                    ${sectionTitle}
                </h2>
                <div class="search-container">
                    <div class="search-box-container">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="searchInput" class="search-input" placeholder="Rechercher...">
                    </div>
                </div>
                <div class="lessons-container">
        `;

        // Génération des thèmes et leçons
        this.currentData.themes.forEach(theme => {
            html += `<div class="lesson-theme-title">${theme.title}</div>`;
            
            const items = theme.lessons || theme.notions || [];
            items.forEach(item => {
                html += this.generateLessonItem(item);
            });
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }    // Génération optimisée d'un item de leçon
    generateLessonItem(item) {
        const isCompleted = this.getLessonCompletionStatus(item.id);
        const completedClass = isCompleted ? 'lesson-completed' : '';
        
        return `
            <div class="lesson-item ${completedClass}" data-lesson-id="${item.id}">
                <div class="lesson-header" onclick="window.UltraLoader.toggleLesson(${item.id})">
                    <div class="lesson-checkbox-container">
                        <input type="checkbox" 
                               class="lesson-checkbox" 
                               id="checkbox-${item.id}"
                               ${isCompleted ? 'checked' : ''}
                               onclick="window.UltraLoader.toggleLessonCompletion(${item.id}, event)">
                        <label for="checkbox-${item.id}" class="checkbox-label"></label>
                    </div>
                    <div class="lesson-title-container">
                        <h3 class="lesson-title">${item.title}</h3>
                    </div>
                    <div class="lesson-actions">
                        <button class="print-button" onclick="window.UltraLoader.printLesson(${item.id})">
                            <i class="fas fa-print"></i> Imprimer
                        </button>
                    </div>
                </div>
                <div class="lesson-content" id="lesson-content-${item.id}">
                    <div class="loading-placeholder">
                        <i class="fas fa-spinner fa-spin"></i>
                        Chargement du contenu...
                    </div>
                </div>
            </div>
        `;
    }    // Génération ultra-optimisée des vidéos par chapitres
    generateVideosSection() {
        let hasAnyVideo = false;
        let html = `
            <div class="section videos-section">
                <h2 class="section-title">
                    <i class="fas fa-video"></i>
                    Vidéos explicatives
                </h2>
                <div class="search-container">
                    <div class="search-box-container">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="videoSearchInput" class="search-input" placeholder="Rechercher une vidéo...">
                    </div>
                </div>
                <div class="videos-container">
        `;
        
        // Priorité aux chapitres vidéos (nouvelle structure)
        if (this.currentData.chaptersVideos && this.currentData.chaptersVideos.length > 0) {
            hasAnyVideo = true;
            this.currentData.chaptersVideos.forEach(chapter => {
                html += this.generateVideoChapterItem(chapter);
            });
        }
        // Fallback vers l'ancienne structure si pas de chapitres
        else if (this.currentData.videos && this.currentData.videos.length > 0) {
            hasAnyVideo = true;
            this.currentData.videos.forEach(video => {
                html += this.generateVideoItem(video);
            });
        }
        // Check theme videos (pour compatibilité)
        else {
            this.currentData.themes.forEach(theme => {
                if (theme.videos && theme.videos.length > 0) {
                    hasAnyVideo = true;
                    html += `<div class="lesson-theme-title">${theme.title}</div>`;
                    theme.videos.forEach(video => {
                        html += this.generateVideoItem(video);
                    });
                }
            });
        }
        
        if (!hasAnyVideo) {
            html += `<div class="no-results-message">Aucune vidéo disponible pour ce sujet.</div>`;
        }
        
        html += `
                </div>
            </div>
        `;        return html;
    }    // Génération d'un chapitre vidéo (nouvelle structure)
    generateVideoChapterItem(chapter) {
        return `
            <div class="lesson-item video-theme-item" data-lesson-id="${chapter.id}">
                <div class="lesson-header" onclick="window.UltraLoader.toggleLesson('${chapter.id}')">
                    <div class="lesson-title-container">
                        <h3 class="lesson-title">
                            <i class="fas fa-video"></i>
                            ${chapter.title}
                        </h3>
                    </div>
                    <div class="lesson-actions">
                        <i class="fas fa-chevron-down lesson-arrow"></i>
                    </div>
                </div>
                <div class="lesson-content" id="lesson-content-${chapter.id}">
                    <div class="videos-grid">                        ${chapter.videos.map(video => `
                            <div class="video-item">
                                <div class="video-container">
                                    <iframe src="${this.convertToEmbedUrl(video.url)}" frameborder="0" allowfullscreen></iframe>
                                </div>
                                <div class="video-title">${video.title}</div>
                                <div class="video-description">${video.channel || ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Conversion d'une URL YouTube normale en URL embed
    convertToEmbedUrl(url) {
        if (url.includes('youtube.com/watch?v=')) {
            const videoId = url.split('v=')[1].split('&')[0];
            return `https://www.youtube.com/embed/${videoId}`;
        } else if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1].split('?')[0];
            return `https://www.youtube.com/embed/${videoId}`;
        }
        return url; // Déjà au bon format ou autre plateforme
    }

    // Génération d'un item vidéo optimisé (ancienne structure)
    generateVideoItem(video) {
        return `
            <div class="lesson-item video-theme-item" data-video-id="${video.id}">
                <div class="lesson-header">
                    <div class="lesson-title-container" onclick="window.UltraLoader.toggleVideo(${video.id})">
                        <h3 class="lesson-title">
                            <i class="fas fa-video"></i>
                            ${video.title}
                        </h3>
                    </div>
                    <div class="lesson-actions">
                        <i class="fas fa-chevron-down lesson-arrow"></i>
                    </div>
                </div>
                <div class="lesson-content" id="video-content-${video.id}">
                    <div class="videos-grid">
                        <div class="video-item">
                            <div class="video-container">
                                <iframe src="${video.url}" frameborder="0" allowfullscreen></iframe>
                            </div>
                        </div>
                    </div>
                    <div class="video-description">${video.channel || ''}</div>
                </div>
            </div>
        `;
    }

    // Génération ultra-optimisée des examens
    generateExamsSection() {
        if (!this.currentData.exams || this.currentData.exams.length === 0) return '';

        let html = `
            <div class="section pdf-section">
                <h2 class="section-title">
                    <i class="fas fa-graduation-cap"></i>
                    Sujets du Bac
                </h2>
                <div class="pdf-grid">
                    <div class="pdf-column">
                        <h3 class="pdf-column-title">
                            <i class="fas fa-file-alt"></i>
                            Sujets
                        </h3>
                        <div class="pdf-items">
        `;
        
        this.currentData.exams.forEach(exam => {
            html += `
                <button class="pdf-button pdf-subject" onclick="window.UltraLoader.openPDF('${exam.file}')">
                    <i class="fas fa-file-pdf"></i>
                    ${exam.title}
                </button>
            `;
        });
        
        html += `
                        </div>
                    </div>
                    <div class="pdf-column">
                        <h3 class="pdf-column-title">
                            <i class="fas fa-check-circle"></i>
                            Corrigés
                        </h3>
                        <div class="pdf-items">
        `;
        
        this.currentData.exams.forEach(exam => {
            html += `
                <button class="pdf-button pdf-correction" onclick="window.UltraLoader.openPDF('${exam.correction}')">
                    <i class="fas fa-file-pdf"></i>
                    ${exam.title}
                </button>
            `;
        });

        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    // Génération du footer
    generateFooter() {
        const footerContainer = document.getElementById('ultra-footer') || document.getElementById('dynamic-footer');
        if (!footerContainer) return;

        footerContainer.innerHTML = `
            <a href="../index.html" class="home-btn">
                <i class="fas fa-arrow-left"></i>
                Retour au menu principal
            </a>
        `;
    }    // Vérification de la présence de vidéos
    hasVideos() {
        // Affiche la section si au moins une vidéo existe
        const hasChapterVideos = this.currentData.chaptersVideos && this.currentData.chaptersVideos.length > 0;
        const hasThemeVideos = this.currentData.themes && this.currentData.themes.some(theme => theme.videos && theme.videos.length > 0);
        const hasGlobalVideos = this.currentData.videos && this.currentData.videos.length > 0;
        return hasChapterVideos || hasThemeVideos || hasGlobalVideos;
    }

    // Initialisation des fonctionnalités
    initializeFeatures() {
        this.initializeSearch();
        this.initializeLessonToggle();
        this.initializePrintButtons();
    }

    // Recherche ultra-optimisée
    initializeSearch() {
        const searchInput = document.getElementById('searchInput');
        const videoSearchInput = document.getElementById('videoSearchInput');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.performSearch(e.target.value, 'lessons'));
        }
        
        if (videoSearchInput) {
            videoSearchInput.addEventListener('input', (e) => this.performSearch(e.target.value, 'videos'));
        }
    }

    // Performance de recherche optimisée
    performSearch(query, type) {
        const items = type === 'videos' ? 
            document.querySelectorAll('.video-theme-item') :
            document.querySelectorAll('.lesson-item:not(.video-theme-item)');

        items.forEach(item => {
            const title = item.querySelector('.lesson-title').textContent.toLowerCase();
            const matches = title.includes(query.toLowerCase());
            item.style.display = matches ? 'block' : 'none';
        });
    }
      // Toggle des leçons ultra-optimisé
    initializeLessonToggle() {
        // Fonctions globales pour les toggles
        // Utiliser l'instance existante au lieu de référencer directement
        const loader = window.UltraLoader;
        loader.toggleLesson = this.toggleLesson.bind(this);
        loader.toggleVideo = this.toggleVideo.bind(this);
        loader.printLesson = this.printLesson.bind(this);
        loader.openPDF = this.openPDF.bind(this);
        loader.toggleLessonCompletion = this.toggleLessonCompletion.bind(this);
    }

    // Toggle d'une leçon
    async toggleLesson(id) {
        const item = document.querySelector(`[data-lesson-id="${id}"]`);
        const content = document.getElementById(`lesson-content-${id}`);
        if (!item || !content) return;
        
        item.classList.toggle('active');
        
        if (item.classList.contains('active')) {
            // Charger le contenu de la leçon
            try {
                const lesson = this.findLessonById(id);
                if (lesson && lesson.file) {
                    const lessonContent = await this.loadLessonContent(lesson.file);
                    content.innerHTML = lessonContent;
                    
                    // Ajoute la classe page-break si besoin
                    if (content.innerHTML.includes('<!--PAGEBREAK-->')) {
                        content.innerHTML = content.innerHTML.replace(/<!--PAGEBREAK-->/g, '<div class="page-break"></div>');
                    }
                    
                    // Recharger MathJax pour le rendu LaTeX
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        window.MathJax.typesetPromise([content]);
                    } else if (window.MathJax && window.MathJax.typeset) {
                        window.MathJax.typeset([content]);
                    }
                }
            } catch (error) {
                content.innerHTML = '<div class="error-placeholder">Erreur de chargement</div>';
            }
        }
    }

    // Toggle d'une vidéo
    toggleVideo(id) {
        const item = document.querySelector(`[data-video-id="${id}"]`);
        if (item) {
            item.classList.toggle('active');
        }
    }    // Impression d'une leçon - Version améliorée avec debug
    async printLesson(id) {
        console.log(`[PRINT] Demande d'impression pour l'ID: ${id}`);
        
        const lesson = this.findLessonById(id);
        if (!lesson) {
            console.error(`[PRINT] Leçon non trouvée avec l'ID: ${id}`);
            alert(`Impossible de trouver la leçon avec l'ID: ${id}`);
            return;
        }
        
        if (!lesson.file) {
            console.error(`[PRINT] Aucun fichier associé à la leçon: ${lesson.title}`);
            alert(`Aucun fichier associé à la leçon: ${lesson.title}`);
            return;
        }
        
        console.log(`[PRINT] Impression de: "${lesson.title}" depuis ${lesson.file}`);
        
        try {
            // Charger le contenu de la leçon
            const lessonContent = await this.loadLessonContent(lesson.file);
            
            if (!lessonContent || lessonContent.trim().length === 0) {
                console.error('[PRINT] Contenu vide chargé');
                alert('Le contenu de la leçon est vide ou n\'a pas pu être chargé.');
                return;
            }
              // Utiliser la fonction bulletproofPrint de common.js
            if (typeof window.bulletproofPrint === 'function') {
                console.log(`[PRINT] Utilisation de bulletproofPrint pour "${lesson.title}"`);
                await window.bulletproofPrint(lessonContent, lesson.title);
            } else {
                console.warn('[PRINT] bulletproofPrint non disponible, fallback vers ouverture simple');
                // Fallback si bulletproofPrint n'est pas disponible
                window.open(lesson.file, '_blank');
            }
        } catch (error) {
            console.error('[PRINT] Erreur lors de l\'impression:', error);
            alert(`Erreur lors de l'impression: ${error.message}`);
            // Fallback
            console.log('[PRINT] Fallback: ouverture du fichier dans un nouvel onglet');
            window.open(lesson.file, '_blank');
        }
    }

    // Utilitaires
    findLessonById(id) {
        for (const theme of this.currentData.themes) {
            const items = theme.lessons || theme.notions || [];
            const lesson = items.find(item => item.id === id);
            if (lesson) return lesson;
        }
        return null;
    }    // Chargement du contenu d'une leçon (HTML) - Extraction du contenu principal
    async loadLessonContent(file) {
        try {
            console.log(`[PRINT] Chargement du fichier: ${file}`);
            const response = await fetch(file);
            if (!response.ok) throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
            
            const fullHTML = await response.text();
            console.log(`[PRINT] Fichier chargé, taille: ${fullHTML.length} caractères`);
            
            // Créer un parser DOM temporaire pour extraire le contenu principal
            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHTML, 'text/html');
            
            // Chercher le contenu principal dans différents conteneurs possibles
            let mainContent = null;
              // Priorité 1: conteneur avec class "content" ou "main-content"
            mainContent = doc.querySelector('.lesson-container, .content, .main-content, main, .lesson-content');
            
            // Priorité 2: conteneur body sans les scripts et headers
            if (!mainContent) {
                const body = doc.querySelector('body');
                if (body) {
                    // Cloner le body et supprimer les éléments non désirés
                    const bodyClone = body.cloneNode(true);
                    
                    // Supprimer les éléments de navigation/interface
                    bodyClone.querySelectorAll('script, style, nav, header, footer, .no-print, .navigation, .header, .footer, .menu').forEach(el => el.remove());
                    
                    mainContent = bodyClone;
                }
            }
            
            // Priorité 3: fallback - tout le contenu
            if (!mainContent) {
                mainContent = doc.body || doc.documentElement;
            }
            
            const extractedContent = mainContent ? mainContent.innerHTML : fullHTML;
            console.log(`[PRINT] Contenu extrait, taille: ${extractedContent.length} caractères`);
            
            return extractedContent;
            
        } catch (error) {
            console.error('[PRINT] Erreur lors du chargement:', error);
            return `<div class="error-placeholder">
                <h2>Erreur de chargement du contenu</h2>
                <p>Impossible de charger le fichier: ${file}</p>
                <p>Erreur: ${error.message}</p>
            </div>`;
        }
    }

    // Impression des leçons (fonctionnalité déjà présente)
    initializePrintButtons() {
        // Optionnel : à compléter si besoin
    }

    // Ouvre un PDF dans un nouvel onglet
    openPDF(url) {
        window.open(url, '_blank');
    }

    // Gestion d'erreur
    showError(message) {
        const container = document.getElementById('ultra-content') || document.body;
        container.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Erreur de chargement</h2>
                <p>${message}</p>
                <button onclick="location.reload()" class="retry-button">
                    <i class="fas fa-redo"></i>
                    Réessayer                </button>
            </div>
        `;
    }

    // ============================================================================
    // SYSTÈME DE GAMIFICATION - LEÇONS COMPLÉTÉES
    // ============================================================================

    // Obtient le statut de complétion d'une leçon
    getLessonCompletionStatus(lessonId) {
        const storageKey = `${this.currentSubject}_lesson_${lessonId}_completed`;
        return localStorage.getItem(storageKey) === 'true';
    }

    // Sauvegarde le statut de complétion d'une leçon
    setLessonCompletionStatus(lessonId, isCompleted) {
        const storageKey = `${this.currentSubject}_lesson_${lessonId}_completed`;
        localStorage.setItem(storageKey, isCompleted.toString());
        this.updateProgressBar();
    }

    // Toggle le statut de complétion d'une leçon
    toggleLessonCompletion(lessonId, event) {
        event.stopPropagation(); // Empêche l'ouverture/fermeture de la leçon
        
        const checkbox = event.target;
        const lessonItem = document.querySelector(`[data-lesson-id="${lessonId}"]`);
        const isCompleted = checkbox.checked;
        
        // Sauvegarder le statut
        this.setLessonCompletionStatus(lessonId, isCompleted);
        
        // Appliquer le style visuel
        if (isCompleted) {
            lessonItem.classList.add('lesson-completed');
        } else {
            lessonItem.classList.remove('lesson-completed');
        }
    }

    // Calcule le pourcentage de progression
    calculateProgress() {
        if (!this.currentData || !this.currentData.themes) return 0;
        
        let totalLessons = 0;
        let completedLessons = 0;
        
        this.currentData.themes.forEach(theme => {
            const items = theme.lessons || theme.notions || [];
            items.forEach(item => {
                totalLessons++;
                if (this.getLessonCompletionStatus(item.id)) {
                    completedLessons++;
                }
            });
        });
        
        return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    }    // Ajoute la progress bar en haut de page
    addProgressBar() {
        // Supprimer l'ancienne progress bar si elle existe
        const existingBar = document.querySelector('.progress-bar-container');
        if (existingBar) {
            existingBar.remove();
        }
        
        const progress = this.calculateProgress();
        
        const progressBarHTML = `
            <div class="progress-bar-container">
                <div class="progress-bar-wrapper">
                    <span class="progress-bar-label">Progression</span>
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                    </div>
                    <span class="progress-percentage">${progress}%</span>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('afterbegin', progressBarHTML);
    }    // Met à jour la progress bar
    updateProgressBar() {
        const progressBar = document.querySelector('.progress-bar-container');
        if (progressBar) {
            const progress = this.calculateProgress();
            const progressText = progressBar.querySelector('.progress-percentage');
            const progressFill = progressBar.querySelector('.progress-bar-fill');
            
            console.log(`[GAMIFICATION] Mise à jour progress bar: ${progress}%`);
            
            if (progressText) {
                progressText.textContent = `${progress}%`;
            }
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
                progressFill.setAttribute('data-progress', progress.toString());
                
                // Force la couleur selon le pourcentage
                if (progress === 0) {
                    progressFill.style.background = 'var(--gray-400)';
                } else if (progress < 40) {
                    progressFill.style.background = '#ef4444';
                } else if (progress < 70) {
                    progressFill.style.background = '#f59e0b';
                } else if (progress < 100) {
                    progressFill.style.background = '#10b981';
                } else {
                    progressFill.style.background = 'var(--subject-color, #10b981)';
                    progressFill.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.3)';
                }
            }
        }
    }
}

// Expose la classe au global pour les appels dynamiques
window.UltraLoader = new UltraOptimizedLoader();
