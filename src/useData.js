// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ============================================================
// Normalized data hook — 12 tables
// Entities (clients, dogs, reservations, etc.) → individual tables
// Config/settings (pricing, rooms, policies, etc.) → locations.data
// ============================================================

const ENTITIES = {
  clients:      { table: 'k9_clients',        extractDenorm: (doc) => ({}) },
  dogs:         { table: 'k9_dogs',           extractDenorm: (doc) => ({ client_id: doc.clientId || null }) },
  reservations: { table: 'k9_reservations',   extractDenorm: (doc) => ({
    client_id: doc.clientId || null,
    dog_id: doc.dogId || null,
    status: doc.status || null,
    check_in: doc.checkIn || null,
    check_out: doc.checkOut || null,
  })},
  evaluations:  { table: 'k9_evaluations',    extractDenorm: (doc) => ({
    dog_id: doc.dogId || null,
    reservation_id: doc.reservationId || null,
  })},
  payments:     { table: 'k9_payments',        extractDenorm: (doc) => ({
    client_id: doc.clientId || null,
    reservation_id: doc.reservationId || null,
    amount: doc.amount != null ? doc.amount : null,
    method: doc.method || null,
    status: doc.status || null,
  })},
  packages:     { table: 'k9_packages',        extractDenorm: (doc) => ({}) },
  packageSales: { table: 'k9_package_sales',   extractDenorm: (doc) => ({
    client_id: doc.clientId || null,
    package_id: doc.packageId || null,
  })},
  messages:     { table: 'k9_messages',        extractDenorm: (doc) => ({
    client_id: doc.clientId || null,
    sent_at: doc.timestamp || doc.sentAt || null,
  })},
  auditLog:     { table: 'k9_audit_log',       extractDenorm: (doc) => ({
    reservation_id: doc.reservationId || null,
  })},
};

// eodEntries + dailyOps both live in k9_daily_ops, split by type on load
const DAILY_OPS_TABLE = 'k9_daily_ops';
const dailyOpsDenorm = (doc) => ({
  type: doc.type || null,
  entry_date: doc.date || null,
});

const REMINDER_TABLE = 'k9_reminder_log';

// All entity keys that should NOT be written to the settings blob
const ENTITY_KEYS = new Set([
  ...Object.keys(ENTITIES),
  'eodEntries', 'dailyOps', 'reminderLog',
]);

// ── Diff: compare arrays by id ──
function diffArrays(oldArr, newArr) {
  const adds = [], updates = [], deletes = [];
  const oldMap = new Map((oldArr || []).map(item => [item.id, item]));
  const newMap = new Map((newArr || []).map(item => [item.id, item]));

  for (const item of (newArr || [])) {
    if (!item.id) continue;
    const old = oldMap.get(item.id);
    if (!old) adds.push(item);
    else if (JSON.stringify(item) !== JSON.stringify(old)) updates.push(item);
  }

  for (const item of (oldArr || [])) {
    if (item.id && !newMap.has(item.id)) deletes.push(item);
  }

  return { adds, updates, deletes, hasChanges: adds.length + updates.length + deletes.length > 0 };
}

