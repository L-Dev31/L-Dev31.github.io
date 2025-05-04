// FAQ Toggle Functionality
document.querySelectorAll('.faq-question').forEach((question) => {
    question.addEventListener('click', () => {
        const faqItem = question.parentElement;
        
        // Close all other FAQs
        document.querySelectorAll('.faq-item').forEach(item => {
            if (item !== faqItem) {
                item.classList.remove('active');
            }
        });
        
        // Toggle current FAQ
        faqItem.classList.toggle('active');
    });
});

// Carousel Functionality
const carouselInner = document.querySelector('.carousel-inner');
const items = document.querySelectorAll('.carousel-item');
let currentIndex = 0;
let autoSlideInterval;

function updateCarousel() {
    const itemWidth = items[0].clientWidth;
    const offset = -currentIndex * itemWidth;
    carouselInner.style.transform = `translateX(${offset}px)`;
    items.forEach((item, index) => item.classList.toggle('active', index === currentIndex));
}

function nextSlide() {
    currentIndex = (currentIndex + 1) % items.length;
    updateCarousel();
}

function previousSlide() {
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    updateCarousel();
}

function startAutoSlide() {
    autoSlideInterval = setInterval(nextSlide, 5000);
}

// Initialize carousel if elements exist
if (carouselInner && items.length > 0) {
    document.querySelector('.prev-btn')?.addEventListener('click', () => {
        previousSlide();
        resetAutoSlide();
    });

    document.querySelector('.next-btn')?.addEventListener('click', () => {
        nextSlide();
        resetAutoSlide();
    });

    function resetAutoSlide() {
        clearInterval(autoSlideInterval);
        startAutoSlide();
    }

    // Initial setup
    updateCarousel();
    startAutoSlide();

    // Handle window resize
    window.addEventListener('resize', updateCarousel);
}

// Ajout d'un délai aléatoire pour l'animation des images
document.querySelectorAll('.carousel-item img').forEach(img => {
    img.style.animationDelay = `${Math.random() * 2}s`;
});

// Navigation mobile
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    });
}

// Animation au scroll
document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, {
        threshold: 0.1
    });
    
    document.querySelectorAll('.section-header, .metric-card, .fact-card, .feature-card, .category-item, .pricing-card').forEach(el => {
        observer.observe(el);
        el.classList.add('animate-on-scroll');
    });
});

// Testimonial Carousel
const testimonialItems = document.querySelectorAll('.testimonial-item');
const dots = document.querySelectorAll('.dot');
let currentTestimonialIndex = 0;
let testimonialInterval;

function showTestimonial(index) {
    testimonialItems.forEach(item => item.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    
    testimonialItems[index].classList.add('active');
    dots[index].classList.add('active');
    currentTestimonialIndex = index;
}

function nextTestimonial() {
    const newIndex = (currentTestimonialIndex + 1) % testimonialItems.length;
    showTestimonial(newIndex);
}

function startTestimonialSlider() {
    testimonialInterval = setInterval(nextTestimonial, 6000);
}

// Initialize testimonial carousel if elements exist
if (testimonialItems.length > 0 && dots.length > 0) {
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showTestimonial(index);
            resetTestimonialSlider();
        });
    });
    
    function resetTestimonialSlider() {
        clearInterval(testimonialInterval);
        startTestimonialSlider();
    }
    
    // Initial setup
    showTestimonial(0);
    startTestimonialSlider();
}

// Financial Charts using Chart.js
if (typeof Chart !== 'undefined') {
    // Revenue Growth Chart
    const revenueChart = document.getElementById('revenueChart');
    
    if (revenueChart) {
        new Chart(revenueChart, {
            type: 'bar',
            data: {
                labels: ['Année 1', 'Année 2', 'Année 3'],
                datasets: [{
                    label: 'Revenus (K€)',
                    data: [480, 1212, 2454],
                    backgroundColor: [
                        'rgba(51, 102, 255, 0.6)',
                        'rgba(51, 102, 255, 0.8)',
                        'rgba(51, 102, 255, 1)'
                    ],
                    borderColor: [
                        'rgba(51, 102, 255, 1)',
                        'rgba(51, 102, 255, 1)',
                        'rgba(51, 102, 255, 1)'
                    ],
                    borderWidth: 1
                }, {
                    label: 'Résultat Net (K€)',
                    data: [-156, 124, 532],
                    type: 'line',
                    borderColor: 'rgba(255, 102, 51, 1)',
                    backgroundColor: 'rgba(0, 0, 0, 0)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(255, 102, 51, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + ' K€';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.raw + ' K€';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Funding Chart
    const fundingChart = document.getElementById('fundingChart');
    
    if (fundingChart) {
        new Chart(fundingChart, {
            type: 'doughnut',
            data: {
                labels: ['Développement initial', 'Couverture pertes Y1', 'Fonds de roulement'],
                datasets: [{
                    data: [120, 160, 20],
                    backgroundColor: [
                        'rgba(51, 102, 255, 0.8)',
                        'rgba(255, 102, 51, 0.8)',
                        'rgba(0, 204, 153, 0.8)'
                    ],
                    borderColor: [
                        'rgba(51, 102, 255, 1)',
                        'rgba(255, 102, 51, 1)',
                        'rgba(0, 204, 153, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.raw + ' K€ (' + 
                                    Math.round(context.raw / 300 * 100) + '%)';
                            }
                        }
                    }
                }
            }
        });
    }
}

// Smooth Scroll for Internal Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        // Close mobile menu if open
        if (navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});

// Form Submission
const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // In a real implementation, you would send the form data to a server
        // For now, we'll just show a success message
        const formData = new FormData(contactForm);
        let formValues = {};
        
        for (let [key, value] of formData.entries()) {
            formValues[key] = value;
        }
        
        alert('Merci pour votre message ! Nous vous contacterons prochainement.');
        contactForm.reset();
    });
}

// Three.js Sphere Animation
import * as THREE from 'https://unpkg.com/three@0.132.2/build/three.module.js';

let scene, camera, renderer, sphere;

function initSphere() {
    const container = document.querySelector('.sphere-container');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.querySelector('#sphereCanvas'),
        antialias: true,
        alpha: true 
    });
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Sphere geometry
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    
    // Custom shader material
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color1: { value: new THREE.Color(0x3366FF) }, // Primary blue
            color2: { value: new THREE.Color(0x1A46CC) }  // Darker blue
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color1;
            uniform vec3 color2;
            
            varying vec2 vUv;
            varying vec3 vNormal;
            
            void main() {
                float noise = sin(vUv.x * 10.0 + time) * sin(vUv.y * 10.0 + time) * 0.5;
                float fresnel = pow(1.0 + dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                vec3 color = mix(color1, color2, noise + fresnel);
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });

    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    camera.position.z = 2.5;

    // Add subtle ambient lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Animate
    function animate() {
        requestAnimationFrame(animate);

        sphere.rotation.x += 0.001;
        sphere.rotation.y += 0.002;

        material.uniforms.time.value += 0.01;

        renderer.render(scene, camera);
    }

    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
    });
}

// Initialize all
document.addEventListener('DOMContentLoaded', () => {
    initSphere();
    
    // Rest of the existing initialization code
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, {
        threshold: 0.1
    });
    
    document.querySelectorAll('.section-header, .metric-card, .fact-card, .feature-card, .category-item, .pricing-card').forEach(el => {
        observer.observe(el);
        el.classList.add('animate-on-scroll');
    });
});