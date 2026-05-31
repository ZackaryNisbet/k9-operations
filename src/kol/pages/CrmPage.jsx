// CrmPage — the booking/availability form intake CRM (R1 · Linear K9-15).
//
// A web-forms-only list of submissions: cleaned Name, readable Phone, the full
// web-form details, the pending Follow-up, and a relational Updates log
// (ignite_lead_updates — one row per outreach touch, no JSON blobs). Fed by
// ignite_leads (lead_type = web_form). Pure logic lives in ../crmData.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr, addDays } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Modal, MiniDatePicker } from "../../shared/ui";
import IgniteOnboardingWizard from "../onboarding/IgniteOnboardingWizard";
import { canManageIgnite } from "../onboarding/igniteOnboarding";
import { computeIgniteHealth } from "../onboarding/igniteHealth";
import {
  DenseTable,
  ListSearchRow,
  ListTabBar,
  ListExplainer,
  StackBadge,
  RowActionButton,
  CountButton,
  filterRows,
} from "../../shared/listSurface";
import {
  SUBMISSION_CATEGORIES,
  getCategory,
  countByCategory,
  filterSubmissions,
  cleanLeadName,
  leadSortName,
  formatPhonePretty,
  buildFormFieldEntries,
  groupUpdatesByLead,
  summarizeUpdates,
  deriveFollowUp,
  followUpState,
  recommendedFollowUp,
  buildUpdatePayload,
  classifySubmissionCategory,
  updateTypeLabel,
  UPDATE_TYPES,
} from "../crmData";

const SECTION_LABEL = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.textMut,
  marginBottom: 6,
};

