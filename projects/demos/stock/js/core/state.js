import { L, LOCALE } from '../i18n/i18n.js';
import { countryCode } from '../data/country.js';
import { convert } from '../data/rates.js';
const SETTINGS_KEY = 'nemeris_settings';

const defaultSettings = {
    name: 'Nemeris User',
    pfp: 'img/icon/favicon.png',
    proxyUrl: '',
    expert: false,
    investor: {},
};

let settingsCache = null;

export function getUserSettings() {
    if (settingsCache) return settingsCache;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { /* corrupt, use defaults */ }
    if (/leot\.png$/.test(stored.pfp || '')) stored.pfp = defaultSettings.pfp;
    if (stored.proxyUrl && !/^https?:\/\//.test(stored.proxyUrl)) stored.proxyUrl = `https://${stored.proxyUrl}`;
    // Settings once held a symbol, '€' by default: a real choice becomes its code, the default gives way to the country's.
    if (stored.currency && !/^[A-Z]{3}$/.test(stored.currency)) stored.currency = { $: 'USD', '£': 'GBP', CHF: 'CHF' }[stored.currency];
    settingsCache = { ...defaultSettings, ...stored, investor: { ...(stored.investor || {}) } };
    return settingsCache;
}

export function saveUserSettings(patch) {
    settingsCache = { ...getUserSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch { /* storage full */ }
    window.dispatchEvent(new Event('nemeris:settings'));
    return settingsCache;
}

// The countries Nemeris knows that do not use the euro.
const HOME_CURRENCY = { GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', IS: 'ISK', US: 'USD', CA: 'CAD' };
export const homeCurrency = (country = countryCode()) => HOME_CURRENCY[country] || 'EUR';
/** The user's currency (ISO code): the one chosen in Settings, else their country's. Totals are shown in it. */
export const currencyCode = () => getUserSettings().currency || homeCurrency();
/** A currency's short sign: €, $, £, kr... */
export function currencySymbol(code = currencyCode()) {
    if (code === 'GBp' || code === 'GBX') return 'p';
    try { return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency').value; } catch { return code; }
}
export const getCurrency = () => currencySymbol();
export const isExpert = () => !!getUserSettings().expert;

const DROP_COMFORT = { sell_all: 2, sell_some: 3, wait: 5, buy_more: 6 };
const HORIZON_CAP = { lt2: 3, '2to5': 4, '5to10': 6, gt10: 7 };
export const COMFORT_WORD = ['', L('Very cautious'), L('Cautious'), L('Measured'), L('Balanced'), L('Dynamic'), L('Bold'), L('Very bold')];

export const getInvestor = () => getUserSettings().investor || {};
/** What they can invest a month, in the user's currency (typed in the one they had then; euros before currencies existed). */
export const monthlyAmount = (inv = getInvestor()) => (inv.monthly > 0 ? convert(inv.monthly, inv.monthlyCurrency || 'EUR', currencyCode()) : 0);

/** Risk the user said they can live with, on the same 1 to 7 scale as fund documents. */
export function comfortLevel(inv = getInvestor()) {
    const base = DROP_COMFORT[inv.drop];
    return base ? Math.min(base, HORIZON_CAP[inv.horizon] || 7) : null;
}

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
    if (inv.monthly > 0) lines.push(`They can invest about ${Math.round(monthlyAmount(inv))} ${getCurrency()} a month.`);
    const notes = String(inv.notes || '').trim();
    if (notes) lines.push(`In their words: "${notes.slice(0, 600)}"`);
    return lines.join(' ');
}

// Shared by every screen: the stocks on the page and the period shown.
export const positions = {};
export let globalPeriod = '1W';
export const setGlobalPeriod = p => { globalPeriod = p; };
