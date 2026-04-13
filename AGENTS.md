# K9 Operations — Agent Work Protocol

> You are an AI agent assigned to work on the K9 Operations codebase.
> Read this entire document before doing anything.

## Your Identity

You are one of potentially 50 concurrent agents working on this codebase. You MUST coordinate with other agents to avoid conflicts. Your work is not solo — it's collaborative.

---

## Step 1: Orientation (Do This First)

1. Read this file completely
2. Read `src/tracker-data.js` to see the full backlog
3. Connect to Slack and read the `#new-channel` channel (workspace: `k9operations.slack.com`, channel ID: `C0ALF91BUKV`) to see what other agents are doing
4. Choose an unclaimed task — search Slack for `CLAIM:` messages to see what's taken
5. Post your claim in Slack (see "Communication Protocol" below)
6. Begin work

---

## Step 2: Claim a Task

### Rules for Claiming

1. Connect to Slack (use the Slack connector) and read `#new-channel` (`C0ALF91BUKV`)
2. Search for `CLAIM:` messages to see which tasks are already claimed
3. Pick a task from `src/tracker-data.js` that is NOT claimed
4. Post your claim message in `#new-channel` (see format below)
5. **Never claim a task that's already claimed** — if you see a `CLAIM:` message for that task ID, it's taken

### Claim Message Format (post to Slack)

```
CLAIM: CLM-003 — Building the new client form — files: src/kol/pages/NewClientPage.jsx — branch: agent/CLM-003
```

Generate your agent name using a descriptive ID like `agent-funnel-fix` or `agent-clm003`. Include it in your messages.

---

## Step 3: Understand the Architecture

### Folder Structure

```
src/
  shared/           ← SHARED UI components and theme. DO NOT MODIFY.
    theme.js        ← Color palette (C object), constants
    ui.jsx          ← Btn, Modal, Card, Badge, Inp, CustomSelect, Tip, etc.
    icons.js        ← SVG icon set
    permissions.js  ← Role/permission helpers
    MiniDatePicker.jsx
    CalendarPicker.jsx
    K9LoadingAnimation.jsx
    InteractiveLineChart.jsx
    LocationSelector.jsx

  hooks/            ← Shared data hooks. DO NOT MODIFY.
    useGingrData.js ← Supabase + Gingr API data fetching
    useFilters.js   ← Structured filter logic

  kol/              ← K9 Operations Lite (the operational tool)
    KolApp.jsx      ← Shell/router — DO NOT MODIFY
    pages/          ← ONE FILE PER PAGE — this is where you work
      ClientsPage.jsx
      FunnelPage.jsx
      OperationsHub.jsx
      DailyOpsPage.jsx
      EODPage.jsx
      ClientDetailPage.jsx
      DogDetailPage.jsx
      AttendancePage.jsx
      AuditLogPage.jsx
      NewClientPage.jsx
      CheckoutTVPage.jsx
      ReportsPage.jsx
      PhotosPage.jsx
      SettingsPage.jsx
    settings/       ← Settings sub-tabs (one per file)
    enterprise/     ← Enterprise pages (one per file)

  kop/              ← K9 Operations POS (the sales/booking tool)
    KopApp.jsx      ← Shell/router — DO NOT MODIFY
    pages/          ← ONE FILE PER PAGE
      (same pattern as kol)
    settings/
    enterprise/
    helpers/

  public/           ← Public-facing pages (landing, login, roadmap)
    LandingPage.jsx
    Login.jsx
    PublicRoadmap.jsx
    BookingPage.jsx
    PublicPages.jsx
```

### The Golden Rules

1. **Only edit files in `pages/`, `settings/`, or `enterprise/`** — never touch `shared/`, `hooks/`, or the App shells
2. **One agent per file** — if another agent has claimed a file, do not touch it
3. **No page imports another page** — pages are fully isolated
4. **If you need a new component**, build it inside your page file. It can be promoted to `shared/` later by a human.
5. **Never modify `agent-comms.json` claims belonging to other agents**

### Page Component Contract

Every page receives the same props:

```jsx
import { C } from '../../shared/theme';
import { Btn, Modal, Card, Badge, Inp, CustomSelect, Tip } from '../../shared/ui';

export default function MyPage({ data, save, nav, profile, addGlobalToast }) {
  // data     — all Gingr + Supabase data (clients, dogs, reservations, rooms, etc.)
  // save     — async function to persist changes: save({ dailyOps: [...], auditLog: [...] })
  // nav      — navigation: nav.go("page-id", { params }), nav.back()
  // profile  — current user: { id, role, email, name, location_id }
  // addGlobalToast — show notification: addGlobalToast("message", "success"|"error"|"info")
}
```

