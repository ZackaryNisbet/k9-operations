// K9 Operations — RoomConfig
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

// Marker for temporary lodging rooms in the room_names setting
const TEMP_LODGING_KEY = "Temporary Lodging";

function RoomConfig({ locationId }) {
  const [roomNames, setRoomNames] = useState({}); // { "Luxury Suite": ["Luxury - 101", ...], "Temporary Lodging": [...], ... }
  const [roomTypes, setRoomTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newRoomInputs, setNewRoomInputs] = useState({}); // per-type input field value
  const [expandedType, setExpandedType] = useState(null);
  const [tempLodgingExpanded, setTempLodgingExpanded] = useState(false);
  const [newTempRoom, setNewTempRoom] = useState("");

  useEffect(() => {
    if (!locationId) return;
    const load = async () => {
      setLoading(true);
      // Fetch boarding reservation types from Gingr sync
      const { data: resTypes } = await supabase
        .from("gingr_reservation_types").select("*").eq("location_id", locationId);
      // Filter to lodging types, excluding single-day (Day Boarding)
      const boarding = (resTypes || []).filter(rt => {
        const raw = rt.raw_data || {};
        const hasLodging = raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1;
        const isSingleDay = raw.single_day === "1" || raw.single_day === 1;
        return hasLodging && !isSingleDay;
      });
      const types = boarding.map(bt => {
        const name = (bt.name || bt.type_label || "").replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim();
        return name;
      }).filter(Boolean);
      const defaultTypes = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];
      setRoomTypes(types.length > 0 ? types : defaultTypes);
      // Fetch saved room names config
      const { data: setting } = await supabase
        .from("lite_settings").select("setting_value")
        .eq("location_id", locationId).eq("setting_key", "room_names").maybeSingle();
      setRoomNames(setting?.setting_value || {});
      setLoading(false);
    };
    load();
  }, [locationId]);

  const handleSave = async () => {
    if (!locationId) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "room_names",
      setting_value: roomNames,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,setting_key" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addRoom = (type) => {
    const name = (newRoomInputs[type] || "").trim();
    if (!name) return;
    setRoomNames(prev => {
      const list = [...(prev[type] || []), name];
      return { ...prev, [type]: list };
    });
    setNewRoomInputs(prev => ({ ...prev, [type]: "" }));
  };

  const removeRoom = (type, idx) => {
    setRoomNames(prev => {
      const list = [...(prev[type] || [])];
      list.splice(idx, 1);
      const next = { ...prev, [type]: list };
      // Clean up empty temp lodging key
      if (type === TEMP_LODGING_KEY && list.length === 0) delete next[TEMP_LODGING_KEY];
      return next;
    });
  };

  const addTempRoom = () => {
    const name = newTempRoom.trim();
    if (!name) return;
    // Check for duplicates across ALL room types
    const allExisting = Object.values(roomNames).flat();
    if (allExisting.includes(name)) return;
    setRoomNames(prev => {
      const list = [...(prev[TEMP_LODGING_KEY] || []), name];
      return { ...prev, [TEMP_LODGING_KEY]: list };
    });
    setNewTempRoom("");
  };

  const tempRooms = roomNames[TEMP_LODGING_KEY] || [];
  const standardRoomCount = Object.entries(roomNames)
    .filter(([key]) => key !== TEMP_LODGING_KEY)
    .reduce((sum, [, list]) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const totalRoomCount = standardRoomCount + tempRooms.length;

  if (loading) return null;

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1.5px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Room Configuration</h4>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, background: C.surfaceHover, borderRadius: 6, padding: "3px 10px" }}>
          {totalRoomCount} total rooms
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
        Configure the exact room names for each boarding type. These must match the room names in Gingr for cleaning tracking to work correctly.
      </p>

      {/* ── Standard Room Types (auto-discovered from Gingr) ── */}
      {roomTypes.map(rt => {
        const rooms = roomNames[rt] || [];
        const isExpanded = expandedType === rt;
        return (
          <div key={rt} style={{ marginBottom: 12, borderRadius: 10, border: `1px solid ${C.borderLight}`, background: C.bg, overflow: "hidden" }}>
            <div onClick={() => setExpandedType(isExpanded ? null : rt)} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{rt}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, background: C.surfaceHover, borderRadius: 6, padding: "2px 8px" }}>{rooms.length} rooms</span>
              </div>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {isExpanded && (
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.borderLight}` }}>
                {rooms.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                    {rooms.map((rm, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.surfaceHover, border: `1px solid ${C.borderLight}`, fontSize: 12, fontWeight: 600, color: C.text }}>
                        {rm}
                        <button onClick={() => removeRoom(rt, i)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: C.textMut, fontSize: 14 }} title="Remove">&times;</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: "12px 0", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No rooms configured. Add rooms below.</p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text" placeholder={`e.g. ${rt === "Luxury Suite" ? "Luxury - 101" : rt === "Executive Room" ? "Executive - 201" : rt === "Double Compartment" ? "Double - 1C" : "Single - 1A"}`}
                    value={newRoomInputs[rt] || ""}
                    onChange={e => setNewRoomInputs(prev => ({ ...prev, [rt]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") addRoom(rt); }}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }}
                  />
                  <button onClick={() => addRoom(rt)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add Room</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Temporary Lodging Section ── */}
      <div style={{ marginTop: 20, marginBottom: 12, borderRadius: 10, border: `1.5px dashed ${C.border}`, background: C.surface, overflow: "hidden" }}>
        <div onClick={() => setTempLodgingExpanded(!tempLodgingExpanded)} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Temporary Lodging</span>
            {tempRooms.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: C.acc, background: `${C.acc}15`, borderRadius: 6, padding: "2px 8px" }}>{tempRooms.length} rooms</span>
            )}
          </div>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: tempLodgingExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        {tempLodgingExpanded && (
          <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.borderLight}` }}>
            {/* Explanation banner */}
            <div style={{ margin: "12px 0", padding: "12px 14px", borderRadius: 8, background: `${C.warn}10`, border: `1px solid ${C.warn}30` }}>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
                <strong style={{ color: C.text }}>Why is this manual?</strong> The Gingr API does not provide an endpoint to list lodging areas or temporary rooms. These rooms are only visible in Gingr's Lodging Calendar.
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
                <strong style={{ color: C.text }}>How to find them:</strong> In Gingr, go to <strong>Calendar &rarr; Lodging Calendar</strong>. Look for rooms that are <em>not</em> part of your standard room types (Luxury, Executive, Double, Single). These are typically daycare runs or overflow spaces used for temporary boarding.
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
                <strong style={{ color: C.text }}>What happens:</strong> Rooms added here become first-class rooms in K9 Operations. They will appear in Room Cleaning lists, Checkout TV, and count toward occupancy metrics.
              </p>
            </div>

            {/* Existing temp rooms */}
            {tempRooms.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                {tempRooms.map((rm, i) => (
                  <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: `${C.acc}10`, border: `1px solid ${C.acc}30`, fontSize: 12, fontWeight: 600, color: C.text }}>
                    {rm}
                    <button onClick={() => removeRoom(TEMP_LODGING_KEY, i)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: C.textMut, fontSize: 14 }} title="Remove">&times;</button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: "12px 0", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No temporary lodging rooms added yet.</p>
            )}

            {/* Add temp room input */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="e.g. Temp - DC1, Daycare Run 4"
                value={newTempRoom}
                onChange={e => setNewTempRoom(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addTempRoom(); }}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: C.bg, color: C.text, fontFamily: "inherit" }}
              />
              <button onClick={addTempRoom} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.acc, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add Room</button>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: C.textMut }}>
              Room names must match exactly what appears in Gingr's Lodging Calendar (e.g., "Daycare - DC1").
            </p>
          </div>
        )}
      </div>

      {/* ── Save Button ── */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: saved ? C.suc : C.pri, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Room Config"}
        </button>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11, color: C.textMut }}>
        Room names must match exactly what's in Gingr. Changes take effect after the next page refresh.
      </p>
    </div>
  );
}


// ─── Team Management Tab ──────────────────────────────────────────────────

export default RoomConfig;
