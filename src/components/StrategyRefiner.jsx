import React, { useState, useEffect, useRef } from "react";
import { fetchKlines, PAIRS, TIMEFRAMES } from "../binance.js";
import { runBacktest } from "../backtest.js";
import { refineStrategy, analyzeWeakness, scoreStrategy, saveRefinementSession, loadRefinementSession } from "../strategyFactory.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6", purple:"#a855f7" };

const col    = (n) => n > 0 ? T.green : n < 0 ? T.red : T.mute;
const fmtPct = (n) => n === undefined ? "—" : `${n>=0?"+":""}${n.toFixed(1)}%`;
const fmtN   = (n, d=2) => n === undefined || n === null ? "—" : (typeof n === "number" ? n.toFixed(d) : n);

// Metric delta badge
function Delta({ curr, prev, field, invert = false, suffix = "" }) {
  if (prev === undefined || curr === undefined) return null;
  const d = curr - prev;
  if (Math.abs(d) < 0.01) return <span style={{ color:T.mute, fontSize:9 }}>—</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span style={{ fontSize:9, color:good?T.green:T.red, fontWeight:700, marginLeft:4 }}>
      {d > 0 ? "▲" : "▼"}{Math.abs(d).toFixed(1)}{suffix}
    </span>
  );
}

function MetricRow({ label, curr, prev, invert, suffix, format }) {
  const display = format ? format(curr) : `${fmtN(curr)}${suffix||""}`;
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${T.border}11`, fontSize:11 }}>
      <span style={{ color:T.mute }}>{label}</span>
      <span style={{ display:"flex", alignItems:"center", gap:2 }}>
        <span style={{ color: col(curr), fontWeight:700 }}>{display}</span>
        <Delta curr={curr} prev={prev} invert={invert} suffix={suffix||""} />
      </span>
    </div>
  );
}

function VersionTimeline({ history, current, onRestore }) {
  return (
    <div style={{ position:"relative" }}>
      {/* Vertical line */}
      <div style={{ position:"absolute", left:14, top:8, bottom:8, width:2, background:`${T.border}88`, borderRadius:1 }} />

      {[{ strategy: current.strategy, result: current.result, note:"Current", ts: Date.now() }, ...history].reverse().map((v, i, arr) => {
        const isCurrent = i === 0;
        const score = v.result ? scoreStrategy(v.result) : 0;
        const prevScore = arr[i+1]?.result ? scoreStrategy(arr[i+1].result) : null;
        const delta = prevScore !== null ? score - prevScore : 0;
        return (
          <div key={i} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
            {/* Node */}
            <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0, zIndex:1,
              background: isCurrent ? T.amber : score > (prevScore||0) ? `${T.green}33` : score < (prevScore||0) ? `${T.red}22` : "rgba(255,255,255,0.08)",
              border:`2px solid ${isCurrent?T.amber:score>=(prevScore||0)?T.green+"44":T.red+"44"}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:9, fontWeight:800, color: isCurrent ? "#000" : score>=(prevScore||0)?T.green:T.red }}>
              v{arr.length - i}
            </div>

            {/* Content */}
            <div style={{ flex:1, background: isCurrent?"rgba(255,165,0,0.06)":"rgba(255,255,255,0.02)",
              borderRadius:8, padding:"8px 10px", border:`1px solid ${isCurrent?T.amber+"33":T.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color: isCurrent?T.amber:T.text }}>{v.strategy?.name}</div>
                  <div style={{ fontSize:9, color:T.mute, marginTop:1 }}>
                    {isCurrent ? "Current version" : v.note}
                  </div>
                </div>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  {!isCurrent && (
                    <button onClick={() => onRestore(v)}
                      style={{ padding:"3px 8px", borderRadius:4, background:"rgba(255,255,255,0.06)", border:`1px solid ${T.border}`,
                        color:T.mute, cursor:"pointer", fontSize:9, fontWeight:700 }}>
                      Restore
                    </button>
                  )}
                  <div style={{ padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:800,
                    background: score>=70?`${T.green}20`:score>=50?`${T.amber}20`:`${T.red}20`,
                    color: score>=70?T.green:score>=50?T.amber:T.red }}>
                    {Math.round(score)}
                    {delta !== 0 && <span style={{ fontSize:8, marginLeft:2, color:delta>0?T.green:T.red }}>
                      {delta>0?"▲":"▼"}{Math.abs(delta).toFixed(0)}
                    </span>}
                  </div>
                </div>
              </div>
              {v.result && (
                <div style={{ display:"flex", gap:8, fontSize:9, color:T.mute }}>
                  <span style={{ color:col(v.result.totalRet) }}>{fmtPct(v.result.totalRet)}</span>
                  <span>Sharpe {v.result.sharpe?.toFixed(2)}</span>
                  <span style={{ color:v.result.winRate>=50?T.green:T.red }}>WR {v.result.winRate?.toFixed(0)}%</span>
                  <span style={{ color:T.red }}>DD {v.result.maxDD?.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeaknessCard({ weakness }) {
  const priColor = weakness.priority === "high" ? T.red : weakness.priority === "medium" ? T.amber : T.mute;
  return (
    <div style={{ padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,0.02)", border:`1px solid ${priColor}22`, marginBottom:6 }}>
      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
        <span style={{ padding:"1px 5px", borderRadius:3, fontSize:8, fontWeight:700, background:`${priColor}20`, color:priColor }}>
          {weakness.priority}
        </span>
        <span style={{ fontSize:11, fontWeight:700, color:T.text }}>{weakness.issue}</span>
      </div>
      <div style={{ fontSize:10, color:T.mute, marginBottom:3 }}>{weakness.detail}</div>
      <div style={{ fontSize:10, color:T.green }}>💡 {weakness.fix}</div>
    </div>
  );
}

const QUICK_REQUESTS = [
  { label:"↑ Win Rate",   prompt:"Increase the win rate, even at the cost of fewer trades" },
  { label:"↓ Drawdown",   prompt:"Reduce the maximum drawdown and protect capital better" },
  { label:"↑ Sharpe",     prompt:"Improve the Sharpe ratio by optimizing the risk/reward balance" },
  { label:"More Trades",  prompt:"Generate more trade signals by relaxing entry conditions" },
  { label:"Less Risk",    prompt:"Make this more conservative — reduce position size and tighten stop loss" },
  { label:"Add MACD",     prompt:"Add MACD as a confirming indicator to the entry signal" },
  { label:"Add Stoch",    prompt:"Add Stochastic as an additional filter to reduce false signals" },
  { label:"Tighter SL",   prompt:"Use a tighter stop loss to cut losses faster" },
  { label:"Bigger TP",    prompt:"Increase the take profit target to capture larger moves" },
  { label:"Best overall", prompt:"Optimize everything holistically — maximize the composite score" },
];

export default function StrategyRefiner({ strategy, backtestResult, setStrategy }) {
  const [pair, setPair]       = useState("BTCUSDT");
  const [tf, setTf]           = useState("1h");
  const [candles, setCandles] = useState([]);
  const [candlesLoaded, setCandlesLoaded] = useState(false);

  const [current, setCurrent]   = useState({ strategy, result: backtestResult });
  const [history, setHistory]   = useState([]);
  const [request, setRequest]   = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError]       = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
  const [loadingWeak, setLoadingWeak] = useState(false);
  const [chat, setChat]         = useState([]); // conversation log
  const chatEndRef = useRef();

  // Load/restore session from localStorage
  useEffect(() => {
    const sessionId = strategy.id;
    if (!sessionId) return;
    const saved = loadRefinementSession(sessionId);
    if (saved) {
      setHistory(saved.history || []);
      setCurrent(saved.current || { strategy, result: backtestResult });
      setChat(saved.chat || []);
    } else {
      setCurrent({ strategy, result: backtestResult });
    }
  }, [strategy.id]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chat]);

  // Persist session on change
  useEffect(() => {
    if (!strategy.id) return;
    saveRefinementSession(strategy.id, { history, current, chat });
  }, [history, current, chat, strategy.id]);

  const loadCandles = async () => {
    try {
      const data = await fetchKlines(pair, tf, 500);
      setCandles(data);
      setCandlesLoaded(true);
      // Run backtest on current with fresh data
      const r = runBacktest(data, current.strategy);
      setCurrent(c => ({ ...c, result: r }));
      return data;
    } catch(e) {
      setError(`Failed to load ${pair} ${tf}: ${e.message}`);
      return null;
    }
  };

  const runRefinement = async () => {
    setRefining(true); setError(null);
    const reqText = request.trim();
    if (!reqText) { setRefining(false); return; }

    // Add user message to chat
    setChat(prev => [...prev, { role:"user", text:reqText, ts:Date.now() }]);
    setRequest("");

    let data = candles;
    if (!candlesLoaded || candles.length === 0) {
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

      // Archive current to history
      const archived = { ...current, note: reqText, ts: Date.now() };
      setHistory(prev => [archived, ...prev]);

      // Set new current
      const next = { strategy: improved, result: improved._result };
      setCurrent(next);

      // AI summary in chat
      const r = improved._result;
      const prev = current.result;
      const scoreNow = scoreStrategy(r || {});
      const scorePrev = scoreStrategy(prev || {});
      const delta = scorePrev ? scoreNow - scorePrev : 0;

      setChat(c => [...c, {
        role:"assistant",
        text: `✅ **${improved.name}**\n\n${improved.description || ""}\n\n**What changed:** ${summarizeChanges(current.strategy, improved)}\n\n**Score:** ${Math.round(scoreNow)} ${delta > 0 ? `▲+${delta.toFixed(0)}` : delta < 0 ? `▼${delta.toFixed(0)}` : "—"}`,
        metrics: r ? {
          returnDelta: r.totalRet - (prev?.totalRet || 0),
          sharpeDelta: r.sharpe - (prev?.sharpe || 0),
          wrDelta:     r.winRate - (prev?.winRate || 0),
          ddDelta:     r.maxDD - (prev?.maxDD || 0),
          curr: r,
          prev,
        } : null,
        ts: Date.now(),
      }]);
    } catch(e) {
      setError(e.message);
      setChat(c => [...c, { role:"assistant", text:`❌ ${e.message}`, ts:Date.now() }]);
    }
    setRefining(false);
  };

  const analyzeNow = async () => {
    setLoadingWeak(true);
    let data = candles;
    if (!candlesLoaded) data = await loadCandles();
    const ws = await analyzeWeakness({ strategy: current.strategy, result: current.result, history });
    setWeaknesses(ws);
    setLoadingWeak(false);
  };

  const restore = (v) => {
    setChat(c => [...c, { role:"system", text:`↩ Restored to: ${v.strategy?.name}`, ts:Date.now() }]);
    setCurrent({ strategy: v.strategy, result: v.result });
  };

  const applyToCurrent = () => {
    const { _result, _score, ...clean } = current.strategy;
    setStrategy(s => ({ ...s, ...clean }));
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runRefinement();
  };

  const r = current.result;
  const prev = history[0]?.result;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, minHeight:600 }}>
      {/* LEFT — Chat + controls */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Strategy header */}
        <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:14, border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:T.text }}>{current.strategy?.name}</div>
              <div style={{ fontSize:10, color:T.mute, marginTop:2 }}>{current.strategy?.description}</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={applyToCurrent}
                style={{ padding:"6px 14px", borderRadius:7, background:T.green, color:"#000", border:"none", cursor:"pointer", fontWeight:800, fontSize:11 }}>
                ✓ Use Strategy
              </button>
            </div>
          </div>

          {/* Data controls */}
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <select value={pair} onChange={e=>{ setPair(e.target.value); setCandlesLoaded(false); }}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 8px", color:T.text, fontSize:11 }}>
              {PAIRS.map(p=><option key={p} value={p}>{p.replace("USDT","/USDT")}</option>)}
            </select>
            <select value={tf} onChange={e=>{ setTf(e.target.value); setCandlesLoaded(false); }}
              style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 8px", color:T.text, fontSize:11 }}>
              {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={loadCandles}
              style={{ padding:"5px 12px", borderRadius:6, background:`${T.blue}18`, border:`1px solid ${T.blue}33`, color:T.blue, cursor:"pointer", fontSize:10, fontWeight:700 }}>
              {candlesLoaded ? `✓ ${pair} ${tf} loaded` : `📡 Load ${pair} ${tf}`}
            </button>
            <button onClick={analyzeNow} disabled={loadingWeak}
              style={{ padding:"5px 12px", borderRadius:6, background:`${T.purple}18`, border:`1px solid ${T.purple}33`, color:T.purple, cursor:"pointer", fontSize:10, fontWeight:700 }}>
              {loadingWeak ? "⏳ Analyzing..." : "🔍 Analyze Weaknesses"}
            </button>
          </div>
        </div>

        {/* Metrics bar */}
        {r && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
            {[
              ["Return",      r.totalRet,  prev?.totalRet, "%",   false, v=>`${v>=0?"+":""}${v.toFixed(1)}%`],
              ["Sharpe",      r.sharpe,    prev?.sharpe,   "",    false, v=>v.toFixed(2)],
              ["Win Rate",    r.winRate,   prev?.winRate,  "%",   false, v=>`${v.toFixed(0)}%`],
              ["Max DD",      r.maxDD,     prev?.maxDD,    "%",   true,  v=>`-${v.toFixed(1)}%`],
              ["Score",       scoreStrategy(r), prev?scoreStrategy(prev):undefined, "", false, v=>Math.round(v)],
            ].map(([label, curr, prevV, suf, inv, fmt]) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"8px 10px", border:`1px solid ${T.border}`, textAlign:"center" }}>
                <div style={{ fontSize:9, color:T.mute, letterSpacing:0.5 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize:16, fontWeight:800, color: label==="Max DD"?T.red:label==="Score"?(curr>=70?T.green:curr>=50?T.amber:T.red):col(curr), marginTop:2 }}>
                  {fmt(curr)}
                </div>
                {prevV !== undefined && (
                  <Delta curr={curr} prev={prevV} invert={inv} suffix={suf} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Weakness cards */}
        {weaknesses.length > 0 && (
          <div>
            <div style={{ fontSize:10, color:T.purple, fontWeight:700, marginBottom:6 }}>🔍 IDENTIFIED WEAKNESSES</div>
            {weaknesses.map((w, i) => <WeaknessCard key={i} weakness={w} />)}
            <div style={{ fontSize:9, color:T.mute, marginTop:4 }}>Click a quick request below to fix any of these →</div>
          </div>
        )}

        {error && (
          <div style={{ padding:"8px 12px", borderRadius:7, background:`${T.red}12`, border:`1px solid ${T.red}33`, color:T.red, fontSize:11 }}>
            ❌ {error}
          </div>
        )}

        {/* Chat log */}
        <div style={{ flex:1, minHeight:200, maxHeight:340, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, padding:4 }}>
          {chat.length === 0 && (
            <div style={{ textAlign:"center", padding:"30px 0", color:T.mute, fontSize:11 }}>
              <div style={{ fontSize:20, marginBottom:6 }}>💬</div>
              Tell the AI what to improve — use quick buttons or type your own request
            </div>
          )}
          {chat.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role==="user" ? "flex-end" : "flex-start",
              maxWidth: "90%",
              padding:"9px 12px",
              borderRadius: msg.role==="user" ? "12px 12px 4px 12px" : "4px 12px 12px 12px",
              background: msg.role==="user" ? `${T.amber}18` : msg.role==="system" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${msg.role==="user"?T.amber+"33":T.border}`,
              fontSize:11, color:T.text, lineHeight:1.6,
            }}>
              <div style={{ whiteSpace:"pre-wrap" }}>{msg.text}</div>
              {msg.metrics && (
                <div style={{ display:"flex", gap:8, marginTop:6, paddingTop:6, borderTop:`1px solid ${T.border}33`, fontSize:10, flexWrap:"wrap" }}>
                  {[
                    ["Return", msg.metrics.returnDelta, "%"],
                    ["Sharpe", msg.metrics.sharpeDelta, ""],
                    ["Win%",   msg.metrics.wrDelta,   "%"],
                    ["DD",     -msg.metrics.ddDelta,  "%"],
                  ].map(([l, d, s]) => (
                    <span key={l} style={{ color:T.mute }}>
                      {l}: <span style={{ color:d>0?T.green:d<0?T.red:T.mute, fontWeight:700 }}>
                        {d>=0?"▲+":"▼"}{Math.abs(d).toFixed(1)}{s}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize:8, color:T.mute, marginTop:3 }}>
                {new Date(msg.ts).toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Quick requests */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {QUICK_REQUESTS.map(q => (
            <button key={q.label} onClick={() => setRequest(q.prompt)}
              style={{ padding:"4px 9px", borderRadius:5, border:`1px solid ${request===q.prompt?T.amber+"55":T.border}`,
                background:request===q.prompt?`${T.amber}15`:"rgba(255,255,255,0.03)",
                color:request===q.prompt?T.amber:T.mute, cursor:"pointer", fontSize:10, fontWeight:600 }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display:"flex", gap:8 }}>
          <textarea
            value={request}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe what to change... (Ctrl+Enter to send)"
            disabled={refining}
            style={{ flex:1, height:54, background:"rgba(255,255,255,0.04)", border:`1px solid ${refining?T.border:T.amber+"33"}`,
              borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12, resize:"none", fontFamily:"inherit" }}
          />
          <button onClick={runRefinement} disabled={refining || !request.trim()}
            style={{ padding:"0 18px", borderRadius:8, background:refining||!request.trim()?"#222":T.amber,
              color:refining||!request.trim()?T.mute:"#000", border:"none", cursor:refining?"wait":"pointer",
              fontWeight:800, fontSize:13, flexShrink:0 }}>
            {refining ? "⏳" : "Refine →"}
          </button>
        </div>
        <div style={{ fontSize:9, color:T.mute }}>Ctrl+Enter to send · Each refinement is backtested automatically · Version history preserved</div>
      </div>

      {/* RIGHT — History + rules */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Current rules */}
        <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:12, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.amber, marginBottom:10 }}>CURRENT RULES</div>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:9, color:T.green, fontWeight:700, marginBottom:4 }}>ENTRY</div>
            {current.strategy?.buyRules?.map((rule, i) => (
              <div key={i} style={{ fontSize:10, color:T.text, background:`${T.green}0d`, borderRadius:5, padding:"3px 7px", marginBottom:3 }}>
                {rule.indicator} {rule.condition} {rule.threshold}
              </div>
            ))}
            {!current.strategy?.buyRules?.length && <div style={{ fontSize:10, color:T.mute }}>No entry rules</div>}
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:9, color:T.red, fontWeight:700, marginBottom:4 }}>EXIT</div>
            {current.strategy?.sellRules?.map((rule, i) => (
              <div key={i} style={{ fontSize:10, color:T.text, background:`${T.red}0d`, borderRadius:5, padding:"3px 7px", marginBottom:3 }}>
                {rule.indicator} {rule.condition} {rule.threshold}
              </div>
            ))}
            {!current.strategy?.sellRules?.length && <div style={{ fontSize:10, color:T.mute }}>Exit via SL/TP only</div>}
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {[
              ["SL", `${current.strategy?.stopLossPct}%`, T.red],
              ["TP", `${current.strategy?.takeProfitPct}%`, T.green],
              ["Size", `${current.strategy?.positionSizePct}%`, T.amber],
              ["R:R", `1:${((current.strategy?.takeProfitPct||1)/(current.strategy?.stopLossPct||1)).toFixed(1)}`, T.sub],
            ].map(([l,v,c]) => (
              <div key={l} style={{ textAlign:"center", padding:"4px 8px", background:"rgba(255,255,255,0.03)", borderRadius:5 }}>
                <div style={{ fontSize:8, color:T.mute }}>{l}</div>
                <div style={{ fontSize:11, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Version history */}
        <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:12, border:`1px solid ${T.border}`, flex:1 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.text }}>VERSION HISTORY</div>
            <div style={{ fontSize:9, color:T.mute }}>{history.length + 1} versions</div>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:T.mute, fontSize:10 }}>
              Refinements will appear here
            </div>
          ) : (
            <div style={{ maxHeight:400, overflowY:"auto" }}>
              <VersionTimeline history={history} current={current} onRestore={restore} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: summarize what changed between two strategies
function summarizeChanges(before, after) {
  const changes = [];
  if (!before || !after) return "Rules updated";
  if (before.stopLossPct !== after.stopLossPct)
    changes.push(`SL ${before.stopLossPct}% → ${after.stopLossPct}%`);
  if (before.takeProfitPct !== after.takeProfitPct)
    changes.push(`TP ${before.takeProfitPct}% → ${after.takeProfitPct}%`);
  if (before.positionSizePct !== after.positionSizePct)
    changes.push(`Size ${before.positionSizePct}% → ${after.positionSizePct}%`);
  if ((before.buyRules?.length||0) !== (after.buyRules?.length||0))
    changes.push(`Entry rules: ${before.buyRules?.length} → ${after.buyRules?.length}`);
  if ((before.sellRules?.length||0) !== (after.sellRules?.length||0))
    changes.push(`Exit rules: ${before.sellRules?.length} → ${after.sellRules?.length}`);
  // Check if indicators changed
  const beforeInds = before.buyRules?.map(r=>r.indicator).join(",") || "";
  const afterInds  = after.buyRules?.map(r=>r.indicator).join(",")  || "";
  if (beforeInds !== afterInds) changes.push(`Indicators: ${beforeInds} → ${afterInds}`);
  if (changes.length === 0) changes.push("Parameters tuned");
  return changes.join(" · ");
}
