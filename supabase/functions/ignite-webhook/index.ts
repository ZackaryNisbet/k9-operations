// ============================================================================
// Ignite Webhook Edge Function — K9 Operations
// Receives Ignite lead emails via Resend inbound webhooks or direct POST,
// parses them, matches to Gingr clients, and stores in ignite_leads.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Inlined Constants ──────────────────────────────────────────────────────

const IGNITE_SENDER_EMAIL = "noreply@leads.idigitalstrategies.com";

const LEAD_TYPES = {
  WEB_FORM: "web_form",
  PHONE_CALL: "phone_call",
  AD_CLICK: "ad_click",
} as const;

const MATCH_STATUSES = {
  NEW: "new",
  MATCHED: "matched",
  REVIEW: "review",
  NO_MATCH: "no_match",
} as const;

const MATCH_TYPES = {
  EMAIL: "email",
  PHONE: "phone",
  NAME: "name",
  PHONE_NAME: "phone_name",
} as const;

const AUTO_MATCH_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.5;

const MATCH_CONFIDENCE = {
  EMAIL_EXACT: 1.0,
  PHONE_EXACT: 0.95,
  PHONE_NAME_COMBO: 0.9,
  NAME_HIGH: 0.8,
  NAME_MEDIUM: 0.65,
  NAME_LOW: 0.5,
};

// ─── Inlined Parser (v2 — rewritten for real Ignite emails) ────────────────

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  if (digits.length === 11 && digits[0] === "1") return digits;
  return digits || null;
}

// ─── Label-to-key mapping for table row extraction ─────────────────────────
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
  // Contact / booking form fields
  "Full Name": "full_name",
  "Phone Number": "phone_number",
  "First Name": "first_name",
  "Last Name": "last_name",
  "Email": "email",
  "Email Address": "email_address",
  "Phone": "phone",
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

// Keys promoted to top-level parsed fields (excluded from form_data)
const PROMOTED_KEYS = new Set([
  "caller_name", "caller_number", "tracking_number",
  "recording", "call_transcription", "lead_id",
  "lead_page", "landing_page", "booking_title",
  "services", "sales_value", "profile",
  "estimated_subtotal", "estimated_tax", "estimated_total",
]);

// ─── Table Row Extraction ──────────────────────────────────────────────────

interface RowData {
  text: string;
  html: string;
}

function extractTableRows(rawHtml: string): Map<string, RowData> {
  const rows = new Map<string, RowData>();
  // Label cell may be <td> (Ignite) or <th> (the booking/availability form),
  // and the booking form's labels carry a trailing colon ("First Name:").
  const rowRe =
    /<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(rawHtml)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, "").replace(/:\s*$/, "").trim();
    const valueHtml = m[2].trim();
    const text = valueHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (label) {
      rows.set(label, { text, html: valueHtml });
    }
  }

  return rows;
}

// ─── Profile ID Extraction from embedded URLs ──────────────────────────────

function extractProfileIdFromUrls(html: string): string | null {
  const match = html.match(/\/profile\/(\d+)\//);
  return match?.[1] || null;
}

// ─── Lead ID Extraction (from text field or URLs) ──────────────────────────

function extractLeadIdFromUrls(html: string): string | null {
  const match = html.match(/[?&]lid=(\d+)/);
  return match?.[1] || null;
}

// ─── Recording URL Extraction ──────────────────────────────────────────────

interface RecordingInfo {
  playUrl: string | null;
  downloadUrl: string | null;
  hash: string | null;
}

function extractRecordingFromHtml(cellHtml: string): RecordingInfo {
  const playMatch = cellHtml.match(
    /href="(https:\/\/leads\.idigitalstrategies\.com\/recording\/RE[0-9a-f]{32}\/play[^"]*)"/,
  );
  const downloadMatch = cellHtml.match(
    /href="(https:\/\/leads\.idigitalstrategies\.com\/recording\/RE[0-9a-f]{32}\/download[^"]*)"/,
  );
  const hashMatch = cellHtml.match(/recording\/(RE[0-9a-f]{32})\//);

  return {
    playUrl: playMatch?.[1] || null,
    downloadUrl: downloadMatch?.[1] || null,
    hash: hashMatch?.[1] || null,
  };
}

// ─── Lead Source Extraction ────────────────────────────────────────────────

function extractLeadSource(html: string): string | null {
  // "This lead came from <strong ...>{source}</strong>."
  const match = html.match(
    /This lead came from\s*<strong[^>]*>([^<]+)<\/strong>/i,
  );
  return match?.[1]?.trim() || null;
}

// ─── Lead Type Detection ───────────────────────────────────────────────────

