import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Card } from "../../shared/ui";

const GRASSROOTS_SETTING_KEY = "grassroots_tracker";

const SHEETS = [
  {
    id: "events",
    label: "Events",
    columns: [
      { key: "officiallyBooked", label: "Officially Booked?" },
      { key: "organizer", label: "Organizer" },
      { key: "event", label: "Event" },
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
      { key: "time", label: "Time" },
      { key: "type", label: "Type" },
      { key: "expectedAudience", label: "Expected Audience" },
      { key: "leadsCaptured", label: "Leads Captured" },
      { key: "cost", label: "Cost" },
      { key: "cpl", label: "CPL" },
      { key: "contact", label: "Contact" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    id: "drops",
    label: "Drops",
    columns: [
      { key: "business", label: "Business" },
      { key: "date", label: "Date", type: "date" },
      { key: "personInteractedWith", label: "Person Interacted With" },
      { key: "notes", label: "Notes" },
      { key: "whoDidIt", label: "Who Did It?" },
    ],
  },
  {
    id: "corporatePartnerships",
    label: "Corporate Partnerships",
    columns: [
      { key: "corporation", label: "Corporation" },
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "usEmployees", label: "US Employees" },
      { key: "deerfieldEmployees", label: "Remy Calloway Employees" },
      { key: "contactSource", label: "Contact Source" },
      { key: "proposal", label: "Proposal" },
      { key: "initialContactDate", label: "Initial Contact Date", type: "date" },
      { key: "lastContactDate", label: "Last Contact Date", type: "date" },
      { key: "nextStep", label: "Next Step" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    id: "apartments",
    label: "Apartments",
    columns: [
      { key: "apartmentComplex", label: "Apartment Complex" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "petProfessionalPartnerships",
    label: "Pet Professional Partnerships",
    columns: [
      { key: "business", label: "Business" },
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "proposal", label: "Proposal" },
      { key: "initialContactDate", label: "Initial Contact Date", type: "date" },
      { key: "lastContactDate", label: "Last Contact Date", type: "date" },
      { key: "notes", label: "Notes" },
    ],
  },
];

function makeBlankRow(columns) {
  return columns.reduce((acc, column) => {
    acc[column.key] = "";
    return acc;
  }, { id: `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` });
}

function startOfWeek(dateStr) {
  const base = new Date(`${dateStr}T12:00:00`);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function EmptyState({ title, subtitle, action }) {
  return (
    <Card style={{ padding: 30, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{subtitle}</div>
      {action && (
        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          {action}
        </div>
      )}
    </Card>
  );
}

export default function GrassrootsPage({ profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [activeSheet, setActiveSheet] = useState("events");
  const [tracker, setTracker] = useState(() => Object.fromEntries(SHEETS.map((sheet) => [sheet.id, []])));
  const loadedRef = useRef(false);
  const lastSavedRef = useRef("");
  const saveTimerRef = useRef(null);
  const saveResetTimerRef = useRef(null);

  const activeSheetConfig = SHEETS.find((sheet) => sheet.id === activeSheet) || SHEETS[0];
  const rows = tracker[activeSheet] || [];
  const today = new Date().toISOString().slice(0, 10);
  const thisWeekStart = startOfWeek(today);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const nextWeekEnd = addDays(nextWeekStart, 6);
  const thisWeekEnd = addDays(thisWeekStart, 6);

  const eventSummary = useMemo(() => {
    const eventRows = tracker.events || [];
    const upcoming = eventRows.filter((row) => row.startDate && row.startDate >= today);
    const thisWeek = eventRows.filter((row) => row.startDate && row.startDate >= thisWeekStart && row.startDate <= thisWeekEnd);
    const nextWeek = eventRows.filter((row) => row.startDate && row.startDate >= nextWeekStart && row.startDate <= nextWeekEnd);
    return {
      total: eventRows.length,
      upcoming: upcoming.length,
      thisWeek: thisWeek.length,
      nextWeek: nextWeek.length,
    };
  }, [nextWeekEnd, nextWeekStart, thisWeekEnd, thisWeekStart, today, tracker.events]);

  const loadTracker = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", GRASSROOTS_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error("Failed to load grassroots tracker", error);
      addGlobalToast("Failed to load grassroots tracker", "error");
      setLoading(false);
      return;
    }
    const value = data?.setting_value || {};
    const nextTracker = {
      events: Array.isArray(value.events) ? value.events : [],
      drops: Array.isArray(value.drops) ? value.drops : [],
      corporatePartnerships: Array.isArray(value.corporatePartnerships) ? value.corporatePartnerships : [],
      apartments: Array.isArray(value.apartments) ? value.apartments : [],
      petProfessionalPartnerships: Array.isArray(value.petProfessionalPartnerships) ? value.petProfessionalPartnerships : [],
    };
    setTracker(nextTracker);
    lastSavedRef.current = JSON.stringify(nextTracker);
    loadedRef.current = true;
    setSaveState("idle");
    setLoading(false);
  }, [addGlobalToast, locationId]);

  useEffect(() => {
    loadTracker();
  }, [loadTracker]);

  const persistTracker = useCallback(async (nextTracker) => {
    if (!locationId) return;
    setSaveState("saving");
    try {
      const { error } = await supabase.from("lite_settings").upsert({
        location_id: locationId,
        setting_key: GRASSROOTS_SETTING_KEY,
        setting_value: nextTracker,
      }, { onConflict: "location_id,setting_key" });
      if (error) throw error;
      lastSavedRef.current = JSON.stringify(nextTracker);
      setSaveState("saved");
      if (saveResetTimerRef.current) window.clearTimeout(saveResetTimerRef.current);
      saveResetTimerRef.current = window.setTimeout(() => {
        setSaveState((prev) => (prev === "saved" ? "idle" : prev));
        saveResetTimerRef.current = null;
      }, 1800);
    } catch (error) {
      console.error("Failed to autosave grassroots tracker", error);
      setSaveState("error");
      addGlobalToast(error.message || "Failed to autosave grassroots tracker", "error");
    }
  }, [addGlobalToast, locationId]);

  useEffect(() => {
    if (!loadedRef.current || loading) return undefined;
    const serialized = JSON.stringify(tracker);
    if (serialized === lastSavedRef.current) return undefined;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistTracker(tracker);
      saveTimerRef.current = null;
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [loading, persistTracker, tracker]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (saveResetTimerRef.current) window.clearTimeout(saveResetTimerRef.current);
  }, []);

  const updateCell = (sheetId, rowId, key, value) => {
    setTracker((prev) => ({
      ...prev,
      [sheetId]: (prev[sheetId] || []).map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    }));
  };

  const addRow = () => {
    const nextRow = makeBlankRow(activeSheetConfig.columns);
    setTracker((prev) => ({
      ...prev,
      [activeSheet]: [...(prev[activeSheet] || []), nextRow],
    }));
  };

  const deleteRow = (sheetId, rowId) => {
    setTracker((prev) => ({
      ...prev,
      [sheetId]: (prev[sheetId] || []).filter((row) => row.id !== rowId),
    }));
  };

  const saveLabel = saveState === "saving"
    ? "Saving..."
    : saveState === "saved"
      ? "Saved"
      : saveState === "error"
        ? "Autosave failed"
        : "Autosave ready";
  const saveTone = saveState === "saving"
    ? C.info
    : saveState === "saved"
      ? C.suc
      : saveState === "error"
        ? C.dan
        : C.textMut;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 20,
        padding: "16px 18px",
        borderRadius: 18,
        border: `1px solid ${C.border}`,
        background: `linear-gradient(135deg, ${C.priLt} 0%, #ffffff 62%)`,
        boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            Tracker controls
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text }}>Grassroots Tracking</h1>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 4, lineHeight: 1.5 }}>
            Add a row and keep typing. Changes autosave after a short pause, so the page never needs a manual save.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <div style={{
            minWidth: 108,
            padding: "7px 11px",
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: "#fff",
            color: saveTone,
            fontSize: 12,
            fontWeight: 800,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
          }}>
            {saveLabel}
          </div>
          <Btn
            variant="primary"
            size="lg"
            icon={<I.Plus />}
            onClick={addRow}
            style={{
              minWidth: 152,
              justifyContent: "center",
              whiteSpace: "nowrap",
              boxShadow: "0 12px 24px rgba(20,83,45,0.18)",
            }}
          >
            Add Row
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Events Total</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{eventSummary.total}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Upcoming Events</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2563EB" }}>{eventSummary.upcoming}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>This Week</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>{eventSummary.thisWeek}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Next Week</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{eventSummary.nextWeek}</div>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SHEETS.map((sheet) => {
          const active = sheet.id === activeSheet;
          return (
            <button
              key={sheet.id}
              onClick={() => setActiveSheet(sheet.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1.5px solid ${active ? C.pri : C.border}`,
                background: active ? C.pri : "#fff",
                color: active ? "#fff" : C.text,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {sheet.label} ({(tracker[sheet.id] || []).length})
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>Loading tracker…</Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${activeSheetConfig.label.toLowerCase()} yet`}
          subtitle="Add the first row for this sheet. New entries appear immediately and autosave as you type."
          action={(
            <Btn
              variant="primary"
              size="lg"
              icon={<I.Plus />}
              onClick={addRow}
              style={{
                minWidth: 160,
                justifyContent: "center",
                whiteSpace: "nowrap",
              }}
            >
              Add Row
            </Btn>
          )}
        />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(760, activeSheetConfig.columns.length * 170) }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {activeSheetConfig.columns.map((column) => (
                    <th key={column.key} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                      {column.label}
                    </th>
                  ))}
                  <th style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {activeSheetConfig.columns.map((column) => (
                      <td key={column.key} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, verticalAlign: "top" }}>
                        {column.label === "Notes" || column.label === "Proposal" || column.label === "Next Step" ? (
                          <textarea
                            value={row[column.key] || ""}
                            onChange={(event) => updateCell(activeSheet, row.id, column.key, event.target.value)}
                            rows={3}
                            style={{ width: "100%", minWidth: 180, padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
                          />
                        ) : (
                          <input
                            type={column.type === "date" ? "date" : "text"}
                            value={row[column.key] || ""}
                            onChange={(event) => updateCell(activeSheet, row.id, column.key, event.target.value)}
                            style={{ width: "100%", minWidth: 140, padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, verticalAlign: "top" }}>
                      <Btn variant="ghost" onClick={() => deleteRow(activeSheet, row.id)} style={{ color: C.dan }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
