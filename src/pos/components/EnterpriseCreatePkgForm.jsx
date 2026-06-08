import { Btn, Card } from "./ui";
import { C } from "../constants/colors";
import { useState } from "react";

function EnterpriseCreatePkgForm({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [serviceCategory, setServiceCategory] = useState("Boarding");
  const [selectedServices, setSelectedServices] = useState([]);
  const [packageType, setPackageType] = useState("standard");
  const [quantity, setQuantity] = useState(10);
  const [buyQty, setBuyQty] = useState(1);
  const [freeQty, setFreeQty] = useState(1);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [expirationType, setExpirationType] = useState("relative");
  const [expirationDays, setExpirationDays] = useState(180);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [availableOnline, setAvailableOnline] = useState(true);

  const serviceOptions = {
    "Boarding": ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"],
    "Daycare": ["Full Day Daycare", "Half Day Daycare", "Day Boarding"],
    "Add-Ons": ["Standard Bath", "Hypo Bath", "Medicated Bath", "Whitening Bath"]
  };

  const unitLabel = serviceCategory === "Boarding" ? "night" : serviceCategory === "Daycare" ? "day" : "unit";
  const unitLabelPlural = unitLabel === "night" ? "Nights" : unitLabel === "day" ? "Days" : "Coupons";
  const svcNames = selectedServices.length > 0 ? selectedServices.join(" + ") : serviceCategory;
  const effectiveQty = packageType === "bogo" ? (quantity * 2) : packageType === "buyXgetY" ? (buyQty + freeQty) : packageType === "freeNight" ? 1 : quantity;

  const autoName = packageType === "bogo" ? `BOGO: Buy ${quantity}, Get ${quantity} Free — ${svcNames}` :
    packageType === "buyXgetY" ? `Buy ${buyQty} Get ${freeQty} Free — ${svcNames}` :
    packageType === "freeNight" ? `Free ${unitLabel === "night" ? "Night" : "Session"} Coupon — ${svcNames}` :
    discountType === "percent" && discountValue > 0
      ? `${discountValue}% Off ${quantity} ${svcNames} ${unitLabelPlural}`
      : `${quantity} ${svcNames} ${unitLabelPlural}`;

  const autoDesc = packageType === "freeNight"
    ? `One complimentary ${unitLabel} of ${svcNames}. ${expirationType === "relative" ? `Expires ${expirationDays} days after purchase.` : "No expiration."}`
    : `Enterprise package: ${packageType === "bogo" ? `Buy ${quantity}, get ${quantity} free` : packageType === "buyXgetY" ? `Buy ${buyQty}, get ${freeQty} free` : discountType === "percent" ? discountValue + "% off" : "$" + discountValue + " off"} for ${effectiveQty} ${unitLabelPlural.toLowerCase()} of ${svcNames}. Pricing is calculated dynamically per location. ${expirationType === "relative" ? `Expires ${expirationDays} days after purchase.` : "No expiration."}`;

  const handleCreate = () => {
    if (selectedServices.length === 0) return;
    const pkg = {
      name: name || autoName,
      description: description || autoDesc,
      serviceCategory,
      serviceName: selectedServices.join(" + "),
      serviceNames: selectedServices,
      packageType,
      quantity: packageType === "bogo" ? quantity : packageType === "buyXgetY" ? buyQty : packageType === "freeNight" ? 1 : quantity,
      buyQty: packageType === "buyXgetY" ? buyQty : packageType === "bogo" ? quantity : undefined,
      freeQty: packageType === "buyXgetY" ? freeQty : packageType === "bogo" ? quantity : packageType === "freeNight" ? 1 : undefined,
      discountType: packageType === "standard" ? discountType : "smart",
      discountValue: packageType === "standard" ? discountValue : 0,
      expirationType, expirationDays: expirationType === "relative" ? expirationDays : null,
      availableOnline,
    };
    onSave(pkg);
  };

  return (
    <div>
      {step === 1 && (
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:16}}>Step 1: Select Services</div>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {Object.keys(serviceOptions).map(cat => (
              <button key={cat} onClick={() => { setServiceCategory(cat); setSelectedServices([]); }}
                style={{flex:1,padding:"10px 16px",border:`2px solid ${serviceCategory === cat ? C.acc : C.border}`,background:serviceCategory === cat ? C.accLt : "transparent",borderRadius:8,fontWeight:600,cursor:"pointer",color:C.text,fontSize:13,transition:"all 0.2s"}}>{cat}</button>
            ))}
          </div>
          <div style={{fontSize:12,color:C.textMut,marginBottom:8}}>Select one or more services to bundle into this package:</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:24}}>
            {(serviceOptions[serviceCategory] || []).map(svc => {
              const isSel = selectedServices.includes(svc);
              return (
                <Card key={svc} onClick={() => setSelectedServices(prev => isSel ? prev.filter(s => s !== svc) : [...prev, svc])} hoverable
                  style={{padding:16,cursor:"pointer",border:`2px solid ${isSel ? C.acc : C.border}`,background:isSel ? C.accLt : "transparent",textAlign:"center",position:"relative"}}>
                  {isSel && <span style={{position:"absolute",top:6,right:8,fontSize:14,color:C.acc}}>✓</span>}
                  <div style={{fontWeight:600,color:C.text}}>{svc}</div>
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>per {unitLabel}</div>
                </Card>
              );
            })}
          </div>
          {selectedServices.length > 1 && (
            <div style={{padding:"8px 14px",background:C.priLt,borderRadius:8,marginBottom:16,fontSize:13,color:C.pri,fontWeight:600}}>
              Bundle: {selectedServices.join(" + ")}
            </div>
          )}
          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={onCancel} variant="secondary">Cancel</Btn>
            <Btn onClick={() => setStep(2)} variant="primary" disabled={selectedServices.length === 0}>Next</Btn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:16}}>Step 2: Package Type</div>
          <div style={{marginBottom:20,padding:12,background:C.priLt,borderRadius:8}}>
            <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Selected Service{selectedServices.length > 1 ? "s" : ""}</div>
            <div style={{fontSize:16,fontWeight:600,color:C.text}}>{selectedServices.join(" + ")}</div>
          </div>
          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Package Type</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {[
                { id: "standard", label: "Standard", desc: "Set custom qty + discount" },
                { id: "bogo", label: "BOGO", desc: "Buy 1, get 1 free" },
                { id: "buyXgetY", label: "Buy X Get Y", desc: "Buy X, get Y free" },
                { id: "freeNight", label: "Free Coupon", desc: "Single free night/session" },
              ].map(t => (
                <button key={t.id} onClick={() => setPackageType(t.id)} style={{
                  padding:"10px 8px",border:`2px solid ${packageType === t.id ? C.acc : C.border}`,
                  background:packageType === t.id ? C.accLt : "transparent",borderRadius:8,cursor:"pointer",
                  textAlign:"center",fontFamily:"inherit",transition:"all 0.15s"
                }}>
                  <div style={{fontSize:13,fontWeight:700,color:packageType === t.id ? C.acc : C.text}}>{t.label}</div>
                  <div style={{fontSize:10,color:C.textMut,marginTop:2}}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {packageType === "bogo" && (
            <div style={{marginBottom:24}}>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Customer Buys (gets same amount free)</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                <input type="text" inputMode="numeric" value={quantity} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setQuantity(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!quantity || quantity < 1) setQuantity(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                <button onClick={() => setQuantity(quantity + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
              </div>
              <div style={{marginTop:12,padding:12,background:C.sucLt,borderRadius:8,fontSize:13,color:C.suc,fontWeight:600}}>
                Buy {quantity}, get {quantity} free = {quantity * 2} total units
              </div>
            </div>
          )}

          {packageType === "buyXgetY" && (
            <div style={{marginBottom:24}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Customer Buys</label>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={() => setBuyQty(Math.max(1, buyQty - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                    <input type="text" inputMode="numeric" value={buyQty} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setBuyQty(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!buyQty || buyQty < 1) setBuyQty(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                    <button onClick={() => setBuyQty(buyQty + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
                  </div>
                </div>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Gets Free</label>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={() => setFreeQty(Math.max(1, freeQty - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                    <input type="text" inputMode="numeric" value={freeQty} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setFreeQty(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!freeQty || freeQty < 1) setFreeQty(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                    <button onClick={() => setFreeQty(freeQty + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
                  </div>
                </div>
              </div>
              <div style={{marginTop:12,padding:12,background:C.sucLt,borderRadius:8,fontSize:13,color:C.suc,fontWeight:600}}>
                Buy {buyQty}, get {freeQty} free = {buyQty + freeQty} total units
              </div>
            </div>
          )}

          {packageType === "freeNight" && (
            <div style={{marginBottom:24}}>
              <div style={{padding:16,background:C.sucLt,borderRadius:8,border:`1px solid ${C.suc}30`}}>
                <div style={{fontSize:15,fontWeight:700,color:C.suc,marginBottom:4}}>Free {unitLabel === "night" ? "Night" : "Session"} Coupon</div>
                <div style={{fontSize:13,color:C.text}}>This package gives the customer 1 complimentary {unitLabel} of {selectedServices.join(" + ")}.</div>
              </div>
            </div>
          )}

          {packageType === "standard" && (
            <>
              <div style={{marginBottom:24}}>
                <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Quantity</label>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                  <input type="text" inputMode="numeric" value={quantity} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setQuantity(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!quantity || quantity < 1) setQuantity(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                  <button onClick={() => setQuantity(quantity + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
                  <span style={{marginLeft:"auto",fontSize:14,color:C.textMut}}>Unit: {unitLabel}</span>
                </div>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Discount (applied dynamically per location's rates)</label>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["percent","% Off"],["fixed","$ Off"]].map(([type,label]) => (
                    <button key={type} onClick={() => setDiscountType(type)} style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1.5px solid ${discountType === type ? C.pri : C.border}`,background:discountType === type ? C.priLt : "transparent",color:discountType === type ? C.pri : C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="number" value={discountValue} onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))} style={{width:100,padding:"8px 12px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:14}} className="no-focus-ring" />
                  <span style={{fontSize:13,color:C.textMut}}>{discountType === "percent" ? "%" : "$ per unit"}</span>
                </div>
              </div>
            </>
          )}

          <Card style={{padding:12,background:C.bg,marginBottom:20}}>
            <div style={{fontSize:12,color:C.textMut,fontStyle:"italic"}}>Note: Actual package pricing will be calculated from each location's rates when pushed. For example, if a location charges $45/day for daycare and you set 10% off, the package price will be calculated accordingly at that location.</div>
          </Card>
          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={() => setStep(1)} variant="secondary">Back</Btn>
            <Btn onClick={() => setStep(3)} variant="primary">Next</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:16}}>Step 3: Expiration</div>
          {[
            { type: "relative", label: "Relative to purchase" },
            { type: "none", label: "No expiration" }
          ].map(opt => (
            <div key={opt.type} style={{marginBottom:12,padding:12,border:`1px solid ${expirationType === opt.type ? C.acc : C.border}`,borderRadius:8,cursor:"pointer",background:expirationType === opt.type ? C.accLt : "transparent"}} onClick={() => setExpirationType(opt.type)}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:opt.type === "relative" && expirationType === "relative" ? 8 : 0}}>
                <input type="radio" checked={expirationType === opt.type} onChange={() => setExpirationType(opt.type)} />
                <span style={{fontWeight:600,fontSize:13,color:C.text}}>{opt.label}</span>
              </div>
              {opt.type === "relative" && expirationType === "relative" && (
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="number" value={expirationDays} onChange={e => setExpirationDays(Math.max(1, parseInt(e.target.value) || 90))} style={{width:80,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12}} className="no-focus-ring" />
                  <span style={{fontSize:12,color:C.textMut}}>days after purchase</span>
                </div>
              )}
            </div>
          ))}
          <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:16}}>
            <Btn onClick={() => setStep(2)} variant="secondary">Back</Btn>
            <Btn onClick={() => setStep(4)} variant="primary">Next</Btn>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:16}}>Step 4: Name & Details</div>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Package Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={autoName} style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:14}} className="no-focus-ring" />
          </div>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={autoDesc} rows={3} style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:14,fontFamily:"inherit",resize:"vertical"}} className="no-focus-ring" />
          </div>
          <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
            <input type="checkbox" checked={availableOnline} onChange={e => setAvailableOnline(e.target.checked)} id="ent-online" style={{cursor:"pointer"}} />
            <label htmlFor="ent-online" style={{cursor:"pointer",fontSize:13,fontWeight:500,color:C.text}}>Available for online purchase</label>
          </div>
          <Card style={{marginBottom:20,padding:16,background:C.bg}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Summary</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12}}>
              <div><span style={{color:C.textMut}}>Service:</span> <span style={{fontWeight:600}}>{selectedServices.join(" + ")}</span></div>
              <div><span style={{color:C.textMut}}>Type:</span> <span style={{fontWeight:600}}>{packageType === "bogo" ? "BOGO" : packageType === "buyXgetY" ? "Buy X Get Y" : packageType === "freeNight" ? "Free Coupon" : "Standard"}</span></div>
              {packageType === "bogo" && <div><span style={{color:C.textMut}}>Qty:</span> <span style={{fontWeight:600}}>Buy {quantity}, get {quantity} free</span></div>}
              {packageType === "buyXgetY" && <div><span style={{color:C.textMut}}>Qty:</span> <span style={{fontWeight:600}}>Buy {buyQty}, get {freeQty} free</span></div>}
              {packageType === "freeNight" && <div><span style={{color:C.textMut}}>Qty:</span> <span style={{fontWeight:600}}>1 free {unitLabel}</span></div>}
              {packageType === "standard" && <div><span style={{color:C.textMut}}>Qty:</span> <span style={{fontWeight:600}}>{quantity} {unitLabelPlural.toLowerCase()}</span></div>}
              {packageType === "standard" && <div><span style={{color:C.textMut}}>Discount:</span> <span style={{fontWeight:600}}>{discountType === "percent" ? `${discountValue}%` : `$${discountValue}`} off</span></div>}
              <div><span style={{color:C.textMut}}>Expires:</span> <span style={{fontWeight:600}}>{expirationType === "relative" ? `${expirationDays} days` : "Never"}</span></div>
              <div style={{gridColumn:"1/-1"}}><span style={{color:C.textMut}}>Pricing:</span> <span style={{fontWeight:600,fontStyle:"italic"}}>Dynamic — calculated per location's rates</span></div>
            </div>
          </Card>
          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={() => setStep(3)} variant="secondary">Back</Btn>
            <Btn onClick={handleCreate} variant="primary">Create Package</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export { EnterpriseCreatePkgForm };
