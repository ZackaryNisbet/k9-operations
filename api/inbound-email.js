// © 2026 K9 Operations LLC. All Rights Reserved.
// SendGrid Inbound Parse Webhook — receives Ignite lead emails,
// parses fields, and calls Supabase RPC to create/deduplicate clients.

export const config = { runtime: 'edge' };

// ─── Clean text: strip Outlook artifacts ───────────────────────────
function cleanText(str) {
  return (str || '')
    .replace(/\*/g, '')           // Outlook bold markers
    .replace(/\r/g, '')           // carriage returns
    .replace(/\u00a0/g, ' ')      // non-breaking spaces
    .replace(/\u200b/g, '')       // zero-width spaces
    .trim();
}

// ─── Parse Ignite fields using label-to-label extraction ───────────
// Works for BOTH multi-line (direct) and single-line (forwarded) formats.
// Finds each known label in the text and extracts the value between it
// and the next known label.
function parseIgniteText(rawText) {
  const fields = {};
  if (!rawText) return fields;

  const text = cleanText(rawText);

  // Extract source first (before we manipulate text)
  const sourceMatch = text.match(/This lead came from\s+(.+?)[\.\n\r]/i);
  if (sourceMatch) fields.source = cleanText(sourceMatch[1]);

  // All known Ignite labels in order, with their field keys
  const labels = [
    { label: 'First Name', key: 'firstName' },
    { label: 'Last Name', key: 'lastName' },
    { label: 'Phone Number', key: 'phone' },
    { label: 'Zip Code', key: 'zip' },
    { label: 'Reason for Contact', key: 'reason' },
    { label: 'Lead ID', key: 'leadId' },
    { label: 'Form Name', key: 'formName' },
    { label: 'Profile', key: 'profile' },
    { label: 'City', key: 'city' },
    { label: 'State', key: 'state' },
    { label: 'Lead Page', key: 'leadPage' },
    { label: 'Landing Page', key: 'landingPage' },
  ];

  // Build a mega-regex that finds any known label
  const allLabelPattern = labels.map(l => l.label).join('|')
    + '|Email Address|How can we help you\\??|Time|Browser|Device|Country|Zip|Is this lead';

  // For each label, find it in the text and extract value up to the next label
  for (const { label, key } of labels) {
    // Build regex: label followed by value, ending at next known label or newline
    const regex = new RegExp(
      label + '[\\s:.\t]+([\\s\\S]+?)(?=' + allLabelPattern + '|$)',
      'i'
    );
    const match = text.match(regex);
    if (match && match[1]) {
      let val = cleanText(match[1]);
      // Remove trailing URLs in parentheses: "value ( https://... )"
      val = val.replace(/\s*\([^)]*https?:\/\/[^)]*\)\s*/g, ' ').trim();
      // Remove standalone URLs
      val = val.replace(/https?:\/\/\S+/g, '').trim();
      if (val && !fields[key]) fields[key] = val;
    }
  }

  // Handle Email Address separately (appears twice in Ignite emails)
  const emailRegex = /Email\s*Address[\s:.\t]+([\s\S]+?)(?=Phone|Form|First|Last|How can|Lead|Time|Browser|Device|Country|Zip|City|State|Profile|Landing|Is this|$)/gi;
  let emailMatch;
  while ((emailMatch = emailRegex.exec(text)) !== null) {
    const chunk = emailMatch[1];
    const extracted = chunk.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (extracted && !fields.email) {
      fields.email = extracted[0];
    }
  }

  // Handle "How can we help you?" — value goes until "Lead ID" or end
  const helpMatch = text.match(/How can we help you\??\s*([\s\S]+?)(?=Lead\s*ID|Is this lead|$)/i);
  if (helpMatch && helpMatch[1]) {
    fields.message = cleanText(helpMatch[1]);
  }

  return fields;
}

