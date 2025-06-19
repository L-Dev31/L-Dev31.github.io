class SupportersManager {
	constructor() {
		this.supportersContainer = document.querySelector('.supporters-slider');
		if (!this.supportersContainer) return;

		this.track = null;
		this.isDragging = false;
		this.startX = 0;
		this.startPos = 0;
		this.currentPos = 0;
		this.animationId = null;
		this.speed = 0.5
		this.supportersWidth = 0;
		this.originalCount = 0;

		this.init();
	}

	async init() {
		try {
			await this.loadAndRenderSupporters();
			setTimeout(() => {
				this.calculateWidths();
				this.setupInteractions();
				this.startAnimation();
			}, 100);
		} catch (error) {
			console.error('Error loading supporters:', error);
		}
	}

	async loadAndRenderSupporters() {
		const response = await fetch('data/supporters.json');
		if (!response.ok) throw new Error('Failed to load supporters data');
		const data = await response.json();

		this.track = document.createElement('div');
		this.track.className = 'supporters-track';

		const originalSupporters = data.supporters;
		this.originalCount = originalSupporters.length;
		// Duplique 4x pour un loop parfait
		const duplicatedSupporters = [
			...originalSupporters,
			...originalSupporters,
			...originalSupporters,
			...originalSupporters
		];

		this.track.innerHTML = duplicatedSupporters.map(supporter => `
			<img src="images/supporters/${supporter.id}.png" 
				 alt="${supporter.name}" class="supporter-img" title="${supporter.name}"
				 loading="lazy" draggable="false" />
		`).join('');

		this.supportersContainer.innerHTML = '';
		this.supportersContainer.appendChild(this.track);
	}

	calculateWidths() {
		let totalWidth = 0;
		if (this.track.children.length > 0) {
			const gap = parseInt(window.getComputedStyle(this.track).gap) || 60;
			for(let i = 0; i < this.originalCount; i++) {
				const child = this.track.children[i];
				if (child) {
					totalWidth += child.offsetWidth + gap;
				}
			}
		}
		this.supportersWidth = totalWidth;
        if (this.supportersWidth === 0) {
            setTimeout(() => this.calculateWidths(), 500);
        }
	}

	startAnimation() {
		this.stopAnimation();
		this.animationId = requestAnimationFrame(this.animate.bind(this));
	}
	animate() {
		if (!this.isDragging) {
			this.currentPos -= this.speed;
			if (Math.abs(this.currentPos) >= this.supportersWidth * 2) {
				this.currentPos += this.supportersWidth * 2;
			}
			this.track.style.transform = `translateX(${this.currentPos}px)`;
			this.animationId = requestAnimationFrame(this.animate.bind(this));
		}
	}

	stopAnimation() {
		if (this.animationId) cancelAnimationFrame(this.animationId);
	}

	setupInteractions() {
		// Mouse events
		this.track.addEventListener('mousedown', e => this.onStart(e));
		document.addEventListener('mousemove', e => this.onMove(e));
		document.addEventListener('mouseup', () => this.onEnd());
		// Touch events
		this.track.addEventListener('touchstart', e => this.onStart(e), { passive: false });
		document.addEventListener('touchmove', e => this.onMove(e), { passive: false });
		document.addEventListener('touchend', () => this.onEnd());
		// Prevent context menu on long press
		this.track.addEventListener('contextmenu', e => e.preventDefault());
	}

	onStart(event) {
		this.isDragging = true;
		this.stopAnimation();
		this.startX = this.getPositionX(event);
		this.startPos = this.currentPos;
		this.track.style.cursor = 'grabbing';
		event.preventDefault();
	}

	onMove(event) {
		if (!this.isDragging) return;
		event.preventDefault();
		const currentX = this.getPositionX(event);
		const diff = currentX - this.startX;
		this.currentPos = this.startPos + diff;
		// Boucle fluide : repositionne si on sort du double loop
		if (this.currentPos <= -this.supportersWidth * 2) {
			this.currentPos += this.supportersWidth * 2;
		}
		if (this.currentPos > 0) {
			this.currentPos -= this.supportersWidth * 2;
		}
		this.track.style.transform = `translateX(${this.currentPos}px)`;
	}

	onEnd() {
		if (!this.isDragging) return;
		this.isDragging = false;
		this.track.style.cursor = 'grab';
		// Snap dans la boucle
		if (this.currentPos <= -this.supportersWidth * 2) {
			this.currentPos += this.supportersWidth * 2;
		}
		if (this.currentPos > 0) {
			this.currentPos -= this.supportersWidth * 2;
		}
		this.startAnimation();
	}

	getPositionX(event) {
		return event.touches ? event.touches[0].clientX : event.clientX;
	}
}

document.addEventListener('DOMContentLoaded', () => {
	if (document.querySelector('.supporters-slider')) {
		new SupportersManager();
	}
});
