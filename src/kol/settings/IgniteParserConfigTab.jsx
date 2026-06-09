// K9 Operations — IgniteParserConfigTab
// Isolated page component.

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, gid } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge, Btn, Card, CustomSelect } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { LEAD_TYPES } from "../../ignite/constants";

// ─── Default parser rule template ────────────────────────────────────────────
const DEFAULT_PARSER_RULE = {
  id: "",
  name: "",
  senderMatch: "",
  subjectMatch: "",
  leadType: LEAD_TYPES.WEB_FORM,
  fieldMappings: [
    { sourceField: "first_name", targetField: "firstName", transform: "none" },
    { sourceField: "last_name", targetField: "lastName", transform: "none" },
    { sourceField: "email", targetField: "email", transform: "lowercase" },
    { sourceField: "phone", targetField: "phone", transform: "normalize_phone" },
  ],
  active: true,
};

// ─── Available source fields (from parsed Ignite emails) ─────────────────────
const SOURCE_FIELDS = [
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "caller_name", label: "Caller Name (Combined)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "lead_type", label: "Lead Type" },
  { value: "call_recording_url", label: "Call Recording URL" },
  { value: "source", label: "Source" },
  { value: "ad_campaign", label: "Ad Campaign" },
  { value: "tracking_number", label: "Tracking Number" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "Zip Code" },
  { value: "address", label: "Address" },
  { value: "message", label: "Message" },
  { value: "service_type", label: "Service Type" },
  { value: "pet_name", label: "Pet Name" },
  { value: "pet_breed", label: "Pet Breed" },
];

// ─── Target fields (Gingr customer record fields) ────────────────────────────
const TARGET_FIELDS = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "Zip Code" },
  { value: "address", label: "Street Address" },
  { value: "notes", label: "Notes" },
  { value: "sourceDetail", label: "Source / Campaign" },
  { value: "callRecordingUrl", label: "Call Recording URL" },
  { value: "petName", label: "Pet Name" },
  { value: "petBreed", label: "Pet Breed" },
  { value: "serviceInterest", label: "Service Interest" },
];

// ─── Transform options ───────────────────────────────────────────────────────
const TRANSFORMS = [
  { value: "none", label: "None" },
  { value: "lowercase", label: "Lowercase" },
  { value: "uppercase", label: "Uppercase" },
  { value: "titlecase", label: "Title Case" },
  { value: "normalize_phone", label: "Normalize Phone" },
  { value: "trim", label: "Trim Whitespace" },
  { value: "strip_html", label: "Strip HTML" },
];

// ─── Lead type options ───────────────────────────────────────────────────────
const LEAD_TYPE_OPTIONS = [
  { value: LEAD_TYPES.WEB_FORM, label: "Web Form" },
  { value: LEAD_TYPES.PHONE_CALL, label: "Phone Call" },
  { value: LEAD_TYPES.AD_CLICK, label: "Ad Click" },
];

// ─── Gingr field mapping defaults ────────────────────────────────────────────
const defaultGingrMapping = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  matchStrategy: "email_first",
  autoCreateClient: false,
  defaultTags: [],
  notifyOnNewLead: true,
  notifyOnMatch: false,
  notifyOnReview: true,
};

