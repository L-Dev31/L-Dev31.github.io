// The user's country: guessed from the browser's time zone and language, changeable in Settings › Profile.
// It puts the country's banks first and tells the AI which tax rules and accounts apply (knowledge/nemeris.md).
import { getUserSettings, saveUserSettings } from '../core/state.js';
import { LOCALE } from '../i18n/i18n.js';

/** Countries Nemeris knows banks or rules for: Europe first, then North America. */
export const COUNTRIES = ['FR', 'BE', 'LU', 'DE', 'AT', 'NL', 'CH', 'IT', 'ES', 'PT', 'IE', 'GB', 'SE', 'DK', 'NO', 'FI', 'IS',
    'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'MC', 'US', 'CA'];

const ZONE = {
    Paris: 'FR', Brussels: 'BE', Luxembourg: 'LU', Berlin: 'DE', Vienna: 'AT', Amsterdam: 'NL', Zurich: 'CH', Rome: 'IT',
    Madrid: 'ES', Lisbon: 'PT', Dublin: 'IE', London: 'GB', Stockholm: 'SE', Copenhagen: 'DK', Oslo: 'NO', Helsinki: 'FI',
    Reykjavik: 'IS', Warsaw: 'PL', Prague: 'CZ', Bratislava: 'SK', Budapest: 'HU', Bucharest: 'RO', Sofia: 'BG', Athens: 'GR',
    Zagreb: 'HR', Ljubljana: 'SI', Tallinn: 'EE', Riga: 'LV', Vilnius: 'LT', Malta: 'MT', Nicosia: 'CY', Monaco: 'MC',
};

function guess() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const city = zone.split('/').pop();
    if (ZONE[city]) return ZONE[city];
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Regina|Halifax|St_Johns)/.test(zone)) return 'CA';
    if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)|Pacific\/Honolulu)/.test(zone)) return 'US';
    for (const tag of navigator.languages || [navigator.language]) {
        const region = String(tag).split('-')[1]?.toUpperCase();
        if (COUNTRIES.includes(region)) return region;
    }
    return 'FR';
}

export const countryCode = () => getUserSettings().country || guess();
export const chooseCountry = code => saveUserSettings({ country: code });

export function countryName(code, locale = LOCALE) {
    try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code); } catch { return code; }
}

/** Flag image from flagcdn.com (free, no key). */
export const flagUrl = code => `https://flagcdn.com/${String(code).toLowerCase()}.svg`;
