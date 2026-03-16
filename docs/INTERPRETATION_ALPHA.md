# INTERPRETATION_ALPHA — Agent Alpha's Exhaustive Feedback Extraction

**Agent**: Alpha
**Date**: March 15, 2026
**Source**: User verbatim feedback on K9 Operations Dashboard ("Past Week" view)
**Screenshot**: /<path>/workspace/image.jpg
**Methodology**: Feedback read 5 times; every discrete issue, request, enhancement, question, and aside extracted and numbered sequentially.

---

## Summary Counts

| Category            | Count | Items |
|---------------------|-------|-------|
| DATA_BUG            | 12    | 03, 06, 07, 11, 12, 16, 18, 26, 27, 35, 44, 47 |
| CALCULATION_FIX     | 7     | 08, 10, 13, 17, 32, 33, 34 |
| UI_FIX              | 10    | 01, 02, 15, 24, 25, 29, 37, 38, 39, 45 |
| NEW_FEATURE         | 6     | 04, 05, 09, 28, 40, 42 |
| SPEC_NEEDED         | 5     | 36, 41, 43, 46, 48 |
| VERIFICATION_NEEDED | 9     | 14, 19, 20, 21, 22, 30, 31, 51, 52 |
| USER_TODO           | 4     | 23, 49, 50, 53 |
| **TOTAL**           | **53** |

---

### ITEM-01: Dashboard Load Time Is ~20 Seconds
- **Category**: UI_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: Despite acknowledged improvement, the dashboard still takes approximately 20 seconds to load when switching to the "Past Week" view. This is unacceptably slow and likely the root cause of ITEM-02.
- **User's Exact Words**: "First off it took 20 seconds probably to load."

---

### ITEM-02: Time-Range Selector Animation Missing / Laggy
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user previously described a clean animation for the time-range selector transitioning from "Today" to "Past Week." The animation is not appearing because the page is too laggy during load. The animation itself may exist but is being swallowed by the lag. Needs to be fixed so the transition is visually smooth.
- **User's Exact Words**: "There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow."

---

### ITEM-03: Data Refresh Interval Not 15 Minutes as Agreed
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The dashboard header shows "Updated 38 minutes ago" (screenshot confirms "Updated 38m ago"). The user expected the data to refresh every 15 minutes per a prior agreement. The current refresh interval is clearly not meeting that target.
- **User's Exact Words**: "You see how it says 'updated 38 minutes ago'? I thought we agreed we were going to update this stuff every 15 minutes."

---

### ITEM-04: Make Data Refresh Interval Configurable in Settings
- **Category**: NEW_FEATURE
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user wants the refresh interval to be a configurable setting. The default should be every 15 minutes during business hours. The user explicitly said "Make that a configurable thing in settings." This is a definitive requirement, not a maybe.
- **User's Exact Words**: "Now I think we should update it every 15 minutes during business hours, which could be a configurable thing in settings. You know what it definitely should be. Make that a configurable thing in settings."

---

### ITEM-05: Disable or Reduce Refresh Outside Business Hours
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: To reduce API usage, the dashboard probably should not query Gingr for reservation updates outside of business hours since no employees are in the building to make updates. The user notes that Ignite webhooks will still update passively, so it's specifically about active Gingr polling. The user is uncertain and flagged this as "something worth thinking about."
- **User's Exact Words**: "It probably shouldn't refresh at all outside of business hours. That's a way to keep down our API usage. We don't need to go nuts overnight. Well I guess we do because Ignite webhooks will update, but do we need to be querying Gingr for reservation updates if no employees are in the building to make any updates? I don't know. That's something worth thinking about."

---

### ITEM-06: "Expected" Value (50) Is Wrong for Past Week
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The "Expected" card shows 50 for the past week. The user says this is incorrect. For a weekly view, "Expected" should show the raw aggregate count of all dogs that were **scheduled to check in** over the entire past week — not a daily average or a single day's number. The resort does ~600 dogs/week, so 50 is clearly far too low.
- **User's Exact Words**: "You'll see that in the past week it says 50 expected and 40 in-house. That is not right. You're telling me in the past seven days we've only had 50 dogs that were expected each individual day? In aggregate? No. In-house. Before we move on from expected for the past week, I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come."

