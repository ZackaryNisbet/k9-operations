// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ============================================================
// Normalized data hook — V2 schema (60 tables, UUID PKs)
// Entities → individual tables with real columns
// Child data (vaccines, weight, feeding, meds, lifecycle, agreements, questionnaires) → separate tables
// Settings → location_* tables (fully migrated, no JSONB fallback)
// ============================================================

// ── Column mappings: JS object field → DB column name ──

const CLIENT_FIELDS = {
  phone: 'phone', first_name: 'first_name', last_name: 'last_name',
  email: 'email',
  street: 'street',
  city: 'city',
  state: 'state',
  zip: 'zip',
  notes: 'notes', referral_source: 'referral_source',
};

const DOG_FIELDS = {
  name: 'name', breed: 'breed', color: 'color',
  sex: 'sex', spayed_neutered: 'spayed_neutered',
  dob: 'date_of_birth',
  weight: 'latest_weight',
  weightLastUpdated: 'latest_weight_date',
  bathType: 'preferred_bath_type',
  temperament: 'temperament_notes',
  profilePic: 'profile_pic_url',
};

// ── Convert app JS object ↔ flat DB row ──

function clientToRow(c, locationId) {
  const f = c.fields || {};
  const row = { id: c.id, location_id: locationId };
  for (const [jsKey, col] of Object.entries(CLIENT_FIELDS)) {
    if (f[jsKey] !== undefined) row[col] = f[jsKey];
  }
  // Extract lifecycle_stage from complex lifecycle object or simple string
  if (c.lifecycle !== undefined) {
    row.lifecycle_stage = typeof c.lifecycle === 'string'
      ? c.lifecycle
      : (c.lifecycle?.stage || c.lifecycle?.status || 'prospect');
    // Store full lifecycle tracking object in lifecycle_data JSONB
    if (typeof c.lifecycle === 'object') row.lifecycle_data = c.lifecycle;
  }
  if (c.preferredVetId) row.preferred_vet_id = c.preferredVetId;
  if (c.notificationPrefs) row.notification_prefs = c.notificationPrefs;
  // Direct columns for formerly-overflowed data
  if (c.savedCards !== undefined) row.saved_cards = c.savedCards;
  if (c.clientNotes !== undefined) row.client_notes = c.clientNotes;
  if (c.recurringDiscountId !== undefined) row.recurring_discount_id = c.recurringDiscountId;

  return row;
}

function rowToClient(r) {
  const fields = {};
  for (const [jsKey, col] of Object.entries(CLIENT_FIELDS)) {
    if (r[col] != null) fields[jsKey] = r[col];
  }
  const c = { id: r.id, fields };
  if (r.created_at) c.createdAt = r.created_at;
  if (r.preferred_vet_id) c.preferredVetId = r.preferred_vet_id;
  if (r.first_service_date) c.firstServiceDate = r.first_service_date;
  if (r.last_service_date) c.lastServiceDate = r.last_service_date;
  if (r.notification_prefs) c.notificationPrefs = r.notification_prefs;
  // Direct columns (no longer overflow)
  if (r.saved_cards) c.savedCards = r.saved_cards;
  if (r.client_notes) c.clientNotes = r.client_notes;
  if (r.recurring_discount_id) c.recurringDiscountId = r.recurring_discount_id;
  // Lifecycle: prefer lifecycle_data JSONB, fall back to lifecycle_stage string
  if (r.lifecycle_data && Object.keys(r.lifecycle_data).length > 0) {
    c.lifecycle = r.lifecycle_data;
  } else if (r.lifecycle_stage) {
    c.lifecycle = r.lifecycle_stage;
  }

  return c;
}

function dogToRow(d, locationId) {
  const f = d.fields || {};
  const row = { id: d.id, location_id: locationId, client_id: d.clientId || null };
  for (const [jsKey, col] of Object.entries(DOG_FIELDS)) {
    if (f[jsKey] !== undefined) row[col] = f[jsKey];
  }
  if (d.daycareGroupOverride !== undefined) row.daycare_group_override = d.daycareGroupOverride;
  if (d.vetId) row.vet_id = d.vetId;
  return row;
}

function rowToDog(r) {
  const fields = {};
  for (const [jsKey, col] of Object.entries(DOG_FIELDS)) {
    if (r[col] != null) fields[jsKey] = r[col];
  }
  const d = { id: r.id, clientId: r.client_id, fields };
  if (r.daycare_group_override) d.daycareGroupOverride = r.daycare_group_override;
  if (r.current_tag) d.currentTag = r.current_tag;
  if (r.is_active != null) d.isActive = r.is_active;
  if (r.vet_id) d.vetId = r.vet_id;
  return d;
}

function reservationToRow(res, locationId) {
  return {
    id: res.id, location_id: locationId,
    client_id: res.clientId || null,
    dog_id: res.dogId || null,
    type: res.type || res.serviceType || null,
    room_type: res.roomType || res.roomUnitId || null,
    room: res.room || null,
    status: res.status || null,
    check_in: res.checkIn || res.checkInDate || null,
    check_out: res.checkOut || res.checkOutDate || null,
    check_in_time: res.checkInTime || res.checkInAt || null,
    check_out_time: res.checkOutTime || res.checkOutAt || null,
    daycare_size: res.daycareSize || null,
    notes: res.notes || null,
    total_price: res.totalPrice != null ? res.totalPrice : (res.totalEstimated != null ? res.totalEstimated : null),
    amount_collected: res.amountCollected != null ? res.amountCollected : null,
    discount_type: res.discountType || null,
    discount_value: res.discountValue != null ? res.discountValue : null,
    selected_add_ons: res.selectedAddOns || res.addOns || null,
    care_overrides: res.careOverrides || null,
    emergency_contact_override: res.emergencyContactOverride || null,
    activity_log: res.activityLog || null,
    custom_fields: res.customFields || null,
    parent_destination: res.parentDestination || null,
    belongings: res.belongings || null,
    eval_result: res.evalResult || null,
    no_deposit: res.noDeposit || false,
  };
}

function rowToReservation(r) {
  const res = { id: r.id, clientId: r.client_id, dogId: r.dog_id };
  if (r.type) res.type = r.type;
  if (r.room_type) res.roomType = r.room_type;
  if (r.room) res.room = r.room;
  if (r.status) res.status = r.status;
  if (r.check_in) res.checkIn = r.check_in;
  if (r.check_out) res.checkOut = r.check_out;
  if (r.check_in_time) res.checkInTime = r.check_in_time;
  if (r.check_out_time) res.checkOutTime = r.check_out_time;
  if (r.daycare_size) res.daycareSize = r.daycare_size;
  if (r.total_price != null) res.totalPrice = Number(r.total_price);
  if (r.amount_collected != null) res.amountCollected = Number(r.amount_collected);
  if (r.discount_type) res.discountType = r.discount_type;
  if (r.discount_value != null) res.discountValue = Number(r.discount_value);
  if (r.selected_add_ons) res.selectedAddOns = r.selected_add_ons;
  if (r.care_overrides) res.careOverrides = r.care_overrides;
  if (r.emergency_contact_override) res.emergencyContactOverride = r.emergency_contact_override;
  if (r.activity_log) res.activityLog = r.activity_log;
  if (r.custom_fields) res.customFields = r.custom_fields;
  if (r.parent_destination) res.parentDestination = r.parent_destination;
  if (r.belongings) res.belongings = r.belongings;
  if (r.eval_result) res.evalResult = r.eval_result;
  if (r.notes) res.notes = r.notes;
  if (r.fed_today) res.fedToday = r.fed_today;
  if (r.meds_today) res.medsToday = r.meds_today;
  if (r.cancelled_at) res.cancelledAt = r.cancelled_at;
  if (r.cancelled_by) res.cancelledBy = r.cancelled_by;
  if (r.actual_check_out_time) res.actualCheckOutTime = r.actual_check_out_time;
  if (r.checked_out_by) res.checkedOutBy = r.checked_out_by;
  if (r.created_at) res.createdAt = r.created_at;
  if (r.no_deposit) res.noDeposit = r.no_deposit;
  return res;
}

function evaluationToRow(e, locationId) {
  return {
    id: e.id, location_id: locationId,
    dog_id: e.dogId || null, client_id: e.clientId || null,
    reservation_id: e.reservationId || null,
    date: e.date || null,
    evaluator_id: e.evaluatorId || null,
    evaluator_name: e.evaluatorName || null,
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
  if (r.evaluator_id) e.evaluatorId = r.evaluator_id;
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
    invoice_id: p.invoiceId || null,
    reservation_id: p.reservationId || null,
    client_id: p.clientId || null,
    amount: p.amount != null ? p.amount : null,
    payment_method: p.method || p.paymentMethod || null,
    external_transaction_id: p.stripePaymentIntentId || p.externalTransactionId || null,
    status: p.status || null,
    processed_at: p.timestamp || p.processedAt || null,
  };
}

function rowToPayment(r) {
  const p = { id: r.id };
  if (r.reservation_id) p.reservationId = r.reservation_id;
  if (r.client_id) p.clientId = r.client_id;
  if (r.invoice_id) p.invoiceId = r.invoice_id;
  if (r.amount != null) p.amount = Number(r.amount);
  if (r.payment_method) { p.method = r.payment_method; p.paymentMethod = r.payment_method; }
  if (r.status) p.status = r.status;
  if (r.processed_at) { p.timestamp = r.processed_at; p.processedAt = r.processed_at; }
  if (r.external_transaction_id) p.stripePaymentIntentId = r.external_transaction_id;
  if (r.created_at) p.createdAt = r.created_at;
  return p;
}

function packageToRow(pkg, _locationId) {
  return {
    id: pkg.id,
    name: pkg.name || null,
    description: pkg.description || null,
    package_type: pkg.packageType || 'standard',
    service_category: pkg.serviceCategory || null,
    service_names: pkg.serviceNames || (pkg.serviceName ? [pkg.serviceName] : null),
    service_name: pkg.serviceName || null,
    discount_type: pkg.discountType || pkg.pricingMode || null,
    discount_value: pkg.discountValue != null ? pkg.discountValue : (pkg.discountPct || pkg.discountDollar || null),
    quantity: pkg.quantity != null ? pkg.quantity : null,
    expiration_type: pkg.expirationType || null,
    expiration_days: pkg.expirationDays != null ? pkg.expirationDays : null,
    unit_rate: pkg.unitRate != null ? pkg.unitRate : null,
    retail_value: pkg.retailValue != null ? pkg.retailValue : null,
    package_price: pkg.packagePrice != null ? pkg.packagePrice : null,
    savings: pkg.savings != null ? pkg.savings : null,
    savings_per_unit: pkg.savingsPerUnit != null ? pkg.savingsPerUnit : null,
    is_active: pkg.isActive ?? true,
    available_online: pkg.availableOnline ?? false,
    location_id: pkg.locationId || null,
    pushed_to: pkg.pushedTo || null,
    enterprise_source_id: pkg.enterpriseSourceId || null,
    buy_qty: pkg.buyQty != null ? pkg.buyQty : null,
    free_qty: pkg.freeQty != null ? pkg.freeQty : null,
  };
}

