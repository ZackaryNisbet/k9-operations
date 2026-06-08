import React, { useMemo } from "react";
import { C, todayStr } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import {
  buildDayCapacityIndicators,
  getHighestCapacityStatus,
  getVisibleCapacityIndicators,
} from "../../scheduling/capacityIndicators";
import { formatMatrixDate } from "./schedulingDates";
import { CapacityPill } from "./schedulingPrimitives";

export function CapacityWatchPanel({ selectedDay, visibleDays, config, matrixMode, onOpenSettings }) {
  const selectedIndicators = useMemo(
    () => buildDayCapacityIndicators(selectedDay, config, matrixMode),
    [selectedDay, config, matrixMode],
  );
  const visiblePressure = useMemo(() => (
    (visibleDays || []).map((day) => {
      const indicators = buildDayCapacityIndicators(day, config, matrixMode);
      return {
        day,
        indicators,
        status: getHighestCapacityStatus(indicators),
      };
    })
  ), [visibleDays, config, matrixMode]);
  const overDays = visiblePressure.filter((entry) => entry.status === "over");
  const nearDays = visiblePressure.filter((entry) => entry.status === "near");
  const hasConfiguredCaps = selectedIndicators.length > 0;

  return (
    <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#F8FAFC", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.text }}>Capacity Watch</div>
          <div style={{ fontSize: 11, color: C.textMut, marginTop: 2, lineHeight: 1.45 }}>
            Play-yard capacity is checked against operating-day demand, including opening/closing boarding pressure plus daytime dogs.
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: C.text,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <span style={{ display: "flex" }}><I.Settings /></span>
          Capacity Settings
        </button>
      </div>

      {hasConfiguredCaps ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 800 }}>
            {selectedDay?.dayName} {formatMatrixDate(selectedDay?.date || todayStr())}
          </span>
          {getVisibleCapacityIndicators(selectedIndicators, 6).map((indicator) => (
            <CapacityPill key={indicator.key} indicator={indicator} />
          ))}
          <span style={{ fontSize: 11, color: overDays.length ? C.dan : nearDays.length ? C.warn : C.textMut, fontWeight: 800 }}>
            {overDays.length ? `${overDays.length} day${overDays.length === 1 ? "" : "s"} at cap`
              : nearDays.length ? `${nearDays.length} day${nearDays.length === 1 ? "" : "s"} near cap`
                : "Visible days are below configured caps"}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
          No play capacity caps are configured yet. Set caps for large play, small play, private play, half-and-half, or mapped Gingr icon categories in Scheduling Capacity settings.
        </div>
      )}
    </div>
  );
}
