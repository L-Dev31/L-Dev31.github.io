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

    const renderProduct = (product) => {
        if (!product) {
            productDetailSection.innerHTML = '<p>Produit non trouvé.</p>';
            return;
        }

        const itemInCart = cart.find(item => item.id === product.id);
        const remainingStock = itemInCart ? product.stock - itemInCart.quantity : product.stock;
        const isStockReached = remainingStock <= 0;
        const isLowStock = product.stock <= 10;

        const oldPriceHTML = product.old_price ? `<span class="old-price">${product.old_price.toFixed(2)}€</span>` : '';
        const stockCountClass = isLowStock ? 'stock-count is-low-stock' : 'stock-count';

        productDetailSection.innerHTML = `
            <div class="product-detail-layout">
                <div class="product-detail-image">
                    <img src="${product.image}" alt="${product.name}">
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
                </div>
            </div>
        `;

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
