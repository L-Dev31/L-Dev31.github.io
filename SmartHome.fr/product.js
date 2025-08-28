document.addEventListener('DOMContentLoaded', () => {
    const productDetailSection = document.getElementById('product-detail');
    let cart = JSON.parse(localStorage.getItem('azurShieldCart')) || [];
    let allProducts = [];

    const getProductId = () => {
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('id'), 10);
    };

    const fetchProducts = async () => {
        try {
            const response = await fetch('products.json');
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
            const productsByCategory = await response.json();
            
            let loadedProducts = [];
            let idCounter = 1;
            for (const category in productsByCategory) {
                productsByCategory[category].forEach(product => {
                    loadedProducts.push({
                        ...product,
                        id: idCounter++,
                        category: category,
                        price: parseFloat(product.price),
                        old_price: product.old_price ? parseFloat(product.old_price) : undefined,
                        stock: parseInt(product.stock, 10)
                    });
                });
            }
            allProducts = loadedProducts;
            return allProducts;
        } catch (error) {
            console.error("Impossible de charger les produits:", error);
            return [];
        }
    };

    const renderProduct = async (product) => {
        if (!product) {
            productDetailSection.innerHTML = '<p>Produit non trouvé.</p>';
            return;
        }

        // Récupère les infos de la marque si brand existe
        let brandData = null;
        if (product.brand) {
            try {
                const brandRes = await fetch('brand.json');
                const brands = await brandRes.json();
                brandData = brands[product.brand?.toString()];
            } catch (e) { brandData = null; }
        }

        const itemInCart = cart.find(item => item.id === product.id);
        const remainingStock = itemInCart ? product.stock - itemInCart.quantity : product.stock;
        const isStockReached = remainingStock <= 0;
        const isLowStock = product.stock <= 10;

        const oldPriceHTML = product.old_price ? `<span class="old-price">${product.old_price.toFixed(2)}€</span>` : '';
        const stockCountClass = isLowStock ? 'stock-count is-low-stock' : 'stock-count';

        // Carousel images (max 10)
        const images = Array.isArray(product.images) ? product.images.slice(0, 10) : [product.image];
        const thumbnails = images.map((img, i) => `<img src="${img}" alt="miniature ${i+1}" class="carousel-thumb" data-index="${i}">`).join('');
    // Affichage conditionnel des miniatures :
    const thumbnailsHTML = images.length > 1 ? `<div class="carousel-thumbnails">${thumbnails}</div>` : '';

        // Infos additionnelles (affiche seulement si non null)
        const infoRows = [
            brandData ? `<tr><td>Marque</td><td><img src="${brandData.logo}" alt="${brandData.name}" style="height:32px;vertical-align:middle;"> ${brandData.name} <span title="${brandData.description}">(${brandData.rating}★)</span></td></tr>` : '',
            product.model ? `<tr><td>Modèle</td><td>${product.model}</td></tr>` : '',
            product.reference ? `<tr><td>Référence</td><td>${product.reference}</td></tr>` : '',
            product.warranty ? `<tr><td>Garantie</td><td>${product.warranty}</td></tr>` : '',
            product.color ? `<tr><td>Couleur</td><td>${product.color}</td></tr>` : '',
            product.dimensions ? `<tr><td>Dimensions</td><td>${product.dimensions}</td></tr>` : '',
            product.weight ? `<tr><td>Poids</td><td>${product.weight}</td></tr>` : '',
            product.connectivity ? `<tr><td>Connectivité</td><td>${product.connectivity}</td></tr>` : '',
            product.power ? `<tr><td>Alimentation</td><td>${product.power}</td></tr>` : '',
            product.video_resolution ? `<tr><td>Résolution vidéo</td><td>${product.video_resolution}</td></tr>` : '',
            product.audio ? `<tr><td>Audio</td><td>${product.audio}</td></tr>` : '',
            product.compatibility ? `<tr><td>Compatibilité</td><td>${product.compatibility.join(', ')}</td></tr>` : '',
            product.features ? `<tr><td>Fonctionnalités</td><td>${product.features.join(', ')}</td></tr>` : '',
            product.manual_url ? `<tr><td>Manuel</td><td><a href="${product.manual_url}" target="_blank">Télécharger</a></td></tr>` : ''
        ].filter(Boolean).join('');

        productDetailSection.innerHTML = `
            <div class="product-detail-layout">
                <div class="product-detail-image">
                    <div class="carousel-container">
                        <img src="${images[0]}" alt="${product.name}" id="main-carousel-image" style="cursor:pointer;max-width:100%;border-radius:15px;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                        ${thumbnailsHTML}
                    </div>
                </div>
                <div class="product-detail-info">
                    <a href="/" class="back-to-home"><i class="fas fa-arrow-left"></i> Retour aux produits</a>
                    <h2 class="product-detail-name">${product.name}</h2>
                    <p class="product-detail-description">${product.description}</p>
                    <div class="price-container">
                        <span class="product-price">${product.price.toFixed(2)}€</span>
                        ${oldPriceHTML}
                    </div>
                    <div class="stock-container">
                        <span class="${stockCountClass}">Stock: ${product.stock}</span>
                    </div>
                    <button class="add-to-cart" data-id="${product.id}" ${isStockReached ? 'disabled' : ''}>
                        ${isStockReached ? 'Stock atteint' : 'Ajouter au panier'}
                    </button>
                    <table class="product-info-table" style="margin-top:2rem;width:100%;font-size:1rem;">
                        <tbody>${infoRows}</tbody>
                    </table>
                </div>
            </div>
        `;

        // Carousel JS (miniatures + modale)
        let currentIndex = 0;
        const mainImg = document.getElementById('main-carousel-image');
        const thumbs = productDetailSection.querySelectorAll('.carousel-thumb');
        const modal = document.getElementById('carousel-modal');
        const modalImg = document.getElementById('modal-main-image');
        const modalThumbs = document.getElementById('modal-thumbnails');
        const prevBtn = modal.querySelector('.prev');
        const nextBtn = modal.querySelector('.next');
        const closeModal = modal.querySelector('.close-modal');

        // Ouvre la modale plein écran sur clic image principale
        mainImg.onclick = () => {
            modal.classList.remove('hidden');
            modalImg.src = images[currentIndex];
            renderModalThumbs();
        };

        // Miniatures sous l'image principale
        thumbs.forEach((thumb, i) => {
            thumb.onclick = () => {
                currentIndex = i;
                mainImg.src = images[i];
            };
        });

        // Modale : miniatures
        function renderModalThumbs() {
            if (!modalThumbs) return;
            if (images.length <= 1) {
                modalThumbs.innerHTML = '';
                modalThumbs.style.display = 'none';
                return;
            }
            modalThumbs.innerHTML = images.map((img, i) => `<img src="${img}" class="carousel-thumb${i===currentIndex?' selected':''}" data-index="${i}">`).join('');
            modalThumbs.style.display = 'flex';
            modalThumbs.querySelectorAll('.carousel-thumb').forEach((thumb, i) => {
                thumb.onclick = () => {
                    currentIndex = i;
                    modalImg.src = images[i];
                    renderModalThumbs();
                };
            });
        }

        // Modale : navigation
        prevBtn.onclick = () => {
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            modalImg.src = images[currentIndex];
            renderModalThumbs();
        };
        nextBtn.onclick = () => {
            currentIndex = (currentIndex + 1) % images.length;
            modalImg.src = images[currentIndex];
            renderModalThumbs();
        };
        closeModal.onclick = () => {
            modal.classList.add('hidden');
        };
        // Ferme modale sur clic hors contenu
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

        // Ajoute navigation sur miniatures (hors modale)
        mainImg.src = images[currentIndex];

        // Ajout panier
        const addToCartBtn = productDetailSection.querySelector('.add-to-cart');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
                addToCart(product.id);
                // Re-render the button state
                const itemInCart = cart.find(item => item.id === product.id);
                const remainingStock = itemInCart ? product.stock - itemInCart.quantity : product.stock;
                const isStockReached = remainingStock <= 0;
                addToCartBtn.disabled = isStockReached;
                addToCartBtn.textContent = isStockReached ? 'Stock atteint' : 'Ajouter au panier';
            });
        }
    };
    
    const addToCart = (productId) => {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;

        const itemInCart = cart.find(item => item.id === productId);

        if (itemInCart) {
            if (itemInCart.quantity < product.stock) {
                itemInCart.quantity++;
            } else {
                alert('Stock maximum atteint pour ce produit.');
                return;
            }
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        
        localStorage.setItem('azurShieldCart', JSON.stringify(cart));
        updateCartCount();
    };

    const updateCartCount = () => {
        const cartCount = document.getElementById('cart-count');
        if (cartCount) {
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCount.textContent = count;
        }
    };

    const init = async () => {
        const products = await fetchProducts();
        const productId = getProductId();
        const product = products.find(p => p.id === productId);
        renderProduct(product);
        updateCartCount();
    };

    init();
});
