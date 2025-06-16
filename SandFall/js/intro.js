if (document.referrer && document.referrer.includes('blog.html')) {
	// Ne pas rejouer l'intro si on vient de blog.html
} else if (!sessionStorage.getItem('introPlayed')) {
	window.scrollTo(0, 0);
	document.documentElement.scrollTop = 0;
	document.body.scrollTop = 0;
	document.addEventListener('DOMContentLoaded', function () {
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		document.body.classList.add('intro-active');
		document.documentElement.classList.add('intro-active');
		const overlay = document.createElement('div');
		overlay.id = 'intro-overlay';
		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		icon.setAttribute('viewBox', '0 0 1561.6 2000');
		icon.setAttribute('class', 'intro-svg-icon');
		icon.innerHTML = `<g><g><path style="fill:transparent;stroke:#E3BB70;stroke-width:6;stroke-miterlimit:10;" d="M316.3,1999c-108,0-208.7,0-316.3,0C211.1,1330.1,420.8,666.1,631.1-0.2c99.1,0,196.3,0,298.5,0 c210,664.6,420.4,1330.3,631.9,1999.7c-107.2,0-209.7,0-316.5,0C1091.6,1490.9,937.9,981.7,784.3,472.4c-2.7,0.4-5.6,0.9-8.3,1.4 C622.9,981.9,469.7,1489.9,316.3,1999z"/><path style="fill:transparent;stroke:#E3BB70;stroke-width:6;stroke-miterlimit:10;" d="M785.1,886.8c106.7,369.6,213.5,739.4,321.4,1113c-64.5,0-121.7,0-186.7,0 c-44.9-183.2-90.2-368.5-135.6-553.8c-2.5,0.2-5.1,0.4-7.7,0.6c-44.5,182.7-89.1,365.3-134.5,551.6c-60.5,0-120.7,0-187.1,0 c107.2-371.2,213.8-739.9,320.4-1108.6C778.5,888.8,781.7,887.9,785.1,886.8z"/></g></g>`;
		const logo = document.createElement('img');
		logo.src = 'images/svg/logo.svg';
		logo.alt = 'Sandfall Logo';
		logo.className = 'intro-logo';
		logo.onload = function () {};
		logo.onerror = function () {};
		const content = document.createElement('div');
		content.className = 'intro-content';
		content.appendChild(logo);
		const gradientOverlay = document.createElement('div');
		gradientOverlay.id = 'gradient-overlay';
		overlay.appendChild(icon);
		overlay.appendChild(content);
		overlay.appendChild(gradientOverlay);
		document.body.appendChild(overlay);
		const preventScroll = function (e) {
			e.preventDefault();
			window.scrollTo(0, 0);
		};
		window.addEventListener('scroll', preventScroll, { passive: false });
		window.addEventListener('wheel', preventScroll, { passive: false });
		window.addEventListener('touchmove', preventScroll, { passive: false });
		setTimeout(() => {
			icon.style.opacity = '1';
			setTimeout(() => {
				logo.style.opacity = '1';
				logo.style.transform = 'scale(1) translateY(0)';
			}, 800);
		}, 600);
		setTimeout(() => {
			overlay.style.opacity = '0';
			setTimeout(() => {
				logo.style.opacity = '0';
				icon.style.opacity = '0';
				setTimeout(() => {
					document.body.classList.remove('intro-active');
					document.documentElement.classList.remove('intro-active');
					window.removeEventListener('scroll', preventScroll);
					window.removeEventListener('wheel', preventScroll);
					window.removeEventListener('touchmove', preventScroll);
					overlay.remove();
					window.scrollTo(0, 0);
				}, 1800);
			}, 1000);
		}, 5000);
		sessionStorage.setItem('introPlayed', '1');
	});
}
