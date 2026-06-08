// K9 Operations — Training Module: module-scope table/filter constants extracted verbatim
// from TrainingPage.jsx (no behavior change). Pure data, no dependencies.

export const LABOR_PERFORMANCE_REVIEW_BASE_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "employee", label: "Employee" },
  { key: "position", label: "Position" },
  { key: "start_date", label: "Start Date" },
  { key: "compliance", label: "Review Status" },
  { key: "open_checkpoints", label: "Open Checkpoints" },
];

export const LABOR_ROSTER_FILTER_FIELDS = [
  { section: "Employee Info", key: "first_name", label: "First Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "last_name", label: "Last Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "email", label: "Email", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "phone", label: "Phone", type: "text", ops: ["contains", "equals", "empty", "notEmpty"] },
  { section: "Employment", key: "position", label: "Position", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employment", key: "commitment", label: "Commitment", type: "select", ops: ["is", "isNot"], options: ["Full-Time", "Part-Time", "Unassigned"] },
  { section: "Employment", key: "employment_status", label: "Employment Status", type: "select", ops: ["is", "isNot"], options: ["active", "inactive", "all"] },
  { section: "Employment", key: "start_date", label: "Start Date", type: "date", ops: ["after", "before", "inLastDays"] },
  { section: "Compliance", key: "training", label: "Training", type: "select", ops: ["is", "isNot"], options: ["Compliant", "In Progress", "Non-Compliant"] },
  { section: "Compliance", key: "performance_reviews", label: "Compliance", type: "select", ops: ["is", "isNot"], options: ["Compliant", "Non-compliant", "Needs setup"] },
];
