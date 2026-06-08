import { C } from "../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   Timeframe config
   ═══════════════════════════════════════════════════════════════════════════ */
export const RANGES = [
  { key: "today",    label: "Today" },
  { key: "wtd",      label: "This Week" },
  { key: "past-week", label: "Past Week" },
  { key: "mtd",      label: "This Month" },
  { key: "past-30",  label: "Last 30 Days" },
  { key: "qtd",      label: "QTD" },
  { key: "ytd",      label: "YTD" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom",   label: "Custom" },
];

/* Location colors — visually distinct for charts */
export const LOC_COLORS = [C.pri, C.acc, C.suc, C.info, C.warn, "#6366F1", "#059669", C.dan, "#7C3AED", "#DB2777", "#D97706", "#0891B2"];
