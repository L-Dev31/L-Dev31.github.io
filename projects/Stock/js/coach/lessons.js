// The ideas a new investor needs, each taught when a real situation calls for it:
// one sentence to remember, a short explanation, an example with the user's numbers, and one check question.
// Figures come from the sources listed in knowledge/nemeris.md.
import { L } from '../i18n/i18n.js';

export const LESSONS = {
    swings: {
        title: L('Prices move every day'),
        idea: L('Ups and downs are normal. A fall only becomes a loss if you sell.'),
        body: [
            L('A price changes all day because buyers and sellers keep changing their minds. Even solid companies often lose 10% or more in a few weeks, then recover.'),
            L('As long as you keep the shares, a fall is a [[unrealized|loss on paper]]. It becomes real only when you sell.'),
        ],
        quiz: {
            q: L('Your stock fell 8% this week and you still hold it. What have you lost for good?'),
            options: [L('8% of that money'), L('Nothing yet: it is a loss on paper'), L('It depends on the dividend')],
            answer: 1,
            why: L('While you hold, the price can come back, or not. The loss becomes real only when you sell.'),
        },
    },
    diversification: {
        title: L('Spreading your money'),
        idea: L('Never let one company decide your future: spread your money.'),
        body: [
            L('If one company is a big part of your money, one bad surprise, like a scandal or a failed product, can cost you a lot.'),
            L('A broad index fund ([[etf|ETF]]) holds hundreds of companies at once, so no single one can sink it. Most people build their base with one, then add single stocks in small amounts.'),
        ],
        quiz: {
            q: L('Which of these is the most spread out?'),
            options: [L('One stock you know well'), L('A world index ETF'), L('Three tech stocks')],
            answer: 1,
            why: L('A world ETF holds more than a thousand companies in many countries and sectors. Three tech stocks still depend on one industry.'),
        },
    },
    etf: {
        title: L('What an ETF is'),
        idea: L('An ETF is a basket of many stocks you buy in one go.'),
        body: [
            L('An ETF (exchange-traded fund) copies an [[index|index]], such as the MSCI World and its 1,400 or so large companies. One share gives you a small piece of all of them.'),
            L('Its [[ter|yearly cost]] is usually low, often 0.1 to 0.4%. It is the simplest way to own the whole market.'),
        ],
        quiz: {
            q: L('When you buy one share of a world ETF, you own...'),
            options: [L('A tiny part of many companies'), L('A share of the bank that sells it'), L('A savings account')],
            answer: 0,
            why: L('The ETF holds the companies of its index. Your share is a slice of that whole basket.'),
        },
    },
    fees: {
        title: L('What fees really cost'),
        idea: L('Fees are the one cost you control, and they add up.'),
        body: [
            L('A 2 € [[orderFee|order fee]] is 0.2% of a 1,000 € order but 2% of a 100 € order: the stock must rise 2% just to pay it back.'),
            L('Yearly fees matter even more over time. At 7% a year, a 1% yearly fee leaves you about a quarter less after 30 years.'),
        ],
        quiz: {
            q: L('With a fixed 2 € fee, which order loses the smallest share to fees?'),
            options: ['100 €', '500 €', L('2,000 €')],
            answer: 2,
            why: L('2 € is 2% of 100 €, 0.4% of 500 € and 0.1% of 2,000 €. Fewer, bigger orders cost less.'),
        },
    },
    sunkCost: {
        title: L('Judge the future, not your buying price'),
        idea: L('Ask "would I buy it today?", not "when will I get back to even?".'),
        body: [
            L('Many people keep a falling stock only to get back to what they paid, and sell their winners too early. Studies show this habit costs money.'),
            L('The market does not know [[costBasis|what you paid]]. The useful question is whether this stock still deserves your money today.'),
        ],
        quiz: {
            q: L('You bought at 50 €, it is now 35 €. What matters most for your decision?'),
            options: [L('Getting back to 50 €'), L('Whether you would buy it today at 35 €'), L('How long you have held it')],
            answer: 1,
            why: L('Your buying price is in the past. Only the company\'s future matters for what the stock does next.'),
        },
    },
    rebalancing: {
        title: L('Keeping your balance'),
        idea: L('Point new money at what is underweight instead of selling.'),
        body: [
            L('What rises takes more and more [[weight|room in your portfolio]]. Rebalancing means bringing it back to the split you chose.'),
            L('The cheapest way is to put your next deposits into what is underweight. Selling costs fees and can trigger tax.'),
        ],
        quiz: {
            q: L('One stock grew to 40% of your portfolio. What is the cheapest way to rebalance?'),
            options: [L('Sell half of it today'), L('Put your next deposits elsewhere'), L('Buy more of it')],
            answer: 1,
            why: L('New money lowers its weight without any selling fee or tax.'),
        },
    },
    timeInMarket: {
        title: L('Staying invested'),
        idea: L('Time in the market beats trying to time it.'),
        body: [
            L('Nobody can reliably guess the next rise or fall. Over 20 years, missing just the 10 best days cut the yearly return almost in half.'),
            L('The best days often come right after the worst ones, so people who sell in a [[bearMarket|crash]] usually miss the rebound.'),
        ],
        quiz: {
            q: L('The market just fell 10%. For money you will not need for years, history suggests...'),
            options: [L('Sell now, buy back later'), L('Stay invested'), L('Stop investing for good')],
            answer: 1,
            why: L('Falls are part of the deal. Selling locks in the loss and risks missing the recovery.'),
        },
    },
    singleStocks: {
        title: L('The odds of picking stocks'),
        idea: L('Most single stocks end up doing worse than the market as a whole.'),
        body: [
            L('Over the long run, a few huge winners carry the stock market while most single stocks do worse than a simple [[index|index]] fund.'),
            L('Picking stocks can be fun and can work, but keep it to a share of your money you can afford to see go wrong.'),
        ],
        quiz: {
            q: L('Over decades, what share of single US stocks did worse than safe Treasury bills?'),
            options: [L('About 1 in 10'), L('About 1 in 3'), L('More than half')],
            answer: 2,
            why: L('About 57% of US stocks returned less than one-month Treasury bills over their lifetime (Bessembinder, 2018).'),
        },
    },
    horizon: {
        title: L('When you need the money'),
        idea: L('Money you need within 2 years should not be in stocks.'),
        body: [
            L('Stocks can lose 30% or more in a [[bearMarket|bad year]] and take years to recover. That is fine for money you will leave for 5 to 10 years.'),
            L('For money you need soon, such as a car or a deposit, a savings account is the calm choice. Keep [[emergencyFund|emergency savings]] there too.'),
        ],
        quiz: {
            q: L('You need 5,000 € for a car in 8 months. Where should it be?'),
            options: [L('In stocks, to grow it'), L('In a savings account'), L('In crypto')],
            answer: 1,
            why: L('Over 8 months stocks can easily be down 20%. Money with a near date belongs somewhere stable.'),
        },
    },
    compounding: {
        title: L('Gains that make gains'),
        idea: L('Time is your best friend: gains earn gains.'),
        body: [
            L('If your money earns 7% a year, it roughly doubles in 10 years and grows about 4 times in 20, because each year\'s gains also earn gains.'),
            L('That is why starting early, even with [[dca|small monthly amounts]], matters more than finding the perfect stock.'),
        ],
        quiz: {
            q: L('1,000 € growing 7% a year becomes about how much in 10 years?'),
            options: [L('1,700 €'), L('2,000 €'), L('7,000 €')],
            answer: 1,
            why: L('1.07 multiplied by itself 10 times is about 1.97: the gains of each year add up on top of each other.'),
        },
    },
    currency: {
        title: L('Foreign stocks and currencies'),
        idea: L('A foreign stock also moves with its currency.'),
        body: [
            L('If you buy US stocks with euros, your result also depends on the dollar: that is [[currencyRisk|currency risk]]. If the dollar falls 10% against the euro, your US stocks lose about 10% in euros even if their price did not move.'),
            L('Over long periods this often evens out, but it adds ups and downs along the way.'),
        ],
        quiz: {
            q: L('Your US stock is flat in dollars and the dollar fell 5% against the euro. In euros you are...'),
            options: [L('Flat'), L('Down about 5%'), L('Up about 5%')],
            answer: 1,
            why: L('Your shares are worth the same number of dollars, but each dollar buys 5% fewer euros.'),
        },
    },
    crypto: {
        title: L('Crypto\'s wild swings'),
        idea: L('Keep crypto to money you could lose without changing your life.'),
        body: [
            L('Bitcoin has [[volatility|lost more than 70%]] several times, and smaller coins often disappear. It can also rise very fast.'),
            L('Most guides keep it to a small slice of a portfolio, never money you need.'),
        ],
        quiz: {
            q: L('Which is the most sensible way to own crypto?'),
            options: [L('A small slice you can afford to lose'), L('Your emergency savings'), L('A loan, to buy more')],
            answer: 0,
            why: L('With drops of 70% in its history, crypto only belongs in money you could lose.'),
        },
    },
    dividends: {
        title: L('How dividends work'),
        idea: L('A dividend is cash from the company, but the price drops by about the same amount.'),
        body: [
            L('Some companies share part of their profit with shareholders, once to four times a year. You get it if you hold the stock before the [[dividend|ex-dividend date]].'),
            L('On that date the price falls by about the dividend: it is not free money, it is part of your return.'),
        ],
        quiz: {
            q: L('A stock at 100 € pays a 3 € dividend. Just after the ex-date, its price is about...'),
            options: ['103 €', '100 €', '97 €'],
            answer: 2,
            why: L('The 3 € leaves the company and lands in your account, so the share is worth about 3 € less.'),
        },
    },
    accounts: {
        title: L('Choosing the right account'),
        idea: L('The account you invest through changes the tax you pay.'),
        body: [
            L('In France, gains taken from a [[pea|PEA]] older than 5 years only pay 18.6% social levies, while an ordinary account ([[cto|CTO]]) pays a 31.4% flat tax (2026 rates).'),
            L('A PEA holds European stocks and many world ETFs, but no US stocks bought directly and no crypto.'),
        ],
        quiz: {
            q: L('You want a world ETF for 10 years and live in France. Which account usually costs the least tax?'),
            options: [L('A PEA'), L('An ordinary account (CTO)'), L('It is always the same')],
            answer: 0,
            why: L('After 5 years, a PEA spares you income tax on gains: only the social levies remain.'),
        },
    },
};

export const LESSON_IDS = Object.keys(LESSONS);
