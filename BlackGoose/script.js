let carouselData = null;
let selectedItem = null;
let purchaseSection = null;

function createCarouselItem(item) {
    const carouselItem = document.createElement('div');
    carouselItem.className = 'carousel-item';
    carouselItem.dataset.itemId = item.id;
    
    const isGif = item.bgVideo.toLowerCase().endsWith('.gif');
    
    carouselItem.innerHTML = `
        ${isGif 
            ? `<canvas class="bg-canvas"></canvas><img src="${item.bgVideo}" class="bg-image" style="display: none;">`
            : `<video class="bg-video" muted loop><source src="${item.bgVideo}" type="video/mp4"></video>`
        }
        ${item.label ? `<div class="label">${item.label}</div>` : ''}
        <img src="${item.colors[0].image}" class="center-image">
        <div class="content">
            <div class="title font-${item.font.toLowerCase()}">${item.title}</div>
            <div class="description">${item.description}</div>
        </div>
    `;
    
    if (isGif) {
        const canvas = carouselItem.querySelector('.bg-canvas');
        const img = carouselItem.querySelector('.bg-image');
        img.onload = () => {
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
        };
    }
    
    return carouselItem;
}

function createPurchaseSection() {
    purchaseSection = document.createElement('div');
    purchaseSection.className = 'purchase-section';
    purchaseSection.innerHTML = `
        <button class="back-button"><span>←</span><span>Retour</span></button>
        <h1 class="product-title"></h1>
        <div class="price"></div>
        <div class="colors-section">
            <div class="colors-title">Couleurs disponibles</div>
            <div class="colors-selector"></div>
        </div>
        <div class="description"></div>
        <button class="buy-button">Ajouter au panier</button>
    `;
    document.body.appendChild(purchaseSection);
    purchaseSection.querySelector('.back-button').addEventListener('click', resetCarousel);
}

function updatePurchaseSection(item) {
    const productTitle = purchaseSection.querySelector('.product-title');
    productTitle.textContent = item.title;
    productTitle.className = `product-title font-${item.font.toLowerCase()}`;
    
    purchaseSection.querySelector('.price').textContent = item.price;
    purchaseSection.querySelector('.description').textContent = item.descriptionLong;
    
    const colorsSection = purchaseSection.querySelector('.colors-section');
    const colorsSelector = purchaseSection.querySelector('.colors-selector');
    
    // Cacher la section couleurs s'il n'y en a qu'une
    if (item.colors.length <= 1) {
        colorsSection.style.display = 'none';
    } else {
        colorsSection.style.display = 'block';
        colorsSelector.innerHTML = '';
        
        item.colors.forEach((color, index) => {
            const colorOption = document.createElement('div');
            colorOption.className = `color-option ${index === 0 ? 'selected' : ''}`;
            colorOption.innerHTML = `<img src="${color.image}"><span>${color.name}</span>`;
            
            colorOption.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
                colorOption.classList.add('selected');
                selectedItem.querySelector('.center-image').src = color.image;
            });
            
            colorsSelector.appendChild(colorOption);
        });
    }
}

async function initCarousel() {
    const response = await fetch('carousel-data.json');
    carouselData = await response.json();
    
    const carouselContainer = document.querySelector('.carousel-container');
    
    carouselData.carouselItems.forEach(item => {
        carouselContainer.appendChild(createCarouselItem(item));
    });
    
    createPurchaseSection();
    setupEventListeners();
}

