/**
 * @file script.js
 * @description Gère l'ensemble de la logique interactive du site AzurShield.fr.
 * @version 12.0.0 (External Product Page & LocalStorage Cart)
 */

// =================================================================
// STATE MANAGEMENT
// =================================================================

let allProducts = [];
let cart = [];
let cartSelection = [];

// =================================================================
// DOM ELEMENTS
// =================================================================


let DOM = {};

// =================================================================
// INITIALIZATION
// =================================================================


// Initialisation différée : attendre que la navbar soit injectée (donc les filtres et le DOM prêts)
function waitForNavbarAndInit() {
    if (document.getElementById('cart-count') && document.querySelector('.filters-sidebar')) {
        refreshDOM();
        init();
    } else {
        setTimeout(waitForNavbarAndInit, 30);
    }
}
document.addEventListener('DOMContentLoaded', waitForNavbarAndInit);

async function init() {
    loadCart();
    setupEventListeners();
    await loadProducts();
    adjustLayout();
}
// =================================================================
// CART FUNCTIONS
// =================================================================

function loadCart() {
    cart = JSON.parse(localStorage.getItem('azurShieldCart')) || [];
    // Par défaut, tout est sélectionné
    let selection = JSON.parse(localStorage.getItem('azurShieldCartSelection'));
    if (!selection || !Array.isArray(selection) || selection.length === 0) {
        selection = cart.map(item => item.id);
    }
    cartSelection = selection;
    renderCart();
    updateCartCount();
}

function saveCart() {
    localStorage.setItem('azurShieldCart', JSON.stringify(cart));
    // Toujours synchroniser la sélection avec le panier (tout coché par défaut)
    if (!cartSelection || cartSelection.length === 0) {
        cartSelection = cart.map(item => item.id);
    }
    localStorage.setItem('azurShieldCartSelection', JSON.stringify(cartSelection));
}

// =================================================================
// CORE LOGIC & DATA FETCHING
// =================================================================

function sortProductsForFomo(products) {
    const lowStockThreshold = 10;

    const getDiscountPercent = (product) => {
        if (!product.old_price || product.old_price <= product.price) {
            return 0;
        }
        return ((product.old_price - product.price) / product.old_price) * 100;
    };

    products.sort((a, b) => {
        const aIsLowStock = a.stock <= lowStockThreshold;
        const bIsLowStock = b.stock <= lowStockThreshold;

        if (aIsLowStock && !bIsLowStock) return -1;
        if (!aIsLowStock && bIsLowStock) return 1;

        const discountA = getDiscountPercent(a);
        const discountB = getDiscountPercent(b);
        if (discountA !== discountB) return discountB - discountA;

        if (b.price !== a.price) return b.price - a.price;

        return a.stock - b.stock;
    });

    return products;
}

async function loadProducts() {
    try {
    const response = await fetch('json/products.json');
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        const productsByCategory = await response.json();
        
        let loadedProducts = [];
        let idCounter = 1;
        for (const category in productsByCategory) {
            productsByCategory[category].forEach(product => {
                if (product.stock > 0) {
                    loadedProducts.push({
                        ...product,
                        id: idCounter++,
                        category: category,
                        price: parseFloat(product.price),
                        old_price: product.old_price ? parseFloat(product.old_price) : undefined,
                        stock: parseInt(product.stock, 10)
                    });
                }
            });
        }
        allProducts = sortProductsForFomo(loadedProducts);
        renderProducts(allProducts);
    } catch (error) {
        console.error("Impossible de charger les produits:", error);
        if(DOM.productGrid) DOM.productGrid.innerHTML = `<p class="no-products-found">Erreur lors du chargement des produits.</p>`;
    }
}

