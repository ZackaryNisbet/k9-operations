// © 2026 K9 Operations LLC. All Rights Reserved.
// SendGrid Inbound Parse Webhook — receives Ignite lead emails,
// parses fields, and calls Supabase RPC to create/deduplicate clients.

export const config = { runtime: 'edge' };

// ─── Parse Ignite email from plain text ────────────────────────────
function parseIgniteText(text) {
  const fields = {};
  if (!text) return fields;

  const lines = text.split('\n');
  let collectingMessage = false;
  let messageLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { if (collectingMessage) messageLines.push(''); continue; }

    // Stop collecting message when we hit the next field
    if (collectingMessage && /^(Lead ID|Is this lead)/i.test(trimmed)) {
      collectingMessage = false;
      fields.message = messageLines.join('\n').trim();
    }

    if (collectingMessage) {
      messageLines.push(trimmed);
      continue;
    }

    let m;
    if ((m = trimmed.match(/^First\s*Name\s*[:.\t]\s*(.+)/i))) fields.firstName = m[1].trim();
    else if ((m = trimmed.match(/^Last\s*Name\s*[:.\t]\s*(.+)/i))) fields.lastName = m[1].trim();
    else if ((m = trimmed.match(/^Email\s*(?:Address)?\s*[:.\t]\s*(.+)/i))) fields.email = m[1].trim();
    else if ((m = trimmed.match(/^Phone\s*(?:Number)?\s*[:.\t]\s*(.+)/i))) fields.phone = m[1].trim();
    else if ((m = trimmed.match(/^Zip\s*(?:Code)?\s*[:.\t]\s*(.+)/i))) fields.zip = m[1].trim();
    else if ((m = trimmed.match(/^Reason\s*(?:for\s*Contact)?\s*[:.\t]\s*(.+)/i))) fields.reason = m[1].trim();
    else if ((m = trimmed.match(/^Profile\s*[:.\t]\s*(.+)/i))) fields.profile = m[1].trim();
    else if ((m = trimmed.match(/^City\s*[:.\t]\s*(.+)/i))) fields.city = m[1].trim();
    else if ((m = trimmed.match(/^State\s*[:.\t]\s*(.+)/i))) fields.state = m[1].trim();
    else if ((m = trimmed.match(/^Lead\s*ID\s*[:.\t]\s*(.+)/i))) fields.leadId = m[1].trim();
    else if ((m = trimmed.match(/^Form\s*Name\s*[:.\t]\s*(.+)/i))) fields.formName = m[1].trim();
    else if ((m = trimmed.match(/^Lead\s*Page\s*[:.\t]\s*(.+)/i))) fields.leadPage = m[1].trim();
    else if ((m = trimmed.match(/^Landing\s*Page\s*[:.\t]\s*(.+)/i))) fields.landingPage = m[1].trim();
    else if (/^How can\s*(we\s*)?help/i.test(trimmed)) {
      // Value might be on same line or next line(s)
      const inlineVal = trimmed.replace(/^How can\s*(we\s*)?help\s*(you)?\??\s*[:.\t]?\s*/i, '').trim();
      if (inlineVal) messageLines.push(inlineVal);
      collectingMessage = true;
    }
  }

  if (collectingMessage && messageLines.length > 0) {
    fields.message = messageLines.join('\n').trim();
  }

  // Extract source: "This lead came from google organic."
  const sourceMatch = text.match(/This lead came from\s+(.+?)[\.\n\r]/i);
  if (sourceMatch) fields.source = sourceMatch[1].trim();

  return fields;
}

// ─── Parse Ignite email from HTML ──────────────────────────────────
function parseIgniteHTML(html) {
  if (!html) return {};

  // Strategy: strip HTML tags to get plain text, then use text parser
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\t+/g, '\t')
    .replace(/[ ]+/g, ' ');

  // Parse the stripped text
  const fields = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const key = parts[0].toLowerCase().replace(/\s+/g, ' ');
      const value = parts.slice(1).join(' ').trim();

      if (key === 'first name') fields.firstName = value;
      else if (key === 'last name') fields.lastName = value;
      else if (key === 'email address') fields.email = value;
      else if (key === 'phone number') fields.phone = value;
      else if (key === 'zip code' || key === 'zip') fields.zip = value;
      else if (key === 'reason for contact') fields.reason = value;
      else if (key.includes('how can') && key.includes('help')) fields.message = value;
      else if (key === 'profile') fields.profile = value;
      else if (key === 'city') fields.city = value;
      else if (key === 'state') fields.state = value;
      else if (key === 'lead id') fields.leadId = value;
      else if (key === 'form name') fields.formName = value;
      else if (key === 'lead page') fields.leadPage = value;
      else if (key === 'landing page') fields.landingPage = value;
    }
  }

  // Extract source from HTML
  const sourceMatch = html.match(/This lead came from\s+(?:<[^>]*>)*\s*([^<.]+)/i);
  if (sourceMatch) fields.source = sourceMatch[1].trim();

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
    // TODO: Re-enable sender check after testing
    // const isIgnite = from.includes('leads.idigitalstrategies.com')
    //   || from.includes('ignitevisibility')
    //   || (subject && subject.toLowerCase().includes('new web form'));
    //
    // if (!isIgnite) {
    //   console.log(`[K9 Inbound] Skipping non-Ignite email from: ${from}`);
    //   return ok({ status: 'skipped', reason: 'not_ignite', from });
    // }
    console.log(`[K9 Inbound] TEST MODE — accepting email from: ${from}, subject: ${subject}`);
    console.log(`[K9 Inbound] TEXT preview (first 1000 chars): ${(text || '').slice(0, 1000)}`);
    console.log(`[K9 Inbound] HTML preview (first 1000 chars): ${(html || '').slice(0, 1000)}`);

    // ── Parse the email ──
    // Try text first (cleaner), fall back to HTML
    let fields = parseIgniteText(text);
    console.log(`[K9 Inbound] Text parse result: ${JSON.stringify(fields)}`);

    // If text parsing didn't get key fields, try HTML
    if (!fields.firstName && !fields.email) {
      const htmlFields = parseIgniteHTML(html);
      console.log(`[K9 Inbound] HTML parse result: ${JSON.stringify(htmlFields)}`);
      fields = { ...htmlFields, ...fields }; // text fields take priority
    }

    // If still no useful fields, try extracting from envelope/to
    if (!fields.firstName && !fields.lastName && !fields.email && !fields.phone) {
      console.log('[K9 Inbound] No fields parsed from email body');
      return ok({ status: 'skipped', reason: 'no_fields_parsed', textLength: (text||'').length, htmlLength: (html||'').length });
    }

    // ── Extract "to" email for location mapping ──
    let toEmail = to;
    // Also check envelope for more reliable "to" address
    try {
      const env = JSON.parse(envelope);
      if (env.to && env.to.length > 0) toEmail = env.to[0];
    } catch (_) { /* use the to field */ }

    console.log(`[K9 Inbound] Processing Ignite lead: ${fields.firstName} ${fields.lastName} → ${toEmail}`);

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
    console.log(`[K9 Inbound] RPC result:`, JSON.stringify(result));

    return ok(result);
  } catch (err) {
    console.error('[K9 Inbound] Error processing email:', err);
    return ok({ status: 'error', message: err.message });
  }
}