function detectLeadType(subject: string, html: string): string {
  const s = (subject || "").toLowerCase();
  // Also check the <h2> heading in the email body
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const heading = h2Match
    ? h2Match[1].replace(/<[^>]+>/g, "").trim().toLowerCase()
    : "";

  if (s.includes("phone call") || heading.includes("phone call"))
    return LEAD_TYPES.PHONE_CALL;
  if (s.includes("appointment") || heading.includes("appointment"))
    return LEAD_TYPES.WEB_FORM;
  if (s.includes("ad click") || heading.includes("ad click"))
    return LEAD_TYPES.AD_CLICK;

  // Fallback: if recording links exist, it's a phone call
  if (/\/recording\/RE[0-9a-f]{32}\//.test(html)) return LEAD_TYPES.PHONE_CALL;

  return LEAD_TYPES.WEB_FORM;
}

// ─── Location Name from Subject ────────────────────────────────────────────

function extractLocationFromSubject(subject: string): string | null {
  const match = subject.match(/\|\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

// ─── Name Extraction (handles reversed Ignite format) ──────────────────────

function extractCallerName(callerNameText: string | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!callerNameText) return { firstName: "", lastName: "" };
  const trimmed = callerNameText.trim();
  if (!trimmed) return { firstName: "", lastName: "" };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  // Ignite format: {Last} {First} — reverse it
  const lastName = parts[0];
  const firstName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

// ─── Pet Name from Booking Title ───────────────────────────────────────────

function extractPetName(bookingTitle: string | undefined): string | null {
  if (!bookingTitle) return null;
  const match = bookingTitle.match(/Request for (.+)$/i);
  return match?.[1]?.trim() || null;
}

// ─── Link href Extraction from a cell ──────────────────────────────────────

function extractLinkHref(cellHtml: string): string | null {
  const match = cellHtml.match(/href="([^"]+)"/);
  return match?.[1] || null;
}

// ─── Sales Value Parsing ───────────────────────────────────────────────────

function parseSalesValue(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

// ─── Services JSON Parsing ─────────────────────────────────────────────────

function parseServicesJson(
  text: string | undefined,
): Array<{ Name: string; Quantity: string; Rate: string }> | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Main Parse Interface ──────────────────────────────────────────────────

interface ParsedLead {
  leadType: string;
  firstName: string;
  lastName: string;
  clientName: string | null;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  callRecordingUrl: string | null;
  sourceDetail: string | null;
  formData: Record<string, unknown>;
  igniteProfileId: string | null;
  igniteLocationId: string | null;
  rawSubject: string;
  parsedAt: string;
  error?: string;
}

function parseIgniteEmail(
  rawHtml: string,
  headers: Record<string, string> = {},
): ParsedLead {
  if (!rawHtml) {
    return { error: "No email HTML provided" } as ParsedLead;
  }

  // Sender is only a soft signal — the booking form is forwarded (Outlook →
  // inbound), which rewrites the From header, so we never hard-reject on it.
  // Non-lead emails are filtered by subject below and by the absence of rows.
  const subject = headers.subject || "";

  // Skip non-lead emails (OTP codes, etc.)
  if (
    subject.toLowerCase().includes("verification code") ||
    subject.toLowerCase().includes("password reset")
  ) {
    return { error: "Not a lead email (verification/password)" } as ParsedLead;
  }

  // ── Step 1: Extract all table rows ──────────────────────────────────
  const rawRows = extractTableRows(rawHtml);

  // Map labels to normalized keys
  const fields: Record<string, RowData> = {};
  for (const [label, data] of rawRows) {
    const key = LABEL_MAP[label];
    if (key) {
      fields[key] = data;
    } else {
      // Unknown label — store under snake_case version
      const fallbackKey = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (fallbackKey) fields[fallbackKey] = data;
    }
  }

  // ── Step 2: Detect lead type ────────────────────────────────────────
  const leadType = detectLeadType(subject, rawHtml);

  // ── Step 3: Extract profile ID from embedded URLs ──────────────────
  const igniteProfileId = extractProfileIdFromUrls(rawHtml);

  // ── Step 4: Extract lead source ────────────────────────────────────
  const sourceDetail = extractLeadSource(rawHtml);

  // ── Step 5: Extract ignite lead ID ─────────────────────────────────
  const igniteLeadId =
    fields.lead_id?.text || extractLeadIdFromUrls(rawHtml) || null;

  // ── Step 6: Type-specific extraction ───────────────────────────────
  let firstName = "";
  let lastName = "";
  let phone: string | null = null;
  let phoneRaw: string | null = null;
  let callRecordingUrl: string | null = null;

  if (leadType === LEAD_TYPES.PHONE_CALL) {
    // Caller name is REVERSED in Ignite: "{Last} {First}"
    const nameResult = extractCallerName(fields.caller_name?.text);
    firstName = nameResult.firstName;
    lastName = nameResult.lastName;

    // Phone from caller number
    phoneRaw = fields.caller_number?.text || null;
    phone = normalizePhone(phoneRaw);

    // Recording URL from the Recording cell HTML
    if (fields.recording?.html) {
      const rec = extractRecordingFromHtml(fields.recording.html);
      callRecordingUrl = rec.downloadUrl || rec.playUrl || null;
    }
    // Fallback: scan full HTML for recording URLs
    if (!callRecordingUrl) {
      const rec = extractRecordingFromHtml(rawHtml);
      callRecordingUrl = rec.downloadUrl || rec.playUrl || null;
    }
  }

  // Appointment-specific: extract lead page and landing page hrefs
  let leadPageUrl: string | null = null;
  let landingPageUrl: string | null = null;
  let bookingTitle: string | null = null;
  let petName: string | null = null;
  let salesValue: number | null = null;
  let services: unknown = null;

  if (leadType === LEAD_TYPES.WEB_FORM) {
    leadPageUrl = fields.lead_page?.html
      ? extractLinkHref(fields.lead_page.html)
      : null;
    landingPageUrl = fields.landing_page?.html
      ? extractLinkHref(fields.landing_page.html)
      : null;
    bookingTitle = fields.booking_title?.text || null;
    petName = extractPetName(bookingTitle || undefined);
    salesValue = parseSalesValue(fields.sales_value?.text);
    services = parseServicesJson(fields.services?.text);

    // Web form leads: extract name/phone/email from form fields
    // These are stored in form_data fields like first_name, last_name, email, phone, email_address
    if (!firstName && fields.first_name?.text) firstName = fields.first_name.text.trim();
    if (!lastName && fields.last_name?.text) lastName = fields.last_name.text.trim();
    // P1: Also check full_name (used by booking/appointment forms)
    if (!firstName && !lastName && fields.full_name?.text) {
      const parts = fields.full_name.text.trim().split(/\s+/);
      if (parts.length >= 2) {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      } else if (parts.length === 1) {
        firstName = parts[0];
      }
    }
    if (!phone) {
      // P1: Check both phone and phone_number fields
      const rawPh = fields.phone?.text || fields.phone_number?.text || null;
      if (rawPh) {
        phoneRaw = rawPh;
        phone = normalizePhone(rawPh);
      }
    }
  }

  // ── Step 7: Build form_data with all remaining fields ──────────────
  const formData: Record<string, unknown> = {};

  for (const [key, data] of Object.entries(fields)) {
    if (!PROMOTED_KEYS.has(key)) {
      formData[key] = data.text;
    }
  }

  // Add enrichment fields to form_data for UI display
  if (leadType === LEAD_TYPES.PHONE_CALL) {
    if (fields.answer_status?.text)
      formData.answer_status = fields.answer_status.text;
    if (fields.call_duration?.text)
      formData.call_duration = fields.call_duration.text;
    if (fields.line_type?.text) formData.line_type = fields.line_type.text;
    if (fields.tracking_number?.text)
      formData.tracking_number = fields.tracking_number.text;
    if (fields.destination_number?.text)
      formData.destination_number = fields.destination_number.text;
    if (fields.call_transcription?.text)
      formData.call_transcription = fields.call_transcription.text;
    if (fields.phone_name?.text)
      formData.phone_name = fields.phone_name.text;
  }

  if (leadType === LEAD_TYPES.WEB_FORM) {
    if (leadPageUrl) formData.lead_page_url = leadPageUrl;
    if (landingPageUrl) formData.landing_page_url = landingPageUrl;
    if (bookingTitle) formData.booking_title = bookingTitle;
    if (petName) formData.pet_name = petName;
    if (salesValue !== null) formData.sales_value = salesValue;
    if (services) formData.services = services;
    if (fields.estimated_subtotal?.text)
      formData.estimated_subtotal = fields.estimated_subtotal.text;
    if (fields.estimated_tax?.text)
      formData.estimated_tax = fields.estimated_tax.text;
    if (fields.browser?.text) formData.browser = fields.browser.text;
    if (fields.device?.text) formData.device = fields.device.text;
    if (fields.agreed_to_terms?.text)
      formData.agreed_to_terms = fields.agreed_to_terms.text;
    if (fields.dates?.text) formData.dates = fields.dates.text;
  }

  // Always include the Ignite lead ID in form_data for linking
  if (igniteLeadId) formData.ignite_lead_id = igniteLeadId;

  // Extract email from form fields for web form leads
  let email: string | null = null;
  if (leadType === LEAD_TYPES.WEB_FORM) {
    const rawEmail = fields.email_address?.text || fields.email?.text || null;
    if (rawEmail && rawEmail.includes("@")) {
      email = rawEmail.trim().toLowerCase();
    }
  }

  const clientName =
    [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    leadType,
    firstName,
    lastName,
    clientName,
    email,
    phone,
    phoneRaw,
    callRecordingUrl,
    sourceDetail,
    formData,
    igniteProfileId,
    igniteLocationId: null,
    rawSubject: subject,
    parsedAt: new Date().toISOString(),
  };
}

// ─── Inlined Client Matching ────────────────────────────────────────────────

const NICKNAME_MAP: Record<string, string> = {
  mike: "michael", michael: "michael", mick: "michael", mikey: "michael",
  jen: "jennifer", jennifer: "jennifer", jenny: "jennifer", jenn: "jennifer",
  bob: "robert", robert: "robert", rob: "robert", robby: "robert", bobby: "robert",
  bill: "william", william: "william", will: "william", willy: "william", billy: "william",
  jim: "james", james: "james", jimmy: "james", jamie: "james",
  tom: "thomas", thomas: "thomas", tommy: "thomas",
  dick: "richard", richard: "richard", rick: "richard", ricky: "richard", rich: "richard",
  dave: "david", david: "david", davey: "david",
  dan: "daniel", daniel: "daniel", danny: "daniel",
  joe: "joseph", joseph: "joseph", joey: "joseph",
  chris: "christopher", christopher: "christopher",
  matt: "matthew", matthew: "matthew", matty: "matthew",
  pat: "patrick", patrick: "patrick", patty: "patricia",
  patricia: "patricia", trish: "patricia", tricia: "patricia",
  liz: "elizabeth", elizabeth: "elizabeth",
  beth: "elizabeth", betsy: "elizabeth", eliza: "elizabeth",
  kate: "katherine", katherine: "katherine",
  kathy: "katherine", katie: "katherine", cathy: "katherine",
  sue: "susan", susan: "susan", susie: "susan",
  sam: "samuel", samuel: "samuel", sammy: "samuel", samantha: "samantha",
  steve: "steven", steven: "steven", stephen: "steven",
  tony: "anthony", anthony: "anthony",
  al: "albert", albert: "albert", alex: "alexander", alexander: "alexander",
  ed: "edward", edward: "edward", eddie: "edward", ted: "edward",
  nick: "nicholas", nicholas: "nicholas", nicky: "nicholas",
  greg: "gregory", gregory: "gregory",
  jeff: "jeffrey", jeffrey: "jeffrey",
  jon: "jonathan", jonathan: "jonathan",
  john: "john", johnny: "john", jack: "john",
  charlie: "charles", charles: "charles", chuck: "charles",
  larry: "lawrence", lawrence: "lawrence",
  andy: "andrew", andrew: "andrew", drew: "andrew",
  josh: "joshua", joshua: "joshua",
  ben: "benjamin", benjamin: "benjamin", benny: "benjamin",
  megan: "margaret", margaret: "margaret", maggie: "margaret", meg: "margaret",
  debbie: "deborah", deborah: "deborah", deb: "deborah",
  becky: "rebecca", rebecca: "rebecca",
  barb: "barbara", barbara: "barbara",
  steph: "stephanie", stephanie: "stephanie",
  nate: "nathaniel", nathaniel: "nathaniel", nathan: "nathaniel",
  vicky: "victoria", victoria: "victoria", vicki: "victoria",
  mandy: "amanda", amanda: "amanda",
  teri: "theresa", theresa: "theresa", terry: "theresa",
  sandy: "sandra", sandra: "sandra",
  peggy: "margaret",
  teddy: "theodore", theodore: "theodore",
};

function getCanonical(name: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return NICKNAME_MAP[lower] || lower;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function stringSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(la, lb) / maxLen;
}

function isPartialMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la.length < 2 || lb.length < 2) return false;
  return la.startsWith(lb) || lb.startsWith(la);
}

function computeNameConfidence(
  leadFirst: string,
  leadLast: string,
  clientFirst: string,
  clientLast: string,
): number {
  if (!leadFirst || !leadLast || !clientFirst || !clientLast) return 0;
  const lastSim = stringSimilarity(leadLast, clientLast);
  if (lastSim < 0.6) return 0;
  const firstSim = stringSimilarity(leadFirst, clientFirst);
  const leadCanonical = getCanonical(leadFirst);
  const clientCanonical = getCanonical(clientFirst);
  const nicknameMatch =
    leadCanonical !== null &&
    clientCanonical !== null &&
    leadCanonical === clientCanonical;
  const partial = isPartialMatch(leadFirst, clientFirst);
  let bestFirstScore = firstSim;
  if (nicknameMatch) bestFirstScore = Math.max(bestFirstScore, 0.92);
  if (partial && bestFirstScore < 0.7)
    bestFirstScore = Math.max(bestFirstScore, 0.7);
  return lastSim * 0.55 + bestFirstScore * 0.45;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  let e = email.toLowerCase().trim();
  const atIdx = e.indexOf("@");
  if (atIdx === -1) return e;
  let local = e.slice(0, atIdx);
  const domain = e.slice(atIdx + 1);
  const plusIdx = local.indexOf("+");
  if (plusIdx !== -1) local = local.slice(0, plusIdx);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return local + "@" + domain;
}

interface ClientRecord {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface MatchResult {
  matched: boolean;
  clientId: string | null;
  confidence: number;
  matchType: string | null;
  allMatches: MatchResult[];
}

function matchLeadToClient(
  lead: ParsedLead,
  existingClients: ClientRecord[],
): MatchResult {
  const noMatch: MatchResult = {
    matched: false,
    clientId: null,
    confidence: 0,
    matchType: null,
    allMatches: [],
  };
  if (!existingClients || existingClients.length === 0) return noMatch;

  const leadEmail = normalizeEmail(lead.email);
  const leadPhone = normalizePhone(lead.phone);
  const allMatches: MatchResult[] = [];
  let bestMatch: MatchResult = { ...noMatch };

  for (const client of existingClients) {
    // 1. Email match
    if (leadEmail && client.email) {
      const clientEmail = normalizeEmail(client.email);
      if (leadEmail === clientEmail) {
        const match: MatchResult = {
          matched: true,
          clientId: client.id,
          confidence: MATCH_CONFIDENCE.EMAIL_EXACT,
          matchType: MATCH_TYPES.EMAIL,
          allMatches: [],
        };
        allMatches.push(match);
        return { ...match, allMatches };
      }
    }

    // 2. Phone match
    if (leadPhone && client.phone) {
      const clientPhone = normalizePhone(client.phone);
      if (leadPhone && clientPhone && leadPhone === clientPhone) {
        const match: MatchResult = {
          matched: true,
          clientId: client.id,
          confidence: MATCH_CONFIDENCE.PHONE_EXACT,
          matchType: MATCH_TYPES.PHONE,
          allMatches: [],
        };
        allMatches.push(match);
        if (match.confidence > bestMatch.confidence) bestMatch = match;
      }
    }

    // 3. Name matching
    if (
      lead.firstName &&
      lead.lastName &&
      client.firstName &&
      client.lastName
    ) {
      const nameConf = computeNameConfidence(
        lead.firstName,
        lead.lastName,
        client.firstName,
        client.lastName,
      );
      let nameConfidence = 0;
      if (nameConf >= 0.9) nameConfidence = MATCH_CONFIDENCE.NAME_HIGH;
      else if (nameConf >= 0.7) nameConfidence = MATCH_CONFIDENCE.NAME_MEDIUM;
      else if (nameConf >= 0.55) nameConfidence = MATCH_CONFIDENCE.NAME_LOW;

      if (nameConfidence > 0) {
        const match: MatchResult = {
          matched: true,
          clientId: client.id,
          confidence: nameConfidence,
          matchType: MATCH_TYPES.NAME,
          allMatches: [],
        };
        allMatches.push(match);
        if (nameConfidence > bestMatch.confidence) bestMatch = match;
      }
    }

    // 4. Phone + name combo
    if (leadPhone && client.phone && lead.lastName && client.lastName) {
      const clientPhone = normalizePhone(client.phone);
      if (leadPhone === clientPhone) {
        const lastSim = stringSimilarity(lead.lastName, client.lastName);
        if (lastSim >= 0.7) {
          const comboConf = MATCH_CONFIDENCE.PHONE_NAME_COMBO;
          if (comboConf > bestMatch.confidence) {
            const match: MatchResult = {
              matched: true,
              clientId: client.id,
              confidence: comboConf,
              matchType: MATCH_TYPES.PHONE_NAME,
              allMatches: [],
            };
            allMatches.push(match);
            bestMatch = match;
          }
        }
      }
    }
  }

  return { ...bestMatch, allMatches };
}

function classifyMatchStatus(matchResult: MatchResult): string {
  if (!matchResult.matched || matchResult.confidence === 0) {
    return MATCH_STATUSES.NO_MATCH;
  }
  if (matchResult.confidence >= AUTO_MATCH_THRESHOLD) {
    return MATCH_STATUSES.MATCHED;
  }
  if (matchResult.confidence >= REVIEW_THRESHOLD) {
    return MATCH_STATUSES.REVIEW;
  }
  return MATCH_STATUSES.NO_MATCH;
}

// ─── Idempotency Hash ───────────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "igh_" + Math.abs(hash).toString(36);
}

// ─── Resend API ─────────────────────────────────────────────────────────────

interface ResendReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

async function fetchResendEmail(
  emailId: string,
  apiKey: string,
): Promise<ResendReceivedEmail> {
  const resp = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Resend API error (${resp.status}): ${text}`,
    );
  }
  return resp.json();
}

// ─── Main Handler ───────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    // When the webhook received this request — t1 for synthetic round-trip timing.
    const receivedAt = new Date().toISOString();

    // ── Determine mode: Resend webhook vs direct POST ─────────────────
    let from: string;
    let subject: string;
    let html: string;
    let emailHeaders: Record<string, string>;

    if (body.type === "email.received" && body.data?.email_id) {
      // Resend webhook mode — fetch full email via Resend API
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return jsonResponse(
          { error: "RESEND_API_KEY not configured" },
          500,
        );
      }

      const email = await fetchResendEmail(body.data.email_id, resendApiKey);
      from = email.from || body.data.from || "";
      subject = email.subject || body.data.subject || "";
      html = email.html || "";
      emailHeaders = { from, subject };
    } else if (body.html) {
      // Direct POST mode — { from, subject, html, headers }
      from = body.from || "";
      subject = body.subject || "";
      html = body.html;
      emailHeaders = { from, subject, ...(body.headers || {}) };
    } else {
      return jsonResponse(
        {
          error:
            "Invalid payload. Expected Resend webhook (type=email.received) or direct POST with { html }",
        },
        400,
      );
    }

    // Sender is a soft signal only — booking-form mail is forwarded (Outlook →
    // inbound), which rewrites From. Log unknown senders but don't reject.
    const ACCEPTED_SENDER_MARKERS = ["idigitalstrategies", "cloudbackend", "k9resorts"];
    if (from && !ACCEPTED_SENDER_MARKERS.some((mk) => from.toLowerCase().includes(mk))) {
      console.log(`[ignite-webhook] Unrecognized sender (continuing): ${from}`);
    }

    if (!html) {
      return jsonResponse({ error: "No HTML body provided" }, 400);
    }

    // Synthetic health-check probe? ignite-health-check sends a tagged email
    // through the REAL pipeline every 15 min; we flag the resulting lead so it
    // never reaches the CRM, and record its round-trip timing in
    // ignite_health_probe. The marker travels as a visible form field.
    const probeToken = html.match(/IGNITE-HEALTH-PROBE:([A-Za-z0-9_-]+)/)?.[1] || null;
    const isSynthetic = !!probeToken;

    // Idempotency check — use ignite lead ID from URLs if available
    const quickLeadId = html.match(/[?&]lid=(\d+)/)?.[1] || null;
    if (quickLeadId && body.dryRun !== true && body.mode !== "validate") {
      const { data: existing } = await supabaseClient
        .from("ignite_leads")
        .select("id")
        .eq("form_data->>ignite_lead_id", quickLeadId)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(
          `[ignite-webhook] Duplicate lead (ignite_lead_id=${quickLeadId}), skipping`,
        );
        return jsonResponse({
          success: true,
          duplicate: true,
          existingId: existing[0].id,
          igniteLeadId: quickLeadId,
        });
      }
    }

    // Parse the email
    const parsed = parseIgniteEmail(html, emailHeaders);

    if (parsed.error) {
      return jsonResponse({ error: parsed.error }, 422);
    }

    // Look up location from ignite_config
    let locationId: string | null = null;

    // Primary: match by profile ID extracted from URLs
    if (parsed.igniteProfileId) {
      const { data: config } = await supabaseClient
        .from("ignite_config")
        .select("location_id")
        .eq("ignite_profile_id", parsed.igniteProfileId)
        .eq("is_active", true)
        .single();

      if (config) locationId = config.location_id;
    }

    // Fallback: match by location name from subject line
    if (!locationId) {
      const locationName = subject.match(/\|\s*(.+)$/)?.[1]?.trim();
      if (locationName) {
        console.log(
          `[ignite-webhook] No profile ID match, trying location name: ${locationName}`,
        );
        const { data: configs } = await supabaseClient
          .from("ignite_config")
          .select("location_id, ignite_profile_id")
          .eq("is_active", true);

        if (configs) {
          // Check ignite_config for a row where location matches
          // Also try matching against locations table
          const { data: locations } = await supabaseClient
            .from("locations")
            .select("id, name")
            .ilike("name", `%${locationName}%`)
            .limit(1);

          if (locations && locations.length > 0) {
            const matchedConfig = configs.find(
              (c: { location_id: string }) =>
                c.location_id === locations[0].id,
            );
            if (matchedConfig) {
              locationId = matchedConfig.location_id;
              console.log(
                `[ignite-webhook] Matched via location name: ${locationName} -> ${locationId}`,
              );
            }
          }
        }
      }
    }

    // Fallback: route by the website slug in the body URL
    // (e.g. https://www.k9resorts.com/cherry-hill/ → locations.slug = 'cherry-hill').
    if (!locationId) {
      const slugMatch = html.match(/k9resorts\.com\/([a-z0-9][a-z0-9-]*)\//i);
      const slug = slugMatch?.[1]?.toLowerCase();
      if (slug && slug !== "www") {
        const { data: locs } = await supabaseClient
          .from("locations")
          .select("id")
          .eq("slug", slug)
          .limit(1);
        if (locs && locs.length > 0) {
          locationId = locs[0].id;
          console.log(`[ignite-webhook] Matched via website slug: ${slug} -> ${locationId}`);
        }
      }
    }

    if (!locationId) {
      console.warn(
        "[ignite-webhook] No location found for profile:",
        parsed.igniteProfileId,
      );
      return jsonResponse(
        {
          error: "No active location configured for this Ignite profile",
          igniteProfileId: parsed.igniteProfileId,
          parsedFields: Object.keys(parsed.formData),
          leadType: parsed.leadType,
          source: parsed.sourceDetail,
        },
        422,
      );
    }

    // Dry-run / validate mode: parse + routing have succeeded end-to-end on our
    // side. Return the result WITHOUT writing a lead — this is how the health
    // check + wizard test validate the pipeline with zero dummy data.
    if (body.dryRun === true || body.mode === "validate") {
      return jsonResponse({
        success: true,
        dryRun: true,
        locationId,
        leadType: parsed.leadType,
        clientName: parsed.clientName,
        hasEmail: !!parsed.email,
        hasPhone: !!parsed.phone,
        fields: Object.keys(parsed.formData),
        routedBy: parsed.igniteProfileId ? "profile_id" : "slug",
      });
    }

    // Match to existing clients via gingr_owners
    const { data: owners } = await supabaseClient
      .from("gingr_owners")
      .select("id, gingr_id, email, cell_phone, home_phone, first_name, last_name")
      .eq("location_id", locationId);

    const clientList: ClientRecord[] = (owners || []).map(
      (c: { id: string; gingr_id: string; email: string; cell_phone: string; home_phone: string; first_name: string; last_name: string }) => ({
        id: "g" + c.gingr_id,
        email: c.email,
        phone: c.cell_phone || c.home_phone || null,
        firstName: c.first_name,
        lastName: c.last_name,
      }),
    );

    const matchResult = matchLeadToClient(parsed, clientList);
    const matchStatus = classifyMatchStatus(matchResult);

    const candidates = (matchResult.allMatches || [])
      .filter((m) => m.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    // Insert the lead
    const { data: lead, error: insertError } = await supabaseClient
      .from("ignite_leads")
      .insert({
        location_id: locationId,
        is_synthetic: isSynthetic,
        probe_token: probeToken,
        lead_type: parsed.leadType,
        first_name: parsed.firstName || null,
        last_name: parsed.lastName || null,
        email: parsed.email,
        phone: parsed.phone,
        source_detail: parsed.sourceDetail,
        call_recording_url: parsed.callRecordingUrl,
        form_data: parsed.formData,
        ignite_profile_id: parsed.igniteProfileId,
        raw_email_html: html,
        raw_email_subject: subject || null,
        matched_client_id: matchResult.clientId,
        match_status: matchStatus,
        match_confidence: matchResult.confidence || null,
        match_type: matchResult.matchType || null,
        match_candidates:
          matchStatus === MATCH_STATUSES.REVIEW
            ? candidates.map((c) => ({
                client_id: c.clientId,
                confidence: c.confidence,
                match_type: c.matchType,
              }))
            : null,
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[ignite-webhook] Insert error:", insertError);
      return jsonResponse(
        { error: "Failed to store lead", detail: insertError.message },
        500,
      );
    }

    console.log(
      `[ignite-webhook] Lead stored: ${lead.id} (${matchStatus})`,
    );

    // Synthetic probe: stamp the round-trip timing and stop here — never create a
    // lite_client or any downstream side-effect for a health-check email.
    if (isSynthetic) {
      const insertedAt = new Date().toISOString();
      const { data: probeRows } = await supabaseClient
        .from("ignite_health_probe")
        .select("sent_at")
        .eq("token", probeToken)
        .limit(1);
      const sentAt = probeRows && probeRows[0] ? probeRows[0].sent_at : null;
      const latencyMs = sentAt
        ? Math.max(0, new Date(insertedAt).getTime() - new Date(sentAt).getTime())
        : null;
      await supabaseClient
        .from("ignite_health_probe")
        .update({
          received_at: receivedAt,
          inserted_at: insertedAt,
          lead_id: lead.id,
          latency_ms: latencyMs,
          status: "landed",
        })
        .eq("token", probeToken);
      console.log(`[ignite-webhook] Synthetic probe landed: ${probeToken} (${latencyMs}ms)`);
      return jsonResponse({ success: true, synthetic: true, leadId: lead.id, probeToken, latencyMs });
    }

    // ── Auto-create or update lite_client for unmatched leads (P8: phone dedup) ──
    let liteClientId: string | null = null;
    if (matchStatus === MATCH_STATUSES.NO_MATCH && lead.id) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const followUpDate = tomorrow.toISOString().split("T")[0];

      // P8: Check for existing lite_client with same normalized phone
      const leadPhone = normalizePhone(parsed.phone);
      let existingLiteClient: { id: string } | null = null;
      if (leadPhone) {
        // Check lite_clients by normalized phone
        const { data: existingLCs } = await supabaseClient
          .from("lite_clients")
          .select("id, phone")
          .eq("location_id", locationId);
        if (existingLCs) {
          existingLiteClient = existingLCs.find(
            (lc: { id: string; phone: string | null }) =>
              normalizePhone(lc.phone) === leadPhone,
          ) || null;
        }
      }
      // Also check by email if no phone match
      if (!existingLiteClient && parsed.email) {
        const { data: emailMatch } = await supabaseClient
          .from("lite_clients")
          .select("id")
          .eq("location_id", locationId)
          .eq("email", parsed.email)
          .limit(1);
        if (emailMatch && emailMatch.length > 0) {
          existingLiteClient = emailMatch[0];
        }
      }

      if (existingLiteClient) {
        // Update existing lite_client with new lead data instead of creating duplicate
        liteClientId = existingLiteClient.id;
        const { error: updateError } = await supabaseClient
          .from("lite_clients")
          .update({
            ignite_lead_id: lead.id,
            // Backfill name/phone/email if previously empty
            ...(parsed.firstName ? { first_name: parsed.firstName } : {}),
            ...(parsed.lastName ? { last_name: parsed.lastName } : {}),
            ...(parsed.phone ? { phone: parsed.phone } : {}),
            ...(parsed.email ? { email: parsed.email } : {}),
          })
          .eq("id", existingLiteClient.id);
        if (updateError) {
          console.error("[ignite-webhook] Lite client update error:", updateError);
        } else {
          console.log(
            `[ignite-webhook] Linked lead ${lead.id} to existing lite_client: ${existingLiteClient.id} (phone dedup)`,
          );
        }
      } else {
        // No existing match — create new lite_client
        const { data: liteClient, error: lcError } = await supabaseClient
          .from("lite_clients")
          .insert({
            location_id: locationId,
            first_name: parsed.firstName || null,
            last_name: parsed.lastName || null,
            phone: parsed.phone || null,
            email: parsed.email || null,
            source: "ignite",
            source_date: new Date().toISOString(),
            ignite_lead_id: lead.id,
            notes: `Ignite ${parsed.leadType === "phone_call" ? "phone call" : "web form"} lead — ${new Date().toLocaleDateString()}`,
            lifecycle_data: {
              conversion: {
                notes: "",
                followUpDate,
                updates: [{
                  id: "sys_" + Date.now().toString(36),
                  notes: `Pulled lead from Ignite — ${parsed.leadType === "phone_call" ? "Phone Call" : parsed.leadType === "ad_click" ? "Ad Click" : "Web Form"}${parsed.sourceDetail ? " (" + parsed.sourceDetail + ")" : ""}`,
                  previousFollowUp: "",
                  newFollowUp: followUpDate,
                  loggedBy: "System",
                  loggedAt: new Date().toISOString(),
                }],
                source: "ignite",
                sourceDate: new Date().toISOString(),
                sourceReservationId: "",
              },
              retention: { notes: "", followUpDate: "", updates: [] },
              cold: false,
              coldDate: "",
              coldFrom: "",
            },
          })
          .select("id")
          .single();

        if (lcError) {
          console.error("[ignite-webhook] Lite client create error:", lcError);
        } else {
          liteClientId = liteClient.id;
          console.log(
            `[ignite-webhook] Auto-created lite_client: ${liteClient.id} for lead ${lead.id}`,
          );
        }
      }
    }

    return jsonResponse({
      success: true,
      leadId: lead.id,
      matchStatus,
      matchConfidence: matchResult.confidence,
      matchType: matchResult.matchType,
      candidateCount: candidates.length,
      liteClientId,
    });
  } catch (err) {
    console.error("[ignite-webhook] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
