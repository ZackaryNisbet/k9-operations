const STAFF_ROLES = new Set(["pct", "csr"]);
const MANAGER_ROLES = new Set(["supervisor", "manager", "mod"]);
const ADMIN_ROLES = new Set(["location_admin", "multi_location_admin", "enterprise_admin", "owner", "developer"]);

export function classifyRole(roleCode, profileRole) {
  if (STAFF_ROLES.has(roleCode)) return "staff";
  if (MANAGER_ROLES.has(roleCode)) return "manager";
  if (ADMIN_ROLES.has(profileRole) || ADMIN_ROLES.has(roleCode)) return "admin";
  return "admin";
}
