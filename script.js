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
    const speed = 100;

    scrollingTexts.forEach(p => {
        const textContent = p.textContent.trim();
        const parent = p.parentElement;
        const parentWidth = parent.offsetWidth;
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
    const infoLink = document.getElementById('info-link');
    const infosContainer = document.getElementById('infos');
    const galleryItems = document.querySelectorAll('.gallery-item');
    const headerContainer = document.getElementById('header');

    // Initially show all gallery items
    showAllItems();

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

    infoLink.addEventListener('click', function(e) {
        e.preventDefault();
        showInfoText();
    });

    function showAllItems() {
        resetScrollPositions();
        galleryItems.forEach(item => {
            item.style.display = 'block';
        });
        infosContainer.style.display = 'none';  // Hide infos container when showing all items
        headerContainer.style.display = 'block'; // Show Header when showing all items
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
        infosContainer.style.display = 'block';
    }

    function resetScrollPositions() {
        window.scrollTo(0, 0);  // Reset the scroll position of the window
        galleryItems.forEach(item => {
            item.scrollTop = 0;  // Reset the scroll position of each gallery item
        });
    }

    const links = document.querySelectorAll('.link');

    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Remove 'clicked' class from all links
            links.forEach(l => l.classList.remove('clicked'));
            // Add 'clicked' class to the clicked link
            link.classList.add('clicked');
        });
    });

    const landingLogo = document.getElementById('landing-logo');
    const landingPage = document.querySelector('.landing-page');
    const body = document.body;

    // Désactiver le défilement
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

