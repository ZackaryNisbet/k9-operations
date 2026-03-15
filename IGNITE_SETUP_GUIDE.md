# Ignite Pipeline Setup Guide

This guide walks through setting up the full Ignite email ingestion pipeline for K9 Operations. The pipeline automatically receives lead notification emails from Ignite (iDigital Strategies), parses them, matches leads to existing Gingr clients, and stores them in the `ignite_leads` table.

## Architecture

```
Gmail (Ignite emails) → Resend Inbound → Webhook → Supabase Edge Function → ignite_leads table
```

## 1. Supabase Tables (Already Created)

The following tables are already set up in the K9 Operations Supabase project:

- **`ignite_config`** — Stores per-location Ignite configuration (profile ID, inbound email, active status)
- **`ignite_leads`** — Stores parsed leads with match results, confidence scores, and review queue data

Both tables have RLS enabled with permissive policies and proper indexes.

## 2. Edge Function Deployment

The edge function is located at `supabase/functions/ignite-webhook/index.ts`.

### Deploy via Supabase CLI

```bash
supabase functions deploy ignite-webhook --project-ref YOUR_SUPABASE_PROJECT_REF
```

### Deploy via Management API

Use the Supabase Management API to deploy the function if the CLI is not available.

### Set Required Secrets

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx --project-ref YOUR_SUPABASE_PROJECT_REF
```

The edge function also uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which are already available as default environment variables in Supabase Edge Functions.

## 3. Resend Inbound Email Setup

Resend provides a free `.resend.app` domain for every account that can receive inbound emails.

### Find Your Resend Inbound Address

1. Go to the [Resend Dashboard](https://resend.com/emails)
2. Click on the **Emails** tab → **Receiving** tab
3. Click the three dots menu → **"Receiving address"**
4. Your address will be in the format: `anything@<id>.resend.app`

### Alternative: Custom Domain

If you prefer a custom domain (e.g., `inbound.k9operations.com`):

1. In Resend dashboard, go to **Domains** → **Add Domain**
2. Add `inbound.k9operations.com` (or similar)
3. Set up MX records as shown in the Resend dashboard
4. Your inbound address will be `leads@inbound.k9operations.com`

### Configure the Webhook

1. In Resend dashboard, go to **Webhooks** → **Add Webhook**
2. Set the endpoint URL:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook
   ```
3. Select the **`email.received`** event type
4. Save the webhook

## 4. Gmail Forwarding

Set up Gmail to automatically forward Ignite lead notification emails to the Resend inbound address.

1. Open Gmail → **Settings** (gear icon) → **See all settings**
2. Go to **Filters and Blocked Addresses** tab
3. Click **Create a new filter**
4. In the **From** field, enter: `noreply@leads.idigitalstrategies.com`
5. Click **Create filter**
6. Check **Forward it to** and select your Resend inbound address
7. Click **Create filter**

> **Note:** If the Resend address isn't in the forwarding list yet, go to **Settings → Forwarding and POP/IMAP → Add a forwarding address** first.

## 5. Seeding ignite_config

Once you have the Ignite profile ID for the location, insert the configuration:

```sql
INSERT INTO ignite_config (location_id, ignite_profile_id, inbound_email)
VALUES (
  '11111111-1111-1111-1111-111111111111',  -- Adair Forsythe location ID
  '<PROFILE_ID>',                             -- e.g. 'IGN-7842'
  'leads@<id>.resend.app'                     -- Your Resend inbound address
);
```

The `is_active` column defaults to `true`. Set it to `false` to pause lead ingestion for a location.

## 6. Testing

### Via the K9 Ops UI

1. Go to **Settings → Ignite** tab in K9 Operations
2. Select a sample email type (Web Form, Phone Call, or Ad Click)
3. Click **"Test Connection"**
4. The button sends a sample Ignite email directly to the edge function (bypassing Resend)
5. Check the result message for success/failure

### Via Direct POST

Send a test email directly to the webhook:

```bash
curl -X POST https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@leads.idigitalstrategies.com",
    "subject": "New Web Form Submission - K9 Operations Adair Forsythe",
    "html": "<table><tr><td>First Name</td><td data-field=\"first_name\">Test</td></tr><tr><td>Last Name</td><td data-field=\"last_name\">User</td></tr><tr><td>Email</td><td data-field=\"email\">test@example.com</td></tr><tr><td>Phone</td><td data-field=\"phone\">(555) 123-4567</td></tr></table><span data-field=\"ignite_profile_id\">IGN-7842</span>",
    "headers": {
      "from": "noreply@leads.idigitalstrategies.com",
      "subject": "New Web Form Submission"
    }
  }'
```

### Verify Results

Check the `ignite_leads` table for new records:

```sql
SELECT id, first_name, last_name, email, phone, lead_type, match_status, match_confidence, created_at
FROM ignite_leads
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook returns 422 "Not an Ignite email" | The `from` address doesn't contain `noreply@leads.idigitalstrategies.com`. Check Gmail filter. |
| Webhook returns 422 "No active location configured" | Insert an `ignite_config` row with the correct `ignite_profile_id` and `is_active = true`. |
| Webhook returns 500 "RESEND_API_KEY not configured" | Set the `RESEND_API_KEY` secret via `supabase secrets set`. |
| Leads appear but all show `no_match` | Ensure `gingr_owners` is populated for the location. Run a Gingr sync first. |
| Test Connection works but real emails don't | Check Resend webhook configuration and ensure the `email.received` event is selected. |
