import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fetchKlines, PAIRS, TIMEFRAMES } from "../binance.js";
import { runBacktest } from "../backtest.js";
import { toPineScript } from "../strategy.js";
import { refineStrategy, analyzeWeakness, scoreStrategy, saveRefinementSession, loadRefinementSession } from "../strategyFactory.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6", purple:"#a855f7", teal:"#06b6d4" };
const col = (n) => n > 0 ? T.green : n < 0 ? T.red : T.mute;
const fmtPct = (n) => n == null ? "—" : `${n>=0?"+":""}${n.toFixed(1)}%`;

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function MarkdownText({ text }) {
  const html = (text || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, `<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:10px">$1</code>`)
    .replace(/\n/g, "<br/>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ curr, prev, invert = false, suffix = "", decimals = 1 }) {
  if (prev == null || curr == null) return null;
  const d = curr - prev;
  if (Math.abs(d) < 0.005) return <span style={{ color:T.mute, fontSize:9 }}>±0</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span style={{ fontSize:9, color:good?T.green:T.red, fontWeight:800, marginLeft:3 }}>
      {d > 0 ? "▲" : "▼"}{Math.abs(d).toFixed(decimals)}{suffix}
    </span>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 48 }) {
  const c = score >= 70 ? T.green : score >= 50 ? T.amber : score >= 30 ? T.sub : T.red;
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{ fill:c, fontSize:11, fontWeight:900, transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ── Score sparkline ───────────────────────────────────────────────────────────
function ScoreSparkline({ scores }) {
  if (scores.length < 2) return null;
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const W = 120, H = 32;
  const pts = scores.map((s, i) => `${(i / (scores.length - 1)) * W},${H - ((s - min) / range) * (H - 4) - 2}`).join(" ");
  const lastColor = scores[scores.length-1] >= scores[0] ? T.green : T.red;
  return (
    <div style={{ position:"relative" }}>
      <svg width={W} height={H}>
        <polyline points={pts} fill="none" stroke={lastColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        {scores.map((s, i) => (
          <circle key={i} cx={(i / (scores.length-1)) * W} cy={H - ((s-min)/range)*(H-4) - 2} r={2} fill={lastColor} opacity={i===scores.length-1?1:0.4}/>
        ))}
      </svg>
      <div style={{ fontSize:8, color:T.mute, marginTop:1 }}>Score trend ({scores.length} versions)</div>
    </div>
  );
}

// ── Rule diff ─────────────────────────────────────────────────────────────────
function RuleDiff({ before, after }) {
  if (!before || !after) return null;
  const changes = [];
  if (before.stopLossPct !== after.stopLossPct)
    changes.push({ type:"changed", label:`SL: ${before.stopLossPct}% → ${after.stopLossPct}%` });
  if (before.takeProfitPct !== after.takeProfitPct)
    changes.push({ type:"changed", label:`TP: ${before.takeProfitPct}% → ${after.takeProfitPct}%` });
  if (before.positionSizePct !== after.positionSizePct)
    changes.push({ type:"changed", label:`Size: ${before.positionSizePct}% → ${after.positionSizePct}%` });

  const bBuy = before.buyRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`) || [];
  const aBuy = after.buyRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`) || [];
  bBuy.filter(r => !aBuy.includes(r)).forEach(r => changes.push({ type:"removed", label:`− ${r}` }));
  aBuy.filter(r => !bBuy.includes(r)).forEach(r => changes.push({ type:"added",   label:`+ ${r}` }));

  const bSell = before.sellRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`) || [];
  const aSell = after.sellRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`) || [];
  bSell.filter(r => !aSell.includes(r)).forEach(r => changes.push({ type:"removed", label:`Exit − ${r}` }));
  aSell.filter(r => !bSell.includes(r)).forEach(r => changes.push({ type:"added",   label:`Exit + ${r}` }));

  if (!changes.length) return <div style={{ fontSize:9, color:T.mute }}>No structural changes</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:4 }}>
      {changes.map((c, i) => (
        <div key={i} style={{ fontSize:9, color: c.type==="added"?T.green:c.type==="removed"?T.red:T.amber,
          background:`rgba(${c.type==="added"?"0,200,150":c.type==="removed"?"239,68,68":"245,158,11"},0.08)`,
          borderRadius:4, padding:"2px 6px" }}>
          {c.label}
        </div>
      ))}
    </div>
  );
}

