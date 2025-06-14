// Contact section functionality
document.addEventListener('DOMContentLoaded', function() {
    // Simple animation on scroll for contact section
    const contactSection = document.querySelector('.contact-section');
    const contactContainer = document.querySelector('.contact-container');
    
    if (contactSection && contactContainer) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, {
            threshold: 0.2
        });
        
        // Initial state
        contactContainer.style.opacity = '0';
        contactContainer.style.transform = 'translateY(30px)';
        contactContainer.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        
        observer.observe(contactContainer);
    }
});
