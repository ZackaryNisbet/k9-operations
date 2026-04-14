# Supabase Ops Files

- `risky-functions.json`
  - canonical list of Edge Functions that require explicit deploy and rollback discipline
- `last-known-good.json`
  - tracked pointer to the last known good commit for each risky function
- `cron-jobs.json`
  - canonical expected live `cron.job` inventory for production
- `deploy-history.jsonl`
  - local append-only history written by the deploy and rollback scripts

Update these files whenever production cron topology or risky-function ownership changes.
