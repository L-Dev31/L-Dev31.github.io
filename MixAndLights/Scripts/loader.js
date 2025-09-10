window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    
    // Add a class to trigger the exit animation
    loader.classList.add('loader-hidden');

    // Optional: Remove the loader from the DOM after the animation is complete
    loader.addEventListener('transitionend', () => {
        loader.remove();
    });
});
