export function getCycleKey(cycle = {}) {
  return String(cycle.id || cycle.slug || cycle.requirementId || cycle.policyKey || cycle.label || "review");
}

export function getCellKey(employeeId, cycle = {}) {
  return `${employeeId || "employee"}:${getCycleKey(cycle)}`;
}

export function getCycleDueDate(cycle = {}) {
  return cycle.dueDate || cycle.instance?.due_date || cycle.policyDueDate || "";
}

export function toCycleRows(row = {}) {
  return Array.isArray(row.cycles) ? row.cycles : [];
}

export function getCycleByFilterKey(row = {}, filterKey = "") {
  const targetKey = String(filterKey || "").replace("requirement:", "");
  return toCycleRows(row).find((cycle) => getCycleKey(cycle) === targetKey);
}
