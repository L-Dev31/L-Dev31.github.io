document.addEventListener("DOMContentLoaded", () => {
    // Carrousel d'images
    const carouselImages = document.querySelectorAll('.carousel-image');
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
          description: "Un canapé-lit de belle qualité permettant un gain d'espace pour la journée et un sommeil paisible avec vue sur les collines." 
        },
        { 
          title: "Une douche moderne", 
          description: "Salle de bain avec une douche moderne, conçue pour un moment de détente optimal." 
        }
    ];

    let currentIndex = 0;

    function showSlide(index) {
        carouselImages.forEach((img, i) => img.classList.toggle('active', i === index));

        carouselInfo.classList.remove('active');
        setTimeout(() => {
            titleElement.textContent = slidesInfo[index].title;
            descriptionElement.textContent = slidesInfo[index].description;
            carouselInfo.classList.add('active');
        }, 1500);
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % carouselImages.length;
        showSlide(currentIndex);
    }

    showSlide(currentIndex);
    setInterval(nextSlide, 10000);

    // Carrousel des lieux à proximité
    const nearbyImages = document.querySelectorAll('.nearby-image');
    const textOverlay = document.querySelector('.text-overlay');
    const title = document.querySelector('.title');
    const distance = document.querySelector('.distance');
    const nearbySection = document.querySelector('.nearby-section');

    const imageData = [
        { src: "images/GolfOldCourseBG.jpg", title: "Golf Old Course", distance: "à 950m" },
        { src: "images/PlageLaRaguetteBG.jpg", title: "Plage la Raguette", distance: "à 1,5km" },
        { src: "images/ChateauLaNapouleBG.jpg", title: "Château la Napoule", distance: "à 2km" },
    ];

    let nearbyIndex = 0;

    function showNearbySlide(index) {
        nearbyImages.forEach(img => img.classList.remove('active'));
        nearbyImages[index].classList.add('active');

        nearbySection.style.backgroundImage = `url(${imageData[index].src})`;
        title.textContent = imageData[index].title;
        distance.textContent = imageData[index].distance;
        textOverlay.classList.add('active');
    }

    function nextNearbySlide() {
        const currentImage = nearbyImages[nearbyIndex];
        currentImage.classList.add('leaving');
    
        currentImage.addEventListener('transitionend', function handleTransitionEnd() {
            currentImage.removeEventListener('transitionend', handleTransitionEnd);
            currentImage.classList.remove('active', 'leaving');
            nearbyIndex = (nearbyIndex + 1) % nearbyImages.length;
            showNearbySlide(nearbyIndex);
        });

        textOverlay.classList.remove('active');
    }

    showNearbySlide(nearbyIndex);
    setInterval(nextNearbySlide, 8000);

    // Initialiser EmailJS
    (function() {
        emailjs.init("H8mmDaM4ID9oNXT0p");
    })();

    // Soumission du formulaire de contact
    document.getElementById('contact-form').addEventListener('submit', function(event) {
        event.preventDefault();

        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const message = document.getElementById('message').value;
        const date = new Date().toLocaleString();

        const templateParams = {
            from_name: name,
            user_email: email,
            message: message,
            send_date: date
        };

        emailjs.send("service_uod38x2", "template_byvyf7a", templateParams)
            .then(response => {
                console.log("Succès !", response.status, response.text);
                alert("Message envoyé avec succès !");
            })
            .catch(error => {
                console.log("Échec...", error);
                alert("Échec de l'envoi du message. Veuillez réessayer.");
            });
    });
});
