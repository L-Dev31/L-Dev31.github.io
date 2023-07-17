if (window.innerWidth <= 767) {
    function applyTransformationToElements() {
      var containers = document.querySelectorAll('.trailer__player');
      containers.forEach(function (container) {
        var elements = container.getElementsByTagName('*');
        for (var i = 0; i < elements.length; i++) {
          elements[i].style.transform = 'scale(0.8)';
          elements[i].style.transformOrigin = 'top left';
        }
      });
  
      var picContainers = document.querySelectorAll('.pic-ctn');
      picContainers.forEach(function (container) {
        var images = container.getElementsByTagName('img');
        for (var i = 0; i < images.length; i++) {
          images[i].style.transform = 'scale(1)';
          images[i].style.transformOrigin = 'top left';
        }
      });
    }
  
    // Appeler la fonction lors du chargement initial de la page
    applyTransformationToElements();
  
    // Appeler la fonction lors du redimensionnement de la fenêtre
    window.addEventListener('resize', applyTransformationToElements);
  }
  
const picCtn = document.querySelector('.pic-ctn');
const pics = Array.from(picCtn.querySelectorAll('.pic'));

let currentIndex = 0;

function lazyLoad() {
  pics.forEach((pic) => {
    if (pic.getBoundingClientRect().top < window.innerHeight) {
      pic.classList.add('loaded');
    }
  });
}

function rotateImages() {
  const previousIndex = currentIndex === 0 ? pics.length - 1 : currentIndex - 1;
  const nextIndex = (currentIndex + 1) % pics.length;

  pics[previousIndex].classList.remove('previous');
  pics[currentIndex].classList.remove('active');
  pics[nextIndex].classList.remove('next');

  pics[previousIndex].classList.add('next');
  pics[currentIndex].classList.add('previous');
  pics[nextIndex].classList.add('active');

  currentIndex = nextIndex;
}

window.addEventListener('scroll', lazyLoad);
window.addEventListener('resize', lazyLoad);
window.addEventListener('load', lazyLoad);

rotateImages(); // Pour initialiser l'animation dès le chargement de la page

setInterval(rotateImages, 4000);

