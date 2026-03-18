// K9 Operations — Permission Helpers

import { LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX } from "./theme";

const LEGACY_ROLE_MAP = { owner:"role_owner", enterprise_admin:"role_enterprise_admin", manager:"role_manager", staff:"role_staff" };
// New role code map for location_roles table (7-role system)
const ROLE_CODE_MAP = { pct:"pct", csr:"csr", supervisor:"supervisor", manager:"manager", regional:"regional", admin:"admin", multi_location_admin:"multi_location_admin", developer:"developer" };

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
  // Owner, enterprise_admin, and multi_location_admin always have full access (scoping is at data layer)
  if (profile.role === 'owner' || profile.role === 'enterprise_admin' || profile.role === 'multi_location_admin') return true;
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
  // Map owner → enterprise_admin, multi_location_admin uses its own matrix entry
  const roleKey = userRole === "owner" ? "enterprise_admin" : userRole;
  const perms = LEAN_PERMISSION_MATRIX[roleKey] || {};
  return perms[area] === true;
}

// ─── getUserLocationIds ─────────────────────────────────────────────────────
// Returns the location IDs a user has access to based on their location_roles.
// - enterprise_admin / developer / owner: returns null (meaning "all locations")
// - multi_location_admin: returns array of their assigned location_ids
// - others: returns array with just their profile location_id
function getUserLocationIds(profile, locationRoles) {
  if (!profile) return [];
  const role = profile.role || "pct";
  // Full-access roles see everything
  if (role === "enterprise_admin" || role === "developer" || role === "owner") return null;
  // multi_location_admin sees their assigned locations from location_roles table
  if (role === "multi_location_admin" && locationRoles && locationRoles.length > 0) {
    const ids = locationRoles.filter(r => r.role_code === "multi_location_admin").map(r => r.location_id);
    return ids.length > 0 ? ids : [profile.location_id];
  }
  // Default: single location from profile
  return profile.location_id ? [profile.location_id] : [];
}

// ─── Gingr Reservation Type → Lite Type Mapping ───────────────────────────

export { LEGACY_ROLE_MAP, ROLE_CODE_MAP, _resolveRole, hasPermission, hasLeanPermission, getUserLocationIds };
