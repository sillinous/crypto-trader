import React, { useState } from "react";
import { toPineScript, parsePineScript } from "../strategy.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", blue:"#3b82f6", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569" };

export default function PineEditor({ strategy, setStrategy }) {
  const [mode, setMode] = useState("export"); // "export" | "import"
  const [pineCode, setPineCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  const exported = toPineScript(strategy);

  const doImport = async () => {
    if (!pineCode.trim()) return;
    setImporting(true);
    setStatus(null);
    const parsed = await parsePineScript(pineCode);
    if (parsed) {
      setStrategy(s => ({ ...s, ...parsed, id: s.id }));
      setStatus({ ok: true, msg: `✅ Imported: "${parsed.name}" — ${parsed.buyRules?.length||0} buy rules, ${parsed.sellRules?.length||0} sell rules` });
    } else {
      setStatus({ ok: false, msg: "❌ Could not parse PineScript — try a simpler strategy or check AI connection" });
    }
    setImporting(false);
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}`, marginBottom:16 }}>
        {["export","import"].map(m=>(
          <button key={m} onClick={()=>setMode(m)} style={{ padding:"8px 20px", background:"none", border:"none",
            borderBottom: mode===m ? `2px solid ${T.amber}` : "2px solid transparent",
            color: mode===m ? T.text : T.mute, cursor:"pointer", fontSize:12, fontWeight:mode===m?700:400 }}>
            {m==="export" ? "📤 Export to PineScript" : "📥 Import from PineScript"}
          </button>
        ))}
      </div>

      {mode === "export" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:12, color:T.mute }}>PineScript v5 — paste directly into TradingView</div>
            <button onClick={()=>copy(exported)} style={{ padding:"5px 12px", borderRadius:6, background:"rgba(255,255,255,0.07)", border:`1px solid ${T.border}`, color:T.text, cursor:"pointer", fontSize:11, fontWeight:600 }}>
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
          </div>
          <textarea readOnly value={exported}
            style={{ width:"100%", height:380, background:"#0a0b0f", border:`1px solid ${T.border}`, borderRadius:8, padding:16, color:"#a5f3c7", fontFamily:"monospace", fontSize:12, lineHeight:1.6, resize:"none", boxSizing:"border-box" }} />
          <div style={{ marginTop:8, fontSize:11, color:T.mute }}>
            💡 Tip: Open TradingView → Pine Editor → paste this code → Add to chart
          </div>
        </div>
      )}

      {mode === "import" && (
        <div>
          <div style={{ fontSize:12, color:T.mute, marginBottom:8 }}>Paste PineScript v4/v5 code — AI will parse it into a strategy</div>
          <textarea value={pineCode} onChange={e=>setPineCode(e.target.value)} placeholder="// Paste your PineScript strategy here..."
            style={{ width:"100%", height:300, background:"#0a0b0f", border:`1px solid ${T.border}`, borderRadius:8, padding:16, color:"#a5f3c7", fontFamily:"monospace", fontSize:12, lineHeight:1.6, resize:"none", boxSizing:"border-box", marginBottom:10 }} />
          {status && (
            <div style={{ padding:"8px 12px", borderRadius:6, marginBottom:10, background: status.ok ? `${T.green}15` : `${T.red}15`, border:`1px solid ${status.ok?T.green:T.red}33`, fontSize:12, color: status.ok ? T.green : T.red }}>
              {status.msg}
            </div>
          )}
          <button onClick={doImport} disabled={importing || !pineCode.trim()}
            style={{ padding:"8px 20px", borderRadius:8, background:T.green, color:"#000", border:"none", cursor:"pointer", fontWeight:700, fontSize:13, opacity:importing?0.7:1 }}>
            {importing ? "⏳ Parsing with AI..." : "🔍 Parse PineScript"}
          </button>
        </div>
      )}
    </div>
  );
}
