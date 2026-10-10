// What money is worth to the user: their income next to what is typical where they live.
// Typical = the median net income per person of their country (Eurostat EU-SILC, dataset ilc_di03), fetched live
// and kept a month. Until then, and for countries Eurostat does not cover, the 2025 survey figures below stand in.
import { getInvestor, currencyCode, monthlyAmount } from '../core/state.js';
import { countryCode, countryName } from './country.js';
import { convert } from './rates.js';
import { formatMoney } from './banks.js';
import { L } from '../i18n/i18n.js';

const KEY = 'nemeris_income';
const MONTH = 30 * 86400000;
// Median equivalised net income, € a year. EU and EFTA: EU-SILC 2025 (incomes of 2024), via the WKO table.
// GB: ONS, financial year ending 2025, per adult. US and CA: national after-tax medians, per adult. Others: EU-27.
const MEDIAN = {
    FR: 26459, BE: 31299, LU: 50046, DE: 28891, AT: 36114, NL: 34466, CH: 51926, IT: 22062, ES: 20367, PT: 14465,
    IE: 35138, SE: 28574, DK: 36192, NO: 41923, FI: 29740, PL: 14394, CZ: 15199, SK: 12990, HU: 8792, RO: 8187,
    BG: 8862, GR: 11700, HR: 15057, SI: 20416, EE: 17146, LV: 13983, LT: 13982, MT: 22034, CY: 22066,
    GB: 30400, US: 42300, CA: 29000,
};
const EU27 = 22930;
// No figure of its own: Monaco is counted like France.
const MEDIAN_AS = { MC: 'FR' };
const EUROSTAT_GEO = { GR: 'EL' };
const NOT_EUROSTAT = ['GB', 'US', 'CA', 'MC'];
// Where each answer sits against the median, for the maths: the bracket's middle.
export const INCOME_SHARE = { none: 0, b1: 0.45, b2: 0.8, b3: 1.3, b4: 2 };

let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* nothing saved */ }

const pending = {};
const DAY = 86400000;

function fetchMedian(code) {
    // A figure is kept a month; a failed or empty answer is not asked again for a day.
    if (NOT_EUROSTAT.includes(code) || Date.now() - (saved[code]?.t || 0) < (saved[code]?.value ? MONTH : DAY)) return Promise.resolve();
    const geo = EUROSTAT_GEO[code] || code;
    return pending[code] ||= fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ilc_di03?format=JSON&lang=EN&geo=${geo}&indic_il=MED_E&unit=EUR&age=TOTAL&sex=T&lastTimePeriod=3`)
        .then(r => r.json())
        .then(j => {
            const [year, i] = Object.entries(j.dimension.time.category.index).sort((a, b) => b[1] - a[1]).find(([, x]) => j.value[x] != null) || [];
            saved[code] = year ? { t: Date.now(), year, value: j.value[i] } : { t: Date.now() };
        })
        .catch(() => { saved[code] = { t: Date.now() }; })
        .finally(() => {
            delete pending[code];
            try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full */ }
        });
}
/** Fetches the user's country figure once a month; resolves when it is there (or failed). */
export const loadMedian = () => fetchMedian(countryCode());

/** The typical monthly net income in the user's country, in their currency. */
export function typicalIncome(code = countryCode()) {
    const yearly = saved[code]?.value || MEDIAN[code] || MEDIAN[MEDIAN_AS[code]] || EU27;
    return convert(yearly / 12, 'EUR', currencyCode());
}

// Two significant figures: 1 337 → 1 300.
const nice = n => {
    const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / step) * step;
};
const money = n => formatMoney(nice(n), currencyCode());
// The bracket limits: 60%, 100% and 160% of the typical income.
const limits = () => [0.6, 1, 1.6].map(x => money(typicalIncome() * x));

/** The answers to "how much comes in each month", as labels built on the country's typical income. */
export function incomeBands() {
    const m = typicalIncome();
    const [a, b, c] = limits();
    return {
        none: L('No regular income'), b1: L('Under {0}', a), b2: L('{0} to {1}', a, b), b3: L('{0} to {1}', b, c), b4: L('Over {0}', c),
        hint: L('Count pay, grants and regular help from family. A typical income (country: {0}) is about {1} a month.', countryName(countryCode()), money(m)),
    };
}

/** What the money answers mean, for the coach and the AI. */
export function moneyFlags(inv = getInvestor()) {
    const income = inv.income in INCOME_SHARE ? INCOME_SHARE[inv.income] * typicalIncome() : null;
    const share = inv.monthly > 0 && income ? monthlyAmount(inv) / income : null;
    return {
        income, share,
        costlyDebt: inv.debt === 'costly',
        noCushion: inv.cushion === 'lt1',
        thinCushion: inv.cushion === '1to3',
        stretch: monthlyAmount(inv) > 0 && (inv.income === 'none' || share >= 0.3),
        tight: inv.situation === 'student' || inv.income === 'none' || inv.income === 'b1',
    };
}

/** The user's money situation in plain sentences for AI prompts. Empty when they said nothing about it. */
export function moneyContext(inv = getInvestor()) {
    if (!(inv.income in INCOME_SHARE)) return '';
    const [a, b, c] = limits();
    const range = { b1: `under ${a}`, b2: `${a} to ${b}`, b3: `${b} to ${c}`, b4: `over ${c}` }[inv.income];
    const f = moneyFlags(inv);
    const lines = [inv.income === 'none'
        ? 'They have no regular income of their own: every amount matters, so favour a budget, a small cushion and learning with small sums.'
        : `Their net income is ${range} a month; a typical income in ${countryName(countryCode(), 'en')} is about ${money(typicalIncome())}.`];
    if (f.share) lines.push(`The ${formatMoney(Math.round(monthlyAmount(inv)), currencyCode())} a month they plan to invest is about ${Math.round(f.share * 100)}% of their income.`);
    return lines.join(' ');
}
