# FINAL UNIFIED ACTION PLAN — K9 Operations Dashboard
## Committee Reconciliation (Chair Report)

**Date**: March 15, 2026
**Chair**: Committee Chair (reconciling Alpha, Beta, Gamma interpretations)
**Source**: User verbatim feedback on Dashboard "Past Week" view
**Screenshot**: /<path>/workspace/image.jpg
**Directive**: DO NOT code. Interpret only. Produce Motion-ready prompts.

---

## RECONCILIATION SUMMARY

| Metric | Count |
|--------|-------|
| **Total unique issues identified across all 3 agents** | **50** |
| Items with FULL consensus (all 3 agents) | 48 |
| Items caught by exactly 2 agents | 0 |
| Items caught by exactly 1 agent | 2 |
| Items in verbatim feedback missed by ALL agents | 0 |

### Agent Coverage Comparison

| Agent | Items Extracted | Unique Insights | Overlap Style |
|-------|----------------|-----------------|---------------|
| **Alpha** | 53 | "TODAY'S SNAPSHOT" label mismatch (F4), New Leads positive ack (B9) | Most granular — split sub-issues into separate items, added screenshot-inferred issues |
| **Beta** | 58 | None unique — highest count due to splitting every sub-clause into its own item | Most verbose — e.g., split occupancy into 3 items (wrong value, formula, dog type filter) |
| **Gamma** | 41 | None unique — most concise, sometimes merged related items | Most compact — combined related issues (e.g., Baths + Services + Timeframe spec into one item) |

### Solo-Agent Items

| ID | Title | Agent | Assessment |
|----|-------|-------|------------|
| F4 | Section title says "TODAY'S SNAPSHOT" in Past Week view | Alpha only | **VALID CATCH** — screenshot clearly shows "TODAY'S SNAPSHOT" while "Past Week" is selected. User didn't call it out explicitly but it's a legitimate bug implied by the entire feedback context. Promoted to action plan. |
| B9 | New Leads (12) acknowledged as fine | Alpha only | **POSITIVE FEEDBACK** — not an action item. Logged for completeness only. No action needed. |

### Gaps Found in Verbatim Feedback
**None.** All three agents collectively covered every discrete issue, request, question, and aside in the user's feedback. The verbatim text was re-read 3 times during reconciliation to confirm.

### Notes on Agent Disagreements
- **Priority ratings differed** across agents (e.g., Gamma rated load time as HIGH while Alpha rated it CRITICAL; Gamma rated the Going Home→Canceled animation as LOW while Alpha/Beta rated it MEDIUM). The final plan uses the **highest justified priority**.
- **Categorization differed** (e.g., Gamma marked some verification items as DATA_BUG; Beta split single user sentences into multiple items). The final plan normalizes all categories.
- **Granularity differed** — Beta extracted 58 items by splitting sub-clauses; Gamma extracted 41 by merging. The final plan uses canonical issues: one item per distinct user concern.

---

## CATEGORY A: Snapshot Metrics (Data + Calculation Fixes)

### A1: Expected Value (50) Wrong for Past Week
- **Priority**: CRITICAL
- **Type**: CALCULATION_FIX
- **What's Wrong**: Expected card shows **50** for Past Week (screenshot: "50 +15.6% Expected"). For a resort doing ~600 dogs/week, 50 is clearly a single day's number or incorrect aggregate.
- **What It Should Be**: Raw count of ALL dogs **scheduled to check in** during the past 7 days. Not a daily average, not a snapshot — the full weekly aggregate.
- **User's Exact Quote**: "You'll see that in the past week it says 50 expected and 40 in-house. That is not right. You're telling me in the past seven days we've only had 50 dogs that were expected each individual day? In aggregate? No... I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come."
- **Agent Consensus**: All 3 (Alpha-06, Beta-07/09, Gamma-05)
- **Motion Task Explicitly Requested**: No

### A2: In-House Value (40) Wrong for Past Week
- **Priority**: CRITICAL
- **Type**: CALCULATION_FIX
- **What's Wrong**: In House card shows **40** for Past Week (screenshot: "40 +1233.3% In House 408:00"). Far too low for weekly aggregate.
- **What It Should Be**: Raw count of ALL dogs that **actually checked in** during the past 7 days. The difference (Expected - In House) = cancellations, which the user described as "useful."
- **User's Exact Quote**: "...and then for in-house you just take the raw number of the dogs that checked in at that point. You'll be able to tell if there were 1,000 or 600 dogs expected and only 590 were in-house in the past week, then you know 10 canceled. That's useful."
- **Agent Consensus**: All 3 (Alpha-07, Beta-08/10, Gamma-06)
- **Motion Task Explicitly Requested**: No

### A3: In-House/Expected Should Exclude Tours
- **Priority**: HIGH
- **Type**: CALCULATION_FIX
- **What's Wrong**: The In-House and Expected counts include "every dog" — all types. But tours must be excluded.
- **What It Should Be**: Include all dog types (boarding, daycare, etc.) EXCEPT tours.
- **User's Exact Quote**: "By the way going back to that, that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that."
- **Agent Consensus**: All 3 (Alpha-08, Beta-17, Gamma-10)
- **Motion Task Explicitly Requested**: No

### A4: Going Home → Canceled in Past Week View (with Animation)
- **Priority**: MEDIUM
- **Type**: NEW_FEATURE
- **What's Wrong**: Going Home card shows **0** in Past Week view (screenshot: "0 Going Home"). Not useful for historical view.
- **What It Should Be**: When timeframe switches to Past Week, "Going Home" text animates into "Canceled" with: (1) red bar crosses out "Going Home" in animated way, (2) text replaces with "Canceled", (3) value = Expected − In House animates in.
- **User's Exact Quote**: "Going home. I don't know if going home is useful at the past week view so maybe on the past week view when it changes to it, the going home text animates into canceled and it just does a manual subtraction of expected and in-house. There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in."
- **Agent Consensus**: All 3 (Alpha-09, Beta-11/12/13/14, Gamma-07/08)
- **Motion Task Explicitly Requested**: No

### A5: Occupancy (143%) Wrong — Fix Calculation
- **Priority**: CRITICAL
- **Type**: CALCULATION_FIX
- **What's Wrong**: Occupancy shows **143%** (screenshot: "143% +1200.0% Occupancy"). Absurd value.
- **What It Should Be**: Formula = (total room-nights occupied by **boarding overnight dogs only** in past week) ÷ (total overnight rooms × 7 days). Numerator: only overnight boarding dogs. NOT daycare, NOT tours, NOT all dogs.
- **User's Exact Quote**: "Okay occupancy 143%. What the fuck is this? How are you calculating this? What you should be doing is looking at the total number of rooms occupied in the past week and dividing that by the total number of rooms possible to be occupied in the past week. Look at the total number of rooms we have overnight multiplied by seven. Look at the total number of dogs we had just boarding overnight and then divide those."
- **Agent Consensus**: All 3 (Alpha-10, Beta-15/16/17, Gamma-09/10)
- **Motion Task Explicitly Requested**: No

### A6: Bookings (10) Wrong — Should Use Reservation Created Date
- **Priority**: CRITICAL
- **Type**: CALCULATION_FIX
- **What's Wrong**: Bookings shows **10** (screenshot: "10 Bookings"). Too low.
- **What It Should Be**: Count of reservations whose **reservation_created_date** falls within the past week. NOT check-in date.
- **User's Exact Quote**: "Okay bookings, it says 10 in the past week. I know that's not right so I don't know how you're looking at it but in my head when I think of bookings, you're going to look at reservations and you're going to look at the reservation created date. How many reservations were created in the past week? Super important."
- **Agent Consensus**: All 3 (Alpha-11, Beta-18/19, Gamma-11)
- **Motion Task Explicitly Requested**: No

