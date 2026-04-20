const DAY_MS = 24 * 60 * 60 * 1000;

export function addDateDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateKey(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function toDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function reservationStart(reservation) {
  return toDate(
    reservation?.checkIn ||
    reservation?.check_in ||
    reservation?.startDate ||
    reservation?.start_date ||
    reservation?.arrival_date ||
    reservation?.date
  );
}

function reservationEnd(reservation) {
  return toDate(
    reservation?.checkOut ||
    reservation?.check_out ||
    reservation?.endDate ||
    reservation?.end_date ||
    reservation?.departure_date ||
    reservation?.checkIn ||
    reservation?.check_in ||
    reservation?.date
  );
}

function shouldCountReservation(reservation) {
  const status = String(reservation?.status || "").toLowerCase();
  return !["cancelled", "canceled", "no-show", "no_show"].includes(status);
}

function reservationDogMultiplier(reservation) {
  if (reservation?.dogId || reservation?.dog_id || reservation?.animal_id || reservation?.animalGingrId) return 1;
  if (Array.isArray(reservation?.dogIds) && reservation.dogIds.length > 0) return reservation.dogIds.length;
  if (Array.isArray(reservation?.dog_ids) && reservation.dog_ids.length > 0) return reservation.dog_ids.length;
  if (Array.isArray(reservation?.dogs) && reservation.dogs.length > 0) return reservation.dogs.length;
  const dogCount = Number(reservation?.dogCount ?? reservation?.dog_count ?? reservation?.animal_count);
  return Number.isFinite(dogCount) && dogCount > 0 ? dogCount : 1;
}

export function computeDogDaysForRange(reservations = [], startKey, endKey) {
  const start = toDate(startKey);
  const end = toDate(endKey);
  if (!start || !end || end < start) return 0;

  return (reservations || []).reduce((sum, reservation) => {
    if (!shouldCountReservation(reservation)) return sum;

    const resStart = reservationStart(reservation);
    const resEnd = reservationEnd(reservation);
    if (!resStart || !resEnd) return sum;

    const overlapStart = resStart > start ? resStart : start;
    const overlapEnd = resEnd < end ? resEnd : end;
    if (overlapEnd < overlapStart) return sum;

    const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / DAY_MS) + 1;
    return sum + (Math.max(0, days) * reservationDogMultiplier(reservation));
  }, 0);
}

export function isCompletedInventorySnapshot(snapshot) {
  const status = String(snapshot?.status || "").toLowerCase();
  return status === "completed" || status === "complete" || Boolean(snapshot?.completed_at);
}

function buildCountMap(counts = []) {
  return (counts || []).reduce((map, count) => {
    if (!count?.snapshot_id || !count?.catalog_item_id) return map;
    if (!map[count.snapshot_id]) map[count.snapshot_id] = {};
    map[count.snapshot_id][count.catalog_item_id] = count;
    return map;
  }, {});
}

function buildCatalogMap(catalog = []) {
  return (catalog || []).reduce((map, item) => {
    if (item?.id) map[item.id] = item;
    return map;
  }, {});
}

function getCycleQuality({ openingStock, closingStock, dogDays, depletion, priorInTransit }) {
  if (openingStock == null || closingStock == null) return "missing_count";
  if (!dogDays) return "missing_dog_days";
  if (depletion < 0) return "stock_increase_without_receipts";
  if (depletion === 0) return "no_observed_usage";
  if (priorInTransit > 0) return "uses_prior_in_transit";
  return "usable";
}

export const INVENTORY_DEPLETION_QUALITY_LABELS = {
  missing_count: "Missing count",
  missing_dog_days: "Missing dog-days",
  stock_increase_without_receipts: "Stock increased without received data",
  no_observed_usage: "Zero observed usage",
  uses_prior_in_transit: "Estimated receipt from prior in-transit",
  usable: "Usable",
};

