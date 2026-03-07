// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: ai-assistant
// Uses Claude with tool_use to query the database and answer any business question.
//
// Deploy: supabase functions deploy ai-assistant --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const sbUrl = Deno.env.get('SUPABASE_URL')!;
const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(sbUrl, sbKey);

const SCHEMA = `
## K9 Operations Database Schema

### k9_clients
Customers of the pet resort.
Columns: id (text PK), location_id (uuid FK), phone, first_name, last_name, email, address (freeform, legacy), street, city, state, zip, emergency_contact, emergency_phone, vet_name, vet_phone, notes (text), referral_source, created_at_app (text ISO date), lifecycle (jsonb), lifecycle_events (jsonb array), agreements (jsonb), notification_prefs (jsonb), custom_fields (jsonb), created_at, updated_at.

### k9_dogs
Dog profiles, each owned by a client.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), name, breed, weight, dob (text date), sex, spayed_neutered, color, bath_type, temperament (text), rabies_exp (text date), bordetella_exp (text date), dhpp_exp (text date), canine_flu_exp (text date), profile_pic, feeding_schedules (jsonb array), medication_schedules (jsonb array), weight_log (jsonb array), tags (jsonb array of strings like "eval","lp","sp","pp"), daycare_group_override, custom_fields (jsonb), created_at, updated_at.

### k9_reservations
All bookings: boarding, daycare, day-boarding, tours, evaluations.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), dog_id (text FK), type (boarding|daycare|day-boarding|tour|evaluation), room_type, room, check_in (text YYYY-MM-DD), check_out (text YYYY-MM-DD), check_in_time, check_out_time, daycare_size (small|large), status (upcoming|checked-in|checked-out|cancelled), eval_result, notes (text), discount_type, discount_value (decimal), total_price (decimal), amount_collected (decimal), fed_today, meds_today, cancelled_at, cancelled_by, actual_check_out_time, checked_out_by, care_overrides (jsonb), selected_add_ons (jsonb array), activity_log (jsonb), created_at, updated_at.

### k9_payments
Financial transactions.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), reservation_id (text FK), amount (decimal), type (deposit|payment|refund), method (card|cash|check), card_last4, status, note, timestamp (text ISO), processed_by, created_at.

### k9_evaluations
Behavioral evaluation assessments for dogs.
Columns: id (text PK), location_id (uuid FK), dog_id (text FK), client_id (text FK), reservation_id (text FK), date, evaluator_name, eval_type, has_experience (bool), total_score (decimal), max_score (decimal), result, notes, locked (bool), answers (jsonb), subtotals (jsonb), created_at.

### k9_messages
SMS communication history with clients.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), direction (inbound|outbound), channel (sms), body (text), timestamp (text ISO), status (sent|received|failed), read_at, twilio_sid, template_id, created_at.

### k9_daily_ops
Daily checklists and EOD reports.
Columns: id (text PK), location_id (uuid FK), type (opening|closing|fe|be|eod), date (text), locked (bool), completed_by, items (jsonb), sections (jsonb), mentions (jsonb), created_at, updated_at.

### k9_packages
Service package templates.
Columns: id (text PK), location_id (uuid FK), name, description, service_category, service_name, quantity (int), pricing_mode, discount_pct, discount_dollar, package_price (decimal), retail_value (decimal), unit_price (decimal), savings (decimal), expiration_type, expiration_days (int), available_online (bool), created_at, updated_at.

### k9_package_sales
Purchased packages by clients.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), package_id (text FK), quantity (int), used (int), purchase_date, package_name, created_at.

### k9_vaccine_records
Vaccine documents uploaded via customer portal.
Columns: id (text PK), location_id (uuid FK), dog_id (text FK), vaccine_name, expires_at (date), doc (jsonb), created_at, updated_at.

### k9_audit_log
Change-tracking for reservations.
Columns: id (text PK), location_id (uuid FK), reservation_id (text FK), timestamp (text), user_name, action, details (jsonb array), created_at.

### k9_reminder_log
Vaccine reminders sent to clients.
Columns: id (text PK), location_id (uuid FK), client_id (text FK), dog_id, vaccine_type, status, sent_at, message, phone_number, created_at.

### online_bookings
Customer self-service booking submissions.
Columns: id (text PK), location_id (uuid FK), status (pending|accepted|declined), submitted_at, processed_at, processed_by, decline_reason, reservation_type, check_in (date), check_out (date), room_type, tour_time, daycare_size, client_first_name, client_last_name, client_phone, client_email, dog_name, dog_breed, dog_weight, dog_sex, notes, add_ons (jsonb), created_at.

### location_pricing
Per-location pricing. Columns: id, location_id (uuid FK), category, sub_category, price (decimal), effective_from, effective_to.

### location_room_types
Room type definitions. Columns: id, location_id (uuid FK), name, sort_order.

### location_room_units
Individual room units. Columns: id, location_id (uuid FK), room_type_id (FK).

### Key relationships:
- Every table has location_id for multi-tenant isolation
- k9_dogs.client_id -> k9_clients.id
- k9_reservations.client_id -> k9_clients.id, dog_id -> k9_dogs.id
- k9_payments.client_id -> k9_clients.id, reservation_id -> k9_reservations.id
- k9_evaluations.dog_id -> k9_dogs.id, reservation_id -> k9_reservations.id

### Date format note:
Most date columns are TEXT in YYYY-MM-DD format. Use text comparison for date filtering (e.g., check_in >= '2026-03-01').
`;

