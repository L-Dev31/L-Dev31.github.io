document.addEventListener("DOMContentLoaded", () => {
    const images = document.querySelectorAll('.carousel-image');
    const titleElement = document.querySelector('.carousel-info h2');
    const descriptionElement = document.querySelector('.carousel-info p');
    const carouselInfo = document.querySelector('.carousel-info');
  
    const slidesInfo = [
        { 
          title: "Piscine à Disposition", 
          description: "Profitez d'une piscine spacieuse et bien entretenue, idéale pour se détendre ou faire quelques longueurs sous le soleil. Parfaite pour les moments de convivialité ou un bain relaxant." 
        },
        { 
          title: "Studio confortable", 
          description: "Un espace cosy et bien aménagé pour votre confort, avec une décoration moderne et chaleureuse qui vous fera sentir comme chez vous dès votre arrivée." 
        },
        { 
          title: "Studio moderne", 
          description: "Studio au design contemporain avec des finitions élégantes." 
        },
        { 
          title: "Cuisine équipée", 
          description: "Cuisine entièrement équipée avec plaque de cuisson, réfrigérateur, micro-ondes et ustensiles. Préparez vos repas comme un chef dans ce bel espace fonctionnel." 
        },
        { 
          title: "Une vue sur les collines", 
          description: "Admirez une vue panoramique sur les collines environnantes depuis votre studio pour un cadre apaisant au quotidien." 
        },
        { 
          title: "Un canapé-lit", 
          description: "Un canapé-lit de belle qualitée permettant un gain d'espace pour la journée et un sommeil paisible avec vue sur les collines" 
        },
        { 
          title: "Une douche moderne", 
          description: "Salle de bain avec une douche moderne, conçue pour un moment de détente optimal." 
        }
      ];      
  
    let currentIndex = 0;
  
    function showSlide(index) {
      images.forEach((img, i) => img.classList.toggle('active', i === index));
  
      carouselInfo.classList.remove('active');
      setTimeout(() => {
        titleElement.textContent = slidesInfo[index].title;
        descriptionElement.textContent = slidesInfo[index].description;
        carouselInfo.classList.add('active');
      }, 1500);
    }
  
    function nextSlide() {
      currentIndex = (currentIndex + 1) % images.length;
      showSlide(currentIndex);
    }
  
    showSlide(currentIndex);
    setInterval(nextSlide, 10000);
  });

  document.addEventListener("DOMContentLoaded", () => {
    const images = document.querySelectorAll('.nearby-image');
    const textOverlay = document.querySelector('.text-overlay');
    const title = document.querySelector('.title');
    const distance = document.querySelector('.distance');
    const nearbySection = document.querySelector('.nearby-section');

    const imageData = [
        { src: "images/GolfOldCourseBG.jpg", title: "Golf Old Course", distance: "à 950m" },
        { src: "images/PlageLaRaguetteBG.jpg", title: "Plage la Raguette", distance: "à 1,5km" },
        { src: "images/ChateauLaNapouleBG.jpg", title: "Château la Napoule", distance: "à 2km" },
    ];

    let currentIndex = 0;

    function showSlide(index) {
        images.forEach(img => img.classList.remove('active'));
        images[index].classList.add('active');

        nearbySection.style.backgroundImage = `url(${imageData[index].src})`;
        title.textContent = imageData[index].title;
        distance.textContent = imageData[index].distance;
        textOverlay.classList.add('active');
    }

    function nextSlide() {
        const currentImage = images[currentIndex];
        currentImage.classList.add('leaving'); // Ajoute la classe pour l'animation de sortie
    
        // Ajoute un écouteur pour attendre la fin de la transition
        currentImage.addEventListener('transitionend', handleTransitionEnd);

        function handleTransitionEnd() {
            // Enlève l'écouteur après la première exécution pour éviter les appels multiples
            currentImage.removeEventListener('transitionend', handleTransitionEnd);
            
            // Réinitialise la classe et change l'index pour la nouvelle image
            currentImage.classList.remove('active', 'leaving');
            currentIndex = (currentIndex + 1) % images.length;
            showSlide(currentIndex);
        }

        textOverlay.classList.remove('active');
    }

    showSlide(currentIndex);
    setInterval(nextSlide, 8000);
});
