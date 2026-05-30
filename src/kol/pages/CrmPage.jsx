// CrmPage — the Ignite intake CRM (R1 · Linear K9-15).
//
// A dense list-surface of Ignite submissions split into Booking / Employment
// subtabs (plus reserved coming-soon tabs), with match-status quick filters, a
// Submission Details expander, and per-submission outreach logging (channel +
// notes + next follow-up date). Fed by the ignite_leads table; outreach persists
// to ignite_leads.outreach_log via the existing per-location UPDATE RLS policy.
//
// Pure logic lives in ../crmData; the table chrome comes from the shared
// list-surface STANDARD (../../shared/listSurface).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, fmtPhone, todayStr, addDays } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Modal, MiniDatePicker } from "../../shared/ui";
import {
  DenseTable,
  ListSearchRow,
  ListTabBar,
  ListExplainer,
  PillFilter,
  PillSeparator,
  StatusPill,
  StackBadge,
  RowActionButton,
  filterRows,
} from "../../shared/listSurface";
import {
  SUBMISSION_CATEGORIES,
  getCategory,
  classifySubmissionCategory,
  countByCategory,
  countByStatusBucket,
  matchStatusMeta,
  statusBucket,
  confidencePct,
  leadDisplayName,
  leadSortName,
  leadPrimaryInterest,
  leadTypeLabel,
  buildFormDataEntries,
  getOutreachLog,
  outreachCount,
  currentFollowUp,
  makeOutreachEntry,
  appendOutreachEntry,
  followUpState,
  recommendedFollowUp,
  filterSubmissions,
  OUTREACH_CHANNELS,
  OUTREACH_CHANNEL_LABELS,
} from "../crmData";

const SECTION_LABEL = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.textMut,
  marginBottom: 6,
};

const LINK_STYLE = { color: C.pri, textDecoration: "none", fontWeight: 600 };

