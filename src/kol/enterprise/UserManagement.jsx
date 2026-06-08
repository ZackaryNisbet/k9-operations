// K9 Operations - Enterprise User Management

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { normalizeLocationRows } from "./enterpriseAggregation";
import {
  LOCATION_SCOPED_ROLES,
  ROLE_OPTIONS,
  USER_FILTER_OP_LABELS,
} from "./userManagement/constants";
import {
  BUTTON,
  INPUT,
  pillButton,
  primaryButton,
} from "./userManagement/styles";

function roleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.id === role)?.label || String(role || "Unknown").replace(/_/g, " ");
}

function scopeLabel(member, locationsById) {
  if (!member.location_id) return "Enterprise-wide";
  return locationsById.get(member.location_id)?.name || member.location_id;
}

async function loadLocations(userLocationIds) {
  let query = supabase.from("locations").select("id,name,slug").order("name", { ascending: true });
  if (Array.isArray(userLocationIds)) {
    if (!userLocationIds.length) return [];
    query = query.in("id", userLocationIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return normalizeLocationRows(data || []);
}

function OptionPills({ options, value, onChange, disabled = false }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          disabled={disabled || option.disabled}
          style={pillButton(value === option.id, disabled || option.disabled)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function EnterpriseUserManagement({ profile, userLocationIds, addGlobalToast = () => {} }) {
  const canCreateEnterprise = ["enterprise_admin", "owner", "developer"].includes(profile?.role);
  const canInvite = ["enterprise_admin", "owner", "developer", "multi_location_admin"].includes(profile?.role);
  const canManageUsers = canInvite;
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("location_admin");
  const [inviteLocationId, setInviteLocationId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilters, setUserFilters] = useState({});
  const [userDraftFilters, setUserDraftFilters] = useState({});
  const [showUserFilterPanel, setShowUserFilterPanel] = useState(false);
  const [showUserFilterPicker, setShowUserFilterPicker] = useState(false);
  const [userFilterPickerReady, setUserFilterPickerReady] = useState(false);
  const [configuringUserFilterKey, setConfiguringUserFilterKey] = useState("");
  const [editingMemberId, setEditingMemberId] = useState("");
  const [editDraft, setEditDraft] = useState({ name: "", email: "", role: "pct", isActive: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const prevUserFilterOpen = useRef(false);

  const roleOptions = useMemo(
    () => ROLE_OPTIONS.filter((option) => option.id !== "enterprise_admin" || canCreateEnterprise),
    [canCreateEnterprise],
  );
  const locationsById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const requiresLocation = LOCATION_SCOPED_ROLES.has(inviteRole);
  const userFilterFields = useMemo(() => [
    {
      key: "status",
      section: "Account",
      label: "Status",
      ops: ["is", "isNot"],
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      key: "scope",
      section: "Scope",
      label: "Location Scope",
      ops: ["is", "isNot"],
      options: [
        { value: "enterprise", label: "Enterprise-wide" },
        ...locations.map((location) => ({ value: location.id, label: location.name })),
      ],
    },
    {
      key: "role",
      section: "Access",
      label: "Role",
      ops: ["is", "isNot"],
      options: ROLE_OPTIONS.map((role) => ({ value: role.id, label: role.label })),
    },
  ], [locations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextLocations = await loadLocations(userLocationIds);
      setLocations(nextLocations);
      setInviteLocationId((current) => current || nextLocations[0]?.id || "");

      let memberQuery = supabase
        .from("lite_profiles")
        .select("id,user_id,email,full_name,role,location_id,is_active,last_active,created_at")
        .order("full_name", { ascending: true });
      if (Array.isArray(userLocationIds)) {
        if (!userLocationIds.length) {
          setMembers([]);
          return;
        }
        memberQuery = memberQuery.in("location_id", userLocationIds);
      }
      const { data, error: memberError } = await memberQuery;
      if (memberError) throw memberError;
      setMembers(data || []);
    } catch (loadError) {
      console.error("Enterprise user management load failed", loadError);
      setError(loadError.message || "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userLocationIds]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showUserFilterPanel && !prevUserFilterOpen.current) {
      setUserDraftFilters({ ...userFilters });
      setShowUserFilterPicker(false);
      setConfiguringUserFilterKey("");
    }
    prevUserFilterOpen.current = showUserFilterPanel;
  }, [showUserFilterPanel, userFilters]);

  const handleInvite = useCallback(async () => {
    if (!canInvite || !inviteName.trim() || !inviteEmail.trim()) return;
    setError("");
    setInviteResult(null);

    if (requiresLocation && !inviteLocationId) {
      setError("Choose a resort before creating a location-scoped user.");
      return;
    }
    if (inviteRole === "enterprise_admin" && !canCreateEnterprise) {
      setError("Only enterprise admins can create another enterprise admin.");
      return;
    }

    setInviting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("send_lite_invite", {
        invite_email: inviteEmail.trim().toLowerCase(),
        invite_name: inviteName.trim(),
        invite_role: inviteRole,
        invite_location: requiresLocation ? inviteLocationId : null,
      });
      if (rpcError) throw rpcError;
      if (data?.success === false) throw new Error(data.error || "Invite failed.");

      const result = {
        email: inviteEmail.trim().toLowerCase(),
        name: inviteName.trim(),
        password: data?.temp_password || "",
        message: data?.message || "Account created.",
      };
      setInviteResult(result);
      addGlobalToast(`Created ${result.name}`, "success");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("location_admin");
      await load();
    } catch (inviteError) {
      console.error("Enterprise invite failed", inviteError);
      const message = inviteError.message || "Invite failed.";
      setError(message);
      addGlobalToast(message, "error");
    } finally {
      setInviting(false);
    }
  }, [addGlobalToast, canCreateEnterprise, canInvite, inviteEmail, inviteLocationId, inviteName, inviteRole, load, requiresLocation]);

  const beginEditMember = useCallback((member) => {
    if (!member || !canManageUsers) return;
    if (member.role === "enterprise_admin" && !canCreateEnterprise) return;
    setEditingMemberId(member.id);
    setEditDraft({
      name: member.full_name || "",
      email: member.email || "",
      role: ROLE_OPTIONS.some((option) => option.id === member.role) ? member.role : "pct",
      isActive: member.is_active !== false,
    });
  }, [canCreateEnterprise, canManageUsers]);

  const saveMemberEdit = useCallback(async () => {
    if (!editingMemberId || !canManageUsers) return;
    const nextName = editDraft.name.trim();
    const nextEmail = editDraft.email.trim().toLowerCase();
    if (!nextName) {
      setError("Full name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError("A valid email is required.");
      return;
    }
    if (editDraft.role === "enterprise_admin" && !canCreateEnterprise) {
      setError("Only enterprise admins can assign enterprise admin access.");
      return;
    }

    setSavingEdit(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("manage_lite_team_member", {
        p_profile_id: editingMemberId,
        p_full_name: nextName,
        p_email: nextEmail,
        p_role: editDraft.role,
        p_is_active: editDraft.isActive,
      });
      if (rpcError) throw rpcError;
      if (data?.success === false) throw new Error(data.error || "User could not be updated.");
      setEditingMemberId("");
      addGlobalToast("User updated", "success");
      await load();
    } catch (editError) {
      console.error("Enterprise user edit failed", editError);
      const message = editError.message || "User could not be updated.";
      setError(message);
      addGlobalToast(message, "error");
    } finally {
      setSavingEdit(false);
    }
  }, [addGlobalToast, canCreateEnterprise, canManageUsers, editDraft.email, editDraft.isActive, editDraft.name, editDraft.role, editingMemberId, load]);

  const locationSummaries = useMemo(() => locations.map((location) => {
    const scopedMembers = members.filter((member) => member.location_id === location.id && member.is_active !== false);
    return {
      ...location,
      activeMembers: scopedMembers.length,
      admins: scopedMembers.filter((member) => ["location_admin", "manager"].includes(member.role)).length,
    };
  }), [locations, members]);

  const getUserFilterField = useCallback(
    (key) => userFilterFields.find((field) => field.key === key) || null,
    [userFilterFields],
  );

  const getMemberFilterValue = useCallback((member, key) => {
    if (key === "status") return member.is_active === false ? "inactive" : "active";
    if (key === "scope") return member.location_id || "enterprise";
    if (key === "role") return member.role || "";
    return "";
  }, []);

  const formatUserFilterValue = useCallback((key, value) => {
    const field = getUserFilterField(key);
    return field?.options?.find((option) => option.value === value)?.label || value || "";
  }, [getUserFilterField]);

  const filterMatchesMember = useCallback((member, key, filter) => {
    if (!filter?.val) return true;
    const memberValue = getMemberFilterValue(member, key);
    if (filter.op === "isNot") return memberValue !== filter.val;
    return memberValue === filter.val;
  }, [getMemberFilterValue]);

  const filteredMembers = useMemo(() => {
    const cleanQuery = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const searchable = [
        member.full_name,
        member.email,
        roleLabel(member.role),
        scopeLabel(member, locationsById),
      ].join(" ").toLowerCase();
      return (!cleanQuery || searchable.includes(cleanQuery))
        && Object.entries(userFilters).every(([key, filter]) => filterMatchesMember(member, key, filter));
    });
  }, [filterMatchesMember, locationsById, members, searchQuery, userFilters]);
  const userUsedFilterKeys = useMemo(() => Object.keys(userDraftFilters), [userDraftFilters]);
  const appliedFilterCount = Object.keys(userFilters).length;
  const userAvailableFilterFields = useMemo(
    () => userFilterFields.filter((field) => !userUsedFilterKeys.includes(field.key)),
    [userFilterFields, userUsedFilterKeys],
  );
  const userFilterSections = useMemo(
    () => [...new Set(userFilterFields.map((field) => field.section))],
    [userFilterFields],
  );

  const removeUserFilter = useCallback((key) => {
    setUserDraftFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (configuringUserFilterKey === key) setConfiguringUserFilterKey("");
  }, [configuringUserFilterKey]);

  const updateUserDraftFilter = useCallback((key, patch) => {
    setUserDraftFilters((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        ...patch,
      },
    }));
  }, []);

  const selectUserFilterField = useCallback((key) => {
    const field = getUserFilterField(key);
    if (!field) return;
    setUserDraftFilters((current) => ({
      ...current,
      [key]: { op: field.ops[0], val: "" },
    }));
    setConfiguringUserFilterKey(key);
    setShowUserFilterPicker(false);
  }, [getUserFilterField]);
  const applyUserFilters = useCallback(() => {
    const completeFilters = Object.fromEntries(
      Object.entries(userDraftFilters).filter(([, filter]) => filter?.val),
    );
    setUserFilters(completeFilters);
    setUserDraftFilters(completeFilters);
    setShowUserFilterPanel(false);
    setShowUserFilterPicker(false);
    setConfiguringUserFilterKey("");
  }, [userDraftFilters]);
  const clearUserFilters = useCallback(() => {
    setUserDraftFilters({});
    setUserFilters({});
    setShowUserFilterPicker(false);
    setConfiguringUserFilterKey("");
  }, []);
  const closeUserFilterPanel = useCallback(() => {
    setShowUserFilterPanel(false);
    setShowUserFilterPicker(false);
    setConfiguringUserFilterKey("");
  }, []);

  const editingMember = useMemo(
    () => members.find((member) => member.id === editingMemberId) || null,
    [editingMemberId, members],
  );
  const locationCountLabel = `${locations.length} ${locations.length === 1 ? "resort" : "resorts"}`;
  const editRoleOptions = useMemo(() => ROLE_OPTIONS.filter((option) => {
    const editingEnterpriseScope = editingMember && !editingMember.location_id;
    if (option.id === "enterprise_admin") return (canCreateEnterprise && editingEnterpriseScope) || editDraft.role === "enterprise_admin";
    return !editingEnterpriseScope;
  }), [canCreateEnterprise, editDraft.role, editingMember]);
  const userSectionIcons = {
    Account: <I.CheckCircle />,
    Scope: <I.Home />,
    Access: <I.Users />,
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <style>{`
        @keyframes filterSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes filterFadeIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes filterChipIn { from { opacity: 0; transform: translateX(-6px) scale(.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
        @keyframes configSlide { from { opacity: 0; max-height: 0; transform: translateY(-4px); } to { opacity: 1; max-height: 220px; transform: translateY(0); } }
        .enterprise-user-action-button {
          min-height: 34px;
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 12px;
          font-weight: 850;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
        }
        .enterprise-user-action-button svg {
          width: 15px;
          height: 15px;
        }
        .enterprise-user-action-button:hover {
          background: #f8fafc;
          border-color: rgba(20, 83, 45, .32);
          color: ${C.pri};
          transform: translateY(-1px);
        }
        .enterprise-user-action-button.is-active {
          border-color: rgba(20, 83, 45, .32);
          background: rgba(20, 83, 45, .08);
          color: ${C.pri};
        }
        .enterprise-user-filter-shell {
          flex: 0 0 auto;
        }
        .enterprise-user-filter-panel {
          margin: -2px 0 16px;
          border-radius: 14px;
          border: 1.5px solid ${C.border};
          background: ${C.bg};
          box-shadow: 0 8px 40px rgba(0,0,0,.08);
          overflow: hidden;
          animation: filterSlideIn .22s ease-out;
        }
        @media (max-width: 760px) {
          .enterprise-user-filter-shell {
            width: 100%;
          }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: C.text }}>User Management</h2>
          <div style={{ marginTop: 5, fontSize: 13, color: C.textMut }}>{members.length} user records across {locationCountLabel}</div>
        </div>
      </div>

      {error && <div style={{ padding: "11px 13px", borderRadius: 10, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 850 }}>{error}</div>}

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ margin: "0 0 6px", color: C.text, fontSize: 17, fontWeight: 900 }}>Create User</h3>
        <div style={{ marginBottom: 14, color: C.textMut, fontSize: 12, lineHeight: 1.5 }}>
          Enterprise creates the account and chooses the scope. Location roles must be attached to one resort; enterprise admins are the only global user type here.
        </div>
        {inviteResult && (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: C.sucLt, color: C.suc, fontSize: 12, fontWeight: 850 }}>
            {inviteResult.message} {inviteResult.password ? `Temporary password: ${inviteResult.password}` : ""}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 1fr) minmax(240px, 1fr) auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Full Name
            <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} disabled={!canInvite} style={INPUT} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Email
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={!canInvite} style={INPUT} />
          </label>
          <button type="button" onClick={handleInvite} disabled={!canInvite || inviting || !inviteName.trim() || !inviteEmail.trim() || (requiresLocation && !inviteLocationId)} style={primaryButton(!canInvite || inviting || !inviteName.trim() || !inviteEmail.trim() || (requiresLocation && !inviteLocationId))}>
            <I.Send /> {inviting ? "Creating..." : "Create"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.1fr) minmax(220px, 0.9fr)", gap: 12, marginTop: 12, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 7, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Role
            <OptionPills
              options={roleOptions}
              value={inviteRole}
              onChange={setInviteRole}
              disabled={!canInvite}
            />
          </div>
          <div style={{ display: "grid", gap: 7, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Location Scope
            {requiresLocation ? (
              <OptionPills
                options={locations.map((location) => ({ id: location.id, label: location.name }))}
                value={inviteLocationId}
                onChange={setInviteLocationId}
                disabled={!canInvite}
              />
            ) : (
              <OptionPills options={[{ id: "enterprise", label: "Enterprise-wide" }]} value="enterprise" onChange={() => {}} disabled={!canInvite} />
            )}
          </div>
        </div>
        {!canInvite && <div style={{ marginTop: 10, fontSize: 12, color: C.textMut }}>You need enterprise-level permissions to create users from this page.</div>}
      </section>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", color: C.text, fontSize: 17, fontWeight: 900 }}>Location Ownership</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {locationSummaries.map((location) => (
            <div key={location.id} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 12, background: "#FAFBFC" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{location.name}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, fontWeight: 850 }}>
                <span style={{ padding: "4px 8px", borderRadius: 999, background: C.priLt, color: C.pri }}>{location.activeMembers} active users</span>
                <span style={{ padding: "4px 8px", borderRadius: 999, background: location.admins ? C.sucLt : C.warnLt, color: location.admins ? C.suc : C.warn }}>{location.admins} admins/managers</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 900 }}>Users</h3>
            <div style={{ marginTop: 4, color: C.textMut, fontSize: 12 }}>
              {filteredMembers.length} of {members.length} records visible
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginBottom: 14 }}>
          <label style={{ display: "grid", gap: 6, maxWidth: 420, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Search
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name, email, role, or resort"
              style={INPUT}
            />
          </label>
          <div className="enterprise-user-filter-shell">
            <button
              type="button"
              className={`enterprise-user-action-button${showUserFilterPanel || appliedFilterCount ? " is-active" : ""}`}
              onClick={() => setShowUserFilterPanel((current) => !current)}
            >
              <I.Filter />
              <span>Filter{appliedFilterCount ? ` (${appliedFilterCount})` : ""}</span>
            </button>
          </div>
        </div>
        {showUserFilterPanel && (
          <div className="enterprise-user-filter-panel">
            <div style={{ padding: "14px 18px", minHeight: 48 }}>
              {userUsedFilterKeys.length === 0 && !showUserFilterPicker && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", animation: "filterFadeIn .2s ease-out" }}>
                  <I.Filter />
                  <span style={{ fontSize: 13, color: C.textMut, fontWeight: 500 }}>No filters active</span>
                </div>
              )}

              {userUsedFilterKeys.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showUserFilterPicker ? 12 : 0 }}>
                  {userUsedFilterKeys.map((key, index) => {
                    const field = getUserFilterField(key);
                    const filter = userDraftFilters[key];
                    if (!field || !filter) return null;
                    const isConfiguring = configuringUserFilterKey === key;
                    return (
                      <div key={key} style={{ animation: `filterChipIn .2s ease-out ${index * 0.04}s both` }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", boxShadow: isConfiguring ? "0 0 0 3px rgba(20,83,45,.06)" : "0 1px 3px rgba(0,0,0,.04)", transition: "all .25s cubic-bezier(.2,.8,.2,1)", overflow: "hidden" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setConfiguringUserFilterKey(isConfiguring ? "" : key);
                              setShowUserFilterPicker(false);
                            }}
                            style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}
                          >
                            {field.label}
                          </button>
                          <div style={{ padding: "6px 0", display: "flex", alignItems: "center" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}>
                              {USER_FILTER_OP_LABELS[filter.op] || filter.op}
                            </span>
                          </div>
                          {filter.val ? (
                            <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{formatUserFilterValue(key, filter.val)}</span>
                          ) : (
                            <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 500, color: C.dan, fontStyle: "italic", whiteSpace: "nowrap" }}>set value</span>
                          )}
                          <button type="button" onClick={() => removeUserFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                            <I.X />
                          </button>
                        </div>

                        {isConfiguring && (
                          <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,.1)", animation: "configSlide .25s ease-out", overflow: "hidden" }}>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Condition</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {field.ops.map((op, opIndex) => (
                                  <button
                                    key={op}
                                    type="button"
                                    onClick={() => updateUserDraftFilter(key, { op })}
                                    style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`, background: filter.op === op ? C.pri : "#fff", color: filter.op === op ? "#fff" : C.text, fontSize: 11, fontWeight: filter.op === op ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all .2s cubic-bezier(.2,.8,.2,1)", animation: `filterFadeIn .2s ease-out ${opIndex * 0.03}s both` }}
                                  >
                                    {USER_FILTER_OP_LABELS[op] || op}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{ animation: "filterFadeIn .2s ease-out .1s both" }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Value</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {field.options.map((option, optionIndex) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => updateUserDraftFilter(key, { val: option.value })}
                                    style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.val === option.value ? C.pri : C.borderLight}`, background: filter.val === option.value ? C.pri : "#fff", color: filter.val === option.value ? "#fff" : C.text, fontSize: 11, fontWeight: filter.val === option.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", animation: `filterFadeIn .15s ease-out ${optionIndex * 0.03}s both` }}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              <button type="button" onClick={() => setConfiguringUserFilterKey("")} style={{ marginTop: 9, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!showUserFilterPicker ? (
                <div style={{ marginTop: userUsedFilterKeys.length > 0 ? 8 : 0, animation: "filterFadeIn .2s ease-out" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserFilterPicker(true);
                      setUserFilterPickerReady(false);
                      setConfiguringUserFilterKey("");
                      window.setTimeout(() => setUserFilterPickerReady(true), 10);
                    }}
                    disabled={userAvailableFilterFields.length === 0}
                    style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${userAvailableFilterFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: userAvailableFilterFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 700, cursor: userAvailableFilterFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <I.Plus />
                    Add Filter
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: userUsedFilterKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,.06)", overflow: "hidden", animation: "filterSlideIn .25s ease-out" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Choose a filter</span>
                    <button type="button" onClick={() => setShowUserFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }} aria-label="Close filter picker">
                      <I.X />
                    </button>
                  </div>
                  <div style={{ padding: "6px 0" }}>
                    {userFilterSections.map((section, sectionIndex) => {
                      const sectionFields = userAvailableFilterFields.filter((field) => field.section === section);
                      if (!sectionFields.length) return null;
                      return (
                        <div key={section}>
                          <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: ".1em", display: "flex", alignItems: "center", gap: 6, animation: userFilterPickerReady ? `filterFadeIn .2s ease-out ${sectionIndex * 0.06}s both` : "none" }}>
                            {userSectionIcons[section] || null} {section}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                            {sectionFields.map((field, fieldIndex) => {
                              const delay = sectionIndex * 0.06 + fieldIndex * 0.03 + 0.05;
                              return (
                                <button
                                  key={field.key}
                                  type="button"
                                  onClick={() => selectUserFilterField(field.key)}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all .2s cubic-bezier(.2,.8,.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,.03)", animation: userFilterPickerReady ? `filterChipIn .25s ease-out ${delay}s both` : "none" }}
                                >
                                  {field.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={applyUserFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(20,83,45,.2)" }}>
                  Apply{userUsedFilterKeys.length > 0 ? ` (${userUsedFilterKeys.length})` : ""}
                </button>
                {userUsedFilterKeys.length > 0 && (
                  <button type="button" onClick={clearUserFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Clear All
                  </button>
                )}
                <button type="button" onClick={closeUserFilterPanel} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 22, textAlign: "center", color: C.textMut }}>Loading users...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>User</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Scope</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Role</th>
                  <th style={{ padding: "9px 10px", textAlign: "center", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Status</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Last Active</th>
                  <th style={{ padding: "9px 10px", textAlign: "right", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const editable = canManageUsers && (member.role !== "enterprise_admin" || canCreateEnterprise);
                  const isEditing = editingMemberId === member.id;
                  if (isEditing) {
                    return (
                      <tr key={member.id} style={{ background: "#F8FAFC" }}>
                        <td colSpan={6} style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1fr)", gap: 10, marginBottom: 12 }}>
                            <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
                              Full Name
                              <input value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} style={INPUT} />
                            </label>
                            <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
                              Email
                              <input type="email" value={editDraft.email} onChange={(event) => setEditDraft((current) => ({ ...current, email: event.target.value }))} style={INPUT} />
                            </label>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(180px, 0.7fr) auto", gap: 12, alignItems: "end" }}>
                            <div style={{ display: "grid", gap: 7, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
                              Role
                              <OptionPills
                                options={editRoleOptions}
                                value={editDraft.role}
                                onChange={(role) => setEditDraft((current) => ({ ...current, role }))}
                                disabled={savingEdit}
                              />
                            </div>
                            <div style={{ display: "grid", gap: 7, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
                              Status
                              <OptionPills
                                options={[{ id: "active", label: "Active" }, { id: "inactive", label: "Inactive" }]}
                                value={editDraft.isActive ? "active" : "inactive"}
                                onChange={(status) => setEditDraft((current) => ({ ...current, isActive: status === "active" }))}
                                disabled={savingEdit}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <button type="button" onClick={() => setEditingMemberId("")} disabled={savingEdit} style={BUTTON}>Cancel</button>
                              <button type="button" onClick={saveMemberEdit} disabled={savingEdit} style={primaryButton(savingEdit)}>
                                {savingEdit ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={member.id}>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}` }}>
                        <div style={{ fontWeight: 900, color: C.text }}>{member.full_name || member.email}</div>
                        <div style={{ marginTop: 2, color: C.textMut, fontSize: 11 }}>{member.email}</div>
                      </td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, color: C.text }}>{scopeLabel(member, locationsById)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, fontWeight: 850 }}>{roleLabel(member.role)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, textAlign: "center" }}>
                        <span style={{ borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 900, background: member.is_active === false ? C.danLt : C.sucLt, color: member.is_active === false ? C.dan : C.suc }}>
                          {member.is_active === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, color: C.textMut }}>{member.last_active ? new Date(member.last_active).toLocaleString() : "—"}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, textAlign: "right" }}>
                        {editable ? (
                          <button type="button" onClick={() => beginEditMember(member)} style={{ ...BUTTON, height: 32, padding: "0 10px" }}>
                            <I.Edit /> Edit
                          </button>
                        ) : (
                          <span style={{ color: C.textMut, fontSize: 11 }}>Restricted</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filteredMembers.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: 22, textAlign: "center", color: C.textMut, borderBottom: `1px solid ${C.borderLight}` }}>
                      No users match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
