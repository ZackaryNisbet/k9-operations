# Email Campaigns — setup & operations

CRM Email Campaigns lets managers compose branded emails in an embedded **Stripo**
editor and send/schedule **blasts to website booking-form leads** (`ignite_leads`)
through **Resend**, with open/click/bounce tracking, one-click unsubscribe, and a
suppression list — all inside K9 Operations. Find it at **Home → Email Campaigns**
(or `/email-campaigns`), gated by the **"Email Campaigns Access"** permission
(managers + admins by default).

## Architecture

```
  CampaignsPage (React)
    ├─ StripoEditor ──onTokenRefreshRequest──▶ edge fn: stripo-token ──▶ Vault (stripo creds)
    │                                                                     └─▶ plugins.stripo.email/auth
    ├─ audience resolved from ignite_leads (same rules as the CRM page) − suppression
    └─ Save → email_campaigns/templates ; Send → rpc crm_email_prepare_send
                                                   └─▶ edge fn: send-campaign ──▶ Resend /emails
  Resend ──webhook──▶ edge fn: email-events ──▶ rpc crm_email_ingest_event ──▶ email_events (+ auto-suppress)
  Lead clicks Unsubscribe ──▶ edge fn: unsubscribe ──▶ rpc crm_email_unsubscribe ──▶ email_suppression
  pg_cron (*/5) ──▶ send-campaign {mode:"drain"} ──▶ sends any scheduled campaign now due
```

Two brands, by design: the **editor chrome** matches **K9 Operations** (DESIGN.md —
forest green `#14532D` / lime `#84CC16`); the **email content** matches **K9 Resorts**
(navy `#183661` / gold `#AF8D54`). Emails send from the verified **k9operations.com**
domain with a **"K9 Resorts"** from-name.

## Owner action items (one-time)

1. **Secrets.** Already present: `RESEND_API_KEY` (edge env). Stripo credentials are
   read from **Supabase Vault** secrets `stripo_plugin_id` / `stripo_secret_key`
   (already added) — or, alternatively, set edge env `STRIPO_PLUGIN_ID` /
   `STRIPO_SECRET_KEY`. Optional: `RESEND_WEBHOOK_SECRET` to verify the webhook
   signature (recommended).
2. **Resend webhook.** In the Resend dashboard, add a webhook to
   `https://<project-ref>.functions.supabase.co/functions/v1/email-events`
   subscribed to `email.delivered`, `email.opened`, `email.clicked`,
   `email.bounced`, `email.complained`. Put its signing secret in
   `RESEND_WEBHOOK_SECRET`.
3. **Stripo → Interface Appearance** (make the editor look like K9 Operations):
   - Primary / accent color: **`#14532D`** (with `#84CC16` as the highlight)
   - Logo: the K9 Operations logo (`/public/k9-logo-full.svg`)
   - Font: system UI / a clean sans (matches the app)
   - These are dashboard settings on the Stripo Plugin (Settings → Plugin →
     Interface Appearance); the content swatches (K9 Resorts navy/gold) and merge
     tags are configured automatically from code.
4. **Deliverability (recommended).** Marketing volume shares the k9operations.com
   sending reputation with transactional mail. If volume grows, move marketing to a
   dedicated subdomain (e.g. `email.k9operations.com`) and update each campaign's
   `from_email`.

## How sending works

- **Recipients** are resolved client-side from `ignite_leads` using the exact CRM
  rules (web-form booking leads with a deliverable email), filtered by the chosen
  pipeline stages, minus the suppression list. `crm_email_prepare_send` snapshots
  them and re-checks suppression server-side.
- **send-campaign** personalizes each email (merge tags from the lead snapshot),
  injects a per-recipient one-click unsubscribe link + `List-Unsubscribe` headers,
  and ensures a CAN-SPAM footer (physical address) is present.
- **Scheduling** stores `scheduled_at`; a 5-minute `pg_cron` job drains due
  campaigns. **Test sends** go to one address and touch no records.
- **Tracking**: the `email-events` webhook advances each recipient's state and bumps
  campaign counters; hard bounces and complaints are auto-suppressed.

## Compliance

Every marketing email carries a working unsubscribe (one-click + `List-Unsubscribe`)
and a physical mailing address. Unsubscribes, bounces, and complaints are added to
`email_suppression` and excluded from all future sends for that location.