// ============================================================
export function useData(profile) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const locationId = profile?.location_id;
  const saveTimeoutRef = useRef(null);
  const prevDataRef = useRef(null);
  const savingRef = useRef(false);

  // ── LOAD ──
  useEffect(() => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);

    const load = async () => {
      // Skip if a save is in progress — the save will set prevDataRef
      // and real-time will re-trigger load after the save completes
      if (savingRef.current) return;

      setLoadError(false);
      try {
        const [
          locRes, clientsRes, dogsRes, resRes, evalRes, opsRes,
          payRes, pkgRes, pkgSaleRes, msgRes, auditRes, remRes,
        ] = await Promise.all([
          supabase.from('locations').select('data').eq('id', locationId).single(),
          supabase.from('k9_clients').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_dogs').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_reservations').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_evaluations').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from(DAILY_OPS_TABLE).select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_payments').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_packages').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_package_sales').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_messages').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_audit_log').select('id, doc').eq('location_id', locationId).order('created_at'),
          supabase.from(REMINDER_TABLE).select('id, doc').eq('location_id', locationId).order('created_at'),
        ]);

        // Double-check: if save started while we were awaiting, discard this load
        if (savingRef.current) return;

        if (locRes.error) {
          console.error('Failed to load location:', locRes.error);
          setLoadError(true);
          setLoading(false);
          return;
        }

        // Settings = everything in locations.data (no entity arrays)
        const settings = locRes.data?.data || {};

        const docs = (res) => (res.data || []).map(row => row.doc);
        const allOps = docs(opsRes);
        const reminderDocs = docs(remRes);

        // Assemble: settings + entity arrays from tables
        const assembled = {
          ...settings,
          clients: docs(clientsRes),
          dogs: docs(dogsRes),
          reservations: docs(resRes),
          evaluations: docs(evalRes),
          eodEntries: allOps.filter(d => d.type === 'eod'),
          dailyOps: allOps.filter(d => d.type !== 'eod'),
          payments: docs(payRes),
          packages: docs(pkgRes),
          packageSales: docs(pkgSaleRes),
          messages: docs(msgRes),
          auditLog: docs(auditRes),
        };

        // Reminder log lives inside automations for backward compat with UI
        if (assembled.automations) {
          assembled.automations = { ...assembled.automations, reminderLog: reminderDocs };
        } else if (reminderDocs.length > 0) {
          assembled.automations = { reminderLog: reminderDocs };
        }

        if (Object.keys(assembled).length > 0) {
          prevDataRef.current = assembled;
          setData(assembled);
          setIsEmpty(false);
        } else {
          setData(null);
          setIsEmpty(true);
        }
        setLoading(false);
      } catch (err) {
        console.error('Unexpected load error:', err);
        setLoadError(true);
        setLoading(false);
      }
    };

    load();

    // ── Real-time: reload on any relevant table change ──
    const tables = [
      'k9_clients', 'k9_dogs', 'k9_reservations', 'k9_evaluations',
      DAILY_OPS_TABLE, 'k9_payments', 'k9_packages', 'k9_package_sales',
      'k9_messages', 'k9_audit_log',
    ];

    let channel = supabase
      .channel(`location-${locationId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'locations', filter: `id=eq.${locationId}` }, () => load());

    for (const tbl of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: tbl, filter: `location_id=eq.${locationId}` }, () => load());
    }

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [locationId]);

  // ── SAVE ──
  const save = useCallback(async (newData) => {
    setData(newData);
    setIsEmpty(false);
    if (!locationId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      savingRef.current = true;
      try {
        const prev = prevDataRef.current || {};
        prevDataRef.current = newData;

        // Collect ALL write promises, then execute in one batch
        const writeOps = [];

        // ── 1. Standard entity tables: diff and write ──
        for (const [key, config] of Object.entries(ENTITIES)) {
          const oldArr = prev[key];
          const newArr = newData[key];
          if (oldArr === newArr) continue;

          const diff = diffArrays(oldArr, newArr);
          if (!diff.hasChanges) continue;

          const { table, extractDenorm } = config;

          if (diff.adds.length > 0 || diff.updates.length > 0) {
            const rows = [...diff.adds, ...diff.updates].map(item => ({
              id: item.id,
              location_id: locationId,
              doc: item,
              ...extractDenorm(item),
            }));
            writeOps.push(
              supabase.from(table).upsert(rows, { onConflict: 'id' })
                .then(({ error }) => { if (error) console.error(`Failed to upsert ${key}:`, error); })
            );
          }

          if (diff.deletes.length > 0) {
            writeOps.push(
              supabase.from(table).delete().in('id', diff.deletes.map(i => i.id))
                .then(({ error }) => { if (error) console.error(`Failed to delete ${key}:`, error); })
            );
          }
        }

        // ── 2. Daily ops shared table (eodEntries + dailyOps) ──
        for (const key of ['eodEntries', 'dailyOps']) {
          const oldArr = prev[key];
          const newArr = newData[key];
          if (oldArr === newArr) continue;

          const diff = diffArrays(oldArr, newArr);
          if (!diff.hasChanges) continue;

          if (diff.adds.length > 0 || diff.updates.length > 0) {
            const rows = [...diff.adds, ...diff.updates].map(item => ({
              id: item.id,
              location_id: locationId,
              doc: item,
              ...dailyOpsDenorm(item),
            }));
            writeOps.push(
              supabase.from(DAILY_OPS_TABLE).upsert(rows, { onConflict: 'id' })
                .then(({ error }) => { if (error) console.error(`Failed to upsert ${key}:`, error); })
            );
          }

          if (diff.deletes.length > 0) {
            writeOps.push(
              supabase.from(DAILY_OPS_TABLE).delete().in('id', diff.deletes.map(i => i.id))
                .then(({ error }) => { if (error) console.error(`Failed to delete ${key}:`, error); })
            );
          }
        }

        // ── 3. Reminder log (nested in automations) ──
        const oldRemLog = prev.automations?.reminderLog;
        const newRemLog = newData.automations?.reminderLog;
        if (oldRemLog !== newRemLog) {
          const diff = diffArrays(oldRemLog, newRemLog);
          if (diff.hasChanges) {
            if (diff.adds.length > 0 || diff.updates.length > 0) {
              const rows = [...diff.adds, ...diff.updates].map(item => ({
                id: item.id,
                location_id: locationId,
                client_id: item.clientId || null,
                sent_at: item.sentAt || null,
                doc: item,
              }));
              writeOps.push(
                supabase.from(REMINDER_TABLE).upsert(rows, { onConflict: 'id' })
                  .then(({ error }) => { if (error) console.error('Failed to upsert reminders:', error); })
              );
            }
            if (diff.deletes.length > 0) {
              writeOps.push(
                supabase.from(REMINDER_TABLE).delete().in('id', diff.deletes.map(i => i.id))
                  .then(({ error }) => { if (error) console.error('Failed to delete reminders:', error); })
              );
            }
          }
        }

        // ── 4. Settings only → locations.data (no entity arrays) ──
        const settingsOnly = {};
        for (const [key, value] of Object.entries(newData)) {
          if (ENTITY_KEYS.has(key)) continue;
          if (key === 'automations' && value) {
            const { reminderLog, ...autoSettings } = value;
            settingsOnly[key] = autoSettings;
          } else {
            settingsOnly[key] = value;
          }
        }

        writeOps.push(
          supabase.from('locations').update({ data: settingsOnly }).eq('id', locationId)
            .then(({ error }) => { if (error) console.error('Failed to save settings:', error); })
        );

        // Fire ALL writes at once — no partial state for real-time to pick up
        await Promise.all(writeOps);

      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        savingRef.current = false;
      }
    }, 300);
  }, [locationId]);

  return { data, loading, save, locationId, loadError, isEmpty };
}
