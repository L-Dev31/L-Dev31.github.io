// Settings › Profile › Your country (its flag and name, a searchable list to change it, the user's currency)
// and Your bank (a searchable list of banks and brokers by country, and its fees once chosen).
import { getEl, el, icon } from '../core/utils.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { COUNTRIES, countryCode, chooseCountry, countryName, flagUrl } from '../data/country.js';
import { getUserSettings, saveUserSettings, currencyCode, homeCurrency } from '../core/state.js';
import { knownCurrencies, ratesReady } from '../data/rates.js';
import { banksReady, allBanks, banksAsOf, bankLogo, currentBank, chooseBank, saveCustomBank, orderFee, isEstimate, formatMoney } from '../data/banks.js';

const normalize = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const flag = code => el('img', 'flag-img', null, { src: flagUrl(code), alt: '', onerror: e => e.target.remove() });
const pressed = on => ({ type: 'button', 'aria-pressed': on });

/** A sheet opens empty with its list drawn, and closes on its backdrop or a [data-close] button. */
function bindSheet(sheet, search, render) {
    search.addEventListener('input', render);
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });
    return () => {
        search.value = '';
        render();
        sheet.showModal();
        if (matchMedia('(pointer: fine)').matches) search.focus();
    };
}

/* ── country ── */
const countrySheet = getEl('country-sheet');
const countryList = getEl('country-list');

function renderCountryList() {
    const q = normalize(getEl('country-search').value.trim());
    const mine = countryCode();
    const rows = COUNTRIES
        .map(code => ({ code, name: countryName(code) }))
        .filter(c => !q || normalize(`${c.name} ${c.code}`).includes(q))
        .sort((a, b) => (a.code === mine ? -1 : b.code === mine ? 1 : a.name.localeCompare(b.name, LOCALE)));
    countryList.replaceChildren(...rows.map(c => {
        const row = el('button', 'bank-row', null, { ...pressed(c.code === mine), 'data-code': c.code });
        row.append(flag(c.code), el('span', 'bank-row-name', c.name));
        if (c.code === mine) row.append(icon('check'));
        return row;
    }));
    if (!rows.length) countryList.append(el('p', 'empty', L('No country found.')));
}

const currencyPick = getEl('settings-currency');
function renderCurrency() {
    const names = new Intl.DisplayNames([LOCALE], { type: 'currency' });
    const label = c => `${names.of(c)} (${c})`;
    currencyPick.replaceChildren(new Option(L('Your country\'s: {0}', label(homeCurrency())), ''), ...knownCurrencies().map(c => new Option(label(c), c)));
    currencyPick.value = getUserSettings().currency || '';
}

function renderCountry() {
    const code = countryCode();
    getEl('country-current').replaceChildren(flag(code), el('span', null, countryName(code)));
    renderCurrency();
}

// Every amount on screen depends on the currency: the page starts again in the new one.
currencyPick.addEventListener('change', () => {
    saveUserSettings({ currency: currencyPick.value || undefined });
    location.reload();
});
getEl('country-change').addEventListener('click', bindSheet(countrySheet, getEl('country-search'), renderCountryList));
countryList.addEventListener('click', e => {
    const row = e.target.closest('.bank-row');
    if (!row) return;
    const before = currencyCode();
    chooseCountry(row.dataset.code);
    countrySheet.close();
    if (currencyCode() !== before) location.reload();
    else renderCountry();
});
renderCountry();
ratesReady.then(renderCurrency);

/* ── bank ── */
const KIND = { bank: L('Bank'), online: L('Online broker'), app: L('Investing app'), custom: L('Your own fees') };
const bankSheet = getEl('bank-sheet');
const bankList = getEl('bank-list');
const customForm = getEl('bank-custom');

function logo(bank) {
    const fallback = () => el('span', 'logo-fallback', bank.name.slice(0, 2).toUpperCase());
    const img = bank.domain && el('img', null, null, { alt: '', loading: 'lazy', src: bankLogo(bank.domain), onerror: () => img.replaceWith(fallback()) });
    const box = el('span', 'bank-logo');
    box.append(img || fallback());
    return box;
}

/** "1 000 € order: 3,99 €" for the list, or the most telling fact when no fee is published. */
function headline(bank) {
    const fee = orderFee(bank, 1000, 'home', bank.currency);
    if (fee == null) return bank.note ? L(bank.note) : L('Fees not published');
    return L('{0} order: {1}', formatMoney(1000, bank.currency), `${isEstimate(bank) ? '≈ ' : ''}${formatMoney(fee, bank.currency)}`);
}

