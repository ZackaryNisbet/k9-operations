/**
 * Ignite Lead Router
 * IGN-002
 *
 * Routes matched leads to client profiles and flags unmatched leads
 * for manual review. Integrates with the Supabase gingr_owners table.
 */

import { matchLeadFromSupabase, addToReviewQueue } from './matchClient.js';
import { MATCH_STATUSES, AUTO_MATCH_THRESHOLD } from './constants.js';

/**
 * Process an incoming parsed lead: match against gingr_owners, store result,
 * and route to the appropriate destination.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} locationId - Location UUID
 * @param {object} parsedLead - Output of parseIgniteEmail()
 * @returns {Promise<{ leadId: string, status: string, matchedClientId: string|null, candidates: Array, error?: string }>}
 */
export async function processAndRouteLead(supabaseClient, locationId, parsedLead) {
  // Step 1: Match against gingr_owners
  const { matchResult, status, candidates, error: matchError } = await matchLeadFromSupabase(
    supabaseClient,
    locationId,
    parsedLead,
  );

  if (matchError) {
    console.error('[ignite-router] Match error, storing as no_match:', matchError);
  }

  // Step 2: Insert lead into ignite_leads
  const { data: lead, error: insertError } = await supabaseClient
    .from('ignite_leads')
    .insert({
      location_id: locationId,
      lead_type: parsedLead.leadType,
      first_name: parsedLead.firstName || null,
      last_name: parsedLead.lastName || null,
      email: parsedLead.email,
      phone: parsedLead.phone,
      source_detail: parsedLead.sourceDetail,
      call_recording_url: parsedLead.callRecordingUrl,
      form_data: parsedLead.formData,
      ignite_profile_id: parsedLead.igniteProfileId,
      raw_email_html: parsedLead.rawHtml || null,
      raw_email_subject: parsedLead.rawSubject || null,
      matched_client_id: matchResult.clientId,
      match_status: status,
      match_confidence: matchResult.confidence || null,
      match_type: matchResult.matchType || null,
      match_candidates: status === MATCH_STATUSES.REVIEW
        ? candidates.map((c) => ({
            client_id: c.clientId,
            confidence: c.confidence,
            match_type: c.matchType,
          }))
        : null,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[ignite-router] Insert error:', insertError.message);
    return {
      leadId: null,
      status: MATCH_STATUSES.NO_MATCH,
      matchedClientId: null,
      candidates: [],
      error: insertError.message,
    };
  }

  // Step 3: Route based on status
  if (status === MATCH_STATUSES.MATCHED && matchResult.clientId) {
    // Auto-matched — link lead to client profile
    await linkLeadToClient(supabaseClient, lead.id, matchResult.clientId);
  }
  // REVIEW and NO_MATCH leads are accessible via fetchReviewQueue / fetchUnmatchedLeads

  return {
    leadId: lead.id,
    status,
    matchedClientId: matchResult.clientId,
    candidates,
  };
}

/**
 * Link an auto-matched lead to an existing client by updating the client's
 * ignite source metadata. This makes the lead visible in the client's
 * Ignite section (IGN-003).
 *
 * @param {object} supabaseClient
 * @param {string} leadId
 * @param {string} clientId - gingr_owners ID
 */
async function linkLeadToClient(supabaseClient, leadId, clientId) {
  const { error } = await supabaseClient
    .from('ignite_leads')
    .update({
      matched_client_id: clientId,
      match_status: MATCH_STATUSES.MATCHED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('[ignite-router] Error linking lead to client:', error.message);
  }
}

/**
 * Fetch all unmatched leads (no_match) for a location, for manual review
 * or new-client creation.
 *
 * @param {object} supabaseClient
 * @param {string} locationId
 * @returns {Promise<{ leads: Array, error?: string }>}
 */
export async function fetchUnmatchedLeads(supabaseClient, locationId) {
  const { data, error } = await supabaseClient
    .from('ignite_leads')
    .select('id, first_name, last_name, email, phone, lead_type, source_detail, form_data, created_at')
    .eq('location_id', locationId)
    .eq('match_status', MATCH_STATUSES.NO_MATCH)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ignite-router] Error fetching unmatched leads:', error.message);
    return { leads: [], error: error.message };
  }
  return { leads: data || [] };
}

/**
 * Fetch all matched leads for a specific client (for the Ignite section on
 * the client detail page — IGN-003).
 *
 * @param {object} supabaseClient
 * @param {string} clientId
 * @returns {Promise<{ leads: Array, error?: string }>}
 */
export async function fetchLeadsForClient(supabaseClient, clientId) {
  const { data, error } = await supabaseClient
    .from('ignite_leads')
    .select('id, lead_type, first_name, last_name, email, phone, source_detail, call_recording_url, form_data, match_confidence, match_type, created_at')
    .eq('matched_client_id', clientId)
    .eq('match_status', MATCH_STATUSES.MATCHED)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ignite-router] Error fetching client leads:', error.message);
    return { leads: [], error: error.message };
  }
  return { leads: data || [] };
}

/**
 * Mark an unmatched lead as a new client (creates the association after
 * the user has manually created the client in Gingr/K9 Ops).
 *
 * @param {object} supabaseClient
 * @param {string} leadId
 * @param {string} newClientId - The newly created gingr_owners ID
 * @param {string} resolvedBy - User ID who created the client
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function markLeadAsNewClient(supabaseClient, leadId, newClientId, resolvedBy) {
  const { error } = await supabaseClient
    .from('ignite_leads')
    .update({
      matched_client_id: newClientId,
      match_status: MATCH_STATUSES.MATCHED,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('[ignite-router] Error marking lead as new client:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}
