/**
 * Script principal pour la section de Philosophie
 * Compatible avec le système ultra-loader unifié
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Script Philosophie chargé');
    
    // Attendre que l'ultra-loader soit initialisé
    if (window.UltraLoader) {
        // Observer les changements de contenu pour appliquer les styles améliorés
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const lessonBody = mutation.target.closest('.lesson-body');
                    if (lessonBody && lessonBody.getAttribute('data-loaded') === 'true') {
                        console.log('Contenu chargé, application des styles améliorés');
                        setTimeout(() => {
                            if (typeof enhancePhilosophyContent === 'function') {
                                enhancePhilosophyContent();
                            }
                        }, 100);
                    }
                }
            });
        });
        
        // Observer le contenu principal
        const contentContainer = document.getElementById('ultra-content');
        if (contentContainer) {
            observer.observe(contentContainer, { childList: true, subtree: true });
        }
    }

    // Ouvrir automatiquement la première section de vidéo au chargement
    setTimeout(() => {
        const firstVideoTheme = document.querySelector('.video-theme-item');
        if (firstVideoTheme) {
            const header = firstVideoTheme.querySelector('.lesson-header');
            if (header && typeof toggleVideoTheme === 'function') {
                toggleVideoTheme(header);
            }
        }
    }, 500);
});