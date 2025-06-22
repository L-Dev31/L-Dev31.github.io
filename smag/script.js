// Global data storage
let imagesData = [];
let musicsData = [];
let mediasData = [];
let creditsData = [];
let newsData = [];
let teamData = [];
let countriesData = [];

// Loading functions for specific sections
function showSectionLoading(containerSelector, message = 'Loading...') {
    const container = document.querySelector(containerSelector);
    if (container) {
        container.innerHTML = `
            <div class="section-loading">
                <div class="loading-content">
                    <img src="Images/loading.gif" alt="Loading..." class="loading-gif">
                    <p class="loading-text">${message}</p>
                </div>
            </div>
        `;
    }
}

function hideSectionLoading(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (container) {
        container.innerHTML = '';
    }
}

// Load JSON data
async function loadData() {
    try {
        const [imagesResponse, musicsResponse, mediasResponse, creditsResponse, newsResponse, teamResponse, countriesResponse] = await Promise.all([
            fetch('Datas/images.json'),
            fetch('Datas/musics.json'),
            fetch('Datas/medias.json'),
            fetch('Datas/credits.json'),
            fetch('Datas/news.json'),
            fetch('Datas/team.json'),
            fetch('Datas/countries.json')
        ]);
        
        // Check if all responses are ok
        if (!imagesResponse.ok || !musicsResponse.ok || !mediasResponse.ok || 
            !creditsResponse.ok || !newsResponse.ok || !teamResponse.ok || !countriesResponse.ok) {
            throw new Error('Failed to fetch one or more JSON files');
        }
        
        imagesData = await imagesResponse.json();
        musicsData = await musicsResponse.json();
        mediasData = await mediasResponse.json();
        creditsData = await creditsResponse.json();
        newsData = await newsResponse.json();
        teamData = await teamResponse.json();
        countriesData = await countriesResponse.json();
        
        // Initialize components after data is loaded
        initializeCarousel();
        initializeMusicPlayers();
        initializeMedias();
        initializeCredits();
        initializeNews();
        
    } catch (error) {
        console.error('Error loading JSON data:', error);
        
        // Show error message to user instead of loading indicators
        showSectionLoading('.pic-ctn', 'Failed to load screenshots');
        showSectionLoading('.boxart', 'Failed to load music tracks');
        showSectionLoading('.media-container', 'Failed to load videos');
        showSectionLoading('.credits-container', 'Failed to load credits');
        showSectionLoading('.news-container', 'Failed to load blog posts');
    }
}

// Page Navigation
document.addEventListener('DOMContentLoaded', function () {
    const sections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('.nav-link');

    // Hide all sections and show only the first one
    sections.forEach((section, index) => {
        if (index === 0) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });

    // Set first nav link as active
    navLinks.forEach((link, index) => {
        if (index === 0) {
            link.style.textDecoration = 'underline';
        } else {
            link.style.textDecoration = 'none';
        }
    });

    // Managing clicks
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();

            // Hide all sections
            sections.forEach(section => {
                section.classList.remove('active');
            });

            // Show selected section
            const targetSection = document.querySelector(this.getAttribute('href'));
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // Update active nav link
            navLinks.forEach(navLink => navLink.style.textDecoration = 'none');
            this.style.textDecoration = 'underline';
        });
    });

    // Load JSON data
    loadData();
});// Initialize carousel with JSON data
function initializeCarousel() {
    const picCtn = document.querySelector('.pic-ctn');
    
    // Show loading indicator
    showSectionLoading('.pic-ctn', 'Loading screenshots...');
    
    // Use requestAnimationFrame for smoother loading
    requestAnimationFrame(() => {
        // Clear existing images
        picCtn.innerHTML = '';
        
        // Create images from JSON data with error handling
        let loadedImages = 0;
        const totalImages = imagesData.length;
        
        imagesData.forEach((image, index) => {
            const img = document.createElement('img');
            img.src = image.src;
            img.alt = image.alt;
            img.className = 'pic';
            
            // Handle image load and error events
            img.onload = () => {
                loadedImages++;
                if (loadedImages === totalImages) {
                    // Initialize carousel functionality when all images are loaded
                    setupCarousel();
                }
            };
            
            img.onerror = () => {
                console.warn(`Failed to load image: ${image.src}`);
                img.src = 'Images/favicon.png'; // Fallback image
                loadedImages++;
                if (loadedImages === totalImages) {
                    setupCarousel();
                }
            };
            
            picCtn.appendChild(img);
        });
        
        // Fallback: initialize carousel after 2 seconds even if images haven't loaded
        setTimeout(() => {
            if (loadedImages < totalImages) {
                console.warn('Some images failed to load, initializing carousel anyway');
                setupCarousel();
            }
        }, 2000);
    });
}

