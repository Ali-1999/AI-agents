"""Run the upstream research graph and publish its rating to the demo dashboard."""

import argparse
from datetime import date
import json
import os
from urllib.request import Request, urlopen

SYMBOLS = {"SPY": ("SPY", "stock"), "BTC/USD": ("BTC-USD", "crypto")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("symbol", choices=SYMBOLS)
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    endpoint = os.environ.get("TRADINGAGENTS_WORKER_URL", "").rstrip("/")
    token = os.environ.get("RESEARCH_TOKEN")
    if not endpoint.startswith("https://") or not token:
        parser.error("Set TRADINGAGENTS_WORKER_URL (HTTPS) and RESEARCH_TOKEN")

    from tradingagents.default_config import build_default_config
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    config = build_default_config()
    ticker, asset_type = SYMBOLS[args.symbol]
    graph = TradingAgentsGraph(selected_analysts=("market",), config=config)
    _, signal = graph.propagate(ticker, args.date.isoformat(), asset_type=asset_type)
    payload = json.dumps({
        "symbol": args.symbol,
        "date": args.date.isoformat(),
        "rating": str(signal).upper(),
    }).encode()
    request = Request(endpoint + "/api/research", data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    })
    with urlopen(request, timeout=20) as response:
        print(response.read().decode())


if __name__ == "__main__":
    main()
