// K9 Operations — RoomConfig
// Read-only view of rooms auto-discovered from Gingr via get_runs_and_reservations API.

import React, { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";

function RoomConfig({ locationId }) {
  const [areas, setAreas] = useState([]); // [{ areaName, rooms: [{ runName, runType }] }]
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState(null);
  const [expandedArea, setExpandedArea] = useState(null);

  useEffect(() => {
    if (!locationId) return;
    const load = async () => {
      setLoading(true);
      const { data: runs } = await supabase
        .from("gingr_runs")
        .select("run_name, area_name, run_type, synced_at")
        .eq("location_id", locationId)
        .order("area_name", { ascending: true })
        .order("run_name", { ascending: true });

      if (runs && runs.length > 0) {
        // Group by area
        const areaMap = {};
        let latestSync = null;
        for (const r of runs) {
          const area = r.area_name || "Other";
          if (!areaMap[area]) areaMap[area] = [];
          areaMap[area].push({ runName: r.run_name, runType: r.run_type || "" });
          if (r.synced_at && (!latestSync || r.synced_at > latestSync)) latestSync = r.synced_at;
        }
        setAreas(Object.entries(areaMap).map(([areaName, rooms]) => ({ areaName, rooms })));
        setSyncedAt(latestSync);
      } else {
        setAreas([]);
      }
      setLoading(false);
    };
    load();
  }, [locationId]);

  const totalRooms = areas.reduce((sum, a) => sum + a.rooms.length, 0);

  if (loading) return null;

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1.5px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Room Configuration</h4>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, background: C.surfaceHover, borderRadius: 6, padding: "3px 10px" }}>
          {totalRooms} rooms
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
        Rooms are automatically discovered from Gingr and synced every hour. No manual configuration needed.
      </p>

      {areas.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", borderRadius: 10, border: `1.5px dashed ${C.border}`, background: C.surface }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMut }}>No rooms synced yet. Rooms will appear after the next Gingr sync cycle.</p>
        </div>
      ) : (
        areas.map(({ areaName, rooms }) => {
          const isExpanded = expandedArea === areaName;
          return (
            <div key={areaName} style={{ marginBottom: 12, borderRadius: 10, border: `1px solid ${C.borderLight}`, background: C.bg, overflow: "hidden" }}>
              <div onClick={() => setExpandedArea(isExpanded ? null : areaName)} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{areaName}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, background: C.surfaceHover, borderRadius: 6, padding: "2px 8px" }}>{rooms.length} rooms</span>
                </div>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.borderLight}` }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                    {rooms.map((rm, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.surfaceHover, border: `1px solid ${C.borderLight}`, fontSize: 12, fontWeight: 600, color: C.text }}>
                        {rm.runName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {syncedAt && (
        <p style={{ margin: "12px 0 0", fontSize: 11, color: C.textMut }}>
          Last synced: {new Date(syncedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}


// ─── Team Management Tab ──────────────────────────────────────────────────

export default RoomConfig;
