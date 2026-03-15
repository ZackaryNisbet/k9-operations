// K9 Operations — NewClientPage (CLM-003: New Client Creation Form)
// Premium multi-section client creation with dynamic field mapping, multi-dog support,
// and Supabase persistence. Reads field definitions from DEF_CLIENT_FIELDS / DEF_DOG_FIELDS.
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { supabase } from "../../supabaseClient";
import { C, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, gid, titleCase, fmtPhoneInput, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Modal, Card, Inp, CustomSelect, isFieldRequired, validateClientFields } from "../../shared/ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_PREFERENCES = [
  { id: "daycare", label: "Daycare", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { id: "boarding", label: "Boarding", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "grooming", label: "Grooming", icon: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" },
  { id: "training", label: "Training", icon: "M22 10v6M2 10l10-5 10 5-10 5z" },
  { id: "spa", label: "Spa / Pamper", icon: "M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" },
];

const REFERRAL_OPTIONS = ["Friend/Family", "Google", "Social Media", "Website", "Walk-In", "Vet Referral", "Event", "Other"];

const ANIM_DURATION = "0.25s";
const ANIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Animated Section Wrapper ─────────────────────────────────────────────────

const Section = memo(({ title, subtitle, icon, number, children, isActive, isComplete }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <div style={{
      background: C.surface,
      borderRadius: 16,
      border: `1.5px solid ${isActive ? C.pri : isComplete ? C.suc : C.border}`,
      padding: 0,
      opacity: mounted ? 1 : 0,
      transform: mounted ? "translateY(0)" : "translateY(12px)",
      transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
      boxShadow: isActive ? "0 4px 24px rgba(20,83,45,0.08)" : "0 1px 3px rgba(0,0,0,0.02)",
      overflow: "hidden",
    }}>
      {/* Section Header */}
      <div style={{
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderBottom: `1px solid ${C.borderLight}`,
        background: isActive ? "rgba(20,83,45,0.015)" : "transparent",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: isComplete ? C.sucLt : isActive ? C.priLt : C.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isComplete ? C.suc : isActive ? C.pri : C.textMut,
          transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
          flexShrink: 0,
        }}>
          {isComplete ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: isActive ? C.pri : C.textMut,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>Step {number}</span>
            {isComplete && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: C.suc,
                textTransform: "uppercase", letterSpacing: "0.06em",
                background: C.sucLt, padding: "2px 8px", borderRadius: 6,
              }}>Complete</span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {/* Section Content */}
      <div style={{ padding: "24px 28px" }}>
        {children}
      </div>
    </div>
  );
});

// ─── Field Renderer ───────────────────────────────────────────────────────────

const FieldInput = memo(({ field, value, onChange, error, onClearError, actionLevel = "create" }) => {
  const required = isFieldRequired(field, actionLevel);
  const hasError = !!error;

  const handleChange = useCallback((val) => {
    onChange(field.id, val);
    if (hasError) onClearError(field.id);
  }, [field.id, onChange, hasError, onClearError]);

  // Use the shared Inp component which handles type routing (tel, select, textarea, date, etc.)
  if (field.type === "textarea") {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        <Inp
          label={field.name}
          type="textarea"
          value={value || ""}
          onChange={handleChange}
          required={required}
          placeholder={field.placeholder || ""}
          rows={3}
        />
        {hasError && <FieldError message={error} />}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <Inp
          label={field.name}
          type="select"
          value={value || ""}
          onChange={handleChange}
          required={required}
          options={field.options || []}
          placeholder={`Select ${field.name.toLowerCase()}...`}
        />
        {hasError && <FieldError message={error} />}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div>
        <Inp
          label={field.name}
          type="date"
          value={value || ""}
          onChange={handleChange}
          required={required}
        />
        {hasError && <FieldError message={error} />}
      </div>
    );
  }

  return (
    <div>
      <Inp
        label={field.name}
        type={field.type || "text"}
        value={value || ""}
        onChange={handleChange}
        required={required}
        placeholder={field.isKey ? "Required — must be unique" : (field.placeholder || "")}
      />
      {hasError && <FieldError message={error} />}
    </div>
  );
});

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

// ─── Dog Card Component ───────────────────────────────────────────────────────