### A7: Tours (0) Is Wrong
- **Priority**: HIGH
- **Type**: BUG_FIX
- **What's Wrong**: Tours shows **0** (screenshot: "0 +100.0% Tours"). Should be non-zero.
- **What It Should Be**: Correct count of tours conducted/booked in the past week.
- **User's Exact Quote**: "Zero tours. I know that's not right; you need to fix that"
- **Agent Consensus**: All 3 (Alpha-12, Beta-20, Gamma-12)
- **Motion Task Explicitly Requested**: No

### A8: Evals (1) Wrong — Need Programmatic First-Visit Detection
- **Priority**: HIGH
- **Type**: CALCULATION_FIX
- **What's Wrong**: Evals shows **1** (screenshot: "1 Evals"). Incorrect.
- **What It Should Be**: Count both: (a) explicit evaluation appointments/reservations in Gingr, AND (b) programmatically detect a dog's **first-ever reservation** (first visit = evaluation). Evaluations only happen on first visits.
- **User's Exact Quote**: "one eval. I know that's not right either so I think in Gingr you can create an appointment called evaluate or create a reservation called evaluation. A lot of the time we don't do that; a lot of the time we'll just create a day care reservation and that day care reservation, because it's the first reservation they've had that stay care. You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations."
- **Agent Consensus**: All 3 (Alpha-13, Beta-21/22/23, Gamma-13)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY B: Customer Lifecycle Fixes

### B1: Rename "At-Risk" Label to "Lapsed"
- **Priority**: HIGH
- **Type**: UI_FIX
- **What's Wrong**: Card still says **"At-Risk"** (screenshot: "3,940 At-Risk" in red).
- **What It Should Be**: Label must read **"Lapsed"**.
- **User's Exact Quote**: "We have renamed this to lapsed."
- **Agent Consensus**: All 3 (Alpha-15, Beta-25, Gamma-15)
- **Motion Task Explicitly Requested**: No

### B2: Lapsed Value (3,940) Wrong — Omit Old Gingr Records, Use 90-Day Threshold
- **Priority**: CRITICAL
- **Type**: CALCULATION_FIX
- **What's Wrong**: Shows **3,940** which includes very old imported Gingr records. Customer Lifecycle page also shows **0 lapsed**, which is equally wrong.
- **What It Should Be**: "Lapsed" = customers whose last visit was within the last 90 days but who have stopped coming. Anyone with last activity > 90 days ago = "old, dated from Gingr" and EXCLUDED from lapsed count. The 90-day threshold is the new rule.
- **User's Exact Quote**: "This value at risk, or this value of 3,940, is wrong because it needs to omit old records from gingr... It should just be the lapsed ones that are not old. We need to change the logic for lapsed because right now it says zero customers lapsed. That's not right. This resort has been open for almost a decade and we do 600 dogs a week. You're telling me no one's lapsed? Bullshit. I think we set the threshold too low. I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr."
- **Agent Consensus**: All 3 (Alpha-16/17, Beta-26/28/29, Gamma-16/17)
- **Motion Task Explicitly Requested**: No

### B3: Customer Lifecycle Page Also Shows 0 Lapsed (Core Logic Broken)
- **Priority**: CRITICAL
- **Type**: BUG_FIX
- **What's Wrong**: The Customer Lifecycle page itself shows 0 lapsed customers. The underlying classification logic is broken system-wide.
- **What It Should Be**: Fix the core lapsed classification logic so both the dashboard AND Customer Lifecycle page reflect the correct 90-day lapsed customers.
- **User's Exact Quote**: "If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong."
- **Agent Consensus**: All 3 (Alpha-47, Beta-27, Gamma-16)
- **Motion Task Explicitly Requested**: No

### B4: Outreaches (9) Wrong — Counting System-Logged Messages
- **Priority**: HIGH
- **Type**: BUG_FIX
- **What's Wrong**: Shows **9** (screenshot: "9 Outreaches") but user hasn't reached out to anyone.
- **What It Should Be**: Only count **manually initiated** outreaches. Exclude system-logged lifecycle messages.
- **User's Exact Quote**: "It says nine outreaches. I haven't reached out to anybody. Are you counting the system-logged messages and life cycle? You shouldn't be."
- **Agent Consensus**: All 3 (Alpha-18, Beta-30, Gamma-18)
- **Motion Task Explicitly Requested**: No

### B5: Converted (10) — Verify/Explain Calculation
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **10** (screenshot: "10 +67.7% Converted"). User is skeptical.
- **What It Should Be**: Document the calculation methodology and verify it's producing correct results.
- **User's Exact Quote**: "10 converted: okay, I'm curious how the hell you're calculating that."
- **Agent Consensus**: All 3 (Alpha-19/48, Beta-31, Gamma-19)
- **Motion Task Explicitly Requested**: No

### B6: First-Time Spenders (90) Seems Too High — Verify
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **90** (screenshot: "90 First-Time Spenders"). User thinks it's suspiciously high.
- **What It Should Be**: Investigate whether 90 is accurate or inflated by a data/logic error.
- **User's Exact Quote**: "First-time spenders 90: that's really fucking high dude."
- **Agent Consensus**: All 3 (Alpha-20, Beta-32, Gamma-20)
- **Motion Task Explicitly Requested**: No

### B7: Conversion Rate (33.3%) — Verify Calculation
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **33.3%** (screenshot: "33.3% Conversion Rate"). User wants to understand formula.
- **What It Should Be**: Explain the formula and verify the inputs.
- **User's Exact Quote**: "First-time spenders: that's amazing, 33.3 conversion rate. How the fuck are you calculating that?"
- **Agent Consensus**: All 3 (Alpha-21, Beta-33, Gamma-21)
- **Motion Task Explicitly Requested**: No

### B8: Remaining Leads (19) — Must Match Customer Lifecycle
- **Priority**: MEDIUM
- **Type**: VERIFICATION
- **What's Wrong**: Shows **19** (screenshot: "19 +5.0% Remaining Leads"). User won't manually verify.
- **What It Should Be**: Must be a 1:1 match with record count on Customer Lifecycle leads module page.
- **User's Exact Quote**: "Next remaining leads: 19. I am not going to check if this is right but essentially the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle."
- **Agent Consensus**: All 3 (Alpha-14, Beta-24, Gamma-14)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY C: Financial Reporting Fixes

### C1: Transactions (188) Is Wrong
- **Priority**: CRITICAL
- **Type**: BUG_FIX
- **What's Wrong**: Shows **188** (screenshot: "188 +15.3% Transactions"). For 650 dogs/week, far too low.
- **What It Should Be**: Correct count of ALL transactions in the past week.
- **User's Exact Quote**: "Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?"
- **Agent Consensus**: All 3 (Alpha-27, Beta-38, Gamma-26)
- **Motion Task Explicitly Requested**: No

### C2: Rename "Avg Ticket" to "Average Transaction Price"
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Card says **"Avg Ticket"** (screenshot: "$107 +31.8% Avg Ticket").
- **What It Should Be**: Label should read **"Average Transaction Price"**.
- **User's Exact Quote**: "Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price."
- **Agent Consensus**: All 3 (Alpha-29, Beta-40, Gamma-28)
- **Motion Task Explicitly Requested**: No

### C3: Verify Average Transaction Price Calculation
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **$107**. User wants calculation verified. Mentioned twice for emphasis.
- **What It Should Be**: Confirm formula and data inputs are correct.
- **User's Exact Quote**: "Okay and back to the average transaction price: just verify that you're calculating it correctly. Average transaction price: verify that you're calculating it correctly."
- **Agent Consensus**: All 3 (Alpha-30, Beta-41, Gamma-29)
- **Motion Task Explicitly Requested**: No