const MATCH_STRATEGIES = [
  { value: "email_first", label: "Email First — Match by email, then phone, then name" },
  { value: "phone_first", label: "Phone First — Match by phone, then email, then name" },
  { value: "strict_email", label: "Strict Email — Only match by exact email" },
  { value: "multi_signal", label: "Multi-Signal — Require 2+ matching fields for auto-match" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

function IgniteParserConfigTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";

  // Parser rules state
  const [rules, setRules] = useState([]);
  const [editingRule, setEditingRule] = useState(null); // null = list view, object = editing
  const [gingrMapping, setGingrMapping] = useState({ ...defaultGingrMapping });
  const [tagInput, setTagInput] = useState("");

  // UI state
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState("rules"); // "rules" | "mapping"

  // Load persisted config from lite_settings
  useEffect(() => {
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "ignite_parser_config").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) {
        const val = rows[0].setting_value;
        if (val.rules) setRules(val.rules);
        if (val.gingrMapping) setGingrMapping({ ...defaultGingrMapping, ...val.gingrMapping });
      }
      setLoaded(true);
    });
  }, [locationId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "ignite_parser_config",
      setting_value: { rules, gingrMapping },
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  // ─── Rule CRUD ─────────────────────────────────────────────────────────────
  const addRule = () => {
    const newRule = { ...DEFAULT_PARSER_RULE, id: gid(), name: `Rule ${rules.length + 1}`, fieldMappings: DEFAULT_PARSER_RULE.fieldMappings.map(m => ({ ...m })) };
    setEditingRule(newRule);
  };

  const saveRule = (rule) => {
    const idx = rules.findIndex(r => r.id === rule.id);
    if (idx >= 0) {
      const updated = [...rules];
      updated[idx] = rule;
      setRules(updated);
    } else {
      setRules([...rules, rule]);
    }
    setEditingRule(null);
    setDirty(true);
  };

  const deleteRule = (ruleId) => {
    setRules(rules.filter(r => r.id !== ruleId));
    setDirty(true);
  };

  const toggleRule = (ruleId) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, active: !r.active } : r));
    setDirty(true);
  };

  // ─── Gingr mapping handlers ────────────────────────────────────────────────
  const updateMapping = (key, value) => {
    setGingrMapping(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !gingrMapping.defaultTags.includes(tag)) {
      updateMapping("defaultTags", [...gingrMapping.defaultTags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    updateMapping("defaultTags", gingrMapping.defaultTags.filter(t => t !== tag));
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center" }}><K9LoadingAnimation size={48} message="Loading parser configuration..." /></div>;

  // ─── Rule Editor ───────────────────────────────────────────────────────────
  if (editingRule) {
    return <RuleEditor rule={editingRule} onSave={saveRule} onCancel={() => setEditingRule(null)} />;
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Email Parser Configuration</h3>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Configure how inbound Ignite email responses are parsed and mapped to Gingr customer records.
      </p>

      {/* Section Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1.5px solid ${C.border}`, paddingBottom: 0 }}>
        {[
          { id: "rules", label: "Parser Rules", count: rules.length },
          { id: "mapping", label: "Gingr Mapping" },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: `2.5px solid ${activeSection === s.id ? C.pri : "transparent"}`,
              background: "transparent",
              color: activeSection === s.id ? C.pri : C.textSec,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              marginBottom: -1.5,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {s.label}
            {s.count != null && <Badge color={activeSection === s.id ? "primary" : "default"} size="sm">{s.count}</Badge>}
          </button>
        ))}
      </div>

      {/* Parser Rules Section */}
      {activeSection === "rules" && (
        <div>
          {/* Info banner */}
          <Card style={{ padding: "14px 18px", marginBottom: 20, background: C.priLt, border: `1px solid ${C.pri}30` }}>
            <div style={{ fontSize: 12, color: C.pri, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700 }}>Parser rules</span> define how inbound emails from Ignite are parsed into structured lead data.
              Each rule matches emails by sender address and/or subject line, then extracts fields using the configured field mappings.
              Rules are evaluated in order — the first matching rule is used.
            </div>
          </Card>

          {/* Rules list */}
          {rules.length === 0 ? (
            <Card style={{ padding: "40px 20px", textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>
                <I name="mail" size={32} color={C.textMut} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>No Parser Rules Configured</div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16 }}>
                Add a rule to define how Ignite emails are parsed into leads. The default Ignite parser will be used until custom rules are configured.
              </div>
              <Btn variant="primary" size="sm" onClick={addRule}>Add First Rule</Btn>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {rules.map((rule, idx) => (
                <Card key={rule.id} style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      {/* Priority indicator */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                        background: rule.active ? C.priLt : C.surfaceHover, color: rule.active ? C.pri : C.textMut,
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: rule.active ? C.text : C.textMut }}>{rule.name}</span>
                          <Badge color={rule.active ? "success" : "default"} size="sm">{rule.active ? "Active" : "Disabled"}</Badge>
                          <Badge color="info" size="sm">
                            {LEAD_TYPE_OPTIONS.find(o => o.value === rule.leadType)?.label || rule.leadType}
                          </Badge>
                        </div>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                          {rule.senderMatch && <span>Sender: <span style={{ fontWeight: 600 }}>{rule.senderMatch}</span></span>}
                          {rule.senderMatch && rule.subjectMatch && <span style={{ margin: "0 6px", color: C.textMut }}>|</span>}
                          {rule.subjectMatch && <span>Subject: <span style={{ fontWeight: 600 }}>{rule.subjectMatch}</span></span>}
                          {!rule.senderMatch && !rule.subjectMatch && <span style={{ fontStyle: "italic", color: C.textMut }}>Matches all emails (catch-all)</span>}
                          <span style={{ margin: "0 6px", color: C.textMut }}>|</span>
                          <span>{rule.fieldMappings.length} field{rule.fieldMappings.length !== 1 ? "s" : ""} mapped</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => toggleRule(rule.id)}
                        style={{
                          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.textSec, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {rule.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => setEditingRule({ ...rule, fieldMappings: rule.fieldMappings.map(m => ({ ...m })) })}
                        style={{
                          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.pri}40`,
                          background: "transparent", color: C.pri, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        style={{
                          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.dan}40`,
                          background: "transparent", color: C.dan, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Add rule button */}
          {rules.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Btn variant="secondary" size="sm" onClick={addRule}>+ Add Rule</Btn>
            </div>
          )}

          {/* How parsing works */}
          <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Email Parsing Works</div>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 6 }}>When an inbound email arrives from Ignite:</div>
              <div style={{ paddingLeft: 14 }}>
                <div>1. The email sender and subject are checked against each rule in priority order</div>
                <div>2. The first matching rule's field mappings are used to extract data from the email body</div>
                <div>3. Configured transforms (lowercase, phone normalization, etc.) are applied to each extracted field</div>
                <div>4. The structured lead data is matched against Gingr customer records using the configured strategy</div>
                <div>5. High-confidence matches are auto-linked; ambiguous matches go to the review queue</div>
              </div>
              <div style={{ marginTop: 8, fontStyle: "italic", color: C.textMut }}>
                If no custom rules match, the built-in Ignite parser extracts data-field attributes and table rows automatically.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Gingr Customer Mapping Section */}
      {activeSection === "mapping" && (
        <div>
          {/* Match Strategy */}
          <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Match Strategy</div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12, lineHeight: 1.5 }}>
              Determines the priority order for matching parsed leads to existing Gingr customer records.
            </div>
            <CustomSelect
              value={gingrMapping.matchStrategy}
              onChange={(v) => updateMapping("matchStrategy", v)}
              options={MATCH_STRATEGIES}
              placeholder="Select match strategy..."
            />
          </Card>

          {/* Field Mapping Grid */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Lead → Gingr Field Mapping</div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, lineHeight: 1.5 }}>
              Map which parsed lead fields correspond to Gingr customer record fields. These mappings determine how leads are matched and how client profiles are populated.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Primary contact fields */}
              {[
                { key: "firstName", label: "First Name", desc: "Customer's first name field in Gingr" },
                { key: "lastName", label: "Last Name", desc: "Customer's last name field in Gingr" },
                { key: "email", label: "Email", desc: "Primary email address for matching and contact" },
                { key: "phone", label: "Phone", desc: "Phone number (normalized for matching)" },
              ].map(field => (
                <Card key={field.key} style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{field.label}</div>
                  <div style={{ fontSize: 11, color: C.textSec, marginBottom: 10 }}>{field.desc}</div>
                  <CustomSelect
                    value={gingrMapping[field.key]}
                    onChange={(v) => updateMapping(field.key, v)}
                    options={SOURCE_FIELDS}
                    placeholder="Select source field..."
                    small
                  />
                </Card>
              ))}
            </div>
          </div>

          {/* Automation Settings */}
          <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Automation Settings</div>

            {/* Auto-create toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.borderLight}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Auto-Create Client Records</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                  Automatically create a new Gingr client record when no match is found
                </div>
              </div>
              <button
                onClick={() => updateMapping("autoCreateClient", !gingrMapping.autoCreateClient)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: gingrMapping.autoCreateClient ? C.suc : C.surfaceHover,
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 3,
                  left: gingrMapping.autoCreateClient ? 23 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }} />
              </button>
            </div>

            {/* Notification toggles */}
            {[
              { key: "notifyOnNewLead", label: "Notify on New Lead", desc: "Send notification when a new lead arrives from Ignite" },
              { key: "notifyOnMatch", label: "Notify on Auto-Match", desc: "Send notification when a lead is automatically matched to a client" },
              { key: "notifyOnReview", label: "Notify on Review Queue", desc: "Send notification when a lead needs manual review" },
            ].map((opt, i, arr) => (
              <div key={opt.key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: i < arr.length - 1 ? 16 : 0,
                paddingBottom: i < arr.length - 1 ? 16 : 0,
                borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{opt.desc}</div>
                </div>
                <button
                  onClick={() => updateMapping(opt.key, !gingrMapping[opt.key])}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: gingrMapping[opt.key] ? C.suc : C.surfaceHover,
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3,
                    left: gingrMapping[opt.key] ? 23 : 3,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }} />
                </button>
              </div>
            ))}
          </Card>

          {/* Default Tags */}
          <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Default Tags</div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12, lineHeight: 1.5 }}>
              Tags automatically applied to new client records created from Ignite leads.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: gingrMapping.defaultTags.length > 0 ? 12 : 0 }}>
              {gingrMapping.defaultTags.map(tag => (
                <span key={tag} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: C.accLt, color: C.accDk,
                }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} style={{
                    border: "none", background: "transparent", color: C.accDk,
                    cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1, fontWeight: 700,
                  }}>
                    x
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="e.g. ignite-lead, web-inquiry"
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8,
                  border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
                  fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <Btn variant="secondary" size="sm" onClick={addTag} disabled={!tagInput.trim()}>Add</Btn>
            </div>
          </Card>

          {/* How Gingr matching works */}
          <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Customer Matching Works</div>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 6 }}>Parsed leads are matched to existing Gingr customer records using a multi-tier confidence system:</div>
              <div style={{ paddingLeft: 14 }}>
                <div><span style={{ fontWeight: 700, color: C.suc }}>1.0</span> — Exact email match (auto-linked)</div>
                <div><span style={{ fontWeight: 700, color: C.suc }}>0.95</span> — Exact phone match (auto-linked)</div>
                <div><span style={{ fontWeight: 700, color: C.info }}>0.9</span> — Phone + last name combo (auto-linked)</div>
                <div><span style={{ fontWeight: 700, color: C.warn }}>0.5–0.8</span> — Name similarity, nickname matching (review queue)</div>
                <div><span style={{ fontWeight: 700, color: C.dan }}>{"<"}0.5</span> — No match found</div>
              </div>
              <div style={{ marginTop: 8, fontStyle: "italic" }}>
                Auto-match threshold: <span style={{ fontWeight: 700, color: C.pri }}>0.85</span> | Review threshold: <span style={{ fontWeight: 700, color: C.pri }}>0.50</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
        {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>Parser rules and mappings take effect on the next inbound email.</span>
      </div>
    </div>
  );
}

