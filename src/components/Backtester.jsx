import React, { useState, useEffect, useRef } from "react";
import { fetchKlines, PAIRS, TIMEFRAMES } from "../binance.js";
import { runBacktest } from "../backtest.js";
import { explainStrategy, improveStrategy, saveStrategy } from "../strategy.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", blue:"#3b82f6", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8" };
const fmt = (n,d=2) => typeof n==="number" ? n.toFixed(d) : "—";
const fmtPct = (n) => `${n>=0?"+":""}${fmt(n)}%`;
const col = (n) => n > 0 ? T.green : n < 0 ? T.red : T.mute;

function EquityChart({ equityCurve, trades }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !equityCurve?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 700, H = 160;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const min = Math.min(...equityCurve), max = Math.max(...equityCurve);
    const range = max - min || 1;
    const padL = 60, padR = 10, padT = 12, padB = 20;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const toX = i => padL + (i / (equityCurve.length - 1)) * plotW;
    const toY = v => padT + (1 - (v - min) / range) * plotH;

    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = T.border; ctx.lineWidth = 0.5;
    for (let g = 0; g <= 3; g++) {
      const y = padT + (g / 3) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      const v = max - (g / 3) * range;
      ctx.fillStyle = T.mute; ctx.font = "9px monospace"; ctx.textAlign = "right";
      ctx.fillText(`$${v.toFixed(0)}`, padL - 4, y + 3);
    }

    // Gradient fill under equity curve
    const grad = ctx.createLinearGradient(0, padT, 0, H);
    grad.addColorStop(0, `${T.green}33`); grad.addColorStop(1, `${T.green}00`);
    ctx.beginPath();
    equityCurve.forEach((v,i) => i===0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(equityCurve.length-1), H); ctx.lineTo(padL, H);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    // Equity line
    ctx.beginPath(); ctx.strokeStyle = T.green; ctx.lineWidth = 1.5;
    equityCurve.forEach((v,i) => i===0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.stroke();

    // Trade markers
    if (trades && equityCurve.length > 0) {
      trades.forEach(t => {
        const xi = Math.round((t.exitIdx / (equityCurve.length - 1)) * (equityCurve.length - 1));
        const x = toX(Math.min(xi, equityCurve.length - 1));
        const y = toY(equityCurve[Math.min(xi, equityCurve.length - 1)]);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = t.pnl >= 0 ? T.green : T.red;
        ctx.fill();
      });
    }

    // Starting capital line
    const startY = toY(equityCurve[0]);
    ctx.setLineDash([3,3]); ctx.strokeStyle = `${T.mute}66`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, startY); ctx.lineTo(W - padR, startY); ctx.stroke();
    ctx.setLineDash([]);
  }, [equityCurve, trades]);
  return <canvas ref={ref} style={{width:"100%",height:160,borderRadius:8,border:`1px solid ${T.border}`,display:"block"}} />;
}

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
      <div style={{fontSize:9,color:T.mute,letterSpacing:1,marginBottom:3}}>{label.toUpperCase()}</div>
      <div style={{fontSize:19,fontWeight:800,color:color||T.text,letterSpacing:"-0.02em",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:9,color:T.mute,marginTop:3}}>{sub}</div>}
    </div>
  );
}

