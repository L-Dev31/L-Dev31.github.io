// Configuration des sources d'images - sera chargée depuis JSON
let imageSources = {};
let sourceConfig = null;

// Mode debug pour contrôler la verbosité des logs
const DEBUG_MODE = false; // Mettre à true pour plus de logs

// Fonction pour charger la configuration depuis JSON
async function loadImageSourcesConfig() {
    try {
        const response = await fetch('../../image-sources.json');
        const config = await response.json();
        sourceConfig = config;
        imageSources = {};
        
        // Traiter chaque source depuis le JSON
        for (const [key, source] of Object.entries(config.sources)) {
            if (source.enabled) {
                imageSources[key] = {
                    name: source.displayName,
                    baseUrl: source.baseUrl,
                    corsEnabled: source.corsEnabled,
                    categories: source.categories,
                    config: source.config,
                    type: source.type,
                    generateUrl: createUrlGenerator(source)
                };
            }
        }
        
        console.log('Configuration des sources chargée:', Object.keys(imageSources));
        
        // Tester les sources d'images au démarrage
        await testImageSources();
        
        return true;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration JSON:', error);
        return false;
    }
}

// Fonction pour créer un générateur d'URL selon le type de source
function createUrlGenerator(source) {
    const { baseUrl, config, type } = source;
    
    return (width, height, category, seed = Math.floor(Math.random() * 10000)) => {
        switch (type) {
            case 'random':
                return config.urlPattern
                    .replace('{baseUrl}', baseUrl)
                    .replace('{width}', width)
                    .replace('{height}', height)
                    .replace('{seed}', seed);
                    
            case 'category':
                return config.urlPattern
                    .replace('{baseUrl}', baseUrl)
                    .replace('{width}', width)
                    .replace('{height}', height)
                    .replace('{category}', category)
                    .replace('{seed}', seed);
                    
            case 'id':
                const randomId = config.idRange ? 
                    Math.floor(Math.random() * (config.idRange[1] - config.idRange[0] + 1)) + config.idRange[0] :
                    seed;
                return config.urlPattern
                    .replace('{baseUrl}', baseUrl)
                    .replace('{id}', randomId)
                    .replace('{width}', width)
                    .replace('{height}', height);
                    
            case 'color':
                const colors = config.colors || ['3498db'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                const textColor = config.textColor || 'ffffff';
                const text = encodeURIComponent(config.text || 'HD Design');
                return config.urlPattern
                    .replace('{baseUrl}', baseUrl)
                    .replace('{width}', width)
                    .replace('{height}', height)
                    .replace('{color}', color)
                    .replace('{textColor}', textColor)
                    .replace('{text}', text);
                    
            default:
                return `${baseUrl}/${width}/${height}?random=${seed}`;
        }
    };
}

// Classe pour gérer la base de données de wallpapers haute qualité
class ArtDatabase {
    constructor() {
        this.wallpapers = [];
        this.currentWallpaper = null;
        this.isLoading = false;
        this.cache = new Map();
        this.maxCacheSize = 100;
        this.currentPage = 1;
        this.maxPages = 50;
        this.currentCategoryIndex = 0;
    }        async initializeDatabase() {
        try {
            console.log('Initialisation de la base de données de wallpapers...');
            
            // Charger la configuration depuis JSON
            const configLoaded = await loadImageSourcesConfig();
            if (!configLoaded) {
                throw new Error('Configuration JSON non chargée');
            }
            
            // Générer des wallpapers pour chaque source activée
            const width = sourceConfig.settings.defaultDimensions.width;
            const height = sourceConfig.settings.defaultDimensions.height;
            const wallpapersPerCategory = sourceConfig.settings.wallpapersPerCategory;
            
            for (const [sourceKey, source] of Object.entries(imageSources)) {
                console.log(`Chargement des wallpapers ${source.name}...`);
                
                for (const category of source.categories) {
                    for (let j = 0; j < wallpapersPerCategory; j++) {
                        const seed = Math.floor(Math.random() * 10000) + j;
                        const imageUrl = source.generateUrl(width, height, category, seed);
                        
                        const wallpaper = {
                            imageUrl,
                            title: null,
                            artist: source.name,
                            date: new Date().getFullYear().toString(),
                            culture: sourceConfig.settings.metadata.culture,
                            medium: sourceConfig.settings.metadata.medium,
                            department: sourceConfig.settings.metadata.department,
                            classification: category,
                            source: sourceKey,
                            hasMetadata: false
                        };
                        
                        this.wallpapers.push(wallpaper);
                    }
                }
            }
            
            console.log(`Base de données initialisée avec ${this.wallpapers.length} wallpapers haute qualité`);
            return this.wallpapers.length > 0;
        } catch (error) {
            console.error('Erreur lors de l\'initialisation de la base de données:', error);
            return false;
        }
    }
      
    async getRandomArtwork() {
        if (this.wallpapers.length === 0 || this.isLoading) return null;
        
        this.isLoading = true;
        
        try {
            // Mélanger les wallpapers pour éviter les répétitions
            if (Math.random() < 0.1) { // 10% de chance de remélanger
                this.shuffleArray(this.wallpapers);
            }
            
            // Sélectionner un wallpaper aléatoire
            const randomIndex = Math.floor(Math.random() * this.wallpapers.length);
            const wallpaper = this.wallpapers[randomIndex];
            
            // Vérifier si l'image est accessible
            if (await this.isImageAccessible(wallpaper.imageUrl)) {
                this.isLoading = false;
                return wallpaper;
            } else {
                console.warn('Wallpaper non accessible, génération d\'un nouveau...');
                // Générer un nouveau wallpaper de la même catégorie
                const newWallpaper = await this.generateNewWallpaper(wallpaper.classification);
                this.isLoading = false;
                return newWallpaper;
            }
        } catch (error) {
            console.error('Erreur lors de la récupération du wallpaper:', error);
            this.isLoading = false;
            return null;
        }
    }    
      async generateNewWallpaper(category) {
        try {
            // Utiliser la configuration JSON si disponible
            if (sourceConfig && Object.keys(imageSources).length > 0) {
                const enabledSources = Object.keys(imageSources);
                const randomSourceKey = enabledSources[Math.floor(Math.random() * enabledSources.length)];
                const source = imageSources[randomSourceKey];
                
                // Vérifier si la catégorie est supportée par cette source
                const useCategory = source.categories.includes(category) ? category : source.categories[0];
                
                const width = sourceConfig.settings.defaultDimensions.width;
                const height = sourceConfig.settings.defaultDimensions.height;
                const randomSeed = Math.floor(Math.random() * 10000);
                const imageUrl = source.generateUrl(width, height, useCategory, randomSeed);
                
                return {
                    imageUrl,
                    title: null,
                    artist: source.name,
                    date: new Date().getFullYear().toString(),
                    culture: sourceConfig.settings.metadata.culture,
                    medium: sourceConfig.settings.metadata.medium,
                    department: 'Génération dynamique',
                    classification: useCategory,
                    source: randomSourceKey,
                    hasMetadata: false
                };
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }    async isImageAccessible(url) {
        // Désormais, on ne vérifie plus l'accessibilité réseau des images (CORS/opaque)
        // On fait confiance à l'affichage CSS/HTML
        return true;
    }

    addToCache(id, artwork) {
        if (this.cache.size >= this.maxCacheSize) {
            // Supprimer le plus ancien élément
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(id, artwork);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Fonction exemple pour ajouter des sources avec vraies métadonnées
    // Sera utilisée quand on ajoutera des APIs qui fournissent titre + artiste
    async loadArtworksWithMetadata() {
        // Exemple futur : API d'un musée qui fournirait nom d'œuvre + artiste
        // const artworks = [
        //     {
        //         imageUrl: 'https://api-museum.com/artwork/123.jpg',
        //         title: 'La Nuit étoilée',  // Vrai titre de l'œuvre
        //         artist: 'Vincent van Gogh', // Vrai nom de l'artiste
        //         hasMetadata: true // On a de vraies métadonnées
        //     }
        // ];
        // Dans ce cas, l'affichage sera : "La Nuit étoilée" par Vincent van Gogh
        console.log('Future: Sources avec métadonnées détaillées...');
    }
}

// Classe pour gérer les actualités de manière synchronisée avec swipe
class NewsManager {
    constructor() {
        this.newsFeeds = [];
        this.feedArticles = [];
        this.currentFeedIndex = 0;
        this.rssContainer = null;
        this.swipeIndicators = null;
        this.isSwipeEnabled = false;
        this.swipeState = {
            isDragging: false,
            startX: 0,
            currentX: 0,
            startTime: 0,
            initialTransform: 0
        };
    }    async loadFeedsConfig() {
        try {
            const response = await fetch('../../rss-feeds.json');
            const config = await response.json();
            this.newsFeeds = config.feeds || [];
            this.feedArticles = new Array(this.newsFeeds.length).fill(null);
            this.rssContainer = document.getElementById('rssContainer');
            this.swipeIndicators = document.getElementById('swipeIndicators');
            this.setupSwipeListeners();
            
            // Charger un article pour chaque flux RSS
            for (let i = 0; i < this.newsFeeds.length; i++) {
                this.feedArticles[i] = await this.tryFetchFeed(this.newsFeeds[i].url, this.newsFeeds[i]);
            }
            
            this.isSwipeEnabled = this.newsFeeds.length > 1;
            this.updateSwipeIndicators();
            
            // Afficher le premier article disponible
            if (this.feedArticles[this.currentFeedIndex]) {
                this.displayNews(this.feedArticles[this.currentFeedIndex]);
            }
        } catch (error) {
            console.error('Erreur lors du chargement de la configuration RSS:', error);
            this.newsFeeds = [];
        }
    }// Fonction pour tester les flux RSS au démarrage
    async testRssFeeds() {
        console.log('🔍 Test des flux RSS...');
        let workingFeeds = 0;
        
        for (const feed of this.newsFeeds) {
            try {
                const response = await fetch(feed.url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.contents) {
                        // Pré-validation du contenu XML
                        if (!data.contents.includes('<rss') && !data.contents.includes('<feed')) {
                            console.warn(`⚠️ ${feed.name} : Format RSS/Atom non détecté`);
                            continue;
                        }
                        
                        const parser = new DOMParser();
                        const xml = parser.parseFromString(data.contents, "application/xml");
                        
                        // Vérifier les erreurs de parsing
                        const parseError = xml.querySelector("parsererror");
                        if (parseError) {
                            console.warn(`⚠️ ${feed.name} : XML malformé`);
                            continue;
                        }
                        
                        // Essayer RSS puis Atom
                        let items = xml.querySelectorAll("item");
                        if (items.length === 0) {
                            items = xml.querySelectorAll("entry");
                        }
                        
                        if (items.length > 0) {
                            console.log(`✅ ${feed.name} : ${items.length} articles`);
                            workingFeeds++;
                        } else {
                            console.warn(`⚠️ ${feed.name} : Aucun article`);
                        }
                    } else {
                        console.warn(`⚠️ ${feed.name} : Données vides`);
                    }
                } else if (response.status === 429) {
                    console.warn(`⚠️ ${feed.name} : Limite de débit`);
                } else if (response.status >= 400 && response.status < 500) {
                    console.warn(`⚠️ ${feed.name} : Erreur client HTTP ${response.status}`);
                } else if (response.status >= 500) {
                    console.warn(`⚠️ ${feed.name} : Erreur serveur HTTP ${response.status}`);
                } else {
                    console.warn(`⚠️ ${feed.name} : HTTP ${response.status}`);
                }
            } catch (error) {
                if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                    console.warn(`❌ ${feed.name} : Connexion impossible`);
                } else {
                    console.warn(`❌ ${feed.name} : ${error.message}`);
                }
            }
        }
        
        console.log(`📊 Résultat : ✅ ${workingFeeds}/${this.newsFeeds.length} flux fonctionnels`);
        
        if (workingFeeds === 0) {
            console.error('⚠️ Aucun flux RSS fonctionnel ! Vérifiez votre connexion internet.');
        } else if (workingFeeds < this.newsFeeds.length / 2) {
            console.warn(`⚠️ Moins de 50% des flux RSS fonctionnent (${workingFeeds}/${this.newsFeeds.length})`);
        }
    }async tryFetchFeed(url, feed) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.contents) {
                throw new Error('Pas de contenu dans la réponse');
            }
            
            const text = data.contents;
            
            // Pré-validation du contenu XML
            if (!text.includes('<rss') && !text.includes('<feed')) {
                throw new Error('Format RSS/Atom non détecté');
            }
            
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "application/xml");
            
            // Vérifier s'il y a des erreurs de parsing XML
            const parseError = xml.querySelector("parsererror");
            if (parseError) {
                throw new Error('Erreur de parsing XML');
            }
            
            // Essayer RSS 2.0 d'abord, puis Atom
            let items = xml.querySelectorAll("item");
            if (items.length === 0) {
                items = xml.querySelectorAll("entry"); // Format Atom
            }            if (items.length > 0) {
                // Prendre le premier article disponible
                const item = items[0];
                
                // Support RSS et Atom
                const title = item.querySelector("title")?.textContent?.trim();
                const description = item.querySelector("description")?.textContent?.trim() || 
                                 item.querySelector("summary")?.textContent?.trim() ||
                                 item.querySelector("content")?.textContent?.trim();
                const link = item.querySelector("link")?.textContent?.trim() || 
                           item.querySelector("link")?.getAttribute("href");
                const pubDate = item.querySelector("pubDate")?.textContent?.trim() ||
                              item.querySelector("published")?.textContent?.trim() ||
                              item.querySelector("updated")?.textContent?.trim();

                if (title) {
                    return {
                        title,
                        description: description ? (description.length > 1500 ? description.substring(0, 1500) + "... [Lire la suite]" : description) : "",
                        link: link || "#",
                        pubDate: pubDate ? this.formatDate(pubDate) : "",
                        feed
                    };
                }
            } else {
                throw new Error('Aucun article trouvé dans le flux');
            }} catch (error) {
            // Log plus silencieux pour les erreurs courantes
            if (error.message.includes('429') || error.message.includes('HTTP 429')) {
                console.warn(`⚠️ ${feed.name}: Limite de débit atteinte`);
            } else if (error.message.includes('parsing XML') || error.message.includes('Format RSS')) {
                console.warn(`⚠️ ${feed.name}: Flux XML malformé`);
            } else if (error.message.includes('HTTP 40')) {
                console.warn(`⚠️ ${feed.name}: Erreur client (${error.message})`);
            } else if (error.message.includes('HTTP 50')) {
                console.warn(`⚠️ ${feed.name}: Erreur serveur (${error.message})`);
            } else if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
                console.warn(`⚠️ ${feed.name}: Problème de réseau/CORS`);
            } else if (error.message.includes('Content-Length')) {
                console.warn(`⚠️ ${feed.name}: Problème de taille de contenu`);
            } else {
                console.warn(`⚠️ ${feed.name}: ${error.message}`);
            }
        }
        
        return null;
    }

    moveToNextFeed() {
        this.currentFeedIndex = (this.currentFeedIndex + 1) % this.newsFeeds.length;
    }    cleanUsedArticles() {
        // Cette méthode n'est plus nécessaire avec la nouvelle logique
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            return date.toLocaleDateString('fr-FR', options);
        } catch (error) {
            return dateString;
        }
    }

    // Configuration des listeners de swipe
    setupSwipeListeners() {
        if (!this.rssContainer) return;

        // Événements souris
        this.rssContainer.addEventListener('mousedown', (e) => this.handleStart(e.clientX, e));
        document.addEventListener('mousemove', (e) => this.handleMove(e.clientX, e));
        document.addEventListener('mouseup', (e) => this.handleEnd(e));

        // Événements tactiles
        this.rssContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleStart(e.touches[0].clientX, e);
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (this.swipeState.isDragging) {
                e.preventDefault();
                this.handleMove(e.touches[0].clientX, e);
            }
        }, { passive: false });
          document.addEventListener('touchend', (e) => this.handleEnd(e));

        this.rssContainer.addEventListener('selectstart', (e) => e.preventDefault());
    }

    handleStart(clientX, event) {
        if (!this.isSwipeEnabled) return;
        
        this.swipeState.isDragging = true;
        this.swipeState.startX = clientX;
        this.swipeState.currentX = clientX;
        this.swipeState.startTime = Date.now();
        this.swipeState.initialTransform = 0;
        
        this.rssContainer.style.transition = 'none';
        this.rssContainer.style.cursor = 'grabbing';
        this.rssContainer.style.opacity = '1';
        this.rssContainer.style.filter = 'none';
    }

    handleMove(clientX, event) {
        if (!this.swipeState.isDragging || !this.isSwipeEnabled) return;
        
        this.swipeState.currentX = clientX;
        const deltaX = clientX - this.swipeState.startX;
        
        const maxDelta = window.innerWidth * 0.3;
        const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaX));
        
        const progress = Math.abs(clampedDelta) / maxDelta;
        const resistance = 1 - Math.pow(progress, 2) * 0.6;
        const finalDelta = clampedDelta * resistance;
        
        const fadeProgress = Math.abs(finalDelta) / (maxDelta * 0.8);
        const opacity = Math.max(0.1, 1 - Math.pow(fadeProgress, 1.5));
        
        this.rssContainer.style.transform = `translateY(-50%) translateX(${finalDelta}px)`;
        this.rssContainer.style.opacity = opacity.toString();
          const swipeThreshold = maxDelta * 0.6;
        if (Math.abs(finalDelta) > swipeThreshold) {
            this.rssContainer.style.filter = `blur(${(Math.abs(finalDelta) - swipeThreshold) / swipeThreshold}px)`;
        } else {
            this.rssContainer.style.filter = 'none';
        }
    }    handleEnd(event) {
        if (!this.swipeState.isDragging || !this.isSwipeEnabled) return;
        
        this.swipeState.isDragging = false;
        this.rssContainer.style.cursor = 'grab';
        
        const deltaX = this.swipeState.currentX - this.swipeState.startX;
        const deltaTime = Date.now() - this.swipeState.startTime;
        const velocity = Math.abs(deltaX) / deltaTime;
        
        const minDistance = 50;
        const minVelocity = 0.3;
        if ((Math.abs(deltaX) > minDistance || velocity > minVelocity) && this.newsFeeds.length > 1) {
            if (deltaX > 0) {
                // Swipe vers la droite -> flux précédent
                this.showPreviousFeed();
            } else {
                // Swipe vers la gauche -> flux suivant
                this.showNextFeed();
            }        } else {
            // Retour à la position originale si le swipe n'est pas assez fort
            this.resetSwipePosition();
        }
    }

    resetSwipePosition() {
        this.rssContainer.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out, filter 0.3s ease-out';
        this.rssContainer.style.transform = 'translateY(-50%) translateX(0)';
        this.rssContainer.style.opacity = '1';
        this.rssContainer.style.filter = 'none';
    }

    async showNextFeed() {
        this.currentFeedIndex = (this.currentFeedIndex + 1) % this.newsFeeds.length;
        await this.displayCurrentFeed('left');
        this.updateSwipeIndicators();
        resetBackgroundTimer();
    }

    async showPreviousFeed() {
        this.currentFeedIndex = (this.currentFeedIndex - 1 + this.newsFeeds.length) % this.newsFeeds.length;
        await this.displayCurrentFeed('right');
        this.updateSwipeIndicators();
        resetBackgroundTimer();
    }

    async displayCurrentFeed(direction = null) {
        const idx = this.currentFeedIndex;
        let article = this.feedArticles[idx];
        if (!article) {
            article = await this.tryFetchFeed(this.newsFeeds[idx].url, this.newsFeeds[idx]);
            this.feedArticles[idx] = article;
        }
        if (article) {
            // Obtenir un nouveau wallpaper pour la transition unifiée
            const wallpaper = await artDB.getRandomArtwork();
            if (wallpaper && direction) {
                await this.displayUnifiedSwipeContent(wallpaper, article, direction);
            } else {
                this.displayNewsWithAnimation(article, direction);
            }
        }
    }

    // Fonction pour afficher le contenu unifié lors d'un swipe avec animation directionnelle
    async displayUnifiedSwipeContent(wallpaper, article, direction) {
        try {
            // Précharger l'image
            const imageUrl = await preloadImage(wallpaper.imageUrl);
              // Animation de sortie selon la direction
            this.rssContainer.style.transition = 'opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            background.style.transition = 'opacity 0.15s ease-out';
            
            this.rssContainer.style.opacity = '0';
            background.style.opacity = '0';
            
            if (direction === 'left') {
                this.rssContainer.style.transform = 'translateY(-50%) translateX(-100%)';
            } else if (direction === 'right') {
                this.rssContainer.style.transform = 'translateY(-50%) translateX(100%)';
            }
              setTimeout(() => {
                // Changer l'arrière-plan
                background.style.backgroundImage = `url(${imageUrl})`;
                
                // Mettre à jour les métadonnées
                let metadataText = '';
                if (wallpaper.artist) {
                    if (wallpaper.artist === 'Picsum Photos') {
                        metadataText = 'Picsum';
                    } else if (wallpaper.artist === 'Unsplash') {
                        metadataText = 'Unsplash';
                    } else if (wallpaper.artist === 'Picsum ID') {
                        metadataText = 'Picsum ID';
                    } else {
                        metadataText = wallpaper.artist;
                    }
                }
                metadataDisplay.textContent = metadataText;
                
                // Changer le contenu RSS
                this.rssContainer.innerHTML = `
                    <div class="rss-card">
                        <div class="rss-logo-container">
                            <img src="${article.feed.logo}" alt="${article.feed.name}" class="rss-logo">
                            <div class="rss-source-name">${article.feed.name}</div>
                        </div>
                        <div class="rss-content">
                            <div class="rss-title">${article.title}</div>
                            <div class="rss-date">${article.pubDate}</div>
                            <div class="rss-description">${article.description}</div>
                        </div>
                        <button class="rss-open-link" onclick="window.open('${article.link}', '_blank')" title="Ouvrir l'article">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                `;
                
                // Positionner pour l'animation d'entrée
                const initialTransform = direction === 'left' ? 
                    'translateY(-50%) translateX(100%)' : 
                    'translateY(-50%) translateX(-100%)';
                  this.rssContainer.style.transform = initialTransform;
                this.rssContainer.style.opacity = '0';
                this.rssContainer.style.filter = 'none';
                
                requestAnimationFrame(() => {
                    this.rssContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                    background.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                    
                    this.rssContainer.style.transform = 'translateY(-50%) translateX(0)';
                    this.rssContainer.style.opacity = '1';
                    background.style.opacity = '1';
                    
                    // Restaurer les transitions normales après l'animation
                    setTimeout(() => {
                        this.rssContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
                        background.style.transition = 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
                    }, 200);
                });
            }, 150);
            
        } catch (error) {            console.error('Erreur lors de la transition swipe unifiée:', error);
            // Fallback sur displayNewsWithAnimation
            this.displayNewsWithAnimation(article, direction);
        }
    }updateSwipeIndicators() {
        if (!this.swipeIndicators || this.newsFeeds.length <= 1) {
            if (this.swipeIndicators) {
                this.swipeIndicators.style.display = 'none';
            }
            return;
        }
        this.swipeIndicators.style.display = 'flex';
        this.swipeIndicators.innerHTML = '';
        for (let i = 0; i < this.newsFeeds.length; i++) {
            const dot = document.createElement('div');
            dot.className = `swipe-dot ${i === this.currentFeedIndex ? 'active' : ''}`;
            this.swipeIndicators.appendChild(dot);
        }
    }displayNews(article) {
        if (!article || !this.rssContainer) return;

        this.rssContainer.style.opacity = '0';
          setTimeout(() => {
            this.rssContainer.innerHTML = `
                <div class="rss-card">
                    <div class="rss-logo-container">
                        <img src="${article.feed.logo}" alt="${article.feed.name}" class="rss-logo">
                        <div class="rss-source-name">${article.feed.name}</div>
                    </div>
                    <div class="rss-content">
                        <div class="rss-title">${article.title}</div>
                        <div class="rss-date">${article.pubDate}</div>
                        <div class="rss-description">${article.description}</div>
                    </div>
                    <button class="rss-open-link" onclick="window.open('${article.link}', '_blank')" title="Ouvrir l'article">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>
            `;
            
            this.rssContainer.style.opacity = '1';
        }, 300);
    }

    displayNewsWithAnimation(article, direction = null) {
        if (!article || !this.rssContainer) return;

        // Préparer l'animation selon la direction
        let initialTransform = '';
        let finalTransform = 'translateY(-50%) translateX(0)';
        
        if (direction === 'left') {
            // Nouvel article arrive de la droite
            initialTransform = 'translateY(-50%) translateX(100%)';
        } else if (direction === 'right') {
            // Nouvel article arrive de la gauche
            initialTransform = 'translateY(-50%) translateX(-100%)';
        } else {
            // Pas d'animation directionnelle, juste fade
            initialTransform = 'translateY(-50%) translateX(0)';
        }        // Phase 1: Faire disparaître l'article actuel avec transition rapide
        this.rssContainer.style.transition = 'opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        this.rssContainer.style.opacity = '0';
        
        if (direction === 'left') {
            this.rssContainer.style.transform = 'translateY(-50%) translateX(-100%)';
        } else if (direction === 'right') {
            this.rssContainer.style.transform = 'translateY(-50%) translateX(100%)';
        }
          setTimeout(() => {
            // Phase 2: Changer le contenu et positionner le nouvel article
            this.rssContainer.innerHTML = `
                <div class="rss-card">
                    <div class="rss-logo-container">
                        <img src="${article.feed.logo}" alt="${article.feed.name}" class="rss-logo">
                        <div class="rss-source-name">${article.feed.name}</div>
                    </div>
                    <div class="rss-content">
                        <div class="rss-title">${article.title}</div>
                        <div class="rss-date">${article.pubDate}</div>
                        <div class="rss-description">${article.description}</div>
                    </div>
                    <button class="rss-open-link" onclick="window.open('${article.link}', '_blank')" title="Ouvrir l'article">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>
            `;
            
            // Positionner le nouvel article hors écran selon la direction
            this.rssContainer.style.transform = initialTransform;
            this.rssContainer.style.opacity = '0';
              // Phase 3: Animer l'entrée du nouvel article instantanément
            requestAnimationFrame(() => {
                this.rssContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                this.rssContainer.style.transform = finalTransform;
                this.rssContainer.style.opacity = '1';
                
                // Restaurer la transition normale après l'animation
                setTimeout(() => {
                    this.rssContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
                }, 200);
            });
        }, direction ? 150 : 100);
    }
}

