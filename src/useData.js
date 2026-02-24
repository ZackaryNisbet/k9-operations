// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ============================================================
// Normalized data hook — 12 tables with REAL columns
// Entities → individual tables with proper columns
// Config/settings → locations.data
// ============================================================

// ── Column mappings: JS object field → DB column name ──
// "known fields" are mapped to real columns; anything else → custom_fields JSONB

const CLIENT_FIELDS = {
  phone: 'phone', first_name: 'first_name', last_name: 'last_name',
  email: 'email', address: 'address',
  emergency_contact: 'emergency_contact', emergency_phone: 'emergency_phone',
  vet_name: 'vet_name', vet_phone: 'vet_phone',
  notes: 'notes', referral_source: 'referral_source',
};

const DOG_FIELDS = {
  name: 'name', breed: 'breed', weight: 'weight', dob: 'dob',
  sex: 'sex', spayed_neutered: 'spayed_neutered', color: 'color',
  bath_type: 'bath_type', temperament: 'temperament',
  rabies_exp: 'rabies_exp', bordetella_exp: 'bordetella_exp',
  dhpp_exp: 'dhpp_exp', canine_flu_exp: 'canine_flu_exp',
  profilePic: 'profile_pic', weightLastUpdated: 'weight_last_updated',
  feedingSchedules: 'feeding_schedules', medicationSchedules: 'medication_schedules',
  weightLog: 'weight_log',
};

// ── Convert app JS object → flat DB row ──

function clientToRow(c, locationId) {
  const f = c.fields || {};
  const row = { id: c.id, location_id: locationId };
  // Map known fields
  for (const [jsKey, col] of Object.entries(CLIENT_FIELDS)) {
    if (f[jsKey] !== undefined) row[col] = f[jsKey];
  }
  // Top-level properties
  if (c.createdAt !== undefined) row.created_at_app = c.createdAt;
  if (c.lifecycle !== undefined) row.lifecycle = c.lifecycle;
  if (c.lifecycleEvents !== undefined) row.lifecycle_events = c.lifecycleEvents;
  if (c.agreements !== undefined) row.agreements = c.agreements;
  if (c.questionnaireResponses !== undefined) row.questionnaire_responses = c.questionnaireResponses;
  if (c.notificationPrefs !== undefined) row.notification_prefs = c.notificationPrefs;
  // Preserve igniteData (Ignite lead import data) in custom_fields
  if (c.igniteData !== undefined) {
    row.custom_fields = { ...(row.custom_fields || {}), igniteData: c.igniteData };
  }
  // Custom fields: anything in fields.* not in the known set
  const custom = {};
  for (const [k, v] of Object.entries(f)) {
    if (!CLIENT_FIELDS[k]) custom[k] = v;
  }
  if (Object.keys(custom).length > 0) row.custom_fields = custom;
  return row;
}

function rowToClient(r) {
  const fields = {};
  for (const [jsKey, col] of Object.entries(CLIENT_FIELDS)) {
    if (r[col] != null) fields[jsKey] = r[col];
  }
  // Merge custom fields back into fields
  if (r.custom_fields) {
    for (const [k, v] of Object.entries(r.custom_fields)) fields[k] = v;
  }
  const c = { id: r.id, fields };
  if (r.created_at_app) c.createdAt = r.created_at_app;
  if (r.lifecycle) c.lifecycle = r.lifecycle;
  if (r.lifecycle_events) c.lifecycleEvents = r.lifecycle_events;
  if (r.agreements) c.agreements = r.agreements;
  if (r.questionnaire_responses) c.questionnaireResponses = r.questionnaire_responses;
  if (r.notification_prefs) c.notificationPrefs = r.notification_prefs;
  // Restore igniteData as top-level property (used by lifecycle page)
  if (fields.igniteData) {
    c.igniteData = fields.igniteData;
    delete fields.igniteData;
  }
  return c;
}

