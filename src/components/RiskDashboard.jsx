import React, { useState, useMemo } from "react";

const T = { bg:"#0d0d0f", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6" };

function Gauge({ value, min=0, max=100, label, color, format }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const toAngle = p => (-135 + (p / 100) * 270) * (Math.PI / 180);
  const cx=60, cy=65, r=46;
  const describeArc = (startDeg, endDeg) => {
    const s = (startDeg * Math.PI / 180), e = (endDeg * Math.PI / 180);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx + r*Math.cos(s)} ${cy + r*Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${cx + r*Math.cos(e)} ${cy + r*Math.sin(e)}`;
  };
  const needleAngle = toAngle(pct);
  const nx = cx + (r-8) * Math.cos(needleAngle), ny = cy + (r-8) * Math.sin(needleAngle);
  return (
    <div style={{textAlign:"center"}}>
      <svg width={120} height={100} viewBox="0 0 120 100">
        {/* Background arc */}
        <path d={describeArc(-135, 135)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeLinecap="round"/>
        {/* Value arc */}
        {pct > 0.5 && <path d={describeArc(-135, -135 + pct/100*270)} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" opacity={0.9}/>}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r={5} fill={color}/>
        {/* Value text */}
        <text x={cx} y={cy+22} textAnchor="middle" fill={T.text} fontSize={13} fontWeight={800} fontFamily="monospace">
          {format ? format(value) : value.toFixed(1)}
        </text>
      </svg>
      <div style={{fontSize:9,color:T.mute,letterSpacing:0.5,marginTop:-6}}>{label}</div>
    </div>
  );
}

function KellyCalc() {
  const [wr, setWr] = useState(55);
  const [rr, setRr] = useState(2);
  const p = wr / 100, q = 1 - p;
  const kelly = ((p * rr - q) / rr) * 100;
  const halfKelly = kelly / 2;
  const quarterKelly = kelly / 4;
  return (
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`}}>
      <div style={{fontSize:12,fontWeight:700,color:T.amber,marginBottom:12}}>🎯 Kelly Criterion Calculator</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.mute,marginBottom:4}}>
            <span>WIN RATE</span><span style={{color:T.amber,fontWeight:700}}>{wr}%</span>
          </div>
          <input type="range" min={30} max={80} step={1} value={wr} onChange={e=>setWr(parseFloat(e.target.value))} style={{width:"100%",accentColor:T.amber}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:T.mute,marginTop:2}}><span>30%</span><span>80%</span></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.mute,marginBottom:4}}>
            <span>RISK:REWARD</span><span style={{color:T.blue,fontWeight:700}}>{rr}:1</span>
          </div>
          <input type="range" min={0.5} max={5} step={0.5} value={rr} onChange={e=>setRr(parseFloat(e.target.value))} style={{width:"100%",accentColor:T.blue}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:T.mute,marginTop:2}}><span>0.5</span><span>5</span></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {[
          ["Full Kelly", kelly, "Aggressive"],
          ["Half Kelly", halfKelly, "Recommended"],
          ["¼ Kelly", quarterKelly, "Conservative"],
        ].map(([l,v,sub])=>(
          <div key={l} style={{textAlign:"center",background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px 4px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:9,color:T.mute}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:v>0?T.green:T.red,margin:"4px 0"}}>{v.toFixed(1)}%</div>
            <div style={{fontSize:8,color:T.mute}}>{sub}</div>
          </div>
        ))}
      </div>
      {kelly <= 0 && (
        <div style={{marginTop:8,padding:"7px 10px",borderRadius:6,background:`${T.red}12`,border:`1px solid ${T.red}33`,color:T.red,fontSize:10}}>
          ⚠️ Negative Kelly — this edge has negative expected value at these parameters
        </div>
      )}
    </div>
  );
}

function MiniBarChart({ data, color }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => Math.abs(d.val)));
  return (
    <div style={{display:"flex",gap:1,alignItems:"flex-end",height:40,marginTop:6}}>
      {data.slice(-20).map((d,i) => {
        const h = max > 0 ? (Math.abs(d.val) / max) * 36 : 2;
        return (
          <div key={i} title={`${d.date}: ${d.val>=0?"+":""}${d.val.toFixed(2)}`}
            style={{flex:1,minWidth:4,height:h,background:d.val>=0?color:`${T.red}`,borderRadius:"2px 2px 0 0",opacity:0.85}}/>
        );
      })}
    </div>
  );
}

