/**
 * Strategy Factory — generates, tests, and ranks trading strategies
 *
 * Pipeline:
 *  1. Generate candidate strategies (programmatic + AI)
 *  2. Backtest each on real data
 *  3. Score with composite metric (Sharpe + win rate + drawdown + trade count)
 *  4. Filter by quality thresholds
 *  5. Deduplicate, rank, return top N
 */

import { runBacktest } from "./backtest.js";
import { callAI } from "./ai.js";

// ─── Quality thresholds ───────────────────────────────────────────────────────
export const QUALITY = {
  minSharpe:      0.5,
  minWinRate:     42,
  maxDrawdown:    25,
  minTrades:      15,
  minProfitFactor: 1.15,
  minReturn:      -Infinity, // allow negative if Sharpe is good
};

// ─── Composite score (0–100) ──────────────────────────────────────────────────
export function scoreStrategy(r) {
  if (!r || r.tradeCount < QUALITY.minTrades) return 0;
  const sharpeScore  = Math.min(40, Math.max(0, (r.sharpe / 3) * 40));
  const winScore     = Math.min(25, Math.max(0, ((r.winRate - 40) / 30) * 25));
  const ddScore      = Math.min(20, Math.max(0, ((30 - r.maxDD) / 30) * 20));
  const pfScore      = Math.min(15, Math.max(0, Math.min(r.profitFactor, 3) / 3 * 15));
  return sharpeScore + winScore + ddScore + pfScore;
}

export function passesQuality(r) {
  if (!r) return false;
  return (
    r.sharpe      >= QUALITY.minSharpe      &&
    r.winRate     >= QUALITY.minWinRate     &&
    r.maxDD       <= QUALITY.maxDrawdown    &&
    r.tradeCount  >= QUALITY.minTrades      &&
    r.profitFactor >= QUALITY.minProfitFactor
  );
}

// ─── Strategy templates ───────────────────────────────────────────────────────
const STYLES = {
  reversal: {
    label: "Mean Reversion",
    generators: [
      // RSI oversold bounce variants
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"below", threshold: p.rsiBuy,  params:{period:p.rsiPeriod} }],
        sellRules: [{ indicator:"RSI", condition:"above", threshold: p.rsiSell, params:{period:p.rsiPeriod} }],
      }),
      // Stochastic reversal
      (p) => ({
        buyRules:  [{ indicator:"STOCH_K", condition:"below", threshold: p.stochBuy  }],
        sellRules: [{ indicator:"STOCH_K", condition:"above", threshold: p.stochSell }],
      }),
      // BB squeeze bounce
      (p) => ({
        buyRules:  [{ indicator:"BB_PCT", condition:"below", threshold: p.bbBuy  }],
        sellRules: [{ indicator:"BB_PCT", condition:"above", threshold: p.bbSell }],
      }),
      // RSI + BB combo
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"below", threshold: p.rsiBuy }, { indicator:"BB_PCT", condition:"below", threshold: p.bbBuy }],
        sellRules: [{ indicator:"RSI", condition:"above", threshold: p.rsiSell }],
      }),
    ],
  },
  trend: {
    label: "Trend Following",
    generators: [
      // MACD momentum
      (p) => ({
        buyRules:  [{ indicator:"MACD", condition:"above", threshold: 0 }],
        sellRules: [{ indicator:"MACD", condition:"below", threshold: 0 }],
      }),
      // RSI trend (mid-range entries)
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"above", threshold: p.rsiTrendBuy  }],
        sellRules: [{ indicator:"RSI", condition:"below", threshold: p.rsiTrendSell }],
      }),
      // EMA alignment
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"above", threshold: 50 }, { indicator:"MACD", condition:"above", threshold: 0 }],
        sellRules: [{ indicator:"RSI", condition:"below", threshold: 50 }],
      }),
      // MACD + RSI
      (p) => ({
        buyRules:  [{ indicator:"MACD", condition:"above", threshold: 0 }, { indicator:"RSI", condition:"below", threshold: p.rsiSell }],
        sellRules: [{ indicator:"MACD", condition:"below", threshold: 0 }],
      }),
    ],
  },
  breakout: {
    label: "Breakout",
    generators: [
      // BB upper breakout
      (p) => ({
        buyRules:  [{ indicator:"BB_PCT", condition:"above", threshold: 90 }],
        sellRules: [{ indicator:"BB_PCT", condition:"below", threshold: 50 }],
      }),
      // RSI momentum breakout
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"above", threshold: p.rsiBreakout }],
        sellRules: [{ indicator:"MACD", condition:"below", threshold: 0 }],
      }),
      // Stoch breakout
      (p) => ({
        buyRules:  [{ indicator:"STOCH_K", condition:"above", threshold: p.stochBreakout }],
        sellRules: [{ indicator:"STOCH_K", condition:"below", threshold: 50 }],
      }),
    ],
  },
  scalp: {
    label: "Scalping",
    generators: [
      // Tight RSI
      (p) => ({
        buyRules:  [{ indicator:"RSI", condition:"below", threshold: p.rsiBuy  }],
        sellRules: [{ indicator:"RSI", condition:"above", threshold: p.rsiSell }],
      }),
      // MACD + Stoch
      (p) => ({
        buyRules:  [{ indicator:"MACD", condition:"above", threshold: 0 }, { indicator:"STOCH_K", condition:"below", threshold: 40 }],
        sellRules: [{ indicator:"STOCH_K", condition:"above", threshold: 60 }],
      }),
    ],
  },
};