function addToCart(productId) {
    if (DOM.cartLoader) {
        DOM.cartLoader.classList.add('visible');
    }

    setTimeout(() => {
        const product = allProducts.find(p => p.id === productId);
        if (!product) {
            if (DOM.cartLoader) {
                DOM.cartLoader.classList.remove('visible');
            }
            return;
        }

        const itemInCart = cart.find(item => item.id === productId);

        if (itemInCart) {
            if (itemInCart.quantity < product.stock) {
                itemInCart.quantity++;
            } else {
                alert('Stock maximum atteint pour ce produit.');
                if (DOM.cartLoader) {
                    DOM.cartLoader.classList.remove('visible');
                }
                return;
            }
        } else {
            cart.push({ ...product, quantity: 1 });
        }

        if (!cartSelection.includes(productId)) {
            cartSelection.push(productId);
        }

        saveCart();
        renderCart();
        updateCartCount();
        animateCartIcon();
        showAddToCartModal(product);
        renderProducts(getFilteredProducts(true));
        
        if (DOM.cartLoader) {
            DOM.cartLoader.classList.remove('visible');
        }
    }, 1000);
}

function updateQuantity(productId, change) {
    if (DOM.cartLoader) {
        DOM.cartLoader.classList.add('visible');
    }

    setTimeout(() => {
        const item = cart.find(item => item.id === productId);
        if (!item) {
            if (DOM.cartLoader) {
                DOM.cartLoader.classList.remove('visible');
            }
            return;
        }

        const product = allProducts.find(p => p.id === productId);
        if (!product) {
            if (DOM.cartLoader) {
                DOM.cartLoader.classList.remove('visible');
            }
            return;
        }

        const newQuantity = item.quantity + change;

        if (change > 0 && newQuantity > product.stock) {
            alert('Stock maximum atteint pour ce produit.');
            if (DOM.cartLoader) {
                DOM.cartLoader.classList.remove('visible');
            }
            return;
        }

        if (newQuantity <= 0) {
            cart = cart.filter(i => i.id !== productId);
        } else {
            item.quantity = newQuantity;
        }

        saveCart();
        renderCart();
        updateCartCount();
        renderProducts(getFilteredProducts(true));

        if (DOM.cartLoader) {
            DOM.cartLoader.classList.remove('visible');
        }
    }, 1000);
}

function getFilteredProducts(respectSearch = false) {
    const activeFilterBtn = document.querySelector('.filter-btn.active');
    if (!activeFilterBtn) return [];
    const activeCategory = activeFilterBtn.dataset.category;
    let products = activeCategory === 'all' ? allProducts : allProducts.filter(p => p.category === activeCategory);

    if (respectSearch) {
        const query = DOM.searchBar.value.toLowerCase();
        if (query) {
            products = products.filter(p => p.name.toLowerCase().includes(query));
        }
    }
    return products;
}

// =================================================================
// RENDER & UI FUNCTIONS
// =================================================================

