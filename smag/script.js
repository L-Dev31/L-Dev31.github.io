let imagesData = [];
let musicsData = [];
let mediasData = [];
let creditsData = [];
let newsData = [];
let teamData = [];
let countriesData = [];

let FORCE_LOADING_ERROR = false;

function createLoadingSection(message = 'Loading...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'section-loading';
    loadingDiv.innerHTML = `
        <div class="loading-content">
            <img src="Images/loading.gif" alt="Loading..." class="loading-gif">
            <p class="loading-text">${message}</p>
        </div>
    `;
    return loadingDiv;
}

function showSectionLoading(containerSelector, message = 'Loading...') {
    if (containerSelector === '.pic-ctn') {
        // On masque le carousel
        const carouselDiv = document.querySelector('.carousel');
        if (carouselDiv) carouselDiv.style.display = 'none';
        // On affiche la section loading dans le parent du carousel (ex: .container)
        if (carouselDiv && carouselDiv.parentNode) {
            let loadingDiv = document.getElementById('carousel-loading-section');
            if (!loadingDiv) {
                loadingDiv = document.createElement('div');
                loadingDiv.id = 'carousel-loading-section';
                const carouselLoadingSection = createLoadingSection(message);
                loadingDiv.appendChild(carouselLoadingSection);
                carouselDiv.parentNode.insertBefore(loadingDiv, carouselDiv.nextSibling);
            } else {
                loadingDiv.style.display = '';
                loadingDiv.querySelector('.loading-text').textContent = message;
            }
        }
        return;
    }
    // Pour les autres sections, comportement normal
    const container = document.querySelector(containerSelector);
    if (container) {
        container.innerHTML = '';
        const loadingSection = createLoadingSection(message);
        container.appendChild(loadingSection);
    }
}

function hideSectionLoading(containerSelector) {
    if (containerSelector === '.pic-ctn') {
        // On enlève la section loading et on réaffiche le carousel
        const loadingDiv = document.getElementById('carousel-loading-section');
        if (loadingDiv) loadingDiv.style.display = 'none';
        const carouselDiv = document.querySelector('.carousel');
        if (carouselDiv) carouselDiv.style.display = '';
        return;
    }
    // Pour les autres sections, comportement normal
    const container = document.querySelector(containerSelector);
    if (container) {
        container.innerHTML = '';
    }
}

async function loadData() {
    try {
        if (FORCE_LOADING_ERROR) throw new Error('Forced error for loading test');
        const [imagesResponse, musicsResponse, mediasResponse, creditsResponse, newsResponse, teamResponse, countriesResponse] = await Promise.all([
            fetch('Datas/images.json'),
            fetch('Datas/musics.json'),
            fetch('Datas/medias.json'),
            fetch('Datas/credits.json'),
            fetch('Datas/news.json'),
            fetch('Datas/team.json'),
            fetch('Datas/countries.json')
        ]);
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
        initializeCarousel();
        initializeMusicPlayers();
        initializeMedias();
        initializeCredits();
        initializeNews();
    } catch (error) {
        console.error('Error loading JSON data:', error);
        showSectionLoading('.pic-ctn', 'Failed to load screenshots');
        showSectionLoading('.boxart', 'Failed to load music tracks');
        showSectionLoading('.media-container', 'Failed to load videos');
        showSectionLoading('.credits-container', 'Failed to load credits');
        showSectionLoading('.news-container', 'Failed to load blog posts');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const sections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('.nav-link');
    sections.forEach((section, index) => {
        if (index === 0) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
    navLinks.forEach((link, index) => {
        if (index === 0) {
            link.style.textDecoration = 'underline';
        } else {
            link.style.textDecoration = 'none';
        }
    });
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            sections.forEach(section => {
                section.classList.remove('active');
            });
            const targetSection = document.querySelector(this.getAttribute('href'));
            if (targetSection) {
                targetSection.classList.add('active');
            }
            navLinks.forEach(navLink => navLink.style.textDecoration = 'none');
            this.style.textDecoration = 'underline';
        });
    });
    loadData();
});