const SYSTEM = `You are the AI assistant for K9 Operations, a luxury pet boarding resort POS system. You have direct database access via tools.

${SCHEMA}

## Your capabilities:
1. Answer any question about the business: revenue, clients, dogs, bookings, occupancy, payments, evaluations, messages, operations, packages
2. Look up records: find clients by name/phone, dogs by name/breed, reservations by date/status
3. Create reservations: collect details, return structured data for user confirmation
4. Update dog vaccines: parse dates, return structured update for user confirmation

## Rules:
- ALWAYS filter by location_id = $LOCATION_ID in every query
- Only use SELECT statements in query_database
- For write operations, use the dedicated tools that return confirmation payloads
- Keep responses concise and useful. Lead with the answer.
- When returning tabular data, use the structured_response tool with type "table"
- When returning a single metric, use type "metric"
- When multiple related insights, use type "summary"
- Suggest 1-2 follow-up questions when relevant
- Today's date is $TODAY
- If a query returns empty results, try ONE alternative approach. If that also fails, conclude with what you found (even if empty). Do NOT keep retrying more than twice for the same data.
- k9_clients has both a legacy freeform 'address' column AND individual 'street', 'city', 'state', 'zip' columns. Prefer the individual columns for queries (e.g., WHERE zip = '07054'). The legacy address column may still be populated for older records. If both are empty, say so — the data hasn't been collected yet.
- IMPORTANT: You have a maximum of 8 tool calls. Budget them wisely. Do NOT spend multiple rounds exploring whether data exists — query it once, and if empty, report that clearly.
- CRITICAL: Always finish your response with the actual answer or result. NEVER end with "Let me check..." or "Let me try...". Every response must have a conclusion.

## Response style:
- Be direct but transparent. You can briefly mention your approach (e.g., "Querying client addresses...") but always lead to the answer.
- Use numbers. Quantify everything.
- If the data is empty or zero, say so plainly.
- For money, format as dollars with 2 decimal places.
- For dates, use readable format (e.g., "Mar 7, 2026").
- Always end with the concrete answer, data, or result. Never leave a response hanging.
`;

const TOOLS = [
  {
    name: "query_database",
    description: "Execute a read-only SQL query. MUST include location_id = $1 filter. Only SELECT allowed.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SELECT query with location_id = $1." },
        params: { type: "array", items: { type: "string" }, description: "Extra params ($2, $3, etc)." },
      },
      required: ["sql"],
    },
  },
  {
    name: "structured_response",
    description: "Return structured data to the user (tables, metrics, summaries).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["table", "metric", "summary", "chart", "list", "confirmation"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        data: { description: "For table: {headers:string[], rows:any[][]}. For metric: {value:string, label:string, change?:string}. For summary: {items:{label:string, value:string}[]}." },
        followUps: { type: "array", items: { type: "string" }, description: "1-3 follow-up questions." },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "prepare_reservation",
    description: "Prepare a reservation for user confirmation. Does NOT create it.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        client_name: { type: "string" },
        dog_id: { type: "string" },
        dog_name: { type: "string" },
        type: { type: "string", enum: ["boarding", "daycare", "day-boarding", "tour", "evaluation"] },
        room_type: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        notes: { type: "string" },
      },
      required: ["client_id", "dog_id", "type", "check_in", "check_out"],
    },
  },
  {
    name: "prepare_vaccine_update",
    description: "Prepare a vaccine update for user confirmation. Does NOT update.",
    input_schema: {
      type: "object",
      properties: {
        dog_id: { type: "string" },
        dog_name: { type: "string" },
        vaccines: { type: "object", description: "Map of vaccine field to new YYYY-MM-DD date." },
      },
      required: ["dog_id", "vaccines"],
    },
  },
];

const FORBIDDEN = /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE|EXECUTE|EXEC)\b/i;

function validateSQL(sql: string): string | null {
  const trimmed = sql.trim().replace(/;+$/, '');
  if (!trimmed.toUpperCase().startsWith('SELECT')) return 'Only SELECT queries are allowed.';
  if (FORBIDDEN.test(trimmed)) return 'Query contains forbidden keywords.';
  if (!trimmed.includes('$1')) return 'Query must filter by location_id = $1.';
  return null;
}

