// Intro animation: premium loading screen with perfectly timed animations

// Force scroll to top immediately on page load
window.scrollTo(0, 0);
document.documentElement.scrollTop = 0;
document.body.scrollTop = 0;

document.addEventListener('DOMContentLoaded', function() {
  // Ensure user is at top of page before intro starts
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  
  // Add intro classes to prevent scroll
  document.body.classList.add('intro-active');
  document.documentElement.classList.add('intro-active');
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  // SVG icon (same as .hero-svg-icon)
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 1561.6 2000');
  icon.setAttribute('class', 'intro-svg-icon');
  icon.innerHTML = `<g><g><path style="fill:transparent;stroke:#E3BB70;stroke-width:6;stroke-miterlimit:10;" d="M316.3,1999c-108,0-208.7,0-316.3,0C211.1,1330.1,420.8,666.1,631.1-0.2c99.1,0,196.3,0,298.5,0 c210,664.6,420.4,1330.3,631.9,1999.7c-107.2,0-209.7,0-316.5,0C1091.6,1490.9,937.9,981.7,784.3,472.4c-2.7,0.4-5.6,0.9-8.3,1.4 C622.9,981.9,469.7,1489.9,316.3,1999z"/><path style="fill:transparent;stroke:#E3BB70;stroke-width:6;stroke-miterlimit:10;" d="M785.1,886.8c106.7,369.6,213.5,739.4,321.4,1113c-64.5,0-121.7,0-186.7,0 c-44.9-183.2-90.2-368.5-135.6-553.8c-2.5,0.2-5.1,0.4-7.7,0.6c-44.5,182.7-89.1,365.3-134.5,551.6c-60.5,0-120.7,0-187.1,0 c107.2-371.2,213.8-739.9,320.4-1108.6C778.5,888.8,781.7,887.9,785.1,886.8z"/></g></g>`;  // Logo (same as .hero-logo-img)
  const logo = document.createElement('img');
  logo.src = 'images/svg/logo.svg';
  logo.alt = 'Sandfall Logo';
  logo.className = 'intro-logo';
  
  // Debug: log when logo loads
  logo.onload = function() {
    console.log('Logo loaded successfully');
  };
  logo.onerror = function() {
    console.error('Logo failed to load');
  };
  // Container for centering both as in .hero-content
  const content = document.createElement('div');
  content.className = 'intro-content';
  content.appendChild(logo);

  // Gradient overlay (black to transparent to black)
  const gradientOverlay = document.createElement('div');
  gradientOverlay.id = 'gradient-overlay';
  overlay.appendChild(icon);
  overlay.appendChild(content);
  overlay.appendChild(gradientOverlay);

  document.body.appendChild(overlay);

  // Block any scroll attempts during intro
  const preventScroll = function(e) {
    e.preventDefault();
    window.scrollTo(0, 0);
  };
  
  window.addEventListener('scroll', preventScroll, { passive: false });
  window.addEventListener('wheel', preventScroll, { passive: false });
  window.addEventListener('touchmove', preventScroll, { passive: false });

  // Choreographed entrance animation
  setTimeout(() => {
    // Icon appears first with simple fade-in
    icon.style.opacity = '1';
      // Logo appears 800ms later with elegant entrance
    setTimeout(() => {
      logo.style.opacity = '1';
      logo.style.transform = 'scale(1) translateY(0)';
      console.log('Logo should now be visible');
    }, 800);
  }, 600);

  // Elegant exit sequence after 5s
  setTimeout(() => {
    // Fade out the black background first
    overlay.style.opacity = '0';
      // Wait 1 second, then fade out the SVG elements
    setTimeout(() => {
      logo.style.opacity = '0';
      icon.style.opacity = '0';
      
      // Wait for elements to fade out, then remove everything
      setTimeout(() => {
        // Re-enable scroll
        document.body.classList.remove('intro-active');
        document.documentElement.classList.remove('intro-active');
        
        // Remove scroll prevention events
        window.removeEventListener('scroll', preventScroll);
        window.removeEventListener('wheel', preventScroll);
        window.removeEventListener('touchmove', preventScroll);
        
        // Clean up
        overlay.remove();
        window.scrollTo(0, 0);
      }, 1800); // Wait for SVG fade-out to complete
    }, 1000); // 1 second delay before SVG fade-out
  }, 5000);
});
