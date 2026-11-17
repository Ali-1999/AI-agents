const symbols = ["SPY", "BTC/USD"];
const ratings = ["BUY", "OVERWEIGHT", "HOLD", "UNDERWEIGHT", "SELL", "REVIEW"];

export function validateResearch(body, today = new Date().toISOString().slice(0, 10)) {
  if (!body || !symbols.includes(body.symbol) || !ratings.includes(body.rating) ||
      typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return null;
  const date = new Date(body.date);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== body.date ||
      body.date > today) return null;
  return { symbol: body.symbol, rating: body.rating, date: body.date };
}

export function researchEntryDecision(mode, symbol, reports, scanTime) {
  if (mode !== "provider" || !symbols.includes(symbol)) return { allowed: true };
  if (reports === null) return { allowed: false, reason: "Research unavailable" };
  const today = new Date(scanTime).toISOString().slice(0, 10);
  const report = reports.find(row => row.symbol === symbol);
  if (report?.date !== today) return { allowed: false, reason: "Waiting for today's UTC research" };
  return {
    allowed: report.rating === "BUY" || report.rating === "OVERWEIGHT",
    reason: "TradingAgents: " + report.rating,
  };
}
