// Data layer for the Marketing Directory (Linear K9-11): organizations + their
// affiliated contacts, standalone individuals, business-card / file attachments,
// and a change-log feed. Pure helpers only — no React, no Supabase — so the page
// stays thin and everything here is unit-testable.
//
// The directory cross-references the grassroots marketing tracker: import helpers
// turn tracker organizers (events) and visited/partnership businesses into seed
// directory records, and a write-back helper keeps a linked grassroots target's
// contact fields in sync.

// ─── Org taxonomy (superset of the tracker's business categories) ───────────
export const MARKETING_DIRECTORY_ORG_TYPE_OPTIONS = [
  "Veterinarian",
  "Groomer",
  "Pet Retailer",
  "Rescue",
  "Trainer",
  "Boarding/Daycare",
  "Pet Professional",
  "Corporate",
  "Apartment",
  "School",
  "Local Business",
  "Community Org",
  "Media",
  "Other",
];

// The org-vs-individual pill filter shown above the directory list.
export const MARKETING_DIRECTORY_ENTRY_TYPES = [
  { value: "all", label: "All" },
  { value: "organizations", label: "Organizations" },
  { value: "individuals", label: "Individuals" },
];

// ─── Attachment configuration (mirrors the grassroots attachment rules) ─────
export const MARKETING_DIRECTORY_ATTACHMENT_BUCKET = "marketing-directory-attachments";
export const MARKETING_DIRECTORY_ATTACHMENT_MAX_FILES = 8;
export const MARKETING_DIRECTORY_ATTACHMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MARKETING_DIRECTORY_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];
export const MARKETING_DIRECTORY_ATTACHMENT_ACCEPT = [
  ...MARKETING_DIRECTORY_ATTACHMENT_MIME_TYPES,
  ".heic",
  ".heif",
].join(",");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stringValue(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return stringValue(value).replace(/\s+/g, " ");
}

function normalizeUuid(value) {
  const trimmed = stringValue(value);
  return UUID_RE.test(trimmed) ? trimmed : "";
}

