### ITEM-01: Past-week dashboard load time is too slow
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says the dashboard still takes about 20 seconds to load in the Past Week view. This is a performance issue that needs improvement because it degrades the usability of the dashboard before any metric review even begins.
- **User's Exact Words**: "First off it took 20 seconds probably to load."

### ITEM-02: Selector transition animation is broken by lag
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user expected a clean animated transition when switching from Today to Past Week, but lag prevented that effect from appearing properly. The request is to fix the lag and restore the polished selector animation behavior previously described.
- **User's Exact Words**: "There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow."

### ITEM-03: Dashboard freshness cadence is wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The dashboard shows "updated 38 minutes ago," which conflicts with the previously agreed expectation of 15-minute updates. The user wants the actual refresh cadence aligned with the expected timing.
- **User's Exact Words**: "You see how it says \"updated 38 minutes ago\"? I thought we agreed we were going to update this stuff every 15 minutes."

### ITEM-04: Refresh interval should be configurable in settings
- **Category**: NEW_FEATURE
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: Beyond fixing the current stale timestamp, the user explicitly wants refresh behavior exposed as a configurable setting. This should allow adjustment of the 15-minute business-hours refresh policy from settings.
- **User's Exact Words**: "Now I think we should update it every 15 minutes during business hours, which could be a configurable thing in settings. You know what it definitely should be. Make that a configurable thing in settings."

### ITEM-05: Automatic refresh should pause outside business hours
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user wants the system to avoid regular refreshes outside business hours to reduce unnecessary API usage. This is a behavioral requirement for dashboard data-refresh scheduling.
- **User's Exact Words**: "It probably shouldn't refresh at all outside of business hours. That's a way to keep down our API usage. We don't need to go nuts overnight."

### ITEM-06: Overnight refresh strategy needs product/spec decision
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user raises an open design question about whether Gingr reservation polling is necessary overnight when no employees are present, while also noting Ignite webhooks may still update things. This needs a product/technical decision on after-hours sync behavior.
- **User's Exact Words**: "Well I guess we do because Ignite webhooks will update, but do we need to be querying Gingr for reservation updates if no employees are in the building to make any updates? I don't know. That's something worth thinking about."

### ITEM-07: Past-week Expected metric is wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user says the Past Week Expected value of 50 is clearly incorrect and does not reflect aggregate weekly check-in expectations. The metric is currently misleading for weekly interpretation.
- **User's Exact Words**: "You'll see that in the past week it says 50 expected and 40 in-house. That is not right. You're telling me in the past seven days we've only had 50 dogs that were expected each individual day? In aggregate? No."

### ITEM-08: Past-week In-House metric is wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user also says the Past Week In-House value of 40 is wrong as an aggregate weekly number. This should be recalculated using the raw count of dogs that actually checked in during the selected week.
- **User's Exact Words**: "In-house. Before we move on from expected for the past week, I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come and then for in-house you just take the raw number of the dogs that checked in at that point."

### ITEM-09: Expected should use raw scheduled check-ins during the selected week
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user explicitly defines the correct weekly logic for Expected: count the raw number of dogs scheduled to check in during the selected week. This is a formula/spec correction, not just a generic bug report.
- **User's Exact Words**: "I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come"

### ITEM-10: In-House should use raw checked-in count during the selected week
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user explicitly defines the correct weekly logic for In-House: use the raw number of dogs that actually checked in during the selected week. This should support meaningful comparison with Expected.
- **User's Exact Words**: "for in-house you just take the raw number of the dogs that checked in at that point."

### ITEM-11: Weekly canceled metric should be derived from Expected minus In-House
- **Category**: NEW_FEATURE
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user wants cancellation insight in weekly view by manually subtracting In-House from Expected. This would surface how many scheduled dogs did not ultimately check in.
- **User's Exact Words**: "You'll be able to tell if there were 1,000 or 600 dogs expected and only 590 were in-house in the past week, then you know 10 canceled. That's useful."

### ITEM-12: Going Home is not useful in Past Week view
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user questions whether the Going Home tile belongs in the Past Week timeframe at all. The implication is that the weekly state should not reuse a same-day operational metric when a more relevant weekly metric exists.
- **User's Exact Words**: "Going home. I don't know if going home is useful at the past week view"

### ITEM-13: Replace Going Home with Canceled in Past Week view
- **Category**: NEW_FEATURE
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: For weekly view specifically, the user wants Going Home replaced with Canceled. This is a contextual metric swap tied to timeframe selection.
- **User's Exact Words**: "so maybe on the past week view when it changes to it, the going home text animates into canceled and it just does a manual subtraction of expected and in-house."