// Screenshots Carousel
function setupCarousel() {
    const picCtn = document.querySelector('.pic-ctn');
    const pics = Array.from(picCtn.querySelectorAll('.pic'));
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');

    let currentIndex = 0;
    let interval;

    function showImage(index) {
        // Remove all classes from all images
        pics.forEach((pic) => {
            pic.classList.remove('active', 'previous', 'next');
        });
        
        // Add active class only to the current image
        pics[index].classList.add('active');
    }

    function nextImage() {
        currentIndex = (currentIndex + 1) % pics.length;
        showImage(currentIndex);
    }

    function prevImage() {
        currentIndex = (currentIndex - 1 + pics.length) % pics.length;
        showImage(currentIndex);
    }

    function startCarousel() {
        interval = setInterval(nextImage, 4000);
    }

    function stopCarousel() {
        clearInterval(interval);
    }

    showImage(currentIndex);

    prevBtn.addEventListener('click', () => {
        stopCarousel();
        prevImage();
        startCarousel();
    });

    nextBtn.addEventListener('click', () => {
        stopCarousel();
        nextImage();
        startCarousel();
    });

    picCtn.addEventListener('mouseenter', stopCarousel);
    picCtn.addEventListener('mouseleave', startCarousel);

    startCarousel();
}

// Initialize music players with JSON data
function initializeMusicPlayers() {
    const boxartContainer = document.querySelector('.boxart');
    
    // Show loading indicator
    showSectionLoading('.boxart', 'Loading music tracks...');
    
    // Use requestAnimationFrame for smoother loading
    requestAnimationFrame(() => {
        // Clear existing players
        boxartContainer.innerHTML = '';
        
        // Filter only released tracks
        const releasedTracks = musicsData.tracks.filter(track => track.released === true);
        
        // Create music players from JSON data
        releasedTracks.forEach((track, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player';
            
            playerDiv.innerHTML = `
                <div class="imgbox">
                    <img src="${track.boxart}" alt="${track.title}">
                </div>
                <audio id="audio${index + 1}" src="${track.src}" type="${track.type}" controls></audio>
            `;
            
            boxartContainer.appendChild(playerDiv);
        });
        
        // Setup audio controls
        setupAudioControls();
    });
}

// Initialize medias with JSON data
function initializeMedias() {
    const mediaContainer = document.querySelector('.media-container');
    const mediaSection = document.querySelector('#media .container');
    
    // Show loading indicator
    showSectionLoading('.media-container', 'Loading videos...');
    
    // Use requestAnimationFrame for smoother loading
    requestAnimationFrame(() => {
        // Clear existing content
        mediaContainer.innerHTML = '';
        
        // Clear existing videos from old system
        const videoElements = mediaSection.querySelectorAll('.trailer__player');
        videoElements.forEach(element => element.remove());
        
        // Clear existing video titles
        const h5Elements = mediaSection.querySelectorAll('h5');
        h5Elements.forEach(element => {
            if (element.querySelector('strong')) {
                element.remove();
            }
        });
        
        // Sort videos by year in descending order (newest first)
        const sortedVideos = [...mediasData.videos].sort((a, b) => b.year - a.year);
        
        sortedVideos.forEach(video => {
            // Create title
            const titleH5 = document.createElement('h5');
            titleH5.innerHTML = `<strong>${video.title}</strong>`;
            
            // Create video player
            const playerDiv = document.createElement('div');
            playerDiv.className = 'trailer__player';
            
            const figure = document.createElement('figure');
            figure.className = 'video';
            
            const iframe = document.createElement('iframe');
            iframe.width = video.width;
            iframe.height = video.height;
            iframe.src = `https://www.youtube.com/embed/${video.embedId}`;
            
            figure.appendChild(iframe);
            playerDiv.appendChild(figure);
            
            // Add to container
            mediaContainer.appendChild(titleH5);
            mediaContainer.appendChild(playerDiv);        });
    });
}

