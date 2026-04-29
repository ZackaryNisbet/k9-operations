import { describe, expect, it } from "vitest";
import {
  buildInventoryDepletionAnalytics,
  buildInventoryDepletionCycles,
  buildInventoryQualityBreakdown,
  computeDogDaysForRange,
  projectInventoryUsage,
  summarizeLatestInventoryCycle,
} from "../kol/pages/inventoryDepletion";

const catalog = [
  { id: "chicken", item_name: "Chicken", category: "Food", unit_price: 50, par_level: 4 },
  { id: "kibble", item_name: "Kibble", category: "Food", unit_price: 80, par_level: 8 },
];

const snapshots = [
  { id: "snap-1", location_id: "cherry-hill", week_start: "2026-04-06", status: "completed" },
  { id: "snap-2", location_id: "cherry-hill", week_start: "2026-04-13", status: "completed" },
  { id: "snap-3", location_id: "cherry-hill", week_start: "2026-04-20", status: "completed" },
];

describe("inventory depletion analytics", () => {
  it("counts dog-days for the period between inventory counts", () => {
    const dogDays = computeDogDaysForRange([
      { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-08" },
      { dogId: "b", status: "checked-out", checkIn: "2026-04-10", checkOut: "2026-04-13" },
      { dogId: "c", status: "cancelled", checkIn: "2026-04-06", checkOut: "2026-04-12" },
    ], "2026-04-06", "2026-04-12");

    expect(dogDays).toBe(6);
  });

  it("computes historical count-to-count depletion without relying on persisted rate rows", () => {
    const cycles = buildInventoryDepletionCycles({
      catalog,
      snapshots,
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-12" },
        { dogId: "b", status: "checked-out", checkIn: "2026-04-13", checkOut: "2026-04-19" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "chicken", stock_count: 10, in_transit: 2 },
        { snapshot_id: "snap-2", catalog_item_id: "chicken", stock_count: 7, in_transit: 0 },
        { snapshot_id: "snap-3", catalog_item_id: "chicken", stock_count: 5, in_transit: 0 },
      ],
    });

    const chickenCycles = cycles.filter((cycle) => cycle.itemId === "chicken");

    expect(chickenCycles).toHaveLength(2);
    expect(chickenCycles[0]).toMatchObject({
      cycleStart: "2026-04-06",
      cycleEnd: "2026-04-12",
      openingStock: 10,
      closingStock: 7,
      priorInTransit: 2,
      receivedUnits: 2,
      depletion: 5,
      dogDays: 7,
      openingValue: 500,
      receivedValue: 100,
      closingValue: 350,
      consumedValue: 250,
      netInventoryValueChange: -150,
      usableForCoefficient: true,
    });
    expect(chickenCycles[0].ratePerDogDay).toBeCloseTo(5 / 7, 5);
    expect(chickenCycles[1]).toMatchObject({
      cycleStart: "2026-04-13",
      cycleEnd: "2026-04-19",
      depletion: 2,
      dogDays: 7,
    });
  });

  it("excludes stock increases from coefficients and surfaces them as data-quality issues", () => {
    const analytics = buildInventoryDepletionAnalytics({
      catalog,
      snapshots,
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-19" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "kibble", stock_count: 2, in_transit: 0 },
        { snapshot_id: "snap-2", catalog_item_id: "kibble", stock_count: 6, in_transit: 0 },
        { snapshot_id: "snap-3", catalog_item_id: "kibble", stock_count: 4, in_transit: 0 },
      ],
    });

    const kibble = analytics.itemStats.find((item) => item.itemId === "kibble");
    const flagged = analytics.cycles.find((cycle) => cycle.quality === "stock_increase_without_receipts");

    expect(flagged).toBeTruthy();
    expect(flagged.usableForCoefficient).toBe(false);
    expect(kibble.validCycles).toBe(1);
    expect(kibble.totalCycles).toBe(2);
    expect(kibble.avgRatePerDogDay).toBeCloseTo(2 / 7, 5);
  });

  it("projects future usage from the learned coefficient and expected dog-days", () => {
    const analytics = buildInventoryDepletionAnalytics({
      catalog,
      snapshots,
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-19" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "chicken", stock_count: 10, in_transit: 0 },
        { snapshot_id: "snap-2", catalog_item_id: "chicken", stock_count: 8, in_transit: 0 },
        { snapshot_id: "snap-3", catalog_item_id: "chicken", stock_count: 6, in_transit: 0 },
      ],
    });

    const projection = projectInventoryUsage({
      itemStats: analytics.itemStats,
      reservations: [
        { dogId: "future-a", status: "upcoming", checkIn: "2026-04-20", checkOut: "2026-04-26" },
        { dogId: "future-b", status: "upcoming", checkIn: "2026-04-22", checkOut: "2026-04-23" },
      ],
      startKey: "2026-04-20",
      days: 7,
    });

    expect(projection.dogDays).toBe(9);
    expect(projection.items[0].projectedUnits).toBeCloseTo((4 / 14) * 9, 5);
    expect(projection.projectedValue).toBeCloseTo((4 / 14) * 9 * 50, 5);
  });

  it("separates consumed value from received value and net inventory change", () => {
    const analytics = buildInventoryDepletionAnalytics({
      catalog,
      snapshots: snapshots.slice(0, 2),
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-12" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "chicken", stock_count: 10, in_transit: 2 },
        { snapshot_id: "snap-2", catalog_item_id: "chicken", stock_count: 7, in_transit: 0 },
        { snapshot_id: "snap-1", catalog_item_id: "kibble", stock_count: 8, in_transit: 1 },
        { snapshot_id: "snap-2", catalog_item_id: "kibble", stock_count: 6, in_transit: 0 },
      ],
    });

    expect(analytics.cycleSummaries[0]).toMatchObject({
      usageValue: 490,
      consumedValue: 490,
      receivedValue: 180,
      openingValue: 1140,
      closingValue: 830,
      netInventoryValueChange: -310,
    });
  });

  it("summarizes only the latest completed cycle for the default executive view", () => {
    const analytics = buildInventoryDepletionAnalytics({
      catalog,
      snapshots,
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-19" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "chicken", stock_count: 10, in_transit: 0 },
        { snapshot_id: "snap-2", catalog_item_id: "chicken", stock_count: 8, in_transit: 0 },
        { snapshot_id: "snap-3", catalog_item_id: "chicken", stock_count: 5, in_transit: 0 },
      ],
    });

    const summary = summarizeLatestInventoryCycle(analytics.cycles);

    expect(summary).toMatchObject({
      cycleStart: "2026-04-13",
      cycleEnd: "2026-04-19",
      cycleCount: 1,
      usageUnits: 3,
      consumedValue: 150,
    });
  });

  it("breaks excluded item-cycles down by actionable quality reason", () => {
    const analytics = buildInventoryDepletionAnalytics({
      catalog,
      snapshots: snapshots.slice(0, 2),
      reservations: [
        { dogId: "a", status: "checked-out", checkIn: "2026-04-06", checkOut: "2026-04-12" },
      ],
      counts: [
        { snapshot_id: "snap-1", catalog_item_id: "chicken", stock_count: 10, in_transit: 0 },
        { snapshot_id: "snap-2", catalog_item_id: "chicken", stock_count: 10, in_transit: 0 },
        { snapshot_id: "snap-1", catalog_item_id: "kibble", stock_count: 2, in_transit: 0 },
        { snapshot_id: "snap-2", catalog_item_id: "kibble", stock_count: 5, in_transit: 0 },
      ],
    });

    expect(buildInventoryQualityBreakdown(analytics.cycles)).toEqual([
      { quality: "no_observed_usage", count: 1, label: "Zero observed usage" },
      { quality: "stock_increase_without_receipts", count: 1, label: "Stock increased without received data" },
    ]);
  });
});
