import { normalizeDate } from "../../enrichments/enrichmentData";

export function addMonthsPreserveDay(date, delta) {
  const parsed = parseDateParts(date);
  const target = new Date(parsed.year, parsed.month - 1 + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(parsed.day, lastDay));
  return normalizeDate(target);
}

export function parseDateParts(date) {
  const [year, month, day] = normalizeDate(date).split("-").map(Number);
  return { year, month, day };
}