// ── Version card ──────────────────────────────────────────────────────────────
function VersionCard({ v, index, total, isCurrent, isComparing, onRestore, onCompare, onExportPine, prevVersion }) {
  const score = v.result ? scoreStrategy(v.result) : 0;
  const prevScore = prevVersion?.result ? scoreStrategy(prevVersion.result) : null;
  const delta = prevScore != null ? score - prevScore : 0;
  const vNum = total - index;

  return (
    <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
      {/* Connector */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, width:28 }}>
        <div style={{ width:20, height:20, borderRadius:"50%", zIndex:1,
          background:isCurrent?T.amber:delta>0?`${T.green}33`:delta<0?`${T.red}22`:"rgba(255,255,255,0.08)",
          border:`2px solid ${isCurrent?T.amber:delta>0?T.green+"55":delta<0?T.red+"44":T.border}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:8, fontWeight:900, color:isCurrent?"#000":delta>0?T.green:delta<0?T.red:T.mute }}>
          v{vNum}
        </div>
        {!isCurrent && index < total - 1 && <div style={{ width:2, flex:1, minHeight:8, background:`${T.border}66` }}/>}
      </div>

      <div style={{ flex:1, background:isCurrent?"rgba(255,165,0,0.05)":isComparing?"rgba(59,130,246,0.05)":"rgba(255,255,255,0.02)",
        borderRadius:8, padding:"8px 10px",
        border:`1px solid ${isCurrent?T.amber+"44":isComparing?T.blue+"44":T.border}` }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:isCurrent?T.amber:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {v.strategy?.name}
            </div>
            <div style={{ fontSize:8, color:T.mute, marginTop:1 }}>
              {isCurrent ? "● Current" : v.note?.slice(0,40)}{v.note?.length > 40 ? "…" : ""}
            </div>
          </div>
          <div style={{ display:"flex", gap:3, alignItems:"center", flexShrink:0, marginLeft:4 }}>
            <div style={{ fontSize:10, fontWeight:800,
              color:score>=70?T.green:score>=50?T.amber:score>=30?T.sub:T.red }}>
              {Math.round(score)}
              {delta !== 0 && <span style={{ fontSize:8, color:delta>0?T.green:T.red }}>{delta>0?"▲":"▼"}{Math.abs(delta).toFixed(0)}</span>}
            </div>
          </div>
        </div>

        {v.result && (
          <div style={{ display:"flex", gap:6, fontSize:8, marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ color:col(v.result.totalRet), fontWeight:700 }}>{fmtPct(v.result.totalRet)}</span>
            <span style={{ color:T.mute }}>Sh {v.result.sharpe?.toFixed(2)}</span>
            <span style={{ color:v.result.winRate>=50?T.green:T.red }}>WR {v.result.winRate?.toFixed(0)}%</span>
            <span style={{ color:T.red }}>DD {v.result.maxDD?.toFixed(1)}%</span>
            <span style={{ color:T.sub }}>{v.result.tradeCount}T</span>
          </div>
        )}

        {/* Diff vs prev */}
        {prevVersion && <RuleDiff before={prevVersion.strategy} after={v.strategy} />}

        <div style={{ display:"flex", gap:4, marginTop:6 }}>
          {!isCurrent && (
            <button onClick={() => onRestore(v)}
              style={{ padding:"2px 7px", borderRadius:4, background:"rgba(255,255,255,0.06)", border:`1px solid ${T.border}`,
                color:T.mute, cursor:"pointer", fontSize:8, fontWeight:700 }}>↩ Restore</button>
          )}
          <button onClick={() => onCompare(isCurrent ? null : v)}
            style={{ padding:"2px 7px", borderRadius:4,
              background:isComparing?`${T.blue}22`:"rgba(255,255,255,0.04)", border:`1px solid ${isComparing?T.blue+"55":T.border}`,
              color:isComparing?T.blue:T.mute, cursor:"pointer", fontSize:8, fontWeight:700 }}>
            {isComparing?"✓ Comparing":"⇄ Compare"}
          </button>
          <button onClick={() => onExportPine(v.strategy)}
            style={{ padding:"2px 7px", borderRadius:4, background:"rgba(255,255,255,0.04)", border:`1px solid ${T.border}`,
              color:T.mute, cursor:"pointer", fontSize:8, fontWeight:700 }}>🌲 Pine</button>
        </div>
      </div>
    </div>
  );
}

// ── Comparison panel ──────────────────────────────────────────────────────────
function ComparePanel({ a, b, onClose }) {
  if (!a || !b) return null;
  const metrics = [
    ["Return",      "totalRet",     "%",  false, v => fmtPct(v)],
    ["Sharpe",      "sharpe",       "",   false, v => v?.toFixed(2)],
    ["Win Rate",    "winRate",      "%",  false, v => `${v?.toFixed(1)}%`],
    ["Max DD",      "maxDD",        "%",  true,  v => `-${v?.toFixed(1)}%`],
    ["Trades",      "tradeCount",   "",   false, v => v],
    ["Prof Factor", "profitFactor", "",   false, v => v === Infinity ? "∞" : v?.toFixed(2)],
  ];
  return (
    <div style={{ background:"rgba(59,130,246,0.06)", borderRadius:10, padding:14, border:`1px solid ${T.blue}33`, marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.blue }}>⇄ Side-by-Side Comparison</div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:T.mute, cursor:"pointer", fontSize:14 }}>×</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 1fr", gap:0 }}>
        <div style={{ fontSize:10, fontWeight:700, color:T.amber, textAlign:"center", marginBottom:6 }}>
          {a.strategy?.name}
        </div>
        <div/>
        <div style={{ fontSize:10, fontWeight:700, color:T.blue, textAlign:"center", marginBottom:6 }}>
          {b.strategy?.name}
        </div>
        {metrics.map(([label, key, suf, inv, fmt]) => {
          const va = a.result?.[key], vb = b.result?.[key];
          const aWins = va != null && vb != null && (inv ? va < vb : va > vb);
          const bWins = va != null && vb != null && (inv ? vb < va : vb > va);
          return [
            <div key={`a-${key}`} style={{ padding:"5px 8px", textAlign:"right", fontSize:11, fontWeight:700,
              color:aWins?T.green:T.text, background:aWins?"rgba(0,200,150,0.06)":undefined, borderRadius:"6px 0 0 6px" }}>
              {va != null ? fmt(va) : "—"}
            </div>,
            <div key={`l-${key}`} style={{ padding:"5px 4px", textAlign:"center", fontSize:9, color:T.mute, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {label}
            </div>,
            <div key={`b-${key}`} style={{ padding:"5px 8px", textAlign:"left", fontSize:11, fontWeight:700,
              color:bWins?T.green:T.text, background:bWins?"rgba(0,200,150,0.06)":undefined, borderRadius:"0 6px 6px 0" }}>
              {vb != null ? fmt(vb) : "—"}
            </div>,
          ];
        })}
      </div>
    </div>
  );
}

// ── Quick requests ────────────────────────────────────────────────────────────
const QUICK_REQS = [
  { label:"↑ Win Rate",    prompt:"Increase the win rate, even at the cost of fewer trades" },
  { label:"↓ Drawdown",    prompt:"Reduce the maximum drawdown and protect capital better" },
  { label:"↑ Sharpe",      prompt:"Improve the Sharpe ratio by optimizing the risk/reward balance" },
  { label:"More Trades",   prompt:"Generate more trade signals by relaxing entry conditions" },
  { label:"Fewer Trades",  prompt:"Filter entries more strictly to reduce noise and false signals" },
  { label:"Less Risk",     prompt:"Make this more conservative — reduce position size and tighten stop loss" },
  { label:"Add MACD",      prompt:"Add MACD as a confirming indicator to the entry signal" },
  { label:"Add Stoch",     prompt:"Add Stochastic as an additional filter to reduce false signals" },
  { label:"Add BB",        prompt:"Incorporate Bollinger Bands to improve entry timing" },
  { label:"Tighter SL",    prompt:"Use a tighter stop loss to cut losses faster" },
  { label:"Wider SL",      prompt:"Widen the stop loss to avoid getting stopped out on noise" },
  { label:"Bigger TP",     prompt:"Increase the take profit target to capture larger moves" },
  { label:"Scalp mode",    prompt:"Optimize for high-frequency small gains — tight SL/TP, many trades" },
  { label:"Swing mode",    prompt:"Optimize for longer holds and bigger moves — wider SL/TP" },
  { label:"Best overall",  prompt:"Optimize everything holistically to maximize the composite quality score" },
];

// ── Auto-refine loop ──────────────────────────────────────────────────────────
const AUTO_GOALS = [
  { id:"score",   label:"Max Score",    desc:"Maximize composite score" },
  { id:"sharpe",  label:"Max Sharpe",   desc:"Maximize Sharpe ratio" },
  { id:"winrate", label:"Max Win Rate", desc:"Maximize win rate" },
  { id:"dd",      label:"Min Drawdown", desc:"Minimize max drawdown" },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function StrategyRefiner({ strategy, backtestResult, setStrategy }) {
  const [pair, setPair]         = useState("BTCUSDT");
  const [tf, setTf]             = useState("1h");
  const [candles, setCandles]   = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataStatus, setDataStatus]   = useState(null); // "loaded" | "error" | null

  const [current, setCurrent]   = useState({ strategy, result: backtestResult });
  const [history, setHistory]   = useState([]);
  const [request, setRequest]   = useState("");
  const [refining, setRefining] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoGoal, setAutoGoal] = useState("score");
  const [autoRounds, setAutoRounds] = useState(3);
  const [autoProgress, setAutoProgress] = useState(0);
  const cancelAutoRef = useRef(false);

  const [error, setError]       = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
  const [loadingWeak, setLoadingWeak] = useState(false);
  const [chat, setChat]         = useState([]);
  const [compareVersion, setCompareVersion] = useState(null);
  const [rightTab, setRightTab] = useState("history"); // "history" | "rules" | "pine"
  const [copiedPine, setCopiedPine] = useState(false);
  const chatEndRef = useRef();

  // Restore session
  useEffect(() => {
    const sid = strategy.id;
    if (!sid) return;
    const saved = loadRefinementSession(sid);
    if (saved?.current) {
      setHistory(saved.history || []);
      setCurrent(saved.current);
      setChat(saved.chat || []);
    } else {
      setCurrent({ strategy, result: backtestResult });
    }
  }, [strategy.id]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chat]);

  // Persist
  useEffect(() => {
    if (!strategy.id) return;
    saveRefinementSession(strategy.id, { history, current, chat });
  }, [history, current, chat, strategy.id]);

  // Auto-load candles on mount
  useEffect(() => {
    loadCandles(pair, tf);
  }, []);

  const loadCandles = useCallback(async (p, t) => {
    setLoadingData(true); setDataStatus(null); setError(null);
    try {
      const data = await fetchKlines(p || pair, t || tf, 500);
      setCandles(data);
      setDataStatus("loaded");
      // Re-run backtest on current strategy with fresh data
      const r = runBacktest(data, current.strategy);
      if (r) setCurrent(c => ({ ...c, result: r }));
      return data;
    } catch(e) {
      setDataStatus("error");
      setError(`Data error: ${e.message}`);
      return null;
    } finally { setLoadingData(false); }
  }, [pair, tf, current.strategy]);

  const addChat = (role, text, extras = {}) =>
    setChat(prev => [...prev, { role, text, ts: Date.now(), ...extras }]);

  const runRefinement = async (overrideRequest) => {
    const reqText = (overrideRequest || request).trim();
    if (!reqText || refining) return;
    setRefining(true); setError(null);
    addChat("user", reqText);
    if (!overrideRequest) setRequest("");

    let data = candles;
    if (!data.length) {
      data = await loadCandles();
      if (!data) { setRefining(false); return; }
    }

    try {
      const improved = await refineStrategy({
        strategy: current.strategy,
        result:   current.result,
        history,
        request:  reqText,
        candles:  data,
      });
      if (!improved) throw new Error("AI returned an invalid strategy — try rephrasing");

      const archived = { ...current, note: reqText, ts: Date.now() };
      setHistory(prev => [archived, ...prev]);

      const next = { strategy: improved, result: improved._result };
      setCurrent(next);

      const r = improved._result;
      const p = current.result;
      const scoreNow  = scoreStrategy(r  || {});
      const scorePrev = scoreStrategy(p || {});
      const delta = scoreNow - scorePrev;

      addChat("assistant",
        `**${improved.name}**\n${improved.description || ""}\n\n**Changes:** ${summarizeChanges(current.strategy, improved)}\n**Score:** ${Math.round(scoreNow)} ${delta>0?`▲+${delta.toFixed(0)}`:delta<0?`▼${delta.toFixed(0)}`:"—"}`,
        { metrics: r && p ? { returnDelta: r.totalRet-(p.totalRet||0), sharpeDelta: r.sharpe-(p.sharpe||0), wrDelta: r.winRate-(p.winRate||0), ddDelta: r.maxDD-(p.maxDD||0) } : null }
      );
      return improved;
    } catch(e) {
      setError(e.message);
      addChat("assistant", `❌ ${e.message}`);
      return null;
    } finally { setRefining(false); }
  };

  // Auto-refine loop
  const runAutoRefine = async () => {
    if (!candles.length) {
      const data = await loadCandles();
      if (!data) return;
    }
    setAutoRunning(true); cancelAutoRef.current = false;
    addChat("system", `🤖 Auto-refining for ${autoRounds} rounds targeting **${AUTO_GOALS.find(g=>g.id===autoGoal)?.label}**...`);

    const goalPrompts = {
      score:   "Optimize everything holistically to maximize the composite quality score",
      sharpe:  "Improve the Sharpe ratio — better risk-adjusted returns",
      winrate: "Maximize the win rate without sacrificing too many trades",
      dd:      "Minimize the maximum drawdown — protect capital above all else",
    };

    let best = current;
    const getMetric = (r) => {
      if (!r) return -Infinity;
      if (autoGoal === "score")   return scoreStrategy(r);
      if (autoGoal === "sharpe")  return r.sharpe;
      if (autoGoal === "winrate") return r.winRate;
      if (autoGoal === "dd")      return -(r.maxDD);
      return scoreStrategy(r);
    };

    for (let i = 0; i < autoRounds; i++) {
      if (cancelAutoRef.current) break;
      setAutoProgress(Math.round(((i) / autoRounds) * 100));
      addChat("system", `Round ${i+1}/${autoRounds}...`);
      const result = await runRefinement(goalPrompts[autoGoal]);
      if (result && getMetric(result._result) > getMetric(best.result)) {
        best = { strategy: result, result: result._result };
      }
    }
    setAutoProgress(100);
    setAutoRunning(false);
    addChat("system", `✅ Auto-refine complete — ${autoRounds} rounds done`);
  };

  const cancelAuto = () => { cancelAutoRef.current = true; setAutoRunning(false); };

  const analyzeNow = async () => {
    setLoadingWeak(true);
    if (!candles.length) await loadCandles();
    const ws = await analyzeWeakness({ strategy: current.strategy, result: current.result, history });
    setWeaknesses(ws);
    setLoadingWeak(false);
  };

  const restore = (v) => {
    addChat("system", `↩ Restored to: **${v.strategy?.name}**`);
    setCurrent({ strategy: v.strategy, result: v.result });
  };

  const applyToCurrent = () => {
    const { _result, _score, ...clean } = current.strategy;
    setStrategy(s => ({ ...s, ...clean }));
  };

  const exportPine = (strat) => {
    const pine = toPineScript(strat || current.strategy);
    navigator.clipboard.writeText(pine).then(() => { setCopiedPine(true); setTimeout(()=>setCopiedPine(false),2000); });
  };

  const allVersions = useMemo(() => {
    const cur = { ...current, note:"Current", isCurrent:true };
    return [cur, ...history];
  }, [current, history]);

  const scoreHistory = useMemo(() =>
    allVersions.slice().reverse().map(v => v.result ? scoreStrategy(v.result) : 0),
  [allVersions]);

  const r = current.result;
  const prev = history[0]?.result;
  const currentPine = useMemo(() => toPineScript(current.strategy), [current.strategy]);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:14, minHeight:600 }}>

      {/* ══ LEFT ══════════════════════════════════════════════════════════════ */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

        {/* Strategy header card */}
        <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:12, border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:900, color:T.text, lineHeight:1.2 }}>{current.strategy?.name}</div>
              <div style={{ fontSize:10, color:T.mute, marginTop:2, lineHeight:1.4 }}>{current.strategy?.description}</div>
            </div>
            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
              <button onClick={() => exportPine()}
                style={{ padding:"5px 10px", borderRadius:6, background:`${T.teal}18`, border:`1px solid ${T.teal}33`, color:T.teal, cursor:"pointer", fontWeight:700, fontSize:10 }}>
                {copiedPine?"✓ Copied":"🌲 Pine"}
              </button>
              <button onClick={applyToCurrent}
                style={{ padding:"5px 14px", borderRadius:6, background:T.green, color:"#000", border:"none", cursor:"pointer", fontWeight:800, fontSize:11 }}>
                ✓ Use
              </button>
            </div>
          </div>

          {/* Data + analysis row */}
          <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
            <select value={pair} onChange={e=>{ setPair(e.target.value); loadCandles(e.target.value, tf); }}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:5, padding:"4px 8px", color:T.text, fontSize:11 }}>
              {PAIRS.map(p=><option key={p} value={p}>{p.replace("USDT","")}/USDT</option>)}
            </select>
            <select value={tf} onChange={e=>{ setTf(e.target.value); loadCandles(pair, e.target.value); }}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:5, padding:"4px 8px", color:T.text, fontSize:11 }}>
              {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ fontSize:9, color: dataStatus==="loaded"?T.green:dataStatus==="error"?T.red:T.mute }}>
              {loadingData ? "⏳ loading..." : dataStatus==="loaded" ? `✓ ${candles.length} bars` : dataStatus==="error" ? "⚠ load failed" : "no data"}
            </div>
            <button onClick={() => loadCandles()}
              style={{ padding:"4px 8px", borderRadius:5, background:"rgba(255,255,255,0.05)", border:`1px solid ${T.border}`, color:T.mute, cursor:"pointer", fontSize:9 }}>
              ↻ Reload
            </button>
            <button onClick={analyzeNow} disabled={loadingWeak}
              style={{ padding:"4px 10px", borderRadius:5, background:`${T.purple}18`, border:`1px solid ${T.purple}33`, color:T.purple, cursor:"pointer", fontSize:9, fontWeight:700 }}>
              {loadingWeak ? "⏳" : "🔍 Analyze"}
            </button>
          </div>
        </div>

        {/* Metrics bar */}
        {r && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6 }}>
            {[
              ["Return",   r.totalRet,  prev?.totalRet, false, v=>`${v>=0?"+":""}${v.toFixed(1)}%`, col(r.totalRet)],
              ["Sharpe",   r.sharpe,    prev?.sharpe,   false, v=>v.toFixed(2),                       r.sharpe>=1?T.green:r.sharpe>=0?T.amber:T.red],
              ["Win Rate", r.winRate,   prev?.winRate,  false, v=>`${v.toFixed(0)}%`,                 r.winRate>=55?T.green:r.winRate>=45?T.amber:T.red],
              ["Max DD",   r.maxDD,     prev?.maxDD,    true,  v=>`-${v.toFixed(1)}%`,                r.maxDD>20?T.red:r.maxDD>10?T.amber:T.green],
              ["Trades",   r.tradeCount,undefined,      false, v=>v,                                  T.sub],
              ["Score",    scoreStrategy(r), prev?scoreStrategy(prev):undefined, false, v=>Math.round(v), scoreStrategy(r)>=70?T.green:scoreStrategy(r)>=50?T.amber:T.red],
            ].map(([label, curr, prevV, inv, fmt, c]) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"8px 8px", border:`1px solid ${T.border}`, textAlign:"center" }}>
                <div style={{ fontSize:8, color:T.mute, letterSpacing:0.5, marginBottom:2 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize:15, fontWeight:800, color:c, lineHeight:1 }}>{fmt(curr)}</div>
                {prevV !== undefined && <Delta curr={curr} prev={prevV} invert={inv} />}
              </div>
            ))}
          </div>
        )}

        {/* Weakness cards */}
        {weaknesses.length > 0 && (
          <div style={{ background:"rgba(168,85,247,0.04)", borderRadius:9, padding:10, border:`1px solid ${T.purple}22` }}>
            <div style={{ fontSize:10, color:T.purple, fontWeight:700, marginBottom:8 }}>🔍 IDENTIFIED WEAKNESSES — click to fix</div>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {weaknesses.map((w, i) => {
                const c = w.priority==="high"?T.red:w.priority==="medium"?T.amber:T.mute;
                return (
                  <div key={i} onClick={() => setRequest(w.fix)}
                    style={{ padding:"7px 10px", borderRadius:7, background:`${c}08`, border:`1px solid ${c}22`, cursor:"pointer" }}
                    onMouseEnter={e=>e.currentTarget.style.background=`${c}15`}
                    onMouseLeave={e=>e.currentTarget.style.background=`${c}08`}>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:2 }}>
                      <span style={{ padding:"1px 5px", borderRadius:3, fontSize:8, fontWeight:700, background:`${c}20`, color:c }}>{w.priority}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:T.text }}>{w.issue}</span>
                    </div>
                    <div style={{ fontSize:9, color:T.mute }}>{w.detail}</div>
                    <div style={{ fontSize:9, color:T.green, marginTop:2 }}>💡 {w.fix}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding:"8px 12px", borderRadius:7, background:`${T.red}12`, border:`1px solid ${T.red}33`, color:T.red, fontSize:11 }}>
            ❌ {error}
          </div>
        )}

        {/* Auto-refine */}
        <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:9, padding:10, border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.text }}>🤖 Auto-Refine</div>
            <select value={autoGoal} onChange={e=>setAutoGoal(e.target.value)}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:5, padding:"4px 8px", color:T.text, fontSize:10 }}>
              {AUTO_GOALS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <select value={autoRounds} onChange={e=>setAutoRounds(parseInt(e.target.value))}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:5, padding:"4px 8px", color:T.text, fontSize:10 }}>
              {[2,3,5,8].map(n=><option key={n} value={n}>{n} rounds</option>)}
            </select>
            {autoRunning ? (
              <>
                <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.07)", borderRadius:3 }}>
                  <div style={{ height:5, background:T.amber, borderRadius:3, width:`${autoProgress}%`, transition:"width 0.3s" }}/>
                </div>
                <button onClick={cancelAuto}
                  style={{ padding:"4px 10px", borderRadius:5, background:`${T.red}22`, border:`1px solid ${T.red}44`, color:T.red, cursor:"pointer", fontSize:9, fontWeight:700 }}>
                  ✕ Stop
                </button>
              </>
            ) : (
              <button onClick={runAutoRefine} disabled={refining}
                style={{ padding:"5px 14px", borderRadius:6, background:`${T.amber}20`, border:`1px solid ${T.amber}44`, color:T.amber, cursor:"pointer", fontWeight:700, fontSize:10 }}>
                ▶ Run Auto-Refine
              </button>
            )}
          </div>
        </div>

        {/* Compare panel */}
        {compareVersion && (
          <ComparePanel a={current} b={compareVersion} onClose={() => setCompareVersion(null)} />
        )}

        {/* Chat */}
        <div style={{ flex:1, minHeight:180, maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:6, padding:"2px 0" }}>
          {chat.length === 0 && (
            <div style={{ textAlign:"center", padding:"30px 0", color:T.mute, fontSize:11 }}>
              <div style={{ fontSize:24, marginBottom:6 }}>💬</div>
              <div style={{ fontWeight:600, color:T.sub, marginBottom:4 }}>Iterative AI refinement</div>
              <div style={{ fontSize:10 }}>Each request rewrites the strategy and backtests it immediately</div>
            </div>
          )}
          {chat.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role==="user"?"flex-end":msg.role==="system"?"center":"flex-start",
              maxWidth: msg.role==="system" ? "100%" : "92%",
              padding:"8px 11px",
              borderRadius: msg.role==="user"?"12px 12px 4px 12px":msg.role==="system"?"6px":"4px 12px 12px 12px",
              background: msg.role==="user"?`${T.amber}15`:msg.role==="system"?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.04)",
              border:`1px solid ${msg.role==="user"?T.amber+"33":msg.role==="system"?T.border+"44":T.border}`,
              fontSize:11, color:msg.role==="system"?T.mute:T.text, lineHeight:1.6,
            }}>
              <MarkdownText text={msg.text} />
              {msg.metrics && (
                <div style={{ display:"flex", gap:10, marginTop:6, paddingTop:5, borderTop:`1px solid ${T.border}33`, fontSize:9, flexWrap:"wrap" }}>
                  {[["Return",msg.metrics.returnDelta,"%"],["Sharpe",msg.metrics.sharpeDelta,""],["Win%",msg.metrics.wrDelta,"%"],["DD",-msg.metrics.ddDelta,"%"]].map(([l,d,s])=>(
                    <span key={l} style={{ color:T.mute }}>{l}: <span style={{ color:d>0.01?T.green:d<-0.01?T.red:T.mute, fontWeight:700 }}>{d>=0?"▲+":"▼"}{Math.abs(d).toFixed(1)}{s}</span></span>
                  ))}
                </div>
              )}
              <div style={{ fontSize:8, color:`${T.mute}88`, marginTop:2 }}>{new Date(msg.ts).toLocaleTimeString()}</div>
            </div>
          ))}
          {refining && (
            <div style={{ alignSelf:"flex-start", padding:"8px 12px", borderRadius:"4px 12px 12px 12px",
              background:"rgba(255,255,255,0.04)", border:`1px solid ${T.border}`, fontSize:11, color:T.mute }}>
              <span style={{ animation:"dots 1.2s steps(3,end) infinite" }}>⏳ Refining</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick buttons */}
        <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
          {QUICK_REQS.map(q => (
            <button key={q.label} onClick={() => setRequest(q.prompt)}
              style={{ padding:"3px 8px", borderRadius:5, fontSize:9, fontWeight:600, cursor:"pointer",
                border:`1px solid ${request===q.prompt?T.amber+"55":T.border}`,
                background:request===q.prompt?`${T.amber}15`:"rgba(255,255,255,0.03)",
                color:request===q.prompt?T.amber:T.mute }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display:"flex", gap:8 }}>
          <textarea value={request} onChange={e=>setRequest(e.target.value)}
            onKeyDown={e=>{ if (e.key==="Enter"&&(e.ctrlKey||e.metaKey)) runRefinement(); }}
            placeholder="What should I change? (Ctrl+Enter to send)"
            disabled={refining || autoRunning}
            rows={2}
            style={{ flex:1, background:"rgba(255,255,255,0.04)", border:`1px solid ${refining?T.border:T.amber+"33"}`,
              borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12, resize:"none", fontFamily:"inherit" }}
          />
          <button onClick={() => runRefinement()} disabled={refining||!request.trim()||autoRunning}
            style={{ padding:"0 18px", borderRadius:8,
              background:refining||!request.trim()||autoRunning?"#1a1b25":T.amber,
              color:refining||!request.trim()||autoRunning?T.mute:"#000",
              border:`1px solid ${T.border}`, cursor:refining?"wait":"pointer", fontWeight:800, fontSize:13, flexShrink:0 }}>
            {refining?"⏳":"→"}
          </button>
        </div>
        <div style={{ fontSize:8, color:T.mute }}>Ctrl+Enter · Auto-backtested · Sessions saved in browser</div>
      </div>

      {/* ══ RIGHT ══════════════════════════════════════════════════════════════ */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

        {/* Tab bar */}
        <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}` }}>
          {[["history","History"],["rules","Rules"],["pine","🌲 Pine"]].map(([id,l]) => (
            <button key={id} onClick={()=>setRightTab(id)}
              style={{ flex:1, padding:"7px 4px", background:"none", border:"none", cursor:"pointer", fontSize:10, fontWeight:rightTab===id?700:400,
                borderBottom:rightTab===id?`2px solid ${T.amber}`:"2px solid transparent",
                color:rightTab===id?T.text:T.mute }}>
              {l}
            </button>
          ))}
        </div>

        {/* History tab */}
        {rightTab === "history" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            {/* Score sparkline */}
            {scoreHistory.length >= 2 && (
              <div style={{ marginBottom:10, padding:"8px 10px", background:"rgba(255,255,255,0.02)", borderRadius:8, border:`1px solid ${T.border}` }}>
                <ScoreSparkline scores={scoreHistory} />
              </div>
            )}

            {allVersions.length === 0 ? (
              <div style={{ textAlign:"center", padding:"20px", color:T.mute, fontSize:10 }}>Refine to build history</div>
            ) : allVersions.map((v, i) => (
              <VersionCard
                key={i}
                v={v}
                index={i}
                total={allVersions.length}
                isCurrent={i === 0}
                isComparing={compareVersion && compareVersion.strategy?.id === v.strategy?.id}
                prevVersion={allVersions[i + 1]}
                onRestore={restore}
                onCompare={v => setCompareVersion(v)}
                onExportPine={strat => { const pine = toPineScript(strat); navigator.clipboard.writeText(pine); }}
              />
            ))}
          </div>
        )}

        {/* Rules tab */}
        {rightTab === "rules" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:9, padding:12, border:`1px solid ${T.border}`, marginBottom:8 }}>
              <div style={{ fontSize:9, color:T.green, fontWeight:700, marginBottom:6 }}>🟢 ENTRY CONDITIONS</div>
              {current.strategy?.buyRules?.length ? current.strategy.buyRules.map((r,i) => (
                <div key={i} style={{ display:"flex", gap:6, alignItems:"center", padding:"5px 8px", borderRadius:6,
                  background:`${T.green}08`, border:`1px solid ${T.green}22`, marginBottom:4, fontSize:10 }}>
                  <span style={{ color:T.green, fontWeight:700 }}>{r.indicator}</span>
                  <span style={{ color:T.mute }}>{r.condition}</span>
                  <span style={{ color:T.text, fontWeight:700 }}>{r.threshold}</span>
                  {r.params?.period && <span style={{ color:T.mute, fontSize:9 }}>({r.params.period})</span>}
                </div>
              )) : <div style={{ fontSize:9, color:T.mute }}>No entry rules</div>}
            </div>

            <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:9, padding:12, border:`1px solid ${T.border}`, marginBottom:8 }}>
              <div style={{ fontSize:9, color:T.red, fontWeight:700, marginBottom:6 }}>🔴 EXIT CONDITIONS</div>
              {current.strategy?.sellRules?.length ? current.strategy.sellRules.map((r,i) => (
                <div key={i} style={{ display:"flex", gap:6, alignItems:"center", padding:"5px 8px", borderRadius:6,
                  background:`${T.red}08`, border:`1px solid ${T.red}22`, marginBottom:4, fontSize:10 }}>
                  <span style={{ color:T.red, fontWeight:700 }}>{r.indicator}</span>
                  <span style={{ color:T.mute }}>{r.condition}</span>
                  <span style={{ color:T.text, fontWeight:700 }}>{r.threshold}</span>
                </div>
              )) : <div style={{ fontSize:9, color:T.mute }}>Exit via SL/TP only</div>}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {[["Stop Loss", `${current.strategy?.stopLossPct}%`, T.red],
                ["Take Profit", `${current.strategy?.takeProfitPct}%`, T.green],
                ["Position Size", `${current.strategy?.positionSizePct}%`, T.amber],
                ["R:R Ratio", `1:${((current.strategy?.takeProfitPct||1)/(current.strategy?.stopLossPct||1)).toFixed(1)}`, T.sub],
              ].map(([l,v,c]) => (
                <div key={l} style={{ textAlign:"center", padding:"8px 6px", background:"rgba(255,255,255,0.03)", borderRadius:7, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:8, color:T.mute }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:c, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pine tab */}
        {rightTab === "pine" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:9, color:T.mute }}>Live PineScript v5 · auto-synced</div>
              <button onClick={() => exportPine()}
                style={{ padding:"3px 10px", borderRadius:5, background:`${T.teal}18`, border:`1px solid ${T.teal}33`, color:T.teal, cursor:"pointer", fontSize:9, fontWeight:700 }}>
                {copiedPine?"✓":"📋"} Copy
              </button>
            </div>
            <pre style={{ flex:1, margin:0, padding:"10px 12px", background:"#090a12", color:"#a5f3c7",
              fontFamily:"monospace", fontSize:9, lineHeight:1.6, borderRadius:8, border:`1px solid ${T.border}`,
              overflowY:"auto", maxHeight:500, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
              {currentPine}
            </pre>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dots { 0%,20%{color:transparent;text-shadow:0.4em 0 0 transparent,0.8em 0 0 transparent}
          40%{color:#475569;text-shadow:0.4em 0 0 transparent,0.8em 0 0 transparent}
          60%{text-shadow:0.4em 0 0 #475569,0.8em 0 0 transparent}
          80%,100%{text-shadow:0.4em 0 0 #475569,0.8em 0 0 #475569} }
      `}</style>
    </div>
  );
}

function summarizeChanges(before, after) {
  const c = [];
  if (!before || !after) return "Rules updated";
  if (before.stopLossPct !== after.stopLossPct) c.push(`SL ${before.stopLossPct}%→${after.stopLossPct}%`);
  if (before.takeProfitPct !== after.takeProfitPct) c.push(`TP ${before.takeProfitPct}%→${after.takeProfitPct}%`);
  if (before.positionSizePct !== after.positionSizePct) c.push(`Size ${before.positionSizePct}%→${after.positionSizePct}%`);
  const bi = before.buyRules?.map(r=>`${r.indicator}${r.threshold}`).sort().join(",") || "";
  const ai = after.buyRules?.map(r=>`${r.indicator}${r.threshold}`).sort().join(",") || "";
  if (bi !== ai) c.push(`Entry rules changed`);
  const bs = before.sellRules?.map(r=>`${r.indicator}${r.threshold}`).sort().join(",") || "";
  const as_ = after.sellRules?.map(r=>`${r.indicator}${r.threshold}`).sort().join(",") || "";
  if (bs !== as_) c.push(`Exit rules changed`);
  return c.length ? c.join(" · ") : "Parameters tuned";
}
