// K9 Operations — Shared List-Surface components
//
// The reusable extraction of DESIGN.md §5 ("Data tables & list surfaces — THE
// STANDARD"), first established on Grassroots. New list/record surfaces should
// compose these instead of re-implementing the chrome:
//
//   <ListSurfaceTitle> Title </ListSurfaceTitle>
//   <ListSearchRow value=… onChange=…>            ← search + pill filters + separator
//     <PillFilter …/> <PillSeparator/> <PillFilter …/>
//   </ListSearchRow>
//   <ListTabBar tabs=… activeId=… onChange=… />   ← connected tabs, 3px underline + count pill
//   <ListExplainer> one-sentence explainer </ListExplainer>
//   <DenseTable columns=… rows=… />               ← the dense table itself
//
// Pure logic + design constants live in ./listSurfaceModel and are re-exported
// here so callers can import everything from "../shared/listSurface".

import React, { useMemo, useState } from "react";
import { C } from "./theme";
import {
  LIST_TOKENS,
  buildGridTemplate,
  normalizeColumns,
  nextSort,
  resolveStatusStyle,
  sortRows,
} from "./listSurfaceModel";

export {
  LIST_TOKENS,
  STATUS_PALETTE,
  DEFAULT_STATUS_TONE,
  COLUMN_DEFAULTS,
  resolveStatusStyle,
  resolveAccessor,
  nextSortDirection,
  nextSort,
  normalizeColumn,
  normalizeColumns,
  buildGridTemplate,
  compareValues,
  sortRows,
  filterRows,
  rowMatchesQuery,
} from "./listSurfaceModel";

const ALIGN_JUSTIFY = { start: "flex-start", center: "center", end: "flex-end" };
const ALIGN_TEXT = { start: "left", center: "center", end: "right" };

// ─────────────────────────────────────────────────────────────────────────────
// Status + emphasis chips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small status pill — 10px / weight 800, pill radius, tinted bg + matching fg.
 * `tone` is a palette name ("success", "danger", …) or an explicit { bg, fg }.
 */
