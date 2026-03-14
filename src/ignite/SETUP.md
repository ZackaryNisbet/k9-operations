# Ignite Email Parser — Setup Guide

IGN-001 | K9 Operations

## Overview

This module parses Ignite (iDigital Strategies) notification emails and stores structured lead data in Supabase. When someone fills out a form, clicks an ad, or calls a tracking number through Ignite, a notification email is sent. This system captures those emails, parses them, matches leads to existing clients, and stores everything for review.

## 1. Run the SQL Migration

1. Open the Supabase Dashboard → SQL Editor
2. Create a new query
3. Paste the contents of `src/ignite/schema.sql`
4. Run the query

This creates:
- `ignite_leads` — stores parsed lead data
- `ignite_config` — per-location Ignite settings
- RLS policies so users can only access their own location's data
- Indexes on commonly queried columns

## 2. Configure ignite_config for Each Location

Insert a row for each location that uses Ignite:

```sql
INSERT INTO ignite_config (location_id, ignite_profile_id, forwarding_email, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',  -- Adair Forsythe
  'IGN-7842',                                 -- Ignite profile ID (from emails)
  'cherrhill-ignite@k9operations.app',        -- Forwarding address
  true
);
```

The `ignite_profile_id` is found in the footer of Ignite notification emails (look for "Ignite Profile: IGN-XXXX").

## 3. Set Up Email Forwarding

Configure auto-forwarding from the resort email that receives Ignite notifications to your K9 Ops inbound address.

**In Gmail:**
1. Settings → Forwarding and POP/IMAP
2. Add forwarding address (your K9 Ops inbound address)
3. Create a filter: From `noreply@leads.idigitalstrategies.com` → Forward to inbound address

**In Outlook:**
1. Settings → Mail → Forwarding
2. Or use Rules to forward only Ignite emails

## 4. Set Up Inbound Email Processing

Choose one of these options:

### Option A: Resend Inbound Webhooks (Recommended)

1. Set up an inbound domain in Resend (resend.com/inbound)
2. Configure the webhook URL to point to your edge function:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook
   ```
3. Resend will POST the parsed email (from, to, subject, html) to your webhook

### Option B: Supabase Edge Function + Email Service

1. Use any email-to-webhook service (Mailgun, SendGrid Inbound Parse, Postmark)
2. Point the webhook at your Supabase Edge Function URL
3. Ensure the POST body includes: `from`, `subject`, `html`

### Option C: Pipedream Workflow

1. Create a new Pipedream workflow with an Email trigger
2. Add a step that POSTs to your edge function:
   ```javascript
   await axios.post('https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook', {
     from: steps.trigger.event.from,
     subject: steps.trigger.event.subject,
     html: steps.trigger.event.html,
   });
   ```

## 5. Deploy the Edge Function

1. Copy `src/ignite/edgeFunction.js` to `supabase/functions/ignite-webhook/index.ts`
2. Uncomment the Deno serve block at the bottom
3. Adjust imports to use URL imports (Deno-style):
   ```typescript
   import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
   ```
4. Inline the parser/matcher code or bundle it (Supabase Edge Functions are single-file)
5. Deploy:
   ```bash
   supabase functions deploy ignite-webhook --project-ref YOUR_SUPABASE_PROJECT_REF
   ```
6. Set the service role key as a secret:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```

## 6. Testing

### Test with curl

```bash
# Test the webhook with a sample web form email
curl -X POST \
  https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@leads.idigitalstrategies.com",
    "subject": "New Web Form Submission - K9 Resorts Adair Forsythe",
    "html": "<html><body><div style=\"max-width:600px;\"><table><tr><td data-field=\"lead_type\">Web Form</td></tr><tr><td style=\"font-weight:bold;\">First Name</td><td data-field=\"first_name\">Test</td></tr><tr><td style=\"font-weight:bold;\">Last Name</td><td data-field=\"last_name\">User</td></tr><tr><td style=\"font-weight:bold;\">Email</td><td data-field=\"email\">test@example.com</td></tr><tr><td style=\"font-weight:bold;\">Phone</td><td data-field=\"phone\">(856) 555-0100</td></tr></table><div><span data-field=\"ignite_profile_id\">IGN-7842</span><span data-field=\"ignite_location_id\">LOC-CHR-001</span></div></div></body></html>"
  }'
```

```bash
# Test with a phone call email
curl -X POST \
  https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@leads.idigitalstrategies.com",
    "subject": "New Phone Call Lead - K9 Resorts Adair Forsythe",
    "html": "<html><body><table><tr><td data-field=\"lead_type\">Phone Call</td></tr><tr><td style=\"font-weight:bold;\">Caller Name</td><td data-field=\"caller_name\">John Doe</td></tr><tr><td style=\"font-weight:bold;\">Phone</td><td data-field=\"phone\">+1 (856) 555-0199</td></tr><tr><td style=\"font-weight:bold;\">Call Recording</td><td><a href=\"https://recordings.example.com/rec-test.mp3\" data-field=\"call_recording_url\">Listen</a></td></tr></table><div><span data-field=\"ignite_profile_id\">IGN-7842</span></div></body></html>"
  }'
```

### Test the parser locally

```javascript
import { parseIgniteEmail } from './src/ignite/parser.js';
import { SAMPLE_WEB_FORM_EMAIL } from './src/ignite/sampleEmails.js';

const result = parseIgniteEmail(
  SAMPLE_WEB_FORM_EMAIL.html,
  { from: SAMPLE_WEB_FORM_EMAIL.from, subject: SAMPLE_WEB_FORM_EMAIL.subject }
);
console.log(result);
```

## 7. Sample Ignite Email HTML

See `src/ignite/sampleEmails.js` for realistic examples of each email type:
- `SAMPLE_WEB_FORM_EMAIL` — Contact form submission
- `SAMPLE_PHONE_CALL_EMAIL` — Call tracking with recording URL
- `SAMPLE_AD_CLICK_EMAIL` — Ad click with campaign info

## Architecture

```
Email arrives at resort inbox
  → Auto-forwards to K9 Ops inbound address
    → Email service (Resend/Mailgun) sends webhook POST
      → Supabase Edge Function (ignite-webhook)
        → parseIgniteEmail() extracts structured data
        → matchLeadToClient() finds existing client
        → Stores in ignite_leads table
          → Available in K9 Ops dashboard (IGN-003)
```
