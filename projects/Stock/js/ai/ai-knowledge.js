// What finance research says, distilled into short rules for Nemeris' AI.
// The model only receives the text blocks below; the sources are here for whoever maintains them.
//
// Sources (checked September 2026):
//  - Bessembinder 2018, Journal of Financial Economics: 58% of US stocks returned less than one-month T-bills over their
//    lifetime; the best 4% of stocks account for the entire net gain of the US market since 1926.
//  - J.P. Morgan, "The Agony and the Ecstasy" (2021): more than 40% of US stocks suffered a 70%+ decline never recovered.
//  - SPIVA Europe Scorecard, year-end 2025: 97-98% of active equity funds sold in euros lagged their index over 10 years.
//  - Barber & Odean 2000, Journal of Finance: households that trade most earned 11.4% a year vs 17.9% for the market.
//  - Chague, De-Losso & Giovannetti 2019: 97% of people who day traded for more than 300 days lost money.
//  - ESMA 2018: 74-89% of retail CFD accounts lose money.
//  - Odean 1998, Journal of Finance: winners that were sold beat the losers that were kept by ~3.4% the next year.
//  - Kumar 2009, Journal of Finance: lottery-like stocks underperform.
//  - Jegadeesh & Titman 1993, Journal of Finance: 12-month winners beat losers by ~1.3% a month over the next 3 months,
//    part of it reverses within 2 years. Daniel & Moskowitz 2016, JFE: momentum crashes after panics, in market rebounds.
//  - Sullivan, Timmermann & White 1999, Journal of Finance: the best technical rule had no edge out of sample.
//  - McLean & Pontiff 2016, Journal of Finance: published return patterns earn 26% less out of sample, 58% less after publication.
//  - Asness, Frazzini & Pedersen 2019, Review of Accounting Studies: quality stocks earn higher risk-adjusted returns in 24 countries.
//  - Kaminski & Lo 2014, Journal of Financial Markets: stop-losses lower expected return in a random walk, can help with momentum.
//  - Bradshaw, Brown & Huang 2013, Review of Accounting Studies: only 38% of 12-month analyst price targets are met at the horizon.
//  - Lopez-Lira & Tang (2023, updated): LLM headline scores predict next-day drift, mostly small stocks and bad news, fading as
//    LLM use spreads. Glasserman & Lin 2023: hiding firm names improves LLM news signals (general knowledge distracts).
//  - Xiong et al. 2024, ICLR: LLMs are overconfident when they state probabilities.
//  - Good Judgment Project (Tetlock): starting from base rates and making small, frequent updates improves forecasts.
//  - J.P. Morgan Guide to Retirement 2025: missing the 10 best days in 20 years cut the annual return almost in half.
//  - Vanguard 2023: investing a lump sum beat 3-month cost averaging 68% of the time (global, 1976-2022).
//  - UBS Global Investment Returns Yearbook 2026: equities beat bonds, bills and inflation in every country since 1900.
//  - service-public.fr: social levies 18.6% and flat tax 31.4% on investment income from 1 January 2026.

/** For one-stock opinions (AI check-up). */
export const STOCK_EVIDENCE = `Evidence to apply (from finance research, use it without citing it):
- Base rate: a single stock is slightly more likely to lag a broad index than to beat it. Returns are skewed: a few huge winners carry the average, many stocks fall hard and never recover. Start from 0.47 for one month and move in small steps.
- Relative strength over the past 3 to 12 months is the most robust price signal, but modest, and it can reverse sharply after a market panic. A very large move in the last month tends to partly reverse.
- RSI, MACD, moving-average crossings and chart patterns have no reliable edge after costs: context only, never the main reason.
- Public headlines are priced within hours or days. Only material, very recent, company-specific news may move p, and only a little. Analyst price targets are usually missed: not evidence.
- Quality (profits, low debt, stable results) and lower volatility are favorable. Tiny, illiquid, lottery-like stocks (huge swings, recent spike, hype) are unfavorable on average.
- Judge only the facts given, not the company's fame.
- For the investor, the biggest risks are concentration and behavior: flag a single stock above 15% of the portfolio (a broad index ETF is diversified, not a concentration), keeping a loser only to get back to even, or buying after a spike.`;

/** For the chat assistant. */
export const ADVICE_EVIDENCE = `What the evidence says (use it, keep it simple, name a source only if asked):
- For most people the core should be broad, low-cost index ETFs: over 10 years, more than 9 in 10 active equity funds sold in Europe lagged their index (SPIVA 2025). Fees are a certain loss.
- Single stocks are risky: most lag the market and many never recover from big falls, while a few huge winners carry the average. Keep any one stock small unless the user knowingly accepts that risk.
- Trading often, day trading, leverage and CFDs lose money for most individuals (the most active traders earned about 6 points a year less than the market; 74 to 89% of retail CFD accounts lose money).
- Time in the market beats timing it: missing the 10 best days in 20 years cut returns almost in half, and the best days come right after the worst. Never push panic selling; suggest rebalancing instead.
- Investing a lump sum at once beat spreading it over a few months about 2 times out of 3; spreading it is fine if it helps the user stay calm.
- Judge a position on its future, not on its purchase price: keeping losers to get even and selling winners early both cost money.
- Technical indicators, analyst targets and news headlines are weak predictors: say so when you use them.
- France, 2026: gains taken from a PEA older than 5 years pay no income tax but 18.6% social levies; on a regular brokerage account the flat tax is 31.4%. Tax rules change: check with web_search before giving precise tax numbers.`;

/** For fast screening in the Explorer. */
export const SCREEN_EVIDENCE = `Weigh the numbers like the research does:
- Favor steady relative strength (positive change over the period, price above its 200-bar average) with moderate volatility.
- A very large jump or drop in the last weeks tends to partly reverse: do not chase it.
- Penalize very high volatility, a price far below its peak and a falling long-term trend: these are lottery-like or broken.
- RSI, indicator agreement and the technical score are weak signals: they can tilt a close call, never decide it.
- Most stocks deserve 40-60. Go above 70 or below 30 only when several strong facts agree.`;
