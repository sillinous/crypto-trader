import React, { useState } from "react";
import { INDICATOR_OPTIONS, saveStrategy, loadStrategies, deleteStrategy, DEFAULT_STRATEGY } from "../strategy.js";

const T = { bg:"#0d0d0f", panel:"#13141a", border:"#1e2030", green:"#00c896", red:"#ef4444", blue:"#3b82f6", amber:"#f59e0b", text:"#e2e8f0", mute:"#475569", sub:"#94a3b8" };

const PRESETS = [
  { name:"RSI Oversold Bounce", buyRules:[{indicator:"RSI",condition:"below",threshold:30,params:{period:14}}], sellRules:[{indicator:"RSI",condition:"above",threshold:70,params:{period:14}}], stopLossPct:2, takeProfitPct:6, positionSizePct:95 },
  { name:"EMA Golden Cross", buyRules:[{indicator:"EMA",condition:"above",threshold:0,params:{period:9}}], sellRules:[{indicator:"EMA",condition:"below",threshold:0,params:{period:9}}], stopLossPct:1.5, takeProfitPct:4, positionSizePct:90 },
  { name:"Bollinger Squeeze", buyRules:[{indicator:"BB_PCT",condition:"below",threshold:10}], sellRules:[{indicator:"BB_PCT",condition:"above",threshold:90}], stopLossPct:2, takeProfitPct:5, positionSizePct:90 },
  { name:"MACD Momentum", buyRules:[{indicator:"MACD",condition:"above",threshold:0}], sellRules:[{indicator:"MACD",condition:"below",threshold:0}], stopLossPct:2.5, takeProfitPct:7, positionSizePct:95 },
  { name:"Stochastic Reversal", buyRules:[{indicator:"STOCH_K",condition:"below",threshold:20}], sellRules:[{indicator:"STOCH_K",condition:"above",threshold:80}], stopLossPct:2, takeProfitPct:5, positionSizePct:90 },
];