function renderProducts(productsToRender) {
    if (!DOM.productGrid) return;
    if (productsToRender.length === 0) {
        DOM.productGrid.innerHTML = `<p class="no-products-found">Aucun produit ne correspond à votre recherche.</p>`;
        return;
    }
        DOM.productGrid.innerHTML = productsToRender.map(product => {
            const itemInCart = cart.find(item => item.id === product.id);
            const remainingStock = itemInCart ? product.stock - itemInCart.quantity : product.stock;
            const isStockReached = remainingStock <= 0;
            const isLowStock = product.stock <= 10;

            const oldPriceHTML = product.old_price ? `<span class="old-price">${product.old_price.toFixed(2)}€</span>` : '';
            const stockCountClass = isLowStock ? 'stock-count is-low-stock' : 'stock-count';
            // Correction image principale :
            let mainImage = product.image;
            if (Array.isArray(product.images) && product.images.length > 0) {
                mainImage = product.images[0];
            }
            return `
            <div class="product-card" data-id="${product.id}">
                <a href="product.html?id=${product.id}" class="product-card-link">
                    <div class="card-header">
                        <span class="${stockCountClass}">Stock: ${product.stock}</span>
                    </div>
                    <img src="${mainImage}" alt="${product.name}" class="product-image">
                    <div class="product-info">
                        <h3 class="product-title">${product.name}</h3>
                        <p class="product-description">${product.description.substring(0, 80)}...</p>
                        <div class="price-container">
                            <span class="product-price">${product.price.toFixed(2)}€</span>
                            ${oldPriceHTML}
                        </div>
                    </div>
                </a>
                <button class="add-to-cart" data-id="${product.id}" ${isStockReached ? 'disabled' : ''}>
                    ${isStockReached ? 'Stock atteint' : 'Ajouter au panier'}
                </button>
            </div>
        `}).join('');
    }

    // --- RENDER CART ---
    function renderCart() {
        if (!DOM.cartItems) return;
        if (cart.length === 0) {
            DOM.cartItems.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">Votre panier est vide</p>';
            if (DOM.cartShippingInfo) DOM.cartShippingInfo.innerHTML = '';
            DOM.cartTotal.textContent = `0€`;
            return;
        }
        DOM.cartItems.innerHTML = cart.map(item => {
            const product = allProducts.find(p => p.id === item.id) || item;
            const isStockReached = item.quantity >= product.stock;
            let mainImage = item.image;
            if (Array.isArray(item.images) && item.images.length > 0) {
                mainImage = item.images[0];
            }
            // Prix livraison par produit (exemple: 4.99€ par produit, à adapter si besoin)
            const shipping = product.shipping_price !== undefined ? product.shipping_price : 4.99;
            const checked = cartSelection.includes(item.id) ? 'checked' : '';
            return `
            <div class="cart-item">
                <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${checked} style="margin-right:8px;">
                <img src="${mainImage}" alt="${item.name}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${item.price.toFixed(2)}€</div>
                    <div class="cart-item-shipping">Livraison: <span class="shipping-price">${shipping.toFixed(2)}€</span></div>
                    <div class="quantity-controls" data-id="${item.id}">
                        <button class="quantity-btn decrease">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn increase" ${isStockReached ? 'disabled' : ''}>+</button>
                    </div>
                </div>
            </div>
            `;
        }).join('');

            // Calcul du total sélectionné (produits uniquement) et du total livraison (par quantité)
            let totalProduits = 0;
            let totalLivraison = 0;
            cart.forEach(item => {
                if (cartSelection.includes(item.id)) {
                    totalProduits += item.price * item.quantity;
                    const product = allProducts.find(p => p.id === item.id) || item;
                    const shippingPerItem = product.shipping_price !== undefined ? product.shipping_price : 4.99;
                    totalLivraison += shippingPerItem * item.quantity; // tenir compte des quantités
                }
            });

            // Préparer l'affichage : d'abord le sous-total produits, puis la livraison, puis le total général
            const produitHtml = `<div>Produits: <strong class="product-subtotal">${totalProduits.toFixed(2)}€</strong></div>`;

            let shippingHtml = '';
            if (totalProduits < 50 && totalProduits > 0) {
                // Affiche seulement le prix de livraison
                shippingHtml = `<div>Livraison: <span class="shipping-total">${totalLivraison.toFixed(2)}€</span></div>`;
            } else if (totalProduits >= 50) {
                shippingHtml = `
                    <div>Livraison: <span class="shipping-old">${totalLivraison.toFixed(2)}€</span> <span class="shipping-free">0€</span></div>
                    <div class="shipping-note">Livraison offerte dès cinquante euros.</div>
                `;
            }

            if (DOM.cartShippingInfo) DOM.cartShippingInfo.innerHTML = produitHtml + shippingHtml;

            // Total général (produits + livraison si < 50€)
            let totalGeneral = totalProduits;
            if (totalProduits < 50 && totalProduits > 0) totalGeneral += totalLivraison;
            DOM.cartTotal.textContent = `${totalGeneral.toFixed(2)}€`;
    }

function updateCartCount() {
    // Seuls les produits sélectionnés comptent
    const count = cart.reduce((sum, item) => cartSelection.includes(item.id) ? sum + item.quantity : sum, 0);
    const el = document.getElementById('cart-count');
    if (el) el.textContent = count;
}

function showAddToCartModal(product) {
    if (!DOM.cartModal) return;
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    // Message générique
    DOM.cartModalMessage.textContent = 'Le produit suivant a été ajouté à votre panier :';
    DOM.cartModalName.textContent = product.name;
    let mainImage = product.image;
    if (Array.isArray(product.images) && product.images.length > 0) {
        mainImage = product.images[0];
    }
    DOM.cartModalImage.src = mainImage;
    DOM.cartModalName.textContent = product.name;
    DOM.cartModalCount.textContent = `${count} article(s)`;
    DOM.cartModalTotal.textContent = `${total.toFixed(2)}€`;
    DOM.cartModal.style.display = 'block';
    // Désactiver le scroll du body lorsque la modale est ouverte
    if (DOM.body) DOM.body.classList.add('no-scroll');
}