// The user's country first, then the others by name. A broker that serves several countries
// (countries: [...]) is listed under the user's country when it serves it, else under its own,
// after the country's own banks.
function renderBankList() {
    const q = normalize(getEl('bank-search').value.trim());
    const chosenId = currentBank()?.id;
    const home = countryCode();
    const matches = allBanks().filter(b => !q || normalize(`${b.name} ${countryName(b.country)} ${b.country} ${(b.accounts || []).join(' ')}`).includes(q));
    const byCountry = new Map();
    for (const b of matches) {
        const where = b.countries?.includes(home) ? home : b.country;
        byCountry.set(where, [...(byCountry.get(where) || []), b]);
    }
    const countries = [...byCountry.keys()].sort((a, b) => (a === home ? -1 : b === home ? 1 : countryName(a).localeCompare(countryName(b), LOCALE)));

    bankList.replaceChildren();
    if (!matches.length) bankList.append(el('p', 'empty', L('No bank found. You can enter your fees yourself below.')));
    for (const code of countries) {
        const group = el('section', 'bank-group');
        const title = el('h3', 'bank-country');
        title.append(flag(code), countryName(code));
        group.append(title);
        for (const bank of byCountry.get(code).sort((x, y) => (x.country !== code) - (y.country !== code))) {
            const row = el('button', 'bank-row', null, { ...pressed(bank.id === chosenId), 'data-id': bank.id });
            const text = el('span', 'bank-row-text');
            text.append(el('span', 'bank-row-name', bank.name), el('span', 'bank-row-sub', `${KIND[bank.kind] || ''} · ${headline(bank)}`));
            row.append(logo(bank), text);
            if (bank.id === chosenId) row.append(icon('check'));
            group.append(row);
        }
        bankList.append(group);
    }
}

const openBankSheet = bindSheet(bankSheet, getEl('bank-search'), renderBankList);
getEl('bank-change').addEventListener('click', () => { customForm.hidden = true; openBankSheet(); });
bankList.addEventListener('click', e => {
    const row = e.target.closest('.bank-row');
    if (!row) return;
    chooseBank(row.dataset.id);
    bankSheet.close();
    renderSummary();
});

// A bank that is not listed: the user types its fees.
getEl('bank-custom-open').addEventListener('click', () => {
    customForm.hidden = !customForm.hidden;
    if (customForm.hidden) return;
    const c = currentBank()?.kind === 'custom' ? currentBank() : null;
    customForm.label.value = c?.name || '';
    customForm.flat.value = c?.orders?.home?.flat ?? '';
    customForm.pct.value = c?.orders?.home?.pct ?? '';
    customForm.min.value = c?.orders?.home?.min ?? '';
    customForm.fx.value = c?.fx ?? '';
    customForm.custody.value = c?.custody?.pct ?? '';
    customForm.label.focus();
});
customForm.addEventListener('submit', e => {
    e.preventDefault();
    const num = input => (input.value === '' ? undefined : Math.max(0, Number(input.value)));
    const rule = { flat: num(customForm.flat), pct: num(customForm.pct), min: num(customForm.min) };
    const custody = num(customForm.custody);
    saveCustomBank({
        name: customForm.label.value.trim() || L('My bank'),
        currency: currencyCode(),
        orders: { home: rule, us: rule },
        fx: num(customForm.fx) ?? null,
        custody: custody == null ? null : { pct: custody, text: L('{0} % a year', custody) },
    });
    bankSheet.close();
    renderSummary();
});

// The chosen bank in Settings › Profile.
function feeTable(bank) {
    const table = el('dl', 'bank-fees');
    const add = (label, value) => { if (value) table.append(el('dt', null, label), el('dd', null, value)); };
    const fee = (amount, market) => {
        const f = orderFee(bank, amount, market, bank.currency);
        return f == null ? null : `${isEstimate(bank, market) ? '≈ ' : ''}${formatMoney(f, bank.currency)}`;
    };
    for (const amount of [500, 1000, 5000]) add(L('Order of {0}', formatMoney(amount, bank.currency)), fee(amount, 'home'));
    add(L('US stocks, {0} order', formatMoney(1000, bank.currency)), fee(1000, 'us'));
    add(L('Currency conversion'), bank.fx != null ? L('{0} % of the amount', bank.fx) : null);
    add(L('Custody'), bank.custody?.text ? L(bank.custody.text) : null);
    add(L('Accounts'), bank.accounts?.join(', '));
    return table;
}

function renderSummary() {
    const host = getEl('bank-summary');
    const bank = currentBank();
    getEl('bank-change').textContent = bank ? L('Change') : L('Choose');
    host.replaceChildren();
    if (!bank) {
        host.append(el('p', 'muted', L('Pick your bank so Nemeris and the AI count what each order really costs you.')));
        return;
    }
    const head = el('div', 'bank-current');
    const text = el('span', 'bank-row-text');
    text.append(el('span', 'bank-row-name', bank.name), el('span', 'bank-row-sub', [KIND[bank.kind], bank.country && countryName(bank.country)].filter(Boolean).join(' · ')));
    head.append(logo(bank), text);
    host.append(head, feeTable(bank));
    if (bank.note) host.append(el('p', 'meta', L(bank.note)));
    const foot = el('p', 'meta bank-source');
    if (bank.source) foot.append(el('a', null, L('Price list as of {0}', banksAsOf()), { href: bank.source, target: '_blank', rel: 'noopener noreferrer' }), ' · ');
    const remove = el('button', 'link-btn', L('Remove'), { type: 'button' });
    remove.addEventListener('click', () => { chooseBank(null); renderSummary(); });
    foot.append(remove);
    host.append(foot);
}

banksReady.then(renderSummary);
