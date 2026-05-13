import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inventory realtime wiring", () => {
  it("subscribes the web inventory page to canonical inventory tables", () => {
    const source = readFileSync(new URL("../kol/pages/InventoryPage.jsx", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../../supabase/migrations/20260513181237_inventory_realtime_publication.sql", import.meta.url), "utf8");
    const tables = [
      "inventory_catalog",
      "inventory_snapshots",
      "inventory_counts",
      "inventory_adhoc_items",
    ];

    expect(source).toContain("INVENTORY_REALTIME_TABLES");
    expect(source).toContain("loadData({ quiet: true })");
    expect(source).toContain("inventoryRealtimeRefreshTimerRef");
    tables.forEach((table) => {
      expect(source).toContain(`\"${table}\"`);
      expect(migration).toContain(`'${table}'`);
    });
    expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE");
  });
});
