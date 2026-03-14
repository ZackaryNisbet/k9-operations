# Revenue Calculations Audit — K9 Operations Lite
**Audited:** Saturday, March 14, 2026  
**Auditor:** Computer (automated code review)

---

## Summary

The revenue logic is **structurally sound** with **3 minor issues** and **2 gaps** identified. No critical calculation errors found. The app correctly distinguishes cash-basis vs. accrual-basis accounting, and the core math (RevPAR, occupancy, night-spreading) is correct.

---

## Audit Scope

| Area | File | Lines | Status |
|------|------|-------|--------|
| Cash Basis Revenue | LiteApp.jsx | 10658-10686 | ✅ PASS (1 minor issue) |
| Accrual Revenue | LiteApp.jsx | 10688-10729 | ✅ PASS (1 minor issue) |
| RevPAR | LiteApp.jsx | 10727 | ✅ PASS |
| Occupancy Rate | LiteApp.jsx | 10726 | ✅ PASS |
| Discount Breakdown | LiteApp.jsx | 10731-10736 | ⚠️ STUB (not implemented) |
| Funnel Revenue | LiteApp.jsx | 4034-4055 | ✅ PASS (1 minor issue) |
| Pricing Source | LiteApp.jsx | 1529 | ✅ PASS |
| Night Count | LiteApp.jsx | 511-514 | ✅ PASS |
| NLP Revenue Queries | LiteApp.jsx | 10790-10900 | ✅ PASS |

---

## Detailed Findings

### ✅ 1. Pricing Data Source (PASS)
```js
const price = r.transaction?.price || r.deposit?.amount || 0;
```
**Assessment:** Correct. Uses Gingr's `transaction.price` as primary (actual charged amount), falls back to `deposit.amount`, then 0. This is the right priority — transaction price reflects what was actually charged.

### ✅ 2. Cash Basis Revenue (PASS, 1 minor issue)
```js
const total = resInRange.reduce((sum, r) => sum + (r.pricing?.total || 0), 0);
```
**Assessment:** Mathematically correct. Sums all reservation totals within the date range. Date filtering uses `r.checkIn >= dateFrom && r.checkIn <= dateTo` which is cash-basis (recognized at check-in).

**Minor Issue:** Revenue is attributed to check-in date, not payment date. Since Gingr doesn't provide actual payment timestamps in the synced data, this is the best approximation available. However, for stays that span month boundaries, this front-loads all revenue to the check-in month. This is a known limitation of cash-basis when exact payment dates aren't available.

### ✅ 3. Accrual Revenue — Night Spreading (PASS, 1 minor issue)
```js
const perNightRate = (res.pricing?.total || 0) / totalNights;
// ... loop spreading perNightRate across each night
```
**Assessment:** Mathematically correct. Evenly distributes total boarding revenue across each night of the stay. This is the standard accrual method.

**Minor Issue:** The `perNightRate` calculation divides total price (which may include add-on services like baths, private play, etc.) by the number of nights. This means add-on revenue gets spread across nights rather than recognized on the day the service was performed. This is acceptable for dashboard-level reporting but should be noted. A more granular approach would separate base room rate from add-on services, but that would require additional Gingr data (service pricing breakdown) that isn't currently available.

### ✅ 4. Daycare Accrual (PASS)
```js
if (dayData[res.checkIn]) dayData[res.checkIn].daycareRevenue += (res.pricing?.total || 0);
```
**Assessment:** Correct. Daycare is a single-day service, so recognizing full revenue on check-in date is proper accrual.

### ✅ 5. RevPAR (PASS)
```js
const revPAR = totalRoomCount > 0 && current.days.length > 0 
  ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) 
  : 0;
```
**Assessment:** Correct. Revenue Per Available Room = Boarding Revenue / (Total Rooms × Days). Properly uses only boarding revenue (not daycare) in the numerator. Division by zero is guarded.

### ✅ 6. Occupancy Rate (PASS)
```js
const occupancyRate = totalRoomCount > 0 && current.days.length > 0 
  ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 
  : 0;
```
**Assessment:** Correct. `roomsOccupied` is incremented once per reservation per night in the accrual loop (same loop as revenue spreading). This means each room-night counts as 1 unit of occupancy. The denominator is total available room-nights. Standard hotel occupancy formula.

### ✅ 7. Night Count (PASS)
```js
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};
```
**Assessment:** Correct. Uses noon timestamps to avoid DST edge cases. `Math.round` handles any floating-point drift. `Math.max(0, ...)` prevents negative nights. Check-in on 3/10, check-out on 3/12 = 2 nights. ✅

### ⚠️ 8. Discount Breakdown (STUB — Not Implemented)
```js
const discountBreakdown = useMemo(() => {
  const byType = { none: 0, percent: 0, flat: 0, coupon: 0, multidog: 0 };
  const byAmount = { none: 0, percent: 0, flat: 0, coupon: 0, multidog: 0 };
  const grossRevenue = accrualData.current.totals.totalRevenue;
  return { byType, byAmount, grossRevenue, totalDiscounts: 0 };
}, [accrualData.current]);
```
**Assessment:** This is a stub — all discount counts are hardcoded to 0. The UI renders the Discount Transparency section with these zeros. Since Gingr's synced reservation data doesn't include discount breakdown fields (just the final `transaction.price`), implementing this would require either:
1. Syncing additional Gingr data (discount records)
2. Computing discounts from the difference between rack rate × nights and actual price

**Recommendation:** Either implement option 2 using `LITE_DEF_PRICING.boardingRates` as rack rates, or hide the Discount Transparency section until real data is available. Showing zeros is misleading.

### ✅ 9. Funnel Revenue (PASS, 1 minor issue)
```js
const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
```
**Assessment:** Correct for its stated purpose. Uses `totalSpent` from `serverStats` (computed server-side from all reservations).

**Minor Issue:** The comment says "use their total spend since we can't date-filter without reservations" — this means new customer revenue includes ALL historical spend, not just spend within the selected date range. For a new customer who was acquired in the selected period but had 10 past reservations at another location, this could overcount. In practice, since K9 Cherry Hill is a single location, this is unlikely to be a real problem.

### ✅ 10. NLP Revenue Queries (PASS)
The NLP engine correctly routes revenue questions to the right calculation functions. `revBySuite`, `revByCategory`, `revTrend`, `revTotal` all properly aggregate from the same `cashBasisData` and `accrualData` sources. No calculation discrepancies between the NLP answers and the dashboard KPIs.

---

## Recommendations

### Must Fix
1. **Discount section showing zeros** — Either implement discount estimation using rack rates, or conditionally hide the "Discount Transparency" section when no discount data is available. Currently misleading.

### Should Fix (Non-Critical)
2. **Cash basis date attribution** — Add a note/tooltip explaining revenue is recognized on check-in date, not payment date.
3. **Accrual add-on spreading** — Consider noting in the UI that accrual boarding revenue includes add-on services (baths, etc.) spread across the stay.
4. **Funnel revenue scope** — The comment accurately describes the limitation. No code fix needed, but the UI should clarify this is "lifetime revenue from new customers" not "revenue earned during period."

### Future Enhancements
5. **Discount tracking** — When Gingr sync supports discount data, implement the full discount breakdown.
6. **Service-level revenue** — Break out bath, private play, etc. revenue separately from room revenue.
7. **Payment-date revenue** — If Gingr ever provides payment timestamps, add a true cash-basis mode.

---

## Conclusion

The revenue math is **correct and production-ready** for its current purpose (dashboard-level reporting). The three minor issues are documentation/UX improvements, not calculation bugs. The one stub (discounts) should be addressed to avoid showing misleading zeros.
