// Reads the portfolio as it is now and finds what deserves attention, explained the same way every time:
// what is happening, what it means for you, what you can do (doing nothing is often one), and the idea behind it.
// Text may hold [[key|words]]: they become tappable words (js/coach/explain.js).
import { positions, globalPeriod, getInvestor, comfortLevel, currencyCode } from '../core/state.js';
import { periodPhrase } from '../core/constants.js';
import { holdingRows } from '../data/holdings.js';
import { currentBank, orderFee, money } from '../data/banks.js';
import { fetchCloses } from '../quant/quant-shared.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { nextLevel } from '../learn/academy.js';
import { moneyFlags } from '../data/income.js';

export const pct = n => (Math.abs(n) / 100).toLocaleString(LOCALE, { style: 'percent', maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });

// A move this big over the period is worth a word, in %. Funds move less than single stocks, crypto twice as much.
const BIG_MOVE = { '1H': 2, '4H': 3, '1D': 3, '1W': 6, '1M': 10, '3M': 15, '6M': 20, 'YTD': 20, '1Y': 25, '3Y': 40, '5Y': 50, 'MAX': 60 };
const KIND_SCALE = { fund: 0.6, stock: 1, crypto: 2 };
const bigMove = kind => (BIG_MOVE[globalPeriod] || 10) * KIND_SCALE[kind];

/** The money a line gained or lost over the period, from its value now and its % change. */
const moveOf = r => (r.change_pct == null ? 0 : r.value - r.value / (1 + r.change_pct / 100));

function typicalOrder(inv) {
    if (inv.monthly > 0) return inv.monthly;
    const amounts = Object.values(positions).flatMap(p => (p.purchases || []).map(t => Math.abs(t.amount || 0))).filter(Boolean).sort((a, b) => a - b);
    return amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;
}

/** Money basics come before investing: expensive debt, no cushion, too big a share of a small income. */
function moneySituations(inv) {
    const f = moneyFlags(inv);
    const out = [];
    if (f.costlyDebt) out.push({
        id: 'debt', tone: 'warn', photo: 'credit card', priority: 95,
        title: L('You are paying back expensive debt.'),
        meaning: [
            L('Credit cards, overdrafts and consumer loans often cost 10 to 20% a year or more.'),
            L('Paying them off is a sure return: no investment can promise that much.'),
        ],
        options: [
            { label: L('Pay it off first'), detail: L('Put what you meant to invest toward the most expensive debt.') },
            { label: L('Keep a very small amount invested'), detail: L('Fine to learn with, as long as you never miss a repayment.') },
            { label: L('Check your answer'), detail: L('Only a home or student loan? Update your profile.'), action: 'profile' },
        ],
        lesson: 'debt',
        ask: L('I am paying back a consumer loan. Should I pay it off before investing?'),
    });
    if (f.noCushion || f.thinCushion) out.push({
        id: 'cushion', tone: f.noCushion ? 'warn' : 'tip', photo: 'umbrella rain', priority: f.noCushion ? 88 : 42,
        title: f.noCushion ? L('You have less than a month of spending set aside.') : L('Your safety cushion is still thin.'),
        meaning: [
            L('Without a cushion, a broken phone or a lost job could force you to sell your investments at a bad time.'),
            L('A common guideline: 3 to 6 months of spending on a savings account you can reach at once, your [[emergencyFund|emergency savings]].'),
        ],
        options: [
            { label: L('Build your cushion first'), detail: L('Send your monthly amount to savings until about 3 months are covered.') },
            { label: L('Split your monthly amount'), detail: L('For example two thirds to savings and one third to investing, until the cushion is there.') },
        ],
        lesson: 'cushion',
        ask: L('How much emergency savings should I keep before investing?'),
    });
    if (f.stretch) out.push({
        id: 'stretch', tone: 'warn', photo: 'wallet', priority: 80,
        title: inv.income === 'none' ? L('You plan to invest without a regular income.') : L('You plan to invest about {0} of your income each month.', pct(f.share * 100)),
        meaning: [
            L('Investing works only if you never have to take the money back out at a bad time.'),
            L('Learning with 10 to 50 € a month teaches as much as with 500 €.'),
        ],
        options: [
            { label: L('Start smaller'), detail: L('A small amount you are sure to keep invested beats a big one you may need back.') },
            { label: L('Invest what is left'), detail: L('Needs and savings first, investing with what remains.') },
            { label: L('Update your amount'), detail: L('In Settings, Profile.'), action: 'profile' },
        ],
        lesson: 'budget',
        ask: L('How much of my income should I invest each month?'),
    });
    if (f.tight && !out.length) out.push({
        id: 'budget', tone: 'tip', photo: 'notebook budget', priority: 38,
        title: L('Your best first investment: a simple budget.'),
        meaning: [L('Knowing where your money goes is what frees money to save and, later, to invest.')],
        options: [
            { label: L('Track one month of spending'), detail: L('Write down everything for a month: the surprises show you where to save.') },
            { label: L('Pay yourself first'), detail: L('A small automatic transfer to savings on the day your money arrives.') },
            { label: L('Learn the basics'), detail: L('The first levels of the Academy are about exactly this.'), action: 'learn' },
        ],
        lesson: 'budget',
    });
    return out;
}

