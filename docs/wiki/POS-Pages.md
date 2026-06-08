# POS Pages (K9 Operations POS)

The point‑of‑sale edition, served at **`/pos/*`**. Entry is `src/App.jsx` (a legacy
shell being decomposed into `src/pos/`); the screens live in `src/pos/pages/`. POS has
**one central data layer** — [`src/useData.js`](../../src/useData.js) — that loads the
location's normalized **V2 schema** dataset and exposes CRUD; realtime refresh is
coalesced + visibility‑gated by `src/shared/reloadScheduler.js`.

- **Routing:** `src/App.jsx`'s `parseUrl`/`buildUrl` over `/pos/{location}/{page}`.
- **Deep dive:** [app-pos.md](../architecture/app-pos.md).

> Template below: **Purpose** · **Files** · **Backend**.

## Contents
- [Reservations & lodging](#reservations--lodging)
- [Clients & pets](#clients--pets)
- [Daily operations](#daily-operations)
- [Financials & reporting](#financials--reporting)
- [Bookings, messaging & agreements](#bookings-messaging--agreements)
- [AI & learning](#ai--learning)
- [Enterprise & management](#enterprise--management)
- [Admin](#admin)

---

## Reservations & lodging

### Lodging Calendar — `/pos/{loc}/lodging-calendar`
- **Purpose:** the reservation/lodging calendar with room assignments and availability.
- **Files:** `src/pos/pages/LodgingCalendarPage.jsx`; pricing in `src/pos/lib/`.
- **Backend:** `useData` reservations/rooms + `assign-rooms` / `get-room-assignments` edge fns.

### New Reservation — `/pos/{loc}/new-reservation`
- **Purpose:** create a booking with check‑in/out preview and pricing.
- **Files:** `src/pos/pages/NewReservationPage.jsx`, `UnifiedNewPage.jsx`; `src/pos/lib/pricing.js`.
- **Backend:** `useData` (reservations) + pricing lib.

---

## Clients & pets

### Customer Lifecycle / Clients — `/pos/{loc}/clients`
- **Purpose:** full client list + lifecycle.
- **Files:** `src/pos/pages/ClientsPage.jsx`, `ClientDetailPage.jsx`.
- **Backend:** `useData` clients/dogs (V2 schema CRUD).

### Dog Detail / New Dog / New Client — `/pos/{loc}/{dog|new-dog|new-client}`
- **Purpose:** pet profiles and record creation.
- **Files:** `src/pos/pages/DogDetailPage.jsx`, `NewDogPage.jsx`, `NewClientPage.jsx`, `UnifiedNewPage.jsx`.
- **Backend:** `useData` clients/dogs.

---

## Daily operations

### Operations Hub / Daily Ops / EOD — `/pos/{loc}/{operations|daily-ops|eod}`
- **Purpose:** POS‑side checklists and end‑of‑day.
- **Files:** `src/pos/pages/OperationsHub.jsx`, `DailyOpsPage.jsx`, `EODPage.jsx`.
- **Backend:** `useData` daily ops.

### Attendance / Audit Log — `/pos/{loc}/{attendance|audit-log}`
- **Purpose:** staff attendance and the change log.
- **Files:** `src/pos/pages/AttendanceTrackerPage.jsx`, `AuditLogPage.jsx`.
- **Backend:** `useData` attendance/audit.

### Evaluation Form — `/pos/{loc}/evaluation`
- **Purpose:** temperament/evaluation intake form.
- **Files:** `src/pos/pages/EvaluationFormPage.jsx`.

---

## Financials & reporting

### Dashboard / Reports — `/pos/{loc}/{dashboard|reports}`
- **Purpose:** financial + ops analytics with charts.
- **Files:** `src/pos/pages/DashboardPage.jsx`, `ReportsPage.jsx`; `src/pos/charts/`.
- **Backend:** `useData` + chart components.

### Payments — `/pos/{loc}/payments`
- **Purpose:** payment capture and history.
- **Files:** `src/pos/pages/PaymentsPage.jsx`.
- **Backend:** `useData` payments; Stripe via `stripe-checkout`/`stripe-webhook`.

---

## Bookings, messaging & agreements

### Online Bookings — `/pos/{loc}/online-bookings`
- **Purpose:** review/approve customer self‑booking submissions.
- **Files:** `src/pos/pages/OnlineBookingsPage.jsx`.
- **Backend:** `rpc("get_booking_drafts")` + `useData`.

### Messages — `/pos/{loc}/messages`
- **Purpose:** customer messaging.
- **Files:** `src/pos/pages/MessagesPage.jsx`.
- **Backend:** `useData` messages; SMS via `send-reminders`/`send-otp`.

### Agreements — `/pos/{loc}/agreements`
- **Purpose:** customer agreements/waivers.
- **Files:** `src/pos/pages/AgreementsPage.jsx`.
- **Backend:** `useData` agreements; public signing via `PublicPages` + `sign_public_agreement`.

---

## AI & learning

### AI Command — `/pos/{loc}/ai`
- **Purpose:** the LLM assistant wired to an in‑app **Operations Manual** knowledge base.
- **Files:** `src/pos/pages/AIAssistantPage.jsx`.
- **Backend:** `ai-assistant` edge fn + local KB.

### LMS — `/pos/{loc}/lms`
- **Purpose:** the learning‑management surface.
- **Files:** `src/pos/pages/LMSPage.jsx`.

---

## Enterprise & management

### Management Hub — `/pos/{loc}/management`
- **Purpose:** the admin/management launcher for POS.
- **Files:** `src/pos/pages/ManagementHub.jsx`.

### Enterprise (Operations / Locations / Users / Packages / Management)
- **Purpose:** multi‑location rollups, location admin, user/role management, packages.
- **Files:** `src/pos/pages/Enterprise{Operations|Locations|Users|Packages|Management}Page.jsx`.
- **Backend:** enterprise aggregation RPCs (see [Enterprise](Enterprise.md)).

---

## Admin

### Settings — `/pos/{loc}/settings`
- **Purpose:** POS configuration (pricing, rooms, policies, templates, etc.).
- **Files:** `src/pos/pages/SettingsPage.jsx`; writers in `src/useData.js`.
- **Backend:** `location_*` configuration tables (V2 schema), upserted through `useData`.