async function executeQuery(sql: string, locationId: string, extraParams: string[] = []) {
  const err = validateSQL(sql);
  if (err) return { rows: [], error: err };

  const cleanSQL = sql.trim().replace(/;+$/, '');
  const allParams = [locationId, ...extraParams];

  try {
    const { data, error } = await sb.rpc('exec_sql', { query: cleanSQL, params: allParams });
    if (error) {
      return { rows: [], error: 'exec_sql RPC error: ' + error.message };
    }
    return { rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { rows: [], error: 'Query failed: ' + (e as Error).message };
  }
}

function pickModel(query: string): string {
  const complex = /\b(compare|trend|correlation|versus|vs\.?|month.over.month|year.over.year|forecast|predict|anomal|unusual|pattern|across|breakdown.by|segment|cohort)\b/i;
  if (complex.test(query) || query.split(/\s+/).length > 20) {
    return 'claude-sonnet-4-5-20250929';
  }
  return 'claude-haiku-4-5-20251001';
}

async function callClaude(messages: any[], systemPrompt: string, model: string, tools: any[]) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 8192, system: systemPrompt, tools, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Claude API error ' + res.status + ': ' + errText);
  }
  return await res.json();
}

function processToolUse(toolName: string, toolInput: any, locationId: string) {
  switch (toolName) {
    case 'query_database':
      return executeQuery(toolInput.sql, locationId, toolInput.params || []);
    case 'structured_response':
      return Promise.resolve({ stored: true, ...toolInput });
    case 'prepare_reservation':
      return Promise.resolve({ requires_confirmation: true, action: 'create_reservation', ...toolInput });
    case 'prepare_vaccine_update':
      return Promise.resolve({ requires_confirmation: true, action: 'update_vaccines', ...toolInput });
    default:
      return Promise.resolve({ error: 'Unknown tool: ' + toolName });
  }
}

async function executeConfirmedAction(action: string, params: any, locationId: string) {
  if (action === 'create_reservation') {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const { data, error } = await sb.from('k9_reservations').insert({
      id, location_id: locationId,
      client_id: params.client_id, dog_id: params.dog_id,
      type: params.type, room_type: params.room_type || null,
      check_in: params.check_in, check_out: params.check_out,
      check_in_time: params.check_in_time || '08:00',
      check_out_time: params.check_out_time || '18:00',
      status: 'upcoming', notes: params.notes || 'Booked via AI Assistant',
    }).select();
    if (error) return { success: false, error: error.message };
    return { success: true, reservation_id: id, data };
  }
  if (action === 'update_vaccines') {
    const updates: Record<string, any> = {};
    for (const [field, value] of Object.entries(params.vaccines || {})) {
      if (['rabies_exp', 'dhpp_exp', 'bordetella_exp', 'canine_flu_exp'].includes(field)) {
        updates[field] = value;
      }
    }
    const { error } = await sb.from('k9_dogs').update(updates).eq('id', params.dog_id).eq('location_id', locationId);
    if (error) return { success: false, error: error.message };
    return { success: true, updated_fields: Object.keys(updates) };
  }
  return { success: false, error: 'Unknown action: ' + action };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { query, conversationHistory = [], locationId, userId, confirmAction, confirmParams } = body;

    if (!locationId) return json({ error: 'Missing locationId' }, 400);

    if (confirmAction && confirmParams) {
      const result = await executeConfirmedAction(confirmAction, confirmParams, locationId);
      return json(result);
    }

    if (!query) return json({ error: 'Missing query' }, 400);

    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = SYSTEM.replace(/\$LOCATION_ID/g, locationId).replace(/\$TODAY/g, today);

    const messages: any[] = [];
    for (const msg of conversationHistory.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: query });

    const model = pickModel(query);
    let response = await callClaude(messages, systemPrompt, model, TOOLS);

    let structuredData: any = null;
    let confirmationPayload: any = null;
    let rounds = 0;
    let allTextBlocks: string[] = [];

    while (response.stop_reason === 'tool_use' && rounds < 8) {
      rounds++;
      const toolBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use');
      const toolResults: any[] = [];

      // Collect text from this round
      const roundText = (response.content || []).filter((b: any) => b.type === 'text');
      for (const tb of roundText) {
        if (tb.text) allTextBlocks.push(tb.text);
      }

      for (const block of toolBlocks) {
        const result = await processToolUse(block.name, block.input, locationId);
        if (block.name === 'structured_response') structuredData = result;
        if ((result as any).requires_confirmation) confirmationPayload = result;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await callClaude(messages, systemPrompt, model, TOOLS);
    }

    // Collect text from the final response
    const finalText = (response.content || []).filter((b: any) => b.type === 'text');
    for (const tb of finalText) {
      if (tb.text) allTextBlocks.push(tb.text);
    }
    const text = allTextBlocks.join('\n\n');

    const payload: any = { response: text, model };
    if (structuredData) payload.structured = structuredData;
    if (confirmationPayload) payload.confirmation = confirmationPayload;

    return json(payload);
  } catch (err) {
    console.error('ai-assistant error:', err);
    return json({ response: 'Error: ' + (err as Error).message, error: (err as Error).message }, 200);
  }
});
