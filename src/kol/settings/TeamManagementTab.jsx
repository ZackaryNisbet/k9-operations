// K9 Operations — TeamManagementTab
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function TeamManagementTab({ profile, data, save }) {
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("pct");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteCredentials, setInviteCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Determine current user's Lite role for permission gating
  const myRole = profile?.role || "pct";
  const canManage = ["manager", "location_admin", "enterprise_admin", "owner"].includes(myRole);
  const canCreateEnterprise = ["enterprise_admin", "owner"].includes(myRole);

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    setTeamLoading(true);
    const { data: members, error } = await supabase
      .from("lite_profiles")
      .select("*")
      .eq("location_id", profile?.location_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (!error) setTeam(members || []);
    else setTeam([]);
    setTeamLoading(false);
  };

  const updateRole = async (profileId, newRole) => {
    const { error } = await supabase
      .from("lite_profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (!error) fetchTeam();
  };

  const removeMember = async (profileId) => {
    // Soft-delete: set is_active = false
    const { error } = await supabase
      .from("lite_profiles")
      .update({ is_active: false })
      .eq("id", profileId);
    if (!error) {
      setConfirmRemove(null);
      fetchTeam();
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteCredentials(null);

    // Enterprise admin check
    if (inviteRole === "enterprise_admin" && !canCreateEnterprise) {
      setInviteError("Only Enterprise Admins can create other Enterprise Admins.");
      setInviting(false);
      return;
    }

    try {
      // Call server-side RPC — creates auth user + lite_profiles row in one shot
      // Uses SECURITY DEFINER + Supabase Vault service_role_key, so the
      // caller's session is NOT affected (no accidental sign-out).
      const { data: result, error: rpcError } = await supabase.rpc('send_lite_invite', {
        invite_email: inviteEmail.trim().toLowerCase(),
        invite_name: inviteName.trim(),
        invite_role: inviteRole,
        invite_location: profile?.location_id || null,
      });

      if (rpcError) {
        setInviteError("RPC error: " + rpcError.message);
        setInviting(false);
        return;
      }

      if (result && !result.success) {
        setInviteError(result.error || "Invite failed.");
        setInviting(false);
        return;
      }

      setInviteCredentials({
        email: inviteEmail.trim().toLowerCase(),
        password: result.temp_password,
        name: inviteName.trim(),
      });
      setInviteEmail("");
      setInviteName("");
      setInviteRole("pct");
      fetchTeam();
    } catch (err) {
      setInviteError("Unexpected error: " + err.message);
    }
    setInviting(false);
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getRoleColor = (role) => {
    const map = { enterprise_admin: "#8B5CF6", location_admin: "#3B82F6", manager: "#0891B2", supervisor: "#F59E0B", csr: "#10B981", pct: "#6B7280" };
    return map[role] || "#6B7280";
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Team Management</h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.textSec }}>Manage your K9 Operations Lite team members and roles.</p>

      {teamLoading ? (
        <div style={{ padding: "40px", textAlign: "center", color: C.textMut }}>Loading team...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Team members table */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1.5fr 120px 1fr 80px", gap: 12, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div>Name</div><div>Email</div><div>Role</div><div>Last Active</div><div/>
            </div>
            {team.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No team members yet. Invite your first member below.</div>
            )}
            {team.map(m => (
              <div key={m.id} style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: "1fr 1.5fr 120px 1fr 80px", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.full_name || "—"}</div>
                <div style={{ fontSize: 13, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                <div>
                  {canManage && m.user_id !== profile?.id ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.text, cursor: "pointer" }}>
                      {LEAN_ROLES.filter(r => r.id !== "enterprise_admin" || canCreateEnterprise).map(r => (
                        <option key={r.id} value={r.id}>{r.shortName}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: getRoleColor(m.role) + "18", color: getRoleColor(m.role), textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {(LEAN_ROLES.find(r => r.id === m.role) || {}).shortName || m.role}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textSec }}>{m.last_active ? new Date(m.last_active).toLocaleDateString() : "—"}</div>
                <div>
                  {canManage && m.user_id !== profile?.id && (
                    confirmRemove === m.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", color: C.dan, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}>Confirm</button>
                        <button onClick={() => setConfirmRemove(null)} style={{ background: "none", border: "none", color: C.textMut, cursor: "pointer", fontSize: 11, fontWeight: 500, padding: 0 }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRemove(m.id)} style={{ background: "none", border: "none", color: C.dan, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>Remove</button>
                    )
                  )}
                </div>
              </div>
            ))}
          </Card>

          {/* Invite new member */}
          {canManage && (
            <Card style={{ padding: "20px 24px" }}>
              <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: C.text }}>Invite New Member</h4>

              {inviteCredentials ? (
                <div style={{ padding: "16px 20px", background: "#F0FDF4", border: "1.5px solid #A7F3D0", borderRadius: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#065F46", marginBottom: 12 }}>Account created for {inviteCredentials.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#065F46", minWidth: 70 }}>Email:</span>
                      <code style={{ flex: 1, fontSize: 13, color: "#065F46", background: "#ECFDF5", padding: "4px 8px", borderRadius: 4 }}>{inviteCredentials.email}</code>
                      <button onClick={() => copyToClipboard(inviteCredentials.email, "email")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: copiedField === "email" ? "#10B981" : "#065F46" }}>{copiedField === "email" ? "Copied!" : "Copy"}</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#065F46", minWidth: 70 }}>Password:</span>
                      <code style={{ flex: 1, fontSize: 13, color: "#065F46", background: "#ECFDF5", padding: "4px 8px", borderRadius: 4 }}>{inviteCredentials.password}</code>
                      <button onClick={() => copyToClipboard(inviteCredentials.password, "pw")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: copiedField === "pw" ? "#10B981" : "#065F46" }}>{copiedField === "pw" ? "Copied!" : "Copy"}</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#065F46", opacity: 0.7 }}>Share these credentials with the new team member. They should change their password after first login.</div>
                  <button onClick={() => setInviteCredentials(null)} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, border: `1px solid #A7F3D0`, background: "transparent", color: "#065F46", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px auto", gap: 12, alignItems: "flex-end" }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</label>
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Full Name</label>
                      <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</label>
                      <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: C.surface, boxSizing: "border-box" }}>
                        {LEAN_ROLES.filter(r => r.id !== "enterprise_admin" || canCreateEnterprise).map(r => (
                          <option key={r.id} value={r.id} disabled={r.id === "enterprise_admin" && !canCreateEnterprise}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim() || !inviteName.trim()} style={{ padding: "10px 20px", background: inviting || !inviteEmail.trim() || !inviteName.trim() ? C.textMut : C.pri, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: inviting ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {inviting ? "Creating..." : "Invite"}
                    </button>
                  </div>
                  {inviteError && <div style={{ marginTop: 10, fontSize: 12, color: C.dan, fontWeight: 500 }}>{inviteError}</div>}
                </>
              )}
            </Card>
          )}

          {!canManage && (
            <div style={{ padding: "16px 20px", background: C.bg, borderRadius: 10, fontSize: 13, color: C.textMut, textAlign: "center" }}>
              You need Manager or higher permissions to invite or manage team members.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Permissions Matrix Tab ───────────────────────────────────────────────

export default TeamManagementTab;
