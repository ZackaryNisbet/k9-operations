# TV-008: Checkout Board Polish — 4 Improvements

## TV-008a: Reduce Checkout Detection Delay (60s → 15s)

### Problem
Currently the tv-poll edge function fires every 60 seconds, meaning worst-case a checkout takes ~63 seconds to appear on the TV. User wants it faster.

### Root Cause
The 60-second interval was chosen to be conservative on Gingr API calls (~1,440/day). But 15 seconds is still only ~5,760/day which is well within reasonable limits for a single endpoint call.

### Fix
In `CheckoutTVPage.jsx`, change the tv-poll interval from 60s to 15s:

```jsx
// Line ~666: change 60 * 1000 to 15 * 1000
const interval = setInterval(tvPoll, 15 * 1000);
```

**Worst-case detection latency drops from ~63s to ~18s** (15s poll + 3s Supabase poll).

### Files
- `src/kol/pages/CheckoutTVPage.jsx` — one number change

---

## TV-008b: Multi-Dog Checkout (Same-Owner Batch)

### Problem
When two dogs are checked out together (same owner, same reservation or linked reservations), only the first dog appears in the hero card. The second is missed because the current code creates individual checkout entries.

### Root Cause
The checkout detection at line ~605 iterates `departed` IDs and creates individual entries. The hero card display at line ~698 picks `activeCheckout = checkingOut.find(e => !e.fading)` — i.e., only the FIRST non-fading entry. The second dog ends up in `queuedCheckouts` and shows as a tiny compact card below, not as a hero.

### Fix
Group departed dogs that share the same owner into a single hero card. The hero card should display multiple dogs when they belong to the same owner.

**Step 1 — Group departures by owner in the checkout detection:**
When building the `departed` array (~line 605), group entries by `owner_last_name`. Instead of individual entries, create group entries:

```jsx
// After building departed array, group by owner
const departedByOwner = {};
for (const d of departed) {
  const key = d.ownerLastName || d.id;
  if (!departedByOwner[key]) departedByOwner[key] = [];
  departedByOwner[key].push(d);
}

// Create group entries
const groupedDepartures = Object.values(departedByOwner).map(group => ({
  id: group.map(d => d.id).join('+'),
  dogs: group, // array of individual dog entries
  ownerLastName: group[0].ownerLastName,
  remaining: 60,
  fading: false,
}));
```

**Step 2 — Update HeroCheckoutCard to render multiple dogs:**
Accept a `dogs` array in the entry instead of a single dog. Render them side by side with the same countdown timer.

```jsx
// Hero card shows multiple dog photos + names
// Layout: [Photo1] [Photo2] ... | Info (names comma-separated) | Timer
```

If there's only one dog, it looks exactly the same as today. If there are 2-3, the photos tile horizontally and names are listed.

### Files
- `src/kol/pages/CheckoutTVPage.jsx` — checkout detection grouping + HeroCheckoutCard multi-dog layout

---

## TV-008c: Grid Reflow After Checkout Card Disappears

### Problem
When the checkout hero card timer expires and the card fades out, the checked-out dog disappears from the grid but the remaining dogs don't reflow upward. This leaves an empty gap where the hero card was.

### Root Cause
The hero card section (`{hasCheckouts && (<div style={{ marginBottom: 20 }}>...`)} on line ~946 occupies space. When `checkingOut` is emptied, `hasCheckouts` becomes false and the section unmounts — but the grid below doesn't animate upward smoothly.

The grid itself uses `key={gridKey}` which only increments on view changes (line ~844), not on checkout state changes. So there's no re-animation trigger.

Additionally, the dog's grid card has `opacity: 0.35` while checking out (line ~749). When the checkout entry is removed, the card is also removed from the grid entirely (since `check_out_date` is now set), but the remaining cards don't shift up with a smooth transition.

### Fix
1. **Add CSS transition to the grid container** so items reflow smoothly:
```jsx
// On the grid container (the flex-wrap div that holds DogCards):
transition: "all 0.4s ease"
```