function setupEventListeners() {
    const carouselItems = document.querySelectorAll('.carousel-item');

    carouselItems.forEach(item => {
        const video = item.querySelector('.bg-video');
        let bgImage = item.querySelector('.bg-image');
        const bgCanvas = item.querySelector('.bg-canvas');
        
        item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('expanding') && selectedItem !== item) {
                if (video) {
                    video.play();
                } else if (bgImage) {
                    bgCanvas.style.display = 'none';
                    bgImage.style.display = 'block';
                }
            }
        });
        
        item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('expanding') && selectedItem !== item) {
                if (video) {
                    video.pause();
                } else if (bgImage) {
                    bgImage.style.display = 'none';
                    bgCanvas.style.display = 'block';
                }
            }
        });

        item.addEventListener('click', () => {
            if (selectedItem) return;

            selectedItem = item;
            const itemData = carouselData.carouselItems.find(data => data.id == item.dataset.itemId);
            
            // Bloquer complètement tous les scrolls
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            
            // Pause toutes les vidéos
            carouselItems.forEach(otherItem => {
                const otherVideo = otherItem.querySelector('.bg-video');
                if (otherVideo) otherVideo.pause();
            });

            // Capturer les positions AVANT tout changement
            const positions = [];
            carouselItems.forEach((currentItem, index) => {
                const rect = currentItem.getBoundingClientRect();
                positions[index] = {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                };
            });

            // Appliquer les positions fixes immédiatement
            carouselItems.forEach((currentItem, index) => {
                const pos = positions[index];
                currentItem.style.position = 'fixed';
                currentItem.style.top = pos.top + 'px';
                currentItem.style.left = pos.left + 'px';
                currentItem.style.width = pos.width + 'px';
                currentItem.style.height = pos.height + 'px';
                currentItem.style.minWidth = pos.width + 'px';
                currentItem.style.zIndex = currentItem === item ? '1000' : '10';
                currentItem.style.transition = 'none';
            });

            // Forcer un reflow
            item.offsetHeight;

            document.querySelector('.carousel-container').classList.add('no-scroll');
            item.classList.add('text-slide-out');
            
            // Faire disparaître tout le reste de la page automatiquement
            setTimeout(() => {
                // Faire disparaître le header
                document.querySelector('.main-header').classList.add('hidden');
                
                // Faire disparaître tous les autres items du carousel
                carouselItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.style.transition = 'opacity 0.5s ease';
                        otherItem.classList.add('fade-out');
                    }
                });
            }, 100);
            
            setTimeout(() => {
                item.style.transition = 'all 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)';
                item.style.top = '50%';
                item.style.left = '25%';
                item.style.transform = 'translate(-50%, -50%)';
            }, 400);
            
            setTimeout(() => {
                item.classList.add('expanding');
                item.style.width = '50vw';
                item.style.height = '100vh';
                item.style.left = '0';
                item.style.transform = 'translateY(-50%)';
                
                // Reprendre la lecture
                setTimeout(() => {
                    const expandingVideo = item.querySelector('.bg-video');
                    const expandingImage = item.querySelector('.bg-image');
                    const expandingCanvas = item.querySelector('.bg-canvas');
                    
                    if (expandingVideo) expandingVideo.play();
                    else if (expandingImage) {
                        expandingCanvas.style.display = 'none';
                        expandingImage.style.display = 'block';
                    }
                }, 300);
                
                // Afficher la shop zone immédiatement après l'expansion
                updatePurchaseSection(itemData);
                purchaseSection.classList.add('show');
                
            }, 800);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selectedItem) resetCarousel();
    });
}

function resetCarousel() {
    if (!selectedItem) return;

    // Fermeture INSTANTANÉE de la purchase section et réaffichage du header
    purchaseSection.style.transition = 'none';
    purchaseSection.classList.remove('show');
    document.querySelector('.main-header').classList.remove('hidden');
    
    // Restaurer les scrolls
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    // Reset immédiat de tous les items
    selectedItem.classList.remove('expanding', 'text-slide-out');
    
    document.querySelectorAll('.carousel-item').forEach(item => {
        const video = item.querySelector('.bg-video');
        const bgImage = item.querySelector('.bg-image');
        const bgCanvas = item.querySelector('.bg-canvas');
        
        if (video) video.pause();
        else if (bgImage) {
            bgImage.style.display = 'none';
            bgCanvas.style.display = 'block';
        }
        
        // Reset complet des styles
        item.style = '';
        item.classList.remove('fade-out');
    });
    
    document.querySelector('.carousel-container').classList.remove('no-scroll');
    selectedItem.querySelector('.center-image').src = carouselData.carouselItems.find(data => data.id == selectedItem.dataset.itemId).colors[0].image;
    selectedItem = null;
    
    // Restaurer la transition après un délai
    setTimeout(() => {
        if (purchaseSection) {
            purchaseSection.style.transition = '';
        }
    }, 50);
}

document.addEventListener('DOMContentLoaded', initCarousel);