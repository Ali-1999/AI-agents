const escape = value => String(value ?? "—").replace(/[&<>"']/g,
  ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const money = n => Number.isFinite(n) ? "$" + n.toFixed(2) : "—";
const price = n => Number.isFinite(n) ? n.toLocaleString("en-US", {maximumFractionDigits: 6}) : "—";
const time = n => Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : "—";
const rule = r => r ? r.family + " · " + r.lookback + " samples · " + r.threshold + " bps" : "—";

function table(headers, rows, empty) {
  if (!rows.length) return "<p>" + escape(empty) + "</p>";
  return '<div class="scroll"><table><thead><tr>' +
    headers.map(h => '<th scope="col">' + escape(h) + "</th>").join("") +
    "</tr></thead><tbody>" + rows.map(row => "<tr>" +
      row.map(cell => "<td>" + escape(cell) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

export function dashboard(state, research, config) {
  const { symbols, mode, startingEquity, portfolioLimit, strategyLimit, positionSize, mark, researchDecision } = config;
  const events = [...state.events].reverse();
  const books = symbols.map(symbol => [symbol, state.books[symbol] ?? {}]);
  const markets = books.map(([symbol, book]) => {
    const quote = book.last;
    const report = researchDecision(mode, symbol, research, Date.now());
    const count = book.quotes?.length ?? 0;
    const phase = book.active ? "Active" : book.challenger ? "Shadow testing" :
      count < 280 ? "Collecting quotes (" + count + "/280)" : "Waiting for AI proposal";
    return [symbol, book.status ?? "Waiting for first scan", time(quote?.time),
      price(quote?.mid), price(quote?.bid), price(quote?.ask), count, phase,
      report.reason ?? "Filter does not apply", time(book.lastDesign)];
  });
  const strategies = books.flatMap(([symbol, book]) =>
    [["Active", book.active], ["Shadow", book.challenger]].filter(([, agent]) => agent)
      .map(([phase, agent]) => [symbol, phase, rule(agent.rule), agent.stats.trades,
        money(agent.stats.pnl), money(book.last ? mark(agent.stats, book.last) : undefined),
        money(agent.stats.dd), money(strategyLimit), price(agent.stats.entry)]));
  const positions = books.filter(([, book]) => book.active?.stats.entry)
    .map(([symbol, book]) => {
      const stats = book.active.stats;
      return [symbol, price(stats.entry), price(book.last?.bid), money(positionSize),
        money(book.last ? mark(stats, book.last) - stats.pnl : undefined), time(book.last?.time)];
    });
  const settled = books.reduce((total, [, book]) => total + (book.realised ?? 0) + (book.active?.stats.pnl ?? 0), 0);
  const backtests = events.filter(e => e.action === "BACKTEST").flatMap(e => {
    const report = e.report ?? {};
    if (!report.windows) return [[time(e.time), e.symbol, rule(e.rule), "Legacy",
      money(report.pnl), money(report.dd), report.trades, "—", "—", "—", "—", "—"]];
    return report.windows.map((w, index) => [time(e.time), e.symbol, rule(e.rule), index + 1,
      money(w.normal.pnl), money(w.normal.dd), w.normal.trades,
      money(w.stress.pnl), money(w.stress.dd), w.stress.trades, money(w.benchmark),
      (report.passed ? "Passed" : "Rejected") + " · +" + report.stressBps + " bps per side"]);
  });
  const history = events.map(e => [time(e.time), e.symbol, e.action,
    price(e.price), money(e.net), e.breach ? "Risk limit breached" : e.rule ? rule(e.rule) : "—"]);
  const ratings = (research ?? []).map(r => [r.symbol, r.date, r.rating]);
  const metrics = [["Virtual equity", money(startingEquity + state.pnl)],
    ["Total P&L", money(state.pnl)], ["Realised P&L", money(settled)],
    ["Unrealised P&L", money(state.pnl - settled)],
    ["Portfolio drawdown", money(state.peak - state.pnl) + " / " + money(portfolioLimit)],
    ["Open demo positions", positions.length]];
  const section = (id, title, content) => '<section id="' + id + '"><h2>' + title + "</h2>" + content + "</section>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading Agents</title>
<style>:root{color-scheme:dark}body{font:15px/1.5 system-ui;background:#101720;color:#edf3fb;max-width:1240px;margin:36px auto;padding:0 20px}h1,h2{line-height:1.15}p,dt{color:#b9c8dc}nav{display:flex;gap:16px;flex-wrap:wrap}a{color:#9dd6ff}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px}dl div,section{border:1px solid #344354;border-radius:10px;padding:16px;background:#151f2b}dd{margin:5px 0 0;font-size:20px;font-weight:650}section{margin:18px 0}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:9px;text-align:left;border-bottom:1px solid #344354}th{font-size:13px;color:#b9c8dc}</style></head><body><main>
<h1>Trading Agents</h1><p>Demo simulation · ${escape(mode)} prices · ${state.halted ? "Portfolio halted" : state.last ? "Running" : "Waiting for first scan"}</p>
<p>Last scan ${escape(time(state.last))} · ${state.tick} scans · <a href="/">Refresh</a></p>
<nav aria-label="Dashboard sections"><a href="#markets">Markets</a><a href="#strategies">Strategies</a><a href="#positions">Positions</a><a href="#research">Research</a><a href="#backtests">Backtests</a><a href="#activity">Activity</a></nav>
<dl>${metrics.map(([label,value]) => "<div><dt>" + label + "</dt><dd>" + escape(value) + "</dd></div>").join("")}</dl>
${section("markets","Markets",table(["Symbol","Feed status","Quote time (UTC)","Mid","Sim. bid","Sim. ask","Samples","Stage","Research filter","Last AI proposal (UTC)"],markets,"No markets."))}
${section("strategies","Agent strategies",table(["Symbol","Stage","Rule","Closed trades","Realised P&L","Marked P&L","Max drawdown","Drawdown limit","Open entry"],strategies,"No active or shadow strategies yet."))}
${section("positions","Open demo positions",table(["Symbol","Entry","Sim. bid","Entry notional","Unrealised P&L","Last mark (UTC)"],positions,"No open demo positions."))}
${section("research","TradingAgents research","<p>Provider-mode SPY and BTC/USD entries require a BUY or OVERWEIGHT rating for the current UTC day.</p>"+table(["Symbol","Analysis date (UTC)","Rating"],ratings,research===null?"Research is temporarily unavailable.":"No reports submitted."))}
${section("backtests","Strategy backtests",table(["Time (UTC)","Symbol","Rule","Window","Net P&L","Max drawdown","Trades","Stress P&L","Stress drawdown","Stress trades","Buy and hold","Candidate result"],backtests,"No backtests have completed."))}
${section("activity","Recent activity","<p>Up to 100 stored events, including simulated fills, promotions, retirements, strategy failures and portfolio halts.</p>"+table(["Time (UTC)","Market","Event","Fill price","Net P&L","Detail"],history,"No activity recorded."))}
</main></body></html>`;
}
