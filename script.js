const imageUrls = [
    'https://wallpapercave.com/wp/wp5593679.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/0/0a/Serene_mountain_landscape.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/6/6e/Sunrise_landscape_with_mountains.jpg'
  ];
  let imageIndex = 0;
  const background = document.getElementById('background');
  
  // Fonction de changement de fond avec fondu
  function changeBackground() {
    background.style.opacity = '0';
  
    // Attendre la fin du fondu (1 seconde) pour changer l'image et ramener l'opacité
    setTimeout(() => {
      imageIndex = (imageIndex + 1) % imageUrls.length;
      background.style.backgroundImage = `url(${imageUrls[imageIndex]})`;
      background.style.opacity = '1';
    }, 1000);
  }
  
  // Définir l'intervalle de changement d'image toutes les 30 secondes
  setInterval(changeBackground, 30000);
  
  // Fonction de mise à jour de l'heure et de la date
  function updateTimeAndDate() {
    const now = new Date();
    const optionsTime = { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit' };
    document.getElementById('time').textContent = new Intl.DateTimeFormat('fr-FR', optionsTime).format(now);
  
    const optionsDate = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('date').textContent = new Intl.DateTimeFormat('fr-FR', optionsDate).format(now);
  }
  setInterval(updateTimeAndDate, 1000); // Mise à jour chaque seconde
  updateTimeAndDate();
