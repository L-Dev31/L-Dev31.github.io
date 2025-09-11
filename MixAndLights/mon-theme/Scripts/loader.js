const resourcesToLoad = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'styles/style.css',
    'images/logo-big.svg',
    'https://flagcdn.com/w20/fr.png',
    'https://flagcdn.com/w20/gb.png',
    'images/bg.mp4',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'Scripts/script.js',
    'fonts/Raustila.ttf',
    'fonts/Regular.otf',
    'Team/favicon.png',
    'Team/logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap'
];

let loadedCount = 0;
const totalResources = resourcesToLoad.length;
const loader = document.getElementById('loader');
const counter = document.getElementById('counter');
const completionBar = document.getElementById('completion-bar');

function updateProgress() {
    const percentage = (loadedCount / totalResources) * 100;
    const displayedPercentage = percentage;
    counter.textContent = `${Math.floor(displayedPercentage)}%`;
    completionBar.style.setProperty('--completion-width', `${displayedPercentage}%`);

    console.log(`Progress: ${loadedCount}/${totalResources} (${percentage}%) - Displayed: ${Math.floor(displayedPercentage)}%`);

    if (loadedCount === totalResources) {
        console.log('All resources loaded!');
        loader.classList.add('loader-hidden');
        loader.addEventListener('transitionend', () => {
            loader.remove();
        });
    }
}

resourcesToLoad.forEach(url => {
    let resource;
    if (url.endsWith('.css')) {
        resource = document.createElement('link');
        resource.rel = 'stylesheet';
        resource.href = url;
        document.head.appendChild(resource);
    } else if (url.endsWith('.js')) {
        resource = document.createElement('script');
        resource.src = url;
        document.body.appendChild(resource);
    } else if (url.endsWith('.mp4')) {
        resource = document.createElement('video');
        resource.src = url;
        resource.preload = 'auto';
        resource.addEventListener('loadeddata', () => {
            loadedCount++;
            console.log(`Loaded (Video): ${url}`);
            updateProgress();
        });
        resource.addEventListener('error', () => {
            loadedCount++;
            console.log(`Error (Video): ${url}`);
            updateProgress();
        });
    } else if (url.endsWith('.ttf') || url.endsWith('.otf')) {
        resource = new XMLHttpRequest();
        resource.open('GET', url);
        resource.responseType = 'blob';
    } else {
        resource = new Image();
        resource.src = url;
    }

    if (resource instanceof XMLHttpRequest) {
        resource.onload = () => {
            loadedCount++;
            console.log(`Loaded (XHR): ${url}`);
            updateProgress();
        };
        resource.onerror = () => {
            loadedCount++;
            console.log(`Error (XHR): ${url}`);
            updateProgress();
        };
        resource.send();
    } else if (resource.tagName === 'VIDEO') {

    } else {
        resource.onload = () => {
            loadedCount++;
            console.log(`Loaded: ${url}`);
            updateProgress();
        };
        resource.onerror = () => {
            loadedCount++;
            console.log(`Error: ${url}`);
            updateProgress();
        };
    }
});

updateProgress();