function initializeCarousel() {
    const picCtn = document.querySelector('.pic-ctn');
    showSectionLoading('.pic-ctn', 'Loading screenshots...');
    requestAnimationFrame(() => {
        picCtn.innerHTML = '';
        let loadedImages = 0;
        const totalImages = imagesData.length;
        imagesData.forEach((image, index) => {
            const img = document.createElement('img');
            img.src = image.src;
            img.alt = image.alt;
            img.className = 'pic';
            img.onload = () => {
                loadedImages++;
                if (loadedImages === totalImages) {
                    setupCarousel();
                }
            };
            img.onerror = () => {
                img.src = 'Images/favicon.png';
                loadedImages++;
                if (loadedImages === totalImages) {
                    setupCarousel();
                }
            };
            picCtn.appendChild(img);
        });
        setTimeout(() => {
            if (loadedImages < totalImages) {
                setupCarousel();
            }
        }, 2000);
    });
}

function setupCarousel() {
    const picCtn = document.querySelector('.pic-ctn');
    const pics = Array.from(picCtn.querySelectorAll('.pic'));
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    // Masquer le loader et réafficher le carousel
    const loadingDiv = document.getElementById('carousel-loading-section');
    if (loadingDiv) loadingDiv.style.display = 'none';
    const carouselDiv = document.querySelector('.carousel');
    if (carouselDiv) carouselDiv.style.display = '';
    let currentIndex = 0;
    let interval;
    function showImage(index) {
        pics.forEach((pic) => {
            pic.classList.remove('active', 'previous', 'next');
        });
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

function initializeMusicPlayers() {
    const boxartContainer = document.querySelector('.boxart');
    showSectionLoading('.boxart', 'Loading music tracks...');
    requestAnimationFrame(() => {
        boxartContainer.innerHTML = '';
        const releasedTracks = musicsData.tracks.filter(track => track.released === true);
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
        setupAudioControls();
    });
}

function initializeMedias() {
    const mediaContainer = document.querySelector('.media-container');
    const mediaSection = document.querySelector('#media .container');
    showSectionLoading('.media-container', 'Loading videos...');
    requestAnimationFrame(() => {
        mediaContainer.innerHTML = '';
        const videoElements = mediaSection.querySelectorAll('.trailer__player');
        videoElements.forEach(element => element.remove());
        const h5Elements = mediaSection.querySelectorAll('h5');
        h5Elements.forEach(element => {
            if (element.querySelector('strong')) {
                element.remove();
            }
        });
        const sortedVideos = [...mediasData.videos].sort((a, b) => b.year - a.year);
        sortedVideos.forEach(video => {
            const titleH5 = document.createElement('h5');
            titleH5.innerHTML = `<strong>${video.title}</strong>`;
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
            mediaContainer.appendChild(titleH5);
            mediaContainer.appendChild(playerDiv);        });
    });
}

function initializeCredits() {
    const creditsContainer = document.querySelector('.credits-container');
    const creditsSection = document.querySelector('#credits .container');
    showSectionLoading('.credits-container', 'Loading credits...');
    requestAnimationFrame(() => {
        creditsContainer.innerHTML = '';
        const existingH5s = creditsSection.querySelectorAll('h5');
        existingH5s.forEach(h5 => h5.remove());
        creditsData.credits.forEach(credit => {
            const h5 = document.createElement('h5');
            const contributorNames = credit.contributors.map(contributorId => {
                const member = teamData.members.find(member => member.id === contributorId);
                if (member) {
                    return makePersonClickable(member.name, member.id);
                }
                return contributorId;
            });
            h5.innerHTML = `<strong>${credit.role}:</strong><br>${contributorNames.join(', ')}`;
            creditsContainer.appendChild(h5);
        });        if (creditsData.special && creditsData.special.length > 0) {
            creditsData.special.forEach(credit => {
                const h5 = document.createElement('h5');
                h5.style.marginTop = '30px';
                const contributorNames = credit.contributors.map(contributorId => {
                    const member = teamData.members.find(member => member.id === contributorId);
                    if (member) {
                        return makePersonClickable(member.name, member.id, credit.class || '');
                    }
                    return contributorId;
                });
                h5.innerHTML = `<strong>${credit.role}:</strong><br>${contributorNames.join(', ')}`;
                if (credit.class) {
                    h5.classList.add(credit.class);
                }
                creditsContainer.appendChild(h5);
            });
        }if (creditsData.recruitment) {
            const recruitment = creditsData.recruitment;
            const recruitmentH5 = document.createElement('h5');
            recruitmentH5.style.marginTop = '30px';
            recruitmentH5.style.fontWeight = 'normal';
            recruitmentH5.style.textTransform = 'none';
            const discordUsersFormatted = recruitment.discord_users
                .map(user => `<strong>${user}</strong>`)
                .join(' <span style="color: #555;">or</span> ');
            recruitmentH5.innerHTML = `${recruitment.message}<br>${recruitment.contact} ${discordUsersFormatted} ${recruitment.additional_text}`;
            creditsContainer.appendChild(recruitmentH5);
        }
    });
}

async function initializeNews() {
    const newsContainer = document.querySelector('.news-container');
    const searchInput = document.getElementById('blog-search');
    showSectionLoading('.news-container', 'Loading blog posts...');
    requestAnimationFrame(async () => {
        await displayNews(newsData.blogs, false);
        setupNewsSearch();
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeBlogPopup();
            }
        });
    });
}

