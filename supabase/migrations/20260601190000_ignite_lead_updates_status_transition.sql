-- Record the pipeline-status transition captured when a CRM log is saved, so the
-- activity timeline can show "Talking → Tour Scheduled" alongside the note.
-- App-controlled vocabulary (no CHECK), consistent with ignite_leads.lead_status.
ALTER TABLE public.ignite_lead_updates ADD COLUMN IF NOT EXISTS prev_status text;
ALTER TABLE public.ignite_lead_updates ADD COLUMN IF NOT EXISTS new_status text;
