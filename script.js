// Portfolio Script - Filtering & Gallery Logic
function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

async function loadProjects() {
    try {
        const response = await fetch('projects.json');
        if (!response.ok) throw new Error('Failed to fetch projects.json');
        const data = await response.json();
        const gallery = document.getElementById('gallery');
        gallery.innerHTML = '';
        data.projects.forEach(project => {
            const projectElement = document.createElement('div');
            const category = project.category.toLowerCase().trim();
            projectElement.className = `gallery-item ${category}`;
            if (project.noPhone) projectElement.className += ' no-phone';
            const logoPath = `Elements/image/${project.id}-logo.png`;
            const previewPath = `Elements/image/${project.id}.jpg`;
            projectElement.innerHTML = `
                <a href="${project.path}/index.html" target="_blank">
                    <div class="project-logo"><img src="${logoPath}" alt="Logo"></div>
                    <img src="${previewPath}" class="gallery-img" alt="${project.title}">
                    <div class="overlay">
                        <div class="overlay-text">${project.creator} - <strong>${project.title}</strong></div>
                    </div>
                </a>
            `;
            gallery.appendChild(projectElement);
        });
        showAllItems();
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

async function loadArtworks() {
    const response = await fetch('art.json');
    const data = await response.json();
    const artGallery = document.querySelector('.art-gallery-container');
    artGallery.innerHTML = '';
    data.artworks.forEach(artwork => {
        const artElement = document.createElement('div');
        artElement.className = 'art-item';
        const imagePath = `Elements/image/3D/${artwork.id}.jpg`;
        artElement.innerHTML = `
            <img src="${imagePath}" class="art-img" alt="${artwork.title}">
            <div class="art-info">
                <h3 class="art-title">"${artwork.title}"</h3>
            </div>
        `;
        artGallery.appendChild(artElement);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    loadArtworks();
    // Scrolling text
    const scrollingTexts = document.querySelectorAll('.scrolling-text p');
    let speed = window.innerWidth < 768 ? 50 : 100;
    scrollingTexts.forEach(p => {
        const textContent = p.textContent.trim();
        const computedStyle = window.getComputedStyle(p);
        const font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const textWidth = getTextWidth(textContent, font);
        const repeatCount = 99;
        let repeatedText = '';
        for (let i = 0; i < repeatCount; i++) repeatedText += textContent + ' ';
        p.textContent = repeatedText.trim();
        const totalWidth = textWidth * repeatCount;
        const animationDuration = totalWidth / speed;
        p.style.whiteSpace = 'nowrap';
        p.style.display = 'inline-block';
        p.style.animation = `scroll-left ${animationDuration}s linear infinite`;
    });
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = `@keyframes scroll-left {from {transform: translateX(0);}to {transform: translateX(-100%);}}`;
    document.head.appendChild(styleSheet);
    // Cursor
    const cursor = document.createElement('div');
    cursor.classList.add('cursor');
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX + window.scrollX;
        const y = e.clientY + window.scrollY;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    });
    document.addEventListener('scroll', (e) => {
        const x = e.clientX + window.scrollX;
        const y = e.clientY + window.scrollY;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    });
    // Navigation
    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const everythingLinkMobile = document.getElementById('everything-mobile');
    const infoLink = document.getElementById('info-link');
    const infoLinkMobile = document.getElementById('info-link-mobile');
    const infosContainer = document.getElementById('infos');
    const headerContainer = document.getElementById('header');
    const art3dLink = document.getElementById('art-link');
    const art3dLinkMobile = document.getElementById('art-link-mobile');
    const art3dGallery = document.getElementById('art-gallery');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        document.querySelectorAll('.no-phone').forEach(item => {
            const link = item.querySelector('a');
            if (link) {
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    alert("Ce site n'est pas accessible sur un téléphone.");
                });
            }
        });
    }
    personalProjectLink.addEventListener('click', function(e) {
        e.preventDefault();
        filterItems('personal-project');
    });
    commissionsLink.addEventListener('click', function(e) {
        e.preventDefault();
        filterItems('commission');
    });
    everythingLink.addEventListener('click', function(e) {
        e.preventDefault();
        showAllItems();
    });
    everythingLinkMobile.addEventListener('click', function(e) {
        e.preventDefault();
        showAllItems();
    });
    infoLink.addEventListener('click', function(e) {
        e.preventDefault();
        showInfoText();
    });
    infoLinkMobile.addEventListener('click', function(e) {
        e.preventDefault();
        showInfoText();
    });
    art3dLink.addEventListener('click', function(e) {
        e.preventDefault();
        show3dArt();
    });
    art3dLinkMobile.addEventListener('click', function(e) {
        e.preventDefault();
        show3dArt();
    });
    function show3dArt() {
        resetScrollPositions();
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.style.display = 'none';
        });
        headerContainer.style.display = 'none';
        infosContainer.style.display = 'none';
        document.getElementById('gallery').style.display = 'none';
        art3dGallery.style.display = 'block';
    }
    function showAllItems() {
        resetScrollPositions();
        const gallery = document.getElementById('gallery');
        gallery.style.display = 'flex';
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.style.display = 'block';
        });
        art3dGallery.style.display = 'none';
        infosContainer.style.display = 'none';
        headerContainer.style.display = 'block';
    }
    function filterItems(category) {
        resetScrollPositions();
        const gallery = document.getElementById('gallery');
        gallery.style.display = 'flex';
        const items = document.querySelectorAll('.gallery-item');
        const targetCategory = category.toLowerCase().trim();
        items.forEach(item => {
            if (item.classList.contains(targetCategory)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
        headerContainer.style.display = 'none';
        infosContainer.style.display = 'none';
        art3dGallery.style.display = 'none';
    }
    function showInfoText() {
        resetScrollPositions();
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.style.display = 'none';
        });
        headerContainer.style.display = 'none';
        art3dGallery.style.display = 'none';
        document.getElementById('gallery').style.display = 'none';
        infosContainer.style.display = 'block';
    }
    function resetScrollPositions() {
        window.scrollTo(0, 0);
        document.querySelectorAll('.gallery-item').forEach(item => {
            if (item.scrollTop) item.scrollTop = 0;
        });
    }
    const links = document.querySelectorAll('.link');
    const linksMobile = document.querySelectorAll('.link-mobile');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            links.forEach(l => l.classList.remove('clicked'));
            linksMobile.forEach(l => l.classList.remove('clicked'));
            link.classList.add('clicked');
        });
    });
    linksMobile.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            links.forEach(l => l.classList.remove('clicked'));
            linksMobile.forEach(l => l.classList.remove('clicked'));
            link.classList.add('clicked');
        });
    });
    const landingLogo = document.getElementById('landing-logo');
    const landingPage = document.querySelector('.landing-page');
    const body = document.body;
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
    var unavailableLinks = document.querySelectorAll('.unavailable a');
    unavailableLinks.forEach(function(link) {
        link.addEventListener('click', function(event) {
            event.preventDefault();
            alert("Ce site n'est pas accessible pour l'instant");
        });
    });
});
document.addEventListener('scroll', function() {
    if (window.innerWidth < 768) return;
    // Parallax effect for gallery images
    const galleryItems = document.querySelectorAll('.gallery-item');
    const scrollPosition = window.pageYOffset;
    galleryItems.forEach(item => {
        const img = item.querySelector('.gallery-img');
        if (!img) return;
        const speed = 2;
        const offset = item.getBoundingClientRect().top + scrollPosition;
        const imgYOffset = (scrollPosition - offset) / speed;
        img.style.transform = `translateY(${imgYOffset}px)`;
    });
});
document.addEventListener("DOMContentLoaded", function () {
    if (window.innerWidth < 768) {
        const items = document.querySelectorAll(".art-item, .gallery-item");
        function checkPosition() {
            let middleScreen = window.innerHeight / 2;
            items.forEach(item => {
                let rect = item.getBoundingClientRect();
                let itemCenter = rect.top + rect.height / 2;
                if (Math.abs(middleScreen - itemCenter) < rect.height / 2) {
                    item.classList.add("active");
                } else {
                    item.classList.remove("active");
                }
            });
        }
        window.addEventListener("scroll", checkPosition);
        checkPosition();
    }
});
