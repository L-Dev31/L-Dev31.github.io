class TeamPageManager {
	constructor() {
		this.teamData = null;
		this.init();
	}

	async init() {
		try {
			await this.loadTeam();
			this.renderTeamByCategories();
		} catch (error) {
			console.error('Error loading team:', error);
		}
	}

	async loadTeam() {
		try {
			const response = await fetch('data/team.json');
			if (!response.ok) throw new Error('Failed to load team data');
			this.teamData = await response.json();
		} catch (error) {
			throw error;
		}
	}

	renderTeamByCategories() {
		const teamContainer = document.getElementById('team-page-content');
		if (!teamContainer || !this.teamData) return;

		// Group team members by role category
		const teamByCategory = {};
		this.teamData.team.forEach(member => {
			const category = member.roleCategory;
			if (!teamByCategory[category]) {
				teamByCategory[category] = [];
			}
			teamByCategory[category].push(member);
		});

		// Define the order of categories
		const categoryOrder = [
			'DESIGN',
			'TECH & PROG',
			'ART & ENVIRO',
			'CHARA ART, VFX & CINEMATICS',
			'AUDIO',
			'PRODUCTION & OPERATIONS',
			'WEBSITE'
		];

		let teamHTML = '';

		categoryOrder.forEach(category => {
			if (teamByCategory[category]) {
				teamHTML += `
					<div class="team-category-section">
						<h2 class="team-category-title">${category}</h2>
						<div class="team-category-grid">
				`;				teamByCategory[category].forEach(member => {
					teamHTML += `
						<div class="team-member">
							<img src="${member.image}" alt="${member.name}" class="team-member-photo" 
								 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iODAiIHI9IjMwIiBmaWxsPSIjRTNCQjcwIi8+PHJlY3QgeD0iNzAiIHk9IjEzMCIgd2lkdGg9IjYwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRTNCQjcwIi8+PC9zdmc+'" 
								 loading="lazy" />
							<h3 class="team-member-name">${member.name}</h3>
							<div class="team-member-role">${member.role}</div>
							${member.favorites ? `<div class="team-member-favorites">${member.favorites}</div>` : '<div class="team-member-favorites"></div>'}
							${member.links ? `<div class="team-member-links"><a href="#" target="_blank" class="team-link">${member.links}</a></div>` : ''}
						</div>
					`;
				});

				teamHTML += `
						</div>
					</div>
				`;
			}
		});

		teamContainer.innerHTML = teamHTML;
	}
}

document.addEventListener('DOMContentLoaded', () => {
	new TeamPageManager();
});
