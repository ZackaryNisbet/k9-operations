import { Btn, Modal } from "./ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { gid, todayStr } from "../lib/format";
import { useState } from "react";

function SellPackageModal({ data, save, onClose, nav, profile }) {
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [cartItems, setCartItems] = useState([{ packageId: null, qty: 1 }]);
  const [success, setSuccess] = useState(false);

  const pkgs = data.packages?.filter(p => p.active !== false) || [];
  const clients = data.clients || [];

  const filteredClients = !selectedClient
    ? clients.filter(cl => {
        const name = `${cl.fields?.first_name || ""} ${cl.fields?.last_name || ""}`.toLowerCase();
        const phone = cl.fields?.phone || "";
        return name.includes(searchQ.toLowerCase()) || phone.includes(searchQ);
      }).slice(0, 8)
    : [];

  const total = cartItems.reduce((sum, item) => {
    const pkg = pkgs.find(p => p.id === item.packageId);
    return sum + ((pkg?.packagePrice || 0) * item.qty);
  }, 0);

  const handleAddCart = () => {
    setCartItems([...cartItems, { packageId: null, qty: 1 }]);
  };

  const handleRemoveCart = (idx) => {
    setCartItems(cartItems.filter((_, i) => i !== idx));
  };

  const handleCompleteSale = async () => {
    if (!selectedClient || cartItems.some(item => !item.packageId)) {
      alert("Please select a client and all package details.");
      return;
    }

    const sales = cartItems.map(item => ({
      id: "ps_" + gid(),
      packageId: item.packageId,
      clientId: selectedClient.id,
      packageName: pkgs.find(p => p.id === item.packageId)?.name,
      packagePrice: pkgs.find(p => p.id === item.packageId)?.packagePrice,
      quantity: item.qty,
      totalPaid: (pkgs.find(p => p.id === item.packageId)?.packagePrice || 0) * item.qty,
      purchaseDate: todayStr(),
      expiryDate: (() => {
        const pkg = pkgs.find(p => p.id === item.packageId);
        if (pkg?.expirationType === "relative") {
          const d = new Date();
          d.setDate(d.getDate() + (pkg.expirationDays || 90));
          return d.toISOString().split("T")[0];
        }
        return pkg?.expirationDate;
      })(),
      unitsRemaining: (pkgs.find(p => p.id === item.packageId)?.quantity || 1) * item.qty,
      status: "active",
      used: 0,
      retailValue: pkgs.find(p => p.id === item.packageId)?.retailValue || 0,
    }));

    // Create payment records for each package sale
    const payments = sales.map(sale => ({
      id: gid(),
      clientId: selectedClient.id,
      reservationId: null,
      amount: sale.totalPaid,
      type: "package",
      method: "cash",
      cardLast4: null,
      status: "completed",
      note: `Package purchase: ${sale.packageName}`,
      timestamp: new Date().toISOString(),
      stripePaymentIntentId: null,
      stripeRefundId: null,
      processedBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff",
    }));

    await save({ ...data, packageSales: [...(data.packageSales || []), ...sales], payments: [...(data.payments || []), ...payments] });
    setSuccess(true);
  };

  if (success) {
    return (
      <Modal title="Sale Complete" onClose={onClose}>
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>✓</div>
          <h3 style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>Sale Recorded</h3>
          <p style={{color:C.textMut,marginBottom:24}}>Sold {cartItems.reduce((sum, i) => sum + i.qty, 0)} package(s) to {selectedClient?.fields?.first_name}</p>
          <Btn onClick={onClose} variant="primary">Done</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Sell Package" wide onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,paddingBottom:12,borderBottom:`1px solid ${C.borderLight}`}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text}}>Select Client</div>
        <button onClick={() => {onClose(); nav && nav("settings", {tab:"packages"});}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textMut,fontSize:12,fontWeight:600,padding:"6px 12px",borderRadius:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="none"}><I.Settings size={14}/> Package Settings</button>
      </div>
      <div style={{marginBottom:24}}>
        {selectedClient ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:12,background:C.priLt,borderRadius:8}}>
            <div style={{fontSize:14,fontWeight:600,color:C.text}}>
              {selectedClient.fields?.first_name} {selectedClient.fields?.last_name}
            </div>
            <Btn onClick={() => { setSelectedClient(null); setSearchQ(""); }} variant="secondary" size="sm">Change</Btn>
          </div>
        ) : (
          <div style={{position:"relative"}}>
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by name or phone..."
              style={{width:"100%",padding:"10px 14px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:14,marginBottom:8,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box",transition:"all 0.15s",fontWeight:500}}
              className="no-focus-ring"
              onFocus={(e) => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.priLt}`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
            />
            {searchQ && filteredClients.length > 0 && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,border:`2px solid ${C.pri}`,borderRadius:8,borderTopLeftRadius:0,borderTopRightRadius:0,maxHeight:240,overflow:"auto",background:C.surface,zIndex:10,marginTop:-10,boxShadow:"0 8px 24px rgba(20,83,45,0.15)"}}>
                {filteredClients.map(cl => (
                  <div
                    key={cl.id}
                    onClick={() => { setSelectedClient(cl); setSearchQ(""); }}
                    style={{padding:"12px 14px",borderBottom:`1px solid ${C.borderLight}`,cursor:"pointer",fontSize:13,transition:"all 0.15s",fontWeight:500}}
                    onMouseEnter={(e) => e.currentTarget.style.background = C.priLt}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{fontWeight:600,color:C.text}}>{cl.fields?.first_name} {cl.fields?.last_name}</div>
                    <div style={{fontSize:11,color:C.textMut,marginTop:2}}>{cl.fields?.phone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{marginBottom:24}}>
        <label style={{display:"block",fontSize:13,fontWeight:600,color:C.text,marginBottom:10}}>Packages</label>
        {cartItems.map((item, idx) => (
          <div key={idx} style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
            <select
              value={item.packageId || ""}
              onChange={(e) => {
                const newItems = [...cartItems];
                newItems[idx].packageId = e.target.value || null;
                setCartItems(newItems);
              }}
              style={{flex:1,padding:"10px 14px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box",transition:"all 0.15s",fontWeight:500,appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2314532D' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:40}}
              className="no-focus-ring"
              onFocus={(e) => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.priLt}`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <option value="">Select a package...</option>
              {pkgs.map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — ${pkg.packagePrice?.toFixed(2)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={item.qty}
              onChange={(e) => {
                const newItems = [...cartItems];
                newItems[idx].qty = Math.max(1, parseInt(e.target.value) || 1);
                setCartItems(newItems);
              }}
              style={{width:70,padding:"10px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,textAlign:"center",background:C.surface,color:C.text,fontFamily:"inherit",boxSizing:"border-box",transition:"all 0.15s",fontWeight:500}}
              className="no-focus-ring"
              onFocus={(e) => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.priLt}`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
            />
            <button
              onClick={() => handleRemoveCart(idx)}
              style={{padding:8,background:"none",border:"none",cursor:"pointer",color:C.dan,display:"flex",alignItems:"center",justifyContent:"center",transition:"opacity 0.15s"}}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.7"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <I.X size={18}/>
            </button>
          </div>
        ))}
        <Btn onClick={handleAddCart} variant="secondary" size="sm" style={{marginTop:12}}>+ Add Another Package</Btn>
      </div>

      <div style={{marginBottom:24,padding:12,background:C.bg,borderRadius:8,textAlign:"right"}}>
        <div style={{fontSize:12,color:C.textMut,marginBottom:4}}>Total</div>
        <div style={{fontSize:20,fontWeight:700,color:C.text}}>${total.toFixed(2)}</div>
      </div>

      <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
        <Btn onClick={onClose} variant="secondary">Cancel</Btn>
        <Btn
          onClick={handleCompleteSale}
          variant="primary"
          disabled={!selectedClient || cartItems.some(item => !item.packageId)}
        >
          Complete Sale — ${total.toFixed(2)}
        </Btn>
      </div>
    </Modal>
  );
}

export { SellPackageModal };
