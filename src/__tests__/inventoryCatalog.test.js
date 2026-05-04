import { describe, expect, it } from "vitest";
import {
  assignInventoryCatalogSortOrder,
  buildInventoryCatalogGroups,
  getInventoryCategoryOrder,
  moveInventoryCategory,
} from "../kol/pages/inventoryCatalog";

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
});
