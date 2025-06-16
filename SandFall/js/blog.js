class BlogManager {
	constructor() {
		this.posts = [];
		this.filteredPosts = [];
		this.currentPage = 1;
		this.postsPerPage = 6;
		this.currentSearch = '';
		this.currentSort = 'newest';
		this.likes = JSON.parse(localStorage.getItem('blogLikes') || '{}');
		this.init();
	}

	async init() {
		try {
			await this.loadPosts();
			this.setupEventListeners();
			this.addScrollAnimations();
		} catch (error) {
			this.showError();
		}
	}

	async loadPosts() {
		try {
			const response = await fetch('data/blog-posts.json');
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const data = await response.json();
			this.posts = data.posts || [];
			this.filteredPosts = [...this.posts];
			this.applyFiltersAndSort();
		} catch (error) {
			this.showError();
			throw error;
		}
	}

	setupEventListeners() {
		const searchInput = document.getElementById('search-input');
		const searchBtn = document.getElementById('search-btn');
		const sortSelect = document.getElementById('sort-select');

		if (searchInput) {
			searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
			searchInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') this.handleSearch(e.target.value);
			});
		}

		if (searchBtn) {
			searchBtn.addEventListener('click', () => {
				const searchValue = searchInput ? searchInput.value : '';
				this.handleSearch(searchValue);
			});
		}

		if (sortSelect) {
			sortSelect.addEventListener('change', (e) => {
				this.currentSort = e.target.value;
				this.applyFiltersAndSort();
			});
		}

		const prevBtn = document.getElementById('prev-btn');
		const nextBtn = document.getElementById('next-btn');

		if (prevBtn) {
			prevBtn.addEventListener('click', () => {
				if (this.currentPage > 1) {
					this.currentPage--;
					this.renderPosts();
					this.updatePagination();
					this.scrollToTop();
				}
			});
		}

		if (nextBtn) {
			nextBtn.addEventListener('click', () => {
				const totalPages = Math.ceil(this.filteredPosts.length / this.postsPerPage);
				if (this.currentPage < totalPages) {
					this.currentPage++;
					this.renderPosts();
					this.updatePagination();
					this.scrollToTop();
				}
			});
		}

		const modalOverlay = document.querySelector('.modal-overlay');
		const modalClose = document.querySelector('.modal-close');

		if (modalOverlay) modalOverlay.addEventListener('click', () => this.closeModal());
		if (modalClose) modalClose.addEventListener('click', () => this.closeModal());

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') this.closeModal();
		});
	}

	handleSearch(searchTerm) {
		this.currentSearch = searchTerm.toLowerCase().trim();
		this.currentPage = 1;
		this.applyFiltersAndSort();
	}

	clearSearch() {
		this.currentSearch = '';
		this.currentPage = 1;
		this.applyFiltersAndSort();
	}

	applyFiltersAndSort() {
		if (this.currentSearch === '') {
			this.filteredPosts = [...this.posts];
		} else {
			this.filteredPosts = this.posts.filter(post => {
				return post.title.toLowerCase().includes(this.currentSearch) ||
					post.excerpt.toLowerCase().includes(this.currentSearch) ||
					post.author.toLowerCase().includes(this.currentSearch);
			});
		}

		this.filteredPosts.sort((a, b) => {
			const dateA = new Date(a.date);
			const dateB = new Date(b.date);
			if (this.currentSort === 'newest') {
				return dateB - dateA;
			} else {
				return dateA - dateB;
			}
		});

		this.renderPosts();
		this.updatePagination();
		this.updateSearchUI();
	}

	updateSearchUI() {}

	renderPosts() {
		const container = document.getElementById('blog-posts');
		if (!container) return;
		if (this.filteredPosts.length === 0) {
			container.innerHTML = '<div class="no-posts">No articles found.</div>';
			return;
		}

		const startIndex = (this.currentPage - 1) * this.postsPerPage;
		const endIndex = startIndex + this.postsPerPage;
		const postsToShow = this.filteredPosts.slice(startIndex, endIndex);

		container.innerHTML = postsToShow.map((post) => {
			const isLiked = this.likes[post.id] || false;
			const likeCount = post.likes + (isLiked ? 1 : 0);
			return `
				<article class="blog-post" data-post-id="${post.id}" data-aos>
					<img src="${post.image}" alt="${post.title}" class="post-image" loading="lazy" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iI0UzQkI3MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vbiBkaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg=='">
					<div class="post-content">
						<div class="post-header">
							<span class="post-date">${this.formatDate(post.date)}</span>
							<span class="post-read-time">${post.readTime} read</span>
						</div>
						<h3 class="post-title">${post.title}</h3>
						<p class="post-excerpt">${post.excerpt}</p>
						<div class="post-footer">
							<div class="post-footer-stats">
								<span>${post.views} views</span>
							</div>
							<div class="post-actions">
								<button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
									<span class="heart">${isLiked ? '❤️' : '🤍'}</span>
									<span class="like-count">${likeCount}</span>
								</button>
							</div>
						</div>
					</div>
				</article>
			`;
		}).join('');
		this.attachPostListeners();
		this.addScrollAnimations();
	}

	attachPostListeners() {
		document.querySelectorAll('.blog-post').forEach(post => {
			post.addEventListener('click', (e) => {
				if (!e.target.closest('.like-btn')) {
					const postId = parseInt(post.getAttribute('data-post-id'));
					this.openModal(postId);
				}
			});
		});

		document.querySelectorAll('.like-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const postId = parseInt(btn.getAttribute('data-post-id'));
				this.toggleLike(postId, btn);
			});
		});
	}

	toggleLike(postId, button) {
		const isLiked = this.likes[postId] || false;
		this.likes[postId] = !isLiked;
		localStorage.setItem('blogLikes', JSON.stringify(this.likes));

		const heart = button.querySelector('.heart');
		const likeCount = button.querySelector('.like-count');
		const post = this.posts.find(p => p.id === postId);

		if (this.likes[postId]) {
			button.classList.add('liked');
			heart.textContent = '❤️';
			likeCount.textContent = post.likes + 1;
			this.animateHeart(heart);
		} else {
			button.classList.remove('liked');
			heart.textContent = '🤍';
			likeCount.textContent = post.likes;
		}
	}

	animateHeart(heart) {
		heart.style.transform = 'scale(1.4)';
		setTimeout(() => {
			heart.style.transform = 'scale(1)';
		}, 200);
	}

	openModal(postId) {
		const post = this.posts.find(p => p.id === postId);
		if (!post) return;

		const postElement = document.querySelector(`[data-post-id="${postId}"]`);
		if (postElement) postElement.classList.add('active-post');

		const modal = document.getElementById('post-modal');
		const modalBody = document.getElementById('modal-body');

		const isLiked = this.likes[post.id] || false;
		const likeCount = post.likes + (isLiked ? 1 : 0);
		modalBody.innerHTML = `
			<h2 class="modal-post-title">${post.title}</h2>
			<div class="modal-post-meta">
				<div class="author-info">
					<img src="${post.authorImage}" alt="${post.author}" class="author-avatar" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0UzQkI3MCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiMwMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4/PC90ZXh0Pjwvc3ZnPg=='">
					<span class="author-name">${post.author}</span>
				</div>
				<span>${this.formatDate(post.date)}</span>
				<span>${post.readTime} read</span>
			</div>
			<img src="${post.image}" alt="${post.title}" class="modal-post-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI0UzQkI3MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vbiBkaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg=='">
			<div class="modal-post-actions">
				<div class="modal-post-views">
					<span>${post.views} views</span>
				</div>
				<button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
					<span class="heart">${isLiked ? '❤️' : '🤍'}</span>
					<span class="like-count">${likeCount}</span>
				</button>
			</div>
			<div class="modal-post-content">
				${post.content.split('\n').map(paragraph => paragraph.trim() ? `<p>${paragraph}</p>` : '').join('')}
			</div>
		`;
		modal.classList.add('active');
		document.body.classList.add('modal-open');

		const likeBtn = modalBody.querySelector('.like-btn');
		if (likeBtn) {
			likeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleLike(post.id, likeBtn);
			});
		}

		post.views++;
		this.updatePostViews(post.id);
	}

	closeModal() {
		const modal = document.getElementById('post-modal');
		if (modal) {
			modal.classList.remove('active');
			document.body.classList.remove('modal-open');
		}

		document.querySelectorAll('.blog-post.active-post').forEach(post => {
			post.classList.remove('active-post');
		});
	}

	updatePostViews(postId) {
		const postElements = document.querySelectorAll(`[data-post-id="${postId}"] .post-stats span:first-child`);
		const post = this.posts.find(p => p.id === postId);
		postElements.forEach(element => {
			element.textContent = `${post.views} vues`;
		});
	}

	updatePagination() {
		const totalPages = Math.ceil(this.filteredPosts.length / this.postsPerPage);
		const prevBtn = document.getElementById('prev-btn');
		const nextBtn = document.getElementById('next-btn');
		const pageInfo = document.getElementById('page-info');

		if (prevBtn) prevBtn.disabled = this.currentPage === 1;
		if (nextBtn) nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;
		if (pageInfo) {
			if (totalPages === 0) {
				pageInfo.textContent = 'No pages';
			} else {
				pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
			}
		}
	}

	formatDate(dateString) {
		const options = { year: 'numeric', month: 'long', day: 'numeric' };
		return new Date(dateString).toLocaleDateString('fr-FR', options);
	}

	scrollToTop() {
		const blogHeader = document.querySelector('.blog-header');
		if (blogHeader) {
			blogHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	addScrollAnimations() {
		const observerOptions = { threshold: 0.2, rootMargin: '0px 0px -100px 0px' };
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add('aos-animate');
					observer.unobserve(entry.target);
				}
			});
		}, observerOptions);
		document.querySelectorAll('.blog-post[data-aos]').forEach(element => {
			observer.observe(element);
		});
	}

	showError() {
		const container = document.getElementById('blog-posts');
		if (container) {
			container.innerHTML = `
				<div class="no-posts">
					<p>Error loading articles.</p>
					<button onclick="location.reload()" style="margin-top: 20px; padding: 15px 30px; background: transparent; border: 2px solid #E3BB70; color: #E3BB70; cursor: pointer; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
						Retry
					</button>
				</div>
			`;
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	new BlogManager();
});

window.addEventListener('scroll', () => {
	const navbar = document.querySelector('.navbar');
	if (navbar) {
		if (window.scrollY > 100) {
			navbar.style.background = 'rgba(0, 0, 0, 0.95)';
			navbar.style.backdropFilter = 'blur(20px)';
		} else {
			navbar.style.background = 'rgba(0, 0, 0, 0.8)';
			navbar.style.backdropFilter = 'blur(10px)';
		}
	}
});