async function displayNews(blogs, isSearchResult = false) {
    const newsContainer = document.querySelector('.news-container');
    newsContainer.innerHTML = '';
    const sortedBlogs = [...blogs].sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    if (!sortedBlogs || sortedBlogs.length === 0) {
        const noBlogsMessage = document.createElement('div');
        noBlogsMessage.className = 'no-blogs-message';
        if (isSearchResult) {
            noBlogsMessage.innerHTML = `
                <div class="no-blogs-content">
                    <i class="fas fa-search" style="font-size: 48px; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>No Results Found</h3>
                    <p>We couldn't find any blog posts matching your search. Try different keywords or browse all posts.</p>
                </div>
            `;
        } else {
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
    const blogCards = await Promise.all(sortedBlogs.map(async (blog, index) => {
        const article = document.createElement('div');
        article.className = 'news-article';
        article.style.animationDelay = `${index * 0.1}s`;
        article.style.cursor = 'pointer';
        const date = new Date(blog.publishDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const author = teamData.members.find(member => member.id === blog.authorId) || {
            name: 'Unknown',
            avatar: 'Images/favicon.png'
        };
        let readTime = 'Loading...';
        try {
            const htmlContent = await loadBlogContent(blog.id);
            readTime = calculateReadTime(htmlContent);
        } catch (error) {
            readTime = '-- min read';
        }
        article.innerHTML = `
            <div class="news-image">
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
        const imageContainer = article.querySelector('.news-image');
        const blogImage = createBlogImage(blog.id, blog.title);
        imageContainer.appendChild(blogImage);
        article.addEventListener('click', (e) => {
            if (e.target.closest('.clickable-author')) {
                return;
            }
            openBlogPopup(blog);
        });
        return article;
    }));    blogCards.forEach(article => {
        newsContainer.appendChild(article);
    });
    loadBlogViewCounts();
}

async function loadBlogViewCounts() {
    const viewElements = document.querySelectorAll('.news-views-top[data-blog-id]');
    for (const element of viewElements) {
        const blogId = element.dataset.blogId;
        try {
            const viewCount = await getBlogViews(blogId);
            element.innerHTML = `<i class="fas fa-eye"></i> ${formatViewCount(viewCount)}`;
        } catch (error) {
            element.innerHTML = '<i class="fas fa-eye"></i> 0 views';
        }
    }
}

async function openBlogPopup(blog) {
    let popup = document.getElementById('blog-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'blog-popup';
        popup.className = 'blog-popup';
        document.body.appendChild(popup);
    }
    popup.innerHTML = `
        <button class="blog-close" onclick="closeBlogPopup()">&times;</button>
        <div class="blog-popup-content">
            <div class="blog-popup-header">
                <h1 class="blog-popup-title">${blog.title}</h1>
                <p>Loading...</p>
            </div>
        </div>
    `;
    popup.style.display = 'flex';
    lockScroll();
    try {
        const htmlContent = await loadBlogContent(blog.id);
        const readTime = calculateReadTime(htmlContent);
        const date = new Date(blog.publishDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const author = teamData.members.find(member => member.id === blog.authorId) || {
            name: 'Unknown',
            avatar: 'Images/favicon.png'
        };
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
                    </div>
                    <hr class="blog-popup-separator">
                </div>
                <div class="blog-popup-content-text">
                    ${htmlContent}
                </div>
            </div>
        `;
        const popupImageContainer = popup.querySelector('.blog-popup-image');
        const popupBlogImage = createBlogImage(blog.id, blog.title);
        popupImageContainer.appendChild(popupBlogImage);
    } catch (error) {
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
    incrementBlogViewsOnce(blog.id).then(newViewCount => {
        const viewElement = document.querySelector(`.news-views-top[data-blog-id="${blog.id}"]`);
        if (viewElement) {
            viewElement.innerHTML = `<i class="fas fa-eye"></i> ${formatViewCount(newViewCount)}`;
        }
    }).catch(error => {
    });
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            closeBlogPopup();
        }
    });
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            closeBlogPopup();
        }
    };
    document.addEventListener('keydown', handleKeyPress);
    popup._keydownHandler = handleKeyPress;    popup.classList.add('active');
    lockScroll();
}

function openPersonalCard(personId) {
    const person = teamData.members.find(member => member.id === personId);
    if (!person) {
        return;
    }
    let country = countriesData.countries.find(c => c.id === person.country);
    if (!country) {
        country = {
            id: person.country,
            name: person.country.toUpperCase(),
            flag: 'Images/favicon.png',
            background: 'Images/Embed.jpg'
        };
    }
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
    popup.addEventListener('click', (e) => {
        if (e.target.classList.contains('personal-card-overlay') || e.target === popup) {
            closePersonalCard();
        }
    });
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
        if (popup._keydownHandler) {
            document.removeEventListener('keydown', popup._keydownHandler);
            popup._keydownHandler = null;
        }
    }
}

