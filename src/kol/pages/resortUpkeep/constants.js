export const TABS = [
  { id: "due", label: "Due" },
  { id: "vendors", label: "Vendors" },
  { id: "licenses", label: "Licenses" },
  { id: "guide", label: "Guide" },
];

export const EMPTY_DASHBOARD = {
  maintenance: [],
  maintenanceSummary: { active: 0, overdue: 0, ready_to_submit: 0, submitted: 0, open: 0 },
  vendors: { active: 0, archived: 0 },
  licenses: { active: 0, non_compliant: 0, expiring_soon: 0 },
  troubleshooting: [],
};

export const INTRO_DEFAULTS = {
  due: "Everything overdue or coming due across building maintenance, licenses, and vendor contracts. Open a maintenance row to complete its checklist.",
  vendors: "The facility vendor and utility call list: trade, company, contact, contract, service frequency and cost. A full company directory (multiple contacts and documents per company) is planned; for now this is the call list.",
  licenses: "Permits and compliance requirements with renewal frequency, due dates, compliance status, proof documents, and an update log.",
  guide: "Field reference and escalation paths for common facility issues. Expanded for fast scanning under operational pressure.",
};

export const DUE_WINDOWS = [
  { id: 30, label: "30d" },
  { id: 60, label: "60d" },
  { id: 90, label: "90d" },
  { id: Infinity, label: "All" },
];

// Map a due item's kind / urgency onto the shared StatusPill + StackBadge tones.
export const KIND_TONE = { maintenance: "primary", license: "info", vendor: "accent" };
export const dueToneToStatus = (tone) => (tone === "danger" ? "danger" : tone === "warn" ? "warning" : "neutral");
export const dueToneToBadge = (tone) => (tone === "danger" ? "danger" : tone === "warn" ? "warning" : "primary");