// ─── Parse Ignite email from HTML ──────────────────────────────────
function parseIgniteHTML(html) {
  if (!html) return {};

  // Strategy: strip HTML tags to get structured text, then parse
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\t+/g, '\t')
    .replace(/[ ]+/g, ' ');

  // Parse the stripped text using tab-separated approach
  const fields = {};
  const lines = text.split('\n');

  const fieldMap = {
    'first name': 'firstName',
    'last name': 'lastName',
    'email address': 'email',
    'phone number': 'phone',
    'zip code': 'zip',
    'zip': 'zip',
    'reason for contact': 'reason',
    'profile': 'profile',
    'city': 'city',
    'state': 'state',
    'lead id': 'leadId',
    'form name': 'formName',
    'lead page': 'leadPage',
    'landing page': 'landingPage',
  };

  for (const line of lines) {
    // Try tab-separated first
    const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const key = parts[0].toLowerCase().replace(/\s+/g, ' ').replace(/[*:]/g, '');
      const value = cleanText(parts.slice(1).join(' '));

      if (key.includes('how can') && key.includes('help')) {
        if (!fields.message) fields.message = value;
      } else if (fieldMap[key] && !fields[fieldMap[key]]) {
        if (fieldMap[key] === 'email') {
          const emailExtract = value.match(/[\w.+-]+@[\w.-]+\.\w+/);
          if (emailExtract) fields.email = emailExtract[0];
        } else {
          fields[fieldMap[key]] = value;
        }
      }
    }
  }

  // Also run the text parser on the stripped HTML for extra coverage
  const textFields = parseIgniteText(text);
  for (const [k, v] of Object.entries(textFields)) {
    if (!fields[k] && v) fields[k] = v;
  }

  // Extract source from HTML (handles <strong>bold</strong> formatting)
  const sourceMatch = html.match(/This lead came from\s+(?:<[^>]*>)*\s*([^<.]+)/i);
  if (sourceMatch) {
    const src = cleanText(sourceMatch[1]);
    if (!fields.source && src) fields.source = src;
  }

  return fields;
}

// ─── Main webhook handler ──────────────────────────────────────────
export default async function handler(request) {
  // SendGrid requires 200 response even for errors (otherwise it retries)
  const ok = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  if (request.method === 'GET') {
    return ok({ status: 'healthy', service: 'K9 Operations Inbound Email' });
  }

  if (request.method !== 'POST') {
    return ok({ status: 'skipped', reason: 'method_not_allowed' });
  }

  try {
    // ── Parse multipart form data from SendGrid ──
    const formData = await request.formData();
    const html = formData.get('html') || '';
    const text = formData.get('text') || '';
    const to = formData.get('to') || '';
    const from = formData.get('from') || '';
    const subject = formData.get('subject') || '';
    const envelope = formData.get('envelope') || '{}';

    // ── Verify this is from Ignite ──
    const isIgnite = from.includes('leads.idigitalstrategies.com')
      || from.includes('ignitevisibility')
      || (subject && subject.toLowerCase().includes('new web form'));

    if (!isIgnite) {
      return ok({ status: 'skipped', reason: 'not_ignite', from });
    }

    // ── Parse the email ──
    // Try text first (cleaner), fall back to HTML
    let fields = parseIgniteText(text);

    // If text parsing didn't get key fields, try HTML
    if (!fields.firstName && !fields.email) {
      const htmlFields = parseIgniteHTML(html);
      fields = { ...htmlFields, ...fields }; // text fields take priority
    }

    // If still no useful fields, skip
    if (!fields.firstName && !fields.lastName && !fields.email && !fields.phone) {
      return ok({ status: 'skipped', reason: 'no_fields_parsed' });
    }

    // ── Extract "to" email for location mapping ──
    let toEmail = to;
    // Also check envelope for more reliable "to" address
    try {
      const env = JSON.parse(envelope);
      if (env.to && env.to.length > 0) toEmail = env.to[0];
    } catch (_) { /* use the to field */ }

    // Processing lead for location mapping

    // ── Call Supabase RPC ──
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[K9 Inbound] Missing Supabase env vars');
      return ok({ status: 'error', reason: 'missing_config' });
    }

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/process_ignite_lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        p_to_email: toEmail,
        p_fields: fields,
      }),
    });

    const result = await rpcResponse.json();
    return ok(result);
  } catch (err) {
    console.error('[K9 Inbound] Error processing email:', err);
    return ok({ status: 'error', message: err.message });
  }
}
