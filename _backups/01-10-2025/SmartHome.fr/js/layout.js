document.addEventListener("DOMContentLoaded", function() {
    fetch("layout/footer.html")
        .then(response => {
            if (!response.ok) {
                console.error('Failed to fetch layout/footer.html', response);
                return;
            }
            return response.text();
        })
    function injectLayout(id, url) {
        const el = document.getElementById(id);
        if (!el) return;
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch ' + url);
                return response.text();
            })
            .then(html => {
                el.innerHTML = html;
            })
            .catch(err => console.error('Failed to load ' + url + ':', err));
    }

    injectLayout('navbar-placeholder', 'layout/navbar.html');
    injectLayout('modals-placeholder', 'layout/modals.html');
    injectLayout('cart-placeholder', 'layout/cart.html');
    const footer = document.getElementById('footer-placeholder');
    if (footer) {
        fetch('layout/footer.html')
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch layout/footer.html');
                return response.text();
            })
            .then(html => {
                footer.innerHTML = html;
            })
            .catch(err => console.error('Failed to load footer:', err));
    }
});