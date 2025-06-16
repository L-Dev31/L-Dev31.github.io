document.addEventListener('DOMContentLoaded', function () {
	const navLinks = document.querySelectorAll('a[href^="#"]');
	navLinks.forEach(link => {
		link.addEventListener('click', function (e) {
			const targetId = this.getAttribute('href');
			const targetSection = document.querySelector(targetId);
			if (targetSection) {
				e.preventDefault();
				if (window.location.hash !== targetId) {
					history.pushState(null, '', targetId);
				}
				setTimeout(() => {
					targetSection.scrollIntoView({ behavior: 'smooth' });
				}, 10);
			}
		});
	});
});
