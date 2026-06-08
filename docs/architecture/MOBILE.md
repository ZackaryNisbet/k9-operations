# Mobile App (K9 Operations Mobile) — placeholder

> Placeholder for the companion **K9 Operations Mobile** app, to be folded into this
> architecture set. This repo is the **web** platform; the mobile app lives in a
> separate repository.

## Intended scope of this doc (to fill in)
- **Stack & repo** — framework (e.g. React Native / Expo), repo location, build/release.
- **Shared backend** — it talks to the **same Supabase backend** (Postgres + RLS +
  RPCs + edge functions) as the web app, so the [backend doc](BACKEND.md) and the RPC
  contract apply unchanged. Document which RPCs/edge functions the mobile app consumes.
- **Auth** — same Supabase Auth; note any mobile‑specific session/deep‑link handling.
- **Feature surface** — which staff workflows the mobile app covers (likely daily ops,
  checklists, checkout, photos) vs. web‑only surfaces.
- **Shared logic** — what (if anything) is shared with web (`shared/` engines, data
  models) vs. duplicated, and the plan to converge (e.g. a shared TS package).
- **Realtime** — how it uses Supabase realtime / presence on mobile.

## Why it belongs here
The web and mobile apps are two clients on one backend. Documenting them together —
same data spine, same RLS, same RPC contract — is what makes the whole system legible
(and is a strong architectural story). When the mobile repo is ready, mirror the web
structure: an `ARCHITECTURE.md` + editions/feature docs that reference this backend doc.
