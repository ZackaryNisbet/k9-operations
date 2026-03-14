// K9 Operations — Permission Helpers

import { LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX } from "./theme";

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

// ─── hasLitePermission Helper ──────────────────────────────────────────────
function hasLeanPermission(profile, area) {
  if (!profile) return false;
  const userRole = profile.role || "pct";
  const roleKey = userRole === "owner" ? "enterprise_admin" : userRole;
  const perms = LEAN_PERMISSION_MATRIX[roleKey] || {};
  return perms[area] === true;
}

// ─── Gingr Reservation Type → Lite Type Mapping ───────────────────────────

export { LEGACY_ROLE_MAP, ROLE_CODE_MAP, _resolveRole, hasPermission, hasLeanPermission };
