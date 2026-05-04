// K9 Operations — Permission Helpers

import { LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES } from "./theme";

const LEGACY_ROLE_MAP = { owner:"role_owner", enterprise_admin:"role_enterprise_admin", manager:"role_manager", staff:"role_staff" };
// New role code map for location_roles table (7-role system)
const ROLE_CODE_MAP = { pct:"pct", csr:"csr", supervisor:"supervisor", manager:"manager", regional:"regional", admin:"admin", multi_location_admin:"multi_location_admin", developer:"developer" };
const LEAN_ROLE_ALIAS_MAP = {
  owner: "enterprise_admin",
  enterprise_admin: "enterprise_admin",
  developer: "enterprise_admin",
  multi_location_admin: "multi_location_admin",
  regional: "multi_location_admin",
  admin: "location_admin",
  location_admin: "location_admin",
  manager: "manager",
  supervisor: "supervisor",
  csr: "csr",
  pct: "pct",
  staff: "csr",
  role_owner: "enterprise_admin",
  role_enterprise_admin: "enterprise_admin",
  role_manager: "manager",
  role_staff: "csr",
};
const LEAN_PERMISSION_ALIAS_MAP = {
  "Labor Management": ["Labor Management", "Training Management"],
  "Training Management": ["Training Management", "Labor Management"],
  "Labor Templates": ["Labor Templates", "Checklist Templates"],
  "Checklist Templates": ["Checklist Templates", "Labor Templates"],
  "Labor Attendance": ["Labor Attendance", "Attendance Tracker"],
  "Attendance Tracker": ["Attendance Tracker", "Labor Attendance"],
  "Photos Upload": ["Photos Upload", "Photos Module"],
  "Photos Edit Pairings": ["Photos Edit Pairings", "Photos Module"],
};

const LEAN_FULL_ACCESS_ROLES = new Set(["enterprise_admin", "owner", "developer"]);
const ALWAYS_VISIBLE_PERMISSION_ROLE_IDS = new Set(["enterprise_admin"]);

function resolveLeanRoleKey(userRole) {
  const normalized = String(userRole || "").trim();
  return LEAN_ROLE_ALIAS_MAP[normalized] || normalized || "pct";
}

function resolveActiveLeanRoles({ memberRows = [], profile = null, includeEnterpriseAdmin = true } = {}) {
  const supportedRoleIds = new Set(LEAN_ROLES.map((role) => role.id));
  const activeRoleIds = new Set();
  const addRole = (roleValue) => {
    const roleKey = resolveLeanRoleKey(roleValue);
    if (supportedRoleIds.has(roleKey)) activeRoleIds.add(roleKey);
  };

  (memberRows || []).forEach((member) => {
    if (member?.is_active === false) return;
    addRole(member?.role || member?.role_id || member?.role_code);
  });

  if (profile && profile.is_active !== false) addRole(profile.role);
  if (includeEnterpriseAdmin) {
    ALWAYS_VISIBLE_PERMISSION_ROLE_IDS.forEach((roleId) => activeRoleIds.add(roleId));
  }

  return LEAN_ROLES.filter((role) => activeRoleIds.has(role.id));
}

function resolveLeanPermissionKeys(area) {
  const normalized = String(area || "").trim();
  return LEAN_PERMISSION_ALIAS_MAP[normalized] || [normalized];
}

function cloneLeanPermissionMatrix(source = LEAN_PERMISSION_MATRIX) {
  return Object.fromEntries(
    Object.entries(source || {}).map(([roleId, permissions]) => [roleId, { ...(permissions || {}) }]),
  );
}

const DEFAULT_LEAN_PERMISSION_MATRIX = cloneLeanPermissionMatrix(LEAN_PERMISSION_MATRIX);

function normalizeLeanPermissionOverride(row) {
  const roleKey = resolveLeanRoleKey(row?.role_id || row?.role || "");
  const permissionKey = String(row?.permission_key || "").trim();
  if (!roleKey || !permissionKey) return null;
  return {
    roleKey,
    permissionKey,
    granted: row?.granted === true,
  };
}