---

### ITEM-07: "In House" Value (40) Is Wrong for Past Week
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The "In House" card shows 40 for the past week. For the weekly view, "In House" should show the raw aggregate count of all dogs that **actually checked in** during the past week. The difference between Expected and In House = cancellations, which the user calls "useful."
- **User's Exact Words**: "…and then for in-house you just take the raw number of the dogs that checked in at that point. You'll be able to tell if there were 1,000 or 600 dogs expected and only 590 were in-house in the past week, then you know 10 canceled. That's useful."

---

### ITEM-08: "In House" Should Exclude Tours
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user clarified (in the context of occupancy) that the "In House" / expected count should include every dog type (not just boarding) BUT should exclude tours. This is a separate data-filtering requirement from the aggregate count fix.
- **User's Exact Words**: "By the way going back to that, that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that."

---

### ITEM-09: "Going Home" Should Become "Canceled" in Past Week View (with Animation)
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user questions whether "Going Home" is useful in the past-week view. Instead, the card should animate/transform into "Canceled" when the timeframe switches to past week. The "Canceled" value should be a simple subtraction: Expected minus In House. The user describes a specific animation: a red bar crosses out "Going Home" text in an animated way, then replaces it with "Canceled," and the numeric value animates in.
- **User's Exact Words**: "Going home. I don't know if going home is useful at the past week view so maybe on the past week view when it changes to it, the going home text animates into canceled and it just does a manual subtraction of expected and in-house. There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in."

---

### ITEM-10: Occupancy Calculation Is Wrong (Shows 143%)
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The occupancy metric shows 143%, which the user finds absurd. The correct calculation for the past-week view should be: (total room-nights occupied by **boarding overnight dogs only** in the past week) ÷ (total rooms available × 7 days). The numerator should only count overnight boarding dogs, not daycare, not tours, not all dogs.
- **User's Exact Words**: "Okay occupancy 143%. What the fuck is this? How are you calculating this? What you should be doing is looking at the total number of rooms occupied in the past week and dividing that by the total number of rooms possible to be occupied in the past week. Look at the total number of rooms we have overnight multiplied by seven. Look at the total number of dogs we had just boarding overnight and then divide those."

---

### ITEM-11: Bookings Count (10) Is Wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The Bookings card shows 10 for the past week. The user knows this is incorrect. The correct definition of "Bookings" should be: count of reservations whose **reservation created date** falls within the past week. Not check-in date, not some other date — specifically the created date.
- **User's Exact Words**: "Okay bookings, it says 10 in the past week. I know that's not right so I don't know how you're looking at it but in my head when I think of bookings, you're going to look at reservations and you're going to look at the reservation created date. How many reservations were created in the past week? Super important."

---

### ITEM-12: Tours Count (0) Is Wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Tours card shows 0, which the user knows is incorrect. Tours are being booked/conducted and the count should be non-zero. The data source or query is failing to capture tours.
- **User's Exact Words**: "Zero tours. I know that's not right; you need to fix that."

---

### ITEM-13: Evals Count (1) Is Wrong — Need Programmatic Detection
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Evals card shows 1, which the user knows is incorrect. In Gingr, evaluations can be logged as an appointment/reservation type called "evaluate" or "evaluation," but more commonly the resort just creates a daycare reservation for the eval. The system should **programmatically detect** evaluations by identifying a dog's first-ever reservation (their first time at the resort), because evaluations only happen on the first visit. This is a logic/detection improvement, not just a query fix.
- **User's Exact Words**: "one eval. I know that's not right either so I think in Gingr you can create an appointment called evaluate or create a reservation called evaluation. A lot of the time we don't do that; a lot of the time we'll just create a day care reservation and that day care reservation, because it's the first reservation they've had that stay care. You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations."

---

### ITEM-14: Remaining Leads (19) Should Match Customer Lifecycle Page
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The Remaining Leads card shows 19. The user is not going to verify it manually but states that this value should be a 1:1 match with the record count shown on the Customer Lifecycle page's Leads module. If it doesn't match, it's a bug.
- **User's Exact Words**: "Next remaining leads: 19. I am not going to check if this is right but essentially the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle."

