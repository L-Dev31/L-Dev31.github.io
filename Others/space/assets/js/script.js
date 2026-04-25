const layers = document.querySelectorAll('.layer');
const descs = document.querySelectorAll('.layer-desc');

function applyHoverEffect(targetLayer, targetDesc) {
    layers.forEach(l => {
        if (l !== targetLayer) {
            l.style.filter = 'grayscale(100%)';
        } else {
            l.style.filter = 'grayscale(0%)';
        }
    });
    descs.forEach(d => {
        if (d !== targetDesc) {
            d.style.opacity = 0.3;
        } else {
            d.style.opacity = 1;
        }
    });
}

function resetEffects() {
    layers.forEach(l => l.style.filter = 'grayscale(0%)');
    descs.forEach(d => d.style.opacity = 1);
}

layers.forEach(layer => {
    layer.addEventListener('mouseenter', () => {
        const layerName = layer.getAttribute('data-layer');
        const desc = document.getElementById(layerName + '-desc');
        applyHoverEffect(layer, desc);
    });
    layer.addEventListener('mouseleave', resetEffects);
});

descs.forEach(desc => {
    desc.addEventListener('mouseenter', () => {
        const descId = desc.id;
        const layerName = descId.replace('-desc', '');
        const layer = document.querySelector(`.layer[data-layer="${layerName}"]`);
        applyHoverEffect(layer, desc);
    });
    desc.addEventListener('mouseleave', resetEffects);
});

// Navbar scroll effect
function updateNavbarState() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    if (window.scrollY > 10) {
        nav.classList.add('scrolled');
        console.log('[navbar] scrolled ON (scrollY=', window.scrollY, ')');
    } else {
        nav.classList.remove('scrolled');
        console.log('[navbar] scrolled OFF (scrollY=', window.scrollY, ')');
    }
}

window.addEventListener('scroll', updateNavbarState);
window.addEventListener('load', updateNavbarState);
window.addEventListener('resize', updateNavbarState);