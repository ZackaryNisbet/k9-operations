---
name: K9 Operations
description: The quietly competent operations hub for pet facility staff
colors:
  primary: "#14532D"
  primary-light: "#166534"
  primary-tint: "#F7FEE7"
  accent: "#84CC16"
  accent-light: "#D9F99D"
  surface: "#FFFFFF"
  surface-hover: "#F8FAFC"
  border: "#E2E8F0"
  border-light: "#F1F5F9"
  text: "#0F172A"
  text-secondary: "#1E293B"
  text-muted: "#475569"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  info: "#2563EB"
typography:
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
    textTransform: "uppercase"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "10px 22px"
    fontWeight: 600
    fontSize: "14px"
    letterSpacing: "0.01em"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "10px 22px"
    fontWeight: 600
    fontSize: "14px"
    letterSpacing: "0.01em"
  button-secondary:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "10px 22px"
  badge:
    rounded: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.02em"
---

# Design System: K9 Operations

## 1. Overview

**Creative North Star: "The Quietly Competent Operations Hub"**

The system is deliberately clean and minimalistic on the surface. It earns its appeal through extreme clarity and thoughtful restraint rather than visual noise. Staff should feel an immediate sense of calm competence when they open it — like opening a well-organized, battle-tested operations binder that has been refined by someone who truly understands the work.

Underneath the simplicity is sophisticated craft: precise interactions, excellent feedback, and subtle motion that only appears when it serves a purpose. The interface should feel like it was built by a highly skilled engineer who respects the user’s time and environment. It is attractive because it is *good*, not because it is decorated.

This system explicitly rejects consumer-cute pet-industry aesthetics, bloated modern SaaS “delight,” and fragile or precious interfaces.

**Key Characteristics:**
- Extreme visual calm and scannability
- High information density without feeling cramped
- Sophistication expressed through precision and restraint
- Practical and reliable above all else

## 2. Colors

The palette is built around a deep, stable forest green paired with a bright, energetic lime accent. The green conveys trustworthiness and operational seriousness. The lime provides clear, energetic highlights for actions and important states without ever feeling playful or juvenile.

