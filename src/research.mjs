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
