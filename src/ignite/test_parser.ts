/**
 * Local test script for the Ignite parser v2.
 * Run with: deno run --allow-read src/ignite/test_parser.ts
 *
 * Tests the parser functions against real email HTML samples.
 */

// ─── Inline the parser functions (same as edge function) ────────────────────

const LABEL_MAP: Record<string, string> = {
  "Time": "time",
  "Profile": "profile",
  "City": "city",
  "State": "state",
  "Zip": "zip",
  "Country": "country",
  "Multi Unit Name": "multi_unit_name",
  "Lead ID": "lead_id",
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

const PROMOTED_KEYS = new Set([
  "caller_name", "caller_number", "tracking_number",
  "recording", "call_transcription", "lead_id",
  "lead_page", "landing_page", "booking_title",
  "services", "sales_value", "profile",
  "estimated_subtotal", "estimated_tax", "estimated_total",
]);

const LEAD_TYPES = {
  WEB_FORM: "web_form",
  PHONE_CALL: "phone_call",
  AD_CLICK: "ad_click",
} as const;

interface RowData {
  text: string;
  html: string;
}

function extractTableRows(rawHtml: string): Map<string, RowData> {
  const rows = new Map<string, RowData>();
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(rawHtml)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, "").trim();
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

function extractProfileIdFromUrls(html: string): string | null {
  const match = html.match(/\/profile\/(\d+)\//);
  return match?.[1] || null;
}

function extractLeadIdFromUrls(html: string): string | null {
  const match = html.match(/[?&]lid=(\d+)/);
  return match?.[1] || null;
}

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

function extractLeadSource(html: string): string | null {
  const match = html.match(
    /This lead came from\s*<strong[^>]*>([^<]+)<\/strong>/i,
  );
  return match?.[1]?.trim() || null;
}

function detectLeadType(subject: string, html: string): string {
  const s = (subject || "").toLowerCase();
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
  if (/\/recording\/RE[0-9a-f]{32}\//.test(html)) return LEAD_TYPES.PHONE_CALL;
  return LEAD_TYPES.WEB_FORM;
}

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

function extractPetName(bookingTitle: string | undefined): string | null {
  if (!bookingTitle) return null;
  const match = bookingTitle.match(/Request for (.+)$/i);
  return match?.[1]?.trim() || null;
}

function extractLinkHref(cellHtml: string): string | null {
  const match = cellHtml.match(/href="([^"]+)"/);
  return match?.[1] || null;
}

function parseSalesValue(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

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

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  if (digits.length === 11 && digits[0] === "1") return digits;
  return digits || null;
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

  const from = headers.from || "";
  const subject = headers.subject || "";

  // ── Step 1: Extract all table rows
  const rawRows = extractTableRows(rawHtml);

  // Map labels to normalized keys
  const fields: Record<string, RowData> = {};
  for (const [label, data] of rawRows) {
    const key = LABEL_MAP[label];
    if (key) {
      fields[key] = data;
    } else {
      const fallbackKey = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (fallbackKey) fields[fallbackKey] = data;
    }
  }

  // ── Step 2: Detect lead type
  const leadType = detectLeadType(subject, rawHtml);

  // ── Step 3: Extract profile ID from embedded URLs
  const igniteProfileId = extractProfileIdFromUrls(rawHtml);

  // ── Step 4: Extract lead source
  const sourceDetail = extractLeadSource(rawHtml);

  // ── Step 5: Extract ignite lead ID
  const igniteLeadId =
    fields.lead_id?.text || extractLeadIdFromUrls(rawHtml) || null;

  // ── Step 6: Type-specific extraction
  let firstName = "";
  let lastName = "";
  let phone: string | null = null;
  let phoneRaw: string | null = null;
  let callRecordingUrl: string | null = null;

  if (leadType === LEAD_TYPES.PHONE_CALL) {
    const nameResult = extractCallerName(fields.caller_name?.text);
    firstName = nameResult.firstName;
    lastName = nameResult.lastName;

    phoneRaw = fields.caller_number?.text || null;
    phone = normalizePhone(phoneRaw);

    if (fields.recording?.html) {
      const rec = extractRecordingFromHtml(fields.recording.html);
      callRecordingUrl = rec.downloadUrl || rec.playUrl || null;
    }
    if (!callRecordingUrl) {
      const rec = extractRecordingFromHtml(rawHtml);
      callRecordingUrl = rec.downloadUrl || rec.playUrl || null;
    }
  }

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
  }

  // ── Step 7: Build form_data
  const formData: Record<string, unknown> = {};

  for (const [key, data] of Object.entries(fields)) {
    if (!PROMOTED_KEYS.has(key)) {
      formData[key] = data.text;
    }
  }

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

  if (igniteLeadId) formData.ignite_lead_id = igniteLeadId;

  const clientName =
    [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    leadType,
    firstName,
    lastName,
    clientName,
    email: null,
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

// ─── Run Tests ────────────────────────────────────────────────────────────────

async function main() {
  const decoder = new TextDecoder();
  
  console.log("=" .repeat(80));
  console.log("IGNITE PARSER v2 — LOCAL TEST");
  console.log("=" .repeat(80));

  // Test 1: Phone Call Email
  console.log("\n" + "─".repeat(80));
  console.log("TEST 1: Phone Call Email");
  console.log("─".repeat(80));

  const phoneHtml = decoder.decode(
    await Deno.readFile("src/ignite/samples/phone_call_real.html"),
  );

  const phoneResult = parseIgniteEmail(phoneHtml, {
    from: "noreply@leads.idigitalstrategies.com",
    subject: "New Phone Call | K9 Resorts Adair Forsythe",
  });

  console.log("\nLead Type:", phoneResult.leadType);
  console.log("First Name:", phoneResult.firstName);
  console.log("Last Name:", phoneResult.lastName);
  console.log("Client Name:", phoneResult.clientName);
  console.log("Phone (normalized):", phoneResult.phone);
  console.log("Phone (raw):", phoneResult.phoneRaw);
  console.log("Recording URL:", phoneResult.callRecordingUrl);
  console.log("Source Detail:", phoneResult.sourceDetail);
  console.log("Profile ID:", phoneResult.igniteProfileId);
  console.log("Error:", phoneResult.error || "none");

  console.log("\nForm Data:");
  for (const [key, value] of Object.entries(phoneResult.formData)) {
    const v = typeof value === "object" ? JSON.stringify(value) : String(value);
    console.log(`  ${key}: ${v.substring(0, 100)}`);
  }

  // Assertions for phone call
  const phoneChecks = [
    { name: "lead type is phone_call", pass: phoneResult.leadType === "phone_call" },
    { name: "has first name", pass: !!phoneResult.firstName },
    { name: "has last name", pass: !!phoneResult.lastName },
    { name: "has phone number", pass: !!phoneResult.phone },
    { name: "has recording URL", pass: !!phoneResult.callRecordingUrl },
    { name: "has profile ID", pass: !!phoneResult.igniteProfileId },
    { name: "profile ID is 156865", pass: phoneResult.igniteProfileId === "156865" },
    { name: "has source detail", pass: !!phoneResult.sourceDetail },
    { name: "no error", pass: !phoneResult.error },
    { name: "form_data has answer_status", pass: !!phoneResult.formData.answer_status },
    { name: "form_data has call_duration", pass: !!phoneResult.formData.call_duration },
    { name: "form_data has ignite_lead_id", pass: !!phoneResult.formData.ignite_lead_id },
  ];

  console.log("\n✓/✗ Checks:");
  for (const c of phoneChecks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
  }

  // Test 2: Appointment Email
  console.log("\n" + "─".repeat(80));
  console.log("TEST 2: Appointment Email");
  console.log("─".repeat(80));

  const apptHtml = decoder.decode(
    await Deno.readFile("src/ignite/samples/appointment_real.html"),
  );

  const apptResult = parseIgniteEmail(apptHtml, {
    from: "noreply@leads.idigitalstrategies.com",
    subject: "New Online Appointment | K9 Resorts Adair Forsythe",
  });

  console.log("\nLead Type:", apptResult.leadType);
  console.log("First Name:", apptResult.firstName);
  console.log("Last Name:", apptResult.lastName);
  console.log("Client Name:", apptResult.clientName);
  console.log("Phone:", apptResult.phone);
  console.log("Recording URL:", apptResult.callRecordingUrl);
  console.log("Source Detail:", apptResult.sourceDetail);
  console.log("Profile ID:", apptResult.igniteProfileId);
  console.log("Error:", apptResult.error || "none");

  console.log("\nForm Data:");
  for (const [key, value] of Object.entries(apptResult.formData)) {
    const v = typeof value === "object" ? JSON.stringify(value) : String(value);
    console.log(`  ${key}: ${v.substring(0, 200)}`);
  }

  // Assertions for appointment
  const apptChecks = [
    { name: "lead type is web_form", pass: apptResult.leadType === "web_form" },
    { name: "no first/last name (appointment has no contact info)", pass: !apptResult.firstName && !apptResult.lastName },
    { name: "has profile ID", pass: !!apptResult.igniteProfileId },
    { name: "profile ID is 156865", pass: apptResult.igniteProfileId === "156865" },
    { name: "has source detail", pass: !!apptResult.sourceDetail },
    { name: "no error", pass: !apptResult.error },
    { name: "form_data has booking_title", pass: !!apptResult.formData.booking_title },
    { name: "form_data has pet_name", pass: !!apptResult.formData.pet_name },
    { name: "form_data has services", pass: !!apptResult.formData.services },
    { name: "form_data has sales_value", pass: apptResult.formData.sales_value !== undefined },
    { name: "form_data has ignite_lead_id", pass: !!apptResult.formData.ignite_lead_id },
    { name: "form_data has dates", pass: !!apptResult.formData.dates },
  ];

  console.log("\n✓/✗ Checks:");
  for (const c of apptChecks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
  }

  // Summary
  const allChecks = [...phoneChecks, ...apptChecks];
  const passed = allChecks.filter((c) => c.pass).length;
  const total = allChecks.length;

  console.log("\n" + "=".repeat(80));
  console.log(`SUMMARY: ${passed}/${total} checks passed`);
  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED");
  } else {
    console.log("⚠️  SOME TESTS FAILED:");
    for (const c of allChecks.filter((c) => !c.pass)) {
      console.log(`  ✗ ${c.name}`);
    }
  }
  console.log("=".repeat(80));
}

main();