### Primary
- **Deep Forest Green** (#14532D): The dominant brand color. Used for primary actions, important navigation, and key emphasis. Represents stability and professionalism.

### Accent
- **Electric Lime** (#84CC16): Used sparingly for primary calls-to-action, active states, and positive highlights. Provides energy and clear signaling.

### Neutral
- **Surface** (#FFFFFF): Primary background.
- **Surface Hover** (#F8FAFC): Subtle hover and secondary surfaces.
- **Border** (#E2E8F0) and **Border Light** (#F1F5F9): Clean, low-contrast dividers.
- **Text** (#0F172A), **Text Secondary** (#1E293B), **Text Muted** (#475569): Strict, readable hierarchy.

**The One Accent Rule.** The lime accent should feel special. It is used for primary actions and important positive states, not decoration.

## 3. Typography

**Body Font:** System UI stack (native feel across platforms)  
**Label Font:** Same stack, uppercase with increased tracking for clarity

**Character:** Clear, professional, and highly legible at small sizes. No display fonts in the interface. Typography is a tool for speed and clarity, not expression.

### Hierarchy
- **Body** (14px, 400): Default reading and data.
- **Label** (10–11px, 700, 0.06em letter-spacing, uppercase): Column headers, badges, small metadata.
- **Strong/Emphasis** (600–700): Used for key data points and primary information within dense views.

## 4. Elevation

The system is intentionally flat-by-default. Depth is used sparingly and purposefully.

Depth is created primarily through:
- Subtle tonal shifts (surface vs surface-hover)
- Clean 1–1.5px borders
- Very restrained shadows only when something needs to feel lifted (popovers, dropdowns, active cards)

Shadows, when used, are soft and low-contrast — never heavy or decorative.

## 5. Components

### Using the shared UI (import these)

Before building anything, reach for the shared element. These already encode every standard
on this page — radii, spacing, focus management, the backdrop, the dense-table chrome — so a
new feature is *correct by composition*, not by re-deriving the rules. Map intent → component:

| You are building… | Use | Import from |
| --- | --- | --- |
| an **add / edit form** | `Modal` + `Inp` / `CustomSelect` | `src/shared/ui.jsx` |
| **log an update** | `LogEntryModal` | `src/shared/ui.jsx` |
| **view a record + its history** | `RecordActivityModal` | `src/shared/ui.jsx` |
| a **list / table / tabs / pills** | `DenseTable`, `ListTabBar`, `ListSearchRow`, `PillFilter`, `StatusPill` | `src/shared/listSurface.jsx` |

**Never hand-roll modals, overlays, inline log composers, or tables — compose these.**

### Buttons
- **Shape:** 12px radius (the single most consistent radius in the system)
- **Primary:** Deep Forest Green background, white text, subtle shadow
- **Accent:** Electric Lime background, white text
- **Secondary:** Light surface with border
- **States:** Clear, high-quality hover/focus/active treatments with restrained motion

### Badges & Chips
- Pill shape (20px radius)
- Used for status, categories, and lightweight metadata
- High contrast text on subtle backgrounds

### Inputs & Fields
- 10px radius
- Clean borders that shift to Primary on focus
- High emphasis on clarity and scannability over decoration

### Cards / Containers
- 10–12px radius
- Light borders or subtle shadows only when separation is functionally important
- Generous but controlled internal padding

### Data tables & list surfaces — THE STANDARD

Every list/record surface in the app uses this exact pattern (first established on **Grassroots**; it is the reference implementation). Do not invent alternate list layouts.

**Top-to-bottom anatomy:**
1. **Simplistic header** — plain title in the top-left. No hero metrics, no big banners, no side-stripes.
2. **Search + filter row** — a single search input, then **pill-button filters** inline, an optional **vertical separator**, then a secondary toggle (e.g. a subview switch or "Past …"). Pills are the primary quick-filter; the vertical bar separates filters from view/mode switches.
3. **One-line explainer** — a single subtle line (faint brand-tinted gradient background, ~12px) describing the current tab. One sentence, no more.
4. **Connected tab bar** (when the surface has categories) — full-width tabs (`flex: 1`), active tab marked by a **3px bottom underline** in primary, each tab carrying a count **pill**.
5. **Dense table** — the core.

**Dense table specifics:**
- Container: `surface` background, **1.5px** border, **10px** radius, `overflow: hidden`.
- Header row: white, 1px bottom border, 10px **uppercase** labels (letter-spacing ~0.06em, weight 700, muted slate). Sortable columns are click-to-sort and show a ` ▲`/` ▼` indicator; active sort column tints primary.
- Rows: **dense — ~6px vertical padding (≈35px row height)**, 12px font, 1px light bottom divider, `align-items: start`. Never tall/roomy rows.
- Columns are mapped per surface but stay consistent in treatment: primary-colored identity column, status as a **pill**, dates compact, action affordances small and icon-only.
- **Status pills:** small (10px, weight 800), pill radius, tinted bg + matching fg per state.
- **Overdue/Today badges** stack *under* the date, not inline.
- **Inline expansion** (a lightweight in-place detail peek) opens edge-to-edge beneath the row as a **recessed drawer** — a subtle `surface-hover` tonal shift with hairline top/bottom borders. No colored side-stripe (that contradicts the no-side-stripes rule above and reads as decoration). Keep the drawer for quick at-a-glance detail only: the canonical create/edit surface and the focused "log an update" / record-activity surfaces are the shared compact **modals** (see *Modals & dialogs* and *Activity log & record history* below). Do not hand-roll an inline log composer inside the drawer.
- **Row actions** are compact icon-only buttons (pencil/trash), right-aligned; reorder via small ▲▼ when applicable.
- Wide tables scroll horizontally (`overflow-x: auto`) rather than shrinking columns illegibly.

**Reference component:** `DenseGrassrootsTable` + the per-category column-map pattern in `GrassrootsPage.jsx` — the visual reference these were lifted from. The shared extraction now exists: compose `DenseTable`, `StatusPill`, `ListSearchRow`/`PillFilter`, `ListTabBar`, and `ListExplainer` from `src/shared/listSurface.jsx` (documented in `docs/shared-list-surface.md`). New list surfaces should reuse these rather than re-implementing the chrome.

### Modals & dialogs — THE STANDARD

Every focused, blocking interaction uses the shared `Modal` primitive (`src/shared/ui.jsx`). Do not build a second modal shell, and do not reach for a custom drawer/popover when the task is "fill in a form" or "act on one record." The modal is calm, white, and structural — it is a clean sheet of paper laid over a dimmed desk, not a decorated overlay.

**Anatomy (as implemented):**
- **Backdrop** — a fixed `rgba(15, 23, 42, 0.48)` scrim with a **6px blur**. It dims and quiets the page; it does not tint it a brand color.
- **Panel** — centered, **20px radius**, `surface` (#FFFFFF) background, one soft layered shadow for lift. Nothing else decorates the frame.
- **Sticky header** — **20–24px padding**, the title left-aligned at **18px / 700**, a close **X** right-aligned that lights on hover, and a **1px** `border-light` (#F1F5F9) bottom border. The header stays pinned while the body scrolls.
- **Body** — **24px** padding, the working area for fields or content.
- **Height** — `max-height ≈ 90vh` with the body scrolling internally; the header (and footer, when present) stay fixed.
- **Entrance** — restrained: backdrop fades, panel rises and scales in slightly. This is the one place motion is allowed, and it is disabled under `prefers-reduced-motion`. No bounce, no spring.

**Widths** (pick the smallest that fits):
- **Default — 520px.** Forms and focused single actions (log an update, add/edit a record).
- **`wide` — 720px.** A record's facts plus its activity timeline, or a form that genuinely needs two readable columns.
- **`fullWidth` — viewport minus a gutter.** Reserved for genuinely wide content (a table inside the modal). Prefer the smaller widths; width is not a default, it is a justification.

**Behaviors:**
- **Esc closes.** **Backdrop click closes.** A visible close **X** sits in the tab order.
- **On open, focus the primary field** (the first input the user will act on) — or the primary button if the modal has no inputs.
- **Trap focus** inside the panel while it is open; **Tab / Shift+Tab** wrap. **Return focus** to the element that opened the modal when it closes.
- **One modal at a time. Never nest modals.** If an action inside a modal needs its own modal, redesign the flow — swap the body, or close this one first.
- **Accessible labelling:** the panel is `role="dialog"` with `aria-modal="true"` and is labelled by its title (`aria-labelledby`).
- **Mobile:** on narrow viewports the panel fills the width within the gutter and scrolls; it does not shrink type or cram columns.

**When to use a modal vs. inline:**
- **Use the modal** for create/edit **forms** and **focused single-record actions** — logging an update, viewing one record's activity. These are short, deliberate, blocking tasks where the rest of the page is noise.
- **Keep the dense-table inline expansion** (the recessed drawer) **only for lightweight in-place detail peeks** — a glance at a row's extra fields without leaving the list. The moment the interaction becomes "edit this" or "log against this," it belongs in a modal.
- Do not use a modal for content the user must read *alongside* the page, for long multi-screen flows, or for anything that should be a full page.

**Footer:** right-aligned, **secondary/ghost "Cancel" first, then the primary action**. Label the primary button with the outcome as a verb-noun ("Create Employee", "Save update") — not "OK" or "Submit". The footer carries at most two buttons. **Destructive actions** (delete, archive) require an **explicit confirm** and **never sit as the default/primary** of a routine edit modal; a destructive confirm is its own small modal where the danger action is clearly the danger action and Cancel is the easy, expected out.

> On button order: Carbon, Material, and Apple place the primary action on the **right** in a dialog footer, and that is the rule here (the trailing position is where the eye and the pointer come to rest after reading left-to-right). Atlassian flips to primary-on-the-**left** for inline single-page forms — we keep that variant *out* of modals so every dialog footer in the app reads identically: Cancel, then the primary verb-noun on the right.

### Forms in modals

A form in a modal is still a form: short, labelled, scannable, one primary outcome.

- **Field labels** use the **12px / 700 muted-slate** label or the **10px uppercase** label style (the same labels as the dense table). Every field is labelled; nothing relies on placeholder text alone.
- **One logical group per row**, laid out with CSS **grid** — pair fields that belong together (first/last name, start/end), and let each row breathe rather than stacking everything in a single column.
- **Inputs are the shared `Inp` / `CustomSelect`** primitives: **10px radius**, clean border that **shifts to primary on focus**. No bespoke input styling inside a modal.
- **Mark what's required** with an explicit marker (not a faint gray that fails contrast); the convention is the standard required asterisk on the label.
- **Derived or automatic behavior** gets **one quiet helper line** — a single muted sentence explaining what the system will do (e.g. "Received date is set from the booking-form time"). One line, not a paragraph, and never per-field essays.
- **The primary button names the outcome:** "Create Employee", "Save Employee", "Save update". The verb matches the user's intent and the noun matches the record.
- Keep the form short enough to act on without hunting; if it needs internal scrolling, the header (and footer) stay pinned so the title and the primary action never scroll away.

**Canonical examples:** the **Add / Edit Employee** modal and the **New / Edit Event** modal. New create/edit surfaces should match their field rhythm, label treatment, and footer exactly.

### Activity log & record history

There are two distinct, named surfaces, and one audit list. Use them by name; do not reinvent either.

- **`LogEntryModal` — the canonical "log an update" surface, everywhere.** CRM, Marketing / Grassroots, any tracker. It is a compact (~520px) clean white dialog: an optional **Type** selector (Call / Text / Email / Note as pill buttons), a **dominant Notes textarea**, and an optional **"Next follow-up date"** picker, with the standard right-aligned footer (Cancel ghost, then a primary **Save**). This is the composer the owner explicitly loves; it originated on the CRM. **No bespoke inline log composers** — if a surface needs to log an update, it opens `LogEntryModal`, not a hand-rolled drawer field.
- **`RecordActivityModal` — the canonical focused record + history view.** A wider (~720px) clean white dialog that does two things in order:
  1. **Record context, grouped at the top** (caller-composed) — enough of the record's key facts to be read **with zero prior context**. For a CRM lead that is name, phone, and the booking-form details; for a Marketing event that is organizer, schedule, status, and cost.
  2. **The reverse-chronological activity timeline** beneath it — most recent first, each entry as **actor — timestamp**, the body, then any meta. Then a **"Log update" CTA** (which opens `LogEntryModal`).
  This replaces the bespoke inline "update log" drawers so that **a CRM lead and a Marketing event present their history identically** — same shape, same reading order, same affordance.

**`RecordActivityModal` is THE standard for the focused record/log VIEW.** When the user opens a record to *review* it or *act on* it, the record's grouped context **and** its full history open together in the clean white modal; the "Log update" CTA opens `LogEntryModal`. Do not present this view as an inline row drawer. The rationale is principle-backed, not taste:
- **Jakob's Law** — one shape, one reading order, one affordance across CRM/Marketing/trackers means staff learn it *once* and recognize it everywhere; consistency with a known model is the biggest lever on "minimize training."
- **Progressive disclosure & recognition over recall** — the dense list stays the scannable summary; opening the modal is the deliberate "show me everything about *this* one" step, and it puts the whole record on screen so nothing has to be held in memory.
- **Aesthetic-usability** — a composed sheet over a quieted page reads as *easier* (and more impressive) than a shelf shoved into a 35px row; perceived ease is a real benefit, not vanity.
- **No layout shift** — the modal opens *over* a frozen list; the table never lurches, the user never loses their place, and closing returns them exactly where they were. (Inline expansion is, by definition, a large layout shift.)
- **Always carry enough record context.** The per-record activity view must stand on its own: a reader who opened it cold should understand *which* record this is and *why these entries matter* in 2–4 seconds, without going back to the list. (This is also the rebuttal to the one honest argument for inline — that a modal "removes surrounding context": for a record's own history the relevant context is the *record*, and we put it on the sheet.)

**When inline vs. modal — resolved crisply.** The dense-table inline drawer is for an **ultra-light single-field peek only** — a glance at one or two extra fields with nothing to act on. **Anything that is "review this record" or "act on it" — read its history, log an update, edit a field — is a modal.** No exceptions for the record/history view: that is always `RecordActivityModal`.

- **Distinguish this from the History TAB.** A page-level History / audit tab stays a **DenseTable** audit list (the standardized history table: When · subject · Action · Record/Change · Person), filterable like any list surface — this is **unchanged**. `RecordActivityModal` is *one record's* story told in a focused dialog; the History tab is *the whole surface's* change log told in a dense table. Same data philosophy (reverse-chron, actor + timestamp + action + affected record), two different altitudes.

### Backdrop, portaling & stacking

The shared `Modal` renders through a **portal to `document.body`**. This is not an implementation detail — it is what guarantees the backdrop behaves.

- **Why it portals.** Mounted at the document root, the modal's `position: fixed` backdrop is positioned relative to the **viewport**, so it always covers the **full screen** with the standard scrim and blur (`rgba(15, 23, 42, 0.48)` + **6px** blur). The page underneath is uniformly quieted, edge to edge.
- **The failure mode it prevents (the Marketing bug).** A `position: fixed` element is only fixed *to the viewport* if no ancestor establishes a containing block. The moment a `position: fixed` overlay is placed **inside an ancestor that has a `transform`, `filter`, or `animation`** (for example an animated page "stage"), that ancestor becomes the containing block and the overlay is **trapped to the ancestor's box** — the blur then covers only part of the screen instead of all of it. This is exactly the bug seen on Marketing.
- **The rule.** **NEVER hand-roll a fixed-position modal or overlay.** Always use the shared `Modal`, which portals to `document.body` and sidesteps every transformed-ancestor trap by construction.
- **One modal at a time; never nest.** A CTA inside a modal **closes it before opening the next** — e.g. the "Log update" button inside `RecordActivityModal` closes that modal, then opens `LogEntryModal`. Two stacked backdrops, doubled blur, and a tangled focus trap are never the answer; swap the surface instead.

### References

The modal/dialog, in-modal form, and activity-history standards above were checked against current best practice and trimmed to fit this app's dense, calm ethos:
- **W3C ARIA Authoring Practices — Dialog (Modal) pattern** — `role="dialog"`, `aria-modal`, labelling, focus-in on open, focus trap with Tab/Shift+Tab wrap, Esc to close, return focus to the opener.
- **Nielsen Norman Group** — *Modal & Nonmodal Dialogs: When & How to Use* (when a modal is justified vs. an interruption), *Marking Required Fields*, and the *Layer-Cake / scannability* guidance for grouped, subheaded content.
- **Apple Human Interface Guidelines** — *Sheets* and *Alerts* (focused tasks; alerts/destructive confirms kept separate and explicit).
- **Material Design 3** — *Dialogs* (a single prominent primary action; basic vs. full-screen for complex/multi-field tasks).
- **Shopify Polaris** — *Modal* (max two footer buttons, verb-noun primary, focus to first input then return to activator, destructive never as a tertiary action).
- **Atlassian Design System** — *Modal dialog* (button-importance ordering, and the inline-form exception we deliberately keep out of modals).
- **IBM Carbon** — *Modal* (passive / transactional / danger types; secondary-left / primary-right footer; initial focus to the first input).

The decision to make the focused record/history view a **modal** (`RecordActivityModal`) rather than an inline row expansion was researched against named principles, tied to two goals — ease of use / minimize training, and front-end attractiveness:
- **Jakob's Law** (*Laws of UX*; NN/g) — users carry a mental model from other software; one consistent record/history shape across every surface is learned once and recognized everywhere (minimizes training).
- **Recognition over Recall** and **Progressive Disclosure** (NN/g, *10 Usability Heuristics* / *Recognition and Recall*) — the list is the scannable summary; the modal reveals the whole record on demand so nothing is held in working memory.
- **The Aesthetic-Usability Effect** (NN/g) — a composed sheet over a quieted page is perceived as easier to use, and is more impressive, than a drawer wedged into a dense row.
- **Hick's Law / focused attention** (*Laws of UX*; NN/g *Modal & Nonmodal Dialogs*) — the modal strips the surrounding rows so one record is the only thing to act on.
- **Cumulative Layout Shift** (web.dev, Core Web Vitals) — inline expansion shoves the table down (a deliberate layout shift that disorients and causes mis-clicks); a modal opens over a frozen page.
- **Fitts's Law** (*Laws of UX*) — the modal's CTA and footer buttons are large and in a fixed, predictable position every time, not a small moving target inside a row.
- **Gestalt — Law of Common Region** (NN/g; *Laws of UX*) — one bounded panel makes "these facts + this timeline are one record" read pre-attentively; common region is the strongest grouping cue.
- The honest **counter-argument for inline** (keeps surrounding context visible; avoids modal fatigue) is neutralized by carrying the record's own context inside the modal, and by this modal being **user-initiated** (the fatigue case is unsolicited, interrupting pop-ups, not a self-summoned view of one record). Full memo: `/tmp/k9_logview_research.md`.

## 6. Do's and Don'ts

### Do:
- Use density deliberately — staff need to see and act on a lot of information.
- Let sophistication come from precision, feedback, and subtle motion rather than visual flair.
- Maintain extreme consistency in spacing, radii, and interaction patterns.
- Make the interface feel calm and trustworthy first, attractive second.

### Don't:
- Add decorative motion, micro-animations, or “delight” that doesn’t serve a clear functional purpose.
- Use consumer-cute or overly playful pet-industry visual language.
- Create heavy shadows, glassmorphism, or excessive layering.
- Reinvent standard affordances (buttons, inputs, tables) for the sake of novelty.
- Let visual noise get in the way of speed and clarity under operational pressure.