export function StatusPill({ children, tone = "neutral", title, truncate = false, style }) {
  const s = resolveStatusStyle(tone);
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 800,
        padding: "1px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
        ...(truncate ? { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" } : null),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Tiny emphasis badge that stacks *under* a date cell (e.g. OVERDUE / TODAY),
 * per the spec. `tone` keys into the brand palette for its accent color.
 */
export function StackBadge({ children, tone = "danger" }) {
  const fg =
    tone === "success" ? C.suc :
    tone === "warning" ? C.warn :
    tone === "info" ? C.info :
    tone === "primary" ? C.pri :
    C.dan;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        color: fg,
        background: `${fg}18`,
        padding: "0 3px",
        borderRadius: 3,
        letterSpacing: "0.02em",
        alignSelf: "flex-start",
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dense table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The dense table from THE STANDARD, generalised over a column config.
 *
 * Columns: { key, header, render(row), width?, align?, sortable?, sortValue?,
 *            searchable?, searchValue?, headerTitle?, cellStyle? }
 *
 * Sorting is dual-mode:
 *  • Uncontrolled (default) — pass `defaultSort`; the table cycles asc→desc→off
 *    on header click and sorts `rows` itself.
 *  • Controlled — pass `onSortChange`; you receive the clicked column key, own
 *    the sort state via `sort`, and hand back already-sorted `rows`.
 *
 * Inline expansion: pass `isRowExpanded(row)` + `renderExpansion(row)` to open an
 * edge-to-edge panel beneath a row with a 3px primary left-border.
 */
// Nested-sticky offset: approximate height of the column-header row (padding
// 6px×2 + ~18px content + 1px border). Group headers stick just beneath it.
const STICKY_HEADER_HEIGHT = 31;

export function DenseTable({
  columns,
  rows = [],
  groups,
  renderGroupHeader,
  renderSubHeader,
  getRowKey,
  sort: controlledSort,
  onSortChange,
  defaultSort = null,
  onRowClick,
  rowStyle,
  isRowExpanded,
  renderExpansion,
  emptyText = "Nothing here yet.",
  columnGap = LIST_TOKENS.columnGap,
  minWidth,
  stickyHeader = false,
  stickyGroups = false,
  stickyTop = 0,
  className,
  style,
}) {
  const cols = useMemo(() => normalizeColumns(columns), [columns]);
  const grid = useMemo(() => buildGridTemplate(cols), [cols]);

  const isControlled = typeof onSortChange === "function";
  const [internalSort, setInternalSort] = useState(defaultSort);
  const sort = isControlled ? controlledSort : internalSort;

  // Grouped mode renders caller-ordered sections; column sorting is reserved for
  // the flat list. When `groups` is present the column header sticks so labels
  // stay visible, and each group header sticks just beneath it.
  const grouped = Array.isArray(groups);
  const headerSticky = stickyHeader || grouped;

  const handleSort = (key) => {
    if (isControlled) onSortChange(key);
    else setInternalSort((cur) => nextSort(cur, key));
  };

  const displayRows = useMemo(
    () => (isControlled || grouped ? rows : sortRows(rows, sort, cols)),
    [isControlled, grouped, rows, sort, cols]
  );

  const keyFor = (row, i) => (getRowKey ? getRowKey(row, i) : row?.id ?? i);

  // One item row (grid + cells + optional inline expansion) — shared by the flat
  // and grouped code paths so they never drift.
  const renderItemRow = (row, i) => {
    const expanded = isRowExpanded ? !!isRowExpanded(row) : false;
    return (
      <div key={keyFor(row, i)}>
        <div
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: grid,
            columnGap,
            padding: LIST_TOKENS.row.padding,
            borderBottom: `1px solid ${C.borderLight}`,
            fontSize: LIST_TOKENS.row.fontSize,
            alignItems: "start",
            cursor: onRowClick ? "pointer" : "default",
            ...(rowStyle ? rowStyle(row) : null),
          }}
        >
          {cols.map((col) => (
            <div
              key={col.key}
              style={{ minWidth: 0, textAlign: ALIGN_TEXT[col.align], ...col.cellStyle }}
            >
              {col.render ? col.render(row) : null}
            </div>
          ))}
        </div>
        {expanded && renderExpansion && (
          // Inline detail reads as a recessed drawer via a subtle tonal
          // shift + hairline top/bottom borders — not a colored side-stripe.
          <div
            style={{
              background: C.surfaceHover,
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {renderExpansion(row)}
          </div>
        )}
      </div>
    );
  };

  // A full-width section header that spans every column. The caller's
  // renderGroupHeader supplies the inner content. Sticky is opt-in (stickyGroups):
  // when on, group headers nest just beneath the sticky column header and
  // subheaders beneath those; off by default to avoid fragile nested-sticky offsets.
  const groupHeaderRow = (content, isSub) => (
    <div
      style={{
        background: isSub ? C.surfaceHover : "#fff",
        borderBottom: `1px solid ${isSub ? C.borderLight : C.border}`,
        ...(stickyGroups
          ? {
              position: "sticky",
              top: stickyTop + STICKY_HEADER_HEIGHT + (isSub ? STICKY_HEADER_HEIGHT : 0),
              zIndex: isSub ? 2 : 3,
            }
          : null),
      }}
    >
      {content}
    </div>
  );

  // Empty only when no group survives (e.g. a search matched nothing). Groups
  // with no rows still render their header — that's how a collapsed section reads.
  const hasGroupedRows = grouped && groups.length > 0;

  return (
    <div
      className={className}
      style={{
        background: C.surface,
        border: `${LIST_TOKENS.container.border} solid ${C.border}`,
        borderRadius: LIST_TOKENS.container.radius,
        // Sticky descendants need a non-clipping ancestor, so grouped tables
        // don't clip on the y-axis; flat tables keep the original clipping.
        ...(grouped
          ? { overflow: minWidth ? "auto" : "visible" }
          : { overflowX: minWidth ? "auto" : "hidden", overflowY: "hidden" }),
        ...style,
      }}
    >
      <div style={minWidth ? { minWidth } : undefined}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: grid,
            columnGap,
            padding: LIST_TOKENS.header.padding,
            background: "#fff",
            borderBottom: `1px solid ${C.border}`,
            fontSize: LIST_TOKENS.header.fontSize,
            fontWeight: LIST_TOKENS.header.fontWeight,
            color: LIST_TOKENS.header.color,
            textTransform: "uppercase",
            letterSpacing: LIST_TOKENS.header.letterSpacing,
            alignItems: "center",
            ...(headerSticky ? { position: "sticky", top: stickyTop, zIndex: 4 } : null),
          }}
        >
          {cols.map((col) => {
            const active = sort && sort.key === col.key && sort.direction;
            const arrow = active ? (sort.direction === "asc" ? LIST_TOKENS.sortAsc : LIST_TOKENS.sortDesc) : "";
            return (
              <div
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                title={col.headerTitle || (col.sortable ? "Click to sort" : undefined)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: ALIGN_JUSTIFY[col.align],
                  gap: 4,
                  minHeight: 18,
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  cursor: col.sortable ? "pointer" : "default",
                  color: active ? C.pri : LIST_TOKENS.header.color,
                  fontWeight: active ? 800 : LIST_TOKENS.header.fontWeight,
                }}
              >
                {col.header}{arrow}
              </div>
            );
          })}
        </div>

        {/* Body */}
        {grouped ? (
          !hasGroupedRows ? (
            <div style={{ padding: "32px 14px", textAlign: "center", color: C.textSec, fontSize: 13 }}>
              {emptyText}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                {groupHeaderRow(renderGroupHeader ? renderGroupHeader(group) : group.header, false)}
                {Array.isArray(group.subgroups)
                  ? group.subgroups.map((sub) => {
                      const subContent = renderSubHeader ? renderSubHeader(sub, group) : sub.header;
                      return (
                        <div key={sub.key}>
                          {subContent != null ? groupHeaderRow(subContent, true) : null}
                          {(sub.rows || []).map(renderItemRow)}
                        </div>
                      );
                    })
                  : (group.rows || []).map(renderItemRow)}
              </div>
            ))
          )
        ) : displayRows.length === 0 ? (
          <div style={{ padding: "32px 14px", textAlign: "center", color: C.textSec, fontSize: 13 }}>
            {emptyText}
          </div>
        ) : (
          displayRows.map(renderItemRow)
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface chrome — title, search row, filter pills, tabs, explainer
// ─────────────────────────────────────────────────────────────────────────────

/** Plain title in the top-left. No hero metrics, no banners (per the spec). */
export function ListSurfaceTitle({ children, actions, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
        ...style,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
        {children}
      </h2>
      {actions ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div> : null}
    </div>
  );
}

/** The thin vertical bar that separates quick-filters from view/mode switches. */
export function PillSeparator() {
  return <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }} />;
}

/**
 * A single quick-filter pill.
 *  • variant "tinted" (default) — active = primary-tint bg + primary text (category filters)
 *  • variant "solid" — active = filled `color` bg + white text (status filters)
 * `count` appends a trailing number; `color` overrides the solid accent.
 */
export function PillFilter({ active, onClick, children, color, count, variant = "tinted", title, style }) {
  const accent = color || C.pri;
  const activeStyle =
    variant === "solid"
      ? { border: `1.5px solid ${accent}`, background: accent, color: "#fff" }
      : { border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri };
  const idleStyle = { border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 10px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
        ...(active ? activeStyle : idleStyle),
        ...style,
      }}
    >
      {children}{count != null ? ` ${count}` : ""}
    </button>
  );
}