function dogToRow(d, locationId) {
  const f = d.fields || {};
  const row = { id: d.id, location_id: locationId, client_id: d.clientId || null };
  for (const [jsKey, col] of Object.entries(DOG_FIELDS)) {
    const val = f[jsKey];
    if (val !== undefined) {
      // JSONB columns need to stay as objects/arrays
      if (col === 'feeding_schedules' || col === 'medication_schedules' || col === 'weight_log') {
        row[col] = val;
      } else {
        row[col] = val;
      }
    }
  }
  if (d.tags !== undefined) row.tags = d.tags;
  if (d.vaccines !== undefined) row.vaccines = d.vaccines;
  if (d.daycareGroupOverride !== undefined) row.daycare_group_override = d.daycareGroupOverride;
  if (d.questionnaireResponses !== undefined) row.questionnaire_responses = d.questionnaireResponses;
  // Custom fields
  const custom = {};
  for (const [k, v] of Object.entries(f)) {
    if (!DOG_FIELDS[k]) custom[k] = v;
  }
  if (Object.keys(custom).length > 0) row.custom_fields = custom;
  return row;
}

function rowToDog(r) {
  const fields = {};
  for (const [jsKey, col] of Object.entries(DOG_FIELDS)) {
    if (r[col] != null) fields[jsKey] = r[col];
  }
  if (r.custom_fields) {
    for (const [k, v] of Object.entries(r.custom_fields)) fields[k] = v;
  }
  const d = { id: r.id, clientId: r.client_id, fields };
  if (r.tags) d.tags = r.tags;
  if (r.vaccines) d.vaccines = r.vaccines;
  if (r.daycare_group_override) d.daycareGroupOverride = r.daycare_group_override;
  if (r.questionnaire_responses) d.questionnaireResponses = r.questionnaire_responses;
  return d;
}

function reservationToRow(res, locationId) {
  return {
    id: res.id, location_id: locationId,
    client_id: res.clientId || null, dog_id: res.dogId || null,
    type: res.type || null, room_type: res.roomType || null, room: res.room || null,
    check_in: res.checkIn || null, check_out: res.checkOut || null,
    check_in_time: res.checkInTime || null, check_out_time: res.checkOutTime || null,
    daycare_size: res.daycareSize || null, status: res.status || null,
    eval_result: res.evalResult || null, notes: res.notes || null,
    parent_destination: res.parentDestination || null, belongings: res.belongings || null,
    discount_type: res.discountType || null,
    discount_value: res.discountValue != null ? res.discountValue : null,
    total_price: res.totalPrice != null ? res.totalPrice : null,
    amount_collected: res.amountCollected != null ? res.amountCollected : null,
    fed_today: res.fedToday || null, meds_today: res.medsToday || null,
    cancelled_at: res.cancelledAt || null, cancelled_by: res.cancelledBy || null,
    actual_check_out_time: res.actualCheckOutTime || null,
    checked_out_by: res.checkedOutBy || null,
    care_overrides: res.careOverrides || null,
    emergency_contact_override: res.emergencyContactOverride || null,
    selected_add_ons: res.selectedAddOns || null,
    activity_log: res.activityLog || null,
  };
}

function rowToReservation(r) {
  const res = { id: r.id, clientId: r.client_id, dogId: r.dog_id };
  if (r.type) res.type = r.type;
  if (r.room_type) res.roomType = r.room_type;
  if (r.room) res.room = r.room;
  if (r.check_in) res.checkIn = r.check_in;
  if (r.check_out) res.checkOut = r.check_out;
  if (r.check_in_time) res.checkInTime = r.check_in_time;
  if (r.check_out_time) res.checkOutTime = r.check_out_time;
  if (r.daycare_size) res.daycareSize = r.daycare_size;
  if (r.status) res.status = r.status;
  if (r.eval_result) res.evalResult = r.eval_result;
  if (r.notes) res.notes = r.notes;
  if (r.parent_destination) res.parentDestination = r.parent_destination;
  if (r.belongings) res.belongings = r.belongings;
  if (r.discount_type) res.discountType = r.discount_type;
  if (r.discount_value != null) res.discountValue = Number(r.discount_value);
  if (r.total_price != null) res.totalPrice = Number(r.total_price);
  if (r.amount_collected != null) res.amountCollected = Number(r.amount_collected);
  if (r.fed_today) res.fedToday = r.fed_today;
  if (r.meds_today) res.medsToday = r.meds_today;
  if (r.cancelled_at) res.cancelledAt = r.cancelled_at;
  if (r.cancelled_by) res.cancelledBy = r.cancelled_by;
  if (r.actual_check_out_time) res.actualCheckOutTime = r.actual_check_out_time;
  if (r.checked_out_by) res.checkedOutBy = r.checked_out_by;
  if (r.care_overrides) res.careOverrides = r.care_overrides;
  if (r.emergency_contact_override) res.emergencyContactOverride = r.emergency_contact_override;
  if (r.selected_add_ons) res.selectedAddOns = r.selected_add_ons;
  if (r.activity_log) res.activityLog = r.activity_log;
  return res;
}

