// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// ─── K9 Operations Lean App ─────────────────────────────────────────────────
// Bolt-on modules for Gingr: Customer Lifecycle, Operations Hub, Photos.
// This app reads from Gingr's API using credentials stored per-location.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";

// ─── Color palette (matches POS brand) ──────────────────────────────────────
const C = {
  bg: "#F5F6F8", surface: "#FFFFFF", surfaceHover: "#EEF0F4",
  border: "#DFE2E8", borderLight: "#ECEEF2",
  text: "#1A1D23", textSec: "#5A6170", textMut: "#959BA8",
  pri: "#003462", priL: "#0A4D8A", priLt: "#E6EEF6",
  acc: "#AF8D54", accLt: "#F5EDD8", accDk: "#8B6F3C",
  suc: "#0D7A56", sucLt: "#ECFDF5", warn: "#C4720C", warnLt: "#FFFBEB",
  dan: "#C42B2B", danLt: "#FEF2F2", info: "#1A5EC4", infoLt: "#EFF6FF",
};

const ROOM_TYPES = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];

// K9 Logo reference
const K9_LOGO_SRC = "/k9-logo.png";

// ─── Navigation Config ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Lifecycle" },
  { id: "ops-hub", label: "Operations Hub", icon: "OpsHub" },
  { id: "photos", label: "Photos", icon: "Photos" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

// ─── Default Checklist Templates ────────────────────────────────────────────
const DEF_OPENING_TEMPLATE = [
  { id: "o1", label: "Check security cameras", time: "06:00" },
  { id: "o2", label: "Unlock front doors", time: "06:00" },
  { id: "o3", label: "Turn on all lights", time: "06:15" },
  { id: "o4", label: "Check HVAC systems", time: "06:15" },
  { id: "o5", label: "Review overnight camera footage", time: "06:30" },
  { id: "o6", label: "Check on all boarding dogs - water, food, bedding", time: "06:30" },
  { id: "o7", label: "Prepare daycare play areas", time: "06:45" },
  { id: "o8", label: "Review today's reservations and schedule", time: "07:00" },
  { id: "o9", label: "Prepare check-in packets", time: "07:00" },
  { id: "o10", label: "Open register / POS", time: "07:00" },
];

const DEF_FE_TEMPLATE = [
  { id: "fe1", label: "Wipe down front desk and lobby surfaces", time: "08:00" },
  { id: "fe2", label: "Restock retail display", time: "08:30" },
  { id: "fe3", label: "Check bathroom supplies", time: "09:00" },
  { id: "fe4", label: "Process morning check-ins", time: "09:00" },
  { id: "fe5", label: "Confirm afternoon appointments", time: "10:00" },
  { id: "fe6", label: "Process package sales and payments", time: "11:00" },
  { id: "fe7", label: "Lunch coverage handoff", time: "12:00" },
  { id: "fe8", label: "Wednesday: Update social media", dayOfWeek: 3 },
  { id: "fe9", label: "Friday: Print weekend schedules", dayOfWeek: 5 },
];

const DEF_BE_TEMPLATE = [
  { id: "be1", label: "Morning feeding - breakfast", time: "07:00" },
  { id: "be2", label: "Administer morning medications", time: "07:30" },
  { id: "be3", label: "Move daycare dogs to play areas", time: "08:00" },
  { id: "be4", label: "First private play sessions", time: "09:00" },
  { id: "be5", label: "Mid-morning enrichment activities", time: "10:00" },
  { id: "be6", label: "Noon feeding", time: "12:00" },
  { id: "be7", label: "Afternoon medications", time: "12:30" },
  { id: "be8", label: "Afternoon private play sessions", time: "14:00" },
  { id: "be9", label: "Evening feeding - dinner", time: "17:00" },
  { id: "be10", label: "Final medications check", time: "17:30" },
];

const DEF_CLOSING_TEMPLATE = [
  { id: "ct1", label: "Complete all pending check-outs" },
  { id: "ct2", label: "Run end-of-day financial report" },
  { id: "ct3", label: "Ensure all dogs have fresh water" },
  { id: "ct4", label: "Final room inspection - all dogs settled" },
  { id: "ct5", label: "Clean and sanitize all play areas" },
  { id: "ct6", label: "Restock supplies for tomorrow" },
  { id: "ct7", label: "Lock all medication cabinets" },
  { id: "ct8", label: "Set up overnight camera monitoring" },
  { id: "ct9", label: "Process any pending payments" },
  { id: "ct10", label: "Lock appropriate exterior doors" },
  { id: "ct11", label: "Set alarm and lock front doors" },
];


// ─── Icons Object (from POS App) ────────────────────────────────────────────
const I = {
  Dashboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Users: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Calendar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  FileText: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ChevronRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  ChevronDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Back: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  X: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Edit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  CheckCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  XCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  Sparkle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>,
  Phone: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Menu: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Tag: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  BarChart: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  LogIn: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Clock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  SortAsc: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12l7-7 7 7"/></svg>,
  SortDesc: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>,
  SortNone: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"><path d="M12 5v14"/><path d="M8 9l4-4 4 4"/><path d="M8 15l4 4 4-4"/></svg>,
  VaxOk: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/><path d="m9 15 2 2 4-4"/></svg>,
  VaxBad: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/><line x1="10" y1="13" x2="14" y2="17"/><line x1="14" y1="13" x2="10" y2="17"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>,
  MessageSquare: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  DollarSign: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Send: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  CreditCard: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  RefreshCw: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  AlertTriangle: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  InfoCircle: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  ShoppingCart: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  GraduationCap: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 0 3 3 6 3s6-3 6-3v-5"/></svg>,
};
const Icons = I;

// K9 Resorts Official Dog Logo (PNG from brand assets)
const K9_LOGO_PNG = "data:image/png;base64,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";

const K9Logo = ({size=38}) => <img src={K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;
const K9LogoMini = ({size=28}) => <img src={K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;

// K9 Resorts Locations
const K9_LOCATIONS = [
  { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
  { id: "demo", name: "Demo", slug: "demo" },
];

// ─── POS Base Path ──────────────────────────────────────────────────────────
// All POS routes live under /pos. This constant is prepended by buildUrl()
// and stripped by parseUrl() so the rest of the app is unaware of the prefix.
const POS_BASE = "/pos";

// ─── URL Routing ────────────────────────────────────────────────────────────
const PAGE_SLUGS = {
  dashboard:"dashboard", reservations:"lodging", clients:"lifecycle", "client-detail":"client", "dog-detail":"dog",
  "new-client":"new-client", "new-dog":"new-dog", "new-reservation":"new-reservation", "unified-new":"new",
  messages:"messages", payments:"payments", operations:"operations",
  "ops-opening":"ops/opening", "ops-fe":"ops/front-end", "ops-be":"ops/back-end", "ops-rooms":"ops/rooms",
  "ops-pictures":"ops/pictures", "ops-pp":"ops/private-play", "ops-closing":"ops/closing",
  management:"management", "mgmt-attendance":"management/attendance", "mgmt-audit-log":"management/audit-log",
  eod:"eod", ai:"ai", settings:"settings", "evaluation-form":"evaluation", "online-bookings":"bookings",
  "settings-team":"settings/team-management", "settings-roles":"settings/roles",
  "settings-fields":"settings/fields", "settings-tags":"settings/tags", "settings-vaccines":"settings/vaccines",
  "settings-agreements":"settings/agreements", "settings-questionnaire":"settings/questionnaire",
  "settings-pricing":"settings/pricing", "settings-packages":"settings/packages", "settings-discounts":"settings/discounts", "settings-dropdowns":"settings/dropdowns",
  "settings-eod":"settings/eod", "settings-daily-ops":"settings/daily-ops", "settings-run-card":"settings/run-card",
  "settings-resort-info":"settings/resort-info", "settings-facility":"settings/facility", "settings-rooms":"settings/rooms",
  "settings-closed-dates":"settings/closed-dates", "settings-policies":"settings/policies", "settings-compliance-rules":"settings/compliance-rules",
  "settings-booking-settings":"settings/booking-settings", "settings-vets":"settings/vets",
  "settings-legal":"settings/legal", "settings-hotkeys":"settings/hotkeys", "settings-reset":"settings/reset",
  "enterprise-locations":"locations", "enterprise-operations":"oversight", "enterprise-packages":"packages", "enterprise-users":"users", "enterprise-management":"management",
};
const SLUG_TO_PAGE = {};
Object.entries(PAGE_SLUGS).forEach(([k,v]) => { if (!k.startsWith("enterprise-")) SLUG_TO_PAGE[v] = k; });
const ENT_SLUG_TO_PAGE = { locations:"enterprise-locations", oversight:"enterprise-operations", packages:"enterprise-packages", users:"enterprise-users", management:"enterprise-management" };

function buildUrl(locSlug, pg, prms, dataRef) {
  const slug = PAGE_SLUGS[pg] || pg;
  if (locSlug === "enterprise") return `${POS_BASE}/enterprise/${slug}`;
  if (pg === "client-detail" && prms?.clientId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone) return `${POS_BASE}/${locSlug}/client/${phone}`;
  }
  if (pg === "dog-detail" && prms?.clientId && prms?.dogId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const d = (dataRef.dogs||[]).find(dg => dg.id === prms.dogId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone && d) return `${POS_BASE}/${locSlug}/client/${phone}/${encodeURIComponent((d.fields?.name||"dog").toLowerCase())}`;
  }
  return `${POS_BASE}/${locSlug}/${slug}`;
}

function parseUrl(pathname, dataRef) {
  // Strip the POS base prefix before parsing
  let cleanPath = pathname;
  if (cleanPath.startsWith(POS_BASE)) cleanPath = cleanPath.slice(POS_BASE.length) || "/";
  const parts = cleanPath.replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
  if (parts.length === 0) return { locSlug: "demo", page: "dashboard", params: {} };
  const locSlug = parts[0];
  if (locSlug === "enterprise") {
    const epSlug = parts.slice(1).join("/") || "locations";
    const pg = ENT_SLUG_TO_PAGE[epSlug] || "enterprise-locations";
    return { locSlug: "enterprise", page: pg, params: {} };
  }
  if (parts.length === 1) return { locSlug, page: "dashboard", params: {} };
  // Client detail: /demo/client/5551234567
  if (parts[1] === "client" && parts[2]) {
    const phone = parts[2];
    if (parts[3] && dataRef) {
      // Dog detail: /demo/client/5551234567/duke
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) {
        const dogName = decodeURIComponent(parts[3]).toLowerCase();
        const dogs = (dataRef.dogs||[]).filter(d => d.fields?.owner_id === c.id || (dataRef.reservations||[]).some(r => r.clientId === c.id && r.dogId === d.id));
        const dog = dogs.find(d => (d.fields?.name||"").toLowerCase() === dogName) || dogs[0];
        if (dog) return { locSlug, page: "dog-detail", params: { clientId: c.id, dogId: dog.id } };
      }
    }
    if (dataRef) {
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) return { locSlug, page: "client-detail", params: { clientId: c.id } };
    }
    return { locSlug, page: "clients", params: {} };
  }
  const pgSlug = parts.slice(1).join("/");
  const pg = SLUG_TO_PAGE[pgSlug] || "dashboard";
  return { locSlug, page: pg, params: {} };
}

function LocationSelector({ currentLocation, onLocationChange, collapsed, allLocations, profile }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const dropRef = useRef(null);
  const btnRef = useRef(null);
  const locs = allLocations || K9_LOCATIONS;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [open]);

  const current = locs.find(l => l.id === currentLocation) || locs[1] || locs[0];
  const isEnterprise = current?.isEnterprise;
  const locations = locs.filter(l => !l.isEnterprise);

  if (collapsed) {
    return (
      <div style={{ padding: "0 4px", width: "100%" }}>
        <button onClick={() => setOpen(!open)} title={current.name}
          style={{ width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "0", borderRadius: 10, border: "1.5px solid rgba(175,141,84,0.2)", background: isEnterprise ? "rgba(175,141,84,0.15)" : "rgba(255,255,255,0.06)", cursor: "pointer", color: C.acc, fontSize: 11, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box" }}>
          {isEnterprise ? "\u2605" : current.name.slice(0, 2).toUpperCase()}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px", position: "relative", width: "100%" }}>
      <button ref={btnRef} onClick={() => setOpen(!open)}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderRadius: 10, border: "1.5px solid rgba(175,141,84,0.2)", background: isEnterprise ? "rgba(175,141,84,0.12)" : "rgba(255,255,255,0.06)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxSizing: "border-box" }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: isEnterprise ? "rgba(175,141,84,0.25)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.acc, flexShrink: 0 }}>
          {isEnterprise ? "\u2605" : current.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current.name}</div>
          <div style={{ fontSize: 9, color: "rgba(175,141,84,0.6)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isEnterprise ? "All Locations" : "Location"}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(175,141,84,0.5)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width || 212, zIndex: 9999, background: "#1a2940", border: "1.5px solid rgba(175,141,84,0.25)", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.4)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 6px" }}>
            {/* Enterprise — only for owner/enterprise_admin */}
            {profile?.role && (profile.role === 'owner' || profile.role === 'enterprise_admin') && (<>
            <button onClick={() => { onLocationChange("enterprise"); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === "enterprise" ? "rgba(175,141,84,0.2)" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginBottom: 2 }}
              onMouseEnter={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = "transparent"; }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(175,141,84,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.acc }}>{"\u2605"}</span>
              </div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.acc }}>Enterprise</div>
                <div style={{ fontSize: 9, color: "rgba(175,141,84,0.5)", textTransform: "uppercase" }}>All Locations</div>
              </div>
              {currentLocation === "enterprise" && <span style={{ color: C.acc }}><I.Check/></span>}
            </button>

            <div style={{ margin: "4px 10px", height: 1, background: "rgba(175,141,84,0.12)" }}/>
            </>)}

            {/* Location list */}
            {locations.map(loc => (
              <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === loc.id ? "rgba(175,141,84,0.2)" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                onMouseEnter={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: currentLocation === loc.id ? "#fff" : "rgba(255,255,255,0.7)" }}>{loc.name}</div>
                </div>
                {currentLocation === loc.id && <span style={{ color: C.acc }}><I.Check/></span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Functions ──────────────────────────────────────────────────────
const gid = () => crypto.randomUUID();
function formatDogNames(dogs) {
  const names = dogs.map(d => d.fields?.name || "your dog").filter(Boolean);
  if (names.length === 0) return "your dog";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}
const titleCase = (s) => (s || "").replace(/\b\w/g, c => c.toUpperCase());
const fmtPhone = (p) => { const d = (p||"").replace(/\D/g,""); return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:p||""; };
const fmtDate = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); };
const fmtDateFull = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
const fmtDateShort = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${String(dt.getFullYear()).slice(2)}`; };
function fmtPhoneInput(val) { const d = (val || '').replace(/\D/g, '').slice(0, 10); if (d.length === 0) return ''; if (d.length <= 3) return `(${d}`; if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`; return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; }
const fmtTime = (t) => { if(!t) return ""; const [h,m] = t.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2,"0")} ${ampm}`; };
const fmtInstr = (v) => Array.isArray(v) ? v.join(", ") : (v || "");

const todayStr = () => { const d = (window.__K9_TIME_TRAVEL__ ? new Date(window.__K9_TIME_TRAVEL__ + "T12:00:00") : new Date()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const addDays = (d, n) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]; };
const formatTime12hr = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); if (isNaN(h)) return t; const suffix = h >= 12 ? "PM" : "AM"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m || 0).padStart(2, "0")} ${suffix}`; };

// ─── Operations Constants ──────────────────────────────────────────────────
const OPS_TYPES = {opening:{key:"openingTemplate",def:DEF_OPENING_TEMPLATE,title:"Opening Checklist"},fe:{key:"feTemplate",def:DEF_FE_TEMPLATE,title:"Front-End Checklist",showTime:true},be:{key:"beTemplate",def:DEF_BE_TEMPLATE,title:"Back-End Checklist",showTime:true},closing:{key:"closingTemplate",def:DEF_CLOSING_TEMPLATE,title:"Closing Checklist"},room_cleaning:{title:"Room Cleaning"},pictures:{title:"Picture Checklist"},pp:{title:"Private Play Checklist"}};
const DAY_NAMES_SHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const OPERATIONS_CATALOG = [
  // Daily items (route to existing pages)
  { id:"ops-opening", label:"Opening Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"opening", routeTo:"ops-opening", permission:"view_daily_ops" },
  { id:"ops-fe", label:"Front-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"fe", routeTo:"ops-fe", permission:"view_daily_ops" },
  { id:"ops-be", label:"Back-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"be", routeTo:"ops-be", permission:"view_daily_ops" },
  { id:"ops-rooms", label:"Room Cleaning", frequency:"daily", dataKey:"dailyOps", typeSub:"room_cleaning", routeTo:"ops-rooms", permission:"view_daily_ops" },
  { id:"ops-pictures", label:"Pictures", frequency:"daily", dataKey:"dailyOps", typeSub:"pictures", routeTo:"ops-pictures", permission:"view_daily_ops" },
  { id:"ops-pp", label:"Private Play Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"pp", routeTo:"ops-pp", permission:"view_daily_ops" },
  { id:"ops-closing", label:"Closing Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"closing", routeTo:"ops-closing", permission:"view_daily_ops" },
  { id:"eod", label:"EOD Report", frequency:"daily", dataKey:"eodEntries", typeSub:null, routeTo:"eod", permission:"view_eod" },
  // Weekly placeholders
  { id:"weekly-inventory", label:"Weekly Inventory", frequency:"weekly", comingSoon:true },
  { id:"weekly-maintenance", label:"Weekly Maintenance", frequency:"weekly", comingSoon:true },
  // Monthly placeholders
  { id:"monthly-safety", label:"Monthly Safety Audit", frequency:"monthly", comingSoon:true },
  { id:"monthly-deep-clean", label:"Monthly Deep Clean", frequency:"monthly", comingSoon:true },
];
const DEFAULT_LIFECYCLE_BANNERS = {
  conversion: "Leads auto-feed here after an Eval or Tour with no booking (+1 day follow-up). Log each outreach attempt, set the next follow-up date, and mark leads as Cold when they stop responding.",
  active: "Active customers have a booking history and either have an upcoming reservation or visited recently. Clients move here automatically when they book or pay for the first time.",
  retention: "Clients lapse here when they have no upcoming reservation and haven't visited within the configurable threshold (see Settings → Resort Policies). Booking a new appointment automatically moves them back to Active.",
  cold: "Leads or lapsed clients you've manually marked as Cold. Click Revive to re-engage — you'll be prompted to log a note and set a new follow-up, and the client will return to Conversion or Retention based on their history.",
  all: "Aggregate view of every client record regardless of lifecycle stage. Use the search bar or column headers to sort and find any client quickly.",
};

// ═══════════════════════════════════════════════════════════════════════════
const LC_FILTER_FIELDS = [
  { section:"Client Info", key:"firstName", label:"First Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"lastName", label:"Last Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"phone", label:"Phone", type:"text", ops:["contains","equals","empty","notEmpty"] },
  { section:"Client Info", key:"dogCount", label:"Dogs", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Activity", key:"totalRes", label:"Total Reservations", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Activity", key:"lastRes", label:"Last Visit", type:"date", ops:["after","before","inLastDays"] },
  { section:"Activity", key:"daysSince", label:"Days Since Visit", type:"number", ops:[">=","<=",">","<","="] },
  { section:"Activity", key:"totalSpent", label:"Total Spent ($)", type:"currency", ops:[">=","<=",">","<","="] },
  { section:"Activity", key:"nextRes", label:"Next Reservation", type:"presence", ops:["has","missing"] },
  { section:"Services", key:"daycare", label:"Daycare Visits", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"boarding", label:"Boarding Visits", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"eval", label:"Evaluations", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"postEval", label:"Post-Eval Appts", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"tours", label:"Tours", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"postTour", label:"Post-Tour Appts", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Lifecycle", key:"stage", label:"Stage", type:"select", ops:["is","isNot"], options:["conversion","active","retention","cold"] },
  { section:"Lifecycle", key:"source", label:"Source", type:"select", ops:["is","isNot"], options:["eval","tour","manual","ignite",""] },
  { section:"Lifecycle", key:"followUp", label:"Follow-Up", type:"followUpStatus", ops:["overdue","today","thisWeek","hasDate","noDate"] },
];
const LC_OP_LABELS = {"contains":"contains","equals":"equals","starts":"starts with","empty":"is empty","notEmpty":"not empty","=":"=",">=":"≥","<=":"≤",">":">","<":"<","after":"after","before":"before","inLastDays":"in last X days","has":"has","missing":"doesn't have","is":"is","isNot":"is not","overdue":"overdue","today":"today","thisWeek":"this week","hasDate":"has date","noDate":"no date"};

// ─── Operations Stats Helpers ──────────────────────────────────────────────
function getRoomCleaningStats(data, date) {
  const td = date || todayStr();
  const allRooms = data.rooms || {};
  const reservations = data.reservations || [];
  const boardingToday = reservations.filter(r => r.type === "boarding" && r.checkIn <= td && r.checkOut >= td && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === td && r.status === "checked-out");
  let totalNeeded = 0, totalDone = 0;
  const entryId = `ops_room_cleaning_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  ROOM_TYPES.forEach(rt => {
    (allRooms[rt] || []).forEach(rm => {
      const activeRes = boardingToday.find(r => r.room === rm);
      const coRes = boardingCheckedOut.find(r => r.room === rm);
      const notFirst = activeRes && activeRes.checkIn < td;
      const notLast = activeRes && activeRes.checkOut > td;
      const needsRefresh = !!(activeRes && notFirst && notLast);
      const needsDisinfect = !!coRes;
      if (needsRefresh) { totalNeeded++; if (ei[rm] && ei[rm].refresh) totalDone++; }
      if (needsDisinfect) { totalNeeded++; if (ei[rm] && ei[rm].disinfect) totalDone++; }
    });
  });
  return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone };
}


function getPPStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_pp_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  // Count PP dogs for this date
  const reservations = data.reservations || [];
  const dogs = data.dogs || [];
  const ppDogIds = new Set();
  reservations.forEach(r => { if (r.type === "evaluation" && r.evalResult === "passed_private") ppDogIds.add(r.dogId); });
  dogs.forEach(d => { if ((d.tags || []).includes("tag_pp")) ppDogIds.add(d.id); });
  const ppRes = reservations.filter(r => (r.type === "boarding" || r.type === "daycare") && r.status === "checked-in" && r.checkIn <= td && r.checkOut >= td && ppDogIds.has(r.dogId));
  const totalDogs = ppRes.length;
  const requiredSessions = totalDogs * 3; // 3 required let-outs per dog
  let completedSessions = 0;
  let totalLogged = 0;
  Object.values(ei).forEach(d => {
    if (d && d.sessions) {
      d.sessions.forEach((s, si) => {
        if (s.time || s.urinate || s.defecate) {
          totalLogged++;
          if (si < 3) completedSessions++; // only first 3 count toward required
        }
      });
    }
  });
  return { totalDogs, requiredSessions, completedSessions, totalLogged };
}

function getOpsCardStatus(data, item, date) {
  if (item.comingSoon) return "coming_soon";
  if (item.dataKey === "eodEntries") return "none"; // EOD is not measured
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  if (!entry) return "not_started";
  if (entry.locked) return "completed";
  const ei = entry.items;
  if (!ei) return "not_started";
  // Template checklists: check if ALL items are done
  const meta = OPS_TYPES[item.typeSub];
  if (meta && meta.key) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    if (total > 0 && checked >= total) return "completed";
    return checked > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    if (stats.totalNeeded === 0) return "not_started";
    if (stats.totalDone >= stats.totalNeeded) return "completed";
    return stats.totalDone > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    if (ppStats.requiredSessions === 0) return "not_started";
    if (ppStats.completedSessions >= ppStats.requiredSessions) return "completed";
    return ppStats.completedSessions > 0 ? "in_progress" : "not_started";
  }
  if (Array.isArray(ei)) {
    return ei.some(i => i.checked) ? "in_progress" : "not_started";
  }
  return Object.keys(ei).length > 0 ? "in_progress" : "not_started";
}


function getOpsProgress(data, item, date) {
  if (item.comingSoon) return 0;
  if (item.dataKey === "eodEntries") return 0;
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  if (!entry) return 0;
  if (entry.locked) return 100;
  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    if (total === 0) return 0;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    return Math.round((checked / total) * 100);
  }
  const ei = entry.items;
  if (!ei) return 0;
  if (item.typeSub === "pictures") {
    const vals = Object.values(ei);
    const done = vals.filter(v => v === true).length;
    return vals.length > 0 ? Math.round((done / vals.length) * 100) : 0;
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    return stats.totalNeeded > 0 ? Math.round((stats.totalDone / stats.totalNeeded) * 100) : 0;
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    return ppStats.requiredSessions > 0 ? Math.round((ppStats.completedSessions / ppStats.requiredSessions) * 100) : 0;
  }
  if (Array.isArray(ei)) {
    const total = ei.length;
    return total === 0 ? 0 : Math.round((ei.filter(i => i.checked).length / total) * 100);
  }
  const keys = Object.keys(ei);
  return keys.length > 0 ? 50 : 0;
}


function getOpsCountLabel(data, item, date) {
  if (item.comingSoon) return "";
  if (item.dataKey === "eodEntries") return "";
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    if (!entry) return `0/${total} tasks`;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    return `${checked}/${total} tasks`;
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    if (stats.totalNeeded === 0) return "No rooms to clean";
    return `${stats.totalDone}/${stats.totalNeeded} rooms`;
  }
  if (item.typeSub === "pictures") {
    if (!entry || !entry.items) return "0 photos";
    const ei = entry.items;
    const done = Object.values(ei).filter(v => v === true).length;
    const total = Object.keys(ei).length;
    return `${done}/${total} photos`;
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    if (ppStats.requiredSessions === 0) return "No PP dogs";
    return `${ppStats.completedSessions}/${ppStats.requiredSessions} required · ${ppStats.totalLogged} total`;
  }
  return "";
}

// ─── Default Field Configs ──────────────────────────────────────────────────
const DEF_CLIENT_FIELDS = [
  { id:"phone",name:"Phone Number",type:"tel",requiredFor:["create"],isKey:true,locked:true,order:0 },
  { id:"first_name",name:"First Name",type:"text",requiredFor:["tour"],locked:false,order:1 },
];

// ─── Shared UI Components (from POS App) ───────────────────────────────────

// Tip component
function Tip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  if (!text) return children;
  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
    setShow(true);
  };
  return (
    <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} style={{ display: "inline-flex", cursor: "default" }}>
      {children}
      {show && <div style={{ position: "fixed", left: pos.x, top: pos.y - 6, transform: "translate(-50%, -100%)", padding: "6px 12px", borderRadius: 8, background: "#1a1a2e", color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: 1.5, whiteSpace: "pre-line", maxWidth: 340, zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", letterSpacing: "0.01em" }}>
        {text}
        <div style={{ position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1a1a2e" }} />
      </div>}
    </span>
  );
}


function Badge({children,color="default",size="sm",tip}) {
  const cm={default:{bg:C.surfaceHover,text:C.textSec},primary:{bg:C.priLt,text:C.pri},success:{bg:C.sucLt,text:C.suc},warning:{bg:C.warnLt,text:C.warn},danger:{bg:C.danLt,text:C.dan},info:{bg:C.infoLt,text:C.info},accent:{bg:C.accLt,text:C.accDk}};
  const s=cm[color]||cm.default;
  const el = <span style={{display:"inline-flex",alignItems:"center",padding:size==="sm"?"2px 10px":"4px 14px",borderRadius:20,fontSize:size==="sm"?11:13,fontWeight:600,background:s.bg,color:s.text,letterSpacing:"0.01em",whiteSpace:"nowrap"}}>{children}</span>;
  return tip ? <Tip text={tip}>{el}</Tip> : el;
}

function Btn({children,variant="primary",size="md",onClick,disabled,style={},icon}) {
  const base={display:"inline-flex",alignItems:"center",gap:6,border:"none",cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontFamily:"inherit",borderRadius:10,transition:"all 0.15s",opacity:disabled?0.5:1,letterSpacing:"0.01em"};
  const sz={sm:{padding:"6px 14px",fontSize:13},md:{padding:"10px 20px",fontSize:14},lg:{padding:"12px 24px",fontSize:15}};
  const vr={primary:{background:C.pri,color:"#fff"},accent:{background:C.acc,color:"#fff"},secondary:{background:C.surfaceHover,color:C.text,border:`1px solid ${C.border}`},ghost:{background:"transparent",color:C.textSec},danger:{background:C.danLt,color:C.dan},success:{background:C.suc,color:"#fff"}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...sz[size],...vr[variant],...style}}>{icon&&icon}{children}</button>;
}


function CustomSelect({ value, onChange, options, placeholder, disabled, style: extraStyle, small }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  // Scroll to selected item when opening
  useEffect(() => { if (open && listRef.current && value) { const el = listRef.current.querySelector(`[data-val="${CSS.escape ? CSS.escape(value) : value}"]`); if (el) el.scrollIntoView({ block: "nearest" }); } }, [open]);
  const opts = (options || []).map(o => typeof o === "string" ? { value: o, label: o } : o);
  const selected = opts.find(o => o.value === value);
  const sz = small ? { padding: "6px 10px", fontSize: 12, borderRadius: 8 } : { padding: "10px 14px", fontSize: 14, borderRadius: 10 };
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", ...extraStyle }}>
      <button type="button" onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ width: "100%", ...sz, border: `1.5px solid ${open ? C.pri : C.border}`, fontFamily: "inherit", color: selected ? C.text : C.textMut, background: disabled ? C.bg : C.surface, cursor: disabled ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, transition: "border 0.15s", outline: "none", boxSizing: "border-box", fontWeight: selected ? 500 : 400, ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{selected ? selected.label : (placeholder || "Select...")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div ref={listRef} onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
          {/* Empty option */}
          <button type="button" data-val="" onClick={() => { onChange(""); setOpen(false); }}
            style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: value === "" ? C.priLt : "transparent", color: C.textMut, fontSize: small ? 12 : 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
            onMouseEnter={e => { if (value !== "") e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { if (value !== "") e.currentTarget.style.background = "transparent"; }}>
            <span style={{ color: C.textMut, fontStyle: "italic" }}>{placeholder || "Select..."}</span>
          </button>
          {opts.filter(o => o.value !== "").map(o => {
            const isSel = o.value === value;
            return (
              <button type="button" key={o.value} data-val={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : C.text, fontSize: small ? 12 : 13, fontWeight: isSel ? 700 : 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                {isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                <span>{o.label}</span>
              </button>
            );
          })}
          {opts.length === 0 && <div style={{ padding: "12px 16px", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No options available</div>}
        </div>
      )}
    </div>
  );
}

// ─── Mini Date Picker — compact inline date picker with calendar popup ───

function MiniDatePicker({ value, onChange, style: extraStyle, min, max, disabled, placeholder, recommendedDate, recommendedHint }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const ref = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [vMonth, setVMonth] = useState(parsed.getMonth());
  const [vYear, setVYear] = useState(parsed.getFullYear());
  const [yrPage, setYrPage] = useState(Math.floor(parsed.getFullYear() / 12) * 12);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  useEffect(() => { if (open) { setView("days"); if (value) { const d = new Date(value + "T12:00:00"); setVMonth(d.getMonth()); setVYear(d.getFullYear()); setYrPage(Math.floor(d.getFullYear() / 12) * 12); } } }, [open]);
  const days = useMemo(() => { const first = new Date(vYear, vMonth, 1); const sd = first.getDay(); const dim = new Date(vYear, vMonth + 1, 0).getDate(); const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c; }, [vMonth, vYear]);
  const ml = new Date(vYear, vMonth).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prev = () => { if (view === "years") setYrPage(p => p - 12); else if (view === "months") setVYear(y => y - 1); else { if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); } else setVMonth(m => m - 1); } };
  const next = () => { if (view === "years") setYrPage(p => p + 12); else if (view === "months") setVYear(y => y + 1); else { if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); } else setVMonth(m => m + 1); } };
  const pick = (day) => { const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); onChange(`${vYear}-${m}-${d}`); setOpen(false); };
  const display = value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const td = new Date().toISOString().slice(0, 10);
  const headerLabel = view === "years" ? `${yrPage} \u2013 ${yrPage + 11}` : view === "months" ? String(vYear) : ml;
  const headerClick = () => { if (view === "days") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } else if (view === "months") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } };
  const navBtn = { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 };
  const curYr = new Date().getFullYear(); const curMo = new Date().getMonth();
  const selYr = value ? new Date(value + "T12:00:00").getFullYear() : -1;
  const selMo = value ? new Date(value + "T12:00:00").getMonth() : -1;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...extraStyle }}>
      <button type="button" onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${open ? C.pri : C.border}`, fontSize: 11, fontFamily: "inherit", color: value ? C.text : C.textMut, background: disabled ? C.bg : C.surface, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5, transition: "border 0.15s", outline: "none", fontWeight: 600, whiteSpace: "nowrap", ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        {display || (placeholder || "Pick date")}
        {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(""); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 7, background: C.bg, color: C.textMut, fontSize: 10, cursor: "pointer", lineHeight: 1, flexShrink: 0, marginLeft: 2 }} onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textMut; }}>×</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 14, width: 260 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={prev} style={navBtn}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span onClick={headerClick} style={{ fontSize: 12, fontWeight: 700, color: C.text, cursor: view !== "years" ? "pointer" : "default", padding: "2px 6px", borderRadius: 5, transition: "background 0.15s" }} onMouseEnter={e => { if (view !== "years") e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{headerLabel}</span>
            <button onClick={next} style={navBtn}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          {view === "years" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {Array.from({ length: 12 }, (_, i) => yrPage + i).map(yr => { const isSel = yr === selYr; const isCur = yr === curYr; return (
                <button key={yr} onClick={() => { setVYear(yr); setView("months"); }} style={{ padding: "8px 0", borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isCur ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 11, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{yr}</button>
              ); })}
            </div>
          )}
          {view === "months" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {MONTHS_SHORT.map((mn, i) => { const isSel = i === selMo && vYear === selYr; const isCur = i === curMo && vYear === curYr; return (
                <button key={mn} onClick={() => { setVMonth(i); setView("days"); }} style={{ padding: "8px 0", borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isCur ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 11, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{mn}</button>
              ); })}
            </div>
          )}
          {view === "days" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 2 }}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 9, fontWeight: 700, color: C.textMut, padding: "2px 0" }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 1 }}>
            {days.map((day, i) => { if (day === null) return <div key={`e${i}`} />; const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); const ds = `${vYear}-${m}-${d}`; const isSel = ds === value; const isToday = ds === td; const isRec = ds === recommendedDate; const isDis = (min && ds < min) || (max && ds > max); return (
              <button key={i} onClick={() => !isDis && pick(day)} style={{ width: 30, height: 30, borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isRec ? `2px solid ${C.suc}` : isToday ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : isRec ? `${C.suc}12` : "transparent", color: isDis ? C.border : isSel ? C.pri : isRec ? C.suc : isToday ? C.acc : C.text, fontSize: 12, fontWeight: isSel || isToday || isRec ? 700 : 500, cursor: isDis ? "default" : "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", opacity: isDis ? 0.35 : 1 }} onMouseEnter={e => { if (!isSel && !isDis) e.currentTarget.style.background = isRec ? `${C.suc}20` : C.bg; }} onMouseLeave={e => { if (!isSel && !isDis) e.currentTarget.style.background = isRec ? `${C.suc}12` : "transparent"; }}>{day}</button>
            ); })}
          </div>
          {recommendedHint && <div style={{marginTop:8,padding:"6px 10px",borderRadius:8,background:`${C.suc}10`,border:`1px solid ${C.suc}30`,fontSize:10,color:C.suc,fontWeight:600,lineHeight:1.4}}>{recommendedHint}</div>}
          </>}
        </div>
      )}
    </div>
  );
}

