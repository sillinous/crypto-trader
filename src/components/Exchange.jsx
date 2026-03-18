import React, { useState, useEffect } from "react";
import { CryptoCom, loadExchangeSettings, saveExchangeSettings } from "../cryptodotcom.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8", blue:"#3b82f6" };
const Row = ({label,value,color}) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}22`,fontSize:12}}>
    <span style={{color:T.mute}}>{label}</span>
    <span style={{color:color||T.text,fontWeight:600}}>{value}</span>
  </div>
);

export default function Exchange() {
  const [settings, setSettings] = useState(loadExchangeSettings());
  const [balance, setBalance] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("balance");
  const [paperOrders, setPaperOrders] = useState([]);

  // Order form
  const [orderForm, setOrderForm] = useState({ instrument:"BTC_USDT", side:"BUY", type:"MARKET", quantity:"0.001", price:"" });
  const [orderStatus, setOrderStatus] = useState(null);

  const save = () => { saveExchangeSettings(settings); setError(null); };

  const loadBalance = async () => {
    if (!settings.apiKey || !settings.secret) return;
    setLoading(true); setError(null);
    try {
      const res = await CryptoCom.getBalance(settings.apiKey, settings.secret);
      setBalance(res);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const loadOrders = async () => {
    if (!settings.apiKey || !settings.secret) return;
    try {
      const res = await CryptoCom.getOpenOrders(settings.apiKey, settings.secret);
      setOrders(res?.order_list || []);
    } catch(e) { setError(e.message); }
  };

  const loadHistory = async () => {
    if (!settings.apiKey || !settings.secret) return;
    try {
      const res = await CryptoCom.getOrderHistory(settings.apiKey, settings.secret, orderForm.instrument);
      setOrderHistory(res?.order_list || []);
    } catch(e) { setError(e.message); }
  };

  const placeOrder = async () => {
    setOrderStatus(null);
    if (settings.paperMode) {
      const ticker = await CryptoCom.getTicker(orderForm.instrument).catch(() => ({ data: { a: orderForm.price || "0" } }));
      const price = parseFloat(ticker?.data?.a || orderForm.price || 0);
      const filled = CryptoCom.paperTrade({ ...orderForm, quantity: parseFloat(orderForm.quantity) }, price);
      setPaperOrders(prev => [filled, ...prev].slice(0, 50));
      setOrderStatus({ ok:true, msg:`📋 PAPER: ${filled.side} ${filled.quantity} ${filled.instrument_name} @ $${filled.price.toFixed(2)} — filled` });
    } else {
      if (!settings.apiKey || !settings.secret) { setOrderStatus({ok:false,msg:"No API key configured"}); return; }
      try {
        const res = await CryptoCom.createOrder(settings.apiKey, settings.secret, { ...orderForm, quantity: parseFloat(orderForm.quantity), price: parseFloat(orderForm.price)||undefined });
        setOrderStatus({ ok:true, msg:`✅ Order ${res?.order_id} placed — ${orderForm.side} ${orderForm.quantity} ${orderForm.instrument}` });
        loadOrders();
      } catch(e) { setOrderStatus({ ok:false, msg:`❌ ${e.message}` }); }
    }
  };

  const cancelOrder = async (orderId, instrument) => {
    try { await CryptoCom.cancelOrder(settings.apiKey, settings.secret, orderId, instrument); loadOrders(); }
    catch(e) { setError(e.message); }
  };

  useEffect(() => { if (settings.apiKey) { loadBalance(); loadOrders(); } }, []);

  const Input = ({label,value,onChange,type="text",placeholder}) => (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:10,color:T.mute,marginBottom:3}}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
    </div>
  );

  return (
    <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
      {/* Left: settings + order form */}
      <div>
        {/* Settings */}
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:T.amber,marginBottom:10}}>⚙️ Exchange Settings</div>
          <Input label="API Key" value={settings.apiKey} onChange={v=>setSettings(s=>({...s,apiKey:v}))} placeholder="crypto.com API key" />
          <Input label="API Secret" value={settings.secret} onChange={v=>setSettings(s=>({...s,secret:v}))} type="password" placeholder="crypto.com API secret" />
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <input type="checkbox" checked={settings.paperMode} onChange={e=>setSettings(s=>({...s,paperMode:e.target.checked}))} id="paper" />
            <label htmlFor="paper" style={{fontSize:12,color:settings.paperMode?T.amber:T.mute,cursor:"pointer"}}>
              📋 Paper Trading Mode {settings.paperMode && "(no real orders)"}
            </label>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{flex:1,padding:"7px",borderRadius:6,background:T.amber,color:"#000",border:"none",cursor:"pointer",fontWeight:700,fontSize:12}}>Save</button>
            <button onClick={()=>{loadBalance();loadOrders();}} disabled={loading||!settings.apiKey} style={{flex:1,padding:"7px",borderRadius:6,background:"rgba(255,255,255,0.07)",color:T.text,border:"none",cursor:"pointer",fontSize:12}}>Refresh</button>
          </div>
        </div>

        {/* Place Order */}
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:10}}>🛒 Place Order {settings.paperMode && <span style={{color:T.amber,fontSize:10}}>(PAPER)</span>}</div>
          <Input label="INSTRUMENT" value={orderForm.instrument} onChange={v=>setOrderForm(f=>({...f,instrument:v}))} placeholder="BTC_USDT" />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,color:T.mute,marginBottom:3}}>SIDE</div>
              <select value={orderForm.side} onChange={e=>setOrderForm(f=>({...f,side:e.target.value}))}
                style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:orderForm.side==="BUY"?T.green:T.red,fontSize:12,width:"100%"}}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:T.mute,marginBottom:3}}>TYPE</div>
              <select value={orderForm.type} onChange={e=>setOrderForm(f=>({...f,type:e.target.value}))}
                style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12,width:"100%"}}>
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
              </select>
            </div>
          </div>
          <Input label="QUANTITY" value={orderForm.quantity} onChange={v=>setOrderForm(f=>({...f,quantity:v}))} type="number" />
          {orderForm.type==="LIMIT" && <Input label="PRICE ($)" value={orderForm.price} onChange={v=>setOrderForm(f=>({...f,price:v}))} type="number" />}
          {orderStatus && (
            <div style={{padding:"7px 10px",borderRadius:6,marginBottom:8,fontSize:11,
              background:orderStatus.ok?`${T.green}15`:`${T.red}15`,color:orderStatus.ok?T.green:T.red,border:`1px solid ${orderStatus.ok?T.green:T.red}33`}}>
              {orderStatus.msg}
            </div>
          )}
          <button onClick={placeOrder} style={{width:"100%",padding:"9px",borderRadius:7,background:orderForm.side==="BUY"?T.green:T.red,color:"#000",border:"none",cursor:"pointer",fontWeight:800,fontSize:13}}>
            {orderForm.side} {orderForm.instrument}
          </button>
        </div>
      </div>

      {/* Right: balance + orders */}
      <div>
        {error && <div style={{padding:10,borderRadius:7,background:`${T.red}15`,border:`1px solid ${T.red}33`,color:T.red,fontSize:12,marginBottom:12}}>❌ {error}</div>}

        {/* Tabs */}
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.border}`,marginBottom:12}}>
          {["balance","open","history","paper"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);if(t==="history")loadHistory();}} style={{padding:"7px 16px",background:"none",border:"none",borderBottom:tab===t?`2px solid ${T.amber}`:"2px solid transparent",color:tab===t?T.text:T.mute,cursor:"pointer",fontSize:12,fontWeight:tab===t?700:400,textTransform:"capitalize"}}>
              {t==="open"?"Open Orders":t==="history"?"Order History":t==="paper"?"Paper Orders":t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {tab==="balance" && (
          loading ? <div style={{color:T.mute,fontSize:12}}>Loading balance...</div>
          : !balance ? <div style={{color:T.mute,fontSize:12,textAlign:"center",padding:40}}>
              {settings.apiKey?"Click Refresh to load balance":"Configure API keys to see balance"}
            </div>
          : (
            <div>
              {(balance.accounts||[]).filter(a=>parseFloat(a.balance)>0).map(a=>(
                <div key={a.currency} style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:12,marginBottom:8,border:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:700,fontSize:14,color:T.text}}>{a.currency}</span>
                    <span style={{fontSize:16,fontWeight:800,color:T.green}}>{parseFloat(a.balance).toFixed(6)}</span>
                  </div>
                  <div style={{display:"flex",gap:20,marginTop:4}}>
                    <span style={{fontSize:11,color:T.mute}}>Available: <span style={{color:T.sub}}>{parseFloat(a.available||a.balance).toFixed(6)}</span></span>
                    <span style={{fontSize:11,color:T.mute}}>Order: <span style={{color:T.sub}}>{parseFloat(a.order||0).toFixed(6)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab==="open" && (
          <div>
            {orders.length===0 ? <div style={{color:T.mute,fontSize:12,textAlign:"center",padding:40}}>No open orders</div>
            : orders.map(o=>(
              <div key={o.order_id} style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:12,marginBottom:8,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:12,color:o.side==="BUY"?T.green:T.red}}>{o.side} {o.instrument_name}</div>
                  <div style={{fontSize:11,color:T.mute}}>{o.type} · Qty: {o.quantity} · ${parseFloat(o.price||0).toFixed(2)}</div>
                </div>
                <button onClick={()=>cancelOrder(o.order_id,o.instrument_name)}
                  style={{padding:"5px 10px",borderRadius:5,background:`${T.red}22`,border:`1px solid ${T.red}44`,color:T.red,cursor:"pointer",fontSize:11}}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        {tab==="history" && (
          <div style={{maxHeight:400,overflowY:"auto"}}>
            {orderHistory.length===0 ? <div style={{color:T.mute,fontSize:12,textAlign:"center",padding:40}}>No order history</div>
            : orderHistory.map(o=>(
              <div key={o.order_id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}22`,fontSize:11}}>
                <div>
                  <span style={{color:o.side==="BUY"?T.green:T.red,fontWeight:700}}>{o.side}</span>
                  <span style={{color:T.text,marginLeft:8}}>{o.instrument_name}</span>
                  <span style={{color:T.mute,marginLeft:8}}>{o.type}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:T.text}}>${parseFloat(o.avg_price||o.price||0).toFixed(2)}</div>
                  <div style={{color:T.mute}}>{o.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="paper" && (
          <div>
            <div style={{fontSize:11,color:T.amber,marginBottom:10}}>📋 Paper trades are simulated — no real money involved</div>
            {paperOrders.length===0 ? <div style={{color:T.mute,fontSize:12,textAlign:"center",padding:40}}>No paper trades yet — place an order with Paper Mode ON</div>
            : paperOrders.map(o=>(
              <div key={o.order_id} style={{background:"rgba(255,165,0,0.04)",borderRadius:8,padding:12,marginBottom:8,border:`1px solid ${T.amber}22`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <span style={{fontWeight:700,color:o.side==="BUY"?T.green:T.red}}>{o.side}</span>
                  <span style={{color:T.text,marginLeft:8}}>{o.instrument_name}</span>
                </div>
                <div style={{textAlign:"right",fontSize:11}}>
                  <div style={{color:T.text}}>@ ${parseFloat(o.price).toFixed(2)}</div>
                  <div style={{color:T.mute}}>qty: {o.quantity} · fee: ${o.fee?.toFixed(4)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
