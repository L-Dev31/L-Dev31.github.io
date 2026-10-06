// Settings › Profile › Your bank: a searchable list of banks and brokers by country, and its fees once chosen.
import { getEl, el, icon } from '../core/utils.js';
import { currencyCode } from '../core/state.js';
import { L, LANG, LOCALE } from '../i18n/i18n.js';
import { banksReady, allBanks, banksAsOf, bankLogo, currentBank, chooseBank, saveCustomBank, orderFee, isEstimate, formatMoney } from '../data/banks.js';

const countryName = code => {
    try { return new Intl.DisplayNames([LOCALE], { type: 'region' }).of(code); } catch { return code; }
};
const KIND = { bank: L('Bank'), online: L('Online broker'), app: L('Investing app'), custom: L('Your own fees') };
const money = formatMoney;
const normalize = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function logo(bank) {
    const box = el('span', 'bank-logo');
    if (!bank.domain) {
        box.append(el('span', 'logo-fallback', bank.name.slice(0, 2).toUpperCase()));
        return box;
    }
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = bankLogo(bank.domain);
    img.onerror = () => img.replaceWith(el('span', 'logo-fallback', bank.name.slice(0, 2).toUpperCase()));
    box.append(img);
    return box;
}

/** "1 000 € order: 3,99 €" for the list, or the most telling fact when no fee is published. */
function headline(bank) {
    const fee = orderFee(bank, 1000, 'home');
    if (fee == null) return bank.note || L('Fees not published');
    return L('{0} order: {1}', money(1000, bank.currency), `${isEstimate(bank) ? '≈ ' : ''}${money(fee, bank.currency)}`);
}

/* ── the sheet ── */
const sheet = getEl('bank-sheet');
const search = getEl('bank-search');
const list = getEl('bank-list');
const customForm = getEl('bank-custom');

// Countries in the language's own country first, then by name.
function homeCountry() {
    const chosen = currentBank();
    if (chosen?.country) return chosen.country;
    return LANG === 'fr' ? 'FR' : (navigator.language.split('-')[1] || 'US').toUpperCase();
}

function renderList() {
    const q = normalize(search.value.trim());
    const chosenId = currentBank()?.id;
    const matches = allBanks().filter(b => !q || normalize(`${b.name} ${countryName(b.country)} ${b.country} ${(b.accounts || []).join(' ')}`).includes(q));
    const byCountry = new Map();
    for (const b of matches) byCountry.set(b.country, [...(byCountry.get(b.country) || []), b]);
    const home = homeCountry();
    const countries = [...byCountry.keys()].sort((a, b) => (a === home ? -1 : b === home ? 1 : countryName(a).localeCompare(countryName(b), LOCALE)));

    list.replaceChildren();
    if (!matches.length) list.append(el('p', 'empty', L('No bank found. You can enter your fees yourself below.')));
    for (const code of countries) {
        const group = el('section', 'bank-group');
        group.append(el('h3', 'bank-country', countryName(code)));
        for (const bank of byCountry.get(code)) {
            const row = el('button', 'bank-row');
            row.type = 'button';
            row.dataset.id = bank.id;
            row.setAttribute('aria-pressed', String(bank.id === chosenId));
            const text = el('span', 'bank-row-text');
            text.append(el('span', 'bank-row-name', bank.name), el('span', 'bank-row-sub', `${KIND[bank.kind] || ''} · ${headline(bank)}`));
            row.append(logo(bank), text);
            if (bank.id === chosenId) row.append(icon('check'));
            group.append(row);
        }
        list.append(group);
    }
}

function openSheet() {
    search.value = '';
    customForm.hidden = true;
    renderList();
    sheet.showModal();
    if (matchMedia('(pointer: fine)').matches) search.focus();
}

list.addEventListener('click', e => {
    const row = e.target.closest('.bank-row');
    if (!row) return;
    chooseBank(row.dataset.id);
    sheet.close();
    renderSummary();
});
search.addEventListener('input', renderList);
sheet.addEventListener('click', e => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
});

/* ── a bank that is not listed: the user types its fees ── */
getEl('bank-custom-open').addEventListener('click', () => {
    customForm.hidden = !customForm.hidden;
    if (!customForm.hidden) {
        const c = currentBank()?.kind === 'custom' ? currentBank() : null;
        customForm.label.value = c?.name || '';
        customForm.flat.value = c?.orders?.home?.flat ?? '';
        customForm.pct.value = c?.orders?.home?.pct ?? '';
        customForm.min.value = c?.orders?.home?.min ?? '';
        customForm.fx.value = c?.fx ?? '';
        customForm.custody.value = c?.custody?.pct ?? '';
        customForm.label.focus();
    }
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
    sheet.close();
    renderSummary();
});

/* ── the chosen bank in Settings › Profile ── */
function feeTable(bank) {
    const table = el('dl', 'bank-fees');
    const add = (label, value) => { if (value) table.append(el('dt', null, label), el('dd', null, value)); };
    const fee = (amount, market) => {
        const f = orderFee(bank, amount, market);
        return f == null ? null : `${isEstimate(bank, market) ? '≈ ' : ''}${money(f, bank.currency)}`;
    };
    for (const amount of [500, 1000, 5000]) add(L('Order of {0}', money(amount, bank.currency)), fee(amount, 'home'));
    add(L('US stocks, {0} order', money(1000, bank.currency)), fee(1000, 'us'));
    add(L('Currency conversion'), bank.fx != null ? L('{0} % of the amount', bank.fx) : null);
    add(L('Custody'), bank.custody?.text ? L(bank.custody.text) : null);
    add(L('Accounts'), bank.accounts?.join(', '));
    return table;
}

export function renderSummary() {
    const host = getEl('bank-summary');
    const button = getEl('bank-change');
    const bank = currentBank();
    button.textContent = bank ? L('Change') : L('Choose');
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
    if (bank.source) {
        const a = el('a', null, L('Price list as of {0}', banksAsOf()));
        a.href = bank.source;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        foot.append(a, ' · ');
    }
    const remove = el('button', 'link-btn', L('Remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => { chooseBank(null); renderSummary(); });
    foot.append(remove);
    host.append(foot);
}

getEl('bank-change').addEventListener('click', openSheet);
banksReady.then(renderSummary);