/** Everything worth saying right now, most important first. */
export function findSituations() {
    const { rows, total } = holdingRows();
    const inv = getInvestor();
    const bank = currentBank();
    const period = periodPhrase(globalPeriod);
    const found = moneySituations(inv);
    const add = s => s && found.push(s);

    if (!rows.length) {
        const sample = positions.DCAM ? { action: 'stock', symbol: 'DCAM' } : { action: 'explorer' };
        add({
            id: 'start', tone: 'setup', photo: 'piggy bank', priority: 100,
            title: L('You have not added any investment yet.'),
            meaning: [
                L('No rush. Most people start with one broad [[etf|ETF]], a small amount every month, and money they will not need for years.'),
                L('Already invested at your bank? Open the stock in Nemeris and add your trade: Nemeris will then follow it with you.'),
            ],
            options: [
                { label: L('Tell Nemeris about you'), detail: L('A few questions about your money, your goal and your timing.'), action: 'profile' },
                { label: L('Look at a world fund'), detail: L('See how a fund holding the whole world moves.'), ...sample },
            ],
            lesson: 'etf',
            ask: L('I am new to investing. Where should I start, step by step?'),
        });
        return found.sort((a, b) => b.priority - a.priority);
    }

    const moved = rows.reduce((s, r) => s + moveOf(r), 0);
    const before = total - moved;
    const known = rows.some(r => r.change_pct != null);

    if (inv.horizon === 'lt2') add({
        id: 'horizon', tone: 'warn', photo: 'calendar', priority: 90,
        title: L('You may need this money within 2 years, but it is invested in stocks.'),
        meaning: [
            L('Stocks can lose 20 to 30% in a bad year and take years to recover. Over 2 years, that is a real risk for money you will need.'),
            L('This is how most beginners get hurt: not by a bad stock, but by having to sell at the wrong moment.'),
        ],
        options: [
            { label: L('Keep what you need soon in savings'), detail: L('Move the money you will need, step by step, to a savings account.') },
            { label: L('Check your answer'), detail: L('If you can actually wait longer, update your profile.'), action: 'profile' },
        ],
        lesson: 'horizon',
        ask: L('I may need my money within 2 years. Is my portfolio too risky for that?'),
    });

    // The biggest drop and the biggest rise over the period, measured by what they did to the whole portfolio.
    const drops = rows.filter(r => r.change_pct <= -bigMove(r.kind)).sort((a, b) => moveOf(a) - moveOf(b));
    const rises = rows.filter(r => r.change_pct >= bigMove(r.kind)).sort((a, b) => moveOf(b) - moveOf(a));
    if (drops[0]) {
        const r = drops[0];
        const impact = -moveOf(r) / before * 100;
        add({
            id: `drop:${r.symbol}`, tone: 'down', photo: 'stock market chart', priority: 70 + impact * 5,
            title: L('{0} fell {1} {2}.', r.name, pct(r.change_pct), period),
            meaning: [
                L('Your shares lost about {0} [[unrealized|on paper]] and are worth {1} now.', money(-moveOf(r)), money(r.value)),
                L('It is {0} of your portfolio, so your whole portfolio lost about {1} because of it.', pct(r.weight_pct), pct(impact)),
                r.pl_pct >= 0 ? L('Since you bought it, you are still up {0}.', pct(r.pl_pct)) : L('Since you bought it, you are down {0}.', pct(r.pl_pct)),
            ],
            options: [
                { label: L('Do nothing'), detail: L('If your reasons for buying still hold, a fall alone is not a reason to sell.') },
                { label: L('Look for the reason'), detail: L('Was it the whole market, or news about this company?'), action: 'news', symbol: r.symbol },
                { label: L('Ask yourself: would I buy it today?'), detail: L('If yes, keep it. If not, selling is an option, but it makes the loss final.') },
            ],
            history: { ticker: r.ticker, name: r.name, change: r.change_pct },
            lesson: r.pl_pct <= -15 ? 'sunkCost' : 'swings',
            ask: L('{0} fell {1} {2}. What could explain it, and what should I consider before doing anything?', r.name, pct(r.change_pct), period),
        });
    }
    if (rises[0]) {
        const r = rises[0];
        const heavy = r.weight_pct > 20;
        add({
            id: `rise:${r.symbol}`, tone: 'up', photo: 'stock market chart', priority: 40 + (moveOf(r) / before * 100) * 3,
            title: L('{0} rose {1} {2}.', r.name, pct(r.change_pct), period),
            meaning: [
                L('Your shares gained about {0} [[unrealized|on paper]] and are worth {1} now.', money(moveOf(r)), money(r.value)),
                L('It now makes up {0} of your portfolio.', pct(r.weight_pct)),
            ],
            options: [
                { label: L('Do nothing'), detail: L('A gain on paper can shrink again. A good run does not call for action.') },
                { label: L('Do not chase it'), detail: L('Buying more just because it rose is a common mistake: the rise is already in the price.') },
                heavy && { label: L('Watch its weight'), detail: L('It is now a big part of your money. Putting your next deposits elsewhere keeps the balance.') },
            ].filter(Boolean),
            history: { ticker: r.ticker, name: r.name, change: r.change_pct },
            lesson: heavy ? 'rebalancing' : 'swings',
            ask: L('{0} rose {1} {2}. Should I do anything about it?', r.name, pct(r.change_pct), period),
        });
    }

    const portfolioMove = before > 0 ? moved / before * 100 : 0;
    if (known && portfolioMove <= -bigMove('fund')) add({
        id: 'portfolio-drop', tone: 'down', photo: 'stormy sea', priority: 75,
        title: L('Your portfolio lost {0} {1}.', pct(portfolioMove), period),
        meaning: [
            L('That is about {0} less [[unrealized|on paper]]. Falls like this are part of investing, and most are forgotten a few months later.', money(-moved)),
            L('Nothing is lost until you sell. What matters is when you will need the money.'),
        ],
        options: [
            { label: L('Do nothing'), detail: L('Usually the best move for long-term money. Selling after a fall makes it final and risks missing the rebound.') },
            { label: L('Keep investing as planned'), detail: L('If you invest every month, this month buys at lower prices.') },
        ],
        lesson: 'timeInMarket',
        ask: L('My portfolio lost {0} {1}. Should I worry?', pct(portfolioMove), period),
    });

    const stocks = rows.filter(r => r.kind === 'stock');
    if (rows.length === 1 && stocks.length === 1) add({
        id: 'single', tone: 'warn', photo: 'eggs basket', priority: 65,
        title: L('All your money is in one stock: {0}.', rows[0].name),
        meaning: [
            L('Your result depends on a single company. If it has a bad year, nothing else in your portfolio softens the blow.'),
            L('Solid companies can fall 30% on one piece of bad news. Here that would be {0}.', money(rows[0].value * 0.3)),
        ],
        options: [
            { label: L('Add a broad fund next'), detail: L('Your next deposit into a world [[etf|ETF]] would spread your risk at once.'), action: 'explorer' },
            { label: L('Keep it as it is'), detail: L('Fine for a small amount you invest to learn.') },
        ],
        lesson: 'diversification',
        ask: L('All my money is in {0}. How risky is that, and how could I spread it?', rows[0].name),
    });
    else if (stocks[0]?.weight_pct > 25) {
        const r = stocks[0];
        const part = r.value / 3;
        const fee = bank ? orderFee(bank, part) : null;
        add({
            id: `heavy:${r.symbol}`, tone: 'warn', photo: 'eggs basket', priority: 60 + r.weight_pct / 2,
            title: L('{0} is {1} of your money.', r.name, pct(r.weight_pct)),
            meaning: [
                L('Solid companies can fall 30% on one piece of bad news. For {0}, that would cost about {1}, or {2} of everything you have invested.', r.name, money(r.value * 0.3), pct(r.weight_pct * 0.3)),
                L('A broad [[etf|ETF]] spreads the same money over hundreds of companies, so no single surprise can hurt that much.'),
            ],
            options: [
                { label: L('Put your next deposits elsewhere'), detail: L('The cheapest way to lower its [[weight|weight]]: no selling, no fee, no tax.') },
                { label: L('Keep it as it is'), detail: L('Fine if you know the company well and accept the risk.') },
                fee != null
                    ? { label: L('Sell a part'), detail: L('Selling a third ({0}) would cost about {1} in fees at {2}, and can trigger tax.', money(part), money(fee), bank.name) }
                    : { label: L('Sell a part'), detail: L('Selling costs a fee and can trigger tax. Choose your bank to see how much.'), action: 'bank' },
            ],
            lesson: 'diversification',
            ask: L('{0} is {1} of my portfolio. Is that too much, and what are my options?', r.name, pct(r.weight_pct)),
        });
    }

    const loser = [...rows].sort((a, b) => a.pl_pct - b.pl_pct)[0];
    if (loser.pl_pct <= -20 && !drops.includes(loser)) add({
        id: `loss:${loser.symbol}`, tone: 'down', photo: 'crossroads', priority: 55 + -loser.pl_pct / 2,
        title: L('{0} is {1} below what you paid.', loser.name, pct(loser.pl_pct)),
        meaning: [
            L('You put in {0}; it is worth {1} today. While you hold, the loss stays [[unrealized|on paper]]: it can shrink, or grow.', money(loser.cost), money(loser.value)),
            L('The market does not know [[costBasis|what you paid]]. What matters is what the company is likely to do from here.'),
        ],
        options: [
            { label: L('Ask yourself: would I buy it today?'), detail: L('If yes, holding makes sense. If not, waiting only to get back to your price is a trap.') },
            { label: L('Look for the reason'), detail: L('Check the news and whether the company itself changed.'), action: 'news', symbol: loser.symbol },
            { label: L('Sell and move on'), detail: L('It makes the loss final. In an ordinary account it can lower the tax on other gains.') },
        ],
        lesson: 'sunkCost',
        ask: L('{0} is down {1} since I bought it. Should I keep it or sell?', loser.name, pct(loser.pl_pct)),
    });

    const sumOf = test => rows.filter(test).reduce((s, r) => s + r.value, 0);
    const crypto = sumOf(r => r.kind === 'crypto');
    if (crypto / total > 0.1) add({
        id: 'crypto', tone: 'warn', photo: 'bitcoin', priority: 50 + crypto / total * 50 + ((comfortLevel() || 7) <= 3 ? 20 : 0),
        title: L('Crypto is {0} of your portfolio.', pct(crypto / total * 100)),
        meaning: [
            L('Bitcoin has lost more than 70% several times. If that happened again, you would lose about {0}.', money(crypto * 0.7)),
            L('Most guides keep crypto to a small slice of money you could lose without changing your life.'),
        ],
        options: [
            { label: L('Keep it if you can afford the loss'), detail: L('Ask yourself how a 70% fall would change your plans.') },
            { label: L('Put your next deposits elsewhere'), detail: L('Its share shrinks without selling anything.') },
        ],
        lesson: 'crypto',
        ask: L('Crypto is {0} of my portfolio. Is that too much for me?', pct(crypto / total * 100)),
    });

    const home = currencyCode();
    const foreign = sumOf(r => r.currency && r.currency !== home);
    if (foreign / total > 0.5) add({
        id: 'currency', tone: 'tip', photo: 'currency exchange', priority: 25,
        title: L('{0} of your money is priced in other currencies.', pct(foreign / total * 100)),
        meaning: [
            L('When those currencies move against yours ({0}), your investments gain or lose value even if their prices do not move. A 10% move would change your portfolio by about {1}.', home, money(foreign * 0.1)),
            L('Over many years it tends to matter less than the companies themselves.'),
        ],
        options: [
            { label: L('Do nothing'), detail: L('For long-term money, most investors simply accept it.') },
            { label: L('Know the alternative'), detail: L('Some ETFs remove most of the [[currencyRisk|currency risk]] for a small extra fee.') },
        ],
        lesson: 'currency',
        ask: L('Most of my money is in foreign currencies. What does that mean for me?'),
    });

    const amount = typicalOrder(inv);
    const fee = bank && amount ? orderFee(bank, amount) : null;
    if (fee != null && fee / amount >= 0.01) {
        const bigger = orderFee(bank, amount * 3);
        add({
            id: 'fees', tone: 'warn', photo: 'coins', priority: 45 + fee / amount * 1000,
            title: L('Your orders lose {0} to fees at {1}.', pct(fee / amount * 100), bank.name),
            meaning: [
                L('A typical order of yours, {0}, costs {1}. It must rise {2} just to pay back the fee to buy, and as much again when you sell.', money(amount), money(fee), pct(fee / amount * 100)),
            ],
            options: [
                { label: L('Make fewer, bigger orders'), detail: bigger != null ? L('Investing every three months instead, {0} at a time, would cost {1} per order, {2} of it.', money(amount * 3), money(bigger), pct(bigger / amount / 3 * 100)) : L('Investing every two or three months lowers the share lost to fees.') },
                { label: L('Compare banks'), detail: L('Online brokers often charge much less for small orders.'), action: 'bank' },
            ],
            lesson: 'fees',
            ask: L('My orders lose {0} to fees at {1}. How can I pay less?', pct(fee / amount * 100), bank.name),
        });
    }

    if (!inv.horizon || !inv.drop || !inv.cushion || !inv.debt) add({
        id: 'profile', tone: 'setup', photo: 'compass', priority: 30,
        title: L('Nemeris does not know your goals yet.'),
        meaning: [L('Whether a fall is a problem depends on you: your money today, when you need it and how you would react. A few quick questions let Nemeris fit every explanation to you.')],
        options: [{ label: L('Answer a few questions'), detail: L('It takes a minute, in Settings, Profile.'), action: 'profile' }],
        lesson: 'horizon',
    });
    else if (!bank) add({
        id: 'bank', tone: 'setup', photo: 'bank building', priority: 20,
        title: L('Nemeris does not know your bank yet.'),
        meaning: [L('Each bank charges differently: the same 500 € order can cost nothing or more than 5 €. Once Nemeris knows yours, it counts the real [[orderFee|cost of every order]].')],
        options: [{ label: L('Choose your bank'), detail: L('Pick it from the list, or type in its fees.'), action: 'bank' }],
        lesson: 'fees',
    });

    if (known && !found.some(s => s.priority >= 40)) add({
        id: 'calm', tone: 'calm', photo: 'calm lake', priority: 35,
        title: L('Nothing needs your attention.'),
        meaning: [L('Your investments moved within their usual range. On calm days the best move is usually no move at all.')],
        options: [
            { label: L('Do nothing'), detail: L('Really. Checking less often leads to fewer emotional decisions.') },
            { label: L('Learn something new'), detail: L('A short level in the Academy, with Nemeris.'), action: 'learn' },
        ],
        lesson: nextLevel()?.id || 'compounding',
    });

    return found.sort((a, b) => b.priority - a.priority);
}