function buildLeanPermissionMatrix(overrides = [], baseMatrix = DEFAULT_LEAN_PERMISSION_MATRIX) {
  const matrix = cloneLeanPermissionMatrix(baseMatrix);
  (overrides || []).forEach((row) => {
    const normalized = normalizeLeanPermissionOverride(row);
    if (!normalized) return;
    if (!matrix[normalized.roleKey]) matrix[normalized.roleKey] = {};
    matrix[normalized.roleKey][normalized.permissionKey] = normalized.granted;
  });

  if (matrix.enterprise_admin) {
    LEAN_PERMISSION_AREAS.forEach((key) => {
      matrix.enterprise_admin[key] = true;
    });
  }

  return matrix;
}

function applyLeanPermissionOverrides(overrides = []) {
  const nextMatrix = buildLeanPermissionMatrix(overrides);
  Object.keys(LEAN_PERMISSION_MATRIX).forEach((roleKey) => {
    Object.keys(LEAN_PERMISSION_MATRIX[roleKey] || {}).forEach((permissionKey) => {
      delete LEAN_PERMISSION_MATRIX[roleKey][permissionKey];
    });
  });
  Object.entries(nextMatrix).forEach(([roleKey, permissions]) => {
    if (!LEAN_PERMISSION_MATRIX[roleKey]) LEAN_PERMISSION_MATRIX[roleKey] = {};
    Object.assign(LEAN_PERMISSION_MATRIX[roleKey], permissions);
  });
  return LEAN_PERMISSION_MATRIX;
}

function getPermissionValue(permissionSet, key) {
  const keys = resolveLeanPermissionKeys(key);
  for (const candidate of keys) {
    if (Object.prototype.hasOwnProperty.call(permissionSet || {}, candidate)) {
      return permissionSet[candidate] === true;
    }
  }
  return false;
}

function _resolveRole(profile, data) {
  if (!profile || !data) return null;
  // First try: match via locationRoles from location_roles table (new system)
  const locationRoles = data.locationRoles || [];
  if (locationRoles.length > 0) {
    // Normalise accessor: the table may have the column as role_code or role
    const getCode = (r) => r.role_code || r.role;
    // Try matching by profile.role as role_code
    let role = locationRoles.find(r => getCode(r) === profile.role);
    if (role) return role;
    // Try matching by legacy role map
    const legacyId = LEGACY_ROLE_MAP[profile.role];
    if (legacyId) {
      // Map legacy IDs to new role codes: owner→admin, manager→manager, staff→csr, enterprise_admin→developer
      const legacyToCode = { role_owner:"admin", role_manager:"manager", role_staff:"csr", role_enterprise_admin:"developer" };
      const code = legacyToCode[legacyId];
      if (code) role = locationRoles.find(r => getCode(r) === code);
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
  const roleKey = resolveLeanRoleKey(profile.role || "pct");
  if (LEAN_FULL_ACCESS_ROLES.has(roleKey)) return true;
  const perms = LEAN_PERMISSION_MATRIX[roleKey] || {};
  return getPermissionValue(perms, area);
}

function hasEveryLeanPermission(profile, areas = []) {
  const required = (areas || []).filter(Boolean);
  if (required.length === 0) return true;
  return required.every((area) => hasLeanPermission(profile, area));
}

function hasAnyLeanPermission(profile, areas = []) {
  const options = (areas || []).filter(Boolean);
  if (options.length === 0) return true;
  return options.some((area) => hasLeanPermission(profile, area));
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
    const ids = locationRoles.filter(r => (r.role_code || r.role) === "multi_location_admin").map(r => r.location_id);
    return ids.length > 0 ? ids : [profile.location_id];
  }
  // Default: single location from profile
  return profile.location_id ? [profile.location_id] : [];
}

// ─── Gingr Reservation Type → Lite Type Mapping ───────────────────────────

export {
  LEGACY_ROLE_MAP,
  ROLE_CODE_MAP,
  _resolveRole,
  applyLeanPermissionOverrides,
  buildLeanPermissionMatrix,
  hasAnyLeanPermission,
  hasEveryLeanPermission,
  hasPermission,
  hasLeanPermission,
  getUserLocationIds,
  resolveActiveLeanRoles,
  resolveLeanRoleKey,
  resolveLeanPermissionKeys,
};