export default function RiskDashboard({ backtestResult: r }) {
  const [dailyPnl, setDailyPnl] = useState([]);
  const [newPnl, setNewPnl] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);

  const addDailyPnl = () => {
    const val = parseFloat(newPnl);
    if (isNaN(val)) return;
    setDailyPnl(prev => [...prev, { val, date: newDate }]);
    setNewPnl("");
  };

  const totalPnl = dailyPnl.reduce((s,d) => s + d.val, 0);
  const wins  = dailyPnl.filter(d => d.val > 0).length;
  const losses = dailyPnl.filter(d => d.val <= 0).length;

  const streak = useMemo(() => {
    if (!dailyPnl.length) return { count:0, positive:true };
    let count = 0;
    const sign = dailyPnl[dailyPnl.length - 1].val >= 0;
    for (let i = dailyPnl.length - 1; i >= 0; i--) {
      if ((dailyPnl[i].val >= 0) === sign) count++;
      else break;
    }
    return { count, positive: sign };
  }, [dailyPnl]);

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      {/* LEFT */}
      <div>
        {/* Gauges */}
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,border:`1px solid ${T.border}`,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:4}}>📊 Performance Gauges</div>
          <div style={{fontSize:10,color:T.mute,marginBottom:12}}>{r ? `Based on last backtest (${r.tradeCount} trades)` : "Run a backtest to populate gauges"}</div>
          {r ? (
            <div style={{display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:4}}>
              <Gauge value={r.winRate} label="WIN RATE" color={r.winRate>=55?T.green:r.winRate>=45?T.amber:T.red} format={v=>`${v.toFixed(0)}%`}/>
              <Gauge value={Math.min(100,r.maxDD*4)} label="DRAWDOWN RISK" color={r.maxDD>25?T.red:r.maxDD>12?T.amber:T.green} format={()=>`${r.maxDD.toFixed(1)}%`}/>
              <Gauge value={Math.min(100,Math.max(0,(r.sharpe+2)*25))} label="SHARPE RATIO" color={r.sharpe>=1.5?T.green:r.sharpe>=0.5?T.amber:T.red} format={()=>r.sharpe.toFixed(2)}/>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"30px 0",color:T.mute,fontSize:12}}>
              <div style={{fontSize:24,marginBottom:6}}>📉</div>
              Run a backtest to see performance gauges
            </div>
          )}
        </div>

        {/* Backtest metrics */}
        {r && (
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.blue,marginBottom:10}}>📈 Last Backtest Summary</div>
            {[
              ["Total Return",  `${r.totalRet>=0?"+":""}${r.totalRet.toFixed(2)}%`,  r.totalRet>=0?T.green:T.red],
              ["Max Drawdown",  `-${r.maxDD.toFixed(2)}%`,        T.red],
              ["Sharpe Ratio",  r.sharpe.toFixed(3),               r.sharpe>=1?T.green:r.sharpe>=0?T.amber:T.red],
              ["Profit Factor", r.profitFactor===Infinity?"∞":r.profitFactor.toFixed(2), r.profitFactor>=1.5?T.green:r.profitFactor>=1?T.amber:T.red],
              ["Win Rate",      `${r.winRate.toFixed(1)}%`,        r.winRate>=50?T.green:T.red],
              ["Total Trades",  r.tradeCount,                      T.sub],
              ["Final Equity",  `$${r.finalEquity.toFixed(0)}`,   r.totalRet>=0?T.green:T.red],
            ].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}22`,fontSize:11}}>
                <span style={{color:T.mute}}>{l}</span>
                <span style={{color:c,fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <KellyCalc />
      </div>

      {/* RIGHT */}
      <div>
        {/* Streak card */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`,textAlign:"center"}}>
            <div style={{fontSize:9,color:T.mute,letterSpacing:1,marginBottom:4}}>CURRENT STREAK</div>
            <div style={{fontSize:36,fontWeight:900,color:streak.count===0?T.mute:streak.positive?T.green:T.red,lineHeight:1}}>
              {streak.count===0?"—":streak.positive?`+${streak.count}`:`-${streak.count}`}
            </div>
            <div style={{fontSize:10,color:T.mute,marginTop:4}}>
              {streak.count===0?"No trades yet":streak.positive?`${streak.count} day win streak`:`${streak.count} day loss streak`}
            </div>
          </div>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`,textAlign:"center"}}>
            <div style={{fontSize:9,color:T.mute,letterSpacing:1,marginBottom:4}}>DAILY W/L</div>
            <div style={{fontSize:22,fontWeight:800,lineHeight:1}}>
              <span style={{color:T.green}}>{wins}</span>
              <span style={{color:T.mute}}>/</span>
              <span style={{color:T.red}}>{losses}</span>
            </div>
            <div style={{fontSize:10,color:T.mute,marginTop:4}}>
              {dailyPnl.length>0 ? `${(wins/dailyPnl.length*100).toFixed(0)}% day win rate` : "Log trades below"}
            </div>
          </div>
        </div>

        {/* Daily P&L tracker */}
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:10}}>📅 Daily P&L Journal</div>

          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
              style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,flex:"0 0 auto"}}/>
            <input type="number" value={newPnl} onChange={e=>setNewPnl(e.target.value)} placeholder="P&L ($)"
              onKeyDown={e=>e.key==="Enter"&&addDailyPnl()}
              style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:12}}/>
            <button onClick={addDailyPnl}
              style={{padding:"6px 14px",borderRadius:6,background:T.green,color:"#000",border:"none",cursor:"pointer",fontWeight:800,fontSize:13}}>+</button>
          </div>

          {dailyPnl.length > 0 && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",marginBottom:6}}>
                <span style={{fontSize:11,color:T.mute}}>Cumulative P&L</span>
                <span style={{fontSize:15,fontWeight:800,color:totalPnl>=0?T.green:T.red}}>{totalPnl>=0?"+":""}{totalPnl.toFixed(2)}</span>
              </div>
              <MiniBarChart data={dailyPnl} color={T.green} />
              <div style={{maxHeight:180,overflowY:"auto",marginTop:8}}>
                {[...dailyPnl].reverse().map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}11`,fontSize:11}}>
                    <span style={{color:T.mute}}>{d.date}</span>
                    <span style={{color:d.val>=0?T.green:T.red,fontWeight:700}}>{d.val>=0?"+":""}{d.val.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {dailyPnl.length === 0 && (
            <div style={{textAlign:"center",padding:"20px 0",color:T.mute,fontSize:11}}>
              Log your daily P&L to track performance over time
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
