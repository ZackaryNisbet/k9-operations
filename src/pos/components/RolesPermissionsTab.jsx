import { ALL_PERM_KEYS, DEFAULT_ROLES, PERMISSION_CATEGORIES, buildPerms } from "../constants/permissions";
import { Badge, Btn, Card, Inp, Modal } from "./ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { LEGACY_ROLE_MAP, hasPermission } from "../lib/roles";
import { React, useState } from "react";
import { gid } from "../lib/format";

function RolesPermissionsTab({ data, save, profile }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("default");
  const [newDesc, setNewDesc] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editRoleId, setEditRoleId] = useState(null); // for editing name/color/desc
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("default");
  const [editDesc, setEditDesc] = useState("");

  const roles = data.roles || DEFAULT_ROLES;
  const totalPerms = ALL_PERM_KEYS.length;
  const canManage = hasPermission(profile, data, "manage_roles");

  const BADGE_COLORS = [
    { value:"default", label:"Gray" }, { value:"primary", label:"Blue" },
    { value:"success", label:"Green" }, { value:"warning", label:"Amber" },
    { value:"danger", label:"Red" }, { value:"info", label:"Sky" },
    { value:"accent", label:"Bronze" },
  ];
  const badgeColorMap = {default:{bg:C.surfaceHover,text:C.textSec},primary:{bg:C.priLt,text:C.pri},success:{bg:C.sucLt,text:C.suc},warning:{bg:C.warnLt,text:C.warn},danger:{bg:C.danLt,text:C.dan},info:{bg:C.infoLt,text:C.info},accent:{bg:C.accLt,text:C.accDk}};

  const enabledCount = (perms) => ALL_PERM_KEYS.filter(k => perms[k]).length;
  const [lockoutWarning, setLockoutWarning] = useState(null);

  // Determine which role the current user is on (so we can protect it)
  const myRoleId = LEGACY_ROLE_MAP[profile?.role] || profile?.role;
  // Critical permissions that, if removed from your own role, lock you out
  const SELF_PROTECTED = ["manage_roles", "view_settings"];

  // Check if a toggle would lock the current user out
  const wouldLockSelf = (roleId, permKey, newValue) => {
    if (roleId !== myRoleId) return false; // only protect your own role
    if (!SELF_PROTECTED.includes(permKey)) return false;
    return newValue === false; // turning OFF a critical perm on your own role
  };

  // Toggle a single permission for a role — saves immediately
  const togglePerm = async (roleId, permKey) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const newVal = !role.permissions[permKey];
    if (wouldLockSelf(roleId, permKey, newVal)) {
      setLockoutWarning("You can't remove \"" + (PERMISSION_CATEGORIES.flatMap(c => c.permissions).find(p => p.key === permKey)?.label || permKey) + "\" from your own role — it would lock you out.");
      setTimeout(() => setLockoutWarning(null), 4000);
      return;
    }
    const updated = roles.map(r => {
      if (r.id !== roleId) return r;
      return { ...r, permissions: { ...r.permissions, [permKey]: newVal } };
    });
    await save({ ...data, roles: updated });
  };

  // Toggle all permissions in a category for a role
  const toggleCategoryForRole = async (roleId, catKey) => {
    const cat = PERMISSION_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const allOn = cat.permissions.every(p => role.permissions[p.key]);
    // If turning OFF, check for self-lockout
    if (allOn && roleId === myRoleId) {
      const blocked = cat.permissions.filter(p => SELF_PROTECTED.includes(p.key));
      if (blocked.length > 0) {
        setLockoutWarning("Can't disable all — \"" + blocked.map(b => b.label).join(", ") + "\" would lock you out. Those will stay enabled.");
        setTimeout(() => setLockoutWarning(null), 4000);
      }
    }
    const updated = roles.map(r => {
      if (r.id !== roleId) return r;
      const np = { ...r.permissions };
      cat.permissions.forEach(p => {
        if (wouldLockSelf(roleId, p.key, !allOn)) return; // skip protected
        np[p.key] = !allOn;
      });
      return { ...r, permissions: np };
    });
    await save({ ...data, roles: updated });
  };

  // Toggle ALL permissions for a role (select all / deselect all)
  const toggleAllForRole = async (roleId) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const allOn = ALL_PERM_KEYS.every(k => role.permissions[k]);
    if (allOn && roleId === myRoleId) {
      setLockoutWarning("Protected permissions (Manage Roles, Settings) will stay enabled on your own role to prevent lockout.");
      setTimeout(() => setLockoutWarning(null), 4000);
    }
    const updated = roles.map(r => {
      if (r.id !== roleId) return r;
      const np = {};
      ALL_PERM_KEYS.forEach(k => {
        if (wouldLockSelf(roleId, k, !allOn)) { np[k] = true; return; } // keep protected ON
        np[k] = !allOn;
      });
      return { ...r, permissions: np };
    });
    await save({ ...data, roles: updated });
  };

  const createRole = async () => {
    if (!newName.trim()) return;
    const role = { id: "role_" + gid(), name: newName.trim(), builtIn: false, color: newColor, description: newDesc.trim(), permissions: buildPerms({}) };
    await save({ ...data, roles: [...roles, role] });
    setNewName(""); setNewColor("default"); setNewDesc(""); setShowCreate(false);
  };

  const duplicateRole = async (role) => {
    const dup = { ...role, id: "role_" + gid(), name: role.name + " (Copy)", builtIn: false, permissions: { ...role.permissions } };
    await save({ ...data, roles: [...roles, dup] });
  };

  const deleteRole = async (roleId) => {
    await save({ ...data, roles: roles.filter(r => r.id !== roleId) });
    setConfirmDelete(null);
  };

  const startEditRole = (role) => {
    setEditRoleId(role.id);
    setEditName(role.name);
    setEditColor(role.color || "default");
    setEditDesc(role.description || "");
  };

  const saveRoleEdit = async () => {
    const updated = roles.map(r => r.id === editRoleId ? { ...r, name: editName, color: editColor, description: editDesc } : r);
    await save({ ...data, roles: updated });
    setEditRoleId(null);
  };

  // Grid dimensions
  const colW = Math.max(100, Math.min(140, Math.floor(600 / roles.length)));
  const labelW = 220;

  // Checkbox component
  const Chk = ({ on, onClick }) => (
    <button onClick={onClick} style={{ width:22, height:22, borderRadius:6, border:`2px solid ${on ? C.pri : C.border}`, background:on ? C.pri : "#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:canManage?"pointer":"default", padding:0, flexShrink:0, transition:"all 0.12s" }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Lockout Warning Toast */}
      {lockoutWarning && (
        <div style={{ padding:"12px 16px", background:"#FEF3C7", border:"1.5px solid #F59E0B", borderRadius:10, display:"flex", alignItems:"center", gap:10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{ fontSize:13, color:"#92400E", flex:1, fontWeight:500 }}>{lockoutWarning}</div>
          <button onClick={() => setLockoutWarning(null)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, color:"#D97706" }}><I.X /></button>
        </div>
      )}
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Roles & Permissions</div>
          <div style={{ fontSize:13, color:C.textSec, marginTop:2 }}>Compare and configure permissions across all roles at a glance.</div>
        </div>
        {canManage && (
          <div style={{ display:"flex", gap:8 }}>
            <Btn size="sm" onClick={() => setShowCreate(!showCreate)} icon={showCreate ? <I.X /> : <I.Plus />}>
              {showCreate ? "Cancel" : "Create Role"}
            </Btn>
          </div>
        )}
      </div>

      {/* Create New Role Form */}
      {showCreate && (
        <Card style={{ padding:"20px 24px", background:C.priLt, border:`1.5px solid ${C.pri}20` }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:12 }}>New Custom Role</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <Inp label="Role Name" value={newName} onChange={v => setNewName(v)} placeholder="e.g. Kennel Tech" />
            <Inp label="Description" value={newDesc} onChange={v => setNewDesc(v)} placeholder="Brief description of this role" />
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:C.textSec, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Badge Color</div>
              <div style={{ display:"flex", gap:4 }}>
                {BADGE_COLORS.map(bc => {
                  const s = badgeColorMap[bc.value] || badgeColorMap.default;
                  return (<button key={bc.value} onClick={() => setNewColor(bc.value)} title={bc.label} style={{ width:28, height:28, borderRadius:8, background:s.bg, border:`2.5px solid ${newColor === bc.value ? s.text : "transparent"}`, cursor:"pointer" }} />);
                })}
              </div>
            </div>
            <div style={{ flex:1 }} />
            <Btn size="sm" onClick={createRole}>Create Role</Btn>
          </div>
        </Card>
      )}

      {/* Edit Role Name/Color Modal */}
      {editRoleId && (
        <Modal title="Edit Role" onClose={() => setEditRoleId(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Inp label="Role Name" value={editName} onChange={v => setEditName(v)} />
            <Inp label="Description" value={editDesc} onChange={v => setEditDesc(v)} placeholder="Brief description" />
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:C.textSec, marginBottom:6, textTransform:"uppercase" }}>Badge Color</div>
              <div style={{ display:"flex", gap:4 }}>
                {BADGE_COLORS.map(bc => {
                  const s = badgeColorMap[bc.value] || badgeColorMap.default;
                  return (<button key={bc.value} onClick={() => setEditColor(bc.value)} title={bc.label} style={{ width:32, height:32, borderRadius:8, background:s.bg, border:`2.5px solid ${editColor === bc.value ? s.text : "transparent"}`, cursor:"pointer" }} />);
                })}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <Btn onClick={saveRoleEdit}>Save</Btn>
              <Btn variant="ghost" onClick={() => setEditRoleId(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Permission Matrix Grid */}
      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth: labelW + roles.length * colW }}>
            {/* Column Headers = Role Names */}
            <thead>
              <tr style={{ background:`linear-gradient(135deg, ${C.pri}08, ${C.bg})` }}>
                <th style={{ position:"sticky", left:0, background:C.bg, zIndex:2, width:labelW, minWidth:labelW, padding:"16px 20px", textAlign:"left", borderBottom:`2px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.textMut, textTransform:"uppercase", letterSpacing:"0.05em" }}>Permission</div>
                </th>
                {roles.map(role => {
                  const ec = enabledCount(role.permissions);
                  const s = badgeColorMap[role.color] || badgeColorMap.default;
                  return (
                    <th key={role.id} style={{ width:colW, minWidth:colW, padding:"12px 8px", textAlign:"center", borderBottom:`2px solid ${C.border}`, borderRight:`1px solid ${C.borderLight}`, verticalAlign:"bottom" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <Badge color={role.color}>{role.name}</Badge>
                        <div style={{ fontSize:11, fontWeight:600, color:C.textMut }}>{ec}/{totalPerms}</div>
                        {canManage && (
                          <div style={{ display:"flex", gap:2, flexWrap:"wrap", justifyContent:"center" }}>
                            <button onClick={() => startEditRole(role)} style={{ fontSize:10, color:C.pri, background:"none", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit", padding:"1px 4px" }}>Edit</button>
                            <button onClick={() => duplicateRole(role)} style={{ fontSize:10, color:C.textMut, background:"none", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit", padding:"1px 4px" }}>Dup</button>
                            {!role.builtIn && (confirmDelete === role.id ? (
                              <button onClick={() => deleteRole(role.id)} style={{ fontSize:10, color:"#fff", background:C.dan, border:"none", cursor:"pointer", fontWeight:700, fontFamily:"inherit", padding:"1px 6px", borderRadius:4 }}>Yes</button>
                            ) : (
                              <button onClick={() => setConfirmDelete(role.id)} style={{ fontSize:10, color:C.dan, background:"none", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit", padding:"1px 4px" }}>Del</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Select All / Deselect All row */}
              {canManage && (
                <tr style={{ background:C.bg }}>
                  <td style={{ position:"sticky", left:0, background:C.bg, zIndex:2, padding:"8px 20px", borderBottom:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}`, fontSize:11, fontWeight:700, color:C.pri, textTransform:"uppercase" }}>
                    Toggle All
                  </td>
                  {roles.map(role => {
                    const allOn = ALL_PERM_KEYS.every(k => role.permissions[k]);
                    return (
                      <td key={role.id} style={{ padding:"8px", textAlign:"center", borderBottom:`1px solid ${C.border}`, borderRight:`1px solid ${C.borderLight}` }}>
                        <button onClick={() => toggleAllForRole(role.id)} style={{ fontSize:10, fontWeight:700, color: allOn ? C.dan : C.suc, background:"none", border:`1.5px solid ${allOn ? C.dan+"40" : C.suc+"40"}`, borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"inherit" }}>
                          {allOn ? "None" : "All"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {PERMISSION_CATEGORIES.map(cat => (
                <React.Fragment key={cat.key}>
                  {/* Category Header Row */}
                  <tr>
                    <td colSpan={1 + roles.length} style={{ position:"sticky", left:0, padding:"10px 20px", background:`linear-gradient(90deg, ${C.pri}0A, ${C.bg})`, borderBottom:`1px solid ${C.border}`, borderTop:`1px solid ${C.border}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:C.pri, textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat.label}</div>
                        <div style={{ flex:1, height:1, background:C.border }} />
                        {/* Per-role category toggles */}
                        {canManage && <div style={{ display:"flex", gap:4, marginLeft:8 }}>
                          {roles.map(role => {
                            const catAllOn = cat.permissions.every(p => role.permissions[p.key]);
                            const catSomeOn = cat.permissions.some(p => role.permissions[p.key]);
                            return (
                              <button key={role.id} onClick={() => toggleCategoryForRole(role.id, cat.key)} title={`${catAllOn ? "Deselect" : "Select"} all ${cat.label} for ${role.name}`}
                                style={{ width:20, height:20, borderRadius:5, border:`1.5px solid ${catAllOn ? C.suc : catSomeOn ? C.pri+"60" : C.border}`, background:catAllOn ? C.suc : catSomeOn ? C.pri+"20" : "transparent", display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:9, color:catAllOn ? "#fff" : C.textMut, fontWeight:700 }}>
                                {catAllOn ? "\u2713" : catSomeOn ? "\u2022" : ""}
                              </button>
                            );
                          })}
                        </div>}
                      </div>
                    </td>
                  </tr>
                  {/* Permission Rows */}
                  {cat.permissions.map((perm, pi) => (
                    <tr key={perm.key} style={{ background: pi % 2 === 0 ? C.surface : C.bg }}>
                      <td style={{ position:"sticky", left:0, background: pi % 2 === 0 ? C.surface : C.bg, zIndex:1, padding:"10px 20px", borderBottom:`1px solid ${C.borderLight}`, borderRight:`1px solid ${C.border}` }}>
                        <div style={{ fontSize:13, fontWeight:600, color:C.text, lineHeight:1.3 }}>{perm.label}</div>
                        <div style={{ fontSize:11, color:C.textMut, lineHeight:1.3, marginTop:1 }}>{perm.desc}</div>
                      </td>
                      {roles.map(role => {
                        const on = role.permissions[perm.key];
                        return (
                          <td key={role.id} style={{ padding:"10px 8px", textAlign:"center", borderBottom:`1px solid ${C.borderLight}`, borderRight:`1px solid ${C.borderLight}` }}>
                            {canManage ? (
                              <Chk on={on} onClick={() => togglePerm(role.id, perm.key)} />
                            ) : (
                              on ? <span style={{ color:C.suc, fontSize:16 }}>\u2713</span> : <span style={{ color:C.border, fontSize:16 }}>\u2014</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            {/* Footer: total counts */}
            <tfoot>
              <tr style={{ background:C.bg }}>
                <td style={{ position:"sticky", left:0, background:C.bg, zIndex:2, padding:"14px 20px", borderTop:`2px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, fontWeight:800, color:C.text, textTransform:"uppercase", letterSpacing:"0.04em" }}>Total Enabled</div>
                </td>
                {roles.map(role => {
                  const ec = enabledCount(role.permissions);
                  const pct = Math.round((ec / totalPerms) * 100);
                  return (
                    <td key={role.id} style={{ padding:"14px 8px", textAlign:"center", borderTop:`2px solid ${C.border}`, borderRight:`1px solid ${C.borderLight}` }}>
                      <div style={{ fontSize:16, fontWeight:800, color: pct === 100 ? C.suc : pct > 50 ? C.pri : C.warn }}>{ec}</div>
                      <div style={{ fontSize:11, color:C.textMut }}>of {totalPerms}</div>
                      <div style={{ width:"80%", height:4, borderRadius:2, background:C.surfaceHover, margin:"6px auto 0", overflow:"hidden" }}>
                        <div style={{ width: pct + "%", height:"100%", borderRadius:2, background: pct === 100 ? C.suc : pct > 50 ? C.pri : pct > 0 ? C.warn : C.border, transition:"width 0.3s" }} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

export { RolesPermissionsTab };