export default function Backtester({ strategy, onResult }) {
  const [pair, setPair] = useState("BTCUSDT");
  const [tf, setTf] = useState("1h");
  const [capital, setCapital] = useState(10000);
  const [limit, setLimit] = useState(500);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiExplain, setAiExplain] = useState("");
  const [aiImproved, setAiImproved] = useState(null);
  const [aiLoading, setAiLoading] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [saved, setSaved] = useState(false);

  const run = async () => {
    setLoading(true); setError(null); setResult(null); setAiExplain(""); setAiImproved(null);
    try {
      const data = await fetchKlines(pair, tf, limit);
      const r = runBacktest(data, strategy, capital);
      if (!r) throw new Error("Insufficient data or no trades generated. Try a different pair/timeframe or adjust your strategy rules.");
      setResult(r);
      onResult?.(r);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const explain = async () => {
    setAiLoading("explain");
    const text = await explainStrategy(strategy, result);
    setAiExplain(text);
    setAiLoading("");
  };

  const improve = async () => {
    setAiLoading("improve");
    const improved = await improveStrategy(strategy, result);
    setAiImproved(improved);
    setAiLoading("");
  };

  const saveResult = () => {
    saveStrategy({ ...strategy, _lastBacktest: { pair, tf, ...result } });
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  };

  const filteredTrades = result?.trades?.filter(t => {
    if (tradeFilter === "wins")   return t.pnl > 0;
    if (tradeFilter === "losses") return t.pnl <= 0;
    if (tradeFilter === "sl")     return t.reason === "stop_loss";
    if (tradeFilter === "tp")     return t.reason === "take_profit";
    return true;
  }) || [];

  return (
    <div>
      {/* Controls */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end"}}>
        {[
          { label:"PAIR", val:pair, set:setPair, opts:PAIRS.map(p=>({v:p,l:p.replace("USDT","/USDT")})) },
          { label:"TIMEFRAME", val:tf, set:setTf, opts:TIMEFRAMES.map(t=>({v:t,l:t})) },
          { label:"CANDLES", val:limit, set:(v)=>setLimit(parseInt(v)), opts:[100,200,500,1000].map(n=>({v:n,l:n+" bars"})) },
        ].map(({label,val,set,opts}) => (
          <div key={label}>
            <div style={{fontSize:10,color:T.mute,marginBottom:3}}>{label}</div>
            <select value={val} onChange={e=>set(e.target.value)}
              style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:12}}>
              {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        ))}
        <div>
          <div style={{fontSize:10,color:T.mute,marginBottom:3}}>CAPITAL ($)</div>
          <input type="number" value={capital} onChange={e=>setCapital(parseFloat(e.target.value)||10000)}
            style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:12,width:100}}/>
        </div>
        <button onClick={run} disabled={loading}
          style={{padding:"8px 24px",borderRadius:8,background:loading?"#333":T.amber,color:loading?T.mute:"#000",border:"none",cursor:loading?"wait":"pointer",fontWeight:800,fontSize:13}}>
          {loading ? "⏳ Running..." : "▶ Run Backtest"}
        </button>
      </div>

      {/* Active strategy info */}
      <div style={{padding:"8px 12px",borderRadius:7,background:"rgba(255,255,255,0.02)",border:`1px solid ${T.border}`,marginBottom:14,fontSize:11,display:"flex",gap:16,flexWrap:"wrap"}}>
        <span style={{color:T.mute}}>Strategy: <span style={{color:T.text,fontWeight:700}}>{strategy.name}</span></span>
        <span style={{color:T.mute}}>Buy rules: <span style={{color:T.green}}>{strategy.buyRules?.length||0}</span></span>
        <span style={{color:T.mute}}>Sell rules: <span style={{color:T.red}}>{strategy.sellRules?.length||0}</span></span>
        <span style={{color:T.mute}}>SL: <span style={{color:T.red}}>{strategy.stopLossPct}%</span></span>
        <span style={{color:T.mute}}>TP: <span style={{color:T.green}}>{strategy.takeProfitPct}%</span></span>
        <span style={{color:T.mute}}>Size: <span style={{color:T.amber}}>{strategy.positionSizePct}%</span></span>
      </div>

      {error && (
        <div style={{padding:"10px 14px",borderRadius:8,background:`${T.red}12`,border:`1px solid ${T.red}33`,color:T.red,fontSize:12,marginBottom:16}}>
          ❌ {error}
        </div>
      )}

      {result && (
        <>
          {/* Metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            <MetricCard label="Total Return" value={fmtPct(result.totalRet)} color={col(result.totalRet)} sub={`$${result.totalPnl.toFixed(0)} P&L`}/>
            <MetricCard label="Win Rate" value={`${fmt(result.winRate)}%`} color={result.winRate>=55?T.green:result.winRate>=45?T.amber:T.red} sub={`${result.trades.filter(t=>t.pnl>0).length}W / ${result.trades.filter(t=>t.pnl<=0).length}L`}/>
            <MetricCard label="Max Drawdown" value={`-${fmt(result.maxDD)}%`} color={result.maxDD>20?T.red:result.maxDD>10?T.amber:T.green} sub="peak to trough"/>
            <MetricCard label="Sharpe Ratio" value={fmt(result.sharpe)} color={result.sharpe>=1.5?T.green:result.sharpe>=0.5?T.amber:T.red} sub="annualized"/>
            <MetricCard label="Profit Factor" value={result.profitFactor===Infinity?"∞":fmt(result.profitFactor)} color={result.profitFactor>=1.5?T.green:result.profitFactor>=1?T.amber:T.red} sub="gross win/loss"/>
            <MetricCard label="Total Trades" value={result.tradeCount} color={T.blue} sub={`${tf} · ${pair.replace("USDT","/USDT")}`}/>
            <MetricCard label="Final Equity" value={`$${result.finalEquity.toFixed(0)}`} color={col(result.totalRet)} sub={`started $${capital.toLocaleString()}`}/>
            <MetricCard label="Avg Trade" value={fmtPct(result.trades.length ? result.trades.reduce((s,t)=>s+t.pnlPct,0)/result.trades.length : 0)} color={col(result.totalPnl)} sub="per closed trade"/>
          </div>

          {/* Equity curve */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:11,color:T.mute}}>EQUITY CURVE <span style={{color:T.green,fontSize:9}}>● wins</span> <span style={{color:T.red,fontSize:9}}>● losses</span></div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={saveResult} style={{padding:"4px 10px",borderRadius:5,background:`${T.amber}15`,border:`1px solid ${T.amber}33`,color:T.amber,cursor:"pointer",fontSize:10,fontWeight:700}}>
                  {saved?"✓ Saved":"💾 Save"}
                </button>
              </div>
            </div>
            <EquityChart equityCurve={result.equityCurve} trades={result.trades} />
          </div>

          {/* AI tools */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={explain} disabled={!!aiLoading}
              style={{padding:"7px 16px",borderRadius:6,background:"rgba(59,130,246,0.12)",border:`1px solid ${T.blue}33`,color:T.blue,cursor:"pointer",fontSize:11,fontWeight:700,opacity:aiLoading?0.6:1}}>
              {aiLoading==="explain"?"⏳ Analyzing...":"🧠 AI Explain"}
            </button>
            <button onClick={improve} disabled={!!aiLoading}
              style={{padding:"7px 16px",borderRadius:6,background:"rgba(0,200,150,0.08)",border:`1px solid ${T.green}33`,color:T.green,cursor:"pointer",fontSize:11,fontWeight:700,opacity:aiLoading?0.6:1}}>
              {aiLoading==="improve"?"⏳ Improving...":"✨ AI Improve"}
            </button>
          </div>

          {aiExplain && (
            <div style={{padding:14,borderRadius:8,background:"rgba(59,130,246,0.06)",border:`1px solid ${T.blue}22`,fontSize:12,color:T.sub,lineHeight:1.8,marginBottom:12,whiteSpace:"pre-wrap"}}>
              <div style={{fontWeight:700,color:T.blue,marginBottom:6}}>🧠 AI Analysis</div>
              {aiExplain}
            </div>
          )}

          {aiImproved && (
            <div style={{padding:14,borderRadius:8,background:"rgba(0,200,150,0.06)",border:`1px solid ${T.green}22`,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:700,color:T.green,fontSize:12}}>✨ Improved Strategy: {aiImproved.name}</div>
                <button onClick={()=>{/* apply via parent */}} style={{padding:"4px 10px",borderRadius:5,background:`${T.green}22`,border:`1px solid ${T.green}44`,color:T.green,cursor:"pointer",fontSize:10,fontWeight:700}}>
                  Apply
                </button>
              </div>
              <pre style={{fontSize:10,color:T.mute,overflow:"auto",margin:0,lineHeight:1.5}}>{JSON.stringify(aiImproved,null,2)}</pre>
            </div>
          )}

          {/* Trade log */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:T.mute}}>TRADE LOG</div>
              <div style={{display:"flex",gap:4}}>
                {[["all","All"],["wins","Wins"],["losses","Losses"],["sl","Stop Loss"],["tp","Take Profit"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setTradeFilter(k)}
                    style={{padding:"3px 8px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",
                      border:`1px solid ${tradeFilter===k?T.amber+"55":T.border}`,background:tradeFilter===k?`${T.amber}18`:"transparent",
                      color:tradeFilter===k?T.amber:T.mute}}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{maxHeight:260,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:8}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"rgba(255,255,255,0.05)",position:"sticky",top:0}}>
                    {["#","Entry Date","Exit Date","Entry $","Exit $","Size","P&L","P&L%","Reason"].map(h=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:"right",color:T.mute,fontWeight:600,whiteSpace:"nowrap",
                        ...(h==="#"?{textAlign:"left"}:{})}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.length===0 ? (
                    <tr><td colSpan={9} style={{padding:20,textAlign:"center",color:T.mute}}>No trades match filter</td></tr>
                  ) : filteredTrades.map((t,i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${T.border}22`,background:t.pnl>0?"rgba(0,200,150,0.03)":"rgba(239,68,68,0.03)"}}>
                      <td style={{padding:"5px 10px",color:T.mute}}>{i+1}</td>
                      <td style={{padding:"5px 10px",color:T.sub,textAlign:"right"}}>{new Date(t.entryTime).toLocaleDateString()}</td>
                      <td style={{padding:"5px 10px",color:T.sub,textAlign:"right"}}>{new Date(t.exitTime).toLocaleDateString()}</td>
                      <td style={{padding:"5px 10px",color:T.text,textAlign:"right"}}>${t.entryPrice >= 100 ? t.entryPrice.toFixed(2) : t.entryPrice.toFixed(4)}</td>
                      <td style={{padding:"5px 10px",color:T.text,textAlign:"right"}}>${t.exitPrice >= 100 ? t.exitPrice.toFixed(2) : t.exitPrice.toFixed(4)}</td>
                      <td style={{padding:"5px 10px",color:T.mute,textAlign:"right"}}>{t.size.toFixed(4)}</td>
                      <td style={{padding:"5px 10px",color:col(t.pnl),fontWeight:700,textAlign:"right"}}>{t.pnl>=0?"+":""}${t.pnl.toFixed(2)}</td>
                      <td style={{padding:"5px 10px",color:col(t.pnlPct),textAlign:"right"}}>{fmtPct(t.pnlPct)}</td>
                      <td style={{padding:"5px 10px",textAlign:"right"}}>
                        <span style={{padding:"2px 6px",borderRadius:3,fontSize:9,fontWeight:700,
                          background:t.reason==="stop_loss"?`${T.red}22`:t.reason==="take_profit"?`${T.green}22`:`${T.blue}22`,
                          color:t.reason==="stop_loss"?T.red:t.reason==="take_profit"?T.green:T.blue}}>
                          {t.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:10,color:T.mute,marginTop:4}}>Showing {filteredTrades.length} of {result.trades.length} trades</div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{textAlign:"center",padding:"50px 0",color:T.mute}}>
          <div style={{fontSize:24,marginBottom:8}}>⏪</div>
          <div style={{fontSize:13,fontWeight:600,color:T.sub,marginBottom:4}}>Configure your strategy and run a backtest</div>
          <div style={{fontSize:11}}>Real Binance historical data · In-browser calculation · Full trade log</div>
        </div>
      )}
    </div>
  );
}
