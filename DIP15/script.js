// Auto-discover images from Images/BG folder
// Add your image filenames here, or the system will try to auto-detect common patterns
let localImages = [];
let discoveredImages = [];

// Common image extensions to check
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// Known image filenames (fallback list - you can add/remove as needed)
const knownImages = [
    '1.jpg',
    '1029604.jpg',
    '1146709.jpg',
    '15989756.jpg',
    '210186.jpg',
    '2187662.jpg',
    '219692.jpg',
    '247599.jpg',
    '3386540.jpg',
    '3647545.jpg',
    '393773.jpg',
    '402028.jpg',
    '417173.jpg',
    '7704801.jpg',
    '8957663.jpg'
];

// Function to auto-discover images
async function discoverImages() {
    console.log('🔍 Discovering images in Images/BG folder...');
    
    // Try to use PHP script first (if available)
    try {
        const response = await fetch('get-images.php');
        if (response.ok) {
            const images = await response.json();
            if (images && images.length > 0) {
                localImages = images;
                console.log(`✅ Found ${images.length} images via PHP:`, images);
                return images;
            }
        }
    } catch (error) {
        console.log('📁 PHP script not available, using fallback method...');
    }
    
    // Fallback: Try known images and patterns
    const foundImages = [];
    
    // First, try the known images list
    for (const imageName of knownImages) {
        if (await imageExists(`images/BG/${imageName}`)) {
            foundImages.push(imageName);
        }
    }
    
    // If we found images, use them
    if (foundImages.length > 0) {
        localImages = foundImages;
        console.log(`✅ Found ${foundImages.length} images:`, foundImages);
        return foundImages;
    }
    
    // Last resort: try common naming patterns
    console.log('⚠️ No known images found, trying common patterns...');
    const patterns = [];
    
    // Try numbered patterns: 1.jpg, 2.jpg, etc.
    for (let i = 1; i <= 50; i++) {
        for (const ext of imageExtensions) {
            patterns.push(`${i}.${ext}`);
        }
    }
    
    // Test patterns
    for (const pattern of patterns) {
        if (await imageExists(`images/BG/${pattern}`)) {
            foundImages.push(pattern);
        }
    }
    
    localImages = foundImages;
    
    if (foundImages.length > 0) {
        console.log(`✅ Auto-discovered ${foundImages.length} images:`, foundImages);
    } else {
        console.error('❌ No images found! Please check the Images/BG folder.');
    }
    
    return foundImages;
}

// Check if an image exists
function imageExists(imagePath) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = imagePath;
        
        // Timeout after 2 seconds
        setTimeout(() => resolve(false), 2000);
    });
}

// Global variables
let currentImageIndex = 0;
let autoChangeInterval = null;
let background, indicators;

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    initializeElements();
    
    // Discover images first
    await discoverImages();
    
    // Only proceed if we found images
    if (localImages.length > 0) {
        createIndicators();
        
        // Load first image
        changeToImage(0);
        
        // Start auto-change every 30 seconds
        startAutoChange();
        
        // Add event listeners
        setupEventListeners();
    } else {
        console.error('Cannot start slideshow: No images found!');
        // Show error message to user
        const background = document.getElementById('background');
        background.style.backgroundColor = '#1a1a1a';
        background.style.display = 'flex';
        background.style.alignItems = 'center';
        background.style.justifyContent = 'center';
        background.innerHTML = '<div style="color: white; text-align: center; font-size: 1.2em;"><h2>No Images Found</h2><p>Please add images to the <strong>Images/BG/</strong> folder</p></div>';
    }
});

// Initialize DOM elements
function initializeElements() {
    background = document.getElementById('background');
    indicators = document.getElementById('imageIndicators');
}

// Create indicator dots
function createIndicators() {
    indicators.innerHTML = '';
    localImages.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = 'indicator-dot';
        dot.addEventListener('click', () => {
            changeToImage(index);
            resetAutoChange();
        });
        indicators.appendChild(dot);
    });
    updateIndicators();
}

// Update indicator dots
function updateIndicators() {
    const dots = indicators.querySelectorAll('.indicator-dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentImageIndex);
    });
}

// Change to specific image
function changeToImage(index) {
    if (index < 0 || index >= localImages.length) return;
    
    currentImageIndex = index;
    const imagePath = `images/BG/${localImages[index]}`;
    
    // Fade out
    background.style.opacity = '0';
    
    setTimeout(() => {
        // Change image and fade in
        background.style.backgroundImage = `url(${imagePath})`;
        background.style.opacity = '1';
        updateIndicators();
    }, 500);
}

// Navigate to previous image
function previousImage() {
    const newIndex = currentImageIndex === 0 ? localImages.length - 1 : currentImageIndex - 1;
    changeToImage(newIndex);
    resetAutoChange();
}

// Navigate to next image
function nextImage() {
    const newIndex = currentImageIndex === localImages.length - 1 ? 0 : currentImageIndex + 1;
    changeToImage(newIndex);
    resetAutoChange();
}

// Auto-change functionality
function startAutoChange() {
    autoChangeInterval = setInterval(() => {
        nextImage();
    }, 30000); // 30 seconds
}

function resetAutoChange() {
    clearInterval(autoChangeInterval);
    startAutoChange();
}

// Setup event listeners
function setupEventListeners() {
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            previousImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        }
    });
}

// Get ordinal suffix (1st, 2nd, 3rd, 4th, etc.) - kept for potential future use
function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) {
        return 'th';
    }
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}