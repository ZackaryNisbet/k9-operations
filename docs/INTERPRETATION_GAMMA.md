### ITEM-01: Load Time Issue
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The dashboard took 20 seconds to load, which is too slow. The performance needs to be improved.
- **User's Exact Words**: "First off it took 20 seconds probably to load."

### ITEM-02: Date Selector Animation Lag
- **Category**: UI_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The animation for the date selector changing from "today" to "past week" was laggy and not clean. The animation performance needs to be fixed.
- **User's Exact Words**: "There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow."

### ITEM-03: Refresh Rate Settings
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Make the dashboard refresh rate configurable in settings. The user suggests updating every 15 minutes during business hours and stopping or reducing updates outside of business hours to save API usage.
- **User's Exact Words**: "Now I think we should update it every 15 minutes during business hours, which could be a configurable thing in settings. You know what it definitely should be. Make that a configurable thing in settings. It probably shouldn't refresh at all outside of business hours."

### ITEM-04: Off-Hours API Usage Consideration
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Determine if Gingr needs to be queried for reservation updates outside of business hours when no employees are present to make updates, considering Ignite webhooks will still update.
- **User's Exact Words**: "Well I guess we do because Ignite webhooks will update, but do we need to be querying Gingr for reservation updates if no employees are in the building to make any updates? I don't know. That's something worth thinking about."

### ITEM-05: Expected Dogs Calculation Fix
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The "expected" dogs metric for the past week is incorrect (showing 50). It should display the raw number of dogs scheduled to check in during the past week, not an aggregate or daily average.
- **User's Exact Words**: "You'll see that in the past week it says 50 expected and 40 in-house. That is not right... Before we move on from expected for the past week, I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come..."

### ITEM-06: In-House Dogs Calculation Fix
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The "in-house" dogs metric for the past week should show the raw number of dogs that actually checked in during that period.
- **User's Exact Words**: "...and then for in-house you just take the raw number of the dogs that checked in at that point."

### ITEM-07: Going Home to Canceled Animation
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: On the past week view, the "Going home" metric should animate into "Canceled". The animation should cross out "Going home" with a red bar, replace the text with "Canceled", and then animate in the calculated value.
- **User's Exact Words**: "I don't know if going home is useful at the past week view so maybe on the past week view when it changes to it, the going home text animates into canceled... There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in."

### ITEM-08: Canceled Dogs Calculation
- **Category**: CALCULATION_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: The "Canceled" value shown on the past week view should be calculated by manually subtracting the in-house dogs from the expected dogs.
- **User's Exact Words**: "...and it just does a manual subtraction of expected and in-house."

### ITEM-09: Occupancy Calculation Fix
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The occupancy calculation (currently showing 143%) is incorrect. It should be calculated as: (total number of dogs boarding overnight in the past week) / (total number of overnight rooms available multiplied by 7).
- **User's Exact Words**: "Okay occupancy 143%. What the fuck is this? How are you calculating this? What you should be doing is looking at the total number of rooms occupied in the past week and dividing that by the total number of rooms possible to be occupied in the past week. Look at the total number of rooms we have overnight multiplied by seven. Look at the total number of dogs we had just boarding overnight and then divide those..."

### ITEM-10: Exclude Tours from Occupancy
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: Ensure that tours are excluded from the total number of dogs used in the occupancy calculation. Only overnight boarding dogs should be counted.
- **User's Exact Words**: "By the way going back to that, that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that."

### ITEM-11: Bookings Calculation Fix
- **Category**: CALCULATION_FIX
- **Priority**: CRITICAL
- **Motion Task Requested**: No
- **Description**: The bookings metric (currently showing 10) is incorrect. It needs to count the number of reservations created in the past week based on the reservation created date.
- **User's Exact Words**: "Okay bookings, it says 10 in the past week. I know that's not right... in my head when I think of bookings, you're going to look at reservations and you're going to look at the reservation created date. How many reservations were created in the past week? Super important."

### ITEM-12: Tours Metric Fix
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The tours metric is showing zero, which is incorrect. This needs to be investigated and fixed.
- **User's Exact Words**: "Zero tours. I know that's not right; you need to fix that one"

### ITEM-13: Evaluations Logic Fix
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The evaluation metric is incorrect. Since evaluations are often just booked as day care reservations, the system needs to programmatically identify evaluations by checking if a day care reservation is the dog's first ever reservation with the facility.
- **User's Exact Words**: "eval. I know that's not right either so I think in Gingr you can create an appointment called evaluate or create a reservation called evaluation. A lot of the time we don't do that; a lot of the time we'll just create a day care reservation and that day care reservation, because it's the first reservation they've had that stay care. You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations."