// ─── Parameter space sampler ─────────────────────────────────────────────────
function sampleParams(style) {
  const r = (min, max, step=1) => {
    const steps = Math.floor((max - min) / step);
    return min + Math.floor(Math.random() * (steps + 1)) * step;
  };
  return {
    rsiPeriod:     r(7, 21, 1),
    rsiBuy:        r(20, 40, 2),
    rsiSell:       r(60, 80, 2),
    rsiTrendBuy:   r(45, 60, 5),
    rsiTrendSell:  r(40, 55, 5),
    rsiBreakout:   r(55, 70, 5),
    stochBuy:      r(15, 35, 5),
    stochSell:     r(65, 85, 5),
    stochBreakout: r(55, 75, 5),
    bbBuy:         r(5, 25, 5),
    bbSell:        r(75, 95, 5),
    stopLoss:   style === "scalp" ? r(0.5, 1.5, 0.5) : r(1, 5, 0.5),
    takeProfit: style === "scalp" ? r(1, 3, 0.5)     : r(2, 12, 0.5),
    position:      r(70, 95, 5),
  };
}

// ─── Generate all candidate strategies for a given style ─────────────────────
function generateCandidates(style, count = 40) {
  const gens = STYLES[style]?.generators || STYLES.reversal.generators;
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const p = sampleParams(style);
    const gen = gens[i % gens.length];
    const rules = gen(p);
    candidates.push({
      id: `gen_${style}_${Date.now()}_${i}`,
      name: `${STYLES[style]?.label} #${i+1}`,
      style,
      ...rules,
      stopLossPct:    p.stopLoss,
      takeProfitPct:  p.takeProfit,
      positionSizePct: p.position,
      description: "",
    });
  }
  return candidates;
}

// ─── Name + describe a strategy using AI ──────────────────────────────────────
export async function nameStrategy(strategy, result) {
  const sys = `You are a quant trader naming algo trading strategies. Given a strategy's rules and backtest results, return ONLY a JSON object with two fields:
{
  "name": "Creative short trading strategy name (2-4 words, no quotes, evocative but professional)",
  "description": "One sentence plain-English description of how and why it works"
}
Examples of good names: "RSI Dip Hunter", "MACD Momentum Rider", "Bollinger Squeeze Scalper"`;

  const prompt = `Style: ${strategy.style}
Buy when: ${strategy.buyRules.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ")}
Sell when: ${strategy.sellRules.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ")}
SL: ${strategy.stopLossPct}% | TP: ${strategy.takeProfitPct}%
Backtest: Return ${result.totalRet.toFixed(1)}%, WinRate ${result.winRate.toFixed(1)}%, Sharpe ${result.sharpe.toFixed(2)}, MaxDD ${result.maxDD.toFixed(1)}%`;

  try {
    const text = await callAI([{ role:"user", content:prompt }], sys);
    const json = JSON.parse(text.replace(/```json\n?|```/g,"").trim());
    return { name: json.name, description: json.description };
  } catch {
    return { name: strategy.name, description: "" };
  }
}

