// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: ai-assistant
// Universal AI backend for the entire K9 Operations platform.
// Uses Claude with tool_use to query the database, look up clients/dogs,
// create reservations, update vaccines, and answer any business question.
//
// Environment variables:
//   ANTHROPIC_API_KEY  — Claude API key
//   SUPABASE_URL       — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided, bypasses RLS

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ─── CORS ─────────────────────────────────────────────────────── */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/* ─── SUPABASE CLIENT (service role — bypasses RLS) ────────────── */
const sbUrl = Deno.env.get("SUPABASE_URL")!;
const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(sbUrl, sbKey);

/* ─── DATABASE SCHEMA (curated for Claude context) ─────────────── */
const SCHEMA = `
## K9 Operations Database Schema

### k9_clients
Customers of the pet resort.
Columns: id (text PK), location_id (uuid FK→locations), phone, first_name, last_name, email, address, emergency_contact, emergency_phone, vet_name, vet_phone, notes (text — freeform staff notes about the client), referral_source, created_at_app (text ISO date), lifecycle (jsonb — {conversion, retention, coldFrom}), lifecycle_events (jsonb array), agreements (jsonb), notification_prefs (jsonb), custom_fields (jsonb), created_at, updated_at.

### k9_dogs
Dog profiles, each owned by a client.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), name, breed, weight, dob (text date), sex, spayed_neutered, color, bath_type, temperament (text — behavioral notes), rabies_exp (text date), bordetella_exp (text date), dhpp_exp (text date), canine_flu_exp (text date), profile_pic, feeding_schedules (jsonb array of {id,times,amount,unit,foodType}), medication_schedules (jsonb array of {id,times,amount,unit,name}), weight_log (jsonb array of {date,weight}), tags (jsonb array of strings like "eval","lp","sp","pp"), daycare_group_override, custom_fields (jsonb), created_at, updated_at.

### k9_reservations
All bookings: boarding, daycare, day-boarding, tours, evaluations.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), dog_id (text FK→k9_dogs), type (boarding|daycare|day-boarding|tour|evaluation), room_type, room, check_in (text YYYY-MM-DD), check_out (text YYYY-MM-DD), check_in_time, check_out_time, daycare_size (small|large), status (upcoming|checked-in|checked-out|cancelled), eval_result, notes (text), discount_type, discount_value (decimal), total_price (decimal), amount_collected (decimal), fed_today, meds_today, cancelled_at, cancelled_by, actual_check_out_time, checked_out_by, care_overrides (jsonb), selected_add_ons (jsonb array), activity_log (jsonb), created_at, updated_at.

### k9_payments
Financial transactions tied to clients and reservations.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), reservation_id (text FK→k9_reservations), amount (decimal), type (deposit|payment|refund), method (card|cash|check), card_last4, status, note, timestamp (text ISO), processed_by, created_at.

### k9_evaluations
Behavioral evaluation assessments for dogs.
Columns: id (text PK), location_id (uuid FK→locations), dog_id (text FK→k9_dogs), client_id (text FK→k9_clients), reservation_id (text FK→k9_reservations), date, evaluator_name, eval_type, has_experience (bool), total_score (decimal), max_score (decimal), result, notes, locked (bool), answers (jsonb), subtotals (jsonb), created_at.

### k9_messages
SMS communication history with clients.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), direction (inbound|outbound), channel (sms), body (text), timestamp (text ISO), status (sent|received|failed), read_at, twilio_sid, template_id, created_at.

### k9_daily_ops
Daily checklists (opening, closing, front-end, back-end) and EOD reports.
Columns: id (text PK), location_id (uuid FK→locations), type (opening|closing|fe|be|eod), date (text), locked (bool), completed_by, items (jsonb — checklist items), sections (jsonb — EOD report sections array of {id,content}), mentions (jsonb), created_at, updated_at.

### k9_packages
Service package templates (daycare passes, boarding bundles).
Columns: id (text PK), location_id (uuid FK→locations), name, description, service_category, service_name, quantity (int), pricing_mode, discount_pct, discount_dollar, package_price (decimal), retail_value (decimal), unit_price (decimal), savings (decimal), expiration_type, expiration_days (int), available_online (bool), created_at, updated_at.

### k9_package_sales
Purchased packages by clients.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), package_id (text FK→k9_packages), quantity (int), used (int), purchase_date, package_name, created_at.

### k9_vaccine_records
Vaccine documents uploaded via customer portal.
Columns: id (text PK), location_id (uuid FK→locations), dog_id (text FK→k9_dogs), vaccine_name, expires_at (date), doc (jsonb), created_at, updated_at.

### k9_audit_log
Change-tracking and audit trail for reservations.
Columns: id (text PK), location_id (uuid FK→locations), reservation_id (text FK→k9_reservations), timestamp (text), user_name, action, details (jsonb array of {field,oldVal,newVal}), created_at.

### k9_reminder_log
Vaccine/communication reminders sent to clients.
Columns: id (text PK), location_id (uuid FK→locations), client_id (text FK→k9_clients), dog_id, vaccine_type, status, sent_at, message, phone_number, created_at.

### online_bookings
Customer self-service booking submissions from the portal.
Columns: id (text PK), location_id (uuid FK→locations), status (pending|accepted|declined), submitted_at, processed_at, processed_by, decline_reason, reservation_type, check_in (date), check_out (date), room_type, tour_time, daycare_size, client_first_name, client_last_name, client_phone, client_email, dog_name, dog_breed, dog_weight, dog_sex, notes, add_ons (jsonb), created_at.

### location_pricing
Per-location pricing configuration.
Columns: id, location_id (uuid FK→locations), category, sub_category, price (decimal), effective_from, effective_to.

### location_room_types
Room type definitions per location.
Columns: id, location_id (uuid FK→locations), name, sort_order.

### location_room_units
Individual room units per room type.
Columns: id, location_id (uuid FK→locations), room_type_id (FK→location_room_types).

### Key relationships:
- Every table has location_id for multi-tenant isolation
- k9_dogs.client_id → k9_clients.id
- k9_reservations.client_id → k9_clients.id
- k9_reservations.dog_id → k9_dogs.id
- k9_payments.client_id → k9_clients.id
- k9_payments.reservation_id → k9_reservations.id
- k9_evaluations.dog_id → k9_dogs.id
- k9_evaluations.reservation_id → k9_reservations.id

### Date format note:
Most date columns are TEXT in YYYY-MM-DD format, not DATE type. Timestamps are TEXT ISO strings. Use text comparison for date filtering (e.g., check_in >= '2026-03-01').
`;

