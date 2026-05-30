-- ============================================================================
-- Ignite Leads — Outreach Log
-- Adds an append-only outreach_log to ignite_leads so the CRM intake page can
-- record follow-up touches (call / text / email / note) against a submission
-- and track the next follow-up date — without entangling the booking/employment
-- inbox with the broader lite_clients lifecycle pipeline.
--
-- Each entry has the shape:
--   {
--     "id": "out_<base36>",
--     "channel": "call" | "text" | "email" | "note",
--     "notes": "…",
--     "previousFollowUp": "YYYY-MM-DD" | "",
--     "newFollowUp": "YYYY-MM-DD" | "",
--     "loggedBy": "Full Name",
--     "loggedAt": "<ISO timestamp>"
--   }
--
-- Writes are covered by the existing ignite_leads_update RLS policy (a user may
-- update leads for their own location).
-- ============================================================================

ALTER TABLE ignite_leads
  ADD COLUMN IF NOT EXISTS outreach_log jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ignite_leads.outreach_log IS
  'Append-only CRM outreach touches for this submission (channel, notes, follow-up dates, who/when).';