export function buildInventoryDepletionCycles({
  catalog = [],
  snapshots = [],
  counts = [],
  reservations = [],
} = {}) {
  const completed = (snapshots || [])
    .filter(isCompletedInventorySnapshot)
    .sort((a, b) => String(a.week_start || "").localeCompare(String(b.week_start || "")));
  if (completed.length < 2) return [];

  const countMap = buildCountMap(counts);
  const catalogMap = buildCatalogMap(catalog);
  const cycles = [];

  for (let i = 1; i < completed.length; i += 1) {
    const openingSnapshot = completed[i - 1];
    const closingSnapshot = completed[i];
    const cycleStart = dateKey(openingSnapshot.week_start);
    const cycleEnd = addDateDays(dateKey(closingSnapshot.week_start), -1);
    const dogDays = computeDogDaysForRange(reservations, cycleStart, cycleEnd);
    const openingCounts = countMap[openingSnapshot.id] || {};
    const closingCounts = countMap[closingSnapshot.id] || {};
    const itemIds = new Set([
      ...Object.keys(openingCounts),
      ...Object.keys(closingCounts),
      ...(catalog || []).map((item) => item.id).filter(Boolean),
    ]);

    itemIds.forEach((itemId) => {
      const catalogItem = catalogMap[itemId] || {};
      const openingCount = openingCounts[itemId];
      const closingCount = closingCounts[itemId];
      const openingStock = nullableNumber(openingCount?.stock_count);
      const closingStock = nullableNumber(closingCount?.stock_count);
      if (openingStock == null && closingStock == null) return;

      // Existing inventory screens record "in transit" at count time. For
      // cycle math, only the prior count's in-transit quantity can plausibly
      // become stock available during the next cycle.
      const priorInTransit = toNumber(openingCount?.in_transit, 0);
      const depletion = openingStock == null || closingStock == null
        ? null
        : openingStock + priorInTransit - closingStock;
      const quality = getCycleQuality({ openingStock, closingStock, dogDays, depletion, priorInTransit });
      const usableForCoefficient = depletion > 0 && dogDays > 0;
      const unitCost = toNumber(catalogItem.unit_price, 0);
      const receivedUnits = priorInTransit;
      const openingValue = openingStock == null ? null : openingStock * unitCost;
      const receivedValue = receivedUnits * unitCost;
      const closingValue = closingStock == null ? null : closingStock * unitCost;
      const netInventoryValueChange = openingValue == null || closingValue == null
        ? null
        : closingValue - openingValue;
      const usageValue = usableForCoefficient ? depletion * unitCost : 0;

      cycles.push({
        itemId,
        itemName: catalogItem.item_name || "Unknown item",
        category: catalogItem.category || "Uncategorized",
        unitPrice: unitCost,
        unitCost,
        currentPar: nullableNumber(catalogItem.par_level),
        openingSnapshotId: openingSnapshot.id,
        closingSnapshotId: closingSnapshot.id,
        openingWeekStart: dateKey(openingSnapshot.week_start),
        closingWeekStart: dateKey(closingSnapshot.week_start),
        cycleStart,
        cycleEnd,
        openingStock,
        closingStock,
        priorInTransit,
        receivedUnits,
        depletion,
        dogDays,
        ratePerDogDay: usableForCoefficient ? depletion / dogDays : null,
        usageValue,
        consumedValue: usageValue,
        openingValue,
        receivedValue,
        closingValue,
        netInventoryValueChange,
        quality,
        usableForCoefficient,
      });
    });
  }

  return cycles;
}

function confidenceForCycleCount(validCycles) {
  if (validCycles >= 9) return "High";
  if (validCycles >= 4) return "Medium";
  if (validCycles >= 2) return "Low";
  if (validCycles === 1) return "Emerging";
  return "Insufficient";
}

