import { Badge, Btn, Card, CustomSelect, Inp } from "./ui";
import { C } from "../constants/colors";
import { DEFAULT_ROLES } from "../constants/permissions";
import { I } from "../icons";
import { getRoleColor, getRoleName } from "../lib/roles";
import { gid } from "../lib/format";
import { supabase } from "../../supabaseClient";
import { useEffect, useState } from "react";

function TeamTab({ profile, data, save }) {
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("role_staff");
  const [inviteMsg, setInviteMsg] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);

  const isOwner = profile?.role === "owner";
  const isManager = profile?.role === "manager";
  const canManage = isOwner || isManager;
  const pendingInvites = data.pendingInvites || [];

  useEffect(() => { fetchTeam(); }, []);

  const fetchTeam = async () => {
    setTeamLoading(true);
    // Load team via profile_locations junction table
    const { data: plRows, error: plErr } = await supabase
      .from("profile_locations")
      .select("profile_id, role_id")
      .eq("location_id", profile.location_id);
    if (!plErr && plRows && plRows.length > 0) {
      const profileIds = plRows.map(r => r.profile_id);
      const { data: members, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", profileIds);
      if (!error) setTeam(members || []);
      else setTeam([profile]);
    } else {
      // Fallback: try legacy query
      const { data: members, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("location_id", profile.location_id);
      if (!error) setTeam(members || []);
      else setTeam([profile]);
    }
    setTeamLoading(false);
  };

  const updateRole = async (userId, newRole) => {
    // Update both profiles.role (legacy) and profile_locations.role_id (new system)
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    if (error) console.error("Failed to update role:", error);
    fetchTeam();
  };

  const removeMember = async (userId) => {
    const { data: result, error } = await supabase.rpc('delete_team_member', { target_user_id: userId });
    if (error) console.error("Failed to delete member:", error);
    else if (result && !result.success) console.error("Delete failed:", result.error);
    setConfirmRemove(null);
    fetchTeam();
  };

  const [inviteSending, setInviteSending] = useState(false);
  const [inviteCredentials, setInviteCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const CopyBtn = ({ text, field, label = "Copy", size = "sm" }) => {
    const isCopied = copiedField === field;
    const handleCopy = () => {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(prev => prev === field ? null : prev), 2000);
    };
    const isBig = size === "lg";
    return (
      <button onClick={handleCopy} title={isCopied ? "Copied!" : label}
        style={{
          background: isCopied ? C.suc + "18" : "none",
          border: `1.5px solid ${isCopied ? C.suc : C.border}`,
          borderRadius: isBig ? 8 : 6,
          padding: isBig ? "8px 18px" : "4px 10px",
          fontSize: isBig ? 12 : 11,
          fontWeight: 600,
          color: isCopied ? C.suc : C.textSec,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.25s ease",
          minWidth: isBig ? 160 : 70,
          justifyContent: "center",
        }}>
        <span style={{
          display: "inline-flex", alignItems: "center",
          transform: isCopied ? "scale(1.15)" : "scale(1)",
          transition: "transform 0.25s ease",
        }}>
          {isCopied ? <I.CheckCircle /> : <I.Clipboard />}
        </span>
        <span>{isCopied ? "Copied!" : label}</span>
      </button>
    );
  };

  const addInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    setInviteCredentials(null);
    const inv = {
      id: gid(),
      email: inviteEmail.trim().toLowerCase(),
      name: inviteName.trim(),
      role: inviteRole,
      invitedAt: new Date().toISOString(),
    };
    // Save the pending invite to location_pending_invites table (via useData save)
    await save({ ...data, pendingInvites: [...pendingInvites, inv] });

    // Try to create user with temp password via Supabase Admin API
    let created = false;
    let tempPassword = null;
    try {
      const { data: result, error: rpcError } = await supabase.rpc('send_team_invite', {
        invite_email: inv.email,
        invite_name: inv.name || '',
      });
      if (rpcError) {
        console.error('send_team_invite RPC error:', rpcError);
        alert('Invite RPC error: ' + (rpcError.message || JSON.stringify(rpcError)));
      } else if (result && !result.success) {
        console.error('send_team_invite returned failure:', result);
        alert('Invite failed: ' + (result.error || result.message || JSON.stringify(result)));
      } else if (result && result.success && result.temp_password) {
        created = true;
        tempPassword = result.temp_password;
      }
    } catch (e) {
      console.error('send_team_invite exception:', e);
      alert('Invite exception: ' + e.message);
    }

    setInviteEmail(""); setInviteName(""); setInviteRole("role_staff");
    setInviteSending(false);

    if (created && tempPassword) {
      setInviteCredentials({ email: inv.email, tempPassword, name: inv.name || inv.email });
      setInviteMsg(null);
    } else {
      setInviteMsg(inv.name || inv.email);
    }
  };

  const removeInvite = async (invId) => {
    await save({ ...data, pendingInvites: pendingInvites.filter(i => i.id !== invId) });
  };

  const autoDeact = data.teamSettings?.autoDeactivate || {};
  const autoDeactEnabled = autoDeact.enabled || false;
  const autoDeactDays = autoDeact.days || 30;
  const fmtDt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };
  const daysSince = (iso) => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Auto-deactivate toggle */}
      {isOwner && (
        <Card style={{ padding: "16px 24px" }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Auto-Deactivate Inactive Accounts</div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop:2 }}>Automatically deactivate team members who haven't logged in within the specified number of days.</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:12,color:C.textSec}}>After</span>
                <input type="number" value={autoDeactDays} min={1} max={365}
                  onChange={e=>save({...data,teamSettings:{...data.teamSettings,autoDeactivate:{...autoDeact,days:parseInt(e.target.value)||30}}})}
                  style={{width:60,padding:"4px 8px",borderRadius:6,border:`1.5px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.text,fontFamily:"inherit",textAlign:"center"}} />
                <span style={{fontSize:12,color:C.textSec}}>days</span>
              </div>
              <button onClick={()=>save({...data,teamSettings:{...data.teamSettings,autoDeactivate:{...autoDeact,enabled:!autoDeactEnabled}}})}
                style={{width:44,height:24,borderRadius:12,border:"none",background:autoDeactEnabled?C.suc:C.border,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                <div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:autoDeactEnabled?23:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </button>
            </div>
          </div>
        </Card>
      )}
      {/* Current Team Members */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Team Members</div>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            {canManage ? "Manage your team's access and roles." : "View your team members."}
          </p>
        </div>
        {teamLoading ? (
          <div style={{ padding: "24px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading team...</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isOwner ? "minmax(100px,1fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(100px,0.8fr) 100px 70px" : "minmax(100px,1fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(100px,0.8fr) 100px", padding: "10px 24px", background: C.bg, borderTop: "1px solid " + C.border, borderBottom: "1px solid " + C.border, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <div>Name</div><div>Email</div><div>First Login</div><div>Last Active</div><div>Role</div>{isOwner && <div>Action</div>}
            </div>
            {team.sort((a, b) => {
              const ro = { owner: 0, manager: 1, staff: 2 };
              return (ro[a.role] || 9) - (ro[b.role] || 9);
            }).map(m => {
              const daysInactive = daysSince(m.last_accessed_at || m.last_sign_in_at);
              const isInactive = autoDeactEnabled && daysInactive !== null && daysInactive >= autoDeactDays;
              return (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: isOwner ? "minmax(100px,1fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(100px,0.8fr) 100px 70px" : "minmax(100px,1fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(100px,0.8fr) 100px", padding: "14px 24px", borderBottom: "1px solid " + C.borderLight, alignItems: "center", background: isInactive ? C.danLt : "transparent" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                  {m.full_name || "\u2014"}
                  {m.id === profile.id && <span style={{ marginLeft: 8, fontSize: 11, color: C.acc, fontWeight: 700 }}>(You)</span>}
                  {isInactive && m.id !== profile.id && <div style={{fontSize:10,color:C.dan,fontWeight:600}}>Inactive {daysInactive}d</div>}
                </div>
                <div style={{ fontSize: 13, color: C.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.email}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{fmtDt(m.created_at)}</div>
                <div style={{ fontSize: 12, color: isInactive ? C.dan : C.textSec, fontWeight: isInactive ? 600 : 400 }}>{fmtDt(m.last_accessed_at || m.last_sign_in_at)}</div>
                <div>
                  {isOwner && m.id !== profile.id ? (
                    <CustomSelect value={m.role||"staff"} onChange={v=>updateRole(m.id,v)} options={[...(data.roles||DEFAULT_ROLES).map(r=>({value:r.id,label:r.name})),...(!((data.roles||[]).some(r=>r.id===m.role))&&m.role?[{value:m.role,label:m.role}]:[])]} small style={{width:130}}/>
                  ) : (
                    <Badge color={getRoleColor(m, data)}>{getRoleName(m, data)}</Badge>
                  )}
                </div>
                {isOwner && (
                <div style={{ textAlign: "center" }}>
                  {m.id !== profile.id ? (
                    confirmRemove === m.id ? (
                      <button onClick={() => removeMember(m.id)} title="Confirm delete"
                        style={{ background: C.dan, border: "none", cursor: "pointer", color: "#fff", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>
                        Delete
                      </button>
                    ) : (
                      <button onClick={() => setConfirmRemove(m.id)} title="Delete user"
                        style={{ background: "none", border: `1.5px solid ${C.dan}40`, cursor: "pointer", color: C.dan, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )
                  ) : <span/>}
                </div>
                )}
              </div>
              );
            })}
            {team.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No team members found.</div>
            )}
          </>
        )}
      </Card>

      {/* Invite New Member */}
      {canManage && (
        <Card style={{ padding: "24px 28px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Invite Team Member</div>
          <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>
            Enter their details and click Invite. They'll get a temporary password to sign in with.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px auto", gap: 12, alignItems: "flex-end" }}>
            <Inp label="Email" type="email" value={inviteEmail} onChange={v => setInviteEmail(v)} placeholder="staff@k9operations.com" />
            <Inp label="Full Name" value={inviteName} onChange={v => setInviteName(v)} placeholder="Jane Smith" />
            <Inp label="Role" type="select" value={inviteRole} onChange={v => setInviteRole(v)} options={(data.roles || DEFAULT_ROLES).map(r => ({ value: r.id, label: r.name }))} />
            <Btn onClick={addInvite} disabled={inviteSending}>{inviteSending ? "Sending..." : "Invite"}</Btn>
          </div>
          {inviteCredentials && (
            <div style={{ marginTop: 16, padding: "20px 24px", borderRadius: 12, background: C.sucLt, border: "1.5px solid " + C.suc + "30" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <I.CheckCircle />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.suc }}>Account created for {inviteCredentials.name}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
                A welcome email with these credentials has been sent. They'll be prompted to set a permanent password on first sign-in.
              </div>
              <div style={{ background: C.surface, borderRadius: 10, padding: "16px 20px", border: "1.5px solid " + C.border }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Email</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: "monospace" }}>{inviteCredentials.email}</div>
                  </div>
                  <CopyBtn text={inviteCredentials.email} field="invite-email" label="Copy" />
                </div>
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Temporary Password</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.pri, fontFamily: "monospace", letterSpacing: "0.08em" }}>{inviteCredentials.tempPassword}</div>
                  </div>
                  <CopyBtn text={inviteCredentials.tempPassword} field="invite-password" label="Copy" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <CopyBtn
                  text={`You've been invited to K9 Operations!\n\nSign in at: k9operations.com\nEmail: ${inviteCredentials.email}\nTemporary Password: ${inviteCredentials.tempPassword}\n\nYou'll be asked to set a permanent password on your first login.`}
                  field="invite-all" label="Copy All Credentials" size="lg"
                />
                <button onClick={() => setInviteCredentials(null)} style={{ padding: "8px 18px", background: "none", color: C.textSec, border: "1.5px solid " + C.border, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {inviteMsg && (
            <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 12, background: C.sucLt, border: "1.5px solid " + C.suc + "30" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <I.CheckCircle />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.suc }}>Invitation saved for {inviteMsg}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>
                The auto-invite couldn't be sent. Share these instructions manually:
              </div>
              <div style={{ background: C.surface, borderRadius: 8, padding: "12px 16px", border: "1px solid " + C.border, fontSize: 13, color: C.text, lineHeight: 1.6, fontFamily: "inherit" }}>
                <div>1. Go to <strong>k9operations.com</strong></div>
                <div>2. Click <strong>"Create Account"</strong> using your email</div>
                <div>3. Check your inbox and confirm your email</div>
                <div>4. Sign in — you'll be automatically connected to the team</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => {
                  navigator.clipboard.writeText("You've been invited to K9 Operations! Here's how to get started:\n\n1. Go to k9operations.com\n2. Click \"Create Account\" using your email address\n3. Check your inbox and confirm your email\n4. Sign in \u2014 you'll be automatically connected to the team!\n\nSee you there!");
                  setInviteMsg(null);
                }} style={{ padding: "7px 16px", background: C.pri, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Copy Instructions
                </button>
                <button onClick={() => setInviteMsg(null)} style={{ padding: "7px 16px", background: "none", color: C.textSec, border: "1.5px solid " + C.border, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Pending Invitations</div>
            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>These people have been invited but haven't signed up yet.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 80px", padding: "10px 24px", background: C.bg, borderTop: "1px solid " + C.border, borderBottom: "1px solid " + C.border, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div>Email</div><div>Name</div><div>Role</div><div/>
          </div>
          {pendingInvites.map(inv => {
            const daysAgo = inv.invitedAt ? Math.floor((Date.now() - new Date(inv.invitedAt).getTime()) / 86400000) : null;
            const timeLabel = daysAgo === null ? "" : daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : daysAgo + " days ago";
            return (
              <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 80px", padding: "14px 24px", borderBottom: "1px solid " + C.borderLight, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inv.email}</div>
                  {timeLabel && <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>Invited {timeLabel}</div>}
                </div>
                <div style={{ fontSize: 13, color: C.textSec }}>{inv.name || "\u2014"}</div>
                <Badge>{((data.roles || DEFAULT_ROLES).find(r => r.id === inv.role) || {}).name || inv.role}</Badge>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {canManage && (
                    <>
                      <button onClick={() => {
                        navigator.clipboard.writeText("You've been invited to K9 Operations! Here's how to get started:\n\n1. Go to k9operations.com\n2. Click \"Create Account\" using your email address (" + inv.email + ")\n3. Check your inbox and confirm your email\n4. Sign in \u2014 you'll be automatically connected to the team!\n\nSee you there!");
                      }} title="Copy invite instructions"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 4, borderRadius: 6 }}>
                        <I.Send />
                      </button>
                      <button onClick={() => removeInvite(inv.id)} title="Cancel invitation"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 4, borderRadius: 6 }}>
                        <I.X />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

export { TeamTab };