export default function CrmPage({ profile, locationId, addGlobalToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState("ok"); // "ok" | "schema" | "error"
  const [activeTab, setActiveTab] = useState("booking");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [logLead, setLogLead] = useState(null);

  const today = todayStr();

  const toast = useCallback(
    (message, type = "info") => {
      if (typeof addGlobalToast === "function") addGlobalToast(message, type);
    },
    [addGlobalToast]
  );

  const loadLeads = useCallback(async () => {
    if (!locationId) {
      setLeads([]);
      setLoadState("ok");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("ignite_leads")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      // 42P01 = undefined table · PGRST205 = not in PostgREST schema cache
      const schemaMissing = error.code === "42P01" || error.code === "PGRST205";
      setLoadState(schemaMissing ? "schema" : "error");
      if (!schemaMissing) {
        console.error("Failed to load Ignite submissions", error);
        toast(error.message || "Failed to load Ignite submissions", "error");
      }
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoadState("ok");
    setLeads(data || []);
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const openLog = useCallback((lead) => setLogLead(lead), []);
  const toggleExpand = useCallback((lead) => {
    setExpandedId((cur) => (cur === lead.id ? null : lead.id));
  }, []);

  const categoryCounts = useMemo(() => countByCategory(leads), [leads]);
  const inTab = useMemo(() => filterSubmissions(leads, { category: activeTab }), [leads, activeTab]);
  const statusCounts = useMemo(() => countByStatusBucket(inTab), [inTab]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        width: "minmax(0, 1.5fr)",
        sortable: true,
        sortValue: (r) => leadSortName(r),
        searchValue: (r) => `${leadDisplayName(r)} ${r.first_name || ""} ${r.last_name || ""}`,
        render: (r) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {leadDisplayName(r)}
            </span>
            <span style={{ fontSize: 10.5, color: C.textMut }}>{leadTypeLabel(r.lead_type)}</span>
          </div>
        ),
      },
      {
        key: "contact",
        header: "Contact",
        width: "minmax(0, 1.5fr)",
        searchValue: (r) => `${r.email || ""} ${r.phone || ""}`,
        render: (r) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ color: r.phone ? C.text : C.textMut, whiteSpace: "nowrap" }}>
              {r.phone ? fmtPhone(r.phone) : "No phone"}
            </span>
            <span style={{ fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.email || "—"}
            </span>
          </div>
        ),
      },
      {
        key: "interest",
        header: "Inquiry",
        width: "minmax(0, 1.3fr)",
        searchValue: (r) => leadPrimaryInterest(r),
        render: (r) => {
          const v = leadPrimaryInterest(r);
          return (
            <span style={{ color: v ? C.textSec : C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {v || "—"}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        width: "120px",
        sortable: true,
        sortValue: (r) => statusBucket(r),
        searchValue: (r) => matchStatusMeta(r.match_status).label,
        render: (r) => {
          const meta = matchStatusMeta(r.match_status);
          return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
        },
      },
      {
        key: "received",
        header: "Received",
        width: "104px",
        sortable: true,
        searchable: false,
        sortValue: (r) => r.created_at || "",
        render: (r) => <span style={{ color: C.textSec, whiteSpace: "nowrap" }}>{fmtDate(r.created_at) || "—"}</span>,
      },
      {
        key: "followup",
        header: "Follow-up",
        width: "120px",
        sortable: true,
        searchable: false,
        sortValue: (r) => currentFollowUp(r) || "9999-99-99", // un-contacted sort last
        render: (r) => {
          const fu = currentFollowUp(r);
          const state = followUpState(fu, today);
          if (state === "none") {
            return <span style={{ color: C.textMut, fontSize: 11 }}>{outreachCount(r) > 0 ? "—" : "Not contacted"}</span>;
          }
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
        key: "actions",
        header: "",
        width: "92px",
        align: "end",
        searchable: false,
        render: (r) => {
          const open = expandedId === r.id;
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <RowActionButton
                tone="primary"
                title="Log outreach"
                onClick={(e) => {
                  e.stopPropagation();
                  openLog(r);
                }}
              >
                Log
              </RowActionButton>
              <span
                title={open ? "Hide details" : "Show details"}
                style={{ display: "inline-flex", color: C.textMut, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
              >
                <I.ChevronRight />
              </span>
            </div>
          );
        },
      },
    ],
    [today, expandedId, openLog]
  );

  const visibleRows = useMemo(() => {
    const scoped = filterSubmissions(leads, { category: activeTab, status: statusFilter });
    return filterRows(scoped, query, columns);
  }, [leads, activeTab, statusFilter, query, columns]);

  const tabs = SUBMISSION_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    count: c.live ? categoryCounts[c.id] || 0 : "Soon",
  }));
  const activeCategory = getCategory(activeTab);

  const emptyText = query.trim()
    ? "No submissions match your search."
    : statusFilter !== "all"
    ? `No ${statusFilter === "new" ? "new" : statusFilter} ${activeCategory ? activeCategory.label.toLowerCase() : ""} inquiries.`
    : `No ${activeCategory ? activeCategory.label.toLowerCase() : ""} inquiries yet.`;

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>CRM</h1>
        <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: C.textMut }}>
          Booking and employment inquiries captured from Ignite, ready for outreach.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {loadState === "ok" && <span style={{ fontSize: 12, color: C.textMut }}>{leads.length} total</span>}
        <button
          type="button"
          onClick={loadLeads}
          disabled={loading}
          title="Refresh submissions"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 34,
            padding: "0 12px",
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: C.textSec,
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <I.RefreshCw />
          Refresh
        </button>
      </div>
    </div>
  );

  let body;
  if (loading && leads.length === 0) {
    body = <div style={{ padding: "44px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading submissions…</div>;
  } else if (activeCategory && !activeCategory.live) {
    body = <ComingSoon category={activeCategory} />;
  } else {
    body = (
      <DenseTable
        columns={columns}
        rows={visibleRows}
        getRowKey={(r) => r.id}
        defaultSort={{ key: "received", direction: "desc" }}
        onRowClick={toggleExpand}
        isRowExpanded={(r) => r.id === expandedId}
        renderExpansion={(r) => <SubmissionDetails lead={r} today={today} onLog={() => openLog(r)} />}
        emptyText={emptyText}
        minWidth={860}
        style={{ border: "none", borderRadius: 0 }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "4px 0" }}>
      {header}

      {loadState === "schema" ? (
        <SetupNotice />
      ) : (
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.surface }}>
          <ListSearchRow value={query} onChange={setQuery} placeholder="Search by name, contact, or inquiry…">
            <PillFilter active={statusFilter === "all"} onClick={() => setStatusFilter("all")} count={statusCounts.all}>
              All
            </PillFilter>
            <PillSeparator />
            <PillFilter variant="solid" color={C.info} active={statusFilter === "new"} onClick={() => setStatusFilter((s) => (s === "new" ? "all" : "new"))} count={statusCounts.new}>
              New
            </PillFilter>
            <PillFilter variant="solid" color={C.suc} active={statusFilter === "matched"} onClick={() => setStatusFilter((s) => (s === "matched" ? "all" : "matched"))} count={statusCounts.matched}>
              Matched
            </PillFilter>
            <PillFilter variant="solid" color={C.warn} active={statusFilter === "review"} onClick={() => setStatusFilter((s) => (s === "review" ? "all" : "review"))} count={statusCounts.review}>
              Review
            </PillFilter>
          </ListSearchRow>

          <ListTabBar
            tabs={tabs}
            activeId={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              setExpandedId(null);
            }}
          />

          {activeCategory && <ListExplainer>{activeCategory.explainer}</ListExplainer>}

          {body}
        </div>
      )}

      {logLead && (
        <LogOutreachModal
          lead={logLead}
          profile={profile}
          today={today}
          onClose={() => setLogLead(null)}
          onSaved={(updated) => {
            setLeads((ls) => ls.map((l) => (l.id === updated.id ? updated : l)));
            setLogLead(null);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission Details expander
// ─────────────────────────────────────────────────────────────────────────────

function SubmissionDetails({ lead, today, onLog }) {
  const entries = buildFormDataEntries(lead);
  const log = useMemo(
    () => getOutreachLog(lead).slice().sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt)),
    [lead]
  );
  const meta = matchStatusMeta(lead.match_status);
  const conf = confidencePct(lead.match_confidence);
  const fu = currentFollowUp(lead);
  const fuState = followUpState(fu, today);
  const telHref = lead.phone ? `tel:${String(lead.phone).replace(/[^\d+]/g, "")}` : null;
  const candidateCount = Array.isArray(lead.match_candidates) ? lead.match_candidates.length : 0;

  return (
    <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", gap: 24 }}>
      {/* Left — contact + parsed submission */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div>
          <div style={SECTION_LABEL}>Contact</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 12.5 }}>
            <span style={{ color: C.textMut }}>
              Phone:{" "}
              {lead.phone ? (
                <a href={telHref} style={LINK_STYLE}>
                  {fmtPhone(lead.phone)}
                </a>
              ) : (
                <span style={{ color: C.textMut }}>—</span>
              )}
            </span>
            <span style={{ color: C.textMut }}>
              Email:{" "}
              {lead.email ? (
                <a href={`mailto:${lead.email}`} style={LINK_STYLE}>
                  {lead.email}
                </a>
              ) : (
                <span style={{ color: C.textMut }}>—</span>
              )}
            </span>
            <span style={{ color: C.textMut }}>
              Source: <span style={{ color: C.textSec }}>{leadTypeLabel(lead.lead_type)}{lead.source_detail ? ` · ${lead.source_detail}` : ""}</span>
            </span>
          </div>
          {lead.lead_type === "phone_call" && lead.call_recording_url && (
            <div style={{ marginTop: 6, fontSize: 12.5 }}>
              <a href={lead.call_recording_url} target="_blank" rel="noreferrer" style={LINK_STYLE}>
                ▶ Play call recording
              </a>
            </div>
          )}
        </div>

        {entries.length > 0 && (
          <div>
            <div style={SECTION_LABEL}>Submission</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)", gap: "4px 14px", fontSize: 12.5 }}>
              {entries.map((e) => (
                <React.Fragment key={e.key}>
                  <span style={{ color: C.textMut, whiteSpace: "nowrap" }}>{e.label}</span>
                  <span style={{ color: C.textSec, minWidth: 0, wordBreak: "break-word" }}>{e.value}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {lead.raw_email_subject && (
          <div>
            <div style={SECTION_LABEL}>Email subject</div>
            <div style={{ fontSize: 12.5, color: C.textSec }}>{lead.raw_email_subject}</div>
          </div>
        )}
      </div>

      {/* Right — match + outreach */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div>
          <div style={SECTION_LABEL}>Match</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
            {conf != null && <span style={{ color: C.textMut }}>{conf}% confidence</span>}
            {lead.matched_client_id && (
              <span style={{ color: C.textMut }}>
                Client <span style={{ color: C.textSec, fontWeight: 600 }}>{lead.matched_client_id}</span>
                {lead.match_type ? ` · ${lead.match_type}` : ""}
              </span>
            )}
            {statusBucket(lead) === "review" && candidateCount > 0 && (
              <span style={{ color: C.textMut }}>
                {candidateCount} candidate{candidateCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={{ ...SECTION_LABEL, marginBottom: 0 }}>Outreach</span>
            <Btn size="sm" variant="secondary" onClick={onLog}>
              Log outreach
            </Btn>
          </div>
          {fu && (
            <div style={{ fontSize: 12, marginBottom: 8, color: fuState === "overdue" ? C.dan : C.textSec }}>
              Next follow-up: <strong>{fmtDate(fu)}</strong>
              {fuState === "overdue" ? " · overdue" : fuState === "today" ? " · today" : ""}
            </div>
          )}
          {log.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMut }}>No outreach logged yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {log.map((e) => (
                <div key={e.id} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 11.5, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: C.text }}>{OUTREACH_CHANNEL_LABELS[e.channel] || "Note"}</span>
                    <span style={{ color: C.textMut }}>· {fmtDate(e.loggedAt)}</span>
                    {e.loggedBy && <span style={{ color: C.textMut }}>· {e.loggedBy}</span>}
                  </div>
                  {e.notes && <div style={{ fontSize: 12, color: C.textSec }}>{e.notes}</div>}
                  {e.newFollowUp && <div style={{ fontSize: 11, color: C.textMut }}>Next follow-up: {fmtDate(e.newFollowUp)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Log outreach modal
// ─────────────────────────────────────────────────────────────────────────────

function LogOutreachModal({ lead, profile, today, onClose, onSaved, toast }) {
  const category = classifySubmissionCategory(lead);
  const previousFollowUp = currentFollowUp(lead);
  const recDate = recommendedFollowUp(category, today, addDays);
  const recHint =
    category === "employment"
      ? "Recommended: +2 days for hiring inquiries. Use a specific date if the candidate gave one."
      : "Recommended: +1 day for high-intent booking leads. Use a further date if the client gave a callback date.";

  const [channel, setChannel] = useState("call");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(recDate);
  const [saving, setSaving] = useState(false);

  const loggedBy = (profile && (profile.full_name || profile.name || profile.email)) || "Staff";

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const entry = makeOutreachEntry({ channel, notes, nextFollowUp: date, previousFollowUp, loggedBy });
    const nextLog = appendOutreachEntry(lead, entry);
    const { error } = await supabase.from("ignite_leads").update({ outreach_log: nextLog }).eq("id", lead.id);
    if (error) {
      setSaving(false);
      const columnMissing = error.code === "42703" || error.code === "PGRST204";
      console.error("Failed to log outreach", error);
      toast(
        columnMissing
          ? "Outreach logging needs the ignite_leads.outreach_log migration applied."
          : error.message || "Couldn't save outreach.",
        "error"
      );
      return;
    }
    toast("Outreach logged.", "success");
    onSaved({ ...lead, outreach_log: nextLog });
  };

  return (
    <Modal title={`Log outreach — ${leadDisplayName(lead)}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={SECTION_LABEL}>Channel</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {OUTREACH_CHANNELS.map((ch) => (
              <PillFilter key={ch.id} active={channel === ch.id} onClick={() => setChannel(ch.id)}>
                {ch.label}
              </PillFilter>
            ))}
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
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              background: C.bg,
              color: C.text,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = C.pri;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = C.border;
            }}
          />
        </div>

        <div>
          <div style={SECTION_LABEL}>Next follow-up date</div>
          <MiniDatePicker value={date} onChange={setDate} min={today} recommendedDate={recDate} recommendedHint={recHint} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save outreach"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / coming-soon / setup states
// ─────────────────────────────────────────────────────────────────────────────

function ComingSoon({ category }) {
  const Icon = I.Clock;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "56px 24px" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri }}>
        <Icon />
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{category.label} inquiries are coming soon</div>
      <div style={{ fontSize: 12.5, color: C.textMut, maxWidth: 420 }}>{category.explainer}</div>
    </div>
  );
}

function SetupNotice() {
  const Icon = I.Settings;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 14,
        padding: "64px 24px",
        border: `1.5px dashed ${C.border}`,
        borderRadius: 16,
        background: C.surfaceHover,
      }}
    >
      <div style={{ width: 56, height: 56, borderRadius: 14, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri }}>
        <Icon />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Ignite intake isn't connected yet</div>
      <div style={{ fontSize: 13, color: C.textMut, maxWidth: 460 }}>
        Once the Ignite email pipeline is set up for this location, booking and employment inquiries will appear here. Configure it under
        Settings → Ignite.
      </div>
    </div>
  );
}