### C4: Verify RevPAR Calculation
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **$85** (screenshot: "$85 +31.3% Rev/PAR"). Needs verification.
- **What It Should Be**: Confirm formula and data inputs are correct.
- **User's Exact Quote**: "RevPAR: verify that you're calculating it correctly."
- **Agent Consensus**: All 3 (Alpha-31, Beta-42, Gamma-30)
- **Motion Task Explicitly Requested**: No

### C5: Verify Refunds (0) and $ Refunded ($0.00)
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Both show 0/$0.00 (screenshot: "0 Refunds" and "$0.00 $ Refunded"). User doesn't believe this.
- **What It Should Be**: Confirm calculations are correct and data source actually captures refunds.
- **User's Exact Quote**: "Zero refunds: I don't believe this. Please confirm that you're calculating this correctly. The number refunded is zero. I don't believe this either."
- **Agent Consensus**: All 3 (Alpha-32/33, Beta-43/44, Gamma-31/32)
- **Motion Task Explicitly Requested**: No

### C6: Verify Discounted (0) and $ Discounted ($0.00)
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Both show 0/$0.00 (screenshot: "0 Discounted" and "$0.00 $ Discounted"). User doesn't believe this.
- **What It Should Be**: Double-check calculation and data source.
- **User's Exact Quote**: "Zero discounted and zero amount discounted: I don't believe those things. I think you need to double-check those for me."
- **Agent Consensus**: All 3 (Alpha-34, Beta-45/46, Gamma-33)
- **Motion Task Explicitly Requested**: No

### C7: Add Outstanding Invoices Metric
- **Priority**: HIGH
- **Type**: NEW_FEATURE
- **What's Wrong**: Metric does not exist on dashboard.
- **What It Should Be**: Add count of outstanding (unpaid) invoices as a new dashboard metric in Financial Reporting section.
- **User's Exact Quote**: "I just had a thought: the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one. Add that as a motion task."
- **Agent Consensus**: All 3 (Alpha-28, Beta-39, Gamma-27)
- **Motion Task Explicitly Requested**: Yes

---

## CATEGORY D: LTV & Client Count

### D1: Rename "Avg LTV" Label — Consider Just "LTV"
- **Priority**: LOW
- **Type**: UI_FIX
- **What's Wrong**: Card says **"Avg LTV"** (screenshot: "$1719 Avg LTV").
- **What It Should Be**: Rename to **"LTV"** (user leans toward removing "Avg" but expresses some uncertainty).
- **User's Exact Quote**: "Next average LTV: it should just be LTV. It's not an average; it's not just the customer. Maybe that's the way you should put it. I don't know; it just seems off to say LTV or average but maybe you're right."
- **Agent Consensus**: All 3 (Alpha-24, Beta-35, Gamma-23)
- **Motion Task Explicitly Requested**: No

### D2: LTV Value Missing Comma ($1719 → $1,719)
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Displayed as "$1719" without thousands separator (screenshot confirms).
- **What It Should Be**: **$1,719** with comma formatting.
- **User's Exact Quote**: "There's no comma; it's just four digits in a row. There should be a comma."
- **Agent Consensus**: All 3 (Alpha-25, Beta-36, Gamma-24)
- **Motion Task Explicitly Requested**: No

### D3: Total Clients (4,824) May Be Wrong — Expected ~7,000
- **Priority**: HIGH
- **Type**: VERIFICATION
- **What's Wrong**: Shows **4,824** (screenshot: "4,824 Total Clients"). User recalls ~7,000 from initial Gingr pull.
- **What It Should Be**: Investigate the data source, explain the discrepancy, and determine if 4,824 or ~7,000 is correct.
- **User's Exact Quote**: "Total clients: 4,824. I don't know if that's right. I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?"
- **Agent Consensus**: All 3 (Alpha-26, Beta-37, Gamma-25)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY E: Chart/Graph Redesign

### E1: Revenue Graph Colors Too Transparent — Need Solid Fills
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Area charts use transparent/gradient fills that fade toward bottom (visible in screenshot for both Cash Basis Revenue and Accrual Revenue).
- **What It Should Be**: Solid, opaque fill colors that "pop." No gradient, no transparency fade.
- **User's Exact Quote**: "On these graphs I don't like that the colors are so transparent and they're fading out as they go down. These need to be solid colors and really pop. I don't think they pop right now."
- **Agent Consensus**: All 3 (Alpha-38, Beta-51, Gamma-36)
- **Motion Task Explicitly Requested**: No

### E2: X-Axis Should Show All 7 Days in Past Week View
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Only 4 dates shown (screenshot: 3/8, 3/10, 3/12, 3/14).
- **What It Should Be**: All 7 days of the week displayed on X-axis.
- **User's Exact Quote**: "A lot of the time the X axis is not useful. Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7? It's a week. It's not that many data points."
- **Agent Consensus**: All 3 (Alpha-39, Beta-52, Gamma-37)
- **Motion Task Explicitly Requested**: No

### E3: One Data Point Per Day in Past Week View (7 Total)
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Charts have many bumps/valleys suggesting sub-daily or interpolated data points.
- **What It Should Be**: Exactly **7 data points** (one per day) with 7 hover targets. Each X-axis label corresponds to exactly one data point.
- **User's Exact Quote**: "It would also be nice if for each X axis you only had one data point connecting to it. I think that if you hover over the axis there should only be 7... Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?"
- **Agent Consensus**: All 3 (Alpha-40, Beta-53, Gamma-38)
- **Motion Task Explicitly Requested**: No

### E4: Jagged Line Graph with Solid Fill and Dot Markers
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Current charts use smoothed/curved lines with gradient fills.
- **What It Should Be**: For weekly view: 7 data points connected by **straight line segments** (jagged, NOT smoothed/curved), **solid color fill** beneath the line (no gradient), and each X-axis value gets a **subtle vertical line** extending up to its data point with a **larger dot marker** on the data point.
- **User's Exact Quote**: "In my mind I feel like if you're looking at a graph of a week of revenue, you should see seven data points connected via a jagged graph with solid color beneath it, no gradient. Each value on the X-axis, maybe it should have a very subtle vertical line to its data point with a bigger dot on that line."
- **Agent Consensus**: All 3 (Alpha-42, Beta-55/56, Gamma-40)
- **Motion Task Explicitly Requested**: No

### E5: Apply Chart Redesign to BOTH Revenue Charts
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Scope clarification — all chart changes must apply to both charts.
- **What It Should Be**: Both **Cash Basis Revenue** and **Accrual Revenue** charts get the same treatment.
- **User's Exact Quote**: "This applies to both cash basis revenue and accrual revenue."
- **Agent Consensus**: All 3 (Alpha-42, Beta-57, Gamma-40)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY F: UI/UX Polish

### F1: Dashboard Load Time ~20 Seconds
- **Priority**: CRITICAL
- **Type**: UI_FIX
- **What's Wrong**: Dashboard takes approximately 20 seconds to load Past Week view. User acknowledged improvement ("loaded way faster") but still too slow.
- **What It Should Be**: Significantly faster load time (sub-5 seconds ideally).
- **User's Exact Quote**: "First off it took 20 seconds probably to load."
- **Agent Consensus**: All 3 (Alpha-01, Beta-01, Gamma-01)
- **Motion Task Explicitly Requested**: No

