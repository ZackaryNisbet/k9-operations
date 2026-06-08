import { C } from "../constants/colors";
import { Card } from "../components/ui";
import { supabase } from "../../supabaseClient";
import { useEffect, useState } from "react";

function EnterpriseUsersPage({ profile, allLocations }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc('list_enterprise_users');
    if (error) { console.error('list_enterprise_users error:', error); setLoading(false); return; }
    setUsers(result || []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleToggleAdmin = async (userId, isCurrentlyAdmin) => {
    setActionLoading(userId);
    const { data: result, error } = await supabase.rpc('set_enterprise_admin', { p_user_id: userId, p_is_admin: !isCurrentlyAdmin });
    if (error) { console.error('set_enterprise_admin error:', error); setActionLoading(null); return; }
    if (result && !result.success) { alert(result.message); setActionLoading(null); return; }
    await loadUsers();
    setActionLoading(null);
  };

  const isOwner = profile?.role === 'owner';
  const enterpriseAdmins = users.filter(u => u.role === 'enterprise_admin');
  const owners = users.filter(u => u.role === 'owner');
  const otherUsers = users.filter(u => u.role !== 'owner' && u.role !== 'enterprise_admin');
  const locations = (allLocations || []).filter(l => !l.isEnterprise);
  const locMap = {};
  locations.forEach(l => { locMap[l.id] = l.name; });

  const roleBadge = (role) => {
    const colors = { owner: { bg: C.acc+"20", color: C.acc }, enterprise_admin: { bg: C.pri+"15", color: C.pri }, manager: { bg: C.suc+"15", color: C.suc }, staff: { bg: C.border, color: C.textSec } };
    const c = colors[role] || colors.staff;
    const labels = { owner: "Owner", enterprise_admin: "Enterprise Admin", manager: "Manager", staff: "Staff" };
    return <span style={{padding:"3px 10px",borderRadius:6,background:c.bg,color:c.color,fontSize:11,fontWeight:700}}>{labels[role] || role}</span>;
  };

  const userRow = (u, showActions) => (
    <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 140px",gap:12,alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${C.borderLight}`}}>
      <div>
        <div style={{fontSize:14,fontWeight:600,color:C.text}}>{u.full_name || "—"}</div>
        <div style={{fontSize:12,color:C.textMut}}>{u.email}</div>
      </div>
      <div>{roleBadge(u.role)}</div>
      <div style={{fontSize:13,color:C.textSec}}>{u.location_name || locMap[u.location_id] || "—"}</div>
      <div style={{textAlign:"right"}}>
        {showActions && isOwner && u.role !== 'owner' && u.id !== profile?.id && (
          <button onClick={() => handleToggleAdmin(u.id, u.role === 'enterprise_admin')}
            disabled={actionLoading === u.id}
            style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${u.role === 'enterprise_admin' ? C.err+"40" : C.pri+"40"}`,background:u.role === 'enterprise_admin' ? C.err+"08" : C.priLt,color:u.role === 'enterprise_admin' ? C.err : C.pri,fontSize:12,fontWeight:600,cursor:actionLoading === u.id ? "default" : "pointer",fontFamily:"inherit",opacity:actionLoading === u.id ? 0.5 : 1}}>
            {actionLoading === u.id ? "..." : u.role === 'enterprise_admin' ? "Remove Admin" : "Make Admin"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{marginBottom:28}}>
        <h2 style={{fontSize:24,fontWeight:700,color:C.text,margin:0}}>User Management</h2>
        <div style={{fontSize:13,color:C.textSec,marginTop:4}}>Manage enterprise admin access across all locations</div>
      </div>

      {loading ? (
        <Card style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:14,color:C.textSec}}>Loading users...</div>
        </Card>
      ) : (
        <>
          {/* Owners */}
          <div style={{fontSize:13,fontWeight:700,color:C.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Owners</div>
          <Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 140px",gap:12,padding:"10px 20px",borderBottom:`2px solid ${C.border}`,background:C.bg}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>NAME</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>ROLE</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>LOCATION</div>
              <div/>
            </div>
            {owners.map(u => userRow(u, false))}
            {owners.length === 0 && <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>No owners found</div>}
          </Card>

          {/* Enterprise Admins */}
          <div style={{fontSize:13,fontWeight:700,color:C.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Enterprise Admins</div>
          <Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 140px",gap:12,padding:"10px 20px",borderBottom:`2px solid ${C.border}`,background:C.bg}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>NAME</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>ROLE</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>LOCATION</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textMut,textAlign:"right"}}>ACTIONS</div>
            </div>
            {enterpriseAdmins.map(u => userRow(u, true))}
            {enterpriseAdmins.length === 0 && <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>No enterprise admins yet</div>}
          </Card>

          {/* Other Users — Promotable */}
          {isOwner && otherUsers.length > 0 && (
            <>
              <div style={{fontSize:13,fontWeight:700,color:C.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Other Users</div>
              <Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 140px",gap:12,padding:"10px 20px",borderBottom:`2px solid ${C.border}`,background:C.bg}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>NAME</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>ROLE</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut}}>LOCATION</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut,textAlign:"right"}}>ACTIONS</div>
                </div>
                {otherUsers.map(u => userRow(u, true))}
              </Card>
            </>
          )}

          {!isOwner && (
            <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13,background:C.bg,borderRadius:12,border:`1px solid ${C.borderLight}`}}>
              Only owners can promote or demote enterprise admins.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { EnterpriseUsersPage };
