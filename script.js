// Companies: class that loads company data, generates CSS and renders logos
class CompaniesManager {
    constructor() {
        this.companies = [];
        this.container = null;
    }

    // Load companies JSON data into memory
    async loadCompanies() {
        try {
            const response = await fetch('companies.json');
            const data = await response.json();
            this.companies = data.companies;
            return this.companies;
        } catch (error) {
            console.error('Error loading companies:', error);
            return [];
        }
    }

    // CSS generation: build theme CSS for each company logo and experience item
    generateCSS() {
        let css = '';
        this.companies.forEach((company, index) => {
            const cssClass = company.name.toLowerCase().replace(/\s+/g, '');
            if (index > 0) {
                // logo styling
                css += `
                .company-logo.${cssClass} {
                    background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]});
                    border: 1px solid ${company.colors[2]};
                }
                `;
                // experience item styling (use a class on the item instead of inline styles)
                css += `
                .experience-item.company-${cssClass} {
                    background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]});
                    border-color: ${company.colors[2]};
                }
                `;
                // mobile variants
                css += `
                @media (max-width: 768px) {
                    .company-logo.${cssClass} { background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]}); border: 1px solid ${company.colors[2]}; }
                    .experience-item.company-${cssClass} { background: linear-gradient(135deg, ${company.colors[0]}, ${company.colors[1]}); border-color: ${company.colors[2]}; }
                }
                `;
            }
        });
        return css;
    }

    // Inject: append generated CSS to <head>
    injectCSS() {
        const css = this.generateCSS();
        const styleElement = document.createElement('style');
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    }

    // Create DOM element representing a company logo
    createCompanyElement(company, index) {
        const img = document.createElement('img');
        img.src = company.logo;
        img.alt = company.name;
        const cssClass = company.name.toLowerCase().replace(/\s+/g, '');
        img.className = index === 0 ? 'company-logo' : `company-logo ${cssClass}`;
        img.setAttribute('data-company-name', company.name);
        return img;
    }

    // Render: populate the companies container with logo elements
    renderCompanies(containerId = 'companies-logos') {
        this.container = document.querySelector(`.${containerId}`);
        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        this.container.innerHTML = '';

        this.companies.forEach((company, index) => {
            const element = this.createCompanyElement(company, index);
            this.container.appendChild(element);
        });
    }

    // Add: push new company, regenerate CSS and append to DOM
    addCompany(companyData) {
        this.companies.push(companyData);
        this.injectCSS();
        if (this.container) {
            const element = this.createCompanyElement(companyData, this.companies.length - 1);
            this.container.appendChild(element);
        }
    }

    // Remove: delete company from state and remove its DOM element
    removeCompany(companyName) {
        this.companies = this.companies.filter(c => c.name !== companyName);
        const element = document.querySelector(`[data-company-name="${companyName}"]`);
        if (element) element.remove();
    }

    // Init: load companies, inject CSS and render
    async init() {
        await this.loadCompanies();
        this.injectCSS();
        this.renderCompanies();
    }

    // Getters: small helpers to query loaded companies
    getCompany(name) { return this.companies.find(c => c.name === name); }
    getAllCompanies() { return this.companies; }
}

// Companies instance: single global manager used by the page
const companiesManager = new CompaniesManager();

// Device detection: heuristics for touch devices and small screens
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
        console.log('Mobile styles applied for:', navigator.userAgent);
    }
}

// Center detection: find items near the viewport center for mobile highlighting
function getCenterElementsForDetection() {
    return {
        galleryItems: document.querySelectorAll('.gallery-item'),
        achievementItems: document.querySelectorAll('.achievement-item'),
        // art-related elements removed (gallery-only detection)
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
    // art-item detection removed
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

// Utility helpers: measure text width and reset scroll position
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

// Age: compute and insert ages from spans with data-dob
function computeAndInsertAges() {
    document.querySelectorAll('span[data-dob]').forEach(span => {
        const dobStr = span.getAttribute('data-dob');
        if (!dobStr) return;
        const dob = new Date(dobStr + 'T00:00:00'); // ensure consistent parsing
        if (isNaN(dob)) return;
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        span.textContent = age >= 0 ? age : '0';
    });
}


function initCursorIfDesktop() {
    if (!isMobileDevice()) {
        const cursor = document.createElement('div');
        cursor.classList.add('cursor');
        document.body.appendChild(cursor);
        let cursorScale = 1;
        document.addEventListener('mousemove', (e) => {
            const x = e.clientX + window.scrollX;
            const y = e.clientY + window.scrollY;
            cursor.style.transform = `translate(${x}px, ${y}px) scale(${cursorScale})`;
        });
        // Shrink cursor on clickable elements
        const clickableElements = document.querySelectorAll('a, button, input[type="submit"], [onclick]');
        clickableElements.forEach(el => {
            el.addEventListener('mouseenter', () => { cursorScale = 0.5; });
            el.addEventListener('mouseleave', () => { cursorScale = 1; });
        });
    }
}

// Navigation handlers: bind links to filter/show sections and mark active link
function initNavHandlers() {
    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const everythingLinkMobile = document.getElementById('everything-mobile');

    if(personalProjectLink) personalProjectLink.addEventListener('click', function(e) { e.preventDefault(); filterItems('personal-project'); });
    if(commissionsLink) commissionsLink.addEventListener('click', function(e) { e.preventDefault(); filterItems('commission'); });
    if(everythingLink) everythingLink.addEventListener('click', function(e) { e.preventDefault(); showAllItems(); });
    if(everythingLinkMobile) everythingLinkMobile.addEventListener('click', function(e) { e.preventDefault(); showAllItems(); });

    const allNavLinks = document.querySelectorAll('.link, .link-mobile');
    allNavLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            allNavLinks.forEach(l => l.classList.remove('clicked'));
            link.classList.add('clicked');
        });
    });
}

