-- ============================================================================
-- Inbound email attachments (e.g. employment résumés). The webhook captures
-- attachments from the received email, stores the files in a private Storage
-- bucket, and records their metadata on the lead; the CRM shows download links.
-- ============================================================================

alter table ignite_leads add column if not exists attachments jsonb;

-- Private bucket for captured attachments (résumés contain PII).
insert into storage.buckets (id, name, public)
values ('ignite-attachments', 'ignite-attachments', false)
on conflict (id) do nothing;

-- Authenticated users may read attachment objects (the CRM mints signed URLs).
do $$ begin
  create policy "ignite_attachments_read" on storage.objects
    for select to authenticated using (bucket_id = 'ignite-attachments');
exception when duplicate_object then null; end $$;
