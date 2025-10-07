// Companies Manager - Gestionnaire des entreprises
class CompaniesManager {
    constructor() {
        this.companies = [];
        this.container = null;
    }

    // Charger les données des entreprises depuis le JSON
    async loadCompanies() {
        try {
            const response = await fetch('companies.json');
            const data = await response.json();
            this.companies = data.companies;
            return this.companies;
        } catch (error) {
            console.error('Erreur lors du chargement des entreprises:', error);
            return [];
        }
    }

    // Générer le CSS dynamique pour les entreprises
    generateCSS() {
        let css = '';
        this.companies.forEach((company, index) => {
            const cssClass = company.name.toLowerCase().replace(/\s+/g, '');
            if (index > 0) { // Le premier (RPP) utilise le style par défaut
                css += `
                .company-logo.${cssClass} {
                    background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]});
                    border: 1px solid ${company.colors[2]};
                }
                
                @media (max-width: 768px) {
                    .company-logo.${cssClass} {
                        background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]});
                        border: 1px solid ${company.colors[2]};
                    }
                }`;
            }
        });
        return css;
    }

    // Injecter le CSS dans la page
    injectCSS() {
        const css = this.generateCSS();
        const styleElement = document.createElement('style');
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    }

    // Créer l'élément HTML pour une entreprise
    createCompanyElement(company, index) {
        const img = document.createElement('img');
        img.src = company.logo;
        img.alt = company.name;
        const cssClass = company.name.toLowerCase().replace(/\s+/g, '');
        img.className = index === 0 ? 'company-logo' : `company-logo ${cssClass}`;
        img.setAttribute('data-company-name', company.name);
        return img;
    }

    // Rendre toutes les entreprises dans le conteneur
    renderCompanies(containerId = 'companies-logos') {
        this.container = document.querySelector(`.${containerId}`);
        if (!this.container) {
            console.error(`Conteneur ${containerId} non trouvé`);
            return;
        }

        // Vider le conteneur
        this.container.innerHTML = '';

        // Ajouter chaque entreprise
        this.companies.forEach((company, index) => {
            const element = this.createCompanyElement(company, index);
            this.container.appendChild(element);
        });
    }

    // Ajouter une nouvelle entreprise
    addCompany(companyData) {
        this.companies.push(companyData);
        this.injectCSS(); // Re-générer le CSS
        if (this.container) {
            const element = this.createCompanyElement(companyData, this.companies.length - 1);
            this.container.appendChild(element);
        }
    }

    // Supprimer une entreprise
    removeCompany(companyName) {
        this.companies = this.companies.filter(c => c.name !== companyName);
        const element = document.querySelector(`[data-company-name="${companyName}"]`);
        if (element) {
            element.remove();
        }
    }

    // Initialiser le gestionnaire
    async init() {
        await this.loadCompanies();
        this.injectCSS();
        this.renderCompanies();
    }

    // Obtenir une entreprise par nom
    getCompany(name) {
        return this.companies.find(c => c.name === name);
    }

    // Obtenir toutes les entreprises
    getAllCompanies() {
        return this.companies;
    }
}

// Instance globale du gestionnaire
const companiesManager = new CompaniesManager();

function isMobileDevice() {
    return (
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0) ||
        (window.innerWidth <= 1024 && window.orientation !== undefined)
    );
}

function forceMobileStyles() {
    if (isMobileDevice()) {
        document.body.classList.add('force-mobile');
        const desktopElements = document.querySelectorAll('.link, .download');
        desktopElements.forEach(el => {
            el.style.display = 'none';
        });
        const mobileElements = document.querySelectorAll('.link-mobile, .download-mobile');
        mobileElements.forEach(el => {
            el.style.display = 'block';
            el.style.visibility = 'visible';
        });
        const cursor = document.querySelector('.cursor');
        if (cursor) cursor.style.display = 'none';
        const body = document.body;
        if (window.innerWidth <= 1024) { 
            body.style.marginTop = '8vh';
            body.style.backgroundSize = '200%';
            const logo = document.getElementById('logo');
            if (logo) logo.style.width = '6vh';
            const textContainer = document.querySelector('.text-container');
            if (textContainer) {
                textContainer.style.fontSize = '1.8vh';
                textContainer.style.top = '1.5vh';
                textContainer.style.left = '9vh';
            }
        }
        console.log('Styles mobiles forcés pour:', navigator.userAgent);
    }
}

