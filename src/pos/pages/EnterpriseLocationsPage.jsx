import { Badge, Btn, Card, Inp, Modal } from "../components/ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { K9_LOCATIONS } from "../constants/locations";
import { supabase } from "../../supabaseClient";
import { useState } from "react";

function EnterpriseLocationsPage({ data, save, nav, profile, handleLocationChange, addGlobalToast, allLocations, refreshLocations }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // location object to confirm delete
  const [deleting, setDeleting] = useState(false);
  const locations = (allLocations || K9_LOCATIONS).filter(l => !l.isEnterprise);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const { data: result, error } = await supabase.rpc('create_location', {
        p_name: newName.trim(),
        p_region: newRegion.trim()
      });
      if (error) {
        addGlobalToast({ message: `Failed to create location: ${error.message}`, type: 'error' });
      } else if (result && !result.success) {
        addGlobalToast({ message: result.message || 'Failed to create location', type: 'error' });
      } else {
        addGlobalToast({ message: `"${newName.trim()}" location created successfully!` });
        if (refreshLocations) await refreshLocations();
      }
    } catch (err) {
      addGlobalToast({ message: `Error: ${err.message}`, type: 'error' });
    }
    setNewName(""); setNewRegion(""); setShowAdd(false);
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      const { data: result, error } = await supabase.rpc('delete_location', {
        p_location_id: deleteConfirm.id
      });
      if (error) {
        addGlobalToast({ message: `Failed to delete: ${error.message}`, type: 'error' });
      } else if (result && !result.success) {
        addGlobalToast({ message: result.message || 'Failed to delete location', type: 'error' });
      } else {
        addGlobalToast({ message: `"${deleteConfirm.name}" has been deleted.` });
        if (refreshLocations) await refreshLocations();
      }
    } catch (err) {
      addGlobalToast({ message: `Error: ${err.message}`, type: 'error' });
    }
    setDeleteConfirm(null);
    setDeleting(false);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <div>
          <h2 style={{fontSize:24,fontWeight:700,color:C.text,margin:0}}>Location Management</h2>
          <div style={{fontSize:13,color:C.textSec,marginTop:4}}>Manage your K9 Operations locations</div>
        </div>
        <Btn onClick={()=>setShowAdd(!showAdd)} icon={<I.Plus/>}>Add Location</Btn>
      </div>

      {showAdd && (
        <Card style={{marginBottom:20,padding:"20px 24px"}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>New Location</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:12,alignItems:"end"}}>
            <Inp label="Location Name" value={newName} onChange={setNewName} placeholder="e.g. Adair Forsythe"/>
            <Inp label="Region / State" value={newRegion} onChange={setNewRegion} placeholder="e.g. New Jersey"/>
            <Btn variant="success" onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create"}</Btn>
          </div>
        </Card>
      )}

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 140px",padding:"12px 20px",borderBottom:`2px solid ${C.border}`,background:C.bg}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Name</div>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Region</div>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Slug</div>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Status</div>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Actions</div>
        </div>
        {locations.map(loc => (
          <div key={loc.id} style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 140px",padding:"14px 20px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:C.priLt,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{loc.name}</div>
                <div style={{fontSize:11,color:C.textMut}}>ID: {typeof loc.id === "string" && loc.id.length > 12 ? loc.id.slice(0,8)+"..." : loc.id}</div>
              </div>
            </div>
            <div style={{fontSize:13,color:C.textSec}}>{loc.region || "—"}</div>
            <div style={{fontSize:12,color:C.textMut,fontFamily:"monospace"}}>/{loc.slug}</div>
            <div><Badge color="success" size="sm">Active</Badge></div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{ handleLocationChange(loc.id); }} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.pri,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Open</button>
              {(loc.slug === "demo" || loc.name === "Demo") ? (
                <span style={{padding:"4px 10px",borderRadius:6,background:`${C.pri}10`,color:C.pri,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}} title="Demo location is protected">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Protected
                </span>
              ) : (
              <button onClick={()=> setDeleteConfirm(loc)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.dan}30`,background:"transparent",color:C.dan,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}} title="Delete location">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
              )}
            </div>
          </div>
        ))}
        {locations.length === 0 && <div style={{padding:40,textAlign:"center",color:C.textMut,fontSize:14}}>No locations configured</div>}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal title="Delete Location" onClose={() => setDeleteConfirm(null)} width={480}>
          <div style={{textAlign:"center",padding:"12px 0 24px"}}>
            <div style={{width:56,height:56,borderRadius:28,background:`${C.dan}14`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Delete "{deleteConfirm.name}"?</div>
            <div style={{fontSize:13,color:C.textSec,lineHeight:1.6,maxWidth:360,margin:"0 auto"}}>
              This will permanently delete this location and all of its data including clients, reservations, dogs, and settings. This action cannot be undone.
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <Btn variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <button onClick={handleDelete} disabled={deleting} style={{padding:"9px 24px",borderRadius:8,border:"none",background:C.dan,color:"#fff",fontSize:13,fontWeight:700,cursor:deleting?"not-allowed":"pointer",fontFamily:"inherit",opacity:deleting?0.6:1}}>
              {deleting ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { EnterpriseLocationsPage };
