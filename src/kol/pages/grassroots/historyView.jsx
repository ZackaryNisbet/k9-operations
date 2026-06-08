import React, { useMemo } from "react";
import { C } from "../../../shared/theme";
import { Badge, Btn, Card, CustomSelect } from "../../../shared/ui";
import {
  GRASSROOTS_CATEGORY_CONFIGS,
  compareGrassrootsHistoryDesc,
  filterGrassrootsHistory,
  getGrassrootsCategoryConfig,
} from "../../grassrootsData";
import {
  historyActorName,
  historyEventLabel,
  getHistoryDetailLines,
  fmtHistoryDate,
  fmtHistoryTime,
} from "./historyUtils";

// Compact table styling for the Marketing History tab — mirrors the Training
// History table (tight uppercase header + roster-style cells).
const HISTORY_TH = {
  padding: "9px 12px",
  fontSize: 10.5,
  fontWeight: 900,
  color: C.textMut,
  textTransform: "uppercase",
  letterSpacing: 0,
  borderBottom: `2px solid ${C.border}`,
  textAlign: "left",
  whiteSpace: "nowrap",
  background: C.bg,
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const HISTORY_TD = { padding: "11px 12px", fontSize: 12.5, lineHeight: 1.35, fontWeight: 700, color: C.text, verticalAlign: "top" };
const HISTORY_TD_SECONDARY = { ...HISTORY_TD, color: C.textSec, fontWeight: 650 };

const HISTORY_RENDER_CAP = 400;

// A metric card matching the Training History header (label / big value / sub).
function HistoryMetric({ label, value, sub }) {
  return (
    <div style={{ minWidth: 124, border: "1px solid rgba(37, 99, 235, 0.12)", borderRadius: 8, background: "linear-gradient(135deg, rgba(239, 246, 255, 0.9), #ffffff 70%)", padding: "8px 10px", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)" }}>
      <span style={{ display: "block", color: C.textMut, fontSize: 10.5, fontWeight: 900, lineHeight: 1, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ display: "block", marginTop: 5, color: C.info, fontSize: 22, fontWeight: 950, lineHeight: 1 }}>{value}</strong>
      {sub ? <em style={{ display: "block", marginTop: 4, color: C.textSec, fontSize: 10.5, fontStyle: "normal", fontWeight: 760 }}>{sub}</em> : null}
    </div>
  );
}

// One row in the Marketing History table: When · Category · Action · Row / Change · Person.
function MarketingHistoryRow({ entry }) {
  const detail = getHistoryDetailLines(entry);
  const categoryLabel = getGrassrootsCategoryConfig(entry.category).label;
  const ts = entry.event_at || entry.created_at;
  return (
    <tr
      style={{ borderBottom: `1px solid ${C.borderLight}` }}
      onMouseEnter={(event) => { event.currentTarget.style.background = C.surfaceHover; }}
      onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
    >
      <td style={{ ...HISTORY_TD_SECONDARY, whiteSpace: "nowrap" }}>
        <div style={{ color: C.text, fontWeight: 800 }}>{fmtHistoryDate(ts)}</div>
        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{fmtHistoryTime(ts)}</div>
      </td>
      <td style={{ ...HISTORY_TD, whiteSpace: "nowrap" }}>{categoryLabel}</td>
      <td style={{ ...HISTORY_TD, whiteSpace: "nowrap" }}>{historyEventLabel(entry.event_type)}</td>
      <td style={{ ...HISTORY_TD_SECONDARY, minWidth: 280 }}>
        <div style={{ color: C.text, fontWeight: 800 }}>{entry.target_name || "Untitled row"}</div>
        {detail.length > 0 && (
          <div style={{ marginTop: 5, display: "grid", gap: 4, maxWidth: 560 }}>
            {detail.map((line, index) => (
              <div key={`${line.label}-${index}`} style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.45, wordBreak: "break-word" }}>
                {"before" in line ? (
                  <>
                    <span style={{ fontWeight: 800, color: C.textSec }}>{line.label}:</span>{" "}
                    {line.before && line.before !== "None" && (
                      <><span style={{ textDecoration: "line-through", opacity: 0.6 }}>{line.before}</span>{" → "}</>
                    )}
                    <span style={{ color: C.text, fontWeight: 700 }}>{line.after}</span>
                  </>
                ) : line.multiline ? (
                  <>
                    <span style={{ fontWeight: 800, color: C.textSec }}>{line.label}</span>
                    <div style={{ marginTop: 1, color: C.text, fontWeight: 600, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{line.value}</div>
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 800, color: C.textSec }}>{line.label}:</span>{" "}
                    <span style={{ color: C.text, fontWeight: 700 }}>{line.value}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </td>
      <td style={{ ...HISTORY_TD_SECONDARY, whiteSpace: "nowrap" }}>{historyActorName(entry)}</td>
    </tr>
  );
}

// The Marketing "History" tab: one cross-category audit table of every create /
// edit / move / delete / logged visit. Mirrors the Training History table —
// Card + header + filter toolbar + When · Category · Action · Row/Change · Person.
export function MarketingHistoryView({ history, search, categoryFilter, onCategoryFilter, actorFilter, onActorFilter, onClearFilters }) {
  const sorted = useMemo(() => [...(history || [])].sort(compareGrassrootsHistoryDesc), [history]);

  const categoryOptions = useMemo(() => {
    const present = new Set(sorted.map((entry) => entry.category));
    return [
      { value: "all", label: "All categories" },
      ...GRASSROOTS_CATEGORY_CONFIGS
        .filter((config) => present.has(config.dbValue))
        .map((config) => ({ value: config.dbValue, label: config.label })),
    ];
  }, [sorted]);

  const actorOptions = useMemo(() => {
    const names = [...new Set(sorted.map((entry) => historyActorName(entry)))].sort((a, b) => a.localeCompare(b));
    return [{ value: "all", label: "All people" }, ...names.map((name) => ({ value: name, label: name }))];
  }, [sorted]);

  const filtered = useMemo(() => {
    const base = filterGrassrootsHistory(sorted, { category: categoryFilter, search });
    if (!actorFilter || actorFilter === "all") return base;
    return base.filter((entry) => historyActorName(entry) === actorFilter);
  }, [sorted, categoryFilter, search, actorFilter]);

  const capped = useMemo(() => filtered.slice(0, HISTORY_RENDER_CAP), [filtered]);
  const hiddenCount = filtered.length - capped.length;
  const totalCount = sorted.length;
  const peopleCount = Math.max(0, actorOptions.length - 1);
  const filterCount = (categoryFilter && categoryFilter !== "all" ? 1 : 0) + (actorFilter && actorFilter !== "all" ? 1 : 0);

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 0, border: "none", boxShadow: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 18px", borderBottom: `1px solid ${C.borderLight}` }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>Marketing History</div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.textMut, fontWeight: 700 }}>Who changed what, and what it changed to — across all marketing categories.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <HistoryMetric label="Changes" value={totalCount} sub="recorded" />
          <HistoryMetric label="People" value={peopleCount} sub="contributors" />
          <Badge color={filtered.length > 0 ? "info" : "default"}>{filtered.length} shown</Badge>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", padding: "12px 18px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 4 }}>Category</div>
            <CustomSelect value={categoryFilter || "all"} onChange={onCategoryFilter} options={categoryOptions} small />
          </div>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 4 }}>Person</div>
            <CustomSelect value={actorFilter || "all"} onChange={onActorFilter} options={actorOptions} small searchable searchPlaceholder="Search people" />
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClearFilters} disabled={filterCount === 0}>
          Clear Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Btn>
      </div>

      {totalCount === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: C.textMut, fontSize: 13 }}>No marketing history has been logged yet.</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: C.textMut, fontSize: 13 }}>No marketing history matches the current filters.</div>
      ) : (
        <div style={{ maxHeight: "70vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={HISTORY_TH}>When</th>
                <th style={HISTORY_TH}>Category</th>
                <th style={HISTORY_TH}>Action</th>
                <th style={HISTORY_TH}>Row / Change</th>
                <th style={HISTORY_TH}>Person</th>
              </tr>
            </thead>
            <tbody>
              {capped.map((entry) => (
                <MarketingHistoryRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
          {hiddenCount > 0 && (
            <div style={{ padding: "12px 14px", textAlign: "center", color: C.textMut, fontSize: 12 }}>
              Showing the {HISTORY_RENDER_CAP} most recent of {filtered.length} matching changes. Narrow with the filters above.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
