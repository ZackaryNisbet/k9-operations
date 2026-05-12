// Plain-English descriptions for every test in the suite.
// These are displayed on the Test Health dashboard so anyone — not just developers —
// can understand exactly what each test verifies.

const testDescriptions = {
  // ═══════════════════════════════════════════════════════════════════════
  // NIGHT COUNTING — How the system counts overnight stays
  // ═══════════════════════════════════════════════════════════════════════

  // countNights > typical boarding stays
  "countNights > typical boarding stays > counts a single night stay":
    "A dog that checks in on March 1st and checks out on March 2nd should be counted as a 1-night stay. This is the most common scenario and must be exactly right because it drives revenue calculations.",

  "countNights > typical boarding stays > counts a 2-night weekend stay":
    "A dog that checks in Friday and checks out Sunday should be counted as a 2-night stay. Weekend boarding is a very common booking pattern.",

  "countNights > typical boarding stays > counts a typical week-long stay (7 nights)":
    "A dog that boards for a full week (e.g. March 1–8) should be counted as exactly 7 nights. This is common when owners go on vacation.",

  "countNights > typical boarding stays > counts a 2-week stay (14 nights)":
    "A two-week boarding stay should be counted as exactly 14 nights. Longer stays like this are important to get right because the revenue impact is large.",

  "countNights > typical boarding stays > counts a 30-day long stay":
    "A full month boarding stay (March 1–31) should be counted as exactly 30 nights. Extended stays generate significant revenue and must be calculated precisely.",

  // countNights > edge cases
  "countNights > edge cases > returns 0 for same-day check-in/out (no overnight stay)":
    "If a dog checks in and out on the same day, the system should count zero nights. This prevents accidentally charging for a night when it was really a daycare visit or a quick pickup.",

  "countNights > edge cases > returns 0 when check-out is before check-in (invalid range)":
    "If someone accidentally enters a check-out date that's before the check-in date, the system should return zero nights instead of a negative number. This is a safety check to prevent broken calculations.",

  "countNights > edge cases > handles month boundaries correctly":
    "A stay from January 30th to February 2nd should be counted as 3 nights. The system must correctly handle the transition from one month to the next without miscounting.",

  "countNights > edge cases > handles year boundaries correctly":
    "A stay from December 30th to January 2nd (crossing New Year's) should be counted as 3 nights. The year changing in the middle of a stay must not confuse the night count.",

  "countNights > edge cases > handles February in a non-leap year":
    "A stay crossing the end of February in a normal year (e.g., Feb 27 to March 2, 2026) should count correctly. February has 28 days in most years, and the math needs to handle that.",

  "countNights > edge cases > handles February in a leap year":
    "A stay crossing the end of February in a leap year (e.g., Feb 27 to March 1, 2028) should count correctly. February has 29 days in leap years, and the system needs to account for the extra day.",

  "countNights > edge cases > handles very long stays (90+ days)":
    "A 90-day stay (January through March) should be counted as exactly 90 nights. Some dogs board for very long periods, and the count must stay accurate even for unusually long stays.",

  // countNights > DST transitions
  "countNights > DST transitions > handles spring forward (March DST)":
    "When clocks 'spring forward' in March (losing an hour), the night count should still be correct. A 2-night stay across the DST change should count as exactly 2 — not 1 or 3.",

  "countNights > DST transitions > handles fall back (November DST)":
    "When clocks 'fall back' in November (gaining an hour), the night count should still be correct. A 2-night stay across the DST change should count as exactly 2.",

  // ═══════════════════════════════════════════════════════════════════════
  // HOUR COUNTING — How the system calculates daycare hours
  // ═══════════════════════════════════════════════════════════════════════

  // countHours > typical daycare hours
  "countHours > typical daycare hours > calculates a full 8-hour day (7am to 3pm)":
    "A dog in daycare from 7:00 AM to 3:00 PM should be logged as 8 hours. This is a standard full-day daycare session.",

  "countHours > typical daycare hours > calculates a half day (7am to 12pm)":
    "A dog in daycare from 7:00 AM to 12:00 PM should be logged as 5 hours. Half-day pricing may apply depending on the threshold.",

  "countHours > typical daycare hours > calculates a long day (6am to 6pm)":
    "A dog in daycare from 6:00 AM to 6:00 PM should be logged as 12 hours. Some owners need early drop-off and late pickup.",

  "countHours > typical daycare hours > calculates a short visit (9am to 11am)":
    "A dog in daycare from 9:00 AM to 11:00 AM should be logged as 2 hours. Short visits still need accurate hour tracking.",

  // countHours > fractional hours
  "countHours > fractional hours > calculates 7:00 to 10:30 as 3.5 hours":
    "A daycare visit from 7:00 AM to 10:30 AM should calculate to exactly 3.5 hours. The system must handle half-hour increments correctly.",

  "countHours > fractional hours > calculates 8:15 to 16:45 as 8.5 hours":
    "A daycare visit from 8:15 AM to 4:45 PM should calculate to exactly 8.5 hours. Quarter-hour precision matters for accurate billing.",

  "countHours > fractional hours > calculates 9:00 to 9:15 as 0.25 hours":
    "Even a very short 15-minute visit (9:00 to 9:15) should calculate to 0.25 hours. The system needs to handle small time increments.",

  // countHours > default behavior
  "countHours > default behavior > returns 8 when both times are null":
    "If no check-in or check-out time is recorded, the system assumes a standard 8-hour day. This default prevents missing revenue when staff forget to log times.",

  "countHours > default behavior > returns 8 when check-in is null":
    "If only the check-in time is missing, the system still assumes a standard 8-hour day rather than showing zero hours.",

  "countHours > default behavior > returns 8 when check-out is null":
    "If only the check-out time is missing (dog is still there or staff forgot), the system assumes a standard 8-hour day.",

  "countHours > default behavior > returns 8 when both times are undefined":
    "If times are completely missing from the data, the system defaults to 8 hours rather than crashing or showing nothing.",

  "countHours > default behavior > returns 8 when both times are empty strings":
    "If times are recorded as blank text instead of actual times, the system defaults to 8 hours. This handles a common data entry issue.",

  // countHours > edge cases
  "countHours > edge cases > returns 0 when check-in equals check-out":
    "If the check-in and check-out times are identical (e.g., both 12:00 PM), the system should show 0 hours rather than a negative or incorrect number.",

  "countHours > edge cases > returns 0 when check-out is before check-in (negative prevented)":
    "If check-out time is accidentally entered as earlier than check-in (e.g., out at 7am, in at 3pm), the system returns 0 instead of a negative number. This is a safety guardrail.",

  "countHours > edge cases > handles midnight correctly (00:00 to 08:00)":
    "A stay from midnight (00:00) to 8:00 AM should calculate as 8 hours. Midnight is represented as 00:00 and must be handled properly.",

  "countHours > edge cases > handles late hours (20:00 to 23:00)":
    "A stay from 8:00 PM (20:00) to 11:00 PM (23:00) should calculate as 3 hours. Late-night times in 24-hour format must work correctly.",

  // ═══════════════════════════════════════════════════════════════════════
  // DATE MATH — Adding/subtracting days from dates
  // ═══════════════════════════════════════════════════════════════════════

  "addDays > adds 1 day correctly":
    "Adding 1 day to March 15th should give March 16th. This basic date math is used throughout the app for calculating stay durations and spreading revenue.",

  "addDays > adds 7 days correctly":
    "Adding 7 days to March 1st should give March 8th. Used when calculating weekly date ranges for reports.",

  "addDays > subtracts 1 day correctly (negative)":
    "Subtracting 1 day from March 15th should give March 14th. The system uses negative day additions to look backward in time for comparisons.",

  "addDays > handles month rollover":
    "Adding 1 day to January 31st should give February 1st. The system must correctly roll over from one month to the next.",

  "addDays > handles year rollover":
    "Adding 1 day to December 31st should give January 1st of the next year. Year boundaries must be handled cleanly.",

  "addDays > handles February end in non-leap year":
    "Adding 1 day to February 28th in a normal year should give March 1st (since there's no Feb 29 in non-leap years).",

  "addDays > handles February end in leap year":
    "Adding 1 day to February 28th in a leap year should give February 29th (not March 1st). And adding 1 day to Feb 29th should give March 1st.",

  "addDays > adds 0 days (no change)":
    "Adding 0 days to any date should return that same date. This sounds obvious, but it's a common source of off-by-one bugs.",

  "addDays > adds 30 days":
    "Adding 30 days to March 1st should give March 31st. Used for monthly reporting ranges.",

  "addDays > subtracts 30 days":
    "Subtracting 30 days from March 31st should give March 1st. Used for looking at 'previous month' comparisons.",

  // ═══════════════════════════════════════════════════════════════════════
  // CASH BASIS REVENUE — Total revenue based on when bookings are made
  // ═══════════════════════════════════════════════════════════════════════

  // Cash Basis Revenue > basic calculations
  "Cash Basis Revenue > basic calculations > calculates total revenue from boarding reservations":
    "Two boarding reservations worth $285 and $570 should add up to $855 total. This is the most basic revenue calculation — just summing up all booking totals.",

  "Cash Basis Revenue > basic calculations > calculates total with mixed service types":
    "Revenue from boarding ($285), daycare ($45), and evaluation ($25) should total $355, and each category should be tracked separately so you can see the revenue breakdown by service type.",

  "Cash Basis Revenue > basic calculations > calculates average transaction correctly":
    "Three bookings worth $100, $200, and $300 should have an average transaction value of $200. This metric helps you understand your typical booking size.",

  // Cash Basis Revenue > filtering
  "Cash Basis Revenue > filtering > excludes cancelled reservations":
    "Cancelled reservations should not count toward revenue. If you have a $285 booking and a $570 cancelled booking, total revenue should be $285 — not $855.",

  "Cash Basis Revenue > filtering > excludes reservations with zero pricing":
    "Reservations priced at $0 (like comps or test bookings) should be excluded from revenue totals and booking counts. They would skew the average transaction value.",

  "Cash Basis Revenue > filtering > excludes reservations with null pricing":
    "If a reservation has no pricing data at all (possibly due to a data issue), it should be excluded from revenue calculations rather than crashing the page.",

  // Cash Basis Revenue > zero/empty cases
  "Cash Basis Revenue > zero/empty cases > returns zero for empty reservations":
    "When there are no reservations at all, revenue should be $0, count should be 0, and average transaction should be $0. The dashboard shouldn't crash on an empty day.",

  "Cash Basis Revenue > zero/empty cases > returns zero when all are cancelled":
    "If every reservation in a period is cancelled, the revenue should be $0 and the count should be 0. Cancelled bookings never generate real revenue.",

  // ═══════════════════════════════════════════════════════════════════════
  // ACCRUAL REVENUE — Revenue spread evenly across each night of a stay
  // ═══════════════════════════════════════════════════════════════════════

  // Accrual > single boarding reservation spreading
  "Accrual Revenue (Nightly Spreading) > single boarding reservation spreading > spreads a 3-night stay evenly across nights":
    "A $285 boarding reservation for 3 nights should be split as $95 per night ($285 ÷ 3). This is how the system tracks daily revenue — instead of counting the full amount on check-in day, it spreads it evenly across all nights of the stay.",

  "Accrual Revenue (Nightly Spreading) > single boarding reservation spreading > spreads a 1-night stay to the check-in day only":
    "A $95 single-night stay should assign all revenue to the check-in date. The check-out date should show $0 because the dog didn't stay that night.",

  "Accrual Revenue (Nightly Spreading) > single boarding reservation spreading > spreads a 7-night stay correctly":
    "A $665 week-long stay should spread correctly across all 7 nights, and the total should add back up to exactly $665. Also verifies that 7 room-nights are counted (1 room × 7 nights).",

  // Accrual > partial date range
  "Accrual Revenue (Nightly Spreading) > partial date range > only counts nights within the requested date range":
    "If a dog stays 5 nights but you're only looking at a 2-day report window, only the 2 nights that overlap should be counted. This is critical for accurate daily and weekly revenue reports.",

  "Accrual Revenue (Nightly Spreading) > partial date range > excludes revenue when reservation is completely outside range":
    "If a reservation doesn't overlap with the report dates at all, it should contribute $0 to that report. A March 10–13 booking shouldn't show up in a March 1–5 report.",

  // Accrual > multiple reservations
  "Accrual Revenue (Nightly Spreading) > multiple reservations > sums revenue from multiple boarding reservations on same night":
    "Two dogs boarding on the same night ($95 and $75) should show $170 total revenue for that night, with 2 rooms occupied. The system must correctly add revenue from multiple simultaneous stays.",

  "Accrual Revenue (Nightly Spreading) > multiple reservations > sums revenue from overlapping boarding stays":
    "When two reservations overlap on some nights but not others, each night should show the correct combined revenue. For example, if Dog A ($95/night) stays March 1–3 and Dog B ($75/night) stays March 2–4, then March 2 should show $170 (both dogs), while March 1 shows only $95 and March 4 shows only $75.",

  // Accrual > daycare revenue
  "Accrual Revenue (Nightly Spreading) > daycare revenue > assigns full daycare cost to check-in day":
    "A $45 daycare visit should be assigned entirely to the day it happened. Unlike boarding (which spreads across nights), daycare is a single-day service.",

  "Accrual Revenue (Nightly Spreading) > daycare revenue > does not spread daycare across multiple days":
    "A daycare charge on March 1st should only appear on March 1st — not spread to March 2nd or 3rd. Daycare is a one-day event, not a multi-night stay.",

  "Accrual Revenue (Nightly Spreading) > daycare revenue > excludes daycare outside date range":
    "A daycare visit on March 10th should not appear in a report covering March 1–5. Only visits within the report window count.",

  // Accrual > mixed boarding + daycare
  "Accrual Revenue (Nightly Spreading) > mixed boarding + daycare > correctly combines boarding and daycare on same day":
    "If a boarding dog's nightly revenue is $95 and a daycare dog visits for $45 on the same day, the total for that day should be $140. Boarding and daycare revenue should combine correctly.",

  "Accrual Revenue (Nightly Spreading) > mixed boarding + daycare > totals correctly across full range":
    "A 3-night boarding stay ($285) plus two daycare visits ($45 each) should total $375 across the date range. The system must track boarding and daycare revenue separately but sum them correctly.",

  // Accrual > cancelled reservations
  "Accrual Revenue (Nightly Spreading) > cancelled reservations > excludes cancelled boarding reservations":
    "Cancelled boarding reservations should generate $0 in accrual revenue. Even though the booking existed, no stay happened, so no revenue should be recognized.",

  "Accrual Revenue (Nightly Spreading) > cancelled reservations > excludes cancelled daycare reservations":
    "Cancelled daycare visits should generate $0 in revenue. If a daycare appointment was cancelled, it should not appear in daily revenue figures.",

  // Accrual > zero-night / zero-price edge cases
  "Accrual Revenue (Nightly Spreading) > zero-night / zero-price edge cases > skips same-day boarding (zero nights)":
    "If a boarding reservation has the same check-in and check-out date (zero nights), no revenue should be spread. You can't divide by zero nights, so this is safely skipped.",

  "Accrual Revenue (Nightly Spreading) > zero-night / zero-price edge cases > handles zero-priced boarding reservation":
    "A free/comp boarding stay ($0) should still count as occupied rooms but contribute $0 revenue. The rooms are physically in use even if no money was charged.",

  "Accrual Revenue (Nightly Spreading) > zero-night / zero-price edge cases > handles missing pricing object":
    "If a reservation's pricing data is completely missing (data issue), the system should treat it as $0 revenue but still count room occupancy. It should not crash.",

  // Accrual > netRevenue
  "Accrual Revenue (Nightly Spreading) > netRevenue calculation > netRevenue equals totalRevenue when no discounts":
    "When there are no discounts applied, net revenue should equal total revenue. This confirms the baseline calculation is correct before any discounts are subtracted.",

  // Accrual > day generation
  "Accrual Revenue (Nightly Spreading) > day generation > generates correct number of days in range":
    "A report from March 1st to March 7th should generate exactly 7 days. Each day gets its own revenue tracking entry.",

  "Accrual Revenue (Nightly Spreading) > day generation > generates a single day for same-day range":
    "A report for just one day (e.g., March 1st to March 1st) should generate exactly 1 day entry. Single-day reports must work.",

  // ═══════════════════════════════════════════════════════════════════════
  // REVENUE TRENDS — Comparing current vs. previous period
  // ═══════════════════════════════════════════════════════════════════════

  "Revenue Trend Calculation > calculates positive trend correctly":
    "If current revenue is $1,200 and last period was $1,000, the trend should show +20%. This tells you revenue grew by 20% compared to the prior period.",

  "Revenue Trend Calculation > calculates negative trend correctly":
    "If current revenue is $800 and last period was $1,000, the trend should show -20%. This alerts you that revenue dropped by 20%.",

  "Revenue Trend Calculation > returns 0 when previous is zero (no division by zero)":
    "If there was no revenue last period ($0), the trend should be 0% — not an error or infinity. You can't calculate a percentage change from nothing.",

  "Revenue Trend Calculation > returns 0 when both are zero":
    "If both current and previous revenue are $0, the trend should be 0%. No change happened.",

  "Revenue Trend Calculation > calculates 100% increase correctly":
    "If current revenue ($2,000) is double last period ($1,000), the trend should show exactly +100%.",

  "Revenue Trend Calculation > calculates 50% decrease correctly":
    "If current revenue ($500) is half of last period ($1,000), the trend should show exactly -50%.",

  // ═══════════════════════════════════════════════════════════════════════
  // DISCOUNT BREAKDOWN — Comparing actual prices to standard rack rates
  // ═══════════════════════════════════════════════════════════════════════

  "Discount Breakdown > identifies at-rack reservation (no discount)":
    "A 3-night Luxury Suite stay charged at $285 ($95/night × 3) is exactly at rack rate. The system should classify it as 'at rack' with $0 in discounts.",

  "Discount Breakdown > identifies discounted reservation (>2% below rack)":
    "A 3-night Luxury Suite stay charged at $240 instead of the $285 rack rate is a $45 discount (about 16% off). The system should flag this as a discounted reservation.",

  "Discount Breakdown > considers within 2% tolerance as at-rack":
    "A 3-night Luxury Suite stay charged at $280 instead of $285 is only 1.75% off — within the 2% tolerance. The system should still count this as 'at rack' since tiny rounding differences aren't real discounts.",

  "Discount Breakdown > handles multiple room types correctly":
    "When one Luxury Suite reservation is at rack rate ($285) and one Executive Room is discounted ($150 vs. $225 rack), the system should correctly tally 1 at-rack, 1 discounted, and a $75 total discount across different room types.",

  "Discount Breakdown > excludes cancelled reservations":
    "Cancelled reservations should not be included in discount analysis. A cancelled booking's pricing is irrelevant since no stay occurred.",

  "Discount Breakdown > handles unknown room type (0 rack rate)":
    "If a reservation has a room type the system doesn't recognize, it can't determine a rack rate, so it's counted as 'at rack' by default. This prevents false discount alerts for custom or new room types.",

  "Discount Breakdown > returns zero totals for empty reservations":
    "When there are no reservations, all discount metrics should be zero. The analysis should handle empty data gracefully.",

  // ═══════════════════════════════════════════════════════════════════════
  // DEFAULT PRICING — Verifying the standard rate card is correct
  // ═══════════════════════════════════════════════════════════════════════

  "Default Pricing Constants > has correct Luxury Suite rate":
    "The Luxury Suite nightly rate should be $95. If this constant is wrong, every revenue calculation for Luxury Suites will be off.",

  "Default Pricing Constants > has correct Executive Room rate":
    "The Executive Room nightly rate should be $75. This is the second-highest room tier.",

  "Default Pricing Constants > has correct Double Compartment rate":
    "The Double Compartment nightly rate should be $65. This is a mid-tier boarding option.",

  "Default Pricing Constants > has correct Single Compartment rate":
    "The Single Compartment nightly rate should be $55. This is the most affordable boarding option.",

  "Default Pricing Constants > has correct daycare full-day rate":
    "The full-day daycare rate should be $45. This is charged when a dog stays longer than the half-day threshold.",

  "Default Pricing Constants > has correct daycare half-day rate":
    "The half-day daycare rate should be $30. This is charged when a dog's visit is shorter than the half-day threshold.",

  "Default Pricing Constants > has correct half-day threshold":
    "The half-day threshold should be 5 hours. Dogs staying fewer than 5 hours get charged the half-day rate; 5 hours or more gets the full-day rate.",

  "Default Pricing Constants > has correct multi-dog discount":
    "The multi-dog discount should be $20. When a family boards multiple dogs, each additional dog gets $20 off per night.",

  // ═══════════════════════════════════════════════════════════════════════
  // OCCUPANCY RATE — Percentage of rooms filled over a time period
  // ═══════════════════════════════════════════════════════════════════════

  // Occupancy Rate (Accrual-based) > basic occupancy
  "Occupancy Rate (Accrual-based) > basic occupancy > calculates 100% occupancy when all rooms filled every night":
    "If you have 2 rooms and 2 dogs boarding for 3 nights, that's 100% occupancy — every room was filled every night. This is the ideal scenario for maximizing revenue.",

  "Occupancy Rate (Accrual-based) > basic occupancy > calculates 50% occupancy correctly":
    "If you have 4 rooms but only 2 dogs boarding for 1 night, that's 50% occupancy. Half your capacity was unused that night.",

  "Occupancy Rate (Accrual-based) > basic occupancy > calculates 0% occupancy when no boarders":
    "If no dogs are boarding, occupancy should be 0% regardless of how many rooms you have. An empty facility is at 0% occupancy.",

  "Occupancy Rate (Accrual-based) > basic occupancy > calculates 25% occupancy (1 of 4 rooms, 1 night)":
    "1 dog in a 4-room facility for 1 night is 25% occupancy. Only a quarter of your rooms were in use.",

  // Occupancy Rate (Accrual-based) > multi-day occupancy
  "Occupancy Rate (Accrual-based) > multi-day occupancy > averages occupancy over multiple days":
    "Over a 3-day period with 2 rooms: if Day 1 has 2 dogs, Day 2 has 1 dog, and Day 3 has 0 dogs, the average occupancy is 50% (3 room-nights used out of 6 available). The system must average across the full period, not just look at one day.",

  // Occupancy Rate (Accrual-based) > edge cases
  "Occupancy Rate (Accrual-based) > edge cases > returns 0 when totalRoomCount is 0":
    "If the facility has 0 rooms configured, occupancy should be 0% instead of causing a divide-by-zero error. This is a safety check.",

  "Occupancy Rate (Accrual-based) > edge cases > daycare does not count toward room occupancy":
    "Daycare dogs don't sleep in boarding rooms, so they should not count toward room occupancy. A daycare-only day should show 0% room occupancy.",

  "Occupancy Rate (Accrual-based) > edge cases > can exceed 100% if more dogs than rooms (double occupancy)":
    "If 3 dogs share 2 rooms (some rooms have 2 dogs), occupancy can go above 100%. This is valid — it means rooms are being double-booked, which happens with dogs from the same family.",

  // ═══════════════════════════════════════════════════════════════════════
  // RevPAR — Revenue Per Available Room (key hotel/boarding metric)
  // ═══════════════════════════════════════════════════════════════════════

  "RevPAR (Revenue Per Available Room) > calculates RevPAR for single-night, single-room scenario":
    "One dog paying $95 in a 1-room facility for 1 night gives a RevPAR of $95. RevPAR tells you how much revenue each room generates on average — it's a key performance metric in the boarding industry.",

  "RevPAR (Revenue Per Available Room) > divides revenue by total available room-nights":
    "One dog paying $95 in a 4-room facility for 1 night gives a RevPAR of $23.75 ($95 ÷ 4 rooms). Even though one room earned $95, RevPAR accounts for the 3 empty rooms that earned nothing.",

  "RevPAR (Revenue Per Available Room) > calculates RevPAR over multi-day range":
    "One dog in a 2-room facility for 3 nights at $285 total gives a RevPAR of $47.50 ($285 ÷ 6 available room-nights). The calculation must account for both rooms and days.",

  "RevPAR (Revenue Per Available Room) > returns 0 RevPAR when no boarding revenue":
    "If there are no boarding dogs, RevPAR should be $0. Empty rooms generate no revenue.",

  "RevPAR (Revenue Per Available Room) > returns 0 RevPAR when totalRoomCount is 0":
    "If the facility has 0 rooms configured, RevPAR should be $0 instead of causing a divide-by-zero error.",

  "RevPAR (Revenue Per Available Room) > excludes daycare from RevPAR (boarding only)":
    "Daycare revenue should not be included in RevPAR because RevPAR is specifically about room revenue. A daycare visit doesn't use a boarding room.",

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY REPORT OCCUPANCY — Snapshot occupancy at a point in time
  // ═══════════════════════════════════════════════════════════════════════

  "Daily Report Occupancy (Point-in-Time) > calculates occupancy from room counts":
    "With 3 boarding dogs and 10 total rooms (2 Luxury Suites, 3 Executive Rooms, 5 Single Compartments), today's occupancy is 30%. This is a simple snapshot — how full is the facility right now?",

  "Daily Report Occupancy (Point-in-Time) > returns 0% with no boarding dogs":
    "If no dogs are currently boarding, daily occupancy is 0% — the facility is empty today.",

  "Daily Report Occupancy (Point-in-Time) > returns 0% with no rooms":
    "If no rooms are configured in the system, occupancy should be 0% rather than causing an error. This is a safety check for new facility setup.",

  "Daily Report Occupancy (Point-in-Time) > returns 100% at full capacity":
    "With 2 dogs in a 2-room facility, occupancy is exactly 100%. The facility is completely full.",

  "Daily Report Occupancy (Point-in-Time) > rounds to nearest integer":
    "1 dog in a 3-room facility is 33.33...% occupancy, which should be rounded to 33%. The dashboard shows whole numbers for cleaner display.",

  "Daily Report Occupancy (Point-in-Time) > handles non-array room values gracefully":
    "If some room data is corrupted or missing (null instead of a list), the system should only count valid room entries. It should not crash on bad data.",

  // ═══════════════════════════════════════════════════════════════════════
  // RESERVATION TYPE CLASSIFICATION — Identifying what kind of visit it is
  // ═══════════════════════════════════════════════════════════════════════

  // classifyReservationType > boarding types
  "classifyReservationType > boarding types > classifies standard boarding":
    "A reservation labeled 'Boarding' should be recognized as a boarding visit. This is the most common reservation type.",

  "classifyReservationType > boarding types > classifies boarding with room type":
    "A reservation labeled 'Boarding | Luxury Suite (All Inclusive)' should still be recognized as boarding, even with the room details appended to the name.",

  "classifyReservationType > boarding types > classifies boarding with various casing":
    "Whether the label says 'BOARDING', 'boarding', or 'Boarding', it should always be recognized as boarding. The system should not be case-sensitive.",

  // classifyReservationType > daycare types
  "classifyReservationType > daycare types > classifies standard daycare":
    "A reservation labeled 'Daycare' should be recognized as a daycare visit.",

  "classifyReservationType > daycare types > classifies day care (with space)":
    "A reservation labeled 'Day Care' (with a space) should still be recognized as daycare. Different data sources may format this differently.",

  "classifyReservationType > daycare types > classifies daycare with additional details":
    "A reservation labeled 'Full Day Daycare' should still be recognized as daycare, even with extra words in the name.",

  // classifyReservationType > day boarding
  "classifyReservationType > day boarding > classifies day boarding":
    "A reservation labeled 'Day Boarding' should be classified as day boarding — a distinct service type that's different from regular boarding and daycare.",

  "classifyReservationType > day boarding > classifies exact match \"day boarding\"":
    "The lowercase version 'day boarding' should also be classified correctly. Data might come in with varying capitalization.",

  "classifyReservationType > day boarding > day boarding takes priority over plain boarding":
    "'Day Boarding Special' should be classified as day boarding, not regular boarding. Even though 'boarding' appears in the name, the 'day boarding' pattern should take priority.",

  // classifyReservationType > evaluation types
  "classifyReservationType > evaluation types > classifies evaluation":
    "A reservation labeled 'Evaluation' should be recognized as an evaluation visit. These are assessment visits before a dog can start boarding or daycare.",

  "classifyReservationType > evaluation types > classifies eval shorthand":
    "A reservation labeled 'Eval' (abbreviated) should still be recognized as an evaluation.",

  "classifyReservationType > evaluation types > classifies evaluation with details":
    "'Daycare Evaluation' should be classified as an evaluation. The word 'evaluation' takes priority over 'daycare' to correctly identify the visit purpose.",

  // classifyReservationType > tour types
  "classifyReservationType > tour types > classifies tour":
    "A reservation labeled 'Tour' should be recognized as a facility tour. These are prospective client visits.",

  "classifyReservationType > tour types > classifies facility tour":
    "'Facility Tour' should also be classified as a tour.",

  // classifyReservationType > grooming types
  "classifyReservationType > grooming types > classifies grooming":
    "'Grooming' should be recognized as a grooming service.",

  "classifyReservationType > grooming types > classifies bath":
    "'Bath' should also be classified under grooming. Baths are a grooming service.",

  "classifyReservationType > grooming types > classifies full groom":
    "'Full Groom Package' should be classified as grooming.",

  // classifyReservationType > edge cases
  "classifyReservationType > edge cases > returns other for null":
    "If the reservation type is null (missing), the system should classify it as 'other' instead of crashing.",

  "classifyReservationType > edge cases > returns other for undefined":
    "If the reservation type is undefined (missing from data), it should be classified as 'other'.",

  "classifyReservationType > edge cases > returns other for empty string":
    "If the reservation type is an empty string, it should be classified as 'other'. No useful type information is available.",

  "classifyReservationType > edge cases > returns other for unrecognized types":
    "A reservation type like 'Walking Service' that doesn't match any known category should be classified as 'other' rather than causing an error.",

  // ═══════════════════════════════════════════════════════════════════════
  // RESERVATION STATUS CLASSIFICATION — Determining the current state
  // ═══════════════════════════════════════════════════════════════════════

  "classifyReservationStatus > classifies cancelled reservation":
    "If a reservation has a cancellation date, it should be classified as 'cancelled' regardless of any other dates. Cancelled is the final state.",

  "classifyReservationStatus > classifies checked-out reservation (both dates present)":
    "A reservation with both a check-in date and a check-out date means the dog came and left — it should be classified as 'checked-out'.",

  "classifyReservationStatus > classifies checked-in reservation (no check-out)":
    "A reservation with a check-in date but no check-out date means the dog is currently at the facility — it should be classified as 'checked-in'.",

  "classifyReservationStatus > classifies upcoming reservation (future start date)":
    "A reservation with a start date in the future (and no check-in yet) should be classified as 'upcoming'. This dog hasn't arrived yet.",

  "classifyReservationStatus > defaults to checked-out for past reservation with no dates":
    "If a reservation has no dates at all (rare data issue), it defaults to 'checked-out' as the safest assumption. It won't accidentally show up as an active dog.",

  "classifyReservationStatus > cancelled takes priority over checked-in":
    "If a reservation has both a cancellation date and a check-in date (edge case), 'cancelled' wins. The cancellation overrides everything else.",

  "classifyReservationStatus > cancelled takes priority over checked-out":
    "If a reservation has a cancellation date plus both check-in and check-out dates, it's still classified as 'cancelled'. Cancellation is always the top priority.",

  // ═══════════════════════════════════════════════════════════════════════
  // ROOM EXTRACTION — Identifying which room type from the reservation name
  // ═══════════════════════════════════════════════════════════════════════

  "extractRoomFromType > extracts Luxury Suite from full type name":
    "From 'Boarding | Luxury Suite (All Inclusive)', the system should extract 'Luxury Suite' as the room type. This is used to look up the correct nightly rate.",

  "extractRoomFromType > extracts Executive Room from full type name":
    "From 'Boarding | Executive Room (All Inclusive)', the system should extract 'Executive Room' as the room type.",

  "extractRoomFromType > extracts Double Compartment":
    "The system should recognize and extract 'Double Compartment' from a full reservation type name.",

  "extractRoomFromType > extracts Single Compartment":
    "The system should recognize and extract 'Single Compartment' from a full reservation type name.",

  "extractRoomFromType > returns null for unknown room type":
    "A daycare reservation like 'Daycare | Full Day' has no boarding room, so the system should return null. Not every reservation has a room.",

  "extractRoomFromType > returns null for null input":
    "If the reservation type is null (missing data), the system should return null instead of crashing.",

  "extractRoomFromType > returns null for undefined input":
    "If the reservation type is undefined, the system should return null instead of crashing.",

  "extractRoomFromType > is case insensitive":
    "The system should find 'Luxury Suite' even if the input is all lowercase ('boarding | luxury suite'). Data formatting may vary.",

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVE DOG COUNTING — How many dogs are in the facility
  // ═══════════════════════════════════════════════════════════════════════

  // Active Dog Counting > boarding dogs
  "Active Dog Counting > boarding dogs > counts checked-in boarding dogs":
    "Dogs with a status of 'checked-in' for boarding should be counted as active boarding dogs. These are the dogs physically in the facility right now.",

  "Active Dog Counting > boarding dogs > counts upcoming boarding within date range":
    "Upcoming boarding reservations whose dates overlap with today should also be counted. This helps plan for expected arrivals.",

  "Active Dog Counting > boarding dogs > excludes upcoming boarding outside date range":
    "An upcoming boarding reservation that doesn't start until next week should not be counted in today's dog count.",

  "Active Dog Counting > boarding dogs > excludes cancelled boarding":
    "Cancelled boarding reservations should never be counted as active dogs. Those dogs aren't coming.",

  "Active Dog Counting > boarding dogs > excludes checked-out boarding":
    "Dogs that have already checked out should not be counted as active. They've gone home.",

  // Active Dog Counting > daycare dogs
  "Active Dog Counting > daycare dogs > counts checked-in daycare dogs":
    "Dogs currently checked in for daycare should be counted in the daycare total. These dogs are at the facility for the day.",

  "Active Dog Counting > daycare dogs > counts upcoming daycare within date range":
    "Upcoming daycare reservations for today should be included in the count so staff can plan for expected arrivals.",

  // Active Dog Counting > total attendance
  "Active Dog Counting > total attendance > calculates total attendance as boarding + daycare":
    "Total attendance is boarding dogs plus daycare dogs. If 2 dogs are boarding and 3 are in daycare, total attendance is 5 dogs in the facility.",

  "Active Dog Counting > total attendance > returns 0 for all counts when no reservations":
    "When there are no reservations at all, all dog counts should be 0. The facility is empty.",

  "Active Dog Counting > total attendance > excludes non-boarding/daycare types from count":
    "Evaluations, grooming appointments, and tours should not be counted in the active dog total. Only boarding and daycare dogs are 'in the facility' for capacity purposes.",

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE PLAY STATS — Tracking required play sessions
  // ═══════════════════════════════════════════════════════════════════════

  "Private Play Stats > counts day boarding dogs as PP dogs":
    "Day boarding dogs automatically get Private Play sessions as part of their service. Each day boarding dog needs 3 play sessions per day.",

  "Private Play Stats > counts boarding dogs with Private Play add-on":
    "Boarding dogs that have 'Private Play' as an add-on service should be counted as PP dogs. They need 3 sessions per day.",

  "Private Play Stats > does not count boarding dogs without Private Play":
    "Boarding dogs that only have other add-ons (like 'Bath') but not Private Play should not be counted. They don't need play sessions.",

  "Private Play Stats > counts multiple PP dogs correctly":
    "If 3 dogs need Private Play, the system should calculate 9 required sessions (3 dogs × 3 sessions each). Staff needs this to plan their day.",

  "Private Play Stats > excludes dogs not checked in on the given date":
    "A day boarding dog scheduled for March 5th should not appear in the March 3rd PP count. Play sessions are only needed on the actual day.",

  "Private Play Stats > excludes non-checked-in dogs":
    "Dogs with 'upcoming' status (not yet arrived) should not be counted for today's PP sessions. Sessions are only needed for dogs currently at the facility.",

  "Private Play Stats > returns 0 for empty reservations":
    "When there are no reservations, PP dog count and required sessions should both be 0.",

  "Private Play Stats > handles service objects with name property":
    "If services are stored as objects (like {name: 'Private Play Session'}) instead of plain strings, the system should still detect Private Play correctly.",

  "Private Play Stats > handles no _services property":
    "If a reservation has no services data at all, the system should not crash — it should simply not count that dog for PP.",

  // ═══════════════════════════════════════════════════════════════════════
  // SERVICE MATCHING — Checking if a reservation includes a specific service
  // ═══════════════════════════════════════════════════════════════════════

  "resSvcIncludes > finds service by partial string match":
    "The system should find 'Private Play' in a list of services like ['Private Play', 'Bath & Brush']. Exact partial matching enables flexible service lookups.",

  "resSvcIncludes > is case insensitive":
    "Searching for 'private play' should match 'PRIVATE PLAY'. Service names might be stored in different cases across systems.",

  "resSvcIncludes > finds partial matches":
    "Searching for 'Private Play' should match 'Private Play Session'. The search term doesn't need to match the full service name.",

  "resSvcIncludes > works with object services (name property)":
    "If services are stored as objects with a 'name' field (instead of plain strings), the system should still find the match.",

  "resSvcIncludes > returns false when service not found":
    "If the service isn't in the list, the system should return false. Searching for 'Grooming' in ['Private Play'] should not match.",

  "resSvcIncludes > returns false when _services is undefined":
    "If the reservation has no services field at all (undefined), the system should return false instead of crashing.",

  "resSvcIncludes > returns false when _services is null":
    "If the services field is explicitly null, the system should return false instead of crashing.",

  "resSvcIncludes > returns false for empty services array":
    "If the services list exists but is empty ([]), the system should return false. No services means no match.",

  // ═══════════════════════════════════════════════════════════════════════
  // COMPANY DIRECTORY — Manual directory source of truth and generated chart
  // ═══════════════════════════════════════════════════════════════════════

  "company directory canonical org model > maps Supabase people and reports_to edges into Balkan id/pid nodes":
    "The org chart renderer should receive id/pid nodes derived from Supabase directory people and reporting edges, so the chart never becomes a separately maintained data source.",

  "company directory canonical org model > does not create a visible synthetic K9 Operations root":
    "The chart should not show a fake K9 Operations parent node because leadership hierarchy must come only from canonical directory relationships.",

  "company directory canonical org model > passes Supabase profile photos and initials into org chart render metadata":
    "The org chart adapter should receive profile photo URLs and initials derived from Supabase people rows so card photos render without making Balkan a data source.",

  "company directory canonical org model > uses partner render metadata for secondary co-leader edges without changing reports_to":
    "Secondary co-leader relationships should be rendered as partner metadata for the chart adapter without creating a false direct reporting chain.",

  "company directory canonical org model > derives side-by-side leader and assistant placement from K9 presentation metadata":
    "Side-by-side leader and assistant placement should come from K9-owned presentation metadata rather than opaque Balkan chart state.",

  "company directory canonical org model > does not include inactive people in the chart unless requested":
    "Inactive directory people should stay available in the table but stay out of the default org chart unless the user explicitly includes inactive records.",

  "company directory canonical org model > detects illegal reporting cycles before persistence":
    "Changing a manager should be blocked when it would put a person under one of their own reports and create a reporting cycle.",

  "company directory canonical org model > rejects inactive managers and self-reporting":
    "The manager selector should reject invalid relationships, including self-reporting and assigning an inactive person as a manager.",
};

export default testDescriptions;
