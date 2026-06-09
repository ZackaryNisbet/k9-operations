# Flowcharts & Diagrams

Visual companions to the architecture docs. All diagrams are **Mermaid** and render
natively on GitHub. For prose, see [ARCHITECTURE.md](../../ARCHITECTURE.md),
[EDITIONS.md](EDITIONS.md), and [BACKEND.md](BACKEND.md).

---

## 1. System architecture (deployment topology)

```mermaid
flowchart TB
  subgraph browser["Browser — Vite + React 18 SPA"]
    R["main.jsx · Root() router"]
    EDS["Editions: Base / Analytics / POS / Public"]
    SC["supabaseClient.js (anon key)"]
    RS["shared/reloadScheduler.js"]
  end
  subgraph vercel["Vercel"]
    ST["Static SPA (dist/)"]
    API["api/interview-normalize-audio.js (ffmpeg)"]
  end
  subgraph sb["Supabase"]
    PG[("Postgres + RLS")]
    RPC["~95 RPCs"]
    EF["~33 Edge Functions"]
    RT["Realtime publication"]
    STG["Storage buckets"]
    CRON["pg_cron + pg_net"]
  end
  subgraph ext["External integrations"]
    G["Gingr PMS"]
    STR["Stripe"]
    TW["Twilio"]
    RES["Resend"]
    DOC["DocuSeal"]
    LLM["OpenAI / xAI / Anthropic"]
    OW["OpenWeather"]
  end

  R --> EDS --> SC
  SC -->|"select / rpc()"| PG
  SC --> RPC
  SC -->|"functions.invoke()"| EF
  SC -->|"postgres_changes"| RT
  RS -. coalesces .- RT
  EDS -->|"/api/*"| API --> STG
  RPC --> PG
  EF --> PG
  EF --> G & STR & TW & RES & DOC & LLM & OW
  CRON --> EF
  ST --> R
```

---

## 2. Edition selection — `Root()` decision flow

How one bundle resolves to one of three apps (+ public pages). Source:
`src/main.jsx`.

```mermaid
flowchart TD
  A["Root(): read window.location.pathname"] --> PUB{"public path?"}
  PUB -->|"/book/*"| BK["BookingPage (public)"]
  PUB -->|"/sign/* /form/*"| PP["PublicPages (public)"]
  PUB -->|"/welcome /pricing"| LP1["LandingPage (always public)"]
  PUB -->|"else"| AUTH{"useAuth(): user?"}
  AUTH -->|"loading"| LD["Loading screen"]
  AUTH -->|"no user"| Q1{"/login or /signup?"}
  Q1 -->|"yes"| LG["Login"]
  Q1 -->|"no"| LP2["LandingPage"]
  AUTH -->|"user"| PW{"needsPasswordSet?"}
  PW -->|"yes"| SPW["Set-password gate"]
  PW -->|"no"| POS{"path starts /pos?"}
  POS -->|"yes"| EPOS["POS — src/App.jsx"]
  POS -->|"no"| ANA{"?mode=analytics?"}
  ANA -->|"yes"| EANA["Base + Analytics — kol/KolApp.jsx"]
  ANA -->|"no"| EBASE["Base (Lite/KOL) — kol/KolApp.jsx"]
```

---

## 3. Auth bootstrap lifecycle

Source: `src/AuthProvider.jsx` + `src/authRuntime.js`.

```mermaid
sequenceDiagram
  participant U as User
  participant AP as AuthProvider
  participant SB as Supabase Auth
  participant DB as Postgres (RPC)
  U->>AP: load app
  AP->>SB: getSession()
  alt no session
    SB-->>AP: null → status "no user"
    AP-->>U: LandingPage / Login
  else session
    SB-->>AP: session
    AP->>DB: rpc("get_my_profile")
    alt profile ok
      DB-->>AP: profile (role, location_id)
      AP-->>U: route to edition
    else profile missing location
      AP->>DB: rpc("claim_invitation")
      DB-->>AP: assigned → reload
    end
  end
  note over AP: failures classified by authRuntime.js → AuthStatusScreen
```

---