---

### ITEM-15: "At-Risk" Label Should Be Renamed to "Lapsed"
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The card currently labeled "At-Risk" (showing 3,940) has been renamed to "Lapsed." The label in the dashboard must be updated to reflect this rename. (Screenshot confirms it still says "At-Risk".)
- **User's Exact Words**: "We have renamed this to lapsed."

---

### ITEM-16: Lapsed/At-Risk Value (3,940) Is Wrong — Omit Old Gingr Records
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The 3,940 figure is inflated because it includes very old records imported from Gingr. The dashboard should omit "old" Gingr records from the lapsed count. The user defines "lapsed" as customers who have lapsed within the last 90 days. Customers whose last activity was more than 90 days ago should be classified as "old" (from Gingr) and excluded.
- **User's Exact Words**: "This value at risk, or this value of 3,940, is wrong because it needs to omit old records from gingr. If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong. You need to omit old gingr records from the calculation in this dashboard. It should just be the lapsed ones that are not old."

---

### ITEM-17: Lapsed Logic Threshold Is Wrong — Should Be 90 Days
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The customer lifecycle currently shows 0 lapsed customers, which is clearly wrong for a resort doing 600 dogs/week for nearly a decade. The lapsed threshold was set too low (or the logic is inverted). The correct logic: "lapsed" = customers whose last visit was within the last 90 days but who have stopped coming (i.e., their visit cadence suggests they've dropped off within that 90-day window). Customers with last activity > 90 days ago should be classified as "old, dated from Gingr" and excluded from the lapsed count.
- **User's Exact Words**: "We need to change the logic for lapsed because right now it says zero customers lapsed. That's not right. This resort has been open for almost a decade and we do 600 dogs a week. You're telling me no one's lapsed? Bullshit. I think we set the threshold too low. I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr."

---

### ITEM-18: Outreaches Count (9) Is Wrong — Excludes System-Logged Messages
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Outreaches card shows 9, but the user has not reached out to anybody. The system is apparently counting system-logged messages from the customer lifecycle as outreaches. It should not count those. Only manually initiated outreaches should be counted.
- **User's Exact Words**: "It says nine outreaches. I haven't reached out to anybody. Are you counting the system-logged messages and life cycle? You shouldn't be."

---

### ITEM-19: Converted (10) — Verify Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Converted card shows 10. The user is skeptical and wants to understand how this figure is being calculated. The calculation methodology needs to be explained and verified.
- **User's Exact Words**: "10 converted: okay, I'm curious how the hell you're calculating that."

---

### ITEM-20: First-Time Spenders (90) Seems Too High — Verify
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The First-Time Spenders card shows 90, which the user thinks is suspiciously high. Needs investigation to determine whether this number is accurate or inflated by a data/logic error.
- **User's Exact Words**: "First-time spenders 90: that's really fucking high dude."

---

### ITEM-21: Conversion Rate (33.3%) — Verify Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Conversion Rate shows 33.3%. The user wants to know how this is being calculated. Needs a clear explanation and verification of the formula and data inputs.
- **User's Exact Words**: "First-time spenders: that's amazing, 33.3 conversion rate. How the fuck are you calculating that?"

---

### ITEM-22: New Leads (12) — Acknowledged as Acceptable
- **Category**: VERIFICATION_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The New Leads card shows 12. The user says this is fine and acceptable. No action required, but logged for completeness. The implicit verification is that the user has mentally confirmed this number is in a reasonable range.
- **User's Exact Words**: "12 new leads: look, that's fine. I'm okay with that number."

---

### ITEM-23: Test Daily Tasks (EOD Report, Checkout TV, Photos, Cash Tips, Checkout Notes)
- **Category**: USER_TODO
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The user likes the Daily Tasks section (EOD Report, Checkout TV, Photos, Cash Tips, Checkout Notes) but has NOT yet clicked or tested any of them. The user explicitly requests that testing these be logged as Motion tasks for the user to complete.
- **User's Exact Words**: "Though I have not clicked it and tested it yet, I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me."

---

### ITEM-24: Rename "Avg LTV" Label — Consider Just "LTV"
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The card currently says "Avg LTV" (screenshot confirms "$1719 Avg LTV"). The user feels "Average" is not the right descriptor since LTV is per-customer by definition. The user suggests renaming it to just "LTV" but expresses some uncertainty ("maybe you're right"). At minimum, the label should be reconsidered.
- **User's Exact Words**: "Next average LTV: it should just be LTV. It's not an average; it's not just the customer. Maybe that's the way you should put it. I don't know; it just seems off to say LTV or average but maybe you're right."

---

### ITEM-25: LTV Value Missing Comma Formatting ($1719 → $1,719)
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The LTV value is displayed as "$1719" without a thousands separator comma. It should be "$1,719". This is a number formatting bug.
- **User's Exact Words**: "There's no comma; it's just four digits in a row. There should be a comma."

---

### ITEM-26: Total Clients (4,824) May Be Wrong — Expected ~7,000
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Total Clients card shows 4,824 but the user recalls having approximately 7,000 customers in the customer lifecycle from the initial Gingr pull. The discrepancy of ~2,176 customers needs investigation. Where is this number sourced from and why is it so much lower than the Gingr import count?
- **User's Exact Words**: "Total clients: 4,824. I don't know if that's right. I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?"

---

### ITEM-27: Transactions Count (188) Is Wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The Financial Reporting section shows 188 transactions for the past week. The user says this is clearly wrong because the resort does ~650 dogs per week, so there should be far more transactions. The query or data source is underreporting.
- **User's Exact Words**: "Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?"

---

### ITEM-28: Add Outstanding Invoices Metric to Dashboard
- **Category**: NEW_FEATURE
- **Priority**: HIGH
- **Motion Task Requested**: Yes
- **Description**: The user wants the number of outstanding (unpaid) invoices added as a new metric on the dashboard. The user describes this as "an excellent metric" and "a really good one." Explicitly requested as a Motion task.
- **User's Exact Words**: "I just had a thought: the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one. Add that as a motion task."

---

### ITEM-29: Rename "Avg Ticket" to "Average Transaction Price"
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The card currently labeled "Avg Ticket" (screenshot confirms "$107 Avg Ticket") should be renamed to "Average Transaction Price." The user dislikes the term "ticket price."
- **User's Exact Words**: "Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price."

---

### ITEM-30: Verify Average Transaction Price Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user wants the average transaction price (currently $107) verified for correctness. The user mentioned this twice, emphasizing its importance.
- **User's Exact Words**: "Okay and back to the average transaction price: just verify that you're calculating it correctly. Average transaction price: verify that you're calculating it correctly."

---

### ITEM-31: Verify RevPAR Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The RevPAR card shows $85. The user wants this calculation verified for correctness.
- **User's Exact Words**: "RevPAR: verify that you're calculating it correctly."

---

### ITEM-32: Refunds Count (0) Is Suspect — Verify
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Refunds card shows 0. The user does not believe this is correct and wants the calculation confirmed. This may be a data source issue where refunds are not being captured.
- **User's Exact Words**: "Zero refunds: I don't believe this. Please confirm that you're calculating this correctly."

---

### ITEM-33: Amount Refunded ($0.00) Is Suspect — Verify
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The "$ Refunded" card shows $0.00. The user does not believe this either and wants it verified. Paired with ITEM-32 but a separate data point.
- **User's Exact Words**: "The number refunded is zero. I don't believe this either."

---

### ITEM-34: Discounted Count (0) and Amount Discounted ($0.00) Are Suspect — Verify
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: Both the "Discounted" count (0) and "$ Discounted" amount ($0.00) are shown as zero. The user does not believe these are correct and wants them double-checked. These are grouped together by the user but represent two separate metrics that both need verification.
- **User's Exact Words**: "Zero discounted and zero amount discounted: I don't believe those things. I think you need to double-check those for me."

---

### ITEM-35: Services Page Data Must Match Operations Hub
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The data shown on the Services page (visible on the right side of the dashboard — Baths 0/0, Pamper 0/0, Ice Cream 0/0, etc.) needs to match what is displayed in the Operations Hub. The user has raised this issue before. This is a data consistency requirement.
- **User's Exact Words**: "Next I've told you this before but the data on the Services page needs to match what we actually see in Operations Hub."

---

### ITEM-36: Timeframe Effect on Checklists & Services Needs Spec
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The way that different timeframes (Today, Past Week, MTD, etc.) affect the checklists and services sections is nuanced and the user wants to spec this out personally. The user explicitly asks for this to be created as a Motion task for them to explain later. Not to be prioritized now.
- **User's Exact Words**: "actually, first off, the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now so create a motion task for me to do that."

---

### ITEM-37: Attendance and Inventory Buttons Should Have Icons (Not Dashes)
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The Attendance and Inventory buttons on the dashboard currently display dashes (—) instead of icons. They should have proper icons, consistent with EOD Report, Checkout TV, and Photos which already have icons. (Screenshot confirms the dash/em-dash for Attendance and Inventory.)
- **User's Exact Words**: "Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos."

---

### ITEM-38: Revenue Graph Colors Too Transparent — Need Solid Colors
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The area charts for Cash Basis Revenue and Accrual Revenue use transparent/gradient fills that fade out toward the bottom. The user wants solid, opaque fill colors that "pop" visually. No gradient, no transparency fade.
- **User's Exact Words**: "On these graphs I don't like that the colors are so transparent and they're fading out as they go down. These need to be solid colors and really pop. I don't think they pop right now."

---

### ITEM-39: X-Axis Should Show All 7 Days for Past Week View
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: In the Past Week view, the X-axis on the revenue charts only shows 4 dates (screenshot confirms: 3/8, 3/10, 3/12, 3/14). It should show all 7 days of the week since it's not that many data points.
- **User's Exact Words**: "A lot of the time the X axis is not useful. Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7? It's a week. It's not that many data points."

---

### ITEM-40: One Data Point Per Day in Past Week View (7 Total)
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user wants exactly one data point per day in the weekly view (7 data points total for 7 days). Currently the graphs have many bumps and valleys (suggesting sub-daily or interpolated data points). Each X-axis label should correspond to exactly one data point. On hover, there should be only 7 hover targets.
- **User's Exact Words**: "It would also be nice if for each X axis you only had one data point connecting to it. I think that if you hover over the axis there should only be 7. This is actually a good question: should there only be 7 data points at that stage to be completely accurate? I don't know. Maybe it should be. Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?"

---

### ITEM-41: Consider a Smoothed Average Line Overlay (Gray)
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user suggests potentially adding a smoothed trend line (in gray or similar muted color) showing rolling averages overlaid on the raw data graph. The user notes the current graphs already use a smoothed/rounded line style (likely a spline interpolation or moving average). This is an idea to consider — the user is not definitive.
- **User's Exact Words**: "Maybe you should have a smoothed-out line that shows the averages in gray or something. That's kind of what we're doing now with these graphs. You show a continuous rounding graph. There's probably a term for it. It's not a line of best fit. It's something you can do. I'm sure there is a statistical term for it but you're smoothening out the lines to make it not jagged and make it round like you have already."

---

### ITEM-42: Revenue Graph Should Be Jagged Line with Solid Fill and Dot Markers
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user's ideal revenue graph design for a weekly view: 7 data points connected by straight line segments (jagged, not smoothed/curved), solid color fill beneath the line (no gradient), and each X-axis value should have a subtle vertical line extending up to its data point with a larger dot marker on the data point. This applies to **both** the Cash Basis Revenue and Accrual Revenue charts.
- **User's Exact Words**: "In my mind I feel like if you're looking at a graph of a week of revenue, you should see seven data points connected via a jagged graph with solid color beneath it, no gradient. Each value on the X-axis, maybe it should have a very subtle vertical line to its data point with a bigger dot on that line. This applies to both cash basis revenue and accrual revenue."

---

### ITEM-43: Revenue Split Concept Needs Spec — Create Motion Task
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The Revenue Split feature (visible on the dashboard showing "80% Board / 20% Day") needs further development and specification, but the user does not want to do it right now. The user explicitly requests a Motion task to spec this out later.
- **User's Exact Words**: "This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept."

---

### ITEM-44: Baths Service Shows "0 of 0" — Data Is Wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The Services sidebar shows "Baths 0/0" which cannot be correct. This is part of the broader Services page data mismatch issue (ITEM-35) but is a specific, visible data point on the screenshot that is clearly wrong.
- **User's Exact Words**: "That Baths figure, 0 of 0..."

---

### ITEM-45: Section Title Still Says "Today's Snapshot" in Past Week View
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Observed from the screenshot: the top section of the dashboard is labeled "TODAY'S SNAPSHOT" even though the user has selected "Past Week" as the time range. This label should dynamically change to reflect the selected timeframe (e.g., "PAST WEEK SNAPSHOT" or "WEEKLY SNAPSHOT"). The user's feedback about the Expected/In House values being wrong for a week view implies this section should contextually adapt. While the user didn't explicitly call out this label, the entire feedback is predicated on the mismatch between the "Past Week" selector and what the dashboard displays — and this label is part of that mismatch.
- **User's Exact Words**: (Implicit from context — user is viewing "Past Week" but screenshot shows "TODAY'S SNAPSHOT" as the section header. The user's complaint about Expected showing 50 and In-House showing 40 suggests the data may still be showing today's data rather than weekly aggregates, and this label reinforces that concern.)

---

### ITEM-46: Verify Whether Occupancy Denominator Uses Correct Room Count
- **Category**: SPEC_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: For the occupancy calculation, the user specifies the denominator should be "total number of rooms we have overnight multiplied by seven." This implies a specific room count needs to be defined or verified as a system constant. The user needs to confirm what this room count is, or the system needs to pull it from a configured value.
- **User's Exact Words**: "Look at the total number of rooms we have overnight multiplied by seven."

---

### ITEM-47: Lapsed Logic Also Broken on Customer Lifecycle Page (Shows Zero)
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user notes that the Customer Lifecycle page itself currently shows zero lapsed customers, which is also wrong and compounds the dashboard issue. This is not just a dashboard display bug — the underlying lapsed classification logic is broken in the core system. Both the dashboard and the lifecycle page are affected.
- **User's Exact Words**: "If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong."

---

### ITEM-48: Converted Calculation Needs Explanation
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user wants to understand the methodology behind the "Converted" metric (showing 10). This is related to ITEM-19 but specifically calls for documentation or explanation of the calculation, not just verification of accuracy.
- **User's Exact Words**: "10 converted: okay, I'm curious how the hell you're calculating that."

---

### ITEM-49: Test EOD Report Feature
- **Category**: USER_TODO
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The user specifically calls out that the EOD Report has not been tested yet and needs to be tested. This is part of the broader Daily Tasks testing (ITEM-23) but the EOD Report is called out separately as something the user needs to do. Logged as a Motion task per user request.
- **User's Exact Words**: "I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me."

---

### ITEM-50: Test Daily Task Buttons (Checkout TV, Photos, Cash Tips, Checkout Notes)
- **Category**: USER_TODO
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The user has not yet clicked/tested the Daily Task buttons (Checkout TV, Photos, Cash Tips, Checkout Notes). Needs to be logged as Motion tasks for the user. (EOD Report is broken out separately in ITEM-49.)
- **User's Exact Words**: "Though I have not clicked it and tested it yet... those are things that I will need to do. Maybe you can log those as motion tasks for me."

---

### ITEM-51: Dashboard Acknowledged as Faster (Positive Feedback)
- **Category**: VERIFICATION_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user acknowledged that the dashboard loads "way faster" than before, which is positive feedback. However, it's still 20 seconds (ITEM-01), so this is a relative improvement that still needs more work.
- **User's Exact Words**: "Okay the dashboard loaded way faster. Well done; however there is still a lot of work to do."

---

### ITEM-52: Daily Tasks Section — Positive Feedback (No Change Needed)
- **Category**: VERIFICATION_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user expressed strong approval of the Daily Tasks section design and the individual task buttons (EOD Report, Checkout TV, Photos, Cash Tips, Checkout Notes). No design changes requested — only testing is needed (see ITEM-23, ITEM-49, ITEM-50).
- **User's Exact Words**: "Daily tasks: I really like the EOD report, I really like checkout TV, I really like photos, I really like cash tips, and I really like checkout notes."

---

### ITEM-53: New Leads (12) — Acknowledged as Acceptable (No Change Needed)
- **Category**: VERIFICATION_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Duplicate acknowledgment of ITEM-22. The user accepts the 12 new leads figure as reasonable.
- **User's Exact Words**: "12 new leads: look, that's fine. I'm okay with that number."

---

## Motion Tasks Explicitly Requested by User

For quick reference, these items had the user explicitly request a Motion task:

| Item   | Motion Task Description |
|--------|------------------------|
| ITEM-23 / ITEM-49 / ITEM-50 | Test all Daily Task buttons (EOD Report, Checkout TV, Photos, Cash Tips, Checkout Notes) |
| ITEM-28 | Add outstanding invoices metric to dashboard |
| ITEM-36 | User to spec out how timeframes affect checklists and services |
| ITEM-43 | User to spec out the revenue split concept |

---

## Priority Summary

### CRITICAL (9 items)
- ITEM-01: Dashboard load time ~20 seconds
- ITEM-06: Expected value (50) wrong for Past Week
- ITEM-07: In House value (40) wrong for Past Week
- ITEM-10: Occupancy 143% — wrong calculation
- ITEM-11: Bookings (10) wrong
- ITEM-16: Lapsed/At-Risk value (3,940) includes old Gingr records
- ITEM-17: Lapsed logic threshold wrong — should be 90 days
- ITEM-27: Transactions (188) too low
- ITEM-47: Lapsed shows 0 on Customer Lifecycle page

### HIGH (21 items)
- ITEM-02: Time-range selector animation missing
- ITEM-03: Data refresh not every 15 min
- ITEM-04: Make refresh interval configurable
- ITEM-08: In House should exclude tours
- ITEM-12: Tours count (0) is wrong
- ITEM-13: Evals count (1) is wrong
- ITEM-15: At-Risk label should say Lapsed
- ITEM-18: Outreaches (9) counting system messages
- ITEM-19: Converted (10) — verify calculation
- ITEM-20: First-Time Spenders (90) seems too high
- ITEM-21: Conversion Rate (33.3%) — verify calculation
- ITEM-26: Total Clients (4,824) may be wrong
- ITEM-28: Add outstanding invoices metric
- ITEM-30: Verify average transaction price
- ITEM-31: Verify RevPAR calculation
- ITEM-32: Refunds (0) suspect
- ITEM-33: Amount refunded ($0) suspect
- ITEM-34: Discounted (0) and amount discounted ($0) suspect
- ITEM-35: Services page data must match Operations Hub
- ITEM-44: Baths shows 0/0
- ITEM-46: Verify occupancy room count denominator

### MEDIUM (17 items)
- ITEM-05: Disable refresh outside business hours
- ITEM-09: Going Home → Canceled animation
- ITEM-14: Remaining Leads should match lifecycle page
- ITEM-25: LTV missing comma formatting
- ITEM-29: Rename Avg Ticket → Average Transaction Price
- ITEM-36: Spec timeframe effect on checklists/services
- ITEM-37: Attendance/Inventory need icons not dashes
- ITEM-38: Graph colors too transparent
- ITEM-39: X-axis should show all 7 days
- ITEM-40: One data point per day in weekly view
- ITEM-42: Jagged line graph with solid fill and dot markers
- ITEM-43: Revenue split concept needs spec
- ITEM-45: Section title says Today's Snapshot in Past Week view
- ITEM-48: Converted calculation needs explanation
- ITEM-49: Test EOD Report
- ITEM-50: Test Daily Task buttons
- ITEM-23: Test all Daily Tasks (Motion task)

### LOW (6 items)
- ITEM-22: New Leads (12) acknowledged as acceptable
- ITEM-24: Rename Avg LTV label
- ITEM-41: Consider smoothed average line overlay
- ITEM-51: Dashboard acknowledged as faster (positive)
- ITEM-52: Daily Tasks section positive feedback
- ITEM-53: New Leads acknowledged (duplicate of ITEM-22)

---

*End of Agent Alpha Interpretation — 53 items extracted.*
