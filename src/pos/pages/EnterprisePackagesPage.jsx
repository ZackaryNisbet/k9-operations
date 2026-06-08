import { Badge, Btn, Card, Modal } from "../components/ui";
import { C } from "../constants/colors";
import { EnterpriseCreatePkgForm } from "../components/EnterpriseCreatePkgForm";
import { I } from "../icons";
import React, { useState } from "react";
import { getAddOnPrices } from "../lib/pricing";
import { gid, todayStr } from "../lib/format";
import { supabase } from "../../supabaseClient";

function EnterprisePackagesPage({ data, save, allLocations }) {
  const [showCreate, setShowCreate] = useState(false);
  const [pushModal, setPushModal] = useState(null);
  const [pushLocations, setPushLocations] = useState([]);
  const [pushing, setPushing] = useState(false);
  const [activeView, setActiveView] = useState("packages");
  const [locationFilter, setLocationFilter] = useState("all");
  const [expandedLocs, setExpandedLocs] = useState(null);
  const [expandedEntPkg, setExpandedEntPkg] = useState(null);
  const [entEditDraft, setEntEditDraft] = useState(null);
  const [entSortField, setEntSortField] = useState("createdAt");
  const [entSortDir, setEntSortDir] = useState("desc");

  const entPkgs = (data.packages || []).filter(p => p.active !== false);
  const archivedEntPkgs = (data.packages || []).filter(p => p.active === false);
  const locations = (allLocations || []).filter(l => !l.isEnterprise);
  const locNameMap = Object.fromEntries(locations.map(l => [l.id, l.name]));

  const toggleEntExpand = (pkg) => {
    if (expandedEntPkg === pkg.id) { setExpandedEntPkg(null); setEntEditDraft(null); }
    else { setExpandedEntPkg(pkg.id); setEntEditDraft({ ...pkg }); }
  };

  const toggleEntSort = (field) => {
    if (entSortField === field) setEntSortDir(d => d === "asc" ? "desc" : "asc");
    else { setEntSortField(field); setEntSortDir("asc"); }
  };

  const handleSaveEntEdit = async () => {
    if (!entEditDraft) return;
    await save({ ...data, packages: (data.packages || []).map(p => p.id === entEditDraft.id ? { ...p, name: entEditDraft.name, description: entEditDraft.description, discountValue: parseFloat(entEditDraft.discountValue) || 0, quantity: parseInt(entEditDraft.quantity) || 1, expirationType: entEditDraft.expirationType, expirationDays: parseInt(entEditDraft.expirationDays) || 90, availableOnline: entEditDraft.availableOnline } : p) });
    setExpandedEntPkg(null); setEntEditDraft(null);
  };

  const handleCreateEnterprisePkg = async (pkg) => {
    const newPkg = { ...pkg, id: gid(), createdAt: todayStr(), pushedTo: [], active: true };
    await save({ ...data, packages: [...(data.packages || []), newPkg] });
    setShowCreate(false);
  };

  const handleArchivePkg = async (pkgId) => {
    if (!window.confirm("Archive this enterprise package? It will no longer be available for pushing to locations.")) return;
    await save({ ...data, packages: (data.packages || []).map(p => p.id === pkgId ? { ...p, active: false } : p) });
  };

  const handleReactivatePkg = async (pkgId) => {
    await save({ ...data, packages: (data.packages || []).map(p => p.id === pkgId ? { ...p, active: true } : p) });
  };

  const handlePushToLocations = async () => {
    if (!pushModal || pushLocations.length === 0) return;
    setPushing(true);
    const pkg = pushModal;
    const successLocs = [];
    for (const locId of pushLocations) {
      try {
        // Get location pricing from location_pricing table
        const { data: pricingRows } = await supabase.from('location_pricing').select('*').eq('location_id', locId).is('effective_to', null);
        const pricing = { boardingRates: {}, daycareRates: {} };
        for (const r of (pricingRows || [])) {
          const p = Number(r.price);
          if (r.category === 'boarding') pricing.boardingRates[r.sub_category] = p;
          else if (r.category === 'daycare') {
            if (r.sub_category === 'full_day') pricing.daycareRates = { ...pricing.daycareRates, fullDay: p };
            else if (r.sub_category === 'half_day') pricing.daycareRates = { ...pricing.daycareRates, halfDay: p };
          } else if (r.category === 'misc_fee') {
            if (r.sub_category === 'day_boarding') pricing.dayboardingRate = p;
            else pricing[r.sub_category] = p;
          }
        }
        let unitRate = 0;
        if (pkg.serviceCategory === "Boarding") {
          unitRate = (pricing.boardingRates || {})[pkg.serviceName] || 0;
        } else if (pkg.serviceCategory === "Daycare") {
          if (pkg.serviceName === "Full Day Daycare") unitRate = pricing.daycareRates?.fullDay || 0;
          else if (pkg.serviceName === "Half Day Daycare") unitRate = pricing.daycareRates?.halfDay || 0;
          else if (pkg.serviceName === "Day Boarding") unitRate = pricing.dayboardingRate || 0;
        } else {
          unitRate = getAddOnPrices(pricing, data.addOnRules)[pkg.serviceName] || 0;
        }
        const retailValue = unitRate * pkg.quantity;
        let packagePrice = retailValue;
        if (pkg.discountType === "percent") packagePrice = retailValue * (1 - (pkg.discountValue || 0) / 100);
        else if (pkg.discountType === "fixed") packagePrice = retailValue - (pkg.discountValue || 0);
        const savings = Math.max(0, retailValue - packagePrice);
        const localPkg = {
          id: gid(), name: pkg.name, description: pkg.description,
          serviceCategory: pkg.serviceCategory, serviceName: pkg.serviceName,
          serviceNames: pkg.serviceNames || [pkg.serviceName],
          packageType: pkg.packageType || "standard",
          buyQty: pkg.buyQty,
          freeQty: pkg.freeQty,
          unitRate, quantity: pkg.quantity, retailValue, packagePrice, savings,
          savingsPerUnit: savings / Math.max(1, pkg.quantity),
          discountType: pkg.discountType, discountValue: pkg.discountValue,
          expirationType: pkg.expirationType, expirationDays: pkg.expirationDays,
          availableOnline: pkg.availableOnline, enterpriseSourceId: pkg.id,
          active: true, createdAt: todayStr(),
        };
        // Use SECURITY DEFINER RPC to bypass RLS — enterprise user writing to child location
        const { data: rpcResult, error: rpcError } = await supabase.rpc('push_enterprise_package', {
          p_pkg: localPkg,
          p_location_id: locId,
        });
        if (rpcError) {
          console.error('Push RPC error:', rpcError);
          continue;
        }
        if (rpcResult && rpcResult.success === false) {
          if (rpcResult.message?.includes('already pushed')) continue;
          console.error('Push rejected:', rpcResult.message);
          continue;
        }
        successLocs.push(locId);
      } catch (e) { console.error('Push package error:', e); }
    }
    if (successLocs.length > 0) {
      const updated = (data.packages || []).map(p => p.id === pkg.id ? { ...p, pushedTo: [...new Set([...(p.pushedTo || []), ...successLocs])] } : p);
      await save({ ...data, packages: updated });
    }
    setPushing(false);
    setPushModal(null);
    setPushLocations([]);
  };

  // Filter packages by location
  const filteredPkgsRaw = locationFilter === "all" ? entPkgs : entPkgs.filter(p => (p.pushedTo || []).includes(locationFilter));
  const filteredPkgs = [...filteredPkgsRaw].sort((a, b) => {
    let av, bv;
    if (entSortField === "createdAt") { av = a.createdAt || ""; bv = b.createdAt || ""; }
    else if (entSortField === "name") { av = (a.name || "").toLowerCase(); bv = (b.name || "").toLowerCase(); }
    else if (entSortField === "discount") { av = a.discountValue || 0; bv = b.discountValue || 0; }
    else { av = a[entSortField] || 0; bv = b[entSortField] || 0; }
    if (av < bv) return entSortDir === "asc" ? -1 : 1;
    if (av > bv) return entSortDir === "asc" ? 1 : -1;
    return 0;
  });

  const hdrStyle = {fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",padding:"10px 12px",background:C.bg,borderBottom:`1px solid ${C.border}`};
  const cellStyle = {padding:"12px",borderBottom:`1px solid ${C.borderLight}`,fontSize:13,color:C.text};

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Enterprise Packages</h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: C.textSec }}>Create package templates and roll them out to multiple locations</p>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <div style={{display:"flex",gap:6}}>
            {[["packages","Packages"],["archived","Archived"],["reports","Reports"]].map(([v,l]) => (
              <button key={v} onClick={() => setActiveView(v)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${activeView === v ? C.pri : C.border}`,background:activeView === v ? C.priLt : "transparent",color:activeView === v ? C.pri : C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
            ))}
          </div>
          {activeView === "packages" && <Btn onClick={() => setShowCreate(true)} icon={<I.Plus />}>Create Package</Btn>}
        </div>
      </div>

      {activeView === "packages" && (
        <>
          {/* Location filter */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <span style={{fontSize:12,fontWeight:600,color:C.textSec}}>Filter:</span>
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit"}} className="no-focus-ring">
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {filteredPkgs.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎁</div>
              <p style={{ fontSize: 16, fontWeight: 500, color: C.textMut, margin: 0 }}>
                {locationFilter !== "all" ? "No enterprise packages assigned to this location." : "No enterprise packages yet. Create one to roll out to your locations."}
              </p>
            </Card>
          ) : (
            <Card>
              {(() => {
                const entColDef = "2fr 1fr 0.5fr 1fr 1.8fr 0.7fr 0.8fr 0.9fr";
                const entHdrBase = {...hdrStyle,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:4};
                const entSortIcon = (field) => entSortField === field ? (entSortDir === "asc" ? " \u2191" : " \u2193") : "";
                return (
                  <div style={{display:"grid",gridTemplateColumns:entColDef,gap:0,alignItems:"stretch"}}>
                    <div style={entHdrBase} onClick={() => toggleEntSort("name")}>Name{entSortIcon("name")}</div>
                    <div style={{...entHdrBase,cursor:"default"}}>Service</div>
                    <div style={{...entHdrBase,cursor:"default"}}>Qty</div>
                    <div style={entHdrBase} onClick={() => toggleEntSort("discount")}>Discount{entSortIcon("discount")}</div>
                    <div style={{...entHdrBase,cursor:"default"}}>Locations</div>
                    <div style={{...entHdrBase,cursor:"default"}}>Online</div>
                    <div style={entHdrBase} onClick={() => toggleEntSort("createdAt")}>Created{entSortIcon("createdAt")}</div>
                    <div style={{...entHdrBase,cursor:"default",justifyContent:"center"}}>Actions</div>
                    {filteredPkgs.map(pkg => {
                      const discountText = pkg.discountType === "percent" ? `${pkg.discountValue}% Off` : pkg.discountType === "fixed" ? `$${pkg.discountValue} Off` : "Custom";
                      const pushed = pkg.pushedTo || [];
                      const showLocs = pushed.slice(0, 3);
                      const moreLocs = pushed.length - 3;
                      const isEntExp = expandedEntPkg === pkg.id;
                      const entRowBg = isEntExp ? C.priLt + "40" : "transparent";
                      const entCellBase = {...cellStyle,background:entRowBg,cursor:"pointer",borderBottom: isEntExp ? "none" : `1px solid ${C.borderLight}`};
                      return (
                        <React.Fragment key={pkg.id}>
                          <div style={{...entCellBase,fontWeight:600}} onClick={() => toggleEntExpand(pkg)}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:10,color:C.textMut,transition:"transform 0.2s",transform:isEntExp ? "rotate(90deg)" : "rotate(0deg)"}}>&#9654;</span>
                              <div>
                                <div>{pkg.name}</div>
                                <div style={{fontSize:11,color:C.textMut,marginTop:2,fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{pkg.description?.substring(0,40)}{(pkg.description||"").length > 40 ? "..." : ""}</div>
                              </div>
                            </div>
                          </div>
                          <div style={entCellBase} onClick={() => toggleEntExpand(pkg)}>{pkg.serviceName}</div>
                          <div style={{...entCellBase,textAlign:"center"}} onClick={() => toggleEntExpand(pkg)}>{pkg.quantity}</div>
                          <div style={entCellBase} onClick={() => toggleEntExpand(pkg)}>
                            <Badge color="info" size="sm">{discountText}</Badge>
                          </div>
                          <div style={{...entCellBase,display:"flex",flexWrap:"wrap",gap:4,alignItems:"center",cursor:"default"}}>
                            {pushed.length === 0 ? (
                              <span style={{fontSize:11,color:C.textMut,fontStyle:"italic"}}>Not pushed yet</span>
                            ) : (
                              <>
                                {showLocs.map(locId => (
                                  <span key={locId} style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:C.priLt,color:C.pri,fontWeight:600,whiteSpace:"nowrap"}}>{locNameMap[locId] || locId}</span>
                                ))}
                                {moreLocs > 0 && (
                                  <span onClick={(e) => { e.stopPropagation(); setExpandedLocs(expandedLocs === pkg.id ? null : pkg.id); }} style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:C.bg,color:C.textSec,fontWeight:600,cursor:"pointer"}}>+{moreLocs} more</span>
                                )}
                              </>
                            )}
                            {expandedLocs === pkg.id && pushed.length > 3 && (
                              <div style={{width:"100%",marginTop:4,padding:8,background:C.bg,borderRadius:8,fontSize:11,color:C.textSec,lineHeight:1.8}}>
                                {pushed.map(locId => locNameMap[locId] || locId).join(", ")}
                              </div>
                            )}
                          </div>
                          <div style={{...entCellBase,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default"}}>
                            <div onClick={(e) => { e.stopPropagation(); const updated = (data.packages || []).map(p => p.id === pkg.id ? { ...p, availableOnline: !p.availableOnline } : p); save({ ...data, packages: updated }); }} style={{width:40,height:24,borderRadius:12,border:"none",background:pkg.availableOnline ? C.suc : C.border,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                              <div style={{width:18,height:18,borderRadius:9,background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.2)",position:"absolute",top:3,left:pkg.availableOnline ? 19 : 3,transition:"left 0.2s"}} />
                            </div>
                          </div>
                          <div style={entCellBase} onClick={() => toggleEntExpand(pkg)}><span style={{color:C.textMut,fontSize:12}}>{pkg.createdAt || "—"}</span></div>
                          <div style={{...entCellBase,display:"flex",gap:6,alignItems:"center",justifyContent:"center",cursor:"default"}}>
                            <button onClick={(e) => { e.stopPropagation(); setPushModal(pkg); setPushLocations([]); }} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.pri}30`,background:C.priLt,color:C.pri,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} title="Push to locations">Push</button>
                            <button onClick={(e) => { e.stopPropagation(); handleArchivePkg(pkg.id); }} style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.textMut,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center"}} title="Archive"><I.X/></button>
                          </div>

                          {/* Expanded detail / edit row */}
                          {isEntExp && entEditDraft && (
                            <div style={{gridColumn:"1 / -1",background:C.bg,borderBottom:`1px solid ${C.border}`,padding:"20px 24px",display:"flex",gap:24}}>
                              <div style={{flex:1}}>
                                <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:6}}>Full Description</div>
                                <div style={{fontSize:13,color:C.textSec,lineHeight:1.5,marginBottom:16,padding:12,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>{pkg.description || "No description"}</div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                                  <div style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                                    <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:4}}>Locations Pushed</div>
                                    <div style={{fontSize:18,fontWeight:700,color:C.pri}}>{pushed.length}</div>
                                  </div>
                                  <div style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                                    <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:4}}>Discount</div>
                                    <div style={{fontSize:18,fontWeight:700,color:C.suc}}>{discountText}</div>
                                  </div>
                                </div>
                              </div>
                              <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
                                <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:2}}>Edit Package</div>
                                <div>
                                  <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Name</label>
                                  <input value={entEditDraft.name || ""} onChange={e => setEntEditDraft({...entEditDraft, name: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                                </div>
                                <div>
                                  <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Description</label>
                                  <textarea value={entEditDraft.description || ""} onChange={e => setEntEditDraft({...entEditDraft, description: e.target.value})} rows={3} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}} />
                                </div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                                  <div>
                                    <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Discount Value</label>
                                    <input type="number" value={entEditDraft.discountValue || ""} onChange={e => setEntEditDraft({...entEditDraft, discountValue: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                                  </div>
                                  <div>
                                    <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Quantity</label>
                                    <input type="number" value={entEditDraft.quantity || ""} onChange={e => setEntEditDraft({...entEditDraft, quantity: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                                  </div>
                                </div>
                                <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:4}}>
                                  <Btn onClick={() => { setExpandedEntPkg(null); setEntEditDraft(null); }} variant="secondary" size="sm">Cancel</Btn>
                                  <Btn onClick={handleSaveEntEdit} variant="primary" size="sm" icon={<I.Check/>}>Save Changes</Btn>
                                </div>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          )}
        </>
      )}

      {activeView === "archived" && (
        archivedEntPkgs.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:C.textMut}}>
            <div style={{fontSize:48,marginBottom:16}}>📦</div>
            <p style={{fontSize:16,fontWeight:500,margin:0}}>No archived enterprise packages</p>
          </div>
        ) : (
          <Card>
            <div style={{display:"grid",gridTemplateColumns:"2.5fr 1.2fr 0.6fr 1fr 1fr",gap:0,alignItems:"stretch"}}>
              {["Package Name","Service","Qty","Discount",""].map(h => (
                <div key={h} style={hdrStyle}>{h}</div>
              ))}
              {archivedEntPkgs.map(pkg => (
                <React.Fragment key={pkg.id}>
                  <div style={{...cellStyle,opacity:0.6}}><div style={{fontWeight:600}}>{pkg.name}</div></div>
                  <div style={{...cellStyle,opacity:0.6}}>{pkg.serviceName}</div>
                  <div style={{...cellStyle,opacity:0.6,textAlign:"center"}}>{pkg.quantity}</div>
                  <div style={{...cellStyle,opacity:0.6}}>{pkg.discountType === "percent" ? `${pkg.discountValue}% Off` : pkg.discountType === "fixed" ? `$${pkg.discountValue} Off` : "Custom"}</div>
                  <div style={{...cellStyle,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Btn onClick={() => handleReactivatePkg(pkg.id)} variant="secondary" size="sm">Reactivate</Btn>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Card>
        )
      )}

      {activeView === "reports" && (
        <Card style={{padding:24}}>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:16}}>Enterprise Package Reports</div>
          <p style={{fontSize:13,color:C.textSec,marginBottom:20}}>Aggregated outstanding package value across all locations. Data loads from each location's package sales.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>
            <Card style={{padding:16,textAlign:"center",background:C.bg}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:8}}>Enterprise Templates</div>
              <div style={{fontSize:24,fontWeight:700,color:C.pri}}>{entPkgs.length}</div>
            </Card>
            <Card style={{padding:16,textAlign:"center",background:C.bg}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:8}}>Locations With Packages</div>
              <div style={{fontSize:24,fontWeight:700,color:C.suc}}>{new Set(entPkgs.flatMap(p => p.pushedTo || [])).size}</div>
            </Card>
            <Card style={{padding:16,textAlign:"center",background:C.bg}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:8}}>Total Pushes</div>
              <div style={{fontSize:24,fontWeight:700,color:C.acc}}>{entPkgs.reduce((sum, p) => sum + (p.pushedTo || []).length, 0)}</div>
            </Card>
          </div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>Packages by Location</div>
          {locations.map(loc => {
            const locPkgs = entPkgs.filter(p => (p.pushedTo || []).includes(loc.id));
            if (locPkgs.length === 0) return null;
            return (
              <div key={loc.id} style={{padding:"12px 16px",borderRadius:8,border:`1px solid ${C.borderLight}`,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontWeight:600,fontSize:13,color:C.text}}>{loc.name}</div>
                <Badge size="sm">{locPkgs.length} package{locPkgs.length !== 1 ? "s" : ""}</Badge>
              </div>
            );
          })}
        </Card>
      )}

      {/* Create Package Modal */}
      {showCreate && (
        <Modal title="Create Enterprise Package" onClose={() => setShowCreate(false)} wide>
          <EnterpriseCreatePkgForm onSave={handleCreateEnterprisePkg} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {/* Push to Locations Modal */}
      {pushModal && (
        <Modal title={`Push "${pushModal.name}" to Locations`} onClose={() => setPushModal(null)} width={480}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 12 }}>Select locations to receive this package template. Pricing will be calculated dynamically from each location's rates.</div>
            {locations.map(loc => {
              const alreadyPushed = (pushModal.pushedTo || []).includes(loc.id);
              const selected = pushLocations.includes(loc.id);
              return (
                <label key={loc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: alreadyPushed ? "default" : "pointer", opacity: alreadyPushed ? 0.5 : 1, marginBottom: 4, background: selected ? C.priLt : "transparent" }}>
                  <input type="checkbox" checked={selected || alreadyPushed} disabled={alreadyPushed} onChange={() => {
                    if (alreadyPushed) return;
                    setPushLocations(prev => prev.includes(loc.id) ? prev.filter(id => id !== loc.id) : [...prev, loc.id]);
                  }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{loc.name}</div>
                    {alreadyPushed && <div style={{ fontSize: 11, color: C.suc }}>Already pushed</div>}
                  </div>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setPushModal(null)}>Cancel</Btn>
            <Btn onClick={handlePushToLocations} disabled={pushing || pushLocations.length === 0}>{pushing ? "Pushing..." : `Push to ${pushLocations.length} Location${pushLocations.length !== 1 ? "s" : ""}`}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { EnterprisePackagesPage };
