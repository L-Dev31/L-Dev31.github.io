document.addEventListener('DOMContentLoaded', function () {
	function updateAboutImagesOnScroll() {
		const aboutSection = document.querySelector('.about-section');
		const img1 = document.querySelector('.about-img.first');
		const img2 = document.querySelector('.about-img.second');
		if (!aboutSection || !img1 || !img2) return;
		const rect = aboutSection.getBoundingClientRect();
		const windowH = window.innerHeight || document.documentElement.clientHeight;
		let progress = 0;
		if (rect.top < windowH && rect.bottom > 0) {
			progress = 1 - Math.min(1, Math.max(0, rect.top / windowH));
		}
		const start1 = 30, end1 = 42, start2 = 72, end2 = 58;
		const startRy1 = -14, endRy1 = -2, startRz1 = -10, endRz1 = 7;
		const startRy2 = 16, endRy2 = 6, startRz2 = 10, endRz2 = -8;
		function lerp(a, b, t) { return a + (b - a) * t; }
		img1.style.top = `calc(${lerp(start1, end1, progress)}% )`;
		img2.style.top = `calc(${lerp(start2, end2, progress)}% )`;
		img1.style.setProperty('--ry', `${lerp(startRy1, endRy1, progress)}deg`);
		img1.style.setProperty('--rz', `${lerp(startRz1, endRz1, progress)}deg`);
		img2.style.setProperty('--ry', `${lerp(startRy2, endRy2, progress)}deg`);
		img2.style.setProperty('--rz', `${lerp(startRz2, endRz2, progress)}deg`);
		img1.style.boxShadow = '0 64px 256px 0 rgba(33,33,33,0.32), 0 16px 64px 0 rgba(33,33,33,0.28)';
		img2.style.boxShadow = '0 64px 256px 0 rgba(33,33,33,0.32), 0 16px 64px 0 rgba(33,33,33,0.28)';
	}
	window.addEventListener('scroll', updateAboutImagesOnScroll);
	window.addEventListener('resize', updateAboutImagesOnScroll);
	updateAboutImagesOnScroll();
});
