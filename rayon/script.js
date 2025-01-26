
// FAQ Toggle Functionality
document.querySelectorAll('.faq-question').forEach((question) => {
    question.addEventListener('click', () => {
        const faqItem = question.parentElement;
        faqItem.classList.toggle('active');
    });
});
// Carousel Functionality
const carouselInner = document.querySelector('.carousel-inner');
const items = document.querySelectorAll('.carousel-item');
let currentIndex = 0;
let autoSlideInterval;

function updateCarousel() {
    // Calcul de l'offset en fonction de la largeur de l'élément actif
    const itemWidth = items[0].clientWidth; // Largeur d'un élément du carrousel
    const offset = -currentIndex * itemWidth; // Décalage en pixels
    carouselInner.style.transform = `translateX(${offset}px)`; // Applique le décalage
    items.forEach((item, index) => item.classList.toggle('active', index === currentIndex));
}

function nextSlide() {
    currentIndex = (currentIndex + 1) % items.length;
    updateCarousel();
}

function startAutoSlide() {
    autoSlideInterval = setInterval(nextSlide, 5000);
}

document.querySelector('.prev-btn').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    updateCarousel();
    resetAutoSlide();
});

document.querySelector('.next-btn').addEventListener('click', () => {
    nextSlide();
    resetAutoSlide();
});

function resetAutoSlide() {
    clearInterval(autoSlideInterval);
    startAutoSlide();
}

// Initialisation du carrousel
updateCarousel();
startAutoSlide();

// Ajout d'un délai aléatoire pour l'animation des images
document.querySelectorAll('.carousel-item img').forEach(img => {
    img.style.animationDelay = `${Math.random() * 2}s`;
});

// Gestion du redimensionnement de la fenêtre
window.addEventListener('resize', () => {
    updateCarousel(); // Recalcule l'offset lors du redimensionnement
});