function rowToPackage(r) {
  const p = { id: r.id };
  if (r.name) p.name = r.name;
  if (r.description) p.description = r.description;
  if (r.package_type) p.packageType = r.package_type;
  if (r.service_category) p.serviceCategory = r.service_category;
  if (r.service_names) {
    p.serviceNames = r.service_names;
    p.serviceName = Array.isArray(r.service_names) ? r.service_names[0] : r.service_names;
  }
  if (r.discount_type) { p.discountType = r.discount_type; p.pricingMode = r.discount_type; }
  if (r.discount_value != null) p.discountValue = Number(r.discount_value);
  if (r.quantity != null) p.quantity = Number(r.quantity);
  if (r.expiration_type) p.expirationType = r.expiration_type;
  if (r.expiration_days != null) p.expirationDays = Number(r.expiration_days);
  if (r.unit_rate != null) p.unitRate = Number(r.unit_rate);
  if (r.retail_value != null) p.retailValue = Number(r.retail_value);
  if (r.package_price != null) p.packagePrice = Number(r.package_price);
  if (r.savings != null) p.savings = Number(r.savings);
  if (r.is_active != null) p.isActive = r.is_active;
  if (r.available_online != null) p.availableOnline = r.available_online;
  if (r.created_at) p.createdAt = r.created_at.slice(0, 10);
  if (r.location_id) p.locationId = r.location_id;
  if (r.pushed_to) p.pushedTo = r.pushed_to;
  if (r.enterprise_source_id) p.enterpriseSourceId = r.enterprise_source_id;
  if (r.savings_per_unit != null) p.savingsPerUnit = Number(r.savings_per_unit);
  if (r.buy_qty != null) p.buyQty = Number(r.buy_qty);
  if (r.free_qty != null) p.freeQty = Number(r.free_qty);
  if (r.service_name) p.serviceName = r.service_name;
  return p;
}

function packageSaleToRow(ps, locationId) {
  return {
    id: ps.id, location_id: locationId,
    client_id: ps.clientId || null,
    package_id: ps.packageId || null,
    quantity_total: ps.quantity || ps.quantityTotal || null,
    quantity_used: ps.used || ps.quantityUsed || 0,
    purchase_date: ps.purchaseDate || null,
    expiration_date: ps.expirationDate || null,
    amount_paid: ps.amountPaid != null ? ps.amountPaid : null,
    status: ps.status || 'active',
  };
}

function rowToPackageSale(r) {
  const ps = { id: r.id };
  if (r.client_id) ps.clientId = r.client_id;
  if (r.package_id) ps.packageId = r.package_id;
  if (r.quantity_total != null) { ps.quantity = Number(r.quantity_total); ps.quantityTotal = Number(r.quantity_total); }
  if (r.quantity_used != null) { ps.used = Number(r.quantity_used); ps.quantityUsed = Number(r.quantity_used); }
  if (r.purchase_date) ps.purchaseDate = r.purchase_date;
  if (r.expiration_date) ps.expirationDate = r.expiration_date;
  if (r.amount_paid != null) ps.amountPaid = Number(r.amount_paid);
  if (r.status) ps.status = r.status;
  return ps;
}

function messageToRow(m, locationId) {
  return {
    id: m.id, location_id: locationId,
    client_id: m.clientId || null,
    direction: m.direction || null,
    channel: m.channel || null,
    message_type: m.messageType || null,
    body: m.body || null,
    to_phone: m.toPhone || null,
    from_phone: m.fromPhone || null,
    status: m.status || null,
    external_id: m.twilioSid || m.externalId || null,
    sent_at: m.timestamp || m.sentAt || null,
    sent_by: m.sentBy || null,
  };
}

function rowToMessage(r) {
  const m = { id: r.id };
  if (r.client_id) m.clientId = r.client_id;
  if (r.direction) m.direction = r.direction;
  if (r.channel) m.channel = r.channel;
  if (r.message_type) m.messageType = r.message_type;
  if (r.body) m.body = r.body;
  if (r.to_phone) m.toPhone = r.to_phone;
  if (r.from_phone) m.fromPhone = r.from_phone;
  if (r.status) m.status = r.status;
  if (r.external_id) { m.twilioSid = r.external_id; m.externalId = r.external_id; }
  if (r.sent_at) { m.timestamp = r.sent_at; m.sentAt = r.sent_at; }
  if (r.sent_by) m.sentBy = r.sent_by;
  if (r.created_at) m.createdAt = r.created_at;
  return m;
}

function auditToRow(a, locationId) {
  return {
    id: a.id, location_id: locationId,
    table_name: a.tableName || 'k9_reservations',
    record_id: a.reservationId || a.recordId || null,
    action: a.action || null,
    field_name: a.fieldName || null,
    old_value: a.oldValue || null,
    new_value: a.details
      ? (typeof a.details === 'string' ? a.details : JSON.stringify(a.details))
      : (a.newValue || null),
    changed_by: a.changedBy || null,
  };
}

function rowToAudit(r) {
  const a = { id: r.id };
  if (r.table_name) a.tableName = r.table_name;
  if (r.record_id) { a.recordId = r.record_id; a.reservationId = r.record_id; }
  if (r.action) a.action = r.action;
  if (r.field_name) a.fieldName = r.field_name;
  if (r.old_value) a.oldValue = r.old_value;
  if (r.new_value) { a.newValue = r.new_value; a.details = r.new_value; }
  if (r.changed_by) { a.changedBy = r.changed_by; a.userName = r.changed_by; }
  if (r.created_at) { a.timestamp = r.created_at; a.createdAt = r.created_at; }
  return a;
}

// ── Vets: vets table ↔ app format ──
function vetToRow(v, locationId) {
  return {
    id: v.id, location_id: locationId,
    vet_name: v.vetName || v.name || null,
    clinic_name: v.clinicName || null,
    phone: v.phone || null,
    email: v.email || null,
    notes: v.notes || null,
    is_active: v.isActive ?? true,
  };
}

function rowToVet(r) {
  return {
    id: r.id, vetName: r.vet_name, clinicName: r.clinic_name,
    phone: r.phone, email: r.email, notes: r.notes,
    isActive: r.is_active ?? true, createdAt: r.created_at,
  };
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


// ============================================================
// SETTINGS ADAPTERS — location_* table ↔ app data shape
// ============================================================
// Each adapter has:
//   load(rows) → app format  (transform raw query results)
//   save(locationId, prev, next) → write changes to table

// Generic helper: diff array-of-objects and write changes
async function saveArraySetting(table, locationId, prev, next, appToRow) {
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  const ops = [];
  if (diff.adds.length + diff.updates.length > 0) {
    const rows = [...diff.adds, ...diff.updates].map(item => appToRow(item, locationId));
    ops.push(supabase.from(table).upsert(rows, { onConflict: 'id' }));
  }
  if (diff.deletes.length > 0) {
    ops.push(supabase.from(table).delete().in('id', diff.deletes.map(i => i.id)));
  }
  for (const op of ops) {
    const { error } = await op;
    if (error) console.error(`Settings save ${table}:`, error);
  }
}

// --- Pricing: location_pricing → data.pricing ---
// Table rows: { category, sub_category, price }
// App format: { boardingRates: { "Luxury Suite": 100 }, daycareRates: { fullDay: 50, halfDay: 30 }, privatePlaySurcharge: 20, dayboardingRate: 40 }
function loadPricing(rows) {
  if (!rows || rows.length === 0) return undefined; // let app use default
  const pricing = { boardingRates: {}, daycareRates: {} };
  for (const r of rows) {
    if (r.effective_to) continue; // skip expired prices
    const p = Number(r.price);
    if (r.category === 'boarding') pricing.boardingRates[r.sub_category] = p;
    else if (r.category === 'daycare') {
      if (r.sub_category === 'full_day') pricing.daycareRates.fullDay = p;
      else if (r.sub_category === 'half_day') pricing.daycareRates.halfDay = p;
    }
    else if (r.category === 'misc_fee') {
      if (r.sub_category === 'private_play_surcharge') pricing.privatePlaySurcharge = p;
      else if (r.sub_category === 'day_boarding') pricing.dayboardingRate = p;
      else pricing[r.sub_category] = p;
    }
    else if (r.category === 'surcharge') {
      if (!pricing.surcharges) pricing.surcharges = {};
      pricing.surcharges[r.sub_category] = p;
    }
    else if (r.category === 'food_type') {
      if (!pricing.foodTypePricing) pricing.foodTypePricing = {};
      pricing.foodTypePricing[r.sub_category] = p;
    }
    else if (r.category === 'med_pricing') {
      if (!pricing.medPricing) pricing.medPricing = {};
      pricing.medPricing[r.sub_category] = p;
    }
  }
  return pricing;
}

async function savePricing(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  // Flatten the pricing object into rows
  const rows = [];
  const mkRow = (cat, sub, price) => ({
    id: undefined, location_id: locationId,
    category: cat, sub_category: sub, price,
    effective_from: new Date().toISOString().slice(0, 10),
  });
  if (next.boardingRates) {
    for (const [name, price] of Object.entries(next.boardingRates)) {
      if (price != null) rows.push(mkRow('boarding', name, price));
    }
  }
  if (next.daycareRates) {
    if (next.daycareRates.fullDay != null) rows.push(mkRow('daycare', 'full_day', next.daycareRates.fullDay));
    if (next.daycareRates.halfDay != null) rows.push(mkRow('daycare', 'half_day', next.daycareRates.halfDay));
  }
  if (next.privatePlaySurcharge != null) rows.push(mkRow('misc_fee', 'private_play_surcharge', next.privatePlaySurcharge));
  if (next.dayboardingRate != null) rows.push(mkRow('misc_fee', 'day_boarding', next.dayboardingRate));
  // Re-save misc_fee items loaded via the catch-all in loadPricing
  const MISC_FEE_KEYS = ['bath','food_from_home','late_pickup','medication_admin','nail_trim','teeth_brushing','evaluationFee','tourFee','halfDayThreshold'];
  for (const k of MISC_FEE_KEYS) { if (next[k] != null) rows.push(mkRow('misc_fee', k, next[k])); }
  if (next.surcharges) {
    for (const [name, price] of Object.entries(next.surcharges)) {
      if (price != null) rows.push(mkRow('surcharge', name, price));
    }
  }
  if (next.foodTypePricing) {
    for (const [name, price] of Object.entries(next.foodTypePricing)) {
      if (price != null) rows.push(mkRow('food_type', name, price));
    }
  }
  if (next.medPricing) {
    for (const [name, price] of Object.entries(next.medPricing)) {
      if (price != null) rows.push(mkRow('med_pricing', name, price));
    }
  }
  // Delete all current active prices for this location, then insert fresh
  await supabase.from('location_pricing').delete().eq('location_id', locationId).is('effective_to', null);
  if (rows.length > 0) {
    const { error } = await supabase.from('location_pricing').insert(rows);
    if (error) console.error('Save pricing:', error);
  }
}

// --- Rooms: location_room_types + location_room_units → data.rooms ---
// App format: { "Luxury Suite": ["LS1", "LS2"], "Executive Room": ["ER1"] }
function loadRooms(typeRows, unitRows) {
  if (!typeRows || typeRows.length === 0) return undefined;
  const rooms = {};
  const typeMap = {};
  for (const t of typeRows) { typeMap[t.id] = t.name; rooms[t.name] = []; }
  for (const u of (unitRows || [])) {
    const typeName = typeMap[u.room_type_id];
    if (typeName && rooms[typeName]) rooms[typeName].push(u.unit_name);
  }
  return rooms;
}

async function saveRooms(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const nextTypes = Object.keys(next);
  console.log('[K9] saveRooms called, types:', nextTypes, 'locationId:', locationId);

  // Step 1: Delete all existing units for this location, then delete all types
  const { error: delUnitsErr } = await supabase.from('location_room_units').delete().eq('location_id', locationId);
  if (delUnitsErr) console.error('[K9] saveRooms delete units:', delUnitsErr);
  const { error: delTypesErr } = await supabase.from('location_room_types').delete().eq('location_id', locationId);
  if (delTypesErr) console.error('[K9] saveRooms delete types:', delTypesErr);

  // Step 2: Insert all room types
  if (nextTypes.length === 0) return;
  const typeRows = nextTypes.map((name, i) => ({ location_id: locationId, name, sort_order: i }));
  const { data: insertedTypes, error: insTypesErr } = await supabase.from('location_room_types')
    .insert(typeRows).select('id, name');
  if (insTypesErr) { console.error('[K9] saveRooms insert types:', insTypesErr); return; }
  console.log('[K9] saveRooms inserted types:', insertedTypes);

  // Step 3: Insert all room units
  const typeIdMap = new Map((insertedTypes || []).map(t => [t.name, t.id]));
  const unitRows = [];
  for (const typeName of nextTypes) {
    const typeId = typeIdMap.get(typeName);
    if (!typeId) continue;
    for (const unitName of (next[typeName] || [])) {
      unitRows.push({ room_type_id: typeId, location_id: locationId, unit_name: unitName });
    }
  }
  if (unitRows.length > 0) {
    const { error: insUnitsErr } = await supabase.from('location_room_units').insert(unitRows);
    if (insUnitsErr) console.error('[K9] saveRooms insert units:', insUnitsErr);
    else console.log('[K9] saveRooms inserted', unitRows.length, 'units');
  }
}

// --- Dog Tags: location_dog_tags → data.dogTags ---
function loadDogTags(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({ id: r.id, name: r.name, colorIdx: r.color_idx, tagCode: r.tag_code }));
}
async function saveDogTags(locationId, prev, next) {
  await saveArraySetting('location_dog_tags', locationId, prev, next,
    (t, lid) => ({ id: t.id, location_id: lid, tag_code: t.tagCode || t.id, name: t.name, color_idx: t.colorIdx || 0 }));
}

