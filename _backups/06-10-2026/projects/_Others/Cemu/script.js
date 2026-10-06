document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const header = document.querySelector('header');
    const sections = document.querySelectorAll('.section');
    const navLinks = document.querySelectorAll('.nav-link');
    const faqItems = document.querySelectorAll('.faq-item');
    const compatibilitySection = document.getElementById('compatibility');
    
    let isScrolling = false;
    let snapScrollEnabled = true;
    
    // Check if user is on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    // Disable snap scroll on mobile devices
    if (isMobile) {
        snapScrollEnabled = false;
        // Remove scroll-snap CSS properties from sections
        sections.forEach(section => {
            section.style.scrollSnapAlign = "unset";
            section.style.scrollSnapStop = "unset";
        });
    }

    // Navigation links click handler
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.getAttribute('href').substring(1);
            const section = document.getElementById(id);
            
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                updateActiveNavLink(id);
            }
        });
    });

    // FAQ toggle functionality
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            faqItems.forEach(faqItem => {
                if (faqItem !== item && faqItem.classList.contains('active')) {
                    faqItem.classList.remove('active');
                }
            });
            item.classList.toggle('active');
        });
    });

    // Scroll handling
    let lastScrollTop = 0;
    let scrollTimeout;

    window.addEventListener('wheel', function(e) {
        // Skip snap scrolling on mobile
        if (isMobile) return;
        
        // Check if we're past the compatibility section
        if (window.pageYOffset > (compatibilitySection?.offsetTop + compatibilitySection?.offsetHeight)) {
            snapScrollEnabled = false;
            return;
        }

        snapScrollEnabled = true;
        if (isScrolling) return;

        clearTimeout(scrollTimeout);
        
        const currentScrollTop = window.pageYOffset;
        const direction = e.deltaY > 0 ? 1 : -1;
        
        if (snapScrollEnabled) {
            e.preventDefault();
            
            const currentIndex = getCurrentSectionIndex();
            const nextIndex = Math.max(0, Math.min(currentIndex + direction, sections.length - 1));
            
            // Only snap if we're not going past the compatibility section
            const nextSection = sections[nextIndex];
            if (nextSection && nextSection.offsetTop <= (compatibilitySection?.offsetTop + compatibilitySection?.offsetHeight)) {
                isScrolling = true;
                nextSection.scrollIntoView({ behavior: 'smooth' });
                updateActiveNavLink(nextSection.id);
                
                scrollTimeout = setTimeout(() => {
                    isScrolling = false;
                }, 800);
            }
        }
        
        lastScrollTop = currentScrollTop;
    }, { passive: false });

    // Touch events for mobile
    let touchStartY = 0;
    
    window.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', function(e) {
        // Skip entirely on mobile devices
        if (isMobile) return;
        
        // Check if we're past the compatibility section
        if (window.pageYOffset > (compatibilitySection?.offsetTop + compatibilitySection?.offsetHeight)) {
            snapScrollEnabled = false;
            return;
        }

        snapScrollEnabled = true;
        if (isScrolling) return;
        
        const touchEndY = e.changedTouches[0].clientY;
        const touchDiff = touchStartY - touchEndY;
        
        if (Math.abs(touchDiff) < 50) return;
        
        const direction = touchDiff > 0 ? 1 : -1;
        const currentIndex = getCurrentSectionIndex();
        const nextIndex = Math.max(0, Math.min(currentIndex + direction, sections.length - 1));
        
        // Only snap if we're not going past the compatibility section
        const nextSection = sections[nextIndex];
        if (nextSection && nextSection.offsetTop <= (compatibilitySection?.offsetTop + compatibilitySection?.offsetHeight)) {
            isScrolling = true;
            nextSection.scrollIntoView({ behavior: 'smooth' });
            updateActiveNavLink(nextSection.id);
            
            setTimeout(() => {
                isScrolling = false;
            }, 800);
        }
    }, { passive: true });

    // Helper function to get current section index
    function getCurrentSectionIndex() {
        const viewportMiddle = window.innerHeight / 2;
        let closest = { index: 0, distance: Infinity };
        
        sections.forEach((section, index) => {
            const rect = section.getBoundingClientRect();
            const distance = Math.abs(rect.top + (rect.height / 2) - viewportMiddle);
            
            if (distance < closest.distance) {
                closest = { index, distance };
            }
        });
        
        return closest.index;
    }

    // Helper function to update active nav link
    function updateActiveNavLink(sectionId) {
        navLinks.forEach(link => {
            if (link.getAttribute('href') === `#${sectionId}`) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Scroll event listener for header effects
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Initialize page state
    if (window.location.hash) {
        const id = window.location.hash.substring(1);
        const section = document.getElementById(id);
        if (section) {
            setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth' });
                updateActiveNavLink(id);
            }, 100);
        }
    }

    // Load and display games list if we're on the compatibility page
    const gamesTableBody = document.getElementById('gamesTableBody');
    if (gamesTableBody) {
        loadGamesList();

        // Add search functionality
        const searchBar = document.getElementById('gameSearch');
        if (searchBar) {
            searchBar.addEventListener('input', function(e) {
                const searchText = e.target.value.toLowerCase();
                const rows = gamesTableBody.getElementsByTagName('tr');
                
                for (let row of rows) {
                    const title = row.cells[0].textContent.toLowerCase();
                    row.style.display = title.includes(searchText) ? '' : 'none';
                }
            });
        }
    }

    // Hamburger menu functionality
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const nav = document.querySelector('nav');
    const navOverlay = document.querySelector('.nav-overlay');
    const body = document.body;

    function toggleMenu() {
        hamburgerMenu.classList.toggle('active');
        nav.classList.toggle('active');
        navOverlay.classList.toggle('active');
        body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
    }

    if (hamburgerMenu && nav && navOverlay) {
        hamburgerMenu.addEventListener('click', toggleMenu);
        navOverlay.addEventListener('click', toggleMenu);

        // Close menu when clicking a link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (nav.classList.contains('active')) {
                    toggleMenu();
                }
            });
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('active')) {
                toggleMenu();
            }
        });
    }
});

async function loadGamesList() {
    try {
        const response = await fetch('compatibility-list.json');
        const data = await response.json();
        
        const gamesTableBody = document.getElementById('gamesTableBody');
        gamesTableBody.innerHTML = ''; // Clear existing content
        
        data.games.forEach(game => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${game.title}</td>
                <td>${game.version}</td>
                <td>${game.region}</td>
                <td><span class="status ${game.status}">${game.status}</span></td>
            `;
            gamesTableBody.appendChild(row);
        });
        
        // Update compatibility stats
        updateCompatibilityStats(data.games);
    } catch (error) {
        console.error('Error loading games list:', error);
        const gamesTableBody = document.getElementById('gamesTableBody');
        gamesTableBody.innerHTML = '<tr><td colspan="4">Error loading games list. Please try again later.</td></tr>';
    }
}

function updateCompatibilityStats(games) {
    const stats = {
        perfect: 0,
        playable: 0,
        runs: 0,
        loads: 0,
        unplayable: 0
    };
    
    games.forEach(game => {
        if (stats.hasOwnProperty(game.status)) {
            stats[game.status]++;
        }
    });
    
    // Update stats display if elements exist
    Object.keys(stats).forEach(status => {
        const element = document.querySelector(`.stat-count.${status}`);
        if (element) {
            element.textContent = stats[status];
        }
    });
}