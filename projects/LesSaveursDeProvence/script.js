let currentLanguage = localStorage.getItem('language') || 'fr';
let translations = {};
let defaultTranslations = {};

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

function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function updatePageContent(translations) {
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        const value = getNestedValue(translations, key);
        if (typeof value === 'string') {
            const containsHTML = /<\s*br\s*\/?\s*>|<\w+/i.test(value);
            const allowHTML = key.startsWith('menu.') || key.startsWith('reservation.') || containsHTML;
            if (allowHTML) {
                el.innerHTML = value;
            } else {
                el.textContent = value;
            }
        }
    });

    const languageName = document.querySelector('.language-current .language-name');
    if (languageName && translations.language && translations.language.current) {
        languageName.textContent = translations.language.current;
    }
}

async function switchLanguage(language) {
    if (language !== currentLanguage) {
        currentLanguage = language;
        localStorage.setItem('language', language);

        const newTranslations = await loadTranslations(language);
        if (newTranslations) {
            translations = deepMerge({}, defaultTranslations, newTranslations);
            updatePageContent(translations);
        }

        updateLanguageDisplay();

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

document.addEventListener('DOMContentLoaded', async function() {
    defaultTranslations = (await loadTranslations('fr')) || {};

    const langBundle = await loadTranslations(currentLanguage);
    translations = deepMerge({}, defaultTranslations, langBundle || {});
    updatePageContent(translations);

    updateLanguageDisplay();
    updateLanguageVisibility();

    const languageOptions = document.querySelectorAll('.language-option');
    const languageSelector = document.querySelector('.language-selector');

    languageOptions.forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const selectedLang = this.getAttribute('data-lang');
            switchLanguage(selectedLang);

            if (languageSelector) {
                languageSelector.classList.remove('dropdown-open');
            }
        });
    });

    if (languageSelector) {
        let isDropdownOpen = false;

        languageSelector.addEventListener('click', function(e) {
            e.stopPropagation();
            isDropdownOpen = !isDropdownOpen;

            if (isDropdownOpen) {
                this.classList.add('dropdown-open');
            } else {
                this.classList.remove('dropdown-open');
            }
        });

        document.addEventListener('click', function() {
            if (isDropdownOpen) {
                languageSelector.classList.remove('dropdown-open');
                isDropdownOpen = false;
            }
        });

        languageSelector.addEventListener('mouseleave', function() {
            if (isDropdownOpen) {
                this.classList.remove('dropdown-open');
                isDropdownOpen = false;
            }
        });
    }

    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const menuOverlay = document.querySelector('.menu-overlay');

    hamburgerMenu.addEventListener('click', function() {
        hamburgerMenu.classList.toggle('active');
        menuOverlay.classList.toggle('active');

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

    const menuNavItems = document.querySelectorAll('.menu-nav a');
    const menuImages = document.querySelectorAll('.menu-image');
    const pngDisplays = document.querySelectorAll('.png-display');

    menuNavItems.forEach(navItem => {
        navItem.addEventListener('mouseenter', function() {
            const targetImage = this.getAttribute('data-image');

            menuImages.forEach(img => {
                img.classList.remove('active');
            });
            pngDisplays.forEach(png => {
                png.classList.remove('active');
            });

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

    const menuLeft = document.querySelector('.menu-left');
    menuLeft.addEventListener('mouseleave', function() {
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

    function initCategoryAccordion() {
        const categoryTitles = document.querySelectorAll('.full-menu .category-title');

        categoryTitles.forEach(title => {
            title.addEventListener('click', function() {
                const menuItems = this.nextElementSibling;

                let actualMenuItems = menuItems;
                if (menuItems && menuItems.classList.contains('category-subtitle')) {
                    actualMenuItems = menuItems.nextElementSibling;
                }

                const isActive = this.classList.contains('active');

                if (isActive) {
                    this.classList.remove('active');
                    this.classList.add('collapsed');
                    if (actualMenuItems) actualMenuItems.classList.remove('visible');
                } else {
                    this.classList.add('active');
                    this.classList.remove('collapsed');
                    if (actualMenuItems) actualMenuItems.classList.add('visible');
                }
            });
        });
    }

    initCategoryAccordion();

    document.querySelectorAll('.category-title').forEach(title => {
        const menuItems = title.nextElementSibling;
        title.classList.add('collapsed');
        title.classList.remove('active');
        if (menuItems && menuItems.classList.contains('menu-items')) {
            menuItems.classList.remove('visible');
        }
    });

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