// Initialize credits with JSON data
function initializeCredits() {
    const creditsContainer = document.querySelector('.credits-container');
    const creditsSection = document.querySelector('#credits .container');
    
    // Show loading indicator
    showSectionLoading('.credits-container', 'Loading credits...');
    
    // Use requestAnimationFrame for smoother loading
    requestAnimationFrame(() => {
        // Clear existing content
        creditsContainer.innerHTML = '';
        
        // Clear existing credits from old system (keep only h2)
        const existingH5s = creditsSection.querySelectorAll('h5');
        existingH5s.forEach(h5 => h5.remove());
          // Add regular credits
        creditsData.credits.forEach(credit => {
            const h5 = document.createElement('h5');
            
            // Resolve contributor IDs to clickable names
            const contributorNames = credit.contributors.map(contributorId => {
                const member = teamData.members.find(member => member.id === contributorId);
                if (member) {
                    return makePersonClickable(member.name, member.id);
                }
                return contributorId;
            });
            
            // Add role with line break, then contributors
            h5.innerHTML = `<strong>${credit.role}:</strong><br>${contributorNames.join(', ')}`;
            creditsContainer.appendChild(h5);
        });        // Add special credits section if it exists
        if (creditsData.special && creditsData.special.length > 0) {
            creditsData.special.forEach(credit => {
                const h5 = document.createElement('h5');
                h5.style.marginTop = '30px';
                
                // Resolve contributor IDs to clickable names with special class
                const contributorNames = credit.contributors.map(contributorId => {
                    const member = teamData.members.find(member => member.id === contributorId);
                    if (member) {
                        return makePersonClickable(member.name, member.id, credit.class || '');
                    }
                    return contributorId;
                });
                
                // Add role with line break, then contributors
                h5.innerHTML = `<strong>${credit.role}:</strong><br>${contributorNames.join(', ')}`;
                
                // Add special class if specified
                if (credit.class) {
                    h5.classList.add(credit.class);
                }
                
                creditsContainer.appendChild(h5);
            });
        }// Add recruitment section if it exists
        if (creditsData.recruitment) {
            const recruitment = creditsData.recruitment;
            const recruitmentH5 = document.createElement('h5');
            recruitmentH5.style.marginTop = '30px';
            recruitmentH5.style.fontWeight = 'normal'; // Override bold styling
            recruitmentH5.style.textTransform = 'none'; // Override uppercase styling
            
            // Format Discord usernames individually with same gray "or" as rest of text
            const discordUsersFormatted = recruitment.discord_users
                .map(user => `<strong>${user}</strong>`)
                .join(' <span style="color: #555;">or</span> ');
            
            recruitmentH5.innerHTML = `${recruitment.message}<br>${recruitment.contact} ${discordUsersFormatted} ${recruitment.additional_text}`;
            
            creditsContainer.appendChild(recruitmentH5);
        }
    });
}

// Initialize news with JSON data
async function initializeNews() {
    const newsContainer = document.querySelector('.news-container');
    const searchInput = document.getElementById('blog-search');
    
    // Show loading indicator
    showSectionLoading('.news-container', 'Loading blog posts...');
    
    // Use requestAnimationFrame for smoother initialization
    requestAnimationFrame(async () => {
        // Create news articles from JSON data
        await displayNews(newsData.blogs, false);
        
        // Setup search functionality
        setupNewsSearch();
        
        // Setup keyboard support for popup
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeBlogPopup();
            }
        });
    });
}

