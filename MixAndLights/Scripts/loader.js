window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    const counter = document.getElementById('counter');
    const completionBar = document.getElementById('completion-bar');
    let count = 0;
    const intervalTime = 50; // Update every 50ms
    const totalTime = 2000; // 5 seconds
    const steps = totalTime / intervalTime;
    const increment = 100 / steps;

    const counterInterval = setInterval(() => {
        count += increment;
        if (count >= 100) {
            count = 100;
            clearInterval(counterInterval);
        }
        const displayedCount = Math.floor(count / 10) * 10; // Round down to nearest 10
        counter.textContent = `${displayedCount}%`;
        completionBar.style.setProperty('--completion-width', `${displayedCount}%`);
    }, intervalTime);

    // Artificially delay the loading sequence by 5 seconds
    setTimeout(() => {
        // Add a class to trigger the exit animation
        loader.classList.add('loader-hidden');

        // Optional: Remove the loader from the DOM after the animation is complete
        loader.addEventListener('transitionend', () => {
            loader.remove();
        });
    }, totalTime); // Use totalTime for consistency
});
