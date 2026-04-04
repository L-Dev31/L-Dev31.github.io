// STATE
export let API_CONFIG = null;
export let positions = {};
export let selectedApi = 'yahoo';
export let lastApiBySymbol = {};
export let mainFetchController = null;
export let initialFetchController = null;
export let fastPollTimer = null;
export let rateLimitCountdownTimer = null;

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
export function setInitialFetchController(ctrl) { initialFetchController = ctrl; }
export function setFastPollTimer(timer) { fastPollTimer = timer; }
export function setRateLimitCountdownTimer(timer) { rateLimitCountdownTimer = timer; }
