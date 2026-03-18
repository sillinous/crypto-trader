import React, { useState } from "react";
import LiveChart from "./components/LiveChart.jsx";
import StrategyBuilder from "./components/StrategyBuilder.jsx";
import PineEditor from "./components/PineEditor.jsx";
import Backtester from "./components/Backtester.jsx";
import SignalMonitor from "./components/SignalMonitor.jsx";
import Exchange from "./components/Exchange.jsx";
import Optimizer from "./components/Optimizer.jsx";
import RiskDashboard from "./components/RiskDashboard.jsx";
import StrategyFactory from "./components/StrategyFactory.jsx";
import StrategyRefiner from "./components/StrategyRefiner.jsx";
import Settings from "./components/Settings.jsx";
import { DEFAULT_STRATEGY } from "./strategy.js";

const T = { bg:"#0d0d0f", panel:"#0e0f18", border:"#1e2030", text:"#e2e8f0", mute:"#475569", green:"#00c896", amber:"#f59e0b", red:"#ef4444", blue:"#3b82f6" };

const NAV = [
  { id:"chart",    icon:"📈", label:"Live Chart",       desc:"Real-time candles + indicators" },
  { id:"factory",  icon:"🤖", label:"Strategy Factory", desc:"Auto-generate profitable strategies", badge:"NEW" },
  { id:"refine",   icon:"🧬", label:"Refine Strategy",  desc:"Iterative AI refinement + history" },
  { id:"strategy", icon:"🔧", label:"Strategy Builder", desc:"Visual rule editor" },
  { id:"pine",     icon:"🌲", label:"PineScript I/O",   desc:"Import / export PineScript" },
  { id:"backtest", icon:"⏪", label:"Backtester",       desc:"Historical simulation" },
  { id:"signals",  icon:"🔔", label:"Signals",          desc:"Live alert monitor" },
  { id:"exchange", icon:"💱", label:"Exchange",         desc:"crypto.com trading" },
  { id:"optimize", icon:"🔬", label:"Optimizer",        desc:"Parameter sweep" },
  { id:"risk",     icon:"🛡️",  label:"Risk",             desc:"Dashboard + Kelly" },
  { id:"settings", icon:"⚙️",  label:"Settings",         desc:"API keys + preferences" },
];

