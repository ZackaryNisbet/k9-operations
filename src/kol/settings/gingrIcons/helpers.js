import { DEFAULT_ICON_FILTERS } from "./constants";

export function getActiveIconFilterKeys(filters = {}) {
  return [
    filters.group ? "group" : "",
    filters.assignedOperator && filters.assignedValue !== "" ? "assigned" : "",
    filters.workflowKey ? "workflow" : "",
  ].filter(Boolean);
}

export function buildCompleteIconFilters(filters = {}, keys = getActiveIconFilterKeys(filters)) {
  const selected = new Set(keys);
  const next = { ...DEFAULT_ICON_FILTERS };
  if (selected.has("group") && filters.group) {
    next.group = filters.group;
  }
  if (selected.has("assigned") && filters.assignedOperator && filters.assignedValue !== "") {
    next.assignedOperator = filters.assignedOperator;
    next.assignedValue = filters.assignedValue;
  }
  if (selected.has("workflow") && filters.workflowKey) {
    next.workflowKey = filters.workflowKey;
    next.workflowState = filters.workflowState || "enabled";
  }
  return next;
}

export function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function stableLower(value) {
  return clean(value).toLowerCase();
}

export function summarizeDataError(error) {
  if (!error) return "";
  return String(error.message || error.details || error.hint || "Request failed");
}

export function getGingrSyncEntityErrors(data) {
  const results = data?.results || {};
  return Object.entries(results)
    .filter(([, value]) => value?.error)
    .map(([entity, value]) => `${entity}: ${value.error}`);
}

export function sourceIdentity(prefix, id, label) {
  const cleanId = clean(id);
  if (cleanId) return `${prefix}:${cleanId}`;
  return `${prefix}_name:${clean(label).replace(/\s+/g, " ").toLowerCase()}`;
}

export function sourceLabel(row, ...fields) {
  for (const field of fields) {
    const value = clean(row?.[field]);
    if (value) return value;
  }
  return "Unnamed";
}

export function getRunLabel(row) {
  const runName = sourceLabel(row, "run_name", "gingr_run_id");
  const areaName = clean(row?.area_name);
  return areaName ? `${areaName} / ${runName}` : runName;
}

export function getRunSourceKey(row) {
  return sourceIdentity("run", row?.gingr_run_id, getRunLabel(row));
}

export function getInventoryKey(row) {
  return row.inventory_key || row.icon_identity_key || row.icon_template_id || row.current_title;
}

export function getIconSourceKey(row) {
  const raw = row.icon_identity_key || row.inventory_key || row.icon_template_id || row.current_title;
  const cleaned = clean(raw);
  return cleaned.startsWith("icon:") ? cleaned : `icon:${cleaned}`;
}

export function getIconSourceId(row) {
  return row.icon_template_id || row.icon_identity_key || row.inventory_key || null;
}

export function getAssignedCount(row) {
  const count = Number(row?.active_assignment_count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export function isBathingIconCapability(capabilityKey) {
  const key = clean(capabilityKey);
  return key === "bathing.include" || key.startsWith("bathing.type.") || key.startsWith("bathing.modifier.");
}

export function getLegacyIconSourceKey(row) {
  const rawKey = row?.icon_identity_key || row?.inventory_key || row?.icon_template_id || row?.current_title;
  return rawKey ? `icon:${clean(rawKey)}` : "";
}

export function workflowInheritsIconCapability(workflow, capabilityKey) {
  const key = clean(capabilityKey);
  return Array.isArray(workflow?.legacyDisplayCapabilityKeys) && workflow.legacyDisplayCapabilityKeys.includes(key);
}

export function serviceInheritsWorkflow(row, workflow) {
  const label = stableLower(row?.label);
  if (!label || !workflow?.key) return false;
  if (workflow.key === "private_play") return label.includes("private play") || label.includes("play time");
  if (workflow.key === "bathing") return label.includes("bath") || label.includes("groom");
  if (workflow.key === "pamper") return label.includes("pamper");
  if (workflow.key === "enrichment") return label.includes("enrichment");
  if (workflow.key === "gourmet_ice_cream") return label.includes("ice cream") || label.includes("gourmet");
  return false;
}

export function uniqueWorkflowRows(rows = []) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [
      row.source_type || "icon",
      row.source_identity_key || getLegacyIconSourceKey(row) || row.inventory_key || row.id,
      row.capability_key || row.current_label || row.current_title,
    ].join("::");
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export function getSeverityStyle(severity) {
  if (severity === "driver") {
    return {
      label: "REPORT ENTRY",
      color: "#991B1B",
      bg: "#FEF2F2",
      border: "#FCA5A5",
    };
  }
  return {
    label: "DISPLAY",
    color: "#166534",
    bg: "#F0FDF4",
    border: "#BBF7D0",
  };
}