// Initialiser les gestionnaires
let artDB, newsManager, background, metadataDisplay;
let backgroundChangeInterval = null; // Référence à l'intervalle de changement d'arrière-plan

// Fonction d'initialisation des gestionnaires
function initializeManagers() {
    artDB = new ArtDatabase();
    newsManager = new NewsManager();
    newsManager.loadFeedsConfig(); // Initialiser les flux RSS
    background = document.getElementById('background');
    metadataDisplay = document.getElementById('metadata');
    
    // Vérifier que les éléments DOM sont disponibles
    if (!background) {
        console.error('Élément background non trouvé dans le DOM');
    }    if (!metadataDisplay) {
        console.error('Élément metadata non trouvé dans le DOM');
    }
}

// Fonction pour réinitialiser seulement le timer (utilisée après un swipe)
function resetBackgroundTimer() {
    // Arrêter l'ancien intervalle s'il existe
    if (backgroundChangeInterval) {
        clearInterval(backgroundChangeInterval);
    }
    
    // Redémarrer l'intervalle de 30 secondes avec la transition unifiée
    backgroundChangeInterval = setInterval(unifiedTransition, 30000);
}

// Fonction pour réinitialiser le cycle avec changement immédiat (utilisée au démarrage)
function resetBackgroundCycle() {
    // Arrêter l'ancien intervalle s'il existe
    if (backgroundChangeInterval) {
        clearInterval(backgroundChangeInterval);
    }
    
    // Déclencher immédiatement un changement avec l'ancienne méthode (pour compatibilité)
    changeBackground();
    
    // Redémarrer l'intervalle de 30 secondes avec la transition unifiée
    backgroundChangeInterval = setInterval(unifiedTransition, 30000);
}

