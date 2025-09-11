document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('.navbar');
    const overlay = document.getElementById('vignette-overlay');
    const circleLogo = document.getElementById('circle-logo');
    const videoOverlay = document.getElementById('video-overlay');
    const scene2 = document.getElementById('scene2');

    const dropdowns = document.querySelectorAll('.nav-item.dropdown');
    let siteOverlay;

    function createOverlay() {
        if (!document.getElementById('site-overlay')) {
            siteOverlay = document.createElement('div');
            siteOverlay.id = 'site-overlay';
            siteOverlay.className = 'site-overlay';
            document.body.appendChild(siteOverlay);
        } else {
            siteOverlay = document.getElementById('site-overlay');
        }
    }

    createOverlay();

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseenter', () => {
            if (siteOverlay) {
                siteOverlay.classList.add('active');
            }
        });
        dropdown.addEventListener('mouseleave', () => {
            if (siteOverlay) {
                siteOverlay.classList.remove('active');
            }
        });
    });

    // Scroll animation handler
    window.addEventListener('scroll', () => {
        const isScrolled = window.scrollY >= 50;
        
        const scrollY = window.scrollY;
        const vh = window.innerHeight;

        // --- Animation 1: Growth (0vh to 100vh) ---
        const growthPercent = Math.min(scrollY / vh, 1);
        const easedGrowth = growthPercent * growthPercent;

        // Video Overlay Opacity Animation
        if (videoOverlay) {
            videoOverlay.style.opacity = 0.8 - (easedGrowth * 0.8);
        }

        // Mask Animation
        const finalRadius = Math.hypot(window.innerWidth, window.innerHeight) / 2;
        const radius = 160 + easedGrowth * (finalRadius - 160);
        const softness = 1 + easedGrowth * 220;
        const transparentStop = radius;
        const opaqueStop = radius + softness;
        
        const maskGradient = `radial-gradient(circle, transparent ${transparentStop}px, white ${opaqueStop}px)`;

        if (overlay) {
            overlay.style.webkitMaskImage = maskGradient;
            overlay.style.maskImage = maskGradient;
        }

        // Logo Animation
        const scale = 1 + ((radius - 160) / 160) * 1.1;
        const blur = easedGrowth * 15;

        if (circleLogo) {
            circleLogo.style.transform = `translate(-50%, -50%) scale(${scale})`;
            circleLogo.style.filter = `blur(${blur}px)`;
        }

        // --- Animation 2: Fade Out Scene 1 (100vh to 150vh) ---
        const fadeOutScrollStart = vh;
        const fadeOutDuration = vh * 0.5;
        const fadeOutScroll = scrollY - fadeOutScrollStart;
        const fadeOutPercent = Math.min(Math.max(fadeOutScroll / fadeOutDuration, 0), 1);
        const scene1Opacity = 1 - fadeOutPercent;

        if (overlay) {
            overlay.style.opacity = scene1Opacity;
        }
        if (circleLogo) {
            circleLogo.style.opacity = scene1Opacity;
        }

        // --- Animation 3: Fade In Scene 2 & Navbar (from 150vh) ---
        const fadeInScrollStart = vh * 1.5;
        const fadeInDuration = vh * 0.5;
        const fadeInScroll = scrollY - fadeInScrollStart;
        const fadeInPercent = Math.min(Math.max(fadeInScroll / fadeInDuration, 0), 1);

        if (scene2) {
            scene2.style.opacity = fadeInPercent;
        }

        // Navbar visibility
        if (nav) {
            nav.style.opacity = fadeInPercent;
            nav.classList.toggle('navbar-visible', fadeInPercent > 0);
            nav.classList.toggle('scrolled', isScrolled);
        }
    });
});