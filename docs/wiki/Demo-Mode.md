# Demo Mode (the `demo` user group)

A read‑only **Demo** account can navigate the **entire** base platform for a
screenshot / live walkthrough **without exposing real people**. Person names, emails,
and phone numbers are replaced with deterministic, realistic fakes **at the data
layer — before anything reaches React or the DOM** — while dog names, products, and
numbers stay real. A persistent badge makes the anonymization explicit, and all
writes are blocked.

## How to enable

- **Authoritative:** set the account's `lite_profiles.role = 'demo'`. On sign‑in,
  `AuthProvider` calls `setDemoActiveFromRole('demo')` and Demo mode turns on app‑wide.
- **Preview / testing:** append `?demo=1` to any URL — it's stored in `sessionStorage`
  for the current tab only (auto‑clears on close; never persisted to `localStorage`, so
  a real owner can't get stuck in Demo mode).

When active: the sidebar shows the full nav rail, every page is view‑accessible,
person PII is obfuscated, the account email in the sidebar is masked, and a
**"Demo mode · names anonymized · read‑only"** badge is pinned top‑center.

## How it works

A single network chokepoint in `src/supabaseClient.js` wraps the Supabase `fetch`:

1. **Reads** — REST / RPC / edge‑function JSON responses are deep‑scrubbed by
   `scrubPiiDeep` (`src/shared/demoMode.js`). It is **column‑ and context‑aware**:
   - exact PII columns (`first_name`, `last_name`, `full_name`, `email`, `phone`, owner/contact variants, …) → deterministic fakes;
   - the generic `name` column is scrubbed **only on person‑shaped rows** (rows that also have `first_name`/`email`/`position`/…), so dog/product/room names stay real;
   - free‑text fields likely to embed names (`notes`, `call_transcription`, addresses) are blanked;
   - the aggregated‑calendar RPC bakes employee names into composed titles, so those are handled specially (`scrubComposedNames`).
2. **Writes** — REST table + storage mutations are short‑circuited (`isBlockedWrite`), so a Demo account is strictly read‑only. RPC/auth reads pass through.

Full access for the role is granted in `src/shared/permissions.js`
(`LEAN_FULL_ACCESS_ROLES` includes `demo`); the full nav rail + badge + masked account
email are in `src/kol/KolApp.jsx`.

## Files
- `src/shared/demoMode.js` — detection, deterministic fakes, `scrubPiiDeep`, `scrubComposedNames`, read‑only helpers.
- `src/supabaseClient.js` — the fetch wrapper (scrub reads / block writes).
- `src/AuthProvider.jsx` — activates from `profile.role`.
- `src/shared/permissions.js` — `demo` → full page view access.
- `src/kol/KolApp.jsx` — full nav, badge, masked sidebar email.

## Robustness boundary (read this)
This masks everything the browser **renders** — the DOM, React tree, and element
inspector never receive real PII, so "Inspect Element" is safe (there is no real value
hidden behind a CSS box). It is **client‑side**, so a determined user could still read
raw rows in the **Network tab** or disable the wrapper from the **console**. Defeating
that requires **server‑side masking** (RLS policies / `SECURITY DEFINER` `*_safe`
views — the pattern already used by `enterprise_directory_people_safe`). That is the
recommended hardening **before exposing a public live‑demo login**. Recorded
screenshots / video have no live network surface, so the boundary does not apply to them.

## Extending
If a new page surfaces a person field that leaks: add the column to the appropriate set
in `src/shared/demoMode.js` (or add a person‑sibling key so the heuristic catches its
`name`), or — for server‑composed strings — extend `scrubComposedNames`. Always
re‑verify with a logged‑in `?demo=1` pass across the affected pages.