export function buildInventoryItemStats(cycles = [], catalog = []) {
  const catalogMap = buildCatalogMap(catalog);
  const byItem = {};
  (cycles || []).forEach((cycle) => {
    if (!byItem[cycle.itemId]) byItem[cycle.itemId] = [];
    byItem[cycle.itemId].push(cycle);
  });

  return Object.entries(byItem)
    .map(([itemId, itemCycles]) => {
      const validCycles = itemCycles.filter((cycle) => cycle.usableForCoefficient);
      const totalDepletion = validCycles.reduce((sum, cycle) => sum + toNumber(cycle.depletion, 0), 0);
      const totalDogDays = validCycles.reduce((sum, cycle) => sum + toNumber(cycle.dogDays, 0), 0);
      const avgRatePerDogDay = totalDogDays > 0 ? totalDepletion / totalDogDays : null;
      const avgCycleUsage = validCycles.length ? totalDepletion / validCycles.length : null;
      const simpleAvgRate = validCycles.length
        ? validCycles.reduce((sum, cycle) => sum + toNumber(cycle.ratePerDogDay, 0), 0) / validCycles.length
        : null;
      const latestCycle = [...itemCycles]
        .sort((a, b) => String(b.closingWeekStart).localeCompare(String(a.closingWeekStart)))[0];
      const recent = validCycles.slice(-Math.max(1, Math.floor(validCycles.length / 2)));
      const older = validCycles.slice(0, Math.max(0, validCycles.length - recent.length));
      const recentAvg = recent.length ? recent.reduce((sum, cycle) => sum + toNumber(cycle.depletion, 0), 0) / recent.length : 0;
      const olderAvg = older.length ? older.reduce((sum, cycle) => sum + toNumber(cycle.depletion, 0), 0) / older.length : recentAvg;
      const trend = recentAvg > olderAvg * 1.1 ? "up" : recentAvg < olderAvg * 0.9 ? "down" : "stable";
      const avgDogDaysPerCycle = validCycles.length ? totalDogDays / validCycles.length : 0;
      const recommendedPar = avgRatePerDogDay != null
        ? Math.ceil(avgRatePerDogDay * avgDogDaysPerCycle * 1.2)
        : null;
      const catalogItem = catalogMap[itemId] || {};

      return {
        itemId,
        itemName: catalogItem.item_name || latestCycle?.itemName || "Unknown item",
        category: catalogItem.category || latestCycle?.category || "Uncategorized",
        unitPrice: toNumber(catalogItem.unit_price ?? latestCycle?.unitPrice, 0),
        unitCost: toNumber(catalogItem.unit_price ?? latestCycle?.unitCost, 0),
        currentPar: nullableNumber(catalogItem.par_level ?? latestCycle?.currentPar),
        latestOnHand: latestCycle?.closingStock ?? null,
        latestOnHandValue: latestCycle?.closingValue ?? null,
        avgCycleUsage,
        avgRatePerDogDay,
        simpleAvgRate,
        totalDepletion,
        totalDogDays,
        totalUsageValue: validCycles.reduce((sum, cycle) => sum + toNumber(cycle.usageValue, 0), 0),
        totalConsumedValue: validCycles.reduce((sum, cycle) => sum + toNumber(cycle.consumedValue, 0), 0),
        totalReceivedValue: itemCycles.reduce((sum, cycle) => sum + toNumber(cycle.receivedValue, 0), 0),
        totalNetInventoryValueChange: itemCycles.reduce((sum, cycle) => sum + toNumber(cycle.netInventoryValueChange, 0), 0),
        validCycles: validCycles.length,
        totalCycles: itemCycles.length,
        excludedCycles: itemCycles.length - validCycles.length,
        trend,
        confidence: confidenceForCycleCount(validCycles.length),
        recommendedPar,
        cycles: itemCycles.sort((a, b) => String(b.closingWeekStart).localeCompare(String(a.closingWeekStart))),
      };
    })
    .sort((a, b) => toNumber(b.totalUsageValue, 0) - toNumber(a.totalUsageValue, 0));
}

export function buildInventoryCycleSummaries(cycles = []) {
  const byCycle = {};
  (cycles || []).forEach((cycle) => {
    const key = `${cycle.cycleStart}|${cycle.cycleEnd}|${cycle.closingWeekStart}`;
    if (!byCycle[key]) {
      byCycle[key] = {
        key,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        closingWeekStart: cycle.closingWeekStart,
        dogDays: cycle.dogDays,
        usageUnits: 0,
        usageValue: 0,
        consumedValue: 0,
        receivedValue: 0,
        openingValue: 0,
        closingValue: 0,
        netInventoryValueChange: 0,
        validItems: 0,
        excludedItems: 0,
      };
    }
    byCycle[key].openingValue += toNumber(cycle.openingValue, 0);
    byCycle[key].receivedValue += toNumber(cycle.receivedValue, 0);
    byCycle[key].closingValue += toNumber(cycle.closingValue, 0);
    byCycle[key].netInventoryValueChange += toNumber(cycle.netInventoryValueChange, 0);
    if (cycle.usableForCoefficient) {
      byCycle[key].usageUnits += toNumber(cycle.depletion, 0);
      byCycle[key].usageValue += toNumber(cycle.usageValue, 0);
      byCycle[key].consumedValue += toNumber(cycle.consumedValue, 0);
      byCycle[key].validItems += 1;
    } else {
      byCycle[key].excludedItems += 1;
    }
  });

  return Object.values(byCycle)
    .sort((a, b) => String(a.cycleStart).localeCompare(String(b.cycleStart)));
}

export function buildInventoryDepletionAnalytics(args = {}) {
  const cycles = buildInventoryDepletionCycles(args);
  const itemStats = buildInventoryItemStats(cycles, args.catalog || []);
  const cycleSummaries = buildInventoryCycleSummaries(cycles);
  const validCycles = cycles.filter((cycle) => cycle.usableForCoefficient);
  const totalUsageValue = validCycles.reduce((sum, cycle) => sum + toNumber(cycle.usageValue, 0), 0);
  const totalDogDays = cycleSummaries.reduce((sum, cycle) => sum + toNumber(cycle.dogDays, 0), 0);
  const totalUsageUnits = validCycles.reduce((sum, cycle) => sum + toNumber(cycle.depletion, 0), 0);
  const excludedCycles = cycles.length - validCycles.length;

  return {
    cycles,
    itemStats,
    cycleSummaries,
    validCycles,
    totalUsageValue,
    totalUsageUnits,
    totalDogDays,
    excludedCycles,
    confidence: confidenceForCycleCount(new Set(validCycles.map((cycle) => cycle.closingWeekStart)).size),
  };
}

