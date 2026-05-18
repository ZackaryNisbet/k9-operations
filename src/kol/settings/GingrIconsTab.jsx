import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";

const PLAY_ICON_CAPABILITY_KEYS = [
  "play.private_play",
  "play.large_daycare",
  "play.small_daycare",
  "play.evaluation",
];

const BATHING_ICON_CAPABILITY_KEYS = [
  "bathing.include",
  "bathing.type.standard",
  "bathing.type.premium",
  "bathing.type.medicated",
  "bathing.type.whitening",
  "bathing.type.shampoo_from_home",
  "bathing.type.hypoallergenic",
  "bathing.type.hypoallergenic_no_spray",
  "bathing.type.hypoallergenic_with_spray",
  "bathing.type.water_rinse",
  "bathing.type.fresh_n_clean",
  "bathing.modifier.no_dryer",
  "bathing.modifier.no_crate_dryer",
  "bathing.modifier.no_velocity_dryer",
  "bathing.modifier.towel_dry_only",
  "bathing.modifier.see_account_notes",
];

const RESERVATION_CATEGORY_WORKFLOW_KEYS = new Set([
  "bathing",
  "room_cleaning",
  "collar_prep",
  "roll_call",
  "feeding_meds",
  "lodging_transfers",
  "belongings",
]);

const ROOM_CLEANING_RUN_CAPABILITIES = [
  { value: "", label: "Ignore / unmapped" },
  { value: "room_cleaning.lodging_room", label: "Lodging room" },
  { value: "room_cleaning.private_play_room", label: "Private play room" },
  { value: "room_cleaning.isolation_room", label: "Isolation room" },
];

const WORKFLOW_COLUMNS = [
  {
    key: "bathing",
    label: "Bathing Report",
    short: "Bathing",
    iconCapabilityKey: null,
    serviceCapabilityKey: "bathing.include",
    legacyDisplayCapabilityKeys: [
      ...BATHING_ICON_CAPABILITY_KEYS,
      ...PLAY_ICON_CAPABILITY_KEYS,
    ],
    severity: "cosmetic",
    note: "Selected icons display on bathing rows and carry their Gingr comments into notes. Services/add-ons and stay logic decide who appears.",
  },
  {
    key: "private_play",
    label: "Private Play",
    short: "PP",
    iconCapabilityKey: "play.private_play",
    serviceCapabilityKey: "private_play.include",
    severity: "driver",
    note: "Icon choices can change which dogs appear on the private play list.",
  },
  {
    key: "room_cleaning",
    label: "Room Cleaning",
    short: "Rooms",
    serviceCapabilityKey: "room_cleaning.include",
    severity: "cosmetic",
    note: "Room cleaning is still driven by room and stay logic; icons are display context.",
  },
  {
    key: "shutouts",
    label: "Shutouts",
    short: "Shutouts",
    serviceCapabilityKey: "shutouts.include",
    severity: "cosmetic",
    note: "Display flag for shutout workflows.",
  },
  {
    key: "enrichment",
    label: "Enrichment",
    short: "Enrich.",
    serviceCapabilityKey: "enrichment.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "driver",
    note: "Services/add-ons drive enrichment report inclusion; play icons display playgroup context on the workflow rows.",
  },
  {
    key: "pamper",
    label: "Pamper Package",
    short: "Pamper",
    serviceCapabilityKey: "pamper.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "driver",
    note: "Services/add-ons and configured suite logic drive pamper inclusion; play icons display playgroup context on the workflow rows.",
  },
  {
    key: "collar_prep",
    label: "Collar Prep",
    short: "Collars",
    serviceCapabilityKey: "collar_prep.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "cosmetic",
    note: "Collar prep is category and play-icon driven; play icons are shown as operational context.",
  },
  {
    key: "roll_call",
    label: "Roll Call",
    short: "Roll Call",
    serviceCapabilityKey: "roll_call.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "cosmetic",
    note: "Roll call is category and room driven; play icons display as dog-level context.",
  },
  {
    key: "feeding_meds",
    label: "Feeding & Meds",
    short: "Feed/Meds",
    serviceCapabilityKey: "feeding_meds.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "cosmetic",
    note: "Feeding and medication tasks remain schedule-driven; play icons display as dog-level context.",
  },
  {
    key: "lodging_transfers",
    label: "Transfers",
    short: "Transfers",
    serviceCapabilityKey: "lodging_transfers.include",
    severity: "cosmetic",
    note: "Transfers remain room-change driven; icons are display context.",
  },
  {
    key: "gourmet_ice_cream",
    label: "Gourmet Ice Cream",
    short: "Ice Cream",
    serviceCapabilityKey: "gourmet_ice_cream.include",
    legacyDisplayCapabilityKeys: PLAY_ICON_CAPABILITY_KEYS,
    severity: "driver",
    note: "Services/add-ons drive ice cream inclusion; play icons display playgroup context on service rows.",
  },
  {
    key: "belongings",
    label: "Belongings",
    short: "Belong.",
    serviceCapabilityKey: "belongings.include",
    severity: "cosmetic",
    note: "Belongings remains departure/check-in form driven; icons are display context.",
  },
];

