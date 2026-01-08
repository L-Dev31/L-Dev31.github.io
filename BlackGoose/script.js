let carouselData = null;
let selectedItem = null;
let purchaseSection = null;
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

function createCarouselItem(item) {
    const carouselItem = document.createElement('div');
    carouselItem.className = 'carousel-item';
    carouselItem.dataset.itemId = item.id;
    carouselItem.setAttribute('role', 'button');
    carouselItem.setAttribute('tabindex', '0');
    carouselItem.setAttribute('aria-label', `${item.title} — ouvrir le détail`);

    const coverImage = getCoverImage(item);

    carouselItem.innerHTML = `
        <img src="${coverImage}" class="bg-image" data-active="true" alt="" aria-hidden="true" draggable="false">
        ${item.label ? `<div class="label">${item.label}</div>` : ''}
        <div class="content">
            <div class="title font-${item.font.toLowerCase()}">${item.title}</div>
            <div class="description">${item.description}</div>
            <button class="open-button" type="button" aria-label="Découvrir ${item.title}">Découvrir</button>
        </div>
    `;

    // Prevent native drag & drop from hijacking carousel drag (especially on images).
    carouselItem.querySelectorAll('img').forEach((img) => {
        img.setAttribute('draggable', 'false');
        img.addEventListener('dragstart', (event) => event.preventDefault());
        attachImageFallback(img);
    });
    
    return carouselItem;
}

function createPurchaseSection() {
    purchaseSection = document.createElement('div');
    purchaseSection.className = 'purchase-section';
    purchaseSection.setAttribute('role', 'dialog');
    purchaseSection.setAttribute('aria-modal', 'true');
    purchaseSection.setAttribute('aria-label', 'Détail du produit');
    purchaseSection.innerHTML = `
        <button class="back-button" type="button" aria-label="Retour à la collection"><span aria-hidden="true">←</span><span>Retour</span></button>
        <h1 class="product-title"></h1>
        <div class="price"></div>
        <div class="colors-section">
            <div class="colors-title">Couleurs disponibles</div>
            <div class="colors-selector"></div>
        </div>
        <div class="description"></div>
        <button class="buy-button" type="button">Ajouter au panier</button>
    `;
    document.body.appendChild(purchaseSection);
    purchaseSection.querySelector('.back-button').addEventListener('click', resetCarousel);

    purchaseSection.querySelector('.buy-button').addEventListener('click', () => {
        // Feedback minimal (pas de panier implémenté)
        const button = purchaseSection.querySelector('.buy-button');
        const original = button.textContent;
        button.textContent = 'Ajouté';
        button.disabled = true;
        setTimeout(() => {
            button.textContent = original;
            button.disabled = false;
        }, 900);
    });
}

function updatePurchaseSection(item) {
    const productTitle = purchaseSection.querySelector('.product-title');
    productTitle.textContent = item.title;
    productTitle.className = `product-title font-${item.font.toLowerCase()}`;
    
    purchaseSection.querySelector('.price').textContent = item.price;
    purchaseSection.querySelector('.description').textContent = item.descriptionLong;

    const colorsSection = purchaseSection.querySelector('.colors-section');
    const colorsSelector = purchaseSection.querySelector('.colors-selector');

    const hasColors = item && Array.isArray(item.colors) && item.colors.length > 0;
    if (!hasColors) {
        if (colorsSection) colorsSection.style.display = 'none';
        if (colorsSelector) colorsSelector.innerHTML = '';
        return;
    }

    // Hide the selector if there is only one option
    if (item.colors.length <= 1) {
        colorsSection.style.display = 'none';
        colorsSelector.innerHTML = '';
        return;
    }

    colorsSection.style.display = 'block';
    colorsSelector.innerHTML = '';

    // Default selected color index for the open card
    if (selectedItem) selectedItem.dataset.colorIndex = '0';

    item.colors.forEach((color, index) => {
        const colorOption = document.createElement('div');
        colorOption.className = `color-option ${index === 0 ? 'selected' : ''}`;
        colorOption.dataset.colorIndex = String(index);
        const thumbnailSrc = color.colorImage || color.image;
        colorOption.innerHTML = `<img src="${thumbnailSrc}" alt=""><span>${color.name}</span>`;

        colorOption.querySelectorAll('img').forEach((img) => {
            img.setAttribute('draggable', 'false');
            img.addEventListener('dragstart', (event) => event.preventDefault());
        });

        colorOption.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');

            if (!selectedItem) return;

            const prevIndex = Number(selectedItem.dataset.colorIndex || '0');
            const nextIndex = index;
            selectedItem.dataset.colorIndex = String(nextIndex);
            const direction = nextIndex < prevIndex ? 'right' : 'left';

            // Update expanded card background
            setCardImageSlide(selectedItem, color.image, direction);
        });

        colorsSelector.appendChild(colorOption);
    });
}

