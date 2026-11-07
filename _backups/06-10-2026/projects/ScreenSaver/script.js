let imageSources = {}, sourceConfig = null, artDB, newsManager, background, metadataDisplay, backgroundChangeInterval = null;

const DEBUG_MODE = false;

// Charge la configuration JSON des images
async function loadImageSourcesConfig() {
    try {
        const response = await fetch('image-sources.json');
        sourceConfig = await response.json();
        imageSources = {};
        
        for (const [key, src] of Object.entries(sourceConfig.sources)) {
            if (src.enabled) {
                imageSources[key] = {
                    name: src.displayName,
                    baseUrl: src.baseUrl,
                    categories: src.categories,
                    type: src.type,
                    generateUrl: createUrlGenerator(src)
                };
            }
        }
        return true;
    } catch (e) {
        console.error('Erreur config JSON:', e);
        return false;
    }
}

// Générateur d'URL dynamique selon le type de source
function createUrlGenerator({ baseUrl, config, type }) {
    return (w, h, cat, seed = Math.floor(Math.random() * 10000)) => {
        let pattern = config.urlPattern.replace(/{baseUrl}/g, baseUrl).replace(/{width}/g, w).replace(/{height}/g, h);
        switch (type) {
            case 'random':   return pattern.replace(/{seed}/g, seed);
            case 'category': return pattern.replace(/{category}/g, cat).replace(/{seed}/g, seed);
            case 'id':       return pattern.replace(/{id}/g, config.idRange ? Math.floor(Math.random() * (config.idRange[1] - config.idRange[0] + 1)) + config.idRange[0] : seed);
            case 'color':
                const col = (config.colors ?? ['3498db'])[Math.floor(Math.random() * (config.colors ?? []).length)];
                return pattern.replace(/{color}/g, col).replace(/{textColor}/g, config.textColor ?? 'ffffff').replace(/{text}/g, encodeURIComponent(config.text ?? 'HD Design'));
            default:         return `${baseUrl}/${w}/${h}?random=${seed}`;
        }
    };
}

class ArtDatabase {
    constructor() {
        this.wallpapers = [];
        this.isLoading = false;
    }

    async initializeDatabase() {
        try {
            if (!await loadImageSourcesConfig()) throw new Error();
            const { width, height } = sourceConfig.settings.defaultDimensions;
            const perCat = sourceConfig.settings.wallpapersPerCategory;
            
            for (const [key, src] of Object.entries(imageSources)) {
                for (const cat of src.categories) {
                    for (let j = 0; j < perCat; j++) {
                        this.wallpapers.push({
                            imageUrl: src.generateUrl(width, height, cat, Math.floor(Math.random() * 10000) + j),
                            artist: src.name,
                            classification: cat,
                            source: key,
                            hasMetadata: false
                        });
                    }
                }
            }
            return this.wallpapers.length > 0;
        } catch (e) {
            return false;
        }
    }

    async getRandomArtwork() {
        if (!this.wallpapers.length || this.isLoading) return null;
        this.isLoading = true;
        if (Math.random() < 0.1) this.shuffleArray(this.wallpapers);
        
        const wp = this.wallpapers[Math.floor(Math.random() * this.wallpapers.length)];
        this.isLoading = false;
        return wp;
    }

    shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}

class NewsManager {
    constructor() {
        this.newsFeeds = [];
        this.feedArticles = [];
        this.currentFeedIndex = 0;
        this.rssContainer = null;
        this.swipeIndicators = null;
        this.isSwipeEnabled = false;
        this.swipeState = { isDragging: false, startX: 0, currentX: 0, startTime: 0 };
    }

    async loadFeedsConfig() {
        try {
            const res = await fetch('rss-feeds.json');
            this.newsFeeds = (await res.json()).feeds ?? [];
            this.feedArticles = new Array(this.newsFeeds.length).fill(null);
            this.rssContainer = document.getElementById('rssContainer');
            this.swipeIndicators = document.getElementById('swipeIndicators');
            this.setupSwipeListeners();
            
            for (let i = 0; i < this.newsFeeds.length; i++) {
                this.feedArticles[i] = await this.tryFetchFeed(this.newsFeeds[i].url, this.newsFeeds[i]);
            }
            this.isSwipeEnabled = this.newsFeeds.length > 1;
            this.updateSwipeIndicators();
            if (this.feedArticles[this.currentFeedIndex]) this.displayNews(this.feedArticles[this.currentFeedIndex]);
        } catch (e) {
            console.error('Erreur RSS config:', e);
        }
    }

