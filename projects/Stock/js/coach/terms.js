// Every word Nemeris may underline. Tapping one opens its full explanation (js/coach/explain.js):
// a plain definition, more detail, a worked example, the same idea with the user's own numbers when they help,
// related words and the lesson that teaches the idea behind it.
// Inside any text, [[key|shown words]] becomes a tappable word.
import { L, LOCALE } from '../i18n/i18n.js';
import { orderFee, custodyPerYear, formatMoney } from '../data/banks.js';

const num = (n, d = 1) => n.toLocaleString(LOCALE, { maximumFractionDigits: d });
const HORIZON_TEXT = { lt2: L('for less than 2 years'), '2to5': L('for 2 to 5 years'), '5to10': L('for 5 to 10 years'), gt10: L('for more than 10 years') };

/** Your biggest single stock, or your biggest line when you only hold funds. */
const biggest = c => c.rows.find(r => r.kind !== 'fund') || c.rows[0];
const share = (c, test) => c.total ? c.rows.filter(test).reduce((s, r) => s + r.value, 0) / c.total * 100 : 0;

export const TERMS = {
    dividend: {
        title: L('Dividend'),
        short: L('A share of the company profit paid to shareholders, usually once to four times a year.'),
        more: [
            L('To receive it, you must own the stock before the ex-dividend date. The cash reaches your account a few days later.'),
            L('On the ex-dividend date the price drops by about the dividend. It is not a bonus on top: it is part of your return, paid in cash instead of a higher price.'),
            L('Many [[etf|ETFs]] reinvest dividends for you (they are called accumulating), so your [[compounding|gains make gains]] with no fee to buy again.'),
        ],
        example: L('A stock at 50 € pays 2 € a year: a 4% yield. With 20 shares you receive 40 € a year, before tax.'),
        related: ['etf', 'compounding', 'cto'],
        lesson: 'dividends',
    },
    volatility: {
        title: L('Volatility'),
        short: L('How much the price jumps around. Higher volatility means bigger ups and bigger downs.'),
        more: [
            L('It is measured from the daily moves of the past year and given per year. A world [[etf|ETF]] is often around 15%, a single tech stock 30 to 50%, bitcoin 50 to 80%.'),
            L('Roughly, two years out of three end within that distance of the average result. With 30% volatility, a year at −20% is nothing unusual.'),
            L('High volatility is not bad in itself, but it needs time and calm nerves. That is why your [[horizon|time horizon]] matters.'),
        ],
        example: L('Two stocks both gained 8% last year. One got there smoothly; the other fell 25% in spring before recovering. Same result, very different ride: the second is more volatile.'),
        related: ['risk', 'drawdown', 'horizon'],
        lesson: 'swings',
    },
    risk: {
        title: L('Risk level'),
        short: L('A score from 1 (very calm) to 7 (very wild), based on how much prices moved over the past year. European fund documents use the same scale.'),
        more: [
            L('It uses the same bands as the risk indicator in European fund documents: 1 is close to a savings product, 4 is typical of a world stock index, 6 or 7 is a single volatile stock or crypto.'),
            L('Compare it with your [[comfort|comfort with risk]]. When your investments sit above it, a bad year can feel much worse than you expected.'),
        ],
        example: L('A world ETF usually sits at 4. A young tech stock can reach 6. Bitcoin is a 6 or a 7.'),
        yours: c => c.comfort && L('You said your comfort is {0} out of 7.', c.comfort),
        related: ['volatility', 'comfort', 'diversification'],
        lesson: 'horizon',
    },
    drawdown: {
        title: L('Worst drop'),
        short: L('The biggest fall from a high point to a later low. It shows how painful a rough patch was.'),
        more: [
            L('World stocks lost about a third in five weeks in early 2020, and more than half between 2007 and 2009.'),
            L('What matters is whether you could live through it without selling. People who sold near the bottom made the loss final; people who held got back to the previous high within months in 2020, and within a few years after 2009.'),
            L('A fall of 50% needs a rise of 100% to come back. That is why big drops matter more than small ones.'),
        ],
        example: L('A stock goes from 100 € to 60 €, then back to 90 €. Its worst drop is 40%, even though it is only 10% down today.'),
        yours: c => c.total > 0 && L('If your portfolio went through a 30% drop, it would show {0} less for a while.', c.money(c.total * 0.3)),
        related: ['volatility', 'bearMarket', 'unrealized'],
        lesson: 'timeInMarket',
    },
    diversification: {
        title: L('Diversification'),
        short: L('Spreading your money over different companies, sectors and countries, so one bad surprise hurts less.'),
        more: [
            L('Any company can fail, even a famous one. If it is 5% of your money, a collapse costs you 5%. If it is half your money, it costs half.'),
            L('Many stocks from the same [[sector|sector]] or country spread less than it seems, because they tend to fall together (high [[correlation|correlation]]).'),
            L('The simplest way to be spread out is a broad [[etf|ETF]], such as a world fund holding more than 1,000 companies in over 20 countries.'),
        ],
        example: L('Portfolio A holds three tech stocks. Portfolio B holds a world ETF. If tech falls 30%, A loses about 30% and B around 8%, because tech is roughly a quarter of the world index.'),
        yours: c => {
            const top = c.rows[0];
            return top && L('You hold {0} lines. The biggest, {1}, is {2}% of your money.', c.rows.length, top.name, num(top.weight_pct));
        },
        related: ['weight', 'etf', 'correlation', 'sector'],
        lesson: 'diversification',
    },
    sector: {
        title: L('Sector'),
        short: L('The kind of business a company is in, such as technology, health or energy.'),
        more: [
            L('Companies in the same sector often move together, because the same news hits them all: oil prices for energy, interest rates for banks, chip demand for tech.'),
            L('Five tech stocks are less spread out than one tech stock, one bank, one health company, one retailer and one energy company.'),
        ],
        example: L('When oil prices collapsed in 2020, almost every energy company fell at once, whatever its own quality.'),
        related: ['diversification', 'correlation'],
        lesson: 'diversification',
    },
    index: {
        title: L('Index'),
        short: L('A basket of big companies used as a yardstick for the market, such as the S&P 500 in the US or the CAC 40 in France.'),
        more: [
            L('An index is a list with rules: the 500 biggest US companies, the 40 biggest French ones, or about 1,400 large companies from rich countries for the MSCI World.'),
            L('You cannot buy an index itself, but an [[etf|ETF]] copies it for a small [[ter|yearly fee]].'),
            L('Comparing your results with an index tells you whether choosing your own stocks was worth the effort.'),
        ],
        example: L('If your stocks gained 6% this year while the MSCI World gained 12%, a simple world ETF would have done better with less work.'),
        related: ['etf', 'beatMarket', 'diversification'],
        lesson: 'etf',
    },
    unrealized: {
        title: L('Gain on paper'),
        short: L('The gain or loss on stocks you still hold. It becomes real money only when you sell.'),
        more: [
            L('It is today\'s value minus what you paid. It changes with every price move, so it can grow, shrink or turn into a loss before you sell.'),
            L('In most countries no tax is due on it while you hold. Tax comes when you sell and the gain becomes [[realized|cashed in]].'),
        ],
        example: L('You bought 10 shares at 40 €. They now trade at 46 €: your gain on paper is 60 €. If the price drops back to 40 € tomorrow, it is gone, without you doing anything.'),
        yours: c => {
            const r = [...c.rows].sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))[0];
            return r && L('Right now {0} shows {1} on paper ({2}%).', r.name, c.money(r.pl), num(r.pl_pct));
        },
        related: ['realized', 'costBasis', 'volatility'],
        lesson: 'swings',
    },
    realized: {
        title: L('Cashed-in gain'),
        short: L('A gain or loss you locked in by selling.'),
        more: [
            L('Once you sell, the result is final: the money is back in your account and the stock\'s next moves no longer affect you.'),
            L('This is usually when tax is due. In France, gains in an ordinary account ([[cto|CTO]]) pay a 31.4% flat tax in 2026; in a [[pea|PEA]] older than 5 years, only the 18.6% social levies.'),
            L('A loss you lock in can lower the tax on other gains in an ordinary account, but the money is gone for good.'),
        ],
        example: L('You bought for 1,000 € and sold for 1,300 €: a 300 € cashed-in gain. In a French CTO, about 94 € of it goes to tax.'),
        related: ['unrealized', 'cto', 'pea'],
        lesson: 'sunkCost',
    },
    signal: {
        title: L('Signal'),
        short: L('A reading of recent price moves by fixed rules. It describes the trend, it does not predict the future.'),
        more: [
            L('Nemeris combines classic gauges such as the [[rsi|RSI]], the [[macd|MACD]] and [[average|moving averages]] into one score.'),
            L('These tools describe what the price has done. Research finds their power to predict weak and unstable once fees are counted, so read a signal like a weather report, never as a reason to buy or sell on its own.'),
        ],
        example: L('A "buy" signal on a stock that rose for three weeks says "the trend is up". It does not say the rise will last.'),
        related: ['rsi', 'macd', 'average'],
        lesson: 'timeInMarket',
    },
    rsi: {
        title: 'RSI',
        short: L('Relative Strength Index, from 0 to 100. Above 70 the price rose fast and may pause. Below 30 it fell fast and may bounce.'),
        more: [
            L('It compares the size of recent up days with recent down days, usually over 14 days.'),
            L('A strong trend can keep it above 70 or below 30 for weeks, so it tells you about speed, not about a turning point.'),
        ],
        example: L('A stock rose 9 days out of the last 10: its RSI is around 80. It went up fast; that does not mean it must fall.'),
        related: ['signal', 'macd'],
    },
    macd: {
        title: 'MACD',
        short: L('A trend gauge built from two moving averages. When its line crosses above the signal line, momentum is turning up.'),
        more: [
            L('It is the gap between a 12-day and a 26-day [[average|average]] of the price. The signal line is a 9-day average of that gap.'),
            L('Crossings are frequent and many are false alarms, especially when the price moves sideways.'),
        ],
        example: L('After weeks of decline, the MACD line crosses above its signal line: the fall is slowing down. It may or may not turn into a rise.'),
        related: ['signal', 'average', 'rsi'],
    },
    average: {
        title: L('Moving average'),
        short: L('The average price over the last days. A price above its average suggests an uptrend.'),
        more: [
            L('The 50-day and 200-day averages are the most watched. They smooth out the daily noise so the direction is easier to see.'),
            L('When the price crosses its average the trend may be changing, but false crossings are common.'),
        ],
        example: L('Over the last 200 days a stock averaged 80 €. It trades at 92 € today, 15% above its average: a sign of an uptrend.'),
        related: ['signal', 'macd'],
    },
    stoploss: {
        title: 'Stop loss',
        short: L('A price at which you would sell to limit a loss.'),
        more: [
            L('Many banks let you place it as an order that triggers by itself. It caps the damage if a stock collapses.'),
            L('Set too close, normal [[volatility|price swings]] trigger it and you sell at a low point for nothing. Long-term investors in broad funds rarely use one.'),
        ],
        example: L('You buy at 50 € and set a stop at 42 €. If the price touches 42 €, your shares are sold and the loss stays near 16%, plus [[orderFee|fees]].'),
        related: ['takeprofit', 'volatility', 'limitOrder'],
    },
    takeprofit: {
        title: 'Take profit',
        short: L('A price at which you would sell to lock in a gain.'),
        more: [L('It turns a gain on paper into a [[realized|cashed-in gain]]. It also means you miss any rise beyond that price.')],
        example: L('You buy at 50 € with a target of 65 €. When the price reaches it, you sell and lock in 30%, before fees and tax.'),
        related: ['stoploss', 'realized'],
    },
    simulation: {
        title: 'Simulation',
        short: L('Thousands of possible futures built from how the price moved in the past. It shows a range, not a promise.'),
        more: [
            L('Nemeris replays the past daily moves of the stock in random orders to build many possible paths, then shows the middle one and the bad and good cases.'),
            L('It assumes the future looks like the last two years. A crisis, a takeover or a scandal can push the real result outside the range.'),
        ],
        example: L('If the middle path ends at +6% and the bad case at −18%, most simulated futures gain a little, and only 1 in 20 does worse than −18%.'),
        related: ['lossChance', 'volatility', 'horizon'],
        lesson: 'horizon',
    },
    lossChance: {
        title: L('Chance of a loss'),
        short: L('In how many of the simulated futures you end up with less than you put in.'),
        more: [
            L('For a broad index it usually shrinks the longer you hold, because good years have time to outweigh bad ones.'),
            L('For a single volatile stock it can stay high even over many years.'),
        ],
        example: L('A 35% chance of a loss over 1 year means: in 35 of every 100 simulated futures, you would have less than you put in after a year.'),
        related: ['simulation', 'horizon'],
        lesson: 'horizon',
    },
    beta: {
        title: 'Beta',
        short: L('How much a stock tends to move when the market moves. 1 means like the market, 2 means twice as much.'),
        more: [
            L('A beta of 0.5 means the stock usually moves half as much as the market: if the market falls 10%, it tends to fall about 5%.'),
            L('Beta only covers moves linked to the market. A company can still collapse on its own news, whatever its beta.'),
        ],
        example: L('With a beta of 1.5, a 10% market fall usually means about 15% for this stock.'),
        related: ['volatility', 'index', 'correlation'],
    },
    sharpe: {
        title: L('Sharpe ratio'),
        short: L('Return earned for each unit of risk taken. Higher is better, above 1 is good.'),
        more: [L('It is the return above a safe rate, divided by the [[volatility|volatility]]. It lets you compare a calm investment with a wild one fairly.')],
        example: L('Fund A made 8% with 10% volatility, fund B made 10% with 25%. With a 2% safe rate, A scores 0.6 and B 0.32: A paid you more for each unit of risk.'),
        related: ['volatility', 'risk'],
    },
    correlation: {
        title: L('Correlation'),
        short: L('How much two stocks move together. Close to 1 means they rise and fall together, so owning both spreads risk less.'),
        more: [
            L('It goes from −1 (always opposite) to 1 (always together). Two big US tech stocks are often between 0.6 and 0.8.'),
            L('In a crisis many correlations rise: things that usually move apart fall together.'),
        ],
        example: L('Owning two oil companies is almost like owning one big oil company. One oil company and one health company spread your risk much more.'),
        related: ['diversification', 'sector'],
        lesson: 'diversification',
    },
    comfort: {
        title: L('Your comfort with risk'),
        short: L('How much ups and downs you said you can live with, on the same 1 to 7 scale. Set it in Settings, Profile.'),
        more: [
            L('It comes from two answers: what you would do after a 20% fall, and when you will need the money.'),
            L('When your investments are much wilder than your comfort, a bad year is more likely to push you into selling at the worst moment.'),
        ],
        example: L('Comfort 3 with a portfolio at [[risk|risk level]] 6: a normal bad year could feel like a disaster. Broader funds close the gap and make it easier to hold on.'),
        yours: c => (c.comfort ? L('Your comfort is {0} out of 7.', c.comfort) : L('You have not answered the questions yet. They are in Settings, Profile.')),
        related: ['risk', 'horizon'],
        lesson: 'horizon',
    },
    beatMarket: {
        title: L('Chance of beating the market'),
        short: L('How likely the AI thinks this stock does better than a world index over the next month. 50% means no edge.'),
        more: [
            L('It comes from a model trained on past prices. Markets are hard to predict, so values close to 50% are normal and anything far from it deserves suspicion.'),
            L('Even most professional fund managers fail to beat their index over 10 years, according to the S&P SPIVA reports.'),
        ],
        example: L('58% means the model sees a slight edge. Over many such calls it might be right a bit more often than not, but any single month stays close to a coin toss.'),
        related: ['index', 'signal'],
        lesson: 'singleStocks',
    },
    isin: {
        title: 'ISIN',
        short: L('An international ID for a security, 12 characters long.'),
        more: [
            L('The first two letters are the country where it is registered: FR for France, IE for Ireland, where many ETFs are based.'),
            L('Searching by ISIN at your bank is the surest way to buy exactly the right fund, since many have similar names.'),
        ],
        example: L('FR0000120271 is TotalEnergies. IE00B4L5Y983 is an iShares MSCI World ETF.'),
        related: ['etf'],
    },
    etf: {
        title: L('ETF (index fund)'),
        short: L('A fund that copies an index and trades like a stock. One share gives you a small piece of every company in it.'),
        more: [
            L('ETF means exchange-traded fund. You buy it at your bank like a stock, at the market price.'),
            L('Its [[ter|yearly fee]] is usually 0.05 to 0.4%, far less than most traditional funds.'),
            L('Accumulating ETFs reinvest the [[dividend|dividends]] for you; distributing ones pay them out. Many world ETFs fit in a French [[pea|PEA]].'),
        ],
        example: L('Put 100 € in a world ETF holding about 1,400 companies: around 5 € each goes to Nvidia, Apple and Microsoft, and the rest is spread over all the others.'),
        yours: c => {
            const funds = share(c, r => r.kind === 'fund');
            return c.rows.length > 0 && L('Funds make up {0}% of your portfolio.', num(funds, 0));
        },
        related: ['index', 'ter', 'diversification'],
        lesson: 'etf',
    },
    ter: {
        title: L('Yearly fund fee'),
        short: L('What a fund takes each year to run, as a share of your money. It comes out of the price, so you never see a bill.'),
        more: [
            L('It is also called ongoing charges, TER or OCF. A world ETF often charges 0.1 to 0.3% a year; many funds sold in bank branches charge 1.5 to 2%.'),
            L('Because it is taken every year on everything you hold, it grows with [[compounding|compounding]] too, against you.'),
        ],
        example: L('10,000 € growing 6% a year for 25 years ends near 40,800 € with a 0.2% yearly fee, and near 27,300 € with a 1.8% fee: about 13,500 € apart.'),
        yours: c => {
            const funds = c.rows.filter(r => r.kind === 'fund').reduce((s, r) => s + r.value, 0);
            return funds > 0 && L('Your funds are worth {0}. At 0.2% a year they cost about {1} a year; at 1.8%, about {2}.', c.money(funds), c.money(funds * 0.002), c.money(funds * 0.018));
        },
        related: ['etf', 'orderFee', 'compounding'],
        lesson: 'fees',
    },
    orderFee: {
        title: L('Order fee'),
        short: L('What your bank charges each time you buy or sell.'),
        more: [
            L('It can be a fixed amount, a share of the order, or both, often with a minimum. Small orders suffer most from fixed fees and minimums.'),
            L('A round trip costs twice: once to buy, once to sell. Foreign stocks can add a [[fxFee|currency conversion fee]].'),
        ],
        example: L('With a 2 € minimum, a 100 € order loses 2% on day one; a 1,000 € order loses 0.2%.'),
        yours: c => {
            if (!c.bank) return L('Choose your bank in Settings, Profile, and Nemeris will show what your own orders cost.');
            const amount = c.inv.monthly > 0 ? Math.round(c.inv.monthly) : 500;
            const fee = orderFee(c.bank, amount);
            return fee != null && L('At {0}, a {1} order costs {2}, which is {3}% of it.', c.bank.name, c.money(amount), c.money(fee), num(fee / amount * 100, 2));
        },
        related: ['custody', 'fxFee', 'ter'],
        lesson: 'fees',
    },
    custody: {
        title: L('Custody fee'),
        short: L('A yearly fee some banks charge just for keeping your investments.'),
        more: [
            L('It can be a share of your portfolio, a fixed amount per line, or both. Many online brokers charge none.'),
            L('In France, custody fees on a [[pea|PEA]] are capped by law at 0.4% a year.'),
        ],
        example: L('A 0.25% custody fee on 20,000 € costs 50 € every year, whether your investments rise or fall.'),
        yours: c => {
            if (!c.bank || !c.total) return null;
            const fee = custodyPerYear(c.bank, c.total, c.rows.length);
            if (fee == null) return null;
            return fee === 0 ? L('{0} charges no custody fee.', c.bank.name) : L('At {0}, keeping your portfolio costs about {1} a year.', c.bank.name, c.money(fee));
        },
        related: ['orderFee', 'ter'],
        lesson: 'fees',
    },
    fxFee: {
        title: L('Currency conversion fee'),
        short: L('What your bank takes to turn your money into dollars or another currency to buy a foreign stock, and back when you sell.'),
        more: [
            L('It is usually 0.1 to 1% of the amount, both ways. It is often hidden in the exchange rate rather than shown as a fee.'),
            L('ETFs listed in euros that hold US companies avoid it: the fund handles the currency, although you still carry [[currencyRisk|currency risk]].'),
        ],
        example: L('Buying 1,000 € of a US stock with a 0.5% conversion fee costs 5 €, and about 5 € more when you sell.'),
        yours: c => c.bank?.fx != null && L('At {0}, conversion costs {1}%: {2} on a {3} order.', c.bank.name, num(c.bank.fx, 2), c.money(10 * c.bank.fx), c.money(1000)),
        related: ['currencyRisk', 'orderFee'],
        lesson: 'currency',
    },
    currencyRisk: {
        title: L('Currency risk'),
        short: L('The chance that exchange rates lower what your foreign investments are worth in your own money.'),
        more: [
            L('A US stock is priced in dollars. If the dollar falls 10% against the euro, your shares are worth about 10% fewer euros, even if their dollar price did not move.'),
            L('It works both ways and tends to matter less over long periods than the companies themselves. Most world ETFs carry it; "hedged" versions remove most of it for a small extra cost.'),
        ],
        example: L('Your US stock rises 10% in dollars, but the dollar loses 8% against the euro: in euros you gain only about 1%.'),
        yours: c => {
            if (!c.home || !c.rows.length) return null;
            const foreign = share(c, r => r.currency && r.currency !== c.home);
            return L('About {0}% of your money is in investments priced in another currency than yours ({1}).', num(foreign, 0), c.home);
        },
        related: ['fxFee', 'diversification'],
        lesson: 'currency',
    },
    weight: {
        title: L('Weight in your portfolio'),
        short: L('The share of your money that sits in one investment.'),
        more: [
            L('It tells you how much one line can move everything: a line weighing 30% that falls 20% pulls your whole portfolio down 6%.'),
            L('Weights drift on their own, because what rises takes more room. Checking them once or twice a year and [[rebalancing|rebalancing]] keeps you in control.'),
            L('A common rule of thumb keeps each single stock under 5 to 10%. A broad [[etf|ETF]] can weigh much more, since it is already spread out.'),
        ],
        example: L('10,000 € in total, 2,500 € in one stock: it weighs 25%. If it halves, you lose 1,250 €, an eighth of everything.'),
        yours: c => {
            const r = biggest(c);
            return r && L('{0} weighs {1}% of your portfolio. A 20% fall in it would cost about {2}, or {3}% of everything.', r.name, num(r.weight_pct), c.money(r.value * 0.2), num(r.weight_pct * 0.2));
        },
        related: ['diversification', 'rebalancing'],
        lesson: 'diversification',
    },
    costBasis: {
        title: L('Average buying price'),
        short: L('What you paid per share, on average over all your purchases.'),
        more: [
            L('If you bought 10 shares at 40 € and 10 more at 60 €, your average price is 50 €.'),
            L('It measures your [[unrealized|gain on paper]] and matters for tax, but the market ignores it: it says nothing about where the price goes next. Waiting to be "back to even" before selling is a classic trap.'),
        ],
        example: L('Average price 50 €, price today 44 €: you are 12% down on paper. The useful question is not "when will it be back at 50 €?" but "would I buy it at 44 € today?".'),
        yours: c => {
            const r = [...c.rows].sort((a, b) => a.pl_pct - b.pl_pct)[0];
            return r && L('Your average price for {0} is {1}; it trades at {2} today.', r.name, formatMoney(r.avg_cost, r.cost_currency), formatMoney(r.price, r.currency));
        },
        related: ['unrealized', 'realized'],
        lesson: 'sunkCost',
    },
    compounding: {
        title: L('Compounding'),
        short: L('Earning gains on your past gains. Over long periods it does most of the work.'),
        more: [
            L('At 7% a year, money doubles in about 10 years, grows about 4 times in 20 and about 7.6 times in 30.'),
            L('It works on costs too: a fee taken every year compounds against you. And it needs time, which is why starting early matters more than starting big.'),
        ],
        example: L('Ana invests 200 € a month from 25 to 35, then stops. Ben invests 200 € a month from 35 to 65. At 7% a year, at 65 Ana has about 260,000 € and Ben about 234,000 €, although Ben put in three times more.'),
        yours: c => c.total > 0 && L('If your {0} grew 7% a year with nothing added, it would be about {1} in 10 years and {2} in 20. That is a long-run stock market average, not a promise.', c.money(c.total), c.money(c.total * 1.07 ** 10), c.money(c.total * 1.07 ** 20)),
        related: ['horizon', 'ter', 'dca'],
        lesson: 'compounding',
    },
    rebalancing: {
        title: L('Rebalancing'),
        short: L('Bringing your portfolio back to the split you chose, after some parts grew faster than others.'),
        more: [
            L('Without it, your winners slowly take over and your portfolio gets riskier than you planned.'),
            L('The cheapest way is to point new money at what is underweight. Selling works too, but costs [[orderFee|fees]] and can trigger tax.'),
        ],
        example: L('You chose 80% world ETF and 20% single stocks. After a great year the stocks are at 35%. Putting your next deposits into the ETF brings you back toward 80/20 without selling anything.'),
        related: ['weight', 'diversification', 'dca'],
        lesson: 'rebalancing',
    },
    horizon: {
        title: L('Time horizon'),
        short: L('How long you can leave the money invested before you need it.'),
        more: [
            L('The longer it is, the more ups and downs you can ride out. World stocks have lost money in about one year out of five, but losses over 10 years have been rare, though not impossible: US stocks were roughly flat through the 2000s.'),
            L('Money you need within 2 years is safer in savings. Money for 10 years or more can take bigger [[volatility|swings]].'),
        ],
        example: L('Saving for a flat deposit in 18 months: a 30% fall a few months before could ruin the plan. Saving for retirement in 25 years: the same fall is a bump along the way.'),
        yours: c => HORIZON_TEXT[c.inv.horizon] && L('You said you can leave the money invested {0}.', HORIZON_TEXT[c.inv.horizon]),
        related: ['risk', 'emergencyFund', 'comfort'],
        lesson: 'horizon',
    },
    pea: {
        title: L('PEA (French stock savings plan)'),
        short: L('A French account for European stocks and many world ETFs, with lower tax after 5 years.'),
        more: [
            L('You can put in up to 150,000 €. After 5 years, withdrawals only pay the social levies (18.6% in 2026) instead of the 31.4% flat tax.'),
            L('It cannot hold US stocks bought directly or crypto, but many world ETFs are eligible. Withdrawing before 5 years usually closes the plan.'),
            L('By law, order fees are capped at 0.5% online and custody at 0.4% a year.'),
        ],
        example: L('A 10,000 € gain taken from a PEA older than 5 years costs 1,860 € in social levies. The same gain in a CTO costs 3,140 €.'),
        related: ['cto', 'etf', 'realized'],
        lesson: 'accounts',
    },
    cto: {
        title: L('CTO (ordinary account)'),
        short: L('A standard French investment account: anything can go in, with no limit, but gains pay the 31.4% flat tax in 2026.'),
        more: [
            L('It can hold any stock, ETF or bond from any country. Tax is due on [[dividend|dividends]] each year and on gains when you sell.'),
            L('Losses you lock in can be set against gains for up to 10 years.'),
        ],
        example: L('You sell US shares with a 1,000 € gain: about 314 € goes to tax, unless you have losses to set against it.'),
        related: ['pea', 'realized'],
        lesson: 'accounts',
    },
    crypto: {
        title: 'Crypto',
        short: L('Digital currencies such as bitcoin, traded online with no company or central bank behind them.'),
        more: [
            L('Their price depends only on what buyers will pay. Bitcoin has lost more than 70% several times, and smaller coins often vanish.'),
            L('They earn no profit and pay no [[dividend|dividend]], so there is no business to value. Most guides keep them to a small slice you can afford to lose.'),
        ],
        example: L('1,000 € of bitcoin bought at the end of 2021 was worth less than 400 € a year later.'),
        yours: c => {
            const w = share(c, r => r.kind === 'crypto');
            return w > 0 && L('Crypto is {0}% of your portfolio.', num(w));
        },
        related: ['volatility', 'risk'],
        lesson: 'crypto',
    },
    inflation: {
        title: L('Inflation'),
        short: L('Prices in general rising over time, so the same money buys less.'),
        more: [
            L('At 2% inflation prices double in about 35 years. Money left on a current account loses that much buying power every year.'),
            L('That is why long-term savings need to earn more than inflation. Over long periods stocks have; cash has not.'),
        ],
        example: L('With 3% inflation, 10,000 € kept as cash for 10 years buys what about 7,400 € buys today.'),
        related: ['compounding', 'horizon'],
        lesson: 'compounding',
    },
    emergencyFund: {
        title: L('Emergency savings'),
        short: L('Cash kept aside for surprises, so you never have to sell investments at a bad time.'),
        more: [
            L('A common guideline is three to six months of spending, on a savings account you can reach at once: in France a Livret A, elsewhere an easy-access savings account protected by the deposit guarantee.'),
            L('Without it, a broken car or a lost job during a market fall can force you to sell at a loss.'),
        ],
        example: L('If you spend 1,500 € a month, aim for 4,500 to 9,000 € of savings before putting more into stocks.'),
        related: ['horizon', 'bearMarket'],
        lesson: 'cushion',
    },
    limitOrder: {
        title: L('Limit order and market order'),
        short: L('A market order buys now at the current price. A limit order only buys at your price or better.'),
        more: [
            L('Market orders are simple and fill at once, but in a fast market or on a rarely traded stock you can pay more than you saw.'),
            L('A limit order protects your price but may never fill if the market does not get there.'),
        ],
        example: L('A stock shows 20.10 €. A limit buy at 20.00 € waits until someone sells at 20.00 € or less. A market order buys right away at about 20.10 €.'),
        related: ['orderFee', 'stoploss'],
    },
    bearMarket: {
        title: L('Market crash'),
        short: L('A big, broad fall in prices. A fall of 20% or more from a high is called a bear market.'),
        more: [
            L('They come every few years: 2000, 2008, 2020 and 2022 are recent ones. They feel endless while they last; so far markets have always recovered, sometimes in months, sometimes in years.'),
            L('The costly move is selling after the fall, when fear is highest. Rules set in advance, like keeping [[emergencyFund|emergency savings]] and [[dca|investing every month]], help you hold on.'),
        ],
        example: L('In March 2020 world stocks fell about a third in five weeks. Someone who kept investing every month through it was ahead by the end of the year.'),
        related: ['drawdown', 'dca', 'volatility'],
        lesson: 'timeInMarket',
    },
    dca: {
        title: L('Investing every month'),
        short: L('Putting the same amount in at regular times, whatever the market does.'),
        more: [
            L('You buy more shares when prices are low and fewer when they are high, and you never have to guess the right moment.'),
            L('Investing a lump sum at once has done slightly better on average, because markets rise more often than they fall. Monthly investing is easier to stick with and fits a salary.'),
            L('Watch the [[orderFee|order fees]]: with a fixed fee, small monthly orders can lose a lot to them.'),
        ],
        example: L('200 € a month: at 100 € a share you get 2 shares, at 80 € you get 2.5. Your average price, 88.89 €, ends below the average of the two prices.'),
        yours: c => {
            if (!(c.inv.monthly > 0)) return null;
            const fee = c.bank ? orderFee(c.bank, c.inv.monthly) : null;
            return fee == null
                ? L('You said you can invest {0} a month.', c.money(c.inv.monthly))
                : L('You said you can invest {0} a month. At {1}, each of those orders costs {2} ({3}%).', c.money(c.inv.monthly), c.bank.name, c.money(fee), num(fee / c.inv.monthly * 100, 2));
        },
        related: ['compounding', 'orderFee', 'bearMarket'],
        lesson: 'timeInMarket',
    },
};
