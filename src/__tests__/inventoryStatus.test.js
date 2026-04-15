import { describe, expect, it } from 'vitest';
import { getInventoryWorkflow } from '../kol/pages/inventoryStatus';

describe('inventoryStatus', () => {
  it('keeps fully handled in-progress weeks in ready-to-submit instead of completed', () => {
    const workflow = getInventoryWorkflow({
      snapshotStatus: 'in_progress',
      catalogItems: [
        { id: 'food-1', par_level: 5, is_active: true },
        { id: 'food-2', par_level: 3, is_active: true },
      ],
      countRows: [
        { catalog_item_id: 'food-1', stock_count: 2, in_transit: 1, ordered: true, counted_at: '2026-04-14T10:00:00Z', ordered_at: '2026-04-14T10:05:00Z' },
        { catalog_item_id: 'food-2', stock_count: 3, in_transit: 0, ordered: false, skipped: false, counted_at: '2026-04-14T10:02:00Z' },
      ],
      adhocItems: [
        { id: 'adhoc-1', stock_count: 1, ordered: false, skipped: true, created_at: '2026-04-14T10:06:00Z' },
      ],
    });

    expect(workflow.countingComplete).toBe(true);
    expect(workflow.orderingComplete).toBe(true);
    expect(workflow.readyToSubmit).toBe(true);
    expect(workflow.status).toBe('ready');
    expect(workflow.phase).toBe('ready');
    expect(workflow.itemsNeedingOrder).toBe(2);
    expect(workflow.itemsOrdered).toBe(1);
    expect(workflow.itemsSkipped).toBe(1);
  });

  it('requires order decisions for ad-hoc items and counts skipped items as addressed', () => {
    const workflow = getInventoryWorkflow({
      snapshotStatus: 'in_progress',
      catalogItems: [
        { id: 'food-1', par_level: 10, is_active: true },
      ],
      countRows: [
        { catalog_item_id: 'food-1', stock_count: 4, in_transit: 0, ordered: false, skipped: true },
      ],
      adhocItems: [
        { id: 'adhoc-1', stock_count: 2, ordered: false, skipped: false, created_at: '2026-04-14T10:06:00Z' },
      ],
    });

    expect(workflow.countingComplete).toBe(true);
    expect(workflow.orderingComplete).toBe(false);
    expect(workflow.pendingOrderingCount).toBe(1);
    expect(workflow.status).toBe('in_progress');
    expect(workflow.phase).toBe('ordering');
  });

  it('treats completed snapshots as completed even when the data is fully handled', () => {
    const workflow = getInventoryWorkflow({
      snapshotStatus: 'completed',
      catalogItems: [
        { id: 'food-1', par_level: 4, is_active: true },
      ],
      countRows: [
        { catalog_item_id: 'food-1', stock_count: 4, in_transit: 0, ordered: false, skipped: false, counted_at: '2026-04-14T10:00:00Z' },
      ],
      adhocItems: [],
    });

    expect(workflow.readyToSubmit).toBe(false);
    expect(workflow.status).toBe('completed');
    expect(workflow.phase).toBe('done');
    expect(workflow.phaseLabel).toBe('Completed this week');
  });
});
