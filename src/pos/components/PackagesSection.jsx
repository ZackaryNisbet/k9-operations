import { Btn, Card } from "./ui";
import { C } from "../constants/colors";
import { CreatePackageWizard } from "./CreatePackageWizard";
import { I } from "../icons";
import { PackageReportsTab } from "./PackageReportsTab";
import { React, useState } from "react";
import { SellPackageModal } from "./SellPackageModal";

function PackagesSection({ data, save, nav, profile }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [expandedPkg, setExpandedPkg] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [activeView, setActiveView] = useState("packages");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  const pkgs = data.packages || [];
  const sales = data.packageSales || [];

  const handleArchivePackage = async (id) => {
    const confirmed = window.confirm("Archive this package? It will no longer be available for sale but existing sales are unaffected.");
    if (!confirmed) return;
    await save({ ...data, packages: pkgs.map(p => p.id === id ? { ...p, active: false } : p) });
    if (expandedPkg === id) { setExpandedPkg(null); setEditDraft(null); }
  };

  const handleReactivatePackage = async (id) => {
    await save({ ...data, packages: pkgs.map(p => p.id === id ? { ...p, active: true } : p) });
  };

  const handleToggleOnline = async (id) => {
    await save({ ...data, packages: pkgs.map(p => p.id === id ? { ...p, availableOnline: !p.availableOnline } : p) });
  };

  const handleSaveEdit = async () => {
    if (!editDraft) return;
    const newPrice = parseFloat(editDraft.packagePrice) || 0;
    const newQty = parseInt(editDraft.quantity) || 1;
    const origPkg = pkgs.find(p => p.id === editDraft.id);
    const retail = origPkg?.retailValue || 0;
    const newRetail = origPkg?.unitRate ? origPkg.unitRate * newQty : retail;
    const newSavings = Math.max(0, newRetail - newPrice);
    await save({ ...data, packages: pkgs.map(p => p.id === editDraft.id ? { ...p, name: editDraft.name, description: editDraft.description, packagePrice: newPrice, quantity: newQty, retailValue: newRetail, savings: newSavings, savingsPerUnit: newSavings / Math.max(1, newQty), expirationType: editDraft.expirationType, expirationDays: parseInt(editDraft.expirationDays) || 90, expirationDate: editDraft.expirationDate, availableOnline: editDraft.availableOnline } : p) });
    setExpandedPkg(null);
    setEditDraft(null);
  };

  const toggleExpand = (pkg) => {
    if (expandedPkg === pkg.id) { setExpandedPkg(null); setEditDraft(null); }
    else { setExpandedPkg(pkg.id); setEditDraft({ ...pkg }); }
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const activePkgs = pkgs.filter(p => p.active !== false);
  const archivedPkgs = pkgs.filter(p => p.active === false);

  const sortedActivePkgs = [...activePkgs].sort((a, b) => {
    let av, bv;
    if (sortField === "createdAt") { av = a.createdAt || ""; bv = b.createdAt || ""; }
    else if (sortField === "name") { av = (a.name || "").toLowerCase(); bv = (b.name || "").toLowerCase(); }
    else if (sortField === "price") { av = a.packagePrice || 0; bv = b.packagePrice || 0; }
    else if (sortField === "savings") { av = a.savings || 0; bv = b.savings || 0; }
    else { av = a[sortField] || 0; bv = b[sortField] || 0; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div style={{padding:24}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <h2 style={{margin:0,fontSize:24,fontWeight:700,color:C.text}}>Packages</h2>
        <div style={{display:"flex",gap:12}}>
          <div style={{display:"flex",gap:6}}>
            {[["packages", "Packages"], ["archived", "Archived"], ["reports", "Reports"]].map(([view, label]) => (
              <button key={view} onClick={() => setActiveView(view)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${activeView === view ? C.pri : C.border}`,background:activeView === view ? C.priLt : "transparent",color:activeView === view ? C.pri : C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
            ))}
          </div>
          {activeView === "packages" && (
            <div style={{display:"flex",gap:12}}>
              <Btn onClick={() => setShowCreate(true)} variant="primary" icon={<I.Plus/>}>Create Package</Btn>
              <Btn onClick={() => setShowSell(true)} variant="primary" style={{background:C.acc}} icon={<I.ShoppingCart/>}>Sell Package</Btn>
            </div>
          )}
        </div>
      </div>

      {activeView === "reports" ? (
        <PackageReportsTab data={data} />
      ) : activeView === "archived" ? (
        archivedPkgs.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:C.textMut}}>
            <div style={{fontSize:48,marginBottom:16}}>📦</div>
            <p style={{fontSize:16,fontWeight:500,margin:0}}>No archived packages</p>
          </div>
        ) : (
          <Card>
            <div style={{display:"grid",gridTemplateColumns:"2.5fr 1.2fr 0.6fr 0.9fr 1fr",gap:0,alignItems:"stretch"}}>
              {["Package Name","Service","Qty","Price",""].map(h => (
                <div key={h} style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",padding:"10px 12px",background:C.bg,borderBottom:`1px solid ${C.border}`}}>{h}</div>
              ))}
              {archivedPkgs.map(pkg => (
                <React.Fragment key={pkg.id}>
                  <div style={{padding:"12px",borderBottom:`1px solid ${C.borderLight}`,opacity:0.6}}>
                    <div style={{fontWeight:600,color:C.text,fontSize:14}}>{pkg.name}</div>
                    <div style={{fontSize:12,color:C.textMut,marginTop:2}}>{pkg.description?.substring(0,40)}</div>
                  </div>
                  <div style={{padding:"12px",borderBottom:`1px solid ${C.borderLight}`,color:C.text,fontSize:13,opacity:0.6}}>{pkg.serviceName}</div>
                  <div style={{padding:"12px",borderBottom:`1px solid ${C.borderLight}`,color:C.text,fontSize:13,textAlign:"center",opacity:0.6}}>{pkg.quantity}</div>
                  <div style={{padding:"12px",borderBottom:`1px solid ${C.borderLight}`,color:C.text,fontSize:13,opacity:0.6}}>${pkg.packagePrice?.toFixed(2)}</div>
                  <div style={{padding:"12px",borderBottom:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Btn onClick={() => handleReactivatePackage(pkg.id)} variant="secondary" size="sm">Reactivate</Btn>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Card>
        )
      ) : activePkgs.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 20px",color:C.textMut}}>
          <div style={{fontSize:48,marginBottom:16}}>🎁</div>
          <p style={{fontSize:16,fontWeight:500,margin:0}}>No packages yet. Create one to get started!</p>
        </div>
      ) : (
        <Card>
          {(() => {
            const colDef = "2.2fr 1.1fr 0.5fr 0.8fr 0.8fr 0.8fr 0.8fr 0.9fr 0.6fr 0.8fr 0.5fr 0.5fr";
            const hdrBase = {fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",padding:"10px 12px",background:C.bg,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:4};
            const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";
            return (
              <div style={{display:"grid",gridTemplateColumns:colDef,gap:0,alignItems:"stretch"}}>
                <div style={hdrBase} onClick={() => toggleSort("name")}>Name{sortIcon("name")}</div>
                <div style={{...hdrBase,cursor:"default"}}>Service</div>
                <div style={{...hdrBase,cursor:"default"}}>Qty</div>
                <div style={hdrBase} onClick={() => toggleSort("price")}>Price{sortIcon("price")}</div>
                <div style={{...hdrBase,cursor:"default"}}>Retail</div>
                <div style={{...hdrBase,cursor:"default"}}>Price/Unit</div>
                <div style={hdrBase} onClick={() => toggleSort("savings")}>Savings{sortIcon("savings")}</div>
                <div style={{...hdrBase,cursor:"default"}}>Expiration</div>
                <div style={{...hdrBase,cursor:"default"}}>Online</div>
                <div style={hdrBase} onClick={() => toggleSort("createdAt")}>Created{sortIcon("createdAt")}</div>
                <div style={{...hdrBase,cursor:"default",justifyContent:"center",fontSize:10}}>Sold</div>
                <div style={{...hdrBase,cursor:"default",justifyContent:"center"}}>Actions</div>

                {sortedActivePkgs.map((pkg) => {
                  const expirationText = pkg.expirationType === "relative" ? `${pkg.expirationDays} days` : pkg.expirationDate;
                  const retailPerUnit = pkg.quantity > 0 ? (pkg.retailValue || 0) / pkg.quantity : 0;
                  const discountPerUnit = pkg.quantity > 0 ? (pkg.packagePrice || 0) / pkg.quantity : 0;
                  const isExpanded = expandedPkg === pkg.id;
                  const rowBg = isExpanded ? C.priLt + "40" : "transparent";
                  const cellBase = {padding:"12px",borderBottom: isExpanded ? "none" : `1px solid ${C.borderLight}`,background:rowBg,cursor:"pointer"};
                  return (
                    <React.Fragment key={pkg.id}>
                      <div style={{...cellBase}} onClick={() => toggleExpand(pkg)}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10,color:C.textMut,transition:"transform 0.2s",transform:isExpanded ? "rotate(90deg)" : "rotate(0deg)"}}>&#9654;</span>
                          <div>
                            <div style={{fontWeight:600,color:C.text,fontSize:14}}>{pkg.name}</div>
                            <div style={{fontSize:12,color:C.textMut,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{pkg.description?.substring(0,35)}{(pkg.description||"").length > 35 ? "..." : ""}</div>
                          </div>
                        </div>
                      </div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.text,fontSize:13}}>{pkg.serviceName}</span></div>
                      <div style={{...cellBase,textAlign:"center"}} onClick={() => toggleExpand(pkg)}><span style={{color:C.text,fontSize:13}}>{pkg.quantity}</span></div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.text,fontSize:13}}>${pkg.packagePrice?.toFixed(2)}</span></div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.text,fontSize:13}}>${(pkg.retailValue||0).toFixed(2)}</span></div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}>
                        <div style={{fontSize:11,color:C.textMut}}>${retailPerUnit.toFixed(2)}</div>
                        <div style={{fontWeight:600,color:C.text,fontSize:13}}>${discountPerUnit.toFixed(2)}</div>
                      </div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.suc,fontSize:13,fontWeight:600}}>${(pkg.savings||0).toFixed(2)}</span></div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.text,fontSize:13}}>{expirationText}</span></div>
                      <div style={{...cellBase,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default"}}>
                        <button onClick={(e) => { e.stopPropagation(); handleToggleOnline(pkg.id); }} style={{width:44,height:26,borderRadius:13,border:"none",background:pkg.availableOnline ? C.pri : C.border,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                          <div style={{position:"absolute",width:22,height:22,borderRadius:"50%",background:"white",top:2,left:pkg.availableOnline ? 20 : 2,transition:"left 0.2s"}}/>
                        </button>
                      </div>
                      <div style={cellBase} onClick={() => toggleExpand(pkg)}><span style={{color:C.textMut,fontSize:12}}>{pkg.createdAt || "—"}</span></div>
                      <div style={{...cellBase,textAlign:"center",fontSize:13,fontWeight:700,color:C.pri}}>{sales.filter(s => s.packageId === pkg.id).reduce((sum, s) => sum + (s.quantity || 0), 0)}</div>
                      <div style={{...cellBase,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default"}}>
                        <button onClick={(e) => { e.stopPropagation(); handleArchivePackage(pkg.id); }} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,padding:4,display:"flex",alignItems:"center"}} title="Archive package">
                          <I.X/>
                        </button>
                      </div>

                      {/* Expanded detail / edit row */}
                      {isExpanded && editDraft && (
                        <div style={{gridColumn:"1 / -1",background:C.bg,borderBottom:`1px solid ${C.border}`,padding:"20px 24px",display:"flex",gap:24}}>
                          {/* Left: Full description + stats */}
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:6}}>Full Description</div>
                            <div style={{fontSize:13,color:C.textSec,lineHeight:1.5,marginBottom:16,padding:12,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>{pkg.description || "No description"}</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                              <div style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                                <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:4}}>Times Sold</div>
                                <div style={{fontSize:18,fontWeight:700,color:C.pri}}>{sales.filter(s => s.packageId === pkg.id).length}</div>
                              </div>
                              <div style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                                <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:4}}>Units Sold</div>
                                <div style={{fontSize:18,fontWeight:700,color:C.acc}}>{sales.filter(s => s.packageId === pkg.id).reduce((sum, s) => sum + (s.quantity || 0), 0)}</div>
                              </div>
                              <div style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                                <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:4}}>Savings/Unit</div>
                                <div style={{fontSize:18,fontWeight:700,color:C.suc}}>${(pkg.savingsPerUnit||0).toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                          {/* Right: Edit form */}
                          <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:2}}>Edit Package</div>
                            <div>
                              <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Name</label>
                              <input value={editDraft.name || ""} onChange={e => setEditDraft({...editDraft, name: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                            </div>
                            <div>
                              <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Description</label>
                              <textarea value={editDraft.description || ""} onChange={e => setEditDraft({...editDraft, description: e.target.value})} rows={3} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}} />
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                              <div>
                                <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Package Price ($)</label>
                                <input type="number" value={editDraft.packagePrice || ""} onChange={e => setEditDraft({...editDraft, packagePrice: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                              </div>
                              <div>
                                <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Quantity</label>
                                <input type="number" value={editDraft.quantity || ""} onChange={e => setEditDraft({...editDraft, quantity: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} />
                              </div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                              <div>
                                <label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Expiration Type</label>
                                <select value={editDraft.expirationType || "relative"} onChange={e => setEditDraft({...editDraft, expirationType: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} className="no-focus-ring">
                                  <option value="relative">Relative (days)</option>
                                  <option value="fixed">Fixed date</option>
                                  <option value="none">Never expires</option>
                                </select>
                              </div>
                              <div>
                                {editDraft.expirationType === "relative" ? (
                                  <><label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Days</label>
                                  <input type="number" value={editDraft.expirationDays || ""} onChange={e => setEditDraft({...editDraft, expirationDays: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} /></>
                                ) : editDraft.expirationType === "fixed" ? (
                                  <><label style={{fontSize:12,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Date</label>
                                  <input type="date" value={editDraft.expirationDate || ""} onChange={e => setEditDraft({...editDraft, expirationDate: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box"}} /></>
                                ) : <div style={{paddingTop:22,fontSize:12,color:C.textMut,fontStyle:"italic"}}>No expiration</div>}
                              </div>
                            </div>
                            <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:4}}>
                              <Btn onClick={() => { setExpandedPkg(null); setEditDraft(null); }} variant="secondary" size="sm">Cancel</Btn>
                              <Btn onClick={handleSaveEdit} variant="primary" size="sm" icon={<I.Check/>}>Save Changes</Btn>
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

      {showCreate && <CreatePackageWizard data={data} save={save} onClose={() => setShowCreate(false)} />}
      {showSell && <SellPackageModal data={data} save={save} onClose={() => setShowSell(false)} nav={nav} profile={profile} />}
    </div>
  );
}

export { PackagesSection };
