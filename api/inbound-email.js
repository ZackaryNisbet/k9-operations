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

// ─── Parse Ignite fields from plain text ───────────────────────────
// Handles both direct Ignite emails AND forwarded ones.
// Flexible matching: label can be followed by colon, tab, or 2+ spaces.
function parseIgniteText(rawText) {
  const fields = {};
  if (!rawText) return fields;

  const text = cleanText(rawText);
  const lines = text.split('\n');
  let collectingMessage = false;
  let messageLines = [];

  // Map of label patterns → field keys
  const fieldPatterns = [
    { pattern: /^First\s*Name/i, key: 'firstName' },
    { pattern: /^Last\s*Name/i, key: 'lastName' },
    { pattern: /^Email\s*(?:Address)?/i, key: 'email' },
    { pattern: /^Phone\s*(?:Number)?/i, key: 'phone' },
    { pattern: /^Zip\s*(?:Code)?/i, key: 'zip' },
    { pattern: /^Reason\s*(?:for\s*Contact)?/i, key: 'reason' },
    { pattern: /^Profile/i, key: 'profile' },
    { pattern: /^City/i, key: 'city' },
    { pattern: /^State/i, key: 'state' },
    { pattern: /^Lead\s*ID/i, key: 'leadId' },
    { pattern: /^Form\s*Name/i, key: 'formName' },
    { pattern: /^Lead\s*Page/i, key: 'leadPage' },
    { pattern: /^Landing\s*Page/i, key: 'landingPage' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { if (collectingMessage) messageLines.push(''); continue; }

    // Stop collecting message when we hit known fields
    if (collectingMessage && /^(Lead\s*ID|Is this lead)/i.test(trimmed)) {
      collectingMessage = false;
      fields.message = messageLines.join('\n').trim();
    }

    if (collectingMessage) {
      messageLines.push(trimmed);
      continue;
    }

    // Try each field pattern
    let matched = false;
    for (const { pattern, key } of fieldPatterns) {
      const labelMatch = trimmed.match(pattern);
      if (labelMatch) {
        // Extract value: everything after the label, separated by colon, tab, or 2+ spaces
        const afterLabel = trimmed.slice(labelMatch[0].length);
        const valueMatch = afterLabel.match(/^[\s:.\t]+(.+)/);
        if (valueMatch) {
          const val = cleanText(valueMatch[1]);
          // Don't overwrite if we already have a value (first match wins)
          // But for email, take the one that looks like an email
          if (key === 'email') {
            const emailExtract = val.match(/[\w.+-]+@[\w.-]+\.\w+/);
            if (emailExtract && !fields[key]) fields[key] = emailExtract[0];
          } else if (!fields[key] && val) {
            fields[key] = val;
          }
          matched = true;
          break;
        }
        // Value might be on the NEXT line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !/^(First|Last|Email|Phone|Zip|Reason|Profile|City|State|Lead|Form|Landing|How can|Is this|Time|Browser|Device|Country)/i.test(nextLine)) {
            if (key === 'email') {
              const emailExtract = nextLine.match(/[\w.+-]+@[\w.-]+\.\w+/);
              if (emailExtract && !fields[key]) fields[key] = emailExtract[0];
            } else if (!fields[key]) {
              fields[key] = cleanText(nextLine);
            }
            i++; // skip next line since we consumed it
            matched = true;
            break;
          }
        }
      }
    }

    // Handle "How can we help you?" (multiline)
    if (!matched && /^How can\s*(we\s*)?help/i.test(trimmed)) {
      const inlineVal = trimmed.replace(/^How can\s*(we\s*)?help\s*(you)?\??\s*[:.\t]?\s*/i, '').trim();
      if (inlineVal) messageLines.push(cleanText(inlineVal));
      collectingMessage = true;
    }
  }

  if (collectingMessage && messageLines.length > 0) {
    fields.message = messageLines.join('\n').trim();
  }

  // Extract source: "This lead came from google organic."
  const sourceMatch = text.match(/This lead came from\s+(.+?)[\.\n\r]/i);
  if (sourceMatch) fields.source = cleanText(sourceMatch[1]);

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
    console.log(`[K9 Inbound] TEXT length: ${(text||'').length}, HTML length: ${(html||'').length}`);
    console.log(`[K9 Inbound] TEXT preview (first 2000 chars): ${(text || '').slice(0, 2000)}`);

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

    // If still no useful fields, log more context
    if (!fields.firstName && !fields.lastName && !fields.email && !fields.phone) {
      console.log('[K9 Inbound] No fields parsed from email body');
      console.log(`[K9 Inbound] Full TEXT dump: ${(text || '').slice(0, 5000)}`);
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