2. **Animate the hero card section collapse.** Instead of unmounting instantly, fade/collapse it:
```jsx
// Wrap the hero section in a container with max-height transition
<div style={{
  maxHeight: hasCheckouts ? 400 : 0,
  overflow: 'hidden',
  transition: 'max-height 0.5s ease, opacity 0.3s ease, margin 0.5s ease',
  opacity: hasCheckouts ? 1 : 0,
  marginBottom: hasCheckouts ? 20 : 0,
}}>
```

3. **Ensure grid cards smoothly fill the gap.** The grid is a `flexWrap: "wrap"` container — CSS gap + transition on the wrapper handles reflow naturally.

### Files
- `src/kol/pages/CheckoutTVPage.jsx` — hero section wrapper + grid transition

---

## TV-008d: CHECKING IN Hero Card Announcement

### Problem
Currently only checkouts are announced. User wants a similar hero card for dogs being checked in — showing the dog name, photo, breed, owner, and room with a "CHECKING IN" badge.

### Design
- Same hero card style as checkout, but with a **blue** color scheme instead of green
- Badge text: "CHECKING IN" (blue badge, matching the app's navy/blue palette)
- Timer: 30 seconds (shorter than checkout since check-ins are less operationally urgent)
- Position: Above the checkout hero card if both are active simultaneously

### Implementation

**Step 1 — Detect check-ins in the Supabase poller (TV-002 block):**
The existing poller at line ~582 queries `check_out_date IS NULL` and `check_in_date IS NOT NULL`. To detect check-ins, track the inverse: dogs that appear in the current poll but were NOT in the previous poll.

```jsx
// After the departed detection (~line 622):
// Find IDs in current but not in prev = newly checked in
if (prev !== null) {
  const arrivals = [];
  for (const id of currentIds) {
    if (!prev.has(id)) {
      const resInfo = relevant.find(r => r.gingr_id === id);
      arrivals.push({
        id,
        animalGingrId: resInfo?.animal_gingr_id || "",
        animalName: resInfo?.animal_name || "Unknown",
        ownerLastName: resInfo?.owner_last_name || "",
        room: "",
        remaining: 30, // shorter timer for check-ins
        fading: false,
      });
    }
  }
  if (arrivals.length > 0) {
    setCheckingIn(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newEntries = arrivals.filter(a => !existingIds.has(a.id));
      return [...prev, ...newEntries];
    });
  }
}
```

**Step 2 — New state + countdown for checkingIn:**
Mirror the `checkingOut` state/effects:
- `const [checkingIn, setCheckingIn] = useState([])`
- Countdown effect (tick every 1s, 30s timer)
- Cleanup effect (remove faded entries)
- Active/queued computation

**Step 3 — HeroCheckInCard component:**
Same layout as HeroCheckoutCard but with blue theming:
- Border: `rgba(56, 189, 248, 0.6)` (sky-400)
- Background gradient: `rgba(56, 189, 248, 0.22)` → transparent
- Badge: "CHECKING IN" in sky blue
- No "Leaving Now" urgent state (not applicable for check-ins)

**Step 4 — Render order:**
Check-in cards render ABOVE checkout cards:
```
[CHECKING IN hero]    ← new arrivals
[CHECKING OUT hero]   ← departures
[Dog grid]
```

**Step 5 — First-poll guard:**
Same as checkout detection — the first poll establishes the baseline. Don't treat all currently checked-in dogs as "new arrivals" on page load.

**Step 6 — Group by owner** (same as TV-008b): if multiple dogs from the same owner check in together, show them in one card.

### Files
- `src/kol/pages/CheckoutTVPage.jsx` — new state, detection logic, HeroCheckInCard, render section

---

## Summary of Files Modified

| File | Changes |
|------|---------|
| `src/kol/pages/CheckoutTVPage.jsx` | All 4 improvements (a: interval, b: grouping, c: reflow, d: check-in detection + card) |

All changes are in a single file. No edge function or database changes needed.

## Parallel Execution Note
All 4 improvements modify the same file (`CheckoutTVPage.jsx`) and interact with each other (e.g., TV-008b grouping applies to both check-ins and checkouts). **These should be implemented together in a single branch**, not in parallel.
