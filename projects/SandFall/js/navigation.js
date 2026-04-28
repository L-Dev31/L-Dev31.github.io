class NavigationManager {
	constructor() {
		this.navigationData = null;
		this.currentPage = this.getCurrentPage();
		this.init();
	}

	async init() {
		try {
			await this.loadNavigation();
			this.renderNavigation();
		} catch (error) {}
	}

	async loadNavigation() {
		try {
			const response = await fetch('data/navigation.json');
			if (!response.ok) throw new Error('Failed to load navigation');
			this.navigationData = await response.json();
		} catch (error) {
			throw error;
		}
	}
	getCurrentPage() {
		const path = window.location.pathname;
		if (path.includes('blog.html')) return 'blog';
		if (path.includes('team.html')) return 'team';
		return 'index';
	}

	renderNavigation() {
		this.renderDesktopNavigation();
		this.renderMobileNavigation();
		this.renderSocialIcons();
	}

	renderDesktopNavigation() {
		const navElement = document.querySelector('nav ul');
		if (!navElement || !this.navigationData) return;
		const navItems = this.navigationData.navigation.map(item => {
			const href = this.getHref(item);
			const isActive = this.isActiveLink(item);
			const icon = item.external ? ' <i class="fas fa-external-link-alt"></i>' : '';
			return `<li><a href="${href}" class="navbar-link${isActive ? ' active' : ''}">${item.label}${icon}</a></li>`;
		}).join('');
		navElement.innerHTML = navItems;
	}

	renderMobileNavigation() {
		const mobileNavElement = document.querySelector('.mobile-nav ul');
		if (!mobileNavElement || !this.navigationData) return;
		const mobileNavItems = this.navigationData.navigation.map(item => {
			const href = this.getHref(item);
			const icon = item.external ? ' <i class="fas fa-external-link-alt"></i>' : '';
			return `<li><a href="${href}">${item.label}${icon}</a></li>`;
		}).join('');
		mobileNavElement.innerHTML = mobileNavItems;
	}

	renderSocialIcons() {
		const socialContainers = [
			document.querySelector('.social-icons'),
			document.querySelector('.mobile-social-icons')
		];
		if (!this.navigationData) return;
		const socialHTML = this.navigationData.social.map(social => 
			`<a href="${social.url}" title="${social.name}"><i class="${social.icon}"></i></a>`
		).join('');
		socialContainers.forEach(container => {
			if (container) container.innerHTML = socialHTML;
		});
	}
	getHref(item) {
		if (item.external) {
			return this.currentPage === 'blog' && !item.href.startsWith('http') 
				? item.href 
				: item.href;
		} else {
			if (this.currentPage === 'blog') {
				return `index.html${item.href}`;
			} else if (this.currentPage === 'team') {
				return `index.html${item.href}`;
			} else {
				return item.href;
			}
		}
	}

	isActiveLink(item) {
		if (this.currentPage === 'blog' && item.id === 'blog') return true;
		if (this.currentPage === 'index' && item.id !== 'blog') return false;
		return false;
	}
}

document.addEventListener('DOMContentLoaded', () => {
	new NavigationManager();
});