function getCenterElementsForDetection() {
    return {
        galleryItems: document.querySelectorAll('.gallery-item'),
        achievementItems: document.querySelectorAll('.achievement-item'),
        artItems: document.querySelectorAll('.art-item'),
        artContainer: document.querySelector('.art-gallery-container')
    };
}

function isElementInCenterForDetection(element) {
    if (!element || getComputedStyle(element).display === 'none') {
        return false;
    }
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const elementCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;
    const thresholdPercentage = 0.25; 
    const detectionZoneTop = viewportCenter - (viewportHeight * thresholdPercentage);
    const detectionZoneBottom = viewportCenter + (viewportHeight * thresholdPercentage);
    return elementCenter >= detectionZoneTop && elementCenter <= detectionZoneBottom;
}

function performUpdateCenterElements() {
    if (!isMobileDevice()) return; 
    const elements = getCenterElementsForDetection();
    elements.galleryItems.forEach(item => {
        if (isElementInCenterForDetection(item)) {
            item.classList.add('center-active');
        } else {
            item.classList.remove('center-active');
        }
    });
    elements.achievementItems.forEach(item => {
        if (isElementInCenterForDetection(item)) {
            item.classList.add('center-active');
        } else {
            item.classList.remove('center-active');
        }
    });
    let hasActiveArt = false;
    elements.artItems.forEach(item => {
        if (isElementInCenterForDetection(item)) {
            item.classList.add('center-active');
            hasActiveArt = true;
        } else {
            item.classList.remove('center-active');
        }
    });
    if (elements.artContainer) {
        if (hasActiveArt) {
            elements.artContainer.classList.add('has-center-active');
        } else {
            elements.artContainer.classList.remove('has-center-active');
        }
    }
}

function initCenterDetection() {
    if (!isMobileDevice()) return;
    let ticking = false;
    function handleScrollResize() { 
        if (!ticking) {
            requestAnimationFrame(() => {
                performUpdateCenterElements();
                ticking = false;
            });
            ticking = true;
        }
    }
    window.addEventListener('scroll', handleScrollResize);
    window.addEventListener('resize', handleScrollResize); 
    setTimeout(performUpdateCenterElements, 100); 
}

function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

function resetScrollPositions() {
    window.scrollTo(0, 0);
}

function updateProjectsTitle(title, subtitle) {
    const projectsTitle = document.querySelector('.projects-title');
    const projectsSubtitle = document.querySelector('.projects-subtitle');
    const projectsHeader = document.querySelector('.projects-header');
    if (title && subtitle) {
        if (projectsTitle) projectsTitle.textContent = title;
        if (projectsSubtitle) projectsSubtitle.textContent = subtitle;
        if (projectsHeader) projectsHeader.style.display = 'block';
    } else {
        if (projectsHeader) projectsHeader.style.display = 'none';
    }
}

async function loadProjects() {
    try {
        const response = await fetch('projects.json');
        if (!response.ok) throw new Error('Failed to fetch projects.json');
        const data = await response.json();
        const gallery = document.getElementById('gallery');
        if (!gallery) return;
        gallery.innerHTML = ''; 
        data.projects.forEach(project => {
            const projectElement = document.createElement('div');
            const category = project.category.toLowerCase().trim();
            projectElement.className = `gallery-item ${category}`;
            if (project.noPhone) projectElement.className += ' no-phone';
            const logoPath = `Elements/image/${project.id}-icon.png`;
            const previewPath = `Elements/image/${project.id}-banner.png`;
            projectElement.innerHTML = `
                <a href="${project.path}" target="_blank">
                    <div class="card-image">
                        <img src="${previewPath}" class="gallery-img" alt="${project.title}">
                    </div>
                    <div class="card-info">
                        <div class="card-icon">
                            <img src="${logoPath}" alt="Logo">
                        </div>
                        <div class="card-text">
                            <div class="card-title">${project.title}</div>
                            <div class="card-creator">${project.creator}</div>
                        </div>
                    </div>
                </a>`;            gallery.appendChild(projectElement);
        });
        if (isMobileDevice()) {
            setTimeout(performUpdateCenterElements, 200); 
            // Handle .no-phone links on mobile after projects are loaded
            document.querySelectorAll('.gallery-item.no-phone a').forEach(link => {
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    alert("Ce site n'est pas accessible sur un téléphone.");
                });
                if (link.parentElement) {
                    link.parentElement.style.cursor = 'not-allowed';
                }
            });
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

async function loadArtworks() {
    try {
        const response = await fetch('art.json');
        if (!response.ok) throw new Error('Failed to fetch art.json');
        const data = await response.json();
        const artGalleryContainer = document.querySelector('.art-gallery-container');
        if (!artGalleryContainer) return;
        artGalleryContainer.innerHTML = ''; 
        data.artworks.forEach(artwork => {
            const artElement = document.createElement('div');
            artElement.className = 'art-item';
            const imagePath = `Elements/image/3D/${artwork.id}.jpg`;
            artElement.innerHTML = `
                <img src="${imagePath}" class="art-img" alt="${artwork.title}">
                <div class="art-info">
                    <h3 class="art-title">"${artwork.title}"</h3>
                </div>`;
            artGalleryContainer.appendChild(artElement);
        });
        if (isMobileDevice()) {
            setTimeout(performUpdateCenterElements, 200); 
        }
    } catch (error) {
        console.error('Error loading artworks:', error);
    }
}

function showAllItems() {
    resetScrollPositions();
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.style.display = 'grid';
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.display = 'flex';
    });
    const art3dGallery = document.getElementById('art-gallery');
    const infosContainer = document.getElementById('infos');
    const headerContainer = document.getElementById('header');
    if (art3dGallery) art3dGallery.style.display = 'none';
    if (infosContainer) infosContainer.style.display = 'none';
    if (headerContainer) headerContainer.style.display = 'block';
    updateProjectsTitle('My Web Projects', 'Digital creations portfolio');
    if (isMobileDevice()) {
        setTimeout(performUpdateCenterElements, 50);
    }
}