    async tryFetchFeed(url, feed) {
        try {
            // Remplace l'URL ci-dessous par l'adresse de ton Worker Cloudflare déployé
            const workerUrl = `https://screensaver.leotoskuepro.workers.dev/?url=${encodeURIComponent(url)}`;
            
            const res = await fetch(workerUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            return {
                title: data.title,
                description: data.description,
                link: data.link,
                pubDate: data.pubDate ? this.formatDate(data.pubDate) : "",
                feed: feed 
            };
        } catch (e) {
            console.warn(`Flux indisponible via Worker pour : ${feed.name}`, e);
            return null;
        }
    }

    formatDate(dateStr) {
        try {
            return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateStr;
        }
    }

    setupSwipeListeners() {
        if (!this.rssContainer) return;
        
        const start = (x, e) => {
            if (!this.isSwipeEnabled) return;
            this.swipeState = { isDragging: true, startX: x, currentX: x, startTime: Date.now() };
            Object.assign(this.rssContainer.style, { transition: 'none', cursor: 'grabbing', opacity: '1', filter: 'none' });
        };
        
        const move = (x, e) => {
            if (!this.swipeState.isDragging || !this.isSwipeEnabled) return;
            this.swipeState.currentX = x;
            const deltaX = x - this.swipeState.startX;
            const maxDelta = window.innerWidth * 0.3;
            const clamped = Math.max(-maxDelta, Math.min(maxDelta, deltaX));
            const finalDelta = clamped * (1 - Math.pow(Math.abs(clamped) / maxDelta, 2) * 0.6);
            
            this.rssContainer.style.transform = `translateY(-50%) translateX(${finalDelta}px)`;
            this.rssContainer.style.opacity = Math.max(0.1, 1 - Math.pow(Math.abs(finalDelta) / (maxDelta * 0.8), 1.5)).toString();
            this.rssContainer.style.filter = Math.abs(finalDelta) > maxDelta * 0.6 ? `blur(${(Math.abs(finalDelta) - maxDelta * 0.6) / (maxDelta * 0.6)}px)` : 'none';
        };
        
        const end = (e) => {
            if (!this.swipeState.isDragging || !this.isSwipeEnabled) return;
            this.swipeState.isDragging = false;
            this.rssContainer.style.cursor = 'grab';
            const deltaX = this.swipeState.currentX - this.swipeState.startX;
            const v = Math.abs(deltaX) / (Date.now() - this.swipeState.startTime);
            
            if ((Math.abs(deltaX) > 50 || v > 0.3) && this.newsFeeds.length > 1) {
                deltaX > 0 ? this.showPreviousFeed() : this.showNextFeed();
            } else {
                this.resetSwipePosition();
            }
        };

        this.rssContainer.addEventListener('mousedown', e => start(e.clientX, e));
        document.addEventListener('mousemove', e => move(e.clientX, e));
        document.addEventListener('mouseup', end);
        
        this.rssContainer.addEventListener('touchstart', e => { 
            e.preventDefault(); 
            start(e.touches[0].clientX, e); 
        }, { passive: false });
        
        document.addEventListener('touchmove', e => { 
            if (this.swipeState.isDragging) { 
                e.preventDefault(); 
                move(e.touches[0].clientX, e); 
            } 
        }, { passive: false });
        
        document.addEventListener('touchend', end);
        this.rssContainer.addEventListener('selectstart', e => e.preventDefault());
    }

    resetSwipePosition() {
        Object.assign(this.rssContainer.style, { transition: 'transform 0.3s ease-out, opacity 0.3s ease-out, filter 0.3s ease-out', transform: 'translateY(-50%) translateX(0)', opacity: '1', filter: 'none' });
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

    async displayCurrentFeed(dir = null) {
        let art = this.feedArticles[this.currentFeedIndex] ?? await this.tryFetchFeed(this.newsFeeds[this.currentFeedIndex].url, this.newsFeeds[this.currentFeedIndex]);
        this.feedArticles[this.currentFeedIndex] = art;
        if (!art) return;
        const wp = await artDB.getRandomArtwork();
        wp && dir ? await this.displayUnifiedSwipeContent(wp, art, dir) : this.displayNews(art, dir);
    }

    async displayUnifiedSwipeContent(wp, art, dir) {
        try {
            const imgUrl = await preloadImage(wp.imageUrl);
            Object.assign(this.rssContainer.style, { transition: 'opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', opacity: '0', transform: `translateY(-50%) translateX(${dir === 'left' ? '-100%' : '100%'})` });
            background.style.transition = 'opacity 0.15s ease-out';
            background.style.opacity = '0';
            
            setTimeout(() => {
                background.style.backgroundImage = `url(${imgUrl})`;
                metadataDisplay.textContent = simplifySourceName(wp.artist);
                this.displayNewsHtml(art);
                
                this.rssContainer.style.transform = `translateY(-50%) translateX(${dir === 'left' ? '100%' : '-100%'})`;
                this.rssContainer.style.opacity = '0';
                this.rssContainer.style.filter = 'none';
                
                requestAnimationFrame(() => {
                    Object.assign(this.rssContainer.style, { transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', transform: 'translateY(-50%) translateX(0)', opacity: '1' });
                    background.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                    background.style.opacity = '1';
                    setTimeout(() => {
                        this.rssContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
                        background.style.transition = 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
                    }, 200);
                });
            }, 150);
        } catch {
            this.displayNews(art, dir);
        }
    }

    updateSwipeIndicators() {
        if (!this.swipeIndicators) return;
        this.swipeIndicators.style.display = this.newsFeeds.length <= 1 ? 'none' : 'flex';
        this.swipeIndicators.innerHTML = this.newsFeeds.map((_, i) => `<div class="swipe-dot ${i === this.currentFeedIndex ? 'active' : ''}"></div>`).join('');
    }

    displayNewsHtml(art) {
        this.rssContainer.innerHTML = `
            <div class="rss-card">
                <div class="rss-logo-container">
                    <img src="${art.feed.logo}" alt="${art.feed.name}" class="rss-logo">
                    <div class="rss-source-name">${art.feed.name}</div>
                </div>
                <div class="rss-content">
                    <div class="rss-title">${art.title}</div>
                    <div class="rss-date">${art.pubDate}</div>
                    <div class="rss-description">${art.description}</div>
                </div>
                <button class="rss-open-link" onclick="window.open('${art.link}', '_blank')" title="Ouvrir l'article">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            </div>`;
    }

    displayNews(art, dir = null) {
        if (!art || !this.rssContainer) return;
        if (!dir) {
            this.rssContainer.style.opacity = '0';
            setTimeout(() => { this.displayNewsHtml(art); this.rssContainer.style.opacity = '1'; }, 300);
            return;
        }
        Object.assign(this.rssContainer.style, { transition: 'opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', opacity: '0', transform: `translateY(-50%) translateX(${dir === 'left' ? '-100%' : '100%'})` });
        
        setTimeout(() => {
            this.displayNewsHtml(art);
            this.rssContainer.style.transform = `translateY(-50%) translateX(${dir === 'left' ? '100%' : '-100%'})`;
            this.rssContainer.style.opacity = '0';
            requestAnimationFrame(() => {
                Object.assign(this.rssContainer.style, { transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', transform: 'translateY(-50%) translateX(0)', opacity: '1' });
                setTimeout(() => this.rssContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease', 200);
            });
        }, 150);
    }
}

function simplifySourceName(artist) {
    if (!artist) return '';
    const map = { 'Picsum Photos': 'Picsum', 'Unsplash': 'Unsplash', 'Picsum ID': 'Picsum ID', 'LoremFlickr': 'LoremFlickr', 'Lorem Pixel': 'Lorem Pixel', 'DummyImage': 'DummyImage' };
    return map[artist] ?? artist;
}

function resetBackgroundTimer() {
    if (backgroundChangeInterval) clearInterval(backgroundChangeInterval);
    backgroundChangeInterval = setInterval(unifiedTransition, 30000);
}

function preloadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        const t = setTimeout(() => resolve(url), 5000);
        img.onload = img.onerror = () => { clearTimeout(t); resolve(url); };
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
}

async function initBackground() {
    if (await artDB.initializeDatabase()) await changeBackground();
}

async function changeBackground() {
    const wp = await artDB.getRandomArtwork();
    if (wp) await displayArtwork(wp);
}

async function unifiedTransition() {
    const wp = await artDB.getRandomArtwork();
    if (!wp) return;
    
    if (newsManager.newsFeeds.length > 1) {
        newsManager.currentFeedIndex = (newsManager.currentFeedIndex + 1) % newsManager.newsFeeds.length;
        const art = newsManager.feedArticles[newsManager.currentFeedIndex];
        if (art) {
            await displayUnifiedContent(wp, art);
            newsManager.updateSwipeIndicators();
            return;
        }
    }
    await displayArtwork(wp);
}

async function displayUnifiedContent(wp, art) {
    try {
        const imgUrl = await preloadImage(wp.imageUrl);
        background.style.opacity = '0';
        newsManager.rssContainer.style.opacity = '0';
        
        setTimeout(() => {
            background.style.backgroundImage = `url(${imgUrl})`;
            metadataDisplay.textContent = wp.hasMetadata && wp.title && wp.artist && wp.title !== wp.artist ? `"${wp.title}" par ${wp.artist}` : simplifySourceName(wp.artist);
            newsManager.displayNewsHtml(art);
            background.style.opacity = '1';
            newsManager.rssContainer.style.opacity = '1';
        }, 1000);
    } catch (e) {
        console.error('Erreur transition unifiée:', e);
    }
}

async function displayArtwork(wp) {
    try {
        const imgUrl = await preloadImage(wp.imageUrl);
        background.style.opacity = '0';
        const art = newsManager.feedArticles[newsManager.currentFeedIndex];
        
        setTimeout(() => {
            background.style.backgroundImage = `url(${imgUrl})`;
            metadataDisplay.textContent = wp.hasMetadata && wp.title && wp.artist && wp.title !== wp.artist ? `"${wp.title}" par ${wp.artist}` : simplifySourceName(wp.artist);
            background.style.opacity = '1';
            if (art) newsManager.displayNews(art);
        }, 1000);
    } catch {
        setTimeout(changeBackground, 2000);
    }
}

function updateTimeAndDate() {
    try {
        const now = new Date();
        const timeEl = document.getElementById('time'), dateEl = document.getElementById('date');
        if (timeEl) timeEl.textContent = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(now);
        if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    } catch (e) {
        console.error('Erreur Date/Heure:', e);
    }
}

async function fetchWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=43.5&longitude=-7.0&current_weather=true');
        const data = await res.json();
        const tempEl = document.getElementById('temperature'), iconEl = document.getElementById('weather-icon');
        
        if (tempEl) tempEl.textContent = `${Math.round(data.current_weather.temperature)}°`;
        if (iconEl) iconEl.className = `fa-solid ${getWeatherIcon(data.current_weather.weathercode)}`;
    } catch {
        const tempEl = document.getElementById('temperature'), iconEl = document.getElementById('weather-icon');
        if (tempEl) tempEl.textContent = '--°';
        if (iconEl) iconEl.className = 'fa-solid fa-cloud';
    }
}

function getWeatherIcon(code) {
    const icons = {
        0: 'fa-sun', 1: 'fa-cloud-sun', 2: 'fa-cloud-sun', 3: 'fa-cloud-sun',
        45: 'fa-smog', 48: 'fa-smog', 51: 'fa-cloud-drizzle', 53: 'fa-cloud-drizzle', 55: 'fa-cloud-drizzle',
        61: 'fa-cloud-rain', 63: 'fa-cloud-rain', 65: 'fa-cloud-rain', 71: 'fa-snowflake', 73: 'fa-snowflake',
        75: 'fa-snowflake', 80: 'fa-cloud-showers-heavy', 81: 'fa-cloud-showers-heavy', 82: 'fa-cloud-showers-heavy',
        95: 'fa-cloud-bolt', 96: 'fa-cloud-bolt', 99: 'fa-cloud-bolt'
    };
    return icons[code] ?? 'fa-cloud';
}

document.addEventListener('DOMContentLoaded', () => {
    artDB = new ArtDatabase();
    newsManager = new NewsManager();
    newsManager.loadFeedsConfig();
    background = document.getElementById('background');
    metadataDisplay = document.getElementById('metadata');
    
    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);
    fetchWeather();
    setInterval(fetchWeather, 1800000);
    
    initBackground();
    backgroundChangeInterval = setInterval(unifiedTransition, 30000);
});