// Unavailable links: prevent navigation for elements marked unavailable and style cursor
function initUnavailableLinks() {
    document.querySelectorAll('.unavailable a').forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            alert("Ce site n'est pas accessible pour l'instant");
        });
        const unavailableAncestor = link.closest('.unavailable');
        if (unavailableAncestor) {
            unavailableAncestor.style.cursor = 'not-allowed';
        } else {
            link.style.cursor = 'not-allowed';
        }
    });

    document.querySelectorAll('a.unavailable').forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            alert("Ce site n'est pas accessible pour l'instant");
        });
        link.style.cursor = 'not-allowed';
    });
}

// initBottomFixedSections removed: behaviour disabled
function initBottomFixedSections() { /* disabled */ }



// Render experiences from companies.json
function renderExperienceFromCompanies() {
    const list = document.querySelector('.experience-list');
    if (!list) return;
    list.innerHTML = '';
    const companies = companiesManager.getAllCompanies();
    companies.forEach(company => {
        const item = document.createElement('div');
        item.className = 'experience-item';
        item.setAttribute('data-company', company.name);

        const img = document.createElement('img');
        img.className = 'experience-logo';
        img.src = company.logo || '';
        img.alt = company.name || '';

        const text = document.createElement('div');
        text.className = 'experience-text';

        const h3 = document.createElement('h3');
        h3.textContent = company.role ? `${company.name} — ${company.role}` : company.name;

        const date = document.createElement('div');
        date.className = 'experience-date';
        date.textContent = company.period || '';

        text.appendChild(h3);
        text.appendChild(date);

        item.appendChild(img);
        item.appendChild(text);

        // Apply company class to let CSS handle colors (no inline borderColor)
        const slug = company.name.toLowerCase().replace(/\s+/g, '');
        item.classList.add(`company-${slug}`);

        list.appendChild(item);
    });
    if (isMobileDevice()) setTimeout(performUpdateCenterElements, 50);
}

function updateBlurOnScroll() {
    const scrollY = window.scrollY;
    const maxScroll = 750; 
    const maxBlur = 10; 
    const blurAmount = Math.min(scrollY / maxScroll, 1) * maxBlur;
    const brightness = 1 - Math.min(scrollY / maxScroll, 1) * 0.8; // From 1 to 0.2
    document.documentElement.style.setProperty('--blur-amount', `${blurAmount}px`);
    document.documentElement.style.setProperty('--brightness', brightness);
}

function updateCityTime() {
  const el = document.getElementById('header-hour');
  if (!el) return;
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit', hour12: true });
    el.textContent = fmt.format(now).toUpperCase();
  } catch (e) {
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const parisOffset = 1;
    const paris = new Date(utc + (3600000 * parisOffset));
    let hours = paris.getHours();
    const mins = paris.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    el.textContent = `${hours}:${mins.toString().padStart(2,'0')} ${ampm}`;
  }
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    forceMobileStyles();
    // companiesManager.init().then(() => {
    //     renderExperienceFromCompanies();
    // });
    initCenterDetection();

    initCursorIfDesktop();
    initNavHandlers();
    initUnavailableLinks();

    // Age: compute and insert ages from spans with data-dob
    computeAndInsertAges();

    // City time
    updateCityTime();
    setInterval(updateCityTime, 15000);

    // Optimized blur effect on scroll (throttled with rAF)
    let blurTicking = false;
    window.addEventListener('scroll', () => {
        if (!blurTicking) {
            requestAnimationFrame(() => {
                updateBlurOnScroll();
                blurTicking = false;
            });
            blurTicking = true;
        }
    }, { passive: true });

    if (isMobileDevice()) setTimeout(performUpdateCenterElements, 250);


});