export default function CrmPage({ profile, locationId, addGlobalToast }) {
  const [leads, setLeads] = useState([]);
  const [updatesByLead, setUpdatesByLead] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState("ok"); // "ok" | "schema" | "error"
  const [configured, setConfigured] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState("booking");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [logLead, setLogLead] = useState(null);

  const today = todayStr();
  const canSetup = canManageIgnite(profile); // Ignite setup is admin-only, once per location

  const toast = useCallback(
    (message, type = "info") => {
      if (typeof addGlobalToast === "function") addGlobalToast(message, type);
    },
    [addGlobalToast]
  );

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) {
      setLeads([]);
      setUpdatesByLead({});
      setConfigured(null);
      setLoadState("ok");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [leadsRes, updatesRes, cfgRes] = await Promise.all([
        supabase
          .from("ignite_leads")
          .select("*")
          .eq("location_id", locationId)
          .eq("lead_type", "web_form")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("ignite_lead_updates").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
        supabase.from("ignite_config").select("is_active").eq("location_id", locationId).limit(1),
      ]);
      setConfigured(!cfgRes.error && Array.isArray(cfgRes.data) && cfgRes.data.length > 0 && cfgRes.data[0].is_active === true);
      if (leadsRes.error) {
        const schemaMissing = leadsRes.error.code === "42P01" || leadsRes.error.code === "PGRST205";
        setLoadState(schemaMissing ? "schema" : "error");
        if (!schemaMissing) {
          console.error("Failed to load submissions", leadsRes.error);
          if (!silent) toast(leadsRes.error.message || "Failed to load submissions", "error");
        }
        setLeads([]);
        setUpdatesByLead({});
        return;
      }
      setLoadState("ok");
      setLeads(leadsRes.data || []);
      setUpdatesByLead(groupUpdatesByLead(updatesRes.error ? [] : updatesRes.data || []));
    } catch (e) {
      console.error("CRM load failed", e);
      if (!silent) setLoadState("error");
    } finally {
      setLoading(false); // never leave the page stuck on "Loading…"
    }
  }, [locationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live: stream new submissions + logged updates so the page stays current on
  // its own — no manual refresh. Mirrors the app's existing realtime pattern.
  useEffect(() => {
    if (!locationId) return undefined;
    const channel = supabase.channel(`crm-${locationId}`);
    ["ignite_leads", "ignite_lead_updates"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `location_id=eq.${locationId}` }, () => loadData({ silent: true }));
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, loadData]);

  const openLog = useCallback((lead) => setLogLead(lead), []);
  const toggleExpand = useCallback((lead) => {
    setExpandedId((cur) => (cur === lead.id ? null : lead.id));
  }, []);

  const categoryCounts = useMemo(() => countByCategory(leads), [leads]);
  const health = useMemo(
    () => computeIgniteHealth({ configured: configured === true, lastLeadAt: leads[0] && leads[0].created_at, recentLeads: leads, now: new Date() }),
    [configured, leads]
  );

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        width: "minmax(0, 1.3fr)",
        sortable: true,
        sortValue: (r) => leadSortName(r),
        searchValue: (r) => cleanLeadName(r),
        render: (r) => {
          const name = cleanLeadName(r);
          return <span style={{ fontWeight: 700, color: name ? C.text : C.textMut }}>{name || "—"}</span>;
        },
      },
      {
        key: "phone",
        header: "Phone",
        width: "150px",
        searchValue: (r) => `${r.phone || ""}`,
        render: (r) => {
          const pretty = formatPhonePretty(r.phone);
          if (!pretty) return <span style={{ color: C.textMut }}>—</span>;
          const digits = String(r.phone || "").replace(/[^\d+]/g, "");
          return (
            <a href={`tel:${digits}`} style={{ color: C.text, textDecoration: "none", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
              {pretty}
            </a>
          );
        },
      },
      {
        key: "details",
        header: "Web form",
        width: "minmax(0, 1.9fr)",
        searchValue: (r) => buildFormFieldEntries(r).map((e) => `${e.label} ${e.value}`).join(" "),
        render: (r) => {
          const entries = buildFormFieldEntries(r);
          if (!entries.length) return <span style={{ color: C.textMut }}>—</span>;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              {entries.map((e) => (
                <div key={e.key} style={{ fontSize: 11.5, lineHeight: 1.45, minWidth: 0 }}>
                  <span style={{ color: C.textMut }}>{e.label}: </span>
                  <span style={{ color: C.textSec }}>{e.value}</span>
                </div>
              ))}
            </div>
          );
        },
      },
      {
        key: "followup",
        header: "Follow-up",
        width: "128px",
        sortable: true,
        searchable: false,
        sortValue: (r) => deriveFollowUp(updatesByLead[r.id]) || "9999-99-99",
        render: (r) => {
          const fu = deriveFollowUp(updatesByLead[r.id]);
          const state = followUpState(fu, today);
          if (state === "none") return <span style={{ color: C.textMut, fontSize: 11 }}>Not contacted</span>;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
              <span style={{ color: C.textSec, whiteSpace: "nowrap" }}>{fmtDate(fu)}</span>
              {state === "overdue" && <StackBadge tone="danger">OVERDUE</StackBadge>}
              {state === "today" && <StackBadge tone="primary">TODAY</StackBadge>}
            </div>
          );
        },
      },
      {
        key: "updates",
        header: "Updates",
        width: "152px",
        searchable: false,
        render: (r) => {
          const { count, latest } = summarizeUpdates(updatesByLead[r.id]);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CountButton count={count} onClick={(e) => { e.stopPropagation(); toggleExpand(r); }} title="View updates" />
                <RowActionButton tone="primary" title="Log an update" onClick={(e) => { e.stopPropagation(); openLog(r); }}>
                  Log
                </RowActionButton>
              </div>
              {latest && (
                <div style={{ fontSize: 10.5, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {updateTypeLabel(latest.update_type)}: {latest.notes || "—"}
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [updatesByLead, today, expandedId, openLog, toggleExpand]
  );

  const visibleRows = useMemo(() => {
    const scoped = filterSubmissions(leads, { category: activeTab });
    return filterRows(scoped, query, columns);
  }, [leads, activeTab, query, columns]);

  const tabs = SUBMISSION_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: categoryCounts[c.id] || 0 }));
  const activeCategory = getCategory(activeTab);
  const emptyText = query.trim() ? "No submissions match your search." : `No ${activeCategory ? activeCategory.label.toLowerCase() : ""} submissions yet.`;

  const onLogged = useCallback((leadId, row) => {
    setUpdatesByLead((prev) => ({ ...prev, [leadId]: [row, ...(prev[leadId] || [])] }));
  }, []);

  const iconBtn = (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 9,
    border: `1px solid ${active ? C.pri : C.border}`,
    background: active ? C.pri : C.surface,
    color: active ? "#fff" : C.textSec,
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  });

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>CRM</h1>
        <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: C.textMut }}>
          Booking & availability form submissions from your website, ready for outreach.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {loadState !== "schema" && <HealthBadge health={health} />}
        {loadState === "ok" && <span style={{ fontSize: 12, color: C.textMut }}>{filterSubmissions(leads, {}).length} forms</span>}
        {canSetup && (
          <button type="button" onClick={() => setShowWizard(true)} title="Set up or update Ignite for this location" style={iconBtn(configured === false)}>
            <I.Settings />
            Ignite setup
          </button>
        )}
      </div>
    </div>
  );

  let body;
  if (loading && leads.length === 0) {
    body = <div style={{ padding: "44px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading submissions…</div>;
  } else {
    body = (
      <DenseTable
        columns={columns}
        rows={visibleRows}
        getRowKey={(r) => r.id}
        defaultSort={{ key: "followup", direction: "asc" }}
        onRowClick={toggleExpand}
        isRowExpanded={(r) => r.id === expandedId}
        renderExpansion={(r) => <SubmissionDetails lead={r} updates={updatesByLead[r.id]} today={today} onLog={() => openLog(r)} />}
        emptyText={emptyText}
        minWidth={1000}
        style={{ border: "none", borderRadius: 0 }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "4px 0" }}>
      {header}

      {loadState !== "schema" && configured === false && !loading && canSetup && <SetupBanner onStart={() => setShowWizard(true)} />}

      {loadState === "schema" ? (
        <SetupNotice onStart={() => setShowWizard(true)} canStart={canSetup} />
      ) : (
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.surface }}>
          <ListSearchRow value={query} onChange={setQuery} placeholder="Search by name, phone, or form details…" />
          <ListTabBar tabs={tabs} activeId={activeTab} onChange={(id) => { setActiveTab(id); setExpandedId(null); }} />
          {activeCategory && <ListExplainer>{activeCategory.explainer}</ListExplainer>}
          {body}
        </div>
      )}

      {logLead && (
        <LogUpdateModal
          lead={logLead}
          profile={profile}
          locationId={locationId}
          today={today}
          onClose={() => setLogLead(null)}
          onSaved={(row) => {
            onLogged(logLead.id, row);
            setLogLead(null);
          }}
          toast={toast}
        />
      )}

      {showWizard && (
        <IgniteOnboardingWizard
          locationId={locationId}
          profile={profile}
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission Details expander — full form + updates timeline
// ─────────────────────────────────────────────────────────────────────────────

function SubmissionDetails({ lead, updates, today, onLog }) {
  const entries = buildFormFieldEntries(lead);
  const log = useMemo(() => (Array.isArray(updates) ? [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []), [updates]);

  return (
    <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div>
          <div style={SECTION_LABEL}>Form submission</div>
          {entries.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.textMut }}>No form fields captured.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)", gap: "4px 14px", fontSize: 12.5 }}>
              {entries.map((e) => (
                <React.Fragment key={e.key}>
                  <span style={{ color: C.textMut, whiteSpace: "nowrap" }}>{e.label}</span>
                  <span style={{ color: C.textSec, minWidth: 0, wordBreak: "break-word" }}>{e.value}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          {lead.raw_email_subject && <div style={{ marginTop: 10, fontSize: 11.5, color: C.textMut }}>Source: {lead.raw_email_subject}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...SECTION_LABEL, marginBottom: 0 }}>Updates</span>
          <Btn size="sm" variant="secondary" onClick={onLog}>Log update</Btn>
        </div>
        {log.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMut }}>No updates logged yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {log.map((u) => (
              <div key={u.id} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11.5, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{updateTypeLabel(u.update_type)}</span>
                  <span style={{ color: C.textMut }}>· {fmtDate(u.created_at)}</span>
                  {u.created_by_name && <span style={{ color: C.textMut }}>· {u.created_by_name}</span>}
                </div>
                {u.notes && <div style={{ fontSize: 12, color: C.textSec }}>{u.notes}</div>}
                {u.next_follow_up_date && <div style={{ fontSize: 11, color: C.textMut }}>Next follow-up: {fmtDate(u.next_follow_up_date)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Log update modal → inserts a row into ignite_lead_updates
// ─────────────────────────────────────────────────────────────────────────────

function LogUpdateModal({ lead, profile, locationId, today, onClose, onSaved, toast }) {
  const category = classifySubmissionCategory(lead);
  const recDate = recommendedFollowUp(category, today, addDays);
  const [type, setType] = useState("call");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(recDate);
  const [saving, setSaving] = useState(false);

  const createdByName = (profile && (profile.full_name || profile.name || profile.email)) || "Staff";

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const payload = buildUpdatePayload({
      leadId: lead.id,
      locationId,
      type,
      notes,
      nextFollowUp: date,
      createdById: (profile && profile.id) || null,
      createdByName,
    });
    const { data, error } = await supabase.from("ignite_lead_updates").insert(payload).select().single();
    if (error) {
      setSaving(false);
      console.error("Failed to log update", error);
      toast(error.message || "Couldn't save the update.", "error");
      return;
    }
    toast("Update logged.", "success");
    onSaved(data);
  };

  return (
    <Modal title={`Log update — ${cleanLeadName(lead) || "submission"}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={SECTION_LABEL}>Type</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {UPDATE_TYPES.map((t) => {
              const active = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    border: `1.5px solid ${active ? C.pri : C.border}`,
                    background: active ? C.priLt : "transparent",
                    color: active ? C.pri : C.textMut,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={SECTION_LABEL}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened on this outreach…"
            rows={3}
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", background: C.bg, color: C.text }}
            onFocus={(e) => { e.target.style.borderColor = C.pri; }}
            onBlur={(e) => { e.target.style.borderColor = C.border; }}
          />
        </div>

        <div>
          <div style={SECTION_LABEL}>Next follow-up date</div>
          <MiniDatePicker value={date} onChange={setDate} min={today} recommendedDate={recDate} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save update"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup states (launch the onboarding wizard)
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard-style pipeline health pill (colored dot + label, detail on hover).
function HealthBadge({ health }) {
  const colors = { success: C.suc, warning: C.warn, danger: C.dan, neutral: C.textMut };
  const c = colors[health.tone] || C.textMut;
  return (
    <span
      title={health.detail}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${c}40`, background: `${c}0F`, fontSize: 12.5, fontWeight: 700, color: c, cursor: "default", whiteSpace: "nowrap" }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: c, boxShadow: `0 0 6px ${c}80` }} />
      {health.label}
    </span>
  );
}

function SetupBanner({ onStart }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", marginBottom: 14, borderRadius: 12, border: `1.5px solid ${C.pri}33`, background: `linear-gradient(135deg, ${C.priLt}, ${C.surface})` }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.pri}14`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri, flexShrink: 0 }}>
        <I.Sparkle />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Ignite isn't connected for this location yet</div>
        <div style={{ fontSize: 12.5, color: C.textSec }}>Answer a few questions and we'll wire up booking-form capture — no developer required.</div>
      </div>
      <Btn size="sm" onClick={onStart} style={{ flexShrink: 0 }}>Set up Ignite</Btn>
    </div>
  );
}

function SetupNotice({ onStart, canStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, padding: "64px 24px", border: `1.5px dashed ${C.border}`, borderRadius: 16, background: C.surfaceHover }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri }}>
        <I.Settings />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Booking-form intake isn't connected yet</div>
      <div style={{ fontSize: 13, color: C.textMut, maxWidth: 460 }}>
        {canStart
          ? "Connect your website's booking/availability form for this location and submissions will start flowing in automatically. The guided setup takes about a minute — no developer needed."
          : "This location isn't connected to its booking form yet. Ask a location admin to run the one-time Ignite setup."}
      </div>
      {canStart && (
        <Btn onClick={onStart} icon={<I.Sparkle />}>Set up Ignite</Btn>
      )}
    </div>
  );
}