// Fonction pour précharger une image
function preloadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        
        // Délai de timeout pour éviter les blocages
        const timeoutId = setTimeout(() => {
            resolve(url); // Toujours resolve, pas de log d'erreur
        }, 5000); // 5 secondes de timeout
        
        img.onload = () => {
            clearTimeout(timeoutId);
            resolve(url);
        };
        
        img.onerror = () => {
            clearTimeout(timeoutId);
            resolve(url); // Toujours resolve, pas de log d'erreur
        };
        
        // Essayer de charger l'image
        img.crossOrigin = 'anonymous'; // Tenter de résoudre CORS
        img.src = url;
    });
}

async function initBackground() {
    console.log('Initialisation des wallpapers haute qualité...');
    // Initialiser la base de données de wallpapers
    const dbInitialized = await artDB.initializeDatabase();
    if (!dbInitialized) {
        console.error('Impossible d\'initialiser la base de données de wallpapers');
        return;
    }
    // Charger le premier wallpaper
    await changeBackground();
}

async function changeBackground() {
    if (DEBUG_MODE) {
        console.log('Changement de wallpaper...');
    }
    
    const wallpaper = await artDB.getRandomArtwork();
    if (!wallpaper) {
        console.warn('Aucun wallpaper récupéré, abandon.');
        return;
    }
    
    await displayArtwork(wallpaper);
}