// --- Required Vaccines: location_required_vaccines → data.requiredVaccines ---
// App format: array of vaccine code strings like ["rabies_exp", "dhpp_exp"]
function loadRequiredVaccines(rows, vaccineTypes) {
  if (!rows || rows.length === 0) return undefined;
  const typeMap = new Map((vaccineTypes || []).map(vt => [vt.id, vt.code]));
  return rows.filter(r => r.is_required).map(r => {
    const code = typeMap.get(r.vaccine_type_id);
    return code ? code + '_exp' : r.vaccine_type_id;
  });
}
async function saveRequiredVaccines(locationId, prev, next, vaccineTypes) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const codeToId = new Map((vaccineTypes || []).map(vt => [vt.code + '_exp', vt.id]));
  // Delete all and re-insert
  await supabase.from('location_required_vaccines').delete().eq('location_id', locationId);
  const rows = next.map(code => ({
    location_id: locationId, vaccine_type_id: codeToId.get(code) || code, is_required: true,
  })).filter(r => r.vaccine_type_id);
  if (rows.length > 0) {
    const { error } = await supabase.from('location_required_vaccines').insert(rows);
    if (error) console.error('Save required vaccines:', error);
  }
}

// --- Closed Dates: location_closed_dates → data.closedDates ---
function loadClosedDates(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({ id: r.id, date: r.closed_date, label: r.reason }));
}
async function saveClosedDates(locationId, prev, next) {
  await saveArraySetting('location_closed_dates', locationId, prev, next,
    (cd, lid) => ({ id: cd.id, location_id: lid, closed_date: cd.date, reason: cd.label || null }));
}

// --- Policies: location_policies → data.resortPolicies ---
// Table: key-value rows { policy_key, policy_value }
// App: { maxDogAge: 15, cancellationNoticeDays: 48, vaccineGraceDays: 14, ... }
function loadPolicies(rows) {
  if (!rows || rows.length === 0) return undefined;
  const policies = {};
  for (const r of rows) {
    if (r.effective_to) continue;
    const val = r.policy_value;
    // Try to parse as number or boolean
    if (val === 'true') policies[r.policy_key] = true;
    else if (val === 'false') policies[r.policy_key] = false;
    else if (!isNaN(Number(val))) policies[r.policy_key] = Number(val);
    else policies[r.policy_key] = val;
  }
  return policies;
}
async function savePolicies(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  await supabase.from('location_policies').delete().eq('location_id', locationId).is('effective_to', null);
  const rows = Object.entries(next).map(([key, value]) => ({
    location_id: locationId, policy_key: key, policy_value: String(value),
    effective_from: new Date().toISOString().slice(0, 10),
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from('location_policies').insert(rows);
    if (error) console.error('Save policies:', error);
  }
}

// --- Message Templates: location_message_templates → data.messageTemplates ---
function loadMessageTemplates(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({ id: r.id, name: r.template_name, body: r.body, active: r.is_active }));
}
async function saveMessageTemplates(locationId, prev, next) {
  await saveArraySetting('location_message_templates', locationId, prev, next,
    (t, lid) => ({ id: t.id, location_id: lid, template_name: t.name, body: t.body, is_active: t.active ?? true }));
}

// --- EOD Template: location_eod_sections → data.eodTemplate ---
function loadEodTemplate(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => ({
    id: r.id, title: r.title, emoji: r.emoji, type: r.section_type, defaultContent: r.default_content,
  }));
}
async function saveEodTemplate(locationId, prev, next) {
  await saveArraySetting('location_eod_sections', locationId, prev, next,
    (s, lid) => ({
      id: s.id, location_id: lid, section_code: s.id, section_type: s.type || 'text',
      emoji: s.emoji, title: s.title, default_content: s.defaultContent, sort_order: next?.indexOf(s) || 0,
    }));
}

// --- Agreements: agreements table → data.agreements ---
function loadAgreements(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({
    id: r.id, name: r.title, body: r.content, required: r.is_current,
    version: r.version, updatedAt: r.created_at,
  }));
}
async function saveAgreements(locationId, prev, next) {
  await saveArraySetting('agreements', locationId, prev, next,
    (a, lid) => ({
      id: a.id, location_id: lid, title: a.name, content: a.body || '',
      version: a.version || 1, is_current: a.required ?? true,
    }));
}

// --- Add-ons: location_add_ons → data.addOnRules ---
function loadAddOns(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({ id: r.id, name: r.name, price: Number(r.price), active: r.is_active }));
}
async function saveAddOns(locationId, prev, next) {
  await saveArraySetting('location_add_ons', locationId, prev, next,
    (a, lid) => ({ id: a.id, location_id: lid, name: a.name, price: a.price || 0, is_active: a.active ?? true }));
}

// --- Food Types: location_food_types → data.foodTypes ---
function loadFoodTypes(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({ id: r.id, name: r.name, price: Number(r.price || 0) }));
}
async function saveFoodTypes(locationId, prev, next) {
  await saveArraySetting('location_food_types', locationId, prev, next,
    (f, lid) => ({ id: f.id, location_id: lid, name: f.name, price: f.price || 0 }));
}

// --- Field Definitions: location_field_definitions → data.fieldDefinitions / data.customFields ---
function loadFieldDefinitions(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({
    id: r.id, entityType: r.entity_type, fieldCode: r.field_code, fieldName: r.field_name,
    fieldType: r.field_type, fieldOrder: r.field_order, isLocked: r.is_locked,
    options: r.options, requiredFor: r.required_for,
  }));
}
async function saveFieldDefinitions(locationId, prev, next) {
  await saveArraySetting('location_field_definitions', locationId, prev, next,
    (f, lid) => ({
      id: f.id, location_id: lid, entity_type: f.entityType || 'dog',
      field_code: f.fieldCode || f.id, field_name: f.fieldName || f.name || '',
      field_type: f.fieldType || 'text', field_order: f.fieldOrder || 0,
      is_locked: f.isLocked || false, options: f.options, required_for: f.requiredFor,
    }));
}

// --- Automations: location_automations → data.automations ---
// Single-row table with JSONB tiers
function loadAutomations(rows) {
  if (!rows || rows.length === 0) return undefined;
  const r = rows[0];
  return { id: r.id, enabled: r.is_enabled, dailyCap: r.daily_cap, tiers: r.tiers || [] };
}
async function saveAutomations(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const row = {
    location_id: locationId, is_enabled: next.enabled ?? false,
    daily_cap: next.dailyCap || 50, tiers: next.tiers || [],
  };
  if (next.id) row.id = next.id;
  const { error } = await supabase.from('location_automations').upsert(row, { onConflict: next.id ? 'id' : 'location_id' });
  if (error) console.error('Save automations:', error);
}

