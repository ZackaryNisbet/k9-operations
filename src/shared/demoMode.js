// © 2026 K9 Operations LLC. All Rights Reserved.
// Demo mode — the "Demo" user group.
//
// Goal: let a Demo account walk the ENTIRE app (every page, read-only) while real
// people's identities are never exposed. Person names + contact info are replaced
// with deterministic, realistic fakes at the data layer, BEFORE anything reaches
// React/the DOM, so "Inspect Element" only ever sees the obfuscated values (there
// is no real value hidden behind a CSS box to peel away). Dog names, product names,
// numbers, dates, etc. are left intact — only PII is scrambled.
//
// Robustness boundary (be honest): this masks everything the browser RENDERS, so
// the DOM / React tree / element inspector never contain real PII. A determined
// user with devtools could still read the raw PostgREST bytes in the Network tab or
// disable this wrapper from the JS console — defeating THAT requires server-side
// masking (RLS policies / SECURITY DEFINER views, like `*_safe` views already in
// this repo). That hardening is the recommended production follow-up; this layer is
// the fast, fully client-side obfuscation for a shareable demo.

export const DEMO_ROLE = "demo";

export function isDemoRole(role) {
  return String(role || "").trim().toLowerCase() === DEMO_ROLE;
}

// ── Activation ────────────────────────────────────────────────────────────
// Authoritative trigger: the signed-in profile's role === 'demo' (set by
// AuthProvider). A `?demo=1` URL param (or sessionStorage) is a preview/testing
// trigger for the current tab only — it never persists to localStorage, so a real
// owner can't get stuck in demo mode, and it auto-clears when the tab closes.
const PREVIEW_KEY = "k9_demo_preview";

