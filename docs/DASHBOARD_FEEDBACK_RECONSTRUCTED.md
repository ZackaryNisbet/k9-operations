# Dashboard Feedback — Reconstructed from Context Summary
## Source: User message #7 (lost during context compaction)
## Date: March 15, 2026

> **NOTE**: The original verbatim feedback was lost during context window compaction.
> This is reconstructed from the summary notes. User should verify completeness.

---

## Feedback Categories (from summary)

### 1. Today's Snapshot Metrics — Wrong Values
- **Expected**: value appears wrong (shows 50)
- **In-House**: value may be wrong (shows 40, with 40B:0D split)
- **Going Home → Cancelled animation**: the Going Home metric (shows 0) has an issue with cancelled reservation animation
- **Occupancy calculation**: shows 143% which is clearly wrong — needs correct computation
- **Bookings**: should use `created_date` not `check_in` date (shows 10)
- **Tours**: value is wrong (shows 0)
- **Evals**: value is wrong (shows 1)

### 2. Customer Lifecycle Metrics — Wrong Values
- **At-Risk = 3,940**: this is wildly wrong — must exclude old/historical Gingr data
- **Lapsed threshold**: should be 90 days (not whatever it currently uses)
- **Outreaches**: miscounted (shows 9)
- **Converted / First-Time / Conversion Rate**: need verification (shows 10 converted, 90 first-time, 33.3%)

### 3. LTV & Client Metrics
- **Avg LTV**: label and/or formatting issues (shows $1,719)
- **Total Clients**: count is wrong (shows 4,824)

### 4. Financial Reporting
- **Transactions**: value is wrong (shows 188)
- **Rename "Avg Ticket" → "Avg Transaction Price"** (currently shows $107 as "Avg Ticket")
- **Verify RevPAR**: shows $85 — needs verification
- **Verify Refunds**: shows 0
- **Verify Discounts**: shows 0 / $0.00
- **Outstanding invoices metric**: needs to be added or verified

### 5. Attendance & Inventory
- **Icons not dashes**: Attendance and Inventory show "—" (em dashes) — should show icons instead

### 6. Chart Improvements
- **Solid colors, no gradient**: charts currently use gradient fills — should be solid
- **7 data points for "Past Week"**: week view should show exactly 7 data points (one per day)
- **Jagged/stepped lines, not smoothed**: lines should be angular/jagged connecting points, not smooth curves
- **Vertical lines to data points**: add vertical reference lines from data points down to X-axis
- **X-axis showing all dates**: every date should be labeled on the X-axis

### 7. Revenue Split
- Revenue split needs a spec/definition (currently shows 80% Board / 20% Day)

### 8. Auto-Refresh Behavior
- Auto-refresh should be **configurable in settings**
- Default: **15 minutes during business hours**
- Should be **off outside business hours**

### 9. Timeframe Selector
- **Animation lag**: switching timeframes still has noticeable lag/animation delay

### 10. Services & Checklists
- Timeframe behavior for services/checklists sections needs a spec — what happens when you change timeframes for these?

---

## Screenshot Reference
See `/home/user/workspace/image.jpg` for the "Past Week" dashboard view showing all issues above.

## User's Explicit Instruction
> "I don't want you to do any of the work. I want you to simply interpret my words here. Don't miss a single thing. Review it five times. Delegate to a quorum of agents to compare interpretation and then bring me a committee of agents... Kind of categorize the improvements and make it so I can just create prompts in motion or you create prompts for me in motion..."
