// crypto.com Exchange API v2 — browser-side HMAC-SHA256 signing

const BASE = "https://api.crypto.com/exchange/v1";

async function sign(apiKey, secret, method, id, params = {}) {
  const nonce = Date.now();
  const paramStr = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
  const sigPayload = `${method}${id}${apiKey}${paramStr}${nonce}`;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(sigPayload));
  const hexSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

  return { id, method, api_key: apiKey, params, nonce, sig: hexSig };
}

async function post(apiKey, secret, method, params = {}) {
  const id = Math.floor(Math.random() * 1e9);
  const body = await sign(apiKey, secret, method, id, params);
  const r = await fetch(`${BASE}/private/${method.replace("private/", "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (data.code !== 0) throw new Error(data.message || `API error ${data.code}`);
  return data.result;
}

async function getPublic(endpoint) {
  const r = await fetch(`${BASE}/public/${endpoint}`);
  const data = await r.json();
  if (data.code !== 0) throw new Error(data.message || `API error ${data.code}`);
  return data.result;
}

export const CryptoCom = {
  async getBalance(apiKey, secret) {
    return post(apiKey, secret, "private/get-account-summary");
  },

  async getOpenOrders(apiKey, secret, instrumentName) {
    return post(apiKey, secret, "private/get-open-orders", instrumentName ? { instrument_name: instrumentName } : {});
  },

  async getOrderHistory(apiKey, secret, instrumentName, limit = 20) {
    return post(apiKey, secret, "private/get-order-history", { instrument_name: instrumentName, count: limit });
  },

  async createOrder(apiKey, secret, { instrument, side, type, quantity, price }) {
    const params = { instrument_name: instrument, side: side.toUpperCase(), type: type.toUpperCase(), quantity: String(quantity) };
    if (type.toUpperCase() === "LIMIT" && price) params.price = String(price);
    return post(apiKey, secret, "private/create-order", params);
  },

  async cancelOrder(apiKey, secret, orderId, instrumentName) {
    return post(apiKey, secret, "private/cancel-order", { order_id: orderId, instrument_name: instrumentName });
  },

  async getTicker(instrumentName) {
    return getPublic(`get-ticker?instrument_name=${instrumentName}`);
  },

  async getInstruments() {
    return getPublic("get-instruments");
  },

  // Paper trading simulation
  paperTrade(order, currentPrice) {
    const id = `PAPER_${Date.now()}`;
    const fillPrice = order.type === "MARKET" ? currentPrice : parseFloat(order.price);
    return {
      order_id: id,
      status: "FILLED",
      instrument_name: order.instrument,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      price: fillPrice,
      avg_price: fillPrice,
      fee: fillPrice * parseFloat(order.quantity) * 0.001,
      created_at: Date.now(),
      _paper: true,
    };
  }
};

export function loadExchangeSettings() {
  return {
    apiKey: localStorage.getItem("ct_cdc_key") || "",
    secret: localStorage.getItem("ct_cdc_secret") || "",
    paperMode: localStorage.getItem("ct_paper_mode") !== "false",
  };
}

export function saveExchangeSettings({ apiKey, secret, paperMode }) {
  localStorage.setItem("ct_cdc_key",    apiKey);
  localStorage.setItem("ct_cdc_secret", secret);
  localStorage.setItem("ct_paper_mode", String(paperMode));
}