export function normalizeDirectorySearchText(value = "") {
  return stringValue(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Split a free-text person name ("Dr. Jane A. Vance") into first / last. The final
// whitespace-separated token is the surname; everything before it is the given name.
export function splitPersonName(value = "") {
  const parts = normalizeText(value).split(" ").filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

// ─── Blank drafts ───────────────────────────────────────────────────────────
export function makeBlankDirectoryOrg(locationId = "") {
  return {
    id: `draft_org_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    location_id: normalizeUuid(locationId),
    name: "",
    org_type: "",
    address: "",
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
    google_place_id: "",
    phone: "",
    email: "",
    website: "",
    notes: "",
    grassroots_target_id: "",
    details: {},
    isDraft: true,
  };
}

export function makeBlankDirectoryContact(locationId = "", orgId = null) {
  return {
    id: `draft_contact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    location_id: normalizeUuid(locationId),
    org_id: orgId ? normalizeUuid(orgId) : null,
    first_name: "",
    last_name: "",
    title: "",
    email: "",
    phone: "",
    notes: "",
    grassroots_target_id: "",
    details: {},
    isDraft: true,
  };
}

// ─── Display helpers ────────────────────────────────────────────────────────
export function getDirectoryOrgName(org = {}) {
  return normalizeText(org.name) || "Untitled organization";
}

export function getDirectoryContactName(contact = {}) {
  const full = normalizeText([contact.first_name, contact.last_name].filter(Boolean).join(" "));
  return full || "Unnamed contact";
}

export function getDirectoryContactInitials(contact = {}) {
  const first = stringValue(contact.first_name);
  const last = stringValue(contact.last_name);
  const initials = `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
  return initials || "?";
}

export function getDirectoryOrgAddressText(org = {}) {
  const composed = [
    org.address_line_1,
    org.address_line_2,
    [org.address_city, org.address_state].filter(Boolean).join(", "),
    org.address_postal_code,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" · ");
  return composed || normalizeText(org.address);
}

export function getDirectoryEntryIsIndividual(contact = {}) {
  return !normalizeUuid(contact.org_id);
}

// ─── Write payload builders (draft → row shape for Supabase) ────────────────
export function buildDirectoryOrgPayload(draft = {}, locationId = "", actor = {}) {
  const isDraft = draft.isDraft;
  return {
    location_id: normalizeUuid(locationId),
    name: normalizeText(draft.name),
    org_type: normalizeText(draft.org_type) || null,
    address: normalizeText(draft.address) || null,
    address_line_1: normalizeText(draft.address_line_1) || null,
    address_line_2: normalizeText(draft.address_line_2) || null,
    address_city: normalizeText(draft.address_city) || null,
    address_state: normalizeText(draft.address_state) || null,
    address_postal_code: normalizeText(draft.address_postal_code) || null,
    address_country: normalizeText(draft.address_country) || null,
    google_place_id: normalizeText(draft.google_place_id) || null,
    phone: normalizeText(draft.phone) || null,
    email: normalizeText(draft.email) || null,
    website: normalizeWebsiteUrl(draft.website) || null,
    notes: stringValue(draft.notes) || null,
    grassroots_target_id: normalizeUuid(draft.grassroots_target_id) || null,
    details: draft.details && typeof draft.details === "object" ? draft.details : {},
    ...(isDraft
      ? { created_by_user_id: normalizeUuid(actor.userId) || null, created_by_name: actor.name || null }
      : {}),
    updated_by_user_id: normalizeUuid(actor.userId) || null,
    updated_by_name: actor.name || null,
  };
}

export function buildDirectoryContactPayload(draft = {}, locationId = "", actor = {}) {
  const isDraft = draft.isDraft;
  return {
    location_id: normalizeUuid(locationId),
    org_id: normalizeUuid(draft.org_id) || null,
    first_name: normalizeText(draft.first_name) || null,
    last_name: normalizeText(draft.last_name) || null,
    title: normalizeText(draft.title) || null,
    email: normalizeText(draft.email) || null,
    phone: normalizeText(draft.phone) || null,
    notes: stringValue(draft.notes) || null,
    grassroots_target_id: normalizeUuid(draft.grassroots_target_id) || null,
    details: draft.details && typeof draft.details === "object" ? draft.details : {},
    ...(isDraft
      ? { created_by_user_id: normalizeUuid(actor.userId) || null, created_by_name: actor.name || null }
      : {}),
    updated_by_user_id: normalizeUuid(actor.userId) || null,
    updated_by_name: actor.name || null,
  };
}

// Only the fields a linked grassroots target shares with a directory org. Used to
// keep the tracker's visited-business / organizer contact info in sync ("write"
// half of the field↔directory wiring). Empty values are omitted so a blank field
// in the directory never wipes existing tracker data.
export function buildGrassrootsTargetWriteback(org = {}) {
  const payload = {};
  const phone = normalizeText(org.phone);
  const email = normalizeText(org.email);
  const address = getDirectoryOrgAddressText(org) || normalizeText(org.address);
  if (phone) payload.contact_phone = phone;
  if (email) payload.contact_email = email;
  if (address) payload.address = address;
  return payload;
}

// Diff the org editor's inline people rows against the org's current contacts to
// figure out what to insert / update / delete on save. A row counts as a real
// person once it has a first or last name; an existing contact that's been removed
// (or had its name cleared) lands in toDeleteIds.
export function diffDirectoryPeople(originalContacts = [], peopleRows = []) {
  const hasName = (row) => Boolean(normalizeText(row?.first_name) || normalizeText(row?.last_name));
  const kept = (peopleRows || []).filter(hasName);
  const keptIds = new Set(kept.map((row) => normalizeUuid(row.id)).filter(Boolean));
  return {
    toInsert: kept.filter((row) => !normalizeUuid(row.id)),
    toUpdate: kept.filter((row) => normalizeUuid(row.id)),
    toDeleteIds: (originalContacts || [])
      .map((contact) => normalizeUuid(contact.id))
      .filter(Boolean)
      .filter((id) => !keptIds.has(id)),
  };
}

// Build an organization draft from a standalone individual (so an imported
// organizer that's really a company can be promoted and then hold people). The
// person's name is recombined; their contact info + tracker link carry over.
export function makeOrgDraftFromIndividual(contact = {}, locationId = "") {
  return {
    ...makeBlankDirectoryOrg(locationId),
    isDraft: true,
    name: normalizeText([contact.first_name, contact.last_name].filter(Boolean).join(" ")) || getDirectoryContactName(contact),
    phone: normalizeText(contact.phone),
    email: normalizeText(contact.email),
    notes: stringValue(contact.notes),
    grassroots_target_id: normalizeUuid(contact.grassroots_target_id) || "",
    org_type: normalizeText(contact.details?.org_type) || "",
  };
}

// Add an https:// scheme to a bare domain so links open; leaves full URLs and
// anything that doesn't look like a domain untouched.
export function normalizeWebsiteUrl(value) {
  const text = normalizeText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text)) return `https://${text}`;
  return text;
}

// Empty is allowed; otherwise a basic shape check (local@domain.tld).
export function isValidDirectoryEmail(value) {
  const text = normalizeText(value);
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

// ─── Attachment helpers (mirror the grassroots attachment helpers) ──────────
export function isHeicFile(file = {}) {
  const type = stringValue(file?.type).toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = stringValue(file?.name).toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

export function inferDirectoryAttachmentMimeType(file = {}) {
  const explicitType = stringValue(file?.type).toLowerCase();
  if (MARKETING_DIRECTORY_ATTACHMENT_MIME_TYPES.includes(explicitType)) return explicitType;

  const name = stringValue(file?.name).toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return explicitType || "application/octet-stream";
}

export function sanitizeDirectoryAttachmentFilename(value = "") {
  const rawName = String(value || "attachment")
    .split(/[\\/]/)
    .pop()
    .trim();
  const safe = rawName
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, 120);
  return safe || "attachment";
}

export function buildDirectoryAttachmentPath({
  locationId,
  entityType,
  entityId,
  attachmentId,
  fileName,
} = {}) {
  const cleanLocationId = normalizeUuid(locationId);
  const cleanEntityId = normalizeUuid(entityId);
  const cleanAttachmentId = normalizeUuid(attachmentId);
  const folder = entityType === "contact" ? "contacts" : "orgs";
  if (entityType !== "org" && entityType !== "contact") throw new Error("entityType must be 'org' or 'contact'");
  if (!cleanLocationId) throw new Error("Valid location id is required");
  if (!cleanEntityId) throw new Error("Valid entity id is required");
  if (!cleanAttachmentId) throw new Error("Valid attachment id is required");

  return [
    cleanLocationId,
    folder,
    cleanEntityId,
    `${cleanAttachmentId}-${sanitizeDirectoryAttachmentFilename(fileName)}`,
  ].join("/");
}

export function validateDirectoryAttachmentFiles(files = []) {
  const fileList = Array.from(files || []);
  const errors = [];
  const acceptedFiles = [];

  if (fileList.length > MARKETING_DIRECTORY_ATTACHMENT_MAX_FILES) {
    errors.push(`Attach up to ${MARKETING_DIRECTORY_ATTACHMENT_MAX_FILES} files at a time.`);
  }

  fileList.slice(0, MARKETING_DIRECTORY_ATTACHMENT_MAX_FILES).forEach((file) => {
    const mimeType = inferDirectoryAttachmentMimeType(file);
    const fileName = stringValue(file?.name) || "attachment";
    const fileSize = Number(file?.size || 0);

    if (!MARKETING_DIRECTORY_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
      errors.push(`${fileName} must be a PDF, PNG, JPG, WEBP, HEIC, or HEIF file.`);
      return;
    }
    if (fileSize > MARKETING_DIRECTORY_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      errors.push(`${fileName} is larger than 20 MB.`);
      return;
    }
    acceptedFiles.push(file);
  });

  return { acceptedFiles, errors };
}

export function formatDirectoryFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function getDirectoryAttachmentPreviewKind(attachment = {}) {
  const mimeType = stringValue(attachment?.mime_type || attachment?.metadata?.mime_type).toLowerCase();
  const name = stringValue(attachment?.file_name).toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/.test(name)) return "image";
  return "unsupported";
}

export function isDirectoryAttachmentDeleted(attachment = {}) {
  return Boolean(attachment?.deleted_at);
}

// Group non-deleted attachments by their parent, keyed `org:<id>` / `contact:<id>`.
export function groupDirectoryAttachments(attachments = []) {
  return (attachments || []).reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== "object") return acc;
    if (isDirectoryAttachmentDeleted(attachment)) return acc;
    const key = attachment.org_id
      ? `org:${attachment.org_id}`
      : attachment.contact_id
        ? `contact:${attachment.contact_id}`
        : null;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(attachment);
    acc[key].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
    return acc;
  }, {});
}

