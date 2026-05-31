// K9 Operations — Shared List-Surface model (pure, framework-free)
//
// This is the logic + design-constant half of the shared list/record surface
// described in DESIGN.md §5 ("Data tables & list surfaces — THE STANDARD").
// It is deliberately free of React and of ./theme (which pulls in the Supabase
// client and cannot be imported under the `node` test environment), so every
// helper here is unit-testable in isolation. The rendering half lives in
// ./listSurface.jsx and re-exports everything below.

// ─────────────────────────────────────────────────────────────────────────────
// Design constants — the exact magic numbers behind THE STANDARD.
// Centralised so new surfaces never re-guess them.
// ─────────────────────────────────────────────────────────────────────────────
export const LIST_TOKENS = {
  container: { border: "1.5px", radius: 10 },
  header: {
    padding: "6px 12px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    // Muted slate (matches C.textMut) — kept as a literal so the model stays
    // theme-free. The component layer re-derives the active-sort tint from C.pri.
    color: "rgb(71,85,105)",
  },
  row: {
    padding: "4px 10px",
    fontSize: 12,
    // ≈35px row height target from the spec (6px vertical rhythm, dense).
    minHeight: 35,
  },
  columnGap: 8,
  // Inline expansion opens edge-to-edge with a 3px primary left-border.
  expansion: { borderLeft: "3px" },
  sortAsc: " ▲",
  sortDesc: " ▼",
};

// Status pills: small (10px / weight 800), pill radius, tinted bg + matching fg
// per state. These tints are the canonical set first established on Grassroots;
// `primary`/`accent` mirror the brand tokens, the rest are semantic states.
export const STATUS_PALETTE = {
  neutral: { bg: "#E5E7EB", fg: "#374151" },
  primary: { bg: "#F7FEE7", fg: "#14532D" }, // C.priLt / C.pri
  accent: { bg: "#D9F99D", fg: "#4D7C0F" },  // C.accLt / C.accDk
  success: { bg: "#DCFCE7", fg: "#166534" }, // e.g. "booked"
  warning: { bg: "#FEF3C7", fg: "#92400E" }, // e.g. "identified"
  danger: { bg: "#FEE2E2", fg: "#991B1B" },  // e.g. "abandoned"
  info: { bg: "#DBEAFE", fg: "#1E40AF" },    // e.g. "corresponding"
};

export const DEFAULT_STATUS_TONE = "neutral";

/**
 * Resolve a status pill's { bg, fg } from either a palette tone name
 * ("success", "danger", …) or an explicit override object. Unknown tones
 * fall back to neutral so a surface never renders an un-styled pill.
 * @param {string|{bg?:string,fg?:string}} tone
 * @returns {{bg:string, fg:string}}
 */
export function resolveStatusStyle(tone) {
  if (tone && typeof tone === "object") {
    return { ...STATUS_PALETTE[DEFAULT_STATUS_TONE], ...tone };
  }
  return STATUS_PALETTE[tone] || STATUS_PALETTE[DEFAULT_STATUS_TONE];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cycle a single column's sort direction: undefined → "asc" → "desc" → undefined.
 * @param {"asc"|"desc"|undefined|null} current
 * @returns {"asc"|"desc"|undefined}
 */
export function nextSortDirection(current) {
  if (current === "asc") return "desc";
  if (current === "desc") return undefined;
  return "asc";
}

/**
 * Given the current { key, direction } sort and a clicked column key, return the
 * next sort state. Clicking a new column starts at "asc"; clicking the active
 * column advances asc → desc → off (null). Used by the uncontrolled table.
 * @param {{key:string, direction:"asc"|"desc"}|null|undefined} current
 * @param {string} key
 * @returns {{key:string, direction:"asc"|"desc"}|null}
 */
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, direction: "asc" };
  const direction = nextSortDirection(current.direction);
  return direction ? { key, direction } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Columns
// ─────────────────────────────────────────────────────────────────────────────

export const COLUMN_DEFAULTS = {
  width: "minmax(0, 1fr)",
  align: "start", // "start" | "center" | "end"
  sortable: false,
  searchable: true,
};

/**
 * Resolve the value a column exposes for a row, honoring `accessor`
 * (function or property key) and falling back to the column's own `key`.
 */
export function resolveAccessor(row, col) {
  if (typeof col.accessor === "function") return col.accessor(row);
  if (typeof col.accessor === "string") return row?.[col.accessor];
  return row?.[col.key];
}

/** Fill a single column definition with defaults; throws on a missing key. */
export function normalizeColumn(col) {
  if (!col || col.key == null || col.key === "") {
    throw new Error("DenseTable: every column needs a non-empty `key`");
  }
  return { ...COLUMN_DEFAULTS, ...col };
}

/**
 * Normalize + validate a column list. Throws on missing or duplicate keys so a
 * consuming surface fails loudly during development rather than mis-rendering.
 */
export function normalizeColumns(columns) {
  const list = Array.isArray(columns) ? columns.filter(Boolean) : [];
  const seen = new Set();
  return list.map((col) => {
    const normalized = normalizeColumn(col);
    if (seen.has(normalized.key)) {
      throw new Error(`DenseTable: duplicate column key "${normalized.key}"`);
    }
    seen.add(normalized.key);
    return normalized;
  });
}

/** Build the CSS `grid-template-columns` string. Numbers become px tracks. */
export function buildGridTemplate(columns) {
  return normalizeColumns(columns)
    .map((c) => (typeof c.width === "number" ? `${c.width}px` : c.width))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Row sorting + filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two cell values. Numbers compare numerically; everything else uses a
 * numeric-aware, case-insensitive locale compare. Empty values (null/""/undefined)
 * always sort to the end of an ascending list.
 */
export function compareValues(a, b) {
  const aNil = a == null || a === "";
  const bNil = b == null || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Stable sort of `rows` by a { key, direction } sort using the matching column's
 * `sortValue`/`accessor`. Returns the original array reference when there is
 * nothing to sort (no sort, no direction, or unknown column).
 */
export function sortRows(rows, sort, columns) {
  if (!Array.isArray(rows) || !sort || !sort.key || !sort.direction) return rows;
  const col = (columns || []).find((c) => c.key === sort.key);
  if (!col) return rows;
  const dir = sort.direction === "desc" ? -1 : 1;
  const valueOf = (row) =>
    typeof col.sortValue === "function" ? col.sortValue(row) : resolveAccessor(row, col);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const cmp = compareValues(valueOf(x.row), valueOf(y.row));
      return cmp !== 0 ? cmp * dir : x.index - y.index; // index tiebreak → stable
    })
    .map((entry) => entry.row);
}

/**
 * Does a row match a free-text query across its searchable columns? A column is
 * searched via `searchValue(row)` if present, else its accessor; `searchable:
 * false` opts a column out. An empty query matches everything.
 */
export function rowMatchesQuery(row, query, columns) {
  const q = String(query == null ? "" : query).trim().toLowerCase();
  if (!q) return true;
  return (columns || []).some((col) => {
    if (col.searchable === false) return false;
    const value = typeof col.searchValue === "function" ? col.searchValue(row) : resolveAccessor(row, col);
    return value != null && String(value).toLowerCase().includes(q);
  });
}

/** Filter rows by a free-text query. Returns the original array when query is empty. */
export function filterRows(rows, query, columns) {
  if (!Array.isArray(rows)) return rows;
  const q = String(query == null ? "" : query).trim();
  if (!q) return rows;
  return rows.filter((row) => rowMatchesQuery(row, query, columns));
}
