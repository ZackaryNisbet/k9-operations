function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function toInt(value) {
  if (!hasValue(value)) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestDate(dates) {
  const valid = dates
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((value) => value.getTime())));
}

function buildCountLookup(counts, countRows) {
  if (Array.isArray(countRows)) {
    return countRows.reduce((acc, row) => {
      if (row?.catalog_item_id) acc[row.catalog_item_id] = row;
      return acc;
    }, {});
  }
  return counts || {};
}

export function getInventoryWorkflow({
  snapshotStatus,
  catalogItems = [],
  counts,
  countRows,
  adhocItems = [],
}) {
  const activeCatalogItems = (catalogItems || []).filter((item) => item && item.is_active !== false);
  const countLookup = buildCountLookup(counts, countRows);
  const countingDates = [];
  const orderingDates = [];

  let countedCatalogItems = 0;
  let countedAdhocItems = 0;
  let itemsNeedingOrder = 0;
  let itemsOrdered = 0;
  let itemsSkipped = 0;

  activeCatalogItems.forEach((item) => {
    const count = countLookup[item.id];
    if (!hasValue(count?.stock_count)) return;

    countedCatalogItems += 1;
    countingDates.push(count?.counted_at || count?.created_at || null);

    const toOrder = Math.max(
      0,
      toInt(item?.par_level) - toInt(count?.stock_count) - toInt(count?.in_transit)
    );

    if (toOrder <= 0) return;

    itemsNeedingOrder += 1;
    if (count?.ordered) {
      itemsOrdered += 1;
      orderingDates.push(count?.ordered_at || count?.counted_at || count?.created_at || null);
    } else if (count?.skipped) {
      itemsSkipped += 1;
      orderingDates.push(count?.skipped_at || count?.counted_at || count?.created_at || null);
    }
  });

  (adhocItems || []).forEach((item) => {
    if (!hasValue(item?.stock_count)) return;

    countedAdhocItems += 1;
    countingDates.push(item?.updated_at || item?.created_at || null);
    itemsNeedingOrder += 1;

    if (item?.ordered) {
      itemsOrdered += 1;
      orderingDates.push(item?.updated_at || item?.created_at || null);
    } else if (item?.skipped) {
      itemsSkipped += 1;
      orderingDates.push(item?.updated_at || item?.created_at || null);
    }
  });

  const totalItems = activeCatalogItems.length + (adhocItems?.length || 0);
  const itemsCounted = countedCatalogItems + countedAdhocItems;
  const missingCountCount = Math.max(0, totalItems - itemsCounted);
  const addressedCount = itemsOrdered + itemsSkipped;
  const pendingOrderingCount = Math.max(0, itemsNeedingOrder - addressedCount);
  const countingComplete = totalItems > 0 && itemsCounted >= totalItems;
  const orderingComplete = countingComplete && pendingOrderingCount === 0;
  const isCompleted = snapshotStatus === 'completed';
  const readyToSubmit = !isCompleted && countingComplete && orderingComplete;
  const started = itemsCounted > 0 || addressedCount > 0;

  let status = 'not_started';
  let phase = 'counting';
  let phaseLabel = totalItems > 0 ? 'Not started this week' : '';

  if (isCompleted) {
    status = 'completed';
    phase = 'done';
    phaseLabel = 'Completed this week';
  } else if (readyToSubmit) {
    status = 'ready';
    phase = 'ready';
    phaseLabel = 'Ready to submit';
  } else if (countingComplete) {
    status = 'in_progress';
    phase = 'ordering';
    phaseLabel = itemsNeedingOrder > 0
      ? `${addressedCount}/${itemsNeedingOrder} items addressed`
      : 'Ordering complete';
  } else if (started) {
    status = 'in_progress';
    phase = 'counting';
    phaseLabel = `${itemsCounted}/${totalItems} items counted`;
  }

  const progress = status === 'completed' || status === 'ready'
    ? 100
    : countingComplete
      ? (itemsNeedingOrder > 0 ? Math.round((addressedCount / itemsNeedingOrder) * 100) : 100)
      : (totalItems > 0 ? Math.round((itemsCounted / totalItems) * 100) : 0);

  return {
    status,
    phase,
    phaseLabel,
    progress,
    totalItems,
    itemsCounted,
    countedCatalogItems,
    countedAdhocItems,
    missingCountCount,
    itemsNeedingOrder,
    itemsOrdered,
    itemsSkipped,
    pendingOrderingCount,
    countingComplete,
    orderingComplete,
    readyToSubmit,
    countingDoneDate: countingComplete ? latestDate(countingDates) : null,
    orderingDoneDate: orderingComplete ? latestDate([...orderingDates, ...countingDates]) : null,
  };
}
