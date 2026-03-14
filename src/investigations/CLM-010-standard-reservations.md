# CLM-010: Investigation of "Standard" Reservation Types

**Date:** 2026-03-14
**Investigator:** Agent
**Status:** Complete — Root cause identified, fix proposed

---

## Summary

"Standard" is **not a Gingr reservation type**. It is a hardcoded UI fallback string in `ClientDetailPage.jsx` that displays when a reservation has no `roomType` value. This affects the vast majority of reservations (78.4% of all records) because only boarding reservations are assigned a room type.

---

## Root Cause

### The display bug

In `src/kol/pages/ClientDetailPage.jsx`, line 489, the Reservations tab renders each reservation's primary label as:

```jsx
<div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
  {res.roomType || "Standard"}
</div>
```

The expression `res.roomType || "Standard"` means:
- If the reservation has a `roomType` (e.g., "Luxury Suite", "Executive Room"), display that.
- If `roomType` is `null` (which it is for all non-boarding reservations), display the fallback **"Standard"**.

### Why roomType is null for most reservations

The `roomType` field is populated by `extractRoomFromType()` in `src/shared/opsHelpers.js`, which only matches reservation type names containing known room types (Luxury Suite, Executive Room, Double Compartment, Single Compartment). All non-boarding reservation types — daycare, day boarding, evaluations, tours, grooming — do not contain room keywords, so `extractRoomFromType()` returns `null`.

### Data flow

1. Raw Gingr data has `reservation_type_name` (e.g., "Daycare | Full Day", "Boarding | Luxury Suite (All Inclusive)")
2. `useGingrData.js` → `transformReservations()` calls:
   - `classifyReservationType(name)` → sets `type` ("daycare", "boarding", "tour", etc.)
   - `extractRoomFromType(name)` → sets `roomType` (only non-null for boarding types)
3. `ClientDetailPage.jsx` displays `roomType || "Standard"` instead of the classified `type`

---

## Data Analysis

### Full dataset: 118,419 reservations

| Display Label | Count | % | Actual Gingr Types |
|---|---|---|---|
| **"Standard" (roomType = null)** | **92,817** | **78.4%** | Daycare Full/Half Day, Day Boarding, Evaluations, Tours, Bathing, Private Open House |
| Luxury Suite | 3,961 | 3.3% | Boarding \| Luxury Suite (All Inclusive) |
| Executive Room | 15,159 | 12.8% | Boarding \| Executive Room (All Inclusive) |
| Double Compartment | 2,748 | 2.3% | Boarding \| Double Compartment (All Inclusive) |
| Single Compartment | 3,734 | 3.2% | Boarding \| Single Compartment (All Inclusive) |

### Breakdown of what "Standard" actually represents

| Gingr reservation_type_name | Classified type | Count | % of "Standard" |
|---|---|---|---|
| Daycare \| Full Day | daycare | 74,621 | 80.4% |
| Daycare \| Half Day | daycare | 9,194 | 9.9% |
| Day Boarding | dayboarding | 4,746 | 5.1% |
| Daycare \| Evaluation | evaluation | 2,562 | 2.8% |
| Resort Tour - Walk in | tour | 1,174 | 1.3% |
| Resort Tour - Scheduled | tour | 500 | 0.5% |
| Private Open House | other | 13 | <0.1% |
| Bathing Services | grooming | 7 | <0.1% |

### Example: Brad Abrams (380 reservations)

- 331 display as "Standard" → 329 are Daycare Full Day, 1 Daycare Half Day, 1 Day Boarding
- 49 display as "Single Compartment" → all are Boarding | Single Compartment (All Inclusive)

---

## Findings

1. **"Standard" is not a Gingr concept.** It is a misleading UI fallback that masks the actual reservation type for ~78% of all reservations.

2. **The classified `type` field already has the correct label.** Every reservation already has `type` set to "daycare", "boarding", "dayboarding", "evaluation", "tour", "grooming", or "other" via `classifyReservationType()`. The `_resTypeName` field also preserves the full Gingr name (e.g., "Daycare | Full Day").

3. **Only the Reservations tab in ClientDetailPage has this bug.** The `renderResCard` function (used elsewhere in the same file for upcoming/current/past sub-tabs) correctly uses `tl(res.type)` to display the classified type with a Badge. The simple reservation list at line 484-498 uses `roomType || "Standard"` instead.

4. **The Reservations tab is a simplified view** that was likely written as a quick placeholder. It lacks the type badges, dog names, service details, and check-in/check-out times that `renderResCard` provides.

---

## Recommended Fix

**Replace the fallback label with the actual reservation type.** Change line 489 from:

```jsx
{res.roomType || "Standard"}
```

To something like:

```jsx
{res.roomType || (res.type === "daycare" ? "Daycare" : res.type === "dayboarding" ? "Day Boarding" : res.type === "evaluation" ? "Evaluation" : res.type === "tour" ? "Tour" : res.type === "grooming" ? "Grooming" : res._resTypeName || "Reservation")}
```

Or more cleanly, reuse the existing `tl()` helper already defined on line 125:

```jsx
const tl = (t) => t === "boarding" ? "Boarding" : t === "dayboarding" ? "Day Board" : t === "daycare" ? "Daycare" : t === "evaluation" ? "Evaluation" : "Tour";
```

**Better approach:** Replace the entire simplified Reservations tab (lines 484-498) with the existing `renderResCard` renderer (defined on line 190), which already handles all types correctly with proper badges, dog names, and formatting. This would also add the sub-tab filtering (upcoming/current/past) that is defined but unused in the simplified view.

### Specific changes

- **Minimal fix:** Change `{res.roomType || "Standard"}` to `{res.roomType || tl(res.type)}` — but note `tl()` doesn't handle "grooming" or "other"
- **Better fix:** Update `tl()` to handle all types and use it as the label
- **Best fix:** Replace the simplified reservation list with `renderResCard` and the sub-tab UI that already exists in the component

### Scope

- **File to modify:** `src/kol/pages/ClientDetailPage.jsx` (line 489)
- **No changes needed to:** shared/, hooks/, or data transformation logic
- **No new data requirements** — all needed fields (`type`, `_resTypeName`) are already present on every reservation object

---

## Follow-up Tasks

- [ ] Implement the fix (new ticket or extend CLM-010)
- [ ] Consider whether the Reservations tab should show the full Gingr type name (`_resTypeName`) or the simplified classified name (`type`)
- [ ] Consider adding the sub-tab filtering (upcoming/current/past) to the Reservations tab, which is already defined but unused
- [ ] Audit other pages for similar `roomType` fallback patterns (checked: only found in ClientDetailPage.jsx)
