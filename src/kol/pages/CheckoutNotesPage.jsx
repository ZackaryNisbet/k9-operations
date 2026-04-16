import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card } from "../../shared/ui";

const LIVE_POLL_MS = 20000;
const FILTER_OP_LABELS = { is: "is", isNot: "is not" };

function FilterIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function PlusIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

function formatNoteTimestamp(entry) {
  const value = entry?.note_created_at || entry?.created_at;
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function decodeHtmlEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[normalized] ?? match;
  });
}

function cleanNoteText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(decodeHtmlEntities(text)).replace(/\u00a0/g, " ");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function noteTypeLabel(entry) {
  return String(entry?.note_type || entry?.note_title || "").trim()
    || (entry?.subject_kind === "owner" ? "Owner Note" : "Dog Note");
}

export default function CheckoutNotesPage({ nav, profile, addGlobalToast = () => {} }) {
  const locationRef = profile?.location_id || "";
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const locationId = resolvedLocationId || (isUuid(locationRef) ? locationRef : "");
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveRefreshAvailable, setLiveRefreshAvailable] = useState(true);
  const [entries, setEntries] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState("");
  const [filters, setFilters] = useState({});
  const [draftFilters, setDraftFilters] = useState({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const [configuringFilterKey, setConfiguringFilterKey] = useState(null);
  const refreshInFlightRef = useRef(false);
  const isToday = selectedDate === today;
  const notesRowId = useMemo(() => {
    if (!locationId || !selectedDate) return "";
    return `ops_gingr_notes_${locationId}_${selectedDate}`;
  }, [locationId, selectedDate]);

  useEffect(() => {
    let active = true;
    if (!locationRef) {
      setResolvedLocationId("");
      return undefined;
    }
    if (isUuid(locationRef)) {
      setResolvedLocationId(locationRef);
      return undefined;
    }

    supabase
      .from("locations")
      .select("id")
      .eq("slug", locationRef)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn("Failed to resolve location slug for Gingr notes", error);
        setResolvedLocationId(data?.id || "");
      });

    return () => {
      active = false;
    };
  }, [locationRef]);

  useEffect(() => {
    setLiveRefreshAvailable(true);
  }, [locationId, selectedDate]);

  const noteTypeOptions = useMemo(() => {
    const seen = new Set();
    for (const entry of entries) {
      const label = noteTypeLabel(entry);
      if (label) seen.add(label);
    }
    return Array.from(seen).sort((left, right) => left.localeCompare(right));
  }, [entries]);

  const noteFilterFields = useMemo(() => [
    {
      key: "note_type",
      label: "Note Type",
      section: "Notes",
      type: "select",
      ops: ["is", "isNot"],
      options: noteTypeOptions,
    },
  ].filter((field) => field.options.length > 0), [noteTypeOptions]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => {
      const noteTypeFilter = filters.note_type;
      if (!noteTypeFilter?.op || !noteTypeFilter.val) return true;
      const label = noteTypeLabel(entry);
      if (noteTypeFilter.op === "is") return label === noteTypeFilter.val;
      if (noteTypeFilter.op === "isNot") return label !== noteTypeFilter.val;
      return true;
    });
  }, [entries, filters]);

  const summary = useMemo(() => {
    const noteTypes = new Set(visibleEntries.map(noteTypeLabel).filter(Boolean));
    const creators = new Set(visibleEntries.map((entry) => entry.created_by_name || entry.created_by_gingr_id).filter(Boolean));
    return {
      total: visibleEntries.length,
      noteTypes: noteTypes.size,
      creators: creators.size,
    };
  }, [visibleEntries]);

  const applyComputedItems = useCallback((computedItems = {}) => {
    const nextEntries = Array.isArray(computedItems?.entries)
      ? computedItems.entries.map((entry) => ({ ...entry, note_text: cleanNoteText(entry.note_text) }))
      : [];
    setEntries(nextEntries);
    setRefreshedAt(computedItems?.refreshed_at || "");
  }, []);

  const loadCached = useCallback(async () => {
    if (!locationId) return;
    const { data } = await supabase
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("location_id", locationId)
      .eq("date", selectedDate)
      .eq("type_sub", "gingr_notes")
      .maybeSingle();
    applyComputedItems(data?.computed_items || {});
  }, [applyComputedItems, locationId, selectedDate]);

  const usedFilterKeys = Object.keys(draftFilters || {});
  const activeFilterCount = Object.keys(filters || {}).length;
  const availableFilterFields = noteFilterFields.filter((field) => !usedFilterKeys.includes(field.key));

  const updateFilter = useCallback((key, prop, value) => {
    setDraftFilters((current) => ({
      ...current,
      [key]: { ...(current[key] || {}), [prop]: value },
    }));
  }, []);

  const removeFilter = useCallback((key) => {
    setDraftFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (configuringFilterKey === key) setConfiguringFilterKey(null);
  }, [configuringFilterKey]);

  const selectFilterField = useCallback((key) => {
    const field = noteFilterFields.find((candidate) => candidate.key === key);
    if (!field) return;
    setDraftFilters((current) => ({
      ...current,
      [key]: { op: field.ops[0], val: field.options[0] || "" },
    }));
    setConfiguringFilterKey(key);
  }, [noteFilterFields]);

  const applyFilters = useCallback(() => {
    setFilters(draftFilters);
    setShowFilterPanel(false);
    setShowFilterPicker(false);
    setConfiguringFilterKey(null);
  }, [draftFilters]);

  const clearFilters = useCallback(() => {
    setFilters({});
    setDraftFilters({});
    setShowFilterPicker(false);
    setConfiguringFilterKey(null);
  }, []);

  const refreshLive = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    if (!liveRefreshAvailable) {
      setLoading(false);
      return;
    }
    if (refreshInFlightRef.current) {
      setLoading(false);
      return;
    }
    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-today-notes", {
        body: { location_id: locationId, date: selectedDate },
      });
      if (error) throw error;
      applyComputedItems(data || { refreshed_at: new Date().toISOString() });
    } catch (error) {
      console.error("Failed to refresh Gingr notes", error);
      const unavailable = error?.name === "FunctionsHttpError"
        || /Edge Function/i.test(error?.message || "")
        || /non-2xx/i.test(error?.message || "");
      if (unavailable) {
        setLiveRefreshAvailable(false);
      } else {
        addGlobalToast(error.message || "Failed to refresh Gingr notes", "error");
      }
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [addGlobalToast, applyComputedItems, liveRefreshAvailable, locationId, selectedDate]);

  useEffect(() => {
    if (!notesRowId) return undefined;
    const channel = supabase
      .channel(`gingr-notes-${notesRowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lite_daily_ops", filter: `id=eq.${notesRowId}` },
        (payload) => {
          if (payload?.new?.computed_items) applyComputedItems(payload.new.computed_items);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyComputedItems, notesRowId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      await loadCached();
      if (mounted && liveRefreshAvailable) await refreshLive();
      if (mounted && !liveRefreshAvailable) setLoading(false);
    })();
    const interval = liveRefreshAvailable && isToday
      ? window.setInterval(() => {
          refreshLive();
        }, LIVE_POLL_MS)
      : null;
    return () => {
      mounted = false;
      if (interval) window.clearInterval(interval);
    };
  }, [isToday, liveRefreshAvailable, loadCached, refreshLive]);

  const shiftDate = useCallback((days) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    base.setDate(base.getDate() + days);
    const nextDate = base.toISOString().slice(0, 10);
    if (nextDate <= today) setSelectedDate(nextDate);
  }, [selectedDate, today]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 28 }}>
      <style>{`
        @keyframes notesFilterSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes notesFilterFadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes notesFilterChipIn { from { opacity:0; transform:translateX(-6px) scale(0.92); } to { opacity:1; transform:translateX(0) scale(1); } }
      `}</style>
      <button
        onClick={() => nav && nav("home")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: C.pri,
          padding: "0 0 12px",
          fontFamily: "inherit",
        }}
      >
        {"← Home"}
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>{isToday ? "Today's Notes" : "Gingr Notes"}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMut }}>
            {fmtDate(selectedDate)} · {liveRefreshAvailable ? (isToday ? "watching Gingr for owner and dog notes." : "showing the selected day's owner and dog notes from Gingr/cache.") : "showing cached notes because live sync is unavailable in this environment."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => shiftDate(-1)}>Previous Day</Btn>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(event) => setSelectedDate(event.target.value || today)}
            style={{ padding: "9px 12px", borderRadius: 12, border: `1px solid ${C.border}`, fontFamily: "inherit", fontSize: 13, color: C.text }}
          />
          <Btn variant="ghost" onClick={() => shiftDate(1)} disabled={isToday}>Next Day</Btn>
          {!isToday && <Btn variant="secondary" onClick={() => setSelectedDate(today)}>Today</Btn>}
          <Btn
            variant={showFilterPanel || activeFilterCount > 0 ? "secondary" : "ghost"}
            onClick={() => {
              setDraftFilters(filters);
              setShowFilterPanel((current) => !current);
              setShowFilterPicker(false);
              setConfiguringFilterKey(null);
            }}
            icon={<FilterIcon />}
          >
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Btn>
          <Btn variant="secondary" onClick={loadCached}>Load Cached</Btn>
          <Btn variant="primary" onClick={refreshLive} disabled={refreshing || !liveRefreshAvailable}>
            {liveRefreshAvailable ? (refreshing ? "Refreshing…" : "Refresh Now") : "Cached Only"}
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Notes</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{summary.total}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Note Types</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2563EB" }}>{summary.noteTypes}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Written By</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{summary.creators}</div>
        </Card>
      </div>

      {showFilterPanel && (
        <Card style={{ padding: 0, marginBottom: 16, borderRadius: 14, background: C.bg, boxShadow: "0 8px 40px rgba(15,23,42,0.08)", overflow: "hidden", animation: "notesFilterSlideIn 0.2s ease-out" }}>
          <div style={{ padding: "14px 18px", minHeight: 48 }}>
            {usedFilterKeys.length === 0 && !showFilterPicker && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", color: C.textMut, fontSize: 13, fontWeight: 700 }}>
                <FilterIcon /> No filters active
              </div>
            )}

            {usedFilterKeys.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showFilterPicker ? 12 : 0 }}>
                {usedFilterKeys.map((key, index) => {
                  const field = noteFilterFields.find((candidate) => candidate.key === key);
                  const filter = draftFilters[key];
                  if (!field || !filter) return null;
                  const isConfiguring = configuringFilterKey === key;
                  return (
                    <div key={key} style={{ animation: `notesFilterChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", overflow: "hidden" }}>
                        <button type="button" onClick={() => { setConfiguringFilterKey(isConfiguring ? null : key); setShowFilterPicker(false); }} style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {field.label}
                        </button>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {FILTER_OP_LABELS[filter.op] || filter.op}
                        </span>
                        <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 700, color: filter.val ? C.text : C.dan, whiteSpace: "nowrap" }}>
                          {filter.val || "set value"}
                        </span>
                        <button type="button" onClick={() => removeFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                          <XIcon size={10} />
                        </button>
                      </div>

                      {isConfiguring && (
                        <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "notesFilterFadeIn 0.2s ease-out" }}>
                          <div style={{ fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Condition</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                            {field.ops.map((op, opIndex) => (
                              <button
                                key={op}
                                type="button"
                                onClick={() => updateFilter(key, "op", op)}
                                style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`, background: filter.op === op ? C.pri : "#fff", color: filter.op === op ? "#fff" : C.text, fontSize: 11, fontWeight: filter.op === op ? 900 : 600, cursor: "pointer", fontFamily: "inherit", animation: `notesFilterFadeIn 0.18s ease-out ${opIndex * 0.02}s both` }}
                              >
                                {FILTER_OP_LABELS[op] || op}
                              </button>
                            ))}
                          </div>
                          <div style={{ fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Value</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(field.options || []).map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => updateFilter(key, "val", option)}
                                style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.val === option ? C.pri : C.borderLight}`, background: filter.val === option ? C.pri : "#fff", color: filter.val === option ? "#fff" : C.text, fontSize: 11, fontWeight: filter.val === option ? 900 : 600, cursor: "pointer", fontFamily: "inherit" }}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!showFilterPicker ? (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, animation: "notesFilterFadeIn 0.2s ease-out" }}>
                <button
                  type="button"
                  onClick={() => { setShowFilterPicker(true); setFilterPickerReady(false); setConfiguringFilterKey(null); setTimeout(() => setFilterPickerReady(true), 10); }}
                  disabled={availableFilterFields.length === 0}
                  style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${availableFilterFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: availableFilterFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 900, cursor: availableFilterFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <PlusIcon /> Add Filter
                </button>
              </div>
            ) : (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "notesFilterSlideIn 0.22s ease-out" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.text }}>Choose a filter</span>
                  <button type="button" onClick={() => setShowFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}><XIcon /></button>
                </div>
                <div style={{ padding: "6px 0" }}>
                  <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", animation: filterPickerReady ? "notesFilterFadeIn 0.18s ease-out both" : "none" }}>Notes</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                    {availableFilterFields.map((field, fieldIndex) => (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => { selectFilterField(field.key); setShowFilterPicker(false); }}
                        style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: filterPickerReady ? `notesFilterChipIn 0.22s ease-out ${fieldIndex * 0.03}s both` : "none" }}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={applyFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
                Apply{usedFilterKeys.length > 0 ? ` (${usedFilterKeys.length})` : ""}
              </button>
              <button type="button" onClick={clearFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Clear All
              </button>
              <button type="button" onClick={() => { setShowFilterPanel(false); setShowFilterPicker(false); setConfiguringFilterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          </div>
        </Card>
      )}

      {refreshedAt ? (
        <div style={{ fontSize: 11, color: C.textMut, marginBottom: 14 }}>
          Last refreshed {new Date(refreshedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      ) : null}

      {loading ? (
        <Card style={{ padding: 32, textAlign: "center", color: C.textMut }}>Loading Gingr notes…</Card>
      ) : entries.length === 0 ? (
        <EmptyState title="No Gingr notes returned for this date" subtitle="The selected day returned zero owner or dog notes from the Gingr reservation sync/cache. Use Refresh Now to re-check Gingr or choose another day." />
      ) : visibleEntries.length === 0 ? (
        <EmptyState title="No notes match these filters" subtitle="Clear the note type filter or choose a different note type." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleEntries.map((entry) => (
            <Card key={entry.id} style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{entry.subject_name || "Unknown"}</div>
                    <Badge color={entry.note_source === "owner_note" ? "warning" : "primary"}>{noteTypeLabel(entry)}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                    {entry.dog_name ? `Dog: ${entry.dog_name}` : null}
                    {entry.owner_name ? `${entry.dog_name ? " · " : ""}Owner: ${entry.owner_name}` : null}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                    {formatNoteTimestamp(entry) || entry.note_date || "Date unavailable"}
                    {entry.created_by_name ? ` · By ${entry.created_by_name}` : ""}
                    {entry.created_by_gingr_id ? ` · Gingr user #${entry.created_by_gingr_id}` : ""}
                  </div>
                </div>
                {entry.reservation_gingr_id ? (
                  <div style={{ fontSize: 11, color: C.textMut }}>Reservation #{entry.reservation_gingr_id}</div>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{cleanNoteText(entry.note_text)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
