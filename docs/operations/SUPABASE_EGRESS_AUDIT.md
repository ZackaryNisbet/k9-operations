# Supabase Egress Audit

**Status:** Phase 1 shipped (core data layer). Backlog tracked below.
**Scope:** Why K9 Operations' Supabase egress is persistently high, what was fixed,
and the prioritized work remaining.
**Method:** Static analysis of the client data layer (the live Supabase usage
dashboard was not available to the author; see *How to measure* for the exact
queries to confirm these numbers against billing).

---

## TL;DR

The single largest, always-on source of egress is the core data hook
**`src/useData.js`**. Every authenticated browser tab:

1. **Re-downloaded the entire location dataset every 30 seconds**, forever, even
   with zero user activity and even when the tab was hidden — a blanket
   `setInterval(() => load(), 30000)`.
2. **Re-downloaded that entire dataset again on *every* realtime change** to any of
   ~52 subscribed tables (`postgres_changes` → `() => load()`), with no coalescing,
   so one user action that writes several tables triggered several full refetches.
3. Did both of the above with **~55 `SELECT *` queries** that pull every column of
   every row of every table for the location, including unbounded history tables
   (`audit_log`, `k9_messages`, `weight_log`, `location_attendance_audit`).
4. Subscribed to those tables **without a `location_id` filter**, so in a
   multi-location deployment a write at one site forced a full reload at every other
   site.

A "full reload" is **~55 table reads** of `SELECT *`. The 30s poll alone is
**2,880 full reloads per tab per day** at idle. Phase 1 removes the idle/background
waste and the realtime storm without changing what a reload returns (so it is
behavior-preserving and low-risk).

---

## Background: what Supabase bills as egress

"Egress" is bytes leaving Supabase to clients. It is dominated by:

- **Database / PostgREST** responses — every `.from(...).select(...)` returns rows
  over HTTPS. `SELECT *` and unbounded result sets inflate this directly.
- **Realtime** — every `postgres_changes` event ships the changed row to every
  subscribed client over the websocket. Wide tables and chatty tables add up.
- **Storage** — every image/file download (especially un-cached, un-transformed
  originals served repeatedly).
- **Edge Functions** — response bodies, plus any data the function itself reads.

The cheapest byte is the one you never send. The levers, in order of leverage:
**fetch less often → fetch fewer rows → fetch fewer columns → cache → transform.**

---

## Root-cause ranking

| # | Source | Where | Egress shape | Status |
|---|--------|-------|--------------|--------|
| 1 | Full-dataset reload storm | `src/useData.js` | 30s blanket poll + a full refetch per realtime event, never gated on tab visibility | **Fixed (Phase 1)** |
| 2 | `SELECT *` over-fetching | ~230 call sites across ~44 files; worst in `useData.js` (50), `TrainingPage.jsx` (38), `LaborInterviewsPage.jsx` (24) | Pulls every column incl. large/unused ones; unbounded history tables pulled in full | Backlog |
| 3 | Always-on display polling | `CheckoutTVPage.jsx`, `DashboardPage.jsx`, `HomePage.jsx`, `KolApp.jsx` | Lobby TVs / dashboards poll every 5–15s 24/7; visibility-gating does not help an always-visible TV | Backlog |
| 4 | Presence poll cadence | `useFacilityPresence.js` (`DEFAULT_POLL_MS = 5000`) | 5s RPC poll + realtime; ~17k RPC calls/day per open client | Backlog |
| 5 | Unbounded history reads | `audit_log`, `k9_messages`, `weight_log`, `location_attendance_audit` in `useData.js` | `SELECT *` with no date/row bound; grows forever and is re-pulled on every reload | Backlog |
| 6 | Storage egress | Photos / graphics modules, PDFs | Original-size, un-transformed, potentially re-fetched images | Backlog (verify; a prior `codex/storage-egress-fix` pass exists) |

---

