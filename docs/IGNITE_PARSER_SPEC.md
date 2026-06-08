# Ignite Email Parser — Rewrite Spec

> Implementation specification for rewriting the Ignite email parser
> to work with real Ignite Visibility notification emails.
>
> Companion document to: `docs/IGNITE_URL_GUIDE.md`
>
> Last updated: 2026-03-15

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Current Parser Issues](#2-current-parser-issues)
3. [New Parser Architecture](#3-new-parser-architecture)
4. [Parsing Strategy](#4-parsing-strategy)
5. [Field Extraction Rules](#5-field-extraction-rules)
6. [Profile ID Extraction from URLs](#6-profile-id-extraction-from-urls)
7. [Recording URL Extraction](#7-recording-url-extraction)
8. [Lead Type Detection](#8-lead-type-detection)
9. [Name Extraction Logic](#9-name-extraction-logic)
10. [Output Schema](#10-output-schema)
11. [Test Cases](#11-test-cases)
12. [Migration Plan](#12-migration-plan)
13. [Files to Modify](#13-files-to-modify)

---

## 1. Problem Statement

The current email parser (`parseRegex` in `ignite-webhook/index.ts`) was built against fabricated sample emails that used `data-field` attributes for easy extraction. Real Ignite emails are standard HTML table emails with:

- **No `data-field` attributes** — zero. None.
- **Table-row layout** — field labels in the first `<td>`, values in the second `<td>`
- **Profile ID only in embedded URLs** — not as a text field
- **Reversed caller names** — `{Last} {First}` format
- **Inconsistent geo formats** — abbreviations for phone calls, full names for appointments

The parser must be completely rewritten to handle the real email HTML structure.

---

## 2. Current Parser Issues

### 2.1 `parseRegex()` — Lines 96–136

```typescript
// BROKEN: Looks for data-field attributes that don't exist
const dataFieldRe = /<(?:span|td|div)[^>]*data-field="([^"]+)"[^>]*>([^<]*)/g;

// BROKEN: Looks for data-field on <a> tags that don't exist
const linkFieldRe = /<a[^>]*data-field="call_recording_url"[^>]*href="([^"]+)"[^>]*>/g;

// PARTIALLY WORKS: The table row fallback does work, but...
// - Label normalization is lossy (strips all non-alphanumeric)
// - No special handling for multi-value cells (recording links, transcription)
// - No profile ID extraction from URLs
// - Recording href extraction in fallback only checks for generic "recording" text
```

### 2.2 `extractName()` — Lines 82–94

```typescript
// BROKEN: Looks for fields.first_name / fields.last_name (never set)
// PARTIALLY WORKS: Falls back to fields.caller_name, but doesn't handle
// the REVERSED name format ({Last} {First})
```

### 2.3 `parseIgniteEmail()` — Lines 156–207

```typescript
// BROKEN: Looks for fields.ignite_profile_id (never set by real emails)
// This means locationId lookup always fails → "No active location configured"
```

### 2.4 Sample Emails — `src/ignite/sampleEmails.js`

Entirely fabricated HTML with `data-field` attributes. Must be replaced with real samples.

---

## 3. New Parser Architecture

### 3.1 Parsing Pipeline

```
Raw HTML
  │
  ├─ 1. extractTableRows(html) → Map<string, { text: string, html: string }>
  │     Parse all <tr> rows, extract label → { cleaned text, raw inner HTML }
  │
  ├─ 2. extractProfileIdFromUrls(html) → string | null
  │     Regex scan all hrefs for /profile/{ID}/
  │
  ├─ 3. extractLeadIdFromUrls(html) → string | null
  │     Regex scan for ?lid={ID} or use text field fallback
  │
  ├─ 4. extractRecordingUrls(html) → { play: string, download: string } | null
  │     Find recording/{HASH}/play and /download hrefs
  │
  ├─ 5. detectLeadType(subject, heading) → "phone_call" | "web_form" | "ad_click"
  │     Check <h2> heading text + subject line
  │
  ├─ 6. extractLeadSource(html) → string | null
  │     Extract text from the <strong> in the source paragraph
  │
  ├─ 7. buildParsedLead(fields, urls, metadata) → ParsedLead
  │     Assemble all extracted data into final structure
  │
  └─ Output: ParsedLead object
```

### 3.2 Key Design Decisions

1. **Table row parsing is the primary strategy.** No `data-field` fallback needed.
2. **Each row stores both cleaned text AND raw HTML.** Some fields (Recording, Transcription, Lead Page) need HTML parsing for embedded links.
3. **Profile ID comes from URL extraction, not field extraction.** This is a separate step.
4. **Label normalization must be precise.** Use a label-to-key mapping rather than generic regex normalization.

---

## 4. Parsing Strategy

### 4.1 Table Row Extraction

The core extraction function parses all `<tr>` elements with exactly two `<td>` children:

```typescript
function extractTableRows(html: string): Map<string, { text: string; html: string }> {
  const rows = new Map<string, { text: string; html: string }>();
  
  // Match table rows with two cells
  const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;
  
  while ((match = rowRe.exec(html)) !== null) {
    const labelHtml = match[1];
    const valueHtml = match[2];
    
    // Clean label: strip tags, trim, normalize whitespace
    const label = labelHtml.replace(/<[^>]+>/g, "").trim();
    
    // Clean value text: strip tags, collapse whitespace
    const text = valueHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    
    if (label) {
      rows.set(label, { text, html: valueHtml.trim() });
    }
  }
  
  return rows;
}
```

### 4.2 Label-to-Key Mapping

Instead of generic normalization, use an explicit mapping from HTML label text to internal field keys:

```typescript
const LABEL_MAP: Record<string, string> = {
  // Common fields
  "Time": "time",
  "Profile": "profile",
  "City": "city",
  "State": "state",
  "Zip": "zip",
  "Country": "country",
  "Multi Unit Name": "multi_unit_name",
  "Lead ID": "lead_id",
  
  // Phone call specific
  "Phone Name": "phone_name",
  "Tracking Number": "tracking_number",
  "Destination Number": "destination_number",
  "Caller Number": "caller_number",
  "Caller Name": "caller_name",
  "Answer Status": "answer_status",
  "Line Type": "line_type",
  "Call Duration": "call_duration",
  "Recording": "recording",
  "Call Transcription": "call_transcription",
  
  // Appointment specific
  "Lead Page": "lead_page",
  "Landing Page": "landing_page",
  "Browser": "browser",
  "Device": "device",
  "Sales Value": "sales_value",
  "BookingTitle": "booking_title",
  "Services": "services",
  "Dates": "dates",
  "EstimatedSubtotal": "estimated_subtotal",
  "EstimatedTax": "estimated_tax",
  "EstimatedTotal": "estimated_total",
  "AgreedToTerms": "agreed_to_terms",
};
```

---

## 5. Field Extraction Rules

### 5.1 Simple Text Fields

For most fields, the cleaned text value is sufficient:

```typescript
const time = fields.get("Time")?.text;          // "03/15/2026 at 2:39 PM"
const city = fields.get("City")?.text;          // "Seattle"
const leadId = fields.get("Lead ID")?.text;     // "225014635"
const callerName = fields.get("Caller Name")?.text; // "Mack Elizabeth"
```

### 5.2 Phone Number Fields

Phone numbers come as `+1 XXX-XXX-XXXX`. The existing `normalizePhone()` function handles stripping non-digits, but note these are already well-formatted.

```typescript
const callerNumber = fields.get("Caller Number")?.text;   // "+1 206-388-7385"
const trackingNumber = fields.get("Tracking Number")?.text; // "+1 856-322-8044"
```

### 5.3 Recording Field (requires HTML parsing)

The Recording cell contains two `<a>` tags. Use the raw HTML:

```typescript
function extractRecordingFromCell(cellHtml: string): {
  playUrl: string | null;
  downloadUrl: string | null;
  hash: string | null;
} {
  const playMatch = cellHtml.match(/href="([^"]*\/recording\/[^"]*\/play[^"]*)"/);
  const downloadMatch = cellHtml.match(/href="([^"]*\/recording\/[^"]*\/download[^"]*)"/);
  const hashMatch = cellHtml.match(/recording\/(RE[0-9a-f]{32})\//);
  
  return {
    playUrl: playMatch?.[1] || null,
    downloadUrl: downloadMatch?.[1] || null,
    hash: hashMatch?.[1] || null,
  };
}
```

### 5.4 Call Transcription (contains HTML)

The transcription contains `<br />` separated text. Convert to structured format:

```typescript
function parseTranscription(cellHtml: string): string {
  return cellHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}
```

### 5.5 Services Field (JSON string)

Parse the JSON array from the text value:

```typescript
function parseServices(text: string): Array<{ Name: string; Quantity: string; Rate: string }> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

### 5.6 Lead Page URL (requires HTML parsing)

Extract the actual href, not the display text (which is truncated):

```typescript
function extractLinkHref(cellHtml: string): string | null {
  const match = cellHtml.match(/href="([^"]+)"/);
  return match?.[1] || null;
}
```

### 5.7 Sales Value

Strip the dollar sign and parse as float:

```typescript
function parseSalesValue(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}
```

---

## 6. Profile ID Extraction from URLs

### Strategy

Scan the entire HTML for any href containing `/profile/{digits}/`:

```typescript
function extractProfileId(html: string): string | null {
  const match = html.match(/\/profile\/(\d+)\//);
  return match?.[1] || null;
}
```

### Validation

The profile ID should be the same across all matching URLs in a single email. If multiple different profile IDs are found (shouldn't happen), log a warning and use the first.

### Fallback

If no profile ID is found in URLs (e.g., a new email type without quotable buttons), fall back to looking up by the "Profile" text field value (e.g., "Cherry Hill") in the `ignite_config` table:

```typescript
// Primary: from URL
let profileId = extractProfileId(html);

// Fallback: from location name
if (!profileId) {
  const profileName = fields.get("Profile")?.text;
  if (profileName) {
    const { data } = await supabase
      .from("ignite_config")
      .select("ignite_profile_id")
      .ilike("location_name", profileName)
      .single();
    profileId = data?.ignite_profile_id || null;
  }
}
```

---

## 7. Recording URL Extraction

### From the Recording Cell

Primary extraction — parse the Recording row's HTML (see Section 5.3).

### Fallback: Global HTML Scan

If the Recording field doesn't yield results, scan the full HTML:

```typescript
function extractRecordingFromHtml(html: string): string | null {
  const match = html.match(
    /href="(https:\/\/leads\.idigitalstrategies\.com\/recording\/RE[0-9a-f]{32}\/download[^"]*)"/
  );
  return match?.[1] || null;
}
```

### What to Store

Store the **download URL** (not play) as `call_recording_url` in the database. The download URL provides a direct file download, which is more useful for our purposes.

---

## 8. Lead Type Detection

### Current Logic (keep, but enhance)

```typescript
function detectLeadType(subject: string, html: string): string {
  const s = subject.toLowerCase();
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const heading = h2Match ? h2Match[1].replace(/<[^>]+>/g, "").trim().toLowerCase() : "";
  
  if (s.includes("phone call") || heading.includes("phone call")) return "phone_call";
  if (s.includes("appointment") || heading.includes("appointment")) return "web_form";
  if (s.includes("ad click") || heading.includes("ad click")) return "ad_click";
  
  // Fallback: check for recording links (only phone calls have them)
  if (/\/recording\/RE[0-9a-f]{32}\//.test(html)) return "phone_call";
  
  return "web_form"; // default
}
```

### Subject Line Pattern

The subject always follows: `New {Type} Received | {Location}`

Extract location from subject:
```typescript
function extractLocationFromSubject(subject: string): string | null {
  const match = subject.match(/\|\s*(.+)$/);
  return match?.[1]?.trim() || null;
}
```

---

## 9. Name Extraction Logic

### Phone Call Emails

Caller Name is **reversed**: `{Last} {First}`.

```typescript
function extractCallerName(callerNameText: string): { firstName: string; lastName: string } {
  if (!callerNameText) return { firstName: "", lastName: "" };
  
  const parts = callerNameText.trim().split(/\s+/);
  
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  
  // Ignite format: {Last} {First} — reverse it
  const lastName = parts[0];
  const firstName = parts.slice(1).join(" ");
  
  return { firstName, lastName };
}
```

### Appointment Emails

No contact name is present. The parser should set firstName/lastName to empty strings. The booking title contains a pet name that could be used for fuzzy matching:

```typescript
function extractPetNameFromBookingTitle(title: string): string | null {
  // Format: "Boarding | Boarding | Executive Room (All Inclusive) Request for {PetName}"
  const match = title.match(/Request for (.+)$/i);
  return match?.[1]?.trim() || null;
}
```

---

## 10. Output Schema

### ParsedLead Interface (updated)

```typescript
interface ParsedLead {
  // Type classification
  leadType: "phone_call" | "web_form" | "ad_click";
  
  // Contact info (phone call only)
  firstName: string;
  lastName: string;
  clientName: string | null;
  email: string | null;             // Not available in current email types
  phone: string | null;             // callerNumber for phone calls
  phoneRaw: string | null;          // Original format
  
  // Recording (phone call only)
  callRecordingUrl: string | null;  // Download URL
  callRecordingHash: string | null; // RE... hash for deduplication
  callTranscription: string | null; // Cleaned text
  
  // Source & tracking
  sourceDetail: string | null;      // Text from "This lead came from <strong>..."
  
  // Booking info (appointment only)
  bookingTitle: string | null;
  services: object[] | null;        // Parsed JSON
  salesValue: number | null;
  estimatedSubtotal: number | null;
  estimatedTax: number | null;
  petName: string | null;           // Extracted from bookingTitle
  
  // Lead page (appointment only)
  leadPageUrl: string | null;
  landingPageUrl: string | null;
  
  // Call details (phone call only)
  answerStatus: string | null;      // "Answered", "Missed", etc.
  callDuration: string | null;      // Natural language format
  lineType: string | null;          // "Mobile", "Landline", etc.
  trackingNumber: string | null;
  destinationNumber: string | null;
  
  // Location
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  
  // Ignite identifiers
  igniteProfileId: string | null;   // Extracted from URLs
  igniteLeadId: string | null;      // From Lead ID field
  
  // All extracted fields for form_data column
  formData: Record<string, string>;
  
  // Metadata
  rawSubject: string;
  parsedAt: string;
  error?: string;
}
```

---

## 11. Test Cases

### 11.1 Phone Call Email Test

**Input:** Real phone call HTML from `src/ignite/samples/phone_call_real.html`

**Expected Output:**
```json
{
  "leadType": "phone_call",
  "firstName": "Elizabeth",
  "lastName": "Mack",
  "clientName": "Elizabeth Mack",
  "phone": "12063887385",
  "phoneRaw": "+1 206-388-7385",
  "callRecordingUrl": "https://leads.idigitalstrategies.com/recording/RE884711cffa9f142c806ebf2c1a7ef00d/download",
  "callRecordingHash": "RE884711cffa9f142c806ebf2c1a7ef00d",
  "sourceDetail": "K9 Resorts - Cherry Hill (none)",
  "answerStatus": "Answered",
  "callDuration": "1 minute and 18 seconds",
  "lineType": "Landline",
  "trackingNumber": "+1 856-322-8044",
  "destinationNumber": "+1 856-208-4888",
  "city": "Seattle",
  "state": "WA",
  "zip": "98154",
  "country": "US",
  "igniteProfileId": "156865",
  "igniteLeadId": "225014635"
}
```

### 11.2 Appointment Email Test

**Input:** Real appointment HTML from `src/ignite/samples/appointment_real.html`

**Expected Output:**
```json
{
  "leadType": "web_form",
  "firstName": "",
  "lastName": "",
  "clientName": null,
  "phone": null,
  "salesValue": 256.00,
  "bookingTitle": "Boarding | Boarding | Executive Room (All Inclusive) Request for Mercy",
  "petName": "Mercy",
  "services": [{"Name": "BATH (1)", "Quantity": "QTY", "Rate": "$217.00"}],
  "leadPageUrl": "https://your-gingr-subdomain.portal.gingrapp.com/public/login/?utm_source=google&utm_medium=organic&landing_page=https://www.k9resorts.com/cherry-hill/",
  "landingPageUrl": "https://www.k9resorts.com/cherry-hill/",
  "sourceDetail": "google organic",
  "city": "Westampton",
  "state": "New Jersey",
  "zip": "08060",
  "country": "United States",
  "igniteProfileId": "156865",
  "igniteLeadId": "225007456",
  "estimatedSubtotal": 256.00,
  "estimatedTax": 14.38
}
```

### 11.3 Edge Case Tests

| Test | Input | Expected |
|------|-------|----------|
| Empty HTML | `""` | `{ error: "No email HTML provided" }` |
| Non-Ignite sender | from: `other@example.com` | `{ error: "Unexpected sender: other@example.com" }` |
| Missing profile ID | HTML with no `/profile/` URLs | `igniteProfileId: null`, fallback to location name lookup |
| Single-name caller | "Smith" | `{ firstName: "Smith", lastName: "" }` |
| Three-word caller name | "Van Der Berg John" | `{ firstName: "John", lastName: "Van Der Berg" }` — tricky, may need heuristic |
| Empty recording cell | `<td></td>` | `callRecordingUrl: null` |
| Missed call (no recording) | No recording row | `callRecordingUrl: null` |
| OTP email | Subject: "Verification Code \| Ignite Visibility" | Skip processing (not a lead) |

---

## 12. Migration Plan

### Phase 1: Drop-in Replacement (Non-breaking)

1. Add new parsing functions alongside existing ones
2. Store real email samples in `src/ignite/samples/`
3. Add unit tests using real samples
4. Deploy updated parser — it handles both old and new formats

### Phase 2: Clean Up

1. Remove `sampleEmails.js` (fabricated data)
2. Remove `data-field` regex logic from parser
3. Update any UI code that references old field names

### Phase 3: Monitoring

1. Log all parsed leads with `parsedAt` timestamp
2. Alert on parse failures (empty critical fields)
3. Track match rate over time

---

## 13. Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/ignite-webhook/index.ts` | Rewrite `parseRegex()`, update `extractName()`, add `extractProfileId()`, update `parseIgniteEmail()` |
| `src/ignite/sampleEmails.js` | Replace with real email samples or delete |
| `src/ignite/samples/phone_call_real.html` | **NEW** — real phone call email HTML |
| `src/ignite/samples/appointment_real.html` | **NEW** — real appointment email HTML |
| `docs/IGNITE_URL_GUIDE.md` | **NEW** — comprehensive URL reference |
| `docs/IGNITE_PARSER_SPEC.md` | **NEW** — this document |
| `src/kol/settings/IgniteSettingsTab.jsx` | May need updates for new field names in test results display |
| `ignite_leads` table (Supabase) | Consider adding: `call_recording_hash`, `call_transcription`, `booking_title`, `pet_name`, `sales_value`, `ignite_lead_id` columns |

### Database Schema Changes (Recommended)

```sql
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS call_recording_hash text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS call_transcription text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS booking_title text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS pet_name text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS sales_value numeric(10,2);
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS ignite_lead_id text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS answer_status text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS lead_page_url text;
ALTER TABLE ignite_leads ADD COLUMN IF NOT EXISTS landing_page_url text;
```
