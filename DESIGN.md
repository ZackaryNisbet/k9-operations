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
- **Inline expansion** (log/detail) opens edge-to-edge beneath the row as a **recessed drawer** — a subtle `surface-hover` tonal shift with hairline top/bottom borders — rather than a modal. No colored side-stripe (that contradicts the no-side-stripes rule above and reads as decoration).
- **Row actions** are compact icon-only buttons (pencil/trash), right-aligned; reorder via small ▲▼ when applicable.
- Wide tables scroll horizontally (`overflow-x: auto`) rather than shrinking columns illegibly.

**Reference component:** `DenseGrassrootsTable` + the per-category column-map pattern in `GrassrootsPage.jsx` — the visual reference these were lifted from. The shared extraction now exists: compose `DenseTable`, `StatusPill`, `ListSearchRow`/`PillFilter`, `ListTabBar`, and `ListExplainer` from `src/shared/listSurface.jsx` (documented in `docs/shared-list-surface.md`). New list surfaces should reuse these rather than re-implementing the chrome.

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
