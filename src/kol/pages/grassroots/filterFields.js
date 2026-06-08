import {
  GRASSROOTS_STATUS_OPTIONS,
  GRASSROOTS_EVENT_TYPE_OPTIONS,
  GRASSROOTS_BUSINESS_CATEGORY_OPTIONS,
} from "../../grassrootsData";

export const BASE_FILTER_FIELDS = [
  { section: "Workflow", key: "is_active", label: "Tracking State", type: "select", ops: ["is", "isNot"], options: ["active", "inactive", "all"] },
  { section: "Workflow", key: "status", label: "Status", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_STATUS_OPTIONS.map((option) => option.value) },
  { section: "Workflow", key: "next_contact_date", label: "Next Date", type: "date", ops: ["overdue", "today", "thisWeek", "hasDate", "noDate", "after", "before", "inLastDays"] },
  { section: "Workflow", key: "activity_count", label: "Updates", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
  { section: "Record", key: "name", label: "Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Record", key: "address", label: "Address", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
];

export const CATEGORY_FILTER_FIELDS = {
  events: [
    { section: "Event", key: "event_start_date", label: "Date", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
    { section: "Event", key: "event_type", label: "Type", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_EVENT_TYPE_OPTIONS },
    { section: "Event", key: "leads_captured", label: "Leads Captured", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
  ],
  drops: [
    { section: "Drop", key: "business_category", label: "Category", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS },
    { section: "Drop", key: "address", label: "Address", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  corporatePartnerships: [
    { section: "Employees", key: "local_employees", label: "Local Employees", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
    { section: "Employees", key: "us_employees", label: "US Employees", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  apartments: [
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  petProfessionalPartnerships: [
    { section: "Business", key: "business_category", label: "Category", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS },
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
};

export function filterNeedsValue(op) {
  return !["empty", "notEmpty", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
}
