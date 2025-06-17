class TeamManager {
	constructor(maxMembers = null) {
		this.teamData = null;
		this.maxMembers = maxMembers;
		this.init();
	}

	async init() {
		try {
			await this.loadTeam();
			this.renderTeam();
		} catch (error) {}
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
	renderTeam() {
		const teamContainer = document.querySelector('.sandfall-team-grid');
		if (!teamContainer || !this.teamData) return;
		let teamMembers = this.teamData.team;
		
		// Filter by priority if on index page
		const isIndexPage = !window.location.pathname.includes('blog.html') && !window.location.pathname.includes('team.html');
		if (isIndexPage) {
			teamMembers = teamMembers.filter(member => member.priority === true);
		}
		
		if (this.maxMembers) teamMembers = teamMembers.slice(0, this.maxMembers);		const teamHTML = teamMembers.map(member => `
			<div class="team-member" data-member-id="${member.id}">
				<img src="${member.image}" alt="${member.name}" class="team-member-photo" 
					 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iODAiIHI9IjMwIiBmaWxsPSIjRTNCQjcwIi8+PHJlY3QgeD0iNzAiIHk9IjEzMCIgd2lkdGg9IjYwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRTNCQjcwIi8+PC9zdmc+'" 
					 loading="lazy" />
				<h3 class="team-member-name">${member.name}</h3>
				<div class="team-member-role">${member.role}</div>
				${member.bio ? `<p class="team-member-bio">${member.bio}</p>` : ''}
				${member.links ? `<div class="team-member-links"><a href="#" target="_blank" class="team-link">${member.links}</a></div>` : ''}
				${member.favorites ? `<div class="team-member-favorites">${member.favorites}</div>` : '<div class="team-member-favorites"></div>'}
			</div>
		`).join('');
		teamContainer.innerHTML = teamHTML;
	}
	static initForPage() {
		const isIndexPage = !window.location.pathname.includes('blog.html') && !window.location.pathname.includes('team.html');
		const maxMembers = isIndexPage ? 6 : null;
		return new TeamManager(maxMembers);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	if (document.querySelector('.sandfall-team-grid')) {
		TeamManager.initForPage();
	}
});
