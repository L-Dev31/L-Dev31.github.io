function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

document.addEventListener('DOMContentLoaded', function() {

    //Scrolling text
    const scrollingTexts = document.querySelectorAll('.scrolling-text p');

    //Speed in function of the device bc once again js is shitty as fuck
    let speed;
    if (window.innerWidth < 768) {  
        speed = 50;
    } else {
        speed = 100;
    }

    scrollingTexts.forEach(p => {
        const textContent = p.textContent.trim();
        const computedStyle = window.getComputedStyle(p);
        const font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const textWidth = getTextWidth(textContent, font);
        const repeatCount = 99; //Temporary since the code's shitty

        let repeatedText = '';
        for (let i = 0; i < repeatCount; i++) {
            repeatedText += textContent + ' ';
        }

        p.textContent = repeatedText.trim();
        
        const totalWidth = textWidth * repeatCount;
        const animationDuration = totalWidth / speed;

        p.style.whiteSpace = 'nowrap';
        p.style.display = 'inline-block';
        p.style.animation = `scroll-left ${animationDuration}s linear infinite`;
    });

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = `
    @keyframes scroll-left {
        from {
            transform: translateX(0);
        }
        to {
            transform: translateX(-100%);
        }
    }`;
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

    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const everythingLinkMobile = document.getElementById('everything-mobile');
    const infoLink = document.getElementById('info-link');
    const infoLinkMobile = document.getElementById('info-link-mobile')
    const infosContainer = document.getElementById('infos');
    const galleryItems = document.querySelectorAll('.gallery-item');
    const headerContainer = document.getElementById('header');
    const art3dLink = document.getElementById('art-link');
    const art3dLinkMobile = document.getElementById('art-link-mobile');
    const art3dGallery = document.getElementById('art-gallery');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Initially show all gallery items
    showAllItems();

    if (isMobile) {
        const noPhoneItems = document.querySelectorAll('.no-phone');
        
        noPhoneItems.forEach(item => {
            // Bloquer les liens ou masquer les éléments
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
        art3dGallery.style.display = 'none';
    });
    
    commissionsLink.addEventListener('click', function(e) {
        e.preventDefault();
        filterItems('commission');
        art3dGallery.style.display = 'none';
    });
    
    everythingLink.addEventListener('click', function(e) {
        e.preventDefault();
        showAllItems();
    });

    everythingLinkMobile.addEventListener('click', function(e) {
        e.preventDefault();
        showAllItems();
        art3dGallery.style.display = 'none';
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
    
    // Ajouter la fonction
    function show3dArt() {
        resetScrollPositions();
        galleryItems.forEach(item => {
            item.style.display = 'none';
        });
        headerContainer.style.display = 'none';
        infosContainer.style.display = 'none';
        art3dGallery.style.display = 'block';
    }

    function showAllItems() {
        resetScrollPositions();
        galleryItems.forEach(item => {
            item.style.display = 'block';
        });
        art3dGallery.style.display = 'none'; 
        infosContainer.style.display = 'none';  
        headerContainer.style.display = 'block'; 
    }

    function filterItems(category) {
        resetScrollPositions();
        galleryItems.forEach(item => {
            if (item.classList.contains(category)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
        headerContainer.style.display = 'none';
        infosContainer.style.display = 'none';  // Hide infos container when filtering items
    }

    function showInfoText() {
        resetScrollPositions();
        galleryItems.forEach(item => {
            item.style.display = 'none';
        });
        headerContainer.style.display = 'none';  // Hide Header
        art3dGallery.style.display = 'none';  // Hide art container
        infosContainer.style.display = 'block';
    }

    function resetScrollPositions() {
        window.scrollTo(0, 0);  // Reset the scroll position of the window
        galleryItems.forEach(item => {
            item.scrollTop = 0;  // Reset the scroll position of each gallery item
        });
    }

    const links = document.querySelectorAll('.link');
    const linksMobile = document.querySelectorAll('.link-mobile');

    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Remove 'clicked' class from all links
            links.forEach(l => l.classList.remove('clicked'));
            linksMobile.forEach(l => l.classList.remove('clicked'));
            // Add 'clicked' class to the clicked link
            link.classList.add('clicked');
        });
    });

    linksMobile.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Remove 'clicked' class from all links
            links.forEach(l => l.classList.remove('clicked'));
            linksMobile.forEach(l => l.classList.remove('clicked'));
            // Add 'clicked' class to the clicked link
            link.classList.add('clicked');
        });
    });

    const landingLogo = document.getElementById('landing-logo');
    const landingPage = document.querySelector('.landing-page');
    const body = document.body;

    // Désactiver le défilement
    body.classList.add('no-scroll');

    // Animer l'intro
    setTimeout(() => {
        window.scrollTo(0, 0); // Ramène en haut de la page
        landingLogo.classList.add('shrink'); // Ajoute une animation au logo
    }, 1000);

    // Cacher la page d'intro
    setTimeout(() => {
        landingPage.classList.add('hidden'); // Cache l'intro
    }, 2000);

    // Réactiver le défilement
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
    if (window.innerWidth < 768) {
        return; 
    }

    const galleryItemsImg = document.querySelectorAll('.gallery-img');
    const scrollPosition = window.pageYOffset;

    galleryItemsImg.forEach((img, index) => {
        const imgParent = img.parentElement;
        let speed = 5;
        const offset = imgParent.getBoundingClientRect().top + scrollPosition;
        const imgYOffset = (scrollPosition - offset) / speed;

        img.style.transform = `translateY(${imgYOffset}px)`;
    });
});

document.addEventListener("DOMContentLoaded", function () {
    if (window.innerWidth < 768) { // Appliquer seulement sur mobile
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
        checkPosition(); // Appel initial
    }
});