// Display news articles
async function displayNews(blogs, isSearchResult = false) {
    const newsContainer = document.querySelector('.news-container');
    newsContainer.innerHTML = '';

    // Sort blogs by publishDate DESC (latest first)
    const sortedBlogs = [...blogs].sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

    // Check if there are no blog articles
    if (!sortedBlogs || sortedBlogs.length === 0) {
        const noBlogsMessage = document.createElement('div');
        noBlogsMessage.className = 'no-blogs-message';

        if (isSearchResult) {
            // No search results found
            noBlogsMessage.innerHTML = `
                <div class="no-blogs-content">
                    <i class="fas fa-search" style="font-size: 48px; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>No Results Found</h3>
                    <p>We couldn't find any blog posts matching your search. Try different keywords or browse all posts.</p>
                </div>
            `;
        } else {
            // No blog posts at all
            noBlogsMessage.innerHTML = `
                <div class="no-blogs-content">
                    <i class="fas fa-newspaper" style="font-size: 48px; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>No Blog Posts Yet</h3>
                    <p>Stay tuned! The SMAG Team will be sharing updates and insights here soon.</p>
                </div>
            `;
        }

        newsContainer.appendChild(noBlogsMessage);
        return;
    }

    // Create blog cards with read time calculation
    const blogCards = await Promise.all(sortedBlogs.map(async (blog, index) => {
        const article = document.createElement('div');
        article.className = 'news-article';
        article.style.animationDelay = `${index * 0.1}s`;
        article.style.cursor = 'pointer';
        
        // Format date
        const date = new Date(blog.publishDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        // Get author info from team data
        const author = teamData.members.find(member => member.id === blog.authorId) || {
            name: 'Unknown',
            avatar: 'Images/favicon.png'
        };

        // Load HTML content and calculate read time
        let readTime = 'Loading...';
        try {
            const htmlContent = await loadBlogContent(blog.id);
            readTime = calculateReadTime(htmlContent);
        } catch (error) {
            console.error(`Error calculating read time for blog ${blog.id}:`, error);
            readTime = '-- min read';
        }

        article.innerHTML = `
            <div class="news-image">
                <!-- Image will be added via JavaScript -->
            </div>
            <div class="news-content">
                <div class="news-views-top" data-blog-id="${blog.id}">
                    <i class="fas fa-eye"></i> Loading views...
                </div>
                <div class="news-header">
                    <h3 class="news-title">${blog.title}</h3>
                    <p class="news-summary">${blog.summary}</p>
                </div>
                <div class="news-meta">
                    <div class="news-author clickable-author" onclick="openPersonalCard('${blog.authorId}')" title="Click to view ${author.name}'s profile">
                        <img src="${author.avatar}" alt="${author.name}" class="author-avatar">
                        <div class="author-info">
                            <span class="author-name">${author.name}</span>
                        </div>
                    </div>
                    <div class="news-details">
                        <span class="read-time">${readTime}</span>
                        <span class="news-card-date">${formattedDate}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Add blog image using utility function
        const imageContainer = article.querySelector('.news-image');
        const blogImage = createBlogImage(blog.id, blog.title);
        imageContainer.appendChild(blogImage);

        // Add click handler to open popup
        article.addEventListener('click', (e) => {
            // Don't open blog popup if clicking on author (check if click is within author container)
            if (e.target.closest('.clickable-author')) {
                return;
            }
            openBlogPopup(blog);
        });

        return article;
    }));    // Add all blog cards to the container
    blogCards.forEach(article => {
        newsContainer.appendChild(article);
    });
    
    // Load view counts for all articles
    loadBlogViewCounts();
}

// Load view counts for all displayed blog articles
async function loadBlogViewCounts() {
    const viewElements = document.querySelectorAll('.news-views-top[data-blog-id]');
    
    for (const element of viewElements) {
        const blogId = element.dataset.blogId;
        try {
            const viewCount = await getBlogViews(blogId);
            element.innerHTML = `<i class="fas fa-eye"></i> ${formatViewCount(viewCount)}`;
        } catch (error) {
            console.error(`Error loading views for blog ${blogId}:`, error);
            element.innerHTML = '<i class="fas fa-eye"></i> 0 views';
        }
    }
}

// Open blog popup
async function openBlogPopup(blog) {
    // Create popup if it doesn't exist
    let popup = document.getElementById('blog-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'blog-popup';
        popup.className = 'blog-popup';
        document.body.appendChild(popup);
    }
    
    // Show loading state
    popup.innerHTML = `
        <button class="blog-close" onclick="closeBlogPopup()">&times;</button>
        <div class="blog-popup-content">
            <div class="blog-popup-header">
                <h1 class="blog-popup-title">${blog.title}</h1>
                <p>Loading...</p>
            </div>
        </div>
    `;
      // Show popup immediately
    popup.style.display = 'flex';
    lockScroll();
    
    try {
        // Load HTML content
        const htmlContent = await loadBlogContent(blog.id);
        
        // Calculate read time
        const readTime = calculateReadTime(htmlContent);
        
        // Format date
        const date = new Date(blog.publishDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        // Get author info from team data
        const author = teamData.members.find(member => member.id === blog.authorId) || {
            name: 'Unknown',
            avatar: 'Images/favicon.png'
        };
        
        // Update popup with full content
        popup.innerHTML = `
            <button class="blog-close" onclick="closeBlogPopup()">&times;</button>
            <div class="blog-popup-content">
                <div class="blog-popup-header">
                    <h1 class="blog-popup-title">${blog.title}</h1>
                    <div class="blog-popup-meta-line">
                        <div class="blog-popup-author clickable-author" onclick="openPersonalCard('${blog.authorId}')" title="Click to view ${author.name}'s profile">
                            <img src="${author.avatar}" alt="${author.name}">
                            <div class="blog-popup-author-info">
                                <p>${author.name}</p>
                            </div>
                        </div>
                        <div class="blog-popup-date-info">
                            <div class="blog-popup-read-time">${readTime}</div>
                            <div class="blog-popup-date">${formattedDate}</div>
                        </div>
                    </div>
                    <div class="blog-popup-image">
                        <!-- Image will be added via JavaScript -->
                    </div>
                    <hr class="blog-popup-separator">
                </div>
                <div class="blog-popup-content-text">
                    ${htmlContent}
                </div>
            </div>
        `;
          // Add blog image using utility function
        const popupImageContainer = popup.querySelector('.blog-popup-image');
        const popupBlogImage = createBlogImage(blog.id, blog.title);
        popupImageContainer.appendChild(popupBlogImage);
        
    } catch (error) {
        console.error('Error loading blog content:', error);
        popup.innerHTML = `
            <button class="blog-close" onclick="closeBlogPopup()">&times;</button>
            <div class="blog-popup-content">
                <div class="blog-popup-header">
                    <h1 class="blog-popup-title">${blog.title}</h1>
                    <p>Error loading blog content. Please try again later.</p>
                </div>
            </div>
        `;
    }

    // Increment view count when blog is opened (only if not viewed before by this user)
    incrementBlogViewsOnce(blog.id).then(newViewCount => {
        // Update the view count in the blog list if visible
        const viewElement = document.querySelector(`.news-views-top[data-blog-id="${blog.id}"]`);
        if (viewElement) {
            viewElement.innerHTML = `<i class="fas fa-eye"></i> ${formatViewCount(newViewCount)}`;
        }
    }).catch(error => {
        console.error('Error incrementing blog views:', error);
    });
      
    // Add click outside to close
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            closeBlogPopup();
        }
    });
    
    // Add keyboard support (ESC to close)
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            closeBlogPopup();
        }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    // Store the event listener for cleanup
    popup._keydownHandler = handleKeyPress;    popup.classList.add('active');
    lockScroll();
}

// Personal card popup functionality
function openPersonalCard(personId) {
    // Find the person data
    const person = teamData.members.find(member => member.id === personId);
    if (!person) {
        console.error('Person not found:', personId);
        return;
    }
    
    // Find the country data with fallback
    let country = countriesData.countries.find(c => c.id === person.country);
    if (!country) {
        console.warn('Country not found:', person.country, 'using fallback');
        country = {
            id: person.country,
            name: person.country.toUpperCase(),
            flag: 'Images/favicon.png',
            background: 'Images/Embed.jpg'
        };
    }
    
    // Create popup if it doesn't exist
    let popup = document.getElementById('personal-card-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'personal-card-popup';
        popup.className = 'personal-card-popup';
        document.body.appendChild(popup);
    }      popup.innerHTML = `
        <div class="personal-card-overlay"></div>
        <div class="personal-card-container">            <div class="personal-card" style="background-image: url('${country.background}')">
                <div class="personal-card-avatar">
                    <img src="${person.avatar}" alt="${person.name}" onerror="this.src='Images/favicon.png'">
                </div>
                <div class="personal-card-content">
                    <h3 class="personal-card-name">${person.name}</h3>
                    <div class="personal-card-country">
                        <span class="country-label">Country:</span>
                        <img src="${country.flag}" alt="${country.name}" class="country-flag" onerror="this.src='Images/favicon.png'">
                        <span class="country-name">${country.name}</span>
                    </div>
                    <h4 class="personal-card-about">More about me</h4>
                    <div class="personal-card-description">
                        <p>${person.description}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add click outside to close
    popup.addEventListener('click', (e) => {
        if (e.target.classList.contains('personal-card-overlay') || e.target === popup) {
            closePersonalCard();
        }
    });
    
    // Add keyboard support (ESC to close)
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            closePersonalCard();
        }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    popup._keydownHandler = handleKeyPress;
    
    popup.classList.add('active');
    lockScroll();
}

function closePersonalCard() {
    const popup = document.getElementById('personal-card-popup');
    if (popup) {
        popup.classList.remove('active');
        unlockScroll();
        
        // Remove keyboard event listener
        if (popup._keydownHandler) {
            document.removeEventListener('keydown', popup._keydownHandler);
            popup._keydownHandler = null;
        }
    }
}

// Make person names clickable in credits
function makePersonClickable(personName, personId, additionalClass = '') {
    const classNames = `clickable-person ${additionalClass}`.trim();
    return `<span class="${classNames}" onclick="openPersonalCard('${personId}')" title="Click to view ${personName}'s profile">${personName}</span>`;
}

// Scroll lock utilities
let savedScrollY = 0;

function lockScroll() {
    // Save current scroll position
    savedScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    
    // Simply hide overflow to prevent scrolling without changing position
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Prevent scrolling on mobile by disabling touch events
    document.body.style.touchAction = 'none';
}

function unlockScroll() {
    // Restore scrolling
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.style.touchAction = '';
    
    // Ensure we're at the same scroll position (shouldn't be needed but just in case)
    if (savedScrollY !== window.pageYOffset) {
        window.scrollTo(0, savedScrollY);
    }
}

// Close blog popup
function closeBlogPopup() {
    const popup = document.getElementById('blog-popup');
    if (popup) {
        popup.classList.remove('active');
        unlockScroll();
        
        // Remove keyboard event listener
        if (popup._keydownHandler) {
            document.removeEventListener('keydown', popup._keydownHandler);
            popup._keydownHandler = null;
        }
    }
}

// Setup news search functionality
function setupNewsSearch() {
    const searchInput = document.getElementById('blog-search');
    const allArticles = document.querySelectorAll('.news-article');
      searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            // Show all articles
            await displayNews(newsData.blogs, false);
        } else {
            // Filter articles (note: we'll need to load content for search, but for now we'll search title/summary/author only)
            const filteredBlogs = newsData.blogs.filter(blog => {
                // Get author info for search
                const author = teamData.members.find(member => member.id === blog.authorId) || { name: '' };
                
                return blog.title.toLowerCase().includes(searchTerm) ||
                       blog.summary.toLowerCase().includes(searchTerm) ||
                       author.name.toLowerCase().includes(searchTerm);
            });
            
            await displayNews(filteredBlogs, true);
        }
    });
}

