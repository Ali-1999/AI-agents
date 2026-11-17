// Compare net performance under normal and more expensive execution.
export function evaluateCandidate(rule, quotes, replay, qualifies) {
  const midpoint = Math.floor(quotes.length / 2);
  const windows = [quotes.slice(0, midpoint), quotes.slice(midpoint - 20)];
  const stressBps = 5;
  const extraCost = stressBps / 10000;
  const summaries = windows.map(window => {
    const stressed = window.map(q => ({
      ...q, bid: q.bid * (1 - extraCost), ask: q.ask * (1 + extraCost),
    }));
    const normal = replay(rule, window);
    const stress = replay(rule, stressed);
    const benchmark = 500 * (window.at(-1).bid / window[20].ask - 1);
    return { normal, stress, benchmark };
  });
  const passed = summaries.every(({ normal, stress }) =>
    qualifies(normal, 2) && qualifies(stress, 2)
  );
  return { passed, stressBps, windows: summaries };
}