// The first non-deleted business-card image for an entity (used as its avatar).
export function getDirectoryBusinessCard(attachments = []) {
  return (attachments || []).find(
    (att) => !isDirectoryAttachmentDeleted(att) && att.attachment_type === "business_card",
  ) || null;
}

// ─── Directory entry assembly + filtering ───────────────────────────────────
export function groupDirectoryContactsByOrg(contacts = []) {
  const byOrg = new Map();
  const individuals = [];
  (contacts || []).forEach((contact) => {
    if (!contact || typeof contact !== "object") return;
    const orgId = normalizeUuid(contact.org_id);
    if (!orgId) {
      individuals.push(contact);
      return;
    }
    if (!byOrg.has(orgId)) byOrg.set(orgId, []);
    byOrg.get(orgId).push(contact);
  });
  byOrg.forEach((list) => list.sort((a, b) => getDirectoryContactName(a).localeCompare(getDirectoryContactName(b))));
  individuals.sort((a, b) => getDirectoryContactName(a).localeCompare(getDirectoryContactName(b)));
  return { byOrg, individuals };
}

// Unified, sorted list of directory entries: one per organization (with its
// affiliated contacts attached) and one per standalone individual.
export function buildDirectoryEntries({ orgs = [], contacts = [], attachmentsByEntity = {} } = {}) {
  const { byOrg, individuals } = groupDirectoryContactsByOrg(contacts);

  const orgEntries = (orgs || []).map((org) => {
    const orgContacts = byOrg.get(normalizeUuid(org.id)) || [];
    return {
      kind: "org",
      id: org.id,
      sortName: getDirectoryOrgName(org).toLowerCase(),
      org,
      contacts: orgContacts,
      attachments: attachmentsByEntity[`org:${org.id}`] || [],
    };
  });

  const individualEntries = individuals.map((contact) => ({
    kind: "individual",
    id: contact.id,
    sortName: getDirectoryContactName(contact).toLowerCase(),
    contact,
    attachments: attachmentsByEntity[`contact:${contact.id}`] || [],
  }));

  return [...orgEntries, ...individualEntries].sort((a, b) => a.sortName.localeCompare(b.sortName));
}

