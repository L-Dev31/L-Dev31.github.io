// Music
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

// Screenshots Carousel
const picCtn = document.querySelector('.pic-ctn');
const pics = Array.from(picCtn.querySelectorAll('.pic'));
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');

let currentIndex = 0;
let interval;

function showImage(index) {
  pics.forEach((pic) => pic.classList.remove('active'));
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