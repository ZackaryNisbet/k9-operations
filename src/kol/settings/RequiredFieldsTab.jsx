// K9 Operations — RequiredFieldsTab (CLM-004: Field Mapping Module)
// Two-column drag-and-drop field mapping between K9 Ops Lite and Gingr.
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";
import { useAuth } from "../../AuthProvider";

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_TABS = [
  { id: "client", label: "Client Fields", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { id: "dog", label: "Dog Fields", icon: "M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5M8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75z" },
];

const defaultGingrClientFields = [
  { id: "g_first_name", name: "First Name", field_name: "first_name", form_type: "owner_registration", field_type: "text", is_required: true, section: "Basic Info", display_order: 0 },
  { id: "g_last_name", name: "Last Name", field_name: "last_name", form_type: "owner_registration", field_type: "text", is_required: true, section: "Basic Info", display_order: 1 },
  { id: "g_email", name: "Email Address", field_name: "email", form_type: "owner_registration", field_type: "email", is_required: true, section: "Basic Info", display_order: 2 },
  { id: "g_phone", name: "Phone Number", field_name: "phone", form_type: "owner_registration", field_type: "tel", is_required: true, section: "Basic Info", display_order: 3 },
  { id: "g_address", name: "Street Address", field_name: "address_line_1", form_type: "owner_registration", field_type: "text", is_required: false, section: "Address", display_order: 4 },
  { id: "g_city", name: "City", field_name: "city", form_type: "owner_registration", field_type: "text", is_required: false, section: "Address", display_order: 5 },
  { id: "g_state", name: "State", field_name: "state", form_type: "owner_registration", field_type: "text", is_required: false, section: "Address", display_order: 6 },
  { id: "g_zip", name: "Zip Code", field_name: "zip_code", form_type: "owner_registration", field_type: "text", is_required: false, section: "Address", display_order: 7 },
  { id: "g_emergency_name", name: "Emergency Contact", field_name: "emergency_contact_name", form_type: "owner_registration", field_type: "text", is_required: false, section: "Emergency", display_order: 8 },
  { id: "g_emergency_phone", name: "Emergency Phone", field_name: "emergency_contact_phone", form_type: "owner_registration", field_type: "tel", is_required: false, section: "Emergency", display_order: 9 },
  { id: "g_referral", name: "How Did You Hear About Us?", field_name: "referral_source", form_type: "owner_registration", field_type: "select", is_required: false, section: "Other", display_order: 10 },
  { id: "g_notes", name: "Additional Notes", field_name: "notes", form_type: "owner_registration", field_type: "textarea", is_required: false, section: "Other", display_order: 11 },
];

const defaultGingrDogFields = [
  { id: "g_dog_name", name: "Pet Name", field_name: "name", form_type: "animal_profile", field_type: "text", is_required: true, section: "Basic Info", display_order: 0 },
  { id: "g_breed", name: "Breed", field_name: "breed", form_type: "animal_profile", field_type: "text", is_required: true, section: "Basic Info", display_order: 1 },
  { id: "g_weight", name: "Weight", field_name: "weight", form_type: "animal_profile", field_type: "number", is_required: false, section: "Basic Info", display_order: 2 },
  { id: "g_dob", name: "Date of Birth", field_name: "date_of_birth", form_type: "animal_profile", field_type: "date", is_required: false, section: "Basic Info", display_order: 3 },
  { id: "g_sex", name: "Sex", field_name: "sex", form_type: "animal_profile", field_type: "select", is_required: true, section: "Details", display_order: 4 },
  { id: "g_altered", name: "Spayed/Neutered Status", field_name: "spayed_neutered", form_type: "animal_profile", field_type: "select", is_required: true, section: "Details", display_order: 5 },
  { id: "g_color", name: "Color / Markings", field_name: "color", form_type: "animal_profile", field_type: "text", is_required: false, section: "Details", display_order: 6 },
  { id: "g_temperament", name: "Temperament", field_name: "temperament", form_type: "animal_profile", field_type: "textarea", is_required: false, section: "Behavior", display_order: 7 },
  { id: "g_vax_rabies", name: "Rabies Vaccination", field_name: "vaccination_rabies", form_type: "animal_profile", field_type: "date", is_required: true, section: "Vaccinations", display_order: 8 },
  { id: "g_vax_dhpp", name: "DHPP Vaccination", field_name: "vaccination_dhpp", form_type: "animal_profile", field_type: "date", is_required: true, section: "Vaccinations", display_order: 9 },
  { id: "g_vax_bordetella", name: "Bordetella Vaccination", field_name: "vaccination_bordetella", form_type: "animal_profile", field_type: "date", is_required: true, section: "Vaccinations", display_order: 10 },
  { id: "g_vet_name", name: "Veterinarian Name", field_name: "vet_name", form_type: "animal_profile", field_type: "text", is_required: false, section: "Vet Info", display_order: 11 },
  { id: "g_vet_phone", name: "Veterinarian Phone", field_name: "vet_phone", form_type: "animal_profile", field_type: "tel", is_required: false, section: "Vet Info", display_order: 12 },
];

const FIELD_TYPE_COLORS = {
  text: { bg: "#ECFDF5", color: "#14532D" },
  email: { bg: "#EFF6FF", color: "#1A5EC4" },
  tel: { bg: "#F0FDF4", color: "#0D7A56" },
  number: { bg: "#FFFBEB", color: "#C4720C" },
  date: { bg: "#FDF2F8", color: "#9D174D" },
  select: { bg: "#D9F99D", color: "#4D7C0F" },
  textarea: { bg: "#F3E8FF", color: "#7C3AED" },
  checkbox: { bg: "#ECFDF5", color: "#0D7A56" },
};

// ─── SVG Mapping Line Component ───────────────────────────────────────────────

const MappingLine = memo(({ x1, y1, x2, y2, isActive, onRemove }) => {
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return (
    <g style={{ cursor: "pointer" }} onClick={onRemove}>
      <path d={path} stroke={C.pri} strokeWidth={3} fill="none" opacity={0.12} />
      <path d={path} stroke={isActive ? C.acc : C.pri} strokeWidth={2} fill="none" strokeDasharray={isActive ? "none" : "none"} style={{ transition: "stroke 0.2s" }} />
      <circle cx={x1} cy={y1} r={4} fill={C.pri} stroke={C.surface} strokeWidth={2} />
      <circle cx={x2} cy={y2} r={4} fill={C.pri} stroke={C.surface} strokeWidth={2} />
      {onRemove && (
        <g transform={`translate(${midX - 8}, ${(y1 + y2) / 2 - 8})`} style={{ opacity: 0 }} className="mapping-remove-btn">
          <rect x={0} y={0} width={16} height={16} rx={8} fill={C.dan} />
          <line x1={4} y1={8} x2={12} y2={8} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
});

// ─── Dot Connector (draggable handle on each field) ───────────────────────────

const DotConnector = memo(({ side, fieldId, onDragStart, onDragEnd, isConnected, isHovered }) => {
  const dotRef = useRef(null);
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      onDragStart(fieldId, side, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }, [fieldId, side, onDragStart]);

  return (
    <div
      ref={dotRef}
      data-dot-id={fieldId}
      data-dot-side={side}
      onMouseDown={handleMouseDown}
      style={{
        width: 14, height: 14, borderRadius: "50%",
        border: `2.5px solid ${isConnected ? C.pri : isHovered ? C.acc : C.border}`,
        background: isConnected ? C.pri : isHovered ? C.accLt : C.surface,
        cursor: "crosshair", transition: "all 0.2s",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, position: "relative", zIndex: 2,
        boxShadow: isHovered ? `0 0 0 4px ${C.acc}25` : isConnected ? `0 0 0 3px ${C.pri}20` : "none",
      }}
    >
      {isConnected && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
    </div>
  );
});

// ─── Field Card ───────────────────────────────────────────────────────────────

const FieldCard = memo(({ field, side, isConnected, isHovered, isDragging, onDragStart, onDragEnd, onToggleRequired, isCustom, onRemoveCustom }) => {
  const typeStyle = FIELD_TYPE_COLORS[field.field_type || field.type] || FIELD_TYPE_COLORS.text;
  const isLeft = side === "left";
  const isRequired = isLeft ? (field.requiredFor && field.requiredFor.includes("create")) : field.is_required;
  const isLocked = field.locked || field.isKey;

  return (
    <div
      data-field-id={field.id}
      data-field-side={side}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 10,
        background: isDragging ? `${C.acc}08` : isHovered ? `${C.pri}06` : C.surface,
        border: `1.5px solid ${isDragging ? C.acc : isConnected ? `${C.pri}40` : isHovered ? `${C.pri}25` : C.borderLight}`,
        transition: "all 0.2s", cursor: "default",
        flexDirection: isLeft ? "row-reverse" : "row",
        boxShadow: isConnected ? `0 2px 8px ${C.pri}10` : "none",
      }}
    >
      <DotConnector
        side={side}
        fieldId={field.id}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        isConnected={isConnected}
        isHovered={isHovered}
      />
      <div style={{ flex: 1, minWidth: 0, textAlign: isLeft ? "left" : "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: isLeft ? "flex-start" : "flex-end" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {field.name || field.field_label || field.field_name}
          </span>
          {isCustom && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: C.accLt, color: C.accDk, textTransform: "uppercase", letterSpacing: "0.05em" }}>Custom</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, justifyContent: isLeft ? "flex-start" : "flex-end" }}>
          <span style={{
            display: "inline-block", padding: "1px 7px", borderRadius: 5,
            fontSize: 10, fontWeight: 600, background: typeStyle.bg, color: typeStyle.color,
          }}>
            {field.field_type || field.type}
          </span>
          {isLeft && onToggleRequired && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!isLocked) onToggleRequired(field.id); }}
              disabled={isLocked}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 7px", borderRadius: 5, border: "none",
                fontSize: 10, fontWeight: 600, cursor: isLocked ? "not-allowed" : "pointer",
                background: isRequired ? `${C.pri}12` : C.surfaceHover,
                color: isRequired ? C.pri : C.textMut,
                transition: "all 0.15s", opacity: isLocked ? 0.5 : 1,
              }}
            >
              {isRequired ? "Required" : "Optional"}
            </button>
          )}
          {isLeft && !isLeft && field.section && (
            <span style={{ fontSize: 10, color: C.textMut }}>{field.section}</span>
          )}
          {!isLeft && field.is_required && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: `${C.dan}10`, color: C.dan, textTransform: "uppercase" }}>Req</span>
          )}
          {!isLeft && field.section && (
            <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>{field.section}</span>
          )}
        </div>
      </div>
      {isCustom && onRemoveCustom && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemoveCustom(field.id); }}
          style={{
            width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.border}`,
            background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.15s",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
    </div>
  );
});

// ─── Add Custom Field Modal ───────────────────────────────────────────────────

function AddCustomFieldModal({ onClose, onAdd, section }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      type: type,
      field_type: type,
      requiredFor: required ? ["create"] : [],
      locked: false,
      isCustom: true,
      order: 999,
    });
    onClose();
  };

  return (
    <Modal title={`Add Custom ${section === "client" ? "Client" : "Dog"} Field`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
        <Inp label="Field Name" value={name} onChange={setName} required placeholder="e.g. Preferred Groomer" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Field Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["text", "email", "tel", "number", "date", "select", "textarea"].map(t => {
              const ts = FIELD_TYPE_COLORS[t];
              const isActive = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${isActive ? ts.color : C.border}`,
                    background: isActive ? ts.bg : C.surface, color: isActive ? ts.color : C.textSec,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setRequired(!required)}
            style={{
              width: 38, height: 22, borderRadius: 11, border: "none",
              background: required ? C.pri : C.surfaceHover, cursor: "pointer",
              position: "relative", transition: "background 0.2s",
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3, left: required ? 19 : 3,
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Required for record creation</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={handleAdd} disabled={!name.trim()}>Add Field</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Mapping Stats Bar ────────────────────────────────────────────────────────

function MappingStats({ mappings, leftCount, rightCount }) {
  const mapped = mappings.length;
  const pct = leftCount > 0 ? Math.round((mapped / leftCount) * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "10px 18px",
      background: `linear-gradient(135deg, ${C.pri}06, ${C.acc}06)`,
      borderRadius: 10, border: `1px solid ${C.borderLight}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{mapped} of {leftCount} fields mapped</span>
          <span style={{ fontSize: 11, color: C.textMut }}>({pct}%)</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: C.surfaceHover, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, width: `${pct}%`,
            background: pct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>
      {pct === 100 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
          borderRadius: 8, background: C.sucLt, color: C.suc, fontSize: 11, fontWeight: 700,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          Complete
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function RequiredFieldsTab() {
  const { profile } = useAuth();
  // State
  const [activeSection, setActiveSection] = useState("client");
  const [mappings, setMappings] = useState({ client: [], dog: [] });
  const [customFields, setCustomFields] = useState({ client: [], dog: [] });
  const [fieldRequirements, setFieldRequirements] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragState, setDragState] = useState(null); // { fromId, fromSide, startPos }
  const [dragPos, setDragPos] = useState(null);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [gingrFields, setGingrFields] = useState({ client: defaultGingrClientFields, dog: defaultGingrDogFields });
  const [gingrLoading, setGingrLoading] = useState(false);
  const [hoveredMapping, setHoveredMapping] = useState(null);
  const [dotPositions, setDotPositions] = useState({});

  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const leftColRef = useRef(null);
  const rightColRef = useRef(null);

  // Load Gingr form definitions from Supabase (if available)
  useEffect(() => {
    let cancelled = false;
    async function loadGingrFields() {
      setGingrLoading(true);
      try {
        const { data, error } = await supabase
          .from("gingr_form_definitions")
          .select("*")
          .eq("location_id", profile?.location_id || "cherry-hill")
          .order("display_order", { ascending: true });

        if (!error && data && data.length > 0 && !cancelled) {
          const clientFields = data.filter(f => f.form_type === "owner_registration").map(f => ({
            id: `g_${f.field_name}`,
            name: f.field_label || titleCase(f.field_name.replace(/_/g, " ")),
            field_name: f.field_name,
            form_type: f.form_type,
            field_type: f.field_type,
            is_required: f.is_required,
            section: f.section,
            display_order: f.display_order,
          }));
          const dogFields = data.filter(f => f.form_type === "animal_profile").map(f => ({
            id: `g_${f.field_name}`,
            name: f.field_label || titleCase(f.field_name.replace(/_/g, " ")),
            field_name: f.field_name,
            form_type: f.form_type,
            field_type: f.field_type,
            is_required: f.is_required,
            section: f.section,
            display_order: f.display_order,
          }));

          if (clientFields.length > 0) setGingrFields(prev => ({ ...prev, client: clientFields }));
          if (dogFields.length > 0) setGingrFields(prev => ({ ...prev, dog: dogFields }));
        }
      } catch (e) {
        // Silently fall back to defaults
      }
      if (!cancelled) setGingrLoading(false);
    }
    loadGingrFields();
    return () => { cancelled = true; };
  }, []);

  // Build left (K9 Ops) fields
  const leftFields = useMemo(() => {
    const base = activeSection === "client"
      ? DEF_CLIENT_FIELDS.map(f => ({ ...f, field_type: f.type }))
      : DEF_DOG_FIELDS.map(f => ({ ...f, field_type: f.type }));
    const custom = customFields[activeSection] || [];
    return [...base, ...custom];
  }, [activeSection, customFields]);

  // Right (Gingr) fields
  const rightFields = useMemo(() => gingrFields[activeSection] || [], [activeSection, gingrFields]);

  // Current mappings
  const currentMappings = useMemo(() => mappings[activeSection] || [], [activeSection, mappings]);

  // Connected field sets
  const connectedLeft = useMemo(() => new Set(currentMappings.map(m => m.left)), [currentMappings]);
  const connectedRight = useMemo(() => new Set(currentMappings.map(m => m.right)), [currentMappings]);

  // Calculate dot positions
  const updateDotPositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions = {};

    containerRef.current.querySelectorAll("[data-dot-id]").forEach(el => {
      const id = el.getAttribute("data-dot-id");
      const side = el.getAttribute("data-dot-side");
      const rect = el.getBoundingClientRect();
      positions[`${side}_${id}`] = {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      };
    });

    setDotPositions(positions);
  }, []);

  useEffect(() => {
    updateDotPositions();
    const timer = setTimeout(updateDotPositions, 100);
    window.addEventListener("resize", updateDotPositions);
    window.addEventListener("scroll", updateDotPositions, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateDotPositions);
      window.removeEventListener("scroll", updateDotPositions, true);
    };
  }, [updateDotPositions, leftFields, rightFields, activeSection]);

  // Drag handlers
  const handleDragStart = useCallback((fieldId, side, pos) => {
    setDragState({ fromId: fieldId, fromSide: side, startPos: pos });
    setDragPos(pos);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      // Detect hover over dots
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      let found = null;
      for (const el of els) {
        const dotId = el.getAttribute?.("data-dot-id");
        const dotSide = el.getAttribute?.("data-dot-side");
        if (dotId && dotSide && dotSide !== dragState.fromSide) {
          found = dotId;
          break;
        }
      }
      setHoveredDot(found);
    };

    const handleMouseUp = (e) => {
      if (hoveredDot && dragState) {
        const leftId = dragState.fromSide === "left" ? dragState.fromId : hoveredDot;
        const rightId = dragState.fromSide === "right" ? dragState.fromId : hoveredDot;

        setMappings(prev => {
          const section = activeSection;
          const existing = prev[section] || [];
          // Remove any existing mapping for these fields
          const filtered = existing.filter(m => m.left !== leftId && m.right !== rightId);
          return { ...prev, [section]: [...filtered, { left: leftId, right: rightId }] };
        });
      }
      setDragState(null);
      setDragPos(null);
      setHoveredDot(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, hoveredDot, activeSection]);

  // Remove mapping
  const removeMapping = useCallback((leftId, rightId) => {
    setMappings(prev => {
      const section = activeSection;
      return { ...prev, [section]: (prev[section] || []).filter(m => !(m.left === leftId && m.right === rightId)) };
    });
  }, [activeSection]);

  // Toggle required
  const toggleRequired = useCallback((fieldId) => {
    setFieldRequirements(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  }, []);

  // Add custom field
  const addCustomField = useCallback((field) => {
    setCustomFields(prev => ({
      ...prev,
      [activeSection]: [...(prev[activeSection] || []), field],
    }));
  }, [activeSection]);

  // Remove custom field
  const removeCustomField = useCallback((fieldId) => {
    setCustomFields(prev => ({
      ...prev,
      [activeSection]: (prev[activeSection] || []).filter(f => f.id !== fieldId),
    }));
    setMappings(prev => ({
      ...prev,
      [activeSection]: (prev[activeSection] || []).filter(m => m.left !== fieldId),
    }));
  }, [activeSection]);

  // SVG drag line start position
  const dragStartSvg = useMemo(() => {
    if (!dragState || !containerRef.current) return null;
    const key = `${dragState.fromSide}_${dragState.fromId}`;
    return dotPositions[key] || null;
  }, [dragState, dotPositions]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Field Mapping</h3>
          <Btn variant="primary" size="sm" onClick={() => setShowAddModal(true)} icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          }>Add Custom Field</Btn>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
          Map fields between K9 Ops Lite and Gingr to ensure records sync 1:1. Drag between dots to create connections.
        </p>
      </div>

      {/* Info Banner */}
      <div style={{
        padding: "12px 16px", borderRadius: 10,
        background: `linear-gradient(135deg, ${C.priLt}, ${C.accLt}40)`,
        border: `1.5px solid ${C.pri}15`, marginBottom: 16,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: C.pri,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          <strong>How it works:</strong> Each K9 Ops field (left) maps to a Gingr field (right). Click and drag from any dot to create a mapping. Click a mapping line to remove it. Custom fields can be added for data unique to your facility. Gingr fields are auto-synced when available.
        </div>
      </div>

      {/* Section Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {SECTION_TABS.map(tab => {
          const isActive = activeSection === tab.id;
          const sectionMappings = mappings[tab.id] || [];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 10,
                border: `1.5px solid ${isActive ? C.pri : C.border}`,
                background: isActive ? C.pri : C.surface,
                color: isActive ? "#fff" : C.text,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s", flex: 1, justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.icon} />
              </svg>
              {tab.label}
              {sectionMappings.length > 0 && (
                <span style={{
                  padding: "1px 7px", borderRadius: 10,
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? "rgba(255,255,255,0.25)" : C.priLt,
                  color: isActive ? "#fff" : C.pri,
                }}>
                  {sectionMappings.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mapping Stats */}
      <MappingStats mappings={currentMappings} leftCount={leftFields.length} rightCount={rightFields.length} />

      {/* Two Column Mapping Area */}
      <div style={{ position: "relative", marginTop: 16 }}>
        {/* SVG Overlay for mapping lines */}
        <svg
          ref={svgRef}
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            pointerEvents: "none", zIndex: 1, overflow: "visible",
          }}
        >
          <style>{`
            .mapping-remove-btn { transition: opacity 0.15s; }
            g:hover .mapping-remove-btn { opacity: 1 !important; }
          `}</style>
          {/* Existing mapping lines */}
          {currentMappings.map((m, i) => {
            const leftPos = dotPositions[`left_${m.left}`];
            const rightPos = dotPositions[`right_${m.right}`];
            if (!leftPos || !rightPos) return null;
            return (
              <MappingLine
                key={`${m.left}-${m.right}`}
                x1={leftPos.x}
                y1={leftPos.y}
                x2={rightPos.x}
                y2={rightPos.y}
                isActive={hoveredMapping === i}
                onRemove={() => removeMapping(m.left, m.right)}
              />
            );
          })}
          {/* Active drag line */}
          {dragState && dragStartSvg && dragPos && (
            <g style={{ pointerEvents: "none" }}>
              <line
                x1={dragStartSvg.x}
                y1={dragStartSvg.y}
                x2={dragPos.x}
                y2={dragPos.y}
                stroke={C.acc}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.7}
              />
              <circle cx={dragPos.x} cy={dragPos.y} r={6} fill={C.acc} opacity={0.3} />
            </g>
          )}
        </svg>

        {/* Column Headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 0, marginBottom: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: C.pri, borderRadius: 10, color: "#fff",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.03em" }}>K9 OPS LITE</span>
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: "auto" }}>{leftFields.length} fields</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: C.acc, borderRadius: 10, color: "#fff",
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.03em" }}>Gingr</span>
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: "auto" }}>{rightFields.length} fields</span>
            {gingrLoading && (
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                animation: "spin 0.8s linear infinite",
              }} />
            )}
          </div>
        </div>

        {/* Field Columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 0, alignItems: "start" }}>
          {/* Left Column - K9 Ops */}
          <div ref={leftColRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {leftFields.map(field => (
              <FieldCard
                key={field.id}
                field={field}
                side="left"
                isConnected={connectedLeft.has(field.id)}
                isHovered={hoveredDot === field.id || (dragState && dragState.fromSide === "right" && !connectedLeft.has(field.id))}
                isDragging={dragState?.fromId === field.id}
                onDragStart={handleDragStart}
                onToggleRequired={toggleRequired}
                isCustom={field.isCustom}
                onRemoveCustom={field.isCustom ? removeCustomField : null}
              />
            ))}
            {/* Add field button */}
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px", borderRadius: 10,
                border: `1.5px dashed ${C.border}`,
                background: "transparent", color: C.textMut,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.color = C.pri; e.currentTarget.style.background = C.priLt; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMut; e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Custom Field
            </button>
          </div>

          {/* Center spacer for lines */}
          <div style={{ minHeight: 100 }} />

          {/* Right Column - Gingr */}
          <div ref={rightColRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rightFields.map(field => (
              <FieldCard
                key={field.id}
                field={field}
                side="right"
                isConnected={connectedRight.has(field.id)}
                isHovered={hoveredDot === field.id || (dragState && dragState.fromSide === "left" && !connectedRight.has(field.id))}
                isDragging={dragState?.fromId === field.id}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Auto-map Button */}
      <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
        <Btn
          variant="secondary"
          size="sm"
          onClick={() => {
            // Auto-map fields by matching names or ids
            const newMappings = [];
            leftFields.forEach(lf => {
              const matchName = (lf.name || "").toLowerCase().replace(/[^a-z]/g, "");
              const matchId = (lf.id || "").toLowerCase();
              const match = rightFields.find(rf => {
                const rName = (rf.name || "").toLowerCase().replace(/[^a-z]/g, "");
                const rFieldName = (rf.field_name || "").toLowerCase();
                return rName === matchName || rFieldName === matchId || rFieldName.includes(matchId) || matchId.includes(rFieldName);
              });
              if (match && !connectedRight.has(match.id)) {
                newMappings.push({ left: lf.id, right: match.id });
              }
            });
            if (newMappings.length > 0) {
              setMappings(prev => ({ ...prev, [activeSection]: newMappings }));
            }
          }}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>}
        >
          Auto-Map by Name
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => setMappings(prev => ({ ...prev, [activeSection]: [] }))}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
        >
          Clear All
        </Btn>
      </div>

      {/* Mapping Summary Table */}
      {currentMappings.length > 0 && (
        <Card style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "12px 18px", background: C.bg,
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Active Mappings
            </span>
            <Badge color="primary">{currentMappings.length}</Badge>
          </div>
          <div>
            {currentMappings.map((m, i) => {
              const lf = leftFields.find(f => f.id === m.left);
              const rf = rightFields.find(f => f.id === m.right);
              if (!lf || !rf) return null;
              return (
                <div
                  key={`${m.left}-${m.right}`}
                  onMouseEnter={() => setHoveredMapping(i)}
                  onMouseLeave={() => setHoveredMapping(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr auto 1fr auto",
                    padding: "10px 18px", alignItems: "center",
                    borderBottom: `1px solid ${C.borderLight}`,
                    background: hoveredMapping === i ? `${C.pri}04` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.pri, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lf.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                      background: (FIELD_TYPE_COLORS[lf.field_type || lf.type] || FIELD_TYPE_COLORS.text).bg,
                      color: (FIELD_TYPE_COLORS[lf.field_type || lf.type] || FIELD_TYPE_COLORS.text).color,
                    }}>
                      {lf.field_type || lf.type}
                    </span>
                  </div>
                  <div style={{ padding: "0 16px", display: "flex", alignItems: "center" }}>
                    <svg width="20" height="12" viewBox="0 0 20 12">
                      <line x1="0" y1="6" x2="20" y2="6" stroke={C.acc} strokeWidth="2" />
                      <polygon points="16,2 20,6 16,10" fill={C.acc} />
                    </svg>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.acc, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{rf.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                      background: (FIELD_TYPE_COLORS[rf.field_type] || FIELD_TYPE_COLORS.text).bg,
                      color: (FIELD_TYPE_COLORS[rf.field_type] || FIELD_TYPE_COLORS.text).color,
                    }}>
                      {rf.field_type}
                    </span>
                  </div>
                  <button
                    onClick={() => removeMapping(m.left, m.right)}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C.border}`,
                      background: C.surface, cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", marginLeft: 8,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.borderColor = C.dan; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* CSS Animation for loading spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Add Custom Field Modal */}
      {showAddModal && (
        <AddCustomFieldModal
          onClose={() => setShowAddModal(false)}
          onAdd={addCustomField}
          section={activeSection}
        />
      )}
    </div>
  );
}

export default RequiredFieldsTab;
