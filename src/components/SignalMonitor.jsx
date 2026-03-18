import React, { useState, useEffect, useRef } from "react";
import { fetchKlines, subscribeKline, PAIRS, TIMEFRAMES } from "../binance.js";
import { runBacktest } from "../backtest.js";
import * as ind from "../indicators.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8" };

function beep(freq = 880, dur = 150) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(); osc.stop(ctx.currentTime + dur / 1000);
  } catch {}
}

function computeQuickSignals(candles) {
  if (candles.length < 50) return [];
  const closes = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const rsiData = ind.rsi(closes, 14);
  const ema9    = ind.ema(closes, 9);
  const ema21   = ind.ema(closes, 21);
  const { macd: macdLine, histogram } = ind.macd(closes);
  const signals = [];
  const i = candles.length - 1;
  const price = closes[i];

  if (rsiData[i] < 30) signals.push({ type:"BUY",  label:`RSI Oversold (${rsiData[i].toFixed(1)})`, strength:"strong" });
  if (rsiData[i] > 70) signals.push({ type:"SELL", label:`RSI Overbought (${rsiData[i].toFixed(1)})`, strength:"strong" });
  if (ind.crossOver(ema9, ema21, i))  signals.push({ type:"BUY",  label:"EMA9 crossed above EMA21", strength:"medium" });
  if (ind.crossUnder(ema9, ema21, i)) signals.push({ type:"SELL", label:"EMA9 crossed below EMA21", strength:"medium" });
  if (histogram[i] > 0 && histogram[i-1] <= 0) signals.push({ type:"BUY",  label:"MACD histogram turned positive", strength:"medium" });
  if (histogram[i] < 0 && histogram[i-1] >= 0) signals.push({ type:"SELL", label:"MACD histogram turned negative", strength:"medium" });

  return signals;
}

export default function SignalMonitor({ strategy }) {
  const [watchPairs, setWatchPairs] = useState(["BTCUSDT","ETHUSDT","SOLUSDT"]);
  const [tf, setTf] = useState("15m");
  const [alerts, setAlerts] = useState([]);
  const [soundOn, setSoundOn] = useState(true);
  const [running, setRunning] = useState(false);
  const unsubs = useRef([]);
  const candleData = useRef({});

  const addAlert = (pair, signal) => {
    const alert = { id: Date.now(), pair, ...signal, time: new Date().toLocaleTimeString() };
    setAlerts(prev => [alert, ...prev].slice(0, 50));
    if (soundOn) beep(signal.type === "BUY" ? 660 : 440);
  };

  const start = async () => {
    setRunning(true);
    unsubs.current.forEach(u => u());
    unsubs.current = [];

    for (const pair of watchPairs) {
      const data = await fetchKlines(pair, tf, 100).catch(() => []);
      candleData.current[pair] = data;

      // Check initial signals
      const sigs = computeQuickSignals(data);
      sigs.forEach(s => addAlert(pair, s));

      // Subscribe to live updates
      subscribeKline(pair, tf, (candle) => {
        const cd = candleData.current[pair] || [];
        const last = cd[cd.length - 1];
        if (last && last.time === candle.time) cd[cd.length - 1] = candle;
        else cd.push(candle);
        candleData.current[pair] = cd.slice(-200);
        if (candle.closed) {
          const sigs = computeQuickSignals(candleData.current[pair]);
          sigs.forEach(s => addAlert(pair, s));
        }
      }, console.error).then(unsub => { unsubs.current.push(unsub); });
    }
  };

  const stop = () => {
    setRunning(false);
    unsubs.current.forEach(u => u());
    unsubs.current = [];
  };

  useEffect(() => () => { unsubs.current.forEach(u => u()); unsubs.current = []; }, []);

  const togglePair = (p) => setWatchPairs(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p]);

  return (
    <div>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {PAIRS.slice(0,8).map(p=>(
            <button key={p} onClick={()=>togglePair(p)} style={{ padding:"5px 10px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
              border:`1px solid ${watchPairs.includes(p)?T.amber+"44":T.border}`, background:watchPairs.includes(p)?`${T.amber}15`:"transparent", color:watchPairs.includes(p)?T.amber:T.mute }}>
              {p.replace("USDT","")}
            </button>
          ))}
        </div>
        <select value={tf} onChange={e=>setTf(e.target.value)} style={{ background:"#1a1b25", border:`1px solid ${T.border}`, borderRadius:6, padding:"6px 10px", color:T.text, fontSize:12 }}>
          {TIMEFRAMES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={()=>setSoundOn(s=>!s)} style={{ padding:"5px 10px", borderRadius:5, fontSize:10, cursor:"pointer", border:`1px solid ${T.border}`, background:"transparent", color:soundOn?T.amber:T.mute }}>
          {soundOn ? "🔔 Sound ON" : "🔕 Sound OFF"}
        </button>
        <button onClick={running?stop:start} style={{ padding:"7px 18px", borderRadius:7, background:running?T.red:T.green, color:"#000", border:"none", cursor:"pointer", fontWeight:700, fontSize:12 }}>
          {running ? "⏹ Stop" : "▶ Start Monitor"}
        </button>
        {alerts.length > 0 && <button onClick={()=>setAlerts([])} style={{ padding:"5px 10px", borderRadius:5, fontSize:10, cursor:"pointer", border:`1px solid ${T.border}`, background:"transparent", color:T.mute }}>Clear</button>}
      </div>

      {running && (
        <div style={{ padding:"8px 12px", borderRadius:8, background:`${T.green}10`, border:`1px solid ${T.green}33`, marginBottom:16, fontSize:12, color:T.green, display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:T.green, animation:"pulse 1.5s infinite" }} />
          Monitoring {watchPairs.join(", ")} on {tf} — {alerts.length} signals detected
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {alerts.length === 0 && (
          <div style={{ textAlign:"center", padding:40, color:T.mute, fontSize:13 }}>
            {running ? "Watching for signals..." : "Start monitoring to see live signals"}
          </div>
        )}
        {alerts.map(a => (
          <div key={a.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:8,
            background: a.type==="BUY" ? `${T.green}0d` : `${T.red}0d`,
            border:`1px solid ${a.type==="BUY"?T.green:T.red}33` }}>
            <div style={{ width:36, height:36, borderRadius:6, background: a.type==="BUY"?`${T.green}22`:`${T.red}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
              {a.type==="BUY"?"🟢":"🔴"}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:13, color: a.type==="BUY"?T.green:T.red }}>{a.type}</span>
                <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{a.pair.replace("USDT","/USDT")}</span>
                <span style={{ fontSize:11, color:T.sub }}>{a.label}</span>
              </div>
              <div style={{ fontSize:10, color:T.mute, marginTop:2 }}>{a.time} · {a.strength} signal</div>
            </div>
            <button onClick={()=>navigator.clipboard.writeText(`${a.type} ${a.pair} — ${a.label} @ ${a.time}`)}
              style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${T.border}`, background:"transparent", color:T.mute, cursor:"pointer", fontSize:10 }}>
              Copy
            </button>
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }`}</style>
    </div>
  );
}