## 4. Read path & egress‑aware refresh (the performance core)

Data is read via hooks/RPCs; refreshes (realtime + safety poll) are coalesced and
**visibility‑gated** so idle/background tabs stop re‑downloading. Source:
`src/useData.js`, `src/hooks/*`, `src/shared/reloadScheduler.js`.

```mermaid
flowchart LR
  subgraph triggers
    RTC["realtime change (postgres_changes)"]
    POLL["safety poll (60s, visible only)"]
    VIS["tab becomes visible"]
  end
  RTC --> SCH["reloadScheduler: debounce + coalesce"]
  POLL --> SCH
  VIS --> SCH
  SCH -->|"visible & due"| LOAD["load(): scoped fetch"]
  SCH -. hidden tab .-> SKIP["skip — mark dirty, catch up on focus"]
  LOAD --> MAP["map rows → app objects"]
  MAP --> RENDER["React render"]
```

> Before this design, the POS data layer re‑downloaded the whole location dataset on
> every change + a 30s always‑on poll (fixed in PR #85).

---

## 5. Public booking sequence (customer self‑service)

Source: `src/BookingPage.jsx` → anonymous RPCs (RLS‑guarded), `send-otp` edge fn.

```mermaid
sequenceDiagram
  participant C as Customer
  participant BP as BookingPage (/book/:slug)
  participant DB as Postgres (RPC, RLS)
  participant OTP as send-otp (Twilio)
  C->>BP: open /book/{facility}
  BP->>DB: rpc("get_public_booking_data", slug)
  DB-->>BP: facility config, rooms, availability
  C->>BP: choose dates / service / dog details
  BP->>DB: rpc("submit_online_booking")
  DB-->>BP: confirmation
  C->>BP: open account portal
  BP->>OTP: request code
  OTP-->>C: SMS code
  C->>BP: enter code
  BP->>DB: rpc("verify_otp_and_get_customer")
  DB-->>BP: portal data (reservations, packages)
```

---

## 6. Gingr sync pipeline (system of record → operational data)

Source: `gingr-sync`, `gingr-boh-poll` edge functions (cron‑driven).

```mermaid
flowchart LR
  G["Gingr API"] -->|"gingr-sync (full/incremental)"| MIR["gingr_* mirror tables"]
  G -->|"gingr-boh-poll (cron)"| BOH["gingr_back_of_house / presence"]
  MIR --> COMP["ops-compute (cron) → lite_daily_ops"]
  MIR --> METRICS["dashboard_metrics_daily (precomputed)"]
  BOH --> PRES["facility_presence_snapshot RPC"]
  COMP --> UI["checklists / care reports"]
  METRICS --> DASH["Dashboard (Analytics)"]
  PRES --> TV["Checkout TV"]
```

---

## 7. Reorganized module structure (post‑decomposition)

The shape after the 24 move‑and‑relink PRs (see
[FILE_ORGANIZATION.md](FILE_ORGANIZATION.md)).

```mermaid
flowchart TD
  MAIN["src/main.jsx"] --> KOL["src/kol/ (Base + Analytics)"]
  MAIN --> POS["src/pos/ (POS — from App.jsx 32k→1.3k)"]
  MAIN --> BOOK["src/booking/ (public booking)"]
  MAIN --> PUBF["LandingPage / Login / PublicPages"]
  KOL --> KP["pages/<feature>/{components,lib,constants}"]
  KOL --> KH["src/hooks/*"]
  POS --> PP2["pages / components / charts / lib / constants / demo"]
  KOL --> SH["src/shared/ (ui.jsx, listSurface.jsx, theme.js, engines)"]
  POS --> SH
  BOOK --> SH
```

---

## 8. Editions at a glance

```mermaid
flowchart LR
  ONE["One Vite bundle"] --> BASE["K9 Operations (base)\n/{loc}/{page}"]
  ONE --> AN["+ Analytics\n…?mode=analytics"]
  ONE --> POS["POS\n/pos/{loc}/{page}"]
  BASE -. same shell, flag flips nav/features .-> AN
  classDef legacy fill:#fee,stroke:#c66;
  class POS legacy;
```
