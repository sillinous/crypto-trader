import React, { useState, useRef, useEffect } from "react";
import { fetchKlines, PAIRS, TIMEFRAMES } from "../binance.js";
import { generateStrategies, generateFromPrompt, scoreStrategy, passesQuality, QUALITY } from "../strategyFactory.js";
import { saveStrategy } from "../strategy.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6", purple:"#a855f7" };

const STYLES = [
  { id:"reversal",  label:"Mean Reversion",  icon:"🔄", desc:"Buy oversold, sell overbought — RSI, BB, Stoch" },
  { id:"trend",     label:"Trend Following", icon:"📈", desc:"Ride momentum — MACD, RSI mid-range, EMA" },
  { id:"breakout",  label:"Breakout",        icon:"🚀", desc:"Buy strength, ride continuation — BB, RSI high" },
  { id:"scalp",     label:"Scalping",        icon:"⚡", desc:"Tight SL/TP, fast signals — RSI + MACD + Stoch" },
];

const col = (n) => n > 0 ? T.green : n < 0 ? T.red : T.mute;
const colSharpe = (s) => s >= 1.5 ? T.green : s >= 0.5 ? T.amber : T.red;
const colWR = (w) => w >= 55 ? T.green : w >= 45 ? T.amber : T.red;
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function ScoreBadge({ score }) {
  const color = score >= 70 ? T.green : score >= 50 ? T.amber : score >= 30 ? T.sub : T.mute;
  const label = score >= 70 ? "ELITE" : score >= 50 ? "GOOD" : score >= 30 ? "OK" : "WEAK";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <div style={{ width:32, height:32, borderRadius:"50%", background:`${color}22`, border:`2px solid ${color}55`,
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, color }}>
        {Math.round(score)}
      </div>
      <div style={{ fontSize:8, color, fontWeight:700, letterSpacing:0.5 }}>{label}</div>
    </div>
  );
}