/* ─── SYSTEM PROMPT ────────────────────────────────────────────── */
const SYSTEM = `You are the AI assistant for K9 Operations, a luxury pet boarding resort POS system. You have direct database access via tools.

${SCHEMA}

## Your capabilities:
1. **Answer any question** about the business — revenue, clients, dogs, bookings, occupancy, payments, evaluations, messages, operations, packages
2. **Look up records** — find clients by name/phone, dogs by name/breed, reservations by date/status
3. **Create reservations** — collect details, calculate pricing, return structured data for user confirmation
4. **Update dog vaccines** — parse dates, return structured update for user confirmation

## Rules:
- ALWAYS filter by location_id = $LOCATION_ID in every query
- Only use SELECT statements in query_database — never INSERT/UPDATE/DELETE
- For write operations (create reservation, update vaccines), use the dedicated tools that return confirmation payloads
- Keep responses concise and useful. Lead with the answer, not the methodology.
- When returning tabular data, use the structured_response tool with type "table"
- When returning a single metric, use type "metric"
- When multiple related insights exist, use type "summary"
- Suggest 1-2 follow-up questions when relevant
- Today's date is $TODAY

## Response style:
- Be direct. No filler phrases like "Great question!" or "Let me look into that."
- Use numbers. Quantify everything.
- If the data is empty or zero, say so plainly.
- For revenue/money, always format as dollars with 2 decimal places.
- For dates, use readable format (e.g., "Mar 7, 2026").
`;

