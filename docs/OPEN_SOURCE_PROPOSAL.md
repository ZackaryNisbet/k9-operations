# Proposed Public GitHub Repository

A concrete plan to turn this private codebase into a credible **public** GitHub
repository. It covers the two viable scopes, the hard prerequisites (licensing +
secret‑free history), the repository layout, and a step‑by‑step checklist.

> Read alongside [SECURITY_AUDIT.md](SECURITY_AUDIT.md) (what must be scrubbed) and
> [architecture/INDUSTRY_STANDARDS.md](architecture/INDUSTRY_STANDARDS.md) (tooling
> gaps).

---

## 1. Decide the scope first

There are two honest ways to open‑source this; pick one before doing the work.

### Option A — Full application (portfolio / reference implementation)
Publish the whole app as a runnable reference for "a real Supabase + React
operations platform." Best for a **portfolio/resume** showcase.
- **Pros:** shows end‑to‑end product engineering, the design system, ~988 tests,
  the full‑stack Supabase architecture.
- **Cons:** exposes proprietary business logic and customer‑specific
  configuration; requires the most scrubbing (identifiers, templates); needs a
  deployer to bring their own Gingr/Stripe/Supabase to actually run it.

### Option B — Framework / libraries (cleanest OSS)
Publish only the reusable core: the **design system** (`shared/ui.jsx`,
`shared/listSurface.jsx`, `DESIGN.md`), the **engines** (`schedulingEngine.js`,
`accrualEngine.js`, `cashBasisRevenue.js`), the **list‑surface model**, and the
**Vitest suite** for those — plus a reference Supabase schema with synthetic seed.
- **Pros:** minimal sensitive surface, genuinely reusable, easy to maintain.
- **Cons:** less impressive as a "whole product" story.

> **Recommendation for a resume showcase:** Option A, *after* the decomposition
> lands (so reviewers see modules, not 32k‑line files) and the security
> prerequisites are met. Keep a clearly‑scoped "what's proprietary" note.

---

## 2. Hard prerequisites (do not publish without these)

1. **Licensing decision + header sweep.** ~25+ files begin with
   `© 2026 K9 Operations LLC. All Rights Reserved. Proprietary and Confidential.`
   These directly conflict with an OSI license. Choose a license (recommend
   **Apache‑2.0** for the patent grant, or **BUSL‑1.1** if you want
   source‑available with delayed open licensing), add a root `LICENSE`, and
   replace headers with `SPDX-License-Identifier:` lines (a scripted sweep).
