import React, { useState, useRef, useEffect } from "react";
import { fetchKlines, PAIRS, TIMEFRAMES } from "../binance.js";
import { generateParamGrid, runBacktest } from "../backtest.js";

const T = { bg:"#0d0d0f", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6" };

function HeatmapCanvas({ results, xKey, yKey }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !results.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 700;
    const H = 280;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const xVals = [...new Set(results.map(r=>r.params[xKey]))].sort((a,b)=>a-b);
    const yVals = [...new Set(results.map(r=>r.params[yKey]))].sort((a,b)=>a-b);
    const padL = 40, padB = 30, padT = 10, padR = 10;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const cW = Math.floor(plotW / xVals.length);
    const cH = Math.floor(plotH / yVals.length);

    const sharpes = results.map(r => isFinite(r.sharpe) ? r.sharpe : 0);
    const minS = Math.min(...sharpes), maxS = Math.max(...sharpes);

    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);

    results.forEach(r => {
      const xi = xVals.indexOf(r.params[xKey]);
      const yi = yVals.indexOf(r.params[yKey]);
      if (xi < 0 || yi < 0) return;
      const s = isFinite(r.sharpe) ? r.sharpe : 0;
      const norm = maxS !== minS ? (s - minS) / (maxS - minS) : 0.5;
      // Red→yellow→green gradient
      const r2 = Math.floor((1 - norm) * 220);
      const g2 = Math.floor(norm * 200);
      ctx.fillStyle = `rgba(${r2},${g2},80,0.9)`;
      const x = padL + xi * cW, y = padT + yi * cH;
      ctx.fillRect(x, y, cW - 1, cH - 1);
      if (cW > 28 && cH > 16) {
        ctx.fillStyle = norm > 0.5 ? "#000" : "#fff";
        ctx.font = `bold 9px monospace`; ctx.textAlign = "center";
        ctx.fillText(r.sharpe.toFixed(1), x + cW/2, y + cH/2 + 3);
      }
    });

    // X axis labels
    ctx.fillStyle = T.mute; ctx.font = "10px monospace"; ctx.textAlign = "center";
    xVals.forEach((v,i) => ctx.fillText(v, padL + i * cW + cW/2, H - 8));
    // Y axis labels
    ctx.textAlign = "right";
    yVals.forEach((v,i) => ctx.fillText(v, padL - 4, padT + i * cH + cH/2 + 3));
    // Axis titles
    ctx.fillStyle = T.sub; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText(xKey === "stopLossPct" ? "Stop Loss %" : xKey, padL + plotW/2, H - 1);
  }, [results, xKey, yKey]);
  return <canvas ref={ref} style={{ width:"100%", height:280, borderRadius:8, border:`1px solid ${T.border}`, display:"block" }} />;
}

const RangeInput = ({ label, color, val, setVal }) => (
  <div style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:12,border:`1px solid ${T.border}`}}>
    <div style={{fontSize:11,color:color||T.amber,fontWeight:700,marginBottom:10}}>{label}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
      {["min","max","step"].map(k=>(
        <div key={k}>
          <div style={{fontSize:9,color:T.mute,marginBottom:3}}>{k.toUpperCase()}</div>
          <input type="number" value={val[k]}
            onChange={e=>setVal(v=>({...v,[k]:parseFloat(e.target.value)||0}))}
            style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 8px",color:T.text,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
        </div>
      ))}
    </div>
    <div style={{fontSize:10,color:T.mute,marginTop:6}}>
      {Math.max(0,Math.ceil((val.max - val.min) / (val.step||1)) + 1)} values to test
    </div>
  </div>
);