// Fonction de transition unifiée pour le cycle automatique (change RSS + arrière-plan)
async function unifiedTransition() {
    if (DEBUG_MODE) {
        console.log('Transition unifiée (RSS + arrière-plan)...');
    }
    
    // Changer l'arrière-plan
    const wallpaper = await artDB.getRandomArtwork();
    if (!wallpaper) {
        console.warn('Aucun wallpaper récupéré pour la transition unifiée.');
        return;
    }
    
    // Changer vers le prochain flux RSS automatiquement
    if (newsManager.newsFeeds.length > 1) {
        newsManager.currentFeedIndex = (newsManager.currentFeedIndex + 1) % newsManager.newsFeeds.length;
        const nextArticle = newsManager.feedArticles[newsManager.currentFeedIndex];
        
        if (nextArticle) {
            // Afficher le nouveau contenu de manière synchronisée
            await displayUnifiedContent(wallpaper, nextArticle);
            newsManager.updateSwipeIndicators();
        } else {
            // Fallback si pas d'article pour ce flux
            await displayArtwork(wallpaper);
        }
    } else {
        // Fallback si un seul flux RSS
        await displayArtwork(wallpaper);
    }
}

// Fonction pour afficher le contenu de manière synchronisée (arrière-plan + RSS)
async function displayUnifiedContent(wallpaper, article) {
    try {
        // Vérifier que les éléments DOM existent
        if (!background || !metadataDisplay || !newsManager.rssContainer) {
            console.error('Éléments DOM manquants pour la transition unifiée');
            return;
        }

        // Précharger l'image avant de l'afficher
        const imageUrl = await preloadImage(wallpaper.imageUrl);
        
        // Commencer la transition simultanée
        background.style.opacity = '0';
        newsManager.rssContainer.style.opacity = '0';
        
        setTimeout(async () => {
            // Changer l'image d'arrière-plan
            background.style.backgroundImage = `url(${imageUrl})`;
            
            // Afficher les métadonnées du wallpaper
            let metadataText = '';
            if (wallpaper.hasMetadata && wallpaper.title && wallpaper.artist && wallpaper.title !== wallpaper.artist) {
                metadataText = `"${wallpaper.title}" par ${wallpaper.artist}`;
            } else if (wallpaper.artist) {
                // Simplifier les noms des sources
                if (wallpaper.artist === 'Picsum Photos') {
                    metadataText = 'Picsum';
                } else if (wallpaper.artist === 'Unsplash') {
                    metadataText = 'Unsplash';
                } else if (wallpaper.artist === 'Picsum ID') {
                    metadataText = 'Picsum ID';
                } else {
                    metadataText = wallpaper.artist;
                }
            }
            metadataDisplay.textContent = metadataText;
            
            // Changer le contenu RSS
            newsManager.rssContainer.innerHTML = `
                <div class="rss-card">
                    <div class="rss-logo-container">
                        <img src="${article.feed.logo}" alt="${article.feed.name}" class="rss-logo">
                        <div class="rss-source-name">${article.feed.name}</div>
                    </div>
                    <div class="rss-content">
                        <div class="rss-title">${article.title}</div>
                        <div class="rss-date">${article.pubDate}</div>
                        <div class="rss-description">${article.description}</div>
                    </div>
                    <button class="rss-open-link" onclick="window.open('${article.link}', '_blank')" title="Ouvrir l'article">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>
            `;
            
            // Faire réapparaître les éléments
            background.style.opacity = '1';
            newsManager.rssContainer.style.opacity = '1';
        }, 1000);
        
    } catch (error) {
        console.error('Erreur lors de la transition unifiée:', error);
    }
}