### F2: Timeframe Selector Animation Missing/Broken
- **Priority**: HIGH
- **Type**: UI_FIX
- **What's Wrong**: Animation for Today→Past Week transition not appearing because lag swallows it.
- **What It Should Be**: Clean, smooth animation for timeframe selector transition, visible even during data loading.
- **User's Exact Quote**: "There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow."
- **Agent Consensus**: All 3 (Alpha-02, Beta-02, Gamma-02)
- **Motion Task Explicitly Requested**: No

### F3: Attendance & Inventory Buttons Show Dashes, Need Icons
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Attendance and Inventory display em-dashes (—) instead of icons (screenshot confirms: "— Attendance" and "— Inventory").
- **What It Should Be**: Proper icons, consistent with EOD Report, Checkout TV, and Photos which already have icons.
- **User's Exact Quote**: "Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos."
- **Agent Consensus**: All 3 (Alpha-37, Beta-50, Gamma-35)
- **Motion Task Explicitly Requested**: No

### F4: Section Title Says "TODAY'S SNAPSHOT" in Past Week View
- **Priority**: MEDIUM
- **Type**: UI_FIX
- **What's Wrong**: Screenshot shows section header "TODAY'S SNAPSHOT" while "Past Week" is selected in the timeframe selector. The label is contextually wrong.
- **What It Should Be**: Section title should dynamically reflect the selected timeframe (e.g., "PAST WEEK SNAPSHOT" or "WEEKLY SNAPSHOT").
- **User's Exact Quote**: *(Implicit from screenshot — not explicitly stated by user, but the entire feedback assumes Past Week data is showing while the label contradicts this.)*
- **Agent Consensus**: Alpha only (Alpha-45) — **Valid catch from screenshot analysis**
- **Motion Task Explicitly Requested**: No

---

## CATEGORY G: Settings & Refresh

### G1: Data Refresh Not Happening Every 15 Minutes
- **Priority**: HIGH
- **Type**: BUG_FIX
- **What's Wrong**: Dashboard header shows **"Updated 38m ago"** (screenshot confirms "Updated 38m ago"). Previously agreed refresh cadence was 15 minutes.
- **What It Should Be**: Dashboard data refreshes at least every 15 minutes during business hours.
- **User's Exact Quote**: "You see how it says 'updated 38 minutes ago'? I thought we agreed we were going to update this stuff every 15 minutes."
- **Agent Consensus**: All 3 (Alpha-03, Beta-03, Gamma-03)
- **Motion Task Explicitly Requested**: No

### G2: Make Refresh Interval Configurable in Settings
- **Priority**: HIGH
- **Type**: NEW_FEATURE
- **What's Wrong**: No configurable refresh setting exists.
- **What It Should Be**: Settings page with configurable refresh interval. Default: every 15 minutes during business hours. User said "Make that a configurable thing in settings" — this is definitive, not a suggestion.
- **User's Exact Quote**: "Now I think we should update it every 15 minutes during business hours, which could be a configurable thing in settings. You know what it definitely should be. Make that a configurable thing in settings."
- **Agent Consensus**: All 3 (Alpha-04, Beta-04, Gamma-03)
- **Motion Task Explicitly Requested**: No

### G3: Reduce/Disable Refresh Outside Business Hours
- **Priority**: MEDIUM
- **Type**: NEW_FEATURE
- **What's Wrong**: Dashboard may be refreshing 24/7, wasting API calls when no employees are present.
- **What It Should Be**: Pause or reduce Gingr polling outside business hours to save API usage. Business hours toggle in settings.
- **User's Exact Quote**: "It probably shouldn't refresh at all outside of business hours. That's a way to keep down our API usage. We don't need to go nuts overnight."
- **Agent Consensus**: All 3 (Alpha-05, Beta-05, Gamma-03)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY H: Spec/Design Decisions (User to Define)

### H1: Revenue Split Concept Needs Spec
- **Priority**: MEDIUM
- **Type**: SPEC_NEEDED
- **What's Wrong**: Revenue Split feature (screenshot: "REVENUE SPLIT — 80% Board / 20% Day") exists but is incomplete.
- **What It Should Be**: User to spec out the revenue split concept in a separate session.
- **User's Exact Quote**: "This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept."
- **Agent Consensus**: All 3 (Alpha-43, Beta-58, Gamma-41)
- **Motion Task Explicitly Requested**: Yes

### H2: Timeframe Effect on Checklists/Services Needs Spec
- **Priority**: MEDIUM
- **Type**: SPEC_NEEDED
- **What's Wrong**: How different timeframes affect the checklists and services sections is nuanced and undefined.
- **What It Should Be**: User to explain/spec in a separate session. Do not prioritize now.
- **User's Exact Quote**: "actually, first off, the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now so create a motion task for me to do that."
- **Agent Consensus**: All 3 (Alpha-36, Beta-49, Gamma-34)
- **Motion Task Explicitly Requested**: Yes

### H3: Consider Smoothed Average Line Overlay (Gray)
- **Priority**: LOW
- **Type**: SPEC_NEEDED
- **What's Wrong**: Current charts use smoothed/rounded lines. User suggests possibly adding a separate smoothed trend line.
- **What It Should Be**: Possibly add a gray smoothed trend line showing rolling averages overlaid on the raw jagged data. User is uncertain — this is an idea, not a firm requirement.
- **User's Exact Quote**: "Maybe you should have a smoothed-out line that shows the averages in gray or something. That's kind of what we're doing now with these graphs."
- **Agent Consensus**: All 3 (Alpha-41, Beta-54, Gamma-39)
- **Motion Task Explicitly Requested**: No

### H4: Off-Hours Refresh Strategy Needs Product Decision
- **Priority**: MEDIUM
- **Type**: SPEC_NEEDED
- **What's Wrong**: Open question about whether Gingr should be polled overnight. Ignite webhooks still update passively, but active Gingr polling may be unnecessary when no employees are present.
- **What It Should Be**: Product/technical decision on after-hours sync behavior.
- **User's Exact Quote**: "Well I guess we do because Ignite webhooks will update, but do we need to be querying Gingr for reservation updates if no employees are in the building to make any updates? I don't know. That's something worth thinking about."
- **Agent Consensus**: All 3 (Alpha-05, Beta-06, Gamma-04)
- **Motion Task Explicitly Requested**: No

---

## CATEGORY I: User QA Tasks

### I1: Test EOD Report
- **Priority**: MEDIUM
- **Type**: USER_QA
- **What's Wrong**: User has not yet tested the EOD Report feature.
- **What It Should Be**: User to click and test; log as Motion task.
- **User's Exact Quote**: "I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me."
- **Agent Consensus**: All 3 (Alpha-49, Beta-34, Gamma-22)
- **Motion Task Explicitly Requested**: Yes

### I2: Test Checkout TV
- **Priority**: MEDIUM
- **Type**: USER_QA
- **What's Wrong**: User has not tested Checkout TV.
- **What It Should Be**: User to click and test; log as Motion task.
- **User's Exact Quote**: "Though I have not clicked it and tested it yet... Maybe you can log those as motion tasks for me."
- **Agent Consensus**: All 3
- **Motion Task Explicitly Requested**: Yes

### I3: Test Photos
- **Priority**: MEDIUM
- **Type**: USER_QA
- **What's Wrong**: User has not tested Photos.
- **What It Should Be**: User to click and test; log as Motion task.
- **User's Exact Quote**: "Though I have not clicked it and tested it yet... Maybe you can log those as motion tasks for me."
- **Agent Consensus**: All 3
- **Motion Task Explicitly Requested**: Yes

### I4: Test Cash Tips
- **Priority**: MEDIUM
- **Type**: USER_QA
- **What's Wrong**: User has not tested Cash Tips.
- **What It Should Be**: User to click and test; log as Motion task.
- **User's Exact Quote**: "Though I have not clicked it and tested it yet... Maybe you can log those as motion tasks for me."
- **Agent Consensus**: All 3
- **Motion Task Explicitly Requested**: Yes