export default function App() {
  const [view, setView] = useState("chart");
  const [strategy, setStrategy] = useState(() => {
    // Try to restore last strategy from localStorage
    try {
      const saved = localStorage.getItem("ct_active_strategy");
      return saved ? JSON.parse(saved) : DEFAULT_STRATEGY;
    } catch { return DEFAULT_STRATEGY; }
  });
  const [backtestResult, setBacktestResult] = useState(null);

  const updateStrategy = (s) => {
    const updated = typeof s === "function" ? s(strategy) : s;
    setStrategy(updated);
    try { localStorage.setItem("ct_active_strategy", JSON.stringify(updated)); } catch {}
  };

  const current = NAV.find(n => n.id === view);

  return (
    <div style={{display:"flex",minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'SF Mono','Fira Code',ui-monospace,monospace"}}>
      {/* Sidebar */}
      <div style={{width:200,background:T.panel,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"16px 14px 12px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:15,fontWeight:900,color:T.amber,letterSpacing:"-0.03em"}}>⚡ CryptoTrader</div>
          <div style={{fontSize:8,color:T.mute,marginTop:1,letterSpacing:1.5,textTransform:"uppercase"}}>Hybrid Trading Platform</div>
        </div>

        {/* Active strategy badge */}
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:8,color:T.mute,letterSpacing:1,marginBottom:2}}>ACTIVE STRATEGY</div>
          <div style={{fontSize:11,color:T.green,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.3}}>{strategy.name}</div>
          <div style={{fontSize:9,color:T.mute,marginTop:2}}>
            <span style={{color:T.green}}>{strategy.buyRules?.length||0}B</span>
            {" · "}
            <span style={{color:T.red}}>{strategy.sellRules?.length||0}S</span>
            {" · SL "}
            <span style={{color:T.red}}>{strategy.stopLossPct}%</span>
            {" · TP "}
            <span style={{color:T.green}}>{strategy.takeProfitPct}%</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:"6px 0"}}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setView(n.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px 14px",background:view===n.id?"rgba(255,255,255,0.06)":"none",
                border:"none",borderLeft:view===n.id?`3px solid ${T.amber}`:"3px solid transparent",
                color:view===n.id?T.text:T.mute,cursor:"pointer",fontSize:11,fontWeight:view===n.id?700:400,textAlign:"left",transition:"all 0.1s"}}>
              <span style={{fontSize:13,flexShrink:0}}>{n.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  {n.label}
                  {n.badge && <span style={{fontSize:7,fontWeight:900,padding:"1px 4px",borderRadius:3,background:`${T.green}22`,color:T.green,letterSpacing:0.5}}>{n.badge}</span>}
                </div>
                {view===n.id && <div style={{fontSize:9,color:T.mute,fontWeight:400,marginTop:1}}>{n.desc}</div>}
              </div>
            </button>
          ))}
        </nav>

        {/* Backtest result quick-glance */}
        {backtestResult && (
          <div style={{padding:"10px 14px",borderTop:`1px solid ${T.border}`}}>
            <div style={{fontSize:8,color:T.mute,letterSpacing:1,marginBottom:4}}>LAST BACKTEST</div>
            {[
              ["Return",  `${backtestResult.totalRet>=0?"+":""}${backtestResult.totalRet.toFixed(1)}%`, backtestResult.totalRet>=0?T.green:T.red],
              ["Sharpe",  backtestResult.sharpe.toFixed(2), backtestResult.sharpe>=1?T.green:backtestResult.sharpe>=0?T.amber:T.red],
              ["Win Rate",`${backtestResult.winRate.toFixed(0)}%`, backtestResult.winRate>=50?T.green:T.red],
            ].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                <span style={{color:T.mute}}>{l}</span>
                <span style={{color:c,fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"8px 14px",borderTop:`1px solid ${T.border}`,fontSize:8,color:`${T.mute}88`}}>
          <div>📡 Binance data feed</div>
          <div>💱 crypto.com execution</div>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* Topbar */}
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.panel,flexShrink:0}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:T.text}}>{current?.icon} {current?.label}</div>
            <div style={{fontSize:10,color:T.mute}}>{current?.desc}</div>
          </div>
          <div style={{display:"flex",gap:14,fontSize:10,color:T.mute,alignItems:"center"}}>
            {backtestResult && (
              <div style={{padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,cursor:"pointer"}}
                onClick={()=>setView("backtest")}>
                Last run: <span style={{color:backtestResult.totalRet>=0?T.green:T.red,fontWeight:700}}>
                  {backtestResult.totalRet>=0?"+":""}{backtestResult.totalRet.toFixed(1)}%
                </span>
              </div>
            )}
            <div style={{fontSize:10,color:T.mute}}>v1.0</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          {view==="chart"    && <LiveChart />}
          {view==="factory"  && <StrategyFactory setStrategy={s => { updateStrategy(s); setView("refine"); }}/>}
          {view==="refine"   && <StrategyRefiner strategy={strategy} backtestResult={backtestResult} setStrategy={s => { updateStrategy(s); }}/>}
          {view==="strategy" && <StrategyBuilder strategy={strategy} setStrategy={updateStrategy} onRun={()=>setView("backtest")} onRefine={()=>setView("refine")}/>}
          {view==="pine"     && <PineEditor strategy={strategy} setStrategy={updateStrategy}/>}
          {view==="backtest" && <Backtester strategy={strategy} onResult={r=>{setBacktestResult(r);}} onApplyStrategy={s=>{updateStrategy(s); setView("strategy");}}/>}
          {view==="settings" && <Settings />}
          {view==="signals"  && <SignalMonitor strategy={strategy}/>}
          {view==="exchange" && <Exchange />}
          {view==="optimize" && <Optimizer strategy={strategy} setStrategy={updateStrategy}/>}
          {view==="risk"     && <RiskDashboard backtestResult={backtestResult}/>}
        </div>
      </div>
    </div>
  );
}