/**
 * Search input with the focus-underline treatment, an inline clear button, and a
 * trailing slot for pill filters / view toggles (pass <PillFilter/>,
 * <PillSeparator/>, etc. as children).
 */
export function ListSearchRow({ value, onChange, placeholder = "Search…", children, style }) {
  const has = !!value;
  return (
    <div
      style={{
        borderBottom: `1.5px solid ${C.borderLight}`,
        background: C.bg,
        transition: "border-color 0.15s",
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = C.pri; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = C.borderLight; }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={has ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: 500,
            color: C.text,
            padding: "12px 10px",
            width: "100%",
            fontFamily: "inherit",
          }}
        />
        {has && (
          <button
            onClick={() => onChange("")}
            title="Clear"
            style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        {children ? (
          <div style={{ display: "flex", gap: 4, marginLeft: 8, flexShrink: 0, alignItems: "center" }}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Connected tab bar: full-width tabs (flex:1), active tab carries a 3px primary
 * bottom-underline, and each tab shows a count pill.
 * tabs: [{ id, label, count? }]
 */
export function ListTabBar({ tabs = [], activeId, onChange, style }) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.borderLight}`, background: C.bg, padding: "0 4px", ...style }}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: active ? 700 : 600,
              color: active ? C.text : C.textSec,
              background: "transparent",
              border: "none",
              borderBottom: active ? `3px solid ${C.pri}` : "3px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
            {tab.count != null && (
              <span
                style={{
                  background: active ? C.pri : "#E5E7EB",
                  color: active ? "#fff" : C.textSec,
                  padding: "1px 7px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One-line, faint brand-tinted explainer describing the current tab. */
export function ListExplainer({ children, style }) {
  return (
    <div
      style={{
        padding: "10px 18px",
        borderBottom: `1px solid ${C.borderLight}`,
        background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`,
        fontSize: 12,
        lineHeight: 1.6,
        color: C.textSec,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row affordances — compact actions + count button
// ─────────────────────────────────────────────────────────────────────────────

const ROW_ACTION_TONES = {
  neutral: { border: `1px solid ${C.border}`, background: "#fff", color: C.textSec },
  primary: { border: `1px solid ${C.pri}35`, background: `${C.pri}0A`, color: C.pri },
  danger: { border: `1px solid ${C.dan}35`, background: `${C.dan}0A`, color: C.dan },
};

/** Compact in-row action button (e.g. Log / Edit). Small, restrained. */
export function RowActionButton({ children, onClick, tone = "neutral", icon, title, disabled, style }) {
  const t = ROW_ACTION_TONES[tone] || ROW_ACTION_TONES.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
        ...t,
        ...style,
      }}
    >
      {icon}{children}
    </button>
  );
}

/** Icon-only compact action (pencil / trash), right-aligned in a row. */
export function IconButton({ icon, onClick, title, tone = "neutral", disabled, style }) {
  const color = tone === "primary" ? C.pri : tone === "danger" ? C.dan : C.textSec;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        padding: 0,
        borderRadius: 5,
        border: `1px solid ${C.border}`,
        background: "#fff",
        color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {icon}
    </button>
  );
}

/**
 * The small count button used in "updates"-style columns: a pill-button that
 * tints primary when the count is non-zero (or `active` is set).
 */
export function CountButton({ count = 0, active, onClick, title }) {
  const on = active != null ? active : count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 4px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 800,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        background: on ? `${C.pri}14` : C.bg,
        color: on ? C.pri : C.textMut,
      }}
    >
      {count}
    </button>
  );
}
