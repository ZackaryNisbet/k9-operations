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
import { Btn, Modal, LogEntryModal, RecordActivityModal, StatusSelect } from "../../shared/ui";
import IgniteOnboardingWizard from "../onboarding/IgniteOnboardingWizard";
import IgnitePipelineDiagram from "../onboarding/IgnitePipelineDiagram";
import { FormFields } from "./crmFormFields";
import { canManageIgnite } from "../onboarding/igniteOnboarding";
import { computeIgniteHealth, isSnapshotFresh, describeHealthBadge, healthChecks, formatAgo, formatUntil, formatClock } from "../onboarding/igniteHealth";
import {
  DenseTable,
  ListSearchRow,
  ListTabBar,
  ListExplainer,
  StackBadge,
  RowActionButton,
  CountButton,
  PillFilter,
  ListSurface,
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
  canonicalFormFields,
  populatedFieldCount,
  leadPhone,
  groupUpdatesByLead,
  summarizeUpdates,
  deriveFollowUp,
  leadUpdates,
  buildLeadHistoryRows,
  buildLeadHistoryFilterOptions,
  applyLeadHistoryFilters,
  buildLeadHistoryDayMetrics,
  receivedDate,
  receivedTime,
  leadAttachments,
  fmtFileSize,
  followUpState,
  buildUpdatePayload,
  classifySubmissionCategory,
  updateTypeLabel,
  UPDATE_TYPES,
  CRM_LEAD_STATUSES,
  CRM_DEFAULT_STATUS,
  CRM_OPEN_STATUSES,
  leadStatusValue,
  getLeadStatusMeta,
} from "../crmData";
import { SECTION_LABEL, HEALTH_COLORS } from "./crm/constants";
import { fmtDateTime } from "./crm/format";
import { SetupBanner, SetupNotice } from "./crm/SetupStates";
import { HealthBadge } from "./crm/HealthBadge";
import { HistoryView } from "./crm/HistoryView";


