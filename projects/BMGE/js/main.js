import { init, setSpecialTokenApi, loadGameConfig, initToolbar } from './ui.js';
import { initShortcuts } from './shortcuts.js';
import { initFolder, closeFolder } from './folder.js';

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
		document.querySelector('.game-config-bg').style.setProperty('--game-bg-url', `url('game/${gameName}/bg.png')`);
	}

	async function applyGameConfig(option) {
		const gameName = option.value;
		icon.onerror = () => { icon.style.display = 'none'; };
		icon.src = `game/${gameName}/icon.png`;
		icon.alt = option.textContent;
		icon.style.display = 'inline-block';
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

	// Mobile sidebar overlay: tap to close
	const overlay = document.getElementById('folder-sidebar-overlay');
	if (overlay) overlay.addEventListener('click', closeFolder);
});