### I5: Test Checkout Notes
- **Priority**: MEDIUM
- **Type**: USER_QA
- **What's Wrong**: User has not tested Checkout Notes.
- **What It Should Be**: User to click and test; log as Motion task.
- **User's Exact Quote**: "Though I have not clicked it and tested it yet... Maybe you can log those as motion tasks for me."
- **Agent Consensus**: All 3
- **Motion Task Explicitly Requested**: Yes

---

## CATEGORY J: Data Consistency

### J1: Services Page Data Must Match Operations Hub
- **Priority**: HIGH
- **Type**: BUG_FIX
- **What's Wrong**: Service data shown on dashboard right sidebar does not match Operations Hub. User has raised this before. Screenshot shows: Baths 0/0, Pamper 0/0, Ice Cream 0/0, Back-End 0% 0/10 tasks, Front-End 0% 0/7 tasks, Room Clean 0% 0/50 rooms, Private Play 0/11, Closing 0% 0/11 tasks.
- **What It Should Be**: 1:1 data parity between dashboard Services/Checklists section and Operations Hub.
- **User's Exact Quote**: "Next I've told you this before but the data on the Services page needs to match what we actually see in Operations Hub."
- **Agent Consensus**: All 3 (Alpha-35, Beta-47, Gamma-34)
- **Motion Task Explicitly Requested**: No

### J2: Baths Shows "0 of 0" — Clearly Wrong
- **Priority**: HIGH
- **Type**: BUG_FIX
- **What's Wrong**: Baths shows **0/0** (screenshot confirms "Baths 0/0"). Cannot be correct.
- **What It Should Be**: Correct bath count sourced from Operations Hub data.
- **User's Exact Quote**: "That Baths figure, 0 of 0..."
- **Agent Consensus**: All 3 (Alpha-44, Beta-48, Gamma-34)
- **Motion Task Explicitly Requested**: No

---

## MOTION TASKS SUMMARY (User Explicitly Requested)

These items MUST be created as Motion tasks:

| # | Motion Task | Motion Project | Category |
|---|-------------|---------------|----------|
| 1 | User to test EOD Report | KOL Issues | I1 |
| 2 | User to test Checkout TV | KOL Issues | I2 |
| 3 | User to test Photos | KOL Issues | I3 |
| 4 | User to test Cash Tips | KOL Issues | I4 |
| 5 | User to test Checkout Notes | KOL Issues | I5 |
| 6 | Add Outstanding Invoices metric to dashboard | KOL Enhancements | C7 |
| 7 | User to spec out Revenue Split concept | KOL Enhancements | H1 |
| 8 | User to spec how timeframes affect checklists/services | KOL Enhancements | H2 |

---

## COPY-PASTE PROMPTS FOR PERPLEXITY COMPUTER SESSIONS

---

### PROMPT: Category A — Snapshot Metrics (Data + Calculation Fixes)

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix ALL snapshot metric calculations for the Past Week view.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Gingr API: your-gingr-subdomain.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — main dashboard UI
- src/hooks/useDashboardMetrics.js (186 lines) — metric computation hook
- supabase/migrations/20260316_dashboard_metrics.sql (258 lines) — DB functions
- src/shared/metricsHelpers.js (465 lines) — metric helper functions
- DB table: dashboard_metrics_daily, RPC: compute_dashboard_metrics()

## FIXES REQUIRED (8 items, all for Past Week view):

### 1. CRITICAL: Expected value shows 50 — should be raw aggregate
The "Expected" card shows 50 for Past Week. This should be the raw count of ALL dogs scheduled to check in during the past 7 days. Not a daily average, not a snapshot of one day. The resort does ~600 dogs/week, so 50 is wildly wrong.
- Look at how the SQL/RPC computes "expected" for weekly timeframes
- Change it to SUM all scheduled check-ins across all 7 days

### 2. CRITICAL: In-House value shows 40 — should be raw aggregate
The "In House" card shows 40 for Past Week. This should be the raw count of ALL dogs that actually checked in during the past 7 days.
- The difference (Expected - In House) = cancellations, which the user wants to see

### 3. HIGH: In-House/Expected must EXCLUDE tours
The user said: "that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that."
- Include all dog types (boarding, daycare, etc.) EXCEPT tours
- Tours should be filtered out of the Expected and In-House counts

### 4. CRITICAL: Occupancy shows 143% — wrong formula
The occupancy calculation is completely wrong. Correct formula:
- Numerator: total room-nights occupied by BOARDING OVERNIGHT DOGS ONLY in the past week
- Denominator: total overnight rooms available × 7 days
- ONLY overnight boarding dogs in numerator — NOT daycare, NOT tours
- The denominator needs to use the resort's configured room count (check if this is stored in settings or hardcoded)

### 5. CRITICAL: Bookings shows 10 — wrong date field
Bookings should count reservations by their CREATED DATE, not check-in date.
- Look at which date field the query uses
- Change to reservation_created_date (or equivalent field in Gingr data)
- Count: how many reservations were CREATED in the past week

### 6. HIGH: Tours shows 0 — data missing
Tours card shows 0 which is incorrect. Tours are happening.
- Investigate the tour query/data source
- Fix whatever is causing tours to not be counted

### 7. HIGH: Evals shows 1 — needs programmatic first-visit detection
The evals count is wrong. Two detection methods needed:
(a) Count explicit evaluation appointments/reservations in Gingr (type = "evaluate" or "evaluation")
(b) Programmatically detect a dog's FIRST-EVER reservation. If a dog has never been to the resort before, their first daycare reservation IS an evaluation. "You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations."
- Combine both methods for the total eval count

### 8. MEDIUM: Going Home → Canceled in Past Week view
In Past Week view, replace the "Going Home" card with "Canceled":
- Canceled value = Expected - In House (simple subtraction)
- Add animation: red bar crosses out "Going Home" text, replaces with "Canceled", value animates in
- This animation should trigger when user switches from Today to Past Week
- "There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in."