// Stable compliance CheckItem — defined at module level so React doesn't unmount/remount on every render
function ComplianceCheckItem({ok, warn, label, detail, expandKey, expanded, onToggle, children}) {
  return (
    <div style={{flex:"1 1 0",minWidth:0}}>
      <button onClick={()=>onToggle(expandKey)} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${ok?C.suc+"60":warn?C.acc+"60":C.dan+"60"}`,background:ok?C.suc+"12":warn?C.acc+"12":C.dan+"12",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>{ok?"✓":warn?"⚠":"✗"}</span>
          <span style={{fontSize:12,fontWeight:700,color:ok?C.suc:warn?C.acc:C.dan}}>{label}</span>
          <span style={{fontSize:9,color:C.textMut,marginLeft:"auto"}}>{expanded?"▲":"▼"}</span>
        </div>
        <div style={{fontSize:10,color:C.textSec,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
      </button>
      {expanded&&children&&<div style={{marginTop:6,padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface}}>{children}</div>}
    </div>
  );
}

function Inp({label,value,onChange,type="text",placeholder,required,style={},options,rows,autoFocus,disabled}) {
  const ls={display:"block",fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"};
  const dis=disabled?{opacity:0.55,pointerEvents:"none",background:C.bg}:{};
  const is={width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",transition:"border 0.15s",boxSizing:"border-box",...style,...dis};
  if(type==="select") {
    const opts = (options||[]).map(o => typeof o === "string" ? { value: o, label: o } : o);
    return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<CustomSelect value={value||""} onChange={onChange} options={opts} placeholder={placeholder||"Select..."} disabled={disabled}/></label>;
  }
  if(type==="date") {
    return <CalendarPicker label={label} value={value||""} onChange={onChange} required={required} disabled={disabled}/>;
  }
  if(type==="checkbox") return <label style={{display:"flex",alignItems:"center",gap:10,cursor:disabled?"default":"pointer",...(disabled?{opacity:0.55,pointerEvents:"none"}:{})}}><div onClick={()=>{if(!disabled)onChange(!value);}} style={{width:22,height:22,borderRadius:6,border:`2px solid ${value?C.pri:C.border}`,background:value?C.pri:"#fff",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",cursor:disabled?"default":"pointer",flexShrink:0,color:"#fff"}}>{value&&<I.Check/>}</div><span style={{fontSize:14,color:C.text}}>{label}</span></label>;
  if(type==="textarea") return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows||3} disabled={disabled} style={{...is,resize:"vertical",minHeight:70}} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/></label>;
  if(type==="tel") {
    const phoneDisplay = fmtPhoneInput(value);
    const handleTelChange = (e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 10); onChange(raw); };
    return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<input type="tel" value={phoneDisplay} onChange={handleTelChange} placeholder={placeholder||"(555) 123-4567"} disabled={disabled} style={is} autoFocus={autoFocus} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border} maxLength={14}/></label>;
  }
  return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={is} autoFocus={autoFocus} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/></label>;
}

function CalendarPicker({ label, value, onChange, required, disabled, min, max, extraContent }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [typedVal, setTypedVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [vMonth, setVMonth] = useState(parsed.getMonth());
  const [vYear, setVYear] = useState(parsed.getFullYear());
  const [yrPage, setYrPage] = useState(Math.floor(parsed.getFullYear() / 12) * 12);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  useEffect(() => { if (open) { setView("days"); if (value) { const d = new Date(value + "T12:00:00"); setVMonth(d.getMonth()); setVYear(d.getFullYear()); setYrPage(Math.floor(d.getFullYear() / 12) * 12); } } }, [open]);
  const days = useMemo(() => { const first = new Date(vYear, vMonth, 1); const sd = first.getDay(); const dim = new Date(vYear, vMonth + 1, 0).getDate(); const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c; }, [vMonth, vYear]);
  const ml = new Date(vYear, vMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prev = () => { if (view === "years") setYrPage(p => p - 12); else if (view === "months") setVYear(y => y - 1); else { if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); } else setVMonth(m => m - 1); } };
  const next = () => { if (view === "years") setYrPage(p => p + 12); else if (view === "months") setVYear(y => y + 1); else { if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); } else setVMonth(m => m + 1); } };
  const pick = (day) => { const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); onChange(`${vYear}-${m}-${d}`); setOpen(false); setIsTyping(false); };
  const display = value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";
  const td = new Date().toISOString().slice(0, 10);
  const headerLabel = view === "years" ? `${yrPage} – ${yrPage + 11}` : view === "months" ? String(vYear) : ml;
  const headerClick = () => { if (view === "days") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } else if (view === "months") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } };
  const navBtn = { width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 };
  const curYr = new Date().getFullYear(); const curMo = new Date().getMonth();
  const selYr = value ? new Date(value + "T12:00:00").getFullYear() : -1;
  const selMo = value ? new Date(value + "T12:00:00").getMonth() : -1;
  // Auto-format typed date input as MM/DD/YYYY
  const fmtTypedDate = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
  };
  const parseTypedDate = (str) => {
    const parts = str.split("/");
    if (parts.length !== 3) return null;
    const [mm, dd, yyyy] = parts;
    if (!mm || !dd || !yyyy || yyyy.length !== 4) return null;
    const m = parseInt(mm, 10); const d = parseInt(dd, 10); const y = parseInt(yyyy, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
    const dim = new Date(y, m, 0).getDate();
    if (d > dim) return null;
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  };
  const handleTypedChange = (e) => {
    const formatted = fmtTypedDate(e.target.value);
    setTypedVal(formatted);
    if (formatted.length === 10) {
      const parsed = parseTypedDate(formatted);
      if (parsed) {
        const valid = (!min || parsed >= min) && (!max || parsed <= max);
        if (valid) { onChange(parsed); const pd = new Date(parsed + "T12:00:00"); setVMonth(pd.getMonth()); setVYear(pd.getFullYear()); }
      }
    }
  };
  const handleTypedBlur = () => {
    setIsTyping(false);
    if (typedVal.length === 10) {
      const parsed = parseTypedDate(typedVal);
      if (parsed) { const valid = (!min || parsed >= min) && (!max || parsed <= max); if (valid) onChange(parsed); }
    }
    setTypedVal("");
  };
  const handleTypedKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleTypedBlur(); inputRef.current?.blur(); }
    if (e.key === "Escape") { setIsTyping(false); setTypedVal(""); inputRef.current?.blur(); }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}{required && <span style={{ color: C.dan }}> *</span>}</div>
      <div style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${open || isTyping ? C.pri : C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: value ? C.text : C.textMut, background: disabled ? C.bg : C.surface, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "border 0.15s", boxSizing: "border-box", ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            value={isTyping ? typedVal : display}
            placeholder="MM/DD/YYYY"
            onFocus={() => { setIsTyping(true); setTypedVal(display); }}
            onBlur={handleTypedBlur}
            onChange={handleTypedChange}
            onKeyDown={handleTypedKeyDown}
            disabled={disabled}
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: C.text, width: "100%", padding: 0 }}
          />
          {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(""); setTypedVal(""); setIsTyping(false); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 9, background: C.bg, color: C.textMut, fontSize: 12, cursor: "pointer", lineHeight: 1, flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textMut; }}>×</span>}
        </span>
        <button onClick={(e) => { e.preventDefault(); if (!disabled) setOpen(!open); }} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
      </div>
      {extraContent}
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={prev} style={navBtn}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span onClick={headerClick} style={{ fontSize: 14, fontWeight: 700, color: C.text, cursor: view !== "years" ? "pointer" : "default", padding: "2px 8px", borderRadius: 6, transition: "background 0.15s" }} onMouseEnter={e => { if (view !== "years") e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{headerLabel}</span>
            <button onClick={next} style={navBtn}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          {view === "years" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {Array.from({ length: 12 }, (_, i) => yrPage + i).map(yr => { const isSel = yr === selYr; const isCur = yr === curYr; return (
                <button key={yr} onClick={() => { setVYear(yr); setView("months"); }} style={{ padding: "10px 0", borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isCur ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{yr}</button>
              ); })}
            </div>
          )}
          {view === "months" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {MONTHS_SHORT.map((mn, i) => { const isSel = i === selMo && vYear === selYr; const isCur = i === curMo && vYear === curYr; return (
                <button key={mn} onClick={() => { setVMonth(i); setView("days"); }} style={{ padding: "10px 0", borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isCur ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{mn}</button>
              ); })}
            </div>
          )}
          {view === "days" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
            {days.map((day, i) => { if (day === null) return <div key={`e${i}`} />; const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); const ds = `${vYear}-${m}-${d}`; const isSel = ds === value; const isToday = ds === td; const isDis = (min && ds < min) || (max && ds > max); return (
              <button key={i} onClick={() => !isDis && pick(day)} style={{ width: 34, height: 34, borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isToday ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isDis ? C.border : isSel ? C.pri : isToday ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isToday ? 700 : 500, cursor: isDis ? "default" : "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", opacity: isDis ? 0.35 : 1, transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel && !isDis) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { if (!isSel && !isDis) e.currentTarget.style.background = "transparent"; }}>{day}</button>
            ); })}
          </div>
          </>}
        </div>
      )}
    </div>
  );
}


function Modal({title,onClose,children,wide,fullWidth}) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  const mw = fullWidth ? "calc(100vw - 60px)" : wide ? 720 : 520;
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:fullWidth?16:20}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:mw,maxHeight:fullWidth?"calc(100vh - 32px)":"90vh",overflow:"auto",boxShadow:"0 24px 48px rgba(0,0,0,0.15)"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:`1px solid ${C.borderLight}`}}><h3 style={{margin:0,fontSize:18,fontWeight:700,color:C.text}}>{title}</h3><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,display:"flex",padding:4,borderRadius:8}}><I.X/></button></div><div style={{padding:24}}>{children}</div></div></div>;
}

function Card({children,style={},onClick,hoverable}) {
  const [h,setH]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:C.surface,borderRadius:14,border:`1px solid ${h&&hoverable?C.priLt:C.border}`,padding:20,transition:"all 0.2s",cursor:onClick?"pointer":"default",transform:h&&hoverable?"translateY(-1px)":"none",boxShadow:h&&hoverable?"0 4px 12px rgba(0,0,0,0.06)":"0 1px 3px rgba(0,0,0,0.02)",...style}}>{children}</div>;
}

// ─── Permission Helper ──────────────────────────────────────────────────────
const LEGACY_ROLE_MAP = { owner:"role_owner", enterprise_admin:"role_enterprise_admin", manager:"role_manager", staff:"role_staff" };
// New role code map for location_roles table (7-role system)
const ROLE_CODE_MAP = { pct:"pct", csr:"csr", supervisor:"supervisor", manager:"manager", regional:"regional", admin:"admin", developer:"developer" };

function _resolveRole(profile, data) {
  if (!profile || !data) return null;
  // First try: match via locationRoles from location_roles table (new system)
  const locationRoles = data.locationRoles || [];
  if (locationRoles.length > 0) {
    // Try matching by profile.role as role_code
    let role = locationRoles.find(r => r.role_code === profile.role);
    if (role) return role;
    // Try matching by legacy role map
    const legacyId = LEGACY_ROLE_MAP[profile.role];
    if (legacyId) {
      // Map legacy IDs to new role codes: owner→admin, manager→manager, staff→csr, enterprise_admin→developer
      const legacyToCode = { role_owner:"admin", role_manager:"manager", role_staff:"csr", role_enterprise_admin:"developer" };
      const code = legacyToCode[legacyId];
      if (code) role = locationRoles.find(r => r.role_code === code);
      if (role) return role;
    }
  }
  // Fallback: use data.roles (settings JSONB) with legacy mapping
  if (data.roles && data.roles.length > 0) {
    let roleId = profile.role;
    if (LEGACY_ROLE_MAP[roleId]) roleId = LEGACY_ROLE_MAP[roleId];
    return data.roles.find(r => r.id === roleId) || null;
  }
  return null;
}

function hasPermission(profile, data, permKey) {
  if (!profile || !data) return true; // graceful fallback during loading
  // Owner and enterprise_admin always have full access
  if (profile.role === 'owner' || profile.role === 'enterprise_admin') return true;
  const locationRoles = data.locationRoles || [];
  const legacyRoles = data.roles || [];
  if (locationRoles.length === 0 && legacyRoles.length === 0) return true; // no roles system yet
  const role = _resolveRole(profile, data);
  if (!role) return true; // unknown role = allow (graceful)
  return role.permissions?.[permKey] === true;
}

// ─── useGingrData Hook (Mock Data) ─────────────────────────────────────────
function useGingrData() {
  const td = todayStr();

  // Build sample data inline — will be replaced by Gingr API calls
  const [data] = useState(() => {
    const clients = [
      { id:"c1", createdAt:"2025-09-15T10:00:00", source:"ignite", sourceData:{ campaign:"Fall Promo", leadDate:"2025-09-10" }, fields:{ phone:"8561234567", first_name:"Casey", last_name:"Johnson", email:"sarah@example.com" }, lifecycleLog:[{ date:"2025-09-20", notes:"Tour completed, loved the facility", user:"Front Desk" }], bookingDrafts:[], igniteData:null, coldMarkedAt:null, revivedAt:null, discountUsage:[] },
      { id:"c2", createdAt:"2025-06-01T10:00:00", source:"online", sourceData:null, fields:{ phone:"8569876543", first_name:"Hayden", last_name:"Chen", email:"mike@example.com" }, lifecycleLog:[{ date:"2025-10-01", notes:"Regular client, very happy", user:"Manager" }], bookingDrafts:[], igniteData:null, coldMarkedAt:null, revivedAt:null, discountUsage:[] },
      { id:"c3", createdAt:"2025-11-01T10:00:00", source:"tour", sourceData:{ tourDate:"2025-11-05", tourTime:"10:00" }, fields:{ phone:"8565551234", first_name:"Lisa", last_name:"Park", email:"lisa@example.com" }, lifecycleLog:[], bookingDrafts:[], igniteData:null, coldMarkedAt:null, revivedAt:null, discountUsage:[] },
      { id:"c4", createdAt:"2025-03-10T10:00:00", source:"eval", sourceData:null, fields:{ phone:"8565559876", first_name:"James", last_name:"Wilson", email:"james@example.com" }, lifecycleLog:[{ date:"2025-04-15", notes:"Hasn't returned since eval", user:"CSR" }], bookingDrafts:[], igniteData:null, coldMarkedAt:"2025-08-01", revivedAt:null, discountUsage:[] },
      { id:"c5", createdAt:"2025-01-20T10:00:00", source:"online", sourceData:null, fields:{ phone:"8565554321", first_name:"Emma", last_name:"Davis", email:"emma@example.com" }, lifecycleLog:[], bookingDrafts:[], igniteData:null, coldMarkedAt:null, revivedAt:null, discountUsage:[] },
    ];

    const dogs = [
      { id:"d1", clientId:"c1", fields:{ name:"Bella", breed:"Golden Retriever", age:"3", weight:"65", spayed_neutered:true } },
      { id:"d2", clientId:"c1", fields:{ name:"Max", breed:"Labrador", age:"5", weight:"70", spayed_neutered:true } },
      { id:"d3", clientId:"c2", fields:{ name:"Rocky", breed:"German Shepherd", age:"4", weight:"80", spayed_neutered:true } },
      { id:"d4", clientId:"c3", fields:{ name:"Daisy", breed:"French Bulldog", age:"2", weight:"25", spayed_neutered:false } },
      { id:"d5", clientId:"c4", fields:{ name:"Cooper", breed:"Beagle", age:"6", weight:"30", spayed_neutered:true } },
      { id:"d6", clientId:"c5", fields:{ name:"Luna", breed:"Husky", age:"3", weight:"50", spayed_neutered:true } },
      { id:"d7", clientId:"c5", fields:{ name:"Milo", breed:"Poodle", age:"4", weight:"45", spayed_neutered:true } },
    ];

    const reservations = [
      { id:"r1", clientId:"c1", dogIds:["d1"], type:"tour", checkIn:"2025-09-18", checkOut:"2025-09-18", status:"completed", pricing:{ total:0 } },
      { id:"r2", clientId:"c1", dogIds:["d1","d2"], type:"daycare", checkIn:"2025-10-05", checkOut:"2025-10-05", status:"completed", pricing:{ total:55 } },
      { id:"r3", clientId:"c1", dogIds:["d1","d2"], type:"boarding", checkIn:"2025-12-20", checkOut:"2025-12-27", status:"completed", pricing:{ total:850 }, room:"Luxury Suite 1" },
      { id:"r4", clientId:"c2", dogIds:["d3"], type:"daycare", checkIn:"2025-07-10", checkOut:"2025-07-10", status:"completed", pricing:{ total:45 } },
      { id:"r5", clientId:"c2", dogIds:["d3"], type:"daycare", checkIn:"2025-08-15", checkOut:"2025-08-15", status:"completed", pricing:{ total:45 } },
      { id:"r6", clientId:"c2", dogIds:["d3"], type:"boarding", checkIn:"2025-11-01", checkOut:"2025-11-05", status:"completed", pricing:{ total:500 }, room:"Executive Room 2" },
      { id:"r7", clientId:"c2", dogIds:["d3"], type:"daycare", checkIn:td, checkOut:td, status:"checked_in", pricing:{ total:45 }, room:"Daycare Yard" },
      { id:"r8", clientId:"c3", dogIds:["d4"], type:"tour", checkIn:"2025-11-05", checkOut:"2025-11-05", status:"completed", pricing:{ total:0 } },
      { id:"r9", clientId:"c4", dogIds:["d5"], type:"evaluation", checkIn:"2025-03-20", checkOut:"2025-03-20", status:"completed", pricing:{ total:35 } },
      { id:"r10", clientId:"c5", dogIds:["d6","d7"], type:"daycare", checkIn:"2025-02-10", checkOut:"2025-02-10", status:"completed", pricing:{ total:80 } },
      { id:"r11", clientId:"c5", dogIds:["d6"], type:"boarding", checkIn:"2025-05-01", checkOut:"2025-05-04", status:"completed", pricing:{ total:400 }, room:"Double Compartment 3" },
      { id:"r12", clientId:"c1", dogIds:["d1"], type:"boarding", checkIn:td, checkOut:addDays(td, 3), status:"checked_in", pricing:{ total:450 }, room:"Luxury Suite 1" },
      { id:"r13", clientId:"c5", dogIds:["d6","d7"], type:"boarding", checkIn:addDays(td, 7), checkOut:addDays(td, 10), status:"upcoming", pricing:{ total:650 }, room:"Luxury Suite 2" },
    ];

    // Build rooms structure (per room type, list of room objects)
    const rooms = {};
    ROOM_TYPES.forEach(rt => {
      rooms[rt] = [];
      const count = rt === "Luxury Suite" ? 4 : rt === "Executive Room" ? 6 : rt === "Double Compartment" ? 8 : 10;
      for (let i = 1; i <= count; i++) {
        const name = `${rt} ${i}`;
        const occupant = reservations.find(r => r.room === name && r.status === "checked_in");
        rooms[rt].push({ id: `${rt.toLowerCase().replace(/\s/g,"-")}-${i}`, name, dogIds: occupant ? occupant.dogIds : [] });
      }
    });

    // Daily ops entries (sample)
    const dailyOps = [
      { id:`ops_opening_${td}`, type:"checklist", typeSub:"opening", date:td, locked:false, items:DEF_OPENING_TEMPLATE.map((t,i) => ({...t, done:i<2, completedBy:i<2?"Staff":"", time:i<2?formatTime12hr(new Date()):"" })) },
      { id:`ops_closing_${td}`, type:"checklist", typeSub:"closing", date:td, locked:false, items:DEF_CLOSING_TEMPLATE.map(t => ({...t, done:false, completedBy:"", time:"" })) },
      { id:`ops_fe_checklist_${td}`, type:"checklist", typeSub:"fe_checklist", date:td, locked:false, items:DEF_FE_TEMPLATE.map(t => ({...t, done:false, completedBy:"", time:"" })) },
      { id:`ops_be_checklist_${td}`, type:"checklist", typeSub:"be_checklist", date:td, locked:false, items:DEF_BE_TEMPLATE.map(t => ({...t, done:false, completedBy:"", time:"" })) },
      { id:`ops_room_cleaning_${td}`, type:"room_cleaning", typeSub:"room_cleaning", date:td, locked:false, items:{} },
      { id:`ops_pictures_${td}`, type:"pictures", typeSub:"pictures", date:td, locked:false, items:{} },
      { id:`ops_pp_${td}`, type:"pp", typeSub:"pp", date:td, locked:false, items:{} },
    ];

    return {
      clients,
      dogs,
      reservations,
      rooms,
      dailyOps,
      payments: [],
      messages: [],
      massTextHistory: [],
      messageTemplates: [],
      locationRoles: [],
      roles: [],
      resortPolicies: { retentionDaycareDays: 90, retentionBoardingDays: 180 },
      lifecycleExplainers: {},
      closingTemplate: DEF_CLOSING_TEMPLATE,
      evaluations: [],
      gingr_api_key: "",
      gingr_location_id: "",
      gingr_subdomain: "",
      loading: false,
      error: null,
    };
  });

  const refresh = useCallback(() => {
    // No-op for mock data
  }, []);

  return { ...data, refresh };
}


// ─── Structured Filters ──────────────────────────────────────────────────
function applyStructuredFilters(clients, stats, tabMap, filters) {
  const keys = Object.keys(filters);
  if (keys.length === 0) return clients;
  const today = todayStr();
  const weekAhead = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
  return clients.filter(c => {
    const s = stats[c.id] || {};
    const tm = tabMap[c.id] || {};
    return keys.every(k => {
      const f = filters[k];
      if (!f || (f.val === "" && f.op !== "empty" && f.op !== "notEmpty" && f.op !== "has" && f.op !== "missing" && f.op !== "overdue" && f.op !== "today" && f.op !== "thisWeek" && f.op !== "hasDate" && f.op !== "noDate")) return true;
      const op = f.op, val = f.val;
      if (k === "firstName") { const v = (c.fields.first_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "lastName") { const v = (c.fields.last_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "phone") { const v = (c.fields.phone || "").replace(/\D/g,""); const q = (val||"").replace(/\D/g,""); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      const numMap = {dogCount:s.dogCount||0,totalRes:s.totalRes||0,daysSince:s.daysSinceLast,totalSpent:s.totalSpent||0,daycare:s.daycareCount||0,boarding:s.boardingCount||0,eval:s.evalCount||0,postEval:s.postEvalAppts||0,tours:s.tourCount||0,postTour:s.postTourAppts||0};
      if (k in numMap) {
        let nv = numMap[k]; const nq = parseFloat(val);
        if (nv === null || nv === undefined) nv = k === "daysSince" ? null : 0;
        if (k === "daysSince" && nv === null) return op === "<" || op === "<=" ? false : op === ">" || op === ">=" ? true : false;
        if (isNaN(nq)) return true;
        if (op==="=") return nv===nq; if (op===">=") return nv>=nq; if (op==="<=") return nv<=nq; if (op===">") return nv>nq; if (op==="<") return nv<nq;
      }
      if (k === "lastRes") {
        const d = s.lastRes?.checkIn || "";
        if (op==="after") return d && d > val; if (op==="before") return d && d < val;
        if (op==="inLastDays") { if (!d) return false; const diff = Math.floor((new Date(today+"T12:00:00") - new Date(d+"T12:00:00"))/(86400000)); return diff <= parseInt(val); }
      }
      if (k === "nextRes") { if (op==="has") return !!s.nextRes; if (op==="missing") return !s.nextRes; }
      if (k === "stage") {
        const stg = tm.isCold ? "cold" : tm.isRetention ? "retention" : tm.isActive ? "active" : tm.isConversion ? "conversion" : "unknown";
        if (op==="is") return stg === val; if (op==="isNot") return stg !== val;
      }
      if (k === "source") {
        const src = c.source || "";
        if (op==="is") return src === val; if (op==="isNot") return src !== val;
      }
      if (k === "followUp") {
        const fu = c.lifecycle?.conversion?.followUpDate || c.lifecycle?.retention?.followUpDate || "";
        if (op==="overdue") return fu && fu < today;
        if (op==="today") return fu === today;
        if (op==="thisWeek") return fu && fu >= today && fu <= weekAhead;
        if (op==="hasDate") return !!fu;
        if (op==="noDate") return !fu;
      }
      return true;
    });
  });
}

// ─── CLIENTS PAGE (from POS App) ───────────────────────────────────────────
function ClientsPage({ data, save, nav, profile, addGlobalToast, lcFilters, setLcFilters, setLcFilterOpen, locationSlug }) {
  const [activeTab, setActiveTab] = useState("conversion");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(new Set());
  const [logPopover, setLogPopover] = useState(null);
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [visibleColumns, setVisibleColumns] = useState(new Set(["totalRes","lastRes","daysSince","totalSpent","nextRes"]));
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [hoveredDogCount, setHoveredDogCount] = useState(null);
  const [expandedDogs, setExpandedDogs] = useState(new Set());
  const [expandedIgnite, setExpandedIgnite] = useState(new Set());
  const [showExtraCols, setShowExtraCols] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null); // which tab's banner is being edited
  const [bannerDraft, setBannerDraft] = useState("");
  const [showMassText, setShowMassText] = useState(false);
  const [massTextSelected, setMassTextSelected] = useState(new Set());
  const [massTextBody, setMassTextBody] = useState("");
  const [showMassTextHistory, setShowMassTextHistory] = useState(false);
  const logBtnRef = useRef({});
  const colToggleRef = useRef(null);

  // ── Client stats (reused from v1) ──
  const clientStats = useMemo(() => {
    const map = {};
    data.clients.forEach(c => {
      const cRes = data.reservations.filter(r => r.clientId === c.id);
      const dogs = data.dogs.filter(d => d.clientId === c.id);
      const daycareCount = cRes.filter(r => r.type === "daycare").length;
      const boardingCount = cRes.filter(r => r.type === "boarding").length;
      const evalCount = cRes.filter(r => r.type === "evaluation").length;
      const tourCount = cRes.filter(r => r.type === "tour").length;
      const sorted = [...cRes].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
      const lastRes = sorted.find(r => r.checkIn <= todayStr());
      const nextRes = sorted.filter(r => r.checkIn >= todayStr() && r.status === "upcoming").sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
      // totalSpent includes reservation pricing AND payment records (package purchases, deposits, etc.)
      const resSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
      const pmtSpent = (data.payments || []).filter(p => p.clientId === c.id && p.status === "completed" && p.type !== "refund").reduce((s, p) => s + (p.amount || 0), 0);
      const totalSpent = resSpent + pmtSpent;
      const daysSinceLast = lastRes ? Math.round((new Date(todayStr()+"T12:00:00") - new Date(lastRes.checkIn+"T12:00:00")) / 86400000) : null;
      const dogNames = dogs.map(d => d.fields.name || "Unknown");
      let postEvalAppts = 0;
      const evalsSorted = cRes.filter(r => r.type === "evaluation").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      if (evalsSorted.length > 0) { postEvalAppts = cRes.filter(r => r.checkIn > evalsSorted[0].checkIn).length; }
      let postTourAppts = 0;
      const toursSorted = cRes.filter(r => r.type === "tour").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      if (toursSorted.length > 0) { postTourAppts = cRes.filter(r => r.checkIn > toursSorted[0].checkIn).length; }
      map[c.id] = { dogCount: dogs.length, dogNames, daycareCount, boardingCount, evalCount, tourCount, lastRes, nextRes, totalSpent, totalRes: cRes.length, daysSinceLast, postEvalAppts, postTourAppts };
    });
    return map;
  }, [data.clients, data.reservations, data.dogs, data.payments]);

  // ── Tab membership ──
  const clientTabMap = useMemo(() => {
    const map = {};
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    data.clients.forEach(c => {
      const s = clientStats[c.id] || {};
      const hasSpent = (s.totalSpent || 0) > 0;
      // hasUpcoming and hasBooking exclude tours/evals — only real services (boarding, daycare, etc.) count
      const cRes = (data.reservations || []).filter(r => r.clientId === c.id);
      const hasRealBooking = cRes.some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");
      const totalRes = s.totalRes || 0;
      const daysSince = s.daysSinceLast;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;
      if (hasSpent && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const dcPct = totalRes > 0 ? ((s.daycareCount || 0) / totalRes) : 0;
        const bdPct = totalRes > 0 ? ((s.boardingCount || 0) / totalRes) : 0;
        if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
        else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
        else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
      }
      // Conversion: no real bookings (excluding tours/evals), no money spent, not cold
      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      // Active: has spent money OR has a real booking (not just tour/eval), and not in retention or cold
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      map[c.id] = { isConversion, isActive, isRetention: isRetention && !isCold, isCold, isAll: true };
    });
    return map;
  }, [data.clients, clientStats, data.resortPolicies?.retentionDaycareDays, data.resortPolicies?.retentionBoardingDays]);

  // ── Lifecycle event tracking ──
  const prevTabMapRef = useRef(null);
  useEffect(() => {
    if (!prevTabMapRef.current || !save) { prevTabMapRef.current = clientTabMap; return; }
    const prev = prevTabMapRef.current;
    let changed = false;
    const updatedClients = data.clients.map(c => {
      const oldM = prev[c.id]; const newM = clientTabMap[c.id];
      if (!oldM || !newM) return c;
      let event = null;
      if (oldM.isConversion && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Moved to Active Customers (first booking/payment)" };
      else if (oldM.isActive && newM.isRetention) event = { event: "moved_to_retention", date: todayStr(), details: "Moved to Retention (lapsed client)" };
      else if (oldM.isRetention && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Returned to Active Customers (re-engaged)" };
      if (event) {
        changed = true;
        let updated = { ...c, lifecycleEvents: [...(c.lifecycleEvents || []), event] };
        // When moving to retention, auto-set follow-up date to today
        if (event.event === "moved_to_retention") {
          const lc = updated.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          updated = { ...updated, lifecycle: { ...lc, retention: { ...lc.retention, followUpDate: todayStr() } } };
        }
        return updated;
      }
      return c;
    });
    prevTabMapRef.current = clientTabMap;
    if (changed) save({ ...data, clients: updatedClients });
  }, [clientTabMap]);

  // ── Source lookup helpers ──
  const getClientSource = useCallback((client) => {
    const base = client.fields?.referral_source || "";
    const hasEval = (data.evaluations || []).some(e => e.clientId === client.id && e.locked);
    const evalRes = hasEval ? data.reservations.find(r => r.clientId === client.id && r.type === "evaluation" && (data.evaluations || []).some(e => e.reservationId === r.id && e.locked)) : null;
    const tourRes = data.reservations.filter(r => r.clientId === client.id && r.type === "tour" && r.status === "checked-out").sort((a,b) => b.checkIn.localeCompare(a.checkIn))[0] || null;
    return { base, hasEval, evalRes, hasTour: !!tourRes, tourRes };
  }, [data.evaluations, data.reservations]);

  // ── Filtered & sorted client lists ──
  const tabLists = useMemo(() => {
    const sq = search.toLowerCase().trim();
    const sqDigits = sq.replace(/\D/g, "");
    let all = data.clients;
    if (sq) {
      all = all.filter(c => {
        const fn = `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.toLowerCase();
        const ph = (c.fields.phone || "").replace(/\D/g, "");
        const dogNames = (clientStats[c.id]?.dogNames || []).join(" ").toLowerCase();
        return fn.includes(sq) || dogNames.includes(sq) || (sqDigits.length >= 3 && ph.includes(sqDigits));
      });
    }
    const conv = all.filter(c => clientTabMap[c.id]?.isConversion);
    const active = all.filter(c => clientTabMap[c.id]?.isActive);
    const ret = all.filter(c => clientTabMap[c.id]?.isRetention);
    const cold = all.filter(c => clientTabMap[c.id]?.isCold);
    return { conversion: conv, active, retention: ret, cold, all };
  }, [data.clients, search, clientTabMap, clientStats, activeTab]);

  // ── Apply sub-filters (structured filters, source filter, overdue toggle) ──
  const activeFilterCount = Object.keys(lcFilters).length;
  const activeList = useMemo(() => {
    let list = tabLists[activeTab] || [];
    // Structured filters
    if (activeFilterCount > 0) {
      list = applyStructuredFilters(list, clientStats, clientTabMap, lcFilters);
    }
    // Source filter (Conversion tab only)
    if (activeTab === "conversion" && sourceFilter.size > 0) {
      list = list.filter(c => {
        const src = getClientSource(c);
        if (sourceFilter.has("eval") && src.hasEval) return true;
        if (sourceFilter.has("tour") && src.hasTour) return true;
        if (sourceFilter.has("ignite") && c.lifecycle?.conversion?.source === "ignite") return true;
        if (sourceFilter.has("online") && (c.fields?.referral_source === "Online Booking" || c.lifecycle?.conversion?.source === "online_booking")) return true;
        return false;
      });
    }
    // Overdue toggle
    if (showOverdueOnly) {
      const today = todayStr();
      list = list.filter(c => {
        const tab = activeTab === "conversion" ? "conversion" : activeTab === "retention" ? "retention" : null;
        if (!tab) return false;
        const fu = c.lifecycle?.[tab]?.followUpDate;
        return fu && fu < today;
      });
    }
    // Sort
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const sa = clientStats[a.id] || {};
        const sb = clientStats[b.id] || {};
        let va, vb;
        switch (sortCol) {
          case "name": case "last_name": va = (a.fields.last_name||"").toLowerCase(); vb = (b.fields.last_name||"").toLowerCase(); break;
          case "first_name": va = (a.fields.first_name||"").toLowerCase(); vb = (b.fields.first_name||"").toLowerCase(); break;
          case "phone": va = a.fields.phone||""; vb = b.fields.phone||""; break;
          case "dogCount": va = sa.dogCount||0; vb = sb.dogCount||0; break;
          case "totalRes": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          case "lastRes": va = sa.lastRes?.checkIn||""; vb = sb.lastRes?.checkIn||""; break;
          case "daysSince": va = sa.daysSinceLast??9999; vb = sb.daysSinceLast??9999; break;
          case "totalSpent": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "nextRes": va = sa.nextRes?.checkIn||"zzz"; vb = sb.nextRes?.checkIn||"zzz"; break;
          case "followUp": { const t = activeTab==="retention"?"retention":"conversion"; va = a.lifecycle?.[t]?.followUpDate||"zzz"; vb = b.lifecycle?.[t]?.followUpDate||"zzz"; break; }
          case "coldDate": va = a.lifecycle?.coldDate||""; vb = b.lifecycle?.coldDate||""; break;
          case "totalPaid": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "totalAppts": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          default: va = ""; vb = "";
        }
        if (typeof va === "number") return (va - vb) * dir;
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }
    return list;
  }, [tabLists, activeTab, sourceFilter, showOverdueOnly, sortCol, sortDir, clientStats, getClientSource, lcFilters, activeFilterCount, clientTabMap]);

  // ── Handlers ──
  const handleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const SortIcon = ({ col }) => { if (sortCol !== col) return null; return <span style={{fontSize:10,marginLeft:2}}>{sortDir==="asc"?"▲":"▼"}</span>; };
  const colHeaderStyle = (col) => ({ display:"flex",alignItems:"center",gap:2,cursor:"pointer",userSelect:"none",color:sortCol===col?C.pri:C.textMut,fontWeight:sortCol===col?800:700 });
  const toggleSourceFilter = (type) => setSourceFilter(prev => { const n=new Set(prev); if(n.has(type))n.delete(type);else n.add(type); return n; });

  const today = todayStr();
  const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
  const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;

  // ── Log/Revive handler ──
  const handleSaveLog = async () => {
    if (!logPopover) return;
    if (!logNotes.trim() || !logDate) { addGlobalToast?.({ type: "error", message: "Notes and follow-up date are required" }); return; }
    const { clientId, tab: lcTab, isRevive } = logPopover;
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
      const tabKey = isRevive ? (lc.coldFrom || "conversion") : lcTab;
      const oldDate = lc[tabKey]?.followUpDate || "";
      const entry = { id: gid(), notes: logNotes, previousFollowUp: oldDate, newFollowUp: logDate, loggedBy: profile?.full_name || profile?.email || "Staff", loggedAt: new Date().toISOString() };
      const updatedTab = { ...(lc[tabKey]||{}), notes: "", followUpDate: logDate, updates: [entry, ...(lc[tabKey]?.updates||[])] };
      const evt = { event: isRevive ? "revived_from_cold" : "logged_outreach", date: today, details: isRevive ? `Revived back to ${tabKey}` : `Logged in ${tabKey}: "${logNotes.substring(0,50)}"` };
      return {
        ...c,
        lifecycle: { ...lc, [tabKey]: updatedTab, ...(isRevive ? { cold: false } : {}) },
        lifecycleEvents: [...(c.lifecycleEvents || []), evt]
      };
    });
    await save({ ...data, clients: newClients });
    setLogPopover(null); setLogNotes(""); setLogDate("");
    addGlobalToast?.({ message: isRevive ? "Client revived" : "Log saved" });
  };

  const markCold = async (clientId) => {
    const prevClient = data.clients.find(c => c.id === clientId);
    const prevLifecycle = prevClient ? JSON.parse(JSON.stringify(prevClient.lifecycle || {})) : {};
    const prevEvents = prevClient ? [...(prevClient.lifecycleEvents || [])] : [];
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      return {
        ...c,
        lifecycle: { ...(c.lifecycle||{}), cold: true, coldDate: today, coldFrom: activeTab === "retention" ? "retention" : "conversion" },
        lifecycleEvents: [...(c.lifecycleEvents||[]), { event: "marked_cold", date: today, details: `Marked as cold from ${activeTab}` }]
      };
    });
    await save({ ...data, clients: newClients });
    addGlobalToast?.({
      message: "Client marked as cold",
      actionLabel: "Undo",
      onAction: async () => {
        const undoClients = data.clients.map(c => {
          if (c.id !== clientId) return c;
          return { ...c, lifecycle: prevLifecycle, lifecycleEvents: prevEvents };
        });
        await save({ ...data, clients: undoClients });
        addGlobalToast?.({ message: "Undo successful — client restored" });
      }
    });
  };

  // ── Mass Text handler (personalizes variables per client) ──
  const personalizeMsg = (body, clientId) => {
    const c = data.clients.find(cl => cl.id === clientId);
    const cDogs = (data.dogs || []).filter(d => d.clientId === clientId);
    let msg = body;
    msg = msg.replace(/\{clientName\}/g, c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() || "Client" : "Client");
    msg = msg.replace(/\{dogName\}/g, formatDogNames(cDogs));
    msg = msg.replace(/\{checkInDate\}/g, "TBD");
    msg = msg.replace(/\{checkOutDate\}/g, "TBD");
    msg = msg.replace(/\{roomType\}/g, "TBD");
    msg = msg.replace(/\{totalPrice\}/g, "TBD");
    return msg;
  };

  const handleMassTextSend = async () => {
    if (!massTextBody.trim() || massTextSelected.size === 0) return;
    const now = new Date().toISOString();
    const newMsgs = [...massTextSelected].map(cid => ({
      id: gid(),
      clientId: cid,
      direction: "outbound",
      channel: "sms",
      body: personalizeMsg(massTextBody.trim(), cid),
      timestamp: now,
      status: "sent",
      twilioSid: null,
      templateId: null,
      readAt: null,
      isMassText: true
    }));
    const historyEntry = {
      id: gid(),
      sentAt: now,
      sentBy: profile?.full_name || profile?.email || "Unknown",
      body: massTextBody.trim(),
      recipientCount: massTextSelected.size,
      recipientIds: [...massTextSelected],
      recipientNames: [...massTextSelected].map(cid => {
        const c = data.clients.find(cl => cl.id === cid);
        return c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() : "Unknown";
      })
    };
    await save({
      ...data,
      messages: [...(data.messages || []), ...newMsgs],
      massTextHistory: [...(data.massTextHistory || []), historyEntry]
    });
    setShowMassText(false);
    setMassTextBody("");
    setMassTextSelected(new Set());
    addGlobalToast?.({ message: `Mass text sent to ${massTextSelected.size} client${massTextSelected.size !== 1 ? "s" : ""}`, type: "success" });
  };

  // ── Tab config ──
  const tabDefs = [
    { id: "conversion", label: "Conversion", count: tabLists.conversion.length, color: C.acc },
    { id: "active", label: "Active Customers", count: tabLists.active.length, color: C.pri },
    { id: "retention", label: "Retention", count: tabLists.retention.length, color: C.dan },
    { id: "cold", label: "Cold", count: tabLists.cold.length, color: C.textSec },
    { id: "all", label: "All", count: tabLists.all.length, color: C.info },
  ];

  // ── Toggleable columns for Active/All tabs ──
  const toggleCols = [
    { key: "daycare", label: "DC" }, { key: "boarding", label: "BD" },
    { key: "eval", label: "Eval" }, { key: "postEval", label: "P-Eval" },
    { key: "tours", label: "Tours" }, { key: "postTour", label: "P-Tour" },
  ];
  const baseCols = ["totalRes","lastRes","daysSince","totalSpent","nextRes"];
  const extraCols = ["daycare","boarding","eval","postEval","tours","postTour"];
  const shownDataCols = showExtraCols ? [...baseCols.slice(0,3), ...extraCols, ...baseCols.slice(3)] : baseCols;

  // ── Source cell renderer ──
  // Booking drafts state (for Online Booking source accordion)
  const [bookingDrafts, setBookingDrafts] = useState([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [expandedDraft, setExpandedDraft] = useState(null);

  // Load booking drafts when conversion tab is shown — refresh each time tab is opened
  useEffect(() => {
    if (activeTab === "conversion" && locationSlug) {
      setDraftsLoaded(false);
      supabase.rpc("get_booking_drafts", { p_location_slug: locationSlug }).then(
        ({ data: d, error: e }) => {
          if (e) { console.log("get_booking_drafts error:", e.message); setDraftsLoaded(true); return; }
          if (d) setBookingDrafts(Array.isArray(d) ? d : []);
          setDraftsLoaded(true);
        },
        () => setDraftsLoaded(true) // network error
      );
    }
  }, [activeTab, locationSlug]);

  const renderSource = (client) => {
    const src = getClientSource(client);
    const isIgnite = client.lifecycle?.conversion?.source === "ignite";
    const isOnline = client.fields?.referral_source === "Online Booking" || client.lifecycle?.conversion?.source === "online_booking";
    const parts = [];
    if (isIgnite) parts.push({ label: "Ignite", type: "ignite" });
    if (isOnline) parts.push({ label: "Online Booking", type: "online" });
    if (src.base && (!isIgnite || src.base !== "Ignite") && src.base !== "Online Booking") parts.push({ label: src.base, type: "base" });
    if (src.hasEval) parts.push({ label: "Eval", type: "eval", res: src.evalRes });
    if (src.hasTour) parts.push({ label: "Tour", type: "tour", res: src.tourRes });
    if (parts.length === 0) return <span style={{color:C.textMut}}>—</span>;
    const igniteExpanded = expandedIgnite.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:0,flexWrap:"wrap",fontSize:11}}>
        {parts.map((p, i) => (
          <span key={i} style={{display:"inline-flex",alignItems:"center"}}>
            {i > 0 && <span style={{margin:"0 3px",color:C.textMut,fontSize:9}}>→</span>}
            {p.type === "ignite" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:igniteExpanded?`#F9731610`:"transparent",border:`1px solid ${igniteExpanded?"#F9731640":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                {client.igniteData?.igniteProfileId && client.igniteData?.leadId ? (
                  <a href={`https://leads.idigitalstrategies.com/profile/${client.igniteData.igniteProfileId}/leads?lid=${client.igniteData.leadId}`} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{fontWeight:700,color:"#F97316",textDecoration:"none",fontSize:11}}
                    onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
                    onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                    Ignite ↗
                  </a>
                ) : (
                  <span style={{fontWeight:700,color:"#F97316",fontSize:11}}>Ignite</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedIgnite(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:"#F97316",fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:igniteExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "online" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:expandedDraft===client.id?`${C.pri}10`:"transparent",border:`1px solid ${expandedDraft===client.id?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedDraft(prev => prev === client.id ? null : client.id); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:C.pri,fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:expandedDraft===client.id?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "eval" || p.type === "tour" ? (
              <span
                style={{fontWeight:700,color:p.type==="eval"?C.acc:C.info,cursor:"pointer",position:"relative"}}
                onMouseEnter={() => setHoveredSource(`${client.id}_${p.type}`)}
                onMouseLeave={() => setHoveredSource(null)}
              >
                {p.label}
                {hoveredSource === `${client.id}_${p.type}` && (
                  <div style={{position:"absolute",top:"100%",left:0,zIndex:999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",minWidth:180,boxShadow:"0 4px 16px rgba(0,0,0,0.10)",whiteSpace:"nowrap"}}>
                    {p.res && <div style={{fontSize:11,color:C.text,marginBottom:4}}>{fmtDate(p.res.checkIn)}</div>}
                    {p.type === "eval" && p.res && (() => {
                      const ev = (data.evaluations||[]).find(e => e.reservationId === p.res.id && e.locked);
                      if (!ev) return null;
                      const rc = ev.result === "green" ? C.suc : ev.result === "yellow" ? C.acc : C.dan;
                      return (
                        <>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{fontSize:10,fontWeight:700}}>Outcome:</span>
                            <span style={{fontSize:10,fontWeight:800,color:rc,textTransform:"uppercase"}}>{ev.result}</span>
                          </div>
                          <span onClick={(e) => { e.stopPropagation(); nav("evaluation-form", { reservationId: p.res.id }); }} style={{fontSize:10,fontWeight:700,color:C.pri,cursor:"pointer",textDecoration:"underline"}}>View Form</span>
                        </>
                      );
                    })()}
                    {p.type === "tour" && <div style={{fontSize:10,color:C.suc,fontWeight:600}}>Completed</div>}
                  </div>
                )}
              </span>
            ) : (
              <span style={{color:C.text,fontWeight:600}}>{p.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  // ── Dog count cell (clickable accordion trigger) ──
  const renderDogCount = (client) => {
    const s = clientStats[client.id] || {};
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    const isExp = expandedDogs.has(client.id);
    return (
      <button onClick={(e) => { e.stopPropagation(); setExpandedDogs(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
        style={{display:"inline-flex",alignItems:"center",gap:4,background:isExp?`${C.pri}10`:"transparent",border:`1px solid ${isExp?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 8px",cursor:dogs.length>0?"pointer":"default",fontFamily:"inherit",fontSize:12,fontWeight:700,color:isExp?C.pri:C.text,transition:"all 0.15s"}}>
        {s.dogCount || 0}
        {dogs.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:isExp?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>}
      </button>
    );
  };

  // ── Dog detail row (accordion expansion) ──
  const renderDogDetails = (client) => {
    if (!expandedDogs.has(client.id)) return null;
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    if (dogs.length === 0) return null;
    const calcAge = (dob) => { if (!dob) return "—"; const b=new Date(dob+"T00:00:00"),now=new Date(); let y=now.getFullYear()-b.getFullYear(),m=now.getMonth()-b.getMonth(); if(m<0){y--;m+=12;} return y>0?`${y}y ${m}m`:`${m}m`; };
    return (
      <div style={{padding:"10px 20px 10px 28px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
        {dogs.map(dog => {
          const f = dog.fields || {};
          const sn = f.spayed_neutered || "Unknown";
          return (
            <div key={dog.id} style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`,fontSize:11,alignItems:"center"}}>
              <div><span style={{fontWeight:700,color:C.text}}>{f.name || "Unknown"}</span></div>
              <div style={{color:C.textSec}}>{f.breed || "—"}</div>
              <div style={{color:C.textSec}}>{calcAge(f.dob)}</div>
              <div style={{color:C.textSec}}>{f.weight ? `${f.weight} lbs` : "—"}</div>
              <div><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:sn==="Neutered"||sn==="Spayed"?`${C.suc}15`:`${C.acc}15`,color:sn==="Neutered"||sn==="Spayed"?C.suc:C.acc}}>{sn}</span></div>
            </div>
          );
        })}
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"4px 0 0",fontSize:9,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          <div>Name</div><div>Breed</div><div>Age</div><div>Weight</div><div>S/N</div>
        </div>
      </div>
    );
  };

  // ── Follow-up cell renderer ──
  const [expandedFollowUp, setExpandedFollowUp] = useState(new Set());
  const renderFollowUp = (client, tab) => {
    const fu = client.lifecycle?.[tab]?.followUpDate;
    if (!fu) return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    const isOverdue = fu < today;
    const isToday = fu === today;
    const d = new Date(fu + "T12:00:00");
    const mmddyy = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
    const dow = d.toLocaleDateString("en-US",{weekday:"long"});
    const isExpFu = expandedFollowUp.has(client.id);
    const toggleFu = (e) => { e.stopPropagation(); setExpandedFollowUp(prev => { const n = new Set(prev); if (n.has(client.id)) n.delete(client.id); else n.add(client.id); return n; }); };
    return (
      <div>
        <div onClick={toggleFu} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <div style={{lineHeight:1.3}}>
            <div style={{fontSize:12,fontWeight:600,color:isOverdue?C.dan:isToday?C.suc:C.text}}>{mmddyy}</div>
            <div style={{fontSize:10,color:isOverdue?C.dan:isToday?C.suc:C.textSec,fontWeight:500}}>{dow}</div>
          </div>
          {isOverdue && <span style={{fontSize:9,fontWeight:800,color:C.dan,background:`${C.dan}15`,padding:"1px 5px",borderRadius:4}}>OVERDUE</span>}
          {isToday && <span style={{fontSize:9,fontWeight:800,color:C.suc,background:`${C.suc}15`,padding:"1px 5px",borderRadius:4}}>TODAY</span>}
        </div>
        {isExpFu && client.createdAt && (
          <div style={{marginTop:4,padding:"3px 6px",borderRadius:4,background:C.bg,border:`1px solid ${C.borderLight}`,fontSize:10,color:C.textSec}}>
            <span style={{fontWeight:600}}>Created:</span> {fmtDate(client.createdAt.split("T")[0] || client.createdAt)}
          </div>
        )}
      </div>
    );
  };

  // ── Notes cell (shows last log note with date prefix) ──
  const renderNotes = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    if (updates.length === 0) {
      // For Ignite leads with no updates yet, show the received date from notes field
      if (client.lifecycle?.conversion?.source === "ignite" && client.fields?.notes) {
        return <span style={{fontSize:11,color:"#F97316",fontWeight:600,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{client.fields.notes}</span>;
      }
      return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    }
    const last = updates[0]; // most recent
    const dateStr = last.loggedAt ? new Date(last.loggedAt).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "";
    return <span style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{dateStr ? `${dateStr}: ` : ""}{last.notes}</span>;
  };

  // ── Updates/Log cell ──
  const renderUpdatesLog = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    const isExpanded = expandedUpdates.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={(e) => { e.stopPropagation(); setExpandedUpdates(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,padding:"0 6px",borderRadius:8,fontSize:11,fontWeight:800,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:updates.length>0?`${C.acc}20`:C.bg,color:updates.length>0?C.acc:C.textMut}}>
          {updates.length}
        </button>
        <button ref={el => { if(el) logBtnRef.current[client.id] = el; }}
          onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); setLogPopover({ clientId:client.id, tab, x:rect.left, y:rect.bottom+4 }); setLogNotes(client.lifecycle?.[tab]?.notes||""); setLogDate(""); }}
          style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.pri}30`,background:`${C.pri}08`,color:C.pri,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Log
        </button>
      </div>
    );
  };

  // ── Cold button cell ──
  const renderColdBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); markCold(client.id); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.dan}30`,background:`${C.dan}08`,color:C.dan,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Cold
    </button>
  );

  // ── Revive button cell ──
  const renderReviveBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); setLogPopover({ clientId:client.id, tab:client.lifecycle?.coldFrom||"conversion", isRevive:true, x:rect.left, y:rect.bottom+4 }); setLogNotes(""); setLogDate(""); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.suc}30`,background:`${C.suc}08`,color:C.suc,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Revive
    </button>
  );

  // ── Client name cell (clickable) ──
  const renderName = (client) => {
    const fn = client.fields.first_name || "";
    const ln = client.fields.last_name || "";
    return (
      <span onClick={(e) => { e.stopPropagation(); nav("client-detail",{clientId:client.id}); }}
        style={{fontWeight:700,color:C.pri,cursor:"pointer",fontSize:12}}
        onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
        onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
        {fn} {ln}
      </span>
    );
  };

  // ── Grid templates per tab ──
  const getGrid = () => {
    if (activeTab === "conversion") return "minmax(120px,1.5fr) minmax(80px,1fr) 60px minmax(100px,1.2fr) minmax(90px,1fr) minmax(100px,1.5fr) 100px 60px";
    if (activeTab === "retention") return "minmax(110px,1.3fr) minmax(80px,1fr) 50px minmax(90px,1fr) minmax(85px,0.9fr) minmax(90px,1.3fr) 90px minmax(70px,0.8fr) minmax(65px,0.7fr) 55px 55px";
    if (activeTab === "cold") return "minmax(120px,1.5fr) minmax(80px,1fr) 60px minmax(100px,1.2fr) minmax(90px,1fr) minmax(120px,1.5fr) 70px";
    // Active / All
    const base = "minmax(80px,1fr) minmax(80px,1fr) minmax(80px,0.8fr) 50px";
    const dataCols = shownDataCols.map(k => {
      if (k==="lastRes"||k==="nextRes") return "minmax(70px,0.8fr)";
      return "minmax(50px,0.6fr)";
    }).join(" ");
    return `${base} ${dataCols}`;
  };

  // ── Render ──
  return (
    <div style={{padding:"24px 28px",maxWidth:1400,margin:"0 auto"}}>
      {/* Page Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>Customer Lifecycle</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:C.textSec}}>{data.clients.length} total clients{search?` — ${activeList.length} shown`:""}</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={() => setLcFilterOpen(v => !v)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1.5px solid ${activeFilterCount>0?C.pri:C.border}`,background:activeFilterCount>0?C.priLt:"transparent",color:activeFilterCount>0?C.pri:C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filter{activeFilterCount>0 && <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,padding:"0 5px",borderRadius:9,fontSize:10,fontWeight:800,background:C.pri,color:"#fff"}}>{activeFilterCount}</span>}
          </button>
          <Btn variant="ghost" onClick={() => {
            setMassTextSelected(new Set(activeList.filter(c => c.fields?.phone).map(c => c.id)));
            setShowMassText(true);
          }}>
            <I.MessageSquare /> Mass Text ({activeList.filter(c => c.fields?.phone).length})
          </Btn>
          <Btn variant="ghost" onClick={() => {
            // Export current lifecycle tab to CSV
            const headers = activeTab === "conversion"
              ? ["First Name","Last Name","Phone","Email","Dogs","Source","Follow-Up Date","Notes"]
              : activeTab === "active"
              ? ["First Name","Last Name","Phone","Email","Dogs","Reservations","Last Visit","Days Since","Total Spent"]
              : activeTab === "cold"
              ? ["First Name","Last Name","Phone","Email","Dogs","Cold Date","Previous Stage"]
              : ["First Name","Last Name","Phone","Email","Dogs"];
            const rows = activeList.map(c => {
              const f = c.fields || {};
              const dogs = (data.dogs || []).filter(d => d.clientId === c.id).map(d => d.fields?.name).join(", ");
              const base = [f.first_name||"", f.last_name||"", f.phone||"", f.email||"", dogs];
              if (activeTab === "conversion") {
                const lc = c.lifecycle?.conversion || {};
                return [...base, c.referralSource || "", lc.followUpDate || "", lc.notes || ""];
              } else if (activeTab === "active") {
                const resCount = (data.reservations || []).filter(r => r.clientId === c.id).length;
                const lastRes = (data.reservations || []).filter(r => r.clientId === c.id).sort((a,b) => (b.checkIn||"").localeCompare(a.checkIn||""))[0];
                const daysSince = lastRes ? Math.floor((new Date(todayStr()+"T12:00:00") - new Date(lastRes.checkIn+"T12:00:00")) / 86400000) : "";
                const totalSpent = (data.payments || []).filter(p => p.clientId === c.id).reduce((s,p) => s + (p.amount||0), 0);
                return [...base, resCount, lastRes?.checkIn || "", daysSince, "$" + totalSpent.toFixed(2)];
              } else if (activeTab === "cold") {
                return [...base, c.lifecycle?.coldDate || "", c.lifecycle?.coldFrom || ""];
              }
              return base;
            });
            const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `lifecycle-${activeTab}-${todayStr()}.csv`; a.click();
            URL.revokeObjectURL(url);
            addGlobalToast?.({ message: `Exported ${rows.length} clients to CSV`, type: "success" });
          }}>
            <I.Download /> Export CSV
          </Btn>
          <Btn onClick={() => nav("new-client")}>+ New Client</Btn>
        </div>
      </div>

      {/* Main Card */}
      <Card style={{padding:0,overflow:"hidden"}}>
        {/* Search Bar */}
        <div style={{borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderBottomColor=C.pri} onBlur={e=>e.currentTarget.style.borderBottomColor=C.borderLight}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search?C.pri:C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by client name, dog name, or phone…"
              className="no-focus-ring"
              style={{border:"none",outline:"none",background:"transparent",fontSize:13,fontWeight:500,color:C.text,padding:"12px 10px",width:"100%",fontFamily:"inherit"}} />
            {search && <button onClick={()=>setSearch("")} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}} title="Clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            {/* Filter pills area */}
            <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
              {activeTab === "conversion" && <>
                {[{id:"eval",label:"Eval",color:C.acc},{id:"tour",label:"Tour",color:C.info},{id:"ignite",label:"Ignite",color:"#F97316"},{id:"online",label:"Online Booking",color:C.pri}].map(f => {
                  const on = sourceFilter.has(f.id);
                  return <button key={f.id} onClick={()=>toggleSourceFilter(f.id)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${on?f.color:C.border}`,background:on?f.color:"transparent",color:on?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{f.label}</button>;
                })}
                {sourceFilter.size > 0 && <button onClick={()=>setSourceFilter(new Set())} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:"0 2px",display:"flex",alignItems:"center"}} title="Clear"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
              </>}
              {(activeTab === "conversion" || activeTab === "retention") && (
                <button onClick={()=>setShowOverdueOnly(v=>!v)}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showOverdueOnly?C.dan:C.border}`,background:showOverdueOnly?`${C.dan}12`:"transparent",color:showOverdueOnly?C.dan:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                  Overdue
                </button>
              )}
              {(activeTab === "active" || activeTab === "all") && (
                <button onClick={(e) => { e.stopPropagation(); setShowExtraCols(v=>!v); }}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showExtraCols?C.pri:C.border}`,background:showExtraCols?C.priLt:"transparent",color:showExtraCols?C.pri:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.2s",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  {showExtraCols ? "Less Columns" : "More Columns"}
                </button>
              )}
            </div>
          </div>
          {/* Active structured filter summary */}
          {activeFilterCount > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 16px 8px",borderTop:`1px solid ${C.borderLight}`,flexWrap:"wrap"}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span style={{fontSize:11,fontWeight:600,color:C.pri}}>{activeFilterCount} filter{activeFilterCount!==1?"s":""}:</span>
              {Object.entries(lcFilters).map(([k, f]) => {
                const fd = LC_FILTER_FIELDS.find(x => x.key === k);
                return (
                  <span key={k} style={{fontSize:11,fontWeight:600,color:C.text,background:`${C.pri}10`,border:`1px solid ${C.pri}25`,padding:"2px 8px",borderRadius:6,display:"inline-flex",alignItems:"center",gap:4}}>
                    {fd?.label} {LC_OP_LABELS[f.op]||f.op} {f.val !== "" ? (fd?.type==="currency"?"$":"")+f.val : ""}
                    <button onClick={()=>{ const n={...lcFilters}; delete n[k]; setLcFilters(n); }} style={{border:"none",background:"none",cursor:"pointer",color:C.pri,padding:0,display:"flex",lineHeight:1}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </span>
                );
              })}
              <button onClick={()=>setLcFilters({})} style={{fontSize:10,fontWeight:600,color:C.textMut,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",marginLeft:4}}>Clear all</button>
              <span style={{fontSize:11,color:C.textMut,marginLeft:"auto"}}>{activeList.length} result{activeList.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Tab Pills */}
        <div style={{display:"flex",borderBottom:`2px solid ${C.borderLight}`,background:C.bg}}>
          {tabDefs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSortCol(null); setShowOverdueOnly(false); setSourceFilter(new Set()); setExpandedUpdates(new Set()); }}
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"14px 16px",border:"none",borderBottom:`3px solid ${active?tab.color:"transparent"}`,background:active?C.surface:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",marginBottom:-2}}>
                <span style={{fontSize:14,fontWeight:active?700:600,color:active?C.text:C.textSec}}>{tab.label}</span>
                <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:24,height:24,padding:"0 8px",borderRadius:12,fontSize:13,fontWeight:800,background:active?tab.color:C.surfaceHover,color:active?"#fff":C.textSec,transition:"all 0.15s"}}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Explainer Banner — per-tab, editable */}
        {(() => {
          const banners = data.lifecycleExplainers || {};
          const txt = banners[activeTab] || DEFAULT_LIFECYCLE_BANNERS[activeTab] || "";
          const canEdit = hasPermission(profile, data, "edit_lifecycle_banners");
          const isEditing = editingBanner === activeTab;
          return (
            <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`,background:`linear-gradient(135deg, ${C.priLt||C.pri+"08"}40, ${C.surface})`,fontSize:12,lineHeight:1.6,color:C.textSec,position:"relative"}}>
              {isEditing ? (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <textarea value={bannerDraft} onChange={e => setBannerDraft(e.target.value)} autoFocus
                    style={{width:"100%",minHeight:72,padding:"8px 10px",border:`1.5px solid ${C.pri}`,borderRadius:6,fontSize:12,lineHeight:1.6,fontFamily:"inherit",color:C.text,background:"#fff",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                    placeholder="Enter banner text for this tab…" />
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={() => setEditingBanner(null)} style={{padding:"5px 14px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,fontSize:11,fontWeight:600,color:C.textSec,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    <button onClick={async () => {
                      const updated = { ...(data.lifecycleExplainers || {}), [activeTab]: bannerDraft.trim() || DEFAULT_LIFECYCLE_BANNERS[activeTab] };
                      await save({ ...data, lifecycleExplainers: updated });
                      setEditingBanner(null);
                      addGlobalToast?.({ message: "Banner updated" });
                    }} style={{padding:"5px 14px",border:"none",borderRadius:6,background:C.pri,fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                    {banners[activeTab] && (
                      <button onClick={async () => {
                        const updated = { ...(data.lifecycleExplainers || {}) };
                        delete updated[activeTab];
                        await save({ ...data, lifecycleExplainers: updated });
                        setEditingBanner(null);
                        setBannerDraft("");
                        addGlobalToast?.({ message: "Banner reset to default" });
                      }} style={{padding:"5px 14px",border:`1px solid ${C.dan}30`,borderRadius:6,background:`${C.dan}08`,fontSize:11,fontWeight:600,color:C.dan,cursor:"pointer",fontFamily:"inherit"}}>Reset Default</button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{txt}</div>
                  {canEdit && (
                    <button onClick={() => { setEditingBanner(activeTab); setBannerDraft(txt); }}
                      title="Edit banner text"
                      style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",color:C.textSec,transition:"all 0.15s",marginTop:-1}}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.pri; }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.textSec; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ TABLE HEADER + ROWS ═══ */}
        {activeTab === "conversion" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No conversion leads{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.conversion?.updates || [];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "conversion")}</div>
                    <div>{renderNotes(c, "conversion")}</div>
                    <div>{renderUpdatesLog(c, "conversion")}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {expandedIgnite.has(c.id) && c.igniteData && (() => {
                    const igd = c.igniteData;
                    const fields = [
                      { label: "Source", val: igd.source },
                      { label: "First Name", val: igd.firstName },
                      { label: "Last Name", val: igd.lastName },
                      { label: "Caller Name", val: igd.callerName },
                      { label: "Email", val: igd.email },
                      { label: "Phone", val: igd.phone },
                      { label: "Tracking Number", val: igd.trackingNumber },
                      { label: "Call Duration", val: igd.callDuration },
                      { label: "Call Status", val: igd.callStatus },
                      { label: "Zip Code", val: igd.zip },
                      { label: "City", val: igd.city },
                      { label: "State", val: igd.state },
                      { label: "Reason for Contact", val: igd.reason },
                      { label: "Message", val: igd.message },
                      { label: "Profile", val: igd.profile },
                      { label: "Form Name", val: igd.formName },
                      { label: "Lead ID", val: igd.leadId },
                      { label: "Lead Page", val: igd.leadPage },
                      { label: "Landing Page", val: igd.landingPage },
                    ].filter(f => f.val);
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`#FFF7ED`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:"3px solid #F97316"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F97316" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:"#F97316"}}>Ignite Lead Data</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Received {c.createdAt ? new Date(c.createdAt + "T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "—"}</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
                          {fields.map((f, i) => (
                            <div key={i} style={{display:"flex",gap:6,fontSize:11,lineHeight:1.5}}>
                              <span style={{fontWeight:700,color:C.textSec,minWidth:110,flexShrink:0}}>{f.label}:</span>
                              <span style={{color:C.text,wordBreak:"break-word"}}>{f.val}</span>
                            </div>
                          ))}
                        </div>
                        {(igd.igniteProfileId && igd.leadId || igd.callRecordingUrl) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #F9731630",display:"flex",gap:8,flexWrap:"wrap"}}>
                            {igd.igniteProfileId && igd.leadId && (
                              <a href={`https://leads.idigitalstrategies.com/profile/${igd.igniteProfileId}/leads?lid=${igd.leadId}`} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:"#F97316",textDecoration:"none",padding:"4px 10px",borderRadius:6,border:"1px solid #F9731640",background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background="#FFF7ED"}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                View in Ignite Dashboard ↗
                              </a>
                            )}
                            {igd.callRecordingUrl && (
                              <a href={igd.callRecordingUrl} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:C.pri,textDecoration:"none",padding:"4px 10px",borderRadius:6,border:`1px solid ${C.pri}40`,background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                🎧 Listen to Call Recording ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {expandedDraft === c.id && (() => {
                    const draft = bookingDrafts.find(d => {
                      const cd = d.client_data || {};
                      return (cd.phone && cd.phone === c.fields?.phone) || (cd.email && cd.email === c.fields?.email);
                    });
                    if (!draft) return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <span style={{fontSize:12,color:C.textMut}}>No booking draft data found for this customer.</span>
                      </div>
                    );
                    const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                    const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* ── Standalone booking draft entries (visitors not yet in system) ── */}
            {bookingDrafts.length > 0 && (() => {
              // Find drafts that don't match any existing client
              const clientPhones = new Set(data.clients.map(c => (c.fields?.phone || "").replace(/\D/g, "")).filter(Boolean));
              const clientEmails = new Set(data.clients.map(c => (c.fields?.email || "").toLowerCase()).filter(Boolean));
              const unmatchedDrafts = bookingDrafts.filter(d => {
                const cd = d.client_data || {};
                const dPhone = (cd.phone || "").replace(/\D/g, "");
                const dEmail = (cd.email || "").toLowerCase();
                const matchesClient = (dPhone && clientPhones.has(dPhone)) || (dEmail && clientEmails.has(dEmail));
                return !matchesClient;
              });
              // If "online" source filter is active but no other filter, show unmatched drafts
              // If any source filter is active that ISN'T "online", hide them
              if (sourceFilter.size > 0 && !sourceFilter.has("online")) return null;
              if (unmatchedDrafts.length === 0) return null;
              const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
              return unmatchedDrafts.map(draft => {
                const cd = draft.client_data || {};
                const dd = draft.dog_data || {};
                const draftName = [cd.firstName, cd.lastName].filter(Boolean).join(" ") || "Anonymous Visitor";
                const draftPhone = cd.phone || "";
                const draftDogName = dd.name || "";
                const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                const isExpanded = expandedDraft === draft.id;
                return (
                  <div key={`draft-${draft.id}`}>
                    <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s",background:`${C.pri}04`}}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`} onMouseLeave={e=>e.currentTarget.style.background=`${C.pri}04`}>
                      <div style={{fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        {draftName}
                      </div>
                      <div style={{fontSize:11}}>{draftPhone ? fmtPhone(draftPhone) : <span style={{color:C.textMut}}>—</span>}</div>
                      <div style={{fontSize:11}}>{draftDogName || <span style={{color:C.textMut}}>—</span>}</div>
                      <div>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${C.pri}10`,border:`1px solid ${C.pri}30`,borderRadius:6,padding:"2px 8px",cursor:"pointer"}} onClick={() => setExpandedDraft(prev => prev === draft.id ? null : draft.id)}>
                          <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                          <span style={{fontSize:10,color:C.pri,fontWeight:600}}>{draft.completion_pct||0}%</span>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" style={{transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </div>
                      <div style={{fontSize:10,color:C.textSec}}>{draft.updated_at ? new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric"}) + " " + new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "—"}</div>
                      <div style={{fontSize:10,color:C.textMut,fontStyle:"italic"}}>In-progress booking</div>
                      <div><span style={{color:C.textMut,fontSize:10}}>—</span></div>
                      <div></div>
                    </div>
                    {isExpanded && (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                        {(cd.firstName || cd.email || cd.phone) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.pri}20`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px"}}>
                            {cd.firstName && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Name:</span> <span style={{color:C.text}}>{cd.firstName} {cd.lastName||""}</span></div>}
                            {cd.email && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Email:</span> <span style={{color:C.text}}>{cd.email}</span></div>}
                            {cd.phone && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Phone:</span> <span style={{color:C.text}}>{cd.phone}</span></div>}
                            {dd.name && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Dog:</span> <span style={{color:C.text}}>{dd.name}{dd.breed ? ` (${dd.breed})` : ""}</span></div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </>;
        })()}

        {activeTab === "retention" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div style={colHeaderStyle("lastRes")} onClick={()=>handleSort("lastRes")}>Last Res <SortIcon col="lastRes"/></div>
              <div style={colHeaderStyle("totalPaid")} onClick={()=>handleSort("totalPaid")}>Paid <SortIcon col="totalPaid"/></div>
              <div style={colHeaderStyle("totalAppts")} onClick={()=>handleSort("totalAppts")}>Appts <SortIcon col="totalAppts"/></div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No retention clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const s = clientStats[c.id] || {};
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.retention?.updates || [];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "retention")}</div>
                    <div>{renderNotes(c, "retention")}</div>
                    <div>{renderUpdatesLog(c, "retention")}</div>
                    <div style={{fontSize:11}}>{s.lastRes ? <><span>{fmtDate(s.lastRes.checkIn)}</span></> : <span style={{color:C.textMut}}>—</span>}</div>
                    <div style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
                    <div style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>;
        })()}

        {activeTab === "cold" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("coldDate")} onClick={()=>handleSort("coldDate")}>Date Cold <SortIcon col="coldDate"/></div>
              <div>Last Notes</div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No cold clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const fromTab = c.lifecycle?.coldFrom || "conversion";
              const lastUpdate = c.lifecycle?.[fromTab]?.updates?.[0];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div style={{fontSize:11}}>{c.lifecycle?.coldDate ? fmtDate(c.lifecycle.coldDate) : "—"}</div>
                    <div style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{lastUpdate?.notes || <span style={{color:C.textMut}}>—</span>}</div>
                    <div>{renderReviveBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}

        {(activeTab === "active" || activeTab === "all") && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("last_name")} onClick={()=>handleSort("last_name")}>Last <SortIcon col="last_name"/></div>
              <div style={colHeaderStyle("first_name")} onClick={()=>handleSort("first_name")}>First <SortIcon col="first_name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              {shownDataCols.map(k => {
                const labels = {totalRes:"Res",lastRes:"Last Res",daysSince:"Days",daycare:"DC",boarding:"BD",eval:"Eval",postEval:"P-Eval",tours:"Tours",postTour:"P-Tour",totalSpent:"Spent",nextRes:"Next"};
                return <div key={k} style={colHeaderStyle(k)} onClick={()=>handleSort(k)}>{labels[k]||k} <SortIcon col={k}/></div>;
              })}
              {/* Column toggle moved to search bar */}
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const s = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div><span onClick={()=>nav("client-detail",{clientId:c.id})} style={{fontWeight:700,color:C.pri,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{c.fields.last_name||""}</span></div>
                    <div style={{color:C.text}}>{c.fields.first_name||""}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{fmtPhone?.(c.fields.phone)||c.fields.phone||""}</div>
                    <div>{renderDogCount(c)}</div>
                    {shownDataCols.map(k => {
                      switch(k) {
                        case "totalRes": return <div key={k} style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>;
                        case "lastRes": return <div key={k} style={{fontSize:11}}>{s.lastRes ? fmtDate(s.lastRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        case "daysSince": {
                          const d = s.daysSinceLast;
                          const col = d==null?C.textMut:d>180?C.dan:d>90?C.acc:d>60?C.text:C.suc;
                          return <div key={k} style={{fontSize:11,fontWeight:700,color:col}}>{d!=null?d:"—"}</div>;
                        }
                        case "daycare": return <div key={k} style={{fontSize:11}}>{s.daycareCount||0}</div>;
                        case "boarding": return <div key={k} style={{fontSize:11}}>{s.boardingCount||0}</div>;
                        case "eval": return <div key={k} style={{fontSize:11}}>{s.evalCount||0}</div>;
                        case "postEval": return <div key={k} style={{fontSize:11}}>{s.postEvalAppts||0}</div>;
                        case "tours": return <div key={k} style={{fontSize:11}}>{s.tourCount||0}</div>;
                        case "postTour": return <div key={k} style={{fontSize:11}}>{s.postTourAppts||0}</div>;
                        case "totalSpent": return <div key={k} style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>;
                        case "nextRes": return <div key={k} style={{fontSize:11}}>{s.nextRes ? fmtDate(s.nextRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        default: return <div key={k}></div>;
                      }
                    })}
                    <div></div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}
      </Card>

      {/* Mass Text Modal */}
      {showMassText && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={() => setShowMassText(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:12,border:`1.5px solid ${C.border}`,width:"90%",maxWidth:700,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.text}}>Mass Text</h2>
                <p style={{margin:"4px 0 0",fontSize:12,color:C.textSec}}>{massTextSelected.size} client{massTextSelected.size !== 1 ? "s" : ""} selected</p>
              </div>
              <button onClick={() => setShowMassText(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"4px 8px",color:C.textMut,fontSize:20,fontFamily:"inherit"}}>×</button>
            </div>

            {/* Body */}
            <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
              {/* Client List */}
              <div style={{flex:1,overflow:"auto",borderBottom:`1.5px solid ${C.borderLight}`,maxHeight:300}}>
                <div style={{padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    <Btn size="sm" variant="ghost" onClick={() => setMassTextSelected(new Set(activeList.filter(c => c.fields?.phone).map(c => c.id)))}>
                      Select All
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setMassTextSelected(new Set())}>
                      Deselect All
                    </Btn>
                  </div>
                  {activeList.filter(c => c.fields?.phone).map(client => (
                    <div key={client.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 8px",borderRadius:8,background:massTextSelected.has(client.id)?C.priLt:"transparent",marginBottom:8,cursor:"pointer"}} onClick={() => {
                      const n = new Set(massTextSelected);
                      if (n.has(client.id)) n.delete(client.id);
                      else n.add(client.id);
                      setMassTextSelected(n);
                    }}>
                      <input type="checkbox" checked={massTextSelected.has(client.id)} onChange={() => {}} style={{cursor:"pointer",width:18,height:18}} />
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.text}}>{client.fields?.first_name} {client.fields?.last_name}</div>
                        <div style={{fontSize:11,color:C.textSec}}>{client.fields?.phone}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Compose */}
              <div style={{padding:"16px 20px",borderBottom:`1.5px solid ${C.borderLight}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <label style={{fontSize:12,fontWeight:700,color:C.text}}>Message</label>
                  {(data.messageTemplates || []).filter(t => t.active !== false).length > 0 && (
                    <div style={{position:"relative"}}>
                      <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); const el = e.currentTarget; el.dataset.open = el.dataset.open === "1" ? "" : "1"; el.nextSibling.style.display = el.dataset.open === "1" ? "block" : "none"; }}>
                        <I.FileText /> Use Template
                      </Btn>
                      <div style={{display:"none",position:"absolute",right:0,top:"100%",zIndex:10,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",minWidth:240,maxHeight:200,overflow:"auto"}}>
                        {(data.messageTemplates || []).filter(t => t.active !== false).map(tpl => (
                          <button key={tpl.id} onClick={e => { setMassTextBody(tpl.body); e.currentTarget.parentNode.style.display = "none"; e.currentTarget.parentNode.previousSibling.dataset.open = ""; }}
                            style={{display:"block",width:"100%",padding:"10px 14px",border:"none",borderBottom:`1px solid ${C.borderLight}`,background:"transparent",textAlign:"left",cursor:"pointer",fontFamily:"inherit",fontSize:12,color:C.text}}
                            onMouseEnter={e => e.currentTarget.style.background = C.priLt}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <div style={{fontWeight:600,marginBottom:2}}>{tpl.name}</div>
                            <div style={{color:C.textSec,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tpl.body.slice(0,80)}…</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <textarea
                  value={massTextBody}
                  onChange={e => setMassTextBody(e.target.value)}
                  placeholder="Type your message here or use a template..."
                  rows={4}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",background:C.bg,boxSizing:"border-box"}}
                  onFocus={e => e.target.style.borderColor=C.pri}
                  onBlur={e => e.target.style.borderColor=C.border}
                />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,marginBottom:12}}>
                  <div style={{fontSize:11,color:C.textMut}}>Character count: {massTextBody.length}</div>
                  <div style={{fontSize:10,color:C.textSec}}>Variables will be personalized per client</div>
                </div>
                {/* Available Template Variables Reference (Item 18) */}
                <div style={{padding:12,background:C.bg,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:8}}>Available Variables</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,fontSize:11,color:C.text}}>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{clientName}"}</code> — Client first &amp; last name</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{dogName}"}</code> — Dog's name</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{checkInDate}"}</code> — Check-in date</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{checkOutDate}"}</code> — Check-out date</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{roomType}"}</code> — Room type</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{totalPrice}"}</code> — Total cost</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{padding:"16px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center"}}>
              <button onClick={() => setShowMassTextHistory(true)} style={{background:"none",border:"none",color:C.pri,cursor:"pointer",fontSize:12,fontWeight:600,textDecoration:"underline",padding:0,fontFamily:"inherit"}}>
                View History
              </button>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="ghost" onClick={() => setShowMassText(false)}>Cancel</Btn>
                <Btn onClick={handleMassTextSend} disabled={!massTextBody.trim() || massTextSelected.size === 0}>
                  Send Mass Text
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mass Text History Modal */}
      {showMassTextHistory && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10001}} onClick={() => setShowMassTextHistory(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:12,border:`1.5px solid ${C.border}`,width:"90%",maxWidth:800,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.text}}>Mass Text History</h2>
              <button onClick={() => setShowMassTextHistory(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"4px 8px",color:C.textMut,fontSize:20,fontFamily:"inherit"}}>×</button>
            </div>

            {/* Body */}
            <div style={{flex:1,overflow:"auto"}}>
              {(!data.massTextHistory || data.massTextHistory.length === 0) ? (
                <div style={{padding:"40px 24px",textAlign:"center"}}>
                  <p style={{color:C.textSec,fontSize:13}}>No mass texts sent yet</p>
                </div>
              ) : (
                <div>
                  {data.massTextHistory.map(entry => (
                    <div key={entry.id} style={{padding:"16px 20px",borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                            {entry.recipientCount} client{entry.recipientCount !== 1 ? "s" : ""}
                          </div>
                          <div style={{fontSize:11,color:C.textSec,marginTop:2}}>
                            {new Date(entry.sentAt).toLocaleDateString()} at {new Date(entry.sentAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} by {entry.sentBy}
                          </div>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:C.text,marginBottom:10,padding:"10px 12px",background:C.surface,borderRadius:6,borderLeft:`3px solid ${C.pri}`}}>
                        "{entry.body}"
                      </div>
                      <div style={{fontSize:11,color:C.textSec}}>
                        Recipients: {entry.recipientNames.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:"16px 20px",borderTop:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={() => setShowMassTextHistory(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Log Popover */}
      {logPopover && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9998}} onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",left:Math.min(logPopover.x||300,window.innerWidth-340),top:logPopover.y||200,zIndex:9999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 20px",width:310,boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>{logPopover.isRevive ? "Revive Client" : "Log Outreach"}</div>
            <textarea value={logNotes} onChange={e=>setLogNotes(e.target.value)} placeholder="Notes about this outreach..." rows={3}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",resize:"vertical",outline:"none",background:C.bg,boxSizing:"border-box",marginBottom:10}}
              onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border} autoFocus />
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:4}}>Next Follow-Up Date *</div>
              {(() => {
                const c = data.clients.find(cl => cl.id === logPopover.clientId);
                const src = c?.lifecycle?.conversion?.source;
                const isHighIntent = src === "eval" || src === "tour" || src === "ignite";
                const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
                const recDate = isHighIntent ? addD(1) : addD(2);
                const recHint = isHighIntent ? "Recommended: +1 day (high-intent lead). Use a further date if the client gave a specific callback date." : "Recommended: +2 days (standard follow-up). Use +1 day for high-intent leads or a further date if the client gave a specific callback date.";
                return <MiniDatePicker value={logDate} onChange={setLogDate} recommendedDate={recDate} recommendedHint={recHint} />;
              })()}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <Btn size="sm" variant="ghost" onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>Cancel</Btn>
              <Btn size="sm" onClick={handleSaveLog}>{logPopover.isRevive ? "Revive" : "Save Log"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OPERATIONS HUB (from POS App) ────────────────────────────────────────
function OperationsHub({ data, save, nav, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };
  const dateLbl = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hp = (k) => hasPermission(profile, data, k);

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date(viewDate + "T12:00:00").getMonth());
  const [calYear, setCalYear] = useState(() => new Date(viewDate + "T12:00:00").getFullYear());
  useEffect(() => { const d = new Date(viewDate + "T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => { const first = new Date(calYear, calMonth, 1); const startDay = first.getDay(); const dim = new Date(calYear, calMonth + 1, 0).getDate(); const cells = []; for (let i = 0; i < startDay; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); return cells; }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => { const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); setViewDate(`${calYear}-${m}-${d}`); setShowCalendar(false); };
  const calRef = useRef(null);
  useEffect(() => { if (!showCalendar) return; const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }, [showCalendar]);

  // Today's Progress snapshot
  const [showTodayProgress, setShowTodayProgress] = useState(false);

  // Summary analytics
  const [expandSummary, setExpandSummary] = useState(false);
  const summaryStats = useMemo(() => {
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    // Today stats
    const todayCompleted = activeItems.filter(c => getOpsCardStatus(data, c, viewDate) === "completed").length;
    const todayTotal = activeItems.length;
    const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
    // Weekly averages (past 7 days)
    const weeklyByChecklist = {};
    const lastWeekByChecklist = {};
    for (let i = 0; i < 14; i++) {
      const d = addDays(viewDate, -i);
      activeItems.forEach(item => {
        const status = getOpsCardStatus(data, item, d);
        const completed = status === "completed" ? 1 : 0;
        if (i < 7) {
          if (!weeklyByChecklist[item.label]) weeklyByChecklist[item.label] = { sum: 0, count: 0 };
          weeklyByChecklist[item.label].sum += completed;
          weeklyByChecklist[item.label].count++;
        } else {
          if (!lastWeekByChecklist[item.label]) lastWeekByChecklist[item.label] = { sum: 0, count: 0 };
          lastWeekByChecklist[item.label].sum += completed;
          lastWeekByChecklist[item.label].count++;
        }
      });
    }
    // MTD averages
    const mtdByChecklist = {};
    const dObj = new Date(viewDate + "T12:00:00");
    const dayOfMonth = dObj.getDate();
    for (let i = 0; i < dayOfMonth; i++) {
      const d = addDays(viewDate, -i);
      activeItems.forEach(item => {
        const status = getOpsCardStatus(data, item, d);
        if (!mtdByChecklist[item.label]) mtdByChecklist[item.label] = { sum: 0, count: 0 };
        mtdByChecklist[item.label].sum += (status === "completed" ? 1 : 0);
        mtdByChecklist[item.label].count++;
      });
    }
    // Build per-checklist rows
    const rows = activeItems.map(item => {
      const wk = weeklyByChecklist[item.label] || { sum: 0, count: 1 };
      const lw = lastWeekByChecklist[item.label] || { sum: 0, count: 1 };
      const mt = mtdByChecklist[item.label] || { sum: 0, count: 1 };
      const weeklyAvg = Math.round((wk.sum / wk.count) * 100);
      const lastWeekAvg = Math.round((lw.sum / lw.count) * 100);
      const mtdAvg = Math.round((mt.sum / mt.count) * 100);
      const wowDiff = weeklyAvg - lastWeekAvg;
      return { label: item.label, weeklyAvg, lastWeekAvg, wowDiff, mtdAvg };
    });
    return { todayCompleted, todayTotal, todayPct, rows };
  }, [data, viewDate]);

  // ─── Today's Progress snapshot data ───
  const todayProgressData = useMemo(() => {
    const reservations = data.reservations || [];
    const allOps = data.dailyOps || [];
    const dogs = data.dogs || [];

    // Dogs in house: checked-in only (matches dashboard logic)
    const inHouse = reservations.filter(r => r.status === "checked-in" && r.checkIn <= viewDate && r.checkOut >= viewDate);
    const inHouseBoarding = inHouse.filter(r => r.type === "boarding");
    const inHouseDaycare = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding");
    const dogsInHouse = inHouse.length;

    // Going home today (checked-in, checkOut === viewDate) — matches dashboard "Going Home"
    const goingHome = reservations.filter(r => r.status === "checked-in" && r.checkOut === viewDate);
    // Already checked out today
    const checkedOut = reservations.filter(r => r.checkOut === viewDate && r.status === "checked-out");

    // Room cleaning stats + awaiting checkout count
    const roomStats = getRoomCleaningStats(data, viewDate);
    const allRooms = data.rooms || {};
    const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");
    let roomsAwaitingCheckout = 0;
    ROOM_TYPES.forEach(rt => {
      (allRooms[rt] || []).forEach(rm => {
        const activeRes = inHouseBoarding.find(r => r.room === rm);
        const coRes = boardingCheckedOut.find(r => r.room === rm);
        // Needs disinfect (checkOut === viewDate) but dog hasn't checked out yet
        if (activeRes && activeRes.checkOut === viewDate && !coRes) roomsAwaitingCheckout++;
      });
    });

    // Baths: checked-in dogs checking out today that have a bath type (includes departure time)
    const bathRows = [];
    inHouse.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      if (!dog) return;
      const bath = res.careOverrides?.bath_type || dog.fields.bath_type || "";
      if (bath && res.checkOut === viewDate) {
        const logKey = `${viewDate}|bathing`;
        const administered = !!(res.activityLog && res.activityLog[logKey] && res.activityLog[logKey].administered);
        const coTime = res.checkOutTime || "";
        bathRows.push({ dogName: dog.fields.name, bathType: bath, done: administered, checkOutTime: coTime });
      }
    });
    const bathsTotal = bathRows.length;
    const bathsDone = bathRows.filter(b => b.done).length;

    // Pictures: boarding dogs not on first or last day (same logic as renderPictures)
    const pictureDogs = reservations.filter(r => r.type === "boarding" && r.status === "checked-in" && r.checkIn < viewDate && r.checkOut > viewDate);
    const picEntryId = `ops_pictures_${viewDate}`;
    const picEntry = allOps.find(e => e.id === picEntryId);
    const picItems = picEntry ? picEntry.items || {} : {};
    const picturesTotal = pictureDogs.length;
    const picturesDone = pictureDogs.filter(r => picItems[r.dogId]).length;

    // Private play stats (3 required sessions per dog)
    const ppStats = getPPStats(data, viewDate);
    const ppEntryId = `ops_pp_${viewDate}`;
    const ppEntry = allOps.find(e => e.id === ppEntryId);
    const ppItems = ppEntry ? ppEntry.items || {} : {};
    let ppLastTime = null;
    Object.values(ppItems).forEach(d => {
      if (d && d.sessions) d.sessions.forEach(s => { if (s.time) ppLastTime = s.time; });
    });

    // Checklist progress for each ops type
    const checklistProgress = {};
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    activeItems.forEach(item => {
      const progress = getOpsProgress(data, item, viewDate);
      const status = getOpsCardStatus(data, item, viewDate);
      const countLabel = getOpsCountLabel(data, item, viewDate);
      checklistProgress[item.typeSub || item.id] = { label: item.label, progress, status, countLabel };
    });

    // Closing procedures specifically
    const closingEntryId = `ops_closing_${viewDate}`;
    const closingEntry = allOps.find(e => e.id === closingEntryId);
    const closingTemplate = data.closingTemplate || DEF_CLOSING_TEMPLATE;
    const dayIdx = new Date(viewDate + "T12:00:00").getDay();
    const closingItems = closingTemplate.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const closingTotal = closingItems.length;
    let closingDone = 0;
    if (closingEntry && closingEntry.items) {
      const ci = closingEntry.items;
      closingDone = !Array.isArray(ci) ? Object.values(ci).filter(i => i && i.checked).length : ci.filter(i => i.checked).length;
    }

    // ─── Lifecycle stats ───
    const clients = data.clients || [];
    const payments = data.payments || [];

    // Build local stage map (mirrors Customer Lifecycle page's clientTabMap logic)
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    const localStageMap = {};
    clients.forEach(c => {
      const cRes = (data.reservations || []).filter(r => r.clientId === c.id);
      const cDogs = (data.dogs || []).filter(d => d.clientId === c.id);
      const cPmts = (data.payments || []).filter(p => p.clientId === c.id && p.status === "completed" && p.type !== "refund");
      const totalSpent = cPmts.reduce((s, p) => s + (p.amount || 0), 0);
      const hasSpent = totalSpent > 0;
      const hasRealBooking = cRes.some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");
      const totalRes = cRes.length;
      const pastRes = cRes.filter(r => r.checkOut && r.checkOut < todayStr()).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
      const daysSince = pastRes.length > 0 ? Math.floor((new Date() - new Date(pastRes[0].checkOut + "T12:00:00")) / 86400000) : null;
      const daycareCount = cRes.filter(r => r.type === "daycare").length;
      const boardingCount = cRes.filter(r => r.type === "boarding").length;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;
      if (hasSpent && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const dcPct = totalRes > 0 ? (daycareCount / totalRes) : 0;
        const bdPct = totalRes > 0 ? (boardingCount / totalRes) : 0;
        if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
        else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
        else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
      }
      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      localStageMap[c.id] = { isConversion, isActive, isRetention: isRetention && !isCold, isCold };
    });

    // Overdue follow-ups: only count clients actually in conversion or retention stages
    let overdueFollowUps = 0;
    let dueTodayFollowUps = 0;
    clients.forEach(c => {
      const tab = localStageMap[c.id];
      // Only count conversion follow-ups for clients in conversion stage
      const convFu = (tab?.isConversion && c.lifecycle?.conversion?.followUpDate) || "";
      // Only count retention follow-ups for clients in retention stage
      const retFu = (tab?.isRetention && c.lifecycle?.retention?.followUpDate) || "";
      const fu = convFu || retFu;
      if (fu && fu < viewDate) overdueFollowUps++;
      if (fu && fu === viewDate) dueTodayFollowUps++;
    });

    // Lifecycle logs/updates made today (conversion + retention updates with loggedAt on viewDate)
    let logsToday = 0;
    clients.forEach(c => {
      const convUpdates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      [...convUpdates, ...retUpdates].forEach(u => {
        if (u.loggedAt && u.loggedAt.startsWith(viewDate)) logsToday++;
      });
    });

    // New customers created today
    const newCustomersToday = clients.filter(c => {
      const ca = c.createdAt || "";
      return ca.startsWith(viewDate) || ca === viewDate;
    }).length;

    // New PAYING customers: clients whose first-ever completed payment was on viewDate
    let newPayingToday = 0;
    const paymentsByClient = {};
    payments.filter(p => p.status === "completed" && p.type !== "refund").forEach(p => {
      if (!paymentsByClient[p.clientId]) paymentsByClient[p.clientId] = [];
      paymentsByClient[p.clientId].push(p);
    });
    Object.entries(paymentsByClient).forEach(([cid, pmts]) => {
      pmts.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
      const first = pmts[0];
      if (first && first.timestamp && first.timestamp.startsWith(viewDate)) newPayingToday++;
    });

    return {
      dogsInHouse,
      boardingCount: inHouseBoarding.length,
      daycareCount: inHouseDaycare.length,
      goingHome: goingHome.length,
      checkedOut: checkedOut.length,
      roomStats,
      roomsAwaitingCheckout,
      bathsTotal,
      bathsDone,
      bathRows,
      picturesTotal,
      picturesDone,
      ppTotalDogs: ppStats.totalDogs,
      ppRequiredSessions: ppStats.requiredSessions,
      ppCompletedRequired: ppStats.completedSessions,
      ppTotalLogged: ppStats.totalLogged,
      ppLastTime,
      checklistProgress,
      closingTotal,
      closingDone,
      overdueFollowUps,
      dueTodayFollowUps,
      logsToday,
      newCustomersToday,
      newPayingToday,
    };
  }, [data, viewDate]);

  const groups = [
    { key: "daily", label: "Daily Operations", items: OPERATIONS_CATALOG.filter(c => c.frequency === "daily") },
    { key: "weekly", label: "Weekly Maintenance", items: OPERATIONS_CATALOG.filter(c => c.frequency === "weekly") },
    { key: "monthly", label: "Monthly Inspections", items: OPERATIONS_CATALOG.filter(c => c.frequency === "monthly") },
  ];

  const statusConfig = {
    not_started: { label: "Not Started", bg: "#F3F4F6", color: "#6B7280", barColor: "#E5E7EB" },
    in_progress: { label: "In Progress", bg: "#FEF3C7", color: "#D97706", barColor: "#F59E0B" },
    completed: { label: "Completed", bg: "#D1FAE5", color: "#059669", barColor: "#10B981" },
    coming_soon: { label: "Coming Soon", bg: "#F3F4F6", color: "#9CA3AF", barColor: "#E5E7EB" },
    none: { label: "", bg: "transparent", color: "transparent", barColor: "transparent" },
  };

  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header with date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Operations</h2>
          <button onClick={() => setShowTodayProgress(v => !v)} style={{ border: "none", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: showTodayProgress ? C.pri : C.accLt, color: showTodayProgress ? "#fff" : C.accDk, transition: "all 0.2s", letterSpacing: "0.02em" }}>
            {showTodayProgress ? "✕ Close" : "Today's Progress"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
          <button onClick={() => setShowCalendar(v => !v)} style={{ ...nbtn, background: "transparent", color: C.text, minWidth: 220, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{dateLbl}</button>
          <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
          {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
          {showCalendar && (
            <div ref={calRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 100, width: 280 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button onClick={calPrev} style={{ ...nbtn, background: C.surfaceHover }}>‹</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                <button onClick={calNext} style={{ ...nbtn, background: C.surfaceHover }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.textMut, padding: 4 }}>{d}</div>)}
                {calDays.map((d, i) => d ? (
                  <button key={i} onClick={() => calSelect(d)} style={{ border: "none", borderRadius: 6, padding: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? C.pri : "transparent", color: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? "#fff" : C.text }}>{d}</button>
                ) : <div key={i} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Progress snapshot */}
      {showTodayProgress && (() => {
        const tp = todayProgressData;
        const cp = tp.checklistProgress;
        const pctBar = (done, total, color) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pct === 100 ? C.suc : color || C.pri, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? C.suc : C.text, minWidth: 38, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        };
        const metricCard = (label, value, sub, accent) => (
          <div style={{ background: C.surface, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.border}`, flex: "1 1 140px", minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent || C.pri, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{sub}</div>}
          </div>
        );
        const progressRow = (label, done, total, color) => (
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: done >= total && total > 0 ? C.suc : C.text }}>{done}/{total}</span>
            </div>
            {pctBar(done, total, color)}
          </div>
        );
        // Parse checklist count labels like "3/7 tasks" or "2/5 rooms"
        const parseCount = (countLabel) => {
          if (!countLabel) return { done: 0, total: 0 };
          const m = countLabel.match(/^(\d+)\/(\d+)/);
          return m ? { done: parseInt(m[1]), total: parseInt(m[2]) } : { done: 0, total: 0 };
        };
        return (
          <div style={{ marginBottom: 20, background: `linear-gradient(135deg, ${C.priLt} 0%, #F8F6F0 100%)`, borderRadius: 18, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
            {/* Header bar */}
            <div style={{ background: C.pri, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>Today's Progress</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>{isToday ? "Live" : dateLbl}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Read-Only Snapshot</span>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Top metric cards */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                {metricCard("Dogs In House", tp.dogsInHouse, `${tp.boardingCount} boarding · ${tp.daycareCount} daycare`, C.pri)}
                {metricCard("Going Home", tp.goingHome, "departures today", "#D97706")}
                {metricCard("Checked Out", tp.checkedOut, "completed today", C.suc)}
              </div>

              {/* Two-column layout for progress details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Left column: Room Cleaning & Baths */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Cleaning & Baths</div>

                  {progressRow("Room Cleaning", tp.roomStats.totalDone, tp.roomStats.totalNeeded, C.pri)}
                  {tp.roomsAwaitingCheckout > 0 && (
                    <div style={{ padding: "4px 0 6px", fontSize: 11, color: C.warn, fontWeight: 600 }}>
                      {tp.roomsAwaitingCheckout} room{tp.roomsAwaitingCheckout !== 1 ? "s" : ""} awaiting checkout for disinfect
                    </div>
                  )}

                  <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Baths</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tp.bathsDone >= tp.bathsTotal && tp.bathsTotal > 0 ? C.suc : C.text }}>{tp.bathsDone}/{tp.bathsTotal}</span>
                    </div>
                    {pctBar(tp.bathsDone, tp.bathsTotal, C.acc)}
                    {tp.bathRows.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {tp.bathRows.map((b, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSec, padding: "2px 0" }}>
                            <span style={{ width: 14, height: 14, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, background: b.done ? C.sucLt : C.borderLight, color: b.done ? C.suc : C.textMut }}>{b.done ? "✓" : "○"}</span>
                            <span style={{ fontWeight: 600 }}>{b.dogName}</span>
                            <span style={{ color: C.textMut }}>({b.bathType})</span>
                            {b.checkOutTime && <span style={{ color: C.acc, fontWeight: 600 }}>· out {(() => { const [h,m] = b.checkOutTime.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; })()}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pictures */}
                  {progressRow("Pictures", tp.picturesDone, tp.picturesTotal, C.info)}
                </div>

                {/* Right column: Private Play & Checklists */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Checklists & Activities</div>

                  {/* Private Play */}
                  {progressRow("Private Play", tp.ppCompletedRequired, tp.ppRequiredSessions, C.pri)}
                  <div style={{ padding: "2px 0 8px", display: "flex", gap: 16, fontSize: 11, color: C.textSec }}>
                    <span>{tp.ppTotalDogs} dog{tp.ppTotalDogs !== 1 ? "s" : ""} · {tp.ppTotalLogged} total session{tp.ppTotalLogged !== 1 ? "s" : ""}</span>
                    {tp.ppLastTime && <span style={{ color: C.textMut }}>Last: {tp.ppLastTime}</span>}
                  </div>

                  {/* Opening Checklist */}
                  {cp.opening && (() => {
                    const oc = parseCount(cp.opening.countLabel);
                    return progressRow("Opening Checklist", oc.done, oc.total, C.pri);
                  })()}

                  {/* Front-End Checklist */}
                  {cp.fe && (() => {
                    const fc = parseCount(cp.fe.countLabel);
                    return progressRow("Front-End Checklist", fc.done, fc.total, C.acc);
                  })()}

                  {/* Back-End Checklist */}
                  {cp.be && (() => {
                    const bc = parseCount(cp.be.countLabel);
                    return progressRow("Back-End Checklist", bc.done, bc.total, C.acc);
                  })()}

                  {/* Closing Procedures */}
                  {progressRow("Closing Procedures", tp.closingDone, tp.closingTotal, C.dan)}
                </div>
              </div>

              {/* Lifecycle & Customer Stats */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Customer Lifecycle</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                  {/* Overdue Follow-Ups */}
                  <div style={{ background: tp.overdueFollowUps > 0 ? C.danLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.overdueFollowUps > 0 ? C.dan + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Overdue Follow-Ups</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.overdueFollowUps > 0 ? C.dan : C.suc, lineHeight: 1 }}>{tp.overdueFollowUps}</div>
                    {tp.overdueFollowUps > 0 && <div style={{ fontSize: 11, color: C.dan, marginTop: 3, fontWeight: 600 }}>overdue</div>}
                  </div>
                  {/* Due Today */}
                  <div style={{ background: tp.dueTodayFollowUps > 0 ? C.warnLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.dueTodayFollowUps > 0 ? C.warn + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Due Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.dueTodayFollowUps > 0 ? C.warn : C.textMut, lineHeight: 1 }}>{tp.dueTodayFollowUps}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>follow-ups scheduled</div>
                  </div>
                  {/* Logs Today */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Logs Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.logsToday > 0 ? C.pri : C.textMut, lineHeight: 1 }}>{tp.logsToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>updates recorded</div>
                  </div>
                  {/* New Customers */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>New Customers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newCustomersToday > 0 ? C.info : C.textMut, lineHeight: 1 }}>{tp.newCustomersToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>created today</div>
                  </div>
                  {/* New Paying Customers */}
                  <div style={{ background: tp.newPayingToday > 0 ? C.sucLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.newPayingToday > 0 ? C.suc + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>First-Time Payers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newPayingToday > 0 ? C.suc : C.textMut, lineHeight: 1 }}>{tp.newPayingToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>first payment today</div>
                  </div>
                </div>
              </div>

              {/* Overall progress footer */}
              <div style={{ marginTop: 20, padding: "14px 20px", background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Overall Checklists</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: summaryStats.todayPct === 100 ? C.suc : C.pri }}>{summaryStats.todayPct}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{summaryStats.todayCompleted} of {summaryStats.todayTotal} complete</span>
                  <div style={{ width: 120, height: 8, borderRadius: 4, background: C.borderLight, overflow: "hidden" }}>
                    <div style={{ width: `${summaryStats.todayPct}%`, height: "100%", borderRadius: 4, background: summaryStats.todayPct === 100 ? C.suc : C.pri, transition: "width 0.3s" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary section */}
      <Card style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpandSummary(v => !v)}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {isToday ? "Today" : dateLbl}: <span style={{ color: summaryStats.todayCompleted === summaryStats.todayTotal && summaryStats.todayTotal > 0 ? "#059669" : C.text }}>{summaryStats.todayCompleted}/{summaryStats.todayTotal}</span> completed ({summaryStats.todayPct}%)
            </span>
            <div style={{ width: 100, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${summaryStats.todayPct}%`, height: "100%", borderRadius: 3, background: summaryStats.todayPct === 100 ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          </div>
          <span style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>{expandSummary ? "Hide Details" : "View Analytics"}</span>
        </div>
        {expandSummary && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.borderLight}`, paddingTop: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>CHECKLIST</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>7-DAY AVG</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>WoW</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>MTD AVG</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>TREND</th>
                </tr>
              </thead>
              <tbody>
                {summaryStats.rows.map(row => (
                  <tr key={row.label} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "8px 8px", fontWeight: 600, color: C.text }}>{row.label}</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: row.weeklyAvg >= 80 ? "#059669" : row.weeklyAvg >= 50 ? "#D97706" : "#6B7280" }}>{row.weeklyAvg}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700, color: row.wowDiff > 0 ? "#059669" : row.wowDiff < 0 ? "#DC2626" : C.textMut }}>{row.wowDiff > 0 ? "+" : ""}{row.wowDiff}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: row.mtdAvg >= 80 ? "#059669" : row.mtdAvg >= 50 ? "#D97706" : "#6B7280" }}>{row.mtdAvg}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 14 }}>{row.wowDiff > 0 ? "↑" : row.wowDiff < 0 ? "↓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {groups.map(group => {
        const visibleItems = group.items.filter(item => item.comingSoon || !item.permission || hp(item.permission));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.key} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {group.label}
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
                ({visibleItems.length} {visibleItems.length === 1 ? "item" : "items"})
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {visibleItems.map(item => {
                const status = getOpsCardStatus(data, item, viewDate);
                const progress = getOpsProgress(data, item, viewDate);
                const countLabel = getOpsCountLabel(data, item, viewDate);
                const sc = statusConfig[status];
                const isComingSoon = item.comingSoon;
                const isEod = item.dataKey === "eodEntries";
                return (
                  <div key={item.id}
                    onClick={() => !isComingSoon && nav(item.routeTo)}
                    style={{
                      background: C.surface, borderRadius: 14, padding: "18px 20px",
                      border: `1.5px solid ${isEod ? C.border : status === "completed" ? "#10B981" : status === "in_progress" ? "#F59E0B" : C.border}`,
                      cursor: isComingSoon ? "default" : "pointer",
                      opacity: isComingSoon ? 0.55 : 1,
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                    onMouseEnter={e => { if (!isComingSoon) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.label}</div>
                      {countLabel && <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{countLabel}</div>}
                    </div>
                    {!isEod && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {sc.label}
                      </span>
                      {!isComingSoon && <span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{progress}%</span>}
                    </div>
                    )}
                    {!isComingSoon && !isEod && (
                      <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: sc.barColor, transition: "width 0.3s" }} />
                      </div>
                    )}
                    {!isComingSoon && (
                      <div style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Management Section */}
      {(hp("view_management") || hp("view_daily_ops")) && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ margin: "8px 0 18px", height: 1, background: C.borderLight }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            Management
            <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
              (Administrative Tools)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {[
              { id: "mgmt-attendance", label: "Attendance Tracker", desc: "Track tardies, call-outs, and no-shows", active: true },
              ...(hasPermission(profile, data, "view_audit_log") ? [{ id: "mgmt-audit-log", label: "Audit Log", desc: "Employee logins and system activity", active: true }] : []),
              { id: null, label: "Incident Reports", desc: "Log workplace incidents", active: false },
            ].map((tool, i) => (
              <div key={i}
                onClick={() => tool.id && nav(tool.id)}
                style={{
                  background: C.surface, borderRadius: 14, padding: "18px 20px",
                  border: `1.5px solid ${tool.active ? C.pri + "40" : C.border}`,
                  cursor: tool.active ? "pointer" : "default",
                  opacity: tool.active ? 1 : 0.55,
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={e => { if (tool.active) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tool.label}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{tool.desc}</div>
                </div>
                {!tool.active && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming Soon</span>}
                {tool.active && <span style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DAILY OPERATIONS PAGE (from POS App) ───────────────────────────────────
function DailyOpsPage({ data, save, sub, nav, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const dayIdx = new Date(viewDate + "T12:00:00").getDay();
  const meta = OPS_TYPES[sub] || OPS_TYPES.opening;
  const isTemplate = !!meta.key;

  // Date nav helpers
  const shiftDate = (d) => { const dt = new Date(viewDate + "T12:00:00"); dt.setDate(dt.getDate() + d); setViewDate(dt.toISOString().slice(0,10)); };
  const isToday = viewDate === td;
  const isPast = viewDate < td;
  const dateLbl = (() => { const d = new Date(viewDate + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); })();

  // Get or create entry
  const allOps = data.dailyOps || [];
  const entryId = `ops_${sub}_${viewDate}`;
  const existing = allOps.find(e => e.id === entryId);
  const isLocked = existing ? existing.locked : isPast;

  // Template-based items for today
  const template = isTemplate ? (data[meta.key] || meta.def) : [];
  const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);

  // Local state for editable items
  const [items, setItems] = useState({});
  const [completedBy, setCompletedBy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (existing) {
      setItems(existing.items || {});
      setCompletedBy(existing.completedBy || "");
    } else if (isTemplate) {
      const init = {};
      todayItems.forEach(t => { init[t.id] = { checked: false, initials: "" }; });
      setItems(init);
      setCompletedBy("");
    } else {
      setItems(existing ? existing.items || {} : {});
      setCompletedBy("");
    }
    setDirty(false);
  }, [viewDate, sub, data.dailyOps]);

  const toggleItem = (key, field, val) => {
    if (isLocked) return;
    const userName = profile?.full_name || "";
    // Auto-fill name when checking a checkbox
    if (field === "checked" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, initials: userName } }));
    } else if (field === "refresh" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, refreshBy: userName } }));
    } else if (field === "disinfect" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, disinfectBy: userName } }));
    } else if (field === "asNeeded" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededBy: userName } }));
    } else if (field === "asNeededDone" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededDoneBy: userName } }));
    } else {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
    }
    setDirty(true);
  };

  const saveEntry = async () => {
    const entries = [...allOps];
    const idx = entries.findIndex(e => e.id === entryId);
    const isFirstSave = idx < 0;
    const prevHistory = isFirstSave ? [] : (entries[idx].history || []);
    const newHistory = [...prevHistory, { ts: new Date().toISOString(), action: isFirstSave ? "created" : "saved" }];
    const entry = { id: entryId, type: sub, date: viewDate, locked: false, items, history: newHistory };
    if (idx >= 0) entries[idx] = entry; else entries.push(entry);
    await save({ ...data, dailyOps: entries });
    setDirty(false);
  };

  const toggleLock = async () => {
    if (isPast && isLocked) return; // Cannot unlock prior days
    const entries = [...allOps];
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx >= 0) {
      const newLocked = !entries[idx].locked;
      entries[idx] = { ...entries[idx], locked: newLocked, history: [...(entries[idx].history || []), { ts: new Date().toISOString(), action: newLocked ? "locked" : "unlocked" }] };
    } else {
      entries.push({ id: entryId, type: sub, date: viewDate, locked: true, items, history: [{ ts: new Date().toISOString(), action: "locked" }] });
    }
    await save({ ...data, dailyOps: entries });
  };

  // Progress for template checklists
  const checkedCount = isTemplate ? todayItems.filter(t => items[t.id]?.checked).length : 0;
  const totalCount = isTemplate ? todayItems.length : 0;
  const pctDone = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0;

  // ─── Dynamic data queries ───
  const allRooms = data.rooms || {};
  const boardingToday = data.reservations.filter(r => r.type === "boarding" && r.checkIn <= viewDate && r.checkOut >= viewDate && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = data.reservations.filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");

  // Picture checklist: boarding, not first day, not last day
  const pictureDogs = data.reservations.filter(r => r.type === "boarding" && r.status === "checked-in" && r.checkIn < viewDate && r.checkOut > viewDate);

  // PP checklist: checked-in dogs (boarding or daycare) that have tag_pp or passed_private eval
  const ppDogIds = new Set();
  data.reservations.forEach(r => { if (r.type === "evaluation" && r.evalResult === "passed_private") ppDogIds.add(r.dogId); });
  data.dogs.forEach(d => { if ((d.tags || []).includes("tag_pp")) ppDogIds.add(d.id); });
  const ppReservations = data.reservations.filter(r => (r.type === "boarding" || r.type === "daycare") && r.status === "checked-in" && r.checkIn <= viewDate && r.checkOut >= viewDate && ppDogIds.has(r.dogId));

  const getDog = (did) => data.dogs.find(d => d.id === did);
  const getClient = (cid) => data.clients.find(c => c.id === cid);
  const dogName = (did) => { const d = getDog(did); return d ? d.fields.name : "?"; };
  const ownerName = (cid) => { const c = getClient(cid); return c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : "?"; };

  // ─── Render helpers ───
  const hdrStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 };
  const dateNavStyle = { display: "flex", alignItems: "center", gap: 8 };
  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  const renderDateNav = () => (
    <div style={hdrStyle}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{meta.title}</h2>
        {isTemplate && meta.showTime && todayItems.some(t => t.dayOfWeek != null) && <div style={{ fontSize: 11, color: C.acc, marginTop: 2 }}>+ {DAY_NAMES_SHORT[dayIdx]} tasks</div>}
      </div>
      <div style={dateNavStyle}>
        <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 200, textAlign: "center" }}>{dateLbl}</span>
        <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
        {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {dirty && !isLocked && <Btn onClick={saveEntry}>Save</Btn>}
        {existing && (isPast && isLocked ? <Btn variant="secondary" size="sm" disabled style={{opacity:0.5,cursor:"not-allowed"}}>🔒 Locked</Btn> : <Btn variant={isLocked ? "secondary" : "accent"} onClick={toggleLock} size="sm">{isLocked ? "🔒 Locked" : "🔓 Lock"}</Btn>)}
        {existing && <button onClick={() => setShowHistory(v => !v)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{showHistory ? "Hide History" : "History"}</button>}
        {isLocked && <Badge color="default">Read Only</Badge>}
      </div>
    </div>
  );

  // ─── Template-based Checklist ───
  const renderTemplateChecklist = () => (
    <div>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: pctDone === 100 ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: pctDone === 100 ? C.suc : C.text }}>{checkedCount}/{totalCount}</span>
      </div>
      {/* Items */}
      <Card>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", padding: "8px 14px", borderBottom: `2px solid ${C.border}`, background: C.surfaceHover }}>
            <div style={{ width: 36 }} />
            {meta.showTime && <div style={{ width: 70, fontSize: 11, fontWeight: 700, color: C.textMut }}>TIME</div>}
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: C.textMut }}>TASK</div>
            <div style={{ width: 140, fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>COMPLETED BY</div>
          </div>
          {todayItems.map((t, i) => {
            const it = items[t.id] || {};
            const isWeekly = t.dayOfWeek != null;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: i < todayItems.length - 1 ? `1px solid ${C.border}` : "none", background: isWeekly ? "rgba(175,141,84,0.04)" : it.checked ? "rgba(34,139,34,0.03)" : "transparent", opacity: isLocked ? 0.7 : 1 }}>
                <div style={{ width: 36 }}>
                  <input type="checkbox" checked={!!it.checked} disabled={isLocked} onChange={e => toggleItem(t.id, "checked", e.target.checked)} style={{ width: 18, height: 18, cursor: isLocked ? "default" : "pointer", accentColor: C.pri }} />
                </div>
                {meta.showTime && <div style={{ width: 70, fontSize: 12, fontWeight: 600, color: t.time ? C.pri : C.textMut, fontVariantNumeric: "tabular-nums" }}>{t.time ? formatTime12hr(t.time) : (isWeekly ? DAY_NAMES_SHORT[t.dayOfWeek] : "")}</div>}
                <div style={{ flex: 1, fontSize: 13, color: it.checked ? C.textMut : C.text, textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4 }}>
                  {t.label}
                  {isWeekly && <Badge color="accent" size="sm" style={{ marginLeft: 6 }}>{DAY_NAMES_SHORT[t.dayOfWeek]}</Badge>}
                </div>
                <div style={{ width: 140, textAlign: "center", fontSize: 12, fontWeight: 500, color: it.initials ? C.textSec : C.textMut }}>
                  {it.initials || "—"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  // ─── Room Cleaning ───
  const renderRoomCleaning = () => {
    const roomItems = items;
    return (
      <div>
        {ROOM_TYPES.map(rt => {
          const rooms = allRooms[rt] || [];
          if (!rooms.length) return null;
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{rooms.length}</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr", borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>ROOM REFRESH</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>FULL DISINFECT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>AS NEEDED</div>
                </div>
                {rooms.map((rm, i) => {
                  const ri = roomItems[rm] || {};
                  const activeRes = boardingToday.find(r => r.room === rm);
                  const coRes = boardingCheckedOut.find(r => r.room === rm);
                  const notFirst = activeRes && activeRes.checkIn < viewDate;
                  const notLast = activeRes && activeRes.checkOut > viewDate;
                  const needsRefresh = !!(activeRes && notFirst && notLast);
                  const needsDisinfect = !!(activeRes && activeRes.checkOut === viewDate) || !!coRes;
                  const canDisinfect = !!coRes;
                  const aDog = activeRes ? dogName(activeRes.dogId) : coRes ? dogName(coRes.dogId) : null;
                  return (
                    <div key={rm} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr", padding: "8px 12px", borderBottom: i < rooms.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rm}</span>
                        {aDog && <div style={{ fontSize: 10, color: C.textMut }}>{aDog}</div>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsRefresh ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.refresh} disabled={isLocked} onChange={e => toggleItem(rm, "refresh", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.suc }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.pri }}>Required</span>
                          </div>
                          {ri.refresh && ri.refreshBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.refreshBy}</div>}
                        </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsDisinfect ? (canDisinfect ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.disinfect} disabled={isLocked} onChange={e => toggleItem(rm, "disinfect", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.dan }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.dan }}>Required</span>
                          </div>
                          {ri.disinfect && ri.disinfectBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.disinfectBy}</div>}
                        </div> : <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut, fontStyle: "italic" }}>Awaiting checkout</span>) : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <input type="checkbox" checked={!!ri.asNeeded} disabled={isLocked} onChange={e => toggleItem(rm, "asNeeded", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.acc }} />
                          {ri.asNeeded && <input type="checkbox" checked={!!ri.asNeededDone} disabled={isLocked} onChange={e => toggleItem(rm, "asNeededDone", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.suc }} title="Mark done" />}
                        </div>
                        {ri.asNeeded && ri.asNeededBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.asNeededBy}</div>}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })}
        {!Object.values(allRooms).some(r => r.length > 0) && <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No rooms configured. Add rooms in Settings → Rooms.</div></Card>}
      </div>
    );
  };

  // ─── Picture Checklist ───
  const renderPictures = () => {
    const dogs = pictureDogs;
    const picItems = items;
    const done = dogs.filter(r => picItems[r.dogId]).length;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: dogs.length ? `${(done / dogs.length) * 100}%` : "0%", height: "100%", background: done === dogs.length && dogs.length ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: done === dogs.length && dogs.length ? C.suc : C.text }}>{done}/{dogs.length} photos</span>
        </div>
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No dogs qualify for pictures today.</div><div style={{ color: C.textMut, fontSize: 12, marginTop: 4 }}>Boarding dogs on their first or last day are excluded.</div></Card> : (
          <Card>
            {dogs.map((r, i) => {
              const d = getDog(r.dogId);
              const c = getClient(r.clientId);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < dogs.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                  <input type="checkbox" checked={!!picItems[r.dogId]} disabled={isLocked} onChange={e => toggleItem(r.dogId, null, e.target.checked)} style={{ width: 20, height: 20, accentColor: C.suc }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: picItems[r.dogId] ? C.textMut : C.text, textDecoration: picItems[r.dogId] ? "line-through" : "none" }}>{d ? d.fields.name : "?"}</span>
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: 8 }}>{c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : ""}</span>
                  </div>
                  <Badge color="primary" size="sm">{r.roomType} · {r.room}</Badge>
                  {d && d.fields.breed && <Badge color="default" size="sm">{d.fields.breed}</Badge>}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  };

  // Override toggleItem for pictures (flat boolean instead of object)
  const togglePicture = (dogId, val) => {
    if (isLocked) return;
    setItems(prev => ({ ...prev, [dogId]: val }));
    setDirty(true);
  };

  // ─── Private Play ───
  const [ppEditTimePopover, setPpEditTimePopover] = useState(null); // { dogId, si }
  const ppNowTime = () => { const n = new Date(); return n.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };

  const ppToggleUD = (dogId, si, field, val, ses) => {
    if (isLocked) return;
    const ppName = profile?.full_name || "";
    const nSes = [...ses];
    const cur = nSes[si];
    const autoTime = ppNowTime();
    // When checking U or D: auto-fill time if empty, record originalTime, set completedBy
    if (val === true) {
      const timeToSet = cur.time || autoTime;
      nSes[si] = { ...cur, [field]: val, time: timeToSet, originalTime: cur.originalTime || timeToSet, completedBy: ppName, timeEdited: false };
    } else {
      // Unchecking: keep time if other checkbox is still checked, else clear
      const otherField = field === "urinate" ? "defecate" : "urinate";
      if (!cur[otherField]) {
        nSes[si] = { ...cur, [field]: val, time: "", originalTime: "", completedBy: "", timeEdited: false };
      } else {
        nSes[si] = { ...cur, [field]: val };
      }
    }
    setItems(prev => ({ ...prev, [dogId]: { sessions: nSes } }));
    setDirty(true);
  };

  const ppEditTime = (dogId, si, newTime, ses) => {
    if (isLocked) return;
    const nSes = [...ses];
    const cur = nSes[si];
    nSes[si] = { ...cur, time: newTime, timeEdited: newTime !== (cur.originalTime || "") };
    setItems(prev => ({ ...prev, [dogId]: { sessions: nSes } }));
    setDirty(true);
  };

  const renderPP = () => {
    const dogs = ppReservations;
    const ppItems = items;
    const sesLabels = ["Session 1", "Session 2", "Session 3", "Session 4", "Session 5"];
    const isRequired = (si) => si < 3;
    // Progress: 3 required sessions per dog
    const totalRequired = dogs.length * 3;
    let completedRequired = 0;
    dogs.forEach(r => {
      const dogData = ppItems[r.dogId] || {};
      const ses = dogData.sessions || [];
      ses.forEach((s, si) => { if (si < 3 && (s.time || s.urinate || s.defecate)) completedRequired++; });
    });
    const ppPct = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;
    return (
      <div>
        {/* Progress bar */}
        {dogs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${ppPct}%`, height: "100%", background: ppPct === 100 ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: ppPct === 100 ? C.suc : C.text }}>{completedRequired}/{totalRequired} required</span>
          </div>
        )}
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No private play dogs checked in today.</div></Card> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.surface, borderRadius: 12, overflow: "hidden" }}>
              <thead>
                <tr style={{ background: C.surfaceHover }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>DOG</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>OWNER</th>
                  {sesLabels.map((s, si) => (
                    <th key={si} colSpan={3} style={{ padding: "10px 6px", textAlign: "center", fontWeight: isRequired(si) ? 800 : 500, color: isRequired(si) ? C.pri : C.textMut, fontSize: 11, borderBottom: `2px solid ${isRequired(si) ? C.pri : C.border}`, borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : C.surfaceHover }}>
                      {s}{isRequired(si) ? <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, marginLeft: 4, textTransform: "uppercase" }}>REQ</span> : <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginLeft: 4, fontStyle: "italic" }}>extra</span>}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: C.surfaceHover }}>
                  <th /><th />
                  {sesLabels.map((_, si) => (
                    <React.Fragment key={si}>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : "transparent" }}>Time</th>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", background: isRequired(si) ? C.priLt : "transparent" }}>U</th>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", background: isRequired(si) ? C.priLt : "transparent" }}>D</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dogs.map((r, ri) => {
                  const d = getDog(r.dogId);
                  const dogData = ppItems[r.dogId] || { sessions: Array.from({ length: 5 }, () => ({ time: "", urinate: false, defecate: false })) };
                  const ses = dogData.sessions || Array.from({ length: 5 }, () => ({ time: "", urinate: false, defecate: false }));
                  return (
                    <tr key={r.id} style={{ borderBottom: ri < dogs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: C.text }}>{d ? d.fields.name : "?"}</td>
                      <td style={{ padding: "8px 12px", color: C.textSec, fontSize: 11 }}>{ownerName(r.clientId)}</td>
                      {ses.map((s, si) => {
                        const isEditingTime = ppEditTimePopover && ppEditTimePopover.dogId === r.dogId && ppEditTimePopover.si === si;
                        return (
                        <React.Fragment key={si}>
                          <td style={{ padding: "4px 2px", borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt + "80" : "transparent", verticalAlign: "top" }}>
                            {isEditingTime ? (
                              <input type="text" autoFocus defaultValue={s.time} onBlur={e => { ppEditTime(r.dogId, si, e.target.value, ses); setPpEditTimePopover(null); }} onKeyDown={e => { if (e.key === "Enter") { ppEditTime(r.dogId, si, e.target.value, ses); setPpEditTimePopover(null); } }} style={{ width: 56, textAlign: "center", border: `1.5px solid ${C.pri}`, borderRadius: 4, padding: "3px 0", fontSize: 11, fontFamily: "inherit", background: "#fff", outline: "none" }} />
                            ) : (
                              <div onClick={() => { if (!isLocked && s.time) setPpEditTimePopover({ dogId: r.dogId, si }); }} style={{ cursor: s.time && !isLocked ? "pointer" : "default", textAlign: "center" }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: s.time ? C.text : C.textMut, padding: "3px 0" }}>{s.time || "—"}</div>
                              </div>
                            )}
                            {s.timeEdited && <div style={{ fontSize: 8, color: C.warn, textAlign: "center", fontWeight: 700, cursor: "pointer" }} title={`Originally: ${s.originalTime}`}>edited</div>}
                            {s.completedBy && s.time && !s.timeEdited && <div style={{ fontSize: 9, color: C.textMut, textAlign: "center", marginTop: 1 }}>{s.completedBy}</div>}
                            {s.completedBy && s.time && s.timeEdited && <div style={{ fontSize: 9, color: C.textMut, textAlign: "center" }}>{s.completedBy}</div>}
                          </td>
                          <td style={{ padding: "4px 2px", textAlign: "center", background: isRequired(si) ? C.priLt + "80" : "transparent" }}>
                            <input type="checkbox" checked={!!s.urinate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "urinate", e.target.checked, ses)} style={{ width: 16, height: 16, accentColor: C.pri }} />
                          </td>
                          <td style={{ padding: "4px 2px", textAlign: "center", background: isRequired(si) ? C.priLt + "80" : "transparent" }}>
                            <input type="checkbox" checked={!!s.defecate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "defecate", e.target.checked, ses)} style={{ width: 16, height: 16, accentColor: C.acc }} />
                          </td>
                        </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Fix pictures toggle to use flat boolean
  const renderPicturesFixed = () => {
    const dogs = pictureDogs;
    const picItems = items;
    const done = dogs.filter(r => picItems[r.dogId]).length;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: dogs.length ? `${(done / dogs.length) * 100}%` : "0%", height: "100%", background: done === dogs.length && dogs.length ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: done === dogs.length && dogs.length ? C.suc : C.text }}>{done}/{dogs.length} photos</span>
        </div>
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No dogs qualify for pictures today.</div><div style={{ color: C.textMut, fontSize: 12, marginTop: 4 }}>Boarding dogs on their first or last day are excluded.</div></Card> : (
          <Card>
            {dogs.map((r, i) => {
              const d = getDog(r.dogId);
              const c = getClient(r.clientId);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < dogs.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                  <input type="checkbox" checked={!!picItems[r.dogId]} disabled={isLocked} onChange={e => togglePicture(r.dogId, e.target.checked)} style={{ width: 20, height: 20, accentColor: C.suc }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: picItems[r.dogId] ? C.textMut : C.text, textDecoration: picItems[r.dogId] ? "line-through" : "none" }}>{d ? d.fields.name : "?"}</span>
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: 8 }}>{c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : ""}</span>
                  </div>
                  <Badge color="primary" size="sm">{r.roomType} · {r.room}</Badge>
                  {d && d.fields.breed && <Badge color="default" size="sm">{d.fields.breed}</Badge>}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("operations")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>← Operations</button>
      {renderDateNav()}
      {showHistory && existing && (
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Edit History</div>
          {(existing.history || []).length === 0
            ? <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No history recorded yet</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(existing.history || []).map((h, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.textSec }}>
                    <span style={{ fontWeight: 600, color: C.textMut }}>{new Date(h.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(h.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    {" — "}{h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                  </div>
                ))}
              </div>}
        </Card>
      )}
      {isTemplate ? renderTemplateChecklist()
        : sub === "room_cleaning" ? renderRoomCleaning()
        : sub === "pictures" ? renderPicturesFixed()
        : sub === "pp" ? renderPP()
        : <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown checklist type</div></Card>}
      {dirty && !isLocked && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", marginTop: 20 }}>
        <Btn onClick={saveEntry} style={{ padding: "10px 40px", fontSize: 14 }}>Save Changes</Btn>
      </div>}
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────
function SettingsPage() {
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testMessage, setTestMessage] = useState("");
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.location_id) return;
    supabase
      .from("k9_gingr_credentials")
      .select("*")
      .eq("location_id", profile.location_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSubdomain(data.gingr_subdomain || "");
          setApiKey(data.gingr_api_key || "");
          setLocationId(data.gingr_location_id || "");
        }
      });
  }, [profile?.location_id]);

  const handleSave = async () => {
    if (!profile?.location_id) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      location_id: profile.location_id,
      gingr_subdomain: subdomain.trim(),
      gingr_api_key: apiKey.trim(),
      gingr_location_id: locationId.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("k9_gingr_credentials")
      .upsert(payload, { onConflict: "location_id" });
    setSaving(false);
    if (!error) setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    if (!subdomain || !apiKey) {
      setTestStatus("error");
      setTestMessage("Enter subdomain and API key first.");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const url = `https://${subdomain
        .trim()
        .toLowerCase()}.gingrapp.com/api/v1/get_locations?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success || json.data) {
        setTestStatus("success");
        const locs = json.data || [];
        setTestMessage(`Connected! ${locs.length} location${locs.length !== 1 ? "s" : ""} found.`);
      } else {
        setTestStatus("error");
        setTestMessage(json.error || "Connection failed. Check your credentials.");
      }
    } catch (e) {
      setTestStatus("error");
      setTestMessage("Could not reach Gingr. Check your subdomain.");
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10,
    fontSize: 15,
    color: C.text,
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        Gingr Integration
      </h2>
      <p style={{ margin: "0 0 28px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Connect your Gingr account to pull customer, reservation, and operational data into K9 Operations. Your API key is stored
        securely per location.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle}>Gingr Subdomain</label>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span
              style={{
                padding: "12px 10px 12px 14px",
                background: C.bg,
                border: `1.5px solid ${C.border}`,
                borderRight: "none",
                borderRadius: "10px 0 0 10px",
                fontSize: 14,
                color: C.textMut,
                whiteSpace: "nowrap",
              }}
            >
              https://
            </span>
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="your-facility"
              style={{ ...inputStyle, borderRadius: 0, borderLeft: "none", borderRight: "none" }}
            />
            <span
              style={{
                padding: "12px 14px 12px 10px",
                background: C.bg,
                border: `1.5px solid ${C.border}`,
                borderLeft: "none",
                borderRadius: "0 10px 10px 0",
                fontSize: 14,
                color: C.textMut,
                whiteSpace: "nowrap",
              }}
            >
              .gingrapp.com
            </span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>API Key</label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your Gingr API key"
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              type="button"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: C.textMut,
                padding: 4,
              }}
            >
              {showKey ? <Icons.EyeOff /> : <Icons.Eye />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Find this in your Gingr admin panel under Settings → API Keys.</div>
        </div>

        <div>
          <label style={labelStyle}>
            Gingr Location ID <span style={{ fontWeight: 400, color: C.textMut }}>(optional)</span>
          </label>
          <input
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="e.g. 1"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>
            Only needed if your Gingr account has multiple locations. Leave blank for single-location setups.
          </div>
        </div>
      </div>

      {testStatus && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: testStatus === "success" ? C.sucLt : testStatus === "error" ? C.danLt : C.infoLt,
            color: testStatus === "success" ? C.suc : testStatus === "error" ? C.dan : C.info,
          }}
        >
          {testStatus === "testing" && "Testing connection..."}
          {testStatus === "success" && (
            <>
              <Icons.Check /> {testMessage}
            </>
          )}
          {testStatus === "error" && (
            <>
              <Icons.AlertTriangle /> {testMessage}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          onClick={handleTest}
          disabled={!subdomain || !apiKey}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: `1.5px solid ${C.pri}`,
            background: "transparent",
            color: C.pri,
            fontSize: 14,
            fontWeight: 600,
            cursor: !subdomain || !apiKey ? "default" : "pointer",
            fontFamily: "inherit",
            opacity: !subdomain || !apiKey ? 0.4 : 1,
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.Link /> Test Connection
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !subdomain || !apiKey}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: saving || !subdomain || !apiKey ? C.textMut : C.pri,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving || !subdomain || !apiKey ? "default" : "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Credentials"}
        </button>
      </div>
    </div>
  );
}


// ─── Photos Page ──────────────────────────────────────────────────────────
function PhotosPage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        Photos
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Upload, tag, and pair photos with dogs. Auto-generate report cards and year-in-review content.
      </p>
      <div style={{ padding: "60px 0", textAlign: "center", color: C.textMut, fontSize: 14 }}>
        <Icons.Photos />
        <div style={{ marginTop: 12 }}>Photo management is coming soon.</div>
      </div>
    </div>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────
class LeanAppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("LeanApp Error:", error, info); this.setState({ info }); }
  render() {
    if (this.state.error) {
      return <div style={{padding:40,fontFamily:"monospace"}}>
        <h2 style={{color:"red"}}>LeanApp crashed</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:13,background:"#f5f5f5",padding:20,borderRadius:8}}>{this.state.error.toString()}{"\n\n"}{this.state.info?.componentStack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

// ─── Main App Component ───────────────────────────────────────────────────
function LeanAppInner() {
  const { user } = useAuth();
  const [page, setPage] = useState("lifecycle");
  const [lcFilters, setLcFilters] = useState({});
  const [lcFilterOpen, setLcFilterOpen] = useState(false);
  
  // Mock data from hook
  const data = useGingrData();
  
  // Mock profile
  const profile = {
    id: "mock-user",
    role: "owner",
    email: user?.email || "user@example.com",
    name: "Demo User",
  };
  
  // Save function (no-op for now, could update local state)
  const save = useCallback(async (path, val) => {
    console.log("Save (mock):", path, val);
    return true;
  }, []);
  
  // Navigation function
  const nav = useCallback((newPage) => {
    setPage(newPage);
  }, []);
  
  // Toast function (no-op)
  const addGlobalToast = useCallback((msg, type) => {
    console.log("Toast:", msg, type);
  }, []);
  
  // Sidebar navigation
  const Sidebar = () => (
    <div style={{
      width: 220,
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflowY: "auto",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
        <img src={K9_LOGO_SRC} alt="K9 Logo" style={{ width: 180, height: "auto" }} />
      </div>
      
      {/* Nav Items */}
      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => nav(item.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "12px 14px",
              marginBottom: 6,
              borderRadius: 10,
              border: "none",
              background: page === item.id ? C.priLt : "transparent",
              color: page === item.id ? C.pri : C.textSec,
              fontSize: 13,
              fontWeight: page === item.id ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.bg}
            onMouseLeave={e => e.currentTarget.style.background = page === item.id ? C.priLt : "transparent"}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
  
  // Main content area
  const renderPage = () => {
    switch (page) {
      case "lifecycle":
        return (
          <ClientsPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
            lcFilters={lcFilters}
            setLcFilters={setLcFilters}
            setLcFilterOpen={setLcFilterOpen}
            locationSlug={"cherry-hill"}
          />
        );
      case "ops-hub":
        return (
          <OperationsHub
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
          />
        );
      case "daily-ops":
        return (
          <DailyOpsPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
          />
        );
      case "photos":
        return <PhotosPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <div>Page not found</div>;
    }
  };
  
  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: "auto", background: C.bg }}>
        {renderPage()}
      </div>
    </div>
  );
}

export default function LeanApp() {
  return <LeanAppErrorBoundary><LeanAppInner /></LeanAppErrorBoundary>;
}