function RuleEditor({ rule, onChange, onDelete, index, type }) {
  return (
    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:10,marginBottom:6,border:`1px solid ${T.border}`,
      borderLeft:`3px solid ${type==="buy"?T.green:T.red}`}}>
      <div style={{display:"flex",gap:6,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:"1 1 130px"}}>
          <div style={{fontSize:9,color:T.mute,marginBottom:2}}>INDICATOR</div>
          <select value={rule.indicator} onChange={e=>onChange({...rule,indicator:e.target.value})}
            style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 8px",color:T.text,fontSize:11,width:"100%"}}>
            {INDICATOR_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div style={{flex:"0 0 90px"}}>
          <div style={{fontSize:9,color:T.mute,marginBottom:2}}>CONDITION</div>
          <select value={rule.condition} onChange={e=>onChange({...rule,condition:e.target.value})}
            style={{background:"#1a1b25",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 8px",color:T.text,fontSize:11,width:"100%"}}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
        </div>
        <div style={{flex:"0 0 70px"}}>
          <div style={{fontSize:9,color:T.mute,marginBottom:2}}>VALUE</div>
          <input type="number" value={rule.threshold} onChange={e=>onChange({...rule,threshold:parseFloat(e.target.value)||0})}
            style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 8px",color:T.text,fontSize:11,width:"100%"}}/>
        </div>
        <button onClick={onDelete} title="Remove rule"
          style={{padding:"5px 9px",borderRadius:5,background:`${T.red}18`,border:`1px solid ${T.red}33`,color:T.red,cursor:"pointer",fontSize:12,flexShrink:0}}>
          ✕
        </button>
      </div>
      {/* Indicator hint */}
      <div style={{fontSize:9,color:T.mute,marginTop:4}}>
        {rule.indicator==="RSI"    && "RSI(14): typical ranges 30=oversold, 70=overbought"}
        {rule.indicator==="BB_PCT" && "BB%: 0=at lower band, 100=at upper band"}
        {rule.indicator==="STOCH_K"&& "Stoch %K: 20=oversold, 80=overbought"}
        {rule.indicator==="MACD"   && "MACD histogram: >0 = bullish momentum, <0 = bearish"}
        {rule.indicator==="PRICE"  && "Raw price comparison — enter USD price"}
      </div>
    </div>
  );
}

export default function StrategyBuilder({ strategy, setStrategy, onRun, onRefine }) {
  const [saved, setSaved] = useState(false);
  const [savedStrategies, setSavedStrategies] = useState(loadStrategies);
  const [showPresets, setShowPresets] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const addRule = (type) => {
    const rule = { indicator:"RSI", condition: type==="buy"?"below":"above", threshold:type==="buy"?30:70, params:{period:14} };
    if (type==="buy") setStrategy(s=>({...s,buyRules:[...s.buyRules,rule]}));
    else setStrategy(s=>({...s,sellRules:[...s.sellRules,rule]}));
  };
  const updateRule = (type,idx,rule) => {
    if (type==="buy") setStrategy(s=>({...s,buyRules:s.buyRules.map((r,i)=>i===idx?rule:r)}));
    else setStrategy(s=>({...s,sellRules:s.sellRules.map((r,i)=>i===idx?rule:r)}));
  };
  const deleteRule = (type,idx) => {
    if (type==="buy") setStrategy(s=>({...s,buyRules:s.buyRules.filter((_,i)=>i!==idx)}));
    else setStrategy(s=>({...s,sellRules:s.sellRules.filter((_,i)=>i!==idx)}));
  };

  const save = () => {
    const id = strategy.id || `strat_${Date.now()}`;
    saveStrategy({...strategy, id});
    setStrategy(s=>({...s,id}));
    setSavedStrategies(loadStrategies());
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  const loadPreset = (preset) => {
    setStrategy(s => ({...s, ...preset, id:`preset_${Date.now()}`}));
    setShowPresets(false);
  };

  const loadSaved = (s) => {
    setStrategy(s);
    setShowSaved(false);
  };

  const removeSaved = (id, e) => {
    e.stopPropagation();
    deleteStrategy(id);
    setSavedStrategies(loadStrategies());
  };

  const RiskSlider = ({ label, val, setVal, min, max, step, color, format }) => {
    const pct = ((val - min) / (max - min)) * 100;
    return (
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <div style={{fontSize:10,color:T.mute}}>{label}</div>
          <div style={{fontSize:12,fontWeight:800,color:color}}>{format ? format(val) : val}</div>
        </div>
        <input type="range" min={min} max={max} step={step} value={val}
          onChange={e=>setVal(parseFloat(e.target.value))}
          style={{width:"100%",accentColor:color}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.mute,marginTop:2}}>
          <span>{min}</span><span>{max}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header + presets */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={strategy.name} onChange={e=>setStrategy(s=>({...s,name:e.target.value}))}
          placeholder="Strategy name..."
          style={{flex:1,minWidth:200,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 12px",color:T.text,fontSize:14,fontWeight:700}}/>
        <button onClick={()=>setShowPresets(p=>!p)}
          style={{padding:"7px 14px",borderRadius:7,background:`${T.blue}18`,border:`1px solid ${T.blue}33`,color:T.blue,cursor:"pointer",fontSize:11,fontWeight:700}}>
          📋 Presets
        </button>
        <button onClick={()=>setShowSaved(p=>!p)}
          style={{padding:"7px 14px",borderRadius:7,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.mute,cursor:"pointer",fontSize:11,fontWeight:700}}>
          📁 Saved ({savedStrategies.length})
        </button>
      </div>

      {/* Preset grid */}
      {showPresets && (
        <div style={{background:"rgba(59,130,246,0.05)",borderRadius:10,padding:12,border:`1px solid ${T.blue}22`,marginBottom:14}}>
          <div style={{fontSize:11,color:T.blue,fontWeight:700,marginBottom:8}}>Choose a preset strategy:</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6}}>
            {PRESETS.map(p=>(
              <button key={p.name} onClick={()=>loadPreset(p)}
                style={{padding:"8px 10px",borderRadius:7,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,color:T.text,cursor:"pointer",fontSize:11,textAlign:"left",fontWeight:600}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved strategies */}
      {showSaved && (
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:12,border:`1px solid ${T.border}`,marginBottom:14}}>
          {savedStrategies.length === 0 ? (
            <div style={{color:T.mute,fontSize:11}}>No saved strategies yet</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {savedStrategies.map(s=>(
                <div key={s.id} onClick={()=>loadSaved(s)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:7,background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{s.name}</div>
                    <div style={{fontSize:10,color:T.mute}}>{s.buyRules?.length||0} buy · {s.sellRules?.length||0} sell · SL:{s.stopLossPct}% TP:{s.takeProfitPct}%</div>
                  </div>
                  <button onClick={e=>removeSaved(s.id,e)}
                    style={{padding:"3px 8px",borderRadius:4,background:`${T.red}18`,border:`1px solid ${T.red}33`,color:T.red,cursor:"pointer",fontSize:10}}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>
        {/* Left: rules */}
        <div>
          {/* Buy rules */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green}}>🟢 ENTRY CONDITIONS <span style={{color:T.mute,fontWeight:400}}>(ALL must be true)</span></div>
              <button onClick={()=>addRule("buy")}
                style={{padding:"4px 10px",borderRadius:5,background:`${T.green}18`,border:`1px solid ${T.green}33`,color:T.green,cursor:"pointer",fontSize:10,fontWeight:700}}>
                + Add Rule
              </button>
            </div>
            {strategy.buyRules?.map((r,i)=>(
              <RuleEditor key={i} rule={r} index={i} type="buy" onChange={rule=>updateRule("buy",i,rule)} onDelete={()=>deleteRule("buy",i)}/>
            ))}
            {(!strategy.buyRules?.length) && (
              <div style={{padding:"12px",borderRadius:8,border:`1px dashed ${T.border}`,color:T.mute,fontSize:11,textAlign:"center"}}>
                No entry rules — add at least one condition to generate buy signals
              </div>
            )}
          </div>

          {/* Sell rules */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:700,color:T.red}}>🔴 EXIT CONDITIONS <span style={{color:T.mute,fontWeight:400}}>(ALL must be true)</span></div>
              <button onClick={()=>addRule("sell")}
                style={{padding:"4px 10px",borderRadius:5,background:`${T.red}18`,border:`1px solid ${T.red}33`,color:T.red,cursor:"pointer",fontSize:10,fontWeight:700}}>
                + Add Rule
              </button>
            </div>
            {strategy.sellRules?.map((r,i)=>(
              <RuleEditor key={i} rule={r} index={i} type="sell" onChange={rule=>updateRule("sell",i,rule)} onDelete={()=>deleteRule("sell",i)}/>
            ))}
            {(!strategy.sellRules?.length) && (
              <div style={{padding:"12px",borderRadius:8,border:`1px dashed ${T.border}`,color:T.mute,fontSize:11,textAlign:"center"}}>
                No exit rules — relies on stop loss / take profit only
              </div>
            )}
          </div>
        </div>

        {/* Right: risk management */}
        <div>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:14,border:`1px solid ${T.border}`,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:14}}>⚙️ RISK MANAGEMENT</div>
            <RiskSlider label="Stop Loss %" val={strategy.stopLossPct} setVal={v=>setStrategy(s=>({...s,stopLossPct:v}))}
              min={0.5} max={10} step={0.5} color={T.red} format={v=>`${v}%`}/>
            <RiskSlider label="Take Profit %" val={strategy.takeProfitPct} setVal={v=>setStrategy(s=>({...s,takeProfitPct:v}))}
              min={1} max={20} step={0.5} color={T.green} format={v=>`${v}%`}/>
            <RiskSlider label="Position Size %" val={strategy.positionSizePct} setVal={v=>setStrategy(s=>({...s,positionSizePct:v}))}
              min={10} max={100} step={5} color={T.amber} format={v=>`${v}%`}/>

            {/* R:R ratio display */}
            <div style={{padding:"8px 10px",borderRadius:7,background:"rgba(255,255,255,0.03)",marginTop:4}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span style={{color:T.mute}}>Risk:Reward</span>
                <span style={{color:T.amber,fontWeight:700}}>1:{(strategy.takeProfitPct / strategy.stopLossPct).toFixed(1)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:4}}>
                <span style={{color:T.mute}}>Break-even WR</span>
                <span style={{color:T.sub,fontWeight:700}}>{(strategy.stopLossPct / (strategy.stopLossPct + strategy.takeProfitPct) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:6,flexDirection:"column"}}>
            <div style={{display:"flex",gap:6}}>
              <button onClick={save} style={{flex:1,padding:"8px",borderRadius:7,background:T.green,color:"#000",border:"none",cursor:"pointer",fontWeight:800,fontSize:12}}>
                {saved?"✓ Saved!":"💾 Save"}
              </button>
              <button onClick={onRun} style={{flex:1,padding:"8px",borderRadius:7,background:`${T.amber}18`,border:`1px solid ${T.amber}33`,color:T.amber,cursor:"pointer",fontWeight:700,fontSize:12}}>
                ▶ Backtest
              </button>
            </div>
            {onRefine && (
              <button onClick={onRefine} style={{width:"100%",padding:"7px",borderRadius:7,background:"rgba(168,85,247,0.15)",border:"1px solid rgba(168,85,247,0.3)",color:"#a855f7",cursor:"pointer",fontWeight:700,fontSize:11}}>
                🧬 Refine with AI →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
