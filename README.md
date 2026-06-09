# K9 Operations

**The operating system for pet‑care facilities.** K9 Operations layers a complete
operations stack — daily checklists, customer lifecycle/CRM, labor & training,
scheduling, inventory, and reporting — on top of a facility's **Gingr** PMS, and
ships as three runtime editions from one codebase.

---

## What it does

- **Daily operations** — opening/closing roll calls, feeding & medications, room
  cleaning, bathing, private play, weekly maintenance, resort upkeep — as live
  checklists with real‑time progress.
- **Customer lifecycle / CRM** — automatic lead / active / lapsed segmentation
  from booking history, outreach logging, grassroots tracking, Ignite lead
  capture.
- **Labor & training** — roster, staff scheduling vs. forecasted demand,
  30/60/90 reviews, interviews, capacity planning.
- **Reporting & intelligence** — revenue, occupancy, labor, end‑of‑day, and
  plain‑language queries (Analytics edition).
- **Customer‑facing** — branded online booking and a live lobby checkout TV.

## Editions (one bundle, three apps)

| Edition | URL | Entry | For |
| --- | --- | --- | --- |
| **K9 Operations** (base) | `/{location}/{page}` | `src/kol/KolApp.jsx` | staff & managers |
| **+ Analytics** | `…?mode=analytics` | same (feature flag) | owners / operators |
| **POS** (legacy) | `/pos/{location}/{page}` | `src/App.jsx` | front desk |

See [docs/architecture/EDITIONS.md](docs/architecture/EDITIONS.md).

## Tech stack

React 18 · Vite 6 · Supabase (Postgres + RLS + Realtime + Storage + ~33 Edge
Functions) · Vercel · Vitest. Integrations (Gingr, Stripe, Twilio, Resend,
DocuSeal, OpenAI/xAI/Anthropic, OpenWeather) are **deployer‑supplied** via
environment variables.

## Quick start

```bash
npm ci
cp .env.example .env        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (min.)
npm run dev                 # Vite dev server
npm test                    # Vitest (988 tests)
npm run build               # production build
```

A local Supabase (`supabase start`) or a hosted project is required for full
functionality. See [`.env.example`](.env.example) for the complete secret
manifest.

## Architecture

Start with the **[Engineering Wiki](docs/wiki/Home.md)** (the navigable guide — every
page's purpose, backend, and files) or **[ARCHITECTURE.md](ARCHITECTURE.md)** (the
master overview), then:

- [Engineering Wiki](docs/wiki/Home.md) — per‑page references, directory map, demo mode
- [Editions](docs/architecture/EDITIONS.md) — base vs analytics vs POS
- [File organization](docs/architecture/FILE_ORGANIZATION.md) — structure & conventions
- [Backend](docs/architecture/BACKEND.md) — Supabase functions, RPCs, migrations
- [Design system](DESIGN.md) — the visual language

## Project layout (high level)

```
src/
├── main.jsx          # entry + edition routing
├── kol/              # Base + Analytics edition (Lite)
├── pos/              # POS edition (decomposed from App.jsx)
├── booking/          # public booking (decomposed from BookingPage.jsx)
├── shared/           # design system + engines (ui.jsx, listSurface.jsx, …)
├── hooks/            # React data hooks
└── __tests__/        # Vitest suite
supabase/
├── migrations/       # schema, RLS, RPCs (source of truth)
└── functions/        # edge functions
```

## Contributing

Conventions: feature branches, small behavior‑preserving PRs, and tests + build
green before review.

## License

**Source‑available, evaluation only** — © 2026 K9 Operations LLC, all rights
reserved. The source is public to **read and review**, but the license grants **no
right to use, run, copy, modify, or distribute** it. This is intentionally *not* an
open‑source license. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) (third‑party
components retain their own licenses).
