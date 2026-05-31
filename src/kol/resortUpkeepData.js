import { supabase } from "../supabaseClient";

export const RESORT_UPKEEP_ATTACHMENT_BUCKET = "resort-upkeep-attachments";
export const UPKEEP_SERVICE_FREQUENCIES = ["Daily", "Weekly", "Bi-weekly", "Monthly", "Bi-monthly", "Quarterly", "Biannually", "Annually"];
export const BUILDING_MAINTENANCE_SLUGS = [
  "building-maintenance-monthly",
  "building-maintenance-quarterly",
  "building-maintenance-semi-annual",
  "building-maintenance-annual",
];

export function fmtUpkeepDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtUpkeepStatus(value) {
  const text = String(value || "open").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function normalizeDashboard(value) {
  return {
    maintenance: Array.isArray(value?.maintenance) ? value.maintenance : [],
    maintenanceSummary: value?.maintenance_summary || value?.maintenanceSummary || {
      active: 0,
      overdue: 0,
      ready_to_submit: 0,
      submitted: 0,
      open: 0,
    },
    vendors: value?.vendors || { active: 0, archived: 0 },
    licenses: value?.licenses || { active: 0, non_compliant: 0, expiring_soon: 0 },
    troubleshooting: Array.isArray(value?.troubleshooting) ? value.troubleshooting : [],
  };
}

export async function loadResortUpkeepDashboard(locationId) {
  if (!locationId) return normalizeDashboard(null);
  const { data, error } = await supabase.rpc("resort_upkeep_get_dashboard", { p_location_id: locationId });
  if (error) throw error;
  return normalizeDashboard(data);
}

export async function loadMaintenancePeriodSnapshot(periodId) {
  const { data, error } = await supabase.rpc("resort_upkeep_get_period_snapshot", { p_period_id: periodId });
  if (error) throw error;
  return {
    period: data?.period || {},
    progress: data?.progress || {},
    computedStatus: data?.computedStatus || data?.computed_status,
    canEdit: data?.canEdit ?? data?.can_edit ?? false,
    canReopen: data?.canReopen ?? data?.can_reopen ?? false,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function loadMaintenancePeriods(locationId, { templateSlug = null, limit = 48 } = {}) {
  if (!locationId) return [];
  const { data, error } = await supabase.rpc("resort_upkeep_list_periods", {
    p_location_id: locationId,
    p_template_slug: templateSlug,
    p_limit: limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadMaintenanceTemplates(locationId) {
  if (!locationId) return [];
  const { data, error } = await supabase.rpc("resort_upkeep_list_maintenance_templates", { p_location_id: locationId });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function publishMaintenanceTemplateVersion({
  templateId,
  locationId,
  items,
  changelog = "",
  actorName = null,
  templateName = null,
  startMonth = null,
  description = null,
}) {
  const { data, error } = await supabase.rpc("resort_upkeep_publish_template_version", {
    p_template_id: templateId,
    p_location_id: locationId,
    p_items: items,
    p_changelog: changelog,
    p_actor_name: actorName,
    p_template_name: templateName,
    p_start_month: startMonth,
    p_description: description,
  });
  if (error) throw error;
  return data;
}

export async function loadTemplateVersions(locationId) {
  if (!locationId) return [];
  const { data, error } = await supabase.rpc("resort_upkeep_list_template_versions", { p_location_id: locationId });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function saveTemplateDraft({ templateId, locationId, items, changelog = "", actorName = null }) {
  const { data, error } = await supabase.rpc("resort_upkeep_save_template_draft", {
    p_template_id: templateId,
    p_location_id: locationId,
    p_items: items,
    p_changelog: changelog,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function deleteTemplateDraft({ templateId, locationId, actorName = null }) {
  const { error } = await supabase.rpc("resort_upkeep_delete_template_draft", {
    p_template_id: templateId,
    p_location_id: locationId,
    p_actor_name: actorName,
  });
  if (error) throw error;
}

export async function saveMaintenanceItemState({ periodId, itemKey, checked, notes = "", actorName = null }) {
  const { data, error } = await supabase.rpc("resort_upkeep_save_item_state", {
    p_period_id: periodId,
    p_item_key: itemKey,
    p_checked: checked,
    p_notes: notes,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function submitMaintenancePeriod(periodId, actorName = null, note = "") {
  const { data, error } = await supabase.rpc("resort_upkeep_submit_period", {
    p_period_id: periodId,
    p_actor_name: actorName,
    p_note: note,
  });
  if (error) throw error;
  return data;
}

export async function reopenMaintenancePeriod(periodId, reason, actorName = null) {
  const { data, error } = await supabase.rpc("resort_upkeep_reopen_period", {
    p_period_id: periodId,
    p_reason: reason,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

const UPKEEP_INTRO_SETTING_KEY = "resort_upkeep_intros";

export async function loadUpkeepIntros(locationId) {
  if (!locationId) return {};
  const { data, error } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", UPKEEP_INTRO_SETTING_KEY)
    .maybeSingle();
  if (error) return {};
  return data?.setting_value && typeof data.setting_value === "object" ? data.setting_value : {};
}

export async function saveUpkeepIntros(locationId, intros, userId = null) {
  const { error } = await supabase
    .from("lite_settings")
    .upsert(
      { location_id: locationId, setting_key: UPKEEP_INTRO_SETTING_KEY, setting_value: intros, updated_by: userId },
      { onConflict: "location_id,setting_key" },
    );
  if (error) throw error;
}

// ─── Vendor spreadsheet import ───────────────────────────────────────────────
// Parse any .xlsx/.csv client-side (jszip + DOMParser; no external API, no NLP),
// then heuristically pair columns to vendor fields. The detection/build steps
// are pure (operate on a 2D grid) so they are unit-testable; only the file
// reader touches the browser.

export const VENDOR_IMPORT_FIELDS = ["trade", "company", "contact", "phone", "email", "contract", "frequency", "cost"];
export const VENDOR_IMPORT_FIELD_LABELS = {
  trade: "Trade", company: "Company", contact: "Contact", phone: "Phone",
  email: "Email", contract: "Contract (Y/N)", frequency: "Frequency", cost: "Cost",
};

function importPeriodFromHeader(header) {
  const s = String(header || "").toLowerCase();
  if (/semi-?annual|bi-?annual/.test(s)) return "Biannually";
  if (/quarter/.test(s)) return "Quarterly";
  if (/bi-?month/.test(s)) return "Bi-monthly";
  if (/bi-?week/.test(s)) return "Bi-weekly";
  if (/month/.test(s)) return "Monthly";
  if (/week/.test(s)) return "Weekly";
  if (/dai?ly/.test(s)) return "Daily";
  if (/year|annual/.test(s)) return "Annually";
  return "";
}

export function importFieldForHeader(header) {
  const s = String(header || "").toLowerCase().trim();
  if (!s) return null;
  if (/\btrade\b|category|type of (service|work)/.test(s)) return "trade";
  if (/company|business|vendor name|provider/.test(s) || s === "name") return "company";
  if (/contact|attn|\brep\b/.test(s)) return "contact";
  if (/phone|\btel\b|mobile|cell/.test(s)) return "phone";
  if (/mail/.test(s)) return "email";
  if (/contract/.test(s)) return "contract";
  if (/frequency|cadence|schedule/.test(s)) return "frequency";
  if (/\bcost\b|\bfee\b|amount|price|\brate\b/.test(s)) return "cost";
  return null;
}

function importRowScore(row) {
  let score = 0;
  (row || []).forEach((cell) => {
    const c = String(cell || "");
    if (importFieldForHeader(c)) score += 1;
    else if (/service|fee/i.test(c) && importPeriodFromHeader(c)) score += 1;
  });
  return score;
}

function normalizeGrid(grid) {
  return (Array.isArray(grid) ? grid : []).map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []));
}

// Find the most header-like row and propose a column -> field mapping.
export function detectVendorColumns(grid) {
  const rows = normalizeGrid(grid);
  let headerRowIndex = -1;
  let best = 0;
  rows.forEach((r, i) => {
    const s = importRowScore(r);
    if (s > best && s >= 3) { best = s; headerRowIndex = i; }
  });
  if (headerRowIndex < 0) return { headerRowIndex: -1, columns: [] };

  const header = rows[headerRowIndex];
  const columns = header.map((h, index) => {
    // Period-qualified "<period> Service / <period> Fee" columns take precedence
    // over the generic field rules so they consolidate into frequency + cost.
    const period = importPeriodFromHeader(h);
    if (period && /service/i.test(h)) return { index, header: h, field: "frequency", servicePeriod: period, feePeriod: null };
    if (period && /fee/i.test(h)) return { index, header: h, field: "cost", servicePeriod: null, feePeriod: period };
    return { index, header: h, field: importFieldForHeader(h), servicePeriod: null, feePeriod: null };
  }).filter((c) => String(c.header || "").trim());

  return { headerRowIndex, columns };
}

function cleanImportCost(value) {
  const s = String(value || "").replace(/[^0-9.]/g, "");
  if (!s) return "";
  const n = parseFloat(s);
  return Number.isFinite(n) ? String(n) : "";
}

function cleanImportText(value) {
  const s = String(value || "").trim();
  return /^(n\/?a|none|-+|tbd)$/i.test(s) ? "" : s;
}

// Build vendor draft rows from a grid + a (possibly user-edited) column mapping.
export function buildVendorRows(grid, headerRowIndex, columns) {
  const rows = normalizeGrid(grid);
  if (headerRowIndex < 0 || !Array.isArray(columns)) return [];
  const colFor = (field) => columns.find((c) => c.field === field && !c.servicePeriod && !c.feePeriod);
  const serviceCols = columns.filter((c) => c.servicePeriod && c.field === "frequency");
  const feeCols = columns.filter((c) => c.feePeriod && c.field === "cost");
  const tradeIdx = colFor("trade")?.index;
  const companyIdx = colFor("company")?.index;
  const out = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.some((c) => c)) continue;
    if (importRowScore(r) >= 3) continue; // skip a second header row
    const get = (idx) => (idx == null ? "" : (r[idx] || ""));
    const trade = get(tradeIdx);
    const company = get(companyIdx);
    if (!trade && !company) continue;

    let frequency = get(colFor("frequency")?.index);
    let cost = get(colFor("cost")?.index);
    if (!frequency && serviceCols.length) {
      const marked = serviceCols.find((c) => {
        const v = (r[c.index] || "").toLowerCase();
        return v && v !== "n/a" && v !== "-" && v !== "0";
      });
      if (marked) {
        frequency = marked.servicePeriod;
        if (!cost) {
          const fee = feeCols.find((c) => c.feePeriod === marked.servicePeriod) || feeCols[0];
          if (fee) cost = r[fee.index] || "";
        }
      }
    }
    const contractRaw = get(colFor("contract")?.index).toLowerCase();
    const contract = /^y(es)?$|true|✓|^x$|have/.test(contractRaw.trim());

    out.push({
      trade,
      company,
      contact: cleanImportText(get(colFor("contact")?.index)),
      phone: cleanImportText(get(colFor("phone")?.index)),
      email: cleanImportText(get(colFor("email")?.index)),
      contract,
      frequency: frequency || "",
      cost: cleanImportCost(cost),
    });
  }
  return out;
}

function importColRefToIndex(ref) {
  const m = String(ref).match(/^([A-Za-z]+)/);
  if (!m) return 0;
  let n = 0;
  const s = m[1].toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

// Read an .xlsx (zip of XML) or .csv into an array of sheet grids. Browser only.
export async function parseSpreadsheetGrids(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter((l) => l.length).map((line) => {
      const cells = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
    return [rows];
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const sharedStrings = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const doc = new DOMParser().parseFromString(await ssFile.async("string"), "application/xml");
    const siEls = doc.getElementsByTagName("si");
    for (let i = 0; i < siEls.length; i++) {
      const tEls = siEls[i].getElementsByTagName("t");
      let s = "";
      for (let k = 0; k < tEls.length; k++) s += tEls[k].textContent || "";
      sharedStrings.push(s);
    }
  }
  const sheetFiles = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const grids = [];
  for (const sheetName of sheetFiles) {
    const doc = new DOMParser().parseFromString(await zip.file(sheetName).async("string"), "application/xml");
    const rowEls = doc.getElementsByTagName("row");
    const rows = [];
    for (let ri = 0; ri < rowEls.length; ri++) {
      const cEls = rowEls[ri].getElementsByTagName("c");
      const cells = [];
      let maxIdx = -1;
      for (let ci = 0; ci < cEls.length; ci++) {
        const c = cEls[ci];
        const idx = importColRefToIndex(c.getAttribute("r") || "");
        const t = c.getAttribute("t");
        const vEl = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s") val = sharedStrings[Number(vEl?.textContent)] ?? "";
        else if (t === "inlineStr") val = c.getElementsByTagName("t")[0]?.textContent || "";
        else val = vEl?.textContent || "";
        cells[idx] = String(val).trim();
        if (idx > maxIdx) maxIdx = idx;
      }
      for (let k = 0; k <= maxIdx; k++) if (cells[k] == null) cells[k] = "";
      rows.push(cells);
    }
    grids.push(rows);
  }
  return grids;
}

export function upkeepVendorMeta(vendor) {
  const md = vendor?.metadata && typeof vendor.metadata === "object" ? vendor.metadata : {};
  return { trade: md.trade || "", frequency: md.frequency || "", cost: md.cost ?? "" };
}

export function upkeepLicenseMeta(license) {
  const md = license?.metadata && typeof license.metadata === "object" ? license.metadata : {};
  return { frequency: md.frequency || "" };
}

export async function loadVendors(locationId, includeArchived = false) {
  let query = supabase
    .from("resort_upkeep_vendors")
    .select("*")
    .eq("location_id", locationId)
    .order("business_name", { ascending: true });
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveVendor(vendor, actorName = null) {
  const { id, ...rest } = vendor || {};
  const payload = {
    ...rest,
    ...(id ? { id } : {}),
    contact_info: Array.isArray(vendor?.contact_info) ? vendor.contact_info : [],
  };
  const { data, error } = await supabase.rpc("resort_upkeep_save_vendor", {
    p_vendor: payload,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function archiveVendor(vendorId, reason, actorName = null) {
  const { data, error } = await supabase.rpc("resort_upkeep_archive_vendor", {
    p_vendor_id: vendorId,
    p_reason: reason,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function loadVendorLogCounts(locationId) {
  if (!locationId) return {};
  const { data, error } = await supabase
    .from("resort_upkeep_vendor_logs")
    .select("vendor_id")
    .eq("location_id", locationId);
  if (error) return {};
  const counts = {};
  (data || []).forEach((row) => { counts[row.vendor_id] = (counts[row.vendor_id] || 0) + 1; });
  return counts;
}

export async function loadVendorLogs(locationId, vendorId) {
  const { data, error } = await supabase
    .from("resort_upkeep_vendor_logs")
    .select("*")
    .eq("location_id", locationId)
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addVendorLog(log, actorName = null) {
  const { data, error } = await supabase.rpc("resort_upkeep_add_vendor_log", {
    p_log: log,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function loadLicenses(locationId, includeInactive = false) {
  let query = supabase
    .from("resort_upkeep_licenses")
    .select("*")
    .eq("location_id", locationId)
    .order("status", { ascending: false })
    .order("expiration_date", { ascending: true, nullsFirst: false });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveLicense(license, actorName = null) {
  const { id, ...rest } = license || {};
  const payload = {
    ...rest,
    ...(id ? { id } : {}),
    contact_info: Array.isArray(license?.contact_info) ? license.contact_info : [],
    website_links: Array.isArray(license?.website_links) ? license.website_links : [],
  };
  const { data, error } = await supabase.rpc("resort_upkeep_save_license", {
    p_license: payload,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function deactivateLicense(licenseId, reason, actorName = null) {
  const { data, error } = await supabase.rpc("resort_upkeep_deactivate_license", {
    p_license_id: licenseId,
    p_reason: reason,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function loadLicenseLogCounts(locationId) {
  if (!locationId) return {};
  const { data, error } = await supabase
    .from("resort_upkeep_license_logs")
    .select("license_id")
    .eq("location_id", locationId);
  if (error) throw error;
  const counts = {};
  (data || []).forEach((row) => { counts[row.license_id] = (counts[row.license_id] || 0) + 1; });
  return counts;
}

export async function loadLicenseLogs(locationId, licenseId) {
  const { data, error } = await supabase
    .from("resort_upkeep_license_logs")
    .select("*")
    .eq("location_id", locationId)
    .eq("license_id", licenseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addLicenseLog(log, actorName = null) {
  const { data, error } = await supabase.rpc("resort_upkeep_add_license_log", {
    p_log: log,
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function uploadResortUpkeepAttachment({ locationId, file, pathParts }) {
  const safeName = (file?.name || "attachment")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120) || "attachment";
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = [locationId, ...pathParts, `${id}-${safeName}`].join("/");
  const { error } = await supabase.storage
    .from(RESORT_UPKEEP_ATTACHMENT_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file?.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw error;
  return { id, path, safeName };
}

export async function recordResortUpkeepAttachment({
  locationId,
  attachmentScope,
  file,
  storagePath,
  fileName,
  actorName = null,
  periodId = null,
  itemStateId = null,
  vendorId = null,
  licenseId = null,
}) {
  const { data, error } = await supabase.rpc("resort_upkeep_record_attachment", {
    p_attachment: {
      location_id: locationId,
      attachment_scope: attachmentScope,
      period_id: periodId,
      item_state_id: itemStateId,
      vendor_id: vendorId,
      license_id: licenseId,
      file_name: fileName || file?.name || "attachment",
      storage_bucket: RESORT_UPKEEP_ATTACHMENT_BUCKET,
      storage_path: storagePath,
      mime_type: file?.type || "application/octet-stream",
      file_size_bytes: file?.size || 0,
      uploaded_by_name: actorName,
    },
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function createResortUpkeepSignedUrl(attachment) {
  const { data, error } = await supabase.storage
    .from(attachment?.storage_bucket || RESORT_UPKEEP_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment?.storage_path, 300);
  if (error) throw error;
  return data?.signedUrl || "";
}

export async function loadMaintenancePeriodAttachments(locationId, periodId) {
  if (!locationId || !periodId) return [];
  const { data, error } = await supabase
    .from("resort_upkeep_attachments")
    .select("*")
    .eq("location_id", locationId)
    .eq("period_id", periodId)
    .eq("attachment_scope", "maintenance_period_attachment")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function recordResortUpkeepPeriodAttachment({ locationId, periodId, file, storagePath, fileName, actorName = null }) {
  const { data, error } = await supabase.rpc("resort_upkeep_record_period_attachment", {
    p_attachment: {
      location_id: locationId,
      period_id: periodId,
      file_name: fileName || file?.name || "attachment",
      storage_bucket: RESORT_UPKEEP_ATTACHMENT_BUCKET,
      storage_path: storagePath,
      mime_type: file?.type || "application/octet-stream",
      file_size_bytes: file?.size || 1,
    },
    p_actor_name: actorName,
  });
  if (error) throw error;
  return data;
}

export async function deleteResortUpkeepPeriodAttachment(attachmentId, actorName = null) {
  const { error } = await supabase.rpc("resort_upkeep_delete_period_attachment", {
    p_attachment_id: attachmentId,
    p_actor_name: actorName,
  });
  if (error) throw error;
}

export async function loadResortUpkeepAttachments(locationId, filters = {}) {
  let query = supabase
    .from("resort_upkeep_attachments")
    .select("*")
    .eq("location_id", locationId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query = query.eq(key, value);
  });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadResortUpkeepAuditEvents(locationId, filters = {}) {
  let query = supabase
    .from("resort_upkeep_audit_events")
    .select("*")
    .eq("location_id", locationId)
    .order("event_at", { ascending: false })
    .limit(filters.limit || 30);
  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type);
  if (filters.entity_id) query = query.eq("entity_id", filters.entity_id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function subscribeToResortUpkeep(locationId, onChange) {
  const channel = supabase.channel(`resort-upkeep-web-${locationId}`);
  [
    "resort_upkeep_templates",
    "resort_upkeep_periods",
    "resort_upkeep_item_states",
    "resort_upkeep_attachments",
    "resort_upkeep_vendors",
    "resort_upkeep_vendor_logs",
    "resort_upkeep_licenses",
    "resort_upkeep_license_logs",
    "resort_upkeep_audit_events",
  ].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `location_id=eq.${locationId}` }, onChange);
  });
  ["resort_upkeep_template_versions", "resort_upkeep_troubleshooting_articles"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  });
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Unified "what's due" rollup ─────────────────────────────────────────────
// Pure, side-effect-free aggregation of everything that is overdue or coming
// due across the three upkeep domains: maintenance periods, license renewals,
// and vendor contract end dates. It reads only data the page already loads, so
// the read-only Due rollup needs no new RPC and no migration. It also previews
// the denormalized "due feed" the redesign proposes promoting to a server-side
// view, which the future aggregated Calendar can read cheaply.

const UPKEEP_DONE_PERIOD_STATUSES = new Set(["submitted", "late_submitted", "submitted_late", "closed"]);

function upkeepDaysUntil(fromIso, toValue) {
  if (!toValue) return null;
  const to = new Date(`${String(toValue).slice(0, 10)}T12:00:00`);
  const from = new Date(`${String(fromIso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

function upkeepDueBadge(daysLeft) {
  if (daysLeft === null) return "No date";
  if (daysLeft < 0) return `Overdue ${Math.abs(daysLeft)}d`;
  if (daysLeft === 0) return "Due today";
  return `Due in ${daysLeft}d`;
}

function upkeepTone(daysLeft, { attention = false, soonDays = 14 } = {}) {
  if (attention) return "danger";
  if (daysLeft === null) return "neutral";
  if (daysLeft < 0) return "danger";
  if (daysLeft <= soonDays) return "warn";
  return "neutral";
}

const UPKEEP_FREQUENCY_BY_MONTHS = { 1: "Monthly", 2: "Bi-monthly", 3: "Quarterly", 6: "Semi-annual", 12: "Annual", 24: "Biennial" };

export function upkeepFrequencyFromSlug(slug) {
  const s = String(slug || "").toLowerCase();
  if (s.includes("semi-annual") || s.includes("semi_annual") || s.includes("semiannual")) return "Semi-annual";
  if (s.includes("quarter")) return "Quarterly";
  if (s.includes("month")) return "Monthly";
  if (s.includes("annual") || s.includes("yearly")) return "Annual";
  return "";
}

export function upkeepFrequencyFromMonths(months) {
  const n = Number(months);
  if (!n) return "";
  return UPKEEP_FREQUENCY_BY_MONTHS[n] || `${n} mo`;
}

export function buildUpkeepDueItems({ maintenance = [], licenses = [], vendors = [], today, windowDays = 60 } = {}) {
  const anchor = today || new Date().toISOString().slice(0, 10);
  const horizon = windowDays === null || windowDays === Infinity ? Infinity : Number(windowDays);
  const items = [];

  (Array.isArray(maintenance) ? maintenance : []).forEach((p) => {
    if (!p?.id) return;
    const status = String(p.computed_status || p.status || "open");
    if (UPKEEP_DONE_PERIOD_STATUSES.has(status)) return;
    const dueDate = p.due_date || p.period_end || null;
    const daysLeft = upkeepDaysUntil(anchor, dueDate);
    const overdue = status === "overdue" || (daysLeft !== null && daysLeft < 0);
    if (!overdue && daysLeft !== null && daysLeft > horizon) return;
    const progress = p.progress || {};
    const started = (progress.completedRequired || 0) > 0 || ["in_progress", "amending", "ready_to_submit"].includes(status);
    items.push({
      id: `maintenance:${p.id}`,
      kind: "maintenance",
      kindLabel: "Maintenance",
      title: p.template_name || p.template_slug || "Maintenance period",
      subtitle: "",
      frequency: upkeepFrequencyFromSlug(p.template_slug) || upkeepFrequencyFromSlug(p.template_name),
      dueStart: p.period_start || null,
      dueEnd: p.period_end || null,
      dueDate,
      daysLeft,
      tone: overdue ? "danger" : upkeepTone(daysLeft, { soonDays: 7 }),
      statusLabel: started ? "In Progress" : "Not Started",
      statusTone: started ? "primary" : "neutral",
      dueBadge: upkeepDueBadge(daysLeft),
      attention: overdue,
      targetTab: "maintenance",
    });
  });

  (Array.isArray(licenses) ? licenses : []).forEach((l) => {
    if (!l?.id || l.is_active === false) return;
    const dateRef = l.expiration_date || l.next_expected_date || null;
    const daysLeft = upkeepDaysUntil(anchor, dateRef);
    const nonCompliant = l.status === "non_compliant";
    const expired = daysLeft !== null && daysLeft < 0;
    if (!nonCompliant && (daysLeft === null || daysLeft > horizon)) return;
    items.push({
      id: `license:${l.id}`,
      kind: "license",
      kindLabel: "License",
      title: l.requirement_name || "License requirement",
      subtitle: l.issuing_organization || "",
      frequency: upkeepFrequencyFromMonths(l.cadence_months),
      dueStart: dateRef,
      dueEnd: dateRef,
      dueDate: dateRef,
      daysLeft,
      tone: upkeepTone(daysLeft, { attention: nonCompliant }),
      statusLabel: nonCompliant ? "Non-compliant" : expired ? "Expired" : "Renewal due",
      dueBadge: upkeepDueBadge(daysLeft),
      attention: nonCompliant || expired,
      targetTab: "licenses",
    });
  });

  (Array.isArray(vendors) ? vendors : []).forEach((v) => {
    if (!v?.id || v.is_archived) return;
    if (!v.has_contract || !v.contract_effective_end) return;
    const daysLeft = upkeepDaysUntil(anchor, v.contract_effective_end);
    if (daysLeft === null || daysLeft > horizon) return;
    const expired = daysLeft < 0;
    items.push({
      id: `vendor:${v.id}`,
      kind: "vendor",
      kindLabel: "Vendor",
      title: v.business_name || "Vendor contract",
      subtitle: "",
      frequency: "Contract",
      dueStart: v.contract_effective_end,
      dueEnd: v.contract_effective_end,
      dueDate: v.contract_effective_end,
      daysLeft,
      tone: upkeepTone(daysLeft),
      statusLabel: expired ? "Contract expired" : "Contract ending",
      dueBadge: upkeepDueBadge(daysLeft),
      attention: expired,
      targetTab: "vendors",
    });
  });

  const rank = (item) => (item.attention && item.daysLeft === null ? -1e9 : item.daysLeft === null ? 1e9 : item.daysLeft);
  return items.sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : String(a.title).localeCompare(String(b.title));
  });
}
