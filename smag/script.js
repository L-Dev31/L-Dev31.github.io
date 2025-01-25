//Screenshots Carousel
const picCtn = document.querySelector('.pic-ctn');
const pics = Array.from(picCtn.querySelectorAll('.pic'));
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');

let currentIndex = 0;
let interval;

function showImage(index) {
  // Masquer toutes les images
  pics.forEach((pic) => pic.classList.remove('active'));

  // Afficher l'image actuelle
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

// Boutons de navigation
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

// Pause au survol
picCtn.addEventListener('mouseenter', stopCarousel);
picCtn.addEventListener('mouseleave', startCarousel);

// Démarrer le carrousel
startCarousel();


// Music
const audioElements = document.querySelectorAll('audio');

audioElements.forEach(audio => {
    audio.addEventListener('play', () => {
        // Stop every songs except the one that is playing
        audioElements.forEach(otherAudio => {
            if (otherAudio !== audio && !otherAudio.paused) {
                otherAudio.pause();
                otherAudio.currentTime = 0; // Reset Music Timer to 0
            }
        });
    });
});