### The `data` Object Shape

```js
data = {
  clients: [...],        // Client records with fields, lifecycle stage, dogs
  dogs: [...],           // Dog records with breeds, notes, services
  reservations: [...],   // Booking records with dates, rooms, services, status
  rooms: [...],          // Room assignments from assignRoomsIntelligently()
  dailyOps: [...],       // Daily operations entries (checklists, etc.)
  eodEntries: [...],     // End of day report entries
  auditLog: [...],       // Audit trail
  resortPolicies: {...}, // Retention thresholds, policies
  loading: boolean,      // True while data is being fetched
  error: string|null,    // Error message if fetch failed
}
```

### The `save` Function

```js
// Only pass the keys you're updating — don't spread the entire data object
await save({
  dailyOps: updatedDailyOps,      // optional
  eodEntries: updatedEodEntries,   // optional
  auditLog: [...data.auditLog, newEntry], // append new audit entries
});
```

### Navigation

```js
nav.go("lifecycle");                          // Go to a page
nav.go("client-detail", { clientId: "123" }); // Go with params
nav.back();                                    // Go back in stack
```

### Available Shared UI Components

```jsx
import { C } from '../../shared/theme';           // Color palette
import {
  Btn,            // <Btn variant="primary|ghost|danger" onClick={fn}>Label</Btn>
  Modal,          // <Modal title="..." onClose={fn} wide>content</Modal>
  Card,           // <Card style={{}} hoverable onClick={fn}>content</Card>
  Badge,          // <Badge color="green|red|blue|default">text</Badge>
  Inp,            // <Inp label="Name" value={v} onChange={fn} required />
  CustomSelect,   // <CustomSelect value={v} onChange={fn} options={[{value,label}]} />
  Tip,            // <Tip text="tooltip text"><children/></Tip>
  ComplianceCheckItem, // Checklist compliance items
} from '../../shared/ui';

import MiniDatePicker from '../../shared/MiniDatePicker';
import CalendarPicker from '../../shared/CalendarPicker';
import K9LoadingAnimation from '../../shared/K9LoadingAnimation';
import InteractiveLineChart from '../../shared/InteractiveLineChart';
```

---

## Step 4: Communication Protocol

All agents communicate through **Slack** in the `#new-channel` channel.

- **Workspace:** `k9operations.slack.com`
- **Channel ID:** `C0ALF91BUKV`
- **Channel name:** `#new-channel`

Use the Slack connector tools: `slack_send_message` to post, `slack_read_channel` to check for updates, `slack_search_public` to search history.

### Message Formats

Use these prefixes so messages are machine-searchable:

**Claiming a task:**
```
CLAIM: CLM-003 — Building the new client form — files: src/kol/pages/NewClientPage.jsx — branch: agent/CLM-003
```

**Completing a task:**
```
DONE: CLM-003 — New client form built with 4 sections, validation, Supabase save. Branch agent/CLM-003 ready for review.
```

**Asking for help / pinging another agent:**
```
NEED: Looking for the agent working on CLM-001 — I need to know if you’re changing the client data shape in ClientsPage.
```

**Alerting about changes that affect other files:**
```
ALERT: CLM-003 — I added a new field `preferredContact` to the client save flow. If you’re working on ClientDetailPage or ClientsPage, you may need to handle this field. — affects: ClientDetailPage.jsx, ClientsPage.jsx
```

**Reporting a blocker:**
```
BLOCKED: OPS-005 — I need the shared `MiniDatePicker` to support a `maxDate` prop but I cannot edit shared/. Requesting promotion of this change.
```

### Checking for Messages

**Every 15-20 minutes** (or after completing a major subtask), read the Slack channel and check:

1. Are there any `NEED:` messages looking for you (search for your task ID or agent name)?
2. Are there any `ALERT:` messages mentioning files you’re working on?
3. Has any agent posted `DONE:` for work that unblocks you?

Use `slack_read_channel` with channel_id `C0ALF91BUKV` and check the latest messages.
Use `slack_search_public` with queries like `CLAIM: CLM-003` or `ALERT:` to find specific messages.

---

## Step 5: Git Workflow

### Local Preview Default For Web Work

For web/UI changes, do **not** use `push to main` as the first testing step.

Default workflow:

1. Make the change locally.
2. Run the app locally with `npm run dev -- --host 0.0.0.0 --port 4173`.
3. Give Zack the local review URL:
   - `http://localhost:4173/` on this Mac
   - the Vite network URL when same-network testing is useful