function StrategyCard({ strat, onSelect, onLoad, isSelected, rank }) {
  const r = strat._result;
  if (!r) return null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: isSelected ? "rgba(0,200,150,0.06)" : "rgba(255,255,255,0.02)",
      borderRadius:10, border:`1px solid ${isSelected ? T.green+"44" : T.border}`,
      padding:12, cursor:"pointer", transition:"all 0.15s" }}
      onClick={() => setExpanded(e => !e)}>

      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        {/* Rank */}
        <div style={{ width:22, height:22, borderRadius:6, background:"rgba(255,255,255,0.05)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800,
          color: rank === 1 ? T.amber : rank <= 3 ? T.sub : T.mute, flexShrink:0 }}>
          {rank === 1 ? "👑" : rank}
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
            <div style={{ fontSize:12, fontWeight:800, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {strat.name}
            </div>
            <div style={{ padding:"1px 6px", borderRadius:3, fontSize:8, fontWeight:700, flexShrink:0,
              background: strat.style==="reversal"?`${T.blue}22`:strat.style==="trend"?`${T.green}22`:strat.style==="breakout"?`${T.amber}22`:`${T.purple}22`,
              color: strat.style==="reversal"?T.blue:strat.style==="trend"?T.green:strat.style==="breakout"?T.amber:T.purple }}>
              {strat.style}
            </div>
          </div>
          {strat.description && <div style={{ fontSize:10, color:T.mute, marginBottom:6, lineHeight:1.4 }}>{strat.description}</div>}

          {/* Key metrics */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {[
              ["Return",  fmtPct(r.totalRet),         col(r.totalRet)],
              ["Sharpe",  r.sharpe.toFixed(2),         colSharpe(r.sharpe)],
              ["Win%",    `${r.winRate.toFixed(0)}%`,  colWR(r.winRate)],
              ["MaxDD",   `-${r.maxDD.toFixed(1)}%`,   r.maxDD > 15 ? T.red : T.mute],
              ["Trades",  r.tradeCount,                T.sub],
            ].map(([l,v,c]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:8, color:T.mute }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:800, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Score + actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
          <ScoreBadge score={strat._score} />
          <div style={{ display:"flex", gap:4 }}>
            <button onClick={e => { e.stopPropagation(); onSelect(strat); }}
              style={{ padding:"4px 8px", borderRadius:5, background:`${T.green}18`, border:`1px solid ${T.green}33`,
                color:T.green, cursor:"pointer", fontSize:9, fontWeight:700 }}>
              Use
            </button>
            <button onClick={e => { e.stopPropagation(); onLoad(strat); }}
              style={{ padding:"4px 8px", borderRadius:5, background:`${T.amber}15`, border:`1px solid ${T.amber}33`,
                color:T.amber, cursor:"pointer", fontSize:9, fontWeight:700 }}>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop:10, padding:"10px", background:"rgba(255,255,255,0.02)", borderRadius:8, border:`1px solid ${T.border}` }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:9, color:T.green, fontWeight:700, marginBottom:4 }}>ENTRY RULES</div>
              {strat.buyRules.map((r, i) => (
                <div key={i} style={{ fontSize:10, color:T.text, background:`${T.green}0d`, borderRadius:5, padding:"3px 7px", marginBottom:3 }}>
                  {r.indicator} {r.condition} {r.threshold}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:9, color:T.red, fontWeight:700, marginBottom:4 }}>EXIT RULES</div>
              {strat.sellRules.map((r, i) => (
                <div key={i} style={{ fontSize:10, color:T.text, background:`${T.red}0d`, borderRadius:5, padding:"3px 7px", marginBottom:3 }}>
                  {r.indicator} {r.condition} {r.threshold}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, fontSize:10 }}>
            {[
              ["Stop Loss", `${strat.stopLossPct}%`, T.red],
              ["Take Profit", `${strat.takeProfitPct}%`, T.green],
              ["R:R", `1:${(strat.takeProfitPct/strat.stopLossPct).toFixed(1)}`, T.amber],
              ["Size", `${strat.positionSizePct}%`, T.sub],
              ["Profit Factor", r.profitFactor===Infinity?"∞":r.profitFactor.toFixed(2), r.profitFactor>=1.5?T.green:T.amber],
            ].map(([l,v,c]) => (
              <div key={l} style={{ textAlign:"center", padding:"4px 8px", background:"rgba(255,255,255,0.03)", borderRadius:5 }}>
                <div style={{ fontSize:8, color:T.mute }}>{l}</div>
                <div style={{ fontSize:11, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyFactory({ setStrategy }) {
  const [pair, setPair] = useState("BTCUSDT");
  const [tf, setTf] = useState("1h");
  const [style, setStyle] = useState("reversal");
  const [count, setCount] = useState(80);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ pct:0, phase:"", tested:0, total:0, passing:0 });
  const [strategies, setStrategies] = useState([]);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("score");
  const [filterStyle, setFilterStyle] = useState("all");
  const [saved, setSaved] = useState(new Set());
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [tab, setTab] = useState("auto"); // "auto" | "ai"
  const cancelRef = useRef(false);

  const run = async () => {
    setRunning(true); setError(null); setStrategies([]); cancelRef.current = false;
    setProgress({ pct:0, phase:"fetching", tested:0, total:0, passing:0 });
    try {
      const candles = await fetchKlines(pair, tf, 500);
      if (cancelRef.current) { setRunning(false); return; }

      const results = await generateStrategies({
        candles,
        style,
        count,
        onProgress: (p) => {
          if (cancelRef.current) return;
          setProgress(p);
        },
      });
      if (!cancelRef.current) setStrategies(results);
    } catch(e) { if (!cancelRef.current) setError(e.message); }
    setRunning(false);
  };

  const cancel = () => { cancelRef.current = true; setRunning(false); };

  const runAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiRunning(true); setAiResult(null); setError(null);
    try {
      const candles = await fetchKlines(pair, tf, 500);
      const result = await generateFromPrompt(aiPrompt, candles);
      if (result) {
        setAiResult(result);
        // Add to list
        setStrategies(prev => {
          const without = prev.filter(s => !s.id?.startsWith("ai_"));
          return [result, ...without];
        });
      } else {
        setError("AI couldn't generate a valid strategy — try rephrasing your prompt");
      }
    } catch(e) { setError(e.message); }
    setAiRunning(false);
  };

  const useStrategy = (strat) => {
    const { _result, _score, ...clean } = strat;
    setStrategy(s => ({ ...s, ...clean }));
  };

  const saveSt = (strat) => {
    const { _result, _score, ...clean } = strat;
    saveStrategy({ ...clean, id: clean.id || `factory_${Date.now()}` });
    setSaved(prev => new Set([...prev, strat.id]));
  };

  const sorted = [...strategies]
    .filter(s => filterStyle === "all" || s.style === filterStyle)
    .sort((a,b) => {
      if (sortBy === "return")  return b._result.totalRet - a._result.totalRet;
      if (sortBy === "sharpe")  return b._result.sharpe - a._result.sharpe;
      if (sortBy === "winrate") return b._result.winRate - a._result.winRate;
      if (sortBy === "maxdd")   return a._result.maxDD - b._result.maxDD;
      return b._score - a._score;
    });

  const phaseLabel = {
    fetching:   "📡 Fetching market data...",
    backtesting:`⏱ Backtesting ${progress.tested}/${progress.total} candidates...`,
    naming:     "🧠 AI naming top strategies...",
    done:       "✅ Done",
  }[progress.phase] || "";

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}`, marginBottom:16 }}>
        {[["auto","🤖 Auto-Generate"],["ai","💬 AI from Prompt"]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:"9px 20px", background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:tab===id?700:400,
              borderBottom: tab===id?`2px solid ${T.amber}`:"2px solid transparent", color:tab===id?T.text:T.mute }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "auto" && (
        <>
          {/* Config row */}
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div>
              <div style={{ fontSize:9, color:T.mute, marginBottom:3 }}>PAIR</div>
              <select value={pair} onChange={e=>setPair(e.target.value)}
                style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12 }}>
                {PAIRS.map(p=><option key={p} value={p}>{p.replace("USDT","/USDT")}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:9, color:T.mute, marginBottom:3 }}>TIMEFRAME</div>
              <select value={tf} onChange={e=>setTf(e.target.value)}
                style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12 }}>
                {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:9, color:T.mute, marginBottom:3 }}>CANDIDATES</div>
              <select value={count} onChange={e=>setCount(parseInt(e.target.value))}
                style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12 }}>
                {[40,80,120,200].map(n=><option key={n} value={n}>{n} strategies</option>)}
              </select>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"flex-end" }}>
              {running ? (
                <button onClick={cancel}
                  style={{ padding:"8px 18px", borderRadius:7, background:`${T.red}22`, border:`1px solid ${T.red}44`, color:T.red, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  ✕ Cancel
                </button>
              ) : (
                <button onClick={run}
                  style={{ padding:"8px 22px", borderRadius:7, background:T.amber, color:"#000", border:"none", cursor:"pointer", fontWeight:800, fontSize:13 }}>
                  🔬 Generate
                </button>
              )}
            </div>
          </div>

          {/* Style selector */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:14 }}>
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                style={{ padding:"10px 8px", borderRadius:9, background: style===s.id?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.02)",
                  border:`1px solid ${style===s.id?T.amber+"55":T.border}`, cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:14, marginBottom:3 }}>{s.icon}</div>
                <div style={{ fontSize:11, fontWeight:700, color:style===s.id?T.amber:T.text }}>{s.label}</div>
                <div style={{ fontSize:9, color:T.mute, marginTop:2, lineHeight:1.4 }}>{s.desc}</div>
              </button>
            ))}
          </div>

          {/* Quality thresholds info */}
          <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(59,130,246,0.05)", border:`1px solid ${T.blue}22`, marginBottom:12, fontSize:10 }}>
            <span style={{ color:T.blue, fontWeight:700 }}>Quality filter: </span>
            <span style={{ color:T.mute }}>
              Sharpe ≥ {QUALITY.minSharpe} · Win Rate ≥ {QUALITY.minWinRate}% · Max DD ≤ {QUALITY.maxDrawdown}% · Min Trades ≥ {QUALITY.minTrades} · PF ≥ {QUALITY.minProfitFactor}
            </span>
          </div>
        </>
      )}

      {tab === "ai" && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:T.mute, marginBottom:8 }}>
            Describe a strategy in plain English — the AI will generate parameters and immediately backtest it.
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:9, color:T.mute, marginBottom:3 }}>PAIR</div>
              <select value={pair} onChange={e=>setPair(e.target.value)}
                style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12 }}>
                {PAIRS.map(p=><option key={p} value={p}>{p.replace("USDT","/USDT")}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:9, color:T.mute, marginBottom:3 }}>TIMEFRAME</div>
              <select value={tf} onChange={e=>setTf(e.target.value)}
                style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12 }}>
                {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Prompt ideas */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
            {[
              "Aggressive BTC scalping strategy with tight stop losses",
              "Conservative reversal strategy that avoids big drawdowns",
              "Trend-following strategy for altcoins on 4h timeframe",
              "RSI and MACD combination that works in ranging markets",
              "High win rate strategy using Bollinger Bands",
            ].map(p => (
              <button key={p} onClick={() => setAiPrompt(p)}
                style={{ padding:"4px 8px", borderRadius:5, border:`1px solid ${T.border}`, background:"rgba(255,255,255,0.03)",
                  color:T.mute, cursor:"pointer", fontSize:10, textAlign:"left",
                  ...(aiPrompt===p ? { background:`${T.amber}15`, border:`1px solid ${T.amber}33`, color:T.amber } : {}) }}>
                {p}
              </button>
            ))}
          </div>

          <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)}
            placeholder="Describe your strategy... e.g. 'A mean reversion strategy that buys when RSI is extremely oversold and volatility is high'"
            style={{ width:"100%", height:80, background:"rgba(255,255,255,0.04)", border:`1px solid ${T.border}`, borderRadius:8,
              padding:"10px 12px", color:T.text, fontSize:12, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}/>

          <button onClick={runAI} disabled={aiRunning || !aiPrompt.trim()}
            style={{ marginTop:8, padding:"8px 22px", borderRadius:7, background:aiRunning?"#333":T.green, color:aiRunning?T.mute:"#000",
              border:"none", cursor:aiRunning?"not-allowed":"pointer", fontWeight:800, fontSize:13 }}>
            {aiRunning ? "⏳ Generating + Backtesting..." : "✨ Generate Strategy"}
          </button>
        </div>
      )}

      {/* Progress */}
      {running && (
        <div style={{ marginBottom:14, padding:"12px 14px", borderRadius:10, background:"rgba(255,255,255,0.03)", border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:12, color:T.text, fontWeight:600 }}>{phaseLabel}</div>
            <div style={{ fontSize:11, color:T.amber, fontWeight:700 }}>{progress.pct}%</div>
          </div>
          <div style={{ height:5, background:"rgba(255,255,255,0.07)", borderRadius:3, marginBottom:8 }}>
            <div style={{ height:5, background:T.amber, borderRadius:3, width:`${progress.pct}%`, transition:"width 0.3s" }}/>
          </div>
          <div style={{ display:"flex", gap:16, fontSize:10, color:T.mute }}>
            <span>Tested: <span style={{ color:T.text }}>{progress.tested}/{progress.total}</span></span>
            <span>Passing quality: <span style={{ color:T.green, fontWeight:700 }}>{progress.passing}</span></span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding:"10px 14px", borderRadius:8, background:`${T.red}12`, border:`1px solid ${T.red}33`, color:T.red, fontSize:12, marginBottom:12 }}>
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {strategies.length > 0 && (
        <>
          {/* Toolbar */}
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap" }}>
            <div style={{ fontSize:11, color:T.green, fontWeight:700 }}>
              ✅ {strategies.length} quality strategies found
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <span style={{ fontSize:10, color:T.mute, alignSelf:"center" }}>Sort:</span>
              {[["score","Score"],["sharpe","Sharpe"],["return","Return"],["winrate","Win%"],["maxdd","Min DD"]].map(([k,l]) => (
                <button key={k} onClick={() => setSortBy(k)}
                  style={{ padding:"3px 8px", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer",
                    border:`1px solid ${sortBy===k?T.amber+"55":T.border}`, background:sortBy===k?`${T.amber}15`:"transparent",
                    color:sortBy===k?T.amber:T.mute }}>{l}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:4 }}>
              <span style={{ fontSize:10, color:T.mute, alignSelf:"center" }}>Filter:</span>
              {["all",...STYLES.map(s=>s.id)].map(id => (
                <button key={id} onClick={() => setFilterStyle(id)}
                  style={{ padding:"3px 8px", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer",
                    border:`1px solid ${filterStyle===id?T.blue+"55":T.border}`, background:filterStyle===id?`${T.blue}15`:"transparent",
                    color:filterStyle===id?T.blue:T.mute }}>
                  {id === "all" ? "All" : STYLES.find(s=>s.id===id)?.icon}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {sorted.map((strat, i) => (
              <StrategyCard
                key={strat.id}
                strat={strat}
                rank={i + 1}
                isSelected={saved.has(strat.id)}
                onSelect={useStrategy}
                onLoad={saveSt}
              />
            ))}
          </div>

          {sorted.length === 0 && (
            <div style={{ textAlign:"center", padding:30, color:T.mute }}>
              No strategies match the current filter
            </div>
          )}
        </>
      )}

      {!running && strategies.length === 0 && !error && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:T.mute }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🤖</div>
          <div style={{ fontSize:14, fontWeight:600, color:T.sub, marginBottom:6 }}>
            {tab==="auto" ? "Generate high-quality strategies automatically" : "Describe your ideal strategy in plain English"}
          </div>
          <div style={{ fontSize:11, maxWidth:400, margin:"0 auto", lineHeight:1.7 }}>
            {tab==="auto"
              ? `The factory tests ${count} candidate strategies against real ${pair} data, applies quality filters (Sharpe, win rate, drawdown, profit factor), names the survivors with AI, and ranks them by composite score.`
              : "The AI will interpret your description, generate trading rules, immediately backtest them on real data, and show you the results — all in one step."}
          </div>
        </div>
      )}
    </div>
  );
}