// ─── Rule Editor Sub-Component ───────────────────────────────────────────────

function RuleEditor({ rule: initialRule, onSave, onCancel }) {
  const [rule, setRule] = useState({ ...initialRule });

  const update = (key, value) => {
    setRule(prev => ({ ...prev, [key]: value }));
  };

  const addMapping = () => {
    setRule(prev => ({
      ...prev,
      fieldMappings: [...prev.fieldMappings, { sourceField: "", targetField: "", transform: "none" }],
    }));
  };

  const updateMapping = (idx, key, value) => {
    setRule(prev => {
      const mappings = [...prev.fieldMappings];
      mappings[idx] = { ...mappings[idx], [key]: value };
      return { ...prev, fieldMappings: mappings };
    });
  };

  const removeMapping = (idx) => {
    setRule(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== idx),
    }));
  };

  const isValid = rule.name.trim() && rule.fieldMappings.length > 0 && rule.fieldMappings.every(m => m.sourceField && m.targetField);

  return (
    <div>
      <button
        onClick={onCancel}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", marginBottom: 20,
          border: "none", background: "none", color: C.pri,
          cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
        }}
      >
        Back to Rules
      </button>

      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>
        {initialRule.id && rule.name ? `Edit Rule: ${rule.name}` : "New Parser Rule"}
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Define how this email pattern should be parsed and what fields to extract.
      </p>

      {/* Rule identity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Rule Name</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12 }}>A descriptive name for this parser rule.</div>
          <input
            type="text"
            value={rule.name}
            onChange={e => update("name", e.target.value)}
            placeholder="e.g. Ignite Web Form Leads"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
              fontSize: 14, fontWeight: 600, fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </Card>

        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Lead Type</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12 }}>The type of lead that emails matching this rule produce.</div>
          <CustomSelect
            value={rule.leadType}
            onChange={(v) => update("leadType", v)}
            options={LEAD_TYPE_OPTIONS}
            placeholder="Select lead type..."
          />
        </Card>
      </div>

      {/* Email matching criteria */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Email Matching Criteria</div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, lineHeight: 1.5 }}>
          Define which emails this rule applies to. Both fields support partial matching — if the email sender or subject contains the value, it matches. Leave blank to match all.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Sender Address Contains</div>
            <input
              type="text"
              value={rule.senderMatch}
              onChange={e => update("senderMatch", e.target.value)}
              placeholder="e.g. noreply@leads.idigitalstrategies.com"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
                fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Subject Contains</div>
            <input
              type="text"
              value={rule.subjectMatch}
              onChange={e => update("subjectMatch", e.target.value)}
              placeholder="e.g. New Web Form Lead"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
                fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </Card>

      {/* Field mappings */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Field Mappings</div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Map email fields to lead record fields. Optionally apply transforms during extraction.</div>
          </div>
          <Btn variant="secondary" size="sm" onClick={addMapping}>+ Add Field</Btn>
        </div>

        {/* Column headers */}
        {rule.fieldMappings.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 32px", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" }}>Source (Email Field)</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" }}>Target (Lead Field)</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" }}>Transform</div>
            <div />
          </div>
        )}

        {rule.fieldMappings.map((mapping, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 32px", gap: 10, marginBottom: 8, alignItems: "center" }}>
            <CustomSelect
              value={mapping.sourceField}
              onChange={(v) => updateMapping(idx, "sourceField", v)}
              options={SOURCE_FIELDS}
              placeholder="Source field..."
              small
            />
            <CustomSelect
              value={mapping.targetField}
              onChange={(v) => updateMapping(idx, "targetField", v)}
              options={TARGET_FIELDS}
              placeholder="Target field..."
              small
            />
            <CustomSelect
              value={mapping.transform}
              onChange={(v) => updateMapping(idx, "transform", v)}
              options={TRANSFORMS}
              placeholder="Transform..."
              small
            />
            <button
              onClick={() => removeMapping(idx)}
              style={{
                width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.dan}30`,
                background: "transparent", color: C.dan, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
              }}
            >
              x
            </button>
          </div>
        ))}

        {rule.fieldMappings.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", color: C.textMut, fontSize: 12 }}>
            No field mappings configured. Add at least one mapping to extract data from emails.
          </div>
        )}
      </Card>

      {/* Save / Cancel */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => onSave(rule)}
          disabled={!isValid}
          style={{
            padding: "10px 28px", borderRadius: 8, border: "none",
            background: !isValid ? C.surfaceHover : C.pri,
            color: !isValid ? C.textMut : "#fff",
            fontSize: 13, fontWeight: 700, cursor: !isValid ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          Save Rule
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 28px", borderRadius: 8, border: `1.5px solid ${C.border}`,
            background: "transparent", color: C.textSec,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
        {!isValid && <span style={{ fontSize: 12, color: C.warn, fontWeight: 600 }}>Rule name and at least one complete field mapping are required.</span>}
      </div>
    </div>
  );
}

export default IgniteParserConfigTab;
