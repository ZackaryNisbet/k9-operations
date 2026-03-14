/**
 * Ignite Email Webhook — Supabase Edge Function Template
 * IGN-001
 *
 * Deploy as a Supabase Edge Function. Receives POST webhooks from an
 * email forwarding service (e.g., Resend inbound), parses the Ignite
 * email, matches to existing clients, and stores in the database.
 *
 * To deploy:
 *   supabase functions deploy ignite-webhook --project-ref <ref>
 *
 * NOTE: This file uses Deno APIs (serve pattern). It is NOT imported by
 * the Vite app — it's a standalone edge function template.
 */

import { parseIgniteEmail, parseRegex } from './parser.js';
import { matchLeadToClient } from './matchClient.js';
import { IGNITE_SENDER_EMAIL, MATCH_STATUSES, AUTO_MATCH_THRESHOLD } from './constants.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-secret',
};

/**
 * Generate a simple hash for idempotency checks.
 * Uses a basic string hash — no crypto dependency needed.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return 'igh_' + Math.abs(hash).toString(36);
}

/**
 * Edge function handler.
 *
 * Expected POST body (from email forwarding webhook):
 * {
 *   from: string,
 *   to: string,
 *   subject: string,
 *   html: string,
 *   headers: object (optional)
 * }
 */
export async function handleWebhook(req, supabaseClient) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { from, subject, html, headers: emailHeaders } = body;

    // Validate sender
    if (from && !from.includes(IGNITE_SENDER_EMAIL)) {
      return new Response(JSON.stringify({ error: 'Not an Ignite email', from }), {
        status: 422,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!html) {
      return new Response(JSON.stringify({ error: 'No HTML body provided' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency: hash subject + first 500 chars of HTML
    const idempotencyKey = simpleHash((subject || '') + html.slice(0, 500));

    const { data: existing } = await supabaseClient
      .from('ignite_leads')
      .select('id')
      .eq('raw_email_subject', subject || '')
      .limit(1);

    // Simple dedup — if we already processed an email with the same subject recently,
    // check our hash. In production, store the hash in a dedicated column.
    if (existing && existing.length > 0) {
      console.log(`[ignite-webhook] Possible duplicate: ${idempotencyKey}`);
      // Allow processing to continue — exact dedup would need hash column
    }

    // Parse the email (regex mode for edge function — no DOMParser)
    const parsed = parseIgniteEmail(html, {
      from: from || '',
      subject: subject || '',
      ...emailHeaders,
    }, { useRegex: true });

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 422,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Look up location from ignite_config
    let locationId = null;
    if (parsed.igniteProfileId) {
      const { data: config } = await supabaseClient
        .from('ignite_config')
        .select('location_id')
        .eq('ignite_profile_id', parsed.igniteProfileId)
        .eq('is_active', true)
        .single();

      if (config) locationId = config.location_id;
    }

    if (!locationId) {
      console.warn('[ignite-webhook] No location found for profile:', parsed.igniteProfileId);
      return new Response(JSON.stringify({
        error: 'No active location configured for this Ignite profile',
        igniteProfileId: parsed.igniteProfileId,
      }), {
        status: 422,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Match to existing clients
    const { data: clients } = await supabaseClient
      .from('clients')
      .select('id, email, phone, first_name, last_name')
      .eq('location_id', locationId);

    const clientList = (clients || []).map((c) => ({
      id: c.id,
      email: c.email,
      phone: c.phone,
      firstName: c.first_name,
      lastName: c.last_name,
    }));

    const matchResult = matchLeadToClient(parsed, clientList);

    // Determine match status
    let matchStatus = MATCH_STATUSES.NEW;
    if (matchResult.matched) {
      matchStatus = matchResult.confidence >= AUTO_MATCH_THRESHOLD
        ? MATCH_STATUSES.MATCHED
        : MATCH_STATUSES.REVIEW;
    } else {
      matchStatus = MATCH_STATUSES.NO_MATCH;
    }

    // Insert the lead
    const { data: lead, error: insertError } = await supabaseClient
      .from('ignite_leads')
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
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[ignite-webhook] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store lead', detail: insertError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ignite-webhook] Lead stored: ${lead.id} (${matchStatus})`);

    return new Response(JSON.stringify({
      success: true,
      leadId: lead.id,
      matchStatus,
      matchConfidence: matchResult.confidence,
      matchType: matchResult.matchType,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ignite-webhook] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

/*
 * ─── Deno Serve Pattern ───────────────────────────────────────────────────────
 *
 * Uncomment the block below when deploying as a Supabase Edge Function.
 * It wires up the Deno HTTP server and injects the Supabase client.
 *
 * import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
 * import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 *
 * serve(async (req) => {
 *   const supabaseClient = createClient(
 *     Deno.env.get('SUPABASE_URL') ?? '',
 *     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
 *   );
 *   return handleWebhook(req, supabaseClient);
 * });
 */
