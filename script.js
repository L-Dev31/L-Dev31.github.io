document.addEventListener('DOMContentLoaded', function() {

    const landingLogo = document.getElementById('landing-logo');
    const landingPage = document.querySelector('.landing-page');

    // Waiting 
    setTimeout(() => {
        landingLogo.classList.add('shrink');
    }, 1000);

    // End Animation
    setTimeout(() => {
        landingPage.classList.add('hidden');
        document.querySelector('.navbar').style.display = 'flex';
        document.querySelector('.gallery').style.display = 'block';
    }, 2000);
    
    const personalProjectLink = document.getElementById('personal-project');
    const commissionsLink = document.getElementById('commissions');
    const everythingLink = document.getElementById('everything');
    const infoLink = document.getElementById('info');
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
    }

    function filterItems(category) {
        galleryItems.forEach(item => {
            if (item.classList.contains(category)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    function showInfoText() {
        filterItems('');
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
});

