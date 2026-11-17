# AI Trading Agents

A Cloudflare Worker for simulated trading across SPY, BTC/USD and EUR/USD. Cloudflare Workers AI proposes strategies, and the open-source [Cloudflare Agents SDK](https://github.com/cloudflare/agents) provides the stateful portfolio agent. SQLite-backed Durable Object storage keeps the latest quote samples, portfolio state and recent activity.

## Deploy from GitHub

1. Connect this repository in Cloudflare Workers & Pages using Workers Builds. Choose main and use `npx wrangler deploy` as the deploy command. The Wrangler config registers Workers AI, SQLite-backed storage and the five-minute Cron Trigger.
2. Set `DASHBOARD_TOKEN` as a Worker secret. Use a long random ASCII value. Open the Worker URL and sign in as `demo` with that token. The first cron run populates the market table.
3. To use provider quotes, set `DATA_MODE=provider` in wrangler.jsonc and add `ALPACA_KEY` and `ALPACA_SECRET` from your Alpaca paper account. For forex, add `OANDA_TOKEN` and `OANDA_ACCOUNT_ID` from an API-enabled OANDA Practice account. Missing feeds show as unavailable. Keep secrets out of GitHub.

## How it works

- Synthetic mode is the default and runs without broker credentials. Synthetic and provider sessions have separate history. Provider calls only read prices. All fills use virtual funds.
- The strategy designer can request one model proposal per UTC day across the portfolio. It uses summary statistics from the earlier samples and allows only predefined strategy families and parameter ranges.
- An instrument needs 280 fresh samples before design starts. At five-minute intervals this takes at least about 23 hours, and session closures or stale quotes can extend it. Backtesting uses the later 240 samples, including a 20-sample warm-up.
- A proposal needs at least four closed historical trades and positive simulated P&L without hitting the strategy drawdown limit. It then needs at least twelve closed shadow trades and the same risk and profit checks before it can trade in the demo portfolio.
- The strategy is retired on a drawdown breach. A newly qualified strategy may replace it. If no strategy qualifies, the market stays idle. A portfolio halt remains latched and stops entries across all instruments.
- Defaults are USD 10,000 in virtual equity, USD 500 position size, USD 40 strategy drawdown and USD 80 portfolio drawdown. Stale positions can only be closed once a fresh quote arrives. The simulator models spreads and a fixed per-side cost. It does not model order-book depth, partial fills or forex rollover.

## Local development

Run `npm install` and `npm run dev`. Put local secrets in `.dev.vars`. Trigger a local scan using Wrangler's scheduled test endpoint. Workers AI needs an authenticated Cloudflare connection.

Check CPU and AI usage in Cloudflare before increasing the watchlist or proposal frequency. This project uses no live order endpoints and simulated results do not establish profitability.