// --- Run Card Templates: location_run_card_templates → data.runCardTemplates + data.runCardConfig ---
function loadRunCardTemplates(rows) {
  if (!rows || rows.length === 0) return { templates: undefined, config: undefined };
  const r = rows[0];
  return { templates: r.templates || [], config: r.config || {} };
}
async function saveRunCardTemplates(locationId, prev, next, prevConfig, nextConfig) {
  const changed = JSON.stringify(prev) !== JSON.stringify(next) || JSON.stringify(prevConfig) !== JSON.stringify(nextConfig);
  if (!changed) return;
  // Get existing row ID
  const { data: existing } = await supabase.from('location_run_card_templates')
    .select('id').eq('location_id', locationId).limit(1).single();
  const row = {
    location_id: locationId,
    templates: next || [],
    config: nextConfig || {},
  };
  if (existing?.id) row.id = existing.id;
  const { error } = await supabase.from('location_run_card_templates').upsert(row, { onConflict: existing?.id ? 'id' : 'location_id' });
  if (error) console.error('Save run card templates:', error);
}

// --- Attendance: location_attendance → data.attendanceRoster + data.attendanceEntries ---
function loadAttendance(rows) {
  if (!rows || rows.length === 0) return { roster: undefined, entries: undefined };
  const roster = rows.flatMap(r => r.roster || []);
  const entries = rows.flatMap(r => r.entries || []);
  return { roster, entries };
}
async function saveAttendance(locationId, prevRoster, nextRoster, prevEntries, nextEntries) {
  const rosterChanged = JSON.stringify(prevRoster) !== JSON.stringify(nextRoster);
  const entriesChanged = JSON.stringify(prevEntries) !== JSON.stringify(nextEntries);
  if (!rosterChanged && !entriesChanged) return;
  // Upsert a single row with today's date
  const today = new Date().toISOString().slice(0, 10);
  const row = { location_id: locationId, date: today, roster: nextRoster || [], entries: nextEntries || [] };
  const { error } = await supabase.from('location_attendance').upsert(row, { onConflict: 'id' });
  if (error) console.error('Save attendance:', error);
}

// --- Payment Rules: location_payment_rules → data.paymentRules ---
function loadPaymentRules(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.filter(r => !r.effective_to).map(r => ({
    id: r.id, serviceType: r.service_type, payAt: r.pay_at,
    depositPercent: r.deposit_percent, depositRefundable: r.deposit_refundable,
  }));
}
async function savePaymentRules(locationId, prev, next) {
  await saveArraySetting('location_payment_rules', locationId, prev, next,
    (r, lid) => ({
      id: r.id, location_id: lid, service_type: r.serviceType, pay_at: r.payAt,
      deposit_percent: r.depositPercent || 0, deposit_refundable: r.depositRefundable ?? false,
      effective_from: new Date().toISOString().slice(0, 10),
    }));
}

// --- Task Templates: location_task_templates → data.taskTemplates ---
function loadTaskTemplates(rows) {
  if (!rows || rows.length === 0) return undefined;
  const result = {};
  for (const r of rows) { result[r.template_type] = r.items || []; }
  return result;
}
async function saveTaskTemplates(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  for (const [type, items] of Object.entries(next)) {
    const { error } = await supabase.from('location_task_templates').upsert({
      location_id: locationId, template_type: type, items: items || [],
    }, { onConflict: 'id' });
    if (error) console.error(`Save task template ${type}:`, error);
  }
}

// --- Checklists: location_checklists → data.checklists ---
function loadChecklists(rows) {
  if (!rows || rows.length === 0) return undefined;
  const result = {};
  for (const r of rows) { result[r.checklist_type] = { id: r.id, items: r.items || [] }; }
  return result;
}
async function saveChecklists(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  for (const [type, val] of Object.entries(next)) {
    const row = { location_id: locationId, checklist_type: type, items: val?.items || val || [] };
    if (val?.id) row.id = val.id;
    const { error } = await supabase.from('location_checklists').upsert(row, { onConflict: val?.id ? 'id' : 'location_id' });
    if (error) console.error(`Save checklist ${type}:`, error);
  }
}

// --- Dropdown Options: dropdown_options → data.dropdownOptions ---
function loadDropdownOptions(rows) {
  if (!rows || rows.length === 0) return undefined;
  const result = {};
  for (const r of rows) {
    if (!result[r.category]) result[r.category] = [];
    result[r.category].push({ id: r.id, value: r.value, sortOrder: r.sort_order });
  }
  return result;
}
async function saveDropdownOptions(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  // Flatten all categories into rows
  const allRows = [];
  for (const [category, items] of Object.entries(next)) {
    for (const item of (items || [])) {
      allRows.push({ id: item.id, location_id: locationId, category, value: item.value, sort_order: item.sortOrder || 0 });
    }
  }
  // Delete existing and insert fresh
  await supabase.from('dropdown_options').delete().eq('location_id', locationId);
  if (allRows.length > 0) {
    const { error } = await supabase.from('dropdown_options').insert(allRows);
    if (error) console.error('Save dropdown options:', error);
  }
}


