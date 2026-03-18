import { callAI } from "./ai.js";

export const DEFAULT_STRATEGY = {
  id: "default",
  name: "RSI Oversold Bounce",
  description: "Buy when RSI crosses above 30, sell when RSI crosses above 70 or stop loss hit",
  buyRules:  [{ indicator:"RSI", condition:"below", threshold:30, params:{ period:14 } }],
  sellRules: [{ indicator:"RSI", condition:"above", threshold:70, params:{ period:14 } }],
  stopLossPct: 2,
  takeProfitPct: 6,
  positionSizePct: 95,
};

export const INDICATOR_OPTIONS = [
  { id:"RSI",     label:"RSI",                 conditions:["above","below"] },
  { id:"EMA",     label:"EMA Cross",           conditions:["above","below"] },
  { id:"SMA",     label:"SMA",                 conditions:["above","below"] },
  { id:"MACD",    label:"MACD Histogram",      conditions:["above","below"] },
  { id:"BB_PCT",  label:"Bollinger % (0-100)", conditions:["above","below"] },
  { id:"STOCH_K", label:"Stochastic %K",       conditions:["above","below"] },
  { id:"PRICE",   label:"Price",               conditions:["above","below"] },
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

// ─── PineScript v5 generator ─────────────────────────────────────────────────
// Converts every rule, indicator, threshold, and risk param to valid Pine.
// Every time strategy changes this is called fresh — no stale output.

export function toPineScript(strategy) {
  const {
    name = "Unnamed Strategy",
    description = "",
    buyRules  = [],
    sellRules = [],
    stopLossPct     = 2,
    takeProfitPct   = 4,
    positionSizePct = 95,
  } = strategy;

  // Collect which indicators are actually used
  const allRules = [...buyRules, ...sellRules];
  const usesRSI    = allRules.some(r => r.indicator === "RSI");
  const usesMACD   = allRules.some(r => r.indicator === "MACD");
  const usesEMA    = allRules.some(r => r.indicator === "EMA");
  const usesSMA    = allRules.some(r => r.indicator === "SMA");
  const usesBB     = allRules.some(r => r.indicator === "BB_PCT");
  const usesStoch  = allRules.some(r => r.indicator === "STOCH_K");
  const usesPrice  = allRules.some(r => r.indicator === "PRICE");

  // Collect unique EMA/SMA periods used
  const emaPeriods = [...new Set(allRules.filter(r => r.indicator === "EMA").map(r => r.params?.period || 21))];
  const smaPeriods = [...new Set(allRules.filter(r => r.indicator === "SMA").map(r => r.params?.period || 20))];
  const rsiPeriods = [...new Set(allRules.filter(r => r.indicator === "RSI").map(r => r.params?.period || 14))];

  // Convert a single rule to Pine expression
  const ruleToExpr = (r) => {
    const dir = r.condition === "above" ? ">" : "<";
    const p   = r.params?.period;

    switch (r.indicator) {
      case "RSI":
        return `ta.rsi(close, ${p || 14}) ${dir} ${r.threshold}`;
      case "MACD":
        return `macdHist ${dir} ${r.threshold}`;
      case "EMA":
        return `ta.ema(close, ${p || 21}) ${dir} close`;  // EMA vs price
      case "SMA":
        return `ta.sma(close, ${p || 20}) ${dir} close`;
      case "BB_PCT":
        return `bbPct ${dir} ${r.threshold / 100}`; // Pine BB% is 0–1
      case "STOCH_K":
        return `stochK ${dir} ${r.threshold}`;
      case "PRICE":
        return `close ${dir} ${r.threshold}`;
      default:
        return `// unsupported: ${r.indicator} ${r.condition} ${r.threshold}`;
    }
  };

  // Build condition strings
  const joinRules = (rules) => {
    if (!rules || rules.length === 0) return "false";
    return rules.map(ruleToExpr).join(" and\n     ");
  };

  // Declare indicator variables only if used
  const declarations = [];

  if (usesRSI) {
    rsiPeriods.forEach(p => declarations.push(`rsi${p} = ta.rsi(close, ${p})`));
  }
  if (usesMACD) {
    declarations.push(`[macdLine, signalLine, macdHist] = ta.macd(close, 12, 26, 9)`);
  }
  if (usesEMA) {
    emaPeriods.forEach(p => declarations.push(`ema${p} = ta.ema(close, ${p})`));
    // Re-map expr to use named var
  }
  if (usesSMA) {
    smaPeriods.forEach(p => declarations.push(`sma${p} = ta.sma(close, ${p})`));
  }
  if (usesBB) {
    declarations.push(`[bbUpper, bbMid, bbLower] = ta.bb(close, 20, 2)`);
    declarations.push(`bbPct = (close - bbLower) / (bbUpper - bbLower)`);
  }
  if (usesStoch) {
    declarations.push(`stochK = ta.stoch(close, high, low, 14)`);
  }

  // Plot lines for used indicators (only relevant ones)
  const plots = [];
  if (usesRSI || usesEMA || usesSMA) {
    emaPeriods.forEach(p => plots.push(`plot(ema${p}, color=color.yellow, title="EMA ${p}", linewidth=1)`));
    smaPeriods.forEach(p => plots.push(`plot(sma${p}, color=color.blue,   title="SMA ${p}", linewidth=1)`));
  }
  if (usesBB) {
    plots.push(`plot(bbUpper, color=color.new(color.blue, 70), title="BB Upper")`);
    plots.push(`plot(bbMid,   color=color.new(color.blue, 80), title="BB Mid")`);
    plots.push(`plot(bbLower, color=color.new(color.blue, 70), title="BB Lower")`);
  }
  if (usesMACD) {
    plots.push(`// MACD plotted in separate pane — add an indicator manually`);
  }

  // Rebuild ruleToExpr with named RSI vars for cleaner output
  const ruleToExprNamed = (r) => {
    const dir = r.condition === "above" ? ">" : "<";
    const p   = r.params?.period;
    switch (r.indicator) {
      case "RSI":     return `rsi${p || 14} ${dir} ${r.threshold}`;
      case "MACD":    return `macdHist ${dir} ${r.threshold}`;
      case "EMA":     return `ema${p || 21} ${dir} close`;
      case "SMA":     return `sma${p || 20} ${dir} close`;
      case "BB_PCT":  return `bbPct ${dir} ${r.threshold / 100}`;
      case "STOCH_K": return `stochK ${dir} ${r.threshold}`;
      case "PRICE":   return `close ${dir} ${r.threshold}`;
      default:        return `// unsupported: ${r.indicator} ${r.condition} ${r.threshold}`;
    }
  };

  const joinNamed = (rules) => {
    if (!rules || rules.length === 0) return "false";
    return rules.map(ruleToExprNamed).join(" and\n     ");
  };

  const slMult  = (1 - stopLossPct   / 100).toFixed(4);
  const tpMult  = (1 + takeProfitPct / 100).toFixed(4);

  return `//@version=5
// ════════════════════════════════════════════
// ${name}
// ${description || "Generated by CryptoTrader"}
// ════════════════════════════════════════════
strategy(
     title               = "${name.replace(/"/g,"'")}",
     overlay             = true,
     default_qty_type    = strategy.percent_of_equity,
     default_qty_value   = ${positionSizePct},
     initial_capital     = 10000,
     commission_type     = strategy.commission.percent,
     commission_value    = 0.1
 )

// ── Indicator declarations ────────────────────
${declarations.length > 0 ? declarations.join("\n") : "// (no indicators used)"}

// ── Entry condition ───────────────────────────
longCondition = ${joinNamed(buyRules)}

// ── Exit condition ────────────────────────────
exitCondition = ${joinNamed(sellRules)}

// ── Execution ─────────────────────────────────
if longCondition
    strategy.entry("Long", strategy.long)

if exitCondition
    strategy.close("Long", comment="Signal exit")

// ── Risk management ───────────────────────────
strategy.exit(
     id         = "SL/TP",
     from_entry = "Long",
     stop       = strategy.position_avg_price * ${slMult},
     limit      = strategy.position_avg_price * ${tpMult},
     comment_loss  = "Stop Loss ${stopLossPct}%",
     comment_profit = "Take Profit ${takeProfitPct}%"
 )

// ── Visual signals ────────────────────────────
plotshape(longCondition,  title="Buy Signal",  style=shape.triangleup,   location=location.belowbar, color=color.green, size=size.small)
plotshape(exitCondition,  title="Sell Signal", style=shape.triangledown, location=location.abovebar, color=color.red,   size=size.small)
${plots.length > 0 ? "\n// ── Indicator plots ──────────────────────────\n" + plots.join("\n") : ""}

// ── Info table ────────────────────────────────
var table infoTable = table.new(position.top_right, 2, 4, bgcolor=color.new(color.black, 80), border_width=1)
if barstate.islast
    table.cell(infoTable, 0, 0, "Strategy",  text_color=color.gray,  text_size=size.small)
    table.cell(infoTable, 1, 0, "${name.replace(/"/g, "'")}",   text_color=color.white, text_size=size.small)
    table.cell(infoTable, 0, 1, "Stop Loss", text_color=color.gray,  text_size=size.small)
    table.cell(infoTable, 1, 1, "${stopLossPct}%",       text_color=color.red,   text_size=size.small)
    table.cell(infoTable, 0, 2, "Take Profit", text_color=color.gray, text_size=size.small)
    table.cell(infoTable, 1, 2, "${takeProfitPct}%",      text_color=color.green, text_size=size.small)
    table.cell(infoTable, 0, 3, "Size",      text_color=color.gray,  text_size=size.small)
    table.cell(infoTable, 1, 3, "${positionSizePct}%",   text_color=color.yellow,text_size=size.small)
`.trimEnd() + "\n";
}

// ─── Parse PineScript using AI ───────────────────────────────────────────────
export async function parsePineScript(pine) {
  const sys = `You are a PineScript v5 parser. Extract the trading strategy from the PineScript code and return ONLY valid JSON:
{
  "name": "Strategy name",
  "buyRules":  [{"indicator":"RSI","condition":"below","threshold":30,"params":{"period":14}}],
  "sellRules": [{"indicator":"RSI","condition":"above","threshold":70,"params":{"period":14}}],
  "stopLossPct": 2,
  "takeProfitPct": 6,
  "positionSizePct": 95,
  "description": "Plain English description"
}
Supported indicators: RSI, EMA, SMA, MACD, BB_PCT, STOCH_K, PRICE
Supported conditions: above, below`;

  const text = await callAI([{ role:"user", content:`Parse this PineScript:\n\n${pine}` }], sys);
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch { return null; }
}

export async function explainStrategy(strategy, backtestResult) {
  const sys = "You are a crypto trading expert. Explain this strategy and its backtest results in clear, concise language. Be specific about strengths, weaknesses, and improvement suggestions.";
  const prompt = `Strategy: ${JSON.stringify(strategy, null, 2)}\n\nBacktest: WinRate: ${backtestResult?.winRate?.toFixed(1)}%, Return: ${backtestResult?.totalRet?.toFixed(1)}%, MaxDD: ${backtestResult?.maxDD?.toFixed(1)}%, Sharpe: ${backtestResult?.sharpe?.toFixed(2)}, Trades: ${backtestResult?.tradeCount}`;
  return callAI([{ role:"user", content:prompt }], sys);
}

export async function improveStrategy(strategy, backtestResult) {
  const sys = `You are a quant trader. Suggest specific improvements to this crypto trading strategy based on its backtest results. Return ONLY valid JSON with the improved strategy in the same format as the input.`;
  const prompt = `Current strategy: ${JSON.stringify(strategy)}\nResults: Return ${backtestResult?.totalRet?.toFixed(1)}%, MaxDD ${backtestResult?.maxDD?.toFixed(1)}%, Sharpe ${backtestResult?.sharpe?.toFixed(2)}, WinRate ${backtestResult?.winRate?.toFixed(1)}%`;
  const text = await callAI([{ role:"user", content:prompt }], sys);
  try { return JSON.parse(text.replace(/```json\n?|```/g, "").trim()); }
  catch { return null; }
}
