document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('.navbar');
    const gradient = document.querySelector('.navbar-top-gradient');
    const scrollIndicator = document.querySelector('.scroll-down-container');
    const hero = document.querySelector('.hero');
    const scene = document.querySelector('.parallax-scene');

    // Initial fade-in for scroll indicator after all other animations
    if (scrollIndicator) {
        setTimeout(() => {
            // Only show if user hasn't scrolled down yet
            if (window.scrollY < 50) {
                scrollIndicator.style.opacity = '1';
            }
        }, 5700); // Delay matches the last animation
    }

    // Scroll handling for navbar, gradient, and scroll indicator
    window.addEventListener('scroll', () => {
        const isScrolled = window.scrollY >= 50;
        
        if (nav) nav.classList.toggle('scrolled', isScrolled);
        if (gradient) gradient.classList.toggle('gradient-hidden', isScrolled);

        // Fade scroll indicator based on scroll position
        if (scrollIndicator) {
            scrollIndicator.style.opacity = isScrolled ? '0' : '1';
        }
    });

    // Hero 3D Scene Parallax Effect
    if (hero && scene) {
        hero.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const { offsetWidth, offsetHeight } = hero;
            const yRotation = ((clientX - offsetWidth / 2) / offsetWidth) * 5; // Max rotation
            const xRotation = ((clientY - offsetHeight / 2) / offsetHeight) * -5; // Invert for natural feel
            scene.style.transform = `rotateY(${yRotation}deg) rotateX(${xRotation}deg)`;
        });
    }
});