export default function CrmPage({ profile, locationId, addGlobalToast }) {
  const [leads, setLeads] = useState([]);
  const [updatesByLead, setUpdatesByLead] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState("ok"); // "ok" | "schema" | "error"
  const [configured, setConfigured] = useState(null);
  const [serverHealth, setServerHealth] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState("booking");
  const [query, setQuery] = useState("");
  const [expand, setExpand] = useState({ id: null, mode: "form" });
  const [activityLead, setActivityLead] = useState(null);
  const [statusFilter, setStatusFilter] = useState(() => new Set(CRM_OPEN_STATUSES));
  const [historyFilters, setHistoryFilters] = useState({ date: "", lead: "", type: "", actor: "" });
  const [logLead, setLogLead] = useState(null);
  const [showHealth, setShowHealth] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

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
      setServerHealth(null);
      setLoadState("ok");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [leadsRes, updatesRes, cfgRes, healthRes] = await Promise.all([
        supabase
          .from("ignite_leads")
          .select("*")
          .eq("location_id", locationId)
          .eq("lead_type", "web_form")
          .eq("is_synthetic", false)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("ignite_lead_updates").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
        supabase.from("ignite_config").select("is_active").eq("location_id", locationId).limit(1),
        supabase.from("ignite_health").select("*").eq("location_id", locationId).order("checked_at", { ascending: false }).limit(1),
      ]);
      setConfigured(!cfgRes.error && Array.isArray(cfgRes.data) && cfgRes.data.length > 0 && cfgRes.data[0].is_active === true);
      setServerHealth(!healthRes.error && healthRes.data && healthRes.data[0] ? healthRes.data[0] : null);
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
    ["ignite_leads", "ignite_lead_updates", "ignite_health"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `location_id=eq.${locationId}` }, () => loadData({ silent: true }));
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, loadData]);

  // Tick the "verified Xm ago / next run" relative times without a refetch.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const openLog = useCallback((lead) => setLogLead(lead), []);
  // Persist a lead's pipeline status (optimistic; revert on error).
  const setLeadStatus = useCallback(async (lead, status) => {
    const prevStatus = lead.lead_status || null;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, lead_status: status } : l)));
    const { error } = await supabase.from("ignite_leads").update({ lead_status: status }).eq("id", lead.id);
    if (error) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, lead_status: prevStatus } : l)));
      toast(error.message || "Couldn't update status.", "error");
      return;
    }
    const meta = getLeadStatusMeta(status);
    toast(`Status → ${meta.short || meta.label}`, "success");
  }, [toast]);
  // One inline expander per row, in one of two modes — the booking form FIELDS
  // or the update LOG. Clicking the active one collapses it; clicking the other
  // switches. Both open downward beneath the row (no modal), like Marketing.
  const toggleExpand = useCallback((lead, mode = "form") => {
    setExpand((cur) => (cur.id === lead.id && cur.mode === mode ? { id: null, mode: cur.mode } : { id: lead.id, mode }));
  }, []);

  const categoryCounts = useMemo(() => countByCategory(leads), [leads]);
  const health = useMemo(() => {
    // Prefer the live server snapshot (validated bridge + Resend + DB + round-trip);
    // fall back to a client-side guess from freshness when there's no fresh snapshot.
    if (serverHealth && isSnapshotFresh(serverHealth)) return describeHealthBadge(serverHealth, nowTick);
    const guess = computeIgniteHealth({ configured: configured === true, lastLeadAt: leads[0] && leads[0].created_at, recentLeads: leads, now: new Date() });
    return { ...guess, ok: guess.level === "ok", verifiedAgo: null, nextClock: null, nextUntil: null };
  }, [serverHealth, configured, leads, nowTick]);

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
        key: "received",
        header: "Received",
        width: "120px",
        sortable: true,
        searchable: false,
        sortValue: (r) => r.created_at || "",
        render: (r) => {
          if (!receivedDate(r)) return <span style={{ color: C.textMut }}>—</span>;
          const time = receivedTime(r);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, whiteSpace: "nowrap" }}>
              <span style={{ color: C.textSec }}>{fmtDate(receivedDate(r))}</span>
              {time ? <span style={{ fontSize: 11, color: C.textMut }}>{time}</span> : null}
            </div>
          );
        },
      },
      {
        key: "phone",
        header: "Phone",
        width: "150px",
        searchValue: (r) => leadPhone(r),
        render: (r) => {
          const raw = leadPhone(r);
          const pretty = formatPhonePretty(raw);
          if (!pretty) return <span style={{ color: C.textMut }}>—</span>;
          const digits = raw.replace(/[^\d+]/g, "");
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
        searchValue: (r) => canonicalFormFields(r).filter((e) => e.value).map((e) => `${e.label} ${e.value}`).join(" "),
        render: (r) => {
          const count = populatedFieldCount(r);
          if (!count) return <span style={{ color: C.textMut }}>—</span>;
          const expanded = expand.id === r.id && expand.mode === "form";
          const label = classifySubmissionCategory(r) === "employment" ? "Employment Form" : "Booking Form";
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(r, "form"); }}
              title={expanded ? "Hide details" : "Show form details"}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 11px", borderRadius: 8, border: `1px solid ${expanded ? C.pri : C.border}`, background: expanded ? C.priLt : C.surface, color: expanded ? C.pri : C.textSec, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {label}
              <span style={{ fontSize: 10.5, fontWeight: 800, color: expanded ? C.pri : C.textMut, background: expanded ? "#fff" : C.surfaceHover, borderRadius: 20, padding: "0 6px", lineHeight: "16px" }}>{count}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M6 9l6 6 6-6" /></svg>
            </button>
          );
        },
      },
      ...(activeTab === "booking" ? [{
        key: "status",
        header: "Status",
        width: "154px",
        searchable: false,
        render: (r) => (
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex" }}>
            <StatusSelect value={leadStatusValue(r)} options={CRM_LEAD_STATUSES} disabled />
          </div>
        ),
      }] : []),
      {
        key: "followup",
        header: "Follow-up",
        width: "128px",
        sortable: true,
        searchable: false,
        sortValue: (r) => deriveFollowUp(leadUpdates(r, updatesByLead)) || "9999-99-99",
        render: (r) => {
          const fu = deriveFollowUp(leadUpdates(r, updatesByLead));
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
          const { count, latest } = summarizeUpdates(leadUpdates(r, updatesByLead));
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CountButton count={count} onClick={(e) => { e.stopPropagation(); setActivityLead(r); }} title="View update log" />
                <RowActionButton tone="primary" title="Log an update" onClick={(e) => { e.stopPropagation(); openLog(r); }}>
                  Log
                </RowActionButton>
              </div>
              {latest && !latest.system && (
                <div style={{ fontSize: 10.5, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {updateTypeLabel(latest.update_type)}: {latest.notes || "—"}
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [updatesByLead, today, expand, openLog, toggleExpand, activeTab, setLeadStatus]
  );

  const visibleRows = useMemo(() => {
    const scoped = filterSubmissions(leads, { category: activeTab });
    const byStatus = activeTab === "booking" ? scoped.filter((r) => statusFilter.has(leadStatusValue(r))) : scoped;
    return filterRows(byStatus, query, columns);
  }, [leads, activeTab, query, columns, statusFilter]);

  // Per-status counts for the filter pills (booking leads only).
  const statusCounts = useMemo(() => {
    const m = {};
    for (const r of filterSubmissions(leads, { category: "booking" })) {
      const v = leadStatusValue(r);
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  }, [leads]);

  const historyRows = useMemo(() => buildLeadHistoryRows(leads, updatesByLead), [leads, updatesByLead]);
  const historyFilterOptions = useMemo(() => buildLeadHistoryFilterOptions(historyRows), [historyRows]);
  const filteredHistoryRows = useMemo(() => applyLeadHistoryFilters(historyRows, historyFilters), [historyRows, historyFilters]);
  const historyDayMetrics = useMemo(() => buildLeadHistoryDayMetrics(historyRows, historyFilters.date), [historyRows, historyFilters.date]);
  const historyFilterCount = Object.values(historyFilters).filter(Boolean).length;
  const setHistoryFilter = useCallback((key, value) => setHistoryFilters((cur) => ({ ...cur, [key]: value })), []);
  const clearHistoryFilters = useCallback(() => setHistoryFilters({ date: "", lead: "", type: "", actor: "" }), []);

  const tabs = [
    ...SUBMISSION_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: categoryCounts[c.id] || 0 })),
    { id: "history", label: "History", count: historyRows.length },
  ];
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
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {loadState !== "schema" && <HealthBadge model={health} onOpen={() => setShowHealth(true)} />}
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
  } else if (activeTab === "history") {
    body = (
      <HistoryView
        allRows={historyRows}
        rows={filteredHistoryRows}
        filterOptions={historyFilterOptions}
        filters={historyFilters}
        onFilter={setHistoryFilter}
        onClear={clearHistoryFilters}
        filterCount={historyFilterCount}
        metrics={historyDayMetrics}
      />
    );
  } else {
    body = (
      <DenseTable
        columns={columns}
        rows={visibleRows}
        getRowKey={(r) => r.id}
        defaultSort={{ key: "received", direction: "desc" }}
        onRowClick={toggleExpand}
        isRowExpanded={(r) => r.id === expand.id}
        renderExpansion={(r) => <SubmissionDetails lead={r} />}
        emptyText={emptyText}
        minWidth={1120}
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
        <ListSurface>
          <ListSearchRow value={query} onChange={setQuery} placeholder="Search by name, phone, or form details…">
            {activeTab === "booking" && (
              <>
                {CRM_LEAD_STATUSES.map((s) => {
                  const on = statusFilter.has(s.value);
                  return (
                    <PillFilter
                      key={s.value}
                      active={on}
                      count={statusCounts[s.value] || 0}
                      title={on ? `Hide ${s.label}` : `Show ${s.label}`}
                      onClick={() => setStatusFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.value)) next.delete(s.value); else next.add(s.value);
                        return next;
                      })}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: s.bg, border: `1.5px solid ${s.fg}`, flexShrink: 0 }} />
                        {s.short}
                      </span>
                    </PillFilter>
                  );
                })}
                {statusFilter.size !== CRM_LEAD_STATUSES.length && (
                  <button type="button" onClick={() => setStatusFilter(new Set(CRM_LEAD_STATUSES.map((x) => x.value)))} style={{ marginLeft: 2, border: "none", background: "transparent", color: C.pri, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>All</button>
                )}
              </>
            )}
          </ListSearchRow>
          <ListTabBar tabs={tabs} activeId={activeTab} onChange={(id) => { setActiveTab(id); setExpand({ id: null, mode: "form" }); }} />
          {activeTab === "history"
            ? <ListExplainer>Every logged change across your leads — who changed what, the follow-up it set, and when.</ListExplainer>
            : activeCategory && <ListExplainer>{activeCategory.explainer}</ListExplainer>}
          {body}
        </ListSurface>
      )}

      {logLead && (
        <LogUpdateModal
          lead={logLead}
          profile={profile}
          locationId={locationId}
          today={today}
          updates={leadUpdates(logLead, updatesByLead)}
          onClose={() => setLogLead(null)}
          onSaved={(row) => {
            onLogged(logLead.id, row);
            setLogLead(null);
          }}
          onStatusChanged={(id, status) => setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, lead_status: status } : l)))}
          toast={toast}
        />
      )}

      {activityLead && (() => {
        const log = [...leadUpdates(activityLead, updatesByLead)].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const acts = log.map((u) => ({
          id: u.id,
          actor: u.created_by_name || "Ignite",
          timestamp: fmtDateTime(u.created_at),
          body: u.notes,
          meta: (
            <>
              <span style={{ fontWeight: 700, color: C.pri }}>{updateTypeLabel(u.update_type)}</span>
              {u.new_status && (
                <span>· {getLeadStatusMeta(u.prev_status).short} → <span style={{ fontWeight: 800, color: getLeadStatusMeta(u.new_status).fg }}>{getLeadStatusMeta(u.new_status).short}</span></span>
              )}
              {u.next_follow_up_date && <span>· Next follow-up: {fmtDate(u.next_follow_up_date)}</span>}
            </>
          ),
        }));
        const lead = activityLead;
        return (
          <RecordActivityModal
            title={cleanLeadName(lead) || "Submission"}
            context={<>
              <div style={{ marginBottom: 14 }}>
                <StatusSelect value={leadStatusValue(lead)} options={CRM_LEAD_STATUSES} disabled />
              </div>
              <SubmissionDetails lead={lead} />
            </>}
            activities={acts}
            emptyText="No outreach logged yet."
            onLog={() => { setActivityLead(null); openLog(lead); }}
            onClose={() => setActivityLead(null)}
          />
        );
      })()}

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

      {showHealth && (
        <HealthDetailModal locationId={locationId} snapshot={serverHealth} onClose={() => setShowHealth(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission Details expander — full form + updates timeline
// ─────────────────────────────────────────────────────────────────────────────

// Résumé / file attachments captured from the inbound email. Private bucket →
// mint a short-lived signed URL on click. Renders nothing when there are none.
function AttachmentLinks({ lead }) {
  const files = leadAttachments(lead);
  const [busy, setBusy] = useState("");
  if (!files.length) return null;
  const open = async (f) => {
    setBusy(f.path);
    try {
      const { data, error } = await supabase.storage
        .from("ignite-attachments")
        .createSignedUrl(f.path, 3600);
      if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setBusy("");
    }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={SECTION_LABEL}>Resume / attachments</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => open(f)}
            disabled={busy === f.path}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 11px",
              border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface,
              color: C.text, cursor: busy === f.path ? "default" : "pointer",
              fontSize: 12.5, textAlign: "left", maxWidth: "100%",
            }}
          >
            <span style={{ fontWeight: 800 }}>{busy === f.path ? "…" : "↓"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</span>
            {fmtFileSize(f.size) ? <span style={{ color: C.textMut }}>· {fmtFileSize(f.size)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmissionDetails({ lead }) {
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={SECTION_LABEL}>Form submission</div>
      <FormFields lead={lead} />
      <AttachmentLinks lead={lead} />
      {lead.raw_email_subject && <div style={{ marginTop: 12, fontSize: 11.5, color: C.textMut }}>Source: {lead.raw_email_subject}</div>}
    </div>
  );
}

// The outreach log for one lead — expands inline beneath the row (the "log" mode
// of the row expander, opened from the Updates count), like the Marketing tab.
// Shows the touches plus the "Booking form received" baseline; the booking form
// FIELDS are the OTHER expander mode ("Booking form details"), not here.

function UpdatesPanel({ lead, updates, onLog }) {
  const log = useMemo(() => (Array.isArray(updates) ? [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []), [updates]);
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <span style={{ ...SECTION_LABEL, marginBottom: 0 }}>Update log</span>
        <Btn size="sm" variant="secondary" onClick={onLog}>Log update</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {log.map((u, i) => (
          <div key={u.id} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${C.borderLight}` }}>
            <div style={{ fontSize: 12.5, marginBottom: 5 }}>
              <span style={{ fontWeight: 800, color: C.text }}>{u.created_by_name || "Ignite"}</span>
              <span style={{ color: C.textMut }}>{` — ${fmtDateTime(u.created_at)}`}</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {u.notes || "—"}
            </div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11.5, color: C.textMut }}>
              <span style={{ fontWeight: 700, color: C.pri }}>{updateTypeLabel(u.update_type)}</span>
              {u.next_follow_up_date && <span>· Next follow-up: {fmtDate(u.next_follow_up_date)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Log update modal → inserts a row into ignite_lead_updates
// ─────────────────────────────────────────────────────────────────────────────

function LogUpdateModal({ lead, profile, locationId, today, updates, onClose, onSaved, onStatusChanged, toast }) {
  // Suggest a next-day follow-up from the moment the picker is opened.
  const recDate = addDays(today, 1);
  const [saving, setSaving] = useState(false);

  const createdByName = (profile && (profile.full_name || profile.name || profile.email)) || "Staff";

  // Status is pipeline-driven: every log carries the status decision. A New lead
  // must advance; once it's moved, "Leave unchanged" is allowed. The call-attempt
  // hint enforces the 3-call cadence from the activity log (not the status).
  const currentStatus = leadStatusValue(lead);
  const requireStatusChange = currentStatus === CRM_DEFAULT_STATUS;
  const callCount = (Array.isArray(updates) ? updates : []).filter((u) => u.update_type === "call").length;
  const chasing = currentStatus === CRM_DEFAULT_STATUS || currentStatus === "contacted_talking";
  const attemptNo = callCount + 1;
  const statusHint = chasing
    ? (attemptNo >= 3
        ? `If this is a call, that's attempt ${attemptNo} — you're at the 3-call cadence, so set Unresponsive if there's still no answer.`
        : `If this is a call, it's attempt ${attemptNo} of 3 before the cadence is up.`)
    : null;

  // Persistence lives here; the clean dialog shell + Type/Status/Notes/Follow-up
  // fields come from the shared LogEntryModal.
  const save = async ({ type, notes, date, status }) => {
    if (saving) return;
    setSaving(true);
    const prevStatus = currentStatus;
    const resolved = status ?? prevStatus;
    const payload = buildUpdatePayload({
      leadId: lead.id,
      locationId,
      type,
      notes,
      nextFollowUp: date,
      createdById: (profile && profile.id) || null,
      createdByName,
      prevStatus,
      newStatus: resolved,
    });
    const { data, error } = await supabase.from("ignite_lead_updates").insert(payload).select().single();
    if (error) {
      setSaving(false);
      console.error("Failed to log update", error);
      toast(error.message || "Couldn't save the update.", "error");
      return;
    }
    if (resolved !== prevStatus) {
      const { error: stErr } = await supabase.from("ignite_leads").update({ lead_status: resolved }).eq("id", lead.id);
      if (stErr) {
        console.error("Failed to update lead status", stErr);
        toast("Update logged, but the status change didn't save.", "error");
      } else if (onStatusChanged) {
        onStatusChanged(lead.id, resolved);
      }
    }
    toast("Update logged.", "success");
    onSaved(data);
  };

  return (
    <LogEntryModal
      title={`Log update — ${cleanLeadName(lead) || "submission"}`}
      types={UPDATE_TYPES}
      initialType="call"
      statuses={CRM_LEAD_STATUSES}
      currentStatus={currentStatus}
      requireStatusChange={requireStatusChange}
      statusSectionLabel="Update status"
      statusHint={statusHint}
      notesLabel="Notes"
      notesPlaceholder="What happened on this outreach…"
      followUpLabel="Next follow-up date"
      today={today}
      minDate={today}
      recommendedDate={recDate}
      recommendedHint={`Suggested follow-up: ${fmtDate(recDate)}`}
      saveLabel="Save update"
      onClose={onClose}
      onSave={save}
      saving={saving}
    />
  );
}

// Full pipeline-health panel — every check + the per-run latencies, in detail.
function HealthDetailModal({ locationId, snapshot, onClose }) {
  const [runs, setRuns] = useState(null);
  const [showHow, setShowHow] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase
      .from("ignite_health")
      .select("*")
      .eq("location_id", locationId)
      .order("checked_at", { ascending: false })
      .limit(25)
      .then(({ data }) => { if (alive) setRuns(data || []); }, () => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, [locationId]);

  const latest = snapshot || (runs && runs[0]) || null;
  const checks = healthChecks(latest);
  const lvlTone = { ok: "success", warn: "warning", down: "danger", unconfigured: "neutral" };
  const headC = HEALTH_COLORS[lvlTone[latest && latest.level] || "neutral"];
  const headLabel = latest
    ? { ok: "Healthy", warn: "Needs attention", down: "Pipeline down", unconfigured: "Not connected" }[latest.level] || "Unknown"
    : "No data yet";
  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
  const dot = (ok) => <span style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, background: ok === true ? C.suc : ok === false ? C.dan : C.textMut }} />;
  const cols = "1.3fr 0.7fr 0.8fr 0.8fr 0.6fr 0.9fr";

  return (
    <Modal title="Pipeline health" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, border: `1px solid ${headC}40`, background: `${headC}0D` }}>
          <span style={{ width: 11, height: 11, borderRadius: 99, background: headC, marginTop: 3, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{headLabel}</div>
            <div style={{ fontSize: 12.5, color: C.textSec, marginTop: 2 }}>{(latest && latest.detail) || "Awaiting the first health run."}</div>
            <div style={{ fontSize: 11.5, color: C.textMut, marginTop: 6 }}>
              {latest && latest.checked_at ? `Last verified ${formatAgo(latest.checked_at)}` : "Not yet verified"}
              {latest && latest.next_run_at ? ` · next run ${formatClock(latest.next_run_at)} (${formatUntil(latest.next_run_at) || "soon"})` : ""}
              {" · every 15 min"}
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowHow((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surfaceHover, color: C.text, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
          >
            How it works — pipeline architecture and data flow
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: showHow ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showHow ? <div style={{ marginTop: 12 }}><IgnitePipelineDiagram /></div> : null}
        </div>

        <div>
          <div style={SECTION_LABEL}>Checks · latest run</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {checks.map((ch) => (
              <div key={ch.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {dot(ch.ok)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{ch.label}</div>
                  <div style={{ fontSize: 11, color: C.textMut }}>{ch.note}</div>
                </div>
                <div style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: ch.ok === false ? C.dan : C.textSec, whiteSpace: "nowrap" }}>
                  {ch.ms != null ? `${ch.ms} ms` : ch.ok == null ? "idle" : ch.ok ? "ok" : "fail"}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {dot(latest && latest.last_lead_at ? true : null)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>Real-lead freshness</div>
                <div style={{ fontSize: 11, color: C.textMut }}>Newest non-synthetic submission</div>
              </div>
              <div style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap" }}>{latest && latest.last_lead_at ? formatAgo(latest.last_lead_at) : "none"}</div>
            </div>
          </div>
        </div>

        {latest && latest.probe_sent_at ? (
          <div>
            <div style={SECTION_LABEL}>Last synthetic round-trip</div>
            <div style={{ ...mono, fontSize: 12, color: C.textSec, display: "flex", flexDirection: "column", gap: 2 }}>
              <span>sent_at &nbsp;&nbsp;&nbsp;{formatClock(latest.probe_sent_at)}</span>
              <span>received_at {latest.probe_received_at ? formatClock(latest.probe_received_at) : "—"}</span>
              <span>inserted_at {latest.probe_inserted_at ? formatClock(latest.probe_inserted_at) : "—"}</span>
              <span>latency &nbsp;&nbsp;&nbsp;{latest.roundtrip_ms != null ? `${latest.roundtrip_ms} ms` : "—"}</span>
            </div>
          </div>
        ) : null}

        <div>
          <div style={SECTION_LABEL}>Recent runs</div>
          {runs == null ? (
            <div style={{ fontSize: 12, color: C.textMut }}>Loading…</div>
          ) : runs.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMut }}>No runs recorded yet.</div>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", ...mono }}>
              <div style={{ display: "grid", gridTemplateColumns: cols, fontSize: 10, fontWeight: 800, color: C.textMut, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.surfaceHover, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                <span>time</span><span>level</span><span>bridge</span><span>resend</span><span>db</span><span>round-trip</span>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {runs.map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: cols, fontSize: 10.5, color: C.textSec, padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
                    <span>{formatClock(r.checked_at)}</span>
                    <span style={{ fontWeight: 700, color: r.level === "ok" ? C.suc : r.level === "down" ? C.dan : C.warn }}>{r.level}</span>
                    <span>{r.bridge_ms != null ? `${r.bridge_ms}ms` : r.bridge_ok ? "ok" : "—"}</span>
                    <span>{r.resend_ms != null ? `${r.resend_ms}ms` : r.resend_ok == null ? "—" : r.resend_ok ? "ok" : "fail"}</span>
                    <span>{r.db_ms != null ? `${r.db_ms}ms` : "—"}</span>
                    <span>{r.roundtrip_ms != null ? `${r.roundtrip_ms}ms` : r.roundtrip_ok == null ? "idle" : r.roundtrip_ok ? "ok" : "miss"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
