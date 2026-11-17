# AI Trading Agents

A Cloudflare Worker for simulated trading across SPY, BTC/USD and EUR/USD. Cloudflare Workers AI proposes strategies, and the open-source [Cloudflare Agents SDK](https://github.com/cloudflare/agents) provides the stateful portfolio agent. SQLite-backed Durable Object storage keeps the latest quote samples, portfolio state and recent activity.

## Deploy from GitHub

1. Connect this repository in Cloudflare Workers & Pages using Workers Builds. Choose main and use `npx wrangler deploy` as the deploy command. The Wrangler config registers Workers AI, SQLite-backed storage and the five-minute Cron Trigger.
2. Set `DASHBOARD_TOKEN` as a Worker secret. Use a long random ASCII value. Open the Worker URL and sign in as `demo` with that token. The first cron run populates the market table.
3. To use provider quotes, set `DATA_MODE=provider` in wrangler.jsonc and add `ALPACA_KEY` and `ALPACA_SECRET` from your Alpaca paper account. For forex, add `OANDA_TOKEN` and `OANDA_ACCOUNT_ID` from an API-enabled OANDA Practice account. Missing feeds show as unavailable. Keep secrets out of GitHub.

## How it works

- Synthetic mode is optional and runs without broker credentials. Synthetic and provider sessions have separate history. Provider calls only read prices. All fills use virtual funds.
- The strategy designer can request one model proposal per UTC day across the portfolio. It uses summary statistics from the earlier samples and allows only predefined strategy families and parameter ranges.
- An instrument needs 280 fresh samples before design starts. At five-minute intervals this takes at least about 23 hours, and session closures or stale quotes can extend it. Backtesting uses the later 240 samples, including a 20-sample warm-up.
- A proposal needs at least two closed trades, positive net P&L and drawdown below the strategy limit in each of two chronological evaluation windows, at both normal costs and with an additional five basis points of cost per side. It then needs at least twelve closed shadow trades and the same risk and profit checks before it can trade in the demo portfolio.
- The strategy is retired on a drawdown breach. A newly qualified strategy may replace it. If no strategy qualifies, the market stays idle. A portfolio halt remains latched and stops entries across all instruments.
- Defaults are USD 10,000 in virtual equity, USD 500 position size, USD 40 strategy drawdown and USD 80 portfolio drawdown. Stale positions can only be closed once a fresh quote arrives. The simulator models spreads and a fixed per-side cost. It does not model order-book depth, partial fills or forex rollover.

## Local development

Run `npm install` and `npm run dev`. Put local secrets in `.dev.vars`. Trigger a local scan using Wrangler's scheduled test endpoint. Workers AI needs an authenticated Cloudflare connection.

Check CPU and AI usage in Cloudflare before increasing the watchlist or proposal frequency. This project uses no live order endpoints and simulated results do not establish profitability.

## TradingAgents research

The [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) Python graph runs on your computer and publishes the latest rating for SPY or BTC/USD to the Cloudflare dashboard. It runs the upstream market analyst, research debate, trader and risk review. In provider mode, a current UTC-day BUY or OVERWEIGHT rating permits a new SPY or BTC/USD position only when the existing strategy independently signals entry. HOLD, UNDERWEIGHT, SELL, REVIEW, a missing or outdated report, and a research-service failure block new positions. This applies to shadow testing and simulated portfolio entries. Existing positions still exit through the strategy and risk controls. Historical backtests use the strategy rules alone because historical TradingAgents ratings are unavailable. Synthetic mode and forex run without this research filter.

1. Install Python 3.11+ and Git, then run `python -m pip install -r integrations/requirements.txt` in a virtual environment.
2. In Cloudflare, add a separate Worker secret named `RESEARCH_TOKEN` and deploy. Set the same value in your local environment, along with `TRADINGAGENTS_WORKER_URL` set to your Worker HTTPS origin.
3. For local inference without a paid model API, run Ollama and download a model with tool support, for example `ollama pull qwen3:8b`. Set the following environment variables (PowerShell):

   ```powershell
   $env:TRADINGAGENTS_LLM_PROVIDER = "ollama"
   $env:TRADINGAGENTS_QUICK_THINK_LLM = "qwen3:8b"
   $env:TRADINGAGENTS_DEEP_THINK_LLM = "qwen3:8b"
   $env:TRADINGAGENTS_LLM_BACKEND_URL = "http://localhost:11434"
   ```

4. Run `python integrations/tradingagents_report.py SPY` or `python integrations/tradingagents_report.py BTC/USD`. Refresh the dashboard to see the rating and analysis date. Local inference requires a running computer and upstream data access. The Worker can continue demo scanning independently.

The endpoint retains the latest report per symbol and rejects older reports. Keep the research secret and provider credentials out of GitHub.

## Evaluation design

- [TradingAgents](https://github.com/TauricResearch/TradingAgents) supplies the research ratings used during provider-mode simulation.
- [LEAN](https://github.com/QuantConnect/Lean) informed the comparison against a buy-and-hold benchmark over the same evaluation periods. The benchmark is reported for context.
- [Freqtrade](https://github.com/freqtrade/freqtrade) informed the separate historical and shadow-trading checks. Each historical window must pass at normal and stressed costs before forward shadow testing.
- [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) informed the event-by-event quote replay and the use of adverse bid and ask adjustments in the stress scenario. The Worker uses its own lightweight evaluator. It does not run these three external trading engines or model order-book fills.

The dashboard's BACKTEST activity includes both windows, their net P&L, drawdown, closed-trade counts, benchmark P&L and the pass decision. The rolling quote sample is small and can overlap across proposals, so these checks alone do not establish out-of-sample profitability.

## OpenRouter strategy model

Set `OPENROUTER_API_KEY` as a Cloudflare Worker secret. The strategy generator then uses `openrouter/free` by default. To select a specific model, set `OPENROUTER_MODEL` to an exact ID ending in `:free` from the [OpenRouter catalogue](https://openrouter.ai/models). Paid IDs are rejected. Without a key, the Worker uses Cloudflare Workers AI. The local TradingAgents research runner has its own model configuration.

## Provider quotes and AI market analysis

The Worker defaults to provider mode. Without Alpaca credentials, BTC/USD uses Coinbase Exchange public quotes. SPY requires Alpaca credentials and EUR/USD requires OANDA Practice credentials. The dashboard reports unavailable feeds and shows source, quote timestamp and raw bid/ask for new provider quotes. Simulated fills still apply the simulator's costs. To use synthetic prices, set DATA_MODE to synthetic.

Set OPENROUTER_API_KEY to enable AI Market Analysis. On a scheduled scan with fresh quotes, the Worker requests at most one market summary per UTC hour. It displays the model setting, timestamp and source inputs. Market analysis is informational and never submits orders. The TradingAgents reporter remains a separate source of ratings.
