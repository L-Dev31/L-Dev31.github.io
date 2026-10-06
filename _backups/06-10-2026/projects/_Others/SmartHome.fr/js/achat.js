// js/achat.js
// Gère la page d'achat : affichage du panier, formulaire, validation

// Récupère le panier depuis le localStorage (même logique que script.js)
function getCart() {
    return JSON.parse(localStorage.getItem('azurShieldCart')) || [];
}
function getCartSelection() {
    // Par défaut, tout est sélectionné
    const cart = getCart();
    let selection = JSON.parse(localStorage.getItem('azurShieldCartSelection'));
    if (!selection || !Array.isArray(selection) || selection.length === 0) {
        selection = cart.map(item => item.id);
    }
    return selection;
}

function saveCartSelection(selection) {
    localStorage.setItem('azurShieldCartSelection', JSON.stringify(selection));
}

// Affiche le récapitulatif de la commande
function renderOrderSummary() {
    const cart = getCart();
    let selection = getCartSelection();
    if (!cart.length) {
        document.getElementById('order-summary-table').innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">Votre panier est vide.</td></tr>';
        document.getElementById('order-summary-total').textContent = '';
        return;
    }
    // Par défaut, tout coché si rien en sélection
    if (!selection.length) selection = cart.map(item => item.id);
    let total = 0;
    let totalShipping = 0;
    let rows = '';
    cart.forEach(item => {
        if (selection.includes(item.id)) {
            const shipping = item.shipping_price !== undefined ? item.shipping_price : 4.99;
            const lineTotal = item.price * item.quantity;
            total += lineTotal;
            totalShipping += shipping * item.quantity;
            rows += `<tr>
                <td><input type="checkbox" class="order-item-checkbox" data-id="${item.id}" checked></td>
                <td><img src="${item.image || (item.images && item.images[0])}" alt="${item.name}" style="width:48px;height:48px;border-radius:8px;"></td>
                <td>${item.name} <br><span style="font-size:0.95em;color:#888;">x${item.quantity}</span></td>
                <td style="text-align:right;">${lineTotal.toFixed(2)}€</td>
            </tr>`;
        } else {
            rows += `<tr>
                <td><input type="checkbox" class="order-item-checkbox" data-id="${item.id}"></td>
                <td><img src="${item.image || (item.images && item.images[0])}" alt="${item.name}" style="width:48px;height:48px;border-radius:8px;"></td>
                <td>${item.name} <br><span style="font-size:0.95em;color:#888;">x${item.quantity}</span></td>
                <td style="text-align:right;">${(item.price * item.quantity).toFixed(2)}€</td>
            </tr>`;
        }
    });
    let shippingHtml = '';
    if (total < 50 && total > 0) {
        shippingHtml = `<tr><td></td><td></td><td>Livraison</td><td style="text-align:right;">${totalShipping.toFixed(2)}€</td></tr>`;
    } else if (total >= 50) {
        shippingHtml = `<tr><td></td><td></td><td>Livraison</td><td style="text-align:right;"><span style="text-decoration:line-through;color:#e74c3c;">${totalShipping.toFixed(2)}€</span> <span style="color:var(--midnight-green);font-weight:700;">0€</span></td></tr>`;
    }
    document.getElementById('order-summary-table').innerHTML = rows + shippingHtml;
    const totalGeneral = total < 50 ? total + totalShipping : total;
    document.getElementById('order-summary-total').textContent = `Total à payer : ${totalGeneral.toFixed(2)}€`;
}

document.addEventListener('DOMContentLoaded', function() {
    renderOrderSummary();
    // Gestion des checkbox (coché par défaut)
    document.getElementById('order-summary-table').addEventListener('change', function(e) {
        if (e.target.classList.contains('order-item-checkbox')) {
            let selection = getCartSelection();
            const id = parseInt(e.target.dataset.id, 10);
            if (e.target.checked) {
                if (!selection.includes(id)) selection.push(id);
            } else {
                selection = selection.filter(cid => cid !== id);
            }
            saveCartSelection(selection);
            renderOrderSummary();
        }
    });
    // Validation du formulaire
    document.getElementById('order-form').addEventListener('submit', function(e) {
        e.preventDefault();
        // Simulation d'envoi (à remplacer par un vrai backend)
        document.getElementById('order-success').style.display = 'block';
        document.getElementById('order-form').style.display = 'none';
        // On pourrait vider le panier ici si besoin
        // localStorage.removeItem('azurShieldCart');
        // localStorage.removeItem('azurShieldCartSelection');
    });
});
