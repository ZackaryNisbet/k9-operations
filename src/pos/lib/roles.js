// ─── Permission Helper ──────────────────────────────────────────────────────
// Legacy role map for backwards compat with profiles.role string
const LEGACY_ROLE_MAP = { owner:"role_owner", enterprise_admin:"role_enterprise_admin", manager:"role_manager", staff:"role_staff" };
// New role code map for location_roles table (7-role system)
const ROLE_CODE_MAP = { pct:"pct", csr:"csr", supervisor:"supervisor", manager:"manager", regional:"regional", admin:"admin", developer:"developer" };

function _resolveRole(profile, data) {
  if (!profile || !data) return null;
  // First try: match via locationRoles from location_roles table (new system)
  const locationRoles = data.locationRoles || [];
  if (locationRoles.length > 0) {
    // Try matching by profile.role as role_code
    let role = locationRoles.find(r => r.role_code === profile.role);
    if (role) return role;
    // Try matching by legacy role map
    const legacyId = LEGACY_ROLE_MAP[profile.role];
    if (legacyId) {
      // Map legacy IDs to new role codes: owner→admin, manager→manager, staff→csr, enterprise_admin→developer
      const legacyToCode = { role_owner:"admin", role_manager:"manager", role_staff:"csr", role_enterprise_admin:"developer" };
      const code = legacyToCode[legacyId];
      if (code) role = locationRoles.find(r => r.role_code === code);
      if (role) return role;
    }
  }
  // Fallback: use data.roles (settings JSONB) with legacy mapping
  if (data.roles && data.roles.length > 0) {
    let roleId = profile.role;
    if (LEGACY_ROLE_MAP[roleId]) roleId = LEGACY_ROLE_MAP[roleId];
    return data.roles.find(r => r.id === roleId) || null;
  }
  return null;
}

function hasPermission(profile, data, permKey) {
  if (!profile || !data) return true; // graceful fallback during loading
  // Owner and enterprise_admin always have full access
  if (profile.role === 'owner' || profile.role === 'enterprise_admin') return true;
  const locationRoles = data.locationRoles || [];
  const legacyRoles = data.roles || [];
  if (locationRoles.length === 0 && legacyRoles.length === 0) return true; // no roles system yet
  const role = _resolveRole(profile, data);
  if (!role) return true; // unknown role = allow (graceful)
  return role.permissions?.[permKey] === true;
}

function getRoleName(profile, data) {
  if (!profile || !data) return profile?.role || "staff";
  const role = _resolveRole(profile, data);
  return role ? role.name : (profile.role || "Staff");
}

function getRoleColor(profile, data) {
  if (!profile || !data) return "default";
  const role = _resolveRole(profile, data);
  return role ? (role.color || "default") : "default";
}

// NAV_PERM_MAP: maps sidebar nav IDs to required view permissions
const NAV_PERM_MAP = {
  dashboard:"view_dashboard", reservations:"view_calendar", clients:"view_clients",
  messages:"view_messages", payments:"view_payments",
  operations:"view_daily_ops", "daily-ops":"view_daily_ops", eod:"view_eod", management:"view_management", ai:"view_ai", settings:"view_settings", lms:"view_dashboard",
};

export { LEGACY_ROLE_MAP, ROLE_CODE_MAP, _resolveRole, hasPermission, getRoleName, getRoleColor, NAV_PERM_MAP };
