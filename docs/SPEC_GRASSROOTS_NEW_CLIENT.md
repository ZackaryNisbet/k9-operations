# Spec: Grassroots New Client Creation (Manual Lead Entry)

## Problem
The "+ New Client" feature on the Customer Lifecycle page crashes with `useMemo is not defined` (fixed in commit 11b0a36). Beyond the crash fix, the user needs a working flow to manually create client records from grassroots events (dog parks, community events, networking, etc.) — people they met in person who aren't yet in Gingr.

## Current State
- NewClientPage exists in `src/kol/pages/NewClientPage.jsx` with a 3-step wizard: Client Info → Dog Info → Services
- The page renders after the useMemo fix but has not been tested end-to-end
- Created clients are stored in-memory (via `data.clients`) and persisted to Supabase via the save function
- No integration with `lite_clients` table (doesn't exist yet)

## Requirements

### Must Have
1. **New Client form works end-to-end** — fill in name, phone, email → client appears in Leads tab
2. **Source field** — dropdown or auto-set to track where the client came from:
   - Grassroots/Event
   - Referral
   - Walk-in
   - Ignite (auto-set by pipeline)
   - Other
3. **Minimal required fields** — First name + phone (or email). Dog info optional.
4. **Follow-up auto-set** — +1 day from creation
5. **Notes field** — free text to capture context (e.g., "Met at Cherry Hill Dog Park, has a Golden named Max, interested in boarding")

### Nice to Have
6. **Event tagging** — tag which event/location they came from for ROI tracking
7. **Quick-add mode** — streamlined single-screen form for rapid entry at events (vs. the current 3-step wizard)
8. **Duplicate detection** — warn if phone/email already exists in Gingr

## Implementation Notes
- This feature shares infrastructure with the Ignite auto-create feature (both need `lite_clients` table)
- The existing NewClientPage wizard can be the "full" mode
- A simplified quick-add could be a modal accessible from the Leads tab header
- Both manual and Ignite clients should flow into the same data pipeline

## Dependencies
- `lite_clients` table from the Ignite Auto-Create spec
- Fix to the existing NewClientPage persistence (verify it saves correctly)