async function initCarousel() {
    const carouselContainer = document.querySelector('.carousel-container');
    if (!carouselContainer) return;

    setCarouselStatus('Chargement de la collection…');

    try {
        // Prefer JSON fetch on real origins (http/https). On file://, many browsers block fetch() to local files.
        const response = await fetch('json/carousel-data.json', { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        carouselData = await response.json();
    } catch (error) {
        const isFileProtocol = window.location && window.location.protocol === 'file:';
        setCarouselStatus(
            isFileProtocol
                ? "Le navigateur bloque le chargement local (file://). Ouvrez ce dossier avec un serveur local (ex: Live Server)."
                : "Impossible de charger la collection. Réessayez plus tard.",
            'error'
        );
        // eslint-disable-next-line no-console
        console.error('Failed to load carousel-data.json', error);
        return;
    }

    // Nettoyer le message de statut avant d'ajouter les items
    const status = carouselContainer.querySelector('.carousel-status');
    if (status) status.remove();

    carouselData.carouselItems.forEach(item => {
        carouselContainer.appendChild(createCarouselItem(item));
    });

    createPurchaseSection();
    setupEventListeners();
}

async function initNewProduct() {
    const section = document.querySelector('.new-product-section');
    if (!section) return;

    try {
        const response = await fetch('json/new-product.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        newProductData = await response.json();
        const product = newProductData.heroProduct;

        section.innerHTML = `
            <div class="new-product-inner">
                <div class="new-product-heading">
                    <p class="new-product-kicker">${product.kicker}</p>
                    <div class="new-product-title-band">
                        <h2 class="new-product-title font-remarcle">${product.title}</h2>
                    </div>
                </div>
                <div class="new-product-content">
                    <p class="new-product-description">${product.description}</p>
                    <button class="cta-button new-product-cta" type="button" data-carousel-item-id="${product.carouselItemId}" aria-label="Découvrir ${product.title} dans la collection">Découvrir</button>
                </div>
                <div class="new-product-video" aria-label="Trailer ${product.title}">
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${product.trailer}" 
                        title="${product.title} Trailer" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </div>
            </div>
        `;

        section.dataset.backgroundText = product.backgroundText;
    } catch (error) {
        console.error('Failed to load new-product.json', error);
    }
}

function setupEventListeners() {
    const ctaButton = document.querySelector('.collection-panel .cta-button');
    if (ctaButton) {
        ctaButton.addEventListener('click', () => {
            const collection = document.getElementById('collection');
            if (!collection) return;
            collection.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
            collection.focus({ preventScroll: true });
        });
    }

    const openCarouselItemById = (itemId, instant = false) => {
        const item = document.querySelector(`.carousel-item[data-item-id="${itemId}"]`);
        if (!item) return false;
        
        if (instant) {
            // Open instantly in expanded state
            if (selectedItem) return true;
            const itemData = carouselData?.carouselItems?.find((data) => String(data.id) === String(itemId));
            if (!itemData) return false;

            selectedItem = item;
            lastFocusedElement = document.activeElement;
            document.body.classList.add('dimming-disabled');
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';

            // Position the page so the card + purchase panel sit fully in view
            window.scrollTo({ top: 0, behavior: 'auto' });

            // Make sure the selected card is fully visible (in case any fade-out state lingers)
            item.classList.remove('fade-out');
            item.style.opacity = '1';
            item.style.visibility = 'visible';

            // Ensure a visible background image exists
            let activeImg = getActiveBgImage(item);
            const fallbackSrc = getCoverImage(itemData) || IMAGE_FALLBACK_SRC;
            if (!activeImg) {
                activeImg = document.createElement('img');
                activeImg.className = 'bg-image';
                activeImg.dataset.active = 'true';
                activeImg.alt = '';
                activeImg.setAttribute('draggable', 'false');
                attachImageFallback(activeImg);
                activeImg.src = fallbackSrc;
                item.insertAdjacentElement('afterbegin', activeImg);
            } else if (!activeImg.getAttribute('src')) {
                activeImg.src = fallbackSrc;
            }
            activeImg.style.opacity = '1';
            activeImg.style.visibility = 'visible';
            activeImg.style.display = 'block';

            lockCarouselContainerHeight(carouselContainer);

            // Hide page sections
            togglePageChrome(true);
            document.querySelector('.carousel-container')?.classList.add('no-scroll');

            // Hide other carousel items
            document.querySelectorAll('.carousel-item').forEach((otherItem) => {
                if (otherItem !== item) {
                    otherItem.style.opacity = '0';
                    otherItem.classList.add('fade-out');
                }
            });

            // Apply expanded state instantly
            const rect = item.getBoundingClientRect();
            item.style.position = 'fixed';
            item.style.top = '50%';
            item.style.left = '0';
            item.style.transform = 'translateY(-50%)';
            item.style.width = '50vw';
            item.style.height = '100vh';
            item.style.zIndex = '1000';
            item.style.transition = 'none';
            item.classList.add('expanding');

            // Hide content (title/description)
            const content = item.querySelector('.content');
            if (content) {
                content.style.opacity = '0';
                content.style.display = 'none';
            }

            // Show purchase section
            updatePurchaseSection(itemData);
            purchaseSection.style.transition = 'none';
            purchaseSection.classList.add('show');
            purchaseSection.querySelector('.back-button')?.focus();
            setTimeout(() => purchaseSection.style.transition = '', 0);

            return true;
        }

        // Normal animated open
        const openButton = item.querySelector('.open-button');
        (openButton || item).click();
        return true;
    };

    const newProductCta = document.querySelector('.new-product-cta');
    if (newProductCta) {
        newProductCta.addEventListener('click', async () => {
            const itemId = newProductCta.dataset.carouselItemId || '1';

            // Wait for carousel to exist, then open instantly
            for (let attempt = 0; attempt < 20; attempt += 1) {
                if (openCarouselItemById(itemId, true)) return;
                // eslint-disable-next-line no-await-in-loop
                await sleep(100);
            }
        });
    }

    const carouselContainer = document.querySelector('.carousel-container');
    let isDraggingCarousel = false;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let dragJustEnded = false;

    const shouldEnableDrag = () => {
        // Don't hijack drag on touch devices (native scrolling works well)
        return window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    };

    if (carouselContainer) {
        carouselContainer.addEventListener('pointerdown', (event) => {
            if (!shouldEnableDrag()) return;
            if (event.button !== undefined && event.button !== 0) return; // left click only

            // Allow real clicks on interactive controls inside the carousel (e.g. "Découvrir")
            if (event.target && event.target.closest && event.target.closest('button, a, input, textarea, select')) {
                return;
            }

            isDraggingCarousel = false;
            dragStartX = event.clientX;
            dragStartScrollLeft = carouselContainer.scrollLeft;
            carouselContainer.setPointerCapture(event.pointerId);
            carouselContainer.classList.add('drag-armed');
        });

        carouselContainer.addEventListener('pointermove', (event) => {
            if (!shouldEnableDrag()) return;
            if (!carouselContainer.classList.contains('drag-armed')) return;

            const deltaX = event.clientX - dragStartX;
            if (!isDraggingCarousel && Math.abs(deltaX) > 6) {
                isDraggingCarousel = true;
                carouselContainer.classList.add('is-dragging');
            }

            if (isDraggingCarousel) {
                event.preventDefault();
                carouselContainer.scrollLeft = dragStartScrollLeft - deltaX;
            }
        });

        const endDrag = () => {
            if (!carouselContainer.classList.contains('drag-armed')) return;
            carouselContainer.classList.remove('drag-armed');

            if (isDraggingCarousel) {
                carouselContainer.classList.remove('is-dragging');
                isDraggingCarousel = false;
                dragJustEnded = true;
                setTimeout(() => {
                    dragJustEnded = false;
                }, 80);
            }
        };

        carouselContainer.addEventListener('pointerup', endDrag);
        carouselContainer.addEventListener('pointercancel', endDrag);
        carouselContainer.addEventListener('lostpointercapture', endDrag);
    }

    const carouselItems = document.querySelectorAll('.carousel-item');

    carouselItems.forEach(item => {
        const openItem = async (ignoreDrag = false) => {
            if (!ignoreDrag && (isDraggingCarousel || dragJustEnded)) return;
            if (selectedItem) return;

            selectedItem = item;
            lastFocusedElement = document.activeElement;
            const itemData = carouselData.carouselItems.find(data => data.id == item.dataset.itemId);

            document.body.classList.add('dimming-disabled');

            const collectionPanel = document.querySelector('.collection-panel');
            let restoreCollectionTransition = '';
            if (collectionPanel) {
                restoreCollectionTransition = collectionPanel.style.transition;
                collectionPanel.style.transition = 'none';
                collectionPanel.classList.add('no-transform');
            }
            
            // Bloquer complètement tous les scrolls
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';

            lockCarouselContainerHeight(carouselContainer);
            
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
                currentItem.style.transition = 'none';
                currentItem.style.position = 'fixed';
                currentItem.style.top = pos.top + 'px';
                currentItem.style.left = pos.left + 'px';
                currentItem.style.width = pos.width + 'px';
                currentItem.style.height = pos.height + 'px';
                currentItem.style.minWidth = pos.width + 'px';
                currentItem.style.zIndex = currentItem === item ? '1000' : '10';
            });

            // Forcer un reflow
            item.offsetHeight;

            // Réactiver la transition éventuelle du panneau collection une fois figé
            if (collectionPanel) {
                collectionPanel.style.transition = restoreCollectionTransition;
            }

            document.querySelector('.carousel-container').classList.add('no-scroll');
            item.classList.add('text-slide-out');
            
            // Faire disparaître tout le reste de la page automatiquement
            await sleep(100);
                togglePageChrome(true);

                // Faire disparaître tous les autres items du carousel
                carouselItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.style.transition = 'opacity 0.5s ease';
                        otherItem.classList.add('fade-out');
                    }
                });
            
            
            await sleep(300);
                item.style.transition = 'all 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)';
                item.style.top = '50%';
                item.style.left = '25%';
                item.style.transform = 'translate(-50%, -50%)';
            
            
            await sleep(400);
                item.classList.add('expanding');
                item.style.width = '50vw';
                item.style.height = '100vh';
                item.style.left = '0';
                item.style.transform = 'translateY(-50%)';
                
                // Afficher la shop zone immédiatement après l'expansion
                updatePurchaseSection(itemData);
                purchaseSection.classList.add('show');

                // Focus sur le bouton retour pour clavier / lecteurs d'écran
                const backButton = purchaseSection.querySelector('.back-button');
                if (backButton) backButton.focus();
                
        };

        item.addEventListener('click', openItem);

        const openButton = item.querySelector('.open-button');
        if (openButton) {
            openButton.addEventListener('click', (e) => {
                e.stopPropagation();
                openItem(true);
            });
        }

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openItem();
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selectedItem) resetCarousel();
    });
}

