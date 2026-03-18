// AI wrapper — Groq primary, OpenRouter fallback
// Keys read fresh on every call so Settings changes take effect without reload

function getKey(lsKey, envKey) {
  return localStorage.getItem(lsKey) || (typeof import.meta !== "undefined" ? import.meta.env[envKey] : "") || "";
}

const MODELS = {
  groq: ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"],
  or_free: ["google/gemma-3-27b-it:free", "nvidia/llama-3.1-nemotron-ultra-253b-v1:free", "meta-llama/llama-3.2-3b-instruct:free"],
};

async function callGroq(messages, system) {
  const key = getKey("ct_groq_key", "VITE_GROQ_KEY");
  if (!key) return null;
  const msgs = system ? [{ role:"system", content:system }, ...messages] : messages;
  for (const model of MODELS.groq) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens:4096, messages:msgs }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429) continue; // try next model
      if (!r.ok) return null;
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text) return text;
    } catch { continue; }
  }
  return null;
}

async function callOpenRouter(messages, system) {
  const key = getKey("ct_or_key", "VITE_OR_KEY");
  if (!key) return null;
  const msgs = system ? [{ role:"system", content:system }, ...messages] : messages;
  for (const model of MODELS.or_free) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${key}`,
          "HTTP-Referer": window.location.origin,
          "X-Title":"CryptoTrader",
        },
        body: JSON.stringify({ model, max_tokens:4096, messages:msgs }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text) return text;
    } catch { continue; }
  }
  return null;
}

export async function callAI(messages, system = "") {
  const text = await callGroq(messages, system) ?? await callOpenRouter(messages, system);
  if (!text) {
    return "AI unavailable — add your Groq or OpenRouter key in ⚙️ Settings.";
  }
  return text;
}
