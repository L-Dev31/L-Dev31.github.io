// JS simple pour menu mobile hamburger + overlay
// Nécessite :
// - .mobile-menu-toggle (bouton hamburger)
// - .mobile-menu-overlay (overlay noir plein écran)

document.addEventListener('DOMContentLoaded', function() {
  const hamburger = document.querySelector('.mobile-menu-toggle');
  const overlay = document.querySelector('.mobile-menu-overlay');
  const body = document.body;
  const mobileNavLinks = document.querySelectorAll('.mobile-nav a');

  if (!hamburger) {
    console.error('mobile-menu-toggle introuvable dans le DOM');
    return;
  }
  if (!overlay) {
    console.error('mobile-menu-overlay introuvable dans le DOM');
    return;
  }

  // Ouvre/ferme le menu
  hamburger.addEventListener('click', function() {
    console.log('Hamburger cliqué');
    hamburger.classList.toggle('active');
    overlay.classList.toggle('active');
    body.classList.toggle('mobile-menu-open');
  });

  // Ferme le menu quand on clique sur un lien
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', function() {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    });
  });

  // Ferme le menu si on clique sur l'overlay (hors menu)
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });

  // Ferme le menu sur ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });

  // Ferme le menu sur resize desktop
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });
});
