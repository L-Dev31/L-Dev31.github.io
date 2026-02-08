import { init, setSpecialTokenApi, loadGameConfig, initToolbar } from './ui.js';
import { initShortcuts } from './shortcuts.js';
import { initFolder, closeFolder } from './folder.js';

function initThemeToggle() {
	const btn = document.getElementById('theme-toggle');
	if (!btn) return;
	const icon = btn.querySelector('i');
	const saved = localStorage.getItem('bmge-theme');
	if (saved) document.documentElement.setAttribute('data-theme', saved);
	const update = () => {
		const isLight = document.documentElement.getAttribute('data-theme') === 'light';
		icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
	};
	update();
	btn.addEventListener('click', () => {
		const isLight = document.documentElement.getAttribute('data-theme') === 'light';
		const next = isLight ? 'dark' : 'light';
		if (next === 'dark') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem('bmge-theme', next);
		update();
	});
}

async function setupGameConfigDropdown() {
	const select = document.getElementById('game-config-select');
	const icon = document.getElementById('game-config-icon');
	if (!select || !icon) return;

	let currentGameCss = null;

	function loadGameCss(gameName) {
		if (currentGameCss) { currentGameCss.remove(); currentGameCss = null; }
		if (!gameName) return;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `game/${gameName}/${gameName}.css`;
		link.onerror = () => link.remove();
		document.head.appendChild(link);
		currentGameCss = link;
	}

	function setGameBg(gameName) {
		const bgDiv = document.querySelector('.game-config-bg');
		if (!bgDiv) return;
		const tryBg = (ext) => fetch(`game/${gameName}/bg.${ext}`, { method: 'HEAD' })
			.then(r => r.ok ? `url('game/${gameName}/bg.${ext}')` : null);
		tryBg('png')
			.then(url => url || tryBg('jpg'))
			.then(url => bgDiv.style.setProperty('--game-bg-url', url || 'none'));
	}

	async function applyGameConfig(option) {
		const gameName = option.value;
		// Load icon
		try {
			const res = await fetch(`game/${gameName}/icon.png`, { method: 'HEAD' });
			if (res.ok) { icon.src = `game/${gameName}/icon.png`; icon.alt = option.textContent; icon.style.display = 'inline-block'; }
			else { icon.src = ''; icon.alt = ''; icon.style.display = 'none'; }
		} catch { icon.src = ''; icon.alt = ''; icon.style.display = 'none'; }
		loadGameCss(gameName);
		setGameBg(gameName);
		const gameConfig = await loadGameConfig(gameName);
		if (gameConfig?.getSpecialTokenInfo) setSpecialTokenApi(gameConfig.getSpecialTokenInfo);
	}

	select.addEventListener('change', () => applyGameConfig(select.options[select.selectedIndex]));
	await applyGameConfig(select.options[select.selectedIndex]);
}

document.addEventListener('DOMContentLoaded', () => {
	init();
	initToolbar();
	initShortcuts();
	initFolder();
	setupGameConfigDropdown();
	initThemeToggle();

	// Mobile sidebar overlay: tap to close
	const overlay = document.getElementById('folder-sidebar-overlay');
	if (overlay) overlay.addEventListener('click', closeFolder);
});