async function displayArtwork(artwork) {
    try {
        // Vérifier que les éléments DOM existent
        if (!background || !metadataDisplay) {
            console.error('Éléments DOM manquants pour l\'affichage:', {
                background: !!background,
                metadataDisplay: !!metadataDisplay
            });
            return;
        }

        // Précharger l'image avant de l'afficher
        const imageUrl = await preloadImage(artwork.imageUrl);
        
        // Commencer la transition de l'image et des actualités simultanément
        background.style.opacity = '0';
          // Récupérer une nouvelle actualité en parallèle
        const currentArticle = newsManager.feedArticles[newsManager.currentFeedIndex];
        
        setTimeout(async () => {
            // Changer l'image d'arrière-plan
            background.style.backgroundImage = `url(${imageUrl})`;// Afficher les métadonnées du wallpaper
            let metadataText = '';
            
            // Si c'est une source avec métadonnées détaillées (titre et artiste spécifiques)
            if (artwork.hasMetadata && artwork.title && artwork.artist && artwork.title !== artwork.artist) {
                metadataText = `"${artwork.title}" par ${artwork.artist}`;
            }            // Sinon, afficher seulement le nom simplifié de la source
            else if (artwork.artist) {
                // Simplifier les noms des sources
                if (artwork.artist === 'Picsum Photos') {
                    metadataText = 'Picsum';
                } else if (artwork.artist === 'LoremFlickr') {
                    metadataText = 'LoremFlickr';                } else if (artwork.artist === 'Unsplash') {
                    metadataText = 'Unsplash';
                } else if (artwork.artist === 'Lorem Pixel') {
                    metadataText = 'Lorem Pixel';
                } else if (artwork.artist === 'DummyImage') {
                    metadataText = 'DummyImage';
                } else if (artwork.artist === 'Picsum ID') {
                    metadataText = 'Picsum ID';
                } else {
                    metadataText = artwork.artist;
                }
            }
            
            metadataDisplay.textContent = metadataText;
            background.style.opacity = '1';              // Afficher la nouvelle actualité
            if (currentArticle) {
                newsManager.displayNews(currentArticle);
                if (DEBUG_MODE) {
                    console.log('Nouveau wallpaper et actualité synchronisés:', artwork.title, '-', currentArticle.title);
                }
            } else if (DEBUG_MODE) {
                console.warn('Aucune actualité disponible pour cette transition');
            }
        }, 1000);
        
    } catch (error) {
        console.error('Erreur lors du chargement du wallpaper:', error);
        // Réessayer avec un autre wallpaper dans 2 secondes
        setTimeout(changeBackground, 2000);
    }
}