// Music controls
function setupAudioControls() {
    const audioElements = document.querySelectorAll('audio');

    audioElements.forEach(audio => {
        audio.addEventListener('play', () => {
            audioElements.forEach(otherAudio => {
                if (otherAudio !== audio && !otherAudio.paused) {
                    otherAudio.pause();
                    otherAudio.currentTime = 0; 
                }
            });
        });
    });
}

// Utility function to handle blog image loading with fallback
function createBlogImage(blogId, blogTitle, className = '') {
    const img = document.createElement('img');
    img.src = `Images/news/${blogId}.png`;
    img.alt = blogTitle;
    if (className) {
        img.className = className;
    }
    
    // Add error handling for missing blog images
    img.onerror = () => {
        console.warn(`Blog image not found: Images/news/${blogId}.png, using fallback`);
        img.src = 'Images/Embed.jpg'; // Use a generic fallback image
    };
    
    return img;
}

// View counting utilities using Firebase Realtime Database
const FIREBASE_URL = 'https://smag-blog-posts-default-rtdb.europe-west1.firebasedatabase.app';

// Check if user has already viewed this blog post
function hasUserViewedBlog(blogId) {
    const viewedBlogs = JSON.parse(localStorage.getItem('smag_viewed_blogs') || '[]');
    return viewedBlogs.includes(blogId);
}

