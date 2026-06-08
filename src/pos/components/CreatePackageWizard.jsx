import { Badge, Btn, Card, MiniDatePicker, Modal } from "./ui";
import { C } from "../constants/colors";
import { DEF_PRICING } from "../constants/pricing";
import { getAddOnPrices } from "../lib/pricing";
import { gid, todayStr } from "../lib/format";
import { useState } from "react";

function CreatePackageWizard({ data, save, onClose }) {
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("Boarding");
  const [selectedServices, setSelectedServices] = useState([]);
  const [packageType, setPackageType] = useState("standard"); // standard | bogo | buyXgetY | freeNight
  const [buyQty, setBuyQty] = useState(2);
  const [freeQty, setFreeQty] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [pricingMode, setPricingMode] = useState("discount-pct");
  const [discountPct, setDiscountPct] = useState(10);
  const [discountDollar, setDiscountDollar] = useState(0);
  const [customPrice, setCustomPrice] = useState("");
  const [expirationType, setExpirationType] = useState("relative");
  const [expirationDays, setExpirationDays] = useState(90);
  const [expirationDate, setExpirationDate] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [availableOnline, setAvailableOnline] = useState(true);

  const pricing = { ...DEF_PRICING, ...(data.pricing || {}) };

  const buildServices = () => {
    const services = [];
    if (selectedCategory === "Boarding") {
      Object.entries(pricing.boardingRates || {}).forEach(([svc, rate]) => {
        if (rate > 0) services.push({ name: svc, unitLabel: "night", rate });
      });
    } else if (selectedCategory === "Daycare") {
      if ((pricing.daycareRates?.fullDay || 0) > 0) services.push({ name: "Full Day Daycare", unitLabel: "day", rate: pricing.daycareRates.fullDay });
      if ((pricing.daycareRates?.halfDay || 0) > 0) services.push({ name: "Half Day Daycare", unitLabel: "day", rate: pricing.daycareRates.halfDay });
      if ((pricing.dayboardingRate || 0) > 0) services.push({ name: "Day Boarding", unitLabel: "day", rate: pricing.dayboardingRate });
    } else if (selectedCategory === "Add-Ons") {
      const bathTypes = ["Standard Bath", "Hypo Bath", "Medicated Bath", "Whitening Bath", "Fresh N' Clean Bath"];
      let hasBath = false;
      Object.entries(getAddOnPrices(pricing, data.addOnRules)).forEach(([key, rate]) => {
        if (bathTypes.includes(key)) {
          if (!hasBath) {
            services.push({ name: "Bath (All Types)", unitLabel: "unit", rate });
            hasBath = true;
          }
        } else if (rate > 0) {
          services.push({ name: key, unitLabel: "unit", rate });
        }
      });
    }
    return services;
  };

  const services = buildServices();
  const bundledRate = selectedServices.reduce((sum, s) => sum + (s.rate || 0), 0);

  // Compute retail/package price based on package type
  let effectiveQty = quantity;
  let retailValue, packagePrice;

  if (packageType === "bogo") {
    // Buy 1, get 1 free — customer pays for `quantity`, gets 2*quantity
    effectiveQty = quantity * 2;
    retailValue = bundledRate * effectiveQty;
    packagePrice = bundledRate * quantity;
  } else if (packageType === "buyXgetY") {
    effectiveQty = buyQty + freeQty;
    retailValue = bundledRate * effectiveQty;
    packagePrice = bundledRate * buyQty;
  } else if (packageType === "freeNight") {
    effectiveQty = 1;
    retailValue = bundledRate * 1;
    packagePrice = 0;
  } else {
    // standard
    retailValue = bundledRate * quantity;
    packagePrice = retailValue;
    if (pricingMode === "discount-pct") {
      packagePrice = retailValue * (1 - discountPct / 100);
    } else if (pricingMode === "discount-dollar") {
      packagePrice = retailValue - discountDollar;
    } else {
      packagePrice = Number(customPrice) || 0;
    }
  }

  const savings = Math.max(0, retailValue - packagePrice);
  const savingsPerUnit = savings / Math.max(1, effectiveQty);

  const handleNext = () => {
    if (step === 1 && selectedServices.length === 0) {
      alert("Please select at least one service.");
      return;
    }
    if (step === 2 && packageType === "standard") {
      if (packagePrice <= 0 || packagePrice > retailValue) {
        alert("Package price must be greater than $0 and not exceed retail value.");
        return;
      }
    }
    if (step === 3) {
      if (expirationType === "fixed" && !expirationDate) {
        alert("Please select an expiration date.");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleCreate = async () => {
    const finalDiscountPct = retailValue > 0 ? ((retailValue - packagePrice) / retailValue) * 100 : 0;
    const svcNames = selectedServices.map(s => s.name).join(" + ");
    const primaryUnit = selectedServices[0]?.unitLabel || "unit";
    const unitLabelPlural = primaryUnit === "night" ? "Nights" : primaryUnit === "day" ? "Days" : "Coupons";

    let autoName;
    if (packageType === "bogo") {
      autoName = `BOGO: Buy ${quantity}, Get ${quantity} Free — ${svcNames}`;
    } else if (packageType === "buyXgetY") {
      autoName = `Buy ${buyQty} Get ${freeQty} Free — ${svcNames}`;
    } else if (packageType === "freeNight") {
      autoName = `Free ${primaryUnit === "night" ? "Night" : "Session"} Coupon — ${svcNames}`;
    } else {
      autoName = finalDiscountPct > 0
        ? `${finalDiscountPct.toFixed(0)}% Off ${quantity} ${svcNames} ${unitLabelPlural}`
        : `${quantity} ${svcNames} ${unitLabelPlural} — $${packagePrice.toFixed(2)}`;
    }

    const expirationText = expirationType === "relative"
      ? `Package expires ${expirationDays} days after purchase.`
      : `Package expires on ${expirationDate}.`;

    let autoDesc;
    if (packageType === "freeNight") {
      autoDesc = `One complimentary ${primaryUnit} of ${svcNames}. ${expirationText}`;
    } else {
      autoDesc = `Save $${savings.toFixed(2)} (${finalDiscountPct.toFixed(1)}% off retail) on ${effectiveQty} ${primaryUnit === "night" ? "nights" : primaryUnit === "day" ? "days" : "units"} of ${svcNames}. ${expirationText}`;
    }

    const newPkg = {
      id: gid(),
      packageType,
      serviceName: svcNames,
      serviceNames: selectedServices.map(s => s.name),
      serviceCategory: selectedCategory,
      unitRate: bundledRate,
      unitRates: selectedServices.map(s => ({ name: s.name, rate: s.rate })),
      quantity: effectiveQty,
      buyQty: packageType === "buyXgetY" ? buyQty : packageType === "bogo" ? quantity : undefined,
      freeQty: packageType === "buyXgetY" ? freeQty : packageType === "bogo" ? quantity : packageType === "freeNight" ? 1 : undefined,
      retailValue,
      packagePrice,
      discountType: packageType === "standard" ? (pricingMode === "discount-pct" ? "percent" : pricingMode === "discount-dollar" ? "fixed" : "custom") : "smart",
      discountValue: packageType === "standard" ? (pricingMode === "discount-pct" ? discountPct : pricingMode === "discount-dollar" ? discountDollar : 0) : 0,
      savings,
      savingsPerUnit,
      expirationType,
      expirationDate: expirationType === "fixed" ? expirationDate : null,
      expirationDays: expirationType === "relative" ? expirationDays : null,
      name: name || autoName,
      description: description || autoDesc,
      availableOnline,
      active: true,
      createdAt: todayStr(),
    };

    await save({ ...data, packages: [...(data.packages || []), newPkg] });
    onClose();
  };

  // Auto-generated name/desc preview
  const svcNamesPreview = selectedServices.map(s => s.name).join(" + ");
  const primaryUnitPreview = selectedServices[0]?.unitLabel || "unit";
  const unitLabelPlural = selectedServices.length > 0 ? (primaryUnitPreview === "night" ? "Nights" : primaryUnitPreview === "day" ? "Days" : "Coupons") : "";
  const previewDiscountPct = retailValue > 0 ? ((retailValue - packagePrice) / retailValue) * 100 : 0;
  const autoNamePreview = selectedServices.length > 0 ? (
    packageType === "bogo" ? `BOGO: Buy ${quantity}, Get ${quantity} Free — ${svcNamesPreview}` :
    packageType === "buyXgetY" ? `Buy ${buyQty} Get ${freeQty} Free — ${svcNamesPreview}` :
    packageType === "freeNight" ? `Free ${primaryUnitPreview === "night" ? "Night" : "Session"} Coupon — ${svcNamesPreview}` :
    previewDiscountPct > 0 ? `${previewDiscountPct.toFixed(0)}% Off ${quantity} ${svcNamesPreview} ${unitLabelPlural}` : `${quantity} ${svcNamesPreview} ${unitLabelPlural} — $${packagePrice.toFixed(2)}`
  ) : "";
  const expirationPreview = expirationType === "relative" ? `Package expires ${expirationDays} days after purchase.` : (expirationDate ? `Package expires on ${expirationDate}.` : "");
  const autoDescPreview = selectedServices.length > 0 ? (
    packageType === "freeNight" ? `One complimentary ${primaryUnitPreview} of ${svcNamesPreview}. ${expirationPreview}` :
    `Save $${savings.toFixed(2)} (${previewDiscountPct.toFixed(1)}% off retail) on ${effectiveQty} ${primaryUnitPreview === "night" ? "nights" : primaryUnitPreview === "day" ? "days" : "units"} of ${svcNamesPreview}. ${expirationPreview}`
  ) : "";

  return (
    <Modal title="Create Package" wide onClose={onClose}>
      {step === 1 && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {["Boarding", "Daycare", "Add-Ons"].map(cat => (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); setSelectedServices([]); }}
                style={{
                  flex:1,
                  padding:"10px 16px",
                  border:`2px solid ${selectedCategory === cat ? C.acc : C.border}`,
                  background:selectedCategory === cat ? C.accLt : "transparent",
                  borderRadius:8,
                  fontWeight:600,
                  cursor:"pointer",
                  color:C.text,
                  fontSize:13,
                  transition:"all 0.2s"
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{fontSize:12,color:C.textMut,marginBottom:8}}>Select one or more services to bundle into this package:</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            {services.map(svc => {
              const isSel = selectedServices.some(s => s.name === svc.name);
              return (
                <Card
                  key={svc.name}
                  onClick={() => setSelectedServices(prev => isSel ? prev.filter(s => s.name !== svc.name) : [...prev, svc])}
                  hoverable
                  style={{
                    padding:16,
                    cursor:"pointer",
                    border:`2px solid ${isSel ? C.acc : C.border}`,
                    background:isSel ? C.accLt : "transparent",
                    textAlign:"center",
                    position:"relative"
                  }}
                >
                  {isSel && <span style={{position:"absolute",top:6,right:8,fontSize:14,color:C.acc}}>✓</span>}
                  <div style={{fontWeight:600,color:C.text,marginBottom:8}}>{svc.name}</div>
                  <div style={{fontSize:12,color:C.textMut,marginBottom:8}}>${svc.rate.toFixed(2)} / {svc.unitLabel}</div>
                </Card>
              );
            })}
          </div>
          {selectedServices.length > 1 && (
            <div style={{padding:"8px 14px",background:C.priLt,borderRadius:8,marginBottom:16,fontSize:13,color:C.pri,fontWeight:600}}>
              Bundle: {selectedServices.map(s => s.name).join(" + ")} — ${bundledRate.toFixed(2)}/unit combined
            </div>
          )}

          {selectedServices.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Package Type</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
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
          )}

          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={onClose} variant="secondary">Cancel</Btn>
            <Btn onClick={handleNext} variant="primary" disabled={selectedServices.length === 0}>Next</Btn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{marginBottom:24,padding:12,background:C.priLt,borderRadius:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{fontSize:12,color:C.textMut}}>Selected Service{selectedServices.length > 1 ? "s" : ""}</div>
              <Badge color={packageType === "standard" ? "primary" : "accent"} size="sm">{packageType === "bogo" ? "BOGO" : packageType === "buyXgetY" ? "Buy X Get Y" : packageType === "freeNight" ? "Free Coupon" : "Standard"}</Badge>
            </div>
            <div style={{fontSize:16,fontWeight:600,color:C.text}}>{selectedServices.map(s => s.name).join(" + ")}</div>
            {selectedServices.length > 1 && <div style={{fontSize:12,color:C.textMut,marginTop:4}}>Bundled rate: ${bundledRate.toFixed(2)} per unit</div>}
          </div>

          {/* BOGO: just need quantity of "buy" portion */}
          {packageType === "bogo" && (
            <div style={{marginBottom:24}}>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Customer Buys (gets same amount free)</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                <input type="text" inputMode="numeric" value={quantity} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setQuantity(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!quantity || quantity < 1) setQuantity(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                <button onClick={() => setQuantity(quantity + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
              </div>
              <div style={{marginTop:12,padding:12,background:C.sucLt,borderRadius:8,fontSize:13,color:C.suc,fontWeight:600}}>
                Buy {quantity}, get {quantity} free = {quantity * 2} total units for ${packagePrice.toFixed(2)}
              </div>
            </div>
          )}

          {/* Buy X Get Y */}
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
                Buy {buyQty}, get {freeQty} free = {buyQty + freeQty} total units for ${packagePrice.toFixed(2)}
              </div>
            </div>
          )}

          {/* Free Night Coupon */}
          {packageType === "freeNight" && (
            <div style={{marginBottom:24}}>
              <div style={{padding:16,background:C.sucLt,borderRadius:8,border:`1px solid ${C.suc}30`}}>
                <div style={{fontSize:15,fontWeight:700,color:C.suc,marginBottom:4}}>Free {selectedServices[0]?.unitLabel === "night" ? "Night" : "Session"} Coupon</div>
                <div style={{fontSize:13,color:C.text}}>This package gives the customer 1 complimentary {selectedServices[0]?.unitLabel || "unit"} of {selectedServices.map(s => s.name).join(" + ")}.</div>
                <div style={{fontSize:13,color:C.text,marginTop:4}}>Value: <strong>${bundledRate.toFixed(2)}</strong> — Customer pays: <strong>$0.00</strong></div>
              </div>
            </div>
          )}

          {/* Standard: full pricing controls */}
          {packageType === "standard" && (<>
            <div style={{marginBottom:24}}>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Quantity</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>−</button>
                <input type="text" inputMode="numeric" value={quantity} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setQuantity(v === "" ? "" : Math.max(1, parseInt(v))); }} onBlur={() => { if (!quantity || quantity < 1) setQuantity(1); }} style={{width:60,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,textAlign:"center",fontSize:14}} className="no-focus-ring" />
                <button onClick={() => setQuantity(quantity + 1)} style={{padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",fontWeight:600}}>+</button>
                <span style={{marginLeft:"auto",fontSize:14,color:C.textMut}}>Unit: {selectedServices[0]?.unitLabel || "unit"}</span>
              </div>
            </div>

            <div style={{marginBottom:16,padding:12,background:C.bg,borderRadius:8}}>
              <div style={{fontSize:13,color:C.textMut,marginBottom:4}}>Retail Value</div>
              <div style={{fontSize:24,fontWeight:700,color:C.text}}>${retailValue.toFixed(2)}</div>
            </div>

            <div style={{marginBottom:24}}>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Package Price</label>
              {[
                { mode: "discount-pct", label: "Discount by %" },
                { mode: "discount-dollar", label: "Subtract $" },
                { mode: "custom", label: "Set custom price" }
              ].map(opt => (
                <div key={opt.mode} style={{marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
                  <input type="radio" name="pricing" checked={pricingMode === opt.mode} onChange={() => setPricingMode(opt.mode)} style={{cursor:"pointer"}} />
                  <label style={{flex:1,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,fontWeight:500}}>{opt.label}</span>
                    {opt.mode === "discount-pct" && <input type="text" inputMode="decimal" value={discountPct} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setDiscountPct(v === "" ? "" : Math.min(100, Math.max(0, parseFloat(v) || 0))); setPricingMode("discount-pct"); }} onBlur={() => { if (discountPct === "") setDiscountPct(0); }} style={{width:70,padding:"4px 8px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12}} className="no-focus-ring" />}
                    {opt.mode === "discount-pct" && <span style={{fontSize:12,color:C.textMut}}>%</span>}
                    {opt.mode === "discount-dollar" && <input type="text" inputMode="decimal" value={discountDollar} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setDiscountDollar(v === "" ? "" : Math.max(0, parseFloat(v) || 0)); setPricingMode("discount-dollar"); }} onBlur={() => { if (discountDollar === "") setDiscountDollar(0); }} style={{width:70,padding:"4px 8px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12}} className="no-focus-ring" />}
                    {opt.mode === "discount-dollar" && <span style={{fontSize:12,color:C.textMut}}>$</span>}
                    {opt.mode === "custom" && <input type="text" inputMode="decimal" value={customPrice} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setCustomPrice(v === "" ? "" : Math.max(0, parseFloat(v) || 0)); setPricingMode("custom"); }} onBlur={() => { if (customPrice === "") setCustomPrice(0); }} style={{width:70,padding:"4px 8px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12}} className="no-focus-ring" />}
                    {opt.mode === "custom" && <span style={{fontSize:12,color:C.textMut}}>$</span>}
                    {opt.mode === "custom" && pricingMode === "custom" && retailValue > 0 && Number(customPrice) > 0 && Number(customPrice) < retailValue && (
                      <span style={{fontSize:11,color:C.suc,fontWeight:600,marginLeft:4}}>≈ {((retailValue - Number(customPrice)) / retailValue * 100).toFixed(1)}% off</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </>)}

          {/* Summary stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24,padding:12,background:C.bg,borderRadius:8}}>
            <div>
              <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Retail Value</div>
              <div style={{fontSize:16,fontWeight:700,color:C.textMut}}>${retailValue.toFixed(2)}</div>
            </div>
            <div>
              <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Package Price</div>
              <div style={{fontSize:16,fontWeight:700,color:C.pri}}>${packagePrice.toFixed(2)}</div>
            </div>
            <div>
              <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Total Savings</div>
              <div style={{fontSize:16,fontWeight:700,color:savings > 0 ? C.suc : C.textMut}}>${savings.toFixed(2)}</div>
            </div>
            <div>
              <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Total Units</div>
              <div style={{fontSize:16,fontWeight:700,color:C.text}}>{effectiveQty}</div>
            </div>
          </div>

          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={() => setStep(1)} variant="secondary">Back</Btn>
            <Btn onClick={handleNext} variant="primary">Next</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Expiration</label>
            {[
              { type: "relative", label: "Relative to purchase" },
              { type: "fixed", label: "Fixed date" }
            ].map(opt => (
              <div key={opt.type} style={{marginBottom:12,padding:12,border:`1px solid ${expirationType === opt.type ? C.acc : C.border}`,borderRadius:8,cursor:"pointer",background:expirationType === opt.type ? C.accLt : "transparent"}} onClick={() => setExpirationType(opt.type)}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <input type="radio" checked={expirationType === opt.type} onChange={() => setExpirationType(opt.type)} />
                  <span style={{fontWeight:600,fontSize:13,color:C.text}}>{opt.label}</span>
                </div>
                {opt.type === "relative" && expirationType === "relative" && (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input
                      type="number"
                      value={expirationDays}
                      onChange={(e) => setExpirationDays(Math.max(1, parseInt(e.target.value) || 90))}
                      style={{width:80,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12}}
                      className="no-focus-ring"
                    />
                    <span style={{fontSize:12,color:C.textMut}}>days after purchase</span>
                  </div>
                )}
                {opt.type === "fixed" && expirationType === "fixed" && (
                  <MiniDatePicker
                    value={expirationDate}
                    onChange={(v) => setExpirationDate(v)}
                    min={todayStr()}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginBottom:24}}>
            <Btn onClick={() => setStep(2)} variant="secondary">Back</Btn>
            <Btn onClick={handleNext} variant="primary">Next</Btn>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Package Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={autoNamePreview || "Package name"}
              style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:14}}
              className="no-focus-ring"
            />
          </div>

          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={autoDescPreview || "Package description"}
              rows={4}
              style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:14,fontFamily:"inherit",resize:"vertical"}}
              className="no-focus-ring"
            />
          </div>

          <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:12}}>
            <input
              type="checkbox"
              checked={availableOnline}
              onChange={(e) => setAvailableOnline(e.target.checked)}
              id="online-pkg"
              style={{cursor:"pointer"}}
            />
            <label htmlFor="online-pkg" style={{cursor:"pointer",fontSize:13,fontWeight:500,color:C.text}}>Available for online purchase</label>
          </div>

          <Card style={{marginBottom:24,padding:16,background:C.bg}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Summary</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontSize:12}}>
              <div><span style={{color:C.textMut}}>Service{selectedServices.length > 1 ? "s" : ""}:</span> {selectedServices.map(s => s.name).join(" + ")}</div>
              <div><span style={{color:C.textMut}}>Type:</span> {packageType === "bogo" ? "BOGO" : packageType === "buyXgetY" ? `Buy ${buyQty} Get ${freeQty}` : packageType === "freeNight" ? "Free Coupon" : "Standard"}</div>
              <div><span style={{color:C.textMut}}>Total Units:</span> {effectiveQty} {selectedServices[0]?.unitLabel || "unit"}s</div>
              <div><span style={{color:C.textMut}}>Package Price:</span> ${packagePrice.toFixed(2)}</div>
              <div><span style={{color:C.textMut}}>Retail Value:</span> ${retailValue.toFixed(2)}</div>
              <div><span style={{color:C.textMut}}>Savings:</span> <span style={{color:C.suc,fontWeight:600}}>${savings.toFixed(2)}</span></div>
              <div><span style={{color:C.textMut}}>Expires:</span> {expirationType === "relative" ? `${expirationDays} days` : expirationDate}</div>
            </div>
          </Card>

          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn onClick={() => setStep(3)} variant="secondary">Back</Btn>
            <Btn onClick={handleCreate} variant="primary">Create Package</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

export { CreatePackageWizard };
