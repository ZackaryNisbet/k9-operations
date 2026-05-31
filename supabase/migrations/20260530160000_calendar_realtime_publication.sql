-- Add the aggregated-calendar source tables to the supabase_realtime publication
-- so the calendar can live-update via postgres_changes subscriptions (e.g. an
-- employee created on another device appears instantly). Idempotent;
-- lite_settings + training_records are already publication members.
do $$
declare t text;
begin
  foreach t in array array[
    'labor_employees','employee_review_instances','grassroots_event_dates','grassroots_targets',
    'enrichment_events','labor_compliance_due_date_overrides','labor_compliance_exceptions',
    'labor_compliance_evidence_links','labor_compliance_requirements','labor_compliance_role_applicability'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
