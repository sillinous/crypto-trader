import React, { useState, useEffect } from "react";

const T = { bg:"#0d0d0f", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6", purple:"#a855f7" };

const LS = {
  get: (k, def = "") => { try { return localStorage.getItem(k) ?? def; } catch { return def; } },
  set: (k, v)        => { try { localStorage.setItem(k, v); } catch {} },
  del: (k)           => { try { localStorage.removeItem(k); } catch {} },
};

function KeyField({ label, lsKey, placeholder, hint, testFn, type = "password" }) {
  const [val, setVal]       = useState(() => LS.get(lsKey));
  const [saved, setSaved]   = useState(false);
  const [testing, setTest]  = useState(false);
  const [testResult, setTR] = useState(null);
  const [show, setShow]     = useState(false);

  const save = () => {
    LS.set(lsKey, val.trim());
    setSaved(true);
    setTR(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const test = async () => {
    if (!val.trim() || !testFn) return;
    setTest(true); setTR(null);
    try {
      const ok = await testFn(val.trim());
      setTR({ ok, msg: ok ? "✅ Key works" : "❌ Key rejected" });
    } catch(e) {
      setTR({ ok:false, msg:`❌ ${e.message}` });
    }
    setTest(false);
  };

  const clear = () => { LS.del(lsKey); setVal(""); setTR(null); };

  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:10, color:T.mute, marginBottom:3, fontWeight:700, letterSpacing:0.5 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <div style={{ flex:1, position:"relative" }}>
          <input
            type={show ? "text" : type}
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder={placeholder}
            style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${T.border}`,
              borderRadius:7, padding:"8px 32px 8px 10px", color:T.text, fontSize:12, boxSizing:"border-box" }}
          />
          {val && (
            <button onClick={() => setShow(s => !s)}
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:T.mute, cursor:"pointer", fontSize:11, padding:0 }}>
              {show ? "🙈" : "👁"}
            </button>
          )}
        </div>
        <button onClick={save} disabled={!val.trim()}
          style={{ padding:"7px 12px", borderRadius:7, background:saved?T.green:"rgba(255,255,255,0.07)",
            border:`1px solid ${saved?T.green:T.border}`, color:saved?"#000":T.text, cursor:"pointer", fontWeight:700, fontSize:11, flexShrink:0 }}>
          {saved ? "✓" : "Save"}
        </button>
        {testFn && (
          <button onClick={test} disabled={!val.trim() || testing}
            style={{ padding:"7px 12px", borderRadius:7, background:"rgba(59,130,246,0.12)",
              border:`1px solid ${T.blue}33`, color:T.blue, cursor:"pointer", fontWeight:700, fontSize:11, flexShrink:0 }}>
            {testing ? "…" : "Test"}
          </button>
        )}
        {val && (
          <button onClick={clear}
            style={{ padding:"7px 10px", borderRadius:7, background:"rgba(239,68,68,0.08)",
              border:`1px solid ${T.red}22`, color:T.red, cursor:"pointer", fontSize:11, flexShrink:0 }}>
            ✕
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize:9, color:T.mute, marginTop:3 }}>{hint}</div>}
      {testResult && (
        <div style={{ fontSize:10, marginTop:4, color:testResult.ok ? T.green : T.red }}>
          {testResult.msg}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:16, border:`1px solid ${T.border}`, marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:800, color:T.text, marginBottom:14 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

async function testGroq(key) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json","Authorization":`Bearer ${key}` },
    body: JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:5, messages:[{role:"user",content:"hi"}] }),
  });
  return r.ok;
}

async function testOpenRouter(key) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json","Authorization":`Bearer ${key}` },
    body: JSON.stringify({ model:"google/gemma-3-27b-it:free", max_tokens:5, messages:[{role:"user",content:"hi"}] }),
  });
  return r.ok;
}

export default function Settings() {
  const [cleared, setCleared] = useState(false);
  const [storageSize, setStorageSize] = useState(0);

  useEffect(() => {
    try {
      let total = 0;
      for (const k of Object.keys(localStorage)) total += (localStorage.getItem(k)?.length || 0);
      setStorageSize((total / 1024).toFixed(1));
    } catch {}
  }, []);

  const clearAll = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("ct_"));
    keys.forEach(k => localStorage.removeItem(k));
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
    setStorageSize(0);
  };

  return (
    <div style={{ maxWidth:700 }}>

      <Section title="AI Provider Keys" icon="🧠">
        <div style={{ fontSize:10, color:T.mute, marginBottom:12, lineHeight:1.6 }}>
          Keys are stored in your browser's localStorage — never sent to any server other than the AI provider directly.
          If running from a .env.local file, those take priority; these override them at runtime.
        </div>
        <KeyField
          label="Groq API Key (primary)"
          lsKey="ct_groq_key"
          placeholder="gsk_..."
          hint="Free tier available at console.groq.com — powers AI strategy naming, refinement, and analysis"
          testFn={testGroq}
        />
        <KeyField
          label="OpenRouter API Key (fallback)"
          lsKey="ct_or_key"
          placeholder="sk-or-v1-..."
          hint="Used when Groq is rate-limited. Free models available at openrouter.ai"
          testFn={testOpenRouter}
        />
      </Section>

      <Section title="Exchange — crypto.com" icon="💱">
        <div style={{ fontSize:10, color:T.mute, marginBottom:12 }}>
          Keys are only used for signing requests to api.crypto.com — never stored externally.
          Generate API keys at <span style={{ color:T.blue }}>crypto.com/exchange</span> → Settings → API Management.
        </div>
        <KeyField
          label="API Key"
          lsKey="ct_cdc_key"
          placeholder="your crypto.com API key"
          type="text"
        />
        <KeyField
          label="API Secret"
          lsKey="ct_cdc_secret"
          placeholder="your crypto.com API secret"
          hint="Required for balance, orders, and trading. Leave blank to use paper trading mode only."
        />
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
          <input type="checkbox"
            checked={LS.get("ct_paper_mode","true") !== "false"}
            onChange={e => LS.set("ct_paper_mode", String(e.target.checked))}
            id="paper-toggle" />
          <label htmlFor="paper-toggle" style={{ fontSize:11, color:T.amber, cursor:"pointer" }}>
            📋 Paper trading mode — simulate orders without real money
          </label>
        </div>
      </Section>

      <Section title="Data & Storage" icon="💾">
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
          {[
            ["Saved Strategies", "ct_strategies", T.green],
            ["Active Strategy", "ct_active_strategy", T.amber],
            ["Refinement Sessions", "ct_refinement_sessions", T.purple],
          ].map(([label, key, color]) => {
            const val = LS.get(key);
            let count = "—";
            try { count = key === "ct_strategies" ? JSON.parse(val||"[]").length + " saved" : val ? "1 item" : "empty"; } catch {}
            return (
              <div key={key} style={{ padding:"8px 12px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:9, color:T.mute }}>{label}</div>
                <div style={{ fontSize:12, fontWeight:700, color }}>{count}</div>
              </div>
            );
          })}
          <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:9, color:T.mute }}>Total storage</div>
            <div style={{ fontSize:12, fontWeight:700, color:T.sub }}>{storageSize} KB</div>
          </div>
        </div>
        <button onClick={clearAll}
          style={{ padding:"7px 16px", borderRadius:7, background:`${T.red}12`, border:`1px solid ${T.red}33`,
            color:T.red, cursor:"pointer", fontWeight:700, fontSize:11 }}>
          {cleared ? "✓ Cleared!" : "🗑 Clear All App Data"}
        </button>
        <div style={{ fontSize:9, color:T.mute, marginTop:4 }}>
          Removes saved strategies, sessions, and settings. Does not affect API keys.
        </div>
      </Section>

      <Section title="About" icon="⚡">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
          {[
            ["App", "CryptoTrader v1.0"],
            ["Framework", "React 18 + Vite 8"],
            ["Data Feed", "Binance WebSocket (44 pairs)"],
            ["AI Model", "Groq llama-3.3-70b-versatile"],
            ["Exchange", "crypto.com API v2"],
            ["Indicators", "RSI, MACD, EMA, SMA, BB, ATR, Stoch, VWAP"],
            ["Repo", "github.com/sillinous/crypto-trader"],
            ["Deployed", "crypto-trader-sillinous.netlify.app"],
          ].map(([l, v]) => (
            <div key={l} style={{ display:"flex", flexDirection:"column", padding:"6px 10px", background:"rgba(255,255,255,0.02)", borderRadius:6 }}>
              <div style={{ fontSize:9, color:T.mute }}>{l}</div>
              <div style={{ fontSize:10, color:T.sub, fontWeight:600, marginTop:1 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:10, fontSize:10, color:T.mute, lineHeight:1.7 }}>
          ⚠️ This platform is for educational and research purposes only. Backtested strategies do not guarantee future profits.
          Always test in paper trading mode before using real funds.
        </div>
      </Section>
    </div>
  );
}
