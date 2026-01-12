document.addEventListener('DOMContentLoaded', function() {
    // OS Detection
    function detectOS() {
        const userAgent = window.navigator.userAgent;
        let os = "Windows";
        
        if (/Windows/i.test(userAgent)) {
            os = "Windows";
        } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
            os = "macOS";
        } else if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) {
            os = "Linux";
        } else if (/Android/i.test(userAgent)) {
            os = "Android";
        } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
            os = "iOS";
        }
        
        return os;
    }

    // Get download URL based on OS
    function getDownloadUrl(os) {
        switch (os) {
            case "Windows":
                return "/download/azahar-windows-latest.zip";
            case "macOS":
                return "/download/azahar-macos-latest.dmg";
            case "Linux":
                return "/download/azahar-linux-latest.AppImage";
            case "Android":
                return "https://play.google.com/store/apps/details?id=org.azahar.emulator";
            default:
                return "#";
        }
    }

    // Update download buttons
    function updateDownloadButtons(os) {
        const downloadUrl = getDownloadUrl(os);
        const downloadTexts = [
            document.getElementById('downloadText'),
            document.getElementById('heroDownloadText'),
            document.getElementById('ctaDownloadText')
        ];
        
        downloadTexts.forEach(text => {
            if (text) {
                text.textContent = `Download for ${os}`;
            }
        });

        const downloadButtons = [
            document.getElementById('downloadBtn'),
            document.getElementById('heroDownloadBtn'),
            document.getElementById('ctaDownloadBtn')
        ];

        downloadButtons.forEach(button => {
            if (button) {
                button.onclick = () => {
                    if (downloadUrl.startsWith('http')) {
                        window.open(downloadUrl, '_blank');
                    } else {
                        window.location.href = downloadUrl;
                    }
                };
            }
        });
    }

    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
                // Close mobile menu if open
                if (navLinks && navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                }
            }
        });
    });

    // Add fade-in animations to hero section elements
    function addHeroAnimations() {
        const heroElements = document.querySelectorAll('.hero h1, .hero .subtitle, .hero .cta-buttons, .hero .stats');
        heroElements.forEach((element, index) => {
            element.classList.add('fade-in');
            element.classList.add(`fade-in-delay-${index}`);
        });
    }

    // Tilt effect for game cards
    function addTiltEffect() {
        const gameCards = document.querySelectorAll('.game-card');
        
        gameCards.forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const angleX = (y - centerY) / 20;
                const angleY = (centerX - x) / 20;
                
                card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateY(-5px)`;
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // Discord interactive elements
    function setupDiscordInteractions() {
        // Chat messages animation
        const messages = document.querySelectorAll('.chat-message:not(.typing)');
        messages.forEach((message, index) => {
            message.style.opacity = '0';
            message.style.transform = 'translateY(20px)';
            setTimeout(() => {
                message.style.transition = 'all 0.5s ease';
                message.style.opacity = '1';
                message.style.transform = 'translateY(0)';
            }, 500 + (index * 700));
        });

        // Make typing indicator appear after messages
        const typingIndicator = document.querySelector('.typing');
        if (typingIndicator) {
            typingIndicator.style.opacity = '0';
            setTimeout(() => {
                typingIndicator.style.transition = 'opacity 0.5s ease';
                typingIndicator.style.opacity = '1';
            }, 500 + (messages.length * 700) + 500);
        }

        // Channel click effect
        const channels = document.querySelectorAll('.channel');
        channels.forEach(channel => {
            channel.addEventListener('click', () => {
                channels.forEach(c => c.classList.remove('active'));
                channel.classList.add('active');
            });
        });

        // Online count animation
        animateOnlineCount();
    }

    // Animate Discord online count with random fluctuations
    function animateOnlineCount() {
        const onlineCount = document.getElementById('online-count');
        if (!onlineCount) return;
        
        const baseCount = parseInt(onlineCount.textContent);
        
        setInterval(() => {
            // Random fluctuation between -5 and +5
            const fluctuation = Math.floor(Math.random() * 11) - 5;
            let newCount = baseCount + fluctuation;
            
            // Animate the counter
            const duration = 1000; // 1 second
            const start = parseInt(onlineCount.textContent);
            const end = newCount;
            const range = end - start;
            const startTime = performance.now();
            
            function updateCount(timestamp) {
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const currentValue = Math.floor(start + (range * progress));
                onlineCount.textContent = currentValue;
                
                if (progress < 1) {
                    requestAnimationFrame(updateCount);
                }
            }
            
            requestAnimationFrame(updateCount);
        }, 5000); // Update every 5 seconds
    }
    
    // Blog functionality
    function initializeBlog() {
        const blogPostsContainer = document.getElementById('blog-posts-container');
        const paginationContainer = document.getElementById('pagination');
        const blogHeaderContainer = document.querySelector('.blog-header .container');
        const modal = document.getElementById('blog-modal');
        const modalClose = document.getElementById('modal-close');
        const modalContent = document.getElementById('blog-post-content');
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-btn');
        const filterButtons = document.querySelectorAll('.filter-btn');
        
        if (!blogPostsContainer) return; // Not on blog page
        
        // Variables for pagination
        let currentPage = 1;
        const postsPerPage = 6;
        let filteredPosts = [];
        let allPosts = [];
        
        // Fetch blog data
        fetch('blog-data.json')
            .then(response => response.json())
            .then(data => {
                allPosts = data.posts;
                filteredPosts = [...allPosts];
                renderPosts(filteredPosts, currentPage);
                renderPagination(filteredPosts.length);
            })
            .catch(error => {
                console.error('Error fetching blog data:', error);
                blogPostsContainer.innerHTML = `
                    <div class="no-results">
                        <h3>Error loading blog posts</h3>
                        <p>Please try refreshing the page or check back later.</p>
                    </div>
                `;
            });
        
        // Render blog posts
        function renderPosts(posts, page) {
            const start = (page - 1) * postsPerPage;
            const end = start + postsPerPage;
            const paginatedPosts = posts.slice(start, end);
            
            if (paginatedPosts.length === 0) {
                blogPostsContainer.innerHTML = `
                    <div class="no-results">
                        <h3>No posts found</h3>
                        <p>Try adjusting your search or filter criteria.</p>
                    </div>
                `;
                return;
            }
            
            blogPostsContainer.innerHTML = '';
            
            paginatedPosts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'blog-card';
                postElement.innerHTML = `
                    <div class="blog-card-img" style="background-image: url(${post.image})">
                        <span class="blog-card-category">${post.category}</span>
                    </div>
                    <div class="blog-card-content">
                        <span class="blog-card-date">${post.date}</span>
                        <h2 class="blog-card-title">${post.title}</h2>
                        <p class="blog-card-excerpt">${post.excerpt}</p>
                        <div class="blog-card-footer">
                            <div class="blog-card-author">
                                <img src="${post.author.avatar}" alt="${post.author.name}">
                                <span>${post.author.name}</span>
                            </div>
                            <button class="blog-card-read-more">Read More <i class="fas fa-arrow-right"></i></button>
                        </div>
                    </div>
                `;
                
                // Add click event to open modal
                postElement.addEventListener('click', () => {
                    modalContent.innerHTML = `
                        <div class="blog-post-header">
                            <span class="blog-post-category">${post.category}</span>
                            <h1 class="blog-post-title">${post.title}</h1>
                            <div class="blog-post-meta">
                                <div class="blog-post-author">
                                    <img src="${post.author.avatar}" alt="${post.author.name}">
                                    <span class="blog-post-author-name">${post.author.name}</span>
                                </div>
                                <div class="blog-post-date">
                                    <i class="far fa-calendar"></i> ${post.date}
                                </div>
                            </div>
                        </div>
                        <img src="${post.image}" alt="${post.title}" class="blog-post-featured-img">
                        <div class="blog-post-content">
                            ${post.content}
                        </div>
                    `;
                    
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden'; // Prevent scrolling
                });
                
                blogPostsContainer.appendChild(postElement);
            });
        }
        
        // Render pagination controls
        function renderPagination(totalPosts) {
            const totalPages = Math.ceil(totalPosts / postsPerPage);
            
            if (totalPages <= 1) {
                paginationContainer.innerHTML = '';
                return;
            }
            
            let paginationHTML = '';
            
            // Previous button
            paginationHTML += `
                <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" 
                        ${currentPage === 1 ? 'disabled' : ''}
                        data-page="${currentPage - 1}">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `;
            
            // Page numbers
            for (let i = 1; i <= totalPages; i++) {
                paginationHTML += `
                    <button class="pagination-btn ${currentPage === i ? 'active' : ''}" 
                            data-page="${i}">
                        ${i}
                    </button>
                `;
            }
            
            // Next button
            paginationHTML += `
                <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                        ${currentPage === totalPages ? 'disabled' : ''}
                        data-page="${currentPage + 1}">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `;
            
            paginationContainer.innerHTML = paginationHTML;
            
            // Add event listeners to pagination buttons
            document.querySelectorAll('.pagination-btn').forEach(button => {
                if (!button.disabled) {
                    button.addEventListener('click', () => {
                        currentPage = parseInt(button.getAttribute('data-page'));
                        renderPosts(filteredPosts, currentPage);
                        renderPagination(filteredPosts.length);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                }
            });
        }
        
        // Filter posts by category
        if (filterButtons) {
            filterButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const category = button.getAttribute('data-category');
                    
                    // Update active button
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    // Filter posts
                    filteredPosts = category === 'all' 
                        ? [...allPosts]
                        : allPosts.filter(post => post.category === category);
                    
                    // Reset to first page and render
                    currentPage = 1;
                    renderPosts(filteredPosts, currentPage);
                    renderPagination(filteredPosts.length);
                });
            });
        }
        
        // Search functionality
        if (searchInput && searchButton) {
            function performSearch() {
                const query = searchInput.value.trim().toLowerCase();
                
                if (query === '') {
                    // Reset to all posts if search is cleared
                    const activeFilter = document.querySelector('.filter-btn.active');
                    const category = activeFilter ? activeFilter.getAttribute('data-category') : 'all';
                    
                    filteredPosts = category === 'all'
                        ? [...allPosts]
                        : allPosts.filter(post => post.category === category);
                } else {
                    // Filter by search query
                    filteredPosts = allPosts.filter(post => {
                        return post.title.toLowerCase().includes(query) || 
                               post.excerpt.toLowerCase().includes(query) || 
                               post.content.toLowerCase().includes(query);
                    });
                }
                
                // Reset to first page and render
                currentPage = 1;
                renderPosts(filteredPosts, currentPage);
                renderPagination(filteredPosts.length);
            }
            
            searchButton.addEventListener('click', performSearch);
            
            searchInput.addEventListener('keyup', e => {
                if (e.key === 'Enter') {
                    performSearch();
                }
            });
        }
        
        // Modal functionality
        if (modalClose && modal) {
            modalClose.addEventListener('click', () => {
                modal.classList.remove('active');
                document.body.style.overflow = ''; // Restore scrolling
            });
            
            // Close modal when clicking outside content
            modal.addEventListener('click', e => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
            
            // Close modal with escape key
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        }
    }

    // Initialize
    const os = detectOS();
    updateDownloadButtons(os);
    addHeroAnimations();
    initializeBlog(); // Initialize blog functionality
    setTimeout(addTiltEffect, 1000); // Add tilt effect after page loads
    setTimeout(setupDiscordInteractions, 1000); // Setup Discord interactions
    
    // Add scroll event listeners
    window.addEventListener('scroll', animateOnScroll);
    window.addEventListener('scroll', handleHeaderScroll);
    
    // Initial call to animate elements visible on page load
    animateOnScroll();
    handleHeaderScroll();

    // Handle window resize for mobile menu
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLinks) {
            navLinks.classList.remove('active');
        }
    });
});