### ITEM-14: Add animated Going Home-to-Canceled transition
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user wants a polished animation for the metric swap in weekly view: Going Home gets crossed out live, changes to Canceled, and the new value animates in. This is a specific UI animation request.
- **User's Exact Words**: "There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in. I think you can do a really clean animation for that."

### ITEM-15: Occupancy percentage is obviously wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The displayed occupancy of 143% is flagged as invalid by the user. This indicates the current occupancy metric is being calculated incorrectly in Past Week view.
- **User's Exact Words**: "Okay occupancy 143%. What the fuck is this? How are you calculating this?"

### ITEM-16: Occupancy formula for Past Week needs to use occupied rooms over total possible room-nights
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user specifies the desired formula: total rooms occupied during the week divided by total possible occupied rooms during the week. That total capacity should be overnight rooms multiplied by seven days for the Past Week view.
- **User's Exact Words**: "What you should be doing is looking at the total number of rooms occupied in the past week and dividing that by the total number of rooms possible to be occupied in the past week. Look at the total number of rooms we have overnight multiplied by seven."

### ITEM-17: Occupancy should count boarding overnight dogs only and exclude tours
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user clarifies that occupancy should be based on boarding overnight usage, and separately warns that broader in-house counts include every dog. The occupancy calculation must therefore avoid accidentally counting tours or other non-overnight activity.
- **User's Exact Words**: "Look at the total number of dogs we had just boarding overnight and then divide those and in-house. By the way going back to that, that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that."

### ITEM-18: Past-week Bookings count is wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says the Bookings value of 10 for Past Week is not correct. This metric needs to be recalculated using the right source field and timeframe logic.
- **User's Exact Words**: "Okay bookings, it says 10 in the past week. I know that's not right"

### ITEM-19: Bookings should be based on reservation created date in the selected week
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user explicitly defines bookings as the number of reservations created in the selected week, using reservation created date rather than stay date or some other field. This is the required metric definition.
- **User's Exact Words**: "in my head when I think of bookings, you're going to look at reservations and you're going to look at the reservation created date. How many reservations were created in the past week? Super important."

### ITEM-20: Tours count showing zero is wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says the zero Tours value is incorrect. The current tour-count logic is missing actual activity.
- **User's Exact Words**: "Zero tours. I know that's not right"

### ITEM-21: Evaluations count is wrong
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says the dashboard showing one evaluation is also incorrect. Evaluation detection logic needs to be revisited.
- **User's Exact Words**: "you need to fix that one eval. I know that's not right either"

### ITEM-22: Evaluation detection should include explicit evaluation appointment or reservation types
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user explains that Gingr may represent evaluations as either an appointment called evaluate or a reservation called evaluation. The logic should count those explicit evaluation records when present.
- **User's Exact Words**: "so I think in Gingr you can create an appointment called evaluate or create a reservation called evaluation."

### ITEM-23: Evaluation detection should infer first-time day care visits as evaluations when no explicit eval object exists
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says evaluations are often not recorded using a dedicated evaluation object and instead occur on the customer's first day care reservation. The logic should infer an evaluation from a customer's first reservation/first time with the business when that is how operations work.
- **User's Exact Words**: "A lot of the time we don't do that; a lot of the time we'll just create a day care reservation and that day care reservation, because it's the first reservation they've had that stay care. You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations."

### ITEM-24: Remaining Leads should match Customer Lifecycle record count exactly
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user is not personally validating the number now, but wants the Remaining Leads tile to be one-to-one with the record count shown in the Customer Lifecycle leads module. This is a cross-page consistency requirement.
- **User's Exact Words**: "Next remaining leads: 19. I am not going to check if this is right but essentially the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle."

### ITEM-25: Rename the At-Risk concept to Lapsed
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user states that this concept has already been renamed. Any remaining dashboard label that still says At-Risk should be updated to Lapsed.
- **User's Exact Words**: "We have renamed this to lapsed."

### ITEM-26: Lapsed value of 3,940 is wrong because old Gingr records are included
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user says the current value is inflated by including old Gingr records that should not count toward active lapsed customers. The current dashboard metric is therefore materially wrong.
- **User's Exact Words**: "This value at risk, or this value of 3,940, is wrong because it needs to omit old records from gingr."

### ITEM-27: Customer Lifecycle showing zero lapsed customers is also wrong
- **Category**: DATA_BUG
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user says the supporting Customer Lifecycle page currently reports no lapsed customers, which is also incorrect. This indicates a broader logic problem, not just a dashboard presentation issue.
- **User's Exact Words**: "If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong."

### ITEM-28: Lapsed calculation must exclude old Gingr records
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user explicitly wants the lapsed dashboard calculation to include only lapsed customers who are not considered old. Old imported/historical Gingr records must be omitted from this metric.
- **User's Exact Words**: "You need to omit old gingr records from the calculation in this dashboard. It should just be the lapsed ones that are not old."

