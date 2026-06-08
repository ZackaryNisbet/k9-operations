# Demo Video — Script & Storyboard

A tight, ~3‑minute walkthrough that shows what K9 Operations is and how it's built,
designed to live on the public website (K9Operations.com / `LandingPage`) and double as
a portfolio piece.

> **Recording note:** the video itself has to be screen‑recorded against a running app
> (Loom, QuickTime, or a computer‑use session). This file is the shot‑by‑shot plan so
> the recording is fast and consistent. Use the **analytics demo** (`?mode=analytics`)
> and the **POS demo** so no real customer data is shown.

---

## Positioning (the one‑liner)
> "Gingr runs the bookings. **K9 Operations runs the day** — one platform for daily
> operations, customer lifecycle, labor, scheduling, and reporting, built on top of
> your existing PMS."

## Audience & goal
Two audiences at once: **prospective operators** (what it does for a facility) and
**engineers/recruiters** (how it's architected). Keep the on‑screen story
operator‑facing; let one closing beat speak to the engineering.

## Run‑of‑show (target 2:45–3:15)

| # | Time | Scene | On screen | Voiceover (beat) |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:15 | Hook | Landing page hero | "Running a boarding & daycare resort means a hundred moving parts. Gingr holds your bookings — K9 Operations runs the day." |
| 2 | 0:15–0:35 | The problem→system | Concept band / data‑flow animation on landing | "It syncs your Gingr data and turns it into something your team acts on — sorting clients, surfacing the day's work, keeping front and back of house in sync." |
| 3 | 0:35–1:05 | Daily operations | Ops Hub → a checklist completing in real time; Checkout TV board | "Opening and closing roll calls, feeding and meds, room cleaning, bathing — every routine is a live checklist. The lobby TV shows who's going home, updating in real time." |
| 4 | 1:05–1:35 | Customer lifecycle / CRM | Clients page (lead/active/lapsed) → log a follow‑up | "Every client is automatically sorted into where they actually are — new leads, regulars, lapsed — with a CRM to move them forward." |
| 5 | 1:35–2:05 | Labor & scheduling | Scheduling demand matrix → Training/compliance board | "Staffing is matched to forecasted demand, and labor — training, reviews, capacity — lives in one place." |
| 6 | 2:05–2:30 | Analytics | `?mode=analytics` Dashboard: revenue / occupancy / labor | "Flip on Analytics and the whole operation becomes numbers a owner can act on — revenue, occupancy, labor, end‑of‑day, in plain language." |
| 7 | 2:30–2:55 | Editions | Quick cuts: base nav, analytics nav, POS | "One platform, three editions from one codebase — base operations, an analytics layer, and a full point‑of‑sale." |
| 8 | 2:55–3:10 | Engineering close (optional) | Brief: architecture diagram + "988 tests / Supabase + RLS / React" | "Built on React and Supabase with row‑level security, ~33 edge functions, and a tested, modular codebase." |
| 9 | 3:10 | CTA | Landing CTA / contact | "K9 Operations. See it on your own data." |

## Capture checklist
- Use **demo locations** only (`/cherry-hill/...?mode=analytics`, `/pos/demo/...`).
- 1920×1080, hide bookmarks bar, clean browser profile.
- Smooth, deliberate cursor movement; pause ~1s on each key screen.
- Capture the **realtime** moments live (a checklist item flipping, the TV board) — that's the "wow."
- Keep each scene to its time budget; record scenes separately and stitch.

## Where it goes
- Embed on the public **Landing page** (`src/LandingPage.jsx`) as a "Watch the 3‑minute
  demo" section near the hero (a poster image + click‑to‑play modal, or an inline
  `<video>` / hosted embed). The landing rebuild (PR #87) already has the section
  scaffolding to slot this into.
- Reuse the same file as the script for a shorter 60‑second social cut (scenes 1, 3, 6, 9).
