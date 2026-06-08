# Security & Secret/PII Audit

A read‑only audit of the repository for anything that must not be in a public
repo, what has been **remediated** (PR #96), and what **remains** before the repo
can safely go public.

**Headline:** **No live API keys, JWTs, Stripe secrets, or private keys exist in
the source.** The client reads config from `import.meta.env.VITE_*` and edge
functions use `Deno.env` — the secret‑handling *architecture* is sound. The
open‑source blockers were **committed data, build artifacts, and hardcoded
production identifiers**, not leaked credentials.

---

## 1. Remediated in PR #96 (removed from the working tree)

| Item | Why | Action |
| --- | --- | --- |
| `CherryHillReservations.json` | Real customer PII — 68+ reservations (names, addresses, emails, phones, pets, pricing). Not imported by app/tests. | `git rm` |
| `src/ignite/samples/{phone_call_real,appointment_real}.html` | Real Ignite leads — names, a phone number, a call transcript, recording IDs. Not used by any Vitest test. | `git rm` |
| `dist-temp/`, `dist-old/` | Committed build bundles containing the prod Supabase URL and personal emails. | `git rm -r` |
| `supabase/.temp/` | Supabase CLI state — production `project-ref` + `pooler-url`. | `git rm -r` |
| `audit/` | UI screenshots that can show client data + a report with live CRM metrics and a staff name. | `git rm -r` |
| `inventory_items.json` | Business procurement data (GL accounts, prices, vendors); was gitignored yet committed. | `git rm --cached` (kept local) |
| `.gitignore` | Could not previously block the above. | Hardened (adds `dist-temp/`, `dist-old/`, `supabase/.temp/`, `CherryHillReservations.json`, `audit/`) |
| `.env.example` | Incomplete secret list. | Expanded to a full manifest (placeholders only) |

**Result:** 75 files / 12,401 lines removed; **988 tests pass**, `vite build`
succeeds.

---

## 2. ⚠️ Remaining before going public (NOT done in #96)

### Critical
1. **Purge git history.** The items above were removed from the tree but still
   exist in history. Run `git filter-repo`/BFG, force‑push, and verify with
   `git log --all -- CherryHillReservations.json`. **Rotate** any credential that
   could ever have been exposed (Supabase service role, Gingr API keys stored in
   DB) defensively.

### High — hardcoded production identifiers (parameterize before publish)
The production Supabase project ref `xuzvqcpthqikyroqhypw`, the Cherry Hill
location UUID `8ea382b0‑…`, and the Gingr subdomain `k9cherryhill` appear in ~30
files. These are not secrets but they leak infrastructure and tie the OSS code to
one tenant. Fix:
- `src/kol/settings/IgniteSettingsTab.jsx` — derive the webhook URL from
  `import.meta.env.VITE_SUPABASE_URL` (pattern already used in
  `IgniteOnboardingWizard.jsx`).
- `supabase/functions/breed-detect`, `breed-detect-bulk`, `breed-compare` — use
  `Deno.env.get("SUPABASE_URL")` instead of a hardcoded URL.
- `scripts/seed_inventory.mjs`, `scripts/import_enterprise_directory.py` — take
  `--project-ref`/paths as args; remove hardcoded refs and local machine paths.
- `supabase/ops/*.json` and cron migrations — template the project ref / function
  URLs.
- `src/ignite/constants.js` — make `CHERRY_HILL_LOCATION_ID` config‑driven.

### High — PII embedded in code/migrations
- `supabase/migrations/20260512050708_enterprise_directory_org_chart.sql` embeds
  an employee directory (14+ corporate emails, 37 phone numbers). Rewrite to seed
  from a synthetic, parameterized source.
- Replace the deleted real Ignite samples with **synthetic** fixtures and update
  the standalone `src/ignite/test_parser.ts` harness accordingly.

### Medium — internal content to relocate/redact for a public repo
- `docs/ROUND2_ACTION_PLAN.md`, `docs/FINAL_ACTION_PLAN.md`,
  `docs/IGNITE_URL_GUIDE.md` — internal runbooks with personal email, Gingr
  subdomain, profile IDs (Supabase secrets already `[REDACTED]`).
- `src/kol/pages/ResortUpkeepPage.jsx` — a hardcoded vendor contact (name/phone/
  email) → move to location settings.
- Personal emails in public copy (`src/Login.jsx`, `src/LandingPage.jsx`) and a
  named training template in `trainingData.js` → generic placeholders.

---

## 3. Secret scan results (clean)

| Check | Result |
| --- | --- |
| JWTs (`eyJ…`) in source | none |
| Stripe keys (`sk_live`, `whsec_`, …) | placeholders only (in `.env.example`/comments) |
| Google API keys (`AIza…`) | none |
| OpenAI/Anthropic/xAI keys | none committed |
| Twilio/SendGrid keys | none committed |
| `BEGIN … PRIVATE KEY` | none |
| Committed `.env` | only `.env.example` |

The only `sk_`/`whsec_`/`xai-` matches are documentation placeholders in
`.env.example` and `// supabase secrets set …` comments inside the Stripe/xAI
edge functions — expected and safe.

---

## 4. Environment & secret manifest

All secrets are deployer‑managed; nothing real is committed. See
[`.env.example`](../.env.example) for the authoritative, commented list.

**Frontend (`VITE_*`, build‑time):** `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (required); `VITE_HIGHLIGHT_PROJECT_ID`,
`VITE_GOOGLE_PLACES_API_KEY` (optional).

**Vercel API routes:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (fall back to `VITE_*`).

**Supabase Edge Function secrets** (`supabase secrets set …`): Stripe
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`), `OPENWEATHER_API_KEY`,
DocuSeal (`DOCUSEAL_API_KEY`, `DOCUSEAL_BASE_URL`, `DOCUSEAL_WEBHOOK_SECRET`),
`XAI_API_KEY` (+ optional model overrides), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
`TWILIO_VERIFY_SERVICE_SID`), Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`RESEND_REPLY_TO_DEFAULT`, `IGNITE_INBOUND_ADDRESS`), Stytch (`STYTCH_PROJECT_ID`,
`STYTCH_SECRET`, `STYTCH_ENVIRONMENT`), and `SCHEDULING_COMPUTE_DISABLED`.
Supabase auto‑injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` into functions.

**Local scripts only:** `SUPABASE_SERVICE_ROLE_KEY` (never in the browser).

---

## 5. Posture notes

- **Good:** anon‑key‑only client, `Deno.env` in functions, mature RLS, no committed
  `.env`, dedicated RLS policy files + migrations.
- **Review for public builds:** the production anti‑devtools block in
  `src/main.jsx` (security‑through‑obscurity; remove or gate behind a flag) and
  Highlight.io's `recordHeadersAndBody: true` (privacy review).
- **`exec_sql` RPC** (`supabase/migrations/20260307_exec_sql_rpc.sql`) is granted to
  `service_role` only — document the hardening and keep it off any anon path.