function evaluationToRow(e, locationId) {
  return {
    id: e.id, location_id: locationId,
    dog_id: e.dogId || null, client_id: e.clientId || null,
    reservation_id: e.reservationId || null,
    date: e.date || null, evaluator_name: e.evaluatorName || null,
    eval_type: e.evalType || null, has_experience: e.hasExperience ?? null,
    total_score: e.totalScore != null ? e.totalScore : null,
    max_score: e.maxScore != null ? e.maxScore : null,
    result: e.result || null, notes: e.notes || null,
    locked: e.locked ?? false,
    answers: e.answers || null, subtotals: e.subtotals || null,
  };
}

function rowToEvaluation(r) {
  const e = { id: r.id };
  if (r.dog_id) e.dogId = r.dog_id;
  if (r.client_id) e.clientId = r.client_id;
  if (r.reservation_id) e.reservationId = r.reservation_id;
  if (r.date) e.date = r.date;
  if (r.evaluator_name) e.evaluatorName = r.evaluator_name;
  if (r.eval_type) e.evalType = r.eval_type;
  if (r.has_experience != null) e.hasExperience = r.has_experience;
  if (r.total_score != null) e.totalScore = Number(r.total_score);
  if (r.max_score != null) e.maxScore = Number(r.max_score);
  if (r.result) e.result = r.result;
  if (r.notes) e.notes = r.notes;
  if (r.locked != null) e.locked = r.locked;
  if (r.answers) e.answers = r.answers;
  if (r.subtotals) e.subtotals = r.subtotals;
  if (r.created_at) e.createdAt = r.created_at;
  return e;
}

function paymentToRow(p, locationId) {
  return {
    id: p.id, location_id: locationId,
    client_id: p.clientId || null, reservation_id: p.reservationId || null,
    amount: p.amount != null ? p.amount : null, type: p.type || null,
    method: p.method || null, card_last4: p.cardLast4 || null,
    status: p.status || null, note: p.note || null,
    timestamp: p.timestamp || null,
    stripe_payment_intent_id: p.stripePaymentIntentId || null,
    stripe_refund_id: p.stripeRefundId || null,
    processed_by: p.processedBy || null,
  };
}

function rowToPayment(r) {
  const p = { id: r.id };
  if (r.client_id) p.clientId = r.client_id;
  if (r.reservation_id) p.reservationId = r.reservation_id;
  if (r.amount != null) p.amount = Number(r.amount);
  if (r.type) p.type = r.type;
  if (r.method) p.method = r.method;
  if (r.card_last4) p.cardLast4 = r.card_last4;
  if (r.status) p.status = r.status;
  if (r.note) p.note = r.note;
  if (r.timestamp) p.timestamp = r.timestamp;
  if (r.stripe_payment_intent_id) p.stripePaymentIntentId = r.stripe_payment_intent_id;
  if (r.stripe_refund_id) p.stripeRefundId = r.stripe_refund_id;
  if (r.processed_by) p.processedBy = r.processed_by;
  return p;
}

function packageToRow(pkg, locationId) {
  return {
    id: pkg.id, location_id: locationId,
    name: pkg.name || null, description: pkg.description || null,
    service_category: pkg.serviceCategory || null, service_name: pkg.serviceName || null,
    quantity: pkg.quantity != null ? pkg.quantity : null,
    pricing_mode: pkg.pricingMode || null,
    discount_pct: pkg.discountPct != null ? pkg.discountPct : null,
    discount_dollar: pkg.discountDollar != null ? pkg.discountDollar : null,
    package_price: pkg.packagePrice != null ? pkg.packagePrice : null,
    retail_value: pkg.retailValue != null ? pkg.retailValue : null,
    unit_price: pkg.unitPrice != null ? pkg.unitPrice : null,
    savings: pkg.savings != null ? pkg.savings : null,
    savings_per_unit: pkg.savingsPerUnit != null ? pkg.savingsPerUnit : null,
    expiration_type: pkg.expirationType || null,
    expiration_days: pkg.expirationDays != null ? pkg.expirationDays : null,
    expiration_date: pkg.expirationDate || null,
    available_online: pkg.availableOnline ?? false,
    fields: pkg,
  };
}

