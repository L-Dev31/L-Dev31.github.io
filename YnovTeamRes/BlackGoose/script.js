let carouselData = null;
let selectedItem = null;
let purchaseSection = null;
<<<<<<< HEAD
let lastFocusedElement = null;
let newProductData = null;
const IMAGE_FALLBACK_SRC = 'images/placeholder.png';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getActiveBgImage(containerEl) {
    if (!containerEl) return null;
    return (
        containerEl.querySelector('.bg-image[data-active="true"]') ||
        containerEl.querySelector('.bg-image')
    );
}

function lockCarouselContainerHeight(containerEl = document.querySelector('.carousel-container')) {
    if (!containerEl) return null;
    const height = containerEl.offsetHeight;
    if (height) {
        containerEl.style.height = `${height}px`;
        containerEl.style.minHeight = `${height}px`;
    }
    return containerEl;
}

function unlockCarouselContainerHeight(containerEl = document.querySelector('.carousel-container')) {
    if (!containerEl) return;
    containerEl.style.height = '';
    containerEl.style.minHeight = '';
    containerEl.classList.remove('no-scroll');
}

function togglePageChrome(hidden) {
    const selectors = ['.main-header', '.hero', '.new-product-section', '.presentation-panel', '.press-section', '.footer'];
    selectors.forEach((selector) => {
        const el = document.querySelector(selector);
        if (!el) return;
        if (hidden) {
            el.classList.add('hidden');
            if (selector === '.footer') el.style.visibility = 'hidden';
        } else {
            el.classList.remove('hidden');
            if (selector === '.footer') {
                el.style.visibility = '';
                el.style.opacity = '';
            }
        }
    });
}

function setCardImageSlide(containerEl, nextSrc, direction = 'left') {
    if (!containerEl || !nextSrc) return;

    // If a previous transition left extra images around, clean them up.
    containerEl.querySelectorAll('.bg-image').forEach((img) => {
        if (img.dataset && img.dataset.active !== 'true') {
            img.remove();
        }
    });

    const activeImg = getActiveBgImage(containerEl);
    if (!activeImg) return;

    const currentSrc = activeImg.getAttribute('src') || '';
    if (currentSrc === nextSrc) return;

    if (prefersReducedMotion()) {
        activeImg.src = nextSrc;
        activeImg.dataset.active = 'true';
        return;
    }

    const durationMs = 420;
    const dir = direction === 'right' ? 'right' : 'left';

    const incoming = activeImg.cloneNode(false);
    incoming.src = nextSrc;
    attachImageFallback(incoming);
    incoming.dataset.active = 'true';
    incoming.classList.add(dir === 'right' ? 'is-entering-right' : 'is-entering-left');
    incoming.setAttribute('draggable', 'false');
    incoming.addEventListener('dragstart', (event) => event.preventDefault());

    // Mark outgoing as inactive and animate out
    activeImg.dataset.active = 'false';
    activeImg.classList.add(dir === 'right' ? 'is-leaving-right' : 'is-leaving-left');

    // Insert on top, right after the outgoing image
    activeImg.insertAdjacentElement('afterend', incoming);

    // Trigger transition for the incoming image
    incoming.offsetHeight;
    requestAnimationFrame(() => {
        incoming.classList.remove('is-entering-left', 'is-entering-right');
    });

    // Cleanup after animation
    setTimeout(() => {
        if (activeImg && activeImg.parentNode) activeImg.remove();
        if (incoming) {
            incoming.classList.remove('is-leaving-left', 'is-leaving-right');
            incoming.dataset.active = 'true';
        }
    }, durationMs + 40);
}

function attachImageFallback(img) {
    if (!img) return;
    img.addEventListener('error', () => {
        if (img.dataset.fallbackApplied === 'true') return;
        img.dataset.fallbackApplied = 'true';
        img.src = IMAGE_FALLBACK_SRC;
    }, { once: false });
}

function setCarouselStatus(message, type = 'info') {
    const carouselContainer = document.querySelector('.carousel-container');
    if (!carouselContainer) return;

    let status = carouselContainer.querySelector('.carousel-status');
    if (!status) {
        status = document.createElement('div');
        status.className = 'carousel-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        carouselContainer.appendChild(status);
    }

    status.dataset.type = type;
    status.textContent = message;
}

function getCoverImage(item) {
    if (item && Array.isArray(item.colors) && item.colors.length > 0) {
        const first = item.colors[0];
        if (first && first.image) return first.image;
    }
    if (item && Array.isArray(item.images) && item.images.length > 0) {
        return item.images[0];
    }
    return '';
}
=======
>>>>>>> parent of 282614c (update)

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

            const collectionPanel = document.querySelector('.collection-panel');
            if (collectionPanel) {
                collectionPanel.classList.add('no-transform');
            }
            
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

    const collectionPanel = document.querySelector('.collection-panel');
    if (collectionPanel) collectionPanel.classList.remove('no-transform');
    
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

<<<<<<< HEAD
function setupScrollDimming() {
    const panels = Array.from(document.querySelectorAll('.sticky-panel')).filter(panel => !panel.classList.contains('no-effect'));
    if (panels.length < 2) return;

    let scheduled = false;

    const clamp01 = (value) => Math.max(0, Math.min(1, value));

    const getNextSectionRect = (panel) => {
        let next = panel.nextElementSibling;
        while (next) {
            if (typeof next.getBoundingClientRect === 'function') {
                return next.getBoundingClientRect();
            }
            next = next.nextElementSibling;
        }
        return null;
    };

    const update = () => {
        scheduled = false;
        const viewportHeight = window.innerHeight || 1;

        panels.forEach((panel, index) => {
            let dim = 0;
            const nextRect = getNextSectionRect(panel);
            if (nextRect) {
                // Darken as the next section starts to overlap from the bottom of the viewport
                dim = clamp01((viewportHeight - nextRect.top) / viewportHeight) * 0.55;
            }
            panel.style.setProperty('--panel-dim', dim.toFixed(3));

            const rect = panel.getBoundingClientRect();
            const ratio = clamp01(rect.top / viewportHeight);
            const scale = rect.top <= 0 ? 1 : 1 + 0.2 * ratio;
            panel.style.setProperty('--panel-scale', scale.toFixed(3));
        });
    };

    const scheduleUpdate = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(update);
    };

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();
}

function setupStickyOffsets() {
    const panels = Array.from(document.querySelectorAll('.sticky-panel')).filter(panel => !panel.classList.contains('no-effect'));
    if (!panels.length) return;

    const updateOffsets = () => {
        const viewportHeight = window.innerHeight || 1;

        panels.forEach((panel) => {
            const rect = panel.getBoundingClientRect();
            const panelHeight = rect.height || panel.offsetHeight || 0;
            const stickyTop = viewportHeight - panelHeight;
            panel.classList.remove('is-non-sticky', 'is-last');
            panel.style.setProperty('--sticky-top', `${stickyTop}px`);
        });
    };

    window.addEventListener('resize', updateOffsets);
    window.addEventListener('load', updateOffsets);

    // React to late content/asset size changes
    const resizeObserver = new ResizeObserver(() => updateOffsets());
    panels.forEach(panel => resizeObserver.observe(panel));

    updateOffsets();
}

document.addEventListener('DOMContentLoaded', () => {
    initNewProduct();
    initCarousel();
    setupStickyOffsets();
    setupScrollDimming();
});
=======
document.addEventListener('DOMContentLoaded', initCarousel);
>>>>>>> parent of 282614c (update)