/** How the whole portfolio moved over the period: { pct, amount }, or null before prices load. */
export function portfolioMove() {
    const { rows, total } = holdingRows();
    if (!rows.some(r => r.change_pct != null)) return null;
    const moved = rows.reduce((s, r) => s + moveOf(r), 0);
    return { pct: total - moved > 0 ? moved / (total - moved) * 100 : 0, amount: moved };
}

/* ── is this move unusual for this stock? Its own last two years answer it ── */
const TRADING_DAYS = { '1D': 1, '1W': 5, '1M': 21, '3M': 63, '6M': 126 };
const closesCache = new Map();

/** A sentence comparing the move with the same stretch of time over the last two years, or null. */
export async function howUsual({ ticker, name, change }) {
    const days = TRADING_DAYS[globalPeriod];
    if (!days || !ticker) return null;
    if (!closesCache.has(ticker)) closesCache.set(ticker, fetchCloses(ticker, '2y', '1d').catch(() => []));
    const closes = await closesCache.get(ticker);
    if (closes.length < days * 10) return null;
    let hits = 0, windows = 0;
    for (let i = days; i < closes.length; i++, windows++) {
        const m = (closes[i] / closes[i - days] - 1) * 100;
        if (change < 0 ? m <= change : m >= change) hits++;
    }
    const period = periodPhrase(globalPeriod);
    if (hits <= days) return change < 0
        ? L('{0} has rarely fallen this much {1} in the last two years: this is unusual for it.', name, period)
        : L('{0} has rarely risen this much {1} in the last two years: this is unusual for it.', name, period);
    const n = Math.max(2, Math.round(windows / hits));
    return change < 0
        ? L('For {0}, a fall this big {1} happened about 1 time in {2} over the last two years.', name, period, n)
        : L('For {0}, a rise this big {1} happened about 1 time in {2} over the last two years.', name, period, n);
}