function adjustLayout() {
    refreshDOM();
    if (!DOM.topBar || !DOM.navbar) return;
    const topBarHeight = DOM.topBar.offsetHeight;
    DOM.body.style.paddingTop = `${topBarHeight}px`;
    DOM.navbar.style.top = `${topBarHeight}px`;
}

function animateCartIcon() {
    DOM.cartIcon.style.transform = 'scale(1.2)';
    setTimeout(() => { DOM.cartIcon.style.transform = 'scale(1)'; }, 300);
}

function scrollToProducts() {
    const productsSection = document.getElementById('products');
    if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function scrollToProductsAndFilter(category) {
    scrollToProducts();
    setTimeout(() => {
        const filterBtn = document.querySelector(`.filter-btn[data-category="${category}"]`);
        if (filterBtn) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            filterBtn.classList.add('active');
            DOM.searchBar.value = '';
            renderProducts(getFilteredProducts());
        }
    }, 300);
}


// =================================================================
// EVENT LISTENERS & HANDLERS
// =================================================================

function setupEventListeners() {
    DOM.productGrid?.addEventListener('click', e => {
        const addToCartBtn = e.target.closest('.add-to-cart');
        if (addToCartBtn) {
            addToCart(parseInt(addToCartBtn.dataset.id, 10));
        }
    });

    DOM.filtersSidebar?.addEventListener('click', e => {
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            const productsSection = document.getElementById('products');
            if (productsSection) {
                productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            filterBtn.classList.add('active');
            DOM.searchBar.value = '';
            renderProducts(getFilteredProducts());
        }
    });

    DOM.cartItems?.addEventListener('click', e => {
        const controls = e.target.closest('.quantity-controls');
        if (controls) {
            const productId = parseInt(controls.dataset.id, 10);
            if (e.target.classList.contains('increase')) updateQuantity(productId, 1);
            if (e.target.classList.contains('decrease')) updateQuantity(productId, -1);
        }
    });

    // Gestion des checkbox produits
    DOM.cartItems?.addEventListener('change', e => {
        const checkbox = e.target.closest('.cart-item-checkbox');
        if (checkbox) {
            const id = parseInt(checkbox.dataset.id, 10);
            if (checkbox.checked) {
                if (!cartSelection.includes(id)) cartSelection.push(id);
            } else {
                cartSelection = cartSelection.filter(cid => cid !== id);
            }
            // Mise à jour du localStorage pour la sélection
            localStorage.setItem('azurShieldCartSelection', JSON.stringify(cartSelection));
            // Si tout est coché, coche "Tout" sinon décoche
            const selectAll = document.getElementById('cart-select-all');
            if (selectAll) selectAll.checked = cartSelection.length === cart.length;
            renderCart();
            updateCartCount();
        }
    });

    // Gestion de la checkbox "Tout"
    document.getElementById('cart-select-all')?.addEventListener('change', e => {
        if (e.target.checked) {
            cartSelection = cart.map(item => item.id);
        } else {
            cartSelection = [];
        }
        // Mise à jour du localStorage pour la sélection
        localStorage.setItem('azurShieldCartSelection', JSON.stringify(cartSelection));
        renderCart();
        updateCartCount();
    });

    DOM.searchBar?.addEventListener('input', handleSearch);
    DOM.searchSuggestions?.addEventListener('click', handleSuggestionClick);

    document.addEventListener('click', e => {
        if (e.target.matches('.modal') || e.target.matches('.close') || e.target.matches('#continue-shopping-btn')) {
            if(DOM.cartModal) {
                DOM.cartModal.style.display = 'none';
                if (DOM.body) DOM.body.classList.remove('no-scroll');
            }
        }
        if (!e.target.closest('.search-container')) {
            if(DOM.searchSuggestions) DOM.searchSuggestions.style.display = 'none';
        }
    });

    const showCart = () => {
        DOM.cartSidebar.classList.add('open');
        const backdrop = document.getElementById('cart-backdrop');
        if (backdrop) backdrop.classList.add('visible');
    // Désactiver le scroll du body lorsque le panier est ouvert
    if (DOM.body) DOM.body.classList.add('no-scroll');
    };
    const hideCart = () => {
        DOM.cartSidebar.classList.remove('open');
        const backdrop = document.getElementById('cart-backdrop');
        if (backdrop) backdrop.classList.remove('visible');
    // Réactiver le scroll du body lorsque le panier est fermé
    if (DOM.body) DOM.body.classList.remove('no-scroll');
    };

    DOM.cartIcon?.addEventListener('click', showCart);
    DOM.cartCloseBtn?.addEventListener('click', hideCart);
    // fermer le panier au clic sur le backdrop
    document.getElementById('cart-backdrop')?.addEventListener('click', hideCart);
    DOM.checkoutBtn?.addEventListener('click', () => alert('Fonctionnalité de paiement non implémentée.'));
    DOM.checkoutModalBtn?.addEventListener('click', () => {
        if(DOM.cartModal) DOM.cartModal.style.display = 'none';
        DOM.cartSidebar.classList.add('open');
    });

    window.addEventListener('resize', adjustLayout);
    window.addEventListener('scroll', handleScroll);
}
// Ajout DOM.cartShippingInfo pour la livraison
function refreshDOM() {
    DOM = {
        body: document.body,
        topBar: document.querySelector('.top-bar'),
        navbar: document.querySelector('.navbar'),
        searchBar: document.getElementById('search-bar'),
        searchSuggestions: document.getElementById('search-suggestions'),
        productGrid: document.getElementById('products-grid'),
        filtersSidebar: document.querySelector('.filters-sidebar'),
        cartIcon: document.querySelector('.cart-icon'),
        cartCount: document.getElementById('cart-count'),
        cartSidebar: document.getElementById('cart-sidebar'),
        cartItems: document.getElementById('cart-items'),
        cartTotal: document.getElementById('cart-total-sidebar'),
        cartCloseBtn: document.querySelector('.close-cart'),
        checkoutBtn: document.querySelector('#cart-sidebar .checkout-btn'),
        cartModal: document.getElementById('cart-modal'),
        cartModalMessage: document.getElementById('modal-message'),
        cartModalImage: document.getElementById('modal-product-image'),
        cartModalName: document.getElementById('modal-product-name'),
        cartModalCount: document.getElementById('modal-cart-count'),
        cartModalTotal: document.getElementById('modal-cart-total'),
        continueShoppingBtn: document.getElementById('continue-shopping-btn'),
        checkoutModalBtn: document.getElementById('checkout-modal-btn'),
        cartShippingInfo: document.getElementById('cart-shipping-info'),
        cartLoader: document.querySelector('#cart-sidebar .cart-loader'),
    };
}