### ITEM-14: Remaining Leads Consistency Check
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify that the "remaining leads" value on the dashboard (currently 19) exactly matches the number of records shown in the leads module page of the customer lifecycle.
- **User's Exact Words**: "Next remaining leads: 19. I am not going to check if this is right but essentially the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle."

### ITEM-15: Rename Metric to Lapsed
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: A specific metric (implied to be an At-Risk metric based on context) has been renamed to "lapsed". Ensure the UI reflects this.
- **User's Exact Words**: "We have renamed this to lapsed."

### ITEM-16: Value at Risk/Lapsed Calculation Omit Old Records
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The value metric (currently 3,940) and the lapsed count (currently 0) are incorrect. The calculation must omit old records imported from Gingr. Only lapsed records that are not "old" should be included.
- **User's Exact Words**: "This value at risk, or this value of 3,940, is wrong because it needs to omit old records from gingr. If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong. You need to omit old gingr records from the calculation in this dashboard. It should just be the lapsed ones that are not old."

### ITEM-17: Lapsed Customers Threshold Adjustment
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The logic for determining "lapsed" customers needs to be changed. It should include all customers who have lapsed within the last 90 days from the current date. Anyone lapsed for over 90 days should be classified as "old, dated from gingr" and omitted.
- **User's Exact Words**: "We need to change the logic for lapsed because right now it says zero customers lapsed. That's not right... I think we set the threshold too low. I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr."

### ITEM-18: Outreaches Counting Logic
- **Category**: CALCULATION_FIX
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The outreaches count (currently 9) is incorrect because the user hasn't sent any. Verify if system-logged messages from the lifecycle are being counted, and exclude them if so. Only manual outreaches should be counted.
- **User's Exact Words**: "It says nine outreaches. I haven't reached out to anybody. Are you counting the system-logged messages and life cycle? You shouldn't be."

### ITEM-19: Converted Calculation Verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Explain or verify the calculation method used to determine the "10 converted" metric.
- **User's Exact Words**: "10 converted: okay, I'm curious how the hell you're calculating that."

### ITEM-20: First-Time Spenders Data Check
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The "First-time spenders" count of 90 seems suspiciously high. The data source and calculation logic need to be investigated.
- **User's Exact Words**: "First-time spenders 90: that's really fucking high dude."

### ITEM-21: First-Time Spenders Conversion Rate Verification
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify the calculation logic for the first-time spenders conversion rate, which is currently showing an unusually high 33.3%.
- **User's Exact Words**: "First-time spenders: that's amazing, 33.3 conversion rate. How the fuck are you calculating that?"

### ITEM-22: Test Daily Tasks Functionality
- **Category**: USER_TODO
- **Priority**: LOW
- **Motion Task Requested**: Yes
- **Description**: Create a Motion task for the user to test the EOD report, checkout TV, photos, cash tips, and checkout notes features in the daily tasks section.
- **User's Exact Words**: "Daily tasks: I really like the EOD report, I really like checkout TV, I really like photos, I really like cash tips, and I really like checkout notes. Though I have not clicked it and tested it yet, I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me."

### ITEM-23: Rename Average LTV
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Change the label "Average LTV" to just "LTV" or rephrase it, as calling it an average seems incorrect to the user.
- **User's Exact Words**: "Next average LTV: it should just be LTV. It's not an average; it's not just the customer. Maybe that's the way you should put it. I don't know; it just seems off to say LTV or average but maybe you're right."

### ITEM-24: Add Comma to LTV Value
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Add a comma separator to the LTV monetary value (e.g., format 4 digits with a comma).
- **User's Exact Words**: "There's no comma; it's just four digits in a row. There should be a comma."

### ITEM-25: Total Clients Data Bug
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The total clients metric is showing 4,824, which is significantly lower than the expected ~7,000 customers imported from Gingr into the customer lifecycle. Investigate where this figure is sourced from and fix the discrepancy.
- **User's Exact Words**: "Total clients: 4,824. I don't know if that's right. I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?"

### ITEM-26: Financial Reporting Transactions Check
- **Category**: DATA_BUG
- **Priority**: HIGH
- **Motion Task Requested**: No
- **Description**: The financial reporting transactions count is 188, which is too low for a facility processing 650 dogs a week. Investigate the data source and calculation logic.
- **User's Exact Words**: "Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?"

### ITEM-27: Add Outstanding Invoices Metric
- **Category**: NEW_FEATURE
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: Add a new metric to the dashboard to track the "number of outstanding invoices". Create a Motion task for this.
- **User's Exact Words**: "I just had a thought: the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one. Add that as a motion task."

### ITEM-28: Rename Average Ticket Price
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Rename the metric "Average ticket price" to "Average transaction price".
- **User's Exact Words**: "Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price."

