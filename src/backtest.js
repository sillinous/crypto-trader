import * as ind from "./indicators.js";

// Evaluate a strategy rule against indicator data at index i
function evalCondition(rule, ctx, i) {
  const { indicator, params, condition, threshold } = rule;
  let value = null;

  if (indicator === "RSI")   value = ctx.rsi?.[i];
  if (indicator === "EMA")   value = ctx[`ema${params?.period}`]?.[i];
  if (indicator === "SMA")   value = ctx[`sma${params?.period}`]?.[i];
  if (indicator === "MACD")  value = ctx.macd?.histogram?.[i];
  if (indicator === "BB_PCT") {
    const u = ctx.bb?.upper[i], l = ctx.bb?.lower[i], c = ctx.closes[i];
    value = u && l ? (c - l) / (u - l) * 100 : null;
  }
  if (indicator === "STOCH_K") value = ctx.stoch?.k[i];
  if (indicator === "PRICE")  value = ctx.closes[i];

  if (value === null) return false;

  if (condition === "above")        return value > threshold;
  if (condition === "below")        return value < threshold;
  if (condition === "crossOver")    return ind.crossOver(ctx.rsi ?? [], [threshold], i);
  if (condition === "crossUnder")   return ind.crossUnder(ctx.rsi ?? [], [threshold], i);
  return false;
}

function buildContext(candles) {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  return {
    closes, highs, lows, volumes,
    rsi:  ind.rsi(closes, 14),
    ema9: ind.ema(closes, 9),
    ema21:ind.ema(closes, 21),
    ema50:ind.ema(closes, 50),
    sma20:ind.sma(closes, 20),
    sma50:ind.sma(closes, 50),
    macd: ind.macd(closes),
    bb:   ind.bollingerBands(closes),
    atr:  ind.atr(highs, lows, closes),
    stoch:ind.stochastic(highs, lows, closes),
    vwap: ind.vwap(highs, lows, closes, volumes),
  };
}

export function runBacktest(candles, strategy, capital = 10000) {
  if (!candles || candles.length < 50) return null;

  const ctx    = buildContext(candles);
  const trades = [];
  let equity   = capital;
  let position = null; // { entryPrice, size, entryIdx }
  const equityCurve = [capital];

  const { buyRules = [], sellRules = [], stopLossPct = 2, takeProfitPct = 4, positionSizePct = 100 } = strategy;

  for (let i = 50; i < candles.length; i++) {
    const price = candles[i].close;

    if (!position) {
      // Check buy conditions
      const buySignal = buyRules.length > 0
        ? buyRules.every(r => evalCondition(r, ctx, i))
        : false;

      if (buySignal) {
        const size = (equity * (positionSizePct / 100)) / price;
        position = { entryPrice: price, size, entryIdx: i, entryTime: candles[i].time };
      }
    } else {
      const { entryPrice, size, entryIdx, entryTime } = position;
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;

      // Check sell conditions
      const sellSignal = sellRules.length > 0
        ? sellRules.every(r => evalCondition(r, ctx, i))
        : false;

      const hitSL = stopLossPct  > 0 && pnlPct <= -stopLossPct;
      const hitTP = takeProfitPct > 0 && pnlPct >= takeProfitPct;

      if (sellSignal || hitSL || hitTP) {
        const pnl  = (price - entryPrice) * size;
        equity    += pnl;
        trades.push({
          entryIdx, exitIdx: i,
          entryTime, exitTime: candles[i].time,
          entryPrice, exitPrice: price,
          size, pnl, pnlPct,
          reason: hitSL ? "stop_loss" : hitTP ? "take_profit" : "signal",
        });
        position = null;
      }
    }

    equityCurve.push(equity);
  }

  // Metrics
  const wins      = trades.filter(t => t.pnl > 0);
  const losses    = trades.filter(t => t.pnl <= 0);
  const winRate   = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const totalPnl  = trades.reduce((s, t) => s + t.pnl, 0);
  const totalRet  = ((equity - capital) / capital) * 100;

  // Max drawdown
  let peak = capital, maxDD = 0;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe (simplified, daily returns)
  const returns = equityCurve.slice(1).map((eq, i) => (eq - equityCurve[i]) / equityCurve[i]);
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdRet  = Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length);
  const sharpe  = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252) : 0;

  // Profit factor
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  return { trades, equityCurve, winRate, totalPnl, totalRet, maxDD, sharpe, profitFactor, finalEquity: equity, tradeCount: trades.length };
}

// Parameter optimization — sweep RSI period and thresholds
export function optimizeStrategy(candles, baseStrategy, paramGrid) {
  const results = [];
  for (const params of paramGrid) {
    const strat = { ...baseStrategy, ...params };
    const result = runBacktest(candles, strat);
    if (result) results.push({ params, ...result });
  }
  return results.sort((a, b) => b.sharpe - a.sharpe);
}

export function generateParamGrid(ranges) {
  // ranges: [{ key, min, max, step }]
  const grid = [{}];
  for (const { key, min, max, step } of ranges) {
    const expanded = [];
    for (const existing of grid) {
      for (let v = min; v <= max; v += step) {
        expanded.push({ ...existing, [key]: v });
      }
    }
    grid.splice(0, grid.length, ...expanded);
  }
  return grid;
}