function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    const productsToSearch = getFilteredProducts();
    const finalProducts = productsToSearch.filter(p => p.name.toLowerCase().includes(query));
    renderProducts(finalProducts);

    if (query.length > 1 && finalProducts.length > 0) {
        renderSuggestions(finalProducts.slice(0, 5));
    } else {
        if(DOM.searchSuggestions) DOM.searchSuggestions.style.display = 'none';
    }
}

function handleSuggestionClick(event) {
    const target = event.target.closest('.suggestion-item');
    if (target) {
        DOM.searchBar.value = target.textContent;
        handleSearch({ target: DOM.searchBar });
        if(DOM.searchSuggestions) DOM.searchSuggestions.style.display = 'none';
    }
}

function renderSuggestions(suggestions) {
    if (!DOM.searchSuggestions) return;
    if (suggestions.length === 0) {
        DOM.searchSuggestions.style.display = 'none';
        return;
    }
    DOM.searchSuggestions.innerHTML = suggestions.map(s => `<div class="suggestion-item">${s.name}</div>`).join('');
    DOM.searchSuggestions.style.display = 'block';
}

function handleScroll() {
    if (!DOM.topBar || !DOM.navbar) return;
    const isScrolled = window.scrollY > 10;
    DOM.topBar.classList.toggle('hidden', isScrolled);
    DOM.navbar.classList.toggle('top-bar-hidden', isScrolled);
    if (window.scrollY > 50) {
        DOM.navbar.classList.add('navbar-scrolled');
    } else {
        DOM.navbar.classList.remove('navbar-scrolled');
    }
}
