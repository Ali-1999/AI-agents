import {generateStrategy} from "./strategy-ai.mjs";
import {dashboard} from "./dashboard.mjs";
import {evaluateCandidate} from "./evaluation.mjs";
import {researchEntryDecision,validateResearch} from "./research.mjs";
import {Agent,getAgentByName} from "agents";
const markets={SPY:500,"BTC/USD":65000,"EUR/USD":1.08};
const interval=300000;
const start=10000;
const lossLimit=80;
const strategyLimit=40;
const size=500;
const blank=()=>({pnl:0,peak:0,dd:0,trades:0,entry:null});
const initial=()=>({tick:0,last:0,peak:0,pnl:0,halted:false,events:[],books:{}});
const valid=r=>r && ["momentum","reversion"].includes(r.family) &&
  [4,8,12,20].includes(r.lookback) && [10,20,35,50].includes(r.threshold);
const same=(a,b)=>a&&b&&a.family===b.family&&a.lookback===b.lookback&&a.threshold===b.threshold;
const mark=(p,q)=>p.pnl+(p.entry?size*(q.bid/p.entry-1):0);
function step(p,r,history,q,stop=false,allowEntry=true){
  const value=mark(p,q);
  p.peak=Math.max(p.peak,value);
  p.dd=Math.max(p.dd,p.peak-value);
  const window=history.slice(-r.lookback);
  const mean=window.reduce((s,x)=>s+x,0)/window.length;
  const signal=(q.mid/mean-1)*10000*(r.family==="momentum"?1:-1);
  const breach=p.peak-value>=strategyLimit;
  if(p.entry && (stop||breach||signal<=0)){
    const net=value-p.pnl;
    p.pnl=value;
    p.entry=null;
    p.trades++;
    return {action:"SELL",net,price:q.bid,breach};
  }
  if(allowEntry&&!p.entry&&!stop&&!breach&&window.length===r.lookback&&signal>=r.threshold){
    p.entry=q.ask;
    return {action:"BUY",price:q.ask};
  }
  return breach?{action:"PAUSE",breach}:null;
}
const qualified=(p,min)=>p.trades>=min&&p.pnl>0&&p.dd<strategyLimit;
function replay(rule,quotes){
  const stats=blank();
  const prices=quotes.slice(0,20).map(q=>q.mid);
  let last;
  for(const q of quotes.slice(20)){
    if(step(stats,rule,prices,q)?.breach) return stats;
    prices.push(q.mid);
    last=q;
  }
  if(last&&stats.entry) stats.pnl=mark(stats,last);
  return stats;
}
function quote(mid,bid,ask,time,cost){
  if(![mid,bid,ask,time].every(Number.isFinite)||bid<=0||ask<bid) throw Error("Invalid quote");
  return {mid,bid:bid*(1-cost),ask:ask*(1+cost),time};
}
async function fetchJson(url,headers){
  const response=await fetch(url,{headers,redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!response.ok) throw Error("Feed HTTP "+response.status);
  return response.json();
}
async function feed(symbol,env,time){
  if(env.DATA_MODE!=="provider"){
    const t=time/interval;
    const mid=markets[symbol]*(1+.018*Math.sin(t/17+Object.keys(markets).indexOf(symbol))+.003*Math.sin(t/5));
    return quote(mid,mid*.9999,mid*1.0001,time,.0002);
  }
  let bid,ask,at,source;
  if(symbol==="BTC/USD"&&(!env.ALPACA_KEY||!env.ALPACA_SECRET)){
    const data=await fetchJson("https://api.exchange.coinbase.com/products/BTC-USD/ticker",{Accept:"application/json"});
    bid=Number(data.bid);ask=Number(data.ask);at=Date.parse(data.time);
    source="Coinbase Exchange";
  }else if(symbol==="EUR/USD"){
    source="OANDA Practice";
    if(!env.OANDA_TOKEN||!/^\\d+(?:-\\d+)*$/.test(env.OANDA_ACCOUNT_ID||"")) throw Error("Practice credentials required");
    const data=await fetchJson("https://api-fxpractice.oanda.com/v3/accounts/"+env.OANDA_ACCOUNT_ID+"/pricing?instruments=EUR_USD",{Authorization:"Bearer "+env.OANDA_TOKEN});
    const p=data.prices?.[0];
    if(!p?.tradeable) throw Error("Forex quote unavailable");
    bid=Number(p.bids?.[0]?.price);ask=Number(p.asks?.[0]?.price);at=Date.parse(p.time);
  }else{
    if(!env.ALPACA_KEY||!env.ALPACA_SECRET) throw Error("Alpaca credentials required");
    source=symbol==="SPY"?"Alpaca IEX":"Alpaca Crypto";
    const path=symbol==="SPY"?"/v2/stocks/SPY/quotes/latest?feed=iex":"/v1beta3/crypto/us/latest/quotes?symbols=BTC%2FUSD";
    const data=await fetchJson("https://data.alpaca.markets"+path,{"APCA-API-KEY-ID":env.ALPACA_KEY,"APCA-API-SECRET-KEY":env.ALPACA_SECRET});
    const p=data.quote??data.quotes?.[symbol];
    bid=p?.bp;ask=p?.ap;at=Date.parse(p?.t);
  }
  if(!Number.isFinite(at)||Date.now()-at>2*interval||at>Date.now()+30000) throw Error("Stale quote or market closed");
  return {...quote((bid+ask)/2,bid,ask,at,symbol==="BTC/USD"?.003:.0005),rawBid:bid,rawAsk:ask,source};
}
function event(s,symbol,time,data){if(data)s.events.push({symbol,time,...data});}
export class Portfolio extends Agent {
  initialState=initial();
  async design(s,symbol,book,time){
    const day=Math.floor(time/86400000);
    if(s.aiDay===day)return;
    s.aiDay=day;
    book.lastDesign=time;
    try{
      const designQuotes=book.quotes.slice(0,-240);
      const movement=designQuotes.slice(1).map((q,i)=>Math.abs(q.mid/designQuotes[i].mid-1));
      const avg=movement.reduce((a,b)=>a+b,0)/movement.length;
      const raw=await generateStrategy(this.env,[{role:"system",content:"Return one JSON object only. family must be momentum or reversion, lookback must be 4, 8, 12 or 20, threshold must be 10, 20, 35 or 50 basis points. No additional keys."},
        {role:"user",content:JSON.stringify({symbol,meanAbsoluteReturn:avg,avoid:book.tried})}]);
      if(!valid(raw))throw Error("Invalid rule");
      const rule={family:raw.family,lookback:raw.lookback,threshold:raw.threshold};
      if(book.tried.some(r=>same(r,rule)))throw Error("Duplicate rule");
      book.tried=[...book.tried,rule].slice(-20);
      const report=evaluateCandidate(rule,book.quotes.slice(-240),replay,qualified);
      event(s,symbol,time,{action:"BACKTEST",rule,report});
      if(report.passed)book.challenger={rule,stats:blank()};
    }catch {
      event(s,symbol,time,{action:"DESIGN_FAILED"});
    }
  }
  async analyse(s,fresh,time){
    if(s.mode!=="provider"||!fresh.size||!this.env.OPENROUTER_API_KEY)return;
    const hour=Math.floor(time/3600000);
    if(s.analysisAttempt?.hour===hour)return;
    s.analysisAttempt={hour,time,status:"pending"};
    const inputs=Array.from(fresh,([symbol,q])=>{
      const previous=s.books[symbol].quotes.at(-2);
      return {symbol,source:q.source,time:q.time,mid:q.mid,bid:q.rawBid,ask:q.rawAsk,
        changePct:previous?(q.mid/previous.mid-1)*100:null};
    });
    try{
      const response=await generateStrategy(this.env,[
        {role:"system",content:"Summarise only the supplied market snapshots. Mention observed moves and uncertainty due to missing data. No forecasts, orders or news claims. Return JSON only as {\"summary\":\"up to 80 words\"}."},
        {role:"user",content:JSON.stringify(inputs)},
      ]);
      if(typeof response?.summary!=="string"||!response.summary.trim())throw new Error("Empty analysis");
      s.analysis={time,inputs,summary:response.summary.trim().slice(0,1000),
        model:this.env.OPENROUTER_MODEL?.trim()||"openrouter/free"};
      s.analysisAttempt.status="complete";
    }catch{
      s.analysisAttempt.status="failed";
    }
  }
  snapshot(){return this.state;}
  listResearch(){
    return this.ctx.storage.sql.exec(`SELECT symbol, date, rating FROM research ORDER BY symbol`).toArray();
  }
  saveResearch(report){
    this.ctx.storage.sql.exec(`
      INSERT INTO research (symbol, date, rating) VALUES (?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET date=excluded.date, rating=excluded.rating
      WHERE excluded.date >= research.date
    `,report.symbol,report.date,report.rating);
    return this.listResearch().find(row=>row.symbol===report.symbol);
  }
  onStart(){
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS research (symbol TEXT PRIMARY KEY, date TEXT NOT NULL, rating TEXT NOT NULL)");
  }
  async tick(time,reports=null){
    if(this.running)return;
    this.running=true;
    try{
      const mode=this.env.DATA_MODE==="provider"?"provider":"synthetic";
      const s=this.state.mode&&this.state.mode!==mode?initial():structuredClone(this.state);
      if(time<=s.last)return;
      s.mode=mode;
      s.last=time;
      s.tick++;
      const symbols=Object.keys(markets);
      const readings=await Promise.allSettled(symbols.map(symbol=>feed(symbol,this.env,time)));
      const fresh=new Map();
      for(let i=0;i<symbols.length;i++){
        const symbol=symbols[i];
        const b=s.books[symbol]??={quotes:[],tried:[],realised:0};
        const result=readings[i];
        if(result.status==="rejected"){b.status=result.reason.message;continue;}
        const q=result.value;
        if(q.time<= (b.last?.time??0)){b.status="Waiting for a fresh quote";continue;}
        b.last=q;
        b.status="Scanning";
        fresh.set(symbol,q);
      }
      const risk=()=>{
        s.pnl=Object.values(s.books).reduce((sum,b)=>sum+b.realised+(b.active?mark(b.active.stats,b.last):0),0);
        s.peak=Math.max(s.peak,s.pnl);
        if(s.peak-s.pnl>=lossLimit&&!s.halted){
          s.halted=true;
          event(s,"Portfolio",time,{action:"HALT"});
        }
      };
      risk();
      const stale=Object.entries(s.books).some(([symbol,b])=>b.active?.stats.entry&&!fresh.has(symbol));
      for(const [symbol,q] of fresh){
        const b=s.books[symbol];
        const prices=b.quotes.slice(-20).map(x=>x.mid);
        const research=researchEntryDecision(mode,symbol,reports,time);
        if(research.reason)b.status+=" · "+research.reason;
        if(b.active){
          if(!stale||b.active.stats.entry||s.halted){
            const fill=step(b.active.stats,b.active.rule,prices,q,s.halted,research.allowed);
            event(s,symbol,time,fill);
            if(fill?.breach){
              b.realised+=b.active.stats.pnl;
              b.active=null;
              event(s,symbol,time,{action:"RETIRE"});
            }
          }
        }
        if(!s.halted&&b.challenger){
          const c=b.challenger;
          if(step(c.stats,c.rule,prices,q,false,research.allowed)?.breach)b.challenger=null;
          else if(!b.active&&qualified(c.stats,12)&&!c.stats.entry){
            b.active={rule:c.rule,stats:blank()};
            b.challenger=null;
            event(s,symbol,time,{action:"PROMOTE",rule:c.rule});
          }
        }
        b.quotes=[...b.quotes.slice(-299),q];
        risk();
      }
      if(s.halted){
        for(const [symbol,q] of fresh){
          const b=s.books[symbol];
          if(b.active?.stats.entry)event(s,symbol,time,step(b.active.stats,b.active.rule,[],q,true));
        }
        risk();
      }
      await this.analyse(s,fresh,time);
      for(const symbol of symbols.toSorted((a,b)=>(s.books[a].lastDesign??0)-(s.books[b].lastDesign??0))){
        const b=s.books[symbol];
        if(!s.halted&&fresh.has(symbol)&&!b.active&&!b.challenger&&b.quotes.length>=280){
          await this.design(s,symbol,b,time);
          break;
        }
      }
      s.events=s.events.slice(-100);
      this.setState(s);
    }finally{this.running=false;}
  }
}
export default {
  async scheduled(controller,env){
    const agent=await getAgentByName(env.Portfolio,env.DATA_MODE==="provider"?"provider":"synthetic");
    let reports=null;
    if(env.DATA_MODE==="provider"){
      try{
        const researchAgent=await getAgentByName(env.Portfolio,"research");
        reports=await researchAgent.listResearch();
      }catch(error){
        console.warn("TradingAgents reports unavailable",error);
      }
    }
    await agent.tick(controller.scheduledTime,reports);
  },
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(request.method==="POST"&&path==="/api/research"){
      if(!env.RESEARCH_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.RESEARCH_TOKEN){
        return new Response("Unauthorized",{status:401});
      }
      const report=validateResearch(await request.json().catch(()=>null));
      if(!report)return Response.json({error:"Invalid research report"},{status:400});
      const agent=await getAgentByName(env.Portfolio,"research");
      const saved=await agent.saveResearch(report);
      if(saved.date!==report.date)return Response.json({error:"A newer report already exists"},{status:409});
      return Response.json(saved);
    }
    if(request.method!=="GET"||path!=="/")return new Response("Not found",{status:404});
    if(!env.DASHBOARD_TOKEN)return new Response("Set DASHBOARD_TOKEN",{status:503});
    const auth=request.headers.get("Authorization");
    if(auth!=="Basic "+btoa("demo:"+env.DASHBOARD_TOKEN)){
      return new Response("Sign in",{status:401,headers:{"WWW-Authenticate":'Basic realm="Trading Agents"'}});
    }
    const agent=await getAgentByName(env.Portfolio,env.DATA_MODE==="provider"?"provider":"synthetic");
    const researchAgent=await getAgentByName(env.Portfolio,"research");
    const [state,research]=await Promise.all([agent.snapshot(),researchAgent.listResearch().catch(()=>null)]);
    return new Response(dashboard(state,research,{
      symbols:Object.keys(markets),mode:env.DATA_MODE==="provider"?"provider":"synthetic",
      startingEquity:start,portfolioLimit:lossLimit,strategyLimit,positionSize:size,
      mark,researchDecision:researchEntryDecision,analysisConfigured:Boolean(env.OPENROUTER_API_KEY),
    }),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
  },
};