## IMPORTANT RULES
- Test all changes with the Past Week timeframe
- Commit and push to main when done
- Use descriptive commit messages
- Do NOT break Today view — these changes are for weekly aggregate logic
```

---

### PROMPT: Category B — Customer Lifecycle Fixes

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix ALL Customer Lifecycle metrics.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Gingr API: your-gingr-subdomain.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — dashboard UI, "CUSTOMER LIFECYCLE" section
- src/hooks/useDashboardMetrics.js (186 lines) — metric computation
- supabase/migrations/20260316_dashboard_metrics.sql (258 lines) — DB functions
- supabase/migrations/20260315_lite_client_lifecycle.sql — lifecycle logic
- src/shared/metricsHelpers.js (465 lines)
- DB table: dashboard_metrics_daily, RPC: compute_dashboard_metrics()

## FIXES REQUIRED (8 items):

### 1. HIGH: Rename "At-Risk" label to "Lapsed"
The dashboard card currently says "At-Risk" showing 3,940. Change the label to "Lapsed" everywhere it appears:
- In DashboardPage.jsx
- In any metric helper that references "at-risk" or "atRisk"
- User said: "We have renamed this to lapsed."

### 2. CRITICAL: Fix Lapsed value (3,940) — Omit old Gingr records + 90-day threshold
The 3,940 figure is inflated because it includes very old records imported from Gingr. The new business rule:
- "Lapsed" = customers whose last visit was within the last 90 days but who have stopped coming
- Anyone with last activity > 90 days ago = classified as "old, dated from Gingr" and EXCLUDED from lapsed count
- The threshold was set too low — change to 90 days
- User said: "I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr."

### 3. CRITICAL: Fix Customer Lifecycle page (also shows 0 lapsed)
The Customer Lifecycle page itself shows 0 lapsed customers. This means the CORE lapsed classification logic is broken system-wide:
- Fix the lapsed detection in the lifecycle SQL/logic (likely in 20260315_lite_client_lifecycle.sql or related)
- Both the dashboard card AND the Customer Lifecycle page must show the corrected lapsed count
- User said: "If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong."

### 4. HIGH: Fix Outreaches (9) — excluding system-logged messages
Outreaches shows 9 but the user hasn't reached out to anyone. The system is counting system-logged lifecycle messages as outreaches.
- Only count MANUALLY INITIATED outreaches
- Exclude any system-logged or automated messages
- User said: "Are you counting the system-logged messages and life cycle? You shouldn't be."

### 5. HIGH: Verify Converted (10) — explain calculation
The user is skeptical of the Converted count of 10. Tasks:
- Document how "Converted" is being calculated
- Add a code comment explaining the formula
- Verify the number is correct by cross-referencing the data
- If incorrect, fix it
- User said: "10 converted: okay, I'm curious how the hell you're calculating that."

### 6. HIGH: Verify First-Time Spenders (90) — seems too high
The user thinks 90 first-time spenders in a week is suspiciously high.
- Investigate the data source and logic
- Determine if 90 is accurate or inflated by a data error
- If incorrect, fix the calculation
- User said: "First-time spenders 90: that's really fucking high dude."

### 7. HIGH: Verify Conversion Rate (33.3%) — explain calculation
The user wants to understand how the 33.3% conversion rate is calculated.
- Document the formula
- Verify the inputs
- If incorrect, fix it
- User said: "33.3 conversion rate. How the fuck are you calculating that?"

### 8. MEDIUM: Verify Remaining Leads (19) matches Customer Lifecycle
Remaining Leads shows 19. This MUST be a 1:1 match with the record count on the Customer Lifecycle page's Leads module.
- Navigate to the Customer Lifecycle page, check the Leads count
- If they don't match, that's a bug — fix it
- User said: "the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle."

## IMPORTANT RULES
- The lapsed logic fix (items 2+3) is the highest priority and affects multiple pages
- Commit and push to main when done
- Use descriptive commit messages
```

---

### PROMPT: Category C — Financial Reporting Fixes

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix ALL Financial Reporting metrics.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Gingr API: your-gingr-subdomain.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — "FINANCIAL REPORTING" section
- src/hooks/useDashboardMetrics.js (186 lines)
- supabase/migrations/20260316_dashboard_metrics.sql (258 lines)
- src/shared/metricsHelpers.js (465 lines)

## FIXES REQUIRED (7 items):

### 1. CRITICAL: Transactions (188) is wrong
The Financial Reporting section shows 188 transactions for Past Week. The resort does ~650 dogs/week, so there should be far more transactions.
- Investigate the transaction query/data source
- Determine why it's underreporting
- Fix to show correct transaction count
- User said: "Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?"

### 2. MEDIUM: Rename "Avg Ticket" to "Average Transaction Price"
The card currently labeled "Avg Ticket" (showing $107) should be renamed.
- Change label in DashboardPage.jsx from "Avg Ticket" to "Average Transaction Price"
- User said: "Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price."

### 3. HIGH: Verify Average Transaction Price calculation ($107)
The user wants the $107 average transaction price verified. Mentioned TWICE for emphasis.
- Trace the calculation in the code
- Verify formula: should be total revenue / total transactions
- Add a code comment documenting the formula
- User said: "just verify that you're calculating it correctly. Average transaction price: verify that you're calculating it correctly."

### 4. HIGH: Verify RevPAR calculation ($85)
RevPAR shows $85. Verify correctness.
- Standard RevPAR = Total Revenue / Total Available Rooms (for the period)
- Check if denominator uses correct room count × days
- Add a code comment documenting the formula
- User said: "RevPAR: verify that you're calculating it correctly."

### 5. HIGH: Verify Refunds (0) and $ Refunded ($0.00)
Both refund metrics show 0/$0.00. User doesn't believe this.
- Check the data source for refunds
- Verify the query is correctly identifying refund transactions
- If the data source isn't capturing refunds, fix it
- User said: "Zero refunds: I don't believe this. Please confirm that you're calculating this correctly. The number refunded is zero. I don't believe this either."

### 6. HIGH: Verify Discounted (0) and $ Discounted ($0.00)
Both discount metrics show 0/$0.00. User doesn't believe this.
- Check the data source for discounts
- Verify the query is correctly identifying discounted transactions
- User said: "Zero discounted and zero amount discounted: I don't believe those things. I think you need to double-check those for me."

### 7. HIGH: Add Outstanding Invoices metric (NEW)
Add the number of outstanding (unpaid) invoices as a new metric in the Financial Reporting section.
- Query Gingr API or Supabase for unpaid invoices
- Add a new card to the Financial Reporting section
- Display count of outstanding invoices
- User said: "the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one."
- THIS IS ALSO A MOTION TASK — create a Motion task for this using the Motion API:
  - Motion API Key: tpRlezi0Eix03Neo7P/u0YruPGDdUsz5xIsAuryLrKg=
  - Project: KOL Enhancements (pr_JxYY79xj6qqRmznydieygx)
  - Task name: "Add Outstanding Invoices metric to dashboard"

## IMPORTANT RULES
- For verification items (3-6): if the calculation IS correct, document it with a code comment. If it's WRONG, fix it.
- Commit and push to main when done
- Use descriptive commit messages
```

---

### PROMPT: Category D — LTV & Client Count

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix the LTV display and investigate the Total Clients count.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Gingr API: your-gingr-subdomain.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — LTV and Total Clients cards
- src/hooks/useDashboardMetrics.js (186 lines)
- src/shared/metricsHelpers.js (465 lines)

## FIXES REQUIRED (3 items):

### 1. LOW: Rename "Avg LTV" label to "LTV"
The card currently says "Avg LTV" ($1719). The user wants to remove "Avg":
- Change label from "Avg LTV" to just "LTV"
- The user was slightly uncertain but leaned toward removing "Avg": "it should just be LTV. It's not an average; it's not just the customer."

### 2. MEDIUM: Add comma formatting to LTV value ($1719 → $1,719)
The LTV value displays as "$1719" without a thousands separator.
- Add proper number formatting with commas
- Ensure this formatting applies to all monetary values in the same display style
- User said: "There's no comma; it's just four digits in a row. There should be a comma."
- Check if other monetary values on the dashboard also need comma formatting

### 3. HIGH: Investigate Total Clients (4,824) — expected ~7,000
Total Clients shows 4,824 but the user remembers ~7,000 customers from the initial Gingr import.
- Trace where "Total Clients" is sourced from
- Query the customer_lifecycle or clients table to get the actual count
- Compare with Gingr API customer count if possible
- Document why the number is what it is
- If the query is filtering out records it shouldn't, fix it
- User said: "I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?"

## IMPORTANT RULES
- Commit and push to main when done
- Use descriptive commit messages
```

---

### PROMPT: Category E — Chart/Graph Redesign