2. **Secret‑free git *history*.** Files were removed from the working tree (PR
   #96), but the content still exists in history. Run `git filter-repo` (or BFG)
   to purge `CherryHillReservations.json`, `dist-temp/`, `dist-old/`,
   `supabase/.temp/`, `audit/`, the real Ignite samples, and any other flagged
   blobs, then force‑push. Rotate any credential that could have been exposed.
3. **Parameterize production identifiers.** Replace the hardcoded Supabase project
   ref, Cherry Hill location UUID, and Gingr subdomain across ~30 files with
   env/config; rewrite the migration that embeds employee PII; fix the hardcoded
   URLs in `IgniteSettingsTab.jsx` and the `breed-*` functions. (Details in
   SECURITY_AUDIT.md.)
4. **Third‑party/vendor license check.** Confirm redistribution rights for
   vendored assets (e.g. Balkan OrgChart under `public/vendor/`) and that
   integrations (Gingr/Stripe/DocuSeal) only require deployer‑supplied keys.

---

## 3. Proposed repository layout (additions)

```
/ (repo root)
├── README.md                  # what it is, screenshots, quick start, scope note
├── LICENSE                    # chosen OSI/source-available license
├── NOTICE                     # third-party attributions (Balkan, pdfjs, ffmpeg…)
├── CONTRIBUTING.md            # branch naming, draft PRs, test requirements
├── CODE_OF_CONDUCT.md         # Contributor Covenant
├── SECURITY.md                # vulnerability disclosure process
├── ARCHITECTURE.md            # (added) master overview
├── DESIGN.md                  # (existing) design system
├── .env.example               # (expanded) full secret manifest
├── .github/
│   ├── workflows/ci.yml       # lint + test + build + secret scan
│   ├── pull_request_template.md
│   ├── ISSUE_TEMPLATE/{bug,feature}.md
│   ├── dependabot.yml
│   └── CODEOWNERS
├── docs/
│   ├── architecture/…         # (added) editions, file org, backend, standards
│   ├── OPEN_SOURCE_PROPOSAL.md # this file
│   ├── SECURITY_AUDIT.md
│   └── development.md          # clone → env → supabase start → dev
├── src/ …                     # decomposed app (see FILE_ORGANIZATION.md)
└── supabase/ …                # migrations, functions (identifiers parameterized)
```

## 4. Proposed `README.md` outline

1. One‑line description + hero screenshot/GIF of the app.
2. **Who it's for / what it isn't** (and the proprietary‑scope note).
3. **Architecture** (link to `ARCHITECTURE.md` + the editions diagram).
4. **Quick start** — `npm ci`, `cp .env.example .env`, `supabase start`,
   `npm run dev`, `npm test`.
5. **Editions** — base vs analytics vs POS (link to `EDITIONS.md`).
6. **Tech stack & integrations** (Gingr/Stripe/Twilio/Resend/LLMs are
   deployer‑supplied).
7. **Contributing** + **License**.

## 5. Checklist

**Legal & governance**
- [ ] Choose license; add `LICENSE` + `NOTICE`
- [ ] Replace proprietary headers with SPDX identifiers (scripted)
- [ ] `CODE_OF_CONDUCT.md`, `SECURITY.md`
- [ ] Trademark note for the "K9 Operations" name/brand

**Secret‑free & sanitized** (see SECURITY_AUDIT.md)
- [ ] Purge git history of removed PII/artifacts; force‑push; rotate credentials
- [ ] Parameterize prod identifiers; rewrite the org‑chart migration
- [ ] Replace real Ignite samples with synthetic fixtures
- [ ] Verify `gitleaks detect` is clean on full history

**Repository hygiene**
- [ ] `README.md`, `CONTRIBUTING.md`, `docs/development.md`
- [ ] PR + issue templates; `CODEOWNERS`
- [ ] Confirm `.env.example` complete (done in #96)
- [ ] Keep `dist*`/build output out of git (done in #96)

**Tooling / CI**
- [ ] ESLint (+ react‑hooks, jsx‑a11y) + Prettier
- [ ] `.github/workflows/ci.yml`: lint + `vitest run` + `vite build` + gitleaks
- [ ] `dependabot.yml`; `npm audit` policy
- [ ] (optional) `tsconfig.json` + phased TS migration

**Code finish line**
- [ ] Land the decomposition waves (no 30k‑line files on the public front page)
- [ ] Remove the prod anti‑devtools block in `main.jsx` for public builds (or gate
      it behind an enterprise flag)
- [ ] Review Highlight.io `recordHeadersAndBody` for public deployments

## 6. What stays private even in Option A

- Live Gingr credentials and the production Supabase project.
- Customer‑specific templates and named content (e.g. location slugs, named
  training plans) → move to seed/config.
- Internal ops runbooks (`supabase/ops/`), verbatim feedback docs, and overnight
  action plans → keep in a private docs space.

---

### Suggested one‑paragraph project description

> **K9 Operations** is a React + Supabase operating system for pet‑care
> facilities. It layers a complete operations stack — daily checklists, customer
> lifecycle/CRM, labor & training, scheduling, inventory, and reporting — on top
> of a facility's Gingr PMS, and ships as three runtime editions (base, analytics,
> and POS) from one codebase. It demonstrates a mature design system, ~988 domain
> tests, and a full Supabase backend (RLS, RPCs, ~33 edge functions). Integrations
> (Gingr, Stripe, Twilio, Resend, LLMs) are deployer‑supplied.
