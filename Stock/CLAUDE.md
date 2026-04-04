# CLAUDE.md

## Project Purpose
Nemeris is a static Bloomberg Terminal-inspired dashboard hosted on GitHub Pages.
It tracks personal holdings (equities, commodities, crypto), displays live prices/charts, computes buy/sell signals, surfaces news, includes a market explorer and a command terminal.

## Stack & Runtime
- Pure frontend: HTML + CSS + vanilla ES modules. No build step. No backend.
- Hosted on GitHub Pages (static only).
- All data comes from Yahoo Finance via a personal Cloudflare Worker CORS proxy.
- Entry point: index.html.

## Data Source
- **Yahoo Finance only** — all OHLC, news, screener, options, financials, dividends.
- Proxy: user's personal Cloudflare Worker (`worker/cors-proxy.js`). URL stored in `localStorage` under `nemeris_proxy_url`.
- No API keys required. No external API contracts.

## Setup Flow (first run)
1. User deploys `worker/cors-proxy.js` to their free Cloudflare Workers account (see wrangler.toml).
2. On first visit, a setup modal (`js/setup.js`) prompts for the Worker URL.
3. URL is saved to `localStorage` and used by `js/proxy-fetch.js` for all Yahoo requests.
4. A gear button (bottom-left) allows re-opening the setup at any time.

## Architecture
| File | Role |
|------|------|
| `js/general.js` | Bootstrap, event wiring, fetch orchestration |
| `js/state.js` | Shared mutable state, config loader |
| `js/portfolio.js` | Portfolio loading and computed values |
| `js/ui.js` | DOM creation and updates |
| `js/chart.js` | Chart.js lifecycle |
| `js/signal-bot.js` | RSI/MACD/SMA/Momentum/ATR signal engine |
| `js/news.js` | News fetch/filter/render |
| `js/terminal.js` | Command handler (REPL) |
| `js/explorer.js` | Market screener |
| `js/proxy-fetch.js` | CORS proxy wrapper (reads worker URL from localStorage) |
| `js/cache.js` | localStorage caching with TTL |
| `js/setup.js` | First-run setup modal |
| `js/api/yahoo-finance.js` | All Yahoo Finance API calls |
| `js/api/news.js` | News aggregator |
| `worker/cors-proxy.js` | Cloudflare Worker source (deployed separately) |
| `worker/wrangler.toml` | Wrangler deploy config |

## Cache TTLs
- 1D / 1W OHLC: 5 min
- 1M OHLC: 15 min
- 6M+ OHLC: 60 min
- News: 30 min
- Fundamentals: 6 h

## Editing Guidance
- All API calls go through `js/api/yahoo-finance.js` → `proxy-fetch.js` → Cloudflare Worker.
- Never import from deleted adapters (alphavantage, finnhub, twelve, polygon, marketstack).
- Keep DOM generation template-driven; avoid large inline HTML strings.
- Preserve French UI copy style unless explicitly asked otherwise.
- If changing tabs/cards layout, update both index.html templates and selectors in ui.js/news.js/general.js.
- If changing signal logic, keep output contract compatible with signal widget expectations.

## Known Constraints
- GitHub Pages is static-only — no server-side code in this repo.
- The Cloudflare Worker is the only external dependency (free tier, user-owned).
- Yahoo Finance rate-limits at ~120s on 429. The rate limiter in `js/rate-limiter.js` handles this.
- No automated tests.
