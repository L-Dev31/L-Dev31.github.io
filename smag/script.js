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

rotateImages();

setInterval(rotateImages, 4000);