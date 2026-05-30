import { describe, expect, it } from "vitest";
import {
  LIST_TOKENS,
  STATUS_PALETTE,
  DEFAULT_STATUS_TONE,
  COLUMN_DEFAULTS,
  resolveStatusStyle,
  resolveAccessor,
  nextSortDirection,
  nextSort,
  normalizeColumn,
  normalizeColumns,
  buildGridTemplate,
  compareValues,
  sortRows,
  filterRows,
  rowMatchesQuery,
} from "../shared/listSurfaceModel";

describe("LIST_TOKENS", () => {
  it("pins the canonical STANDARD constants", () => {
    expect(LIST_TOKENS.container).toEqual({ border: "1.5px", radius: 10 });
    expect(LIST_TOKENS.header.fontSize).toBe(10);
    expect(LIST_TOKENS.row.padding).toBe("4px 10px");
    expect(LIST_TOKENS.expansion.borderLeft).toBe("3px");
  });
});

describe("resolveStatusStyle", () => {
  it("resolves known palette tones", () => {
    expect(resolveStatusStyle("success")).toEqual(STATUS_PALETTE.success);
    expect(resolveStatusStyle("danger")).toEqual(STATUS_PALETTE.danger);
  });

  it("falls back to the default tone for unknown / missing names", () => {
    expect(resolveStatusStyle("nope")).toEqual(STATUS_PALETTE[DEFAULT_STATUS_TONE]);
    expect(resolveStatusStyle(undefined)).toEqual(STATUS_PALETTE.neutral);
  });

  it("merges an explicit override object over neutral", () => {
    expect(resolveStatusStyle({ bg: "#000" })).toEqual({ bg: "#000", fg: STATUS_PALETTE.neutral.fg });
    expect(resolveStatusStyle({ bg: "#000", fg: "#fff" })).toEqual({ bg: "#000", fg: "#fff" });
  });
});

describe("nextSortDirection", () => {
  it("cycles undefined → asc → desc → undefined", () => {
    expect(nextSortDirection(undefined)).toBe("asc");
    expect(nextSortDirection("asc")).toBe("desc");
    expect(nextSortDirection("desc")).toBeUndefined();
    expect(nextSortDirection(null)).toBe("asc");
  });
});

describe("nextSort", () => {
  it("starts a new column at asc", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort({ key: "other", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
  });

  it("advances the active column asc → desc → off", () => {
    expect(nextSort({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toBeNull();
  });
});

describe("normalizeColumn / normalizeColumns", () => {
  it("applies defaults", () => {
    expect(normalizeColumn({ key: "a", header: "A" })).toMatchObject({ ...COLUMN_DEFAULTS, key: "a", header: "A" });
  });

  it("throws on a missing key", () => {
    expect(() => normalizeColumn({ header: "no key" })).toThrow(/key/);
    expect(() => normalizeColumn({ key: "" })).toThrow(/key/);
  });

  it("throws on duplicate keys", () => {
    expect(() => normalizeColumns([{ key: "a" }, { key: "a" }])).toThrow(/duplicate/);
  });

  it("filters out falsy column entries (conditional columns)", () => {
    const cols = normalizeColumns([{ key: "a" }, null, false, { key: "b" }]);
    expect(cols.map((c) => c.key)).toEqual(["a", "b"]);
  });
});

describe("resolveAccessor", () => {
  it("prefers a function accessor, then a string accessor, then the key", () => {
    const row = { name: "Rex", nested: { v: 5 }, key: "fallback" };
    expect(resolveAccessor(row, { key: "x", accessor: (r) => r.nested.v })).toBe(5);
    expect(resolveAccessor(row, { key: "x", accessor: "name" })).toBe("Rex");
    expect(resolveAccessor(row, { key: "name" })).toBe("Rex");
  });
});

describe("buildGridTemplate", () => {
  it("converts numeric widths to px and passes strings through", () => {
    expect(buildGridTemplate([{ key: "a", width: 120 }, { key: "b", width: "1fr" }])).toBe("120px 1fr");
  });

  it("uses the default track when width is omitted", () => {
    expect(buildGridTemplate([{ key: "a" }])).toBe(COLUMN_DEFAULTS.width);
  });
});

describe("compareValues", () => {
  it("compares numbers numerically", () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
  });

  it("compares strings with numeric awareness", () => {
    expect(compareValues("item2", "item10")).toBeLessThan(0);
    expect(compareValues("Bravo", "alpha")).toBeGreaterThan(0);
  });

  it("sorts empty values last", () => {
    expect(compareValues(null, "a")).toBeGreaterThan(0);
    expect(compareValues("a", "")).toBeLessThan(0);
    expect(compareValues(undefined, null)).toBe(0);
  });
});

describe("sortRows", () => {
  const columns = normalizeColumns([
    { key: "name", accessor: "name" },
    { key: "score", accessor: "score", sortValue: (r) => r.score },
  ]);
  const rows = [
    { id: 1, name: "Charlie", score: 30 },
    { id: 2, name: "alpha", score: 10 },
    { id: 3, name: "Bravo", score: 20 },
  ];

  it("returns the original reference when there is nothing to sort", () => {
    expect(sortRows(rows, null, columns)).toBe(rows);
    expect(sortRows(rows, { key: "name" }, columns)).toBe(rows);
    expect(sortRows(rows, { key: "missing", direction: "asc" }, columns)).toBe(rows);
  });

  it("sorts ascending and descending by a numeric column", () => {
    expect(sortRows(rows, { key: "score", direction: "asc" }, columns).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(sortRows(rows, { key: "score", direction: "desc" }, columns).map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("sorts strings case-insensitively", () => {
    expect(sortRows(rows, { key: "name", direction: "asc" }, columns).map((r) => r.name)).toEqual([
      "alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("is stable for equal keys", () => {
    const tied = [
      { id: 1, name: "same" },
      { id: 2, name: "same" },
      { id: 3, name: "same" },
    ];
    const cols = normalizeColumns([{ key: "name", accessor: "name" }]);
    expect(sortRows(tied, { key: "name", direction: "asc" }, cols).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const snapshot = rows.map((r) => r.id);
    sortRows(rows, { key: "score", direction: "desc" }, columns);
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});

describe("rowMatchesQuery / filterRows", () => {
  const columns = normalizeColumns([
    { key: "name", accessor: "name" },
    { key: "owner", searchValue: (r) => r.owner?.fullName },
    { key: "secret", accessor: "secret", searchable: false },
  ]);
  const rows = [
    { id: 1, name: "Rex", owner: { fullName: "Dana Scully" }, secret: "hidden-match" },
    { id: 2, name: "Bella", owner: { fullName: "Fox Mulder" }, secret: "nope" },
  ];

  it("matches everything for an empty query", () => {
    expect(filterRows(rows, "", columns)).toBe(rows);
    expect(rowMatchesQuery(rows[0], "   ", columns)).toBe(true);
  });

  it("matches via a string accessor (case-insensitive)", () => {
    expect(filterRows(rows, "rex", columns).map((r) => r.id)).toEqual([1]);
  });

  it("matches via a searchValue getter", () => {
    expect(filterRows(rows, "mulder", columns).map((r) => r.id)).toEqual([2]);
  });

  it("ignores columns marked searchable:false", () => {
    expect(filterRows(rows, "hidden-match", columns)).toEqual([]);
  });
});