4. Let Zack review and interact with the real app against the real Supabase-backed environment from localhost.
5. Only after Zack approves the behavior should you commit, push, merge, or deploy to the live URL.

Use local preview as the desktop equivalent of the iPhone Wi-Fi deploy/TestFlight review loop.

Important caveat:

- Frontend-only changes can be safely previewed locally first.
- Supabase migrations and Edge Function deploys are live changes. If backend work is required, call that out explicitly before applying it so Zack understands that the data path is no longer local-only.

### Branch Strategy

Each agent works on their own branch:

```bash
git checkout -b agent/<task-id>
# Example: git checkout -b agent/CLM-003
```

### Commit Convention

```
<type>(<task-id>): <description>

feat(CLM-003): build new client form with validation
fix(OPS-005): correct bathing checklist filter logic
refactor(CLM-001): extract filter panel into separate component
```

### Before Pushing

1. Pull latest main: `git fetch origin main`
2. Rebase your branch: `git rebase origin/main`
3. Verify your changes don't break the build: `npm run build`
4. Push your branch: `git push origin agent/<task-id>`

### DO NOT push to `main` directly

Only Zack (the owner) merges branches to main. Push to your feature branch only.

---

## Step 6: Quality Standards

### Code Quality

- **World-class UI** — this is a premium product. Every pixel matters.
- Use the existing `C` color palette and `shared/ui` components consistently
- Font stack: `'GT Eesti'` for body, `'Canela'` for headlines (via `.brand-headline` class)
- All interactive elements need hover states
- Loading states for async operations
- Error handling with user-friendly messages
- Mobile-responsive is a bonus but desktop-first is the priority

### Testing Your Work

1. Run the dev server: `npm run dev`
2. Navigate to your page in the app
3. Test all interactive elements
4. Take screenshots of before/after
5. Verify no console errors

### What "Done" Looks Like

- [ ] Feature works as described in the task spec
- [ ] No console errors or warnings
- [ ] UI matches the visual quality of the rest of the app
- [ ] Code is clean and commented where non-obvious
- [ ] A `DONE:` message is posted in Slack `#new-channel`
- [ ] Changes are committed and pushed to your feature branch
- [ ] Screenshots or descriptions of changes are in the commit message

---

## Business Context

**K9 Operations** is the operating system for pet care facilities. It has two products:

- **KOL (K9 Operations Lite)** — Bolt-on intelligence layer for facilities using Gingr PMS. Provides customer lifecycle management, operations checklists, automated reports, and CRM functionality.
- **KOP (K9 Operations POS)** — Full point-of-sale and management system (standalone, no Gingr dependency).

The app syncs data from **Gingr** (a third-party pet management system) via API, enriches it with lifecycle staging, operational checklists, and business intelligence, and presents it through a premium UI.

### Key Domain Terms

- **Gingr** — Third-party PMS (Property Management System) for pet care
- **Lifecycle stages** — New → Conversion → Active ↔ Retention → Cold
- **Operations Hub** — Daily checklists (opening, closing, FE, BE, bathing, room cleaning, etc.)
- **Pamper Package** — Premium service: Luxury Suite dogs auto-included + add-on for others
- **EOD** — End of Day report
- **Ignite** — Lead generation/intake system

### Excluded Services (don't count these in service reports)

- Food From Home
- Medication Administration
- Private Play Overnight Rate

### Bathing Logic

Any in-house reservation (boarding OR daycare, any stay length) with "Bath" in the `_services` field.

---

## Appendix: Task Categories & Prefixes

| Prefix | Category | Product |
|--------|----------|---------|
| CLM-   | Customer Lifecycle | KOL |
| OPS-   | Operations Hub | KOL |
| TV-    | Checkout TV | KOL |
| IGN-   | Ignite | KOL |
| ENT-   | Enterprise | Both |
| DASH-  | Dashboard | KOL |
| SET-   | Settings | KOL |
| DE-    | Data Expansion | Both |
| PUB-   | Public Site | Public |

---

## Quick Start Checklist

```
□ Read this doc fully
□ Read src/tracker-data.js (backlog)
□ Connect to Slack and read #new-channel (C0ALF91BUKV)
□ Search Slack for CLAIM: messages to see what's taken
□ Pick an unclaimed task
□ Post your CLAIM: message in Slack
□ Create your feature branch: git checkout -b agent/<task-id>
□ Do the work (only edit your page file)
□ Check Slack every 15 min for NEED:/ALERT: messages
□ Test it
□ Commit and push to your branch
□ Post DONE: message in Slack with summary
```