function directoryEntryHaystack(entry) {
  if (entry.kind === "org") {
    const contactText = (entry.contacts || [])
      .map((c) => `${getDirectoryContactName(c)} ${c.title || ""} ${c.email || ""} ${c.phone || ""}`)
      .join(" ");
    return normalizeDirectorySearchText(
      [
        getDirectoryOrgName(entry.org),
        entry.org.org_type,
        getDirectoryOrgAddressText(entry.org),
        entry.org.phone,
        entry.org.email,
        entry.org.website,
        contactText,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return normalizeDirectorySearchText(
    [
      getDirectoryContactName(entry.contact),
      entry.contact.title,
      entry.contact.email,
      entry.contact.phone,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function filterDirectoryEntries(entries = [], { entryType = "all", query = "" } = {}) {
  const normalizedQuery = normalizeDirectorySearchText(query);
  const queryParts = normalizedQuery.split(" ").filter(Boolean);
  return (entries || []).filter((entry) => {
    if (entryType === "organizations" && entry.kind !== "org") return false;
    if (entryType === "individuals" && entry.kind !== "individual") return false;
    if (queryParts.length === 0) return true;
    const haystack = directoryEntryHaystack(entry);
    return queryParts.every((part) => haystack.includes(part));
  });
}

export function summarizeDirectory(orgs = [], contacts = []) {
  const { individuals } = groupDirectoryContactsByOrg(contacts);
  return {
    organizations: (orgs || []).length,
    individuals: individuals.length,
    affiliatedContacts: (contacts || []).length - individuals.length,
    contacts: (contacts || []).length,
  };
}

// ─── Tracker → directory import ("read" half of the field↔directory wiring) ─
const ORG_CATEGORY_TYPE_LABELS = {
  corporate_partnerships: "Corporate",
  apartments: "Apartment",
  pet_professional_partnerships: "Pet Professional",
  local_business_partnerships: "Local Business",
  schools: "School",
  drops: "Business",
};

const CATEGORY_SOURCE_LABELS = {
  events: "Event organizer",
  drops: "Visited business",
  corporate_partnerships: "Corporate partnership",
  apartments: "Apartment",
  pet_professional_partnerships: "Pet professional partnership",
  local_business_partnerships: "Local business partnership",
  schools: "School",
};

function resolveOrgTypeForTarget(target = {}) {
  const explicit = normalizeText(target.business_category || target.drop_category);
  if (explicit) return explicit;
  return ORG_CATEGORY_TYPE_LABELS[target.category] || "Other";
}

function firstWebsiteFromDetails(details = {}) {
  const links = Array.isArray(details?.links) ? details.links : [];
  const website = links.find((row) => /website|site|url|web/i.test(String(row?.label || "")) || row?.url);
  return normalizeText(website?.url);
}

// Builds the two candidate buckets the Import dialog offers. Anything already in
// the directory — matched by linked grassroots_target_id or by normalized name —
// is filtered out so re-importing is idempotent.
export function buildDirectoryImportCandidates({
  targets = [],
  existingOrgs = [],
  existingContacts = [],
} = {}) {
  const linkedTargetIds = new Set(
    [...existingOrgs, ...existingContacts]
      .map((row) => normalizeUuid(row.grassroots_target_id))
      .filter(Boolean),
  );
  const existingOrgNames = new Set(
    (existingOrgs || []).map((org) => normalizeDirectorySearchText(org.name)).filter(Boolean),
  );
  const orgs = [];
  const individuals = []; // always empty — the directory is organizations only

  (targets || []).forEach((target) => {
    if (!target || typeof target !== "object") return;
    const targetId = normalizeUuid(target.id);
    const category = stringValue(target.category);

    if (category === "events") {
      // Every directory entry is an organization, so an event organizer joins as an
      // org named after the organizer (people can be added under it afterward).
      const organizer = normalizeText(target.organizer);
      if (!organizer) return;
      const nameKey = normalizeDirectorySearchText(organizer);
      if ((targetId && linkedTargetIds.has(targetId)) || existingOrgNames.has(nameKey)) return;
      existingOrgNames.add(nameKey);
      orgs.push({
        key: `event:${targetId || nameKey}`,
        kind: "org",
        name: organizer,
        org_type: "Community Org",
        address: "",
        address_line_1: "",
        address_line_2: "",
        address_city: "",
        address_state: "",
        address_postal_code: "",
        address_country: "",
        google_place_id: "",
        phone: normalizeText(target.contact_phone),
        email: normalizeText(target.contact_email),
        website: "",
        grassroots_target_id: targetId,
        sourceLabel: CATEGORY_SOURCE_LABELS.events,
        contact: null,
      });
      return;
    }

    if (!ORG_CATEGORY_TYPE_LABELS[category]) return;
    const name = normalizeText(target.name);
    if (!name) return;
    const nameKey = normalizeDirectorySearchText(name);
    if ((targetId && linkedTargetIds.has(targetId)) || existingOrgNames.has(nameKey)) return;
    existingOrgNames.add(nameKey);

    const personName = normalizeText([target.first_name, target.last_name].filter(Boolean).join(" "));
    orgs.push({
      key: `org:${targetId || nameKey}`,
      kind: "org",
      name,
      org_type: resolveOrgTypeForTarget(target),
      address: normalizeText(target.address),
      address_line_1: normalizeText(target.address_line_1),
      address_line_2: normalizeText(target.address_line_2),
      address_city: normalizeText(target.address_city),
      address_state: normalizeText(target.address_state),
      address_postal_code: normalizeText(target.address_postal_code),
      address_country: normalizeText(target.address_country),
      google_place_id: normalizeText(target.google_place_id),
      phone: normalizeText(target.contact_phone),
      email: normalizeText(target.contact_email),
      website: firstWebsiteFromDetails(target.details),
      grassroots_target_id: targetId,
      sourceLabel: CATEGORY_SOURCE_LABELS[category] || "Business",
      // A named person on the tracker row becomes the org's first affiliated contact.
      contact: personName
        ? {
            ...splitPersonName(personName),
            title: normalizeText(target.contact_source) || "Primary contact",
            email: normalizeText(target.contact_email),
            phone: normalizeText(target.contact_phone),
          }
        : null,
    });
  });

  orgs.sort((a, b) => a.name.localeCompare(b.name));
  return { orgs, individuals };
}

// How many marketing-tracker records (events / visits / partnerships) reference this
// org — by direct grassroots_target_id link or by matching name/organizer. Drives
// the "Events" column.
export function countDirectoryPairedTargets(org = {}, targets = []) {
  const linkId = normalizeUuid(org.grassroots_target_id);
  const nameKey = normalizeDirectorySearchText(org.name);
  if (!linkId && !nameKey) return 0;
  let count = 0;
  (targets || []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    if (linkId && normalizeUuid(t.id) === linkId) { count += 1; return; }
    if (nameKey && (normalizeDirectorySearchText(t.name) === nameKey || normalizeDirectorySearchText(t.organizer) === nameKey)) count += 1;
  });
  return count;
}

// Most recent time this org was touched — its own updated_at, any directory-history
// event, or a linked tracker record's last contact / update. Drives "Last interacted"
// so we can spot who we haven't talked to in a while. Returns "" if unknown.
export function getDirectoryLastInteractedAt(org = {}, { history = [], targets = [] } = {}) {
  const orgId = normalizeUuid(org.id);
  const linkId = normalizeUuid(org.grassroots_target_id);
  const nameKey = normalizeDirectorySearchText(org.name);
  const candidates = [org.updated_at, org.created_at];
  (history || []).forEach((entry) => {
    if (entry && normalizeUuid(entry.entity_id) === orgId) candidates.push(entry.event_at);
  });
  (targets || []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    const matches = (linkId && normalizeUuid(t.id) === linkId)
      || (nameKey && (normalizeDirectorySearchText(t.name) === nameKey || normalizeDirectorySearchText(t.organizer) === nameKey));
    if (matches) candidates.push(t.last_contact_date, t.updated_at);
  });
  const stamps = candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({ raw: value, time: new Date(value).getTime() }))
    .filter((entry) => !Number.isNaN(entry.time));
  if (stamps.length === 0) return "";
  return stamps.sort((a, b) => b.time - a.time)[0].raw;
}

// ─── Notes / per-org Updates feed ───────────────────────────────────────────
function parseDirectoryDate(value) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function buildDirectoryNotePayload(body, locationId, actor = {}, { orgId = null, contactId = null, nextContactDate = "" } = {}) {
  return {
    location_id: normalizeUuid(locationId),
    org_id: normalizeUuid(orgId) || null,
    contact_id: normalizeUuid(contactId) || null,
    body: stringValue(body),
    next_contact_date: parseDirectoryDate(nextContactDate),
    created_by_user_id: normalizeUuid(actor.userId) || null,
    created_by_name: actor.name || null,
  };
}

export function getActiveDirectoryNotes(notes = []) {
  return (notes || []).filter((note) => note && !note.deleted_at);
}

export function groupDirectoryNotesByOrg(notes = []) {
  return getActiveDirectoryNotes(notes).reduce((acc, note) => {
    const key = normalizeUuid(note.org_id);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});
}

// Merged, newest-first feed of an org's updates: user notes + its own directory
// history events. Drives the per-org Updates panel and its count — the directory's
// analogue of the marketing tracker's updates column.
export function buildDirectoryUpdatesFeed(org = {}, { notes = [], history = [] } = {}) {
  const orgId = normalizeUuid(org.id);
  if (!orgId) return [];
  const feed = [];
  getActiveDirectoryNotes(notes).forEach((note) => {
    if (normalizeUuid(note.org_id) !== orgId) return;
    feed.push({
      id: `note_${note.id}`,
      kind: "note",
      at: note.created_at,
      text: stringValue(note.body),
      by: normalizeText(note.created_by_name) || "Unknown",
      noteId: note.id,
      next: note.next_contact_date || "",
    });
  });
  (history || []).forEach((entry) => {
    if (!entry || normalizeUuid(entry.entity_id) !== orgId) return;
    feed.push({
      id: `evt_${entry.id}`,
      kind: "event",
      at: entry.event_at,
      text: `Organization ${getDirectoryHistoryEventLabel(entry.event_type).toLowerCase()}`,
      by: normalizeText(entry.changed_by_name) || "Unknown",
    });
  });
  return feed.filter((row) => row.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ─── History (powers the History subtab) ────────────────────────────────────
const HISTORY_EVENT_LABELS = {
  created: "Added",
  updated: "Updated",
  deleted: "Removed",
};

export function getDirectoryHistoryEventLabel(eventType) {
  return HISTORY_EVENT_LABELS[stringValue(eventType).toLowerCase()] || "Changed";
}

export function getDirectoryHistoryEventColor(eventType) {
  const normalized = stringValue(eventType).toLowerCase();
  if (normalized === "created") return "success";
  if (normalized === "deleted") return "danger";
  return "info";
}

export function summarizeDirectoryHistoryEntry(entry = {}) {
  const who = normalizeText(entry.changed_by_name) || "Someone";
  const what = stringValue(entry.entity_type) === "org" ? "organization" : "contact";
  const verb = getDirectoryHistoryEventLabel(entry.event_type).toLowerCase();
  const name = normalizeText(entry.entity_name) || "a record";
  return `${who} ${verb} ${what} “${name}”`;
}

// Group a date-descending history feed into day buckets for the History subtab.
export function groupDirectoryHistoryByDay(history = []) {
  const groups = new Map();
  [...(history || [])]
    .filter((entry) => entry && entry.event_at)
    .sort((a, b) => String(b.event_at).localeCompare(String(a.event_at)))
    .forEach((entry) => {
      const day = String(entry.event_at).slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(entry);
    });
  return [...groups.entries()].map(([day, entries]) => ({ day, entries }));
}
