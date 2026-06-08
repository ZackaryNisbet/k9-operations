# Industry Standards Adherence

How the codebase measures against modern software‑engineering practice, what it
already does well, and the concrete gaps to close. This frames both the internal
quality bar and open‑source readiness (see
[../OPEN_SOURCE_PROPOSAL.md](../OPEN_SOURCE_PROPOSAL.md)).

---

## Scorecard

| Area | Current state | Benchmark | Recommendation |
| --- | --- | --- | --- |
| **Module boundaries** | God files being decomposed (`App.jsx`, `TrainingPage.jsx`); strong `shared/` layer; `*Data.js` extraction | Modules < ~500–800 LOC; clear layering | Finish the decomposition waves; converge POS onto `shared/` |
| **Feature organization** | Lite `kol/` is feature‑oriented; POS is monolithic | Consistent `feature/{pages,components,lib,hooks}` | Apply target tree (see FILE_ORGANIZATION.md) |
| **Testing** | ~988 Vitest tests / 63 files; mostly pure‑logic | Unit + component + some E2E, in CI | Add CI; add Testing Library for `shared/ui` |
| **Type safety** | ~99% JS/JSX; TS only in some tests + edge functions | Strict TS or rigorous JSDoc | `tsconfig` (allowJs) → typed `*Data.ts` → `shared/` |
| **Lint / format** | None (no ESLint/Prettier/editorconfig) | ESLint + Prettier enforced in CI | Add flat‑config ESLint (+ react‑hooks, jsx‑a11y) + Prettier |
| **CI/CD** | None (`prebuild` runs tests locally/on Vercel) | PR‑gated lint/test/build + secret scan | Add `.github/workflows/ci.yml` |
| **Commit/PR conventions** | Documented in `.claude/skills`; no root `CONTRIBUTING` | CONTRIBUTING + PR template + (optional) Conventional Commits | Publish conventions; add templates |
| **Security / RLS** | Strong RLS; env‑driven secrets; no keys in source | + LICENSE, no proprietary headers, secret scan, clean history | See SECURITY_AUDIT.md + OSS proposal |
| **Documentation** | Excellent `DESIGN.md`; now this architecture set; no root README pre‑existing | README + ARCHITECTURE + setup | Added here; keep current |
| **Accessibility** | Strong spec in `DESIGN.md`; sparse code enforcement | axe/jsx‑a11y in CI; tested modals | Add a11y lint + component tests |
| **Performance** | Server‑precomputed metrics + caching (Lite); egress scheduler | Column selects, code‑split, edge compute | Extend egress discipline to `useData`; route‑level `React.lazy` |
| **Dependencies** | Lockfile, Node 20 pin, lean deps | Dependabot + `npm audit` gate | Add both |

**Overall (internal product):** strong domain‑logic testing and a real design
system, held back by the two monoliths and missing engineering guardrails
(lint/CI/types).
**Open‑source readiness today:** blocked primarily by licensing/headers, missing
CI/tooling, and integration coupling — all addressable (see OSS proposal).

---

## What's already strong

- **A real design system.** `DESIGN.md` codifies color/typography/spacing, the
  modal and list‑surface standards, focus management, and `prefers-reduced-motion`
  — and `AGENTS.md` *mandates* composing `shared/ui.jsx` + `shared/listSurface.jsx`
  so new surfaces are "correct by composition."
- **Deep domain test coverage.** ~988 Vitest cases across scheduling, labor,
  inventory, revenue, CRM, enrichment, enterprise, presence — with a plain‑English
  Test Health page generated at build time.
- **Server‑owned correctness.** Transactional domains use RPCs under RLS; heavy
  compute is in edge functions; dashboards are precomputed server‑side. This is a
  mature Supabase posture.
- **Clear separation in the Lite app.** `KolApp.jsx` is a thin router; pages
  delegate to `*Data.js` and `hooks/`. This is the template the rest should match.

## The gaps, with concrete fixes

### 1. Decomposition (in progress)
The single biggest maintainability lever. Tracked in
[docs/refactor/APP_JSX_DECOMPOSITION.md](../refactor/APP_JSX_DECOMPOSITION.md);
first wave is PRs #90–#95. Add a lint rule capping new file size once it lands.

### 2. Lint & format (not started)
Add ESLint 9 flat config with `eslint-plugin-react-hooks`,
`eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, plus Prettier. Start with
`warn` on legacy files and `error` on `shared/`, `hooks/`, `*Data.js`.

### 3. CI (not started)
Minimum credible pipeline on every PR + `main`:

```yaml
jobs: [ lint (eslint), test (vitest run), build (vite build), secret-scan (gitleaks) ]
```

Block merge on test/build failure. Add `dependabot.yml`.

### 4. Type safety (incremental)
Add `tsconfig.json` with `allowJs`/`checkJs:false`/`strict` for new files; migrate
`*Data.js` → `.ts` with exported domain types; then `shared/listSurfaceModel.js`,
`schedulingEngine.js`, `permissions.js`; `shared/ui.jsx` → `.tsx` last. Use JSDoc
`@typedef` as a bridge inside the god files until they're split.

### 5. Component & integration tests
Add `jsdom` + Testing Library for the `shared/ui.jsx` modal focus‑trap,
`LogEntryModal`, `RecordActivityModal`; add mocked‑Supabase contract tests for the
critical RPCs. Set a coverage floor on `shared/` + `*Data.js`.

### 6. Performance follow‑through
Extend the egress discipline (column projection, coalesced refetch) from Lite to
the POS `useData.js`; introduce route‑level code splitting (`React.lazy`) and
`manualChunks` so the single ~8.7 MB bundle is split.

### 7. Conventions & governance
Add `CONTRIBUTING.md` (mirroring the existing coding‑workflow skill), a PR
template, `CODEOWNERS` for `shared/` and `supabase/migrations/`, and fix the
`AGENTS.md` references to a `docs/agents/` tree that does not exist.

---

## Principles this architecture follows (and why)

- **Separation of concerns / single responsibility** — pages render, `lib/`
  computes, `hooks/` fetch, `shared/` standardizes. Reduces the "change one thing,
  break another" coupling.
- **Don't repeat yourself** — one design system, one engine per domain; the POS
  duplication is a known violation being retired.
- **Composition over re‑derivation** — new surfaces compose `ui.jsx`/`listSurface.jsx`
  rather than re‑implementing modals/tables (Jakob's Law: one learned pattern
  everywhere).
- **Test the logic, not the framework** — domain math is extracted and unit‑tested;
  components stay thin.
- **Server owns invariants** — RLS + RPCs keep multi‑tenant data safe regardless of
  client behavior.
- **Behavior‑preserving refactors** — the decomposition is pure move‑and‑relink,
  gated by tests + build, shipped in small revertable PRs.
