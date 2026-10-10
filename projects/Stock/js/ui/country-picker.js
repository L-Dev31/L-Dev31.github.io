// Settings › Profile › Your country: its flag and name, a searchable list to change it, and the user's currency.
import { getEl, el, icon } from '../core/utils.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { COUNTRIES, countryCode, chooseCountry, countryName, flagUrl } from '../data/country.js';
import { getUserSettings, saveUserSettings, currencyCode, homeCurrency } from '../core/state.js';
import { knownCurrencies, ratesReady } from '../data/rates.js';

export function flag(code) {
    const img = el('img', 'flag-img');
    img.src = flagUrl(code);
    img.alt = '';
    img.onerror = () => img.remove();
    return img;
}

const sheet = getEl('country-sheet');
const search = getEl('country-search');
const list = getEl('country-list');
const normalize = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function renderList() {
    const q = normalize(search.value.trim());
    const mine = countryCode();
    const rows = COUNTRIES
        .map(code => ({ code, name: countryName(code) }))
        .filter(c => !q || normalize(`${c.name} ${c.code}`).includes(q))
        .sort((a, b) => (a.code === mine ? -1 : b.code === mine ? 1 : a.name.localeCompare(b.name, LOCALE)));
    list.replaceChildren(...rows.map(c => {
        const row = el('button', 'bank-row');
        row.type = 'button';
        row.dataset.code = c.code;
        row.setAttribute('aria-pressed', String(c.code === mine));
        row.append(flag(c.code), el('span', 'bank-row-name', c.name));
        if (c.code === mine) row.append(icon('check'));
        return row;
    }));
    if (!rows.length) list.append(el('p', 'empty', L('No country found.')));
}

export function renderCountry() {
    const code = countryCode();
    getEl('country-current').replaceChildren(flag(code), el('span', null, countryName(code)));
    renderCurrency();
}

const currencyPick = getEl('settings-currency');
function renderCurrency() {
    const names = new Intl.DisplayNames([LOCALE], { type: 'currency' });
    const label = c => `${names.of(c)} (${c})`;
    currencyPick.replaceChildren(new Option(L('Your country\'s: {0}', label(homeCurrency())), ''), ...knownCurrencies().map(c => new Option(label(c), c)));
    currencyPick.value = getUserSettings().currency || '';
}
// Every amount on screen depends on it: the page starts again in the new currency.
currencyPick.addEventListener('change', () => {
    saveUserSettings({ currency: currencyPick.value || undefined });
    location.reload();
});

getEl('country-change').addEventListener('click', () => {
    search.value = '';
    renderList();
    sheet.showModal();
    if (matchMedia('(pointer: fine)').matches) search.focus();
});
search.addEventListener('input', renderList);
list.addEventListener('click', e => {
    const row = e.target.closest('.bank-row');
    if (!row) return;
    const before = currencyCode();
    chooseCountry(row.dataset.code);
    sheet.close();
    if (currencyCode() !== before) location.reload();
    else renderCountry();
});
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });
renderCountry();
ratesReady.then(renderCurrency);
