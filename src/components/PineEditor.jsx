import React, { useState, useMemo, useEffect } from "react";
import { toPineScript, parsePineScript } from "../strategy.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", blue:"#3b82f6", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8" };

// Minimal syntax highlighter for Pine keywords
function highlight(code) {
  if (!code) return "";
  return code
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/(\/\/.*)/g, '<span style="color:#475569;font-style:italic">$1</span>')
    .replace(/\b(strategy|ta|plot|plotshape|barstate|table|color|size|shape|location|position|if|and|or|not|true|false|var|float|int|bool|string)\b/g, '<span style="color:#3b82f6;font-weight:700">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:#f59e0b">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#a855f7">$1</span>')
    .replace(/(\/\/@version=5)/g, '<span style="color:#00c896;font-weight:900">$1</span>');
}

export default function PineEditor({ strategy, setStrategy }) {
  const [mode, setMode]         = useState("export");
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting]   = useState(false);
  const [status, setStatus]         = useState(null);
  const [copied, setCopied]         = useState(false);
  const [autoSync, setAutoSync]     = useState(true);

  // Regenerate PineScript every time strategy changes — always fresh
  const exported = useMemo(() => toPineScript(strategy), [strategy]);

  // Auto-switch to export tab when strategy updates so user sees the change
  useEffect(() => {
    if (autoSync && mode === "export") {
      // Just re-renders with new exported — nothing to do
    }
  }, [exported]);

  const copy = () => {
    navigator.clipboard.writeText(exported).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const doImport = async () => {
    if (!importCode.trim()) return;
    setImporting(true); setStatus(null);
    const parsed = await parsePineScript(importCode);
    if (parsed) {
      setStrategy(s => ({ ...s, ...parsed, id: s.id }));
      setStatus({ ok:true, msg:`✅ Imported: "${parsed.name}" — ${parsed.buyRules?.length||0} buy rules, ${parsed.sellRules?.length||0} sell rules` });
      setTimeout(() => setMode("export"), 800);
    } else {
      setStatus({ ok:false, msg:"❌ Could not parse — try a simpler strategy or check AI connection" });
    }
    setImporting(false);
  };

  const lineCount = exported.split("\n").length;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}`, marginBottom:14 }}>
        {[["export","📤 Export to PineScript"],["import","📥 Import PineScript"]].map(([m,l]) => (
          <button key={m} onClick={() => setMode(m)}
            style={{ padding:"8px 20px", background:"none", border:"none",
              borderBottom: mode===m?`2px solid ${T.amber}`:"2px solid transparent",
              color:mode===m?T.text:T.mute, cursor:"pointer", fontSize:12, fontWeight:mode===m?700:400 }}>
            {l}
          </button>
        ))}
      </div>

      {mode === "export" && (
        <div>
          {/* Header bar */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:11, color:T.mute }}>
              PineScript v5 · <span style={{ color:T.text }}>{strategy.name}</span>
              <span style={{ color:T.mute }}> · {lineCount} lines</span>
              <span style={{ marginLeft:10, padding:"1px 6px", borderRadius:3, fontSize:9, background:`${T.green}15`, color:T.green, fontWeight:700 }}>
                AUTO-SYNC ●
              </span>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={copy}
                style={{ padding:"5px 12px", borderRadius:6, background:`${copied?T.green:T.amber}18`,
                  border:`1px solid ${copied?T.green:T.amber}44`, color:copied?T.green:T.amber,
                  cursor:"pointer", fontSize:11, fontWeight:700 }}>
                {copied ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>
          </div>

          {/* Strategy summary strip */}
          <div style={{ display:"flex", gap:10, marginBottom:8, padding:"7px 12px",
            background:"rgba(255,255,255,0.02)", borderRadius:7, border:`1px solid ${T.border}`, fontSize:10, flexWrap:"wrap" }}>
            <span style={{ color:T.mute }}>Entry:</span>
            <span style={{ color:T.green }}>
              {strategy.buyRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ") || "none"}
            </span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ color:T.mute }}>Exit:</span>
            <span style={{ color:T.red }}>
              {strategy.sellRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ") || "SL/TP only"}
            </span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ color:T.red }}>SL {strategy.stopLossPct}%</span>
            <span style={{ color:T.green }}>TP {strategy.takeProfitPct}%</span>
            <span style={{ color:T.amber }}>Size {strategy.positionSizePct}%</span>
          </div>

          {/* Highlighted code */}
          <div style={{ position:"relative", borderRadius:8, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            {/* Line numbers */}
            <div style={{ display:"flex" }}>
              <div style={{ background:"#0a0b12", padding:"14px 8px", textAlign:"right", userSelect:"none",
                fontSize:11, fontFamily:"monospace", lineHeight:"1.6", color:"#2a2d45", flexShrink:0, minWidth:32 }}>
                {exported.split("\n").map((_,i) => <div key={i}>{i+1}</div>)}
              </div>
              <pre
                dangerouslySetInnerHTML={{ __html: highlight(exported) }}
                style={{ flex:1, margin:0, padding:"14px 16px", background:"#090a12", color:"#c9d1d9",
                  fontFamily:"'SF Mono','Fira Code',monospace", fontSize:11, lineHeight:"1.6",
                  overflowX:"auto", overflowY:"auto", maxHeight:460, whiteSpace:"pre" }}
              />
            </div>
          </div>

          <div style={{ marginTop:8, fontSize:10, color:T.mute, display:"flex", gap:12 }}>
            <span>💡 Paste into TradingView → Pine Editor → Add to chart</span>
            <span>🔄 Updates automatically whenever strategy changes</span>
          </div>
        </div>
      )}

      {mode === "import" && (
        <div>
          <div style={{ fontSize:11, color:T.mute, marginBottom:8 }}>
            Paste PineScript v4/v5 — AI will parse rules, thresholds, and risk params into the strategy
          </div>
          <textarea value={importCode} onChange={e=>setImportCode(e.target.value)}
            placeholder={`//@version=5\nstrategy("My Strategy", ...)\n// paste here...`}
            style={{ width:"100%", height:300, background:"#090a12", border:`1px solid ${T.border}`,
              borderRadius:8, padding:"14px 16px", color:"#c9d1d9",
              fontFamily:"'SF Mono','Fira Code',monospace", fontSize:11, lineHeight:"1.6",
              resize:"vertical", boxSizing:"border-box" }} />

          {status && (
            <div style={{ padding:"8px 12px", borderRadius:6, marginTop:8, marginBottom:8,
              background:status.ok?`${T.green}15`:`${T.red}15`,
              border:`1px solid ${status.ok?T.green:T.red}33`,
              fontSize:12, color:status.ok?T.green:T.red }}>
              {status.msg}
            </div>
          )}

          <button onClick={doImport} disabled={importing || !importCode.trim()}
            style={{ marginTop:8, padding:"8px 20px", borderRadius:8, background:importing||!importCode.trim()?"#222":T.green,
              color:importing||!importCode.trim()?T.mute:"#000", border:"none",
              cursor:importing?"not-allowed":"pointer", fontWeight:800, fontSize:13 }}>
            {importing ? "⏳ Parsing with AI..." : "🔍 Parse & Import"}
          </button>
          <div style={{ marginTop:6, fontSize:10, color:T.mute }}>
            After import, the strategy updates everywhere — Builder, Backtester, Refiner, and PineScript export.
          </div>
        </div>
      )}
    </div>
  );
}