### ITEM-29: Verify Average Transaction Price Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify that the calculation for the (newly renamed) average transaction price is correct.
- **User's Exact Words**: "Okay and back to the average transaction price: just verify that you're calculating it correctly.\nAverage transaction price: verify that you're calculating it correctly."

### ITEM-30: Verify RevPAR Calculation
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify that the calculation for RevPAR is correct.
- **User's Exact Words**: "RevPAR: verify that you're calculating it correctly."

### ITEM-31: Verify Zero Refunds
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify the calculation for refunds, as the user does not believe the current value of zero.
- **User's Exact Words**: "Zero refunds: I don't believe this. Please confirm that you're calculating this correctly."

### ITEM-32: Verify Number Refunded
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Verify the calculation for the number of items refunded, as the user does not believe the current value of zero.
- **User's Exact Words**: "The number refunded is zero. I don't believe this either."

### ITEM-33: Verify Discounted Metrics
- **Category**: VERIFICATION_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Double-check the calculations for both "number discounted" and "amount discounted", as they currently show zero and the user does not believe this.
- **User's Exact Words**: "Zero discounted and zero amount discounted: I don't believe those things.\nI think you need to double-check those for me."

### ITEM-34: Align Services Page Data with Operations Hub
- **Category**: SPEC_NEEDED
- **Priority**: MEDIUM
- **Motion Task Requested**: Yes
- **Description**: Create a Motion task for the user to specify how timeframes should affect checklists and services, so that the data on the Services page (like Baths showing 0 of 0) matches Operations Hub.
- **User's Exact Words**: "Next I've told you this before but the data on the Services page needs to match what we actually see in Operations Hub. That Baths figure, 0 of 0, actually, first off, the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now so create a motion task for me to do that."

### ITEM-35: Update Dashboard Buttons to Icons
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The Attendance and Inventory buttons on the dashboard are currently dashes but need to be updated to use icons, consistent with other buttons like EOD report, Check Out TV, and Photos.
- **User's Exact Words**: "Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos."

### ITEM-36: Graph Color Opacity
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Make the graph fill colors solid instead of transparent/fading out. They need to "pop" more.
- **User's Exact Words**: "On these graphs I don't like that the colors are so transparent and they're fading out as they go down. These need to be solid colors and really pop. I don't think they pop right now."

### ITEM-37: Graph X-Axis Labels
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: For the past week view, the X-axis should show 7 dates instead of just 4.
- **User's Exact Words**: "A lot of the time the X axis is not useful. Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7? It's a week. It's not that many data points."

### ITEM-38: Graph Data Points Quantity
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: Determine if there should only be exactly 7 data points (one per day) plotted on the graph for the past week view, rather than showing a high-frequency, jagged line with many data points.
- **User's Exact Words**: "It would also be nice if for each X axis you only had one data point connecting to it. I think that if you hover over the axis there should only be 7. This is actually a good question: should there only be 7 data points at that stage to be completely accurate? I don't know. Maybe it should be. Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?"

### ITEM-39: Graph Line Smoothing
- **Category**: UI_FIX
- **Priority**: LOW
- **Motion Task Requested**: No
- **Description**: The graphs currently use smoothed/rounded curves. The user is questioning this and later suggests a jagged line instead, or possibly showing a smoothed line of averages.
- **User's Exact Words**: "Maybe you should have a smoothed-out line that shows the averages in gray or something. That's kind of what we're doing now with these graphs. You show a continuous rounding graph. There's probably a term for it. It's not a line of best fit. It's something you can do. I'm sure there is a statistical term for it but you're smoothening out the lines to make it not jagged and make it round like you have already."

### ITEM-40: Revenue Graphs Styling
- **Category**: UI_FIX
- **Priority**: MEDIUM
- **Motion Task Requested**: No
- **Description**: Update both cash basis and accrual revenue graphs to use: a jagged line connecting exactly 7 data points, solid color fill beneath the line (no gradient), a subtle vertical line dropping from each data point down to the X-axis, and a larger dot on that line at the data point.
- **User's Exact Words**: "In my mind I feel like if you're looking at a graph of a week of revenue, you should see seven data points connected via a jagged graph with solid color beneath it, no gradient. Each value on the X-axis, maybe it should have a very subtle vertical line to its data point with a bigger dot on that line. This applies to both cash basis revenue and accrual revenue."

### ITEM-41: Revenue Split Concept Spec
- **Category**: SPEC_NEEDED
- **Priority**: LOW
- **Motion Task Requested**: Yes
- **Description**: Create a Motion task for the user to specify and develop the "revenue split concept" at a later time.
- **User's Exact Words**: "This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept."