```
You are a senior front-end developer working on the K9 Operations dashboard. Your task is to redesign BOTH revenue charts (Cash Basis Revenue and Accrual Revenue).

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — chart rendering
- src/shared/InteractiveLineChart.jsx (147 lines) — the chart component
- src/hooks/useDashboardMetrics.js (186 lines) — data feeding the charts

## CHART REDESIGN REQUIREMENTS (all apply to BOTH Cash Basis Revenue AND Accrual Revenue):

### 1. Solid fill colors — no gradient/transparency
Current state: Area charts use transparent/gradient fills that fade toward the bottom.
Required: Solid, opaque fill colors that "pop." No gradient, no transparency fade.
User said: "These need to be solid colors and really pop. I don't think they pop right now."

### 2. X-axis must show all 7 days in Past Week view
Current state: Only 4 dates shown (3/8, 3/10, 3/12, 3/14).
Required: All 7 days of the week displayed on X-axis.
User said: "Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7?"

### 3. Exactly one data point per day (7 total for Past Week)
Current state: Charts have many bumps/valleys suggesting sub-daily or interpolated data.
Required: Exactly 7 data points in the Past Week view — one per day. Only 7 hover targets when hovering.
User said: "should there only be 7 data points at that stage to be completely accurate? ...Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?"

### 4. Jagged line (straight segments, NOT smoothed/curved)
Current state: Charts use smoothed/curved lines (spline interpolation).
Required: Connect the 7 data points with STRAIGHT line segments, creating a "jagged" appearance.
User said: "you should see seven data points connected via a jagged graph"

### 5. Subtle vertical guide lines from X-axis to data points
Required: Each X-axis value should have a very subtle vertical line extending from the X-axis up to its data point.
User said: "Each value on the X-axis, maybe it should have a very subtle vertical line to its data point"

### 6. Larger dot markers on data points
Required: Each data point should have a larger, visible dot marker at the intersection of the vertical guide and the data line.
User said: "with a bigger dot on that line"

### Summary of desired chart appearance:
- 7 data points (one per day)
- Connected by straight (jagged) line segments
- Solid color fill beneath the line (no gradient)
- All 7 days labeled on X-axis
- Subtle vertical guide lines from each X-axis label up to data point
- Larger dot markers on each data point
- This applies to BOTH cash basis revenue AND accrual revenue charts

## IMPORTANT RULES
- Modify InteractiveLineChart.jsx to support these chart options
- Update DashboardPage.jsx to pass the correct config
- Make sure the chart behavior is timeframe-aware (7 points for week, different for other timeframes)
- Commit and push to main when done
```

---

### PROMPT: Category F — UI/UX Polish

```
You are a senior front-end developer working on the K9 Operations dashboard. Your task is to fix several UI/UX polish items.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — main dashboard
- src/shared/dashboardCache.js (38 lines) — caching logic
- src/hooks/useDashboardMetrics.js (186 lines) — data loading
- src/shared/K9LoadingAnimation.jsx — loading states
- src/shared/icons.jsx — icon definitions

## FIXES REQUIRED (4 items):

### 1. CRITICAL: Dashboard load time ~20 seconds
The dashboard takes approximately 20 seconds to load the Past Week view. The user acknowledged it's "way faster" than before, but 20 seconds is still too slow.
- Profile what's slow (API calls? Rendering? DB queries?)
- Implement caching improvements, lazy loading, or query optimization
- Consider loading skeleton states while data fetches
- Target: sub-5 second load time
- User said: "First off it took 20 seconds probably to load."

### 2. HIGH: Timeframe selector animation missing/broken by lag
When switching from Today to Past Week, there should be a clean, smooth animation on the selector. Currently the lag swallows the animation.
- The animation may already exist in code but be invisible due to rendering lag
- Decouple the animation from data loading — animation should play immediately, data loads in background
- User said: "There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow."

### 3. MEDIUM: Attendance & Inventory buttons need icons (not dashes)
The Attendance and Inventory buttons currently show em-dashes (—) where icons should be. EOD Report, Checkout TV, and Photos already have proper icons.
- Find or create appropriate icons for Attendance and Inventory
- Check src/shared/icons.jsx for existing icon patterns
- Match the style of the other Daily Task icons
- User said: "Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos."

### 4. MEDIUM: Section title says "TODAY'S SNAPSHOT" in Past Week view
When the timeframe selector is set to "Past Week," the section header still reads "TODAY'S SNAPSHOT." This is misleading.
- Make the section title dynamic based on selected timeframe
- Examples: "TODAY'S SNAPSHOT" for Today, "PAST WEEK SNAPSHOT" for Past Week, "MTD SNAPSHOT" for MTD, etc.
- Check how the timeframe value is stored and use it to generate the title

## IMPORTANT RULES
- Load time improvement is the most critical item here
- Commit and push to main when done
- Use descriptive commit messages
```

---

### PROMPT: Category G — Settings & Refresh

```
You are a senior full-stack developer working on the K9 Operations dashboard. Your task is to fix the data refresh behavior and add configurable settings.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — shows "Updated Xm ago"
- src/shared/dashboardCache.js (38 lines) — caching/refresh logic
- src/hooks/useDashboardMetrics.js (186 lines) — data fetching
- src/kol/pages/SettingsPage.jsx — settings UI
- src/kol/settings/ — settings tab components

## FIXES REQUIRED (3 items):

### 1. HIGH: Data refresh not happening every 15 minutes
The dashboard header shows "Updated 38m ago" — the agreed refresh cadence was 15 minutes.
- Find the refresh interval configuration
- Set it to 15 minutes during business hours
- Ensure the cron job / polling mechanism actually fires every 15 minutes
- User said: "I thought we agreed we were going to update this stuff every 15 minutes."

### 2. HIGH: Make refresh interval configurable in Settings
Add a new setting on the Settings page to configure the dashboard refresh interval.
- Default: 15 minutes
- Add a UI control (dropdown or input) on SettingsPage.jsx
- Store the value in Supabase (location_settings or similar table)
- Read the configured value in the dashboard refresh logic
- User said: "Make that a configurable thing in settings." — this is a definitive requirement.

### 3. MEDIUM: Add business hours toggle for refresh behavior
Add a setting to define business hours and disable/reduce refresh outside those hours.
- Add business hours start/end time inputs to Settings
- When outside business hours, either stop Gingr polling entirely or reduce to a much lower frequency
- The purpose is to reduce API usage when no employees are in the building
- Ignite webhooks will still update passively, but active Gingr polling should pause
- User said: "It probably shouldn't refresh at all outside of business hours. That's a way to keep down our API usage."

## IMPORTANT RULES
- Commit and push to main when done
- Use descriptive commit messages
```

---

### PROMPT: Category H — Spec/Design Decisions (Motion Tasks)

```
You are a project manager working on K9 Operations. Your task is to create Motion tasks for items that need the user's input/specification before development can proceed.

## Credentials
- Motion API Key: tpRlezi0Eix03Neo7P/u0YruPGDdUsz5xIsAuryLrKg=
- Motion Projects:
  - KOL Issues: pr_aNwszsxUw7svtLMPQmsnr1
  - KOL Enhancements: pr_JxYY79xj6qqRmznydieygx

## MOTION TASKS TO CREATE:

### 1. Revenue Split Concept Needs Spec (KOL Enhancements)
Create a Motion task:
- Name: "Spec out Revenue Split concept for dashboard"
- Description: "The Revenue Split feature (currently showing 80% Board / 20% Day on dashboard) needs further development and specification. User wants to define how this should work before any coding begins. User quote: 'This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept.'"
- Project: KOL Enhancements (pr_JxYY79xj6qqRmznydieygx)
- Priority: MEDIUM

### 2. Timeframe Effect on Checklists/Services (KOL Enhancements)
Create a Motion task:
- Name: "Spec how timeframes affect checklists and services sections"
- Description: "The way different timeframes (Today, Past Week, MTD, etc.) affect the checklists and services sections on the dashboard is nuanced. User needs to explain the desired behavior before development. User quote: 'the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now.'"
- Project: KOL Enhancements (pr_JxYY79xj6qqRmznydieygx)
- Priority: MEDIUM

### 3. (Optional/LOW) Consider smoothed average line overlay
This is NOT a Motion task — just a note for future consideration:
- User suggested possibly adding a gray smoothed trend line showing rolling averages on the revenue charts
- This is an idea, not a firm requirement: "Maybe you should have a smoothed-out line that shows the averages in gray or something."
- No Motion task needed unless user wants to revisit

### 4. (Optional/MEDIUM) Off-hours refresh strategy
This is NOT a Motion task — it's an open technical question:
- Should Gingr be polled overnight when Ignite webhooks still update?
- User said: "That's something worth thinking about."
- This can be decided during the Category G implementation

## Use the Motion API to create tasks 1 and 2. Tasks 3 and 4 are informational notes only.
```