const WORKFLOW_SOURCE_INVENTORY = [
  {
    key: "gingr_reference_sync",
    label: "Gingr Reference Sync",
    roleIds: ["bootstrap", "onboarding"],
    route: "settings",
    dailyOpsId: "gingr_reference_sync_runs",
    completionKey: "v_gingr_initial_sync_status",
    configStatus: "covered",
    sources: ["Animal icons", "Reservation types", "Services/add-ons", "Runs/rooms", "Feeding and medication source data"],
    currentDefaults: ["full historical pull on initial sync", "reference refresh can be rerun from this page"],
    configCoverage: ["Summary tiles", "Initial sync status", "Refresh Gingr Data"],
  },
  {
    key: "reservation_categories",
    label: "Shared Reservation Categories",
    roleIds: ["reservation_categories"],
    route: "shared server dependency",
    dailyOpsId: "not a daily row",
    completionKey: "not applicable",
    configStatus: "covered",
    sources: ["Gingr reservation types"],
    currentDefaults: ["boarding", "day boarding", "daycare", "evaluation", "grooming", "tour", "other"],
    configCoverage: ["Reservation Types"],
  },
  {
    key: "playgroups",
    label: "Shared Playgroup Icons",
    roleIds: ["playgroups"],
    route: "shared server dependency",
    dailyOpsId: "v_dog_playgroups / v_dog_playgroup_icon_tags",
    completionKey: "not applicable",
    configStatus: "covered",
    sources: ["Gingr animal icons"],
    currentDefaults: ["private play", "large daycare", "small daycare", "evaluation"],
    configCoverage: ["Icon Matrix"],
  },
  {
    key: "room_occupancy",
    label: "Room Occupancy Source",
    roleIds: ["room_occupancy"],
    route: "shared server dependency",
    dailyOpsId: "ops_room_occupancy_${date}",
    completionKey: "not applicable",
    configStatus: "partial",
    sources: ["Gingr runs/rooms", "Room occupancy table", "Reservation categories"],
    currentDefaults: ["lodging-only categories", "room code extraction", "daycare/evaluation exclusion"],
    configCoverage: ["Runs / Rooms", "Reservation Types"],
  },
  {
    key: "bathing",
    label: "Bathing Report",
    roleIds: ["bathing"],
    route: "ops-bathing",
    dailyOpsId: "ops_bathing_${date}",
    completionKey: "ops_bathing_${date}",
    configStatus: "covered",
    sources: ["Bath services/add-ons", "Bath and play icons for display", "Boarding stay logic"],
    currentDefaults: ["service/add-on contains bath or groom", "bath icons display shampoo/modifier notes", "play icons display playgroup context"],
    configCoverage: ["Services/Add-ons", "Icon Matrix", "Reservation Types"],
  },
  {
    key: "private_play",
    label: "Private Play",
    roleIds: ["pp", "private_play"],
    route: "ops-pp",
    dailyOpsId: "ops_pp_${date}",
    completionKey: "ops_pp_${date}",
    configStatus: "covered",
    sources: ["Private Play icon", "Private Play / play-time services", "Day boarding / reservation type rules"],
    currentDefaults: ["icon capability play.private_play", "service/add-on contains private play or play time", "default required sessions = 3"],
    configCoverage: ["Icon Matrix", "Services/Add-ons", "Reservation Types", "PP sessions"],
  },
  {
    key: "room_cleaning",
    label: "Room Cleaning & Setups",
    roleIds: ["room_cleaning"],
    route: "ops-rooms",
    dailyOpsId: "ops_room_cleaning_${date}",
    completionKey: "task ids in ops_room_cleaning_${date}",
    configStatus: "covered",
    sources: ["Gingr runs/rooms", "Room occupancy", "Boarding arrival/departure dates"],
    currentDefaults: ["run.is_private_play", "run.is_isolation", "otherwise lodging room", "refresh/full disinfect/setup business rules stay server-side"],
    configCoverage: ["Runs / Rooms", "Reservation Types"],
  },
  {
    key: "enrichment",
    label: "Enrichment",
    roleIds: ["enrichment"],
    route: "ops-svc",
    dailyOpsId: "ops_svc_${date}",
    completionKey: "ops_svc_Enrichment_${date}",
    configStatus: "covered",
    sources: ["Enrichment services/add-ons", "Play icons for display"],
    currentDefaults: ["service/add-on contains enrichment", "play icons display playgroup context"],
    configCoverage: ["Services/Add-ons", "Icon Matrix", "Reservation Types"],
  },
  {
    key: "pamper",
    label: "Pamper Package",
    roleIds: ["pamper"],
    route: "ops-pamper",
    dailyOpsId: "ops_pamper_${date}",
    completionKey: "ops_pamper_${date}",
    configStatus: "covered",
    sources: ["Pamper services/add-ons", "Luxury Suite reservation types", "Play icons for display"],
    currentDefaults: ["service/add-on contains pamper", "reservation type contains luxury suite"],
    configCoverage: ["Services/Add-ons", "Reservation Types", "Icon Matrix"],
  },
  {
    key: "collar_prep",
    label: "Next Day Collars",
    roleIds: ["collars", "collar_prep"],
    route: "ops-collars",
    dailyOpsId: "ops_collars_${tomorrow}",
    completionKey: "ops_collars_completions_${tomorrow}",
    configStatus: "partial",
    sources: ["Next-day reservations", "Play icons", "Collar color rules"],
    currentDefaults: ["small/large/private/evaluation play parsing", "pink/red/green/blue/yellow/half-and-half collar buckets"],
    configCoverage: ["Icon Matrix now covers play icons", "Collar color policy still needs runtime config"],
  },
  {
    key: "roll_call_opening",
    label: "Opening Roll Call",
    roleIds: ["roll_call_opening"],
    route: "ops-roll-call-opening",
    dailyOpsId: "ops_roll_call_opening_${date}",
    completionKey: "room/reservation row completions",
    configStatus: "partial",
    sources: ["Current in-resort dogs", "Reservation categories", "Room/area order", "Play icons for display"],
    currentDefaults: ["area order and boarding classification are code-defined"],
    configCoverage: ["Reservation Types", "Icon Matrix", "Runs / Rooms visible; area ordering still needs runtime config"],
  },
  {
    key: "roll_call_closing",
    label: "Closing Roll Call",
    roleIds: ["roll_call_closing", "roll_call"],
    route: "ops-roll-call-closing",
    dailyOpsId: "ops_roll_call_closing_${date}",
    completionKey: "room/reservation row completions",
    configStatus: "partial",
    sources: ["Current in-resort dogs", "Reservation categories", "Room/area order", "Play icons for display"],
    currentDefaults: ["closing roll call shares the same area and category assumptions"],
    configCoverage: ["Reservation Types", "Icon Matrix", "Runs / Rooms visible; area ordering still needs runtime config"],
  },
  {
    key: "feeding_meds_am",
    label: "AM Feeding & Meds",
    roleIds: ["feeding_meds_am"],
    route: "ops-feeding-meds-am",
    dailyOpsId: "ops_feeding_meds_am_${date}",
    completionKey: "instruction item ids",
    configStatus: "partial",
    sources: ["Feeding schedules", "Medication schedules", "Reservation status", "Play icons for display"],
    currentDefaults: ["AM aliases include morning/breakfast and early hour matches", "BID/TID schedule handling is code-defined"],
    configCoverage: ["Icon Matrix; care schedule aliases still need runtime config"],
  },
  {
    key: "feeding_meds_midday",
    label: "Midday Feeding & Meds",
    roleIds: ["feeding_meds_midday"],
    route: "ops-feeding-meds-midday",
    dailyOpsId: "ops_feeding_meds_midday_${date}",
    completionKey: "instruction item ids",
    configStatus: "partial",
    sources: ["Feeding schedules", "Medication schedules", "Reservation status", "Play icons for display"],
    currentDefaults: ["midday aliases include noon and 12", "BID/TID schedule handling is code-defined"],
    configCoverage: ["Icon Matrix; care schedule aliases still need runtime config"],
  },
  {
    key: "feeding_meds_pm",
    label: "PM Feeding & Meds",
    roleIds: ["feeding_meds_pm"],
    route: "ops-feeding-meds-pm",
    dailyOpsId: "ops_feeding_meds_pm_${date}",
    completionKey: "instruction item ids",
    configStatus: "partial",
    sources: ["Feeding schedules", "Medication schedules", "Reservation status", "Play icons for display"],
    currentDefaults: ["PM aliases include evening/dinner and 17/18/19", "BID/TID schedule handling is code-defined"],
    configCoverage: ["Icon Matrix; care schedule aliases still need runtime config"],
  },
  {
    key: "feeding_report",
    label: "Feeding Report",
    roleIds: ["feeding_report"],
    route: "ops-feeding-report",
    dailyOpsId: "ops_feeding_report_${date}",
    completionKey: "row ids with outcome",
    configStatus: "partial",
    sources: ["Feeding schedules", "Overnight boarding category", "Reservation status"],
    currentDefaults: ["overnight boarding is text/category classified"],
    configCoverage: ["Reservation Types; care report filters still need runtime config"],
  },
  {
    key: "medication_report",
    label: "Medication Report",
    roleIds: ["meds", "medication_report"],
    route: "ops-medication-report",
    dailyOpsId: "ops_medication_report_${date}",
    completionKey: "row ids with decision/outcome",
    configStatus: "partial",
    sources: ["Medication schedules", "Reservation status"],
    currentDefaults: ["web/mobile ids currently alias meds to medication_report"],
    configCoverage: ["care schedule aliases still need runtime config"],
  },
  {
    key: "lodging_transfer",
    label: "Lodging Transfers",
    roleIds: ["lodging_transfer", "lodging_transfers"],
    route: "ops-lodging-transfers",
    dailyOpsId: "ops_lodging_transfer_${date}",
    completionKey: "ops_lodging_transfer_completions_${date}",
    configStatus: "partial",
    sources: ["Gingr lodging transfer report", "Room assignment changes", "Current occupancy fallback"],
    currentDefaults: ["move belongings / update collar / clean old room / setup new room action taxonomy is code-defined"],
    configCoverage: ["Runs / Rooms visible; action taxonomy still needs runtime config"],
  },
  {
    key: "gourmet_ice_cream",
    label: "Gourmet Ice Cream",
    roleIds: ["ice_cream", "gourmet_ice_cream"],
    route: "eod",
    dailyOpsId: "ops_svc_${date}",
    completionKey: "ops_svc_Ice_Cream_${date}",
    configStatus: "covered",
    sources: ["Ice cream / gourmet services", "Play icons for display"],
    currentDefaults: ["service/add-on contains ice cream or gourmet"],
    configCoverage: ["Services/Add-ons", "Icon Matrix"],
  },
  {
    key: "belongings",
    label: "Belongings",
    roleIds: ["belongings"],
    route: "ops-belongings",
    dailyOpsId: "ops_belongings_${tomorrow}",
    completionKey: "ops_belongings_completions_${tomorrow}",
    configStatus: "partial",
    sources: ["Departing reservations", "Gingr belongings fields/forms"],
    currentDefaults: ["tomorrow departure window", "row key g${reservationGingrId}"],
    configCoverage: ["Reservation Types; departure field/window rules still need runtime config"],
  },
  {
    key: "shutouts",
    label: "Shutouts",
    roleIds: ["shutouts"],
    route: "",
    dailyOpsId: "No current runtime row found",
    completionKey: "No current completion source found",
    configStatus: "gap",
    sources: ["Requested workflow, but no current report code path was found in this repo"],
    currentDefaults: ["none found"],
    configCoverage: ["Column is reserved so icons/services can be paired when the runtime exists"],
  },
  {
    key: "scheduling_capacity",
    label: "Staffing Capacity",
    roleIds: ["scheduling_capacity"],
    route: "scheduling",
    dailyOpsId: "scheduling projection snapshots",
    completionKey: "not applicable",
    configStatus: "partial",
    sources: ["Reservation types", "Playgroup icons", "Bath services", "Medication services", "Runs/rooms"],
    currentDefaults: ["reservation bucket names", "medication service keyword", "departure bath logic", "capacity factors"],
    configCoverage: ["Reservation Types", "Icon Matrix", "Services/Add-ons; staffing factors still live outside this screen"],
  },
  {
    key: "checkout_tv",
    label: "Checkout TV / Facility Presence",
    roleIds: ["checkout_tv", "facility_presence"],
    route: "checkout-tv",
    dailyOpsId: "facility_presence_current",
    completionKey: "not applicable",
    configStatus: "partial",
    sources: ["Checked-in reservations", "Room assignments", "Playgroup icons", "Presence sync settings"],
    currentDefaults: ["presence cadence and business-hour behavior", "boarding/daycare/evaluation/day-boarding sets", "playgroup priority"],
    configCoverage: ["Reservation Types", "Icon Matrix", "Runs / Rooms; sync settings remain separate"],
  },
  {
    key: "re_eval",
    label: "Re-eval / Evaluations",
    roleIds: ["re_eval", "evaluations"],
    route: "eod / re-eval",
    dailyOpsId: "ops_re_eval_${date}",
    completionKey: "row ids with decision",
    configStatus: "gap",
    sources: ["Reservation history", "Evaluation outcomes", "Bad-note flags"],
    currentDefaults: ["365-day default threshold", "183-day bad-note threshold"],
    configCoverage: ["Thresholds and flags should move to workflow settings"],
  },
  {
    key: "departing",
    label: "Departing",
    roleIds: ["departing"],
    route: "departing",
    dailyOpsId: "count-only / Gingr reservations",
    completionKey: "No completion state",
    configStatus: "gap",
    sources: ["Gingr departures", "Bath service badge"],
    currentDefaults: ["bath keyword", "legacy location fallback needs removal"],
    configCoverage: ["Should reuse Bathing service config"],
  },
  {
    key: "emergency_contacts",
    label: "Emergency Contacts",
    roleIds: ["emergency_contacts"],
    route: "settings / emergency-contacts",
    dailyOpsId: "No canonical lite_daily_ops row",
    completionKey: "localStorage on mobile today",
    configStatus: "gap",
    sources: ["Active reservations", "Owner contact cache"],
    currentDefaults: ["repeat verification interval and completion storage are not canonical"],
    configCoverage: ["Needs canonical completion source before config switchover"],
  },
  {
    key: "attendance",
    label: "Attendance",
    roleIds: ["attendance"],
    route: "attendance",
    dailyOpsId: "non-Gingr",
    completionKey: "non-Gingr",
    configStatus: "non_gingr",
    sources: ["Labor / attendance data"],
    currentDefaults: ["managed outside Gingr workflow pairing"],
    configCoverage: ["Role layout, not Gingr Configuration"],
  },
  {
    key: "weekly_inventory",
    label: "Weekly Inventory",
    roleIds: ["weekly_inventory"],
    route: "inventory",
    dailyOpsId: "non-Gingr",
    completionKey: "inventory workflow state",
    configStatus: "non_gingr",
    sources: ["Inventory catalog"],
    currentDefaults: ["managed outside Gingr workflow pairing"],
    configCoverage: ["Inventory settings, not Gingr Configuration"],
  },
  {
    key: "weekly_maintenance",
    label: "Weekly Maintenance",
    roleIds: ["weekly_maintenance"],
    route: "ops-weekly-maintenance",
    dailyOpsId: "ops_weekly_maintenance_${date}",
    completionKey: "maintenance task ids",
    configStatus: "non_gingr",
    sources: ["Maintenance templates"],
    currentDefaults: ["managed outside Gingr workflow pairing"],
    configCoverage: ["Resort upkeep / checklist config, not Gingr Configuration"],
  },
  {
    key: "training",
    label: "Labor / Training",
    roleIds: ["training"],
    route: "training",
    dailyOpsId: "non-Gingr",
    completionKey: "training records",
    configStatus: "non_gingr",
    sources: ["Labor training data"],
    currentDefaults: ["managed outside Gingr workflow pairing"],
    configCoverage: ["Training settings, not Gingr Configuration"],
  },
  {
    key: "vendor_log",
    label: "Vendor Log",
    roleIds: ["vendor_log"],
    route: "",
    dailyOpsId: "non-Gingr",
    completionKey: "non-Gingr",
    configStatus: "non_gingr",
    sources: ["Vendor / maintenance logging"],
    currentDefaults: ["managed outside Gingr workflow pairing"],
    configCoverage: ["Not a Gingr pairing workflow"],
  },
];

const WORKFLOW_COLUMN_WIDTH = 88;
const ICON_NUMBER_COLUMN_WIDTH = 54;
const ICON_NAME_COLUMN_WIDTH = 260;
const ICON_GROUP_COLUMN_WIDTH = 140;
const ICON_ASSIGNED_COLUMN_WIDTH = 96;
const WORKFLOW_LEAD_COLUMN_WIDTH = ICON_NUMBER_COLUMN_WIDTH + ICON_NAME_COLUMN_WIDTH + ICON_GROUP_COLUMN_WIDTH + ICON_ASSIGNED_COLUMN_WIDTH;
const WORKFLOW_TABLE_WIDTH = WORKFLOW_LEAD_COLUMN_WIDTH + (WORKFLOW_COLUMNS.length * WORKFLOW_COLUMN_WIDTH);

const RESERVATION_CATEGORY_OPTIONS = [
  { value: "", label: "Unmapped" },
  { value: "boarding", label: "Boarding / Lodging" },
  { value: "daycare", label: "Daycare" },
  { value: "day_boarding", label: "Day Boarding" },
  { value: "evaluation", label: "Evaluation" },
  { value: "grooming", label: "Grooming" },
  { value: "tour", label: "Tour" },
  { value: "other", label: "Other" },
];

const EMPTY_SECTIONS = {
  icons: true,
  services: true,
  reservations: true,
  rooms: true,
  workflows: true,
  review: true,
};

const DEFAULT_ICON_FILTERS = {
  group: "",
  assignedOperator: "",
  assignedValue: "",
  workflowKey: "",
  workflowState: "enabled",
};

const ASSIGNED_OPERATOR_OPTIONS = [
  { value: "", label: "Any assigned count" },
  { value: "over", label: "Over" },
  { value: "under", label: "Under" },
  { value: "equals", label: "Exactly" },
];

