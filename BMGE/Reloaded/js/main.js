import './state.js';
import './utils.js';
import './bmg-format.js';
import './ui.js';
import './io.js';


import { init, setSpecialTokenApi, loadGameConfig } from './ui.js';

async function setupGameConfigDropdown() {
	const select = document.getElementById('game-config-select');
	const icon = document.getElementById('game-config-icon');
	if (!select || !icon) return;

	// Helper to load/unload game CSS
	let currentGameCss = null;
	function loadGameCss(gameName) {
		// Remove previous
		if (currentGameCss) {
			currentGameCss.remove();
			currentGameCss = null;
		}
		if (!gameName) return;
		const cssPath = `game/${gameName}/${gameName}.css`;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = cssPath;
		link.id = `game-css-${gameName}`;
		link.onload = () => {};
		link.onerror = () => { link.remove(); };
		document.head.appendChild(link);
		currentGameCss = link;
	}

	// Helper to set the loader background per game
	function setGameBg(gameName) {
		const bgDiv = document.querySelector('.game-config-bg');
		if (!bgDiv) return;
		// Try png first, fallback to jpg
		const bgPng = `game/${gameName}/bg.png`;
		const bgJpg = `game/${gameName}/bg.jpg`;
		// Try to check if png exists
		fetch(bgPng, { method: 'HEAD' }).then(res => {
			if (res.ok) {
				bgDiv.style.setProperty('--game-bg-url', `url('${bgPng}')`);
			} else {
				// fallback to jpg
				fetch(bgJpg, { method: 'HEAD' }).then(res2 => {
					if (res2.ok) {
						bgDiv.style.setProperty('--game-bg-url', `url('${bgJpg}')`);
					} else {
						bgDiv.style.setProperty('--game-bg-url', 'none');
					}
				});
			}
		});
	}

	select.addEventListener('change', async () => {
		const gameName = select.value;
		// Update icon based on selected option's data-icon
		const selectedOption = select.options[select.selectedIndex];
		const iconPath = selectedOption.getAttribute('data-icon');
		if (iconPath) {
			try {
				const res = await fetch(iconPath, { method: 'HEAD' });
				if (res.ok) {
					icon.src = iconPath;
					icon.alt = selectedOption.textContent;
				} else {
					throw new Error('Not found');
				}
			} catch (err) {
				// fallback to embedded svg
				icon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect fill='%23F4C542' rx='4' width='24' height='24'></rect><path fill='%23000' d='M7 7h2v2H7zM7 11h2v2H7zM17 7h-2v2h2zM17 11h-2v2h2z'/></svg>";
				icon.alt = selectedOption.textContent || 'Game';
			}
		}
		// Fallback if icon fails to load (prevent a 404 from breaking the UI)
		icon.onerror = () => {
			icon.onerror = null;
			icon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect fill='%23F4C542' rx='4' width='24' height='24'></rect><path fill='%23000' d='M7 7h2v2H7zM7 11h2v2H7zM17 7h-2v2h2zM17 11h-2v2h2z'/></svg>";
			icon.alt = selectedOption.textContent || 'Game';
		};
		// Load game CSS
		loadGameCss(gameName);
		// Set loader background per game
		setGameBg(gameName);
		const gameConfig = await loadGameConfig(gameName);
		if (gameConfig && gameConfig.getSpecialTokenInfo) {
			setSpecialTokenApi(gameConfig.getSpecialTokenInfo);
		}
	});

	// Load default on startup
	const selectedOption = select.options[select.selectedIndex];
	const iconPath = selectedOption.getAttribute('data-icon');
	if (iconPath) {
		try {
			const res = await fetch(iconPath, { method: 'HEAD' });
			if (res.ok) {
				icon.src = iconPath;
				icon.alt = selectedOption.textContent;
			} else {
				throw new Error('Not found');
			}
		} catch (err) {
			icon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect fill='%23F4C542' rx='4' width='24' height='24'></rect><path fill='%23000' d='M7 7h2v2H7zM7 11h2v2H7zM17 7h-2v2h2zM17 11h-2v2h2z'/></svg>";
			icon.alt = selectedOption.textContent || 'Game';
		}
	}
	icon.onerror = () => {
		icon.onerror = null;
		icon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect fill='%23F4C542' rx='4' width='24' height='24'></rect><path fill='%23000' d='M7 7h2v2H7zM7 11h2v2H7zM17 7h-2v2h2zM17 11h-2v2h2z'/></svg>";
		icon.alt = selectedOption.textContent || 'Game';
	};
	// Load game CSS for default
	loadGameCss(select.value);
	setGameBg(select.value);
	const gameName = select.value;
	const gameConfig = await loadGameConfig(gameName);
	if (gameConfig && gameConfig.getSpecialTokenInfo) {
		setSpecialTokenApi(gameConfig.getSpecialTokenInfo);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	init();
	setupGameConfigDropdown();
});
