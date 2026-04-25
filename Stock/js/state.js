// STATE
export const SETTINGS_STORAGE_KEY = 'nemeris_settings';
const LEGACY_PROXY_STORAGE_KEY = 'nemeris_proxy_url';

const defaultSettings = {
    name: 'Nemeris User',
    pfp: 'img/icon/favicon.png',
    currency: '€',
    proxyUrl: 'https://nemeris.leotoskuepro.workers.dev'
};

export function getUserSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) return { ...defaultSettings, ...JSON.parse(stored) };

        // Migration: anciens deployments utilisaient une clé proxy dédiée.
        const legacyProxy = (localStorage.getItem(LEGACY_PROXY_STORAGE_KEY) || '').trim();
        if (legacyProxy) {
            const migrated = { ...defaultSettings, proxyUrl: legacyProxy };
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
            return migrated;
        }
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

export let API_CONFIG = null;
export let positions = {};
export let selectedApi = 'yahoo';
export let lastApiBySymbol = {};
export let mainFetchController = null;
export let fastPollTimer = null;


// CONFIG LOADER
export async function loadApiConfig() {
    if (API_CONFIG) return API_CONFIG;
    const response = await fetch('json/api.json');
    const config = await response.json();
    API_CONFIG = {
        apis: config,
        ui: { defaultApi: 'yahoo', validApis: ['yahoo'] }
    };
    return API_CONFIG;
}

// SETTERS
export function setPositions(pos) { positions = pos; }
export function setSelectedApi(api) {
    if (!api) return;
    selectedApi = api;
    try { window.selectedApi = selectedApi; } catch(e) { /* ignore */ }
}
export function getSelectedApi() { return selectedApi; }
export function setMainFetchController(ctrl) { mainFetchController = ctrl; }
export function setFastPollTimer(timer) { fastPollTimer = timer; }