// Gestion du temps et de la date
function updateTimeAndDate() {
    try {
        const now = new Date();
        const optionsTime = { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit' };
        const timeElement = document.getElementById('time');
        const dateElement = document.getElementById('date');
        
        if (timeElement) {
            timeElement.textContent = new Intl.DateTimeFormat('fr-FR', optionsTime).format(now);
        }
        
        if (dateElement) {
            const optionsDate = { weekday: 'long', day: 'numeric', month: 'long' };
            dateElement.textContent = new Intl.DateTimeFormat('fr-FR', optionsDate).format(now);
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour de l\'heure et de la date:', error);
    }
}

// Gestion de la météo
async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=16.3&longitude=-61.8&current_weather=true');
        const data = await response.json();
        const temperature = Math.round(data.current_weather.temperature);
        const weatherCode = data.current_weather.weathercode;
        
        const temperatureElement = document.getElementById('temperature');
        const weatherIconElement = document.getElementById('weather-icon');
        
        if (temperatureElement) {
            temperatureElement.textContent = `${temperature}°`;
        }
        
        if (weatherIconElement) {
            weatherIconElement.className = `fa-solid ${getWeatherIcon(weatherCode)}`;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des données météo:", error);
        
        // Fallback en cas d'erreur
        const temperatureElement = document.getElementById('temperature');
        const weatherIconElement = document.getElementById('weather-icon');
        
        if (temperatureElement) {
            temperatureElement.textContent = '--°';
        }
        
        if (weatherIconElement) {
            weatherIconElement.className = 'fa-solid fa-cloud';
        }
    }
}

