# Shared list surface (`src/shared/listSurface.jsx`)

The reusable extraction of **DESIGN.md §5 — "Data tables & list surfaces: THE
STANDARD."** Every new list/record surface (Labor, Inventory, Resort Upkeep, …)
should compose these primitives instead of re-implementing the chrome. The
visual reference they were lifted from is `DenseGrassrootsTable` in
`src/kol/pages/GrassrootsPage.jsx`.

Two files:

| File | Contains | Imported by |
|---|---|---|
| `src/shared/listSurfaceModel.js` | Pure logic + design constants (no React, no `./theme`) | Components **and** tests |
| `src/shared/listSurface.jsx` | React components; re-exports everything from the model | Page surfaces |

> **Why the split?** `./theme` imports the Supabase client, which throws at
> import time under the `node` test environment (`vitest`). Keeping the logic in
> a theme-free model file makes it unit-testable (`src/__tests__/listSurface.test.js`)
> and lets the components own all the live `C`-token styling. Import components
> from `listSurface.jsx`; import pure helpers from either.

## Anatomy

Top-to-bottom, a standard surface is:

```jsx
import {
  ListSurfaceTitle, ListSearchRow, PillFilter, PillSeparator,
  ListTabBar, ListExplainer, DenseTable, StatusPill,
} from "../../shared/listSurface";

<ListSurfaceTitle actions={<Btn>Add</Btn>}>Inventory</ListSurfaceTitle>

<ListSearchRow value={q} onChange={setQ} placeholder="Search items…">
  <PillFilter active={tone === "low"} variant="solid" color={C.dan}
              onClick={() => setTone(t => t === "low" ? null : "low")}>Low stock</PillFilter>
  <PillSeparator />
  <PillFilter active={showArchived} onClick={() => setShowArchived(v => !v)}>Archived</PillFilter>
</ListSearchRow>

<ListTabBar
  tabs={[{ id: "food", label: "Food", count: 12 }, { id: "meds", label: "Meds", count: 4 }]}
  activeId={tab}
  onChange={setTab}
/>

<ListExplainer>Track on-hand counts and reorder points for {tab}.</ListExplainer>

<DenseTable columns={columns} rows={rows} defaultSort={{ key: "name", direction: "asc" }} />
```

## `DenseTable`

The dense table itself: `surface` background, **1.5px** border, **10px** radius,
10px uppercase sortable header, dense ~35px rows, and optional edge-to-edge
inline expansion with a 3px primary left-border.

### Columns

```js
const columns = [
  {
    key: "name",                 // required, unique
    header: "Item",              // header label (any node)
    render: (row) => row.name,   // cell content
    width: "minmax(140px, 1.6fr)", // CSS track; a number → `${n}px`. Default: minmax(0, 1fr)
    align: "start",              // "start" | "center" | "end"
    sortable: true,
    sortValue: (row) => row.name.toLowerCase(), // value used to sort (defaults to accessor)
    accessor: "name",            // fn or property key; backs sort + search defaults
    searchable: true,            // include in ListSearchRow filtering (default true)
    searchValue: (row) => row.sku, // value used for text search (defaults to accessor)
    headerTitle: "Sort by name", // header tooltip
    cellStyle: { fontWeight: 700 }, // extra per-cell style
  },
  { key: "status", header: "Status", align: "center",
    render: (row) => <StatusPill tone={row.tone}>{row.status}</StatusPill> },
];
```

### Sorting (dual-mode)

* **Uncontrolled** (default) — pass `defaultSort={{ key, direction }}`. The table
  cycles `asc → desc → off` on header click and sorts `rows` for you via the
  column's `sortValue`/`accessor`.
* **Controlled** — pass `onSortChange(key)`. You own `sort` and hand back
  already-sorted `rows`; the table only renders the indicator and reports clicks.
  (This is how Grassroots drives its event-date / follow-up sorting externally.)

### Inline expansion

```jsx
<DenseTable
  columns={columns}
  rows={rows}
  isRowExpanded={(row) => row.id === openId}
  renderExpansion={(row) => <div style={{ padding: "12px 14px" }}>{row.detail}</div>}
/>
```

### Other props

| Prop | Default | Notes |
|---|---|---|
| `getRowKey(row, i)` | `row.id ?? i` | React key |
| `onRowClick(row)` | — | makes rows clickable |
| `rowStyle(row)` | — | per-row style override |
| `emptyText` | `"Nothing here yet."` | shown when `rows` is empty |
| `minWidth` | — | sets a min width and enables horizontal scroll for wide tables |
| `stickyHeader` | `false` | header sticks on vertical scroll |

## Chips & affordances

| Component | Use |
|---|---|
| `StatusPill` | small status pill; `tone` is a palette name (`success`, `warning`, `danger`, `info`, `primary`, `accent`, `neutral`) or an explicit `{ bg, fg }` |
| `StackBadge` | tiny OVERDUE/TODAY-style badge that stacks under a date cell |
| `RowActionButton` | compact in-row action (Log / Edit); `tone` = `neutral` \| `primary` \| `danger` |
| `IconButton` | icon-only compact action (pencil / trash) |
| `CountButton` | pill-button that tints primary when its count is non-zero |
| `PillFilter` / `PillSeparator` | quick-filter pills + the vertical separator before view/mode switches |

`PillFilter` variants: **`tinted`** (default; active = primary-tint + primary
text, for category filters) and **`solid`** (active = filled `color` + white
text, for status filters).

## Status tones

`STATUS_PALETTE` maps tone → `{ bg, fg }` (the canonical tints first used on
Grassroots): `neutral`, `primary`, `accent`, `success`, `warning`, `danger`,
`info`. Resolve one with `resolveStatusStyle(tone)`; unknown tones fall back to
`neutral`, so a surface never renders an un-styled pill.

## Pure helpers (also exported from `listSurface.jsx`)

`nextSortDirection`, `nextSort`, `normalizeColumns`, `buildGridTemplate`,
`compareValues`, `sortRows`, `filterRows`, `rowMatchesQuery`, `resolveAccessor`,
`resolveStatusStyle`, plus the `LIST_TOKENS` constant. These are framework-free
and covered by `src/__tests__/listSurface.test.js` — reuse them for custom
search/sort wiring rather than re-deriving the behavior.