const DogCard = memo(({ index, dogFields, values, errors, onChange, onRemove, canRemove }) => {
  const [expanded, setExpanded] = useState(true);
  const dogName = values.name || `Dog ${index + 1}`;

  const handleFieldChange = useCallback((fieldId, val) => {
    onChange(index, fieldId, val);
  }, [index, onChange]);

  const handleClearError = useCallback((fieldId) => {
    // Errors are cleared through onChange
  }, []);

  return (
    <div style={{
      border: `1.5px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
      background: C.surface,
    }}>
      {/* Dog Card Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer",
          background: expanded ? "rgba(20,83,45,0.015)" : "transparent",
          transition: `background ${ANIM_DURATION} ${ANIM_EASE}`,
          userSelect: "none",
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: C.accLt, color: C.accDk,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 800, flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5M8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{dogName}</div>
          <div style={{ fontSize: 11, color: C.textMut }}>
            {values.breed ? `${values.breed}` : "No breed specified"}
            {values.weight ? ` · ${values.weight} lbs` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.textMut, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: `all 0.15s`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.color = C.dan; e.currentTarget.style.borderColor = C.dan; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMut; e.currentTarget.style.borderColor = C.border; }}
              title="Remove dog"
            >
              <I.Trash />
            </button>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round"
            style={{ transition: `transform ${ANIM_DURATION} ${ANIM_EASE}`, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Dog Card Body */}
      {expanded && (
        <div style={{
          padding: "16px 20px 20px",
          borderTop: `1px solid ${C.borderLight}`,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {dogFields.filter(f => f.type !== "textarea").map(f => (
              <FieldInput
                key={f.id}
                field={f}
                value={values[f.id]}
                error={errors?.[`dog_${index}_${f.id}`]}
                onChange={handleFieldChange}
                onClearError={handleClearError}
              />
            ))}
            {dogFields.filter(f => f.type === "textarea").map(f => (
              <FieldInput
                key={f.id}
                field={f}
                value={values[f.id]}
                error={errors?.[`dog_${index}_${f.id}`]}
                onChange={handleFieldChange}
                onClearError={handleClearError}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Service Preference Chip ──────────────────────────────────────────────────

const ServiceChip = memo(({ service, selected, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 18px", borderRadius: 12,
      border: `1.5px solid ${selected ? C.pri : C.border}`,
      background: selected ? C.priLt : C.surface,
      color: selected ? C.pri : C.textSec,
      cursor: "pointer", fontFamily: "inherit",
      fontSize: 14, fontWeight: selected ? 700 : 500,
      transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
      outline: "none",
      flex: "1 1 auto",
      minWidth: 140,
    }}
    onMouseEnter={e => {
      if (!selected) {
        e.currentTarget.style.borderColor = C.priL;
        e.currentTarget.style.background = "rgba(20,83,45,0.02)";
      }
    }}
    onMouseLeave={e => {
      if (!selected) {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.background = C.surface;
      }
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={service.icon}/>
    </svg>
    {service.label}
    {selected && (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" style={{ marginLeft: "auto" }}>
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    )}
  </button>
));

// ─── Progress Steps Indicator ─────────────────────────────────────────────────

const ProgressSteps = memo(({ steps, currentStep }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 0,
    padding: "0 4px",
  }}>
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          opacity: i <= currentStep ? 1 : 0.4,
          transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: step.complete ? C.suc : i === currentStep ? C.pri : C.bg,
            color: step.complete || i === currentStep ? "#fff" : C.textMut,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
            border: `2px solid ${step.complete ? C.suc : i === currentStep ? C.pri : C.border}`,
            transition: `all ${ANIM_DURATION} ${ANIM_EASE}`,
            flexShrink: 0,
          }}>
            {step.complete ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (i + 1)}
          </div>
          <span style={{
            fontSize: 13, fontWeight: i === currentStep ? 700 : 500,
            color: i === currentStep ? C.text : C.textMut,
            whiteSpace: "nowrap",
          }}>{step.label}</span>
        </div>
        {i < steps.length - 1 && (
          <div style={{
            flex: 1, height: 2, minWidth: 20, maxWidth: 60,
            background: step.complete ? C.suc : C.border,
            margin: "0 10px",
            borderRadius: 1,
            transition: `background ${ANIM_DURATION} ${ANIM_EASE}`,
          }}/>
        )}
      </React.Fragment>
    ))}
  </div>
));

// ─── Duplicate Warning Banner ─────────────────────────────────────────────────

const DuplicateWarning = memo(({ client, onViewClient, nav }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 14,
    padding: "14px 20px", borderRadius: 12,
    background: C.warnLt, border: `1.5px solid ${C.warn}20`,
    animation: "slideDown 0.3s ease",
  }}>
    <I.AlertTriangle width={20} height={20} style={{ color: C.warn, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.warn }}>Possible Duplicate</div>
      <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
        A client with this phone number already exists: <strong>{client.fields?.first_name} {client.fields?.last_name}</strong>
      </div>
    </div>
    <button
      onClick={() => nav("client-detail", { clientId: client.id })}
      style={{
        padding: "6px 14px", borderRadius: 8,
        background: "transparent", border: `1.5px solid ${C.warn}`,
        color: C.warn, fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      View Client
    </button>
  </div>
));

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page Component ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function NewClientPage({ data, save, nav, profile, addGlobalToast }) {
  // Field definitions from the settings field mapping (CLM-004) or defaults
  const clientFields = useMemo(() => data.clientFields || DEF_CLIENT_FIELDS, [data.clientFields]);
  const dogFields = useMemo(() => data.dogFields || DEF_DOG_FIELDS, [data.dogFields]);

  // ── State ────────────────────────────────────────────────────────────────────
  const [clientValues, setClientValues] = useState({});
  const [dogs, setDogs] = useState([{}]); // Start with one dog card
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceNotes, setServiceNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [touched, setTouched] = useState({});

  const topRef = useRef(null);
  const sectionRefs = useRef([]);

  // ── Derived State ────────────────────────────────────────────────────────────

  // Section completion checks
  const clientInfoComplete = useMemo(() => {
    const requiredClientFields = clientFields.filter(f => isFieldRequired(f, "create"));
    return requiredClientFields.every(f => !!clientValues[f.id]);
  }, [clientFields, clientValues]);

  const dogInfoComplete = useMemo(() => {
    if (dogs.length === 0) return true; // No dogs is fine
    return dogs.every(dog => {
      const requiredDogFields = dogFields.filter(f => isFieldRequired(f, "create"));
      return requiredDogFields.length === 0 || dog.name; // At minimum, a name
    });
  }, [dogs, dogFields]);

  const progressSteps = useMemo(() => [
    { label: "Client Info", complete: clientInfoComplete },
    { label: "Dog Info", complete: dogInfoComplete },
    { label: "Services", complete: selectedServices.length > 0 },
  ], [clientInfoComplete, dogInfoComplete, selectedServices.length]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleClientFieldChange = useCallback((fieldId, value) => {
    setClientValues(prev => ({ ...prev, [fieldId]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[fieldId]; return n; });
    setTouched(prev => ({ ...prev, [fieldId]: true }));
  }, []);

  const handleClientClearError = useCallback((fieldId) => {
    setErrors(prev => { const n = { ...prev }; delete n[fieldId]; return n; });
  }, []);

  // Real-time duplicate check on phone
  useEffect(() => {
    const phone = (clientValues.phone || "").replace(/\D/g, "");
    if (phone.length >= 10 && data.clients) {
      const match = data.clients.find(c => (c.fields?.phone || "").replace(/\D/g, "") === phone);
      setDuplicateClient(match || null);
    } else {
      setDuplicateClient(null);
    }
  }, [clientValues.phone, data.clients]);

  const handleDogFieldChange = useCallback((dogIndex, fieldId, value) => {
    setDogs(prev => {
      const updated = [...prev];
      updated[dogIndex] = { ...updated[dogIndex], [fieldId]: value };
      return updated;
    });
    setErrors(prev => { const n = { ...prev }; delete n[`dog_${dogIndex}_${fieldId}`]; return n; });
  }, []);

  const addDog = useCallback(() => {
    setDogs(prev => [...prev, {}]);
  }, []);

  const removeDog = useCallback((index) => {
    setDogs(prev => prev.filter((_, i) => i !== index));
    // Clear related errors
    setErrors(prev => {
      const n = { ...prev };
      Object.keys(n).forEach(k => { if (k.startsWith(`dog_${index}_`)) delete n[k]; });
      return n;
    });
  }, []);

  const toggleService = useCallback((serviceId) => {
    setSelectedServices(prev =>
      prev.includes(serviceId) ? prev.filter(s => s !== serviceId) : [...prev, serviceId]
    );
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────────

  const validate = useCallback(() => {
    const errs = {};

    // Validate client fields
    clientFields.forEach(f => {
      if (isFieldRequired(f, "create") && !clientValues[f.id]) {
        errs[f.id] = `${f.name} is required`;
      }
    });

    // Validate email format if provided
    if (clientValues.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientValues.email)) {
      errs.email = "Please enter a valid email address";
    }

    // Phone duplicate check
    if (clientValues.phone) {
      const phone = clientValues.phone.replace(/\D/g, "");
      if (phone.length > 0 && phone.length < 10) {
        errs.phone = "Phone number must be 10 digits";
      }
      const existing = (data.clients || []).find(c => (c.fields?.phone || "").replace(/\D/g, "") === phone);
      if (existing) errs.phone = "A client with this phone number already exists";
    }

    // Validate dog fields — only for dogs that have at least one field filled
    dogs.forEach((dog, i) => {
      const hasSomeData = Object.values(dog).some(v => v && String(v).trim());
      if (hasSomeData) {
        dogFields.forEach(f => {
          if (isFieldRequired(f, "create") && !dog[f.id]) {
            errs[`dog_${i}_${f.id}`] = `${f.name} is required`;
          }
        });
      }
    });

    return errs;
  }, [clientFields, dogFields, clientValues, dogs, data.clients]);

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Scroll to first error section
      const hasClientError = Object.keys(errs).some(k => !k.startsWith("dog_"));
      if (hasClientError) setCurrentSection(0);
      else setCurrentSection(1);
      addGlobalToast?.("Please fix the errors below before submitting", "error");
      return;
    }

    setSubmitting(true);

    try {
      const locationId = profile.location_id;
      const now = new Date().toISOString();
      const phone = (clientValues.phone || "").replace(/\D/g, "");

      // ── 1. Create the owner record in gingr_owners ──
      const ownerPayload = {
        location_id: locationId,
        first_name: (clientValues.first_name || "").trim(),
        last_name: (clientValues.last_name || "").trim(),
        email: (clientValues.email || "").trim(),
        cell_phone: phone,
        home_phone: "",
        address_1: (clientValues.street || "").trim(),
        address_2: "",
        city: (clientValues.city || "").trim(),
        state: (clientValues.state || "").trim(),
        zip: (clientValues.zip || "").trim(),
        emergency_contact_name: (clientValues.emergency_contact || "").trim(),
        emergency_contact_phone: (clientValues.emergency_phone || "").replace(/\D/g, ""),
        notes: (clientValues.notes || "").trim(),
        referral_source: clientValues.referral_source || "",
        source: "k9_lite",
        owner_created_at: now,
        is_lite_created: true,
        service_preferences: selectedServices,
        service_notes: serviceNotes.trim(),
      };

      const { data: ownerResult, error: ownerError } = await supabase
        .from("gingr_owners")
        .insert(ownerPayload)
        .select()
        .single();

      if (ownerError) throw new Error(`Failed to create client: ${ownerError.message}`);

      const ownerId = ownerResult.id;
      const ownerGingrId = ownerResult.gingr_id || ownerResult.id;

      // ── 2. Create dog records in gingr_animals ──
      const validDogs = dogs.filter(d => d.name && d.name.trim());
      if (validDogs.length > 0) {
        const animalPayloads = validDogs.map(dog => ({
          location_id: locationId,
          owner_gingr_id: ownerGingrId,
          name: (dog.name || "").trim(),
          breed_name: (dog.breed || "").trim(),
          weight: dog.weight ? parseFloat(dog.weight) : null,
          birthday: dog.dob ? Math.floor(new Date(dog.dob + "T12:00:00").getTime() / 1000) : null,
          gender: (dog.sex || "").toLowerCase() === "female" ? "F" : (dog.sex || "").toLowerCase() === "male" ? "M" : null,
          fixed: dog.spayed_neutered === "Neutered" || dog.spayed_neutered === "Spayed",
          color: (dog.color || "").trim(),
          notes: (dog.temperament || "").trim(),
          is_lite_created: true,
        }));

        const { error: animalsError } = await supabase
          .from("gingr_animals")
          .insert(animalPayloads);

        if (animalsError) {
          console.warn("[CLM-003] Failed to create dog records:", animalsError.message);
          // Don't fail the entire operation — client was already created
          addGlobalToast?.(`Client created, but dog records failed: ${animalsError.message}`, "error");
        }
      }

      // ── 3. Create lifecycle entry ──
      const fuDate = new Date();
      fuDate.setDate(fuDate.getDate() + 1);
      const lifecycleData = {
        conversion: {
          notes: "",
          followUpDate: fuDate.toISOString().split("T")[0],
          updates: [{ date: now.split("T")[0], note: "Client created via New Client form", by: profile.name || profile.email }],
          source: "manual",
          sourceDate: now.split("T")[0],
          sourceReservationId: "",
        },
        retention: { notes: "", followUpDate: "", updates: [] },
        cold: false, coldDate: "", coldFrom: "",
      };

      await supabase.from("lite_client_lifecycle").upsert({
        location_id: locationId,
        gingr_id: String(ownerGingrId),
        lifecycle_data: lifecycleData,
        updated_at: now,
      }, { onConflict: "location_id,gingr_id" });

      // ── 4. Audit log entry ──
      await supabase.from("lite_audit_log").insert({
        location_id: locationId,
        action: "client_created",
        details: `New client: ${clientValues.first_name || ""} ${clientValues.last_name || ""}`.trim() +
          (validDogs.length > 0 ? ` with ${validDogs.length} dog${validDogs.length > 1 ? "s" : ""}: ${validDogs.map(d => d.name).join(", ")}` : ""),
        performed_by: profile.name || profile.email,
        timestamp: now,
      });

      // ── 5. Add to local data for immediate UI update ──
      const newClient = {
        id: `g${ownerGingrId}`,
        gingrId: ownerGingrId,
        createdAt: now,
        source: "manual",
        fields: {
          phone,
          first_name: (clientValues.first_name || "").trim(),
          last_name: (clientValues.last_name || "").trim(),
          email: (clientValues.email || "").trim(),
        },
        lifecycle: lifecycleData,
        lifecycleLog: [],
        bookingDrafts: [],
        igniteData: null,
        coldMarkedAt: null,
        revivedAt: null,
        discountUsage: [],
        _lastReservation: null,
        _nextReservation: null,
        _numReservations: 0,
        _balance: 0,
        _animalNames: validDogs.map(d => d.name).join(", "),
        _emergencyContact: clientValues.emergency_contact || "",
        _emergencyPhone: (clientValues.emergency_phone || "").replace(/\D/g, ""),
        _address: [clientValues.street, clientValues.city, clientValues.state, clientValues.zip].filter(Boolean).join(", "),
      };

      const newDogs = validDogs.map((dog, i) => ({
        id: `new_${Date.now()}_${i}`,
        clientId: newClient.id,
        fields: {
          name: (dog.name || "").trim(),
          breed: (dog.breed || "").trim(),
          weight: dog.weight || "",
          spayed_neutered: dog.spayed_neutered === "Neutered" || dog.spayed_neutered === "Spayed",
        },
        _gender: (dog.sex || "").toLowerCase() === "female" ? "F" : "M",
        tags: [],
      }));

      await save({
        clients: [...(data.clients || []), newClient],
        dogs: [...(data.dogs || []), ...newDogs],
      });

      // ── 6. Success feedback & navigate ──
      const clientName = `${clientValues.first_name || ""} ${clientValues.last_name || ""}`.trim() || "New Client";
      addGlobalToast?.(`${clientName} has been created successfully`, "success");
      nav("client-detail", { clientId: newClient.id });

    } catch (err) {
      console.error("[CLM-003] Submit error:", err);
      addGlobalToast?.(`Failed to create client: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }, [validate, clientValues, dogs, selectedServices, serviceNotes, profile, data, save, nav, addGlobalToast]);

  // ── Keyboard Shortcut ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleSubmit, submitting]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div ref={topRef} style={{ maxWidth: 840, margin: "0 auto" }}>
      {/* Inject animation keyframes */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Page Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => nav("lifecycle")}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1.5px solid ${C.border}`, background: C.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.textSec,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.color = C.pri; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; }}
          >
            <I.Back />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>New Client</h2>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>Create a new client record in the system</div>
          </div>
        </div>
        <ProgressSteps steps={progressSteps} currentStep={currentSection} />
      </div>

      {/* Duplicate Warning */}
      {duplicateClient && (
        <div style={{ marginBottom: 20 }}>
          <DuplicateWarning client={duplicateClient} nav={nav} />
        </div>
      )}

      {/* Form Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Section 1: Client Information ── */}
        <Section
          title="Client Information"
          subtitle="Contact details and personal information"
          icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
          number={1}
          isActive={currentSection === 0}
          isComplete={clientInfoComplete}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {clientFields.filter(f => f.type !== "textarea").map(f => (
              <FieldInput
                key={f.id}
                field={f}
                value={clientValues[f.id]}
                error={errors[f.id]}
                onChange={handleClientFieldChange}
                onClearError={handleClientClearError}
              />
            ))}
            {clientFields.filter(f => f.type === "textarea").map(f => (
              <FieldInput
                key={f.id}
                field={f}
                value={clientValues[f.id]}
                error={errors[f.id]}
                onChange={handleClientFieldChange}
                onClearError={handleClientClearError}
              />
            ))}
          </div>
        </Section>

        {/* ── Section 2: Dog Information ── */}
        <Section
          title="Dog Information"
          subtitle={`${dogs.length} dog${dogs.length !== 1 ? "s" : ""} added`}
          icon="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5M8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75z"
          number={2}
          isActive={currentSection === 1}
          isComplete={dogInfoComplete && dogs.some(d => d.name)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {dogs.map((dog, i) => (
              <DogCard
                key={i}
                index={i}
                dogFields={dogFields}
                values={dog}
                errors={errors}
                onChange={handleDogFieldChange}
                onRemove={removeDog}
                canRemove={dogs.length > 1}
              />
            ))}

            {/* Add Dog Button */}
            <button
              onClick={addDog}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "14px 20px", borderRadius: 12,
                border: `1.5px dashed ${C.border}`,
                background: "transparent",
                color: C.textMut, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                transition: `all 0.15s`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.acc;
                e.currentTarget.style.color = C.acc;
                e.currentTarget.style.background = C.accLt;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.color = C.textMut;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Another Dog
            </button>
          </div>

          {/* Tip about removing dogs */}
          {dogs.length === 1 && !dogs[0].name && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8,
              background: C.infoLt, marginTop: 14,
              fontSize: 12, color: C.info,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Dog info is optional — leave blank to add dogs later.
            </div>
          )}
        </Section>

        {/* ── Section 3: Service Preferences ── */}
        <Section
          title="Service Preferences"
          subtitle="Which services is this client interested in?"
          icon="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"
          number={3}
          isActive={currentSection === 2}
          isComplete={selectedServices.length > 0}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            {SERVICE_PREFERENCES.map(svc => (
              <ServiceChip
                key={svc.id}
                service={svc}
                selected={selectedServices.includes(svc.id)}
                onToggle={() => toggleService(svc.id)}
              />
            ))}
          </div>
          {selectedServices.length > 0 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <Inp
                label="Service Notes"
                type="textarea"
                value={serviceNotes}
                onChange={setServiceNotes}
                placeholder="Any specific service preferences, scheduling needs, or special requests..."
                rows={2}
              />
            </div>
          )}
          {selectedServices.length === 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8,
              background: C.bg, fontSize: 12, color: C.textMut,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Service preferences are optional and can be updated later.
            </div>
          )}
        </Section>
      </div>

      {/* ── Sticky Footer / Action Bar ── */}
      <div style={{
        position: "sticky", bottom: 0,
        background: `linear-gradient(to top, ${C.bg} 60%, transparent)`,
        padding: "24px 0 8px",
        marginTop: 8,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px",
          background: C.surface,
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => nav("lifecycle")}
              style={{
                padding: "10px 20px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, background: "transparent",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 14, fontWeight: 600, color: C.textSec,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.textSec; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
            >
              Cancel
            </button>
            {Object.keys(errors).length > 0 && (
              <span style={{ fontSize: 12, color: C.dan, fontWeight: 600 }}>
                {Object.keys(errors).length} field{Object.keys(errors).length !== 1 ? "s" : ""} need{Object.keys(errors).length === 1 ? "s" : ""} attention
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.textMut }}>
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"} + Enter
            </span>
            <Btn
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: "10px 28px",
                fontSize: 14,
                borderRadius: 10,
                minWidth: 160,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
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
    </div>
  );
}

export default NewClientPage;
