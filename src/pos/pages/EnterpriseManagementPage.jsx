import React, { useEffect, useMemo, useState } from "react";
import { ATTENDANCE_TYPES, ATTENDANCE_TYPE_COLORS } from "../constants/attendance";
import { C } from "../constants/colors";
import { Card } from "../components/ui";
import { supabase } from "../../supabaseClient";

function EnterpriseManagementPage({ data, save, nav, profile, allLocations }) {
  const [locationDataMap, setLocationDataMap] = useState({});
  const [loading, setLoading] = useState(true);
  const locations = (allLocations || []).filter(l => !l.isEnterprise);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('get_locations_ops_data').then(({ data: result, error }) => {
      if (error) { console.error('Enterprise mgmt data error:', error); setLoading(false); return; }
      const map = {};
      (result || []).forEach(loc => { map[loc.id] = loc; });
      setLocationDataMap(map);
      setLoading(false);
    });
  }, []);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const locationStats = useMemo(() => {
    return locations.map(loc => {
      const locData = locationDataMap[loc.id] || {};
      const entries = locData.attendanceEntries || [];
      const roster = locData.attendanceRoster || [];
      const activeCount = roster.filter(r => !r.endDate).length;
      const byType = {};
      ATTENDANCE_TYPES.forEach(type => {
        const allTime = entries.filter(e => e.type === type).length;
        const last30 = entries.filter(e => e.type === type && e.date > thirtyDaysAgo).length;
        byType[type] = { allTime, last30 };
      });
      const total30 = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].last30, 0);
      const totalAll = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].allTime, 0);
      return { ...loc, byType, total30, totalAll, activeCount, entryCount: entries.length };
    }).sort((a, b) => b.totalAll - a.totalAll);
  }, [locations, locationDataMap, thirtyDaysAgo]);

  const grandTotals = useMemo(() => {
    const gt = {};
    ATTENDANCE_TYPES.forEach(type => {
      gt[type] = {
        last30: locationStats.reduce((s, l) => s + l.byType[type].last30, 0),
        allTime: locationStats.reduce((s, l) => s + l.byType[type].allTime, 0),
      };
    });
    gt.total30 = locationStats.reduce((s, l) => s + l.total30, 0);
    gt.totalAll = locationStats.reduce((s, l) => s + l.totalAll, 0);
    gt.totalActive = locationStats.reduce((s, l) => s + l.activeCount, 0);
    return gt;
  }, [locationStats]);

  if (loading) return (
    <div style={{ padding: "60px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.textMut }}>Loading attendance data across all locations...</div>
    </div>
  );

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, marginBottom: 4 }}>Management</h2>
        <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Aggregated attendance metrics across all locations.</p>
      </div>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ padding: "10px 18px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{locations.length}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>Locations</span>
        </div>
        <div style={{ padding: "10px 18px", borderRadius: 10, background: "#D1FAE5", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{grandTotals.totalActive}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>Active Employees</span>
        </div>
        <div style={{ padding: "10px 18px", borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{grandTotals.total30}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#D97706" }}>Incidents (30 Days)</span>
        </div>
        <div style={{ padding: "10px 18px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{grandTotals.totalAll}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>Incidents (All Time)</span>
        </div>
      </div>

      {/* Aggregated table by location */}
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "left", fontSize: 11, verticalAlign: "bottom", borderRight: "1px solid rgba(255,255,255,0.1)" }}>Resort</th>
                <th rowSpan={2} style={{ padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10, verticalAlign: "bottom", borderRight: "1px solid rgba(255,255,255,0.1)" }}>Active Staff</th>
                {ATTENDANCE_TYPES.map(type => (
                  <th key={type} colSpan={2} style={{ padding: "6px 8px", background: ATTENDANCE_TYPE_COLORS[type], color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10, borderRight: "1px solid rgba(255,255,255,0.2)" }}>{type}</th>
                ))}
                <th colSpan={2} style={{ padding: "6px 8px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10 }}>Total Marks</th>
              </tr>
              <tr>
                {ATTENDANCE_TYPES.map(type => (
                  <React.Fragment key={type}>
                    <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                    <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9, borderRight: "1px solid rgba(255,255,255,0.1)" }}>All Time</th>
                  </React.Fragment>
                ))}
                <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>All Time</th>
              </tr>
            </thead>
            <tbody>
              {locationStats.map((loc, idx) => (
                <tr key={loc.id} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600, borderRight: "1px solid #E5E7EB", color: C.pri, cursor: "pointer" }} onClick={() => { if (loc.slug) nav("mgmt-attendance"); }}>{loc.name}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, borderRight: "1px solid #E5E7EB", color: C.text }}>{loc.activeCount || "—"}</td>
                  {ATTENDANCE_TYPES.map(type => (
                    <React.Fragment key={type}>
                      <td style={{ padding: "6px 8px", textAlign: "center", color: loc.byType[type].last30 > 0 ? C.text : C.textMut, fontWeight: loc.byType[type].last30 > 0 ? 700 : 400 }}>{loc.byType[type].last30 || "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #E5E7EB", color: loc.byType[type].allTime > 0 ? C.text : C.textMut, fontWeight: loc.byType[type].allTime > 0 ? 700 : 400 }}>{loc.byType[type].allTime || "—"}</td>
                    </React.Fragment>
                  ))}
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: loc.total30 > 0 ? C.text : C.textMut }}>{loc.total30 || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: loc.totalAll > 0 ? C.text : C.textMut }}>{loc.totalAll || "—"}</td>
                </tr>
              ))}
              {locationStats.length === 0 && (
                <tr><td colSpan={4 + ATTENDANCE_TYPES.length * 2} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 12 }}>No locations found.</td></tr>
              )}
            </tbody>
            {locationStats.length > 0 && (
              <tfoot>
                <tr style={{ background: "#1B3A5C" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fff" }}>All Locations</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{grandTotals.totalActive}</td>
                  {ATTENDANCE_TYPES.map(type => (
                    <React.Fragment key={type}>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals[type].last30 || "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{grandTotals[type].allTime || "—"}</td>
                    </React.Fragment>
                  ))}
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.total30 || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.totalAll || "—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

export { EnterpriseManagementPage };
