document.addEventListener('DOMContentLoaded', () => {
	const discoverBtn = document.querySelector('.team-discover-btn');
	if (discoverBtn) {
		discoverBtn.addEventListener('click', () => {
			window.location.href = 'team.html';
		});
	}
});