function makePersonClickable(personName, personId, additionalClass = '') {
    const classNames = `clickable-person ${additionalClass}`.trim();
    return `<span class="${classNames}" onclick="openPersonalCard('${personId}')" title="Click to view ${personName}'s profile">${personName}</span>`;
}

let savedScrollY = 0;

function lockScroll() {
    savedScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
}

function unlockScroll() {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.style.touchAction = '';
    if (savedScrollY !== window.pageYOffset) {
        window.scrollTo(0, savedScrollY);
    }
}

function closeBlogPopup() {
    const popup = document.getElementById('blog-popup');
    if (popup) {
        popup.classList.remove('active');
        unlockScroll();
        if (popup._keydownHandler) {
            document.removeEventListener('keydown', popup._keydownHandler);
            popup._keydownHandler = null;
        }
    }
}

function setupNewsSearch() {
    const searchInput = document.getElementById('blog-search');
    const allArticles = document.querySelectorAll('.news-article');
      searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        if (searchTerm === '') {
            await displayNews(newsData.blogs, false);
        } else {
            const filteredBlogs = newsData.blogs.filter(blog => {
                const author = teamData.members.find(member => member.id === blog.authorId) || { name: '' };
                return blog.title.toLowerCase().includes(searchTerm) ||
                       blog.summary.toLowerCase().includes(searchTerm) ||
                       author.name.toLowerCase().includes(searchTerm);
            });
            await displayNews(filteredBlogs, true);
        }
    });
}

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

