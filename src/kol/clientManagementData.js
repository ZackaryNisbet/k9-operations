const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const CLIENT_CASE_TYPE_OPTIONS = [
  { value: "animal_incident", label: "Animal Incident" },
  { value: "vet_visit", label: "Vet Visit" },
  { value: "serious_animal_event", label: "Serious Animal Event" },
  { value: "employee_injury", label: "Employee Injury" },
  { value: "gm_accident_investigation", label: "GM Accident Investigation" },
  { value: "incident_investigation", label: "Incident Investigation" },
];

export const CLIENT_CASE_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under Review" },
  { value: "closed", label: "Closed" },
];

export const CLIENT_CASE_SEVERITY_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "elevated", label: "Elevated" },
  { value: "critical", label: "Critical" },
];

export const INCIDENT_CATEGORY_OPTIONS = [
  { value: "dog_laceration", label: "Dog Laceration" },
  { value: "dog_fight", label: "Dog Fight / Altercation" },
  { value: "loose_stool", label: "Loose Stool / GI Issue" },
  { value: "vomiting", label: "Vomiting / Illness" },
  { value: "dog_death", label: "Dog Death" },
  { value: "dog_mix_up", label: "Dog Mix-Up" },
  { value: "escape", label: "Escape / Loose Dog" },
  { value: "bite_or_scratch", label: "Bite / Scratch" },
  { value: "employee_injury", label: "Employee Injury" },
  { value: "facility_damage", label: "Facility / Safety Issue" },
  { value: "other", label: "Other" },
];