function rowToPackage(r) {
  // Start from fields JSONB if present (enterprise push stores full object there)
  const p = { ...(r.fields && typeof r.fields === 'object' ? r.fields : {}), id: r.id };
  if (r.name) p.name = r.name;
  if (r.description) p.description = r.description;
  if (r.service_category) p.serviceCategory = r.service_category;
  if (r.service_name) p.serviceName = r.service_name;
  if (r.quantity != null) p.quantity = Number(r.quantity);
  if (r.pricing_mode) p.pricingMode = r.pricing_mode;
  if (r.discount_pct != null) p.discountPct = Number(r.discount_pct);
  if (r.discount_dollar != null) p.discountDollar = Number(r.discount_dollar);
  if (r.package_price != null) p.packagePrice = Number(r.package_price);
  if (r.retail_value != null) p.retailValue = Number(r.retail_value);
  if (r.unit_price != null) p.unitPrice = Number(r.unit_price);
  if (r.savings != null) p.savings = Number(r.savings);
  if (r.savings_per_unit != null) p.savingsPerUnit = Number(r.savings_per_unit);
  if (r.expiration_type) p.expirationType = r.expiration_type;
  if (r.expiration_days != null) p.expirationDays = Number(r.expiration_days);
  if (r.expiration_date) p.expirationDate = r.expiration_date;
  if (r.available_online != null) p.availableOnline = r.available_online;
  return p;
}

function packageSaleToRow(ps, locationId) {
  return {
    id: ps.id, location_id: locationId,
    client_id: ps.clientId || null, package_id: ps.packageId || null,
    quantity: ps.quantity != null ? ps.quantity : null,
    used: ps.used != null ? ps.used : 0,
    purchase_date: ps.purchaseDate || null,
    package_name: ps.packageName || null,
  };
}

function rowToPackageSale(r) {
  const ps = { id: r.id };
  if (r.client_id) ps.clientId = r.client_id;
  if (r.package_id) ps.packageId = r.package_id;
  if (r.quantity != null) ps.quantity = Number(r.quantity);
  if (r.used != null) ps.used = Number(r.used);
  if (r.purchase_date) ps.purchaseDate = r.purchase_date;
  if (r.package_name) ps.packageName = r.package_name;
  return ps;
}

function messageToRow(m, locationId) {
  return {
    id: m.id, location_id: locationId,
    client_id: m.clientId || null,
    direction: m.direction || null, channel: m.channel || null,
    body: m.body || null, timestamp: m.timestamp || null,
    status: m.status || null, read_at: m.readAt || null,
    twilio_sid: m.twilioSid || null, template_id: m.templateId || null,
  };
}

function rowToMessage(r) {
  const m = { id: r.id };
  if (r.client_id) m.clientId = r.client_id;
  if (r.direction) m.direction = r.direction;
  if (r.channel) m.channel = r.channel;
  if (r.body) m.body = r.body;
  if (r.timestamp) m.timestamp = r.timestamp;
  if (r.status) m.status = r.status;
  if (r.read_at) m.readAt = r.read_at;
  if (r.twilio_sid) m.twilioSid = r.twilio_sid;
  if (r.template_id) m.templateId = r.template_id;
  return m;
}

function auditToRow(a, locationId) {
  return {
    id: a.id, location_id: locationId,
    reservation_id: a.reservationId || null,
    timestamp: a.timestamp || null,
    user_name: a.userName || null,
    action: a.action || null,
    details: a.details || null,
  };
}

function rowToAudit(r) {
  const a = { id: r.id };
  if (r.reservation_id) a.reservationId = r.reservation_id;
  if (r.timestamp) a.timestamp = r.timestamp;
  if (r.user_name) a.userName = r.user_name;
  if (r.action) a.action = r.action;
  if (r.details) a.details = r.details;
  return a;
}

function dailyOpsToRow(d, locationId) {
  return {
    id: d.id, location_id: locationId,
    type: d.type || null, date: d.date || null,
    locked: d.locked ?? false, completed_by: d.completedBy || null,
    items: d.items || null, sections: d.sections || null,
    mentions: d.mentions || null, history: d.history || null,
  };
}

function rowToDailyOps(r) {
  const d = { id: r.id };
  if (r.type) d.type = r.type;
  if (r.date) d.date = r.date;
  if (r.locked != null) d.locked = r.locked;
  if (r.completed_by) d.completedBy = r.completed_by;
  if (r.items) d.items = r.items;
  if (r.sections) d.sections = r.sections;
  if (r.mentions) d.mentions = r.mentions;
  if (r.history) d.history = r.history;
  return d;
}

