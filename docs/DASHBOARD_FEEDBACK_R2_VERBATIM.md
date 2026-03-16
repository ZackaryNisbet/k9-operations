# Dashboard Feedback Round 2 — Verbatim
**Date**: March 16, 2026 (3:08 AM EDT)
**Source**: User feedback after Wave 1 + Wave 2 deployment

---

## Dashboard

- Labels like "Today's Snapshot", "Customer Lifecycle", etc, are too subtle -- maybe make them green?
- Some of the values are smaller and black, where some are very slightly bigger and green. i think they should all be the slightly bigger + green versions.
- why does it show like 30 data points for the "today" view of the revenue graphs? tbh i question if there should even be a "today" view for the graph, maybe the default should be the week view but there is a dotted line connected to the "today" point on the graph showing the value with a written out value for today's written value too
- the x-axis on the revenue graphs -- can you add the day of the week to that?
- the data point dots on the revenue graphs are too big -- shrink them a bit. maybe make them smaller? are the dots even needed? think about what placer.ai and other sophisticated reporting platforms do.
- in the past week view, it says 181 in house? cannot be right. also it says 132% occupancy. also impossible lol
- how is this conversion rate metric being calculated? 22.2% with only 2 first time spenders (which should be the numerator) seems wrong
- can we create a full occupancy report page? so right now, if i click the occupancy figure on the dashboard, it should take me to a new page outlining occupancy over the past 30 days with a date picker identical to that on the dashboard. y axis occupancy 0% - 100%, x-axis 30 days listed. jagged lines point-to-point. when i change timeframes, it should have the same logic and functionality as the dashboard revenue graphs do.
- why is lapsed colors orange?
- why is their an attendance button on dashboard? remove.
- why is it still so fucking laggy? the data has not updated in 2 hours. it should all be local stored data, no delay.
- on the revenue graphs, make the colors on the revenue graphs the same.
- when "vs prior" is selected, there should be a second line on the revenue graphs showing the prior period data.
- modify the accrual revenue explainer to indicate the logic is taking the full reservation cost and dividing it by the number of nights

## Customer Lifecycle

- I see a lead pulled from a web form via ignite with no client name or phone number
- When i click "Ignite" on source, it should cascade down into showing the pulled ignite details
- there should be no entry ever in customer lifecycle with an update value = 0. it should always have a system explanation for how it got there. Always. A meaningful one too. All the customers in lapsed should have a system explanation for why they are there -- i.e. system detected last appt was x date, determined to be primary boarding customer, hit threshold of y, therefore moved to lapsed. are we polling all these customers daily? how frequently are we moving data around the lifecycle via the api to assess if any new leads should be pulled in from gingr, move an active client to lapsed, or moving lapsed out of lapsed to active, or moving leads to active, etc? this should be in settings and ideally a customizable threshold. i want to see every API call we make to/from gingr somewhere in settings with the frequency as well as the total projected daily calls associated with that frequency and factoring in the times set for those calls.
- Customers pulled from Gingr have pages on their client profile of dogs, reservations, payments, packages, ignite, lifecycle, notes, history
- Customers pulled from Ignite just have Lifecycle and Notes.
- Customers pulled from gingr have referral source, client since , total spent, total res, days since last visit, etc. customers from ignite only have source, created date, and stage.
- client pages for both customers pulled from gingr and those created inside our app via ignite or custom created via create client button absolutely need to have the same client page.
- btw the created dates for both customers from gingr and customers from ignite are wrong. they should reflect the created dates from the sources.