### ITEM-29: Lapsed logic needs a 90-day threshold, with older customers classified as Old
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The user proposes a new lifecycle threshold: customers lapsed within the last 90 days should be classified as Lapsed, while anyone beyond 90 days should be classified as Old. This is a core business-rule change.
- **User's Exact Words**: "I think we set the threshold too low. I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr."

### ITEM-30: Outreaches count appears wrong if it includes system-logged lifecycle messages
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says nine outreaches cannot be correct because they have not personally reached out to anyone. The likely issue is that system-logged lifecycle messages are being counted when they should not be.
- **User's Exact Words**: "It says nine outreaches. I haven't reached out to anybody. Are you counting the system-logged messages and life cycle? You shouldn't be."

### ITEM-31: Converted metric calculation needs explanation or verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user questions how the Converted count of 10 is being computed. This should be explicitly checked and explained.
- **User's Exact Words**: "10 converted: okay, I'm curious how the hell you're calculating that."

### ITEM-32: First-Time Spenders count of 90 looks too high
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user does not trust the First-Time Spenders number and flags it as suspiciously high. The metric needs validation.
- **User's Exact Words**: "First-time spenders 90: that's really fucking high dude."

### ITEM-33: Conversion Rate calculation needs explanation or verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user questions how the 33.3% conversion rate is being calculated. The metric definition and formula need validation.
- **User's Exact Words**: "First-time spenders: that's amazing, 33.3 conversion rate. How the fuck are you calculating that?"

### ITEM-34: Daily task cards need user testing captured as Motion work
- **Category**: USER_TODO
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The user likes the Daily Tasks cards but has not yet tested them and explicitly asks for that follow-up to be logged as Motion work. This is a user-side validation task, not an implementation change.
- **User's Exact Words**: "Daily tasks: I really like the EOD report, I really like checkout TV, I really like photos, I really like cash tips, and I really like checkout notes. Though I have not clicked it and tested it yet, I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me."

### ITEM-35: Average LTV label should likely be changed to LTV
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user thinks the label "Average LTV" is off and likely should simply say "LTV." They are not fully certain, but they are clearly flagging the wording as potentially wrong.
- **User's Exact Words**: "Next average LTV: it should just be LTV. It's not an average; it's not just the customer. Maybe that's the way you should put it. I don't know; it just seems off to say LTV or average but maybe you're right."

### ITEM-36: LTV value needs thousands separator formatting
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user wants the four-digit LTV number formatted with a comma rather than shown as four uninterrupted digits. This is a display-formatting issue.
- **User's Exact Words**: "There's no comma; it's just four digits in a row. There should be a comma."

### ITEM-37: Total Clients figure seems too low and needs source validation
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user doubts the Total Clients value of 4,824 because they remember a much larger historical customer count from the initial Gingr pull. The source logic and definition of "total clients" need verification.
- **User's Exact Words**: "Total clients: 4,824. I don't know if that's right. I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?"

### ITEM-38: Transactions count of 188 appears wrong
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user does not believe the Financial Reporting tile showing 188 transactions is plausible relative to weekly dog volume. The metric should be validated against transaction data and business volume.
- **User's Exact Words**: "Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?"

### ITEM-39: Add Outstanding Invoices as a dashboard metric
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: The user explicitly proposes a new dashboard KPI for outstanding invoices and wants it captured as Motion work. This is a new metric request.
- **User's Exact Words**: "I just had a thought: the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one. Add that as a motion task."

### ITEM-40: Rename Average Ticket Price to Average Transaction Price
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user dislikes the phrase "Average Ticket Price" and prefers "Average Transaction Price." This is a terminology change.
- **User's Exact Words**: "Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price."

### ITEM-41: Average Transaction Price calculation needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user explicitly asks for the Average Transaction Price calculation to be checked. This is separate from the naming change.
- **User's Exact Words**: "Okay and back to the average transaction price: just verify that you're calculating it correctly. Average transaction price: verify that you're calculating it correctly."

### ITEM-42: RevPAR calculation needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user wants the RevPAR metric calculation checked. This is an explicit verification request.
- **User's Exact Words**: "RevPAR: verify that you're calculating it correctly."

### ITEM-43: Refund count calculation needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user does not believe the refunds count of zero and asks for confirmation that the calculation is correct. This is a specific verification request for the refund-count tile.
- **User's Exact Words**: "Zero refunds: I don't believe this. Please confirm that you're calculating this correctly."

### ITEM-44: Refunded dollar amount needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user separately does not believe the refunded amount of zero. This should be checked independently from the refund count.
- **User's Exact Words**: "The number refunded is zero. I don't believe this either."

