document.addEventListener('DOMContentLoaded', function() {
    
    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const infoLink = document.getElementById('info-link');
    const infosContainer = document.getElementById('infos');
    const galleryItems = document.querySelectorAll('.gallery-item');

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
        galleryItems.forEach(item => {
            item.style.display = 'block';
        });
        infosContainer.style.display = 'none';  // Hide infos container when showing all items
    }

    function filterItems(category) {
        galleryItems.forEach(item => {
            if (item.classList.contains(category)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
        infosContainer.style.display = 'none';  // Hide infos container when filtering items
    }

    function showInfoText() {
        galleryItems.forEach(item => {
            item.style.display = 'none';
        });
        infosContainer.style.display = 'block';
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
