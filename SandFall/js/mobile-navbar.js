document.addEventListener('DOMContentLoaded', function () {
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

  hamburger.addEventListener('click', function () {
    console.log('Hamburger cliqué');
    hamburger.classList.toggle('active');
    overlay.classList.toggle('active');
    body.classList.toggle('mobile-menu-open');
  });

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', function () {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    });
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      body.classList.remove('mobile-menu-open');
    }
  });
});