### ITEM-45: Discount count needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user does not trust the zero discounted count and wants it double-checked. This is a separate metric from the discounted dollar amount.
- **User's Exact Words**: "Zero discounted and zero amount discounted: I don't believe those things. I think you need to double-check those for me."

### ITEM-46: Discounted dollar amount needs verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user separately questions the zero amount discounted. This should be validated independently from the discount count.
- **User's Exact Words**: "Zero discounted and zero amount discounted: I don't believe those things. I think you need to double-check those for me."

### ITEM-47: Services page dashboard data must match Operations Hub data
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The user says service-related data shown on the dashboard must align with what appears in Operations Hub. This is a consistency/data-parity requirement across product surfaces.
- **User's Exact Words**: "Next I've told you this before but the data on the Services page needs to match what we actually see in Operations Hub."

### ITEM-48: Baths 0/0 figure is suspect within the services section
- **Category**: DATA_BUG
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user explicitly points to the Baths figure showing 0 of 0 as part of the broader services mismatch problem. This specific displayed value should be investigated.
- **User's Exact Words**: "That Baths figure, 0 of 0"

### ITEM-49: Timeframe behavior for checklists and services needs separate spec discussion
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: Yes
- **Description**: The user says the way timeframes affect checklists and services is nuanced and not ready to prioritize now. They explicitly want a Motion task created so they can explain/spec this later.
- **User's Exact Words**: "actually, first off, the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now so create a motion task for me to do that."

### ITEM-50: Attendance and Inventory dashboard actions need icons instead of dashes
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user wants Attendance and Inventory to use icon-based buttons like the other dashboard action cards rather than displaying dashes. This is a visual consistency issue.
- **User's Exact Words**: "Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos."

### ITEM-51: Revenue chart fills should use solid colors instead of transparent gradients
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user dislikes the current graph styling because the chart colors are too transparent and fade out downward. They want stronger, solid fills that visually pop.
- **User's Exact Words**: "On these graphs I don't like that the colors are so transparent and they're fading out as they go down. These need to be solid colors and really pop. I don't think they pop right now."

### ITEM-52: Past-week X-axis should show seven dates
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user expects the Past Week chart X-axis to show seven dates, not four. This is a chart-axis labeling issue tied to timeframe clarity.
- **User's Exact Words**: "A lot of the time the X axis is not useful. Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7? It's a week. It's not that many data points."

### ITEM-53: Revenue charts may need exactly one data point per day in Past Week view
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user raises an open question about whether weekly charts should contain exactly seven data points, one per day, to avoid overly busy curves and excessive bumps. This needs a product/data-visualization decision.
- **User's Exact Words**: "It would also be nice if for each X axis you only had one data point connecting to it. I think that if you hover over the axis there should only be 7. This is actually a good question: should there only be 7 data points at that stage to be completely accurate? I don't know. Maybe it should be. Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?"

### ITEM-54: Consider adding a separate smoothed average line overlay
- **Category**: NEW_FEATURE
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user suggests a possible graph enhancement: adding a smoothed average line in gray while still acknowledging the current chart is already using some smoothing. This is a tentative visualization idea rather than a firm requirement.
- **User's Exact Words**: "Maybe you should have a smoothed-out line that shows the averages in gray or something. That's kind of what we're doing now with these graphs. You show a continuous rounding graph."

### ITEM-55: Revenue charts should show a jagged seven-point line with solid fill in weekly view
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user gives a preferred chart design for weekly revenue: seven discrete data points connected by a jagged line with solid color underneath and no gradient. This is more specific than the earlier comments about transparency and number of points.
- **User's Exact Words**: "In my mind I feel like if you're looking at a graph of a week of revenue, you should see seven data points connected via a jagged graph with solid color beneath it, no gradient."

### ITEM-56: Revenue charts should add subtle vertical guides and larger point markers
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The user wants each X-axis value to have a subtle vertical line leading to a larger dot on the data point. This is a detailed chart-visual treatment request.
- **User's Exact Words**: "Each value on the X-axis, maybe it should have a very subtle vertical line to its data point with a bigger dot on that line."

### ITEM-57: Apply the revenue chart redesign to both cash-basis and accrual-revenue charts
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The user explicitly says the graph styling expectations apply to both revenue charts, not just one. Any redesign should therefore cover both Cash Basis Revenue and Accrual Revenue.
- **User's Exact Words**: "This applies to both cash basis revenue and accrual revenue."

### ITEM-58: Revenue Split concept needs later development/spec work
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: Yes
- **Description**: The user says the Revenue Split idea is not ready to be worked right now and explicitly asks for a Motion task to revisit, adjust, or fully spec the concept later.
- **User's Exact Words**: "This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept."