/* ─── TOOL DEFINITIONS ─────────────────────────────────────────── */
const TOOLS = [
  {
    name: "query_database",
    description:
      "Execute a read-only SQL query against the K9 Operations database. MUST include location_id filter. Only SELECT is allowed. Use parameterized queries with $1, $2, etc. The first parameter ($1) is always the location_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description:
            "A SELECT SQL query. Must reference location_id = $1. Use $2, $3 etc for additional params.",
        },
        params: {
          type: "array",
          items: { type: "string" },
          description:
            "Additional query parameters (beyond location_id which is auto-injected as $1).",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "structured_response",
    description:
      "Return a structured response to the user. Use this for tables, metrics, summaries, and charts.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["table", "metric", "summary", "chart", "list", "confirmation"],
          description: "The type of structured response.",
        },
        title: { type: "string", description: "Title for the response." },
        subtitle: {
          type: "string",
          description: "Optional subtitle or date range context.",
        },
        data: {
          description:
            "The structured data. For table: {headers:string[], rows:any[][]}. For metric: {value:string, label:string, change?:string, changeDirection?:'up'|'down'|'flat'}. For summary: {items:{label:string, value:string, detail?:string}[]}. For chart: {labels:string[], datasets:{label:string, data:number[]}[]}. For list: {items:{title:string, subtitle?:string}[]}. For confirmation: {action:string, details:{label:string,value:string}[], warning?:string}.",
        },
        followUps: {
          type: "array",
          items: { type: "string" },
          description: "1-3 suggested follow-up questions.",
        },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "prepare_reservation",
    description:
      "Prepare a reservation for user confirmation. Does NOT create it — returns a confirmation payload. Use when the user wants to book a stay.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string", description: "Client ID" },
        client_name: { type: "string", description: "Client full name" },
        dog_id: { type: "string", description: "Dog ID" },
        dog_name: { type: "string", description: "Dog name" },
        type: {
          type: "string",
          enum: ["boarding", "daycare", "day-boarding", "tour", "evaluation"],
        },
        room_type: { type: "string" },
        check_in: { type: "string", description: "YYYY-MM-DD" },
        check_out: { type: "string", description: "YYYY-MM-DD" },
        check_in_time: { type: "string", description: "HH:MM, default 08:00" },
        check_out_time: {
          type: "string",
          description: "HH:MM, default 18:00",
        },
        notes: { type: "string" },
      },
      required: ["client_id", "dog_id", "type", "check_in", "check_out"],
    },
  },
  {
    name: "prepare_vaccine_update",
    description:
      "Prepare a vaccine update for user confirmation. Does NOT update — returns a confirmation payload.",
    input_schema: {
      type: "object" as const,
      properties: {
        dog_id: { type: "string" },
        dog_name: { type: "string" },
        vaccines: {
          type: "object",
          description:
            "Map of vaccine field to new expiration date. Keys: rabies_exp, dhpp_exp, bordetella_exp, canine_flu_exp. Values: YYYY-MM-DD.",
        },
      },
      required: ["dog_id", "vaccines"],
    },
  },
];

/* ─── SQL SAFETY ───────────────────────────────────────────────── */
const FORBIDDEN = /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE|EXECUTE|EXEC)\b/i;
const MAX_QUERY_MS = 8000;

function validateSQL(sql: string): string | null {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!trimmed.toUpperCase().startsWith("SELECT"))
    return "Only SELECT queries are allowed.";
  if (FORBIDDEN.test(trimmed))
    return "Query contains forbidden keywords.";
  if (!trimmed.includes("$1"))
    return "Query must filter by location_id = $1.";
  return null;
}

/* ─── EXECUTE QUERY ────────────────────────────────────────────── */
async function executeQuery(
  sql: string,
  locationId: string,
  extraParams: string[] = [],
): Promise<{ rows: any[]; error?: string }> {
  const err = validateSQL(sql);
  if (err) return { rows: [], error: err };

  const cleanSQL = sql.trim().replace(/;+$/, "");
  const allParams = [locationId, ...extraParams];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_QUERY_MS);

    const { data, error } = await sb.rpc("exec_sql", {
      query: cleanSQL,
      params: allParams,
    });

    clearTimeout(timeout);

    if (error) {
      // Fallback: try direct query via postgrest if RPC doesn't exist
      // This uses the raw SQL execution approach
      const res = await fetch(`${sbUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sbKey}`,
          apikey: sbKey,
        },
        body: JSON.stringify({ query: cleanSQL, params: allParams }),
      });

      if (!res.ok) {
        // Final fallback: parse the SQL and try to use PostgREST
        return {
          rows: [],
          error: `Query execution failed: ${error.message}. You may need to create the exec_sql RPC function. Trying PostgREST...`,
        };
      }

      const result = await res.json();
      return { rows: Array.isArray(result) ? result : [] };
    }

    return { rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { rows: [], error: `Query failed: ${(e as Error).message}` };
  }
}

/* ─── MODEL ROUTING ────────────────────────────────────────────── */
function pickModel(query: string): string {
  const complex =
    /\b(compare|trend|correlation|versus|vs\.?|month.over.month|year.over.year|forecast|predict|anomal|unusual|pattern|across|breakdown.by|segment|cohort)\b/i;
  if (complex.test(query) || query.split(/\s+/).length > 20) {
    return "claude-sonnet-4-5-20250929";
  }
  return "claude-haiku-4-5-20251001";
}

/* ─── CALL CLAUDE ──────────────────────────────────────────────── */
async function callClaude(
  messages: any[],
  systemPrompt: string,
  model: string,
  tools: any[],
) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  return await res.json();
}

