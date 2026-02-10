import { fetchPolygonForexRate } from './api/polygon.js';

export let API_CONFIG = null;
export let positions = {};
export let selectedApi = 'yahoo';
export let lastApiBySymbol = {};
export let mainFetchController = null;
export let initialFetchController = null;
export let fastPollTimer = null;
export let rateLimitCountdownTimer = null;
export let usdToEurRate = null;

export async function loadApiConfig() {
  if (API_CONFIG) return API_CONFIG;
  try {
    const response = await fetch('api.json');
    const config = await response.json();
    const enabledApis = Object.keys(config).filter(api => config[api].enabled);
    API_CONFIG = {
      apis: config,
      ui: {
        defaultApi: 'yahoo',
        validApis: enabledApis
      }
    };
    return API_CONFIG;
  } catch (error) {
    throw error;
  }
}

export function setPositions(pos) {
    positions = pos;
}

export function setSelectedApi(api) {
    if (!api) return;
    selectedApi = api;
    try { window.selectedApi = selectedApi; } catch(e) { /* ignore */ }
}

export function getSelectedApi() {
    return selectedApi;
}

export function setMainFetchController(ctrl) {
    mainFetchController = ctrl;
}

export function setInitialFetchController(ctrl) {
    initialFetchController = ctrl;
}

export function setFastPollTimer(timer) {
    fastPollTimer = timer;
}

export function setRateLimitCountdownTimer(timer) {
    rateLimitCountdownTimer = timer;
}

export async function fetchUsdToEurRate() {
    if (usdToEurRate !== null) return usdToEurRate;
    try {
        const config = await loadApiConfig();
        const api = config?.apis?.massive;
        if (!api || !api.enabled || !api.apiKey) return 1;
        const rate = await fetchPolygonForexRate(api.apiKey);
        if (rate !== null) {
            usdToEurRate = rate;
            return usdToEurRate;
        }
    } catch (err) {
        console.warn('fetchUsdToEurRate error', err);
    }
    return 1;
}
