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

const TEAM_ROLE_IDS = ["pct", "csr", "supervisor", "manager", "location_admin", "enterprise_admin"];
const ROLE_RANK = {
  pct: 10,
  csr: 20,
  supervisor: 30,
  manager: 40,
  location_admin: 50,
  enterprise_admin: 60,
  owner: 60,
  role_owner: 60,
  developer: 60,
};
const ROLE_COLORS = {
  enterprise_admin: { bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE" },
  location_admin: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  manager: { bg: "#ECFEFF", text: "#0E7490", border: "#A5F3FC" },
  supervisor: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  csr: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  pct: { bg: "#F8FAFC", text: "#334155", border: "#E2E8F0" },
  owner: { bg: C.priLt, text: C.pri, border: "#BBF7D0" },
  role_owner: { bg: C.priLt, text: C.pri, border: "#BBF7D0" },
  developer: { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" },
};

const roleById = LEAN_ROLES.reduce((acc, role) => {
  acc[role.id] = role;
  return acc;
}, {});

function titleCaseRole(role) {
  return String(role || "unknown")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTeamRoleMeta(role) {
  const known = roleById[role];
  const colors = ROLE_COLORS[role] || { bg: "#F8FAFC", text: C.textSec, border: C.border };
  return {
    label: known?.shortName || titleCaseRole(role),
    name: known?.name || titleCaseRole(role),
    ...colors,
  };
}

function RoleBadge({ role }) {
  const meta = getTeamRoleMeta(role);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      width: "fit-content",
      maxWidth: "100%",
      padding: "6px 10px",
      borderRadius: 8,
      border: `1px solid ${meta.border}`,
      background: meta.bg,
      color: meta.text,
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1.1,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: meta.text, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>
    </span>
  );
}

function getInitials(name, email) {
  const source = String(name || email || "?").trim();
  if (!source) return "?";
  const parts = source.includes("@") ? [source.charAt(0)] : source.split(/\s+/);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatLastActive(value) {
  if (!value) {
    return { label: "Not recorded", detail: "Next sign-in will stamp it", muted: true };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "Invalid date", detail: "", muted: true };
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let label = "Just now";
  if (minutes >= 1 && minutes < 60) label = `${minutes}m ago`;
  else if (hours >= 1 && hours < 24) label = `${hours}h ago`;
  else if (days >= 1 && days < 7) label = `${days}d ago`;
  else label = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  return {
    label,
    detail: date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    muted: false,
  };
}

function latestActivity(member) {
  const times = [member?.last_active, member?.last_web_active, member?.last_mobile_active]
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    });
  const latest = Math.max(...times, 0);
  return latest ? new Date(latest).toISOString() : null;
}

function formatChannelActivity(label, value) {
  if (!value) return `${label}: not recorded`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${label}: invalid`;
  return `${label}: ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function isActivityStale(member) {
  const value = latestActivity(member);
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > 30 * 24 * 60 * 60 * 1000;
}

function formatResetTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function IconButton({ title, onClick, disabled, tone = "default", children }) {
  const toneStyle = tone === "danger"
    ? { color: C.dan, background: C.danLt, border: "rgba(220,38,38,0.16)" }
    : { color: C.textSec, background: C.surface, border: C.border };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.background,
        color: toneStyle.color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function TeamManagementTab({ profile, data, save }) {
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("pct");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteCredentials, setInviteCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("pct");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [resetCredentials, setResetCredentials] = useState(null);
  const [resetError, setResetError] = useState("");

  // Determine current user's Lite role for permission gating
  const myRole = profile?.role || "pct";
  const myRank = ROLE_RANK[myRole] || 0;
  const canManage = ["manager", "location_admin", "enterprise_admin", "owner", "role_owner", "developer"].includes(myRole);
  const canCreateEnterprise = ["enterprise_admin", "owner", "role_owner", "developer"].includes(myRole);
  const currentUserId = profile?.user_id || profile?.id;

  const roleOptions = useMemo(() => TEAM_ROLE_IDS
    .filter((roleId) => roleId !== "enterprise_admin" || canCreateEnterprise)
    .filter((roleId) => canCreateEnterprise || (ROLE_RANK[roleId] || 0) < myRank)
    .map((roleId) => ({ value: roleId, label: getTeamRoleMeta(roleId).name })),
  [canCreateEnterprise, myRank]);

  const fetchTeam = useCallback(async () => {
    if (!profile?.location_id) {
      setTeam([]);
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    setTeamError("");
    const { data: members, error } = await supabase
      .from("lite_profiles")
      .select("id,user_id,email,full_name,role,location_id,is_active,created_at,updated_at,last_active,last_web_active,last_mobile_active,last_active_source,last_password_reset_at,last_password_reset_by,password_reset_required")
      .eq("location_id", profile?.location_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true, nullsFirst: false });
    if (!error) {
      setTeam(members || []);
    } else {
      setTeam([]);
      setTeamError(error.message || "Team list could not be loaded.");
    }
    setTeamLoading(false);
  }, [profile?.location_id]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const canEditMember = useCallback((member) => {
    if (!canManage || !member) return false;
    if (member.user_id === currentUserId) return false;
    if (canCreateEnterprise) return true;
    return (ROLE_RANK[member.role] || 0) < myRank;
  }, [canCreateEnterprise, canManage, currentUserId, myRank]);

  const teamStats = useMemo(() => {
    const admins = team.filter((m) => ["enterprise_admin", "location_admin", "manager"].includes(m.role)).length;
    const activityRecorded = team.filter((m) => latestActivity(m)).length;
    const stale = team.filter(isActivityStale).length;
    const resetRequired = team.filter((m) => m.password_reset_required).length;
    return { total: team.length, admins, activityRecorded, stale, resetRequired };
  }, [team]);

  const openEditMember = (member) => {
    setEditingMember(member);
    setEditName(member.full_name || "");
    setEditEmail(member.email || "");
    setEditRole(TEAM_ROLE_IDS.includes(member.role) ? member.role : "pct");
    setEditError("");
  };

  const saveMember = async () => {
    if (!editingMember) return;
    const nextName = editName.trim();
    const nextEmail = editEmail.trim().toLowerCase();
    if (!nextName) {
      setEditError("Full name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setEditError("A valid email is required.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    const { data: result, error } = await supabase.rpc("manage_lite_team_member", {
      p_profile_id: editingMember.id,
      p_full_name: nextName,
      p_email: nextEmail,
      p_role: editRole,
    });
    setSavingEdit(false);
    if (error) {
      setEditError(error.message || "Team member could not be saved.");
      return;
    }
    if (result && result.success === false) {
      setEditError(result.error || "Team member could not be saved.");
      return;
    }
    setEditingMember(null);
    fetchTeam();
  };

  const removeMember = async (member) => {
    if (!member) return;
    setRemovingId(member.id);
    const { data: result, error } = await supabase.rpc("manage_lite_team_member", {
      p_profile_id: member.id,
      p_full_name: member.full_name || member.email || "Team Member",
      p_email: member.email,
      p_role: member.role,
      p_is_active: false,
    });
    setRemovingId(null);
    if (!error && (!result || result.success !== false)) {
      setConfirmRemove(null);
      fetchTeam();
      return;
    }
    setTeamError(result?.error || error?.message || "Team member could not be removed.");
  };

  const resetPasswordForMember = async (member) => {
    if (!member) return;
    setResettingId(member.id);
    setResetError("");
    setResetCredentials(null);
    const { data: result, error } = await supabase.rpc("reset_lite_team_member_password", {
      p_profile_id: member.id,
      p_send_email: true,
    });
    setResettingId(null);
    if (error || result?.success === false) {
      setResetError(result?.error || error?.message || "Password could not be reset.");
      return;
    }
    setConfirmReset(null);
    setResetCredentials({
      email: result.email || member.email,
      password: result.temp_password,
      name: result.full_name || member.full_name || member.email,
      message: result.message || "Temporary password created.",
      emailSent: !!result.email_sent,
    });
    fetchTeam();
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
        message: result.message || "Account created.",
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
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const inputStyle = {
    width: "100%",
    padding: "11px 12px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    color: C.text,
    background: C.surface,
    boxSizing: "border-box",
    outline: "none",
  };
  const labelStyle = {
    fontSize: 11,
    fontWeight: 800,
    color: C.textMut,
    display: "block",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
  const tableCols = "minmax(220px, 1.25fr) minmax(230px, 1.25fr) minmax(170px, 0.85fr) minmax(220px, 1fr) 150px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: C.priLt, color: C.pri, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <I.Users />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: 0 }}>Team Management</h3>
            <div style={{ marginTop: 4, fontSize: 13, color: C.textMut }}>Location team, access, and invite status</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge color="default">{teamStats.total} active</Badge>
          <Badge color="info">{teamStats.admins} admin</Badge>
          <Badge color={teamStats.activityRecorded === teamStats.total && teamStats.total ? "success" : "warning"}>{teamStats.activityRecorded}/{teamStats.total || 0} activity</Badge>
          <Badge color={teamStats.stale ? "warning" : "success"}>{teamStats.stale} stale</Badge>
          {teamStats.resetRequired > 0 && <Badge color="warning">{teamStats.resetRequired} reset pending</Badge>}
        </div>
      </div>

      {teamLoading ? (
        <Card style={{ padding: "40px", textAlign: "center", color: C.textMut, borderRadius: 8 }}>Loading team...</Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {teamError && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: C.danLt, color: C.dan, fontSize: 13, fontWeight: 700, border: "1px solid rgba(220,38,38,0.16)" }}>
              {teamError}
            </div>
          )}

          {resetError && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: C.danLt, color: C.dan, fontSize: 13, fontWeight: 700, border: "1px solid rgba(220,38,38,0.16)" }}>
              {resetError}
            </div>
          )}

          {resetCredentials && (
            <div style={{ padding: 16, background: C.sucLt, border: "1.5px solid #A7F3D0", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#065F46", marginBottom: 12 }}>
                <I.CheckCircle />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>Temporary password created for {resetCredentials.name}</div>
                  <div style={{ marginTop: 3, fontSize: 12 }}>{resetCredentials.message}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #A7F3D0", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#065F46", minWidth: 54, textTransform: "uppercase" }}>Email</span>
                  <code style={{ flex: 1, fontSize: 13, color: "#065F46", overflow: "hidden", textOverflow: "ellipsis" }}>{resetCredentials.email}</code>
                  <button type="button" onClick={() => copyToClipboard(resetCredentials.email, "reset-email")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 900, color: copiedField === "reset-email" ? "#10B981" : "#065F46" }}>{copiedField === "reset-email" ? "Copied" : "Copy"}</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #A7F3D0", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#065F46", minWidth: 72, textTransform: "uppercase" }}>Password</span>
                  <code style={{ flex: 1, fontSize: 14, color: "#065F46", fontWeight: 900, letterSpacing: 1 }}>{resetCredentials.password}</code>
                  <button type="button" onClick={() => copyToClipboard(resetCredentials.password, "reset-pw")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 900, color: copiedField === "reset-pw" ? "#10B981" : "#065F46" }}>{copiedField === "reset-pw" ? "Copied" : "Copy"}</button>
                </div>
              </div>
              <Btn variant="secondary" size="sm" onClick={() => setResetCredentials(null)} style={{ marginTop: 12, borderColor: "#A7F3D0", color: "#065F46" }}>Done</Btn>
            </div>
          )}

          {/* Team members table */}
          <Card style={{ padding: 0, overflow: "hidden", borderRadius: 8, boxShadow: "0 12px 34px rgba(15,23,42,0.07)" }}>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Team Directory</div>
                <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>Active members, access levels, and app activity</div>
              </div>
              <Btn variant="secondary" size="sm" onClick={fetchTeam} icon={<I.RefreshCw />}>Refresh</Btn>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 990 }}>
                <div style={{ padding: "11px 18px", background: "#F8FAFC", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: tableCols, gap: 14, alignItems: "center", fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <div>Name</div><div>Email</div><div>Role</div><div>Last active</div><div style={{ textAlign: "right" }}>Actions</div>
                </div>
                {team.length === 0 && (
                  <div style={{ padding: "34px 20px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No active team members found.</div>
                )}
                {team.map((m) => {
                  const lastActive = formatLastActive(latestActivity(m));
                  const editable = canEditMember(m);
                  const isSelf = m.user_id === currentUserId;
                  const stale = isActivityStale(m);
                  const resetAt = formatResetTimestamp(m.last_password_reset_at);
                  return (
                    <div key={m.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: tableCols, gap: 14, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: C.pri, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                          {getInitials(m.full_name, m.email)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name || "Unnamed team member"}</div>
                            {isSelf && <span style={{ padding: "2px 6px", borderRadius: 6, background: C.priLt, color: C.pri, fontSize: 10, fontWeight: 900 }}>You</span>}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>Added {m.created_at ? new Date(m.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "unknown"}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                      <div><RoleBadge role={m.role} /></div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: lastActive.muted || stale ? C.textMut : C.text }}>
                          <I.Clock />
                          <span>{lastActive.label}</span>
                          {m.last_active_source && <span style={{ padding: "2px 6px", borderRadius: 6, background: "#F1F5F9", color: C.textMut, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{m.last_active_source}</span>}
                        </div>
                        {lastActive.detail && <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{lastActive.detail}</div>}
                        <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2, fontSize: 10.5, color: C.textMut, lineHeight: 1.25 }}>
                          <span>{formatChannelActivity("Desktop", m.last_web_active)}</span>
                          <span>{formatChannelActivity("Mobile", m.last_mobile_active)}</span>
                        </div>
                        {m.password_reset_required && (
                          <div style={{ marginTop: 6, width: "fit-content", padding: "3px 7px", borderRadius: 6, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 900 }}>
                            Reset pending{resetAt ? ` since ${resetAt}` : ""}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                        {confirmReset === m.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => resetPasswordForMember(m)}
                              disabled={resettingId === m.id}
                              style={{ border: "none", background: C.pri, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 900, cursor: resettingId === m.id ? "wait" : "pointer" }}
                            >
                              {resettingId === m.id ? "..." : "Reset"}
                            </button>
                            <IconButton title="Cancel password reset" onClick={() => setConfirmReset(null)}><I.X /></IconButton>
                          </>
                        ) : confirmRemove === m.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => removeMember(m)}
                              disabled={removingId === m.id}
                              style={{ border: "none", background: C.dan, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 900, cursor: removingId === m.id ? "wait" : "pointer" }}
                            >
                              {removingId === m.id ? "..." : "Confirm"}
                            </button>
                            <IconButton title="Cancel removal" onClick={() => setConfirmRemove(null)}><I.X /></IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton title="Reset password" onClick={() => { setResetError(""); setResetCredentials(null); setConfirmRemove(null); setConfirmReset(m.id); }} disabled={!editable}><I.RefreshCw /></IconButton>
                            <IconButton title="Edit member" onClick={() => openEditMember(m)} disabled={!editable}><I.Edit /></IconButton>
                            <IconButton title="Remove member" tone="danger" onClick={() => { setConfirmReset(null); setConfirmRemove(m.id); }} disabled={!editable}><I.Trash /></IconButton>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Invite new member */}
          {canManage && (
            <Card style={{ padding: "20px", borderRadius: 8, boxShadow: "0 12px 34px rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Invite New Member</h4>
                  <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>Creates the account and sends the welcome email when Resend is configured.</div>
                </div>
                <div style={{ color: C.pri }}><I.Send /></div>
              </div>

              {inviteCredentials ? (
                <div style={{ padding: 16, background: C.sucLt, border: "1.5px solid #A7F3D0", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#065F46", marginBottom: 12 }}>
                    <I.CheckCircle />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900 }}>Account created for {inviteCredentials.name}</div>
                      <div style={{ marginTop: 3, fontSize: 12 }}>{inviteCredentials.message}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #A7F3D0", borderRadius: 8, padding: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "#065F46", minWidth: 54, textTransform: "uppercase" }}>Email</span>
                      <code style={{ flex: 1, fontSize: 13, color: "#065F46", overflow: "hidden", textOverflow: "ellipsis" }}>{inviteCredentials.email}</code>
                      <button type="button" onClick={() => copyToClipboard(inviteCredentials.email, "email")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 900, color: copiedField === "email" ? "#10B981" : "#065F46" }}>{copiedField === "email" ? "Copied" : "Copy"}</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #A7F3D0", borderRadius: 8, padding: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "#065F46", minWidth: 72, textTransform: "uppercase" }}>Password</span>
                      <code style={{ flex: 1, fontSize: 14, color: "#065F46", fontWeight: 900, letterSpacing: 1 }}>{inviteCredentials.password}</code>
                      <button type="button" onClick={() => copyToClipboard(inviteCredentials.password, "pw")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 900, color: copiedField === "pw" ? "#10B981" : "#065F46" }}>{copiedField === "pw" ? "Copied" : "Copy"}</button>
                    </div>
                  </div>
                  <Btn variant="secondary" size="sm" onClick={() => setInviteCredentials(null)} style={{ marginTop: 12, borderColor: "#A7F3D0", color: "#065F46" }}>Done</Btn>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "flex-end" }}>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Full name</label>
                      <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Role</label>
                      <CustomSelect value={inviteRole} onChange={(value) => value && setInviteRole(value)} options={roleOptions} />
                    </div>
                    <Btn onClick={handleInvite} disabled={inviting || !inviteEmail.trim() || !inviteName.trim()} icon={<I.Send />} style={{ height: 41, justifyContent: "center", borderRadius: 8 }}>
                      {inviting ? "Creating..." : "Invite"}
                    </Btn>
                  </div>
                  {inviteError && <div style={{ marginTop: 10, fontSize: 12, color: C.dan, fontWeight: 800 }}>{inviteError}</div>}
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

      {editingMember && (
        <Modal title="Edit Team Member" onClose={() => savingEdit ? null : setEditingMember(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, background: "#F8FAFC", border: `1px solid ${C.borderLight}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: C.pri, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                {getInitials(editingMember.full_name, editingMember.email)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editingMember.full_name || editingMember.email}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>Edit account details and access</div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Full name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <CustomSelect value={editRole} onChange={(value) => value && setEditRole(value)} options={roleOptions.some((option) => option.value === editRole) ? roleOptions : [{ value: editRole, label: getTeamRoleMeta(editRole).name }, ...roleOptions]} />
            </div>
            {editError && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 800 }}>
                {editError}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6 }}>
              <Btn variant="secondary" onClick={() => setEditingMember(null)} disabled={savingEdit} style={{ borderRadius: 8 }}>Cancel</Btn>
              <Btn onClick={saveMember} disabled={savingEdit} icon={<I.Check />} style={{ borderRadius: 8 }}>
                {savingEdit ? "Saving..." : "Save changes"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Permissions Matrix Tab ───────────────────────────────────────────────

export default TeamManagementTab;
