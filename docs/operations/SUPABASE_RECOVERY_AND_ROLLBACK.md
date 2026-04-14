# Supabase Recovery And Rollback

## Scope

- PITR protects database state and auth-user state.
- PITR does not automatically roll back deployed Edge Functions, cron SQL, auth settings, or other project configuration.
- Edge Function recovery must stay Git-based and redeployable from a known commit.

## Canonical Operational Files

- Risky-function manifest: `/<path>/Documents/Codex/k9-operations/supabase/ops/risky-functions.json`
- Cron source of truth: `/<path>/Documents/Codex/k9-operations/supabase/ops/cron-jobs.json`
- Last-known-good function state: `/<path>/Documents/Codex/k9-operations/supabase/ops/last-known-good.json`
- Local deploy history log: `/<path>/Documents/Codex/k9-operations/supabase/ops/deploy-history.jsonl`

## Emergency Circuit Breaker

- Secret: `SCHEDULING_COMPUTE_DISABLED`
- `true` means `compute-scheduling-matrix` exits early and does not materialize scheduling rows.
- Use it when:
  - the project is degraded and scheduling compute is suspected
  - you need to stop heavy scheduling work before a DB restart
- Do not leave it enabled after recovery unless you intentionally want scheduling frozen.

## Incident Order Of Operations

1. Disable heavy compute with `SCHEDULING_COMPUTE_DISABLED=true`.
2. Audit live cron inventory and look for overlap or embedded secrets:
   - `npm run supabase:cron:audit`
   - If the migration history is drifted and `db push` is unsafe, reconcile cron directly:
     - `npm run supabase:cron:reconcile -- --project-ref <ref> --apply`
3. Restart the database only after heavy jobs are quiet.
4. If a function deploy is suspected, redeploy the last known good commit:
   - `npm run supabase:functions:rollback -- --project-ref <ref> --commit <sha> --functions gingr-sync,compute-scheduling-matrix`
5. Consider a database restore only after non-destructive recovery paths fail.

## Risky Function Deployment

- Production deploys must be explicit:
  - `npm run supabase:functions:deploy-risky -- --project-ref <ref> --functions gingr-sync,compute-scheduling-matrix`
- The deploy script captures the current Git commit and updates `last-known-good.json`.
- The rollback script redeploys a chosen commit into Supabase from a temporary Git worktree.

## Scheduling Topology

- Canonical production strategy:
  - `compute-scheduling-matrix-cherry-hill-current-week` every 5 minutes
  - `compute-scheduling-matrix-cherry-hill-day-7` through `day-27` once per hour
- `gingr-sync` must not materialize the scheduling matrix inline.
- Overlapping future week jobs are not allowed.

## Secrets And Auth

- Do not hardcode service-role JWTs inside cron SQL.
- Cron jobs should pull the service role key from Vault:
  - `(select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')`
- The audit script treats embedded bearer tokens as drift that must be cleaned up.
