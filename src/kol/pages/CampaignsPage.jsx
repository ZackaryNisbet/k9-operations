// CRM Email Campaigns — compose branded email blasts to website booking-form leads
// (ignite_leads) and send them through Resend, all inside K9 Operations. The composer
// embeds the Stripo editor (K9 Resorts–themed content); recipients are resolved from the
// SAME rules as the CRM page; delivery + open/click/bounce + unsubscribe state flows back
// into Postgres and is shown per campaign.
//
// Composes the THE-STANDARD chrome from ../../shared/listSurface and the shared Modal,
// exactly like the CRM and Marketing Directory pages. All data/UI rules live in
// ../campaignsData.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Inp, Modal } from "../../shared/ui";
import {
  DenseTable,
  IconButton,
  ListExplainer,
  ListSearchRow,
  ListSurface,
  ListSurfaceTitle,
  ListTabBar,
  PillFilter,
  RowActionButton,
  StatusPill,
} from "../../shared/listSurface";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid } from "../trainingData";
import StripoEditor from "../StripoEditor";
import {
  CAMPAIGN_AUDIENCE_STATUSES,
  audienceCountsByStatus,
  audienceSummary,
  buildCampaignPayload,
  buildCampaignRecipients,
  campaignBlockReason,
  campaignHistoryEventLabel,
  campaignHistoryEventTone,
  campaignRates,
  getCampaignStatusMeta,
  isEditableCampaign,
  isValidEmail,
  makeBlankCampaign,
} from "../campaignsData";

