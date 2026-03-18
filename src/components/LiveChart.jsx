import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchKlines, subscribeKline, subscribeTicker, PAIRS, TIMEFRAMES } from "../binance.js";
import Chart from "./Chart.jsx";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8" };

// Group pairs for the watchlist
const PAIR_GROUPS = {
  "Large Cap":  ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT"],
  "Mid Cap":    ["DOTUSDT","LINKUSDT","MATICUSDT","LTCUSDT","TRXUSDT","UNIUSDT","ATOMUSDT","NEARUSDT"],
  "DeFi":       ["AAVEUSDT","MKRUSDT","COMPUSDT","SUSHIUSDT","CRVUSDT","SNXUSDT","1INCHUSDT","BALUSDT"],
  "Layer 2":    ["ARBUSDT","OPUSDT","APTUSDT","SUIUSDT","INJUSDT","TIAUSDT","SEIUSDT","STXUSDT"],
  "Meme":       ["SHIBUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"],
  "Other":      ["FILUSDT","ICPUSDT","HBARUSDT","XLMUSDT","VETUSDT","ALGOUSDT","XTZUSDT","EOSUSDT"],
};

// Ticker strip — top 12 by default, live prices
const TICKER_PAIRS = PAIRS.slice(0, 20);

function fmt(price) {
  if (!price) return "—";
  if (price >= 10000) return `$${price.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  if (price >= 1)     return `$${price.toFixed(2)}`;
  if (price >= 0.01)  return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

export default function LiveChart() {
  const [pair, setPair]           = useState("BTCUSDT");
  const [tf, setTf]               = useState("5m");
  const [candles, setCandles]     = useState([]);
  const [tickers, setTickers]     = useState({});
  const [indicators, setIndicators] = useState(["EMA9","EMA21"]);
  const [loading, setLoading]     = useState(false);
  const [connected, setConnected] = useState(false);
  const [search, setSearch]       = useState("");
  const [activeGroup, setActiveGroup] = useState("Large Cap");
  const [watchlist, setWatchlist] = useState(["BTCUSDT","ETHUSDT","SOLUSDT"]);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const unsubRef      = useRef(null);
  const unsubTickerRef = useRef(null);

  const load = useCallback(async (p, t) => {
    setLoading(true); setConnected(false);
    try {
      const data = await fetchKlines(p, t, 300);
      setCandles(data);
    } catch(e) { console.error("fetchKlines:", e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(pair, tf);
    let cancelled = false, cleanupFn = null;
    subscribeKline(pair, tf, (candle) => {
      if (cancelled) return;
      setConnected(true);
      setCandles(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.time === candle.time) next[next.length - 1] = { ...candle };
        else next.push(candle);
        return next.slice(-500);
      });
    }, () => { if (!cancelled) setConnected(false); }).then(unsub => {
      if (cancelled) { unsub(); return; }
      cleanupFn = unsub; unsubRef.current = unsub;
    });
    return () => { cancelled = true; cleanupFn?.(); };
  }, [pair, tf]);

  // Stream tickers for first 20 pairs
  useEffect(() => {
    let cleanupFn = null;
    subscribeTicker(TICKER_PAIRS, (tick) => {
      setTickers(prev => ({ ...prev, [tick.symbol]: tick }));
    }).then(unsub => { cleanupFn = unsub; unsubTickerRef.current = unsub; });
    return () => cleanupFn?.();
  }, []);

  const toggleIndicator = (id) => setIndicators(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
  );

  const toggleWatchlist = (p, e) => {
    e.stopPropagation();
    setWatchlist(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p]);
  };

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle
    ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;

  // Filtered pairs for selector
  const q = search.trim().toUpperCase();
  const displayPairs = q
    ? PAIRS.filter(p => p.includes(q))
    : (PAIR_GROUPS[activeGroup] || PAIRS.slice(0, 8));

  return (
    <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:12 }}>
      {/* LEFT: Watchlist / pair selector */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search pair..."
          style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${T.border}`, borderRadius:6,
            padding:"6px 8px", color:T.text, fontSize:11, width:"100%", boxSizing:"border-box" }}
        />

        {/* Group tabs */}
        {!q && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
            {Object.keys(PAIR_GROUPS).map(g => (
              <button key={g} onClick={() => setActiveGroup(g)}
                style={{ padding:"2px 6px", borderRadius:4, fontSize:9, fontWeight:700, cursor:"pointer",
                  border:`1px solid ${activeGroup===g?T.amber+"55":T.border}`,
                  background:activeGroup===g?`${T.amber}15`:"transparent",
                  color:activeGroup===g?T.amber:T.mute }}>
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Pair list */}
        <div style={{ overflowY:"auto", maxHeight:500, display:"flex", flexDirection:"column", gap:2 }}>
          {displayPairs.map(p => {
            const t = tickers[p];
            const isActive = pair === p;
            const inWL = watchlist.includes(p);
            return (
              <div key={p} onClick={() => setPair(p)}
                style={{ padding:"6px 7px", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center",
                  justifyContent:"space-between", gap:4,
                  background: isActive ? "rgba(255,165,0,0.08)" : "rgba(255,255,255,0.02)",
                  border:`1px solid ${isActive?T.amber+"44":T.border}`,
                  transition:"all 0.1s" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:10, fontWeight:isActive?800:600, color:isActive?T.amber:T.text, letterSpacing:"-0.02em" }}>
                    {p.replace("USDT","")}
                  </div>
                  {t ? (
                    <>
                      <div style={{ fontSize:9, color:t.change>=0?T.green:T.red, fontWeight:600 }}>{fmt(parseFloat(t.price))}</div>
                      <div style={{ fontSize:8, color:t.change>=0?T.green:T.red }}>{t.change>=0?"+":""}{parseFloat(t.change).toFixed(1)}%</div>
                    </>
                  ) : (
                    <div style={{ fontSize:9, color:T.mute }}>—</div>
                  )}
                </div>
                <span
                  onClick={e => toggleWatchlist(p, e)}
                  title={inWL?"Remove from watchlist":"Add to watchlist"}
                  style={{ fontSize:10, cursor:"pointer", opacity:inWL?1:0.3, userSelect:"none" }}>
                  {inWL ? "⭐" : "☆"}
                </span>
              </div>
            );
          })}
          {displayPairs.length === 0 && <div style={{ fontSize:10, color:T.mute, padding:"8px 4px" }}>No pairs match "{search}"</div>}
        </div>
      </div>

      {/* RIGHT: Chart area */}
      <div>
        {/* Controls bar */}
        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
          {/* Pair breadcrumb */}
          <div style={{ fontSize:13, fontWeight:800, color:T.amber }}>{pair.replace("USDT","")}/USDT</div>
          <div style={{ width:1, height:16, background:T.border }}/>

          {/* Timeframe buttons */}
          <div style={{ display:"flex", gap:2 }}>
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setTf(t)}
                style={{ padding:"4px 8px", borderRadius:5, fontSize:11, fontWeight:tf===t?800:400, cursor:"pointer",
                  border:`1px solid ${tf===t?T.amber+"55":T.border}`,
                  background:tf===t?`${T.amber}15`:"transparent",
                  color:tf===t?T.amber:T.mute }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ width:1, height:16, background:T.border }}/>

          {/* Indicators */}
          <div style={{ display:"flex", gap:3 }}>
            {[["EMA9","#f59e0b"],["EMA21","#3b82f6"],["SMA50","#a855f7"],["BB","#06b6d4"]].map(([id, c]) => (
              <button key={id} onClick={() => toggleIndicator(id)}
                style={{ padding:"4px 8px", borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer",
                  border:`1px solid ${indicators.includes(id)?c+"55":T.border}`,
                  background:indicators.includes(id)?`${c}18`:"transparent",
                  color:indicators.includes(id)?c:T.mute }}>
                {id}
              </button>
            ))}
          </div>

          {/* Live indicator */}
          <div style={{ marginLeft:"auto", display:"flex", gap:5, alignItems:"center", fontSize:10 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:connected?T.green:T.mute,
              animation:connected?"pulse 2s infinite":"none" }}/>
            <span style={{ color:connected?T.green:T.mute }}>{connected?"LIVE":"connecting..."}</span>
          </div>
        </div>

        {/* OHLCV bar */}
        {lastCandle && (
          <div style={{ display:"flex", gap:14, marginBottom:8, padding:"6px 10px",
            background:"rgba(255,255,255,0.02)", borderRadius:6, border:`1px solid ${T.border}`, fontSize:11, flexWrap:"wrap" }}>
            <span style={{ fontWeight:800, fontSize:14, color:priceChange>=0?T.green:T.red }}>
              {fmt(lastCandle.close)}
              <span style={{ fontSize:10, marginLeft:5 }}>{priceChange>=0?"+":""}{priceChange.toFixed(3)}%</span>
            </span>
            <span style={{ color:T.mute }}>O <span style={{ color:T.text }}>{fmt(lastCandle.open)}</span></span>
            <span style={{ color:T.green }}>H {fmt(lastCandle.high)}</span>
            <span style={{ color:T.red }}>L {fmt(lastCandle.low)}</span>
            <span style={{ color:T.sub }}>Vol {lastCandle.volume.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            <span style={{ color:T.mute, marginLeft:"auto" }}>{tf} · {candles.length} bars</span>
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <div style={{ height:420, display:"flex", alignItems:"center", justifyContent:"center",
            color:T.mute, flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:20 }}>📡</div>
            <div style={{ fontSize:12 }}>Fetching {pair} {tf}...</div>
          </div>
        ) : (
          <Chart candles={candles} height={420} showVolume indicators={indicators} />
        )}

        {/* Mini watchlist ticker bar */}
        {watchlist.length > 0 && (
          <div style={{ marginTop:8, display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
            <span style={{ fontSize:9, color:T.mute, alignSelf:"center", flexShrink:0 }}>⭐</span>
            {watchlist.map(p => {
              const t = tickers[p];
              const isActive = pair === p;
              return (
                <div key={p} onClick={() => setPair(p)}
                  style={{ padding:"4px 8px", borderRadius:6, cursor:"pointer", flexShrink:0,
                    background:isActive?"rgba(255,165,0,0.08)":"rgba(255,255,255,0.03)",
                    border:`1px solid ${isActive?T.amber+"44":T.border}` }}>
                  <span style={{ fontSize:10, fontWeight:700, color:isActive?T.amber:T.text }}>{p.replace("USDT","")}</span>
                  {t && (
                    <>
                      <span style={{ fontSize:9, color:T.mute, margin:"0 4px" }}>·</span>
                      <span style={{ fontSize:10, color:t.change>=0?T.green:T.red, fontWeight:600 }}>
                        {t.change>=0?"+":""}{parseFloat(t.change).toFixed(1)}%
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
}