## Deep dive: #1, the `useData` reload storm

`useData()` is mounted once for the whole authenticated app (`src/App.jsx`), so its
behavior is the app-wide baseline. The load is a `Promise.all` of ~55 queries:

```js
// src/useData.js — abbreviated
const [...] = await Promise.all([
  supabase.from('k9_clients').select('*').eq('location_id', locationId).order('created_at'),
  supabase.from('k9_dogs').select('*').eq('location_id', locationId).order('created_at'),
  supabase.from('k9_reservations').select('*').eq('location_id', locationId).order('created_at'),
  // ... ~52 more, including:
  supabase.from('audit_log').select('*').eq('location_id', locationId).order('created_at'),
  supabase.from('k9_messages').select('*').eq('location_id', locationId).order('created_at'),
  supabase.from('weight_log').select('*'),
]);
```

That whole block was triggered by **both** of these, with no coalescing and no
visibility gate:

```js
for (const tbl of [...entityTables, ...settingsTables]) {
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, () => load());
}
channel.subscribe();
const poll = setInterval(() => load(), 30000);   // every 30s, hidden or not
```

### Why this is the dominant cost

- **Idle baseline.** 30s poll = 2 reloads/min = **120/hour = 2,880/day per open tab**,
  each one ~55 `SELECT *` reads — with *nobody touching the app*. Staff routinely
  leave the app open in a background tab; lobby/back-office screens stay open all day.
- **Background tabs paid full price.** The poll ignored `document.hidden`, so a tab
  buried behind others kept pulling the full dataset around the clock.
- **Realtime amplification.** A single "save reservation" writes several tables
  (`k9_reservations`, `k9_payments`, `audit_log`, …). Each write fired its own
  immediate full reload → **N full reloads for one user action**, multiplied by every
  connected client.
- **Cross-tenant amplification.** The subscriptions had **no `location_id` filter**,
  so any write at *any* location triggered a full reload for *every* client at *every*
  location.

---

## Phase 1 fix (shipped in this change)

The fix keeps `load()` byte-for-byte identical (same tables, same columns) and only
changes **how often it is allowed to run**, so it cannot change displayed data — it
can only stop redundant fetches.

**1. A reusable, visibility-aware, coalescing scheduler — `src/shared/reloadScheduler.js`.**
It encodes the three protections the rest of the codebase already uses ad hoc (see
`useWorkflowProgressSnapshot.js`):

- **Coalesce** — a burst of `requestReload()` calls within `debounceMs` collapses to
  a single reload.
- **Visibility-gate** — never reload while `document.hidden`; remember a refresh is
  owed and run exactly one catch-up reload when the tab is shown again.
- **Poll only when visible** — the safety-net interval is suppressed while hidden.

Timers and the visibility source are injectable, so the logic is unit-tested in a
non-DOM environment (`src/__tests__/reloadScheduler.test.js`).

**2. `useData` now routes both triggers through the scheduler:**

```js
const scheduler = createReloadScheduler(load, {
  debounceMs: REALTIME_RELOAD_DEBOUNCE_MS, // 600ms — collapses a multi-table save into one reload
  pollMs: SAFETY_POLL_MS,                  // 60s safety net, visible-only (was 30s, always-on)
});

const onLocationChange = (payload) => {
  const row = payload?.new ?? payload?.old;
  if (row && row.location_id != null && row.location_id !== locationId) return; // skip other tenants
  scheduler.requestReload();
};
// ...subscribe each table with onLocationChange...
scheduler.start();
return () => { scheduler.stop(); supabase.removeChannel(channel); };
```

**3. Realtime is now location-guarded on the client.** Changes whose row carries a
different `location_id` are dropped before they can trigger a reload. Rows without a
`location_id`, and DELETEs (whose payload may carry only the primary key), fall
through and reload — preserving the previous behavior exactly where we can't prove the
change is irrelevant.

### Expected impact

