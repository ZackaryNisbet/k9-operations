// Depletion-rate analytics modal extracted from InventoryPage.jsx.
// Self-contained: loads its own catalog/snapshot/count data via supabase and
// derives analytics from the shared inventoryDepletion helpers.

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../supabaseClient";
import { C, todayStr } from "../../../shared/theme";
import { Btn, Modal } from "../../../shared/ui";
import {
  addDateDays,
  buildInventoryDepletionAnalytics,
  buildInventoryQualityBreakdown,
  INVENTORY_DEPLETION_QUALITY_LABELS,
  projectInventoryUsage,
  summarizeLatestInventoryCycle,
  summarizeInventoryUsageForRange,
} from "../inventoryDepletion";
import { fmtCurrency, fmtWeekLabel } from "./format";

export function DepletionRateModal({ locationId, reservations, currentWeekStart, inventorySchedule, onClose }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [countRows, setCountRows] = useState([]);
  const [periodMode, setPeriodMode] = useState("latest");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [qualityFilter, setQualityFilter] = useState(null);

  useEffect(() => {
    (async () => {
      if (!locationId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const { data: catalogData, error: catErr } = await supabase
          .from("inventory_catalog")
          .select("id, item_name, unit_price, par_level, category, is_active, sort_order")
          .eq("location_id", locationId)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true });
        if (catErr) throw catErr;

        const { data: snapshotData, error: snapErr } = await supabase
          .from("inventory_snapshots")
          .select("*")
          .eq("location_id", locationId)
          .order("week_start", { ascending: true });
        if (snapErr) throw snapErr;

        let loadedCounts = [];
        const snapshotIds = (snapshotData || []).map((snap) => snap.id).filter(Boolean);
        if (snapshotIds.length > 0) {
          const { data: countsData, error: countErr } = await supabase
            .from("inventory_counts")
            .select("*")
            .in("snapshot_id", snapshotIds);
          if (countErr) throw countErr;
          loadedCounts = countsData || [];
        }

        setCatalog(catalogData || []);
        setSnapshots(snapshotData || []);
        setCountRows(loadedCounts);
      } catch (err) {
        console.error("Depletion data load error:", err);
        setLoadError(err.message || "Failed to load depletion data");
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  const analytics = useMemo(() => buildInventoryDepletionAnalytics({
    catalog,
    snapshots,
    counts: countRows,
    reservations,
  }), [catalog, snapshots, countRows, reservations]);

  const qualityBreakdown = useMemo(() => buildInventoryQualityBreakdown(analytics.cycles), [analytics.cycles]);

  const visibleItemStats = useMemo(() => {
    if (!qualityFilter) return analytics.itemStats;
    return analytics.itemStats.filter((item) =>
      item.cycles.some((cycle) => !cycle.usableForCoefficient && cycle.quality === qualityFilter)
    );
  }, [analytics.itemStats, qualityFilter]);

  const fallbackDogDaysPerDay = useMemo(() => {
    if (!analytics.cycleSummaries.length) return 0;
    const totalDays = analytics.cycleSummaries.reduce((sum, cycle) => {
      const start = new Date(`${cycle.cycleStart}T12:00:00`);
      const end = new Date(`${cycle.cycleEnd}T12:00:00`);
      const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      return sum + Math.max(days, 0);
    }, 0);
    return totalDays > 0 ? analytics.cycleSummaries.reduce((sum, cycle) => sum + (cycle.dogDays || 0), 0) / totalDays : 0;
  }, [analytics.cycleSummaries]);

  const period = useMemo(() => {
    const today = todayStr();
    const isProjection = periodMode.startsWith("next");
    const days = periodMode.endsWith("30") ? 30 : 7;

    if (isProjection) {
      const projection = projectInventoryUsage({
        itemStats: analytics.itemStats,
        reservations,
        startKey: today,
        days,
        fallbackDogDaysPerDay,
      });
      return {
        label: `Projected Next ${days} Days`,
        isProjection: true,
        isLatestCycle: false,
        usageValue: projection.projectedValue,
        consumedValue: projection.projectedValue,
        receivedValue: null,
        netInventoryValueChange: -projection.projectedValue,
        usageUnits: projection.projectedUnits,
        dogDays: projection.dogDays,
        cycleCount: analytics.cycleSummaries.length,
        items: projection.items,
      };
    }

    if (periodMode === "latest") {
      const summary = summarizeLatestInventoryCycle(analytics.cycles);
      return {
        label: summary.cycleStart ? `${summary.cycleStart} to ${summary.cycleEnd}` : "Latest Completed Cycle",
        isProjection: false,
        isLatestCycle: true,
        usageValue: summary.usageValue,
        consumedValue: summary.consumedValue,
        receivedValue: summary.receivedValue,
        netInventoryValueChange: summary.netInventoryValueChange,
        usageUnits: summary.usageUnits,
        dogDays: summary.dogDays,
        cycleCount: summary.cycleCount,
        items: analytics.itemStats,
      };
    }

    const start = addDateDays(today, -29);
    const summary = summarizeInventoryUsageForRange(analytics.cycles, start, today);
    return {
      label: "Completed cycles overlapping last 30 days",
      isProjection: false,
      isLatestCycle: false,
      usageValue: summary.usageValue,
      consumedValue: summary.consumedValue,
      receivedValue: summary.receivedValue,
      netInventoryValueChange: summary.netInventoryValueChange,
      usageUnits: summary.usageUnits,
      dogDays: summary.dogDays,
      cycleCount: summary.cycleCount,
      items: analytics.itemStats,
    };
  }, [analytics, fallbackDogDaysPerDay, periodMode, reservations]);

  const latestSnapshot = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => String(b.week_start || "").localeCompare(String(a.week_start || "")))[0] || null;
  }, [snapshots]);

  const currentInventory = useMemo(() => {
    if (!latestSnapshot) return { value: 0, belowPar: 0 };
    const catalogMap = {};
    catalog.forEach((item) => { catalogMap[item.id] = item; });
    const latestCounts = countRows.filter((row) => row.snapshot_id === latestSnapshot.id);
    return latestCounts.reduce((acc, row) => {
      const item = catalogMap[row.catalog_item_id];
      if (!item) return acc;
      const stock = Number(row.stock_count || 0);
      const unitCost = Number(item.unit_price || 0);
      const par = item.par_level == null ? null : Number(item.par_level);
      acc.value += stock * unitCost;
      if (par != null && stock < par) acc.belowPar += 1;
      return acc;
    }, { value: 0, belowPar: 0 });
  }, [catalog, countRows, latestSnapshot]);

  const selectedItem = useMemo(() => {
    return visibleItemStats.find((item) => item.itemId === selectedItemId) || visibleItemStats[0] || null;
  }, [visibleItemStats, selectedItemId]);

  useEffect(() => {
    if (visibleItemStats.length > 0 && !visibleItemStats.some((item) => item.itemId === selectedItemId)) {
      setSelectedItemId(visibleItemStats[0].itemId);
    }
  }, [visibleItemStats, selectedItemId]);

  const confidenceBadge = (confidence) => {
    const colors = {
      High: { bg: C.sucLt, color: C.suc },
      Medium: { bg: C.warnLt, color: C.warn },
      Low: { bg: C.bg, color: C.textMut },
      Emerging: { bg: C.bg, color: C.textMut },
      Insufficient: { bg: C.danLt, color: C.dan },
    };
    const c = colors[confidence] || colors.Insufficient;
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        fontSize: 10,
        fontWeight: 700,
      }}>
        {confidence}
      </span>
    );
  };

  const fmtQty = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return "-";
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
  };
  const fmtRate = (value) => value == null ? "-" : Number(value).toFixed(4);
  const fmtMaybeCurrency = (value) => value == null || Number.isNaN(Number(value)) ? "-" : fmtCurrency(value);
  const fmtSignedCurrency = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "-";
    const abs = fmtCurrency(Math.abs(Number(value)));
    if (Number(value) > 0) return `+${abs}`;
    if (Number(value) < 0) return `-${abs}`;
    return abs;
  };
  const confidenceColor = (confidence) => {
    if (confidence === "High") return C.suc;
    if (confidence === "Medium") return C.warn;
    if (confidence === "Low" || confidence === "Emerging") return C.warn;
    return C.dan;
  };
  const consumedValue = period.consumedValue ?? period.usageValue ?? 0;
  const costPerDogDay = period.dogDays > 0 ? consumedValue / period.dogDays : 0;
  const maxCycleValue = Math.max(1, ...analytics.cycleSummaries.map((cycle) => cycle.usageValue || 0));
  const visibleChartCycles = analytics.cycleSummaries.slice(-10);
  const confidenceCycleCount = new Set(analytics.validCycles.map((cycle) => cycle.closingWeekStart)).size;
  const confidenceCycleLabel = `${confidenceCycleCount} valid completed cycle${confidenceCycleCount === 1 ? "" : "s"}`;
  const qualityFilterLabel = qualityFilter ? INVENTORY_DEPLETION_QUALITY_LABELS[qualityFilter] || qualityFilter.replaceAll("_", " ") : null;

  return (
    <Modal title="Depletion Rate Analytics" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>Loading depletion data...</div>
        ) : loadError ? (
          <div style={{ padding: 28, borderRadius: 10, background: C.danLt, border: `1px solid ${C.dan}30`, color: C.dan, fontSize: 13 }}>
            {loadError}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  ["latest", "Latest Completed Cycle"],
                  ["last30", "Last 30 Days"],
                  ["next7", "Next 7 Days"],
                  ["next30", "Next 30 Days"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPeriodMode(value)}
                    style={{
                      border: `1px solid ${periodMode === value ? C.pri : C.border}`,
                      background: periodMode === value ? C.pri : C.surface,
                      color: periodMode === value ? "#fff" : C.textSec,
                      borderRadius: 8,
                      padding: "7px 11px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.textMut }}>
                {latestSnapshot ? `Latest count: ${fmtWeekLabel(latestSnapshot.week_start)}` : "No completed count loaded"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                { label: period.isProjection ? "Projected Consumed Value" : "Consumed Value", value: fmtCurrency(consumedValue), color: C.suc, sub: `${period.label} - all products` },
                { label: "Estimated Received Value", value: fmtMaybeCurrency(period.receivedValue), color: C.pri, sub: period.isProjection ? "Not projected" : "Prior in-transit estimate" },
                { label: period.isProjection ? "Net Drawdown" : "Net Inventory Change", value: fmtSignedCurrency(period.netInventoryValueChange), color: Number(period.netInventoryValueChange || 0) < 0 ? C.warn : C.text, sub: period.isProjection ? "No receipts assumed" : "Ending minus opening" },
                { label: "Dog-Days", value: fmtQty(period.dogDays, 0), color: C.pri, sub: period.isProjection ? "Booked or historical fallback" : `${period.cycleCount} completed cycle${period.cycleCount === 1 ? "" : "s"}` },
                { label: "Consumed / Dog-Day", value: fmtCurrency(costPerDogDay), color: C.acc, sub: "Consumed value per dog-day" },
                { label: "Data Confidence", value: analytics.confidence, color: confidenceColor(analytics.confidence), sub: confidenceCycleLabel },
                { label: "On-Hand Value", value: fmtCurrency(currentInventory.value), color: C.text, sub: `${currentInventory.belowPar} below par` },
              ].map((metric) => (
                <div key={metric.label} style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: metric.color }}>{metric.value}</div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {metric.sub}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 800, color: C.text }}>Basis:</span> Consumed = opening on-hand + estimated received - closing on-hand. Estimated received uses prior in-transit until true receiving data exists.
            </div>

            {analytics.cycleSummaries.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: C.textMut, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: C.text }}>No completed count-to-count cycles yet</div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  This view now computes directly from completed inventory snapshots. It needs at least two completed counts for the same resort.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 14 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Consumed Value by Completed Cycle</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>All-product dollar value consumed, normalized separately by dog-days below.</div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{analytics.confidence} confidence</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "end", gap: 8, height: 150, padding: "4px 0 0" }}>
                      {visibleChartCycles.map((cycle) => {
                        const height = Math.max(6, (cycle.usageValue / maxCycleValue) * 120);
                        return (
                          <div key={cycle.key} style={{ flex: 1, minWidth: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <div title={`${cycle.cycleStart} to ${cycle.cycleEnd}: ${fmtCurrency(cycle.usageValue)}`} style={{
                              width: "100%",
                              maxWidth: 42,
                              height,
                              borderRadius: "6px 6px 2px 2px",
                              background: C.pri,
                              opacity: cycle.validItems > 0 ? 0.9 : 0.25,
                            }} />
                            <div style={{ fontSize: 10, color: C.textMut, whiteSpace: "nowrap" }}>
                              {new Date(`${cycle.cycleEnd}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>Data Quality</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Completed cycles</span>
                        <span style={{ fontWeight: 800, color: C.text }}>{analytics.cycleSummaries.length}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Valid item-cycle coefficients</span>
                        <span style={{ fontWeight: 800, color: C.suc }}>{analytics.validCycles.length}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Excluded item-cycles</span>
                        <span style={{ fontWeight: 800, color: analytics.excludedCycles ? C.warn : C.text }}>{analytics.excludedCycles}</span>
                      </div>
                      {qualityBreakdown.length > 0 && (
                        <div style={{ display: "grid", gap: 6 }}>
                          {qualityBreakdown.map((row) => {
                            const active = row.quality === qualityFilter;
                            return (
                              <button
                                key={row.quality}
                                onClick={() => setQualityFilter(active ? null : row.quality)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "7px 8px",
                                  borderRadius: 7,
                                  border: `1px solid ${active ? C.warn : C.borderLight}`,
                                  background: active ? C.warnLt : C.bg,
                                  color: active ? C.warn : C.textSec,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <span>{row.label}</span>
                                <span>{row.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ padding: 10, borderRadius: 8, background: analytics.excludedCycles ? C.warnLt : C.sucLt, color: analytics.excludedCycles ? C.warn : C.suc, fontSize: 11, lineHeight: 1.45 }}>
                        {analytics.excludedCycles
                          ? "Some cycles are excluded from coefficients. Click a reason above to focus the product picker on affected products."
                          : "All loaded item-cycles are usable for the current coefficient."}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Product Picker</div>
                    <div style={{ fontSize: 11, color: C.textMut }}>
                      {qualityFilterLabel ? `Focused on ${qualityFilterLabel.toLowerCase()} (${visibleItemStats.length} products)` : `${visibleItemStats.length} products loaded`}
                    </div>
                  </div>
                  {qualityFilter && (
                    <button
                      onClick={() => setQualityFilter(null)}
                      style={{
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        color: C.textSec,
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Clear focus
                    </button>
                  )}
                </div>

                <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 0.8fr",
                    gap: 8,
                    padding: "8px 14px",
                    background: C.bg,
                    borderBottom: `1px solid ${C.borderLight}`,
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}>
                    {["Product", "Category", "Status"].map((h) => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {visibleItemStats.map((stat) => {
                    const active = stat.itemId === selectedItem?.itemId;
                    return (
                      <button
                        key={stat.itemId}
                        onClick={() => setSelectedItemId(stat.itemId)}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr 0.8fr",
                          gap: 8,
                          padding: "10px 14px",
                          border: "none",
                          borderBottom: `1px solid ${C.borderLight}`,
                          alignItems: "center",
                          background: active ? C.priLt : C.surface,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{stat.itemName}</div>
                          <div style={{ fontSize: 10, color: C.textMut }}>{stat.validCycles > 0 ? "Click for product depletion history" : "Click for count history"}</div>
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{stat.category}</div>
                        <div>{confidenceBadge(stat.confidence)}</div>
                      </button>
                    );
                  })}
                  {visibleItemStats.length === 0 && (
                    <div style={{ padding: 18, color: C.textMut, fontSize: 12, textAlign: "center" }}>
                      No products match this data-quality focus.
                    </div>
                  )}
                </div>

                {selectedItem && (
                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{selectedItem.itemName}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>
                          Overall coefficient {fmtRate(selectedItem.avgRatePerDogDay)} units per dog-day. Unit cost {fmtCurrency(selectedItem.unitCost ?? selectedItem.unitPrice ?? 0)}.
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>
                        Recommended par: {selectedItem.recommendedPar ?? "-"} · Current par: {selectedItem.currentPar ?? "-"}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "Consumed Value", value: fmtCurrency(selectedItem.totalConsumedValue || 0), sub: "Included cycles" },
                        { label: "Estimated Received Value", value: fmtCurrency(selectedItem.totalReceivedValue || 0), sub: "Prior in-transit" },
                        { label: "Net Change", value: fmtSignedCurrency(selectedItem.totalNetInventoryValueChange || 0), sub: "Closing minus opening" },
                        { label: "Latest On-Hand", value: fmtMaybeCurrency(selectedItem.latestOnHandValue), sub: `${fmtQty(selectedItem.latestOnHand, 0)} units` },
                      ].map((metric) => (
                        <div key={metric.label} style={{ padding: "10px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>{metric.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 2 }}>{metric.value}</div>
                          <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{metric.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "150px 64px 64px 78px 72px 88px 82px 88px 1fr",
                        gap: 8,
                        minWidth: 890,
                        padding: "8px 10px",
                        background: C.bg,
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 800,
                        color: C.textMut,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>
                        {["Cycle", "Open", "Close", "Est. Received", "Used", "Consumed $", "Dog-Days", "Coeff.", "Status"].map((h) => <div key={h}>{h}</div>)}
                      </div>
                      {selectedItem.cycles.map((cycle) => (
                        <div
                          key={`${cycle.itemId}-${cycle.cycleStart}-${cycle.cycleEnd}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "150px 64px 64px 78px 72px 88px 82px 88px 1fr",
                            gap: 8,
                            minWidth: 890,
                            padding: "9px 10px",
                            borderBottom: `1px solid ${C.borderLight}`,
                            fontSize: 12,
                            color: C.textSec,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: C.text }}>{cycle.cycleStart} to {cycle.cycleEnd}</div>
                          <div>{fmtQty(cycle.openingStock, 0)}</div>
                          <div>{fmtQty(cycle.closingStock, 0)}</div>
                          <div>{fmtQty(cycle.receivedUnits, 0)}</div>
                          <div style={{ fontWeight: 800, color: cycle.usableForCoefficient ? C.pri : C.textMut }}>{fmtQty(cycle.depletion, 1)}</div>
                          <div style={{ fontWeight: 800, color: cycle.usableForCoefficient ? C.suc : C.textMut }}>{fmtCurrency(cycle.consumedValue || 0)}</div>
                          <div>{fmtQty(cycle.dogDays, 0)}</div>
                          <div>{fmtRate(cycle.ratePerDogDay)}</div>
                          <div style={{ color: cycle.usableForCoefficient ? C.suc : C.warn, fontWeight: 700 }}>
                            {cycle.usableForCoefficient ? "Included" : cycle.quality.replaceAll("_", " ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 4 }}>
              <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
                Consumed value uses opening stock plus estimated received supply minus closing stock. Existing "in transit" values are treated as prior-cycle supply until explicit receiving data exists.
              </div>
              <Btn variant="secondary" onClick={onClose}>Close</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