// ─── small utilities ────────────────────────────────────────────────────────
function fmtDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function Glyph({ icon: IconCmp, size = 16, color, style }) {
  if (!IconCmp) return null;
  return (
    <span className="k9c-glyph" style={{ width: size, height: size, color, display: "inline-flex", flexShrink: 0, ...style }}>
      <IconCmp />
    </span>
  );
}
const MUTED = { color: C.textMut, fontSize: 11 };
const LABEL = { display: "block", fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" };

// ─── audience picker (pill per pipeline stage + employment toggle + live count) ──
function AudiencePicker({ leads, suppressionSet, audience, onChange, recipientCount, suppressedCount }) {
  const counts = useMemo(() => audienceCountsByStatus(leads, { includeEmployment: audience.includeEmployment }), [leads, audience.includeEmployment]);
  const selected = new Set(audience.statuses || []);
  const toggleStatus = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange({ ...audience, statuses: [...next] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <span style={LABEL}>Pipeline stages</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <PillFilter active={selected.size === 0} onClick={() => onChange({ ...audience, statuses: [] })}>All open leads</PillFilter>
          {CAMPAIGN_AUDIENCE_STATUSES.map((s) => (
            <PillFilter key={s.value} active={selected.has(s.value)} onClick={() => toggleStatus(s.value)} count={counts[s.value] || 0} color={s.fg}>
              {s.short}
            </PillFilter>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: C.textMut }}>Leave all off to email every open lead. Closed stages (Booked / Not interested) are available but off by default.</div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" }}>
        <input type="checkbox" checked={!!audience.includeEmployment} onChange={(e) => onChange({ ...audience, includeEmployment: e.target.checked })} style={{ width: 16, height: 16, accentColor: C.pri }} />
        Include employment inquiries
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: C.priLt, border: `1px solid ${C.pri}22` }}>
        <Glyph icon={I.Users} size={18} color={C.pri} />
        <div style={{ fontSize: 13, color: C.text }}>
          <strong style={{ color: C.pri }}>{recipientCount}</strong> recipient{recipientCount === 1 ? "" : "s"} will receive this email
          {suppressedCount > 0 ? <span style={{ color: C.textMut }}> · {suppressedCount} skipped (unsubscribed/bounced)</span> : null}
        </div>
      </div>
    </div>
  );
}

// ─── metric tile (campaign detail) ──────────────────────────────────────────
function MetricTile({ label, value, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 92, padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || C.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ─── composer modal (Details · Audience · Design) ───────────────────────────
function CampaignComposer({ draft, leads, suppressionSet, user, busy, onClose, onSaveDraft, onSendTest, onSchedule, onSendNow }) {
  const [subtab, setSubtab] = useState("design");
  const [field, setField] = useState(draft);
  const [testEmail, setTestEmail] = useState(user?.email || "");
  const [scheduleAt, setScheduleAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const editorRef = useRef(null);

  const setVal = (key, value) => setField((prev) => ({ ...prev, [key]: value }));
  const setAudience = (audience) => setField((prev) => ({ ...prev, audience }));

  const { rows, suppressedCount } = useMemo(
    () => buildCampaignRecipients(leads, field.audience, suppressionSet),
    [leads, field.audience, suppressionSet],
  );
  const recipientCount = rows.length;

  // Pull the latest design + compiled HTML out of the editor, merged onto the draft.
  const gatherFromEditor = useCallback(async () => {
    let design = field.design || {};
    let compiled_html = field.compiled_html || "";
    try {
      if (editorRef.current?.isReady?.()) {
        design = await editorRef.current.getDesign();
        compiled_html = await editorRef.current.getCompiledHtml();
      }
    } catch (_) { /* keep last-known on failure */ }
    return { ...field, design, compiled_html };
  }, [field]);

  const blockReason = campaignBlockReason({ ...field, compiled_html: field.compiled_html || "x" }, recipientCount);

  const doSaveDraft = async () => {
    const merged = await gatherFromEditor();
    setField(merged);
    await onSaveDraft(merged);
  };
  const doSendTest = async () => {
    if (!isValidEmail(testEmail)) return;
    const merged = await gatherFromEditor();
    setField(merged);
    const id = await onSaveDraft(merged, { silent: true });
    if (id) await onSendTest(id, testEmail);
  };
  const doSchedule = async () => {
    if (!scheduleAt) return;
    const merged = await gatherFromEditor();
    setField(merged);
    const id = await onSaveDraft(merged, { silent: true });
    if (id) await onSchedule(id, new Date(scheduleAt).toISOString(), recipientCount, rows);
  };
  const doSendNow = async () => {
    const merged = await gatherFromEditor();
    setField(merged);
    const id = await onSaveDraft(merged, { silent: true });
    if (id) await onSendNow(id, recipientCount, rows);
  };

  const SubtabBtn = ({ id, label, icon }) => (
    <button
      type="button"
      onClick={() => setSubtab(id)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
        border: `1.5px solid ${subtab === id ? C.pri : C.border}`, background: subtab === id ? C.priLt : "transparent",
        color: subtab === id ? C.pri : C.textMut, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <Glyph icon={icon} size={14} />{label}
    </button>
  );

  return (
    <Modal title={field.isDraft ? "New campaign" : `Edit — ${field.name || "campaign"}`} onClose={onClose} fullWidth>
      <div style={{ display: "flex", flexDirection: "column", height: "82vh" }}>
        {/* subtabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
          <SubtabBtn id="design" label="Design" icon={I.Pencil} />
          <SubtabBtn id="details" label="Details" icon={I.FileText} />
          <SubtabBtn id="audience" label={`Audience (${recipientCount})`} icon={I.Users} />
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {/* Details */}
          <div style={{ display: subtab === "details" ? "block" : "none", padding: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
              <Inp label="Campaign name (internal)" value={field.name} onChange={(v) => setVal("name", v)} placeholder="e.g. June boarding promo" autoFocus />
              <Inp label="Subject line" value={field.subject} onChange={(v) => setVal("subject", v)} placeholder="What lands in the inbox — personalize with {{first_name}}" />
              <Inp label="Preheader (preview text)" value={field.preheader} onChange={(v) => setVal("preheader", v)} placeholder="The short summary shown after the subject" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="From name" value={field.from_name} onChange={(v) => setVal("from_name", v)} />
                <Inp label="From email" value={field.from_email} onChange={(v) => setVal("from_email", v)} />
              </div>
              <Inp label="Reply-to (optional)" value={field.reply_to} onChange={(v) => setVal("reply_to", v)} placeholder="Where replies should go" />
              <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.5 }}>
                Sent from your verified k9operations.com domain; the “from name” and the email design carry the K9 Resorts brand. A compliant unsubscribe + mailing address is added automatically.
              </div>
            </div>
          </div>

          {/* Audience */}
          <div style={{ display: subtab === "audience" ? "block" : "none", padding: 20 }}>
            <AudiencePicker
              leads={leads}
              suppressionSet={suppressionSet}
              audience={field.audience}
              onChange={setAudience}
              recipientCount={recipientCount}
              suppressedCount={suppressedCount}
            />
          </div>

          {/* Design — editor stays mounted so its content survives subtab switches */}
          <div style={{ display: subtab === "design" ? "block" : "none", height: "100%" }}>
            <StripoEditor
              ref={editorRef}
              emailId={field.id || "new"}
              user={user}
              // New campaigns open on Stripo's native (empty) canvas so structures + content
              // blocks are fully draggable; a saved design reloads its own HTML. (A branded
              // native starter template is the follow-up — raw HTML disables block insertion.)
              initialHtml={field.design?.html || field.compiled_html || ""}
              initialCss={field.design?.css || ""}
              onDirty={() => { /* dirty tracking handled on save */ }}
            />
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Glyph icon={I.Users} size={15} color={C.textMut} />
            <span style={{ fontSize: 12.5, color: C.textSec }}>
              <strong style={{ color: C.text }}>{recipientCount}</strong> recipient{recipientCount === 1 ? "" : "s"}
            </span>
            {blockReason ? <span style={{ fontSize: 12, color: C.warn }}>· {blockReason}</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@k9resorts.com"
                style={{ width: 168, padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", color: C.text, outline: "none" }}
              />
              <Btn variant="secondary" size="sm" disabled={busy || !isValidEmail(testEmail)} icon={<Glyph icon={I.Eye} size={14} />} onClick={doSendTest}>Send test</Btn>
            </div>
            <Btn variant="secondary" disabled={busy} onClick={doSaveDraft}>Save draft</Btn>
            <Btn variant="secondary" disabled={busy || !!blockReason} icon={<Glyph icon={I.Clock} size={14} />} onClick={() => setShowSchedule((s) => !s)}>Schedule</Btn>
            <Btn variant="primary" disabled={busy || !!blockReason} icon={<Glyph icon={I.Send} size={14} />} onClick={doSendNow}>Send now</Btn>
          </div>
        </div>

        {showSchedule ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingTop: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: C.textSec }}>Send at:</span>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", color: C.text }} />
            <Btn variant="primary" size="sm" disabled={busy || !scheduleAt || !!blockReason} onClick={doSchedule}>Confirm schedule</Btn>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ─── campaign detail (metrics + recipients) ─────────────────────────────────
function CampaignDetailModal({ campaign, onClose }) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const rates = campaignRates(campaign);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("email_recipients").select("*").eq("campaign_id", campaign.id).order("last_event_at", { ascending: false }).limit(500);
      if (active) { setRecipients(data || []); setLoading(false); }
    })();
    return () => { active = false; };
  }, [campaign.id]);

  const recipientColumns = [
    { key: "email", header: "Recipient", width: "minmax(200px, 2fr)", sortable: true, sortValue: (r) => r.email, render: (r) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: C.text, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
        {(r.first_name || r.last_name) ? <div style={{ fontSize: 11, color: C.textMut }}>{[r.first_name, r.last_name].filter(Boolean).join(" ")}</div> : null}
      </div>
    ) },
    { key: "status", header: "Status", width: 120, sortable: true, sortValue: (r) => r.status, render: (r) => <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill> },
    { key: "last", header: "Last activity", width: "minmax(120px, 1fr)", sortable: true, sortValue: (r) => r.last_event_at || "", render: (r) => <span style={{ fontSize: 11, color: C.textMut }}>{r.last_event_at ? fmtDateTime(r.last_event_at) : "—"}</span> },
  ];

  return (
    <Modal title={campaign.name || "Campaign"} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: C.textSec }}>{campaign.subject}</div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: C.textMut }}>{campaign.audience_summary} · {getCampaignStatusMeta(campaign.status).label}{campaign.send_completed_at ? ` · sent ${fmtDateTime(campaign.send_completed_at)}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <MetricTile label="Recipients" value={campaign.total_recipients || 0} />
          <MetricTile label="Sent" value={campaign.sent_count || 0} />
          <MetricTile label="Delivered" value={campaign.delivered_count || 0} accent={C.suc} />
          <MetricTile label="Open rate" value={`${rates.openRate}%`} accent={C.pri} />
          <MetricTile label="Click rate" value={`${rates.clickRate}%`} accent={C.info} />
          <MetricTile label="Bounced" value={campaign.bounced_count || 0} accent={(campaign.bounced_count || 0) > 0 ? C.dan : C.text} />
          <MetricTile label="Unsub" value={campaign.unsubscribed_count || 0} accent={C.textMut} />
        </div>
        <div>
          <span style={LABEL}>Recipients</span>
          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading…</div>
          ) : (
            <DenseTable
              columns={recipientColumns}
              rows={recipients}
              getRowKey={(r) => r.id}
              minWidth={520}
              defaultSort={{ key: "last", direction: "desc" }}
              emptyText={campaign.status === "draft" ? "Not sent yet — recipients appear once this campaign goes out." : "No recipients recorded."}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function statusTone(status) {
  switch (status) {
    case "delivered": return "success";
    case "opened": case "clicked": return "primary";
    case "sent": return "info";
    case "bounced": case "complained": case "failed": return "danger";
    case "unsubscribed": return "warning";
    default: return "neutral";
  }
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function CampaignsPage({ profile, nav, locationId, addGlobalToast = () => {} }) {
  const canManage = hasLeanPermission(profile, "Email Campaigns Access");
  const actor = useMemo(() => ({
    userId: normalizeOptionalUuid(profile?.user_id || profile?.id) || "",
    name: profile?.name || profile?.full_name || profile?.email || "Staff",
  }), [profile?.email, profile?.full_name, profile?.id, profile?.name, profile?.user_id]);
  const user = useMemo(() => ({ id: actor.userId, name: actor.name, email: profile?.email }), [actor.userId, actor.name, profile?.email]);

  const [tab, setTab] = useState("campaigns");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [history, setHistory] = useState([]);
  const [leads, setLeads] = useState([]);
  const [suppression, setSuppression] = useState([]);
  const [composer, setComposer] = useState(null); // the open draft
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const toast = useCallback((m, t = "success") => addGlobalToast(m, t), [addGlobalToast]);
  const suppressionSet = useMemo(() => new Set(suppression.map((s) => String(s.email || "").toLowerCase())), [suppression]);

  const load = useCallback(async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true); setSchemaMissing(false);
    const [campRes, histRes, leadRes, supRes] = await Promise.all([
      supabase.from("email_campaigns").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      supabase.from("email_campaign_history").select("*").eq("location_id", locationId).order("event_at", { ascending: false }).limit(250),
      supabase.from("ignite_leads").select("*").eq("location_id", locationId),
      supabase.from("email_suppression").select("email").eq("location_id", locationId),
    ]);
    const missing = (err) => err?.code === "42P01" || err?.code === "PGRST205" || /email_campaigns/.test(err?.message || "");
    if (campRes.error) {
      if (missing(campRes.error)) setSchemaMissing(true);
      else { console.error(campRes.error); toast(campRes.error.message || "Failed to load campaigns", "error"); }
      setCampaigns([]); setHistory([]); setLeads([]); setSuppression([]); setLoading(false); return;
    }
    setCampaigns(campRes.data || []);
    setHistory(histRes.error ? [] : (histRes.data || []));
    setLeads(leadRes.error ? [] : (leadRes.data || []));
    setSuppression(supRes.error ? [] : (supRes.data || []));
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setComposer(makeBlankCampaign(locationId));
  const openEdit = (c) => setComposer({ ...c, isDraft: false });
  const closeComposer = () => setComposer(null);

  // Persist the composer draft; returns the saved campaign id (for test/send chaining).
  const saveDraft = useCallback(async (draft, { silent } = {}) => {
    if (!locationId) return null;
    setBusy(true);
    try {
      const payload = buildCampaignPayload(draft, locationId, actor);
      let id = draft.id;
      if (draft.isDraft || !draft.id) {
        const { data, error } = await supabase.from("email_campaigns").insert(payload).select("*").single();
        if (error) throw error;
        id = data.id;
        setComposer((prev) => (prev ? { ...prev, ...data, isDraft: false } : prev));
      } else {
        const { error } = await supabase.from("email_campaigns").update(payload).eq("id", draft.id);
        if (error) throw error;
      }
      await load();
      if (!silent) toast("Campaign saved");
      return id;
    } catch (e) {
      console.error("Save campaign failed", e);
      toast(e?.message || "Failed to save campaign", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }, [actor, load, locationId, toast]);

  const prepareRecipients = useCallback(async (campaignId, rows) => {
    const { data, error } = await supabase.rpc("crm_email_prepare_send", { p_campaign_id: campaignId, p_recipients: rows });
    if (error) throw error;
    return data; // { inserted, suppressed, total }
  }, []);

  const sendTest = useCallback(async (campaignId, email) => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: campaignId, test_email: email } });
      if (error) throw error;
      toast(`Test sent to ${email}`);
    } catch (e) {
      toast(e?.message || "Failed to send test", "error");
    } finally { setBusy(false); }
  }, [toast]);

  const sendNow = useCallback(async (campaignId, recipientCount, rows) => {
    if (typeof window !== "undefined" && !window.confirm(`Send this campaign to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"} now?`)) return;
    setBusy(true);
    try {
      await prepareRecipients(campaignId, rows);
      const { error } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: campaignId } });
      if (error) throw error;
      await load();
      closeComposer();
      toast("Campaign is sending");
    } catch (e) {
      console.error("Send failed", e);
      toast(e?.message || "Failed to send", "error");
    } finally { setBusy(false); }
  }, [load, prepareRecipients, toast]);

  const schedule = useCallback(async (campaignId, whenISO, recipientCount, rows) => {
    setBusy(true);
    try {
      await prepareRecipients(campaignId, rows);
      const { error } = await supabase.rpc("crm_email_set_campaign_status", { p_campaign_id: campaignId, p_status: "scheduled", p_scheduled_at: whenISO });
      if (error) throw error;
      await load();
      closeComposer();
      toast(`Scheduled for ${fmtDateTime(whenISO)}`);
    } catch (e) {
      toast(e?.message || "Failed to schedule", "error");
    } finally { setBusy(false); }
  }, [load, prepareRecipients, toast]);

  const cancelScheduled = useCallback(async (c) => {
    const { error } = await supabase.rpc("crm_email_set_campaign_status", { p_campaign_id: c.id, p_status: "draft", p_scheduled_at: null });
    if (error) { toast(error.message || "Failed to cancel", "error"); return; }
    await load(); toast("Schedule canceled");
  }, [load, toast]);

  const deleteCampaign = useCallback(async (c) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${c.name || "this campaign"}”? This cannot be undone.`)) return;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", c.id);
    if (error) { toast(error.message || "Failed to delete", "error"); return; }
    await load(); toast("Campaign deleted");
  }, [load, toast]);

  const duplicateCampaign = (c) => setComposer({
    ...makeBlankCampaign(locationId), name: `${c.name} (copy)`, subject: c.subject, preheader: c.preheader,
    from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to, design: c.design, compiled_html: c.compiled_html,
    audience: c.audience || { statuses: [], includeEmployment: false },
  });

  const visibleCampaigns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => `${c.name} ${c.subject} ${c.audience_summary}`.toLowerCase().includes(q));
  }, [campaigns, query]);

  const rowAction = (fn) => (ev) => { if (ev) ev.stopPropagation(); fn(); };

  // ── campaigns table columns ──
  const columns = [
    {
      key: "name", header: "Campaign", width: "minmax(200px, 2.2fr)", sortable: true, sortValue: (c) => String(c.name || "").toLowerCase(),
      render: (c) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 12, lineHeight: 1.25, wordBreak: "break-word" }}>{c.name || "Untitled campaign"}</div>
          {c.subject ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</div> : null}
        </div>
      ),
    },
    {
      key: "status", header: "Status", width: 116, sortable: true, sortValue: (c) => c.status,
      render: (c) => {
        const meta = getCampaignStatusMeta(c.status);
        return (
          <div>
            <StatusPill tone={meta.tone}>{meta.short}</StatusPill>
            {c.status === "scheduled" && c.scheduled_at ? <div style={{ marginTop: 3, fontSize: 10, color: C.textMut }}>{fmtDateTime(c.scheduled_at)}</div> : null}
          </div>
        );
      },
    },
    {
      key: "audience", header: "Audience", width: "minmax(150px, 1.4fr)", render: (c) => (
        <div style={{ minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
          <div style={{ color: C.text, fontWeight: 600 }}>{c.total_recipients || 0} recipients</div>
          <div style={{ color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.audience_summary || "—"}</div>
        </div>
      ),
    },
    {
      key: "results", header: "Results", width: 132, render: (c) => {
        if (!["sent", "sending"].includes(c.status)) return <span style={MUTED}>—</span>;
        const r = campaignRates(c);
        return (
          <div style={{ fontSize: 11, lineHeight: 1.4 }}>
            <div style={{ color: C.text }}><strong>{r.openRate}%</strong> opened</div>
            <div style={{ color: C.textMut }}>{r.clickRate}% clicked</div>
          </div>
        );
      },
    },
    {
      key: "updated", header: "Updated", width: "minmax(110px, 1fr)", sortable: true, sortValue: (c) => c.updated_at || c.created_at || "",
      render: (c) => <span style={{ fontSize: 11, color: C.textMut, whiteSpace: "nowrap" }}>{fmtDate(c.updated_at || c.created_at)}</span>,
    },
    {
      key: "actions", header: "", width: 150, align: "end", render: (c) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
          {canManage && isEditableCampaign(c) ? <IconButton tone="primary" title="Edit" icon={<Glyph icon={I.Pencil} size={12} />} onClick={rowAction(() => openEdit(c))} /> : null}
          {canManage && c.status === "scheduled" ? <RowActionButton onClick={rowAction(() => cancelScheduled(c))}>Cancel</RowActionButton> : null}
          {canManage ? <IconButton title="Duplicate" icon={<Glyph icon={I.FileText} size={12} />} onClick={rowAction(() => duplicateCampaign(c))} /> : null}
          {canManage ? <IconButton tone="danger" title="Delete" icon={<Glyph icon={I.Trash} size={12} />} onClick={rowAction(() => deleteCampaign(c))} /> : null}
        </div>
      ),
    },
  ];

  const historyColumns = [
    { key: "when", header: "When", width: 150, sortable: true, sortValue: (r) => r.event_at || "", render: (r) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap" }}>{fmtDateTime(r.event_at)}</span> },
    { key: "action", header: "Action", width: 110, sortable: true, sortValue: (r) => r.event_type, render: (r) => <StatusPill tone={campaignHistoryEventTone(r.event_type)}>{campaignHistoryEventLabel(r.event_type)}</StatusPill> },
    { key: "summary", header: "Campaign", width: "minmax(220px, 2.4fr)", sortable: true, sortValue: (r) => String(r.entity_name || "").toLowerCase(), render: (r) => <span style={{ fontSize: 12, color: C.text }}>{r.summary || r.entity_name}</span> },
    { key: "by", header: "By", width: "minmax(120px, 1fr)", sortable: true, sortValue: (r) => String(r.changed_by_name || "").toLowerCase(), render: (r) => <span style={{ fontSize: 11, color: C.textSec }}>{r.changed_by_name || "—"}</span> },
  ];

  const titleActions = canManage && !schemaMissing ? (
    <Btn variant="primary" icon={<Glyph icon={I.Plus} size={15} />} onClick={openNew}>New campaign</Btn>
  ) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 0 48px" }}>
      <style>{`.k9c-glyph > svg { width: 100%; height: 100%; display: block; }`}</style>

      <ListSurfaceTitle actions={titleActions}>Email Campaigns</ListSurfaceTitle>

      <ListSurface>
        <ListTabBar
          tabs={[{ id: "campaigns", label: "Campaigns", count: campaigns.length }, { id: "history", label: "History", count: history.length }]}
          activeId={tab}
          onChange={setTab}
        />

        {schemaMissing ? (
          <div style={{ margin: 12, padding: "20px 18px", border: `1px solid ${C.warn}55`, borderRadius: 12, background: C.warnLt, fontSize: 13, color: C.textSec }}>
            <strong style={{ color: C.text }}>Email Campaigns isn’t set up yet.</strong> Run the latest database migration to create the campaign tables, then refresh.
          </div>
        ) : loading ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading campaigns…</div>
        ) : tab === "campaigns" ? (
          <>
            <ListSearchRow value={query} onChange={setQuery} placeholder="Search campaigns by name, subject…" />
            <ListExplainer>
              Branded email blasts to your website booking-form leads. Compose in the editor, pick the pipeline stages to reach, and send now or schedule — opens, clicks, and unsubscribes track back here.
            </ListExplainer>
            <div style={{ marginTop: 12 }}>
              <DenseTable
                columns={columns}
                rows={visibleCampaigns}
                getRowKey={(c) => c.id}
                minWidth={920}
                style={{ border: "none", borderRadius: 0 }}
                onRowClick={(c) => setDetail(c)}
                defaultSort={{ key: "updated", direction: "desc" }}
                emptyText={campaigns.length === 0
                  ? (canManage ? "No campaigns yet — click “New campaign” to compose your first email blast." : "No campaigns yet.")
                  : "No campaigns match your search."}
              />
            </div>
          </>
        ) : (
          <>
            <ListExplainer>Every campaign change — created, edited, scheduled, sent, canceled — with who did it and when.</ListExplainer>
            <div style={{ marginTop: 12 }}>
              <DenseTable
                columns={historyColumns}
                rows={history}
                getRowKey={(r) => r.id}
                minWidth={620}
                defaultSort={{ key: "when", direction: "desc" }}
                style={{ border: "none", borderRadius: 0 }}
                emptyText="No campaign activity yet."
              />
            </div>
          </>
        )}
      </ListSurface>

      {composer ? (
        <CampaignComposer
          draft={composer}
          leads={leads}
          suppressionSet={suppressionSet}
          user={user}
          busy={busy}
          onClose={closeComposer}
          onSaveDraft={saveDraft}
          onSendTest={sendTest}
          onSchedule={schedule}
          onSendNow={sendNow}
        />
      ) : null}

      {detail ? <CampaignDetailModal campaign={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
