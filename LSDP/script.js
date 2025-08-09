// Language System
let currentLanguage = localStorage.getItem('language') || 'fr';
let translations = {};
let defaultTranslations = {}; // French baseline

// Load translation file
async function loadTranslations(language) {
    try {
        const response = await fetch(`languages/${language}.json`);
        if (!response.ok) {
            throw new Error(`Could not load translations for ${language}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        return null;
    }
}

// Deep merge helper
function deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
    if (typeof target !== 'object' || target === null) target = {};
    if (typeof source === 'object' && source !== null) {
        Object.keys(source).forEach(key => {
            const srcVal = source[key];
            if (Array.isArray(srcVal)) {
                target[key] = srcVal.slice();
            } else if (typeof srcVal === 'object' && srcVal !== null) {
                target[key] = deepMerge(target[key] || {}, srcVal);
            } else if (srcVal !== undefined) {
                target[key] = srcVal;
            }
        });
    }
    return deepMerge(target, ...sources);
}

// Helper: safely get nested value like 'about.history_title'
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

// Update page content with translations
function updatePageContent(translations) {
    // Generic updater for any [data-translate]
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        const value = getNestedValue(translations, key);
        if (typeof value === 'string') {
            // Menu strings may contain HTML (e.g., <br>, <strong>)
            if (key.startsWith('menu.')) {
                el.innerHTML = value;
            } else {
                el.textContent = value;
            }
        }
    });

    // Update language name in the current language display (no data-translate attribute there)
    const languageName = document.querySelector('.language-current .language-name');
    if (languageName && translations.language && translations.language.current) {
        languageName.textContent = translations.language.current;
    }
}

async function switchLanguage(language) {
    if (language !== currentLanguage) {
        currentLanguage = language;
        localStorage.setItem('language', language);
        
        // Load and apply new translations merged over FR baseline
        const newTranslations = await loadTranslations(language);
        if (newTranslations) {
            translations = deepMerge({}, defaultTranslations, newTranslations);
            updatePageContent(translations);
        }
        
        // Update the flag and language name display
        updateLanguageDisplay();
        
        // Update displayed languages (hide current language)
        updateLanguageVisibility();
    }
}

function getLanguageName(code) {
    const names = {
        'fr': 'Français',
        'en': 'English',
        'es': 'Español',
        'it': 'Italiano',
        'de': 'Deutsch',
        'ru': 'Русский',
        'ua': 'Українська',
        'pt': 'Português',
        'cn': '中文',
        'jp': '日本語'
    };
    return names[code] || 'Français';
}

function updateLanguageDisplay() {
    const flagIcon = document.querySelector('.language-current .flag-icon');
    const languageName = document.querySelector('.language-current .language-name');
    
    if (flagIcon && languageName) {
        flagIcon.src = `flags/${currentLanguage}.png`;
        flagIcon.alt = getLanguageName(currentLanguage);
        languageName.textContent = getLanguageName(currentLanguage);
    }
}

function updateLanguageVisibility() {
    const languageOptions = document.querySelectorAll('.language-option');
    
    languageOptions.forEach(option => {
        const langCode = option.getAttribute('data-lang');
        if (langCode === currentLanguage) {
            option.classList.add('current-language');
        } else {
            option.classList.remove('current-language');
        }
    });
}

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', async function() {
    // Load FR baseline first
    defaultTranslations = (await loadTranslations('fr')) || {};

    // Initialize language system
    const langBundle = await loadTranslations(currentLanguage);
    translations = deepMerge({}, defaultTranslations, langBundle || {});
    updatePageContent(translations);

    updateLanguageDisplay();
    updateLanguageVisibility();

    // Add click event listeners to language options
    const languageOptions = document.querySelectorAll('.language-option');
    languageOptions.forEach(option => {
        option.addEventListener('click', function() {
            const selectedLang = this.getAttribute('data-lang');
            switchLanguage(selectedLang);
        });
    });

    // Hamburger menu functionality
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const menuOverlay = document.querySelector('.menu-overlay');
    
    hamburgerMenu.addEventListener('click', function() {
        // Toggle active classes
        hamburgerMenu.classList.toggle('active');
        menuOverlay.classList.toggle('active');
        
        // Ajouter/retirer la classe menu-open pour forcer les styles
        const navbar = document.querySelector('.navbar');
        if (menuOverlay.classList.contains('active')) {
            navbar.classList.add('menu-open');
        } else {
            navbar.classList.remove('menu-open');
            // Maintenir le style scrollé si la page est scrollée
            if (window.scrollY > 100) {
                navbar.classList.add('scrolled');
            }
        }
        
        // Prevent body scroll when menu is open
        if (menuOverlay.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    });

    // Close menu when clicking on overlay
    menuOverlay.addEventListener('click', function(e) {
        if (e.target === menuOverlay) {
            const navbar = document.querySelector('.navbar');
            hamburgerMenu.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            // Retirer la classe menu-open et maintenir le style scrollé si nécessaire
            navbar.classList.remove('menu-open');
            if (window.scrollY > 100) {
                navbar.classList.add('scrolled');
            }
        }
    });

    // Close menu when clicking on menu links
    const menuLinks = document.querySelectorAll('.menu-nav a');
    menuLinks.forEach(link => {
        link.addEventListener('click', function() {
            const navbar = document.querySelector('.navbar');
            hamburgerMenu.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            // Retirer la classe menu-open et maintenir le style scrollé si nécessaire
            navbar.classList.remove('menu-open');
            if (window.scrollY > 100) {
                navbar.classList.add('scrolled');
            }
        });
    });

    // Menu image hover functionality
    const menuNavItems = document.querySelectorAll('.menu-nav a');
    const menuImages = document.querySelectorAll('.menu-image');
    const pngDisplays = document.querySelectorAll('.png-display');

    menuNavItems.forEach(navItem => {
        navItem.addEventListener('mouseenter', function() {
            const targetImage = this.getAttribute('data-image');
            
            // Hide all images and PNG displays
            menuImages.forEach(img => {
                img.classList.remove('active');
            });
            pngDisplays.forEach(png => {
                png.classList.remove('active');
            });
            
            // Show target image and PNG display
            const imageToShow = document.querySelector(`.menu-image[data-tab="${targetImage}"]`);
            const pngToShow = document.querySelector(`.png-display[data-tab="${targetImage}"]`);
            if (imageToShow) {
                imageToShow.classList.add('active');
            }
            if (pngToShow) {
                pngToShow.classList.add('active');
            }
        });
    });

    // Reset to default image when leaving menu area
    const menuLeft = document.querySelector('.menu-left');
    menuLeft.addEventListener('mouseleave', function() {
        // Reset to first image and PNG (home)
        menuImages.forEach(img => {
            img.classList.remove('active');
        });
        pngDisplays.forEach(png => {
            png.classList.remove('active');
        });
        const defaultImage = document.querySelector('.menu-image[data-tab="home"]');
        const defaultPng = document.querySelector('.png-display[data-tab="home"]');
        if (defaultImage) {
            defaultImage.classList.add('active');
        }
        if (defaultPng) {
            defaultPng.classList.add('active');
        }
    });

    // Category accordion functionality
    function initCategoryAccordion() {
        // Sélectionner uniquement les catégories dans .full-menu
        const categoryTitles = document.querySelectorAll('.full-menu .category-title');
        
        categoryTitles.forEach(title => {
            title.addEventListener('click', function() {
                const menuItems = this.nextElementSibling;
                
                // Trouver les menu-items (peut être après le subtitle ou directement)
                let actualMenuItems = menuItems;
                if (menuItems && menuItems.classList.contains('category-subtitle')) {
                    actualMenuItems = menuItems.nextElementSibling;
                }
                
                // Toggle active state
                const isActive = this.classList.contains('active');
                
                if (isActive) {
                    // Close this category
                    this.classList.remove('active');
                    this.classList.add('collapsed');
                    if (actualMenuItems) actualMenuItems.classList.remove('visible');
                } else {
                    // Open this category
                    this.classList.add('active');
                    this.classList.remove('collapsed');
                    if (actualMenuItems) actualMenuItems.classList.add('visible');
                }
            });
        });
    }

    // Initialize accordion menu system
    initCategoryAccordion();

    // Initialize all categories as collapsed by default
    document.querySelectorAll('.category-title').forEach(title => {
        const menuItems = title.nextElementSibling;
        title.classList.add('collapsed');
        title.classList.remove('active');
        if (menuItems && menuItems.classList.contains('menu-items')) {
            menuItems.classList.remove('visible');
        }
    });

    // Navbar and Language Selector scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        const languageSelector = document.querySelector('.language-selector');
        
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
            languageSelector.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
            languageSelector.classList.remove('scrolled');
        }
    });

    // Smooth scrolling for future navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