const WORKFLOW_STATE_OPTIONS = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Not enabled" },
];

const ICON_FILTER_FIELDS = [
  { key: "group", section: "Inventory", label: "Icon Group" },
  { key: "assigned", section: "Usage", label: "Assigned Count" },
  { key: "workflow", section: "Workflow", label: "Workflow Pairing" },
];

const ICON_FILTER_OP_LABELS = {
  is: "is",
  over: "over",
  under: "under",
  equals: "exactly",
  enabled: "enabled for",
  disabled: "not enabled for",
};

function getActiveIconFilterKeys(filters = {}) {
  return [
    filters.group ? "group" : "",
    filters.assignedOperator && filters.assignedValue !== "" ? "assigned" : "",
    filters.workflowKey ? "workflow" : "",
  ].filter(Boolean);
}

function buildCompleteIconFilters(filters = {}, keys = getActiveIconFilterKeys(filters)) {
  const selected = new Set(keys);
  const next = { ...DEFAULT_ICON_FILTERS };
  if (selected.has("group") && filters.group) {
    next.group = filters.group;
  }
  if (selected.has("assigned") && filters.assignedOperator && filters.assignedValue !== "") {
    next.assignedOperator = filters.assignedOperator;
    next.assignedValue = filters.assignedValue;
  }
  if (selected.has("workflow") && filters.workflowKey) {
    next.workflowKey = filters.workflowKey;
    next.workflowState = filters.workflowState || "enabled";
  }
  return next;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableLower(value) {
  return clean(value).toLowerCase();
}

function summarizeDataError(error) {
  if (!error) return "";
  return String(error.message || error.details || error.hint || "Request failed");
}

function getGingrSyncEntityErrors(data) {
  const results = data?.results || {};
  return Object.entries(results)
    .filter(([, value]) => value?.error)
    .map(([entity, value]) => `${entity}: ${value.error}`);
}

function sourceIdentity(prefix, id, label) {
  const cleanId = clean(id);
  if (cleanId) return `${prefix}:${cleanId}`;
  return `${prefix}_name:${clean(label).replace(/\s+/g, " ").toLowerCase()}`;
}

function sourceLabel(row, ...fields) {
  for (const field of fields) {
    const value = clean(row?.[field]);
    if (value) return value;
  }
  return "Unnamed";
}

function getRunLabel(row) {
  const runName = sourceLabel(row, "run_name", "gingr_run_id");
  const areaName = clean(row?.area_name);
  return areaName ? `${areaName} / ${runName}` : runName;
}

function getRunSourceKey(row) {
  return sourceIdentity("run", row?.gingr_run_id, getRunLabel(row));
}

function getInventoryKey(row) {
  return row.inventory_key || row.icon_identity_key || row.icon_template_id || row.current_title;
}

function getIconSourceKey(row) {
  const raw = row.icon_identity_key || row.inventory_key || row.icon_template_id || row.current_title;
  const cleaned = clean(raw);
  return cleaned.startsWith("icon:") ? cleaned : `icon:${cleaned}`;
}

function getIconSourceId(row) {
  return row.icon_template_id || row.icon_identity_key || row.inventory_key || null;
}

function getAssignedCount(row) {
  const count = Number(row?.active_assignment_count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function isBathingIconCapability(capabilityKey) {
  const key = clean(capabilityKey);
  return key === "bathing.include" || key.startsWith("bathing.type.") || key.startsWith("bathing.modifier.");
}

function getLegacyIconSourceKey(row) {
  const rawKey = row?.icon_identity_key || row?.inventory_key || row?.icon_template_id || row?.current_title;
  return rawKey ? `icon:${clean(rawKey)}` : "";
}

function workflowInheritsIconCapability(workflow, capabilityKey) {
  const key = clean(capabilityKey);
  return Array.isArray(workflow?.legacyDisplayCapabilityKeys) && workflow.legacyDisplayCapabilityKeys.includes(key);
}

function serviceInheritsWorkflow(row, workflow) {
  const label = stableLower(row?.label);
  if (!label || !workflow?.key) return false;
  if (workflow.key === "private_play") return label.includes("private play") || label.includes("play time");
  if (workflow.key === "bathing") return label.includes("bath") || label.includes("groom");
  if (workflow.key === "pamper") return label.includes("pamper");
  if (workflow.key === "enrichment") return label.includes("enrichment");
  if (workflow.key === "gourmet_ice_cream") return label.includes("ice cream") || label.includes("gourmet");
  return false;
}

function uniqueWorkflowRows(rows = []) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [
      row.source_type || "icon",
      row.source_identity_key || getLegacyIconSourceKey(row) || row.inventory_key || row.id,
      row.capability_key || row.current_label || row.current_title,
    ].join("::");
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function getSeverityStyle(severity) {
  if (severity === "driver") {
    return {
      label: "REPORT ENTRY",
      color: "#991B1B",
      bg: "#FEF2F2",
      border: "#FCA5A5",
    };
  }
  return {
    label: "DISPLAY",
    color: "#166534",
    bg: "#F0FDF4",
    border: "#BBF7D0",
  };
}

function CompactToggle({ active, disabled, saving, severity, onClick, title }) {
  const sev = getSeverityStyle(severity);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      style={{
        width: 32,
        height: 28,
        borderRadius: 7,
        border: `1.5px solid ${active ? sev.border : C.border}`,
        background: active ? sev.bg : C.surface,
        color: active ? sev.color : C.textMut,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 900,
        fontFamily: "inherit",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {saving ? "..." : active ? "ON" : ""}
    </button>
  );
}

function StaticWorkflowPill({ label, tone = "neutral", title }) {
  const styles = tone === "driver"
    ? { color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5" }
    : tone === "category"
      ? { color: C.textSec, bg: C.bg, border: C.border }
      : { color: C.textMut, bg: C.surface, border: C.borderLight };
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 32,
        height: 28,
        borderRadius: 7,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        fontSize: 9,
        fontWeight: 900,
        lineHeight: "10px",
      }}
    >
      {label}
    </span>
  );
}

function SectionShell({ title, eyebrow, count, open, onToggle, children }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: C.surface,
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>
            {eyebrow}
          </span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: C.text }}>{title}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 900, color: C.textSec, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 9px" }}>
              {count}
            </span>
          )}
          <span style={{ color: C.textMut, fontSize: 18, lineHeight: 1 }}>{open ? "-" : "+"}</span>
        </span>
      </button>
      {open && <div style={{ borderTop: `1px solid ${C.border}`, padding: 18 }}>{children}</div>}
    </Card>
  );
}

function SearchInput({ value, onChange }) {
  return (
    <input
      type="text"
      placeholder="Search icons by name, group, or ID..."
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: "100%",
        padding: "10px 13px",
        borderRadius: 8,
        border: `1.5px solid ${C.border}`,
        background: C.surface,
        color: C.text,
        fontSize: 13,
        fontFamily: "inherit",
        boxSizing: "border-box",
        outline: "none",
      }}
    />
  );
}

function SummaryTile({ label, value, tone = "default" }) {
  const color = tone === "warn" ? "#B45309" : tone === "driver" ? "#991B1B" : C.text;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "13px 14px", background: C.surface }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function ConfigStatusPill({ status }) {
  const labelMap = {
    covered: "Ready",
    partial: "Partial",
    gap: "Gap",
    non_gingr: "Not Gingr",
  };
  const styleMap = {
    covered: { color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
    partial: { color: "#92400E", bg: "#FFFBEB", border: "#FCD34D" },
    gap: { color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5" },
    non_gingr: { color: C.textSec, bg: C.bg, border: C.border },
  };
  const styles = styleMap[status] || styleMap.partial;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: `1px solid ${styles.border}`, background: styles.bg, color: styles.color, fontSize: 10, fontWeight: 900, padding: "4px 8px", whiteSpace: "nowrap" }}>
      {labelMap[status] || "Partial"}
    </span>
  );
}

function InlineTokenList({ values = [], empty = "None" }) {
  if (!values.length) return <span style={{ fontSize: 12, color: C.textMut }}>{empty}</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {values.map((value) => (
        <span key={value} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${C.border}`, background: C.bg, color: C.textSec, fontSize: 10.5, fontWeight: 800, lineHeight: "13px", padding: "4px 7px" }}>
          {value}
        </span>
      ))}
    </div>
  );
}

function sourceTypeLabel(sourceType) {
  if (sourceType === "service_addon") return "Add-on";
  if (sourceType === "reservation_type") return "Reservation type";
  if (sourceType === "run") return "Run";
  if (sourceType === "room") return "Room";
  if (sourceType === "icon") return "Icon";
  if (sourceType === "service") return "Service";
  return clean(sourceType).replaceAll("_", " ") || "Source";
}

function summarizeList(rows, emptyLabel) {
  if (!rows.length) {
    return <span style={{ fontSize: 12, color: C.textMut }}>{emptyLabel}</span>;
  }
  return rows.slice(0, 8).map((row) => (
    <span
      key={`${row.source_type || "icon"}:${row.source_identity_key || row.id}:${row.capability_key || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 800,
        color: C.textSec,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "5px 8px",
      }}
    >
      <span style={{ color: C.textMut }}>{sourceTypeLabel(row.source_type)}</span>
      <span>{row.current_label || row.source_label || row.current_title || row.source_identity_key || row.capability_key}</span>
    </span>
  )).concat(rows.length > 8 ? [
    <span key="more" style={{ fontSize: 11, fontWeight: 800, color: C.textMut, alignSelf: "center" }}>+{rows.length - 8} more</span>,
  ] : []);
}