export default function Optimizer({ strategy, setStrategy }) {
  const [pair, setPair] = useState("BTCUSDT");
  const [tf, setTf] = useState("1h");
  const [slRange, setSlRange] = useState({ min:1, max:5, step:1 });
  const [tpRange, setTpRange] = useState({ min:2, max:10, step:2 });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("sharpe");

  const totalCombinations = Math.max(0,
    (Math.ceil((slRange.max - slRange.min) / (slRange.step||1)) + 1) *
    (Math.ceil((tpRange.max - tpRange.min) / (tpRange.step||1)) + 1)
  );

  const run = async () => {
    if (totalCombinations > 200) {
      if (!confirm(`This will test ${totalCombinations} combinations. Continue?`)) return;
    }
    setRunning(true); setResults([]); setProgress(0); setError(null);
    try {
      const candles = await fetchKlines(pair, tf, 500);
      setProgress(20);
      const grid = generateParamGrid([
        { key:"stopLossPct",   ...slRange },
        { key:"takeProfitPct", ...tpRange },
      ]);
      const allResults = [];
      const chunkSize = 8;
      for (let i = 0; i < grid.length; i += chunkSize) {
        grid.slice(i, i + chunkSize).forEach(params => {
          const strat = { ...strategy, ...params };
          const r = runBacktest(candles, strat);
          if (r) allResults.push({ params, ...r });
        });
        setProgress(20 + Math.floor((i / grid.length) * 78));
        await new Promise(r => setTimeout(r, 0));
      }
      allResults.sort((a,b) => b.sharpe - a.sharpe);
      setResults(allResults);
    } catch(e) { setError(e.message); }
    setProgress(100);
    setRunning(false);
  };

  const applyBest = () => {
    if (!results.length) return;
    setStrategy(s => ({ ...s, ...results[0].params }));
  };

  const sorted = [...results].sort((a,b) => {
    if (sortBy === "return")  return b.totalRet - a.totalRet;
    if (sortBy === "winrate") return b.winRate - a.winRate;
    if (sortBy === "maxdd")   return a.maxDD - b.maxDD;
    return b.sharpe - a.sharpe;
  });
  const best = sorted[0];

  return (
    <div>
      {/* Controls */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:10,color:T.mute,marginBottom:3}}>PAIR</div>
          <select value={pair} onChange={e=>setPair(e.target.value)} style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:12}}>
            {PAIRS.map(p=><option key={p} value={p}>{p.replace("USDT","/USDT")}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,color:T.mute,marginBottom:3}}>TIMEFRAME</div>
          <select value={tf} onChange={e=>setTf(e.target.value)} style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:12}}>
            {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{fontSize:10,color:T.mute,textAlign:"center"}}>
            {totalCombinations} combos<br/>
            <span style={{color:totalCombinations>100?T.amber:T.green}}>{totalCombinations > 100 ? "⚠️ slow" : "✓ fast"}</span>
          </div>
          <button onClick={run} disabled={running||totalCombinations===0}
            style={{padding:"8px 20px",borderRadius:7,background:running?T.mute:T.amber,color:"#000",border:"none",cursor:"pointer",fontWeight:800,fontSize:13,opacity:running?0.8:1}}>
            {running ? `⏳ ${progress}%` : "🔬 Run Optimization"}
          </button>
          {results.length>0 && <button onClick={applyBest}
            style={{padding:"8px 16px",borderRadius:7,background:`${T.green}22`,border:`1px solid ${T.green}44`,color:T.green,cursor:"pointer",fontSize:12,fontWeight:700}}>
            ✓ Apply Best
          </button>}
        </div>
      </div>

      {error && <div style={{padding:10,borderRadius:7,background:`${T.red}15`,border:`1px solid ${T.red}33`,color:T.red,fontSize:12,marginBottom:12}}>❌ {error}</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <RangeInput label="🔴 Stop Loss % Range" color={T.red} val={slRange} setVal={setSlRange} />
        <RangeInput label="🟢 Take Profit % Range" color={T.green} val={tpRange} setVal={setTpRange} />
      </div>

      {running && (
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.mute,marginBottom:4}}>
            <span>Testing combinations...</span><span>{progress}%</span>
          </div>
          <div style={{height:6,background:"rgba(255,255,255,0.07)",borderRadius:3}}>
            <div style={{height:6,background:T.amber,borderRadius:3,width:`${progress}%`,transition:"width 0.2s"}}/>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          {best && (
            <div style={{background:"rgba(0,200,150,0.06)",borderRadius:10,padding:14,border:`1px solid ${T.green}33`,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:T.green}}>🏆 Best Result from {results.length} combinations</div>
                <div style={{fontSize:11,color:T.mute}}>SL: <span style={{color:T.red}}>{best.params.stopLossPct}%</span> · TP: <span style={{color:T.green}}>{best.params.takeProfitPct}%</span></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
                {[
                  ["Sharpe",    best.sharpe.toFixed(2),         best.sharpe>=1?T.green:T.amber],
                  ["Return",    `${best.totalRet.toFixed(1)}%`, best.totalRet>0?T.green:T.red],
                  ["Win Rate",  `${best.winRate.toFixed(1)}%`,  best.winRate>=50?T.green:T.red],
                  ["Max DD",    `${best.maxDD.toFixed(1)}%`,    T.red],
                  ["Prof Fac",  best.profitFactor===Infinity?"∞":best.profitFactor.toFixed(2), best.profitFactor>=1.5?T.green:T.amber],
                  ["Trades",    best.tradeCount,                T.sub],
                ].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontSize:9,color:T.mute,letterSpacing:0.5}}>{l}</div>
                    <div style={{fontSize:17,fontWeight:800,color:c,marginTop:2}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:T.mute,marginBottom:6}}>SHARPE RATIO HEATMAP — Stop Loss % (X) × Take Profit % (Y)</div>
            <HeatmapCanvas results={results} xKey="stopLossPct" yKey="takeProfitPct" />
            <div style={{fontSize:10,color:T.mute,marginTop:4}}>🟥 Low Sharpe → 🟩 High Sharpe</div>
          </div>

          <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
            <span style={{fontSize:11,color:T.mute}}>Sort by:</span>
            {[["sharpe","Sharpe"],["return","Return"],["winrate","Win Rate"],["maxdd","Min Drawdown"]].map(([k,l])=>(
              <button key={k} onClick={()=>setSortBy(k)}
                style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",
                  border:`1px solid ${sortBy===k?T.amber+"66":T.border}`,background:sortBy===k?`${T.amber}18`:"transparent",
                  color:sortBy===k?T.amber:T.mute}}>{l}</button>
            ))}
          </div>

          <div style={{maxHeight:260,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"rgba(255,255,255,0.05)",position:"sticky",top:0}}>
                  {["#","SL%","TP%","Sharpe","Return","Win%","MaxDD","Trades","PF"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:"right",color:T.mute,fontWeight:600,whiteSpace:"nowrap",
                      ...(h==="#"?{textAlign:"left"}:{})}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0,30).map((r,i)=>(
                  <tr key={i} onClick={()=>setStrategy(s=>({...s,...r.params}))}
                    style={{borderTop:`1px solid ${T.border}22`,background:i===0?"rgba(0,200,150,0.04)":"transparent",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                    onMouseLeave={e=>e.currentTarget.style.background=i===0?"rgba(0,200,150,0.04)":"transparent"}>
                    <td style={{padding:"5px 10px",color:i===0?T.amber:T.mute}}>{i===0?"👑":i+1}</td>
                    <td style={{padding:"5px 10px",color:T.red,textAlign:"right",fontWeight:600}}>{r.params.stopLossPct}%</td>
                    <td style={{padding:"5px 10px",color:T.green,textAlign:"right",fontWeight:600}}>{r.params.takeProfitPct}%</td>
                    <td style={{padding:"5px 10px",color:r.sharpe>=1?T.green:r.sharpe>=0?T.amber:T.red,fontWeight:700,textAlign:"right"}}>{r.sharpe.toFixed(2)}</td>
                    <td style={{padding:"5px 10px",color:r.totalRet>0?T.green:T.red,textAlign:"right"}}>{r.totalRet.toFixed(1)}%</td>
                    <td style={{padding:"5px 10px",color:r.winRate>=50?T.green:T.red,textAlign:"right"}}>{r.winRate.toFixed(1)}%</td>
                    <td style={{padding:"5px 10px",color:T.red,textAlign:"right"}}>{r.maxDD.toFixed(1)}%</td>
                    <td style={{padding:"5px 10px",color:T.sub,textAlign:"right"}}>{r.tradeCount}</td>
                    <td style={{padding:"5px 10px",color:r.profitFactor>=1.5?T.green:T.amber,textAlign:"right"}}>{r.profitFactor===Infinity?"∞":r.profitFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10,color:T.mute,marginTop:4}}>Click any row to apply those parameters to your strategy</div>
        </>
      )}
    </div>
  );
}