// --- Facility Settings: location_facility_settings → data.facilitySettings ---
function loadFacilitySettings(rows) {
  if (!rows || rows.length === 0) return undefined;
  const r = rows[0];
  return { largeDogDaycareSF: r.large_dog_daycare_sf, smallDogDaycareSF: r.small_dog_daycare_sf };
}
async function saveFacilitySettings(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const row = {
    location_id: locationId,
    large_dog_daycare_sf: next.largeDogDaycareSF ?? 3600,
    small_dog_daycare_sf: next.smallDogDaycareSF ?? 2400,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('location_facility_settings').upsert(row, { onConflict: 'location_id' });
  if (error) console.error('Save facility settings:', error);
}

// --- Resort Info: location_resort_info → data.resortInfo ---
function loadResortInfo(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows[0].info || {};
}
async function saveResortInfo(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const row = { location_id: locationId, info: next, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('location_resort_info').upsert(row, { onConflict: 'location_id' });
  if (error) console.error('Save resort info:', error);
}

// --- Mass Text History: location_mass_text_history → data.massTextHistory ---
function loadMassTextHistory(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({
    id: r.id, message: r.message, recipients: r.recipients || [],
    recipientCount: r.recipient_count, sentBy: r.sent_by, sentAt: r.sent_at,
  }));
}
async function saveMassTextHistory(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  if (!next) return;
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  for (const item of [...diff.adds, ...diff.updates]) {
    const { error } = await supabase.from('location_mass_text_history').upsert({
      id: item.id, location_id: locationId, message: item.message,
      recipients: item.recipients || [], recipient_count: item.recipientCount || item.recipients?.length || 0,
      sent_by: item.sentBy, sent_at: item.sentAt || new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) console.error('Save mass text history:', error);
  }
}

// --- Pending Invites: location_pending_invites → data.pendingInvites ---
function loadPendingInvites(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map(r => ({ id: r.id, email: r.email, name: r.name || '', role: r.role, invitedBy: r.invited_by, createdAt: r.created_at }));
}
async function savePendingInvites(locationId, prev, next) {
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  if (diff.adds.length > 0) {
    const rows = diff.adds.map(i => ({
      id: i.id, location_id: locationId, email: i.email, name: i.name || '', role: i.role, invited_by: i.invitedBy,
    }));
    const { error } = await supabase.from('location_pending_invites').insert(rows);
    if (error) console.error('Save pending invites:', error);
  }
  if (diff.deletes.length > 0) {
    const { error } = await supabase.from('location_pending_invites').delete().in('id', diff.deletes.map(i => i.id));
    if (error) console.error('Delete pending invites:', error);
  }
}

// --- Attendance Audit Log: location_attendance_audit → data.attendanceAuditLog ---
function loadAttendanceAuditLog(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map(r => ({
    id: r.id, action: r.action, details: r.details, performedBy: r.performed_by, createdAt: r.created_at,
  }));
}
async function saveAttendanceAuditLog(locationId, prev, next) {
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  if (diff.adds.length > 0) {
    const rows = diff.adds.map(e => ({
      id: e.id, location_id: locationId, action: e.action, details: e.details, performed_by: e.performedBy,
    }));
    const { error } = await supabase.from('location_attendance_audit').insert(rows);
    if (error) console.error('Save attendance audit:', error);
  }
}

// --- Client Lifecycle Events: client_lifecycle_events → client.lifecycleEvents ---
function attachLifecycleEvents(clients, eventRows) {
  const byClient = {};
  for (const r of (eventRows || [])) {
    if (!byClient[r.client_id]) byClient[r.client_id] = [];
    byClient[r.client_id].push({
      id: r.id, event: r.event_type, date: r.created_at,
      details: r.event_data?.details || '', ...(r.event_data || {}),
    });
  }
  for (const client of clients) {
    const events = byClient[client.id];
    if (events && events.length > 0) client.lifecycleEvents = events;
  }
}

async function saveLifecycleEvents(locationId, prevClients, newClients) {
  for (const client of (newClients || [])) {
    const prevClient = (prevClients || []).find(c => c.id === client.id);
    const prevEvents = prevClient?.lifecycleEvents || [];
    const newEvents = client.lifecycleEvents || [];
    if (newEvents.length > prevEvents.length) {
      const added = newEvents.slice(prevEvents.length);
      const rows = added.map(e => ({
        id: e.id || crypto.randomUUID(),
        client_id: client.id, event_type: e.event,
        event_data: { details: e.details, reservationId: e.reservationId },
        created_at: e.date || new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('client_lifecycle_events').insert(rows);
        if (error) console.error('Insert lifecycle events:', error);
      }
    }
  }
}

// --- Agreement Signing Records: agreement_log → client.agreements ---
function attachAgreementSignings(clients, logRows) {
  const byClient = {};
  for (const r of (logRows || [])) {
    if (!byClient[r.client_id]) byClient[r.client_id] = {};
    const rawDate = r.signed_at || r.created_at;
    byClient[r.client_id][r.agreement_id] = {
      signed: r.status === 'signed' || !!r.signed_at,
      date: rawDate ? rawDate.slice(0, 10) : null,
      logId: r.id,
      status: r.status,
      sentAt: r.sent_at || r.created_at,
      sentBy: r.sent_by || null,
      messageId: r.message_id || null,
    };
  }
  for (const client of clients) {
    const signings = byClient[client.id];
    if (signings && Object.keys(signings).length > 0) client.agreements = signings;
  }
}

async function saveAgreementSignings(locationId, prevClients, newClients) {
  for (const client of (newClients || [])) {
    const prevClient = (prevClients || []).find(c => c.id === client.id);
    const prevAgr = prevClient?.agreements || {};
    const newAgr = client.agreements || {};
    if (JSON.stringify(prevAgr) === JSON.stringify(newAgr)) continue;
    // Find newly signed or changed entries
    for (const [agrId, entry] of Object.entries(newAgr)) {
      const prev = prevAgr[agrId];
      if (JSON.stringify(prev) === JSON.stringify(entry)) continue;
      // Preserve exact status from app (sent, pending, signed)
      const dbStatus = entry.signed ? 'signed' : (entry.status || 'pending');
      if (entry.logId) {
        // Update existing log entry
        const { error } = await supabase.from('agreement_log').update({
          status: dbStatus,
          signed_at: entry.signed ? (entry.date || new Date().toISOString()) : null,
          sent_via: entry.sentVia || null,
          sent_by: entry.sentBy || null,
          sent_at: entry.sentAt || null,
          message_id: entry.messageId || null,
        }).eq('id', entry.logId);
        if (error) console.error('Update agreement_log:', error);
      } else {
        // Insert new log entry
        const { error } = await supabase.from('agreement_log').insert({
          id: crypto.randomUUID(),
          agreement_id: agrId, client_id: client.id, location_id: locationId,
          status: dbStatus,
          signed_at: entry.signed ? (entry.date || new Date().toISOString()) : null,
          sent_via: entry.sentVia || null,
          sent_by: entry.sentBy || null,
          sent_at: entry.sentAt || null,
          message_id: entry.messageId || null,
        });
        if (error) console.error('Insert agreement_log:', error);
      }
    }
  }
}

// --- Questionnaire Responses: questionnaire_log → client.questionnaireResponses ---
function attachQuestionnaireResponses(clients, logRows) {
  const byClient = {};
  for (const r of (logRows || [])) {
    if (!byClient[r.client_id]) byClient[r.client_id] = {};
    const key = r.questionnaire_id || r.id;
    byClient[r.client_id][key] = {
      logId: r.id, responses: r.responses, status: r.status,
      completedAt: r.completed_at, dogId: r.dog_id,
    };
  }
  for (const client of clients) {
    const resps = byClient[client.id];
    if (resps && Object.keys(resps).length > 0) client.questionnaireResponses = resps;
  }
}

async function saveQuestionnaireResponses(locationId, prevClients, newClients) {
  for (const client of (newClients || [])) {
    const prevClient = (prevClients || []).find(c => c.id === client.id);
    const prevQR = prevClient?.questionnaireResponses || {};
    const newQR = client.questionnaireResponses || {};
    if (JSON.stringify(prevQR) === JSON.stringify(newQR)) continue;
    for (const [qId, data] of Object.entries(newQR)) {
      const prev = prevQR[qId];
      if (JSON.stringify(prev) === JSON.stringify(data)) continue;
      if (data.logId) {
        const { error } = await supabase.from('questionnaire_log').update({
          responses: data.responses, status: data.status || (data.completedAt ? 'completed' : 'pending'),
          completed_at: data.completedAt,
        }).eq('id', data.logId);
        if (error) console.error('Update questionnaire_log:', error);
      } else {
        const { error } = await supabase.from('questionnaire_log').insert({
          id: crypto.randomUUID(),
          questionnaire_id: qId !== data.logId ? qId : null,
          client_id: client.id, location_id: locationId,
          dog_id: data.dogId || null,
          responses: data.responses, status: data.status || 'completed',
          completed_at: data.completedAt || new Date().toISOString(),
        });
        if (error) console.error('Insert questionnaire_log:', error);
      }
    }
  }
}

// --- Outbound Links: outbound_links table (3.6 Twilio-ready) ---
function loadOutboundLinks(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map(r => ({
    id: r.id, linkType: r.link_type, relatedId: r.related_id,
    clientId: r.client_id, expiresAt: r.expires_at,
    firstViewedAt: r.first_viewed_at, viewCount: r.view_count, createdAt: r.created_at,
  }));
}
async function saveOutboundLinks(locationId, prev, next) {
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  if (diff.adds.length > 0) {
    const rows = diff.adds.map(l => ({
      id: l.id || crypto.randomUUID(), link_type: l.linkType,
      related_id: l.relatedId, client_id: l.clientId,
      location_id: locationId, expires_at: l.expiresAt,
    }));
    const { error } = await supabase.from('outbound_links').insert(rows);
    if (error) console.error('Insert outbound_links:', error);
  }
  if (diff.updates.length > 0) {
    for (const l of diff.updates) {
      const { error } = await supabase.from('outbound_links').update({
        first_viewed_at: l.firstViewedAt, view_count: l.viewCount,
      }).eq('id', l.id);
      if (error) console.error('Update outbound_links:', error);
    }
  }
}

// --- Questionnaires: questionnaires table → data.questionnaires ---
function loadQuestionnaires(rows) {
  if (!rows || rows.length === 0) return undefined;
  return rows.map(r => ({
    id: r.id, title: r.title, version: r.version || 1,
    questions: r.questions || [], isCurrent: r.is_current ?? true,
    createdBy: r.created_by, createdAt: r.created_at,
  }));
}

async function saveQuestionnaires(locationId, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  const diff = diffArrays(prev, next);
  if (!diff.hasChanges) return;
  if (diff.adds.length + diff.updates.length > 0) {
    const rows = [...diff.adds, ...diff.updates].map(q => ({
      id: q.id || crypto.randomUUID(),
      location_id: locationId,
      title: q.title, version: q.version || 1,
      questions: q.questions || [],
      is_current: q.isCurrent ?? true,
      created_by: q.createdBy || null,
    }));
    const { error } = await supabase.from('questionnaires').upsert(rows, { onConflict: 'id' });
    if (error) console.error('Save questionnaires:', error);
  }
  if (diff.deletes.length > 0) {
    const { error } = await supabase.from('questionnaires').delete().in('id', diff.deletes.map(d => d.id));
    if (error) console.error('Delete questionnaires:', error);
  }
}

// ============================================================
// ENTITY + SETTINGS TABLE CONFIG
// ============================================================

const ENTITIES = {
  clients:      { table: 'k9_clients',          toRow: clientToRow,      fromRow: rowToClient,      select: '*' },
  dogs:         { table: 'k9_dogs',             toRow: dogToRow,         fromRow: rowToDog,          select: '*' },
  reservations: { table: 'k9_reservations',     toRow: reservationToRow, fromRow: rowToReservation,  select: '*' },
  evaluations:  { table: 'k9_evaluations_v2',   toRow: evaluationToRow,  fromRow: rowToEvaluation,   select: '*' },
  payments:     { table: 'k9_payments',         toRow: paymentToRow,     fromRow: rowToPayment,      select: '*' },
  packages:     { table: 'enterprise_packages', toRow: packageToRow,     fromRow: rowToPackage,      select: '*', global: true },
  packageSales: { table: 'k9_package_sales_v2', toRow: packageSaleToRow, fromRow: rowToPackageSale,  select: '*' },
  messages:     { table: 'k9_messages',         toRow: messageToRow,     fromRow: rowToMessage,      select: '*' },
  auditLog:     { table: 'audit_log',           toRow: auditToRow,       fromRow: rowToAudit,        select: '*' },
  vets:         { table: 'vets',               toRow: vetToRow,         fromRow: rowToVet,          select: '*' },
};

const DAILY_OPS_TABLE = 'k9_daily_ops';

// Keys that go to entity tables (NOT settings)
const ENTITY_KEYS = new Set([
  ...Object.keys(ENTITIES),
  'eodEntries', 'dailyOps',
  'dogVaccines', 'weightLog', 'feedingSchedules', 'medicationSchedules',
  'dogTagHistory', 'clientContacts', 'locationRoles',
  '_invoices', '_invoiceLineItems',
  'outboundLinks', // 3.6 outbound_links table
]);

// ALL settings keys — every key maps to a dedicated location_* table (no JSONB fallback)
const MIGRATED_SETTINGS_KEYS = new Set([
  'pricing', 'rooms', 'dogTags', 'requiredVaccines', 'closedDates',
  'resortPolicies', 'messageTemplates', 'eodTemplate', 'agreements',
  'addOnRules', 'foodTypes', 'fieldDefinitions', 'automations',
  'runCardTemplates', 'runCardConfig', 'attendanceRoster', 'attendanceEntries',
  'paymentRules', 'taskTemplates', 'checklists', 'dropdownOptions',
  // Formerly unmigrated — now have dedicated tables
  'facilitySettings', 'resortInfo', 'massTextHistory',
  'pendingInvites', 'attendanceAuditLog',
  'questionnaires', // questionnaire designer templates
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

  const prevLocationId = useRef(locationId);

  // ── LOAD ──
  useEffect(() => {
    if (!locationId) { setLoading(false); return; }

    if (prevLocationId.current && prevLocationId.current !== locationId) {
      setData(null);
      prevDataRef.current = null;
    }
    prevLocationId.current = locationId;
    setLoading(true);

    const load = async () => {
      if (savingRef.current) return;
      setLoadError(false);
      try {
        const [
          // Core entities
          clientsRes, dogsRes, resRes, evalRes, opsRes,
          payRes, pkgRes, pkgSaleRes, msgRes, auditRes,
          // Dog child tables
          vaccinesRes, weightRes, feedingRes, medsRes, tagHistRes,
          // Client child tables
          contactsRes, lifecycleEventsRes, agreementLogRes, questionnaireLogRes,
          // Roles
          rolesRes,
          // Settings tables
          pricingRes, roomTypesRes, roomUnitsRes, dogTagsRes, reqVaccRes,
          closedRes, policiesRes, msgTplRes, eodSecRes, agreementsRes,
          addOnsRes, foodTypesRes, fieldDefsRes, automationsRes,
          runCardRes, attendanceRes, payRulesRes, taskTplRes,
          checklistsRes, dropdownRes, vaccineTypesRes,
          // Newly migrated settings tables
          facilitySettingsRes, resortInfoRes, massTextHistRes,
          pendingInvitesRes, attendanceAuditRes,
          // Outbound links (3.6)
          outboundLinksRes,
          // Vets
          vetsRes,
          // Questionnaire templates
          questionnairesRes,
          // Online bookings
          onlineBookingsRes,
        ] = await Promise.all([
          // Core entities
          supabase.from('k9_clients').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_dogs').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_reservations').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_evaluations_v2').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from(DAILY_OPS_TABLE).select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_payments').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('enterprise_packages').select('*').order('created_at'),
          supabase.from('k9_package_sales_v2').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('k9_messages').select('*').eq('location_id', locationId).order('created_at'),
          supabase.from('audit_log').select('*').eq('location_id', locationId).order('created_at'),
          // Dog child tables
          supabase.from('dog_vaccines').select('*'),
          supabase.from('weight_log').select('*'),
          supabase.from('feeding_schedules').select('*'),
          supabase.from('medication_schedules').select('*'),
          supabase.from('dog_tag_history').select('*'),
          // Client child tables
          supabase.from('client_contacts').select('*').eq('location_id', locationId),
          supabase.from('client_lifecycle_events').select('*'),
          supabase.from('agreement_log').select('*').eq('location_id', locationId),
          supabase.from('questionnaire_log').select('*').eq('location_id', locationId),
          // Roles
          supabase.from('location_roles').select('*').eq('location_id', locationId),
          // Settings tables
          supabase.from('location_pricing').select('*').eq('location_id', locationId),
          supabase.from('location_room_types').select('*').eq('location_id', locationId).order('sort_order'),
          supabase.from('location_room_units').select('*').eq('location_id', locationId),
          supabase.from('location_dog_tags').select('*').eq('location_id', locationId).order('sort_order'),
          supabase.from('location_required_vaccines').select('*').eq('location_id', locationId),
          supabase.from('location_closed_dates').select('*').eq('location_id', locationId),
          supabase.from('location_policies').select('*').eq('location_id', locationId),
          supabase.from('location_message_templates').select('*').eq('location_id', locationId),
          supabase.from('location_eod_sections').select('*').eq('location_id', locationId).order('sort_order'),
          supabase.from('agreements').select('*').eq('location_id', locationId),
          supabase.from('location_add_ons').select('*').eq('location_id', locationId),
          supabase.from('location_food_types').select('*').eq('location_id', locationId),
          supabase.from('location_field_definitions').select('*').eq('location_id', locationId).order('field_order'),
          supabase.from('location_automations').select('*').eq('location_id', locationId),
          supabase.from('location_run_card_templates').select('*').eq('location_id', locationId),
          supabase.from('location_attendance').select('*').eq('location_id', locationId),
          supabase.from('location_payment_rules').select('*').eq('location_id', locationId),
          supabase.from('location_task_templates').select('*').eq('location_id', locationId),
          supabase.from('location_checklists').select('*').eq('location_id', locationId),
          supabase.from('dropdown_options').select('*').eq('location_id', locationId),
          supabase.from('vaccine_types').select('*'),
          // Newly migrated settings tables
          supabase.from('location_facility_settings').select('*').eq('location_id', locationId),
          supabase.from('location_resort_info').select('*').eq('location_id', locationId),
          supabase.from('location_mass_text_history').select('*').eq('location_id', locationId).order('sent_at', { ascending: false }),
          supabase.from('location_pending_invites').select('*').eq('location_id', locationId),
          supabase.from('location_attendance_audit').select('*').eq('location_id', locationId).order('created_at'),
          // Outbound links (3.6)
          supabase.from('outbound_links').select('*').eq('location_id', locationId),
          // Vets
          supabase.from('vets').select('*').eq('location_id', locationId).order('vet_name'),
          // Questionnaire templates
          supabase.from('questionnaires').select('*').eq('location_id', locationId).order('created_at'),
          // Online bookings
          supabase.from('online_bookings').select('*').eq('location_id', locationId).order('submitted_at', { ascending: false }),
        ]);

        if (savingRef.current) return;

        // Load settings from dedicated tables (no JSONB fallback)
        const vaccineTypes = vaccineTypesRes.data || [];
        const pricing = loadPricing(pricingRes.data);
        const rooms = loadRooms(roomTypesRes.data, roomUnitsRes.data);
        const dogTags = loadDogTags(dogTagsRes.data);
        const requiredVaccines = loadRequiredVaccines(reqVaccRes.data, vaccineTypes);
        const closedDates = loadClosedDates(closedRes.data);
        const resortPolicies = loadPolicies(policiesRes.data);
        const messageTemplates = loadMessageTemplates(msgTplRes.data);
        const eodTemplate = loadEodTemplate(eodSecRes.data);
        const agreementDefs = loadAgreements(agreementsRes.data);
        const addOnRules = loadAddOns(addOnsRes.data);
        const foodTypes = loadFoodTypes(foodTypesRes.data);
        const fieldDefinitions = loadFieldDefinitions(fieldDefsRes.data);
        const automationsData = loadAutomations(automationsRes.data);
        const runCard = loadRunCardTemplates(runCardRes.data);
        const attendance = loadAttendance(attendanceRes.data);
        const paymentRules = loadPaymentRules(payRulesRes.data);
        const taskTemplates = loadTaskTemplates(taskTplRes.data);
        const checklists = loadChecklists(checklistsRes.data);
        const dropdownOptions = loadDropdownOptions(dropdownRes.data);
        // Newly migrated settings
        const facilitySettings = loadFacilitySettings(facilitySettingsRes.data);
        const resortInfo = loadResortInfo(resortInfoRes.data);
        const massTextHistory = loadMassTextHistory(massTextHistRes.data);
        const pendingInvites = loadPendingInvites(pendingInvitesRes.data);
        const attendanceAuditLog = loadAttendanceAuditLog(attendanceAuditRes.data);

        // Build settings object (all from tables, no fallback)
        const settings = {};
        const setIfDefined = (key, val) => { if (val !== undefined) settings[key] = val; };
        setIfDefined('pricing', pricing);
        setIfDefined('rooms', rooms);
        setIfDefined('dogTags', dogTags);
        setIfDefined('requiredVaccines', requiredVaccines);
        setIfDefined('closedDates', closedDates);
        setIfDefined('resortPolicies', resortPolicies);
        setIfDefined('messageTemplates', messageTemplates);
        setIfDefined('eodTemplate', eodTemplate);
        setIfDefined('agreements', agreementDefs);
        setIfDefined('addOnRules', addOnRules);
        setIfDefined('foodTypes', foodTypes);
        setIfDefined('fieldDefinitions', fieldDefinitions);
        if (automationsData) settings.automations = automationsData;
        if (runCard.templates !== undefined) settings.runCardTemplates = runCard.templates;
        if (runCard.config !== undefined) settings.runCardConfig = runCard.config;
        if (attendance.roster !== undefined) settings.attendanceRoster = attendance.roster;
        if (attendance.entries !== undefined) settings.attendanceEntries = attendance.entries;
        setIfDefined('paymentRules', paymentRules);
        setIfDefined('taskTemplates', taskTemplates);
        setIfDefined('checklists', checklists);
        setIfDefined('dropdownOptions', dropdownOptions);
        // Newly migrated settings (always set, even if empty defaults)
        settings.facilitySettings = facilitySettings || { largeDogDaycareSF: 3600, smallDogDaycareSF: 2400 };
        settings.resortInfo = resortInfo || {};
        settings.massTextHistory = massTextHistory || [];
        settings.pendingInvites = pendingInvites || [];
        settings.attendanceAuditLog = attendanceAuditLog || [];
        // Questionnaire templates
        const questionnaireTemplates = loadQuestionnaires(questionnairesRes.data);
        if (questionnaireTemplates) settings.questionnaires = questionnaireTemplates;

        // Convert DB rows → app JS objects
        const allOps = (opsRes.data || []).map(rowToDailyOps);
        const dogs = (dogsRes.data || []).map(rowToDog);

        // Build dog child data maps
        const dogIdSet = new Set(dogs.map(d => d.id));
        const groupByDog = (rows) => {
          const map = {};
          for (const r of (rows || [])) {
            if (!dogIdSet.has(r.dog_id)) continue;
            if (!map[r.dog_id]) map[r.dog_id] = [];
            map[r.dog_id].push(r);
          }
          return map;
        };

        const vaccinesByDog = groupByDog(vaccinesRes.data);
        const weightByDog = groupByDog(weightRes.data);
        const feedingByDog = groupByDog(feedingRes.data);
        const medsByDog = groupByDog(medsRes.data);
        const tagsByDog = groupByDog(tagHistRes.data);

        // Transform child table rows → app-expected format on dog objects
        for (const dog of dogs) {
          const vRows = vaccinesByDog[dog.id] || [];
          for (const v of vRows) {
            const vt = vaccineTypes.find(t => t.id === v.vaccine_type_id);
            if (vt) dog.fields[vt.code + '_exp'] = v.expiration_date;
          }
          dog._vaccineRows = vRows;

          const wRows = (weightByDog[dog.id] || []).sort((a, b) =>
            (a.recorded_at || '').localeCompare(b.recorded_at || ''));
          dog.fields.weightLog = wRows.map(w => ({
            id: w.id, date: w.recorded_at, weight: w.weight_lbs,
            reason: w.notes, by: w.recorded_by,
          }));
          if (wRows.length > 0) {
            dog.fields.weight = String(wRows[wRows.length - 1].weight_lbs);
            dog.fields.weightLastUpdated = wRows[wRows.length - 1].recorded_at;
          }

          const fRows = feedingByDog[dog.id] || [];
          dog.fields.feedingSchedules = fRows.map(f => ({
            id: f.id,
            times: f.meal_time ? [f.meal_time] : [],
            amount: f.quantity || '',
            unit: f.quantity_unit || '',
            foodType: f.food_type || '',
            instruction: f.instructions ? (typeof f.instructions === 'string' ? (f.instructions.startsWith('[') ? JSON.parse(f.instructions) : [f.instructions]) : f.instructions) : [],
            notes: f.notes || '',
          }));

          const mRows = medsByDog[dog.id] || [];
          dog.fields.medicationSchedules = mRows.map(m => ({
            id: m.id, name: m.medication_name || '', dosage: m.dosage || '',
            frequency: m.frequency || '', startDate: m.start_date,
            endDate: m.end_date, notes: m.notes || '',
          }));

          const tRows = tagsByDog[dog.id] || [];
          dog.tags = tRows.filter(t => !t.removed_date).map(t => t.tag_code);
          dog._tagRows = tRows;
        }

        // Build client objects with child data from dedicated tables
        const clients = (clientsRes.data || []).map(rowToClient);

        // Attach emergency contacts
        const contactRows = contactsRes.data || [];
        const contactsByClient = {};
        for (const ct of contactRows) {
          if (!contactsByClient[ct.client_id]) contactsByClient[ct.client_id] = [];
          contactsByClient[ct.client_id].push(ct);
        }
        for (const client of clients) {
          const contacts = contactsByClient[client.id] || [];
          const ec = contacts.find(ct => ct.is_emergency_contact) || contacts[0];
          if (ec) {
            client.fields.emergency_contact = [ec.first_name, ec.last_name].filter(Boolean).join(' ') || '';
            client.fields.emergency_phone = ec.phone || '';
          }
          client._contactRows = contacts;
        }

        // Attach lifecycle events from client_lifecycle_events table
        attachLifecycleEvents(clients, lifecycleEventsRes.data);
        // Attach agreement signing records from agreement_log table
        attachAgreementSignings(clients, agreementLogRes.data);
        // Attach questionnaire responses from questionnaire_log table
        attachQuestionnaireResponses(clients, questionnaireLogRes.data);

        const assembled = {
          // All settings (from dedicated location_* tables)
          ...settings,
          // Core entities
          clients,
          dogs,
          reservations: (resRes.data || []).map(rowToReservation),
          evaluations: (evalRes.data || []).map(rowToEvaluation),
          eodEntries: allOps.filter(d => d.type === 'eod'),
          dailyOps: allOps.filter(d => d.type !== 'eod'),
          payments: (payRes.data || []).map(rowToPayment),
          packages: (pkgRes.data || []).map(rowToPackage),
          packageSales: (pkgSaleRes.data || []).map(rowToPackageSale),
          messages: (msgRes.data || []).map(rowToMessage),
          auditLog: (auditRes.data || [])
            .filter(r => !['INSERT','UPDATE','DELETE'].includes(r.action))  // skip DB-trigger duplicates
            .map(rowToAudit),
          // Child/lookup data
          clientContacts: contactsRes.data || [],
          locationRoles: rolesRes.data || [],
          outboundLinks: loadOutboundLinks(outboundLinksRes.data),
          vets: (vetsRes.data || []).map(rowToVet),
          _vaccineTypes: vaccineTypes,
          // Online bookings from dedicated table
          onlineBookings: (onlineBookingsRes.data || []).map(r => ({
            id: r.id, status: r.status, submittedAt: r.submitted_at,
            processedAt: r.processed_at, declineReason: r.decline_reason,
            type: r.reservation_type, checkIn: r.check_in, checkOut: r.check_out,
            roomType: r.room_type, tourTime: r.tour_time, daycareSize: r.daycare_size,
            client: { firstName: r.client_first_name, lastName: r.client_last_name, phone: r.client_phone, email: r.client_email, emergencyContact: r.emergency_contact, emergencyPhone: r.emergency_phone },
            dog: { name: r.dog_name, breed: r.dog_breed, weight: r.dog_weight, sex: r.dog_sex, spayedNeutered: r.dog_spayed_neutered, dob: r.dog_dob, bathType: r.dog_bath_type },
            notes: r.notes, addOns: r.add_ons || [],
          })),
        };

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
    const entityTables = [
      'k9_clients', 'k9_dogs', 'k9_reservations', 'k9_evaluations_v2',
      DAILY_OPS_TABLE, 'k9_payments', 'k9_package_sales_v2',
      'k9_messages', 'audit_log',
      'dog_vaccines', 'weight_log', 'feeding_schedules',
      'medication_schedules', 'dog_tag_history', 'client_contacts',
      'client_lifecycle_events', 'agreement_log', 'questionnaire_log',
      'outbound_links', 'vets', 'online_bookings',
    ];
    const settingsTables = [
      'location_roles', 'location_pricing', 'location_room_types', 'location_room_units',
      'location_dog_tags', 'location_required_vaccines', 'location_closed_dates',
      'location_policies', 'location_message_templates', 'location_eod_sections',
      'agreements', 'location_add_ons', 'location_food_types',
      'location_field_definitions', 'location_automations', 'location_run_card_templates',
      'location_attendance', 'location_payment_rules', 'location_task_templates',
      'location_checklists', 'dropdown_options',
      'location_facility_settings', 'location_resort_info', 'location_mass_text_history',
      'location_pending_invites', 'location_attendance_audit',
      'questionnaires',
    ];

    let channel = supabase
      .channel(`location-${locationId}`);

    for (const tbl of [...entityTables, ...settingsTables]) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, () => load());
    }
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'enterprise_packages' }, () => load());

    channel.subscribe();
    const poll = setInterval(() => load(), 30000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [locationId]);

  // ── SAVE ──
  const save = useCallback(async (newData) => {
    setData(newData);
    setIsEmpty(false);
    if (!locationId) return;

    savingRef.current = true;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const prev = prevDataRef.current || {};
        prevDataRef.current = newData;

        const buildOps = (key, table, toRow, isGlobal) => {
          const ops = [];
          const oldArr = prev[key];
          const newArr = newData[key];
          if (oldArr === newArr) return ops;
          const diff = diffArrays(oldArr, newArr);
          if (!diff.hasChanges) return ops;
          if (diff.adds.length > 0 || diff.updates.length > 0) {
            const rows = [...diff.adds, ...diff.updates].map(item =>
              isGlobal ? toRow(item) : toRow(item, locationId)
            );
            ops.push(supabase.from(table).upsert(rows, { onConflict: 'id' }).select()
              .then(({ data: returned, error, status, statusText }) => {
                if (error) console.error(`Upsert ${key}:`, JSON.stringify({ code: error.code, msg: error.message, details: error.details, hint: error.hint, status, statusText, table, rowCount: rows.length, rowKeys: Object.keys(rows[0] || {}) }));
                else if (returned && returned.length < rows.length) console.warn(`[K9] Silent RLS rejection on ${table}: sent ${rows.length} rows, only ${returned.length} persisted. Check that profiles.location_id matches the target location.`);
              }));
          }
          if (diff.deletes.length > 0) {
            ops.push(supabase.from(table).delete().in('id', diff.deletes.map(i => i.id))
              .then(({ error }) => { if (error) console.error(`Delete ${key}:`, error); }));
          }
          return ops;
        };

        // ── Entity writes in FK-safe tiers ──
        const t1 = [
          ...buildOps('clients', 'k9_clients', clientToRow),
          ...buildOps('packages', 'enterprise_packages', packageToRow, true),
          ...buildOps('vets', 'vets', vetToRow),
        ];
        if (t1.length) await Promise.all(t1);

        const t2 = buildOps('dogs', 'k9_dogs', dogToRow);
        if (t2.length) await Promise.all(t2);

        const t3 = [
          ...buildOps('reservations', 'k9_reservations', reservationToRow),
          ...buildOps('packageSales', 'k9_package_sales_v2', packageSaleToRow),
          ...buildOps('messages', 'k9_messages', messageToRow),
        ];
        if (t3.length) await Promise.all(t3);

        const t4 = [
          ...buildOps('evaluations', 'k9_evaluations_v2', evaluationToRow),
          ...buildOps('payments', 'k9_payments', paymentToRow),
          ...buildOps('auditLog', 'audit_log', auditToRow),
          ...buildOps('eodEntries', DAILY_OPS_TABLE, dailyOpsToRow),
          ...buildOps('dailyOps', DAILY_OPS_TABLE, dailyOpsToRow),
        ];
        if (t4.length) await Promise.all(t4);

        // ── Dog child table saves (transform app format → DB rows) ──
        const vaccineTypes = newData._vaccineTypes || prev._vaccineTypes || [];
        const vacCodeToId = new Map(vaccineTypes.map(vt => [vt.code + '_exp', vt.id]));
        const VACCINE_FIELDS = ['rabies_exp', 'dhpp_exp', 'bordetella_exp', 'canine_flu_exp'];

        for (const dog of (newData.dogs || [])) {
          const prevDog = (prev.dogs || []).find(d => d.id === dog.id);
          const f = dog.fields || {};
          const pf = prevDog?.fields || {};

          // --- Vaccines: dog.fields.{vax}_exp → dog_vaccines rows ---
          for (const vField of VACCINE_FIELDS) {
            if (f[vField] !== pf[vField] && f[vField]) {
              const vtId = vacCodeToId.get(vField);
              if (!vtId) continue;
              const existing = (dog._vaccineRows || []).find(v => v.vaccine_type_id === vtId);
              t4.push(supabase.from('dog_vaccines').upsert({
                id: existing?.id || crypto.randomUUID(),
                dog_id: dog.id, vaccine_type_id: vtId,
                expiration_date: f[vField],
              }, { onConflict: 'id' })
                .then(({ error }) => { if (error) console.error('Upsert vaccine:', error); }));
            }
          }

          // --- Weight log: dog.fields.weightLog → weight_log rows ---
          const oldWL = pf.weightLog || [];
          const newWL = f.weightLog || [];
          if (newWL.length > oldWL.length) {
            // New entries added (app always appends)
            const newEntries = newWL.slice(oldWL.length);
            const rows = newEntries.map(e => ({
              id: e.id || crypto.randomUUID(),
              dog_id: dog.id, weight_lbs: Number(e.weight),
              recorded_at: e.date || new Date().toISOString(),
              recorded_by: e.by || null, notes: e.reason || null,
            }));
            if (rows.length > 0) {
              t4.push(supabase.from('weight_log').insert(rows)
                .then(({ error }) => { if (error) console.error('Insert weight_log:', error); }));
            }
          }

          // --- Feeding schedules: dog.fields.feedingSchedules → feeding_schedules rows ---
          if (JSON.stringify(f.feedingSchedules) !== JSON.stringify(pf.feedingSchedules)) {
            // Each editor entry has times:["AM (6:00 am)","PM (6:00 pm)"] — expand to one row per time
            const schedRows = [];
            for (const s of (f.feedingSchedules || [])) {
              const times = s.times && s.times.length > 0 ? s.times : (s.mealTime ? [s.mealTime] : ['']);
              for (const t of times) {
                schedRows.push({
                  id: times.length === 1 ? (s.id || crypto.randomUUID()) : crypto.randomUUID(),
                  dog_id: dog.id,
                  meal_time: t || '',
                  food_type: s.foodType || '',
                  quantity: s.amount || s.portion || '',
                  quantity_unit: s.unit || '',
                  instructions: Array.isArray(s.instruction) ? JSON.stringify(s.instruction) : (s.instruction || ''),
                  is_active: true,
                });
              }
            }
            // Delete all and re-insert for this dog
            t4.push(
              supabase.from('feeding_schedules').delete().eq('dog_id', dog.id)
                .then(() => schedRows.length > 0
                  ? supabase.from('feeding_schedules').insert(schedRows)
                      .then(({ error }) => { if (error) console.error('Insert feeding:', error); })
                  : null)
            );
          }

          // --- Medication schedules: dog.fields.medicationSchedules → medication_schedules rows ---
          if (JSON.stringify(f.medicationSchedules) !== JSON.stringify(pf.medicationSchedules)) {
            const medRows = (f.medicationSchedules || []).map(m => ({
              id: m.id || crypto.randomUUID(),
              dog_id: dog.id, medication_name: m.name || '',
              dosage: m.dosage || '', frequency: m.frequency || '',
              start_date: m.startDate || null, end_date: m.endDate || null,
              notes: m.notes || '', is_active: true,
            }));
            t4.push(
              supabase.from('medication_schedules').delete().eq('dog_id', dog.id)
                .then(() => medRows.length > 0
                  ? supabase.from('medication_schedules').insert(medRows)
                      .then(({ error }) => { if (error) console.error('Insert meds:', error); })
                  : null)
            );
          }

          // --- Tags: dog.tags string array → dog_tag_history rows ---
          const oldTags = new Set(prevDog?.tags || []);
          const newTags = new Set(dog.tags || []);
          // Added tags
          for (const tag of newTags) {
            if (!oldTags.has(tag)) {
              t4.push(supabase.from('dog_tag_history').insert({
                id: crypto.randomUUID(), dog_id: dog.id, tag_code: tag,
                assigned_date: new Date().toISOString().slice(0, 10),
              }).then(({ error }) => { if (error) console.error('Insert tag:', error); }));
            }
          }
          // Removed tags
          for (const tag of oldTags) {
            if (!newTags.has(tag)) {
              const row = (dog._tagRows || []).find(t => t.tag_code === tag && !t.removed_date);
              if (row) {
                t4.push(supabase.from('dog_tag_history').update({
                  removed_date: new Date().toISOString().slice(0, 10),
                }).eq('id', row.id)
                  .then(({ error }) => { if (error) console.error('Remove tag:', error); }));
              }
            }
          }
        }

        // ── Client contacts: emergency_contact/phone → client_contacts table ──
        for (const client of (newData.clients || [])) {
          const prevClient = (prev.clients || []).find(c => c.id === client.id);
          const ecName = client.fields?.emergency_contact;
          const ecPhone = client.fields?.emergency_phone;
          const prevEcName = prevClient?.fields?.emergency_contact;
          const prevEcPhone = prevClient?.fields?.emergency_phone;
          if (ecName !== prevEcName || ecPhone !== prevEcPhone) {
            if (ecName || ecPhone) {
              const existing = (client._contactRows || []).find(c => c.is_emergency_contact);
              // Split ecName into first/last for the client_contacts table schema
              const nameParts = (ecName || '').trim().split(/\s+/);
              const ecFirst = nameParts[0] || '';
              const ecLast = nameParts.slice(1).join(' ') || '';
              t4.push(supabase.from('client_contacts').upsert({
                id: existing?.id || crypto.randomUUID(),
                client_id: client.id, location_id: locationId,
                first_name: ecFirst, last_name: ecLast,
                phone: ecPhone || '',
                is_emergency_contact: true,
              }, { onConflict: 'id' })
                .then(({ error }) => { if (error) console.error('Upsert client contact:', error); }));
            }
          }
        }

        // ── Invoice saves (created on checkout) ──
        const newInvoices = newData._invoices || [];
        const prevInvoices = prev._invoices || [];
        if (newInvoices.length > prevInvoices.length) {
          const added = newInvoices.slice(prevInvoices.length);
          for (const inv of added) {
            t4.push(supabase.from('invoices').insert({
              id: inv.id, location_id: locationId,
              client_id: inv.clientId, reservation_id: inv.reservationId,
              invoice_number: inv.invoiceNumber,
              total_amount: inv.totalAmount, status: inv.status || 'draft',
              due_date: inv.dueDate, paid_at: inv.paidAt,
            }).then(({ error }) => { if (error) console.error('Insert invoice:', error); }));
          }
        }
        const newLineItems = newData._invoiceLineItems || [];
        const prevLineItems = prev._invoiceLineItems || [];
        if (newLineItems.length > prevLineItems.length) {
          const added = newLineItems.slice(prevLineItems.length);
          const rows = added.map(li => ({
            id: li.id, invoice_id: li.invoiceId,
            description: li.description, quantity: li.quantity || 1,
            unit_price: li.unitPrice, total_price: li.totalPrice,
            item_type: li.itemType,
          }));
          t4.push(supabase.from('invoice_line_items').insert(rows)
            .then(({ error }) => { if (error) console.error('Insert line items:', error); }));
        }

        if (t4.length) await Promise.all(t4);

        // ── Migrated settings saves (to location_* tables) ──
        // (vaccineTypes already defined above for dog child table saves)
        const settingsSaves = [];

        if (prev.pricing !== newData.pricing) settingsSaves.push(savePricing(locationId, prev.pricing, newData.pricing));
        if (prev.rooms !== newData.rooms) settingsSaves.push(saveRooms(locationId, prev.rooms, newData.rooms));
        if (prev.dogTags !== newData.dogTags) settingsSaves.push(saveDogTags(locationId, prev.dogTags, newData.dogTags));
        if (prev.requiredVaccines !== newData.requiredVaccines) settingsSaves.push(saveRequiredVaccines(locationId, prev.requiredVaccines, newData.requiredVaccines, vaccineTypes));
        if (prev.closedDates !== newData.closedDates) settingsSaves.push(saveClosedDates(locationId, prev.closedDates, newData.closedDates));
        if (prev.resortPolicies !== newData.resortPolicies) settingsSaves.push(savePolicies(locationId, prev.resortPolicies, newData.resortPolicies));
        if (prev.messageTemplates !== newData.messageTemplates) settingsSaves.push(saveMessageTemplates(locationId, prev.messageTemplates, newData.messageTemplates));
        if (prev.eodTemplate !== newData.eodTemplate) settingsSaves.push(saveEodTemplate(locationId, prev.eodTemplate, newData.eodTemplate));
        if (prev.agreements !== newData.agreements) settingsSaves.push(saveAgreements(locationId, prev.agreements, newData.agreements));
        if (prev.addOnRules !== newData.addOnRules) settingsSaves.push(saveAddOns(locationId, prev.addOnRules, newData.addOnRules));
        if (prev.foodTypes !== newData.foodTypes) settingsSaves.push(saveFoodTypes(locationId, prev.foodTypes, newData.foodTypes));
        if (prev.fieldDefinitions !== newData.fieldDefinitions) settingsSaves.push(saveFieldDefinitions(locationId, prev.fieldDefinitions, newData.fieldDefinitions));
        if (prev.automations !== newData.automations) settingsSaves.push(saveAutomations(locationId, prev.automations, newData.automations));
        if (prev.runCardTemplates !== newData.runCardTemplates || prev.runCardConfig !== newData.runCardConfig) {
          settingsSaves.push(saveRunCardTemplates(locationId, prev.runCardTemplates, newData.runCardTemplates, prev.runCardConfig, newData.runCardConfig));
        }
        if (prev.attendanceRoster !== newData.attendanceRoster || prev.attendanceEntries !== newData.attendanceEntries) {
          settingsSaves.push(saveAttendance(locationId, prev.attendanceRoster, newData.attendanceRoster, prev.attendanceEntries, newData.attendanceEntries));
        }
        if (prev.paymentRules !== newData.paymentRules) settingsSaves.push(savePaymentRules(locationId, prev.paymentRules, newData.paymentRules));
        if (prev.taskTemplates !== newData.taskTemplates) settingsSaves.push(saveTaskTemplates(locationId, prev.taskTemplates, newData.taskTemplates));
        if (prev.checklists !== newData.checklists) settingsSaves.push(saveChecklists(locationId, prev.checklists, newData.checklists));
        if (prev.dropdownOptions !== newData.dropdownOptions) settingsSaves.push(saveDropdownOptions(locationId, prev.dropdownOptions, newData.dropdownOptions));
        // Newly migrated settings saves
        if (prev.facilitySettings !== newData.facilitySettings) settingsSaves.push(saveFacilitySettings(locationId, prev.facilitySettings, newData.facilitySettings));
        if (prev.resortInfo !== newData.resortInfo) settingsSaves.push(saveResortInfo(locationId, prev.resortInfo, newData.resortInfo));
        if (prev.massTextHistory !== newData.massTextHistory) settingsSaves.push(saveMassTextHistory(locationId, prev.massTextHistory, newData.massTextHistory));
        if (prev.pendingInvites !== newData.pendingInvites) settingsSaves.push(savePendingInvites(locationId, prev.pendingInvites, newData.pendingInvites));
        if (prev.attendanceAuditLog !== newData.attendanceAuditLog) settingsSaves.push(saveAttendanceAuditLog(locationId, prev.attendanceAuditLog, newData.attendanceAuditLog));
        if (prev.questionnaires !== newData.questionnaires) settingsSaves.push(saveQuestionnaires(locationId, prev.questionnaires, newData.questionnaires));

        if (settingsSaves.length > 0) await Promise.all(settingsSaves);

        // FR.5: Historical versioning — snapshot settings when they change
        const VERSIONED_KEYS = ['pricing', 'rooms', 'requiredVaccines', 'eodTemplate', 'facilitySettings', 'resortPolicies', 'closedDates'];
        const historyInserts = [];
        for (const key of VERSIONED_KEYS) {
          if (prev[key] !== newData[key] && prev[key] != null) {
            historyInserts.push({
              id: crypto.randomUUID(),
              location_id: locationId,
              setting_key: key,
              snapshot: JSON.stringify(prev[key]),
              changed_at: new Date().toISOString(),
              changed_by: profile?.full_name || profile?.email || 'system',
            });
          }
        }
        if (historyInserts.length > 0) {
          supabase.from('settings_history').insert(historyInserts)
            .then(({ error }) => { if (error) console.error('Settings history:', error.message); });
        }

        // ── Client child table saves (lifecycle events, agreement signings, questionnaire responses) ──
        const clientChildSaves = [];
        clientChildSaves.push(saveLifecycleEvents(locationId, prev.clients, newData.clients));
        clientChildSaves.push(saveAgreementSignings(locationId, prev.clients, newData.clients));
        clientChildSaves.push(saveQuestionnaireResponses(locationId, prev.clients, newData.clients));
        // Outbound links (3.6)
        if (prev.outboundLinks !== newData.outboundLinks) {
          clientChildSaves.push(saveOutboundLinks(locationId, prev.outboundLinks, newData.outboundLinks));
        }
        if (clientChildSaves.length > 0) await Promise.all(clientChildSaves);

      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        savingRef.current = false;
      }
    }, 300);
  }, [locationId]);

  return { data, loading, save, locationId, loadError, isEmpty };
}
