// STATE
export const SETTINGS_STORAGE_KEY = 'nemeris_settings';
const LEGACY_PROXY_STORAGE_KEY = 'nemeris_proxy_url';

const defaultSettings = {
    name: 'Mr. Léo Tosku',
    pfp: 'img/photo/leot.png',
    currency: '€',
    proxyUrl: '',
    performanceViewerEnabled: true
};

export function getUserSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        let settings = stored ? JSON.parse(stored) : { ...defaultSettings };
        
        // Clean up legacy paths
        if (settings.pfp === 'leot.png' || settings.pfp === 'img/leot.png' || settings.pfp === 'img/icon/leot.png') {
            settings.pfp = defaultSettings.pfp;
        }

        // Ensure proxyUrl has protocol
        if (settings.proxyUrl && !settings.proxyUrl.startsWith('http')) {
            settings.proxyUrl = 'https://' + settings.proxyUrl;
        }

        return { ...defaultSettings, ...settings };
    } catch { /* ignore */ }
    return { ...defaultSettings };
}

export function saveUserSettings(settings) {
    try {
        const current = getUserSettings();
        const merged = { ...current, ...settings };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
}

export function getCurrency() {
    return getUserSettings().currency || '€';
}

export let positions = {};
export let selectedApi = 'yahoo';
export let lastApiBySymbol = {};
export let globalPeriod = '1D';
export function setGlobalPeriod(p) { globalPeriod = p; }
export let mainFetchController = null;
export function setMainFetchController(c) { mainFetchController = c; }
export let fastPollTimer = null;
export function setFastPollTimer(t) { fastPollTimer = t; }
export let globalRefreshTimer = null;
export function setGlobalRefreshTimer(t) { globalRefreshTimer = t; }


// SETTERS
export function setPositions(pos) { positions = pos; }
export function setSelectedApi(api) {
    if (!api) return;
    selectedApi = api;
    try { window.selectedApi = selectedApi; } catch(e) { /* ignore */ }
}
export function getSelectedApi() { return selectedApi; }