function readPreviewFlag() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      try { window.sessionStorage.setItem(PREVIEW_KEY, "1"); } catch { /* ignore */ }
      return true;
    }
    if (params.get("demo") === "0") {
      try { window.sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
      return false;
    }
    return window.sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

const _previewForced = readPreviewFlag();
let _roleActive = false;

export function setDemoActiveFromRole(role) {
  _roleActive = isDemoRole(role);
}

export function isDemoActive() {
  return _previewForced || _roleActive;
}

// ── Deterministic fake identities ──────────────────────────────────────────
const FIRST_POOL = [
  "Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Quinn", "Harper",
  "Rowan", "Emerson", "Sawyer", "Hayden", "Parker", "Reese", "Skyler", "Marlowe",
  "Devon", "Ellis", "Finley", "Drew", "Blake", "Cameron", "Logan", "Peyton",
  "Dakota", "Sage", "Tatum", "Remy", "Aubrey", "Spencer", "Elliot", "Adair",
];
const LAST_POOL = [
  "Carter", "Bennett", "Brooks", "Hayes", "Reed", "Foster", "Sloan", "Mercer",
  "Donovan", "Hale", "Vance", "Ellison", "Marsh", "Calloway", "Whitfield", "Ramsey",
  "Sutton", "Forsythe", "Lambert", "Underwood", "Prescott", "Beckett", "Larsen",
  "Howell", "Cross", "Maddox", "Ashford", "Delgado", "Nolan", "Rhodes", "Sterling",
];

function hashStr(value) {
  const str = String(value);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(pool, seed) {
  return pool[hashStr(seed) % pool.length];
}

export function fakeFirst(seed) { return pick(FIRST_POOL, "f:" + seed); }
export function fakeLast(seed) { return pick(LAST_POOL, "l:" + seed); }
export function fakeFull(seed) { return `${fakeFirst(seed)} ${fakeLast(seed)}`; }
export function fakeEmail(seed) {
  const f = fakeFirst(seed).toLowerCase();
  const l = fakeLast(seed).toLowerCase();
  const n = (hashStr("e:" + seed) % 90) + 10;
  return `${f}.${l}${n}@example.com`;
}
export function fakePhone(seed) {
  const h = hashStr("p:" + seed);
  const mid = String(200 + (h % 800)).padStart(3, "0");
  const last = String(h % 10000).padStart(4, "0");
  return `(555) ${mid}-${last}`;
}

// ── Column-name rules ───────────────────────────────────────────────────────
// Keyed by EXACT column name (case-insensitive), so this is table-agnostic: a
// person column called `first_name` is scrubbed wherever it appears (top-level rows
// or nested jsonb like ignite form_data). Generic `name` is intentionally NOT here
// so dog names, product names, room names, event titles, etc. stay real.
const FIRST_KEYS = new Set(["first_name", "owner_first_name", "fname", "firstname", "first"]);
const LAST_KEYS = new Set(["last_name", "owner_last_name", "lname", "lastname", "last", "surname"]);
const FULL_KEYS = new Set([
  "full_name", "fullname", "display_name", "displayname", "owner_name", "ownername",
  "owner_full_name", "client_name", "clientname", "client_full_name", "customer_name",
  "contact_name", "employee_name", "employeename", "staff_name", "user_name", "username",
  "reviewer_name", "caller_name", "emergency_contact_name", "member_name", "person_name",
  "account_name", "guardian_name", "guardian", "parent_name", "interviewer_name",
  "interviewee_name", "candidate_name", "applicant_name", "signed_by_name", "owner", "client",
  "completed_by_name", "created_by_name", "updated_by_name", "assigned_to_name",
]);
const EMAIL_KEYS = new Set(["email", "email_address", "contact_email", "owner_email", "user_email", "work_email", "personal_email"]);
const PHONE_KEYS = new Set([
  "phone", "phone_number", "cell_phone", "home_phone", "mobile", "mobile_phone",
  "contact_phone", "emergency_contact_phone", "owner_phone", "telephone", "work_phone",
]);
// Free-text that frequently embeds names / numbers — blanked rather than faked.
const BLANK_KEYS = new Set([
  "notes", "notes_reservation", "internal_notes", "private_notes", "comment", "comments",
  "call_transcription", "transcription", "address_1", "address_2", "address", "street",
  "street_address", "line1", "line2",
]);
// Generic name-ish keys that are ONLY personal when the surrounding object is clearly
// a person (employee/contact). This lets `name` stay real for dogs/products/rooms/etc.
// while still scrubbing it on person rows that store the name under `name`.
const PERSON_CTX_NAME_KEYS = new Set(["name", "preferred_name", "legal_name", "nickname", "goes_by"]);
// Keys whose presence marks the CONTAINING object as a person (employee/contact),
// not a dog/product. Deliberately excludes owner_* (those mark a RELATED person, so
// a dog row with an owner field must NOT have its own `name` (the dog) scrubbed).
const PERSON_SIBLING_KEYS = new Set([
  "first_name", "last_name", "email", "email_address", "work_email", "phone", "phone_number",
  "cell_phone", "home_phone", "position", "position_title", "job_title", "labor_employee_id",
  "employee_id", "hire_date", "termination_date", "employment_status", "commitment",
  "pay_rate", "wage", "role_title",
]);

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// Sentinel: the key is not a recognized PII leaf, so the caller should recurse into
// its value (which may itself be an object/array containing nested PII).
const NOT_PII = Symbol("not_pii");

function scrubLeaf(key, value, looksPerson) {
  const k = String(key).toLowerCase();
  if (BLANK_KEYS.has(k)) {
    if (typeof value === "string") return value.trim() ? "" : value;
    if (Array.isArray(value)) return [];
    return NOT_PII; // object → recurse (may hold structured PII)
  }
  if (FIRST_KEYS.has(k)) return isNonEmptyString(value) ? fakeFirst(value) : NOT_PII;
  if (LAST_KEYS.has(k)) return isNonEmptyString(value) ? fakeLast(value) : NOT_PII;
  if (FULL_KEYS.has(k)) return isNonEmptyString(value) ? fakeFull(value) : NOT_PII;
  if (looksPerson && PERSON_CTX_NAME_KEYS.has(k)) return isNonEmptyString(value) ? fakeFull(value) : NOT_PII;
  if (EMAIL_KEYS.has(k)) return isNonEmptyString(value) ? fakeEmail(value) : NOT_PII;
  if (PHONE_KEYS.has(k)) return isNonEmptyString(value) ? fakePhone(value) : NOT_PII;
  return NOT_PII;
}

// Recursively scrub PII anywhere in a PostgREST/RPC JSON payload (object or array).
export function scrubPiiDeep(input) {
  if (Array.isArray(input)) {
    const out = new Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = scrubPiiDeep(input[i]);
    return out;
  }
  if (input && typeof input === "object") {
    const keys = Object.keys(input);
    const looksPerson = keys.some((key) => PERSON_SIBLING_KEYS.has(key.toLowerCase()));
    const out = {};
    for (const key of keys) {
      const leaf = scrubLeaf(key, input[key], looksPerson);
      out[key] = leaf === NOT_PII ? scrubPiiDeep(input[key]) : leaf;
    }
    return out;
  }
  return input;
}

// ── Composed free-text names (server-built titles) ─────────────────────────
// Some server RPCs concatenate a person's name into a display string (e.g. the
// aggregated calendar emits subtitle "Sarah Gonzalez" or title "30-Day Review ·
// Sarah Gonzalez"). A key-based scrubber can't see those, so we fake any standalone
// person-name token — only for sources we know carry employee names (so business /
// event / vet names on other sources stay real). Full robustness for composed text
// ultimately belongs server-side (a demo-safe RPC); this covers the known surfaces.
const NAME_TOKEN = "[A-Z][a-z'’.\\-]+";
const STANDALONE_NAME_RE = new RegExp(`^${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,2}$`);
const SEPARATORS = [" · ", " — ", " – ", " - ", ": "];

function looksLikePersonName(s) {
  return STANDALONE_NAME_RE.test(String(s).trim());
}

function fakeComposedName(str) {
  if (!isNonEmptyString(str)) return str;
  for (const sep of SEPARATORS) {
    const i = str.lastIndexOf(sep);
    if (i >= 0) {
      const tail = str.slice(i + sep.length);
      if (looksLikePersonName(tail)) return str.slice(0, i + sep.length) + fakeFull(tail);
    }
  }
  return looksLikePersonName(str) ? fakeFull(str) : str;
}

const EMPLOYEE_CALENDAR_SOURCES = new Set(["labor", "compliance", "training"]);

export function isComposedNameEndpoint(url) {
  return /\/rest\/v1\/rpc\/get_calendar_events/.test(String(url || ""));
}

// Post-process the calendar RPC payload: anonymize the person name baked into
// employee-source event titles/subtitles, leaving review types + other sources intact.
export function scrubComposedNames(data) {
  if (!Array.isArray(data)) return data;
  return data.map((row) => {
    if (!row || typeof row !== "object" || !EMPLOYEE_CALENDAR_SOURCES.has(row.source)) return row;
    return { ...row, title: fakeComposedName(row.title), subtitle: fakeComposedName(row.subtitle) };
  });
}

// ── Read-only enforcement ───────────────────────────────────────────────────
// Demo accounts can navigate everything but must not persist changes. We block
// mutating REST/storage calls at the network chokepoint (the surest backstop, even
// if a write button is missed in the UI). RPC + auth + GET reads pass through.
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function isBlockedWrite(url, method) {
  if (!isDemoActive()) return false;
  const m = String(method || "GET").toUpperCase();
  if (!WRITE_METHODS.has(m)) return false;
  const u = String(url || "");
  const isRpc = /\/rest\/v1\/rpc\//.test(u);
  const isRestTable = /\/rest\/v1\//.test(u) && !isRpc;
  const isStorageWrite = /\/storage\/v1\/(object|upload)/.test(u);
  return isRestTable || isStorageWrite;
}

export function shouldScrubResponse(url, method, contentType, ok) {
  if (!isDemoActive()) return false;
  if (!ok) return false;
  if (!String(contentType || "").includes("application/json")) return false;
  const u = String(url || "");
  // Scrub REST table reads, RPC results, and edge-function payloads — any JSON the
  // app might render names from. (Writes are already short-circuited upstream.)
  return /\/rest\/v1\//.test(u) || /\/functions\/v1\//.test(u);
}