export const RED_BINDER_FORM_LIBRARY = [
  {
    id: "vet_visit_form",
    caseType: "vet_visit",
    title: "Vet Visit Form",
    shortLabel: "Vet Visit",
    pageRange: "67",
    description: "Follow-up form for animal care incidents that require outside veterinary attention.",
    sections: [
      {
        title: "Animal Details",
        fields: [
          { key: "dog_name", label: "Dog Name", type: "text", required: true },
          { key: "visit_date", label: "Vet Visit Date", type: "date", required: true },
          { key: "dog_breed", label: "Breed", type: "text" },
          { key: "dog_age", label: "Age", type: "text" },
          { key: "dog_weight", label: "Weight", type: "text" },
          {
            key: "dog_sex",
            label: "Sex",
            type: "select",
            options: [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "unknown", label: "Unknown" },
            ],
          },
          {
            key: "spayed_neutered",
            label: "Spayed / Neutered",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "unknown", label: "Unknown" },
            ],
          },
          {
            key: "service_context",
            label: "Service Context",
            type: "select",
            options: [
              { value: "boarding", label: "Boarding" },
              { value: "daycare", label: "Daycare" },
              { value: "dayboarding", label: "Dayboarding" },
              { value: "evaluation", label: "Evaluation" },
            ],
          },
        ],
      },
      {
        title: "Visit Details",
        fields: [
          { key: "primary_vet_name", label: "Primary Vet", type: "text" },
          { key: "primary_vet_phone", label: "Primary Vet Phone", type: "tel" },
          { key: "vet_seen_by", label: "Vet Seen By", type: "text" },
          { key: "owner_name", label: "Owner Name", type: "text" },
          { key: "owner_phone", label: "Owner Phone", type: "tel" },
          {
            key: "owner_contacted_before",
            label: "Owner Contacted Before Visit",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          {
            key: "owner_contacted_after",
            label: "Owner Contacted After Visit",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "issue_details", label: "Issue Details", type: "textarea", rows: 3 },
          { key: "vet_recommendation", label: "Vet Recommendation", type: "textarea", rows: 3 },
          { key: "authorized_by", label: "Authorized By", type: "text" },
        ],
      },
    ],
  },
  {
    id: "animal_incident_report",
    caseType: "animal_incident",
    title: "Animal Incident Report",
    shortLabel: "Animal Incident",
    pageRange: "68",
    description: "Initial incident intake for dog-on-dog events and other animal safety issues.",
    sections: [
      {
        title: "Incident Basics",
        fields: [
          { key: "incident_date", label: "Incident Date", type: "date", required: true },
          { key: "incident_time", label: "Incident Time", type: "time" },
          { key: "location_name", label: "Location", type: "text" },
          { key: "primary_dog_name", label: "Primary Dog", type: "text", required: true },
          { key: "secondary_dog_name", label: "Other Dog(s) Involved", type: "text" },
          { key: "incident_location", label: "Incident Location", type: "text" },
        ],
      },
      {
        title: "Communication and Narrative",
        fields: [
          {
            key: "owner_notified",
            label: "Owner Notified",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "owner_notified_time", label: "Owner Notified Time", type: "time" },
          { key: "manager_caller", label: "Manager / Caller", type: "text" },
          { key: "witness_names", label: "Witnesses", type: "text" },
          {
            key: "employee_injury",
            label: "Any Employee Injury",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "detailed_narrative", label: "Detailed Narrative", type: "textarea", rows: 5, required: true },
        ],
      },
    ],
  },
  {
    id: "serious_animal_event_report",
    caseType: "serious_animal_event",
    title: "Serious Animal Injury / Illness / Death Report",
    shortLabel: "Serious Animal Event",
    pageRange: "69",
    description: "Manager-level review form for the most severe animal outcomes.",
    sections: [
      {
        title: "Serious Event Review",
        fields: [
          {
            key: "report_type",
            label: "Report Type",
            type: "select",
            required: true,
            options: [
              { value: "injury", label: "Injury" },
              { value: "illness", label: "Illness" },
              { value: "death", label: "Death" },
            ],
          },
          { key: "injured_animal_name", label: "Animal Name", type: "text", required: true },
          {
            key: "animal_sex",
            label: "Sex",
            type: "select",
            options: [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "unknown", label: "Unknown" },
            ],
          },
          { key: "animal_age", label: "Age", type: "text" },
          { key: "owner_name", label: "Owner Name", type: "text" },
          {
            key: "owner_notified",
            label: "Owner Notified",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "body_part_affected", label: "Body Part Affected", type: "text" },
          { key: "nature_of_injury", label: "Nature of Injury / Illness", type: "textarea", rows: 3 },
          { key: "management_notes", label: "Management Notes", type: "textarea", rows: 4 },
          { key: "completed_by", label: "Completed By", type: "text" },
          { key: "management_reviewer", label: "Management Reviewer", type: "text" },
        ],
      },
    ],
  },
  {
    id: "employee_injury_report",
    caseType: "employee_injury",
    title: "Employee's Report of Injury",
    shortLabel: "Employee Injury",
    pageRange: "70",
    description: "Employee self-report for workplace injuries or near misses.",
    sections: [
      {
        title: "Employee Intake",
        fields: [
          { key: "employee_name", label: "Employee Name", type: "text", required: true },
          { key: "job_title", label: "Job Title", type: "text" },
          { key: "supervisor_name", label: "Supervisor", type: "text" },
          { key: "incident_date", label: "Date of Injury", type: "date", required: true },
          { key: "incident_time", label: "Time of Injury", type: "time" },
          { key: "incident_location", label: "Where It Happened", type: "text" },
          { key: "witness_names", label: "Witnesses", type: "text" },
          { key: "work_being_performed", label: "What Was Being Done", type: "text" },
          { key: "sequence_of_events", label: "Sequence of Events", type: "textarea", rows: 4, required: true },
        ],
      },
      {
        title: "Medical Follow-Up",
        fields: [
          {
            key: "doctor_visited",
            label: "Doctor / Clinic Visited",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "provider_name", label: "Provider Name", type: "text" },
          { key: "provider_phone", label: "Provider Phone", type: "tel" },
          {
            key: "prior_injury",
            label: "Prior Similar Injury",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          { key: "supervisor_notified", label: "Supervisor Notified By", type: "text" },
        ],
      },
    ],
  },
  {
    id: "gm_accident_investigation",
    caseType: "gm_accident_investigation",
    title: "General Manager's Accident Investigation Form",
    shortLabel: "GM Investigation",
    pageRange: "71-72",
    description: "Management investigation for workplace accidents with root cause and corrective action.",
    sections: [
      {
        title: "Investigation Summary",
        fields: [
          { key: "injured_person_name", label: "Injured Person", type: "text", required: true },
          { key: "birth_date", label: "Date of Birth", type: "date" },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "address", label: "Address", type: "text" },
          {
            key: "sex",
            label: "Sex",
            type: "select",
            options: [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "unknown", label: "Unknown" },
            ],
          },
          { key: "body_part_affected", label: "Body Part Affected", type: "text" },
          { key: "nature_of_injury", label: "Nature of Injury", type: "text" },
          { key: "incident_date", label: "Incident Date", type: "date", required: true },
          { key: "incident_time", label: "Incident Time", type: "time" },
          { key: "incident_location", label: "Incident Location", type: "text" },
          { key: "witness_names", label: "Witnesses", type: "text" },
          { key: "equipment_tools", label: "Equipment / Tools Involved", type: "text" },
          { key: "how_it_happened", label: "How It Happened", type: "textarea", rows: 4, required: true },
          { key: "root_cause", label: "Root Cause", type: "textarea", rows: 3 },
          { key: "safety_rule_involved", label: "Safety Rule / Procedure Involved", type: "textarea", rows: 3 },
          { key: "doctor_hospital", label: "Doctor / Hospital", type: "text" },
          { key: "preventive_action", label: "Preventive Action", type: "textarea", rows: 3 },
          { key: "gm_name", label: "GM / Investigator", type: "text" },
        ],
      },
    ],
  },
  {
    id: "incident_investigation_report",
    caseType: "incident_investigation",
    title: "Incident Investigation Report",
    shortLabel: "Investigation Report",
    pageRange: "72-74",
    description: "Full incident investigation form with witness, PPE, attachment, and corrective-action tracking.",
    sections: [
      {
        title: "Incident Profile",
        fields: [
          {
            key: "incident_type",
            label: "Incident Type",
            type: "select",
            required: true,
            options: CLIENT_CASE_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
          },
          { key: "reporter_role", label: "Reporter Role", type: "text" },
          { key: "injured_employee_name", label: "Injured Employee / Subject", type: "text", required: true },
          { key: "department", label: "Department", type: "text" },
          { key: "job_title", label: "Job Title", type: "text" },
          { key: "body_area", label: "Body Area", type: "text" },
          { key: "injury_nature", label: "Nature of Injury", type: "text" },
          {
            key: "work_status",
            label: "Work Status",
            type: "select",
            options: [
              { value: "working", label: "Still Working" },
              { value: "restricted", label: "Restricted Duty" },
              { value: "sent_home", label: "Sent Home" },
              { value: "medical_only", label: "Medical Only" },
            ],
          },
          { key: "incident_date", label: "Incident Date", type: "date", required: true },
          { key: "incident_time", label: "Incident Time", type: "time" },
          { key: "incident_location", label: "Incident Location", type: "text" },
          {
            key: "workday_phase",
            label: "Workday Phase",
            type: "select",
            options: [
              { value: "opening", label: "Opening" },
              { value: "midday", label: "Midday" },
              { value: "closing", label: "Closing" },
              { value: "off_hours", label: "Off Hours" },
            ],
          },
        ],
      },
      {
        title: "Witness and Corrective Action",
        fields: [
          { key: "witness_names", label: "Witnesses", type: "text" },
          { key: "attachments_summary", label: "Attachments / Photos", type: "textarea", rows: 2 },
          {
            key: "ppe_in_use",
            label: "PPE In Use",
            type: "select",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "not_applicable", label: "Not Applicable" },
            ],
          },
          { key: "step_by_step_narrative", label: "Step-by-Step Narrative", type: "textarea", rows: 5, required: true },
          { key: "prevention_ideas", label: "Prevention Ideas", type: "textarea", rows: 3 },
          { key: "corrective_actions", label: "Corrective Actions", type: "textarea", rows: 4 },
          { key: "written_by", label: "Written By", type: "text" },
          { key: "reviewed_by", label: "Reviewed By", type: "text" },
        ],
      },
    ],
  },
];

