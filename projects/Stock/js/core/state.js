import { L } from '../i18n/i18n.js';
export const SETTINGS_STORAGE_KEY = 'nemeris_settings';

const defaultSettings = {
    name: 'Nemeris User',
    pfp: 'img/icon/favicon.png',
    currency: '€',
    proxyUrl: '',
    expert: false,
    investor: {},
};

let settingsCache = null;

export function getUserSettings() {
    if (settingsCache) return settingsCache;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}') || {}; } catch { /* corrupt, use defaults */ }
    if (/leot\.png$/.test(stored.pfp || '')) stored.pfp = defaultSettings.pfp;
    if (stored.proxyUrl && !/^https?:\/\//.test(stored.proxyUrl)) stored.proxyUrl = `https://${stored.proxyUrl}`;
    settingsCache = { ...defaultSettings, ...stored, investor: { ...(stored.investor || {}) } };
    return settingsCache;
}

export function saveUserSettings(patch) {
    const merged = { ...getUserSettings(), ...patch };
    settingsCache = merged;
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged)); } catch { /* storage full */ }
    window.dispatchEvent(new Event('nemeris:settings'));
    return merged;
}

export const getCurrency = () => getUserSettings().currency || '€';
export const currencyCode = () => ({ '€': 'EUR', '$': 'USD', '£': 'GBP', CHF: 'CHF' })[getCurrency()] || 'EUR';
export const isExpert = () => !!getUserSettings().expert;

const DROP_COMFORT = { sell_all: 2, sell_some: 3, wait: 5, buy_more: 6 };
const HORIZON_CAP = { lt2: 3, '2to5': 4, '5to10': 6, gt10: 7 };
const HORIZON_YEARS = { lt2: 1, '2to5': 3, '5to10': 7, gt10: 10 };
export const COMFORT_WORD = ['', L('Very cautious'), L('Cautious'), L('Measured'), L('Balanced'), L('Dynamic'), L('Bold'), L('Very bold')];

export const getInvestor = () => getUserSettings().investor || {};

/** Risk the user said they can live with, on the same 1 to 7 scale as fund documents. */
export function comfortLevel(inv = getInvestor()) {
    const base = DROP_COMFORT[inv.drop];
    if (!base) return null;
    return Math.min(base, HORIZON_CAP[inv.horizon] || 7);
}

export const horizonYears = (inv = getInvestor()) => HORIZON_YEARS[inv.horizon] || null;

const PHRASES = {
    situation: { student: 'is a student', employed: 'is employed', self: 'is self-employed, so their income can vary', jobseeker: 'is looking for work, so their income is uncertain', retired: 'is retired' },
    cushion: { lt1: 'has less than one month of spending saved, so emergency savings come before investing', '1to3': 'has 1 to 3 months of spending saved, a thin cushion', '3to6': 'has 3 to 6 months of spending saved, a sound cushion', gt6: 'has more than 6 months of spending saved' },
    debt: { costly: 'repays expensive debt (credit card, overdraft or consumer loan), so paying it off usually beats investing', cheap: 'only has low-rate debt (home or student loan)', none: 'has no expensive debt' },
    experience: { new: 'is new to investing, so explain every term simply', basics: 'knows the basics of investing but is not an expert', experienced: 'is an experienced investor, so you can be technical' },
    goal: { growth: 'wants to grow their money over time', income: 'wants regular income, so dividends matter', project: 'saves for a specific project', learn: 'invests mainly to learn' },
    horizon: { lt2: 'may need the money within 2 years', '2to5': 'may need the money in 2 to 5 years', '5to10': 'can leave the money invested 5 to 10 years', gt10: 'can leave the money invested more than 10 years' },
    drop: { sell_all: 'would sell everything after a 20% fall, so losses scare them', sell_some: 'would sell some after a 20% fall', wait: 'would wait calmly after a 20% fall', buy_more: 'would buy more after a 20% fall' },
};

/** The investor profile as plain sentences for AI prompts. Empty when the user filled nothing. */
export function investorContext(inv = getInvestor()) {
    const lines = [];
    for (const [key, map] of Object.entries(PHRASES)) if (map[inv[key]]) lines.push(`The user ${map[inv[key]]}.`);
    const comfort = comfortLevel(inv);
    if (comfort) lines.push(`Their comfort with risk is ${comfort} out of 7 (${COMFORT_WORD[comfort].toLowerCase()}).`);
    if (inv.monthly > 0) lines.push(`They can invest about ${Math.round(inv.monthly)} ${getCurrency()} a month.`);
    const notes = String(inv.notes || '').trim();
    if (notes) lines.push(`In their words: "${notes.slice(0, 600)}"`);
    return lines.join(' ');
}

export let positions = {};
export let selectedApi = 'yahoo';
export const lastApiBySymbol = {};
export let globalPeriod = '1W';
export function setGlobalPeriod(p) { globalPeriod = p; }
export let mainFetchController = null;
export function setMainFetchController(c) { mainFetchController = c; }
export let globalRefreshTimer = null;
export function setGlobalRefreshTimer(t) { globalRefreshTimer = t; }
export function setPositions(pos) { positions = pos; }
export function setSelectedApi(api) { if (api) selectedApi = api; }
export const getSelectedApi = () => selectedApi;
