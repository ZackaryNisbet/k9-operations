import { describe, expect, it } from "vitest";
import {
  assignInventoryCatalogSortOrder,
  buildInventoryCatalogGroups,
  getInventoryVendorHref,
  getInventoryCategoryOrder,
  getInventoryCategorySuggestions,
  getInventorySubcategorySuggestions,
  moveInventoryCatalogItem,
  moveInventoryCatalogItemByStep,
  moveInventoryCategory,
  normalizeInventoryVendorUrl,
  renameInventorySubcategory,
} from "../kol/pages/inventoryCatalog";

const orderIds = (items) => [...items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.id);

const catalog = [
  { id: "a", item_name: "Disinfectant", category: "Cleaning", subcategory: "Chemicals", sort_order: 20 },
  { id: "b", item_name: "Broom", category: "Cleaning", subcategory: "Tools", sort_order: 30 },
  { id: "c", item_name: "Peanut Butter", category: "Enticements", subcategory: "", sort_order: 40 },
  { id: "d", item_name: "Bandages", category: "Medical", subcategory: "First Aid", sort_order: 10 },
];

describe("inventory catalog helpers", () => {
  it("orders categories by backend sort order instead of alphabetically", () => {
    expect(getInventoryCategoryOrder(catalog)).toEqual(["Medical", "Cleaning", "Enticements"]);
  });

  it("groups searchable catalog rows while preserving category and subcategory order", () => {
    const groups = buildInventoryCatalogGroups(catalog, "clean");
    expect(groups.map((group) => group.category)).toEqual(["Cleaning"]);
    expect(groups[0].subcategories.map((sub) => sub.name)).toEqual(["Chemicals", "Tools"]);
  });

  it("renumbers sort order without exposing sort values to the UI", () => {
    const ordered = assignInventoryCatalogSortOrder(catalog);
    expect(ordered.map((item) => [item.id, item.sort_order])).toEqual([
      ["d", 10],
      ["a", 20],
      ["b", 30],
      ["c", 40],
    ]);
  });

  it("moves entire categories while preserving item order inside the category", () => {
    const moved = moveInventoryCategory(catalog, "Enticements", -1);
    expect(getInventoryCategoryOrder(moved)).toEqual(["Medical", "Enticements", "Cleaning"]);
    expect(moved.map((item) => item.id)).toEqual(["d", "c", "a", "b"]);
  });

  it("builds category and subcategory suggestions from existing catalog values", () => {
    expect(getInventoryCategorySuggestions(catalog)).toEqual(["Medical", "Cleaning", "Enticements"]);
    expect(getInventorySubcategorySuggestions(catalog, "Cleaning")).toEqual(["Chemicals", "Tools"]);
  });

  it("renames every item in a subcategory within a category", () => {
    const renamed = renameInventorySubcategory(catalog, "Cleaning", "Chemicals", "Sanitation");
    expect(renamed.find((item) => item.id === "a")).toMatchObject({ subcategory: "Sanitation" });
    expect(renamed.find((item) => item.id === "b")).toMatchObject({ subcategory: "Tools" });
  });

  it("moves catalog items across sections and updates their grouping", () => {
    const moved = moveInventoryCatalogItem(catalog, "a", {
      category: "Medical",
      subcategory: "First Aid",
      targetItemId: "d",
      position: "after",
    });

    expect(moved.map((item) => item.id)).toEqual(["d", "a", "b", "c"]);
    expect(moved.find((item) => item.id === "a")).toMatchObject({
      category: "Medical",
      subcategory: "First Aid",
      sort_order: 20,
    });
  });

  it("normalizes vendor URLs for catalog editing and saving", () => {
    expect(normalizeInventoryVendorUrl(" amazon.com/foo ")).toBe("https://amazon.com/foo");
    expect(normalizeInventoryVendorUrl("www.amazon.com/foo")).toBe("https://www.amazon.com/foo");
    expect(normalizeInventoryVendorUrl("https://amazon.com/foo")).toBe("https://amazon.com/foo");
    expect(normalizeInventoryVendorUrl("http://amazon.com/foo")).toBe("http://amazon.com/foo");
    expect(normalizeInventoryVendorUrl("//amazon.com/foo")).toBe("//amazon.com/foo");
    expect(normalizeInventoryVendorUrl("")).toBe("");
    expect(normalizeInventoryVendorUrl(" javascript:alert(1) ")).toBe("");
  });

  it("only renders safe vendor links as clickable hrefs", () => {
    expect(getInventoryVendorHref("amazon.com/foo")).toBe("https://amazon.com/foo");
    expect(getInventoryVendorHref("https://amazon.com/foo")).toBe("https://amazon.com/foo");
    expect(getInventoryVendorHref("//amazon.com/foo")).toBe("//amazon.com/foo");
    expect(getInventoryVendorHref("javascript:alert(1)")).toBe("");
    expect(getInventoryVendorHref("not a url")).toBe("");
  });
});

describe("moveInventoryCatalogItemByStep (▲▼ reorder)", () => {
  const seq = [
    { id: "x1", item_name: "One", category: "Food", subcategory: "Dry", sort_order: 10 },
    { id: "x2", item_name: "Two", category: "Food", subcategory: "Dry", sort_order: 20 },
    { id: "x3", item_name: "Three", category: "Food", subcategory: "Dry", sort_order: 30 },
  ];

  it("moves an item up by swapping with its previous sibling", () => {
    expect(orderIds(moveInventoryCatalogItemByStep(seq, "x2", "up"))).toEqual(["x2", "x1", "x3"]);
  });

  it("moves an item down by swapping with its next sibling", () => {
    expect(orderIds(moveInventoryCatalogItemByStep(seq, "x1", "down"))).toEqual(["x2", "x1", "x3"]);
  });

  it("is a no-op at the boundaries of the subcategory", () => {
    expect(orderIds(moveInventoryCatalogItemByStep(seq, "x1", "up"))).toEqual(["x1", "x2", "x3"]);
    expect(orderIds(moveInventoryCatalogItemByStep(seq, "x3", "down"))).toEqual(["x1", "x2", "x3"]);
  });

  it("keeps the item in its own subcategory and renumbers sort_order", () => {
    const moved = moveInventoryCatalogItemByStep(seq, "x3", "up");
    expect(orderIds(moved)).toEqual(["x1", "x3", "x2"]);
    expect(moved.find((i) => i.id === "x3")).toMatchObject({ category: "Food", subcategory: "Dry" });
    expect(moved.every((i) => i.sort_order % 10 === 0)).toBe(true);
  });
});
