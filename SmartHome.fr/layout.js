document.addEventListener("DOMContentLoaded", function() {
    fetch("footer.html")
        .then(response => {
            if (!response.ok) {
                console.error('Failed to fetch footer.html', response);
                return;
            }
            return response.text();
        })
        .then(data => {
            if (data) {
                const footerPlaceholder = document.getElementById("footer-placeholder");
                if (footerPlaceholder) {
                    footerPlaceholder.innerHTML = data;
                }
            }
        })
        .catch(error => {
            console.error("Impossible de charger le footer:", error);
        });
});