function filterItems(category) {
    resetScrollPositions();
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.style.display = 'grid';
    const items = document.querySelectorAll('.gallery-item');
    const targetCategory = category.toLowerCase().trim();
    let title, subtitle;
    switch(targetCategory) {
        case 'personal-project':
            title = 'My Personal Projects';
            subtitle = 'Independent creations and experiments';
            break;
        case 'commission':
            title = 'My Commissions';
            subtitle = 'Client projects and personal redesign initiatives';
            break;
        default:
            title = 'My Web Projects';
            subtitle = 'Digital creations portfolio';
    }
    updateProjectsTitle(title, subtitle);
    items.forEach(item => {
        if (item.classList && item.classList.contains(targetCategory)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
    const headerContainer = document.getElementById('header');
    const infosContainer = document.getElementById('infos');
    const art3dGallery = document.getElementById('art-gallery');
    if(headerContainer) headerContainer.style.display = 'none'; 
    if(infosContainer) infosContainer.style.display = 'none';
    if(art3dGallery) art3dGallery.style.display = 'none';
    if (isMobileDevice()) {
        setTimeout(performUpdateCenterElements, 50);
    }
}

function show3dArt() {
    resetScrollPositions();
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.display = 'none';
    });
    const headerContainer = document.getElementById('header');
    const infosContainer = document.getElementById('infos');
    const gallery = document.getElementById('gallery');
    const art3dGallery = document.getElementById('art-gallery');
    if(headerContainer) headerContainer.style.display = 'none';
    if(infosContainer) infosContainer.style.display = 'none';
    if(gallery) gallery.style.display = 'none';
    if(art3dGallery) art3dGallery.style.display = 'block';
    updateProjectsTitle(null, null);
    if (isMobileDevice()) {
        setTimeout(performUpdateCenterElements, 50);
    }
}

function showInfoText() {
    resetScrollPositions();
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.display = 'none';
    });
    const headerContainer = document.getElementById('header');
    const art3dGallery = document.getElementById('art-gallery');
    const gallery = document.getElementById('gallery');
    const infosContainer = document.getElementById('infos');
    if(headerContainer) headerContainer.style.display = 'none';
    if(art3dGallery) art3dGallery.style.display = 'none';
    if(gallery) gallery.style.display = 'none';
    if(infosContainer) infosContainer.style.display = 'block';
    updateProjectsTitle(null, null);
    if (isMobileDevice()) {
        setTimeout(performUpdateCenterElements, 50);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    forceMobileStyles(); 
    loadProjects(); 
    loadArtworks(); 
    companiesManager.init(); // Initialiser le gestionnaire de companies
    initCenterDetection(); 
    const scrollingTexts = document.querySelectorAll('.scrolling-text p');
    let speed = isMobileDevice() ? 50 : 100; 
    scrollingTexts.forEach(p => {
        const textContent = p.textContent.trim();
        const computedStyle = window.getComputedStyle(p);
        const font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const textWidth = getTextWidth(textContent, font);
        const repeatCount = Math.ceil(window.innerWidth / textWidth) + 2; 
        let repeatedText = '';
        for (let i = 0; i < repeatCount; i++) repeatedText += textContent + ' ';
        p.textContent = repeatedText.trim();
        const animationDuration = (textWidth * repeatCount) / speed; 
        p.style.whiteSpace = 'nowrap';
        p.style.display = 'inline-block'; 
        p.style.animation = `scroll-left ${animationDuration}s linear infinite`;
    });
    if (!document.getElementById('scroll-left-keyframes')) {
        const styleSheet = document.createElement("style");
        styleSheet.id = 'scroll-left-keyframes';
        styleSheet.type = "text/css";
        styleSheet.innerText = `@keyframes scroll-left {from {transform: translateX(0);}to {transform: translateX(-100%);}}`;
        document.head.appendChild(styleSheet);
    }
    if (!isMobileDevice()) {
        const cursor = document.createElement('div');
        cursor.classList.add('cursor');
        document.body.appendChild(cursor);
        document.addEventListener('mousemove', (e) => {
             const x = e.clientX + window.scrollX;             const y = e.clientY + window.scrollY;             cursor.style.transform = `translate(${x}px, ${y}px)`;
        });
         document.addEventListener('scroll', (e) => { 
        });
    }
    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const everythingLinkMobile = document.getElementById('everything-mobile');
    const infoLink = document.getElementById('info-link');
    const infoLinkMobile = document.getElementById('info-link-mobile');
    const art3dLink = document.getElementById('art-link');
    const art3dLinkMobile = document.getElementById('art-link-mobile');
    if(personalProjectLink) personalProjectLink.addEventListener('click', function(e) { e.preventDefault(); filterItems('personal-project'); });
    if(commissionsLink) commissionsLink.addEventListener('click', function(e) { e.preventDefault(); filterItems('commission'); });
    if(everythingLink) everythingLink.addEventListener('click', function(e) { e.preventDefault(); showAllItems(); });
    if(everythingLinkMobile) everythingLinkMobile.addEventListener('click', function(e) { e.preventDefault(); showAllItems(); });
    if(infoLink) infoLink.addEventListener('click', function(e) { e.preventDefault(); showInfoText(); });
    if(infoLinkMobile) infoLinkMobile.addEventListener('click', function(e) { e.preventDefault(); showInfoText(); });
    if(art3dLink) art3dLink.addEventListener('click', function(e) { e.preventDefault(); show3dArt(); });
    if(art3dLinkMobile) art3dLinkMobile.addEventListener('click', function(e) { e.preventDefault(); show3dArt(); });
    const allNavLinks = document.querySelectorAll('.link, .link-mobile');
    allNavLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            allNavLinks.forEach(l => l.classList.remove('clicked'));
            link.classList.add('clicked');
        });
    });    const landingLogo = document.getElementById('landing-logo');
    const landingPage = document.querySelector('.landing-page');
    const body = document.body;
    
    // Only run intro animation on desktop, skip completely on mobile
    if (!isMobileDevice() && landingLogo && landingPage) { 
        body.classList.add('no-scroll');
        setTimeout(() => {
            window.scrollTo(0, 0);
            landingLogo.classList.add('shrink');
        }, 1000);
        setTimeout(() => {
            landingPage.classList.add('hidden');
        }, 2000);
        setTimeout(() => {
            body.classList.remove('no-scroll');
        }, 2750);
    } else if (isMobileDevice()) {
        // On mobile, immediately ensure no-scroll is not applied
        body.classList.remove('no-scroll');
    }

    // Handle .unavailable links (globally for all devices)
    // When .unavailable is on an ancestor of <a>
    document.querySelectorAll('.unavailable a').forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            alert("Ce site n'est pas accessible pour l'instant");
        });
        const unavailableAncestor = link.closest('.unavailable');
        if (unavailableAncestor) {
            unavailableAncestor.style.cursor = 'not-allowed';
        } else {
            link.style.cursor = 'not-allowed'; // Fallback if <a> itself is not .unavailable
        }
    });

    // When <a> itself has .unavailable
    document.querySelectorAll('a.unavailable').forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            alert("Ce site n'est pas accessible pour l'instant");
        });
        link.style.cursor = 'not-allowed';
    });    // Mobile-specific adjustments and event handlers
    if (isMobileDevice()) {
        // Initial call for center detection after everything is potentially loaded/shown
        setTimeout(performUpdateCenterElements, 250);
    }
});
