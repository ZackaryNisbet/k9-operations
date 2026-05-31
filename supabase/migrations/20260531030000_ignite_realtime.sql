-- ============================================================================
-- Live CRM — stream ignite_leads + ignite_lead_updates over Realtime so the CRM
-- page updates itself with no manual refresh. REPLICA IDENTITY FULL ensures the
-- per-location realtime filter matches UPDATE/DELETE events, not just INSERTs.
-- ============================================================================

alter publication supabase_realtime add table ignite_leads;
alter publication supabase_realtime add table ignite_lead_updates;
alter table ignite_leads replica identity full;
alter table ignite_lead_updates replica identity full;
