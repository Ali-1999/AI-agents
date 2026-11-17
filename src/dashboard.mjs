import {technicalCard} from "./technicals.mjs";
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
  const { symbols, mode, startingEquity, portfolioLimit, strategyLimit, positionSize, mark, researchDecision, analysisConfigured } = config;
  const charts = symbols.map(symbol => technicalCard(symbol, state.books[symbol]?.quotes ?? [], Date.now(), escape, price, state.books[symbol]?.status)).join("");
  const events = [...state.events].reverse();
  const books = symbols.map(symbol => [symbol, state.books[symbol] ?? {}]);
  const markets = books.map(([symbol, book]) => {
    const quote = book.last;
    const report = researchDecision(mode, symbol, research, Date.now());
    const count = book.quotes?.length ?? 0;
    const phase = book.active ? "Active" : book.challenger ? "Shadow testing" :
      count < 280 ? "Collecting quotes (" + count + "/280)" : "Waiting for AI proposal";
    return [symbol, book.status ?? "Waiting for first scan", time(quote?.time),
      price(quote?.mid), quote?.source ?? (mode === "synthetic" ? "Synthetic" : "—"),
      price(quote?.rawBid), price(quote?.rawAsk), count, phase,
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
  const analysis = state.analysis;
  const analysisStatus = mode !== "provider" ? "Available in provider mode." :
    !analysisConfigured ? "Add OPENROUTER_API_KEY to enable analysis." :
    state.analysisAttempt?.status === "failed" ? "Latest model request failed. Any earlier analysis is shown with its timestamp." :
    analysis ? "Updated at most once per UTC hour using fresh quotes." : "Waiting for the first model analysis.";
  const analysisContent = "<p>" + escape(analysisStatus) + "</p>" + (analysis ?
    "<p>" + escape(time(analysis.time)) + " · " + escape(analysis.model) + "</p><p>" +
    escape(analysis.summary) + "</p>" + table(["Symbol","Source","Quote time (UTC)","Mid","Change since previous sample"],
      analysis.inputs.map(q => [q.symbol,q.source,time(q.time),price(q.mid),
        Number.isFinite(q.changePct) ? q.changePct.toFixed(3) + "%" : "—"]), "No quotes.") : "");
  const metrics = [["Virtual equity", money(startingEquity + state.pnl)],
    ["Total P&L", money(state.pnl)], ["Realised P&L", money(settled)],
    ["Unrealised P&L", money(state.pnl - settled)],
    ["Portfolio drawdown", money(state.peak - state.pnl) + " / " + money(portfolioLimit)],
    ["Open demo positions", positions.length]];
  const section = (id, title, content) => '<section id="' + id + '"><h2>' + title + "</h2>" + content + "</section>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading Agents</title>
<style>
:root{color-scheme:dark;--bg:#080e17;--panel:#101b29;--line:#263a4c;--text:#eff5fc;--muted:#a9bbcd;--accent:#60e6c2}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#142a3a,var(--bg) 60%);color:var(--text);font:15px/1.5 Inter,Geist,system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px clamp(14px,4vw,54px) 65px}h1{font-size:clamp(32px,5vw,56px);letter-spacing:-.05em;margin:0;line-height:1.1}h2{margin:0 0 12px;font-size:21px}h3{margin:0 0 10px;font-size:18px}p,dt{color:var(--muted)}nav{display:flex;gap:6px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)}nav a{padding:6px 10px;border-radius:6px}a{color:var(--accent);text-decoration:none}a:hover,a:focus-visible{background:#203547;text-decoration:underline}dl,.charts{display:grid;gap:12px}dl{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.charts{grid-template-columns:repeat(auto-fit,minmax(min(100%,410px),1fr))}dl div,section,.instrument{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--panel)}dd{margin:4px 0 0;font-size:23px;font-weight:650;font-variant-numeric:tabular-nums}section{margin-top:18px} .instrument{background:#0a1420}svg{display:block;width:100%;height:auto}.chart-time{font-size:12px}.readings{list-style:none;padding:0;margin:0}.readings li{display:grid;grid-template-columns:minmax(130px,1fr) 1fr;gap:8px;padding:8px 0;border-top:1px solid var(--line)}.readings span{color:var(--muted);text-align:right}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap;font-variant-numeric:tabular-nums}td,th{padding:10px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted)}tr:hover td{background:#142538}
</style><script defer src="/dashboard-live.js"></script></head><body><main>
<h1>Trading Agents</h1><p>Demo simulation · ${escape(mode)} prices · ${state.halted ? "Portfolio halted" : state.last ? "Running" : "Waiting for first scan"}</p>
<p>Last scan ${escape(time(state.last))} · ${state.tick} scans</p>
<nav aria-label="Dashboard sections"><a href="#charts">Charts</a><a href="#markets">Markets</a><a href="#strategies">Strategies</a><a href="#positions">Positions</a><a href="#analysis">AI analysis</a><a href="#research">Research</a><a href="#backtests">Backtests</a><a href="#activity">Activity</a></nav>
<dl>${metrics.map(([label,value]) => "<div><dt>" + label + "</dt><dd>" + escape(value) + "</dd></div>").join("")}</dl>
${section("charts","Price charts and technical analysis",'<p>A quote preview appears with the first sample. Hourly bars are reconstructed from sampled midquotes. Gaps between plotted sessions are compressed. ICT, SMC and MSNR are rule-based overlays on these samples. Green marks support, pink resistance, blue the most recent swing break, and amber the latest open fair value gap.</p><div class="charts">'+charts+"</div>")}
${section("markets","Markets",table(["Symbol","Feed status","Quote time (UTC)","Mid","Source","Quoted bid","Quoted ask","Samples","Stage","Research filter","Last AI proposal (UTC)"],markets,"No markets."))}
${section("strategies","Agent strategies",table(["Symbol","Stage","Rule","Closed trades","Realised P&L","Marked P&L","Max drawdown","Drawdown limit","Open entry"],strategies,"No active or shadow strategies yet."))}
${section("positions","Open demo positions",table(["Symbol","Entry","Sim. bid","Entry notional","Unrealised P&L","Last mark (UTC)"],positions,"No open demo positions."))}
${section("analysis","AI market analysis",analysisContent)}
${section("research","TradingAgents research","<p>Provider-mode SPY and BTC/USD entries require a BUY or OVERWEIGHT rating for the current UTC day.</p>"+table(["Symbol","Analysis date (UTC)","Rating"],ratings,research===null?"Research is temporarily unavailable.":"No reports submitted."))}
${section("backtests","Strategy backtests",table(["Time (UTC)","Symbol","Rule","Window","Net P&L","Max drawdown","Trades","Stress P&L","Stress drawdown","Stress trades","Buy and hold","Candidate result"],backtests,"No backtests have completed."))}
${section("activity","Recent activity","<p>Up to 100 stored events, including simulated fills, promotions, retirements, strategy failures and portfolio halts.</p>"+table(["Time (UTC)","Market","Event","Fill price","Net P&L","Detail"],history,"No activity recorded."))}
</main><footer id="update-status" role="status" style="max-width:1330px;margin:0 auto;padding:0 20px 24px;color:#a9bbcd">Auto-update on</footer></body></html>`;
}