// ─── Main generation pipeline ─────────────────────────────────────────────────
export async function generateStrategies({ candles, style = "reversal", count = 60, onProgress }) {
  const candidates = generateCandidates(style, count);
  const results = [];
  const passing = [];

  for (let i = 0; i < candidates.length; i++) {
    const strat = candidates[i];
    const r = runBacktest(candles, strat);
    if (r && passesQuality(r)) {
      passing.push({ ...strat, _result: r, _score: scoreStrategy(r) });
    }
    onProgress?.({
      phase: "backtesting",
      pct: Math.floor(((i + 1) / candidates.length) * 75),
      tested: i + 1,
      total: candidates.length,
      passing: passing.length,
    });
  }

  // Sort by score, keep top 10
  passing.sort((a,b) => b._score - a._score);
  const top = passing.slice(0, 10);

  // Name top strategies with AI (in parallel, max 5)
  onProgress?.({ phase: "naming", pct: 80, passing: top.length });
  const toName = top.slice(0, 5);
  const named = await Promise.all(toName.map(async (s, i) => {
    const info = await nameStrategy(s, s._result);
    onProgress?.({ phase: "naming", pct: 80 + Math.floor((i+1)/toName.length * 18), passing: top.length });
    return { ...s, ...info };
  }));

  // Rest keep generated names
  const rest = top.slice(5).map(s => ({ ...s, description: `${STYLES[s.style]?.label} strategy · SL ${s.stopLossPct}% · TP ${s.takeProfitPct}%` }));

  onProgress?.({ phase: "done", pct: 100, passing: top.length });
  return [...named, ...rest];
}

// ─── AI-powered strategy generation (full natural language → params) ──────────
export async function generateFromPrompt(prompt, candles) {
  const sys = `You are an expert quant trader. Generate a complete crypto trading strategy based on the user's description.
Return ONLY valid JSON matching this exact schema:
{
  "name": "Strategy name",
  "description": "Plain English description",
  "style": "reversal|trend|breakout|scalp",
  "buyRules": [{"indicator":"RSI","condition":"below","threshold":30,"params":{"period":14}}],
  "sellRules": [{"indicator":"RSI","condition":"above","threshold":70,"params":{"period":14}}],
  "stopLossPct": 2,
  "takeProfitPct": 6,
  "positionSizePct": 90
}
Supported indicators: RSI, MACD, BB_PCT, STOCH_K, EMA, SMA, PRICE
Supported conditions: above, below
Be realistic and specific. Target Sharpe > 1.0, win rate > 50%, max drawdown < 15%.`;

  const text = await callAI([{ role:"user", content:prompt }], sys);
  try {
    const strat = JSON.parse(text.replace(/```json\n?|```/g,"").trim());
    strat.id = `ai_${Date.now()}`;
    // Immediately backtest
    const r = runBacktest(candles, strat);
    strat._result = r;
    strat._score = r ? scoreStrategy(r) : 0;
    return strat;
  } catch {
    return null;
  }
}

// ─── Refinement engine ────────────────────────────────────────────────────────

/**
 * refineStrategy — takes a strategy + backtest + user request, returns improved version
 *
 * The AI sees:
 *  - Full current strategy JSON
 *  - Current backtest metrics
 *  - Full version history (names + delta metrics)
 *  - The user's refinement request
 *
 * It returns a new strategy JSON. We immediately backtest and store as next version.
 */
