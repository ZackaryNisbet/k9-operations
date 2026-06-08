import { normalizeText, normalizeDateText } from "./textHelpers";

export function filterNeedsValue(op = "") {
  return !["empty", "notEmpty"].includes(op);
}

export function getOptionValue(option) {
  return typeof option === "object" ? option.value : option;
}

export function getOptionLabel(option) {
  return typeof option === "object" ? option.label : option;
}

export function matchTextFilter(source, op, value) {
  const left = normalizeText(source);
  const right = normalizeText(value);
  if (op === "contains") return left.includes(right);
  if (op === "equals") return left === right;
  if (op === "starts") return left.startsWith(right);
  if (op === "empty") return !left;
  if (op === "notEmpty") return Boolean(left);
  return true;
}

export function matchDateFilter(source, op, value) {
  const dateValue = normalizeDateText(source);
  if (!dateValue) return false;
  if (op === "after") return dateValue > value;
  if (op === "before") return dateValue < value;
  if (op === "inLastDays") {
    const days = Number.parseInt(value, 10);
    if (!Number.isFinite(days)) return true;
    const today = new Date();
    const diff = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(`${dateValue}T12:00:00`)) / 86400000);
    return diff >= 0 && diff <= days;
  }
  return true;
}

export function matchSelectFilter(actualValue, op, value) {
  if (op === "is") return actualValue === value;
  if (op === "isNot") return actualValue !== value;
  return true;
}

export function matchEmploymentStatusFilter(row, op, value) {
  if (value === "all") return true;
  const explicitStatus = normalizeText(row.employment_status);
  const status = explicitStatus || (row.is_active === false || row.active === false || row.end_date ? "inactive" : "active");
  return matchSelectFilter(status, op, value);
}

export function getFilterValueLabel(field = {}, value = "") {
  const option = (field.options || []).find((candidate) => getOptionValue(candidate) === value);
  return option ? getOptionLabel(option) : value;
}

export function getFilterFieldForKey(fields = [], key = "") {
  return fields.find((field) => field.key === key);
}
