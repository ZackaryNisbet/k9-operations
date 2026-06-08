# Public Surfaces (unauthenticated)

Surfaces rendered for visitors with no session. They are dispatched in `Root()`
(`src/main.jsx`) **before** the auth gate.

### Landing — `/`, `/welcome`, `/pricing`
- **Purpose:** the K9Operations.com marketing one‑pager — hero, scroll‑reveal feature
  rows, editions, how‑it‑works, and the sign‑in/contact CTAs. Product visuals are
  PII‑reviewed screenshots from `public/shots/` (CRM/checkout pillars use CSS mockups);
  preserves the sign‑in transition and the ToS/Privacy modals.
- **Files:** `src/LandingPage.jsx`; screenshots in `public/shots/`; capture tool
  `scripts/capture-marketing-shots.mjs`.
- **Backend:** none (static). Shown to logged‑out users; logged‑in users at `/` get the app.

### Login — `/login`, `/signup`
- **Purpose:** staff sign‑in, forgot‑password, and "set your password" for invited users.
- **Files:** `src/Login.jsx`; (`src/SignupPage.jsx` exists but is currently unwired).
- **Backend:** Supabase Auth via `src/AuthProvider.jsx` (`signIn`, `resetPassword`, `updatePassword`).

### Booking — `/book/{slug}`, `/book`
- **Purpose:** customer self‑booking with an OTP‑verified returning‑customer portal.
- **Files:** `src/BookingPage.jsx` → `src/booking/` (constants, lib, components); theme `shared/bookingTheme.js`.
- **Backend:** `rpc("get_public_booking_data")`, `rpc("submit_online_booking")`,
  `rpc("verify_otp_and_get_customer")`; `send-otp` edge fn (Twilio).

### Sign / Form — `/sign/*`, `/form/*`
- **Purpose:** public e‑signature of agreements and public intake questionnaires.
- **Files:** `src/PublicPages.jsx`.
- **Backend:** `rpc("get_public_link_data")`, `rpc("sign_public_agreement")`,
  `rpc("submit_public_questionnaire")`; DocuSeal via `docuseal-webhook`.

### Public roadmap — `/public-roadmap`
- **Purpose:** a public roadmap surface (routes to the landing/marketing shell).