export async function refineStrategy({ strategy, result, history, request, candles }) {
  const historyStr = history.length > 0
    ? history.map((v, i) => `v${i+1}: Return ${v.result?.totalRet?.toFixed(1)}% | Sharpe ${v.result?.sharpe?.toFixed(2)} | WinRate ${v.result?.winRate?.toFixed(1)}% | MaxDD ${v.result?.maxDD?.toFixed(1)}% — "${v.note}"`).join("\n")
    : "No prior versions";

  const sys = `You are an expert quantitative crypto trader and strategy optimizer.
You will be given a trading strategy, its backtest results, its refinement history, and a user request.
Your job is to produce an IMPROVED version of the strategy that directly addresses the user's request.

RULES:
- Return ONLY valid JSON — no explanation, no markdown, no code fences
- Keep the same schema as the input strategy
- Make targeted, meaningful changes — not random tweaks
- If user asks for higher win rate: tighten entry conditions or widen TP
- If user asks for less drawdown: tighten SL, reduce position size, or add confirming rules
- If user asks for more trades: relax thresholds or remove confirming rules
- If user asks for better Sharpe: optimize the risk/reward ratio
- If user asks to "try X indicator": incorporate it logically
- Name must reflect what changed (e.g. "RSI Dip Hunter v2 — Tighter SL")
- description must explain the key change made

Supported indicators: RSI, MACD, BB_PCT, STOCH_K, EMA, SMA, PRICE
Supported conditions: above, below`;

  const prompt = `CURRENT STRATEGY:
${JSON.stringify({ name: strategy.name, description: strategy.description, style: strategy.style, buyRules: strategy.buyRules, sellRules: strategy.sellRules, stopLossPct: strategy.stopLossPct, takeProfitPct: strategy.takeProfitPct, positionSizePct: strategy.positionSizePct }, null, 2)}

CURRENT RESULTS:
Return: ${result?.totalRet?.toFixed(2)}% | Sharpe: ${result?.sharpe?.toFixed(3)} | Win Rate: ${result?.winRate?.toFixed(1)}% | Max DD: ${result?.maxDD?.toFixed(1)}% | Trades: ${result?.tradeCount} | Profit Factor: ${result?.profitFactor === Infinity ? "∞" : result?.profitFactor?.toFixed(2)}

REFINEMENT HISTORY:
${historyStr}

USER REQUEST: "${request}"

Return the improved strategy JSON:`;

  const text = await callAI([{ role: "user", content: prompt }], sys);
  try {
    const improved = JSON.parse(text.replace(/```json\n?|```/g, "").trim());
    improved.id = strategy.id || `refined_${Date.now()}`;
    // Immediately backtest
    const r = runBacktest(candles, improved);
    improved._result = r;
    improved._score = r ? scoreStrategy(r) : 0;
    return improved;
  } catch(e) {
    console.error("Refine parse error:", e, text?.slice(0, 200));
    return null;
  }
}

/**
 * analyzeWeakness — AI pinpoints what's holding the strategy back
 */
export async function analyzeWeakness({ strategy, result, history }) {
  const sys = `You are a quant trader. Analyze this strategy's weaknesses concisely. 
Return a JSON array of up to 4 specific, actionable improvement suggestions:
[{"issue": "short label", "detail": "what's wrong", "fix": "concrete fix suggestion", "priority": "high|medium|low"}]`;

  const prompt = `Strategy: ${strategy.name}
Results: Return ${result?.totalRet?.toFixed(1)}% | Sharpe ${result?.sharpe?.toFixed(2)} | WinRate ${result?.winRate?.toFixed(1)}% | MaxDD ${result?.maxDD?.toFixed(1)}% | Trades ${result?.tradeCount} | PF ${result?.profitFactor === Infinity ? "∞" : result?.profitFactor?.toFixed(2)}
Rules: Buy when ${strategy.buyRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ")} | Sell when ${strategy.sellRules?.map(r=>`${r.indicator} ${r.condition} ${r.threshold}`).join(" AND ")}
SL: ${strategy.stopLossPct}% | TP: ${strategy.takeProfitPct}% | Size: ${strategy.positionSizePct}%`;

  const text = await callAI([{ role: "user", content: prompt }], sys);
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch {
    return [];
  }
}

// Save/load refinement sessions from localStorage
export function saveRefinementSession(strategyId, session) {
  try {
    const all = loadAllSessions();
    all[strategyId] = session;
    localStorage.setItem("ct_refinement_sessions", JSON.stringify(all));
  } catch {}
}

export function loadRefinementSession(strategyId) {
  try {
    return loadAllSessions()[strategyId] || null;
  } catch { return null; }
}

function loadAllSessions() {
  try {
    return JSON.parse(localStorage.getItem("ct_refinement_sessions") || "{}");
  } catch { return {}; }
}
