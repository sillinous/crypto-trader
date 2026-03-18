// Binance public API + WebSocket helpers
// Primary: api.binance.com (works in browsers outside restricted regions)
// Fallback: api.binance.us (US-accessible)

const BASES = [
  "https://api.binance.com/api/v3",
  "https://api.binance.us/api/v3",
];

const WS_HOSTS = [
  "wss://stream.binance.com:9443/ws",
  "wss://stream.binance.us:9443/ws",
];

export const PAIRS = [
  // Large cap
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT",
  // Mid cap
  "DOTUSDT","LINKUSDT","MATICUSDT","LTCUSDT","TRXUSDT","UNIUSDT","ATOMUSDT","NEARUSDT",
  // DeFi
  "AAVEUSDT","MKRUSDT","COMPUSDT","SUSHIUSDT","CRVUSDT","SNXUSDT","1INCHUSDT","BALUSDT",
  // Layer 2 / Alt L1
  "ARBUSDT","OPUSDT","APTUSDT","SUIUSDT","INJUSDT","TIAUSDT","SEIUSDT","STXUSDT",
  // Meme / trending
  "SHIBUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT",
  // Other
  "FILUSDT","ICPUSDT","HBARUSDT","XLMUSDT","VETUSDT","ALGOUSDT","XTZUSDT","EOSUSDT",
];
export const TIMEFRAMES = ["1m","5m","15m","1h","4h","1d"];

let workingBase = null;
let workingWS = null;

async function findBase() {
  if (workingBase) return workingBase;
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/ping`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) { workingBase = base; return base; }
    } catch {}
  }
  return BASES[0]; // fallback even if both fail
}

async function findWSHost() {
  if (workingWS) return workingWS;
  // Try to determine WS host from the working REST base
  const base = await findBase();
  workingWS = base.includes(".us") ? WS_HOSTS[1] : WS_HOSTS[0];
  return workingWS;
}

export async function fetchKlines(symbol, interval, limit = 500) {
  const base = await findBase();
  const r = await fetch(`${base}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!r.ok) throw new Error(`Binance ${r.status}: ${await r.text().catch(()=>"")}`);
  const raw = await r.json();
  if (!Array.isArray(raw)) throw new Error("Unexpected Binance response");
  return raw.map(k => ({
    time:   k[0],
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function fetch24h(symbol) {
  const base = await findBase();
  const r = await fetch(`${base}/ticker/24hr?symbol=${symbol}`);
  if (!r.ok) throw new Error(`Binance 24h ${r.status}`);
  return r.json();
}

export async function fetchPrice(symbol) {
  const base = await findBase();
  const r = await fetch(`${base}/ticker/price?symbol=${symbol}`);
  if (!r.ok) throw new Error(`Binance price ${r.status}`);
  const d = await r.json();
  return parseFloat(d.price);
}

// WebSocket live kline feed
export async function subscribeKline(symbol, interval, onCandle, onError) {
  const wsHost = await findWSHost();
  let ws;
  let closed = false;

  const connect = () => {
    ws = new WebSocket(`${wsHost}/${symbol.toLowerCase()}@kline_${interval}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.e === "kline") {
          const k = msg.k;
          onCandle({
            time:   k.t, open:   parseFloat(k.o), high:   parseFloat(k.h),
            low:    parseFloat(k.l), close:  parseFloat(k.c), volume: parseFloat(k.v),
            closed: k.x,
          });
        }
      } catch {}
    };
    ws.onerror = (e) => { if (!closed) onError?.(e); };
    ws.onclose = () => {
      if (!closed) {
        // Try .us fallback if .com failed
        if (wsHost === WS_HOSTS[0]) {
          workingWS = WS_HOSTS[1];
          setTimeout(connect, 1000);
        }
      }
    };
  };

  connect();
  return () => { closed = true; ws?.close(); };
}

// Ticker stream for multiple symbols
export async function subscribeTicker(symbols, onTick) {
  const wsHost = await findWSHost();
  const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join("/");
  let closed = false;
  const ws = new WebSocket(`${wsHost.replace("/ws","")}/stream?streams=${streams}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const d = msg.data;
      if (d?.s) onTick({ symbol: d.s, price: parseFloat(d.c), change: parseFloat(d.P) });
    } catch {}
  };
  ws.onclose = () => {};
  return () => { closed = true; ws.close(); };
}