function getWeatherIcon(weatherCode) {
    switch (weatherCode) {
        case 0: return 'fa-sun';
        case 1: case 2: case 3: return 'fa-cloud-sun';
        case 45: case 48: return 'fa-smog';
        case 51: case 53: case 55: return 'fa-cloud-drizzle';
        case 61: case 63: case 65: return 'fa-cloud-rain';
        case 71: case 73: case 75: return 'fa-snowflake';
        case 80: case 81: case 82: return 'fa-cloud-showers-heavy';
        case 95: case 96: case 99: return 'fa-cloud-bolt';
        default: return 'fa-cloud';
    }
}

// Fonction pour tester les sources d'images au démarrage
async function testImageSources() {
    console.log('🔍 Test des sources d\'images...');
    let totalWallpapers = 0;
    
    for (const [sourceKey, source] of Object.entries(imageSources)) {
        try {
            // Compter les wallpapers générés pour cette source
            const sourceWallpapers = source.categories.length * (sourceConfig?.settings?.wallpapersPerCategory || 4);
            totalWallpapers += sourceWallpapers;
            
            // Test simple de génération d'URL
            const testUrl = source.generateUrl(100, 100, source.categories[0], 9999);
            if (testUrl) {
                console.log(`✅ ${source.name} : ${sourceWallpapers} wallpapers générés`);
            } else {
                console.warn(`⚠️ ${source.name} : Erreur de génération d'URL`);
            }
        } catch (error) {
            console.warn(`❌ ${source.name} : Erreur de configuration`);
        }
    }
    
    console.log(`📊 Total : ${totalWallpapers} wallpapers de ${Object.keys(imageSources).length} sources`);
}

// Initialisation complète
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser les gestionnaires DOM
    initializeManagers();
    
    // Initialiser le temps et la météo
    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);
      fetchWeather();
    setInterval(fetchWeather, 1800000); // 30 minutes
      // Initialiser l'arrière-plan et les actualités
    initBackground();
    backgroundChangeInterval = setInterval(unifiedTransition, 30000); // 30 secondes avec transition unifiée
});
