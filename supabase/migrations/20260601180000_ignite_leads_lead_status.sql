-- CRM outreach pipeline status for leads (web_form + employment).
-- App-controlled vocabulary (no CHECK) so the status taxonomy can evolve
-- without a migration. NULL is treated by the UI as the first stage
-- ("New Lead: Action Needed"). Distinct from match_status (lead-matching).
ALTER TABLE public.ignite_leads ADD COLUMN IF NOT EXISTS lead_status text;

CREATE INDEX IF NOT EXISTS idx_ignite_leads_lead_status
  ON public.ignite_leads(location_id, lead_status);

COMMENT ON COLUMN public.ignite_leads.lead_status IS
  'CRM outreach pipeline status (app-controlled vocabulary; NULL = New Lead: Action Needed). Distinct from match_status.';
