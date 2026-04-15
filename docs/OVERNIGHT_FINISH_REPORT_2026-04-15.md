# Overnight Finish Report — April 15, 2026

## What shipped tonight

### Web
- Labor roster was rebuilt around separate roster fields, sortable headers, inactive toggle, unified compliance state, separate 30 / 60 / 90 columns, full-page review flows, and the animated filter/save-view experience.
- Labor templates now have a real top-right `Add Template` path instead of clone-only creation, and the employee-facing version history no longer leaks source-document provenance.
- `Client Management` was relabeled to `Incidents` across the lean shell surfaces, with incident-category cleanup, incident-rate math, and draft recovery support.
- Homepage now pulls the same canonical core metrics as dashboard logic, includes the `5 a.m. Briefing`, and exposes Inventory, Scheduling, Labor, Incidents, Resources, Grassroots, and Checkout TV quick access.
- Resources and Grassroots are live resort-level pages.
- `Today's Gingr Notes` is now a live-refresh notes surface backed by a dedicated edge function and a cached `lite_daily_ops` snapshot.
- Inventory cadence is configurable instead of hard-coded to Monday, and the web surface now respects the configured cycle.
- The old lean dashboard route/page was removed from the active lean app flow.

### Mobile
- MOD/PCT/CSR parity work landed for opening/closing roll call, emergency contacts expansion, enrichment status handling, room cleaning preview parity, private play preview parity, and inventory cadence logic.
- New workflow surfaces landed for:
  - AM Feeding and Meds
  - Midday Feeding and Meds
  - PM Feeding and Meds
  - Feeding Report
  - Vendor Log
  - Re-eval
- Feeding-and-meds, feeding report, and re-eval now read canonical workflow data and write back through `lite_daily_ops`.
- Mobile audits are no longer bathing-only. Feeding workflows and feeding report can launch the audit surface too.
- The current native build was archived successfully and installed on Zack’s iPhone over the local device tunnel.

### Server-side / integrity
- `gingr-sync` now actively syncs Gingr feeding schedules and medication rows instead of leaving those workflow tables empty.
- `ops-audit` now supports:
  - bathing
  - AM Feeding and Meds
  - Midday Feeding and Meds
  - PM Feeding and Meds
  - Feeding Report
- `gingr-today-notes` was added and deployed so the notes surface can refresh from live Gingr reservation payloads instead of only showing stale local notes.
- The following Supabase Edge Functions were deployed to the linked production project:
  - `gingr-sync`
  - `ops-audit`
  - `gingr-today-notes`

## What is still intentionally not finished

### Deferred until the OTP/email integration pass
- Live SMS OTP verification
- Live incident-email sending and recipient management
- Vendor OTP verification beyond placeholder state

### Still blocked by environment / release setup
- TestFlight upload is not available from this machine tonight because the local machine has only an Apple Development identity for `com.k9operations.mobile`.
- App Store export failed with:
  - no `iOS Distribution` signing certificate
  - no App Store profile for `com.k9operations.mobile`
- The app installed to Zack’s iPhone successfully, but remote launch failed because the phone was locked during the launch attempt.

## Production caveats that are real
- The linked Supabase project can deploy functions from this machine, but the remote database login path for migration management is not healthy.
- I verified that the live project is currently missing:
  - `public.grassroots_events`
  - `public.resource_entries`
  - `public.get_resort_operational_settings(...)`
- The shipped web surfaces were hardened around that reality:
  - Resources and Grassroots persist through `lite_settings`
  - Home briefing falls back to tracker data if `grassroots_events` is unavailable
- I did **not** force a blanket remote migration push because the project’s remote migration history does not match this repo’s local migration directory and the DB login path is failing.

## Requirement trace status

### Solidly implemented
- Labor roster redesign
- Labor sorting + inactive toggle
- 30 / 60 / 90 split columns and full-page reviews
- Labor filter builder/save-view flow
- Home metric parity
- Inventory cadence configurability
- Resources page
- Grassroots page
- Today’s Gingr Notes web surface
- Feeding-and-meds mobile workflows
- Feeding report mobile workflow
- Re-eval mobile workflow
- Opening / closing roll call parity
- Feeding/audit server expansion

### Implemented, but with caveats
- Vendor Log exists, but OTP is still placeholder-only.
- Re-eval uses a manual bad-note flag path rather than automatic note classification.
- Morning briefing is deterministic and data-backed, not an AI-generated scheduled artifact.
- Some older internal naming still says `client-management` or `dashboard` in code even where the user-facing surface now says `Incidents` or `Home`.

### Not honestly complete yet
- SMS OTP production path
- Resend-backed incident notifications
- Full App Store / TestFlight release path
- Any feature that depends on the missing database migration surfaces above

## Morning testing priority
1. Web Labor: roster filters, 30 / 60 / 90 review pages, template creation flow.
2. Web Home: 5 a.m. briefing, inventory status, resources, grassroots, Today’s Gingr Notes.
3. Mobile MOD/PCT/CSR parity: roll call, enrichment, emergency contacts, feeding workflows.
4. Audit flows: bathing plus feeding report / feeding-and-meds.
5. Native iPhone install already completed; verify the latest local archive on device once the phone is unlocked.