const CASE_TYPE_LABELS = Object.fromEntries(
  CLIENT_CASE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

const CASE_STATUS_LABELS = Object.fromEntries(
  CLIENT_CASE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

function toDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeReservationDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return toDateOnly(value);
}

function getReservationStart(reservation) {
  return normalizeReservationDate(reservation?.scheduledCheckIn || reservation?.checkIn);
}

function getReservationEnd(reservation) {
  return normalizeReservationDate(
    reservation?.scheduledCheckOut
      || reservation?.checkOut
      || reservation?.scheduledCheckIn
      || reservation?.checkIn,
  );
}

function shouldCountReservation(reservation) {
  const type = String(reservation?.type || "").toLowerCase();
  return Boolean(type) && type !== "tour" && type !== "grooming" && reservation?.status !== "cancelled";
}

export function getClientCaseTypeLabel(value) {
  return CASE_TYPE_LABELS[value] || value || "Incident";
}

export function getClientCaseStatusLabel(value) {
  return CASE_STATUS_LABELS[value] || value || "Open";
}

export function getIncidentCategoryLabel(value) {
  const match = INCIDENT_CATEGORY_OPTIONS.find((option) => option.value === value);
  return match?.label || value || "General Incident";
}

export function buildIncidentCaseCode(caseRow) {
  const dateText = String(caseRow?.incident_date || caseRow?.created_at || "").slice(0, 10).replace(/-/g, "");
  const idText = String(caseRow?.id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  return `RB-${dateText || "CASE"}-${idText || "NEW"}`;
}

export function getIncidentTemplateById(templateId) {
  return RED_BINDER_FORM_LIBRARY.find((template) => template.id === templateId) || null;
}

export function buildDefaultIncidentPayload(template) {
  const payload = {};
  (template?.sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => {
      payload[field.key] = "";
    });
  });
  return payload;
}