---

### PROMPT: Category I — User QA Tasks (Motion Tasks)

```
You are a project manager working on K9 Operations. Your task is to create Motion tasks for the user's manual QA testing.

## Credentials
- Motion API Key: tpRlezi0Eix03Neo7P/u0YruPGDdUsz5xIsAuryLrKg=
- Motion Projects:
  - KOL Issues: pr_aNwszsxUw7svtLMPQmsnr1

## MOTION TASKS TO CREATE (all in KOL Issues project):

The user explicitly said: "Maybe you can log those as motion tasks for me."

### 1. Test EOD Report
- Name: "QA: Test EOD Report daily task on dashboard"
- Description: "Click and test the EOD Report button in the Daily Tasks section of the dashboard. Verify it works correctly. User has not yet tested this feature."
- Project: KOL Issues (pr_aNwszsxUw7svtLMPQmsnr1)
- Priority: MEDIUM

### 2. Test Checkout TV
- Name: "QA: Test Checkout TV daily task on dashboard"
- Description: "Click and test the Checkout TV button in the Daily Tasks section. Verify it works correctly."
- Project: KOL Issues (pr_aNwszsxUw7svtLMPQmsnr1)
- Priority: MEDIUM

### 3. Test Photos
- Name: "QA: Test Photos daily task on dashboard"
- Description: "Click and test the Photos button in the Daily Tasks section. Verify it works correctly."
- Project: KOL Issues (pr_aNwszsxUw7svtLMPQmsnr1)
- Priority: MEDIUM

### 4. Test Cash Tips
- Name: "QA: Test Cash Tips daily task on dashboard"
- Description: "Click and test the Cash Tips button in the Daily Tasks section. Verify it works correctly."
- Project: KOL Issues (pr_aNwszsxUw7svtLMPQmsnr1)
- Priority: MEDIUM

### 5. Test Checkout Notes
- Name: "QA: Test Checkout Notes daily task on dashboard"
- Description: "Click and test the Checkout Notes button in the Daily Tasks section. Verify it works correctly."
- Project: KOL Issues (pr_aNwszsxUw7svtLMPQmsnr1)
- Priority: MEDIUM

## Use the Motion API to create all 5 tasks.
```

---

### PROMPT: Category J — Data Consistency

```
You are a senior full-stack developer working on K9 Operations. Your task is to fix the data consistency between the dashboard Services/Checklists sidebar and the Operations Hub.

## Environment & Credentials
- Repo: /<path>/workspace/k9-repo/ (already cloned)
- Branch: main
- GitHub: SkyleraryBrooks/k9-operations
- GitHub PAT: [REDACTED GITHUB PAT]
- Git config: email=zack.nisbet@k9operations.com, name="Skyler Brooks"
- Supabase project ref: YOUR_SUPABASE_PROJECT_REF
- Supabase service_role key: [REDACTED SUPABASE SERVICE_ROLE JWT]
- location_id: 11111111-1111-1111-1111-111111111111
- Gingr API: your-gingr-subdomain.gingrapp.com/api/v1, key=[REDACTED GINGR API KEY]
- Product name: "K9 Operations" (never K-9 or k9)

## Key Files
- src/kol/pages/DashboardPage.jsx (1146 lines) — right sidebar with Services/Checklists
- src/kol/pages/OperationsHub.jsx — the Operations Hub page (source of truth)
- src/shared/opsHelpers.js — operations helper functions
- src/hooks/useDashboardMetrics.js (186 lines)

## FIXES REQUIRED (2 items):

### 1. HIGH: Services page data must match Operations Hub
The dashboard's right sidebar shows service/checklist data that doesn't match what appears in the Operations Hub. The user has raised this before.

Current dashboard sidebar values (from screenshot):
- CHECKLISTS: Opening 0% 0/10 tasks, Front-End 0% 0/7 tasks, Back-End 0% 0/10 tasks, Room Clean 0% 0/50 rooms, Closing 0% 0/11 tasks
- SERVICES: Baths 0/0, Pamper 0/0, Ice Cream 0/0, Private Play 0/11
- OTHER: Attendance (dash), Inventory (dash), Test Health 172 100% pass

Tasks:
- Compare the data sources used by the dashboard sidebar vs. Operations Hub
- Ensure they use the exact same queries/data
- Fix any discrepancies so the numbers match 1:1
- User said: "the data on the Services page needs to match what we actually see in Operations Hub."

### 2. HIGH: Baths shows "0 of 0" — clearly wrong
The Baths metric specifically shows 0/0, which cannot be correct for an active resort.
- Trace where Baths data comes from
- Compare with Operations Hub's Baths data
- Fix the data source/query
- User said: "That Baths figure, 0 of 0..."

## IMPORTANT NOTE
The user also mentioned that how timeframes affect checklists/services is "nuanced" and wants to spec it separately (this is a Motion task in Category H). For NOW, just ensure the data matches Operations Hub for the CURRENT timeframe. Don't worry about multi-timeframe behavior yet.

## IMPORTANT RULES
- Commit and push to main when done
- Use descriptive commit messages
```

---

## EXECUTION ORDER RECOMMENDATION

| Order | Category | Effort | Dependencies |
|-------|----------|--------|--------------|
| 1 | **H (Spec tasks)** + **I (QA tasks)** | Low — just create Motion tasks | None |
| 2 | **B (Customer Lifecycle)** | High — lapsed logic is core, affects A | None (but start early) |
| 3 | **A (Snapshot Metrics)** | High — most critical fixes | Benefits from B's lapsed fix |
| 4 | **C (Financial Reporting)** | Medium — verification + new metric | None |
| 5 | **D (LTV & Clients)** | Low — mostly UI + 1 investigation | None |
| 6 | **G (Settings & Refresh)** | Medium — new feature + fix | None |
| 7 | **J (Data Consistency)** | Medium — requires Ops Hub comparison | None |
| 8 | **E (Chart Redesign)** | Medium — front-end only | None |
| 9 | **F (UI/UX Polish)** | High — load time is hardest | Benefits from A, B, C optimizations |

Categories H+I, B, A, C, and D can be run as parallel Perplexity Computer sessions. E, F, G, J can run in parallel as a second wave.

---

## PRIORITY SUMMARY

| Priority | Count | Items |
|----------|-------|-------|
| **CRITICAL** | 8 | A1, A2, A5, A6, B2, B3, C1, F1 |
| **HIGH** | 19 | A3, A7, A8, B1, B4, B5, B6, B7, C3, C4, C5, C6, C7, D3, F2, G1, G2, J1, J2 |
| **MEDIUM** | 20 | A4, B8, C2, D2, E1-E5, F3, F4, G3, H1, H2, H4, I1-I5 |
| **LOW** | 3 | B9, D1, H3 |

**Total: 50 canonical issues across 10 categories.**

---

*End of Final Action Plan — Committee Reconciliation Complete*
*Chair: Committee Chair | Date: March 15, 2026*
