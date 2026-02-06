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

	let currentGameCss = null;
	function loadGameCss(gameName) {
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

	function setGameBg(gameName) {
		const bgDiv = document.querySelector('.game-config-bg');
		if (!bgDiv) return;
		const bgPng = `game/${gameName}/bg.png`;
		const bgJpg = `game/${gameName}/bg.jpg`;
		fetch(bgPng, { method: 'HEAD' }).then(res => {
			if (res.ok) {
				bgDiv.style.setProperty('--game-bg-url', `url('${bgPng}')`);
			} else {
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
		const selectedOption = select.options[select.selectedIndex];
		const gameName = selectedOption.value;
		const iconPath = `game/${gameName}/icon.png`;
		try {
			const res = await fetch(iconPath, { method: 'HEAD' });
			if (res.ok) {
				icon.src = iconPath;
				icon.alt = selectedOption.textContent;
				icon.style.display = 'inline-block';
			} else {
				icon.src = '';
				icon.alt = '';
				icon.style.display = 'none';
			}
		} catch {
			icon.src = '';
			icon.alt = '';
			icon.style.display = 'none';
		}
		loadGameCss(gameName);
		setGameBg(gameName);
		const gameConfig = await loadGameConfig(gameName);
		if (gameConfig && gameConfig.getSpecialTokenInfo) {
			setSpecialTokenApi(gameConfig.getSpecialTokenInfo);
		}
	});

	const selectedOption = select.options[select.selectedIndex];
	const gameName = selectedOption.value;
	const iconPath = `game/${gameName}/icon.png`;
	try {
		const res = await fetch(iconPath, { method: 'HEAD' });
		if (res.ok) {
			icon.src = iconPath;
			icon.alt = selectedOption.textContent;
			icon.style.display = 'inline-block';
		} else {
			icon.src = '';
			icon.alt = '';
			icon.style.display = 'none';
		}
	} catch {
		icon.src = '';
		icon.alt = '';
		icon.style.display = 'none';
	}
	loadGameCss(gameName);
	setGameBg(gameName);
	const gameConfig = await loadGameConfig(gameName);
	if (gameConfig && gameConfig.getSpecialTokenInfo) {
		setSpecialTokenApi(gameConfig.getSpecialTokenInfo);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	init();
	setupGameConfigDropdown();
});
