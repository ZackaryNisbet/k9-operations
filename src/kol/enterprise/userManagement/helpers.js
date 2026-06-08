import { ROLE_OPTIONS } from "./constants";

export function roleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.id === role)?.label || String(role || "Unknown").replace(/_/g, " ");
}

export function scopeLabel(member, locationsById) {
  if (!member.location_id) return "Enterprise-wide";
  return locationsById.get(member.location_id)?.name || member.location_id;
}