/* ─── PROCESS TOOL CALLS ───────────────────────────────────────── */
async function processToolUse(
  toolName: string,
  toolInput: any,
  locationId: string,
): Promise<any> {
  switch (toolName) {
    case "query_database": {
      const result = await executeQuery(
        toolInput.sql,
        locationId,
        toolInput.params || [],
      );
      if (result.error) return { error: result.error };
      return {
        rows: result.rows.slice(0, 100), // Cap at 100 rows
        rowCount: result.rows.length,
        truncated: result.rows.length > 100,
      };
    }
    case "structured_response":
      return { stored: true, ...toolInput };
    case "prepare_reservation":
      return {
        requires_confirmation: true,
        action: "create_reservation",
        ...toolInput,
      };
    case "prepare_vaccine_update":
      return {
        requires_confirmation: true,
        action: "update_vaccines",
        ...toolInput,
      };
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/* ─── EXECUTE CONFIRMED ACTION ─────────────────────────────────── */
async function executeConfirmedAction(
  action: string,
  params: any,
  locationId: string,
): Promise<any> {
  switch (action) {
    case "create_reservation": {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      const { data, error } = await sb.from("k9_reservations").insert({
        id,
        location_id: locationId,
        client_id: params.client_id,
        dog_id: params.dog_id,
        type: params.type,
        room_type: params.room_type || null,
        room: params.room || null,
        check_in: params.check_in,
        check_out: params.check_out,
        check_in_time: params.check_in_time || "08:00",
        check_out_time: params.check_out_time || "18:00",
        status: "upcoming",
        notes: params.notes || "Booked via AI Assistant",
      }).select();

      if (error) return { success: false, error: error.message };
      return { success: true, reservation_id: id, data };
    }
    case "update_vaccines": {
      const updates: Record<string, any> = {};
      for (const [field, value] of Object.entries(params.vaccines || {})) {
        if (["rabies_exp", "dhpp_exp", "bordetella_exp", "canine_flu_exp"].includes(field)) {
          updates[field] = value;
        }
      }
      const { error } = await sb
        .from("k9_dogs")
        .update(updates)
        .eq("id", params.dog_id)
        .eq("location_id", locationId);

      if (error) return { success: false, error: error.message };
      return { success: true, updated_fields: Object.keys(updates) };
    }
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

/* ─── MAIN HANDLER ─────────────────────────────────────────────── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      query,
      conversationHistory = [],
      locationId,
      userId,
      confirmAction,
      confirmParams,
    } = body;

    if (!locationId) return json({ error: "Missing locationId" }, 400);

    // ── Handle confirmed write action ──
    if (confirmAction && confirmParams) {
      const result = await executeConfirmedAction(
        confirmAction,
        confirmParams,
        locationId,
      );
      return json(result);
    }

    if (!query) return json({ error: "Missing query" }, 400);

    // ── Build messages ──
    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = SYSTEM
      .replace(/\$LOCATION_ID/g, locationId)
      .replace(/\$TODAY/g, today);

    const messages: any[] = [];

    // Include conversation history (last 10 messages max)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current query
    messages.push({ role: "user", content: query });

    // ── Call Claude with tool_use ──
    const model = pickModel(query);
    let response = await callClaude(messages, systemPrompt, model, TOOLS);

    // ── Process tool calls in a loop (max 5 rounds) ──
    let structuredData: any = null;
    let confirmationPayload: any = null;
    let rounds = 0;

    while (response.stop_reason === "tool_use" && rounds < 5) {
      rounds++;
      const toolBlocks = response.content.filter(
        (b: any) => b.type === "tool_use",
      );

      const toolResults: any[] = [];

      for (const block of toolBlocks) {
        const result = await processToolUse(
          block.name,
          block.input,
          locationId,
        );

        // Capture structured responses and confirmations
        if (block.name === "structured_response") {
          structuredData = result;
        }
        if (result.requires_confirmation) {
          confirmationPayload = result;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await callClaude(messages, systemPrompt, model, TOOLS);
    }

    // ── Extract final text response ──
    const textBlocks = (response.content || []).filter(
      (b: any) => b.type === "text",
    );
    const text = textBlocks.map((b: any) => b.text).join("\n");

    // ── Build response payload ──
    const payload: any = {
      response: text,
      model,
    };

    if (structuredData) {
      payload.structured = structuredData;
    }
    if (confirmationPayload) {
      payload.confirmation = confirmationPayload;
    }

    return json(payload);
  } catch (err) {
    console.error("ai-assistant error:", err);
    return json(
      {
        response:
          "Something went wrong processing your request. Please try again.",
        error: (err as Error).message,
      },
      200, // Return 200 so client handles gracefully
    );
  }
});
