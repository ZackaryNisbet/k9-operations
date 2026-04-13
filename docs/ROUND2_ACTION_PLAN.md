# ROUND 2 ACTION PLAN — K9 Operations Dashboard
## Post-Wave-1/2 Feedback

**Date**: March 16, 2026
**Source**: User feedback after all Wave 1 + Wave 2 code deployed
**Verbatim**: `docs/DASHBOARD_FEEDBACK_R2_VERBATIM.md`

---

## ISSUE CATALOG (22 discrete items)

### CATEGORY K: Dashboard Visual Polish (6 items)

**K1: Section labels too subtle — make green**
- Priority: MEDIUM
- Type: UI_POLISH
- What's Wrong: Section labels ("Today's Snapshot", "Customer Lifecycle", "Checklists", "Services") use `color: #9CA3AF` (gray) at 9px. Too subtle.
- Fix: Change `.dash-section-label` color to `C.pri` (#14532D) or `C.acc` (#84CC16).
- User Quote: "Labels like 'Today's Snapshot', 'Customer Lifecycle', etc, are too subtle -- maybe make them green?"

**K2: Metric value sizes inconsistent — all should be bigger + green**
- Priority: MEDIUM
- Type: UI_POLISH
- What's Wrong: Non-hero MetricCells render at fontSize 22 in `C.text` (black). Hero cells render at 26 in `C.pri` (green). User wants ALL metrics to use the bigger green style.
- Fix: In MetricCell, remove the hero conditional — make all cells use `fontSize: 26, color: C.pri`. Or add `hero` prop to all MetricCell instances.
- User Quote: "Some of the values are smaller and black, where some are very slightly bigger and green. i think they should all be the slightly bigger + green versions."

**K3: Lapsed color is orange — should not be**
- Priority: LOW
- Type: UI_POLISH
- What's Wrong: Lapsed MetricCell uses `C.warn` (#D97706 amber/orange) when value > 0. User questions this.
- Fix: Remove the conditional `color={funnelMetrics.remainingAtRisk > 0 ? C.warn : undefined}` or change to a more appropriate color (e.g., `C.pri` like other metrics).
- User Quote: "why is lapsed colors orange?"

**K4: Remove Attendance button from dashboard**
- Priority: LOW
- Type: UI_FIX
- What's Wrong: An "Attendance" QuickLinkCell exists on the dashboard (line ~1108). User wants it removed.
- Fix: Delete the QuickLinkCell for Attendance from DashboardPage.jsx.
- User Quote: "why is their an attendance button on dashboard? remove."

**K5: Revenue graph colors should match**
- Priority: MEDIUM
- Type: UI_POLISH
- What's Wrong: Cash Basis Revenue uses `C.pri` (#14532D dark green). Accrual Revenue uses `C.acc` (#84CC16 lime). User wants them the same color.
- Fix: Use the same color for both chart instances (likely `C.pri`).
- User Quote: "on the revenue graphs, make the colors on the revenue graphs the same."

**K6: Accrual revenue explainer text update**
- Priority: LOW
- Type: CONTENT_FIX
- What's Wrong: The explainer/tooltip for Accrual Revenue doesn't explain the calculation method clearly.
- Fix: Update the explainer text to say something like "Accrual revenue takes the full reservation cost and divides it by the number of nights, recognizing revenue evenly across each night of the stay."
- User Quote: "modify the accrual revenue explainer to indicate the logic is taking the full reservation cost and dividing it by the number of nights"

---

### CATEGORY L: Revenue Chart Behavior (4 items)

**L1: Today view shows ~30 data points — redesign Today chart behavior**
- Priority: HIGH
- Type: FEATURE_CHANGE
- What's Wrong: "Today" view renders ~30 interpolated data points which makes no sense for a single day. User questions whether Today should even have a chart.
- Fix: Default the chart to the Past Week view. For "Today" timeframe, show a dotted line from the last data point connecting to today's value with the today value written out as a label.
- User Quote: "why does it show like 30 data points for the 'today' view of the revenue graphs? tbh i question if there should even be a 'today' view for the graph, maybe the default should be the week view but there is a dotted line connected to the 'today' point on the graph showing the value with a written out value for today's written value too"

**L2: X-axis needs day of week labels**
- Priority: MEDIUM
- Type: UI_ENHANCEMENT
- What's Wrong: X-axis labels show dates but not the day of week.
- Fix: Add day-of-week abbreviation to x-axis labels (e.g., "Mon 3/10", "Tue 3/11").
- User Quote: "the x-axis on the revenue graphs -- can you add the day of the week to that?"

**L3: Data point dots too big / reconsider dots**
- Priority: MEDIUM
- Type: UI_POLISH
- What's Wrong: `dotRadius={5}` is too large. User questions if dots are even needed, referencing sophisticated platforms like placer.ai.
- Fix: Reduce dotRadius to 2-3, or remove dots entirely and only show them on hover (like placer.ai does). Research what placer.ai and similar analytics platforms do for data point indicators.
- User Quote: "the data point dots on the revenue graphs are too big -- shrink them a bit. maybe make them smaller? are the dots even needed? think about what placer.ai and other sophisticated reporting platforms do."

**L4: "vs Prior" should show second line on revenue charts**
- Priority: HIGH
- Type: FEATURE_ADD
- What's Wrong: When "vs Prior" toggle is active, only trend badges show prior-period comparison. The charts themselves don't show the prior period data as a comparison line.
- Fix: When `showPriorPeriod` is true, render a second line on each revenue chart using the prior period's data (dashed line, lighter color). This is standard in analytics platforms.
- User Quote: "when 'vs prior' is selected, there should be a second line on the revenue graphs showing the prior period data."

---

### CATEGORY M: Data Accuracy (3 items)

**M1: In-House value and Occupancy % are wrong**
- Priority: CRITICAL
- Type: DATA_BUG + CALCULATION_FIX
- **In-House**: SUM is actually correct (1 dog staying 7 nights = 7 dog-days). Resort does ~650 dogs/week so 181 may be too LOW — investigate. Display boarding sum and daycare sum as sub-values (e.g., "340B · 310D").
- **Occupancy**: Can NEVER exceed 100%. Formula: SUM(occupied ROOMS per night) / (total rooms × days) × 100. Purely overnight — daycare dogs don't count. For multi-day ranges, AVERAGE daily occupancy %, don't sum. Cap at 100%.
- User Quote: "in the past week view, it says 181 in house? cannot be right. also it says 132% occupancy. also impossible lol"
- User Clarification: "my expectation is that you are taking the sum of the number of dogs overnight over the past 7 days and the number of dogs in daycare. if 1 dog is there for 7 days, they should count 7 times. it would be kinda nice if you had 2 values in this cell, 1 for daycare sum, the other for boarding sum."

**M2: Conversion rate 22.2% with only 2 first-time spenders — formula wrong**
- Priority: HIGH
- Type: CALCULATION_FIX
- What's Wrong: Conversion rate formula is `newCustomers.length / leadsInRange.length * 100`. With 2 first-time spenders as numerator, 22.2% implies only ~9 leads in the denominator. User expects first-time spenders to be the numerator.
- Investigation: Need to verify what `newCustomers` and `leadsInRange` actually contain. The formula may be using the wrong populations. First-time spenders (2) should be the numerator; total leads who existed during the period should be the denominator.
- User Quote: "how is this conversion rate metric being calculated? 22.2% with only 2 first time spenders (which should be the numerator) seems wrong"

**M3: Dashboard still laggy — data not updating for 2 hours**
- Priority: CRITICAL
- Type: PERFORMANCE_BUG
- What's Wrong: Despite Wave 2's F1 caching implementation, dashboard is still laggy and data hasn't updated in 2 hours. The stale-while-revalidate pattern may not be triggering background revalidation correctly, or the 15-minute auto-refresh from G1 isn't firing.
- Investigation: Check if `setInterval` polling is actually running. Check if the cache TTL/stale logic has a bug. The user expects instant load from localStorage with no perceptible delay.
- User Quote: "why is it still so fucking laggy? the data has not updated in 2 hours. it should all be local stored data, no delay."

---

### CATEGORY N: Occupancy Report Page (1 item)

**N1: New Occupancy Report page — clickable from dashboard**
- Priority: HIGH
- Type: NEW_PAGE
- What's Wrong: No dedicated occupancy view exists.
- Spec:
  - Clicking the Occupancy figure on the dashboard navigates to a new Occupancy Report page
  - Default view: Past 30 days with date picker identical to dashboard
  - Chart: Y-axis 0%-100% occupancy, X-axis shows each day
  - Jagged/linear lines point-to-point (same as revenue chart redesign)
  - Timeframe selector with same logic as dashboard revenue graphs
  - Data source: `dashboard_metrics_daily.occupancy_pct` per day
- User Quote: "can we create a full occupancy report page? so right now, if i click the occupancy figure on the dashboard, it should take me to a new page outlining occupancy over the past 30 days..."

---

### CATEGORY P: Customer Lifecycle Improvements (7 items)

**P1: Ignite lead missing client name and phone**
- Priority: HIGH
- Type: DATA_BUG
- What's Wrong: A lead pulled from a web form via Ignite has no client name or phone number displayed.
- Investigation: Check if the Ignite webhook payload includes name/phone. If so, it's not being stored correctly. If not, the web form may not be collecting it.
- User Quote: "I see a lead pulled from a web form via ignite with no client name or phone number"

**P2: Ignite source click should cascade into Ignite details**
- Priority: MEDIUM
- Type: FEATURE_ADD
- What's Wrong: Clicking "Ignite" on the source field does nothing or shows minimal info.
- Fix: When clicking the Ignite source badge, expand/cascade to show the full Ignite lead details (form data, timestamp, UTM params, etc.).
- User Quote: "When i click 'Ignite' on source, it should cascade down into showing the pulled ignite details"

**P3: System explanation required for every lifecycle entry — no 0 values**
- Priority: CRITICAL
- Type: FEATURE_ADD
- What's Wrong: Lifecycle entries can have update value = 0 with no explanation. User demands every entry have a meaningful system explanation.
- Spec:
  - No entry should ever show update value = 0
  - Every customer in Lapsed must have a system explanation: "System detected last appointment was [date], determined to be primary [boarding/daycare] customer, hit threshold of [X] days, therefore moved to Lapsed"
  - Every lifecycle transition must be logged with the reasoning
- User Quote: "there should be no entry ever in customer lifecycle with an update value = 0. it should always have a system explanation for how it got there."

**P4: Lifecycle polling frequency + API call visibility in Settings**
- Priority: HIGH
- Type: FEATURE_ADD + SETTINGS
- What's Wrong: User wants to know: how frequently is data moving through the lifecycle? Are we polling daily? How often do we pull new leads from Gingr, move active→lapsed, lapsed→active, leads→active?
- Spec:
  - Settings page should show every API call made to/from Gingr
  - Show frequency of each call type
  - Show total projected daily API calls based on configured frequencies
  - Show the time windows for those calls
  - Customizable thresholds for lifecycle transitions
- User Quote: "are we polling all these customers daily? how frequently are we moving data around the lifecycle via the api... this should be in settings... i want to see every API call we make to/from gingr somewhere in settings"

**P5: Ignite-sourced and custom-created clients need full client pages**
- Priority: CRITICAL
- Type: FEATURE_GAP
- What's Wrong: Gingr-sourced clients have full profiles (dogs, reservations, payments, packages, ignite, lifecycle, notes, history). Ignite-sourced clients only have Lifecycle and Notes. Custom-created clients similarly limited.
- Fix: All client pages must have the same structure regardless of source. Ignite/custom clients should show the same tabs — most will be empty initially but the structure must be identical.
- User Quote: "client pages for both customers pulled from gingr and those created inside our app via ignite or custom created via create client button absolutely need to have the same client page."

**P6: Ignite and Gingr client data parity**
- Priority: HIGH
- Type: DATA_GAP
- What's Wrong: Gingr clients show referral source, client since, total spent, total res, days since last visit. Ignite clients only show source, created date, stage.
- Fix: This is related to P5. When the client page is unified, Ignite clients should show all the same fields — values will be empty/zero until they interact, but the fields must exist.
- User Quote: "customers from ignite only have source, created date, and stage."

**P7: Created dates wrong for both Gingr and Ignite customers**
- Priority: HIGH
- Type: DATA_BUG
- What's Wrong: Created dates don't reflect the actual creation dates from the source systems. Gingr clients should show their Gingr account creation date. Ignite clients should show when the lead was created in Ignite.
- Fix: Map the created_date field from each source system correctly.
- User Quote: "btw the created dates for both customers from gingr and customers from ignite are wrong. they should reflect the created dates from the sources."

---

## EXECUTION ORDER

| Wave | Categories | Items | Parallel Sessions | Dependencies |
|------|-----------|-------|-------------------|-------------|
| W3 | K (Visual), L (Charts), M (Data) | K1-K6, L1-L4, M1-M3 | 3 sessions | None — pure dashboard work |
| W4 | N (Occupancy Page), P (Lifecycle) | N1, P1-P7 | 2 sessions | M1 feeds N1's occupancy data |

### Wave 3 — Dashboard Fixes (3 parallel sessions)

**Session K**: Visual polish (K1-K6) — straightforward CSS/JSX changes
**Session L**: Chart behavior (L1-L4) — InteractiveLineChart.jsx + DashboardPage.jsx
**Session M**: Data accuracy (M1-M3) — SQL, metricsHelpers.js, caching/polling investigation

### Wave 4 — New Features (2 parallel sessions)

**Session N**: Occupancy Report page (N1) — new page, routing, chart
**Session P**: Customer Lifecycle improvements (P1-P7) — ClientDetailPage, lifecycle logic, Ignite integration, Settings

---

## COPY-PASTE PROMPTS

### PROMPT: Category K — Dashboard Visual Polish

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix 6 visual polish items.

## Environment & Credentials
- Repo: /home/user/workspace/k9-repo/ (already cloned)
- Branch: main (pull latest first — git pull origin main)
- GitHub: ZackaryNisbet/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zacknisbet@gmail.com, name="Zack Nisbet"
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx — main dashboard UI
- src/shared/theme.js — color constants (C.pri=#14532D, C.acc=#84CC16, C.warn=#D97706, etc.)

## FIXES REQUIRED (6 items):

### K1: Section labels too subtle — make green
The `.dash-section-label` CSS class (line ~128) uses `color: #9CA3AF` (gray) at 9px. This is too subtle.
- Change the color to C.pri (#14532D) — the brand forest green
- Keep the size, weight, and uppercase transform

### K2: All metric values should be bigger + green
Currently MetricCell has a conditional: hero cells are fontSize 26 + C.pri color, non-hero cells are fontSize 22 + C.text (black).
- Make ALL MetricCells use the hero styling: fontSize 26, color C.pri
- The simplest fix: in MetricCell component (~line 1183), remove the hero conditional and always use `fontSize: 26, color: C.pri`
- Exception: cells that have an explicit `color` prop (like Refunds which use C.dan red) should keep their override

### K3: Remove orange color from Lapsed
The Lapsed MetricCell (~line 998) has `color={funnelMetrics.remainingAtRisk > 0 ? C.warn : undefined}`.
- Remove this conditional color — Lapsed should use the same green as all other metrics (handled by K2)

### K4: Remove Attendance button
There's a QuickLinkCell for "Attendance" (~line 1108).
- Delete this cell entirely from the dashboard grid
- Also remove the "enterprise-attendance" entry from the gridKeys array (~line 697) if it exists

### K5: Revenue graph colors should match
Cash Basis Revenue chart uses `color={C.pri}` (~line 1053). Accrual Revenue chart uses `color={C.acc}` (~line 1091).
- Change BOTH to use `color={C.pri}` so they match
- Update the compareColor props accordingly if needed

### K6: Update accrual revenue explainer
Find the explainer/tooltip text for the Accrual Revenue section.
- Update it to clearly state: "Accrual revenue recognizes the full reservation cost divided evenly by the number of nights in the stay."
- Make sure it reads naturally and is clear to a non-technical user

## IMPORTANT RULES
- Pull latest main before starting (other sessions may have pushed)
- Test that the build compiles: npx vite build --mode production
- Commit and push to main when done
- Use descriptive commit message
```

---

### PROMPT: Category L — Revenue Chart Behavior

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix 4 revenue chart behavior issues.

## Environment & Credentials
- Repo: /home/user/workspace/k9-repo/ (already cloned)
- Branch: main (pull latest first — git pull origin main)
- GitHub: ZackaryNisbet/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zacknisbet@gmail.com, name="Zack Nisbet"
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx — chart rendering, ChartFill wrapper
- src/shared/InteractiveLineChart.jsx — chart component with props: useRawPoints, lineType, solidFill, showGuideLines, showDots, dotRadius
- src/hooks/useDashboardMetrics.js — data fetching, aggregateRows(), prior period data

## Brand Colors
- C.pri = #14532D (forest green — primary)
- C.acc = #84CC16 (lime — accent)
- C.textMut = #475569 (muted text)

## FIXES REQUIRED (4 items):

### L1: Today view chart redesign
Currently the "Today" timeframe shows ~30 interpolated data points which is meaningless for a single day.
- When timeframe is "Today": do NOT show a full line chart. Instead:
  - Show the Past Week chart data as the base (7 data points, linear/jagged)
  - Add today's value as the final point, connected to yesterday by a DOTTED line segment
  - Display today's value as a written label next to the point (e.g., "$1,234" in a small badge/callout)
  - This gives context (the week trend) while highlighting today's contribution
- When timeframe is anything else (Past Week, MTD, etc.): keep current behavior with useRawPoints and linear lines

### L2: X-axis day-of-week labels
The x-axis on revenue charts shows dates but not the day of week.
- Add the day abbreviation: "Mon 3/10", "Tue 3/11", "Wed 3/12", etc.
- For longer timeframes (MTD, YTD) where there are many points, you may need to show abbreviated labels or skip some to avoid crowding
- Use JavaScript's Date.toLocaleDateString or manual DAY_NAMES_SHORT from theme.js

### L3: Smaller/smarter data point dots
Current `dotRadius={5}` is too large. Reference how analytics platforms like placer.ai handle this:
- Remove the always-visible dots (set showDots={false} or remove the prop)
- Instead, show dots ONLY on hover — when the user hovers over the chart, show a dot at the nearest data point with a tooltip showing the value
- If removing hover dots is too complex, at minimum reduce dotRadius to 2 and make them semi-transparent until hovered

### L4: Prior period comparison line on charts
When the "vs Prior" toggle (showPriorPeriod) is active, the revenue charts should show a second line for the prior period.
- useDashboardMetrics already fetches prevMetrics with prior period data
- Chart data for the prior period needs to be mapped to the same x-axis positions as the current period
- Prior period line style: dashed, lighter/more transparent version of the same color (e.g., 40% opacity)
- Add a small legend or label distinguishing "Current" vs "Prior" period
- Both Cash Basis and Accrual Revenue charts should support this

## IMPORTANT RULES
- Pull latest main before starting (other sessions may have pushed)
- Test that the build compiles: npx vite build --mode production
- Commit and push to main when done
- Use descriptive commit message
```

---

### PROMPT: Category M — Data Accuracy Fixes

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix 3 data accuracy issues.

## Environment & Credentials
- Repo: /home/user/workspace/k9-repo/ (already cloned)
- Branch: main (pull latest first — git pull origin main)
- GitHub: ZackaryNisbet/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zacknisbet@gmail.com, name="Zack Nisbet"
- Supabase project ref: xuzvqcpthqikyroqhypw
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 8ea382b0-63f7-44ac-b6f8-83243c03d946
- Gingr API: k9cherryhill.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/hooks/useDashboardMetrics.js — aggregateRows() with isMultiDay SUM logic
- src/shared/metricsHelpers.js — computeFunnelMetrics() with conversionRate
- supabase/migrations/20260316_dashboard_metrics.sql — compute_dashboard_metrics() RPC
- src/shared/dashboardCache.js — stale-while-revalidate caching
- src/hooks/useRefreshSettings.js — 15-min auto-refresh polling

## FIXES REQUIRED (3 items):

### M1: CRITICAL — In-House value and Occupancy % are wrong
The Past Week view shows 181 "In House" and 132% occupancy.

**IN-HOUSE FIX:**
The SUM approach is actually CORRECT for In-House — if 1 dog stays 7 nights, they should count 7 times (total dog-days). The resort does ~650 dogs/week so 181 may actually be too LOW. Investigate why.

However, the In-House cell needs TWO sub-values for multi-day ranges:
- Boarding sum (total overnight dog-nights across the period)
- Daycare sum (total daycare dog-visits across the period)
- Main value = combined total
- Use the existing `sub` prop pattern: `sub={\`${boardingSum}B · ${daycareSum}D\`}` (already exists on In-House cell for Today view)
- For multi-day ranges, SUM `boarding_in_house` and `daycare_in_house` separately and display both

**OCCUPANCY FIX:**
Occupancy can NEVER exceed 100%. The correct formula:
- Numerator: SUM of occupied ROOMS each night across the period (NOT dogs — ROOMS. Multiple dogs can share a room.)
- Denominator: Total rooms in resort × number of days in the period
- Formula: `SUM(occupied_rooms_per_night) / (total_rooms × days) × 100`
- This is purely OVERNIGHT occupancy — daycare dogs do NOT count
- If the SQL `occupancy_pct` per day is already correct (rooms occupied that night / total rooms), then for multi-day ranges: AVERAGE the daily occupancy percentages, do NOT sum them
- Cap occupancy at 100% max as a sanity check

Keep SUM for additive event metrics: dogsExpected, bookingsToday, toursToday, evalsToday, dogsArriving, dogsGoingHome, dogsCheckedOut

### M2: HIGH — Conversion rate formula investigation
Conversion rate shows 22.2% with only 2 first-time spenders. The formula is:
`conversionRate = newCustomers.length / leadsInRange.length * 100`

Investigate:
1. What does `newCustomers` actually contain? Is it the same as firstTimePayers?
2. What does `leadsInRange` contain? How many items?
3. The user says first-time spenders (2) should be the numerator. If newCustomers ≠ firstTimePayers, fix the formula.
4. The denominator should be total leads who existed during the time range.
5. Add a code comment explaining the corrected formula clearly.

### M3: CRITICAL — Dashboard still laggy, data not updating
Despite the caching (F1) and auto-refresh (G1) implementations, the dashboard is still laggy and data hasn't updated in 2 hours.

Investigate and fix:
1. Check if the setInterval-based auto-polling in useDashboardMetrics is actually firing. Add console.log to verify.
2. Check if the stale-while-revalidate logic in dashboardCache.js correctly triggers background fetches.
3. The 15-minute cache TTL + auto-refresh should mean data is never more than ~15 minutes old. If it's 2 hours stale, something is broken.
4. Check if the business hours toggle (G3) is accidentally blocking ALL refreshes (it's 1 AM — outside default 7am-7pm business hours).
5. CRITICAL INSIGHT: The user is testing at ~3 AM. Business hours are 7am-7pm by default. The auto-refresh likely pauses outside business hours. This might be the root cause. Fix: dashboard data refresh should NOT be gated by business hours — only Gingr API polling should be. The dashboard should always serve cached data and refresh from the local database, regardless of business hours.
6. Ensure the first load from localStorage cache is truly instant (no network call blocking render).

## IMPORTANT RULES
- Pull latest main before starting (other sessions may have pushed)
- When fixing aggregation (M1), verify with actual data: query dashboard_metrics_daily for the past 7 days and check the numbers make sense
- Test that the build compiles: npx vite build --mode production
- Commit and push to main when done
- Use descriptive commit message
```

---

### PROMPT: Category N — Occupancy Report Page

```
You are a senior full-stack developer working on K9 Operations. Your task is to create a new Occupancy Report page.

## Environment & Credentials
- Repo: /home/user/workspace/k9-repo/ (already cloned)
- Branch: main (pull latest first — git pull origin main)
- GitHub: ZackaryNisbet/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zacknisbet@gmail.com, name="Zack Nisbet"
- Supabase project ref: xuzvqcpthqikyroqhypw
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 8ea382b0-63f7-44ac-b6f8-83243c03d946
- Product name: "K9 Operations" (never K-9 or k9)

## Brand
- Primary: #14532D (forest green)
- Accent: #84CC16 (lime)
- Background: #FFFFFF
- Font: Outfit
- Theme constants in src/shared/theme.js

## Key Files
- src/kol/pages/DashboardPage.jsx — reference for timeframe selector, chart patterns
- src/shared/InteractiveLineChart.jsx — existing chart component
- src/kol/KolApp.jsx — routing
- DB table: dashboard_metrics_daily (has occupancy_pct per day)

## SPEC: Occupancy Report Page

### Navigation
- Clicking the Occupancy metric card on the Dashboard navigates to this new page
- Add route in KolApp.jsx — something like "occupancy-report"
- Add a back button/breadcrumb to return to Dashboard

### Page Layout
- Title: "Occupancy Report"
- Date picker identical to the dashboard's (same component or same pattern)
- Default timeframe: Past 30 Days

### Chart
- Y-axis: 0% to 100% (occupancy percentage)
- X-axis: Each day in the selected range (show date + day of week for ranges ≤ 30 days)
- Line style: Jagged/linear point-to-point (lineType="linear", useRawPoints)
- Color: C.pri (#14532D)
- Fill: Solid fill below the line with low opacity (same as revenue charts)
- Data source: Query `dashboard_metrics_daily` for the selected date range, use `occupancy_pct` column

### Timeframe Behavior
- When timeframe changes, chart updates with same logic as dashboard revenue graphs
- Timeframe options: Past Week, Past 30 Days, MTD, QTD, YTD, Custom
- No "Today" option (single-day occupancy is already on the dashboard)

### Summary Stats (above chart)
- Average Occupancy: average of occupancy_pct across the range
- Peak Occupancy: highest occupancy_pct day (show date)
- Low Occupancy: lowest occupancy_pct day (show date)

### Styling
- Match the dashboard's visual language exactly
- Use the same card/surface styling, fonts, spacing
- Mobile responsive

## IMPORTANT RULES
- Pull latest main before starting (other sessions may have pushed)
- Test that the build compiles: npx vite build --mode production
- Commit and push to main when done
- Use descriptive commit message
```

---

### PROMPT: Category P — Customer Lifecycle Improvements

```
You are a senior full-stack developer working on K9 Operations. Your task is to fix 7 Customer Lifecycle issues.

## Environment & Credentials
- Repo: /home/user/workspace/k9-repo/ (already cloned)
- Branch: main (pull latest first — git pull origin main)
- GitHub: ZackaryNisbet/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zacknisbet@gmail.com, name="Zack Nisbet"
- Supabase project ref: xuzvqcpthqikyroqhypw
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 8ea382b0-63f7-44ac-b6f8-83243c03d946
- Gingr API: k9cherryhill.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/ClientsPage.jsx — lifecycle list with tabs (leads, active, lapsed, cold, all)
- src/kol/pages/ClientDetailPage.jsx — individual client profile
- src/hooks/useGingrData.js — Gingr sync, lifecycle transitions, data loading
- src/shared/metricsHelpers.js — lifecycle metric computation
- src/kol/settings/DashboardRefreshTab.jsx — refresh/polling settings

## FIXES REQUIRED (7 items):

### P1: Ignite lead missing name and phone
A lead pulled from a web form via Ignite is showing up with no client name or phone number.
- Investigate the Ignite webhook handler (likely in a Supabase edge function or in useGingrData.js)
- Check what data the Ignite webhook sends — does it include name/phone?
- If the data exists in the webhook payload, make sure it's being stored in the client record's fields (first_name, last_name, phone)
- If the web form doesn't collect phone, at minimum show whatever data IS available (name, email)

### P2: Ignite source click should show Ignite details
When a user clicks the "Ignite" source badge on a client in the lifecycle list:
- Expand/cascade to show the pulled Ignite lead details
- Show: form data (all fields submitted), timestamp of submission, UTM parameters if available, referring URL
- This data should be stored on the client record when the Ignite webhook creates it
- If the data isn't being stored, add it to the webhook handler

### P3: CRITICAL — System explanations for all lifecycle entries
Every lifecycle entry must have a meaningful system explanation. No entry should ever have update value = 0.
- For Lapsed customers, automatically generate: "System detected last appointment was [DATE]. Determined to be primary [boarding/daycare] customer based on [X]% boarding ratio. Hit threshold of [Y] days (configured in Settings). Moved to Lapsed on [DATE]."
- For every lifecycle transition (lead→active, active→lapsed, lapsed→active, etc.), log the reasoning
- In useGingrData.js where lifecycle transitions happen, add detailed system log entries explaining WHY the transition occurred
- These should appear in the client's lifecycle updates/history

### P4: API call visibility in Settings
Add a new section to Settings showing all Gingr API integration details:
- List every API call type (sync reservations, sync owners, sync dogs, check for new leads, assess lifecycle transitions)
- Show the frequency of each (e.g., "Every 15 minutes during business hours")
- Show the total projected daily API calls (frequency × calls per cycle × business hours)
- Show the configured time windows
- Make thresholds customizable (boarding lapse threshold, daycare lapse threshold, lifecycle assessment frequency)
- This could be a new tab in Settings called "Gingr Integration" or "API Overview"

### P5: CRITICAL — Unified client pages regardless of source
Currently:
- Gingr clients have: Dogs, Reservations, Payments, Packages, Ignite, Lifecycle, Notes, History
- Ignite clients only have: Lifecycle and Notes

ALL clients must have the same page structure:
- In ClientDetailPage.jsx, show ALL tabs for ALL clients regardless of source
- For Ignite/custom clients, tabs like Dogs, Reservations, Payments, Packages will be empty but should show a helpful empty state (e.g., "No reservations yet — this client was added via Ignite")
- The client header should show the same fields: referral source, client since, total spent, total reservations, days since last visit
- For Ignite clients, these will be "—" or "0" initially but the fields must be present

### P6: Data parity for Ignite vs Gingr clients
Related to P5. Ensure that:
- Ignite clients show: source (Ignite), created date, stage, PLUS all the standard fields even if empty
- The client detail header should render identically for both sources
- If fields are empty, show appropriate placeholders, not missing UI elements

### P7: Created dates should reflect source system dates
- Gingr clients: created_date should be the date the account was created in Gingr (look for `created_at` or similar in the Gingr owner data)
- Ignite clients: created_date should be when the Ignite lead was submitted (the webhook timestamp)
- Currently both may be using the date the record was created in Supabase (lite_clients table insert date)
- Check the Gingr owner sync — does it store the original Gingr created date?
- Check the Ignite webhook handler — does it store the submission timestamp?
- Fix both to use the source system's creation date

### P8: CRITICAL — No duplicate clients by phone number
- Priority: CRITICAL
- Type: DATA_BUG
- What's Wrong: Ignite webhook creates a new lite_client every time it fires, even if a client with that phone number already exists. Example: "Nj Haddonfield" (18565609393) appears 3 times — all from Ignite, same date, same system log.
- Fix:
  1. Before creating a new client from ANY source (Ignite, Gingr sync, manual), check if a client with that phone number exists
  2. If match found, update existing record — don't create new one
  3. Add UNIQUE constraint on normalized phone in lite_clients
  4. Clean up existing duplicates — merge into one, preserve earliest created_date, combine lifecycle data
  5. Dedup must work ACROSS source types (Gingr + Ignite + manual)
  6. Normalize phone before comparing (strip +1, spaces, dashes, parens)
- User Quote: "there can never be duplicate phone numbers. ever. for clients. across all source types. why do we have 3 of one guy?"

### P8: CRITICAL — No duplicate clients by phone number
Ignite webhook creates duplicate client records. Example: "Nj Haddonfield" (18565609393) appears 3 times.
- Before creating a new client from ANY source (Ignite webhook, Gingr sync, manual create), normalize the phone number (strip +1, spaces, dashes, parens) and check if a client with that phone already exists
- If a match exists, UPDATE the existing record — do NOT create a new one
- Add a UNIQUE constraint on a normalized_phone column in lite_clients (or equivalent dedup mechanism)
- Write a migration/cleanup script that finds existing duplicates, merges them into one record (preserve earliest created_date, combine lifecycle data), and deletes the extras
- This dedup must work ACROSS source types: if a Gingr client exists with phone X, an Ignite lead with the same phone should match to them

## IMPORTANT RULES
- Pull latest main before starting (other sessions may have pushed)
- P8 is CRITICAL — dedup logic must be bulletproof. Test with the known duplicate (18565609393)
- P3 is the most complex — take time to understand the lifecycle transition code in useGingrData.js before modifying
- P4 is a new Settings section — follow the pattern of DashboardRefreshTab.jsx
- P5 requires understanding ClientDetailPage.jsx thoroughly
- Test that the build compiles: npx vite build --mode production
- Commit and push to main when done
- Use descriptive commit message
```

---

## MOTION TASK NAMING CONVENTION

Continuing the wave/letter/number pattern from Round 1:

| Task ID | Title | Project | Category |
|---------|-------|---------|----------|
| W3·K1 | Section labels → green | KOL Issues | K: Visual Polish |
| W3·K2 | All metric values bigger + green | KOL Issues | K: Visual Polish |
| W3·K3 | Remove orange from Lapsed | KOL Issues | K: Visual Polish |
| W3·K4 | Remove Attendance button | KOL Issues | K: Visual Polish |
| W3·K5 | Revenue graph colors match | KOL Issues | K: Visual Polish |
| W3·K6 | Accrual revenue explainer update | KOL Issues | K: Visual Polish |
| W3·L1 | Today chart → week + dotted today line | KOL Issues | L: Chart Behavior |
| W3·L2 | X-axis day-of-week labels | KOL Issues | L: Chart Behavior |
| W3·L3 | Smaller/hover-only data dots | KOL Issues | L: Chart Behavior |
| W3·L4 | Prior period comparison line | KOL Issues | L: Chart Behavior |
| W3·M1 | In-House boarding/daycare split + Occupancy cap 100% | KOL Issues | M: Data Accuracy |
| W3·M2 | Conversion rate formula fix | KOL Issues | M: Data Accuracy |
| W3·M3 | Dashboard lag + stale data fix | KOL Issues | M: Data Accuracy |
| W4·N1 | Occupancy Report page | KOL Enhancements | N: Occupancy Page |
| W4·P1 | Ignite lead missing name/phone | KOL Issues | P: Lifecycle |
| W4·P2 | Ignite source → cascade details | KOL Enhancements | P: Lifecycle |
| W4·P3 | System explanations for all lifecycle entries | KOL Issues | P: Lifecycle |
| W4·P4 | API call visibility in Settings | KOL Enhancements | P: Lifecycle |
| W4·P5 | Unified client pages (all sources) | KOL Issues | P: Lifecycle |
| W4·P6 | Ignite/Gingr data parity | KOL Issues | P: Lifecycle |
| W4·P7 | Created dates from source systems | KOL Issues | P: Lifecycle |
| W4·P8 | Deduplicate clients by phone — no dupes ever | KOL Issues | P: Lifecycle |

**Total: 21 new Motion tasks**