function resetCarousel() {
    if (!selectedItem) return;

    // Remettre l'image à la couleur par défaut (première couleur)
    const itemData = carouselData.carouselItems.find(data => data.id == selectedItem.dataset.itemId);
    if (itemData && Array.isArray(itemData.colors) && itemData.colors.length > 0) {
        const defaultImage = itemData.colors[0].image;
        // Remove any extra bg-image elements from color transitions
        const allBgImages = selectedItem.querySelectorAll('.bg-image');
        allBgImages.forEach((img, i) => {
            if (i === 0) {
                img.src = defaultImage;
                img.dataset.active = 'true';
                img.classList.remove('is-entering-left', 'is-entering-right', 'is-leaving-left', 'is-leaving-right');
                img.style.transform = '';
            } else {
                img.remove();
            }
        });
    }

    // Fermeture INSTANTANÉE de la purchase section et réaffichage du header
    purchaseSection.style.transition = 'none';
    purchaseSection.classList.remove('show');
    togglePageChrome(false);
    
    // Restaurer les scrolls
    document.body.classList.remove('dimming-disabled');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    // Reset immédiat de tous les items
    selectedItem.classList.remove('expanding', 'text-slide-out');
    
    document.querySelectorAll('.carousel-item').forEach(item => {
        // Reset complet des styles
        item.style = '';
        item.classList.remove('fade-out');
        delete item.dataset.colorIndex;

        // Réafficher le contenu et les images comme avant ouverture
        const content = item.querySelector('.content');
        if (content) {
            content.style.display = '';
            content.style.opacity = '';
        }

        item.querySelectorAll('.bg-image').forEach((img, index) => {
            img.style.opacity = '';
            img.style.visibility = '';
            img.style.display = '';
            if (index > 0) {
                img.remove();
            }
        });
    });

    const collectionPanel = document.querySelector('.collection-panel');
    if (collectionPanel) collectionPanel.classList.remove('no-transform');
    
    unlockCarouselContainerHeight(document.querySelector('.carousel-container'));
    selectedItem = null;

    // Rendre le focus à l'élément précédent (si possible)
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
    
    // Restaurer la transition après un délai
    setTimeout(() => {
        if (purchaseSection) {
            purchaseSection.style.transition = '';
        }
    }, 50);
}

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