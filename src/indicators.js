// Pure JS technical indicators — all mathematically correct

export const sma = (data, period) => {
  const result = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    result[i] = slice.reduce((a, b) => a + b, 0) / period;
  }
  return result;
};

export const ema = (data, period) => {
  const result = new Array(data.length).fill(null);
  const k = 2 / (period + 1);
  let started = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) continue;
    if (!started) {
      // seed with SMA of first `period` values
      if (i < period - 1) continue;
      result[i] = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      started = true;
    } else {
      result[i] = data[i] * k + result[i - 1] * (1 - k);
    }
  }
  return result;
};

export const rsi = (closes, period = 14) => {
  const result = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
};

export const macd = (closes, fast = 12, slow = 26, signal = 9) => {
  const fastEma  = ema(closes, fast);
  const slowEma  = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null ? fastEma[i] - slowEma[i] : null
  );
  const signalLine = ema(macdLine.map(v => v ?? 0), signal);
  const histogram  = macdLine.map((v, i) =>
    v !== null && signalLine[i] !== null ? v - signalLine[i] : null
  );
  return { macd: macdLine, signal: signalLine, histogram };
};

export const bollingerBands = (closes, period = 20, stdDev = 2) => {
  const mid = sma(closes, period);
  const upper = [], lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const mean  = mid[i];
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
    upper.push(mean + stdDev * std);
    lower.push(mean - stdDev * std);
  }
  return { upper, mid, lower };
};

export const atr = (highs, lows, closes, period = 14) => {
  const tr = closes.map((c, i) => {
    if (i === 0) return highs[i] - lows[i];
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  });
  return sma(tr, period);
};

export const stochastic = (highs, lows, closes, kPeriod = 14, dPeriod = 3) => {
  const k = closes.map((c, i) => {
    if (i < kPeriod - 1) return null;
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice  = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    return hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;
  });
  const d = sma(k.map(v => v ?? 0), dPeriod);
  return { k, d };
};

export const vwap = (highs, lows, closes, volumes) => {
  let cumVol = 0, cumTP = 0;
  return closes.map((c, i) => {
    const tp = (highs[i] + lows[i] + c) / 3;
    cumTP  += tp * volumes[i];
    cumVol += volumes[i];
    return cumVol > 0 ? cumTP / cumVol : null;
  });
};

// Signal generators
export const crossOver  = (a, b, i) => i > 0 && a[i - 1] !== null && b[i - 1] !== null && a[i - 1] < b[i - 1] && a[i] >= b[i];
export const crossUnder = (a, b, i) => i > 0 && a[i - 1] !== null && b[i - 1] !== null && a[i - 1] > b[i - 1] && a[i] <= b[i];