function createBlogImage(blogId, blogTitle, className = '') {
    const img = document.createElement('img');
    img.src = `Images/news/${blogId}.png`;
    img.alt = blogTitle;
    if (className) {
        img.className = className;
    }
    img.onerror = () => {
        img.src = 'Images/Embed.jpg';
    };
    return img;
}

const FIREBASE_URL = 'https://smag-blog-posts-default-rtdb.europe-west1.firebasedatabase.app';

function hasUserViewedBlog(blogId) {
    const viewedBlogs = JSON.parse(localStorage.getItem('smag_viewed_blogs') || '[]');
    return viewedBlogs.includes(blogId);
}

function markBlogAsViewed(blogId) {
    const viewedBlogs = JSON.parse(localStorage.getItem('smag_viewed_blogs') || '[]');
    if (!viewedBlogs.includes(blogId)) {
        viewedBlogs.push(blogId);
        localStorage.setItem('smag_viewed_blogs', JSON.stringify(viewedBlogs));
        return true;
    }
    return false;
}

async function incrementBlogViewsOnce(blogId) {
    if (hasUserViewedBlog(blogId)) {
        return await getBlogViews(blogId);
    }
    markBlogAsViewed(blogId);
    return await incrementBlogViews(blogId);
}

async function incrementBlogViews(blogId) {
    try {
        const response = await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`);
        const currentViews = await response.json() || 0;
        const newViews = currentViews + 1;
        await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`, {
            method: 'PUT',
            body: JSON.stringify(newViews)
        });
        return newViews;
    } catch (error) {
        return 0;
    }
}

async function getBlogViews(blogId) {
    try {
        const response = await fetch(`${FIREBASE_URL}/blog_views/${blogId}.json`);
        const views = await response.json();
        return views || 0;
    } catch (error) {
        return 0;
    }
}

function formatViewCount(count) {
    if (count === 0) return '0 views';
    if (count === 1) return '1 view';
    if (count < 1000) return `${count} views`;
    if (count < 1000000) {
        const kValue = count / 1000;
        const formatted = kValue % 1 === 0 ? kValue.toString() : kValue.toFixed(1);
        return `${formatted}k views`;
    }
    if (count < 1000000000) {
        const mValue = count / 1000000;
        let formatted;
        if (mValue >= 100) {
            formatted = Math.round(mValue).toString();
        } else if (mValue >= 10) {
            formatted = mValue % 1 === 0 ? mValue.toString() : mValue.toFixed(1);
        } else {
            formatted = mValue.toFixed(2).replace(/\.?0+$/, '');
        }
        return `${formatted}M views`;
    }
    const bValue = count / 1000000000;
    const formatted = bValue % 1 === 0 ? bValue.toString() : bValue.toFixed(1);
    return `${formatted}B views`;
}

function calculateReadTime(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    const words = textContent.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const imageCount = tempDiv.querySelectorAll('img').length;
    const videoCount = tempDiv.querySelectorAll('video').length;
    const wordTimeMinutes = wordCount / 200;
    const mediaTimeMinutes = (imageCount + videoCount) * (5 / 60);
    const totalTimeMinutes = Math.max(1, Math.ceil(wordTimeMinutes + mediaTimeMinutes));
    return `${totalTimeMinutes} min read`;
}

async function loadBlogContent(blogId) {
    try {
        const response = await fetch(`Datas/news/${blogId}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load blog content: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        return '<p>Error loading blog content. Please try again later.</p>';
    }
}
