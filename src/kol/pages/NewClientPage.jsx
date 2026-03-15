// K9 Operations — NewClientPage (Grassroots New Client Creation)
// Simplified single-section client creation that persists to lite_clients via insertLiteClient().
// Includes source tracking, auto follow-up +1 day, duplicate detection (phone + email),
// and a QuickAddClientModal for rapid entry at events.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { C, gid, titleCase, fmtPhoneInput, todayStr, addDays } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Modal, Card, Inp, CustomSelect } from "../../shared/ui";
import { insertLiteClient } from "../../hooks/useGingrData";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: "grassroots", label: "Grassroots / Event" },
  { value: "referral", label: "Referral" },
  { value: "walk-in", label: "Walk-in" },
  { value: "ignite", label: "Ignite" },
  { value: "other", label: "Other" },
];

const ANIM_DURATION = "0.25s";
const ANIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Duplicate Warning Banner ─────────────────────────────────────────────────

const DuplicateWarning = memo(({ matches, nav, matchType }) => (
  <div style={{
    display: "flex", flexDirection: "column", gap: 10,
    padding: "14px 20px", borderRadius: 12,
    background: C.warnLt, border: `1.5px solid ${C.warn}20`,
    animation: "slideDown 0.3s ease",
  }}>
    {matches.map((client, i) => (
      <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <I.AlertTriangle width={20} height={20} style={{ color: C.warn, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.warn }}>Possible Duplicate ({matchType[i] || "phone"})</div>
          <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
            A client with this {matchType[i] || "phone"} already exists: <strong>{client.fields?.first_name} {client.fields?.last_name}</strong>
          </div>
        </div>
        <button
          onClick={() => nav("client-detail", { clientId: client.id })}
          style={{
            padding: "6px 14px", borderRadius: 8,
            background: "transparent", border: `1.5px solid ${C.warn}`,
            color: C.warn, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          View Client
        </button>
      </div>
    ))}
  </div>
));

// ─── Field Error ──────────────────────────────────────────────────────────────

const FieldError = ({ message }) => (
  <div style={{
    color: C.dan, fontSize: 12, fontWeight: 600, marginTop: 4,
    display: "flex", alignItems: "center", gap: 4,
    animation: "slideDown 0.2s ease",
  }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    {message}
  </div>
);

// ─── Quick Add Client Modal ───────────────────────────────────────────────────

export function QuickAddClientModal({ open, onClose, data, profile, save, addGlobalToast }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("grassroots");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setFirstName(""); setLastName(""); setPhone(""); setEmail("");
    setNotes(""); setSource("grassroots"); setError(null);
  }, []);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  const handleSubmit = useCallback(async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!firstName.trim() && !cleanPhone && !email.trim()) {
      setError("Enter at least a first name, phone, or email");
      return;
    }
    if (cleanPhone && cleanPhone.length < 10) {
      setError("Phone must be 10 digits");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email format");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const today = todayStr();
      const followUp = addDays(today, 1);
      const now = new Date().toISOString();

      const lifecycleData = {
        conversion: {
          notes: notes.trim(),
          followUpDate: followUp,
          updates: [{ date: today, note: "Quick-add at event", by: profile.name || profile.email }],
          source,
          sourceDate: today,
          sourceReservationId: "",
        },
        retention: { notes: "", followUpDate: "", updates: [] },
        cold: false, coldDate: "", coldFrom: "",
      };

      const result = await insertLiteClient(profile.location_id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: cleanPhone || null,
        email: email.trim() || null,
        source,
        source_date: now,
        notes: notes.trim() || null,
        lifecycle_data: lifecycleData,
      });

      // Add to local data for immediate UI update
      const newClient = buildClientShape(result, lifecycleData);
      await save({ clients: [...(data.clients || []), newClient] });

      const name = `${firstName} ${lastName}`.trim() || "New client";
      addGlobalToast?.(`${name} added`, "success");
      reset();
      // Don't close — allow rapid sequential entry
    } catch (err) {
      console.error("[Grassroots] Quick-add error:", err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [firstName, lastName, phone, email, notes, source, profile, data, save, addGlobalToast, reset]);

  if (!open) return null;

  return (
    <Modal title="Quick Add Client" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="First Name" value={firstName} onChange={setFirstName} placeholder="First name" autoFocus />
          <Inp label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="Phone" type="tel" value={phone} onChange={setPhone} />
          <Inp label="Email" type="email" value={email} onChange={setEmail} placeholder="email@example.com" />
        </div>
        <Inp label="Source" type="select" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
        <Inp label="Notes" type="textarea" value={notes} onChange={setNotes} placeholder="e.g., Met at Adair Forsythe Dog Park, has a Golden named Max" rows={2} />
        {error && <FieldError message={error} />}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
          <Btn variant="secondary" onClick={onClose}>Done</Btn>
          <Btn onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save & Add Another"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Shared helper: build client shape from a lite_clients insert result ──────

function buildClientShape(liteClientRow, lifecycleData) {
  return {
    id: `lc_${liteClientRow.id}`,
    gingrId: null,
    createdAt: liteClientRow.created_at || new Date().toISOString(),
    source: liteClientRow.source || "manual",
    sourceData: { sourceDate: liteClientRow.source_date, igniteLeadId: liteClientRow.ignite_lead_id },
    isLiteClient: true,
    liteClientId: liteClientRow.id,
    fields: {
      phone: (liteClientRow.phone || "").replace(/\D/g, ""),
      first_name: (liteClientRow.first_name || "").trim(),
      last_name: (liteClientRow.last_name || "").trim(),
      email: liteClientRow.email || "",
    },
    lifecycle: lifecycleData && Object.keys(lifecycleData).length > 0 ? lifecycleData : null,
    lifecycleLog: [],
    bookingDrafts: [],
    igniteData: liteClientRow.ignite_lead_id ? { leadId: liteClientRow.ignite_lead_id } : null,
    coldMarkedAt: null,
    revivedAt: null,
    discountUsage: [],
    _lastReservation: null,
    _nextReservation: null,
    _numReservations: 0,
    _balance: 0,
    _animalNames: null,
    _emergencyContact: null,
    _emergencyPhone: null,
    _address: null,
    _notes: liteClientRow.notes || "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page Component ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function NewClientPage({ data, save, nav, profile, addGlobalToast }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("grassroots");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const topRef = useRef(null);

  // ── Duplicate detection (phone + email) ────────────────────────────────────
  const duplicates = useMemo(() => {
    const matches = [];
    const types = [];
    if (!data.clients) return { matches, types };

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 10) {
      const phoneMatch = data.clients.find(c =>
        (c.fields?.phone || "").replace(/\D/g, "") === cleanPhone
      );
      if (phoneMatch) {
        matches.push(phoneMatch);
        types.push("phone");
      }
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const emailMatch = data.clients.find(c =>
        (c.fields?.email || "").toLowerCase() === cleanEmail &&
        !matches.some(m => m.id === c.id) // avoid showing same client twice
      );
      if (emailMatch) {
        matches.push(emailMatch);
        types.push("email");
      }
    }

    return { matches, types };
  }, [phone, email, data.clients]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const errs = {};

    // Must have first name + (phone or email)
    if (!firstName.trim()) errs.firstName = "First name is required";

    const cleanPhone = phone.replace(/\D/g, "");
    const cleanEmail = email.trim();
    if (!cleanPhone && !cleanEmail) {
      errs.phone = "Phone or email is required";
    }
    if (cleanPhone && cleanPhone.length < 10) {
      errs.phone = "Phone must be 10 digits";
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errs.email = "Invalid email format";
    }

    // Warn on duplicates (but don't block — user may choose to continue)
    return errs;
  }, [firstName, phone, email]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      addGlobalToast?.("Please fix the errors below", "error");
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const today = todayStr();
      const followUp = addDays(today, 1);
      const now = new Date().toISOString();
      const cleanPhone = phone.replace(/\D/g, "");

      const lifecycleData = {
        conversion: {
          notes: notes.trim(),
          followUpDate: followUp,
          updates: [{ date: today, note: "Client created via Grassroots New Client form", by: profile.name || profile.email }],
          source,
          sourceDate: today,
          sourceReservationId: "",
        },
        retention: { notes: "", followUpDate: "", updates: [] },
        cold: false, coldDate: "", coldFrom: "",
      };

      const result = await insertLiteClient(profile.location_id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: cleanPhone || null,
        email: email.trim() || null,
        source,
        source_date: now,
        notes: notes.trim() || null,
        lifecycle_data: lifecycleData,
      });

      // Add to local data for immediate UI update
      const newClient = buildClientShape(result, lifecycleData);
      await save({ clients: [...(data.clients || []), newClient] });

      const clientName = `${firstName} ${lastName}`.trim() || "New Client";
      addGlobalToast?.(`${clientName} created with follow-up set for ${followUp}`, "success");
      nav("client-detail", { clientId: newClient.id });

    } catch (err) {
      console.error("[Grassroots] Submit error:", err);
      addGlobalToast?.(`Failed to create client: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }, [validate, firstName, lastName, phone, email, source, notes, profile, data, save, nav, addGlobalToast]);

  // ── Keyboard shortcut ──────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleSubmit, submitting]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={topRef} style={{ maxWidth: 640, margin: "0 auto" }}>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Page Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => nav("lifecycle")}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1.5px solid ${C.border}`, background: C.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.textSec, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.color = C.pri; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; }}
          >
            <I.Back />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>New Client</h2>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>Add a grassroots or walk-in client</div>
          </div>
        </div>
        <Btn variant="accent" size="sm" onClick={() => setQuickAddOpen(true)}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
        >
          Quick Add
        </Btn>
      </div>

      {/* Duplicate Warning */}
      {duplicates.matches.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <DuplicateWarning matches={duplicates.matches} matchType={duplicates.types} nav={nav} />
        </div>
      )}

      {/* Form Card */}
      <div style={{
        background: C.surface, borderRadius: 16,
        border: `1.5px solid ${C.border}`, padding: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        overflow: "hidden",
      }}>
        {/* Card Header */}
        <div style={{
          padding: "20px 28px",
          display: "flex", alignItems: "center", gap: 14,
          borderBottom: `1px solid ${C.borderLight}`,
          background: "rgba(20,83,45,0.015)",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.pri, flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Client Information</div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>First name + phone or email required</div>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <Inp label="First Name" value={firstName} onChange={v => { setFirstName(v); setErrors(e => { const n = {...e}; delete n.firstName; return n; }); }} placeholder="First name" required autoFocus />
              {errors.firstName && <FieldError message={errors.firstName} />}
            </div>
            <Inp label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name" />
          </div>

          {/* Contact row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <Inp label="Phone" type="tel" value={phone} onChange={v => { setPhone(v); setErrors(e => { const n = {...e}; delete n.phone; return n; }); }} required />
              {errors.phone && <FieldError message={errors.phone} />}
            </div>
            <div>
              <Inp label="Email" type="email" value={email} onChange={v => { setEmail(v); setErrors(e => { const n = {...e}; delete n.email; return n; }); }} placeholder="email@example.com" />
              {errors.email && <FieldError message={errors.email} />}
            </div>
          </div>

          {/* Source */}
          <Inp label="Source" type="select" value={source} onChange={setSource} options={SOURCE_OPTIONS} required />

          {/* Notes */}
          <Inp label="Notes" type="textarea" value={notes} onChange={setNotes}
            placeholder="e.g., Met at Adair Forsythe Dog Park, has a Golden named Max" rows={3} />

          {/* Follow-up info */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 8,
            background: C.sucLt, fontSize: 12, color: C.suc, fontWeight: 600,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Follow-up will be auto-set to tomorrow ({addDays(todayStr(), 1)})
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div style={{
        position: "sticky", bottom: 0,
        background: `linear-gradient(to top, ${C.bg} 60%, transparent)`,
        padding: "24px 0 8px", marginTop: 8,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", background: C.surface,
          borderRadius: 14, border: `1px solid ${C.border}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => nav("lifecycle")}
              style={{
                padding: "10px 20px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, background: "transparent",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 14, fontWeight: 600, color: C.textSec, transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.textSec; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
            >
              Cancel
            </button>
            {Object.keys(errors).length > 0 && (
              <span style={{ fontSize: 12, color: C.dan, fontWeight: 600 }}>
                {Object.keys(errors).length} field{Object.keys(errors).length !== 1 ? "s" : ""} need attention
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.textMut }}>
              {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"} + Enter
            </span>
            <Btn
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: "10px 28px", fontSize: 14, borderRadius: 10,
                minWidth: 160, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Create Client
                </>
              )}
            </Btn>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      <QuickAddClientModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        data={data}
        profile={profile}
        save={save}
        addGlobalToast={addGlobalToast}
      />
    </div>
  );
}

export default NewClientPage;