// Mark blog as viewed by current user
function markBlogAsViewed(blogId) {
    const viewedBlogs = JSON.parse(localStorage.getItem('smag_viewed_blogs') || '[]');
    if (!viewedBlogs.includes(blogId)) {
        viewedBlogs.push(blogId);
        localStorage.setItem('smag_viewed_blogs', JSON.stringify(viewedBlogs));
        return true; // Blog was newly viewed
    }
    return false; // Blog was already viewed
}

// Increment blog views only if user hasn't viewed this blog before
async function incrementBlogViewsOnce(blogId) {
    // Check if user has already viewed this blog
    if (hasUserViewedBlog(blogId)) {
        // User has already viewed this blog, just return current count
        return await getBlogViews(blogId);
    }
    
    // Mark as viewed and increment count
    markBlogAsViewed(blogId);
    return await incrementBlogViews(blogId);
}

async function incrementBlogViews(blogId) {
    try {
        // Get current count
        const response = await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`);
        const currentViews = await response.json() || 0;
        
        // Increment by 1
        const newViews = currentViews + 1;
        
        // Update in Firebase
        await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`, {
            method: 'PUT',
            body: JSON.stringify(newViews)
        });
        
        return newViews;
    } catch (error) {
        console.error('Error incrementing blog views:', error);
        return 0;
    }
}

