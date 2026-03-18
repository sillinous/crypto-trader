// AI wrapper — Groq primary, OpenRouter fallback
// Keys stored in localStorage (set via Settings panel) or .env.local for dev
const GROQ_KEY = localStorage.getItem("ct_groq_key")   || import.meta.env.VITE_GROQ_KEY   || "";
const OR_KEY   = localStorage.getItem("ct_or_key")     || import.meta.env.VITE_OR_KEY     || "";

async function callGroq(messages, system) {
  const msgs = system ? [{ role: "system", content: system }, ...messages] : messages;
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 4096, messages: msgs }),
  });
  if (r.status === 429) return null; // rate limited — cascade
  if (!r.ok) return null;
  const d = await r.json();
  return d.choices?.[0]?.message?.content || null;
}

async function callOpenRouter(messages, system) {
  const msgs = system ? [{ role: "system", content: system }, ...messages] : messages;
  for (const model of ["google/gemma-3-27b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "meta-llama/llama-3.2-3b-instruct:free"]) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OR_KEY}`, "HTTP-Referer": window.location.origin, "X-Title": "Crypto Trader" },
      body: JSON.stringify({ model, max_tokens: 4096, messages: msgs }),
    });
    if (!r.ok) continue;
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content;
    if (text) return text;
  }
  return null;
}

export async function callAI(messages, system = "") {
  const text = await callGroq(messages, system) ?? await callOpenRouter(messages, system);
  return text ?? "AI unavailable — check API keys in Settings.";
}