function reminderToRow(rem, locationId) {
  return {
    id: rem.id, location_id: locationId,
    client_id: rem.clientId || null, dog_id: rem.dogId || null,
    vaccine_type: rem.vaccineType || null, status: rem.status || null,
    sent_at: rem.sentAt || null, message: rem.message || null,
    phone_number: rem.phoneNumber || null,
  };
}

function rowToReminder(r) {
  const rem = { id: r.id };
  if (r.client_id) rem.clientId = r.client_id;
  if (r.dog_id) rem.dogId = r.dog_id;
  if (r.vaccine_type) rem.vaccineType = r.vaccine_type;
  if (r.status) rem.status = r.status;
  if (r.sent_at) rem.sentAt = r.sent_at;
  if (r.message) rem.message = r.message;
  if (r.phone_number) rem.phoneNumber = r.phone_number;
  return rem;
}


// ── Entity table config ──
const ENTITIES = {
  clients:      { table: 'k9_clients',       toRow: clientToRow,      fromRow: rowToClient,      select: '*' },
  dogs:         { table: 'k9_dogs',          toRow: dogToRow,         fromRow: rowToDog,          select: '*' },
  reservations: { table: 'k9_reservations',  toRow: reservationToRow, fromRow: rowToReservation,  select: '*' },
  evaluations:  { table: 'k9_evaluations',   toRow: evaluationToRow,  fromRow: rowToEvaluation,   select: '*' },
  payments:     { table: 'k9_payments',      toRow: paymentToRow,     fromRow: rowToPayment,      select: '*' },
  packages:     { table: 'k9_packages',      toRow: packageToRow,     fromRow: rowToPackage,      select: '*' },
  packageSales: { table: 'k9_package_sales', toRow: packageSaleToRow, fromRow: rowToPackageSale,  select: '*' },
  messages:     { table: 'k9_messages',      toRow: messageToRow,     fromRow: rowToMessage,      select: '*' },
  auditLog:     { table: 'k9_audit_log',     toRow: auditToRow,       fromRow: rowToAudit,        select: '*' },
};

