import { callAI } from "./ai.js";

export const DEFAULT_STRATEGY = {
  id: "default",
  name: "RSI Oversold Bounce",
  description: "Buy when RSI crosses above 30, sell when RSI crosses above 70 or stop loss hit",
  buyRules: [{ indicator: "RSI", condition: "below", threshold: 30, params: { period: 14 } }],
  sellRules: [{ indicator: "RSI", condition: "above", threshold: 70, params: { period: 14 } }],
  stopLossPct: 2,
  takeProfitPct: 6,
  positionSizePct: 95,
};

export const INDICATOR_OPTIONS = [
  { id: "RSI",     label: "RSI",              conditions: ["above","below"] },
  { id: "EMA",     label: "EMA Cross",        conditions: ["above","below"] },
  { id: "SMA",     label: "SMA",              conditions: ["above","below"] },
  { id: "MACD",    label: "MACD Histogram",   conditions: ["above","below"] },
  { id: "BB_PCT",  label: "Bollinger % (0-100)", conditions: ["above","below"] },
  { id: "STOCH_K", label: "Stochastic %K",    conditions: ["above","below"] },
  { id: "PRICE",   label: "Price",            conditions: ["above","below"] },
];

export function loadStrategies() {
  try { return JSON.parse(localStorage.getItem("ct_strategies") || "[]"); } catch { return []; }
}

export function saveStrategy(strategy) {
  const all = loadStrategies().filter(s => s.id !== strategy.id);
  localStorage.setItem("ct_strategies", JSON.stringify([strategy, ...all]));
}

export function deleteStrategy(id) {
  localStorage.setItem("ct_strategies", JSON.stringify(loadStrategies().filter(s => s.id !== id)));
}

// Export strategy to PineScript v5
export function toPineScript(strategy) {
  const { name, buyRules, sellRules, stopLossPct, takeProfitPct } = strategy;

  const ruleToPS = (rules) => rules.map(r => {
    if (r.indicator === "RSI") {
      const dir = r.condition === "above" ? ">" : "<";
      return `ta.rsi(close, ${r.params?.period || 14}) ${dir} ${r.threshold}`;
    }
    if (r.indicator === "MACD") {
      const dir = r.condition === "above" ? ">" : "<";
      return `ta.macd(close, 12, 26, 9).hist ${dir} ${r.threshold}`;
    }
    return `// ${r.indicator} ${r.condition} ${r.threshold}`;
  }).join(" and ");

  return `//@version=5
strategy("${name}", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=95)

// Indicators
rsi14 = ta.rsi(close, 14)
[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)
ema9  = ta.ema(close, 9)
ema21 = ta.ema(close, 21)
[upper, mid, lower] = ta.bb(close, 20, 2)

// Entry
longCondition  = ${ruleToPS(buyRules)  || "rsi14 < 30"}
shortCondition = ${ruleToPS(sellRules) || "rsi14 > 70"}

if longCondition
    strategy.entry("Long", strategy.long)

if shortCondition
    strategy.close("Long")

// Risk management
strategy.exit("SL/TP", "Long", stop=strategy.position_avg_price * ${1 - stopLossPct / 100}, limit=strategy.position_avg_price * ${1 + takeProfitPct / 100})

// Plots
plot(ema9,  color=color.yellow, title="EMA 9")
plot(ema21, color=color.blue,   title="EMA 21")
`;
}

// Parse PineScript using AI
export async function parsePineScript(pine) {
  const sys = `You are a PineScript v5 parser. Extract the trading strategy from the PineScript code and return ONLY valid JSON:
{
  "name": "Strategy name",
  "buyRules": [{"indicator":"RSI","condition":"below","threshold":30,"params":{"period":14}}],
  "sellRules": [{"indicator":"RSI","condition":"above","threshold":70,"params":{"period":14}}],
  "stopLossPct": 2,
  "takeProfitPct": 6,
  "positionSizePct": 95,
  "description": "Plain English description"
}
Supported indicators: RSI, EMA, SMA, MACD, BB_PCT, STOCH_K, PRICE
Supported conditions: above, below`;

  const text = await callAI([{ role: "user", content: `Parse this PineScript:\n\n${pine}` }], sys);
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch {
    return null;
  }
}

export async function explainStrategy(strategy, backtestResult) {
  const sys = "You are a crypto trading expert. Explain this strategy and its backtest results in clear, concise language. Be specific about strengths, weaknesses, and improvement suggestions.";
  const prompt = `Strategy: ${JSON.stringify(strategy, null, 2)}\n\nBacktest: WinRate: ${backtestResult?.winRate?.toFixed(1)}%, Return: ${backtestResult?.totalRet?.toFixed(1)}%, MaxDD: ${backtestResult?.maxDD?.toFixed(1)}%, Sharpe: ${backtestResult?.sharpe?.toFixed(2)}, Trades: ${backtestResult?.tradeCount}`;
  return callAI([{ role: "user", content: prompt }], sys);
}

export async function improveStrategy(strategy, backtestResult) {
  const sys = `You are a quant trader. Suggest specific improvements to this crypto trading strategy based on its backtest results. Return ONLY valid JSON with the improved strategy in the same format as the input.`;
  const prompt = `Current strategy: ${JSON.stringify(strategy)}\nResults: Return ${backtestResult?.totalRet?.toFixed(1)}%, MaxDD ${backtestResult?.maxDD?.toFixed(1)}%, Sharpe ${backtestResult?.sharpe?.toFixed(2)}, WinRate ${backtestResult?.winRate?.toFixed(1)}%`;
  const text = await callAI([{ role: "user", content: prompt }], sys);
  try { return JSON.parse(text.replace(/```json\n?|```/g, "").trim()); }
  catch { return null; }
}
