// One-off: redact real PII from the enterprise-directory seed migration so it is
// safe in a public repo. Parses the dollar-quoted ($k9dir$) JSON payload, replaces
// names/emails/phones with deterministic synthetic values, consistently remaps the
// name-derived relational keys (person_key/child_key/parent_key), blanks free-text
// notes, and re-serializes. Also writes a real->fake map (gitignored) for the
// history purge. Usage: node scripts/redact-directory-pii.mjs <file>
import { readFileSync, writeFileSync } from "fs";
import { fakeFirst, fakeLast, fakeFull, fakeEmail, fakePhone } from "../src/shared/demoMode.js";

const FILE = process.argv[2] || "supabase/migrations/20260512050708_enterprise_directory_org_chart.sql";
const TAG = "$k9dir$";
const src = readFileSync(FILE, "utf8");
const a = src.indexOf(TAG);
const b = src.indexOf(TAG, a + TAG.length);
if (a < 0 || b < 0) { console.error("dollar-quote delimiters not found"); process.exit(1); }
const jsonText = src.slice(a + TAG.length, b);
const data = JSON.parse(jsonText); // throws if not valid JSON → safe abort

const map = new Map(); // real -> fake (for history redaction)
const record = (real, fake) => { if (real && typeof real === "string" && real !== fake) map.set(real, fake); return fake; };

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// 1) Build a stable person-key remap from people[].person_key (name-derived slugs).
const keyMap = new Map();
(data.people || []).forEach((p, i) => {
  if (p && p.person_key) keyMap.set(p.person_key, record(p.person_key, `${slugify(fakeFull(p.person_key))}-${i + 1}`));
});

const NAME_KEYS = new Set(["first_name", "last_name", "display_name", "full_name", "name", "preferred_name"]);
const EMAIL_KEYS = new Set(["email", "work_email", "personal_email", "resort_email", "contact_email"]);
const PHONE_KEYS = new Set(["phone", "work_phone", "resort_phone", "cell_phone", "mobile", "telephone", "contact_phone"]);
const KEYREF_KEYS = new Set(["person_key", "child_key", "parent_key"]);
const BLANK_KEYS = new Set(["note", "notes", "detail"]);

const scrubString = (s) => s
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (m.endsWith("@example.com") ? m : record(m, fakeEmail(m))))
  .replace(/\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g, (m) => record(m, fakePhone(m)))
  .replace(/\/(?:Users|home)\/[^\n"]*/gi, "(local source file)"); // strip local machine paths (leaks a username)

function scrub(node) {
  if (Array.isArray(node)) return node.map(scrub);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && v) {
        if (NAME_KEYS.has(k)) out[k] = record(v, k.includes("first") ? fakeFirst(v) : k.includes("last") ? fakeLast(v) : fakeFull(v));
        else if (EMAIL_KEYS.has(k)) out[k] = record(v, fakeEmail(v));
        else if (PHONE_KEYS.has(k)) out[k] = record(v, fakePhone(v));
        else if (KEYREF_KEYS.has(k)) out[k] = keyMap.get(v) || v;
        else if (BLANK_KEYS.has(k)) { record(v, ""); out[k] = ""; }
        else out[k] = scrubString(v);
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }
  return node;
}

const scrubbed = scrub(data);
const newJson = JSON.stringify(scrubbed, null, 2);
let outFile = src.slice(0, a + TAG.length) + newJson + src.slice(b);

// Apply the real->fake map across the WHOLE file so hardcoded SQL literals outside
// the JSON (e.g. view CASE branches referencing 'alan-leibman') stay consistent.
// Longest keys first so substrings don't corrupt longer matches.
for (const [real, fake] of [...map].sort((x, y) => y[0].length - x[0].length)) {
  if (real) outFile = outFile.split(real).join(fake);
}
// Strip local machine paths anywhere (e.g. SQL comments) — they leak a username.
outFile = outFile.replace(/\/(?:Users|home)\/[^\n"]*/gi, "(local source file)");
writeFileSync(FILE, outFile);

// Emit real->fake map (gitignored) for the history purge's --replace-text.
const rules = [...map].filter(([r]) => r.length >= 4).map(([r, f]) => `${r}==>${f}`).join("\n") + "\n";
writeFileSync("scripts/.pii-redactions.txt", rules);
console.log(`redacted ${map.size} unique values; wrote scripts/.pii-redactions.txt`);
