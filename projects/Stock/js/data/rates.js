// Euro exchange rates: the ECB's daily reference rates through Frankfurter (free, no key), fetched once a day
// and kept for offline use. Until the first fetch, the ECB rates of 1 July 2026 stand in.
// Close enough to compare fees and amounts, not to trade.
const KEY = 'nemeris_rates';
const DAY = 86400000;

let rates = {
    date: '2026-07-01',
    perEuro: { USD: 1.1383, GBP: 0.8597, CHF: 0.9234, SEK: 11.0955, NOK: 11.3125, DKK: 7.4745, PLN: 4.2958, CZK: 24.254, HUF: 355.83, RON: 5.2367, ISK: 143.8, CAD: 1.6191 },
};
try { rates = JSON.parse(localStorage.getItem(KEY)) || rates; } catch { /* nothing saved yet */ }

export const ratesReady = Date.now() - (rates.t || 0) < DAY
    ? Promise.resolve()
    : fetch('https://api.frankfurter.dev/v1/latest')
        .then(r => r.json())
        .then(d => {
            if (!d?.rates) return;
            rates = { t: Date.now(), date: d.date, perEuro: d.rates };
            try { localStorage.setItem(KEY, JSON.stringify(rates)); } catch { /* storage full */ }
        })
        .catch(() => {});

/** Date of the rates in use, as published by the ECB (YYYY-MM-DD). */
export const ratesDate = () => rates.date;

// Some exchanges quote in a hundredth of a currency: London in pence, Johannesburg in cents, Tel Aviv in agorot.
const MINOR = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' };
const perEuro = c => (MINOR[c] ? rates.perEuro[MINOR[c]] * 100 : c === 'EUR' ? 1 : rates.perEuro[c]);

/** An amount in another currency. Unknown currencies are left as they are. */
export function convert(n, from, to) {
    return from && to && from !== to && perEuro(from) && perEuro(to) ? n / perEuro(from) * perEuro(to) : n;
}

/** The currencies the rates cover, the euro included. */
export const knownCurrencies = () => ['EUR', ...Object.keys(rates.perEuro)].sort();
