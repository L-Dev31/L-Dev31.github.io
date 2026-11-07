document.addEventListener('DOMContentLoaded', function () {
	const hamburger = document.querySelector('.mobile-menu-toggle');
	const overlay = document.querySelector('.mobile-menu-overlay');
	const body = document.body;
	const mobileNavLinks = document.querySelectorAll('.mobile-nav a');
	if (!hamburger || !overlay) return;
	
	hamburger.addEventListener('click', function () {
		hamburger.classList.toggle('active');
		overlay.classList.toggle('active');
		body.classList.toggle('mobile-menu-open');
	});
	mobileNavLinks.forEach(link => {
		link.addEventListener('click', function () {
			hamburger.classList.remove('active');
			overlay.classList.remove('active');
			body.classList.remove('mobile-menu-open');
		});
	});
	overlay.addEventListener('click', function (e) {
		if (e.target === overlay) {
			hamburger.classList.remove('active');
			overlay.classList.remove('active');
			body.classList.remove('mobile-menu-open');
		}
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && overlay.classList.contains('active')) {
			hamburger.classList.remove('active');
			overlay.classList.remove('active');
			body.classList.remove('mobile-menu-open');
		}
	});
	window.addEventListener('resize', function () {
		if (window.innerWidth > 768) {
			hamburger.classList.remove('active');
			overlay.classList.remove('active');
			body.classList.remove('mobile-menu-open');
		}
	});
	// Close mobile menu when any link inside the mobile-nav is clicked (delegation)
	const mobileNavContainer = document.querySelector('.mobile-nav');
	if (mobileNavContainer) {
		mobileNavContainer.addEventListener('click', function (e) {
			const link = e.target.closest('a');
			if (link) {
				hamburger.classList.remove('active');
				overlay.classList.remove('active');
				body.classList.remove('mobile-menu-open');
			}
		});
	}
});
