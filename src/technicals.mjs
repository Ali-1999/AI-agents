const hour = 3600000;

export function sampledCandles(quotes, now) {
  const buckets = new Map();
  for (const {time, mid} of quotes) {
    if (!Number.isFinite(time) || !Number.isFinite(mid) || mid <= 0) continue;
    const start = Math.floor(time / hour) * hour;
    if (start + hour > now) continue;
    const bar = buckets.get(start);
    if (bar) {
      bar.high = Math.max(bar.high, mid);
      bar.low = Math.min(bar.low, mid);
      bar.close = mid;
      bar.samples++;
    } else {
      buckets.set(start, {start, open:mid, high:mid, low:mid, close:mid, samples:1});
    }
  }
  return [...buckets.values()].filter(bar => bar.samples >= 3).slice(-24);
}

export function analyseCandles(bars) {
  const result = {gap:null, structure:null, support:null, resistance:null};
  let high = null, low = null;
  for (let i = 1; i < bars.length; i++) {
    const first = bars[i-2], previous = bars[i-1], current = bars[i];
    if (current.start - previous.start !== hour) {
      high = low = null;
      continue;
    }
    const before = previous.close - previous.open;
    const after = current.close - current.open;
    if (before < 0 && after > 0) result.support = previous.close;
    if (before > 0 && after < 0) result.resistance = previous.close;

    if (result.gap && (result.gap.direction === "Bullish"
      ? current.low <= result.gap.low : current.high >= result.gap.high)) result.gap = null;
    if (high !== null && current.close > high) {
      result.structure = {direction:"Bullish", level:high, time:current.start};
      high = null;
    }
    if (low !== null && current.close < low) {
      result.structure = {direction:"Bearish", level:low, time:current.start};
      low = null;
    }
    if (!first || previous.start - first.start !== hour) continue;
    if (current.low > first.high) result.gap = {direction:"Bullish", low:first.high, high:current.low};
    if (current.high < first.low) result.gap = {direction:"Bearish", low:current.high, high:first.low};
    if (previous.high > Math.max(first.high,current.high)) high = previous.high;
    if (previous.low < Math.min(first.low,current.low)) low = previous.low;
  }
  return result;
}

function chart(bars, levels) {
  const ceiling = Math.max(...bars.map(b=>b.high), ...levels.map(l=>l.price));
  const floor = Math.min(...bars.map(b=>b.low), ...levels.map(l=>l.price));
  const span = ceiling-floor;
  const y = value => span ? 16 + 123 * (ceiling-value)/span : 77;
  const x = index => 14 + 450 * (index+.5)/bars.length;
  const width = Math.min(12, 270/bars.length);
  const guides = [0,1,2,3].map(i=>{
    const value = ceiling - span*i/3;
    const row = y(value);
    return '<path d="M14 '+row+'H464" stroke="#294051"/><text x="474" y="'+(row+4)+'" fill="#a4b4c4">'+value.toLocaleString("en-US",{maximumFractionDigits:5})+'</text>';
  }).join("");
  const overlays = levels.map(l=>'<path d="M14 '+y(l.price)+'H464" stroke="'+l.colour+'" stroke-dasharray="5 4"/>').join("");
  const candles = bars.map((b,i)=>{
    const colour = b.close >= b.open ? "#49dfb1" : "#ff8292";
    return '<path d="M'+x(i)+' '+y(b.high)+'V'+y(b.low)+'" stroke="'+colour+'"/><rect x="'+(x(i)-width/2)+'" y="'+Math.min(y(b.open),y(b.close))+'" width="'+width+'" height="'+Math.max(1,Math.abs(y(b.open)-y(b.close)))+'" rx="1" fill="'+colour+'"/>';
  }).join("");
  return '<svg viewBox="0 0 550 156" role="img" aria-label="Hourly sampled candlesticks with price levels" font-size="10">'+guides+overlays+candles+'</svg>';
}

export function technicalCard(symbol, quotes, now, escape, price) {
  const bars = sampledCandles(quotes, now);
  const heading = '<article class="instrument"><h3>'+escape(symbol)+'</h3>';
  if (bars.length < 3) return heading+'<p>Waiting for three completed hourly bars with at least three samples each.</p></article>';
  const {gap,structure,support,resistance} = analyseCandles(bars);
  const levels = [
    {price:support,colour:"#49dfb1"}, {price:resistance,colour:"#ff8292"},
    {price:structure?.level,colour:"#8bbcff"}, {price:gap?.low,colour:"#f1ba70"}, {price:gap?.high,colour:"#f1ba70"},
  ].filter(level=>level.price!==null && Number.isFinite(level.price));
  const window = new Date(bars[0].start).toISOString().slice(0,16)+" → "+new Date(bars.at(-1).start).toISOString().slice(0,16)+" UTC";
  return heading+chart(bars,levels)+'<p class="chart-time">'+escape(window)+'</p><ul class="readings">'+
    '<li><strong>ICT · Fair value gap</strong><span>'+escape(gap?gap.direction+' · '+price(gap.low)+' – '+price(gap.high):"No open gap detected")+'</span></li>'+
    '<li><strong>SMC · Swing break</strong><span>'+escape(structure?structure.direction+' · '+price(structure.level):"No confirmed break")+'</span></li>'+
    '<li><strong>MSNR · Close levels</strong><span>'+escape('Support '+price(support)+' / Resistance '+price(resistance))+'</span></li></ul></article>';
}