export default function GingrIconsTab({ locationId: routedLocationId } = {}) {
  const { profile } = useAuth();
  const locationId = routedLocationId || profile?.location_id || "";
  const [inventory, setInventory] = useState([]);
  const [mappingStatusRows, setMappingStatusRows] = useState([]);
  const [workflowMappingRows, setWorkflowMappingRows] = useState([]);
  const [serviceRows, setServiceRows] = useState([]);
  const [addonRows, setAddonRows] = useState([]);
  const [reservationTypeRows, setReservationTypeRows] = useState([]);
  const [runRows, setRunRows] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [iconFilters, setIconFilters] = useState(DEFAULT_ICON_FILTERS);
  const [iconDraftFilters, setIconDraftFilters] = useState(DEFAULT_ICON_FILTERS);
  const [iconDraftFilterKeys, setIconDraftFilterKeys] = useState([]);
  const [iconFiltersOpen, setIconFiltersOpen] = useState(false);
  const [iconFilterPickerOpen, setIconFilterPickerOpen] = useState(false);
  const [iconFilterPickerReady, setIconFilterPickerReady] = useState(false);
  const [configuringIconFilterKey, setConfiguringIconFilterKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [workflowSavingKey, setWorkflowSavingKey] = useState("");
  const [requiredSessionsInput, setRequiredSessionsInput] = useState("3");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingReference, setRefreshingReference] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState(null);
  const [openSections, setOpenSections] = useState(EMPTY_SECTIONS);
  const prevIconFiltersOpen = useRef(false);

  const toggleSection = useCallback((key) => {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!locationId || locationId === "enterprise") {
      setInventory([]);
      setMappingStatusRows([]);
      setWorkflowMappingRows([]);
      setServiceRows([]);
      setAddonRows([]);
      setReservationTypeRows([]);
      setRunRows([]);
      setSyncStatus(null);
      setLoaded(true);
      setLoadError("Select a resort location before configuring Gingr workflow pairing.");
      return;
    }

    if (!background) setLoaded(false);
    setLoadError("");
    try {
      const [
        inventoryResult,
        mappingResult,
        workflowResult,
        settingsResult,
        servicesResult,
        addonsResult,
        reservationTypesResult,
        runsResult,
        syncResult,
      ] = await Promise.all([
        supabase
          .from("v_gingr_icon_inventory_current")
          .select("*")
          .eq("location_id", locationId)
          .order("icon_group")
          .order("current_title"),
        supabase
          .from("v_gingr_icon_mapping_status")
          .select("*")
          .eq("location_id", locationId)
          .order("capability_key")
          .order("current_title"),
        supabase
          .from("v_gingr_workflow_mapping_status")
          .select("*")
          .eq("location_id", locationId)
          .order("workflow_key")
          .order("capability_key"),
        supabase
          .from("gingr_workflow_settings")
          .select("id, workflow_key, label, settings, is_active")
          .eq("location_id", locationId)
          .eq("is_active", true)
          .order("workflow_key"),
        supabase
          .from("gingr_service_catalog")
          .select("id, service_id, service_name, source_key, reservation_type_name, synced_at")
          .eq("location_id", locationId)
          .order("service_name"),
        supabase
          .from("gingr_service_addon_catalog")
          .select("id, addon_id, addon_name, source_key, reservation_type_name, synced_at")
          .eq("location_id", locationId)
          .order("addon_name"),
        supabase
          .from("gingr_reservation_types")
          .select("id, gingr_id, name, type_label, synced_at")
          .eq("location_id", locationId)
          .order("type_label"),
        supabase
          .from("gingr_runs")
          .select("id, gingr_run_id, run_name, area_id, area_name, run_type, max_animals, max_weight, is_private_play, is_isolation, synced_at")
          .eq("location_id", locationId)
          .order("area_name")
          .order("run_name"),
        supabase
          .from("v_gingr_initial_sync_status")
          .select("*")
          .eq("location_id", locationId)
          .limit(1),
      ]);

      const requiredErrors = [
        ["Icon inventory", inventoryResult.error],
        ["Icon mapping status", mappingResult.error],
      ].filter(([, error]) => error);
      if (requiredErrors.length > 0) {
        throw new Error(requiredErrors.map(([label, error]) => `${label}: ${summarizeDataError(error)}`).join("; "));
      }

      const optionalErrors = [
        ["Workflow mappings", workflowResult.error],
        ["Workflow settings", settingsResult.error],
        ["Service catalog", servicesResult.error],
        ["Service add-ons", addonsResult.error],
        ["Reservation types", reservationTypesResult.error],
        ["Runs / rooms", runsResult.error],
        ["Initial sync status", syncResult.error],
      ].filter(([, error]) => error);
      if (optionalErrors.length > 0) {
        setLoadError(optionalErrors.map(([label, error]) => `${label}: ${summarizeDataError(error)}`).join("; "));
      }

      setInventory(inventoryResult.data || []);
      setMappingStatusRows(mappingResult.data || []);
      setWorkflowMappingRows(workflowResult.data || []);
      setServiceRows(servicesResult.data || []);
      setAddonRows(addonsResult.data || []);
      setReservationTypeRows(reservationTypesResult.data || []);
      setRunRows(runsResult.data || []);
      setSyncStatus(syncResult.data?.[0] || null);

      const privatePlaySettings = (settingsResult.data || []).find((row) => row.workflow_key === "private_play")?.settings || {};
      setRequiredSessionsInput(String(privatePlaySettings.required_sessions || 3));
    } catch (error) {
      setLoadError(summarizeDataError(error));
    } finally {
      setLoaded(true);
    }
  }, [locationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (iconFiltersOpen && !prevIconFiltersOpen.current) {
      setIconDraftFilters({ ...iconFilters });
      setIconDraftFilterKeys(getActiveIconFilterKeys(iconFilters));
      setIconFilterPickerOpen(false);
      setConfiguringIconFilterKey("");
    }
    prevIconFiltersOpen.current = iconFiltersOpen;
  }, [iconFilters, iconFiltersOpen]);

  const activeWorkflowMappingRows = useMemo(
    () => workflowMappingRows.filter((row) => row.is_active !== false && row.mapping_status !== "stale"),
    [workflowMappingRows],
  );

  const mappingsByInventory = useMemo(() => {
    const next = new Map();
    for (const row of mappingStatusRows) {
      const keys = [
        row.inventory_key,
        row.icon_template_id,
        row.icon_identity_key,
        row.icon_identity_key ? `icon:${row.icon_identity_key}` : "",
      ].filter(Boolean);
      for (const key of keys) {
        if (!next.has(key)) next.set(key, []);
        next.get(key).push(row);
      }
    }
    return next;
  }, [mappingStatusRows]);

  const workflowCapabilityMap = useMemo(() => {
    const map = new Map();
    for (const row of workflowMappingRows) {
      if (row.is_active === false || row.mapping_status === "stale") continue;
      const key = `${row.workflow_key}:${row.source_type}:${row.source_identity_key}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(row.capability_key);
    }
    return map;
  }, [workflowMappingRows]);

  const inactiveWorkflowCapabilitySet = useMemo(() => {
    const set = new Set();
    for (const row of workflowMappingRows) {
      if (row.is_active !== false) continue;
      set.add(`${row.workflow_key}:${row.source_type}:${row.source_identity_key}:${row.capability_key}`);
    }
    return set;
  }, [workflowMappingRows]);

  const iconWorkflowMap = useMemo(() => {
    const map = new Map();
    for (const row of workflowMappingRows) {
      if (row.source_type !== "icon" || !String(row.capability_key || "").endsWith(".display_icon")) continue;
      map.set(`${row.workflow_key}:${row.source_identity_key}`, row);
    }
    return map;
  }, [workflowMappingRows]);

  const getWorkflowCapabilities = useCallback((workflowKey, sourceType, sourceIdentityKey) => {
    return workflowCapabilityMap.get(`${workflowKey}:${sourceType}:${sourceIdentityKey}`) || new Set();
  }, [workflowCapabilityMap]);

  const hasInactiveWorkflowCapability = useCallback((workflowKey, sourceType, sourceIdentityKey, capabilityKey) => {
    return inactiveWorkflowCapabilitySet.has(`${workflowKey}:${sourceType}:${sourceIdentityKey}:${capabilityKey}`);
  }, [inactiveWorkflowCapabilitySet]);

  const getIconWorkflowActive = useCallback((row, workflow) => {
    const inventoryKey = getInventoryKey(row);
    const iconSourceKey = getIconSourceKey(row);
    const mappedRows = mappingsByInventory.get(inventoryKey)
      || mappingsByInventory.get(row.icon_identity_key)
      || mappingsByInventory.get(iconSourceKey)
      || [];
    const activeCapabilityKeys = new Set(
      mappedRows
        .filter((entry) => entry.mapping_status === "active")
        .map((entry) => entry.capability_key),
    );
    const workflowRow = iconWorkflowMap.get(`${workflow.key}:${iconSourceKey}`)
      || iconWorkflowMap.get(`${workflow.key}:${row.icon_identity_key}`);
    if (workflowRow) return workflowRow.is_active !== false && workflowRow.mapping_status !== "stale";
    if (workflow.iconCapabilityKey) return activeCapabilityKeys.has(workflow.iconCapabilityKey);
    return [...activeCapabilityKeys].some((capabilityKey) => workflowInheritsIconCapability(workflow, capabilityKey));
  }, [iconWorkflowMap, mappingsByInventory]);

  const serviceSourceRows = useMemo(() => [
    ...serviceRows.map((row) => ({
      kind: "service",
      sourceType: "service",
      sourceId: row.service_id || row.id,
      sourceKey: row.source_key || sourceIdentity("service", row.service_id, row.service_name),
      label: sourceLabel(row, "service_name"),
      context: row.reservation_type_name || "Any reservation type",
      syncedAt: row.synced_at,
    })),
    ...addonRows.map((row) => ({
      kind: "service_addon",
      sourceType: "service_addon",
      sourceId: row.addon_id || row.id,
      sourceKey: row.source_key || sourceIdentity("service_addon", row.addon_id, row.addon_name),
      label: sourceLabel(row, "addon_name"),
      context: row.reservation_type_name || "Service add-on",
      syncedAt: row.synced_at,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label)), [addonRows, serviceRows]);

  const roomRunRows = useMemo(() => [...runRows].sort((a, b) => {
    const areaSort = clean(a.area_name).localeCompare(clean(b.area_name));
    if (areaSort !== 0) return areaSort;
    return clean(a.run_name).localeCompare(clean(b.run_name));
  }), [runRows]);

  const classifiedRunCount = useMemo(() => {
    return roomRunRows.filter((row) => {
      const sourceKey = getRunSourceKey(row);
      const caps = getWorkflowCapabilities("room_cleaning", "run", sourceKey);
      return ROOM_CLEANING_RUN_CAPABILITIES.some((option) => option.value && caps.has(option.value));
    }).length;
  }, [getWorkflowCapabilities, roomRunRows]);

  const iconGroupOptions = useMemo(() => {
    const groups = [...new Set(inventory.map((row) => clean(row.icon_group) || "Other"))].sort((a, b) => a.localeCompare(b));
    return [
      { value: "", label: "All groups" },
      ...groups.map((group) => ({ value: group, label: group })),
    ];
  }, [inventory]);

  const workflowFilterOptions = useMemo(() => [
    { value: "", label: "Any report" },
    ...WORKFLOW_COLUMNS.map((workflow) => ({ value: workflow.key, label: workflow.label })),
  ], []);

  const iconAvailableFilterFields = useMemo(
    () => ICON_FILTER_FIELDS.filter((field) => !iconDraftFilterKeys.includes(field.key)),
    [iconDraftFilterKeys],
  );

  const iconFilterSections = useMemo(
    () => [...new Set(ICON_FILTER_FIELDS.map((field) => field.section))],
    [],
  );

  const getIconFilterField = useCallback(
    (key) => ICON_FILTER_FIELDS.find((field) => field.key === key) || null,
    [],
  );

  const updateIconDraftFilter = useCallback((patch) => {
    setIconDraftFilters((current) => ({ ...current, ...patch }));
  }, []);

  const selectIconFilterField = useCallback((key) => {
    const field = getIconFilterField(key);
    if (!field) return;
    setIconDraftFilterKeys((current) => (current.includes(key) ? current : [...current, key]));
    setConfiguringIconFilterKey(key);
    setIconFilterPickerOpen(false);
  }, [getIconFilterField]);

  const removeIconFilter = useCallback((key) => {
    setIconDraftFilterKeys((current) => current.filter((item) => item !== key));
    setIconDraftFilters((current) => {
      if (key === "group") return { ...current, group: "" };
      if (key === "assigned") return { ...current, assignedOperator: "", assignedValue: "" };
      if (key === "workflow") return { ...current, workflowKey: "", workflowState: "enabled" };
      return current;
    });
    if (configuringIconFilterKey === key) setConfiguringIconFilterKey("");
  }, [configuringIconFilterKey]);

  const clearIconFilters = useCallback(() => {
    setIconFilters(DEFAULT_ICON_FILTERS);
    setIconDraftFilters(DEFAULT_ICON_FILTERS);
    setIconDraftFilterKeys([]);
    setIconFilterPickerOpen(false);
    setConfiguringIconFilterKey("");
  }, []);

  const applyIconFilters = useCallback(() => {
    const completeFilters = buildCompleteIconFilters(iconDraftFilters, iconDraftFilterKeys);
    setIconFilters(completeFilters);
    setIconDraftFilters(completeFilters);
    setIconDraftFilterKeys(getActiveIconFilterKeys(completeFilters));
    setIconFiltersOpen(false);
    setIconFilterPickerOpen(false);
    setConfiguringIconFilterKey("");
  }, [iconDraftFilterKeys, iconDraftFilters]);

  const closeIconFilters = useCallback(() => {
    setIconFiltersOpen(false);
    setIconFilterPickerOpen(false);
    setConfiguringIconFilterKey("");
  }, []);

  const activeIconFilterCount = useMemo(() => {
    return getActiveIconFilterKeys(iconFilters).length;
  }, [iconFilters]);

  const filteredInventory = useMemo(() => {
    const needle = stableLower(search);
    const rows = [...inventory].sort((a, b) => {
      const groupSort = clean(a.icon_group).localeCompare(clean(b.icon_group));
      if (groupSort !== 0) return groupSort;
      return clean(a.current_title).localeCompare(clean(b.current_title));
    });
    return rows.filter((row) => {
      if (iconFilters.group && (clean(row.icon_group) || "Other") !== iconFilters.group) return false;

      if (iconFilters.assignedOperator && iconFilters.assignedValue !== "") {
        const count = getAssignedCount(row);
        const target = Number(iconFilters.assignedValue);
        if (Number.isFinite(target)) {
          if (iconFilters.assignedOperator === "over" && !(count > target)) return false;
          if (iconFilters.assignedOperator === "under" && !(count < target)) return false;
          if (iconFilters.assignedOperator === "equals" && count !== target) return false;
        }
      }

      if (iconFilters.workflowKey) {
        const workflow = WORKFLOW_COLUMNS.find((item) => item.key === iconFilters.workflowKey);
        if (workflow) {
          const active = getIconWorkflowActive(row, workflow);
          if (iconFilters.workflowState === "disabled" && active) return false;
          if (iconFilters.workflowState !== "disabled" && !active) return false;
        }
      }

      if (!needle) return true;
      const haystack = [
        row.icon_group,
        row.current_title,
        row.icon_template_id,
        row.icon_identity_key,
        row.inventory_key,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [getIconWorkflowActive, iconFilters, inventory, search]);

  const activeIconMappingCount = useMemo(
    () => mappingStatusRows.filter((row) => row.mapping_status === "active").length,
    [mappingStatusRows],
  );

  const staleMappings = useMemo(
    () => mappingStatusRows.filter((row) => row.mapping_status === "stale"),
    [mappingStatusRows],
  );

  const staleWorkflowMappings = useMemo(
    () => workflowMappingRows.filter((row) => row.mapping_status === "stale"),
    [workflowMappingRows],
  );

  const workflowReviewRows = useMemo(() => WORKFLOW_COLUMNS.map((workflow) => {
    const workflowRows = workflowMappingRows.filter((row) => row.workflow_key === workflow.key && row.is_active !== false);
    const activeRows = workflowRows.filter((row) => row.mapping_status !== "stale");
    const displayIconRows = activeRows.filter((row) => row.source_type === "icon");
    const explicitServiceRowsForWorkflow = activeRows.filter((row) => row.source_type === "service" || row.source_type === "service_addon");
    const reservationRowsForWorkflow = activeRows.filter((row) => row.source_type === "reservation_type");
    const runRowsForWorkflow = activeRows.filter((row) => row.source_type === "run" || row.source_type === "room");
    const inheritedServiceRows = serviceSourceRows
      .filter((row) => {
        const capability = workflow.serviceCapabilityKey || `${workflow.key}.include`;
        return serviceInheritsWorkflow(row, workflow)
          && !hasInactiveWorkflowCapability(workflow.key, row.sourceType, row.sourceKey, capability);
      })
      .map((row) => ({
        source_type: row.sourceType,
        source_identity_key: row.sourceKey,
        source_id: row.sourceId,
        source_label: row.label,
        current_label: row.label,
        capability_key: workflow.serviceCapabilityKey || `${workflow.key}.include`,
      }));
    const serviceRowsForWorkflow = uniqueWorkflowRows([...explicitServiceRowsForWorkflow, ...inheritedServiceRows]);
    const inactiveDisplayIconKeys = new Set(
      workflowMappingRows
        .filter((row) =>
          row.workflow_key === workflow.key
          && row.source_type === "icon"
          && row.capability_key === `${workflow.key}.display_icon`
          && row.is_active === false
        )
        .map((row) => row.source_identity_key),
    );
    const driverIconRows = workflow.iconCapabilityKey
      ? mappingStatusRows
          .filter((row) => row.mapping_status === "active" && row.capability_key === workflow.iconCapabilityKey)
          .map((row) => ({
            ...row,
            source_type: "icon",
            source_identity_key: row.icon_identity_key || row.inventory_key,
            current_label: row.current_title,
          }))
      : [];
    const inheritedDisplayRows = mappingStatusRows
      .filter((row) => {
        if (row.mapping_status !== "active" || !workflowInheritsIconCapability(workflow, row.capability_key)) return false;
        const sourceKey = getLegacyIconSourceKey(row);
        return sourceKey && !inactiveDisplayIconKeys.has(sourceKey);
      })
      .map((row) => ({
        ...row,
        source_type: "icon",
        source_identity_key: getLegacyIconSourceKey(row),
        current_label: row.current_title,
      }));

    const membershipRows = workflow.key === "private_play"
      ? [...driverIconRows, ...serviceRowsForWorkflow, ...reservationRowsForWorkflow]
      : workflow.key === "bathing"
        ? serviceRowsForWorkflow
        : workflow.key === "room_cleaning"
          ? runRowsForWorkflow
          : serviceRowsForWorkflow;

    const displayRows = workflow.key === "private_play"
      ? []
      : workflow.key === "bathing"
        ? uniqueWorkflowRows([...displayIconRows, ...inheritedDisplayRows])
        : uniqueWorkflowRows([...displayIconRows, ...inheritedDisplayRows]);

    return {
      ...workflow,
      membershipRows,
      displayRows,
      staleRows: workflowRows.filter((row) => row.mapping_status === "stale"),
    };
  }), [hasInactiveWorkflowCapability, mappingStatusRows, serviceSourceRows, workflowMappingRows]);

  const toggleIconCapability = useCallback(async (row, capabilityKey, enabled) => {
    const inventoryKey = getInventoryKey(row);
    const saveKey = `icon-cap:${inventoryKey}:${capabilityKey}`;
    setSavingKey(saveKey);
    setActionMessage(null);

    try {
      const result = enabled
        ? await supabase.from("gingr_icon_mappings").upsert({
            location_id: locationId,
            capability_key: capabilityKey,
            icon_template_id: row.icon_template_id || null,
            icon_identity_key: row.icon_identity_key,
            icon_group: row.icon_group,
            is_active: true,
          }, { onConflict: "location_id,capability_key,icon_identity_key" })
        : await supabase
            .from("gingr_icon_mappings")
            .update({ is_active: false })
            .eq("location_id", locationId)
            .eq("capability_key", capabilityKey)
            .eq("icon_identity_key", row.icon_identity_key);

      if (result.error) throw result.error;
      setActionMessage({
        type: "success",
        text: enabled ? "Icon pairing enabled." : "Icon pairing disabled.",
      });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setSavingKey("");
    }
  }, [loadData, locationId]);

  const toggleIconWorkflow = useCallback(async (row, workflow, enabled) => {
    if (workflow.iconCapabilityKey) {
      await toggleIconCapability(row, workflow.iconCapabilityKey, enabled);
      return;
    }

    const sourceKey = getIconSourceKey(row);
    const saveKey = `icon-workflow:${workflow.key}:${sourceKey}`;
    setSavingKey(saveKey);
    setActionMessage(null);
    try {
      const result = await supabase.from("gingr_workflow_mappings").upsert({
            location_id: locationId,
            workflow_key: workflow.key,
            source_type: "icon",
            source_id: getIconSourceId(row) ? String(getIconSourceId(row)) : null,
            source_identity_key: sourceKey,
            source_label: row.current_title || sourceKey,
            capability_key: `${workflow.key}.display_icon`,
            settings: {
              behavior: "cosmetic",
              configured_from: "gingr_configuration_matrix",
            },
            mapping_source: "manual",
            is_required: false,
            is_active: enabled,
          }, { onConflict: "location_id,workflow_key,source_type,source_identity_key,capability_key" });

      if (result.error) throw result.error;
      setActionMessage({ type: "success", text: enabled ? "Display pairing enabled." : "Display pairing disabled." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setSavingKey("");
    }
  }, [loadData, locationId, toggleIconCapability]);

  const setWorkflowCapability = useCallback(async ({
    workflowKey,
    sourceType,
    sourceId,
    sourceIdentityKey,
    sourceLabel: label,
    capabilityKey,
    enabled,
    settings = {},
    isRequired = false,
  }) => {
    const saveKey = `${workflowKey}:${sourceType}:${sourceIdentityKey}:${capabilityKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const result = enabled
        ? await supabase.from("gingr_workflow_mappings").upsert({
            location_id: locationId,
            workflow_key: workflowKey,
            source_type: sourceType,
            source_id: sourceId ? String(sourceId) : null,
            source_identity_key: sourceIdentityKey,
            source_label: label,
            capability_key: capabilityKey,
            settings,
            mapping_source: "manual",
            is_required: isRequired,
            is_active: true,
          }, { onConflict: "location_id,workflow_key,source_type,source_identity_key,capability_key" })
        : await supabase.from("gingr_workflow_mappings").upsert({
            location_id: locationId,
            workflow_key: workflowKey,
            source_type: sourceType,
            source_id: sourceId ? String(sourceId) : null,
            source_identity_key: sourceIdentityKey,
            source_label: label,
            capability_key: capabilityKey,
            settings,
            mapping_source: "manual",
            is_required: isRequired,
            is_active: false,
          }, { onConflict: "location_id,workflow_key,source_type,source_identity_key,capability_key" });

      if (result.error) throw result.error;
      setActionMessage({ type: "success", text: enabled ? "Workflow pairing enabled." : "Workflow pairing disabled." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const setReservationCategory = useCallback(async (row, categoryKey) => {
    const label = sourceLabel(row, "type_label", "name", "gingr_id");
    const sourceKey = sourceIdentity("reservation_type", row.gingr_id, label);
    const saveKey = `category:${sourceKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const { error } = await supabase.rpc("replace_gingr_workflow_mapping", {
        p_location_id: locationId,
        p_workflow_key: "reservation_categories",
        p_source_type: "reservation_type",
        p_source_identity_key: sourceKey,
        p_source_id: row.gingr_id ? String(row.gingr_id) : null,
        p_source_label: label,
        p_capability_key: categoryKey ? `reservation.category.${categoryKey}` : null,
        p_capability_group_prefix: "reservation.category.",
        p_capability_keys: null,
        p_settings: { configured_from: "gingr_configuration_matrix" },
        p_is_required: true,
      });
      if (error) throw error;
      setActionMessage({ type: "success", text: "Reservation category saved." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const setRunClassification = useCallback(async (row, capabilityKey) => {
    const label = getRunLabel(row);
    const sourceKey = getRunSourceKey(row);
    const saveKey = `run-classification:${sourceKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const { error } = await supabase.rpc("replace_gingr_workflow_mapping", {
        p_location_id: locationId,
        p_workflow_key: "room_cleaning",
        p_source_type: "run",
        p_source_identity_key: sourceKey,
        p_source_id: row.gingr_run_id ? String(row.gingr_run_id) : null,
        p_source_label: label,
        p_capability_key: capabilityKey || null,
        p_capability_group_prefix: "room_cleaning.",
        p_capability_keys: null,
        p_settings: {
          configured_from: "gingr_configuration_matrix",
          area_id: row.area_id || null,
          area_name: row.area_name || null,
          run_type: row.run_type || null,
        },
        p_is_required: true,
      });
      if (error) throw error;
      setActionMessage({ type: "success", text: capabilityKey ? "Room classification saved." : "Room classification cleared." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const saveRequiredSessions = useCallback(async () => {
    const requiredSessions = Number(requiredSessionsInput);
    if (!Number.isFinite(requiredSessions) || requiredSessions < 1) {
      setActionMessage({ type: "error", text: "Private play sessions must be at least 1." });
      return;
    }
    setWorkflowSavingKey("private_play:required_sessions");
    setActionMessage(null);
    try {
      const { error } = await supabase.from("gingr_workflow_settings").upsert({
        location_id: locationId,
        workflow_key: "private_play",
        label: "Private Play",
        settings: { required_sessions: requiredSessions },
        is_active: true,
      }, { onConflict: "location_id,workflow_key" });
      if (error) throw error;
      setActionMessage({ type: "success", text: "Private play session count saved." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId, requiredSessionsInput]);

  const refreshIcons = useCallback(async () => {
    setRefreshing(true);
    setActionMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: locationId,
          sync_type: "full",
          entities: ["animal_icons_all"],
        },
      });
      if (error) throw error;
      const entityErrors = getGingrSyncEntityErrors(data);
      if (entityErrors.length > 0) throw new Error(entityErrors.join("; "));
      setActionMessage({ type: "success", text: "Icon refresh complete." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setRefreshing(false);
    }
  }, [loadData, locationId]);

  const refreshReferenceData = useCallback(async () => {
    const confirmed = window.confirm("Refresh Gingr reference data for this location?");
    if (!confirmed) return;

    setRefreshingReference(true);
    setActionMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: locationId,
          sync_type: "full",
          entities: ["reservation_types", "services", "runs_and_occupancy", "animal_icons_all"],
        },
      });
      if (error) throw error;
      const entityErrors = getGingrSyncEntityErrors(data);
      if (entityErrors.length > 0) throw new Error(entityErrors.join("; "));
      setActionMessage({ type: "success", text: "Reference refresh complete." });
      await loadData({ background: true });
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeDataError(error) });
    } finally {
      setRefreshingReference(false);
    }
  }, [loadData, locationId]);

  if (!locationId || locationId === "enterprise") {
    return (
      <Card style={{ padding: 28, color: C.textSec, fontSize: 14, lineHeight: "22px" }}>
        Select a resort location before configuring Gingr workflow pairing.
      </Card>
    );
  }

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading Gingr configuration..." />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <style>{`
        @keyframes gingrFilterSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gingrFilterFadeIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes gingrFilterChipIn { from { opacity: 0; transform: translateX(-6px) scale(.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
        @keyframes gingrFilterConfigSlide { from { opacity: 0; max-height: 0; transform: translateY(-4px); } to { opacity: 1; max-height: 260px; transform: translateY(0); } }
        .gingr-filter-action-button {
          min-height: 34px;
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 12px;
          font-weight: 850;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }
        .gingr-filter-action-button svg {
          width: 15px;
          height: 15px;
        }
        .gingr-filter-action-button:hover {
          background: #f8fafc;
          border-color: rgba(20, 83, 45, .32);
          color: ${C.pri};
          transform: translateY(-1px);
        }
        .gingr-filter-action-button.is-active {
          border-color: rgba(20, 83, 45, .32);
          background: rgba(20, 83, 45, .08);
          color: ${C.pri};
        }
        .gingr-filter-panel {
          margin: -2px 0 2px;
          border-radius: 14px;
          border: 1.5px solid ${C.border};
          background: ${C.bg};
          box-shadow: 0 8px 40px rgba(0,0,0,.08);
          overflow: hidden;
          animation: gingrFilterSlideIn .22s ease-out;
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "start", marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: "0 0 5px", fontSize: 19, lineHeight: "25px", fontWeight: 900, color: C.text }}>
            Gingr Configuration
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: C.textSec, lineHeight: "20px", maxWidth: 880 }}>
            Pair each location's Gingr icons, services, reservation types, rooms, and current hard-coded report sources to the workflows K9 Operations computes every day.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={refreshReferenceData}
            disabled={refreshingReference}
            style={{
              padding: "9px 13px",
              borderRadius: 8,
              border: `1px solid ${C.pri}`,
              background: `${C.pri}12`,
              color: C.pri,
              fontSize: 12,
              fontWeight: 850,
              cursor: refreshingReference ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {refreshingReference ? "Refreshing..." : "Refresh Gingr Data"}
          </button>
          <button
            type="button"
            onClick={refreshIcons}
            disabled={refreshing}
            style={{
              padding: "9px 13px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.text,
              fontSize: 12,
              fontWeight: 850,
              cursor: refreshing ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh Icons"}
          </button>
        </div>
      </div>

      {loadError && (
        <Card style={{ padding: "13px 15px", marginBottom: 16, border: "1px solid #F59E0B66", background: "#FFFBEB" }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: "#92400E", marginBottom: 4 }}>Configuration warning</div>
          <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>{loadError}</div>
        </Card>
      )}

      {actionMessage && (
        <Card style={{
          padding: "12px 15px",
          marginBottom: 16,
          border: `1px solid ${actionMessage.type === "error" ? "#EF444466" : "#05966944"}`,
          background: actionMessage.type === "error" ? "#FEF2F2" : "#ECFDF5",
        }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: actionMessage.type === "error" ? "#991B1B" : "#047857" }}>
            {actionMessage.text}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginBottom: 18 }}>
        <SummaryTile label="Icons Found" value={inventory.length} />
        <SummaryTile label="Icon Pairings" value={activeIconMappingCount} />
        <SummaryTile label="Workflow Pairings" value={activeWorkflowMappingRows.length} />
        <SummaryTile label="Services / Add-ons" value={serviceSourceRows.length} />
        <SummaryTile label="Reservation Types" value={reservationTypeRows.length} />
        <SummaryTile label="Rooms / Runs" value={roomRunRows.length} />
        <SummaryTile label="Source Workflows" value={WORKFLOW_SOURCE_INVENTORY.length} />
        <SummaryTile label="Stale Pairings" value={staleMappings.length + staleWorkflowMappings.length} tone={staleMappings.length + staleWorkflowMappings.length ? "warn" : "default"} />
      </div>

      {syncStatus && syncStatus.status !== "complete" && (
        <Card style={{ padding: "15px 17px", marginBottom: 18, border: `1px solid ${C.pri}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 850, color: C.text }}>Initial Gingr Sync</div>
              <div style={{ fontSize: 12, color: C.textSec }}>
                {syncStatus.last_message || syncStatus.current_label || syncStatus.current_entity || "Waiting for reference sync status"}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.pri }}>{Number(syncStatus.percent || 0).toFixed(1)}%</div>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: `${C.pri}14`, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Number(syncStatus.percent || 0))}%`, height: "100%", background: C.pri }} />
          </div>
        </Card>
      )}

      <SectionShell
        title="Icon Matrix"
        eyebrow="Animal icon inventory"
        count={`${filteredInventory.length} rows × ${WORKFLOW_COLUMNS.length} workflows`}
        open={openSections.icons}
        onToggle={() => toggleSection("icons")}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(360px, 580px)", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 999, padding: "4px 8px" }}>
                DISPLAY ONLY = shows icon context
              </span>
              <span style={{ fontSize: 11, fontWeight: 900, color: "#991B1B", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 999, padding: "4px 8px" }}>
                REPORT ENTRY = can add/remove dogs
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SearchInput value={search} onChange={setSearch} />
              </div>
              <button
                type="button"
                onClick={() => setIconFiltersOpen((current) => !current)}
                className={`gingr-filter-action-button${iconFiltersOpen || activeIconFilterCount ? " is-active" : ""}`}
              >
                <I.Filter />
                <span>Filter{activeIconFilterCount ? ` (${activeIconFilterCount})` : ""}</span>
              </button>
            </div>
          </div>

          {iconFiltersOpen && (
            <div className="gingr-filter-panel">
              <div style={{ padding: "14px 18px", minHeight: 48 }}>
                {iconDraftFilterKeys.length === 0 && !iconFilterPickerOpen && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", animation: "gingrFilterFadeIn .2s ease-out" }}>
                    <I.Filter />
                    <span style={{ fontSize: 13, color: C.textMut, fontWeight: 500 }}>No filters active</span>
                  </div>
                )}

                {iconDraftFilterKeys.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: iconFilterPickerOpen ? 12 : 0 }}>
                    {iconDraftFilterKeys.map((key, index) => {
                      const field = getIconFilterField(key);
                      if (!field) return null;
                      const isConfiguring = configuringIconFilterKey === key;
                      const assignedOperatorLabel = ASSIGNED_OPERATOR_OPTIONS.find((option) => option.value === iconDraftFilters.assignedOperator)?.label || "Choose";
                      const workflowLabel = workflowFilterOptions.find((option) => option.value === iconDraftFilters.workflowKey)?.label || "";
                      const groupLabel = iconGroupOptions.find((option) => option.value === iconDraftFilters.group)?.label || "";
                      const operatorLabel = key === "assigned"
                        ? assignedOperatorLabel.toLowerCase()
                        : key === "workflow"
                          ? ICON_FILTER_OP_LABELS[iconDraftFilters.workflowState || "enabled"]
                          : ICON_FILTER_OP_LABELS.is;
                      const valueLabel = key === "assigned"
                        ? (iconDraftFilters.assignedValue !== "" ? iconDraftFilters.assignedValue : "set value")
                        : key === "workflow"
                          ? (workflowLabel || "set report")
                          : (groupLabel || "set group");
                      const hasValue = key === "assigned"
                        ? iconDraftFilters.assignedOperator && iconDraftFilters.assignedValue !== ""
                        : key === "workflow"
                          ? !!iconDraftFilters.workflowKey
                          : !!iconDraftFilters.group;

                      return (
                        <div key={key} style={{ animation: `gingrFilterChipIn .2s ease-out ${index * 0.04}s both` }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", boxShadow: isConfiguring ? "0 0 0 3px rgba(20,83,45,.06)" : "0 1px 3px rgba(0,0,0,.04)", transition: "all .25s cubic-bezier(.2,.8,.2,1)", overflow: "hidden" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setConfiguringIconFilterKey(isConfiguring ? "" : key);
                                setIconFilterPickerOpen(false);
                              }}
                              style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}
                            >
                              {field.label}
                            </button>
                            <div style={{ padding: "6px 0", display: "flex", alignItems: "center" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}>
                                {operatorLabel}
                              </span>
                            </div>
                            <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: hasValue ? 600 : 500, color: hasValue ? C.text : C.dan, fontStyle: hasValue ? "normal" : "italic", whiteSpace: "nowrap" }}>
                              {valueLabel}
                            </span>
                            <button type="button" onClick={() => removeIconFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                              <I.X />
                            </button>
                          </div>

                          {isConfiguring && (
                            <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,.1)", animation: "gingrFilterConfigSlide .25s ease-out", overflow: "hidden" }}>
                              {key === "group" && (
                                <div style={{ animation: "gingrFilterFadeIn .2s ease-out" }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>Value</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {iconGroupOptions.filter((option) => option.value).map((option, optionIndex) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => updateIconDraftFilter({ group: option.value })}
                                        style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${iconDraftFilters.group === option.value ? C.pri : C.borderLight}`, background: iconDraftFilters.group === option.value ? C.pri : "#fff", color: iconDraftFilters.group === option.value ? "#fff" : C.text, fontSize: 11, fontWeight: iconDraftFilters.group === option.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", animation: `gingrFilterFadeIn .15s ease-out ${optionIndex * 0.03}s both` }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                  <button type="button" onClick={() => setConfiguringIconFilterKey("")} style={{ marginTop: 9, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                </div>
                              )}

                              {key === "assigned" && (
                                <>
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>Condition</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {ASSIGNED_OPERATOR_OPTIONS.filter((option) => option.value).map((option, optionIndex) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => updateIconDraftFilter({ assignedOperator: option.value })}
                                          style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${iconDraftFilters.assignedOperator === option.value ? C.pri : C.borderLight}`, background: iconDraftFilters.assignedOperator === option.value ? C.pri : "#fff", color: iconDraftFilters.assignedOperator === option.value ? "#fff" : C.text, fontSize: 11, fontWeight: iconDraftFilters.assignedOperator === option.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all .2s cubic-bezier(.2,.8,.2,1)", animation: `gingrFilterFadeIn .2s ease-out ${optionIndex * 0.03}s both` }}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div style={{ animation: "gingrFilterFadeIn .2s ease-out .1s both" }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>Value</div>
                                    <input
                                      type="number"
                                      min="0"
                                      value={iconDraftFilters.assignedValue}
                                      onChange={(event) => updateIconDraftFilter({ assignedValue: event.target.value })}
                                      placeholder="Assigned count"
                                      style={{ width: 160, maxWidth: "100%", padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 850, fontFamily: "inherit", outline: "none" }}
                                    />
                                    <button type="button" onClick={() => setConfiguringIconFilterKey("")} style={{ marginLeft: 8, marginTop: 9, padding: "7px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                  </div>
                                </>
                              )}

                              {key === "workflow" && (
                                <>
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>State</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {WORKFLOW_STATE_OPTIONS.map((option, optionIndex) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => updateIconDraftFilter({ workflowState: option.value })}
                                          style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${iconDraftFilters.workflowState === option.value ? C.pri : C.borderLight}`, background: iconDraftFilters.workflowState === option.value ? C.pri : "#fff", color: iconDraftFilters.workflowState === option.value ? "#fff" : C.text, fontSize: 11, fontWeight: iconDraftFilters.workflowState === option.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all .2s cubic-bezier(.2,.8,.2,1)", animation: `gingrFilterFadeIn .2s ease-out ${optionIndex * 0.03}s both` }}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div style={{ animation: "gingrFilterFadeIn .2s ease-out .1s both" }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>Report</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {workflowFilterOptions.filter((option) => option.value).map((option, optionIndex) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => updateIconDraftFilter({ workflowKey: option.value })}
                                          style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${iconDraftFilters.workflowKey === option.value ? C.pri : C.borderLight}`, background: iconDraftFilters.workflowKey === option.value ? C.pri : "#fff", color: iconDraftFilters.workflowKey === option.value ? "#fff" : C.text, fontSize: 11, fontWeight: iconDraftFilters.workflowKey === option.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", animation: `gingrFilterFadeIn .15s ease-out ${optionIndex * 0.02}s both` }}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                    </div>
                                    <button type="button" onClick={() => setConfiguringIconFilterKey("")} style={{ marginTop: 9, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!iconFilterPickerOpen ? (
                  <div style={{ marginTop: iconDraftFilterKeys.length > 0 ? 8 : 0, animation: "gingrFilterFadeIn .2s ease-out" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIconFilterPickerOpen(true);
                        setIconFilterPickerReady(false);
                        setConfiguringIconFilterKey("");
                        window.setTimeout(() => setIconFilterPickerReady(true), 10);
                      }}
                      disabled={iconAvailableFilterFields.length === 0}
                      style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${iconAvailableFilterFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: iconAvailableFilterFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 700, cursor: iconAvailableFilterFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <I.Plus />
                      Add Filter
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: iconDraftFilterKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,.06)", overflow: "hidden", animation: "gingrFilterSlideIn .25s ease-out" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Choose a filter</span>
                      <button type="button" onClick={() => setIconFilterPickerOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }} aria-label="Close filter picker">
                        <I.X />
                      </button>
                    </div>
                    <div style={{ padding: "6px 0" }}>
                      {iconFilterSections.map((section, sectionIndex) => {
                        const sectionFields = iconAvailableFilterFields.filter((field) => field.section === section);
                        if (!sectionFields.length) return null;
                        return (
                          <div key={section}>
                            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, display: "flex", alignItems: "center", gap: 6, animation: iconFilterPickerReady ? `gingrFilterFadeIn .2s ease-out ${sectionIndex * 0.06}s both` : "none" }}>
                              {section}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                              {sectionFields.map((field, fieldIndex) => {
                                const delay = sectionIndex * 0.06 + fieldIndex * 0.03 + 0.05;
                                return (
                                  <button
                                    key={field.key}
                                    type="button"
                                    onClick={() => selectIconFilterField(field.key)}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all .2s cubic-bezier(.2,.8,.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,.03)", animation: iconFilterPickerReady ? `gingrFilterChipIn .25s ease-out ${delay}s both` : "none" }}
                                  >
                                    {field.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={applyIconFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(20,83,45,.2)" }}>
                    Apply{iconDraftFilterKeys.length > 0 ? ` (${iconDraftFilterKeys.length})` : ""}
                  </button>
                  {(iconDraftFilterKeys.length > 0 || activeIconFilterCount > 0) && (
                    <button type="button" onClick={clearIconFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear All
                    </button>
                  )}
                  <button type="button" onClick={closeIconFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", minWidth: WORKFLOW_TABLE_WIDTH, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, background: C.surface }}>
              <colgroup>
                <col style={{ width: ICON_NUMBER_COLUMN_WIDTH }} />
                <col style={{ width: ICON_NAME_COLUMN_WIDTH }} />
                <col style={{ width: ICON_GROUP_COLUMN_WIDTH }} />
                <col style={{ width: ICON_ASSIGNED_COLUMN_WIDTH }} />
                {WORKFLOW_COLUMNS.map((workflow) => <col key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: ICON_NUMBER_COLUMN_WIDTH, padding: "10px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 11, color: C.textMut, background: C.bg }}>#</th>
                  <th style={{ width: ICON_NAME_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Icon</th>
                  <th style={{ background: C.bg, width: ICON_GROUP_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut }}>Icon Group</th>
                  <th style={{ background: C.bg, width: ICON_ASSIGNED_COLUMN_WIDTH, padding: "10px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 11, color: C.textMut }}>Assigned</th>
                  {WORKFLOW_COLUMNS.map((workflow) => {
                    const sev = getSeverityStyle(workflow.severity);
                    return (
                      <th key={workflow.key} title={workflow.note} style={{ background: C.bg, width: WORKFLOW_COLUMN_WIDTH, padding: "8px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "bottom" }}>
                        <div style={{ fontSize: 11, lineHeight: "14px", fontWeight: 900, color: C.text }}>{workflow.short}</div>
                        <div style={{ display: "inline-flex", marginTop: 4, fontSize: 8.5, fontWeight: 900, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 999, padding: "2px 5px", whiteSpace: "nowrap" }}>
                          {workflow.severity === "driver" ? "ENTRY" : "DISPLAY"}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((row, index) => {
                  const inventoryKey = getInventoryKey(row);
                  const iconSourceKey = getIconSourceKey(row);

                  return (
                    <tr key={inventoryKey}>
                      <td style={{ width: ICON_NUMBER_COLUMN_WIDTH, padding: "10px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 12, fontWeight: 850, color: C.textMut, background: C.surface }}>
                        {index + 1}
                      </td>
                      <td style={{ width: ICON_NAME_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                          <div style={{ width: 8, height: 28, borderRadius: 6, background: row.icon_color || C.pri, border: `1px solid ${C.border}`, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                              {row.current_title || "Untitled Icon"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ width: ICON_GROUP_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 850, color: C.textSec }}>
                        {row.icon_group || "Other"}
                      </td>
                      <td style={{ width: ICON_ASSIGNED_COLUMN_WIDTH, padding: "10px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 12, fontWeight: 850, color: C.textSec }}>
                        {row.active_assignment_count ?? 0}
                      </td>
                      {WORKFLOW_COLUMNS.map((workflow) => {
                        const active = getIconWorkflowActive(row, workflow);
                        const saveKey = workflow.iconCapabilityKey
                          ? `icon-cap:${inventoryKey}:${workflow.iconCapabilityKey}`
                          : `icon-workflow:${workflow.key}:${iconSourceKey}`;
                        const title = `${workflow.label}: ${workflow.note}`;
                        return (
                          <td key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH, padding: "9px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                            <CompactToggle
                              active={active}
                              disabled={savingKey === saveKey}
                              saving={savingKey === saveKey}
                              severity={workflow.severity}
                              title={title}
                              onClick={() => toggleIconWorkflow(row, workflow, !active)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={WORKFLOW_COLUMNS.length + 4} style={{ padding: 22, textAlign: "center", color: C.textMut, fontSize: 13 }}>
                      No icons match the current search and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Services And Add-ons"
        eyebrow="Report inclusion pairing"
        count={serviceSourceRows.length}
        open={openSections.services}
        onToggle={() => toggleSection("services")}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: "19px", maxWidth: 760 }}>
              Pair Gingr services and add-ons to report workflows. Bathing and Private Play are the highest-risk toggles because they can alter report membership.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase" }}>PP sessions</label>
              <input
                type="number"
                min="1"
                value={requiredSessionsInput}
                onChange={(event) => setRequiredSessionsInput(event.target.value)}
                style={{
                  width: 64,
                  padding: "8px 9px",
                  borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: C.surface,
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 900,
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={saveRequiredSessions}
                disabled={workflowSavingKey === "private_play:required_sessions"}
                style={{
                  padding: "8px 11px",
                  borderRadius: 8,
                  border: `1px solid ${C.pri}`,
                  background: `${C.pri}12`,
                  color: C.pri,
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: workflowSavingKey === "private_play:required_sessions" ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {workflowSavingKey === "private_play:required_sessions" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", minWidth: WORKFLOW_TABLE_WIDTH, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, background: C.surface }}>
              <colgroup>
                <col style={{ width: WORKFLOW_LEAD_COLUMN_WIDTH }} />
                {WORKFLOW_COLUMNS.map((workflow) => <col key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.bg, width: WORKFLOW_LEAD_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut }}>Service / Add-on</th>
                  {WORKFLOW_COLUMNS.map((workflow) => {
                    const sev = getSeverityStyle(workflow.serviceCapabilityKey === "bathing.include" || workflow.serviceCapabilityKey === "private_play.include" ? "driver" : workflow.severity);
                    return (
                      <th key={workflow.key} title={workflow.note} style={{ background: C.bg, width: WORKFLOW_COLUMN_WIDTH, padding: "8px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: C.text }}>{workflow.short}</div>
                        <div style={{ display: "inline-flex", marginTop: 4, fontSize: 8.5, fontWeight: 900, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 999, padding: "2px 5px" }}>
                          {sev.label === "REPORT ENTRY" ? "ENTRY" : "DISPLAY"}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {serviceSourceRows.map((row) => (
                  <tr key={`${row.sourceType}:${row.sourceKey}`}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.surface, width: WORKFLOW_LEAD_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 850, color: C.textMut, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 6px", flexShrink: 0 }}>
                          {row.kind === "service_addon" ? "Add-on" : "Service"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{row.context}</div>
                    </td>
                    {WORKFLOW_COLUMNS.map((workflow) => {
                      const capability = workflow.serviceCapabilityKey || `${workflow.key}.include`;
                      const caps = getWorkflowCapabilities(workflow.key, row.sourceType, row.sourceKey);
                      const inherited = serviceInheritsWorkflow(row, workflow)
                        && !hasInactiveWorkflowCapability(workflow.key, row.sourceType, row.sourceKey, capability);
                      const active = caps.has(capability) || inherited;
                      const saveKey = `${workflow.key}:${row.sourceType}:${row.sourceKey}:${capability}`;
                      const severity = capability === "bathing.include" || capability === "private_play.include" ? "driver" : workflow.severity;
                      return (
                        <td key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH, padding: "9px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                          <CompactToggle
                            active={active}
                            disabled={workflowSavingKey === saveKey}
                            saving={workflowSavingKey === saveKey}
                            severity={severity}
                            title={`${workflow.label}: ${workflow.note}`}
                            onClick={() => setWorkflowCapability({
                              workflowKey: workflow.key,
                              sourceType: row.sourceType,
                              sourceId: row.sourceId,
                              sourceIdentityKey: row.sourceKey,
                              sourceLabel: row.label,
                              capabilityKey: capability,
                              enabled: !active,
                              settings: workflow.key === "private_play"
                                ? { required_sessions: Number(requiredSessionsInput) || 3, configured_from: "gingr_configuration_matrix" }
                                : { configured_from: "gingr_configuration_matrix" },
                              isRequired: severity === "driver",
                            })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {serviceSourceRows.length === 0 && (
                  <tr>
                    <td colSpan={WORKFLOW_COLUMNS.length + 1} style={{ padding: 22, textAlign: "center", color: C.textMut, fontSize: 13 }}>
                      No services or add-ons have been synced yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Reservation Types"
        eyebrow="Base category pairing"
        count={reservationTypeRows.length}
        open={openSections.reservations}
        onToggle={() => toggleSection("reservations")}
      >
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", minWidth: WORKFLOW_TABLE_WIDTH, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, background: C.surface }}>
            <colgroup>
              <col style={{ width: WORKFLOW_LEAD_COLUMN_WIDTH }} />
              {WORKFLOW_COLUMNS.map((workflow) => <col key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH }} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.bg, width: WORKFLOW_LEAD_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut }}>Reservation Type & Category</th>
                {WORKFLOW_COLUMNS.map((workflow) => {
                  const sev = getSeverityStyle(workflow.key === "private_play" ? "driver" : workflow.severity);
                  return (
                    <th key={workflow.key} title={workflow.note} style={{ background: C.bg, width: WORKFLOW_COLUMN_WIDTH, padding: "8px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: C.text }}>{workflow.short}</div>
                      <div style={{ display: "inline-flex", marginTop: 4, fontSize: 8.5, fontWeight: 900, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 999, padding: "2px 5px" }}>
                        {workflow.key === "private_play" ? "ENTRY" : RESERVATION_CATEGORY_WORKFLOW_KEYS.has(workflow.key) ? "CATEGORY" : "SERVICE"}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {reservationTypeRows.map((row) => {
                const label = sourceLabel(row, "type_label", "name", "gingr_id");
                const sourceKey = sourceIdentity("reservation_type", row.gingr_id, label);
                const categoryCaps = getWorkflowCapabilities("reservation_categories", "reservation_type", sourceKey);
                const currentCategory = [...categoryCaps]
                  .find((capability) => capability.startsWith("reservation.category."))
                  ?.replace("reservation.category.", "") || "";
                const categorySaveKey = `category:${sourceKey}`;

                return (
                  <tr key={sourceKey}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.surface, width: WORKFLOW_LEAD_COLUMN_WIDTH, padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 10, alignItems: "center" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                          <div style={{ fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourceKey}</div>
                        </div>
                        <CustomSelect
                          small
                          value={currentCategory}
                          onChange={(value) => setReservationCategory(row, value)}
                          disabled={workflowSavingKey === categorySaveKey}
                          options={RESERVATION_CATEGORY_OPTIONS}
                          placeholder="Unmapped"
                        />
                      </div>
                    </td>
                    {WORKFLOW_COLUMNS.map((workflow) => {
                      const capability = workflow.key === "private_play" ? "private_play.include" : workflow.serviceCapabilityKey || `${workflow.key}.include`;
                      const caps = getWorkflowCapabilities(workflow.key, "reservation_type", sourceKey);
                      const active = caps.has(capability);
                      const saveKey = `${workflow.key}:reservation_type:${sourceKey}:${capability}`;
                      const isLuxuryPamper = workflow.key === "pamper" && stableLower(label).includes("luxury suite");
                      const usesCategory = RESERVATION_CATEGORY_WORKFLOW_KEYS.has(workflow.key);

                      return (
                        <td key={workflow.key} style={{ width: WORKFLOW_COLUMN_WIDTH, padding: "9px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                          {workflow.key === "private_play" ? (
                            <CompactToggle
                              active={active}
                              disabled={workflowSavingKey === saveKey}
                              saving={workflowSavingKey === saveKey}
                              severity="driver"
                              title="Reservation type can force dogs onto the private play report."
                              onClick={() => setWorkflowCapability({
                                workflowKey: "private_play",
                                sourceType: "reservation_type",
                                sourceId: row.gingr_id,
                                sourceIdentityKey: sourceKey,
                                sourceLabel: label,
                                capabilityKey: "private_play.include",
                                enabled: !active,
                                settings: { required_sessions: Number(requiredSessionsInput) || 3, configured_from: "gingr_configuration_matrix" },
                                isRequired: true,
                              })}
                            />
                          ) : isLuxuryPamper ? (
                            <StaticWorkflowPill label="AUTO" tone="driver" title="Current Pamper logic automatically includes Luxury Suite reservation types." />
                          ) : usesCategory ? (
                            <StaticWorkflowPill label={currentCategory ? "CAT" : "MAP"} tone="category" title={currentCategory ? "This workflow uses the mapped reservation category." : "Map this reservation type before category-driven workflows can use it."} />
                          ) : (
                            <StaticWorkflowPill label="" title="This workflow is driven by services/add-ons or another source, not reservation type." />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {reservationTypeRows.length === 0 && (
                <tr>
                  <td colSpan={WORKFLOW_COLUMNS.length + 1} style={{ padding: 22, textAlign: "center", color: C.textMut, fontSize: 13 }}>
                    No reservation types have been synced yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell
        title="Runs And Rooms"
        eyebrow="Room cleaning source pairing"
        count={`${classifiedRunCount}/${roomRunRows.length} classified`}
        open={openSections.rooms}
        onToggle={() => toggleSection("rooms")}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: "19px", maxWidth: 820 }}>
            Gingr runs are the room catalog behind room cleaning, setup, and transfer work. Classifying them here makes the current room assumptions visible before room-cleaning runtime is switched to this configuration.
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", minWidth: 940, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, background: C.surface }}>
              <colgroup>
                <col style={{ width: 340 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Run / Room</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Area</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Gingr Type</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Room Cleaning Class</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 11, color: C.textMut, background: C.bg }}>Capacity</th>
                </tr>
              </thead>
              <tbody>
                {roomRunRows.map((row) => {
                  const sourceKey = getRunSourceKey(row);
                  const caps = getWorkflowCapabilities("room_cleaning", "run", sourceKey);
                  const currentCapability = ROOM_CLEANING_RUN_CAPABILITIES.find((option) => option.value && caps.has(option.value))?.value || "";
                  const saveKey = `run-classification:${sourceKey}`;

                  return (
                    <tr key={sourceKey}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.run_name || "Unnamed run"}</div>
                        <div style={{ fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourceKey}</div>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 850, color: C.textSec }}>
                        {row.area_name || "No area"}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.textSec }}>
                        <div>{row.run_type || "Unspecified"}</div>
                        {(row.is_private_play || row.is_isolation) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                            {row.is_private_play && <span style={{ fontSize: 10, fontWeight: 900, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 999, padding: "4px 8px" }}>Private Play</span>}
                            {row.is_isolation && <span style={{ fontSize: 10, fontWeight: 900, color: "#92400E", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 999, padding: "4px 8px" }}>Isolation</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                        <CustomSelect
                          small
                          value={currentCapability}
                          onChange={(value) => setRunClassification(row, value)}
                          disabled={workflowSavingKey === saveKey}
                          options={ROOM_CLEANING_RUN_CAPABILITIES}
                          placeholder="Unmapped"
                        />
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontSize: 12, fontWeight: 850, color: C.textSec }}>
                        {row.max_animals ? `${row.max_animals} dogs` : "Unknown"}
                      </td>
                    </tr>
                  );
                })}
                {roomRunRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 22, textAlign: "center", color: C.textMut, fontSize: 13 }}>
                      No Gingr runs or rooms have been synced yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Workflow Source Inventory"
        eyebrow="Complete runtime map"
        count={`${WORKFLOW_SOURCE_INVENTORY.length} workflows`}
        open={openSections.workflows}
        onToggle={() => toggleSection("workflows")}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: "19px", maxWidth: 900 }}>
            This inventory is the exhaustive handoff map for the hard-coded report logic found in web and mobile. Rows marked Partial or Gap are visible here so they do not disappear during the later server-side switchover.
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", minWidth: 1180, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, background: C.surface }}>
              <colgroup>
                <col style={{ width: 220 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 260 }} />
                <col style={{ width: 250 }} />
                <col style={{ width: 220 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Workflow</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Coverage</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Runtime IDs</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Current Source Categories</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Inherited / Hard-coded Values</th>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontSize: 11, color: C.textMut, background: C.bg }}>Config Surface</th>
                </tr>
              </thead>
              <tbody>
                {WORKFLOW_SOURCE_INVENTORY.map((row) => (
                  <tr key={row.key}>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, background: C.surface, verticalAlign: "top" }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 5 }}>{row.label}</div>
                      <InlineTokenList values={row.roleIds} />
                    </td>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <ConfigStatusPill status={row.configStatus} />
                    </td>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <div style={{ display: "grid", gap: 5 }}>
                        <div style={{ fontSize: 11, color: C.textSec }}><strong style={{ color: C.text }}>Route:</strong> {row.route || "None"}</div>
                        <div style={{ fontSize: 11, color: C.textSec }}><strong style={{ color: C.text }}>Row:</strong> {row.dailyOpsId}</div>
                        <div style={{ fontSize: 11, color: C.textSec }}><strong style={{ color: C.text }}>Done:</strong> {row.completionKey}</div>
                      </div>
                    </td>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <InlineTokenList values={row.sources} />
                    </td>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <InlineTokenList values={row.currentDefaults} />
                    </td>
                    <td style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }}>
                      <InlineTokenList values={row.configCoverage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Workflow Review"
        eyebrow="Readable pairing summary"
        count={activeWorkflowMappingRows.length}
        open={openSections.review}
        onToggle={() => toggleSection("review")}
      >
        <div style={{ display: "grid", gap: 12 }}>
          {workflowReviewRows.map((workflow) => {
            const sev = getSeverityStyle(workflow.severity);
            const isBathing = workflow.key === "bathing";
            const isPrivatePlay = workflow.key === "private_play";
            const membershipEmpty = isBathing
              ? "No bath services or add-ons paired yet."
              : isPrivatePlay
                ? "No Private Play icons, services, add-ons, or reservation types paired yet."
                : "No services or add-ons paired yet.";
            const displayEmpty = isPrivatePlay
              ? "Private Play icons are list-driving, so they are shown under report membership."
              : "No display-only icons paired yet.";

            return (
              <div key={workflow.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, background: C.surface }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{workflow.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 900, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 999, padding: "3px 7px" }}>
                        {sev.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: "18px", color: C.textSec, maxWidth: 780 }}>
                      {workflow.note}
                    </div>
                  </div>
                  {workflow.staleRows.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 900, color: "#92400E", background: "#FEF3C7", border: "1px solid #F59E0B55", borderRadius: 999, padding: "5px 8px", flexShrink: 0 }}>
                      {workflow.staleRows.length} stale
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, background: C.bg }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: isPrivatePlay || isBathing ? "#991B1B" : C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 8 }}>
                      Report membership
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {summarizeList(workflow.membershipRows, membershipEmpty)}
                    </div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, background: C.bg }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 8 }}>
                      Displayed icons and notes
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {summarizeList(workflow.displayRows, displayEmpty)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionShell>
    </div>
  );
}