Assumptions: impact is expressed as **reduction in the number of full-dataset
reloads** (the byte savings scale with that count × payload size; confirm absolute
bytes against the dashboard). Per open tab:

| Scenario | Before | After |
|----------|--------|-------|
| Hidden / background tab, idle | 2,880 full reloads/day (30s poll) | **0** until refocused, then 1 catch-up |
| Visible tab, idle | 2,880/day | 1,440/day (60s poll) — **−50%** |
| One user action writing 4 tables | 4 full reloads | **1** (coalesced) |
| Write at another location (N other sites) | 1 full reload per other-site client | **0** |

The biggest real-world win is the first row: idle and background tabs were the
silent, 24/7 floor under the egress bill, and they now cost nothing until someone
actually looks at them.

---

## How to measure (do this to confirm against billing)

1. **Dashboard → Reports → Database** and **→ Storage**: read the *Egress* charts and
   note the 7-day trend before/after deploy.
2. **Dashboard → Logs → API (PostgREST)**: group by path to see which tables dominate
   request volume and response size. Expect `useData`'s tables to drop sharply in
   request *count*.
3. **Realtime inspector / Logs → Realtime**: confirm message volume.
4. **Client-side sanity check**: in DevTools → Network, filter `rest/v1`, leave the
   app open and idle. Before: a burst of ~55 requests every 30s. After: nothing while
   idle/hidden, a single coalesced burst on focus or after a write.

---

## Prioritized backlog (Phase 2+)

1. **Roll the scheduler out to the other always-mounted pollers.** `useFacilityPresence`
   (5s), `DashboardPage` (10s), `HomePage` (10s), `KolApp` status (12s). For tabs
   that can be hidden this is a drop-in; for the lobby TV (always visible) instead
   **raise the interval** and lean on realtime.
2. **Replace `SELECT *` on hot/large tables with explicit column lists.** Start with
   `useData.js` (50), then the heavy pages (`TrainingPage` 38, `LaborInterviewsPage`
   24, `MarketingDirectoryPage`/`GrassrootsPage` 10 each). Map each `rowTo*` mapper to
   the columns it actually reads and select only those.
3. **Bound the unbounded history reads.** `audit_log`, `k9_messages`,
   `weight_log`, `location_attendance_audit` should be `SELECT`ed with a date window
   and/or `.limit()` + pagination, not pulled in full on every reload. These grow
   forever and are pure waste in the hot path.
4. **Incremental reload (bigger refactor).** A realtime event already names the table
   that changed; refetch only that slice and merge it, instead of reloading all ~55
   tables. This is the highest-ceiling win but the riskiest (the assembly in
   `useData` merges child tables into `dogs`/`clients`); do it table-group by
   table-group behind tests.
5. **Server-side aggregation.** Several screens pull raw rows to compute a summary on
   the client. Where a screen only needs counts/rollups, move the aggregation into an
   RPC/`postgres` function (the pattern `facility_presence_snapshot` and
   `workflow_progress_snapshot` already use) and return the small result.
6. **Scope realtime subscriptions server-side too.** Where a table has `location_id`
   and is in the realtime publication, add `filter: location_id=eq.<id>` to the
   subscription so the *server* never ships other tenants' changes over the socket
   (the client guard added in Phase 1 stops the reload, but the bytes still arrive).
   Validate against the realtime publication before enabling per table.
7. **Storage:** serve images via the transform/render endpoint at display size, set
   long cache headers, and avoid re-fetching originals in lists/thumbnails.

---

## Appendix: the reusable primitive

`createReloadScheduler(reload, { debounceMs, pollMs, timers, visibility })` →
`{ requestReload, start, stop }`. See `src/shared/reloadScheduler.js`. Any hook that
pairs a realtime subscription with a safety poll should use it instead of a raw
`setInterval` + bare `() => load()`; that is the standard this audit establishes for
new data hooks.