export function buildInventoryQualityBreakdown(cycles = []) {
  const counts = {};
  (cycles || [])
    .filter((cycle) => !cycle.usableForCoefficient)
    .forEach((cycle) => {
      const quality = cycle.quality || "unknown";
      counts[quality] = (counts[quality] || 0) + 1;
    });

  return Object.entries(counts)
    .map(([quality, count]) => ({
      quality,
      count,
      label: INVENTORY_DEPLETION_QUALITY_LABELS[quality] || quality.replaceAll("_", " "),
    }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeInventoryUsageForRange(cycles = [], startKey, endKey) {
  const start = dateKey(startKey);
  const end = dateKey(endKey);
  const inRange = (cycles || []).filter((cycle) =>
    (!start || cycle.cycleEnd >= start) &&
    (!end || cycle.cycleStart <= end)
  );
  const validCycles = inRange.filter((cycle) => cycle.usableForCoefficient);
  const cycleKeys = new Set(inRange.map((cycle) => `${cycle.cycleStart}|${cycle.cycleEnd}`));
  return {
    cycles: inRange,
    cycleCount: cycleKeys.size,
    validCycleCount: validCycles.length,
    excludedCycleCount: inRange.length - validCycles.length,
    usageValue: validCycles.reduce((sum, cycle) => sum + toNumber(cycle.usageValue, 0), 0),
    consumedValue: validCycles.reduce((sum, cycle) => sum + toNumber(cycle.consumedValue, 0), 0),
    receivedValue: inRange.reduce((sum, cycle) => sum + toNumber(cycle.receivedValue, 0), 0),
    openingValue: inRange.reduce((sum, cycle) => sum + toNumber(cycle.openingValue, 0), 0),
    closingValue: inRange.reduce((sum, cycle) => sum + toNumber(cycle.closingValue, 0), 0),
    netInventoryValueChange: inRange.reduce((sum, cycle) => sum + toNumber(cycle.netInventoryValueChange, 0), 0),
    usageUnits: validCycles.reduce((sum, cycle) => sum + toNumber(cycle.depletion, 0), 0),
    dogDays: Array.from(cycleKeys).reduce((sum, key) => {
      const cycle = inRange.find((row) => `${row.cycleStart}|${row.cycleEnd}` === key);
      return sum + toNumber(cycle?.dogDays, 0);
    }, 0),
  };
}

export function summarizeLatestInventoryCycle(cycles = []) {
  const latest = [...(cycles || [])]
    .sort((a, b) => String(b.closingWeekStart).localeCompare(String(a.closingWeekStart)))[0];
  if (!latest) {
    return {
      cycles: [],
      cycleCount: 0,
      validCycleCount: 0,
      excludedCycleCount: 0,
      usageValue: 0,
      consumedValue: 0,
      receivedValue: 0,
      openingValue: 0,
      closingValue: 0,
      netInventoryValueChange: 0,
      usageUnits: 0,
      dogDays: 0,
      cycleStart: null,
      cycleEnd: null,
      closingWeekStart: null,
    };
  }

  const summary = summarizeInventoryUsageForRange(cycles, latest.cycleStart, latest.cycleEnd);
  return {
    ...summary,
    cycleStart: latest.cycleStart,
    cycleEnd: latest.cycleEnd,
    closingWeekStart: latest.closingWeekStart,
  };
}

export function projectInventoryUsage({
  itemStats = [],
  reservations = [],
  startKey,
  days = 7,
  fallbackDogDaysPerDay = 0,
} = {}) {
  const endKey = addDateDays(startKey, Math.max(0, days - 1));
  let dogDays = computeDogDaysForRange(reservations, startKey, endKey);
  if (!dogDays && fallbackDogDaysPerDay > 0) dogDays = fallbackDogDaysPerDay * days;

  const projectedItems = (itemStats || [])
    .filter((item) => item.avgRatePerDogDay != null && item.validCycles > 0)
    .map((item) => {
      const projectedUnits = item.avgRatePerDogDay * dogDays;
      const projectedValue = projectedUnits * toNumber(item.unitCost ?? item.unitPrice, 0);
      const dailyUnits = days > 0 ? projectedUnits / days : 0;
      const runoutDays = dailyUnits > 0 && item.latestOnHand != null
        ? item.latestOnHand / dailyUnits
        : null;
      return { ...item, projectedUnits, projectedValue, runoutDays };
    })
    .sort((a, b) => toNumber(b.projectedValue, 0) - toNumber(a.projectedValue, 0));

  return {
    startKey,
    endKey,
    days,
    dogDays,
    projectedValue: projectedItems.reduce((sum, item) => sum + toNumber(item.projectedValue, 0), 0),
    projectedUnits: projectedItems.reduce((sum, item) => sum + toNumber(item.projectedUnits, 0), 0),
    items: projectedItems,
  };
}
