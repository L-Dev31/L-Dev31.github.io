document.addEventListener('DOMContentLoaded', function () {
	function updateExpedition33Elements() {
		const section = document.querySelector('.expedition33-section');
		const nextSection = document.querySelector('.sandfall-team-section');
		const overlay = document.querySelector('.expedition33-overlay');
		const logoSticky = document.getElementById('exp33-logo-sticky');
		const logoNormal = document.querySelector('.expedition33-logo-normal');
		if (!section || !overlay || !logoSticky || !logoNormal || !nextSection) return;
		const isMobile = window.innerWidth <= 768;
		if (isMobile) {
			logoSticky.classList.remove('visible');
			logoNormal.style.visibility = 'visible';
			overlay.classList.remove('fixed');
			overlay.style.position = 'absolute';
			logoSticky.style.position = 'absolute';
			return;
		}
		const rect = section.getBoundingClientRect();
		const nextRect = nextSection.getBoundingClientRect();
		if (rect.top <= 0 && rect.bottom > 0) {
			logoSticky.classList.add('visible');
			logoNormal.style.visibility = 'hidden';
		} else {
			logoSticky.classList.remove('visible');
			logoNormal.style.visibility = 'visible';
		}
		const isNextSectionVisible = nextRect.top < window.innerHeight;
		if (rect.top <= 0 && rect.bottom > 0 && !isNextSectionVisible) {
			overlay.classList.add('fixed');
			overlay.style.position = 'fixed';
			overlay.style.top = '0';
			overlay.style.bottom = 'auto';
			logoSticky.style.position = 'fixed';
			logoSticky.style.top = '80px';
			logoSticky.style.bottom = 'auto';
		} else {
			overlay.classList.remove('fixed');
			overlay.style.position = 'absolute';
			logoSticky.style.position = 'absolute';
			if (rect.top > 0) {
				overlay.style.top = '0';
				overlay.style.bottom = 'auto';
				logoSticky.style.top = '80px';
				logoSticky.style.bottom = 'auto';
			} else {
				overlay.style.top = 'auto';
				overlay.style.bottom = '0';
				const sectionHeight = section.offsetHeight;
				const logoPosition = Math.max(80, sectionHeight - window.innerHeight + 80);
				logoSticky.style.top = logoPosition + 'px';
				logoSticky.style.bottom = 'auto';
			}
		}
	}
	window.addEventListener('scroll', updateExpedition33Elements);
	window.addEventListener('resize', updateExpedition33Elements);
	updateExpedition33Elements();

	function handleExp33GameFadeIn() {
		const section = document.querySelector('.expedition33-game-inner');
		if (!section) return;
		const rect = section.getBoundingClientRect();
		const windowH = window.innerHeight || document.documentElement.clientHeight;
		if (rect.top < windowH - 80) {
			section.classList.add('visible');
		} else {
			section.classList.remove('visible');
		}
	}
	window.addEventListener('scroll', handleExp33GameFadeIn);
	window.addEventListener('resize', handleExp33GameFadeIn);
	handleExp33GameFadeIn();

	function handleExp33TrailerFadeIn() {
		const trailer = document.querySelector('.expedition33-trailer-container');
		if (!trailer) return;
		const rect = trailer.getBoundingClientRect();
		const windowH = window.innerHeight || document.documentElement.clientHeight;
		if (rect.top < windowH - 80) {
			trailer.classList.add('visible');
		} else {
			trailer.classList.remove('visible');
		}
	}
	window.addEventListener('scroll', handleExp33TrailerFadeIn);
	window.addEventListener('resize', handleExp33TrailerFadeIn);
	handleExp33TrailerFadeIn();

	function updateExpedition33PetalParallax() {
		const section = document.querySelector('.expedition33-section');
		if (!section) return;
		const scrollY = window.scrollY || window.pageYOffset;
		const isMobile = window.innerWidth <= 768;
		const parallaxSpeed = isMobile ? 0.25 : 0.5;
		const parallaxY = (scrollY - section.offsetTop) * parallaxSpeed;
		section.style.setProperty('--petal-parallax', `${parallaxY}px`);
	}
	window.addEventListener('scroll', updateExpedition33PetalParallax);
	window.addEventListener('resize', updateExpedition33PetalParallax);
	updateExpedition33PetalParallax();
});
