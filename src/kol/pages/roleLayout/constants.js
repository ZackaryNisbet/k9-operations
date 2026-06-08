// K9 Operations — RoleLayoutPage constants
// Extracted verbatim from RoleLayoutPage.jsx (pure data, no behavior change).

export const SECTIONS = [
  { id: "opening", label: "Opening", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "midday", label: "Midday", color: "#3B82F6", bg: "#EFF6FF" },
  { id: "closing", label: "Closing", color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "as_needed", label: "As Needed", color: "#6B7280", bg: "#F9FAFB" },
];

export const ROLES = [
  { id: "pct", label: "PCT" },
  { id: "csr", label: "CSR" },
  { id: "supervisor", label: "MOD" },
];

export const WORKFLOW_DEFS = [
  { id: "bathing", label: "Bathing" },
  { id: "room_cleaning", label: "Room Cleaning" },
  { id: "pp", label: "Private Play" },
  { id: "pamper", label: "Pamper Package" },
  { id: "lodging_transfer", label: "Lodging Transfers" },
  { id: "collars", label: "Next Day Collars" },
  { id: "belongings", label: "Belongings" },
  { id: "weekly_maintenance", label: "Weekly Maintenance" },
  { id: "weekly_inventory", label: "Weekly Inventory" },
  { id: "training", label: "Labor" },
  { id: "enrichment", label: "Enrichment" },
  { id: "ice_cream", label: "Gourmet Ice Cream" },
  { id: "roll_call_opening", label: "Opening Roll Call" },
  { id: "roll_call_closing", label: "Closing Roll Call" },
  { id: "emergency_contacts", label: "Emergency Contacts" },
  { id: "attendance", label: "Attendance" },
  { id: "feeding_meds_am", label: "AM Feeding and Meds" },
  { id: "feeding_meds_midday", label: "Midday Feeding and Meds" },
  { id: "feeding_meds_pm", label: "PM Feeding and Meds" },
  { id: "feeding_report", label: "Feeding Report" },
  { id: "vendor_log", label: "Vendor Log" },
  { id: "re_eval", label: "Re-eval" },
  { id: "meds", label: "Medication Report" },
  { id: "evaluations", label: "Evaluations" },
];

export const LEGACY_SOURCES = {
  legacy_opening: "Opening",
  legacy_closing: "Closing",
  legacy_fe: "Front-End",
  legacy_be: "Back-End",
};