export function computeDogDaysLast30(reservations = [], asOf = new Date()) {
  const end = new Date(asOf);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime() - (29 * 24 * 60 * 60 * 1000));
  const startKey = formatDateKey(start);
  const endKey = formatDateKey(end);

  return reservations.reduce((sum, reservation) => {
    if (!shouldCountReservation(reservation)) return sum;
    const reservationStart = getReservationStart(reservation);
    const reservationEnd = getReservationEnd(reservation);
    if (!reservationStart || !reservationEnd) return sum;

    const clampedStart = formatDateKey(reservationStart > start ? reservationStart : start);
    const clampedEnd = formatDateKey(reservationEnd < end ? reservationEnd : end);
    if (clampedStart > endKey || clampedEnd < startKey || clampedStart > clampedEnd) return sum;

    const left = toDateOnly(clampedStart);
    const right = toDateOnly(clampedEnd);
    if (!left || !right) return sum;
    const days = Math.floor((right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return sum + Math.max(days, 0);
  }, 0);
}

export function buildClientIncidentMetrics({ cases = [], documents = [], reservations = [], asOf = new Date() }) {
  const windowStart = new Date(asOf.getTime() - THIRTY_DAYS_MS);
  const recentCases = cases.filter((caseRow) => {
    const incidentDate = toDateOnly(caseRow?.incident_date);
    return incidentDate && incidentDate >= windowStart;
  });
  const openCases = cases.filter((caseRow) => caseRow?.status !== "closed");
  const seriousCases30d = recentCases.filter((caseRow) => (
    String(caseRow?.case_type || "") === "serious_animal_event"
    || String(caseRow?.metadata?.incident_category || "") === "dog_death"
  ));
  const dogDays30 = computeDogDaysLast30(reservations, asOf);
  const incidentRatePer100DogDays = dogDays30
    ? Number(((recentCases.length / dogDays30) * 100).toFixed(2))
    : 0;

  return {
    totalCases: cases.length,
    openCaseCount: openCases.length,
    caseCount30d: recentCases.length,
    criticalCaseCount30d: seriousCases30d.length,
    seriousCaseCount30d: seriousCases30d.length,
    documentationCount: documents.length,
    dogDays30,
    incidentRatePer100DogDays,
  };
}

// ─── Incident rate by reporting period ──────────────────────────────────────
// The headline metric is "incidents per active dog" over a standard reporting
// window. The denominator is the population at risk during the window — the
// unique dogs that actually had a stay overlapping it — not every dog on file.
// Periods follow standard business/operational reporting cadence:
//   MTD / QTD / YTD (period-to-date), Trailing 12 Months (always a full year,
//   the standard for rate normalization), Last Full Year (prior calendar year)
//   and All Time. Rates are normalized per 1,000 dogs.

export const INCIDENT_REPORTING_PERIODS = [
  { id: "mtd", label: "MTD", description: "Month to date" },
  { id: "qtd", label: "QTD", description: "Quarter to date" },
  { id: "ytd", label: "YTD", description: "Year to date" },
  { id: "ttm", label: "Trailing 12 Mo", description: "Trailing twelve months" },
  { id: "last_year", label: "Last Full Year", description: "Previous calendar year" },
  { id: "all", label: "All Time", description: "All recorded incidents" },
];

function atNoon(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function getIncidentReportingPeriodRange(periodId, asOf = new Date()) {
  const base = asOf instanceof Date ? asOf : new Date(asOf);
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const today = atNoon(year, month, day);
  switch (periodId) {
    case "mtd":
      return { start: atNoon(year, month, 1), end: today };
    case "qtd":
      return { start: atNoon(year, Math.floor(month / 3) * 3, 1), end: today };
    case "ytd":
      return { start: atNoon(year, 0, 1), end: today };
    case "ttm":
      // Trailing twelve months: the full 12-month window ending today.
      return { start: atNoon(year - 1, month, day), end: today };
    case "last_year":
      return { start: atNoon(year - 1, 0, 1), end: atNoon(year - 1, 11, 31) };
    case "all":
    default:
      return { start: null, end: null };
  }
}

// Unique dogs whose countable stay overlaps [start, end] (null bound = open).
export function countActiveDogsInRange(reservations = [], start = null, end = null) {
  const dogs = new Set();
  for (const reservation of reservations) {
    if (!shouldCountReservation(reservation)) continue;
    const dogId = reservation?.dogId ?? reservation?.dog_id;
    if (dogId === null || dogId === undefined || dogId === "") continue;
    const reservationStart = getReservationStart(reservation);
    if (!reservationStart) continue;
    const reservationEnd = getReservationEnd(reservation) || reservationStart;
    if (end && reservationStart > end) continue; // begins after the window
    if (start && reservationEnd < start) continue; // ends before the window
    dogs.add(String(dogId));
  }
  return dogs.size;
}

// Incidents whose incident_date falls within [start, end] (null bound = open).
export function countIncidentsInRange(cases = [], start = null, end = null) {
  let count = 0;
  for (const caseRow of cases) {
    const incidentDate = toDateOnly(caseRow?.incident_date);
    if (!incidentDate) continue;
    if (start && incidentDate < start) continue;
    if (end && incidentDate > end) continue;
    count += 1;
  }
  return count;
}

export function buildIncidentRateForPeriod({ cases = [], reservations = [], periodId = "ytd", asOf = new Date() }) {
  const { start, end } = getIncidentReportingPeriodRange(periodId, asOf);
  const incidents = countIncidentsInRange(cases, start, end);
  const activeDogs = countActiveDogsInRange(reservations, start, end);
  const ratePerDog = activeDogs > 0 ? incidents / activeDogs : null;
  return {
    periodId,
    start,
    end,
    incidents,
    activeDogs,
    ratePerDog,
    ratePer1000: ratePerDog === null ? null : ratePerDog * 1000,
    ratePercent: ratePerDog === null ? null : ratePerDog * 100,
  };
}

// ─── Incident follow-ups (first-class workflow) ─────────────────────────────
// A follow-up is a dated action an incident still needs (vet recheck, owner
// callback, corrective action). It lives in the first-class `follow_up_at` /
// `follow_up_completed_at` columns (see migration
// 20260530120000_incident_follow_up_first_class.sql), not buried in metadata.
//
// getIncidentFollowUpState derives the badge state for a row by comparing the
// due date to "today" using date-only, local-noon math (so time-of-day and DST
// never flip a day). `tone` is a semantic key the UI maps to colors:
//   "done"     — completed, no longer actionable
//   "overdue"  — due before today and not completed
//   "today"    — due today and not completed
//   "upcoming" — due in the future and not completed

export function getIncidentFollowUpState(caseRow, asOf = new Date()) {
  const due = toDateOnly(caseRow?.follow_up_at);
  if (!due) return { has: false, tone: "none", due: null, dueKey: null, completed: false, overdue: false, dueToday: false, upcoming: false };

  const completed = Boolean(caseRow?.follow_up_completed_at);
  const base = asOf instanceof Date ? asOf : new Date(asOf);
  const today = atNoon(base.getFullYear(), base.getMonth(), base.getDate());
  const dueKey = formatDateKey(due);
  const todayKey = formatDateKey(today);

  const overdue = !completed && dueKey < todayKey;
  const dueToday = !completed && dueKey === todayKey;
  const upcoming = !completed && dueKey > todayKey;
  const tone = completed ? "done" : overdue ? "overdue" : dueToday ? "today" : "upcoming";

  return { has: true, tone, due, dueKey, completed, overdue, dueToday, upcoming };
}

// Count incidents with an actionable follow-up: scheduled, not yet completed,
// and due today or earlier. This is the "Needs follow-up" badge/filter count.
export function countOpenFollowUps(cases = [], asOf = new Date()) {
  return cases.reduce((total, caseRow) => {
    const state = getIncidentFollowUpState(caseRow, asOf);
    return total + (state.has && (state.overdue || state.dueToday) ? 1 : 0);
  }, 0);
}
