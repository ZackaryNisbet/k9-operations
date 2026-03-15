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

// ─── Inlined Parser ─────────────────────────────────────────────────────────

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  if (digits.length === 11 && digits[0] === "1") return digits;
  return digits || null;
}

function detectLeadType(
  subject: string,
  bodyText: string,
): string {
  const s = (subject || "").toLowerCase();
  const b = (bodyText || "").toLowerCase();
  if (s.includes("phone call") || b.includes("phone call"))
    return LEAD_TYPES.PHONE_CALL;
  if (s.includes("ad click") || b.includes("ad click"))
    return LEAD_TYPES.AD_CLICK;
  return LEAD_TYPES.WEB_FORM;
}

function extractName(fields: Record<string, string>): {
  firstName: string;
  lastName: string;
} {
  let firstName = fields.first_name || "";
  let lastName = fields.last_name || "";
  if (!firstName && !lastName && fields.caller_name) {
    const parts = fields.caller_name.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }
  return { firstName: firstName.trim(), lastName: lastName.trim() };
}

function parseRegex(rawHtml: string): Record<string, string> {
  const fields: Record<string, string> = {};

  // Extract data-field values
  const dataFieldRe =
    /<(?:span|td|div)[^>]*data-field="([^"]+)"[^>]*>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = dataFieldRe.exec(rawHtml)) !== null) {
    fields[m[1]] = m[2].trim();
  }

  // Extract recording URLs from <a> tags with data-field
  const linkFieldRe =
    /<a[^>]*data-field="call_recording_url"[^>]*href="([^"]+)"[^>]*>/g;
  while ((m = linkFieldRe.exec(rawHtml)) !== null) {
    fields.call_recording_url = m[1];
  }

  // Fallback: extract table rows
  if (Object.keys(fields).length === 0) {
    const rowRe =
      /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    while ((m = rowRe.exec(rawHtml)) !== null) {
      const label = m[1].replace(/<[^>]+>/g, "").trim();
      const value = m[2].replace(/<[^>]+>/g, "").trim();
      if (label && value) {
        const key = label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/_+$/, "");
        fields[key] = value;
      }
      if (label.toLowerCase().includes("recording")) {
        const hrefMatch = m[2].match(/href="([^"]+)"/);
        if (hrefMatch) fields.call_recording_url = hrefMatch[1];
      }
    }
  }

  return fields;
}

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
  formData: Record<string, string>;
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

  const from = headers.from || "";
  if (from && !from.includes(IGNITE_SENDER_EMAIL)) {
    return { error: `Unexpected sender: ${from}` } as ParsedLead;
  }

  const fields = parseRegex(rawHtml);
  const subject = headers.subject || "";
  const leadType = detectLeadType(subject, fields.lead_type || "");
  const { firstName, lastName } = extractName(fields);

  const promotedKeys = new Set([
    "lead_type",
    "first_name",
    "last_name",
    "caller_name",
    "email",
    "phone",
    "call_recording_url",
    "ignite_profile_id",
    "ignite_location_id",
  ]);
  const formData: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!promotedKeys.has(k)) formData[k] = v;
  }

  return {
    leadType,
    firstName,
    lastName,
    clientName: [firstName, lastName].filter(Boolean).join(" ") || null,
    email: (fields.email || "").toLowerCase() || null,
    phone: normalizePhone(fields.phone),
    phoneRaw: fields.phone || null,
    callRecordingUrl: fields.call_recording_url || null,
    sourceDetail:
      fields.source || fields.ad_campaign || fields.tracking_number || null,
    formData,
    igniteProfileId: fields.ignite_profile_id || null,
    igniteLocationId: fields.ignite_location_id || null,
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
    `https://api.resend.com/emails/received/${emailId}`,
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

    // Validate sender
    if (from && !from.includes(IGNITE_SENDER_EMAIL)) {
      return jsonResponse({ error: "Not an Ignite email", from }, 422);
    }

    if (!html) {
      return jsonResponse({ error: "No HTML body provided" }, 400);
    }

    // Idempotency check
    const _idempotencyKey = simpleHash((subject || "") + html.slice(0, 500));
    const { data: existing } = await supabaseClient
      .from("ignite_leads")
      .select("id")
      .eq("raw_email_subject", subject || "")
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[ignite-webhook] Possible duplicate: ${_idempotencyKey}`);
    }

    // Parse the email
    const parsed = parseIgniteEmail(html, emailHeaders);

    if (parsed.error) {
      return jsonResponse({ error: parsed.error }, 422);
    }

    // Look up location from ignite_config
    let locationId: string | null = null;
    if (parsed.igniteProfileId) {
      const { data: config } = await supabaseClient
        .from("ignite_config")
        .select("location_id")
        .eq("ignite_profile_id", parsed.igniteProfileId)
        .eq("is_active", true)
        .single();

      if (config) locationId = config.location_id;
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
        },
        422,
      );
    }

    // Match to existing clients via gingr_owners
    const { data: owners } = await supabaseClient
      .from("gingr_owners")
      .select("id, email, phone, first_name, last_name")
      .eq("location_id", locationId);

    const clientList: ClientRecord[] = (owners || []).map(
      (c: { id: string; email: string; phone: string; first_name: string; last_name: string }) => ({
        id: c.id,
        email: c.email,
        phone: c.phone,
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

    return jsonResponse({
      success: true,
      leadId: lead.id,
      matchStatus,
      matchConfidence: matchResult.confidence,
      matchType: matchResult.matchType,
      candidateCount: candidates.length,
    });
  } catch (err) {
    console.error("[ignite-webhook] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
