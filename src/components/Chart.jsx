import React, { useEffect, useRef, useMemo, useCallback } from "react";
import * as ind from "../indicators.js";

const T = { bg:"#0d0d0f", border:"#1e2030", green:"#00c896", red:"#ef4444", blue:"#3b82f6", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569" };

function drawChart(canvas, candles, indicators, height, showVolume, ema9Data, ema21Data, sma50Data, bbData) {
  if (!canvas || candles.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement?.clientWidth || canvas.clientWidth || 800;
  if (width < 10) return;

  canvas.width  = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const volH   = showVolume ? Math.floor(height * 0.16) : 0;
  const padL   = 8, padR = 70, padT = 12, padB = 22;
  const chartH = height - volH;
  const plotH  = chartH - padT - padB;
  const plotW  = width - padL - padR;

  // Visible candles — fit as many as width allows
  const maxCandles = Math.max(20, Math.floor(plotW / 5));
  const N = Math.min(candles.length, maxCandles);
  const slice = candles.slice(-N);
  const candleW = Math.max(1.5, (plotW / N) - 1);
  const offset = candles.length - N;

  const priceMin = Math.min(...slice.map(c => c.low));
  const priceMax = Math.max(...slice.map(c => c.high));
  const priceRange = priceMax - priceMin || priceMax * 0.01 || 1;

  const toX = i  => padL + (i / (N - 1)) * plotW;
  const toY = p  => padT + (1 - (p - priceMin) / priceRange) * plotH;

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, width, height);

  // Grid lines + price labels
  ctx.strokeStyle = "#1e203088"; ctx.lineWidth = 0.5;
  ctx.fillStyle = T.mute; ctx.font = "9px monospace";
  for (let g = 0; g <= 4; g++) {
    const price = priceMax - (g / 4) * priceRange;
    const y = toY(price);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR + 2, y); ctx.stroke();
    ctx.textAlign = "left";
    const label = price >= 10000 ? price.toFixed(0)
      : price >= 1000 ? price.toFixed(1)
      : price >= 100  ? price.toFixed(2)
      : price >= 1    ? price.toFixed(3)
      : price.toFixed(5);
    ctx.fillText(label, width - padR + 6, y + 3);
  }

  // Bollinger Bands
  if (bbData) {
    // Fill
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < N; i++) {
      const v = bbData.upper[i + offset];
      if (v == null) continue;
      if (!started) { ctx.moveTo(toX(i), toY(v)); started = true; }
      else ctx.lineTo(toX(i), toY(v));
    }
    for (let i = N - 1; i >= 0; i--) {
      const v = bbData.lower[i + offset];
      if (v == null) continue;
      ctx.lineTo(toX(i), toY(v));
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(59,130,246,0.06)";
    ctx.fill();
    // Lines
    for (const [key, color] of [["upper","#3b82f622"],["lower","#3b82f622"],["mid","#3b82f618"]]) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = key==="mid" ? 0.7 : 1;
      let s = false;
      for (let i = 0; i < N; i++) {
        const v = bbData[key][i + offset];
        if (v == null) continue;
        if (!s) { ctx.moveTo(toX(i), toY(v)); s = true; } else ctx.lineTo(toX(i), toY(v));
      }
      ctx.stroke();
    }
  }

  // Overlay lines
  const drawLine = (data, color, lw = 1.2) => {
    if (!data || !data.length) return;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    let s = false;
    for (let i = 0; i < N; i++) {
      const v = data[i + offset];
      if (v == null) continue;
      if (!s) { ctx.moveTo(toX(i), toY(v)); s = true; } else ctx.lineTo(toX(i), toY(v));
    }
    ctx.stroke();
  };
  drawLine(ema9Data,  "#f59e0bcc");
  drawLine(ema21Data, "#3b82f6cc");
  drawLine(sma50Data, "#a855f7cc");

  // Candles
  for (let i = 0; i < N; i++) {
    const c = slice[i];
    const x = toX(i);
    const isUp = c.close >= c.open;
    const col = isUp ? T.green : T.red;
    // Wick
    ctx.strokeStyle = col + "cc"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
    // Body
    const yTop  = toY(Math.max(c.open, c.close));
    const yBot  = toY(Math.min(c.open, c.close));
    const bH    = Math.max(1.5, yBot - yTop);
    ctx.fillStyle = isUp ? `${T.green}dd` : `${T.red}dd`;
    ctx.fillRect(x - candleW / 2, yTop, candleW, bH);
  }

  // Volume
  if (showVolume && volH > 0) {
    const volMax = Math.max(...slice.map(c => c.volume), 1);
    for (let i = 0; i < N; i++) {
      const c = slice[i];
      const x = toX(i);
      const barH = Math.max(1, (c.volume / volMax) * (volH - 4));
      ctx.fillStyle = c.close >= c.open ? `${T.green}44` : `${T.red}44`;
      ctx.fillRect(x - candleW / 2, height - barH - 1, candleW, barH);
    }
  }

  // Latest price tag
  const last = slice[slice.length - 1];
  if (last) {
    const y = toY(last.close);
    const isUp = slice.length > 1 ? last.close >= slice[slice.length - 2].close : true;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isUp ? `${T.green}88` : `${T.red}88`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke();
    ctx.setLineDash([]);
    const label = last.close >= 10000 ? last.close.toFixed(0)
      : last.close >= 100 ? last.close.toFixed(2)
      : last.close.toFixed(4);
    ctx.fillStyle = isUp ? T.green : T.red;
    ctx.fillRect(width - padR + 2, y - 7, padR - 4, 14);
    ctx.fillStyle = "#000";
    ctx.font = "bold 9px monospace"; ctx.textAlign = "left";
    ctx.fillText(label, width - padR + 5, y + 3);
  }
}

export default function Chart({ candles = [], height = 420, showVolume = true, indicators = [] }) {
  const canvasRef = useRef();

  const closes  = useMemo(() => candles.map(c => c.close),  [candles]);
  const highs   = useMemo(() => candles.map(c => c.high),   [candles]);
  const lows    = useMemo(() => candles.map(c => c.low),    [candles]);
  const volumes = useMemo(() => candles.map(c => c.volume), [candles]);

  const ema9Data  = useMemo(() => indicators.includes("EMA9")  ? ind.ema(closes, 9)  : null, [closes, indicators]);
  const ema21Data = useMemo(() => indicators.includes("EMA21") ? ind.ema(closes, 21) : null, [closes, indicators]);
  const sma50Data = useMemo(() => indicators.includes("SMA50") ? ind.sma(closes, 50) : null, [closes, indicators]);
  const bbData    = useMemo(() => indicators.includes("BB")    ? ind.bollingerBands(closes) : null, [closes, indicators]);

  const redraw = useCallback(() => {
    drawChart(canvasRef.current, candles, indicators, height, showVolume, ema9Data, ema21Data, sma50Data, bbData);
  }, [candles, indicators, height, showVolume, ema9Data, ema21Data, sma50Data, bbData]);

  // Draw whenever data or size changes
  useEffect(() => {
    redraw();
  }, [redraw]);

  // ResizeObserver to re-draw when container resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [redraw]);

  return (
    <div style={{ width:"100%", borderRadius:8, overflow:"hidden", border:`1px solid ${T.border}` }}>
      <canvas ref={canvasRef} style={{ width:"100%", height, display:"block" }} />
    </div>
  );
}