async function getBlogViews(blogId) {
    try {
        const response = await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`);
        const views = await response.json();
        return views || 0;
    } catch (error) {
        console.error('Error fetching blog views:', error);
        return 0;
    }
}

function formatViewCount(count) {
    if (count === 0) return '0 views';
    if (count === 1) return '1 view';
    if (count < 1000) return `${count} views`;
    if (count < 1000000) {
        // For thousands, show 1 decimal place but remove .0
        const kValue = count / 1000;
        const formatted = kValue % 1 === 0 ? kValue.toString() : kValue.toFixed(1);
        return `${formatted}k views`;
    }
    if (count < 1000000000) {
        // For millions, show 1-2 decimal places for precision but remove unnecessary zeros
        const mValue = count / 1000000;
        let formatted;
        if (mValue >= 100) {
            // 100M+ show no decimals
            formatted = Math.round(mValue).toString();
        } else if (mValue >= 10) {
            // 10M-99M show 1 decimal
            formatted = mValue % 1 === 0 ? mValue.toString() : mValue.toFixed(1);
        } else {
            // 1M-9M show 2 decimals for precision
            formatted = mValue.toFixed(2).replace(/\.?0+$/, '');
        }
        return `${formatted}M views`;
    }
    // For billions (MD in some languages means billion)
    const bValue = count / 1000000000;
    const formatted = bValue % 1 === 0 ? bValue.toString() : bValue.toFixed(1);
    return `${formatted}B views`;
}

// Calculate read time from HTML content
function calculateReadTime(htmlContent) {
    // Create a temporary element to strip HTML tags
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Get text content only
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    
    // Count words (split by whitespace and filter out empty strings)
    const words = textContent.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // Count images (img tags and video tags)
    const imageCount = tempDiv.querySelectorAll('img').length;
    const videoCount = tempDiv.querySelectorAll('video').length;
      // Calculate read time (average 200 words per minute, 5 seconds per image/video)
    const wordTimeMinutes = wordCount / 200;
    const mediaTimeMinutes = (imageCount + videoCount) * (5 / 60); // 5 seconds per image/video converted to minutes
    
    const totalTimeMinutes = Math.max(1, Math.ceil(wordTimeMinutes + mediaTimeMinutes));
    
    return `${totalTimeMinutes} min read`;
}

// Load HTML content from news folder
async function loadBlogContent(blogId) {
    try {
        const response = await fetch(`Datas/news/${blogId}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load blog content: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error loading blog content for ID ${blogId}:`, error);
        return '<p>Error loading blog content. Please try again later.</p>';
    }
}