const DAILY_OPS_TABLE = 'k9_daily_ops';
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
      if (savingRef.current) return;
      setLoadError(false);
      try {
        const [
          locRes, clientsRes, dogsRes, resRes, evalRes, opsRes,
          payRes, pkgRes, pkgSaleRes, msgRes, auditRes, remRes,
        ] = await Promise.all([
          supabase.from('locations').select('data').eq('id', locationId).single(),
          supabase.from('k9_clients').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_dogs').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_reservations').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_evaluations').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from(DAILY_OPS_TABLE).select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_payments').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_packages').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_package_sales').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_messages').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_audit_log').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from(REMINDER_TABLE).select('*').eq('location_id', locationId).order('created_at'),
        ]);

        if (savingRef.current) return;

        if (locRes.error) {
          console.error('Failed to load location:', locRes.error);
          setLoadError(true); setLoading(false); return;
        }

        const settings = locRes.data?.data || {};

        // Convert DB rows → app JS objects
        const allOps = (opsRes.data || []).map(rowToDailyOps);

        const assembled = {
          ...settings,
          clients: (clientsRes.data || []).map(rowToClient),
          dogs: (dogsRes.data || []).map(rowToDog),
          reservations: (resRes.data || []).map(rowToReservation),
          evaluations: (evalRes.data || []).map(rowToEvaluation),
          eodEntries: allOps.filter(d => d.type === 'eod'),
          dailyOps: allOps.filter(d => d.type !== 'eod'),
          payments: (payRes.data || []).map(rowToPayment),
          packages: (pkgRes.data || []).map(rowToPackage),
          packageSales: (pkgSaleRes.data || []).map(rowToPackageSale),
          messages: (msgRes.data || []).map(rowToMessage),
          auditLog: (auditRes.data || []).map(rowToAudit),
        };

        const reminderDocs = (remRes.data || []).map(rowToReminder);
        if (assembled.automations) {
          assembled.automations = { ...assembled.automations, reminderLog: reminderDocs };
        } else if (reminderDocs.length > 0) {
          assembled.automations = { reminderLog: reminderDocs };
        }

        if (Object.keys(assembled).length > 0) {
          prevDataRef.current = assembled;
          setData(assembled); setIsEmpty(false);
        } else {
          setData(null); setIsEmpty(true);
        }
        setLoading(false);
      } catch (err) {
        console.error('Unexpected load error:', err);
        setLoadError(true); setLoading(false);
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

    // Polling fallback: reload every 30s to catch changes if real-time misses them
    const poll = setInterval(() => load(), 30000);

    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [locationId]);

  // ── SAVE ──
  const save = useCallback(async (newData) => {
    setData(newData);
    setIsEmpty(false);
    if (!locationId) return;

    // Block load() immediately so real-time reloads don't overwrite local state
    // before the debounced DB write commits
    savingRef.current = true;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const prev = prevDataRef.current || {};
        prevDataRef.current = newData;

        // Helper: diff + build upsert/delete ops for one entity key
        const buildOps = (key, table, toRow) => {
          const ops = [];
          const oldArr = prev[key];
          const newArr = newData[key];
          if (oldArr === newArr) return ops;
          const diff = diffArrays(oldArr, newArr);
          if (!diff.hasChanges) return ops;
          if (diff.adds.length > 0 || diff.updates.length > 0) {
            const rows = [...diff.adds, ...diff.updates].map(item => toRow(item, locationId));
            ops.push(supabase.from(table).upsert(rows, { onConflict: 'id' })
              .then(({ error }) => { if (error) console.error(`Upsert ${key}:`, error); }));
          }
          if (diff.deletes.length > 0) {
            ops.push(supabase.from(table).delete().in('id', diff.deletes.map(i => i.id))
              .then(({ error }) => { if (error) console.error(`Delete ${key}:`, error); }));
          }
          return ops;
        };

        // ── Write in FK-safe tiers (parents before children) ──

        // Tier 1: no entity FKs — clients, packages
        const t1 = [
          ...buildOps('clients', 'k9_clients', clientToRow),
          ...buildOps('packages', 'k9_packages', packageToRow),
        ];
        if (t1.length) await Promise.all(t1);

        // Tier 2: depends on clients — dogs
        const t2 = buildOps('dogs', 'k9_dogs', dogToRow);
        if (t2.length) await Promise.all(t2);

        // Tier 3: depends on clients + dogs + packages — reservations, packageSales, messages
        const t3 = [
          ...buildOps('reservations', 'k9_reservations', reservationToRow),
          ...buildOps('packageSales', 'k9_package_sales', packageSaleToRow),
          ...buildOps('messages', 'k9_messages', messageToRow),
        ];
        if (t3.length) await Promise.all(t3);

        // Tier 4: depends on dogs + reservations — evaluations, payments, auditLog, dailyOps
        const t4 = [
          ...buildOps('evaluations', 'k9_evaluations', evaluationToRow),
          ...buildOps('payments', 'k9_payments', paymentToRow),
          ...buildOps('auditLog', 'k9_audit_log', auditToRow),
          ...buildOps('eodEntries', DAILY_OPS_TABLE, dailyOpsToRow),
          ...buildOps('dailyOps', DAILY_OPS_TABLE, dailyOpsToRow),
        ];

        // Reminder log
        const oldRemLog = prev.automations?.reminderLog;
        const newRemLog = newData.automations?.reminderLog;
        if (oldRemLog !== newRemLog) {
          const diff = diffArrays(oldRemLog, newRemLog);
          if (diff.hasChanges) {
            if (diff.adds.length > 0 || diff.updates.length > 0) {
              const rows = [...diff.adds, ...diff.updates].map(item => reminderToRow(item, locationId));
              t4.push(supabase.from(REMINDER_TABLE).upsert(rows, { onConflict: 'id' })
                .then(({ error }) => { if (error) console.error('Upsert reminders:', error); }));
            }
            if (diff.deletes.length > 0) {
              t4.push(supabase.from(REMINDER_TABLE).delete().in('id', diff.deletes.map(i => i.id))
                .then(({ error }) => { if (error) console.error('Delete reminders:', error); }));
            }
          }
        }

        // Settings → locations.data
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
        t4.push(supabase.from('locations').update({ data: settingsOnly }).eq('id', locationId)
          .then(({ error }) => { if (error) console.error('Save settings:', error); }));

        if (t4.length) await Promise.all(t4);

      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        savingRef.current = false;
      }
    }, 300);
  }, [locationId]);

  return { data, loading, save, locationId, loadError, isEmpty };
}
