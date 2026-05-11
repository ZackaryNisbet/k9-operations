# Cherry Hill QA 23 Rollback Notes

Production project: `xuzvqcpthqikyroqhypw`

This note tracks rollback paths for the backend changes introduced on
`codex/cherry-hill-qa-23`. Review live data before running any SQL rollback.

## Edge Functions

Changed functions:

- `compute-scheduling-matrix`
- `gingr-sync`

Rollback command shape:

```bash
npm run supabase:functions:rollback -- --project-ref xuzvqcpthqikyroqhypw --functions compute-scheduling-matrix,gingr-sync --commit <previous-good-sha> --note "Rollback Cherry Hill QA 23 scheduling changes"
```

The current tracked function rollback pointers live in
`supabase/ops/last-known-good.json`.

## Cron

Changed manifest:

- `supabase/ops/cron-jobs.json`

Rollback path:

1. Revert `supabase/ops/cron-jobs.json` to the prior production horizon.
2. Run:

```bash
npm run supabase:cron:reconcile -- --project-ref xuzvqcpthqikyroqhypw --apply
npm run supabase:cron:audit -- --project-ref xuzvqcpthqikyroqhypw
```

Emergency stop for scheduling compute:

```text
Set Edge Function environment variable SCHEDULING_COMPUTE_DISABLED=true.
```

## Migrations

### `20260511152604_cherry_hill_qa_23_grassroots_event_modal_data_model.sql`

Purpose: add `Abandoned` event status support, split address fields, and atomic
event-date save RPC.

Rollback path:

- Recreate the previous `grassroots_targets` status constraint from the saved
  rows in `app_private.grassroots_targets_status_backup_20260511152604`.
- Drop `public.save_grassroots_target_with_event_dates(jsonb, jsonb)`.
- Leave nullable split address columns in place unless an explicit destructive
  schema cleanup is approved.

### `20260511154047_labor_capacity_model_versions.sql`

Purpose: add labor model version history and version-writing RPCs.

Rollback path:

- Disable UI calls to model history first.
- Drop or rename the RPC wrappers created by this migration.
- Preserve `public.labor_capacity_model_versions` rows for audit unless an
  explicit destructive deletion is approved.

### `20260511164000_labor_interview_identity_privacy.sql`

Purpose: add interview identity access policy, redacted read RPC, and storage
policy alignment.

Rollback path:

- Recreate prior policies from
  `app_private.labor_interview_policy_backup_20260511164000`.
- Drop `public.get_labor_interview_records_redacted(...)` only after clients no
  longer call it.
- Keep privacy-restrictive policies in place until replacement policies are
  verified.

### `20260511170000_labor_interview_identity_location_ref_fix.sql`

Purpose: patch interview identity helpers for `lite_profiles.location_id`
values stored as either location slug or UUID text.

Rollback path:

- Re-apply the helper definitions from
  `20260511164000_labor_interview_identity_privacy.sql`.
- Verify interview identity access for UUID-backed Cherry Hill profiles before
  considering rollback complete.
