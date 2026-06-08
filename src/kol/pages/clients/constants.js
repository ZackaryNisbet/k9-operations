// K9 Operations — shared constants for the client lifecycle pages.
// Pure data extracted verbatim from ClientsPage / ClientDetailPage / FunnelPage so
// the page modules stay focused on rendering. See AGENTS.md for the dev contract.

import { C } from "../../../shared/theme";

// ─── CLM-004 Gingr field definitions (used by Push to Gingr) ──────────────
export const gingrClientFields = [
  { id: "g_first_name", gingrField: "first_name", label: "First Name", required: true },
  { id: "g_last_name", gingrField: "last_name", label: "Last Name", required: true },
  { id: "g_email", gingrField: "email", label: "Email", required: true },
  { id: "g_phone", gingrField: "phone", label: "Phone", required: true },
  { id: "g_address", gingrField: "address_line_1", label: "Street Address" },
  { id: "g_city", gingrField: "city", label: "City" },
  { id: "g_state", gingrField: "state", label: "State" },
  { id: "g_zip", gingrField: "zip_code", label: "Zip Code" },
  { id: "g_emergency_name", gingrField: "emergency_contact_name", label: "Emergency Contact" },
  { id: "g_emergency_phone", gingrField: "emergency_contact_phone", label: "Emergency Phone" },
  { id: "g_referral", gingrField: "referral_source", label: "Referral Source" },
];

export const gingrDogFields = [
  { id: "g_dog_name", gingrField: "name", label: "Pet Name", required: true },
  { id: "g_breed", gingrField: "breed", label: "Breed", required: true },
  { id: "g_weight", gingrField: "weight", label: "Weight" },
  { id: "g_dob", gingrField: "date_of_birth", label: "Date of Birth" },
  { id: "g_sex", gingrField: "sex", label: "Sex", required: true },
  { id: "g_altered", gingrField: "spayed_neutered", label: "Spayed/Neutered", required: true },
  { id: "g_color", gingrField: "color", label: "Color/Markings" },
  { id: "g_vax_rabies", gingrField: "vaccination_rabies", label: "Rabies Vaccination", required: true },
  { id: "g_vax_dhpp", gingrField: "vaccination_dhpp", label: "DHPP Vaccination", required: true },
  { id: "g_vax_bordetella", gingrField: "vaccination_bordetella", label: "Bordetella Vaccination", required: true },
  { id: "g_vet_name", gingrField: "vet_name", label: "Vet Name" },
  { id: "g_vet_phone", gingrField: "vet_phone", label: "Vet Phone" },
];

// ─── IGN-003 constants ─────────────────────────────────────────────────────
export const MATCH_TYPE_LABELS = { email: "Email", phone: "Phone", name: "Name", phone_name: "Phone + Name" };
export const LEAD_TYPE_LABELS = { web_form: "Web Form", phone_call: "Phone Call", ad_click: "Ad Click" };
export const LEAD_TYPE_COLORS = { web_form: C.info, phone_call: C.suc, ad_click: C.acc };

// ─── CLM-008: Lifecycle Event Type Styling ─────────────────────────────────
export const EVENT_TYPE_STYLES = {
  stage_change: { color: C.info, bg: C.infoLt, icon: "stage", label: "Stage Change" },
  note:         { color: "#6B7280", bg: "#F3F4F6", icon: "note", label: "Note" },
  follow_up:    { color: C.acc, bg: C.accLt, icon: "followup", label: "Follow-up" },
  initial_sync: { color: C.pri, bg: C.priLt, icon: "sync", label: "Initial Sync" },
  milestone:    { color: "#8B5CF6", bg: "#EDE9FE", icon: "milestone", label: "Milestone" },
};

// ─── ClientsPage Active/All data column ordering ───────────────────────────
export const baseCols = ["nextRes","lastRes","daysSince","totalRes","totalSpent"];
export const extraCols = ["daycare","boarding","eval","postEval","tours","postTour"];
