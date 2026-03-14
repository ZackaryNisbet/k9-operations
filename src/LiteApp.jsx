// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// ─── K9 Operations Lite ─────────────────────────────────────────────────────
// Bolt-on modules for Gingr: Customer Lifecycle, Operations Hub, Photos.
// This app reads from Gingr's API using credentials stored per-location.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";

// ─── IndexedDB cache for instant page loads ─────────────────────────────────
const IDB_NAME = "k9_cache";
const IDB_STORE = "data";
const IDB_VERSION = 1;
const idbOpen = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, IDB_VERSION);
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const idbGet = async (key) => {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
};
const idbSet = async (key, val) => {
  try {
    const db = await idbOpen();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(val, key);
  } catch {}
};

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

// ─── K9 Lite Roles & Permissions ──────────────────────────────────────────
const LEAN_ROLES = [
  { id: "pct", name: "PCT (Pet Care Tech)", shortName: "PCT" },
  { id: "csr", name: "CSR (Customer Service)", shortName: "CSR" },
  { id: "supervisor", name: "Supervisor", shortName: "Supervisor" },
  { id: "manager", name: "Manager", shortName: "Manager" },
  { id: "location_admin", name: "Location Admin", shortName: "Location Admin" },
  { id: "enterprise_admin", name: "Enterprise Admin", shortName: "Enterprise Admin" },
];

const LEAN_PERMISSION_AREAS = [
  "Operations Hub",
  "EOD Reports",
  "Customer Lifecycle",
  "Photos Module",
  "Attendance Tracker",
  "User Management",
  "Permissions Management",
  "Gingr Integration",
  "Checklist Templates",
  "Enterprise View",
];

const LEAN_PERMISSION_MATRIX = {
  pct: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": false,
    "Photos Module": false,
    "Attendance Tracker": false,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
  },
  csr: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": false,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
  },
  supervisor: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
  },
  manager: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": false,
    "Checklist Templates": true,
    "Enterprise View": false,
  },
  location_admin: {
    "Operations Hub": true,
    "EOD Reports": true,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": true,
    "Checklist Templates": true,
    "Enterprise View": false,
  },
  enterprise_admin: {
    "Operations Hub": true,
    "EOD Reports": true,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": true,
    "Checklist Templates": true,
    "Enterprise View": true,
  },
};

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
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Link: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Photos: () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Camera: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Image: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Layers: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  TrendingUp: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Monitor: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
};
const Icons = I;

// K9 Resorts Official Dog Logo (PNG from brand assets)
const K9_LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAB0CAYAAABzNJfPAAAlgElEQVR42u19e5hdVXn++6219z6XuWVymdyJIHhJ1JZSsfJrncGiImBotWd+1mIpCKFgkSJGhQJnjqCFAgIiaFCxFFCZo20RLwkUmdECUYhQSIZAAskkk7nfz21f1lpf/9jnTCbJTC4zZ8IUWM+TZ57MnLP3Wutd3+1d3/oW8GZ7s73Z3mxvtjfb66g1NyckJ5PizZmYBY0Z9EYevzWbOpNMQhDB3PHlj55lRZzsxamHWpJJiFQK5uj2IymAFtEwwd9aAAANJpVKmdf1ykgmk4KZKfnZU5b8562NfP9X/+KXAPB4sv5oLRpqbk5IZqbDleTm5oQEyivRs0ZCGtAiiEh9P7X6jtrqKEaz+SoAaGhq0UjNrBZrTiRkYzqtGxvTGiDctvbMEyor5MmOJVYKmKWWTVIrZsWiKzD6xUy28Fui/3oRSOvx3y/LqngtDHYikTZE4L3SUW+lUq3qris/+qkVS2oeUNpwPu/vWb9h6IR7W1vdYj95pvrT2JjW9fUrop8+9Q8+XRWV5wopTq6I27YUInxt8c1EBG0Y2byntebfZfP+9++7d/N9re3tbuk5/9cAOWBik0mIpibmr15++qK3LanYHI1Yc5RmEQTK3dFROOHLd6zvmCE7QpxMEqVS5o6rP3rW4pqKGyornFXGGLi+AhvWTMQHfomJBMmoY0GQwGjWbesZyl156Q0bfsrJpKBUiqezeMTRBuMbX/7o///GFR86tgRGA+oFEfEx8yLframMzPV9zczMti2j8SqzBABWtSVopsC45yurbzy2rurhWNRalS34Ku8GhhkMIkmABbAgMBEgCUwMEDM47wYm6/qqIu6sPHZxzUPfTZ5xM6VShpnB01joRwWQZDJ8T/LvP1R37OLqH8WrYqsB4C041zk11aq+dfWZl9XNqzwjUwgUCZIAm6hjIWZHlgEAEmU33oJSKXPvdavvW76w6ot+oHXBCwwBFhGJkuZgZhN1LBGN2JIIFHUsGYvYgsFMRIIAq+AFxlesVyyuveLe685OE5FINyfEVLXPUQGkAfUCAC9d6Hxqbk3EWIKjAHBe6l73pitOf++i2vhNrhdoMCQAMIiFIBjWKwBgwZZeKqPNEI2Naf2da8+8c2ld9TmjGS8wIFkEYpwXxSYWtcVozm9r7xr+u227ej/w6u6h80cy7u/jISimaFeEAcvRrBssrav8q3tSZ93T2JjWzSEos9LLohY0mHPPRbQy6nw2UCy0MfOZmT5/wUdqly+I/9BxhF3wlCGisYknIjiWOG4mDPhdV5/+yWULqy4ZzbkBCPb+aHMooZTJBVuf2NLxgTvve3qg+KffrFiBH15/4dm/mD8nfmre9XVRtQFE9kjWC5bVVf/tt6458+nGxvQ3p2LoZ1xCHk/Wy1QqZd5/TNUlc6qixxc8Bce2QUR84rHR+2prom8tuErvs0KZiZlhSbECAPpW1U3bw2IGJRJpk7zs7Dm1lbHbtDbGMMuJjR3BMKhzKHvpnfc9PXD7padHksmkaE4mnPZ2uDtfHT0v5/o5IYUITcbYOyzXU3pedfTGm644Y0UikTYldT0rAEkmIVrQYJKX1C+aV+Vc7SulLEnIFrzB7167+rKlC6rOyOT9ot3Yd0a0YQjCcgBIJNLT9rBamuolEXj5HP6HeTWxha5vDIEOGH9ROsRoztv8+Rs2PJZMJsVld6z3UqmUaUyl/ceT9dY19zzePpL10vGoTSDovVIN8pTm2spIvK7GuYYIvGrVkTkkYqZtRyqVMscumvON6sporVKG865C1LE/WV1l35zJ+2YitUkAtDYQQi4655z3VBRjlunYEWpIteo1Z50Uj0fERV6gmYgnGTsZ2xJQSv8KADegZZ/P9a2qY2ZQwVXpwNcQ2DeyJ5DMugHHo+JT11384eWNjWmdPAKiVMygqrJOTbWqO68845y6ufFEtuBpIrIDZTC/JvYeS5KlNAuaUL0QacMg8Ny3VsQWFKWNpmE7BAH87j9c8sHqqugyL1CMCaRjbDEYRt4P/mcvd7W3lYLaHR0jz4zk3KyQUo5XWxRKt66ujMYW10UTJRbiNQWkOZGQp6Za1Vc+d9oJdfPidymtDHM4AUSAr5QxHDr3E04KgYxhjjiWM7cmvgQA2qYRi5S8tGqHzrItwQAdTAUKP9BQineFMdC+9osIzMx0y/1P9RrGK7YlQuuxX/BomDkSkatDQBrMawZIiddZvfrtVScsrvpxRdSq8gIDovErnAQdSgUxm4hjIerEjwGAlSun7vo2NLVqACQE3q+0IYAnHTcRYLSBVoXcZJ9JpxsFALDhnVIQaL/InEHCDzRJ4hO//On3zqNUyhxusCjKraYa02mdqF9Z2fj+lQ/X1kTfk3d9LYiO+D1MxFIICMlvCVfZ1L0rIvCVn/lgnWXL44JAY3LZPDKJU0p3EBH2p1hCtWVMLGpVL1pS804ASCcOLy4pCyDMoJLN+KeL/2z5Jz769v9aUBOrz+YDRSTkdMgWx7KOnU7fmpqSBAAL5mKpLUWlNsz7SusErxUA2I4cetGg5yBzYmKOjVg0/jYAWHCYEj4tQBghEETgU1Ot6s6rzvrYH761bmNNVfR9mbyniKYeeFIxFgFC17ehqWFKru+qtjYCAJuseY5dJAIOuriYbSkRse0FALDlIBOpmAd4ki1OLgIroJbNeKSeTCZFA1oEpVoVUq0q+dnTlhy/tKqpJm5fCAJyBV8TkTVdsMNYhJeH+n9qO3SlCQ20qhFEIPBBd4kZxJYl4djW8pKqTO0f0xR/em6QN4YPseLN3BkBpLSt2YQGQ6mUSQHmyvP+dME7T5h/QcyWl1dXRhZkC74xhkkQyTJoQtLaQFpy4d+cfnLVA+t/N8qhzZ1S1C7GBXCH1pQM28bKQz6TRT4UYp7YR2FAKdSUDRBmUEtTvWxoatVEKQPApNCK2644813z5zp/G3HEp6srI4tcTyGTczWRkILKxQOGm0GSqPbtK6ILAYw2JUFIHRkgJbeVSAwqY8A4VAdZBNpASnlKiYcDWvfxIregFwBQUSFzfLDuEECSTNkACSPkVoUUcMvlHz6+dk7sw/GI/LhlifqqCsfyPIVMztMAiWkZ78ljERON2Na8ufElALaF+yLpI1RZKxkAXF93+74ylmUJcxClRSDh+tpUV0beedva0z74j6nUY7fffnpk8X9XKSSAxsa0Ln2ZlRGHWlSCMDJtQIquIm65/MwldfPtSy0h6qWkE6srnQgzUPACZPK+AkNSedTTZOMxjiWEEFh2KAM7WUuFO3h4prOwa+mimu5YRCzxlTKTRepFPguCiBfNr/rmpef96Qcuu2x9XxiAAHd86eyGDGVfuOqGxwayBV2ziAggmkRQGMbQ4LQBaWmql0CrmldLqeOW1nxmcNSFUga5QqDATChuzsz0BjAzIATBIjpuMgN7OI8p0uCFM969+mnbFqs9RYYO4mGGUqJMVUXkHae8ff6Tq64586a8b7bXVNqnLZ1XceXuTvMJAP9OFldiEr+NAIR0hNk9EQUzJZUVaLMrk/eV52sNghOCcJS34YlgR6y3TOcRW4qBnFdQP2bG2RQuqkO8lkTBDUxlPHJ8TWVsXaA0LBnSJEr7ywEg6ti1QogJmU8iCNdTyOXd7RNRMEcUh7QUuZfhoeDfs/lAihCMo56hQsxkDEOQOGY6sUgq1aoZoFd6hh8aHCl0O46k0o7foUDxAmUKrq+VNsb1lGcMIIXIF/8+byJcmcFSCFHwVGbHwPDLobpNTx2QVCplOJkUa7/x6OZcwX8yFrXAzPpoA8IEMsbAklgajj9lpkjDc7o5IW6658lMLqeuj9iWIKbDGg+BBEI7KUCwfV9R1qg2AJBCLJlYXbGxLQGtue2O7z/Xx8x0uFkzk+rR9Kowwh0teNcZAxKCjn7qJIOUYRCJujWJk6oPGWYfpDU2pnVzIiHXfPVn3+7qz/ymqsKxmTk4AoOmI46k0bz78sj2PU8DgGNbSw0b0H7ZjkzEUgp4SreGNrnhsB0fcagBXPq1DRu6BjPfr6mM2AD7zDOTsDaZzjCaQeDat9TFFgJAUzI5ZdW5ZWWamWFe6uj766HRQntl/PBAYWYmQcYWgkZG3WQq3ebXr1gRBfMyrRm8HzdGBFHwAmQL7sMA0Nd2+FvQB/WjE+m0YU6KHz/10sUdPZmHayojjhAAM2vGzANDAAyziUUdUTunYsl4bmpqtgSmqSlJX1u3cc8r3YOnjWT9rTWVUbvo0CkGG2ZmZoT/wv8rKQRVxSP2zq7hOy79l0d/BAANH1lWJwQtVdrswx4z2ERsKTI5/5UnHu78HTOoMZ0uz34IAQxK8YYN271zr/np2bt6MjeA2VTFHSmJiAEFZs3MMwmOcSwJAVox1Vhkf/uYSCTkVbe2bn/k6T3/r6M3+32w4aqYbcUcW9iWJEsS2ZagmGOL6oqIxcYUXtkz/E8XXf/Lz61bt8YGgHlzK99WEXMi2rDZb6/H2JaE66v7021tfhhCoDwSUgKFGcQMnH/tw1e+0j78/t6B7E8CFfiVMduKxxzp2FaYwUMw5ZYcBiAkYFn2saVYZLotnQ73ub+X3jh43rUPnf/yrqGTO3qG7xgcyb5QcP1h11eu6wUDozl3U09/9sbN2wdP/Pvrfv41TiYFNm0CAMSj1kmRiARjr7FmgKUgOZIpFDqGhu8Z77GWm1xkorG8pqcB/NXVF7/vncvm1ayOO85pUoh3WZZYFIlYAkRQptynbgi2FdLw5Wqp4i5eOkyc2wRgEwAk15w035LxmAXOXvmt/x4a47CaE5IaU7q5OUG4exNsId43wckFXRG1rd0j7gOpbzyxK5yvlJ4JQMYMfTKZFE1NAFHqRQAvArjxb04/vvrdb52/wrLsJQvr5lw/t7rijwt+MGGazVRjEdZmxVgskmotl41iFMfUgBbxwVSrSt29qX+cccavrq23WtBgihNLjY1pfe659VHLlicHSoPAAiAwgy2LxEjGLQxmstczg5qaVvIU+jS1VkqUbijS8aXff/faM75zzOI5F4zmfUVlyIws5UkNZ9yt51z10MqiFpux4wnhRIKamsDjj0wAQCKRkOl0Wt/65Q+9b0XdnI1F21nMA4aqrnCsnZ3D16257hfXTvV4gjV1kYdJodUArWCA0smEjTbojMiNlteIEGnNEER1F3/q3XO+9YMXhqabpHVohhucmoA0u2RlL6UB1MRiH6qI2cjkfU2AZZhNPGJbfYP5l17cOvjPnEwKapzahpool+gvQK9pTKe1MTxcbt83pE9Qs3jB/LrpxiLTaaXsFcvCX2ptitvMYNuSxlfK9A4Vzrs1vbGQDl1zfs0A2S+IyqCMXjABpI3R1RVRuSAePQYAVq1qO/onvxIJSQR8fe1HTqyIOicWPMVMJImgYhHL6hoofPHymzc8lSxm3kz1PWUDpEQvSykyhsunUtiwjkdtOZwtdA3nzTZm0JYtaT7q4hGeUeG5VZGLKuMOMaCJOaipiNi7e0e/d8n1P7/l8eLRvOm8puzHEXKuH278l8HsGmZVGbOtkYLb/VJ774dT335qpztn+oOeigOTSKTNjZ89bUk8an0q7/pMYFNdFXU6+3I/viD5swubmxPy1DKcMSybhKwqHhlQAWWNMaBpJKMxg8EcVMcj1mjWe+XF7f1/nvr2U5tLK7C5OSGbmxOymOo/4+orPHYHXrAgvra6MlKpDfzqiqjT3Z978G+v/s9PcjJJxQz9aUtu+SSkuNUdETprmMHENJXuMbMWQoiqmGP3DuZ+1drWcc7dD2zqWrdujX3qRXcHX7ygflljY7pjv+9QOt0o9j9p1VJaKOnS3noKTSnwkWSuJJNJcWoqpf7l0tPfWlVpX+gHBrGIFdnTm7nt76796eXhuXYCUXnc8LKrLJ/J1Zr5SPJ1mJlBpIkhK+OOzBV8tatn5IbPNP08CcA8s26N/ccX3R18N3nW1fPnxNb+23Wr7895+uf9g/kt9z7yeDcRecDhpfmkiiL1YHNClgDsa6vjRPO+R7VLrQkAEiudJYui31w0v6Kiqzc7PDDqXn7x9b/4V04mBYiYyhgTlQ2QsewO1+RBRCEjzJjwUEy4rAyHgxGOLUXEkVa+EKB/KLe+t2/kms/f1vrMunVr7Isuutv88UV3B9+/7mNfX1RbcbmnDOrmVVwSKHNJbZXjXn/BX3QbRp8xpk8zD7HBMEgMK6UHifWQr3hYSAwalsP9+dHBHdv18D0/fTJzQNAWknbU0tQg+9rquDGdNsniSd3kmtMWCYH6XZ1D//Fie++Xrl/3220lKmUmGO6yPYsZaLropNhxxyx78piF1X+QyXtQmsHMhkKvnQgkpCTYUkBKAc9XyBf8rkCZXwyNePd+7qYNvwGAX9x+euSMy9Z7Xzi3ftEfvaP2e/PmxM/IFnzFhiWINIGFEEJYUkAKghCEcUcUwRyyotowjDYIlIHS2mWmEQb3Km3aGbRdBbzV02Zz+2B+6w13PjYwfkCPJ0PaJJVKmbXnn7Lkpnue7CzxWuUoEjDTgIxlmifPeX/dscfP/adIxDpbSrEi6kgQEYwB/EAj0HrAGGzzff+prBs8tmlr3xP3PvQ/wwBQUk8A8K2rzvzLBbXR2ysrnOXZgq8I+6anMoOJQhegGNTzgYNjKoYzQgiCFAQpBKQMAWQGXE/BC9SANmaLUtwyWtCP/sNXu34LbArGA8DJpGgqEpMz5UDQDD2TAeBPli2Lffzjbzkh4tiLjNFRkiIXGO7Zuquv83vptn3ylTY3J5x3NaZ9APja5//8bcfMr0nVVNifBDE8X+ty5H+Fu50MhBUAuKgyAUBaUpBjCQgpUHADeIHZGgTmJ90Dufu/8PVHtoYGvt5KpVo1ZnBzbsZcxl/cfnrkzH/c4E22d/XMujV2r7tLnHnZeq/0iRvXnnnC0jn2JdGIvLAq7lRkC74xDBI087lHzGACl+yajNiSHFtgJBt4vtLN3b3uTVfc+ssXSp7XTElJ2QeaTCYc9PXOTd3V2n04n197/ilVJyyfVx+LynMiljy7pjISzbsBtDZ6RrMiD4NlBsgIIqsiaiFXUN5IwbvjB607mx599PncTNkRKt8Awsz0L605reZdKyqelVKsHx71HxrJu9tGBkZHUBkx2jOxeCxWuaA6tjwWpXc7Fp1iS3lKRdxZ6lgSeS8EIswVnh2V5TjExgghZGXcweCI+8KOnpFzr/z6Y8+WDinNakDWnn9K1Xvfvmjn/NrY3Gw+QMELAgayIS2FqCBE4lFbFg/PhEZeaVOs2TJrgJhIpTFYV0Qdq+AFufauzN98/uYND5UbFFHOpQQA+cHAUcbQaD5QgVLacSw7FrFrYxF7bjxixSO2JQNlTLYQqGze14HSJgSC5GwFAwiz8QWRlXd9bUlRcezS6n+/7Qun/+WpRSpn9gFSbI6d4+KDLQYJrZkDZThQhpUOU1QAiGLlHYkybPMeXWBIBkobQUTHLK764U1XfOh9pRy22QVIcW1bVXMCQQjC/xModPf3/sP//aqjRCQCpU3EkZHlCyofTF5WPyexciWXo6Jq2VdnZ2cvaS4d8WK8XhsRybwXqHlzYiuOmVt9C6VSJp1OiFkDSGlpvDLsBjDsvxGK7woiK5MP9Lzq6Pm3X3X6n5RDdZVdQjZu7HAJyBXrsvHrHRRjDKKOhbmxyFdCYnglzxZAiiQu2ABZQQTi1z8gRdVlKuLOaV9f+5E/olTKTEdKyiwhTaUcpWGiN07FcMMwlXGLaqsinwEOv2rDjAPS0hSWIfK16hN0IPv6upUSsPACg4gtP3buufXRYqA4e4pgGs1doDdSTX0SvtImHrWWn1QXfS8ANCem5nHNCCBEcjeY8UZqzDCxqIXKuF0/HbVVXpVV/OkrtVtpAwK/YcSkmMUIadHJwNQLd5YVkLbi0a1C3m/3/LBm2BtGQgikFMOW4h0ApkzNl3XCVhaP/naPuB2urwpSFjdY3xiIkDIGJGjJVWv+rK6oxug1BSRVLAxz0z1P9ho2nZYUIHpjGBMikNaGbcuqWFQbqwOAxsYjN+zlVilcvDtKMVO7FAJ4o0hIcfy2JRARmAtMrWR92XV8S7EkaqD4JSHoDROLlNajlAQ/CAGZygHVGTO6gfK28hvM9QURCyJYEUSn+oiyp5KW3L28573kBxp0dO8o2X/FGuyT7hNmgHPJUQ0XtUDpDPG0X1f8odmaNYBs2RKynVrJHa4baMu2pGHmo7YxxeHNOARIx7ZEWOg4zGQ0xoANg4QoZjqGp7M8X0MzF+t/Tb+fLKaupssOSKlg2G83dXUuPr2qPyrFwkCpYg7ETGEQJmsLghWN2FIKgWzeQybr7gqUfiFfcNuI5KssMJjPuFxVFSWlscCSWBmLOCc7jvyjOVUxq+ApqOmkH5V2TRlq1gBSnB8iouzZHz5hlyVpYRBgRq6LZLAhBju2lBHbskZzLoZG8xtdV/1sOOM++vivX9z8s01d+UM954bPfuDdCxdW/V1lNLKmqiJSmSuE94JMkUKBp7SeTYCUSnHrQOmdQtB7x6VsllU1RRxLWpIwmvE7B0fzP+wf9n/4hVse2bSfHy5amlpEC8KzIlu29NL4E1hEhC/f+esXAFxx4+dO+/byxVW3za2JnpEvKG3A8kj6TUxk2MCRYZ3FVVOgT2YEkNK5C838ykzsizDYVEQdOZp3t41m/Vt/v33kR9/6QVh1oXSkoJi1zqVqqkApBTStb/7S6hOXzLP/Opsz69ek/qMVgC7mFm8DcOZ3mj5207L5FV8o+EoxH8EcEZPWQE7rQrgyZ4mEtBR/aqN2GmMOVXW/mCN7eLwXM5t41BYDI4Wf/OrnL553z5MvZYC9RweIyABQ40u7jrNwAAB3yOu25zlrl9VF1zbf+InnBke9G97VmH6wuXiI59Smh9d+55qP8vLFc9bmCoE63HliBmlmECKZKeIxMy5pSVR9V+8MlMFkBQ6ZGbYlhWNb4vBiFjYRx6KRrNf+nUeePeeeJ1/KrFtzkg2ATk21qkMlQKdSMMxJcfXdG7oKvvdTATaxqPzDFYsrf/SvX1n93cbGNDWgwTyzbo194XW//GJ3f/bhyphtHU41PQaYiEhpY4xW2ZDbO/L99RkBJF1cGgVjujxfAzThe0zUsTCcKbw4PFrYEnEsHIqIZJBxLEnZXPDt1tZ2d926k+yL7t4U4AjyjYq7muT5ugVEwgu0n/eUWraw6jP/dv3ZP6GWlNhUtD1be7rPGxl1uyOOdegajcUKqlqz2zNcyAJAU1NqdgDS3BwW7BruHRgIgqAg6EDWlwETi1jIuf59/aP5a6OOBRyiHLggyEzeM8P5zM8AUGfnWUfszdwVbhFwLmf+O18IQEQ2A9ZI1vWXLKhcfc8HP3bXRRfdHfzyG7+1b7jz6YGekdwVUpA4VMIGEbMgAoMzO18ZHi0SjrNDZZU68vyW3iHDNBSeVuIDTjcpzZBMu0xgOrxAQRxkCAw2ji3J9YMdP2ppfQkAT+WMRrpY3e2ZHt1W8FSPbYmwPj/IGcl6wZL5lReuu/rMT55x2XqvOZlwLv3nR37QP5x/Kh5zJA6iuhihhLAxI+nWtvy+sftrz2UxAfjZpq48gwfERMdbCcLzFXIevzrqux25QsAgyMkKoBHI2FJCKX5u0yYE00hwZuakuP/+R3OBUs/blgQVvTAGy0BrM6cycnvyMx+ei1WhxA5l/SalNXAQl5EYLARgGAMADB/BRWBHhVw0xQ4RqE+IfXO0mMGCSORdP+jLBLt2bt4zqLUZtiRhsr14HiMt9bPjXespeYHF7BjNeGY8Ix1WtDamtiZa95YVkcsbG9N63bo19mU3rH90aMT9fSxiicmkJMwgJ2ile4G9VV1nDSAlGl4p070/DU/EbEsBpbljwzO/6r23td012uyRQkya7SjAFCgNX+nnxpOY03HLla+eLVX1Ga9uTTi/CwDA6fQkAM65wbepVOd9EiMSHmzlruksmBlnYpXRXRMZBGkJaGW2bdqEAACUNjulFBNmOzKDSQiZzXt6IFt4eTyJObUW1kHM5by2bME3JITYV/0waWVeBAB/SUQDwMvdQz8ZzhSGLCmsg3mDRGLPdOZrxgExhjv3jzG4uG+g2Gwe+5zmV2mS5DoiZksKaIPux/6nffd4EnM6BOhTz/a0B4HpsyRRqbIqgUlpRqCwCwBqa4dMc3NC3vq9jYOeZ34ZjUzsDYbF9w185e8ZL4WzSGWFzQ9Mlzb7XqNSujkgMHsB8QLv1UmDQwZLSdDGvNra2u4WDeZ0dr+YmSnd2pY1MO2WFGOGHSDh+QpZz+0oxVTFYv406no/UerA2z1LpHsQGPiadgOHX3z/qFAn4zvk6aBbKb0/+LLgBfBdvWVsZUi5Q4/lctEBEiWFgNJm6zj7NL1jyUUC1BjeJiWdzOEdICwlkecpz8373WMxFQEpgDs7Blvn18RGKqJOTaDM+NvemEiIghdwJhd0AntLjcwaCSl1yBjd5/umVPOEmcGWFOS6KrNtR++O0uczebW74ClggjsPqfjFIFAvlk2CS1dYuMG2cf4fLCmg2fQ//+yO/pKRp2Lyxg33PT2gfLMxYstxHFzYNykISpvRzuFMz1Sj9BkFpNShrBsMKmPyoljGAmC2LAHNZucd6ef6Sxf3DoxwZ6B0VgoxUS6XCAKNoGhoy3Gdd0mlFrxgu9JcmngjBcEYdKU3dhRKxyvGe42uUo8RYV9vi0KVCkLPnfc9PTTVKH1GASl1qG3TriFjeFiWrhAkMlIQmLEV425jfuS5kUFt0GcJGtvuHkfaiYIb6NGMfnX6Hta+KpUsZ2dYfxeCiVgIAaPDW3FKV6wCewvqF1w8kXcVCJDjg0JLCBiNPUBIYGK2FMHcV/UD6Y0dBTbcL2hvjEFECAI1ZtCTyaTYtGlTYIzec4DrywxbEgLNPc/2vjRtD2t/lZor+F2urxQRCeKwzpdm7Nw/lkgUKZftz/dvzrlBv22JMc+MiZgEoLTeMT7wnHVurzGhOtJG9QlBQFhPhJTScH29uaQ6SlJCQLvY725ZAoxlSShjtqbTHYUyeFj7uL6b+9r72fCQLF5dxOGdCDsnsGPMyaS4Y/3vRg1zm22N98zCHinN26fbrxkFpLRSlOIeQWPRrMy7ivO+eXl8kBa6vthJB4oZh7S23jRel5dDggHggQe2Zwxzf0gSELQ2cH1/10S2qvRurcyzch/KhUlpAy/wt00nBjkqgSEAGHBnWHgjDPCUMgO7ukd2lVZqaQBaB6/q/TKUS5RJwTVPlsugjyFSlDalTI8QAhAg19PwlNp1MFvlev5zWo/vJwnX1/BVaOOABjOrAZFSdhWthwkjbrPzjgd+N1ryYsZiFsW7/GBvzMIMFkLIbC7wegdGfx9OUvlq9o6teOZuEfpTMlAmPzLgFisZpSbaS8FIxt1a8BQASA4XGfm+yuzpKnRM9L1ZERiOF13X1d3amCI4BF+rULTDu5lUycAOj2a7FtbG2R7b0mW2bYuy+WBr6u4ndhcr1pW9TpUg0R32TZDrBf0P/Lp3IJTefW1Vc1goEwWNnb6vc9GYXaGV1lKSNMwdt9z/VH/xe7NTQkor3/Xd7kBpCBFG4axp60QxS6GQ6zWMTNEtZhAZSxKCQD8BgIu31ZS9BUb3sgGscIOpa/v27d74GGR/Vz51V2ufYe60JIEBY0mBQOtXAZjpFqKZUUDG6AONHs/XAAuplEHeVy+Pl6DSQJ989bkhZtMfpnkyl4i+fKB+PV1jeVAa3nCvYRPuiRt0jKNWDuTAQrujtTG7ZUgSm2I9ya3Tod2Pkg0JdWl/3+igUiYnJcmCF8D1g1f2I+CYk0nR2gqltemWUozZj0zO8wdHsr+brrGcUIJL2TGe1690CIgX6J3jqZXJ7I6vzM5ifjCzMVA6ZBGmu2hm1IaUdPCvXukZXrly6ZBtyYps3st39uU6ASBRJO6AvTtsBtQhQhpDO5aU2Zz/8jXf/E17aD/KXOewmB2jDQ8qZeDYgFF6x2H6aDtD6RbC9RSy+WDrdFjeo+VlMRGwcWNHgUj025YAGN0bnhnt25/vGct2DMxuCoNDY1sEo/VvAZiZsB8llTqSzY34gWZtDFyl2g+20lvGRFrvMdoAYLvgqXz/6OCrY4tsNschDz4YGjltdK9jCRhwZ1tbmz+R0QQAw6a9VHhKG6Dg6ydmWqW6eXfUsAn8wKBQCHmsydRjSc25nun0lYZtSdLMu75296aeMPbFrJaQsZWvAr1HSjJ+oHeNc3kPWHmaRPGMO9nZvMejGa8YoTeU3d1tagonb2igkBUg1/dVYSCTPSh9XkoCdH3d4/mKHUsiCPTLAMyDZSj1d9RON2lDvfGoLQBMUj42nPBMNre74CrYtpB+oDuf7np5W7kIxckY6Zde8LIMxLUx6uZ7nx44GH1eOvqdyWWHtOaClASl9fPl8LCOCiAl2jpfCFo6ekZfKbj6sfG/31999Ax5XYEymagjESizOZ3uKEyHzj6UjWMGtba3uwPDhbUDw/m1AILJ1Ol4qerYkRk1xmSNYR1o9Xy53HJrpgEp3cd02c2PrAfwDiA8XbT/PU0lj+znG4f733Pc/B5LynigioRiUxm2bCeXEgaAS//lkdv2/o74UFL1VEdb9lR+KwyzzI/4L+yV8tbZDcjepQgigioV7J8s6KJUymc+rr8iZh/v++VbeYdqpQj7MEpicHEM/kgmuGBkdKjuC99sfYkBojKUHz9qgBRBoIN5IaVYxA3MD3Z0DOrejPlN+JfWGb/L/Uhqk5TG8Nkb1z889ju82V7z1pxIyGSy3nrdDzSZTArmpOA34ML7X/7TP8SjhND3AAAAAElFTkSuQmCC";

const K9Logo = ({size=38}) => <img src={K9_LOGO_SRC || K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;
const K9LogoMini = ({size=28}) => <img src={K9_LOGO_SRC || K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;

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
  "ops-bathing":"ops/bathing", "ops-pamper":"ops/pamper", "ops-svc":"ops/service",
  management:"management", "mgmt-attendance":"management/attendance", "mgmt-audit-log":"management/audit-log",
  "checkout-tv":"checkout-tv",
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
  const locations = locs.filter(l => !l.isEnterprise && !l.isPOS);
  const posLocations = locs.filter(l => l.isPOS);

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

            {/* POS locations */}
            {posLocations.length > 0 && <>
              <div style={{ margin: "4px 10px", height: 1, background: "rgba(175,141,84,0.12)" }}/>
              {posLocations.map(loc => (
                <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(100,180,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(100,180,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(100,180,255,0.9)" }}>{loc.name}</div>
                    <div style={{ fontSize: 9, color: "rgba(100,180,255,0.5)", textTransform: "uppercase" }}>Full POS App</div>
                  </div>
                </button>
              ))}
            </>}
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
const fmtTime = (t) => { if(!t) return ""; const s = typeof t === "string" ? t : (t instanceof Date ? t.toTimeString().slice(0,5) : String(t)); const [h,m] = s.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2,"0")} ${ampm}`; };
const fmtInstr = (v) => Array.isArray(v) ? v.join(", ") : (v || "");

const todayStr = () => { const d = (window.__K9_TIME_TRAVEL__ ? new Date(window.__K9_TIME_TRAVEL__ + "T12:00:00") : new Date()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const addDays = (d, n) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]; };
const formatTime12hr = (t) => { if (!t) return ""; const s = typeof t === "string" ? t : (t instanceof Date ? t.toTimeString().slice(0,5) : String(t)); const [h, m] = s.split(":").map(Number); if (isNaN(h)) return s; const suffix = h >= 12 ? "PM" : "AM"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m || 0).padStart(2, "0")} ${suffix}`; };

// ── Revenue Intelligence Helpers ────────────────────────────────────────
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};
const countHours = (tIn, tOut) => {
  if (!tIn || !tOut) return 8;
  const [h1,m1] = tIn.split(":").map(Number);
  const [h2,m2] = tOut.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
};
const LITE_DEF_PRICING = {
  boardingRates: { "Luxury Suite": 95, "Executive Room": 75, "Double Compartment": 65, "Single Compartment": 55 },
  daycareRates: { fullDay: 45, halfDay: 30 },
  halfDayThreshold: 5,
  multiDogDiscount: 20,
};
const CHART_PTS = 30;

// ── K9 Loading Animation (orbiting nodes — matches POS Ask AI) ──
function K9LoadingAnimation({ size = 56, message = "Loading...", subMessage }) {
  const scale = size / 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
      <style>{`
        @keyframes k9orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes k9pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } }
        @keyframes k9fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="k9LoadGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4A46A"/>
            <stop offset="100%" stopColor="#AF8D54"/>
          </linearGradient>
        </defs>
        {/* Head hub */}
        <circle cx="50" cy="46" r="14" fill="url(#k9LoadGold)" style={{ animation: "k9pulse 2s ease-in-out infinite" }}/>
        <circle cx="50" cy="46" r="5" fill="#003462" opacity="0.18"/>
        {/* Orbiting ears + collar tag */}
        <g style={{ transformOrigin: "50px 46px", animation: "k9orbit 3s linear infinite" }}>
          <line x1="50" y1="46" x2="26" y2="22" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="46" x2="74" y2="22" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="46" x2="50" y2="74" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          {/* Left ear — angled ellipse */}
          <ellipse cx="26" cy="22" rx="6" ry="8.5" fill="#AF8D54" opacity="0.5" transform="rotate(-20 26 22)" style={{ animation: "k9fade 2s ease-in-out infinite" }}/>
          {/* Right ear — angled ellipse */}
          <ellipse cx="74" cy="22" rx="6" ry="8.5" fill="#AF8D54" opacity="0.5" transform="rotate(20 74 22)" style={{ animation: "k9fade 2s ease-in-out 0.7s infinite" }}/>
          {/* Collar tag */}
          <circle cx="50" cy="74" r="6" fill="#AF8D54" opacity="0.45" style={{ animation: "k9fade 2s ease-in-out 1.4s infinite" }}/>
        </g>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec, fontFamily: "'GT Eesti', -apple-system, sans-serif" }}>{message}</div>
        {subMessage && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4, fontFamily: "'GT Eesti', -apple-system, sans-serif" }}>{subMessage}</div>}
      </div>
    </div>
  );
}
const _chartFmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const _chartFmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : _chartFmt$(v);

// ── Revenue Intelligence: Animated Line Chart (module-level for animation persistence) ──
const InteractiveLineChart = React.memo(({ chartData, color = "#003462", compareColor = "#AF8D54", showCompare, height = 240, id = "chart", animationEpoch }) => {
  const svgRef = React.useRef(null);
  const [display, setDisplay] = React.useState(null);
  const [hover, setHover] = React.useState(null);

  const normalize = (raw, accessor) => {
    if (!raw || raw.length === 0) return Array(CHART_PTS).fill(0);
    const vals = raw.map(accessor);
    if (vals.length === 1) return Array(CHART_PTS).fill(vals[0]);
    return Array.from({ length: CHART_PTS }, (_, i) => {
      const t = i / (CHART_PTS - 1) * (vals.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, vals.length - 1);
      return vals[lo] + (vals[hi] - vals[lo]) * (t - lo);
    });
  };

  const targetMain = React.useMemo(() => normalize(chartData, d => d.value), [chartData]);
  const targetComp = React.useMemo(() => normalize(chartData, d => d.prevValue || 0), [chartData]);
  const targetMax = React.useMemo(() => Math.max(...targetMain, ...(showCompare ? targetComp : [0]), 1), [targetMain, targetComp, showCompare]);

  React.useEffect(() => {
    const prev = display || { main: Array(CHART_PTS).fill(0), comp: Array(CHART_PTS).fill(0), max: targetMax };
    let start;
    const dur = 600;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay({
        main: targetMain.map((v, i) => prev.main[i] + (v - prev.main[i]) * ease),
        comp: targetComp.map((v, i) => (prev.comp[i] || 0) + (v - (prev.comp[i] || 0)) * ease),
        max: prev.max + (targetMax - prev.max) * ease,
      });
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetMain, targetComp, targetMax, animationEpoch]);

  const mainVals = display ? display.main : targetMain;
  const cmpVals = display ? display.comp : targetComp;
  const curMax = display ? display.max : targetMax;
  const n = CHART_PTS;

  if (!chartData || chartData.length === 0) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B95A5", fontSize: 12 }}>No data for this period</div>
  );

  const pad = { top: 20, right: 16, bottom: 28, left: 50 };
  const w = 500, h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const x = (i) => pad.left + (i / (n - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / (curMax || 1)) * plotH;

  const spline = (vals) => {
    let d = `M ${x(0)} ${y(vals[0])}`;
    for (let i = 0; i < n - 1; i++) {
      const cx1 = x(i) + (x(i + 1) - x(i)) / 3;
      const cx2 = x(i + 1) - (x(i + 1) - x(i)) / 3;
      d += ` C ${cx1} ${y(vals[i])}, ${cx2} ${y(vals[i + 1])}, ${x(i + 1)} ${y(vals[i + 1])}`;
    }
    return d;
  };

  const gridLines = 4;
  const hoverIdx = hover !== null ? hover : null;
  const hoverData = hoverIdx !== null && chartData.length > 0 ? chartData[Math.min(Math.round(hoverIdx / (n - 1) * (chartData.length - 1)), chartData.length - 1)] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = (e.clientX - rect.left) / rect.width * w;
          const idx = Math.round((mx - pad.left) / plotW * (n - 1));
          if (idx >= 0 && idx < n) setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}>
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const val = (curMax / gridLines) * i;
          const yPos = y(val);
          return (
            <g key={i}>
              <line x1={pad.left} y1={yPos} x2={w - pad.right} y2={yPos} stroke="#E5E7EB" strokeWidth="0.5" />
              <text x={pad.left - 6} y={yPos + 3} textAnchor="end" fill="#8B95A5" fontSize="9" fontFamily="'GT Eesti', sans-serif">{_chartFmt$k(val)}</text>
            </g>
          );
        })}
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${spline(mainVals)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#${id}-grad)`} />
        <path d={spline(mainVals)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {showCompare && <path d={spline(cmpVals)} fill="none" stroke={compareColor} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />}
        {hoverIdx !== null && (
          <g>
            <line x1={x(hoverIdx)} y1={pad.top} x2={x(hoverIdx)} y2={h - pad.bottom} stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
            <circle cx={x(hoverIdx)} cy={y(mainVals[hoverIdx])} r="4" fill="white" stroke={color} strokeWidth="2" />
            {showCompare && <circle cx={x(hoverIdx)} cy={y(cmpVals[hoverIdx])} r="3" fill="white" stroke={compareColor} strokeWidth="1.5" />}
          </g>
        )}
      </svg>
      {hoverData && hoverIdx !== null && (
        <div style={{
          position: "absolute", top: 4, right: 4, background: "white", border: "1px solid #E5E7EB", borderRadius: 8,
          padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", fontSize: 11, pointerEvents: "none", zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: "#1A2233", marginBottom: 2 }}>{hoverData.label}</div>
          <div style={{ color, fontWeight: 600 }}>{_chartFmt$(hoverData.value)}</div>
          {showCompare && hoverData.prevValue !== undefined && <div style={{ color: compareColor, fontSize: 10 }}>Prev: {_chartFmt$(hoverData.prevValue)}</div>}
        </div>
      )}
    </div>
  );
});

// ─── Operations Constants ──────────────────────────────────────────────────
const OPS_TYPES = {opening:{key:"openingTemplate",def:DEF_OPENING_TEMPLATE,title:"Opening Checklist"},fe:{key:"feTemplate",def:DEF_FE_TEMPLATE,title:"Front-End Checklist",showTime:true},be:{key:"beTemplate",def:DEF_BE_TEMPLATE,title:"Back-End Checklist",showTime:true},closing:{key:"closingTemplate",def:DEF_CLOSING_TEMPLATE,title:"Closing Checklist"},room_cleaning:{title:"Room Cleaning"},pictures:{title:"Picture Checklist"},pp:{title:"Private Play Checklist"},bathing:{title:"Bathing Report"},pamper:{title:"Pamper Package Plus"},svc:{title:"Service Report"},eod:{title:"End-of-Day Report",isEod:true}};

const DEF_LITE_EOD_TEMPLATE = [
  { id:"sales", title:"Sales", emoji:"💵", type:"text", defaultContent:"Today's Goal:\nWTD:\nMTD:\nYTD:" },
  { id:"csr_checklist", title:"CSR Checklist", emoji:"📋", type:"checklist", defaultContent:"Turn on Luxury TV's\nTurn on music\nCreate Private Play log\nVacuum and Cherry front lobby before 7:00 am\nUnlock latches on front door\nCheck incoming Tours\nDo body checks on dogs leaving today and fill out form" },
  { id:"alerts", title:"Alerts", emoji:"📢", type:"text", defaultContent:"- Goal for Each CSR to book at least 1 Eval/Tour and Sell 1 Package/book reservation w/paid deposit daily" },
  { id:"team_notes", title:"Team Notes / Communications", emoji:"💬", type:"text", defaultContent:"" },
  { id:"leads", title:"Leads to Target Today", emoji:"🎯", type:"text", defaultContent:"" },
  { id:"tours", title:"Tours", emoji:"🏠", type:"text", defaultContent:"" },
  { id:"meds", title:"Meds", emoji:"💊", type:"text", defaultContent:"Boarding:\nAM:\n-\nNOON:\n-\nPM:\n-\n\nDaycare:\n-" },
  { id:"birthdays", title:"Birthdays", emoji:"🎉", type:"text", defaultContent:"" },
  { id:"ice_cream", title:"Doggie Ice Cream", emoji:"🍦", type:"text", defaultContent:"" },
  { id:"extra_play", title:"Extra Play Sessions", emoji:"⚽", type:"text", defaultContent:"" },
  { id:"baths", title:"Baths", emoji:"🛁", type:"checklist", defaultContent:"" },
  { id:"day_boarders", title:"Day Boarders / PP", emoji:"🚩", type:"text", defaultContent:"" },
  { id:"evaluations", title:"Evaluations", emoji:"📊", type:"text", defaultContent:"Name, L/S daycare, Room # - Pass/fail, if parents have been contacted\n-" },
  { id:"small_daycare_notes", title:"Small Daycare Notes", emoji:"🐕", type:"text", defaultContent:"(Dogs name, last initial, date/time and details of incident)\n-" },
  { id:"large_daycare_notes", title:"Large Daycare Notes", emoji:"🐕", type:"text", defaultContent:"(Dogs name, last initial, date/time and details of incident)\n-" },
  { id:"boarding_notes", title:"Boarding Notes", emoji:"🏨", type:"text", defaultContent:"" },
  { id:"social_media", title:"Social Media Photos", emoji:"📸", type:"checklist", defaultContent:"Instagram Stories\nInstagram Post" },
  { id:"picture_requests", title:"Picture Requests", emoji:"📷", type:"checklist", defaultContent:"" },
  { id:"building_supplies", title:"Building / Supplies", emoji:"🔧", type:"text", defaultContent:"" },
  { id:"other", title:"Other", emoji:"📝", type:"text", defaultContent:"" },
];
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
  // Services are dynamically generated from reservation data — see OperationsHub component
  { id:"eod", label:"EOD Report", frequency:"daily", dataKey:"eodEntries", typeSub:null, routeTo:"eod", permission:"view_eod" },
  // Weekly placeholders
  { id:"weekly-inventory", label:"Weekly Inventory", frequency:"weekly", comingSoon:true },
  { id:"weekly-maintenance", label:"Weekly Maintenance", frequency:"weekly", comingSoon:true },
  // Monthly placeholders
  { id:"monthly-safety", label:"Monthly Safety Audit", frequency:"monthly", comingSoon:true },
  { id:"monthly-deep-clean", label:"Monthly Deep Clean", frequency:"monthly", comingSoon:true },
];

// ─── Client & Dog Field Definitions ───────────────────────────────────────
const DEF_CLIENT_FIELDS = [
  { id:"phone",name:"Phone Number",type:"tel",requiredFor:["create"],isKey:true,locked:true,order:0 },
  { id:"first_name",name:"First Name",type:"text",requiredFor:["tour"],locked:false,order:1 },
  { id:"last_name",name:"Last Name",type:"text",requiredFor:["tour"],locked:false,order:2 },
  { id:"email",name:"Email",type:"email",requiredFor:["eval"],locked:false,order:3 },
  { id:"street",name:"Street Address",type:"text",requiredFor:[],locked:false,order:4 },
  { id:"city",name:"City",type:"text",requiredFor:[],locked:false,order:5 },
  { id:"state",name:"State",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"zip",name:"Zip Code",type:"text",requiredFor:[],locked:false,order:7 },
  { id:"emergency_contact",name:"Emergency Contact",type:"text",requiredFor:[],locked:false,order:8 },
  { id:"emergency_phone",name:"Emergency Phone",type:"tel",requiredFor:[],locked:false,order:9 },
  { id:"notes",name:"Notes",type:"textarea",requiredFor:[],locked:false,order:10 },
  { id:"referral_source",name:"Referral Source",type:"select",requiredFor:[],locked:false,order:11,options:["Friend/Family","Google","Social Media","Website","Walk-In","Vet Referral","Other"] },
];

const DEF_DOG_FIELDS = [
  { id:"name",name:"Dog Name",type:"text",requiredFor:["tour"],locked:true,order:0 },
  { id:"breed",name:"Breed",type:"text",requiredFor:["eval"],locked:true,order:1 },
  { id:"weight",name:"Weight (lbs)",type:"number",requiredFor:["reservation"],locked:false,order:2 },
  { id:"dob",name:"Date of Birth",type:"date",requiredFor:[],locked:false,order:3 },
  { id:"sex",name:"Sex",type:"select",options:["Male","Female"],requiredFor:["reservation"],locked:true,order:4 },
  { id:"spayed_neutered",name:"Spayed/Neutered",type:"select",options:["Neutered","Spayed","Intact"],requiredFor:["reservation"],locked:true,order:5 },
  { id:"color",name:"Color/Markings",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"temperament",name:"Temperament Notes",type:"textarea",requiredFor:[],locked:false,order:8 },
];

const LITE_ACTION_LEVELS = ["create"];
const LITE_ACTION_LABELS = { create: "Create Record" };

function isFieldRequired(field, action) {
  const rf = field.requiredFor || [];
  if (rf.length === 0) return false;
  return rf.includes(action) || rf.includes("create");
}

function validateClientFields(fields, values) {
  const errs = {};
  fields.forEach(f => {
    if (isFieldRequired(f, "create") && !values[f.id]) errs[f.id] = "Required";
  });
  return errs;
}

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
  { section:"Client Info", key:"createdAt", label:"Created Date", type:"date", ops:["after","before","inLastDays"] },
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
  Object.keys(allRooms).forEach(rt => {
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


// Helper: check if reservation has a specific service (used outside DailyOpsPage)
function resSvcIncludes(res, partial) {
  const svcs = res._services;
  if (!svcs) return false;
  const arr = Array.isArray(svcs) ? svcs : [];
  return arr.some(s => {
    const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
    return name.toLowerCase().includes(partial.toLowerCase());
  });
}

function getPPStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_pp_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  // Count PP dogs: dogs with "Private Play" add-on OR day boarding dogs
  const reservations = data.reservations || [];
  const ppRes = reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare" || r.type === "dayboarding") &&
    r.status === "checked-in" &&
    r.checkIn <= td && r.checkOut >= td &&
    (resSvcIncludes(r, "Private Play") || r.type === "dayboarding")
  );
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

// ─── hasLitePermission Helper ──────────────────────────────────────────────
function hasLeanPermission(profile, area) {
  if (!profile) return false;
  const userRole = profile.role || "pct";
  const roleKey = userRole === "owner" ? "enterprise_admin" : userRole;
  const perms = LEAN_PERMISSION_MATRIX[roleKey] || {};
  return perms[area] === true;
}

// ─── Gingr Reservation Type → Lite Type Mapping ───────────────────────────
function classifyReservationType(typeName) {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval")) return "evaluation";
  if (t.includes("tour")) return "tour";
  if (t.includes("day boarding") || t === "day boarding") return "dayboarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  if (t.includes("groom") || t.includes("bath")) return "grooming";
  return "other";
}

function classifyReservationStatus(r) {
  if (r.cancelled_date) return "cancelled";
  if (r.check_in_date && r.check_out_date) return "checked-out";
  if (r.check_in_date && !r.check_out_date) return "checked-in";
  const now = new Date();
  const start = r.start_date ? new Date(r.start_date) : null;
  if (start && start > now) return "upcoming";
  return "checked-out";
}

function extractRoomFromType(typeName) {
  if (!typeName) return null;
  // "Boarding | Luxury Suite (All Inclusive)" → "Luxury Suite"
  // "Boarding | Executive Room (All Inclusive)" → "Executive Room"
  // "Boarding | Double Compartment (All Inclusive)" → "Double Compartment"
  // "Boarding | Single Compartment (All Inclusive)" → "Single Compartment"
  for (const rt of ROOM_TYPES) {
    if (typeName.toLowerCase().includes(rt.toLowerCase())) return rt;
  }
  return null;
}

// ─── useGingrData Hook (Supabase + Gingr Sync) ────────────────────────────
function useGingrData(locationId) {
  const [clients, setClients] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState({});
  const [resTypes, setResTypes] = useState([]);
  const [immunizationTypes, setImmunizationTypes] = useState([]);
  const [syncState, setSyncState] = useState(null);
  const [serverStats, setServerStats] = useState(null); // RPC-computed client stats
  const [loading, setLoading] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // ── Restore cached data instantly on mount (zero network wait) ──
  const cacheRestored = useRef(false);
  useEffect(() => {
    if (!locationId || cacheRestored.current) return;
    cacheRestored.current = true;
    idbGet(`data_v2_${locationId}`).then(cached => {
      if (cached && !hasLoadedOnce.current) {
        if (cached.clients) setClients(cached.clients);
        if (cached.dogs) setDogs(cached.dogs);
        if (cached.serverStats) setServerStats(cached.serverStats);
        if (cached.resTypes) setResTypes(cached.resTypes);
        if (cached.immunizationTypes) setImmunizationTypes(cached.immunizationTypes);
      }
    });
  }, [locationId]);
  const refreshTimerRef = useRef(null);

  // ── Transform Gingr owners → Lite client shape ──
  const transformOwners = useCallback((owners) => {
    return owners.map(o => ({
      id: `g${o.gingr_id}`,
      gingrId: o.gingr_id,
      createdAt: o.owner_created_at || "2019-10-14T00:00:00", // legacy clients pre-date Gingr tracking
      source: "online",
      sourceData: null,
      fields: {
        phone: (o.cell_phone || o.home_phone || "").replace(/\D/g, ""),
        first_name: (o.first_name || "").trim(),
        last_name: (o.last_name || "").trim(),
        email: o.email || "",
      },
      lifecycleLog: [],
      bookingDrafts: [],
      igniteData: null,
      coldMarkedAt: null,
      revivedAt: null,
      discountUsage: [],
      _lastReservation: o.last_reservation,
      _nextReservation: o.next_reservation,
      _numReservations: o.number_reservations || 0,
      _balance: o.current_balance,
      _animalNames: o.animal_names,
      _emergencyContact: o.emergency_contact_name,
      _emergencyPhone: o.emergency_contact_phone,
      _address: [o.address_1, o.address_2, o.city, o.state, o.zip].filter(Boolean).join(", "),
    }));
  }, []);

  // ── Transform Gingr animals → Lite dog shape ──
  const transformAnimals = useCallback((animals) => {
    return animals.map(a => {
      const bday = a.birthday ? new Date(a.birthday * 1000) : null;
      const ageYears = bday ? Math.floor((Date.now() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
      return {
        id: `g${a.gingr_id}`,
        gingrId: a.gingr_id,
        clientId: `g${a.owner_gingr_id}`,
        fields: {
          name: a.name || "Unknown",
          breed: a.breed_name || "",
          age: ageYears !== null ? String(ageYears) : "",
          weight: a.weight || "",
          spayed_neutered: a.fixed || false,
        },
        _image: a.image_url,
        _gender: a.gender,
        _vip: a.vip,
        _banned: a.banned,
        _medicines: a.medicines,
        _allergies: a.allergies,
        _notes: a.notes,
        _groomingNotes: a.grooming_notes,
        _nextImm: a.next_immunization_expiration,
      };
    });
  }, []);

  // ── Transform Gingr reservations → Lite reservation shape ──
  const transformReservations = useCallback((gRes) => {
    return gRes
      .filter(r => !r.cancelled_date) // exclude cancelled
      .map(r => {
        const type = classifyReservationType(r.reservation_type_name);
        const status = classifyReservationStatus(r);
        const startD = r.start_date ? r.start_date.split("T")[0] : todayStr();
        const endD = r.end_date ? r.end_date.split("T")[0] : startD;
        const roomType = extractRoomFromType(r.reservation_type_name);
        const price = r.transaction?.price || r.deposit?.amount || 0;

        return {
          id: `g${r.gingr_id}`,
          gingrId: r.gingr_id,
          clientId: r.owner_gingr_id ? `g${r.owner_gingr_id}` : null,
          dogIds: r.animal_gingr_id ? [`g${r.animal_gingr_id}`] : [],
          dogId: r.animal_gingr_id ? `g${r.animal_gingr_id}` : null,
          type,
          checkIn: startD,
          checkOut: endD,
          checkOutTime: r.check_out_date ? r.check_out_date.split("T")[1]?.slice(0, 5) : null,
          scheduledCheckOutTime: r.end_date ? r.end_date.split("T")[1]?.slice(0, 5) : null,
          status,
          pricing: { total: typeof price === "number" ? price : parseFloat(price) || 0 },
          room: null, // assigned later by assignRoomsIntelligently()
          roomType: roomType, // preserve for room assignment
          _resTypeName: r.reservation_type_name,
          _resTypeId: r.reservation_type_id,
          _services: r.services,
          _animalName: r.animal_name,
          _ownerName: [r.owner_first_name, r.owner_last_name].filter(Boolean).join(" "),
          _notes: r.notes_reservation,
        };
      });
  }, []);

  // ── Intelligent Room Assignment ──
  // Distributes boarding reservations across available rooms by type.
  // Uses greedy interval scheduling: sort by check-in, assign to first non-overlapping room.
  const assignRoomsIntelligently = useCallback((reservations, roomsMap) => {
    if (!reservations || reservations.length === 0) return reservations;
    const boarding = reservations.filter(r => r.type === "boarding" && r.roomType);
    const rest = reservations.filter(r => r.type !== "boarding" || !r.roomType);
    // Group by room type
    const byType = {};
    boarding.forEach(r => {
      if (!byType[r.roomType]) byType[r.roomType] = [];
      byType[r.roomType].push(r);
    });
    const assigned = [];
    Object.entries(byType).forEach(([roomType, group]) => {
      const rooms = roomsMap[roomType] || [];
      if (rooms.length === 0) { group.forEach(r => assigned.push(r)); return; }
      // Sort by check-in date, then ID for stability
      group.sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "") || (a.id || "").localeCompare(b.id || ""));
      // Track occupancy per room: array of {checkIn, checkOut}
      const occ = {};
      rooms.forEach(rm => { occ[rm] = []; });
      group.forEach(r => {
        let picked = null;
        for (const rm of rooms) {
          const overlap = occ[rm].some(o => o.checkIn < r.checkOut && r.checkIn < o.checkOut);
          if (!overlap) { picked = rm; break; }
        }
        if (!picked) picked = rooms[0]; // overflow fallback
        occ[picked].push({ checkIn: r.checkIn, checkOut: r.checkOut });
        assigned.push({ ...r, room: picked });
      });
    });
    return [...rest, ...assigned];
  }, []);

  // ── Build rooms from synced reservation types ──
  // Derives room type names from gingr_reservation_types where capacity_by_lodging=1
  // Room counts come from lite_settings "room_counts" config, with sensible defaults
  // Returns arrays of room name strings (matching POS format) e.g. { "Luxury Suite": ["Luxury Suite 1", ...] }
  const [roomCountConfig, setRoomCountConfig] = useState(null);

  const buildRooms = useCallback((resTypes, reservations, roomCounts, roomNames) => {
    const roomMap = {};
    // Extract boarding room types from synced gingr_reservation_types
    // Filter out single_day types (like Day Boarding) — they don't use overnight rooms
    const boardingTypes = (resTypes || []).filter(rt => {
      const raw = rt.raw_data || {};
      const hasLodging = raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1;
      const isSingleDay = raw.single_day === "1" || raw.single_day === 1;
      return hasLodging && !isSingleDay;
    });
    // Extract clean room type name from "Boarding | Luxury Suite (All Inclusive)" → "Luxury Suite"
    const extractRoomTypeName = (name) => {
      if (!name) return null;
      let clean = name.replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim();
      return clean || null;
    };

    // Default room counts per type (used when no room_names config is saved)
    const defaultCounts = { "Luxury Suite": 4, "Executive Room": 6, "Double Compartment": 8, "Single Compartment": 10 };
    const counts = roomCounts || {};
    const names = roomNames || {};

    // If room_names config exists, use actual room names from config
    const useNames = Object.keys(names).length > 0;

    if (useNames) {
      // Use configured room names (actual Gingr room names)
      Object.entries(names).forEach(([typeName, nameList]) => {
        if (Array.isArray(nameList) && nameList.length > 0) {
          roomMap[typeName] = [...nameList];
        }
      });
    } else if (boardingTypes.length > 0) {
      // Fallback: generate numbered rooms from reservation types + counts
      boardingTypes.forEach(bt => {
        const typeName = extractRoomTypeName(bt.name || bt.type_label);
        if (!typeName) return;
        const count = counts[typeName] ?? defaultCounts[typeName] ?? 6;
        roomMap[typeName] = [];
        for (let i = 1; i <= count; i++) {
          roomMap[typeName].push(`${typeName} ${i}`);
        }
      });
    } else {
      // Final fallback: hardcoded ROOM_TYPES
      ROOM_TYPES.forEach(rt => {
        const count = counts[rt] ?? defaultCounts[rt] ?? 6;
        roomMap[rt] = [];
        for (let i = 1; i <= count; i++) {
          roomMap[rt].push(`${rt} ${i}`);
        }
      });
    }
    return roomMap;
  }, []);

  // ── Paginated fetch helper (Supabase default limit is 1000) ──
  const fetchAll = useCallback(async (table, locationId, orderCol, ascending = true, selectCols = "*") => {
    const PAGE = 1000;
    const PARALLEL = 10;
    // First fetch to get total feel
    const { data: first, error: firstErr, count } = await supabase
      .from(table)
      .select(selectCols, { count: "exact", head: false })
      .eq("location_id", locationId)
      .order(orderCol, { ascending })
      .range(0, PAGE - 1);
    if (firstErr) throw firstErr;
    if (!first || first.length === 0) return [];
    if (first.length < PAGE) return first;
    // We know total count — fire all remaining pages in parallel
    const total = count || first.length;
    const remaining = [];
    for (let from = PAGE; from < total; from += PAGE) {
      remaining.push(
        supabase
          .from(table)
          .select(selectCols)
          .eq("location_id", locationId)
          .order(orderCol, { ascending })
          .range(from, from + PAGE - 1)
      );
    }
    // Execute in parallel batches
    let allRows = [...first];
    for (let i = 0; i < remaining.length; i += PARALLEL) {
      const batch = remaining.slice(i, i + PARALLEL);
      const results = await Promise.all(batch);
      for (const r of results) {
        if (r.error) throw r.error;
        if (r.data) allRows = allRows.concat(r.data);
      }
    }
    return allRows;
  }, []);

  // ── Load all data from Supabase ──
  // Phase 1: owners, animals, RPC stats (fast — renders lifecycle page instantly)
  // Phase 2: reservations loaded in background (needed for ops hub, client detail)
  const loadData = useCallback(async () => {
    if (!locationId) return;
    try {
      setError(null);

      // Phase 1: Fast fetch — everything the lifecycle page needs
      const [rawOwners, rawAnimals, statsRes, typesRes, immTypesRes, syncRes, roomCountRes, roomNamesRes, lcRes] = await Promise.all([
        fetchAll("gingr_owners", locationId, "last_name"),
        fetchAll("gingr_animals", locationId, "name"),
        supabase.rpc("get_client_stats", { p_location_id: locationId }),
        supabase.from("gingr_reservation_types").select("*").eq("location_id", locationId),
        supabase.from("gingr_immunization_types").select("*").eq("location_id", locationId),
        supabase.from("gingr_sync_state").select("*").eq("location_id", locationId),
        supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_counts").maybeSingle(),
        supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_names").maybeSingle(),
        supabase.from("lite_client_lifecycle").select("gingr_id,lifecycle_data").eq("location_id", locationId),
      ]);

      const roomCounts = roomCountRes?.data?.setting_value || null;
      const roomNames = roomNamesRes?.data?.setting_value || null;
      if (roomCounts) setRoomCountConfig(roomCounts);

      // Build server stats lookup: owner_gingr_id → stats
      const sMap = {};
      (statsRes.data || []).forEach(s => { sMap[s.owner_gingr_id] = s; });
      setServerStats(sMap);

      // Build lifecycle lookup: gingr_id → lifecycle_data
      const lcMap = {};
      (lcRes.data || []).forEach(r => { lcMap[r.gingr_id] = r.lifecycle_data; });

      const tClients = transformOwners(rawOwners);
      const tDogs = transformAnimals(rawAnimals);
      // Merge persisted lifecycle data onto clients (loaded from lite_client_lifecycle)
      tClients.forEach(c => {
        const lc = lcMap[String(c.gingrId)];
        if (lc) c.lifecycle = lc;
      });

      // Auto-set follow-up for NEW clients that arrived after the initial DB seed
      const newClientsNeedingLC = tClients.filter(c => !c.lifecycle && c.createdAt);
      if (newClientsNeedingLC.length > 0) {
        const rows = newClientsNeedingLC.map(c => {
          const fuDate = new Date(c.createdAt.split("T")[0] + "T12:00:00");
          fuDate.setDate(fuDate.getDate() + 1);
          const lc = {
            conversion: { notes: "", followUpDate: fuDate.toISOString().split("T")[0], updates: [], source: "", sourceDate: "", sourceReservationId: "" },
            retention: { notes: "", followUpDate: "", updates: [] },
            cold: false, coldDate: "", coldFrom: "",
          };
          c.lifecycle = lc;
          return { location_id: locationId, gingr_id: String(c.gingrId), lifecycle_data: lc, updated_at: new Date().toISOString() };
        });
        supabase.from("lite_client_lifecycle").upsert(rows, { onConflict: "location_id,gingr_id" }).then(({ error }) => {
          if (error) console.log("[K9 Lite] New client lifecycle seed error:", error.message);
        });
      }

      // Auto-set retention follow-up dates for clients missing one
      // Lapse date = last_res_date + threshold (90 daycare / 180 boarding-heavy)
      // Mirrors conversion follow-up logic: computed once, persisted to Postgres
      const retentionNeedingFU = tClients.filter(c => {
        if (c.lifecycle?.retention?.followUpDate) return false; // already set
        const gingrId = String(c.gingrId);
        const srv = sMap[gingrId];
        if (!srv?.last_res_date || !srv.has_real_booking) return false;
        if (srv.has_upcoming) return false; // active, not retention
        const totalRes = Number(srv.total_res) || 0;
        if (totalRes === 0) return false;
        const daysSince = Math.floor((Date.now() - new Date(srv.last_res_date).getTime()) / 86400000);
        const bdPct = (Number(srv.boarding_count) || 0) / totalRes;
        const dcThresh = 90, bdThresh = 180;
        const thresh = bdPct > 0.5 ? bdThresh : dcThresh;
        return daysSince >= thresh; // actually in retention
      });
      if (retentionNeedingFU.length > 0) {
        const retRows = retentionNeedingFU.map(c => {
          const gingrId = String(c.gingrId);
          const srv = sMap[gingrId];
          const totalRes = Number(srv.total_res) || 1;
          const bdPct = (Number(srv.boarding_count) || 0) / totalRes;
          const thresh = bdPct > 0.5 ? 180 : 90;
          const lapseDate = new Date(srv.last_res_date + "T12:00:00");
          lapseDate.setDate(lapseDate.getDate() + thresh);
          const lapseDateStr = lapseDate.toISOString().split("T")[0];
          const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          const updatedLC = { ...lc, retention: { ...lc.retention, followUpDate: lapseDateStr } };
          c.lifecycle = updatedLC;
          return { location_id: locationId, gingr_id: gingrId, lifecycle_data: updatedLC, updated_at: new Date().toISOString() };
        });
        supabase.from("lite_client_lifecycle").upsert(retRows, { onConflict: "location_id,gingr_id" }).then(({ error }) => {
          if (error) console.log("[K9 Lite] Retention follow-up seed error:", error.message);
          else console.log(`[K9 Lite] Seeded ${retRows.length} retention follow-up dates`);
        });
      }

      setClients(tClients);
      setDogs(tDogs);
      setResTypes(typesRes.data || []);
      setImmunizationTypes(immTypesRes.data || []);
      setSyncState(syncRes.data || []);

      // Determine last sync
      const ownerSync = (syncRes.data || []).find(s => s.entity_type === "owners");
      if (ownerSync?.last_sync_at) setLastSyncAt(ownerSync.last_sync_at);

      hasLoadedOnce.current = true;

      // Cache for instant loads on next visit (versioned to bust stale caches)
      idbSet(`data_v2_${locationId}`, {
        clients: tClients, dogs: tDogs, serverStats: sMap,
        resTypes: typesRes.data || [], immunizationTypes: immTypesRes.data || [],
      });

      // Phase 2: Background fetch reservations (for ops hub, client detail, etc.)
      fetchAll("gingr_reservations", locationId, "start_date", false,
        "gingr_id,location_id,owner_gingr_id,animal_gingr_id,reservation_type_name,reservation_type_id,start_date,end_date,check_in_date,check_out_date,cancelled_date,transaction,deposit,services,animal_name,owner_first_name,owner_last_name,notes_reservation"
      ).then(rawRes => {
        const tReservations = transformReservations(rawRes);
        const tRooms = buildRooms(typesRes.data || [], tReservations, roomCounts, roomNames);
        const assignedRes = assignRoomsIntelligently(tReservations, tRooms);
        setReservations(assignedRes);
        setRooms(tRooms);
      }).catch(err => console.error("Background reservation fetch failed:", err));

    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err.message);
    }
  }, [locationId, transformOwners, transformAnimals, transformReservations, buildRooms, assignRoomsIntelligently]);

  // ── Helper: extract real error from edge function responses ──
  const extractEdgeFnError = async (fnError) => {
    if (!fnError) return null;
    // FunctionsHttpError has the response context — try to get the body
    try {
      if (fnError.context?.body) {
        const reader = fnError.context.body.getReader?.();
        if (reader) {
          const { value } = await reader.read();
          const text = new TextDecoder().decode(value);
          try { const j = JSON.parse(text); return j.error || j.message || text; } catch (_) { return text; }
        }
      }
      if (typeof fnError.message === "string" && fnError.message !== "Edge Function returned a non-2xx status code") return fnError.message;
    } catch (_) {}
    return fnError.message || "Unknown edge function error";
  };

  // ── Developer error log (copyable) ──
  const [lastErrorLog, setLastErrorLog] = useState(null);

  // ── Trigger sync via Edge Function (auto-retries backfill until complete) ──
  const [syncProgress, setSyncProgress] = useState(null); // { chunksProcessed, chunksRemaining }
  const triggerSync = useCallback(async (syncType = "full") => {
    if (!locationId || syncing) return;
    try {
      setSyncing(true);
      setSyncProgress(null);
      setLastErrorLog(null);
      let backfillComplete = false;
      let totalSynced = 0;
      let iteration = 0;
      while (!backfillComplete) {
        iteration++;
        const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
          body: { location_id: locationId, sync_type: syncType },
        });
        if (fnError) {
          const detail = await extractEdgeFnError(fnError);
          const errObj = new Error(detail);
          errObj._detail = detail;
          errObj._raw = fnError;
          throw errObj;
        }
        console.log(`Gingr sync iteration ${iteration}:`, fnData);
        const resResult = fnData?.results?.reservations;
        totalSynced += resResult?.synced || 0;
        if (resResult && resResult.backfill_complete === false && resResult.chunks_remaining > 0) {
          setSyncProgress({ chunksProcessed: resResult.chunks_processed, chunksRemaining: resResult.chunks_remaining, totalSynced, iteration });
          // Brief pause between backfill runs to avoid hammering
          await new Promise(r => setTimeout(r, 500));
        } else {
          backfillComplete = true;
        }
      }
      // Reload data after full sync
      await loadData();
      setLastSyncAt(new Date().toISOString());
      setSyncing(false);
      setSyncProgress(null);
      return { totalSynced, iterations: iteration };
    } catch (err) {
      console.error("Sync failed:", err);
      const errorLog = { timestamp: new Date().toISOString(), error: err._detail || err.message, location_id: locationId, syncType };
      setLastErrorLog(errorLog);
      setSyncing(false);
      setSyncProgress(null);
      throw err;
    }
  }, [locationId, syncing, loadData]);

  // ── Refresh = reload from Supabase (no API call) ──
  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  // ── Auto-load on mount / location change ──
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-sync every 15 minutes ──
  useEffect(() => {
    if (!locationId) return;
    refreshTimerRef.current = setInterval(() => {
      triggerSync("incremental").catch(() => {});
    }, 15 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [locationId, triggerSync]);

  // Build daily ops (these are Lite-native, stored in Supabase lite tables, not from Gingr)
  const td = todayStr();
  const dailyOps = useMemo(() => [
    { id: `ops_opening_${td}`, type: "checklist", typeSub: "opening", date: td, locked: false, items: DEF_OPENING_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_closing_${td}`, type: "checklist", typeSub: "closing", date: td, locked: false, items: DEF_CLOSING_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_fe_checklist_${td}`, type: "checklist", typeSub: "fe_checklist", date: td, locked: false, items: DEF_FE_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_be_checklist_${td}`, type: "checklist", typeSub: "be_checklist", date: td, locked: false, items: DEF_BE_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_room_cleaning_${td}`, type: "room_cleaning", typeSub: "room_cleaning", date: td, locked: false, items: {} },
    { id: `ops_pictures_${td}`, type: "pictures", typeSub: "pictures", date: td, locked: false, items: {} },
    { id: `ops_pp_${td}`, type: "pp", typeSub: "pp", date: td, locked: false, items: {} },
  ], [td]);

  return {
    clients,
    dogs,
    reservations,
    rooms,
    serverStats,
    dailyOps,
    payments: [],
    messages: [],
    massTextHistory: [],
    messageTemplates: [],
    locationRoles: [],
    resortPolicies: { retentionDaycareDays: 90, retentionBoardingDays: 180 },
    lifecycleExplainers: {},
    lifecycleViews: [],
    closingTemplate: DEF_CLOSING_TEMPLATE,
    evaluations: [],
    gingr_api_key: "",
    gingr_location_id: "",
    gingr_subdomain: "",
    attendanceRoster: [],
    attendanceEntries: [],
    attendanceAuditLog: [],
    roles: LEAN_ROLES,
    clientFields: [],
    agreements: [],
    vets: [],
    auditLog: [],
    discounts: [],
    packageSales: [],
    eodEntries: [],
    requiredVaccines: immunizationTypes.map(t => ({ id: t.gingr_id, name: t.name, required: t.required })),
    dogTags: [],
    loading,
    error,
    syncing,
    lastSyncAt,
    triggerSync,
    refresh,
    resTypes,
  };
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
      if (k === "createdAt") {
        const d = c.createdAt ? c.createdAt.split("T")[0] : "";
        if (op==="after") return d && d > val; if (op==="before") return d && d < val;
        if (op==="inLastDays") { if (!d) return false; const diff = Math.floor((new Date(today+"T12:00:00") - new Date(d+"T12:00:00"))/(86400000)); return diff <= parseInt(val); }
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
function ClientsPage({ data, save, nav, profile, addGlobalToast, lcFilters, setLcFilters, lcFilterOpen, setLcFilterOpen, locationSlug }) {
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
  const [displayLimit, setDisplayLimit] = useState(100);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [activeViewId, setActiveViewId] = useState(null);
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savedViews, setSavedViews] = useState([]);

  // Load saved views from lite_settings on mount
  useEffect(() => {
    if (!locationSlug) return;
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationSlug).eq("setting_key", "lifecycle_views").maybeSingle().then(({ data: row }) => {
      if (row?.setting_value) setSavedViews(row.setting_value);
    });
  }, [locationSlug]);

  // Persist views helper
  const persistViews = async (views) => {
    setSavedViews(views);
    await supabase.from("lite_settings").upsert({ location_id: locationSlug, setting_key: "lifecycle_views", setting_value: views }, { onConflict: "location_id,setting_key" });
  };
  const [draftFilters, setDraftFilters] = useState({});
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const [configuringKey, setConfiguringKey] = useState(null);
  const [configStep, setConfigStep] = useState(0); // 0=pick op, 1=enter value
  const prevFilterOpen = useRef(false);
  useEffect(() => { if (lcFilterOpen && !prevFilterOpen.current) { setDraftFilters({...lcFilters}); setShowFilterPicker(false); setConfiguringKey(null); } prevFilterOpen.current = lcFilterOpen; }, [lcFilterOpen, lcFilters]);
  const logBtnRef = useRef({});
  const colToggleRef = useRef(null);

  // ── Pre-built lookup maps (O(n) instead of O(n×m) filtering) ──
  const resByClient = useMemo(() => {
    const m = {};
    (data.reservations || []).forEach(r => { (m[r.clientId] || (m[r.clientId] = [])).push(r); });
    return m;
  }, [data.reservations]);

  const dogsByClient = useMemo(() => {
    const m = {};
    (data.dogs || []).forEach(d => { (m[d.clientId] || (m[d.clientId] = [])).push(d); });
    return m;
  }, [data.dogs]);

  const pmtByClient = useMemo(() => {
    const m = {};
    (data.payments || []).forEach(p => { if (p.status === "completed" && p.type !== "refund") (m[p.clientId] || (m[p.clientId] = [])).push(p); });
    return m;
  }, [data.payments]);

  // ── Client stats (uses server-computed RPC when available, falls back to JS) ──
  const clientStats = useMemo(() => {
    const map = {};
    const td = todayStr();
    const tdNoon = new Date(td + "T12:00:00");
    const ss = data.serverStats; // RPC results keyed by owner_gingr_id
    data.clients.forEach(c => {
      const dogs = dogsByClient[c.id] || [];
      const dogNames = dogs.map(d => d.fields.name || "Unknown");
      const gingrId = String(c.gingrId);

      // Use server-computed stats if available (instant), otherwise fall back to JS computation
      if (ss && ss[gingrId]) {
        const s = ss[gingrId];
        const lastResDate = s.last_res_date || "";
        const nextResDate = s.next_res_date || "";
        const lastRes = lastResDate ? { checkIn: lastResDate } : (c._lastReservation ? { checkIn: c._lastReservation.split("T")[0], _fromGingrOwner: true } : null);
        const nextRes = (nextResDate && nextResDate >= td) ? { checkIn: nextResDate } : null;
        const daysSinceLast = lastRes ? Math.round((tdNoon - new Date(lastRes.checkIn + "T12:00:00")) / 86400000) : null;
        const totalRes = Number(s.total_res) || (c._numReservations || 0);
        const totalSpent = Number(s.total_spent) || 0;
        const hasGingrUpcoming = !nextRes && c._nextReservation && c._nextReservation.split("T")[0] >= td;
        const finalNextRes = nextRes || (hasGingrUpcoming ? { checkIn: c._nextReservation.split("T")[0], _fromGingrOwner: true } : null);
        map[c.id] = {
          dogCount: dogs.length, dogNames,
          daycareCount: Number(s.daycare_count) || 0,
          boardingCount: Number(s.boarding_count) || 0,
          evalCount: Number(s.eval_count) || 0,
          tourCount: Number(s.tour_count) || 0,
          lastRes, nextRes: finalNextRes, totalSpent, totalRes,
          daysSinceLast,
          postEvalAppts: Number(s.post_eval_appts) || 0,
          postTourAppts: Number(s.post_tour_appts) || 0,
          hasEverBooked: totalRes > 0,
          hasGingrUpcoming: !!hasGingrUpcoming,
        };
      } else {
        // Fallback: compute from client-side reservation data
        const cRes = resByClient[c.id] || [];
        const daycareCount = cRes.filter(r => r.type === "daycare").length;
        const boardingCount = cRes.filter(r => r.type === "boarding").length;
        const evalCount = cRes.filter(r => r.type === "evaluation").length;
        const tourCount = cRes.filter(r => r.type === "tour").length;
        const sorted = [...cRes].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
        const lastResSynced = sorted.find(r => r.checkIn <= td);
        const nextResSynced = sorted.filter(r => r.checkIn >= td && r.status === "upcoming").sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
        const resSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
        const pmtSpent = (pmtByClient[c.id] || []).reduce((s, p) => s + (p.amount || 0), 0);
        const totalSpent = resSpent + pmtSpent;
        let lastRes = lastResSynced || null;
        let daysSinceLast = lastRes ? Math.round((tdNoon - new Date(lastRes.checkIn + "T12:00:00")) / 86400000) : null;
        if (daysSinceLast == null && c._lastReservation) {
          const lrDate = c._lastReservation.split("T")[0];
          daysSinceLast = Math.round((tdNoon - new Date(lrDate + "T12:00:00")) / 86400000);
          lastRes = { checkIn: lrDate, _fromGingrOwner: true };
        }
        const totalRes = cRes.length || (c._numReservations || 0);
        let nextRes = nextResSynced || null;
        const hasGingrUpcoming = !nextRes && c._nextReservation && c._nextReservation.split("T")[0] >= td;
        if (hasGingrUpcoming) { nextRes = { checkIn: c._nextReservation.split("T")[0], _fromGingrOwner: true }; }
        const hasEverBooked = totalRes > 0;
        let postEvalAppts = 0;
        const evalsSorted = cRes.filter(r => r.type === "evaluation").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
        if (evalsSorted.length > 0) { postEvalAppts = cRes.filter(r => r.checkIn > evalsSorted[0].checkIn).length; }
        let postTourAppts = 0;
        const toursSorted = cRes.filter(r => r.type === "tour").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
        if (toursSorted.length > 0) { postTourAppts = cRes.filter(r => r.checkIn > toursSorted[0].checkIn).length; }
        map[c.id] = { dogCount: dogs.length, dogNames, daycareCount, boardingCount, evalCount, tourCount, lastRes, nextRes, totalSpent, totalRes, daysSinceLast, postEvalAppts, postTourAppts, hasEverBooked, hasGingrUpcoming: !!hasGingrUpcoming };
      }
    });
    return map;
  }, [data.clients, data.serverStats, resByClient, dogsByClient, pmtByClient]);

  // ── Tab membership (uses server stats or Gingr owner-level data for classification) ──
  const clientTabMap = useMemo(() => {
    const map = {};
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    const td = todayStr();
    const ss = data.serverStats;
    data.clients.forEach(c => {
      const s = clientStats[c.id] || {};
      const hasSpent = (s.totalSpent || 0) > 0;
      const gingrId = String(c.gingrId);
      const srv = ss && ss[gingrId];

      // Use server stats for has_real_booking/has_upcoming when available
      const hasRealBookingSynced = srv ? (srv.has_real_booking || false) : (resByClient[c.id] || []).some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcomingSynced = srv ? (srv.has_upcoming || false) : (resByClient[c.id] || []).some(r => r.checkIn >= td && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");

      const hasEverBooked = s.hasEverBooked || false;
      const hasRealBooking = hasRealBookingSynced || hasEverBooked;
      const hasUpcoming = hasUpcomingSynced || s.hasGingrUpcoming;

      const totalRes = s.totalRes || 0;
      const daysSince = s.daysSinceLast;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;

      if (hasRealBooking && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const resCount = srv ? Number(srv.total_res) : (resByClient[c.id] || []).length;
        if (resCount > 0) {
          const dcPct = (s.daycareCount || 0) / resCount;
          const bdPct = (s.boardingCount || 0) / resCount;
          if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
          else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
          else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
        } else {
          if (daysSince >= dcThresh) isRetention = true;
        }
      }

      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      map[c.id] = { isConversion, isActive, isRetention: isRetention && !isCold, isCold, isAll: true };
    });
    return map;
  }, [data.clients, data.serverStats, clientStats, resByClient, data.resortPolicies?.retentionDaycareDays, data.resortPolicies?.retentionBoardingDays]);

  // ── TEMP DIAGNOSTIC: why are clients in conversion? ──
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
        // When moving to retention, set follow-up date to lapse date (today = day they crossed threshold)
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
    const cRes = resByClient[client.id] || [];
    const evalRes = hasEval ? cRes.find(r => r.type === "evaluation" && (data.evaluations || []).some(e => e.reservationId === r.id && e.locked)) : null;
    const tourRes = cRes.filter(r => r.type === "tour" && r.status === "checked-out").sort((a,b) => b.checkIn.localeCompare(a.checkIn))[0] || null;
    return { base, hasEval, evalRes, hasTour: !!tourRes, tourRes };
  }, [data.evaluations, resByClient]);

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
          case "createdAt": va = a.createdAt||""; vb = b.createdAt||""; break;
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

  // ── Reset display limit when tab/search/filters change ──
  useEffect(() => { setDisplayLimit(100); }, [activeTab, search, sourceFilter, showOverdueOnly, sortCol, sortDir, lcFilters]);
  const displayedList = activeList.slice(0, displayLimit);
  const hasMore = activeList.length > displayLimit;

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
  const filteredTabCounts = useMemo(() => {
    if (activeFilterCount === 0) return null;
    const out = {};
    for (const key of ["conversion","active","retention","cold","all"]) {
      out[key] = applyStructuredFilters(tabLists[key] || [], clientStats, clientTabMap, lcFilters).length;
    }
    return out;
  }, [activeFilterCount, tabLists, clientStats, clientTabMap, lcFilters]);

  const tabDefs = [
    { id: "conversion", label: "Conversion", count: filteredTabCounts ? filteredTabCounts.conversion : tabLists.conversion.length, color: C.acc },
    { id: "active", label: "Active Customers", count: filteredTabCounts ? filteredTabCounts.active : tabLists.active.length, color: C.pri },
    { id: "retention", label: "Retention", count: filteredTabCounts ? filteredTabCounts.retention : tabLists.retention.length, color: C.dan },
    { id: "cold", label: "Cold", count: filteredTabCounts ? filteredTabCounts.cold : tabLists.cold.length, color: C.textSec },
    { id: "all", label: "All", count: filteredTabCounts ? filteredTabCounts.all : tabLists.all.length, color: C.info },
  ];

  // ── Toggleable columns for Active/All tabs ──
  const toggleCols = [
    { key: "daycare", label: "DC" }, { key: "boarding", label: "BD" },
    { key: "eval", label: "Eval" }, { key: "postEval", label: "P-Eval" },
    { key: "tours", label: "Tours" }, { key: "postTour", label: "P-Tour" },
  ];
  const baseCols = ["nextRes","lastRes","daysSince","totalRes","totalSpent"];
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
    if (parts.length === 0 && client.gingrId) parts.push({ label: "Gingr", type: "gingr" });
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
              <div><span onClick={(e) => { e.stopPropagation(); nav("dog-detail", { clientId: client.id, dogId: dog.id }); }} style={{fontWeight:700,color:C.pri,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{f.name || "Unknown"}</span></div>
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
    if (activeTab === "conversion") return "minmax(110px,1.3fr) minmax(75px,0.9fr) 50px 75px 55px 55px minmax(80px,1fr) minmax(80px,1fr) minmax(90px,1.3fr) 85px 55px";
    if (activeTab === "retention") return "minmax(100px,1.2fr) minmax(75px,0.9fr) 45px 75px minmax(80px,0.9fr) minmax(80px,0.9fr) minmax(85px,1.2fr) 80px minmax(65px,0.7fr) minmax(60px,0.6fr) 50px 50px";
    if (activeTab === "cold") return "minmax(110px,1.3fr) minmax(75px,0.9fr) 50px 75px minmax(90px,1fr) minmax(80px,1fr) minmax(110px,1.3fr) 65px";
    // Active / All — Client, Phone, Dogs, Created
    const base = "minmax(120px,1.3fr) minmax(80px,0.9fr) 50px 75px";
    const dataCols = shownDataCols.map(k => {
      if (k==="lastRes"||k==="nextRes") return "minmax(70px,0.8fr)";
      return "minmax(50px,0.6fr)";
    }).join(" ");
    return `${base} ${dataCols}`;
  };

  // ── Render ──
  if (data.loading) return (
    <div style={{padding:"60px 28px",textAlign:"center"}}>
      <K9LoadingAnimation size={56} message="Loading client data..." subMessage="Fetching from cache" />
    </div>
  );

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
          {activeFilterCount > 0 && (
            <button onClick={() => { setShowBulkUpdate(true); setBulkReason(""); }}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1.5px solid ${C.dan}40`,background:`${C.dan}08`,color:C.dan,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/></svg>
              Bulk Update ({activeList.length})
            </button>
          )}
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

      {/* ═══ BULK UPDATE MODAL ═══ */}
      {showBulkUpdate && (() => {
        const isAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
        if (!isAdmin) return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowBulkUpdate(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:32,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <p style={{margin:0,color:C.text,fontWeight:600}}>Only admins can perform bulk updates.</p>
            <button onClick={()=>setShowBulkUpdate(false)} style={{marginTop:16,padding:"8px 20px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>OK</button>
          </div>
        </div>;

        const handleBulkCold = async () => {
          if (!bulkReason.trim()) return;
          setBulkProcessing(true);
          const today = todayStr();
          const ids = activeList.map(c => c.id);
          const newClients = data.clients.map(c => {
            if (!ids.includes(c.id)) return c;
            return {
              ...c,
              lifecycle: { ...(c.lifecycle || {}), cold: true, coldDate: today, coldFrom: activeTab === "retention" ? "retention" : "conversion", coldReason: bulkReason.trim() },
              lifecycleEvents: [...(c.lifecycleEvents || []), { event: "bulk_marked_cold", date: today, details: `Bulk marked as cold: ${bulkReason.trim()}` }],
            };
          });
          await save({ ...data, clients: newClients });
          setShowBulkUpdate(false);
          setBulkProcessing(false);
          addGlobalToast?.({ message: `${ids.length} clients marked as cold`, type: "success" });
        };

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} onClick={()=>setShowBulkUpdate(false)}>
            <div style={{background:"#fff",borderRadius:16,padding:32,maxWidth:480,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",animation:"filterFadeIn 0.2s ease-out"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:"0 0 4px",fontSize:18,fontWeight:800,color:C.text}}>Bulk Update</h3>
              <p style={{margin:"0 0 20px",fontSize:13,color:C.textSec}}>
                This will mark <strong style={{color:C.dan}}>{activeList.length} filtered clients</strong> as Cold.
              </p>

              <label style={{display:"block",fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>Reason <span style={{color:C.dan}}>*</span></label>
              <textarea
                value={bulkReason} onChange={e => setBulkReason(e.target.value)}
                placeholder="e.g. Legacy clients older than 6 months with no activity — likely lost"
                rows={3}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"}}
                onFocus={e=>e.target.style.borderColor=C.pri}
                onBlur={e=>e.target.style.borderColor=C.border}
              />
              <p style={{margin:"8px 0 20px",fontSize:11,color:C.textMut}}>This reason will be stored on each client record for audit purposes.</p>

              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setShowBulkUpdate(false)}
                  style={{padding:"10px 20px",borderRadius:8,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  Cancel
                </button>
                <button onClick={handleBulkCold} disabled={!bulkReason.trim() || bulkProcessing}
                  style={{padding:"10px 20px",borderRadius:8,border:"none",background:bulkReason.trim()?C.dan:"#ccc",color:"#fff",fontSize:13,fontWeight:700,cursor:bulkReason.trim()?"pointer":"not-allowed",fontFamily:"inherit",opacity:bulkProcessing?0.6:1,transition:"all 0.15s"}}>
                  {bulkProcessing ? "Processing..." : `Mark ${activeList.length} as Cold`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ FILTER PANEL ═══ */}
      {lcFilterOpen && (() => {
        const isAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
        const views = savedViews;
        const usedKeys = Object.keys(draftFilters);
        const availableFields = LC_FILTER_FIELDS.filter(f => !usedKeys.includes(f.key));
        const sections = [...new Set(LC_FILTER_FIELDS.map(f => f.section))];
        const removeFilter = (key) => { setDraftFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); if (configuringKey === key) setConfiguringKey(null); };
        const updateFilter = (key, field, val) => { setDraftFilters(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } })); };
        const applyFilters = () => { setLcFilters(draftFilters); setLcFilterOpen(false); setShowFilterPicker(false); setConfiguringKey(null); };
        const clearAll = () => { setDraftFilters({}); setLcFilters({}); setConfiguringKey(null); setShowFilterPicker(false); };
        const needsValue = (op) => !["empty","notEmpty","has","missing","overdue","today","thisWeek","hasDate","noDate"].includes(op);
        const saveView = async () => {
          if (!viewName.trim()) return;
          const newView = { id: Date.now().toString(36), name: viewName.trim(), filters: { ...draftFilters }, tab: activeTab, createdBy: profile?.id || "unknown", createdAt: new Date().toISOString() };
          await persistViews([...savedViews, newView]);
          setActiveViewId(newView.id); setViewName(""); setShowSaveView(false);
          addGlobalToast?.({ message: `View "${newView.name}" saved`, type: "success" });
        };
        const deleteView = async (viewId) => {
          await persistViews(savedViews.filter(v => v.id !== viewId));
          if (activeViewId === viewId) setActiveViewId(null);
          addGlobalToast?.({ message: "View deleted" });
        };
        const loadView = (view) => {
          setDraftFilters({ ...view.filters }); setLcFilters({ ...view.filters }); setActiveViewId(view.id);
          if (view.tab) setActiveTab(view.tab);
          setShowFilterPicker(false); setConfiguringKey(null);
        };
        const selectField = (key) => {
          const fd = LC_FILTER_FIELDS.find(f => f.key === key);
          if (!fd) return;
          // If only one op and it doesn't need a value, just add it directly
          if (fd.ops.length === 1 && !needsValue(fd.ops[0])) {
            setDraftFilters(prev => ({ ...prev, [key]: { op: fd.ops[0], val: "" } }));
            setShowFilterPicker(false); setConfiguringKey(null);
            return;
          }
          setDraftFilters(prev => ({ ...prev, [key]: { op: fd.ops[0], val: "" } }));
          setConfiguringKey(key); setConfigStep(0);
        };
        const confirmConfig = () => { setConfiguringKey(null); setShowFilterPicker(false); };
        const sectionIcons = {
          "Client Info": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
          "Activity": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
          "Services": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
          "Lifecycle": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
        };
        const cfgFd = configuringKey ? LC_FILTER_FIELDS.find(f => f.key === configuringKey) : null;
        const cfgVal = configuringKey ? draftFilters[configuringKey] : null;
        let fieldIdx = 0;
        return (
          <div style={{marginBottom:16,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.bg,boxShadow:"0 8px 40px rgba(0,0,0,0.08)",overflow:"hidden"}}>
            <style>{`
              @keyframes filterSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
              @keyframes filterFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
              @keyframes filterChipIn { from { opacity:0; transform:translateX(-6px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
              @keyframes filterPulse { 0%,100% { box-shadow:0 0 0 0 rgba(0,52,98,0.15); } 50% { box-shadow:0 0 0 4px rgba(0,52,98,0.08); } }
              @keyframes configSlide { from { opacity:0; max-height:0; transform:translateY(-4px); } to { opacity:1; max-height:200px; transform:translateY(0); } }
            `}</style>

            {/* ── Saved Views Bar ── */}
            {views.length > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderBottom:`1px solid ${C.borderLight}`,background:C.surface,flexWrap:"wrap",animation:"filterSlideIn 0.2s ease-out"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span style={{fontSize:10,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em"}}>Saved Views</span>
                <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
                {views.map((v,vi) => (
                  <div key={v.id} style={{display:"inline-flex",alignItems:"center",gap:2,animation:`filterChipIn 0.25s ease-out ${vi*0.05}s both`}}>
                    <button onClick={() => loadView(v)}
                      style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${activeViewId===v.id?C.pri:C.borderLight}`,background:activeViewId===v.id?C.pri:"#fff",color:activeViewId===v.id?"#fff":C.text,fontSize:11,fontWeight:activeViewId===v.id?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:activeViewId===v.id?"0 2px 8px rgba(0,52,98,0.2)":"0 1px 3px rgba(0,0,0,0.04)"}}
                      onMouseEnter={e=>{if(activeViewId!==v.id){e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.color=C.pri;}}}
                      onMouseLeave={e=>{if(activeViewId!==v.id){e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.color=C.text;}}}>
                      {v.name}
                      {activeViewId===v.id && <span style={{marginLeft:4,fontSize:9}}>({Object.keys(v.filters).length})</span>}
                    </button>
                    {isAdmin && <button onClick={() => deleteView(v.id)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:"2px",display:"flex",opacity:0,transition:"opacity 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0"} title="Delete view">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </div>
                ))}
                {activeViewId && <button onClick={() => { setActiveViewId(null); setDraftFilters({}); setLcFilters({}); }}
                  style={{fontSize:10,fontWeight:600,color:C.dan,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",marginLeft:4,opacity:0.7,transition:"opacity 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>Clear</button>}
              </div>
            )}

            {/* ── Active Filter Chips ── */}
            <div style={{padding:"14px 18px",minHeight:48}}>
              {usedKeys.length === 0 && !showFilterPicker && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 0",animation:"filterFadeIn 0.2s ease-out"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  <span style={{fontSize:13,color:C.textMut,fontWeight:500}}>No filters active</span>
                </div>
              )}

              {usedKeys.length > 0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:showFilterPicker?12:0}}>
                  {usedKeys.map((key, i) => {
                    const fd = LC_FILTER_FIELDS.find(f => f.key === key);
                    if (!fd) return null;
                    const f = draftFilters[key];
                    const isConfiguring = configuringKey === key;
                    return (
                      <div key={key} style={{animation:`filterChipIn 0.2s ease-out ${i*0.04}s both`}}>
                        <div style={{display:"inline-flex",alignItems:"center",gap:0,borderRadius:10,border:`1.5px solid ${isConfiguring?C.pri:C.border}`,background:isConfiguring?`${C.pri}06`:"#fff",boxShadow:isConfiguring?"0 0 0 3px rgba(0,52,98,0.06)":"0 1px 3px rgba(0,0,0,0.04)",transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",overflow:"hidden"}}>
                          {/* Field name */}
                          <button onClick={() => { setConfiguringKey(isConfiguring?null:key); setConfigStep(0); setShowFilterPicker(false); }}
                            style={{padding:"6px 10px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,color:C.pri,whiteSpace:"nowrap",transition:"background 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            {fd.label}
                          </button>
                          {/* Operator pill */}
                          <div style={{padding:"6px 0",display:"flex",alignItems:"center"}}>
                            <span style={{padding:"2px 8px",borderRadius:6,background:`${C.pri}12`,fontSize:10,fontWeight:700,color:C.pri,whiteSpace:"nowrap"}}>{LC_OP_LABELS[f.op]||f.op}</span>
                          </div>
                          {/* Value */}
                          {needsValue(f.op) && f.val !== "" && (
                            <span style={{padding:"6px 8px 6px 4px",fontSize:11,fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{fd.type==="currency"?"$":""}{f.val}</span>
                          )}
                          {needsValue(f.op) && f.val === "" && (
                            <span style={{padding:"6px 8px 6px 4px",fontSize:11,fontWeight:500,color:C.dan,fontStyle:"italic",whiteSpace:"nowrap"}}>set value</span>
                          )}
                          {/* Remove X */}
                          <button onClick={(e) => { e.stopPropagation(); removeFilter(key); }}
                            style={{padding:"6px 8px 6px 2px",border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",color:C.textMut,transition:"color 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.color=C.dan} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>

                        {/* ── Inline Config Popover ── */}
                        {isConfiguring && (
                          <div style={{marginTop:6,padding:"10px 14px",borderRadius:10,background:"#fff",border:`1.5px solid ${C.pri}30`,boxShadow:"0 6px 24px rgba(0,52,98,0.1)",animation:"configSlide 0.25s ease-out",overflow:"hidden"}}>
                            {/* Operator pills */}
                            <div style={{marginBottom:needsValue(f.op)?10:0}}>
                              <div style={{fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Condition</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                {fd.ops.map((op,oi) => (
                                  <button key={op} onClick={() => { updateFilter(key,"op",op); if(!needsValue(op)) updateFilter(key,"val",""); }}
                                    style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${f.op===op?C.pri:C.borderLight}`,background:f.op===op?C.pri:"#fff",color:f.op===op?"#fff":C.text,fontSize:11,fontWeight:f.op===op?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:f.op===op?"0 2px 8px rgba(0,52,98,0.15)":"none",animation:`filterFadeIn 0.2s ease-out ${oi*0.03}s both`}}
                                    onMouseEnter={e=>{if(f.op!==op){e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.background=`${C.pri}06`;}}}
                                    onMouseLeave={e=>{if(f.op!==op){e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.background="#fff";}}}>
                                    {LC_OP_LABELS[op]||op}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Value input */}
                            {needsValue(f.op) && (
                              <div style={{animation:"filterFadeIn 0.2s ease-out 0.1s both"}}>
                                <div style={{fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Value</div>
                                {fd.type === "select" ? (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                    {(fd.options||[]).map((o,oi) => (
                                      <button key={o} onClick={() => updateFilter(key,"val",o)}
                                        style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${f.val===o?C.pri:C.borderLight}`,background:f.val===o?C.pri:"#fff",color:f.val===o?"#fff":C.text,fontSize:11,fontWeight:f.val===o?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",animation:`filterFadeIn 0.15s ease-out ${oi*0.03}s both`}}
                                        onMouseEnter={e=>{if(f.val!==o){e.currentTarget.style.borderColor=C.pri;}}}
                                        onMouseLeave={e=>{if(f.val!==o){e.currentTarget.style.borderColor=C.borderLight;}}}>
                                        {o || "(none)"}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                    {fd.type==="currency" && <span style={{fontSize:13,fontWeight:700,color:C.textMut}}>$</span>}
                                    <input
                                      type={fd.type==="date"?(f.op==="inLastDays"?"number":"date"):fd.type==="number"||fd.type==="currency"?"number":"text"}
                                      value={f.val}
                                      onChange={e => updateFilter(key,"val",e.target.value)}
                                      onKeyDown={e => { if (e.key==="Enter") confirmConfig(); }}
                                      placeholder={f.op==="inLastDays"?"Number of days":fd.type==="date"?"YYYY-MM-DD":fd.type==="currency"?"Amount":"Type a value..."}
                                      autoFocus
                                      style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",background:"#fff",color:C.text,width:"100%",maxWidth:220,transition:"border-color 0.2s",outline:"none"}}
                                      onFocus={e=>e.currentTarget.style.borderColor=C.pri}
                                      onBlur={e=>e.currentTarget.style.borderColor=C.border}
                                    />
                                    <button onClick={confirmConfig}
                                      style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.15s",boxShadow:"0 2px 8px rgba(0,52,98,0.15)"}}>
                                      Done
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {!needsValue(f.op) && (
                              <button onClick={confirmConfig}
                                style={{marginTop:8,padding:"6px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",animation:"filterFadeIn 0.2s ease-out",boxShadow:"0 2px 8px rgba(0,52,98,0.15)"}}>
                                Done
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Add Filter Button / Cascading Field Picker ── */}
              {!showFilterPicker ? (
                <div style={{marginTop:usedKeys.length>0?8:0,animation:"filterFadeIn 0.2s ease-out"}}>
                  <button onClick={() => { setShowFilterPicker(true); setFilterPickerReady(false); setConfiguringKey(null); setTimeout(()=>setFilterPickerReady(true),10); }}
                    disabled={availableFields.length===0}
                    style={{padding:"8px 16px",borderRadius:10,border:`1.5px dashed ${availableFields.length>0?C.pri:C.border}`,background:"transparent",color:availableFields.length>0?C.pri:C.textMut,fontSize:12,fontWeight:700,cursor:availableFields.length>0?"pointer":"default",fontFamily:"inherit",transition:"all 0.2s",display:"flex",alignItems:"center",gap:6}}
                    onMouseEnter={e=>{if(availableFields.length>0){e.currentTarget.style.background=`${C.pri}06`;e.currentTarget.style.borderColor=C.pri;}}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=availableFields.length>0?C.pri:C.border;}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Filter
                  </button>
                </div>
              ) : (
                <div style={{marginTop:usedKeys.length>0?8:0,borderRadius:12,border:`1.5px solid ${C.borderLight}`,background:"#fff",boxShadow:"0 4px 20px rgba(0,0,0,0.06)",overflow:"hidden",animation:"filterSlideIn 0.25s ease-out"}}>
                  {/* Close picker bar */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",borderBottom:`1px solid ${C.borderLight}`,background:C.surface}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.text}}>Choose a filter</span>
                    <button onClick={()=>setShowFilterPicker(false)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex",transition:"color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  {/* Sections with cascading fields */}
                  <div style={{padding:"6px 0"}}>
                    {sections.map((sec, si) => {
                      const secFields = availableFields.filter(f => f.section === sec);
                      if (secFields.length === 0) return null;
                      return (
                        <div key={sec}>
                          <div style={{padding:"8px 16px 4px",fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",display:"flex",alignItems:"center",gap:6,animation:filterPickerReady?`filterFadeIn 0.2s ease-out ${si*0.06}s both`:"none"}}>
                            {sectionIcons[sec]||null} {sec}
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"4px 16px 8px"}}>
                            {secFields.map((f,fi) => {
                              const delay = si * 0.06 + fi * 0.03 + 0.05;
                              fieldIdx++;
                              return (
                                <button key={f.key} onClick={() => { selectField(f.key); setShowFilterPicker(false); }}
                                  style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.borderLight}`,background:"#fff",color:C.text,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 1px 3px rgba(0,0,0,0.03)",animation:filterPickerReady?`filterChipIn 0.25s ease-out ${delay}s both`:"none"}}
                                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.background=`${C.pri}06`;e.currentTarget.style.color=C.pri;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 3px 12px rgba(0,52,98,0.1)";}}
                                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.background="#fff";e.currentTarget.style.color=C.text;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.03)";}}>
                                  {f.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom Action Bar ── */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 18px",borderTop:`1px solid ${C.borderLight}`,background:C.surface}}>
              <div style={{display:"flex",gap:6}}>
                <button onClick={applyFilters}
                  style={{padding:"8px 20px",borderRadius:10,border:"none",background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 2px 12px rgba(0,52,98,0.2)"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,52,98,0.25)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 12px rgba(0,52,98,0.2)";}}>
                  Apply{usedKeys.length>0?` (${usedKeys.length})`:""}
                </button>
                {usedKeys.length > 0 && (
                  <button onClick={clearAll}
                    style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.dan;e.currentTarget.style.color=C.dan;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSec;}}>
                    Clear All
                  </button>
                )}
                <button onClick={() => { setLcFilterOpen(false); setShowFilterPicker(false); setConfiguringKey(null); }}
                  style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${C.borderLight}`,background:"transparent",color:C.textMut,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                  Close
                </button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {isAdmin && !showSaveView && usedKeys.length > 0 && (
                  <button onClick={() => setShowSaveView(true)}
                    style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.borderLight}`,background:"#fff",color:C.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,transition:"all 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.color=C.pri;e.currentTarget.style.transform="translateY(-1px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.color=C.text;e.currentTarget.style.transform="translateY(0)";}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    Save as View
                  </button>
                )}
                {showSaveView && (
                  <div style={{display:"flex",alignItems:"center",gap:6,animation:"filterFadeIn 0.2s ease-out"}}>
                    <input value={viewName} onChange={e => setViewName(e.target.value)} placeholder="View name..."
                      autoFocus onKeyDown={e => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setShowSaveView(false); }}
                      style={{padding:"7px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",width:160,background:"#fff",color:C.text,transition:"border-color 0.2s",outline:"none"}}
                      onFocus={e=>e.currentTarget.style.borderColor=C.pri} onBlur={e=>e.currentTarget.style.borderColor=C.border} />
                    <button onClick={saveView} disabled={!viewName.trim()}
                      style={{padding:"7px 16px",borderRadius:8,border:"none",background:viewName.trim()?C.suc:C.textMut,color:"#fff",fontSize:11,fontWeight:700,cursor:viewName.trim()?"pointer":"default",fontFamily:"inherit",transition:"all 0.2s",boxShadow:viewName.trim()?"0 2px 8px rgba(22,163,74,0.2)":"none"}}>
                      Save
                    </button>
                    <button onClick={() => setShowSaveView(false)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div style={colHeaderStyle("totalRes")} onClick={()=>handleSort("totalRes")}>Total Res <SortIcon col="totalRes"/></div>
              <div style={colHeaderStyle("totalSpent")} onClick={()=>handleSort("totalSpent")}>Total Spent <SortIcon col="totalSpent"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No conversion leads{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.conversion?.updates || [];
              const cStats = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalRes || 0}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalSpent ? `$${cStats.totalSpent.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "$0"}</div>
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
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div style={colHeaderStyle("lastRes")} onClick={()=>handleSort("lastRes")}>Last Res <SortIcon col="lastRes"/></div>
              <div style={colHeaderStyle("totalPaid")} onClick={()=>handleSort("totalPaid")}>Total Spent <SortIcon col="totalPaid"/></div>
              <div style={colHeaderStyle("totalAppts")} onClick={()=>handleSort("totalAppts")}>Total Res <SortIcon col="totalAppts"/></div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No retention clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
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
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
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
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("coldDate")} onClick={()=>handleSort("coldDate")}>Date Cold <SortIcon col="coldDate"/></div>
              <div>Last Notes</div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No cold clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const fromTab = c.lifecycle?.coldFrom || "conversion";
              const lastUpdate = c.lifecycle?.[fromTab]?.updates?.[0];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
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
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              {shownDataCols.map(k => {
                const labels = {nextRes:"Next Res",lastRes:"Last Res",daysSince:"Days Since",totalRes:"Total Res",daycare:"DC",boarding:"BD",eval:"Eval",postEval:"P-Eval",tours:"Tours",postTour:"P-Tour",totalSpent:"Total Spent"};
                return <div key={k} style={colHeaderStyle(k)} onClick={()=>handleSort(k)}>{labels[k]||k} <SortIcon col={k}/></div>;
              })}
              {/* Column toggle moved to search bar */}
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const s = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{fmtPhone?.(c.fields.phone)||c.fields.phone||""}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
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

        {/* Show More / pagination */}
        {hasMore && (
          <div style={{padding:"16px",textAlign:"center",borderTop:`1px solid ${C.borderLight}`}}>
            <button onClick={() => setDisplayLimit(l => l + 100)}
              style={{padding:"8px 24px",borderRadius:8,border:`1.5px solid ${C.pri}`,background:"transparent",color:C.pri,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Show More ({displayedList.length} of {activeList.length})
            </button>
          </div>
        )}
        {!hasMore && activeList.length > 100 && (
          <div style={{padding:"8px",textAlign:"center",fontSize:11,color:C.textMut}}>
            Showing all {activeList.length} clients
          </div>
        )}
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

// ─── FUNNEL REPORT ───────────────────────────────────────────────────────
function FunnelPage({ data, save, nav, profile, addGlobalToast }) {
  const [range, setRange] = useState("mtd");
  const [animReady, setAnimReady] = useState(false);
  const initialMount = useRef(true);
  useEffect(() => { if (initialMount.current) { initialMount.current = false; const t = setTimeout(() => setAnimReady(true), 50); return () => clearTimeout(t); } setAnimReady(true); }, [range]);

  const ranges = [
    { id: "wtd", label: "WTD", desc: "Week to Date" },
    { id: "past-week", label: "Past Week", desc: "Last 7 Days" },
    { id: "mtd", label: "MTD", desc: "Month to Date" },
    { id: "past-30", label: "Past 30", desc: "Last 30 Days" },
    { id: "qtd", label: "QTD", desc: "Quarter to Date" },
    { id: "ytd", label: "YTD", desc: "Year to Date" },
  ];

  // ── Date range computation ──
  const { startDate, endDate, rangeLabel } = useMemo(() => {
    const now = new Date();
    const end = todayStr();
    let start;
    switch (range) {
      case "wtd": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d.toISOString().split("T")[0]; break; }
      case "past-week": { const d = new Date(now); d.setDate(d.getDate() - 7); start = d.toISOString().split("T")[0]; break; }
      case "mtd": { start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`; break; }
      case "past-30": { const d = new Date(now); d.setDate(d.getDate() - 30); start = d.toISOString().split("T")[0]; break; }
      case "qtd": { const qm = Math.floor(now.getMonth() / 3) * 3; start = `${now.getFullYear()}-${String(qm+1).padStart(2,"0")}-01`; break; }
      case "ytd": { start = `${now.getFullYear()}-01-01`; break; }
      default: start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    }
    const rd = ranges.find(r => r.id === range);
    return { startDate: start, endDate: end, rangeLabel: rd?.desc || "" };
  }, [range]);

  // ── Funnel metrics computation (uses serverStats RPC — no reservation dependency) ──
  const metrics = useMemo(() => {
    const clients = data.clients || [];
    const ss = data.serverStats || {};
    const allClients = clients.length;

    // Build per-client stats from server RPC
    const statsMap = {};
    clients.forEach(c => {
      const gid = String(c.gingrId);
      const srv = ss[gid];
      if (srv) {
        statsMap[c.id] = {
          totalSpent: Number(srv.total_spent) || 0,
          totalRes: Number(srv.total_res) || 0,
          hasRealBooking: srv.has_real_booking || false,
          hasSpent: (Number(srv.total_spent) || 0) > 0,
          lastResDate: srv.last_res_date || "",
        };
      } else {
        // Fallback to Gingr owner-level data
        statsMap[c.id] = {
          totalSpent: 0,
          totalRes: c._numReservations || 0,
          hasRealBooking: (c._numReservations || 0) > 0,
          hasSpent: false,
          lastResDate: c._lastReservation ? c._lastReservation.split("T")[0] : "",
        };
      }
    });

    const inRange = (dateStr) => {
      if (!dateStr) return false;
      const d = dateStr.split("T")[0];
      return d >= startDate && d <= endDate;
    };

    // LEADS: Clients created in timeframe that started as leads (no prior bookings)
    const createdInRange = clients.filter(c => inRange(c.createdAt));
    const leadsInRange = createdInRange.filter(c => {
      const s = statsMap[c.id];
      // If client was created in range, they were a new lead unless they had activity
      // from before this range (unlikely for newly created, but check lastResDate)
      if (s.lastResDate && s.lastResDate < startDate && s.hasRealBooking) return false;
      return true;
    });

    // CONTACTED: Leads who have log entries in timeframe OR converted
    const contactedLeads = leadsInRange.filter(c => {
      const updates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      const allUpdates = [...updates, ...retUpdates];
      const hasLog = allUpdates.some(u => {
        const logDate = u.loggedAt ? u.loggedAt.split("T")[0] : "";
        return logDate >= startDate && logDate <= endDate;
      });
      const s = statsMap[c.id];
      const becameCustomer = s.hasSpent || s.hasRealBooking;
      return hasLog || becameCustomer;
    });

    // NEW CUSTOMERS: Leads who have spent or have real bookings
    const newCustomers = leadsInRange.filter(c => {
      const s = statsMap[c.id];
      return s.hasSpent || s.hasRealBooking;
    });

    // Revenue from new customers (use their total spend since we can't date-filter without reservations)
    const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);

    // LTV: Average lifetime value across all paying customers
    const spendingClients = clients.filter(c => statsMap[c.id]?.hasSpent || statsMap[c.id]?.hasRealBooking);
    const totalLTV = spendingClients.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const avgLTV = spendingClients.length > 0 ? totalLTV / spendingClients.length : 0;

    const conversionRate = leadsInRange.length > 0 ? (newCustomers.length / leadsInRange.length * 100) : 0;
    const forecastedUplift = newCustomers.length * avgLTV;

    return {
      leads: leadsInRange.length,
      contacted: contactedLeads.length,
      newCustomers: newCustomers.length,
      conversionRate,
      newCustomerRevenue,
      avgLTV,
      forecastedUplift,
      totalClients: allClients,
      spendingClientsCount: spendingClients.length,
    };
  }, [data.clients, data.serverStats, startDate, endDate]);

  const fmtMoney = (n) => "$" + Math.round(n).toLocaleString();

  // Fixed max scale = YTD leads count (so bar widths are proportional across timeframes)
  const ytdLeads = useMemo(() => {
    const clients = data.clients || [];
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return Math.max(clients.filter(c => {
      const d = c.createdAt ? c.createdAt.split("T")[0] : "";
      return d >= yearStart;
    }).length, 1);
  }, [data.clients]);
  const maxFunnel = ytdLeads;

  return (
    <div style={{padding:"24px 28px",maxWidth:1100,margin:"0 auto"}}>
      <style>{`
        @keyframes funnelSlideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes funnelGrow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        @keyframes funnelFade { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes funnelCount { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes funnelPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.02); } }
        @keyframes metricReveal { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes rangePill { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
      `}</style>

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24,animation:"funnelSlideIn 0.3s ease-out"}}>
        <div>
          <h1 style={{margin:0,fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>Conversion Funnel</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:C.textSec}}>{rangeLabel} — {new Date(startDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})} to {new Date(endDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>
        </div>
      </div>

      {/* ── Date Range Selector ── */}
      <div style={{display:"flex",gap:6,marginBottom:28,padding:"4px",borderRadius:14,background:C.surface,border:`1.5px solid ${C.borderLight}`,width:"fit-content",animation:"funnelSlideIn 0.3s ease-out 0.05s both"}}>
        {ranges.map((r, i) => {
          const active = range === r.id;
          return (
            <button key={r.id} onClick={() => setRange(r.id)}
              style={{padding:"8px 18px",borderRadius:10,border:"none",background:active?C.pri:"transparent",color:active?"#fff":C.textSec,fontSize:12,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:active?"0 2px 12px rgba(0,52,98,0.25)":"none",animation:`rangePill 0.2s ease-out ${i*0.03}s both`,position:"relative",overflow:"hidden"}}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textSec;}}}>
              {r.label}
            </button>
          );
        })}
      </div>

      {/* ── Funnel Visualization ── */}
      <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${C.borderLight}`,boxShadow:"0 4px 24px rgba(0,0,0,0.04)",padding:"32px 40px",marginBottom:24,animation:"funnelFade 0.35s ease-out 0.1s both"}}>

        {[
          { label: "Total Leads", value: metrics.leads, color: "#003462", lightColor: "#003462", desc: "New clients entering the funnel" },
          { label: "Leads Contacted", value: metrics.contacted, color: "#AF8D54", lightColor: "#AF8D54", desc: "Leads with logged outreach or converted" },
          { label: "New Customers", value: metrics.newCustomers, color: "#16A34A", lightColor: "#16A34A", desc: "Converted to active with spend/booking" },
        ].map((stage, i) => {
          const pct = maxFunnel > 0 ? stage.value / maxFunnel : 0;
          const widthPct = Math.max(20 + pct * 80, stage.value > 0 ? 25 : 15); // proportional to YTD, min 25% if has data
          const convFromPrev = i === 1 ? (metrics.leads > 0 ? (metrics.contacted / metrics.leads * 100).toFixed(0) : 0)
            : i === 2 ? (metrics.contacted > 0 ? (metrics.newCustomers / metrics.contacted * 100).toFixed(0) : 0) : null;
          return (
            <div key={stage.label} style={{marginBottom:i<2?0:0}}>
              {/* Drop-off indicator between stages */}
              {i > 0 && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 0",opacity:animReady?1:0,transition:"opacity 0.4s ease-out",transitionDelay:`${0.15+i*0.12}s`}}>
                  <div style={{height:1,flex:1,background:`linear-gradient(90deg, transparent, ${C.borderLight}, transparent)`}}/>
                  <span style={{padding:"2px 12px",fontSize:10,fontWeight:700,color:C.textMut,letterSpacing:"0.06em"}}>
                    {convFromPrev}% pass-through
                  </span>
                  <div style={{height:1,flex:1,background:`linear-gradient(90deg, transparent, ${C.borderLight}, transparent)`}}/>
                </div>
              )}
              {/* Funnel bar */}
              <div style={{display:"flex",alignItems:"center",gap:16,padding:"6px 0"}}>
                <div style={{flex:1,display:"flex",justifyContent:"center"}}>
                  <div style={{width:animReady?`${widthPct}%`:"0%",borderRadius:12,overflow:"hidden",transition:"width 0.7s cubic-bezier(0.2,0.8,0.2,1)",position:"relative"}}>
                    <div style={{
                      padding:"16px 20px",
                      background:`linear-gradient(135deg, ${stage.color}, ${stage.color}dd)`,
                      borderRadius:12,
                      display:"flex",
                      alignItems:"center",
                      justifyContent:"space-between",
                      cursor:"default",
                      position:"relative",
                      overflow:"hidden",
                    }}>
                      {/* Shimmer effect */}
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.08) 50%,transparent 100%)",backgroundSize:"200% 100%",animation:"shimmer 3s ease-in-out infinite",pointerEvents:"none"}}/>
                      <div style={{position:"relative",zIndex:1}}>
                        <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.75)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{stage.label}</div>
                        <div style={{fontSize:10,fontWeight:400,color:"rgba(255,255,255,0.5)",marginTop:1}}>{stage.desc}</div>
                      </div>
                      <div style={{position:"relative",zIndex:1,fontSize:28,fontWeight:800,color:"#fff",letterSpacing:"-0.02em",opacity:animReady?1:0,transition:"opacity 0.3s ease-out",transitionDelay:`${0.2+i*0.12}s`}}>
                        {stage.value.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Key Metrics Row ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:16,marginBottom:24}}>
        {[
          { label: "Conversion Rate", value: `${metrics.conversionRate.toFixed(1)}%`, sub: `${metrics.newCustomers} of ${metrics.leads} leads`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, color: C.pri },
          { label: "New Customer Revenue", value: fmtMoney(metrics.newCustomerRevenue), sub: `From ${metrics.newCustomers} new customers`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, color: "#16A34A" },
          { label: "Avg Customer LTV", value: fmtMoney(metrics.avgLTV), sub: `Across ${metrics.spendingClientsCount.toLocaleString()} customers`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#AF8D54" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, color: "#AF8D54" },
          { label: "Forecasted Revenue Uplift", value: fmtMoney(metrics.forecastedUplift), sub: `${metrics.newCustomers} new × ${fmtMoney(metrics.avgLTV)} LTV`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, color: C.dan },
        ].map((m, i) => (
          <div key={m.label} style={{
            background:"#fff",borderRadius:14,border:`1.5px solid ${C.borderLight}`,padding:"20px 22px",
            boxShadow:"0 2px 12px rgba(0,0,0,0.03)",
            transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",
            animation:`metricReveal 0.35s ease-out ${0.3+i*0.08}s both`,
            cursor:"default",
          }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.08)";e.currentTarget.style.borderColor=m.color+"40";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.03)";e.currentTarget.style.borderColor=C.borderLight;}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:`${m.color}10`,display:"flex",alignItems:"center",justifyContent:"center"}}>{m.icon}</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.06em"}}>{m.label}</div>
            </div>
            <div style={{fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-0.02em",lineHeight:1}}>{m.value}</div>
            <div style={{fontSize:11,color:C.textMut,marginTop:6,fontWeight:500}}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── LTV Breakdown Card ── */}
      <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${C.borderLight}`,padding:"20px 24px",boxShadow:"0 2px 12px rgba(0,0,0,0.03)",animation:"metricReveal 0.35s ease-out 0.65s both"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{fontSize:12,fontWeight:700,color:C.text,textTransform:"uppercase",letterSpacing:"0.06em"}}>LTV Methodology</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Total Revenue Pool</div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>{fmtMoney(metrics.spendingClientsCount > 0 ? metrics.avgLTV * metrics.spendingClientsCount : 0)}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>All-time revenue from all customers</div>
          </div>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Paying Customers</div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>{metrics.spendingClientsCount.toLocaleString()}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>Clients with at least one transaction</div>
          </div>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Avg LTV per Customer</div>
            <div style={{fontSize:20,fontWeight:800,color:"#AF8D54"}}>{fmtMoney(metrics.avgLTV)}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>Total revenue / paying customers</div>
          </div>
        </div>
      </div>
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

  // Summary analytics — LAZY: only compute today stats eagerly; weekly/MTD only when expanded
  const [expandSummary, setExpandSummary] = useState(false);
  const summaryStats = useMemo(() => {
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    // Today stats (cheap — single day, small catalog)
    const todayCompleted = activeItems.filter(c => getOpsCardStatus(data, c, viewDate) === "completed").length;
    const todayTotal = activeItems.length;
    const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    // Weekly/MTD only when summary is expanded (avoids 14+ days × catalog loop on every render)
    if (!expandSummary) return { todayCompleted, todayTotal, todayPct, rows: [] };

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
  }, [data, viewDate, expandSummary]);

  // ─── Today's Progress snapshot data (LAZY: only compute when panel open) ───
  const todayProgressData = useMemo(() => {
    if (!showTodayProgress) return null;
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
    Object.keys(allRooms).forEach(rt => {
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
        const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || res.room : "—";
        bathRows.push({ dogName: dog.fields.name, bathType: bath, done: administered, checkOutTime: coTime, room: roomNum });
      }
    });
    bathRows.sort((a, b) => (a.room || "").localeCompare(b.room || "", undefined, { numeric: true }));
    const bathsTotal = bathRows.length;
    const bathsDone = bathRows.filter(b => b.done).length;

    // Pictures: boarding dogs not on first or last day (same logic as renderPictures checklist)
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
  }, [data, viewDate, showTodayProgress]);

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

  if (data.loading) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <K9LoadingAnimation size={56} message="Loading operations data..." subMessage="Fetching from cache" />
    </div>
  );

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
      {showTodayProgress && todayProgressData && (() => {
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
                            <span style={{ color: C.pri, fontWeight: 700, fontSize: 10 }}>Rm {b.room}</span>
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


      {/* ─── Services Section (Dynamic from Gingr) ─────────────────────────────── */}
      {(hp("view_daily_ops")) && (() => {
        // Dynamically discover all unique services from today's in-house reservations
        const EXCLUDED_SERVICES = ["food from home", "medication administration", "private play overnight rate"];
        const reservations = data.reservations || [];
        const dataLoaded = reservations.length > 0;
        const inHouseToday = reservations.filter(r =>
          (r.status === "checked-in" || r.status === "upcoming") &&
          r.checkIn <= viewDate && r.checkOut >= viewDate
        );
        const svcSet = new Set();
        inHouseToday.forEach(res => {
          const svcs = res._services;
          if (!svcs) return;
          const arr = Array.isArray(svcs) ? svcs : [];
          arr.forEach(s => {
            const name = typeof s === "string" ? s : (s && s.name ? s.name : null);
            if (!name) return;
            const lc = name.toLowerCase();
            if (EXCLUDED_SERVICES.some(ex => lc.includes(ex))) return;
            svcSet.add(name);
          });
        });
        // Merge Pamper Package and Pamper Package Plus into one card
        const hasPamper = svcSet.has("Pamper Package") || svcSet.has("Pamper Package Plus");
        svcSet.delete("Pamper Package");
        svcSet.delete("Pamper Package Plus");

        // Always show Bathing + Pamper as core services, even before data loads
        const orderedServices = [];
        orderedServices.push({ name: "Bath", routeKey: "bathing", desc: "Auto-pulled bath types from Gingr" });
        svcSet.delete("Bath");
        orderedServices.push({ name: "Pamper Package Plus", routeKey: "pamper", desc: "Luxury Suite + Add-On dogs" });
        // Add any additional discovered services
        Array.from(svcSet).sort().forEach(name => {
          const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
          orderedServices.push({ name, routeKey: `svc_${key}`, desc: "Service report" });
        });

        const dynamicCount = orderedServices.length - 2; // extra beyond bath + pamper
        return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ margin: "8px 0 18px", height: 1, background: C.borderLight }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              Services
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
                {dataLoaded ? `(${orderedServices.length} active)` : ""}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {orderedServices.map(item => {
                let count = 0;
                let countReady = dataLoaded;
                if (item.routeKey === "bathing") {
                  count = inHouseToday.filter(r => {
                    const svcs = r._services;
                    if (!svcs) return false;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    return arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase() === "bath");
                  }).length;
                } else if (item.routeKey === "pamper") {
                  const seen = new Set();
                  inHouseToday.forEach(r => {
                    if (seen.has(r.dogId)) return;
                    const isLS = r._resTypeId == 5 || (r._resTypeName || "").toLowerCase().includes("luxury suite");
                    const svcs = r._services;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    const hasPP = arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase().includes("pamper"));
                    if (isLS || hasPP) { seen.add(r.dogId); count++; }
                  });
                } else {
                  count = inHouseToday.filter(r => {
                    const svcs = r._services;
                    if (!svcs) return false;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    return arr.some(s => (typeof s === "string" ? s : s?.name || "") === item.name);
                  }).length;
                }
                return (
                  <div key={item.routeKey}
                    onClick={() => item.routeKey === "bathing" ? nav("ops-bathing") : item.routeKey === "pamper" ? nav("ops-pamper") : nav("ops-svc", { svcName: item.name })}
                    style={{
                      background: C.surface, borderRadius: 14, padding: "18px 20px",
                      border: `1.5px solid ${C.pri}40`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.name === "Bath" ? "Bathing Report" : item.name}</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>
                        {countReady ? (count > 0 ? `${count} dog${count !== 1 ? "s" : ""} today` : "No dogs today") : "Loading…"}{item.desc ? ` · ${item.desc}` : ""}
                      </div>
                    </div>
                    <span style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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

// ─── END OF DAY REPORT PAGE (mirrors POS EODPage) ──────────────────────────
function LiteEODPage({ data, save, nav, profile, addGlobalToast }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };
  const viewDateLabel = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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

  // EOD template (customizable in settings in the future, default for now)
  const template = data.eodTemplate || DEF_LITE_EOD_TEMPLATE;

  // Load persisted custom template from Supabase
  const [customTemplate, setCustomTemplate] = useState(null);
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "eod_template").then(({ data: rows }) => {
      if (rows && rows.length > 0 && Array.isArray(rows[0].setting_value)) setCustomTemplate(rows[0].setting_value);
    });
  }, []);
  const activeTemplate = customTemplate || template;

  // Get or create EOD entry for this date
  const existing = (data.eodEntries || []).find(e => e.date === viewDate);
  const entry = existing || {
    type: "eod", id: "eod_" + viewDate, date: viewDate, locked: false,
    sections: activeTemplate.map(t => ({ id: t.id, content: t.defaultContent || "" })),
    mentions: [], history: [{ ts: new Date().toISOString(), action: "created" }],
  };
  const isPastDay = viewDate < td;
  const isLocked = isPastDay || (existing ? existing.locked : false);

  // Previous day entry (for copy feature)
  const prevDateStr = useMemo(() => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }, [viewDate]);
  const prevDayEntry = (data.eodEntries || []).find(e => e.date === prevDateStr);

  // Section content management
  const [editSections, setEditSections] = useState({});
  const [focusedSecId, setFocusedSecId] = useState(null);
  const lastSavedSecRef = useRef({});
  const userEditedRef = useRef(false);
  useEffect(() => {
    const obj = {};
    entry.sections.forEach(s => { obj[s.id] = s.content || ""; });
    setEditSections(obj);
    lastSavedSecRef.current = { ...obj };
    userEditedRef.current = false;
  }, [viewDate]);

  // Merge remote changes into sections the user is NOT focused on
  const existingSectionsKey = existing ? JSON.stringify((existing.sections || []).map(s => s.id + ":" + (s.content || "").length)) : "";
  useEffect(() => {
    if (!existing || !existing.sections) return;
    setEditSections(prev => {
      const next = { ...prev };
      let changed = false;
      existing.sections.forEach(s => {
        if (s.id !== focusedSecId && s.content !== lastSavedSecRef.current[s.id]) {
          next[s.id] = s.content;
          lastSavedSecRef.current[s.id] = s.content;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [existingSectionsKey]);

  const updateSection = (secId, content) => { userEditedRef.current = true; setEditSections(prev => ({ ...prev, [secId]: content })); };

  // Editing checklist items inline
  const [editingCheckItem, setEditingCheckItem] = useState(null);

  // Staff name for attribution
  const staffName = profile?.full_name || profile?.email || "Staff";

  // Audit helper
  const mkAudit = (auditAction, details, prev, next) => ({
    ts: new Date().toISOString(), type: "audit", id: gid(),
    userId: profile?.id || "unknown", userName: staffName,
    auditAction, details, previousValue: prev || null, newValue: next || null,
  });

  // Auto-save (debounced 800ms)
  const eodAutoSaveRef = useRef(null);
  const saveEOD = useCallback(() => {
    const prevSections = entry.sections || [];
    const newHistory = [...(entry.history || [])];
    const sections = activeTemplate.map(t => {
      const content = editSections[t.id] || "";
      const prev = prevSections.find(s => s.id === t.id);
      const prevContent = prev?.content || "";
      const editedBy = content !== prevContent ? { name: staffName, at: new Date().toISOString() } : (prev?.editedBy || null);
      if (content !== prevContent && prevContent.trim() !== "" && content.trim() !== "") {
        newHistory.push(mkAudit("EDIT_SECTION", `Edited "${t.title || t.id}" section`, prevContent.length > 200 ? prevContent.slice(0, 200) + "..." : prevContent, content.length > 200 ? content.slice(0, 200) + "..." : content));
      } else if (content.trim() && !prevContent.trim()) {
        newHistory.push(mkAudit("ADD_CONTENT", `Added content to "${t.title || t.id}" section`, null, content.length > 200 ? content.slice(0, 200) + "..." : content));
      }
      return { id: t.id, content, ...(editedBy ? { editedBy } : {}) };
    });
    newHistory.push({ ts: new Date().toISOString(), action: "saved" });
    const newEntry = { ...entry, sections, mentions: entry.mentions || [], history: newHistory };
    const entries = [...(data.eodEntries || [])];
    const idx = entries.findIndex(e => e.date === viewDate);
    if (idx >= 0) entries[idx] = newEntry; else entries.push(newEntry);
    const savedObj = {};
    sections.forEach(s => { savedObj[s.id] = s.content; });
    lastSavedSecRef.current = savedObj;
    save({ ...data, eodEntries: entries });
  }, [editSections, entry, viewDate, data, activeTemplate, staffName, profile]);

  useEffect(() => {
    if (isLocked || !userEditedRef.current) return;
    if (eodAutoSaveRef.current) clearTimeout(eodAutoSaveRef.current);
    eodAutoSaveRef.current = setTimeout(() => { saveEOD(); }, 800);
    return () => { if (eodAutoSaveRef.current) clearTimeout(eodAutoSaveRef.current); };
  }, [editSections]);

  // Lock/unlock
  const toggleLock = async () => {
    if (isPastDay && isLocked) return;
    const entries = [...(data.eodEntries || [])];
    const idx = entries.findIndex(e => e.date === viewDate);
    if (idx >= 0) {
      const wasLocked = entries[idx].locked;
      entries[idx] = { ...entries[idx], locked: !wasLocked, history: [...(entries[idx].history || []), mkAudit(wasLocked ? "UNLOCK_DAY" : "LOCK_DAY", wasLocked ? `Unlocked EOD for ${viewDate}` : `Locked EOD for ${viewDate}`, wasLocked ? "Locked" : "Unlocked", wasLocked ? "Unlocked" : "Locked")] };
      await save({ ...data, eodEntries: entries });
    } else {
      const sections = activeTemplate.map(t => ({ id: t.id, content: editSections[t.id] || "" }));
      entries.push({ ...entry, sections, locked: true, history: [...(entry.history || []), mkAudit("LOCK_DAY", `Locked EOD for ${viewDate}`, null, "Locked")] });
      await save({ ...data, eodEntries: entries });
    }
  };

  // History panel
  const [showHistory, setShowHistory] = useState(false);
  // Guide
  const [showEODGuide, setShowEODGuide] = useState(false);
  // Audit log panel
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const eodAuditEntries = useMemo(() => (entry.history || []).filter(h => h.type === "audit").sort((a, b) => (b.ts || "").localeCompare(a.ts || "")), [entry.history]);

  // EOD Template Editor State
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  const openTemplateEditor = () => {
    setEditTemplate(activeTemplate.map(t => ({ ...t })));
    setTemplateDirty(false);
    setShowTemplateEditor(true);
  };

  const moveTemplateSection = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editTemplate.length) return;
    const items = [...editTemplate];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const updateTemplateSection = (idx, field, value) => {
    const items = [...editTemplate];
    items[idx] = { ...items[idx], [field]: value };
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const removeTemplateSection = (idx) => {
    setEditTemplate(editTemplate.filter((_, i) => i !== idx));
    setTemplateDirty(true);
  };

  const addTemplateSection = () => {
    const newId = `custom_${Date.now()}`;
    setEditTemplate([...editTemplate, { id: newId, title: "New Section", emoji: "📝", type: "text", defaultContent: "" }]);
    setTemplateDirty(true);
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "eod_template",
      setting_value: editTemplate,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setCustomTemplate(editTemplate);
      setTemplateDirty(false);
      setShowTemplateEditor(false);
      if (addGlobalToast) addGlobalToast("EOD template saved", "success");
    }
    setTemplateSaving(false);
  };

  const resetTemplate = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    await supabase.from("lite_settings").delete().eq("location_id", locationId).eq("setting_key", "eod_template");
    setCustomTemplate(null);
    setTemplateDirty(false);
    setShowTemplateEditor(false);
    setTemplateSaving(false);
    if (addGlobalToast) addGlobalToast("EOD template reset to defaults", "success");
  };

  // Calendar dots for days with saved EOD
  const eodDates = useMemo(() => new Set((data.eodEntries || []).map(e => e.date)), [data.eodEntries]);


  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("ops-hub")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>{"← Operations"}</button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>End of Day Report</h1>
          <button onClick={() => setShowEODGuide(v => !v)} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${showEODGuide ? C.pri : C.border}`, background: showEODGuide ? C.priLt : "transparent", color: showEODGuide ? C.pri : C.textMut, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s" }} title="How EOD Reports work">?</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={openTemplateEditor}>Customize Template</Btn>
          {isPastDay && isLocked ? <Btn variant="secondary" size="sm" disabled style={{opacity:0.5,cursor:"not-allowed"}}>{"🔒 Locked"}</Btn> : <Btn variant="secondary" onClick={toggleLock} size="sm">{isLocked ? "🔒 Locked" : "🔓 Lock Day"}</Btn>}
        </div>
      </div>

      {/* New Hire Guide */}
      {showEODGuide && (
        <div style={{ marginBottom: 16, padding: "20px 22px", borderRadius: 12, border: `1.5px solid ${C.priLt}`, background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.pri, marginBottom: 10 }}>How EOD Reports Work</div>
          <div style={{ marginBottom: 10 }}>
            The End of Day (EOD) Report is a <span style={{ fontWeight: 700, color: C.text }}>daily log</span> completed at the end of each shift. It's how the team communicates what happened during the day — from sales and alerts to individual dog notes and building issues.
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Daily workflow:</div>
          <div style={{ paddingLeft: 14, marginBottom: 10 }}>
            <div><span style={{ fontWeight: 700 }}>1. A new EOD auto-creates each day</span> — pre-filled with all the template sections. Just fill in the blanks as the day goes on.</div>
            <div><span style={{ fontWeight: 700 }}>2. Add notes to each section</span> — Sales totals, meds administered, daycare notes, incidents, leads, tours, etc. Fill in what applies, leave the rest blank.</div>
            <div><span style={{ fontWeight: 700 }}>3. Auto-saves as you type</span> — Your notes are saved automatically. Multiple people can add to it throughout the day.</div>
            <div><span style={{ fontWeight: 700 }}>4. Lock at end of day</span> — When the EOD is complete, lock it so it can't be accidentally edited. Locked days can be unlocked by a manager if needed.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Other features:</div>
          <div style={{ paddingLeft: 14, marginBottom: 8 }}>
            <div><span style={{ fontWeight: 700 }}>History</span> — Click "History" to see when the EOD was saved and locked/unlocked, with timestamps.</div>
            <div><span style={{ fontWeight: 700 }}>Calendar</span> — Use the calendar icon to jump to any past EOD. Gold dots indicate days that have saved reports.</div>
            <div><span style={{ fontWeight: 700 }}>Template</span> — Click "Customize Template" to add, remove, reorder, and edit section names and default content.</div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic", borderTop: `1px solid ${C.borderLight || C.border}`, paddingTop: 8, marginTop: 4 }}>Tip: Get in the habit of adding notes throughout the day instead of trying to remember everything at close. Future you (and the morning shift) will thank you.</div>
        </div>
      )}

      {/* Date Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 20, position: "relative" }}>
        <button onClick={() => shiftDate(-1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Previous day">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, padding: "4px 2px", whiteSpace: "nowrap" }}>{viewDateLabel}</span>
        <button onClick={() => shiftDate(1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Next day">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        {!isToday && <button onClick={() => setViewDate(td)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>}
        {existing && <button onClick={() => setShowHistory(v => !v)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{showHistory ? "Hide History" : "History"}</button>}
        {isLocked && <Badge color="warning" size="sm">Read-only</Badge>}

        {/* Calendar Popup */}
        {showCalendar && (
          <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
              <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
              {calDays.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0");
                const dateStr = `${calYear}-${m}-${d}`; const isSelected = dateStr === viewDate; const isTodayCell = dateStr === td;
                const hasEOD = eodDates.has(dateStr);
                return (
                  <button key={i} onClick={() => calSelect(day)} style={{ width: 34, height: 34, borderRadius: 10, border: isSelected ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent", background: isSelected ? C.pri : "transparent", color: isSelected ? "#fff" : isTodayCell ? C.acc : C.text, fontSize: 13, fontWeight: isSelected || isTodayCell ? 700 : 500, cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceHover; }} onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                    {day}
                    {hasEOD && !isSelected && <div style={{ width: 4, height: 4, borderRadius: 2, background: C.acc, marginTop: 1 }} />}
                  </button>
                );
              })}
            </div>
            {!isToday && <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}><button onClick={() => { setViewDate(td); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to Today</button></div>}
          </div>
        )}
      </div>

      {/* Edit History */}
      {showHistory && existing && (
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Edit History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(existing.history || []).filter(h => !h.type || h.type !== "audit").map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.textSec }}>
                <span style={{ fontWeight: 600, color: C.textMut }}>{new Date(h.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(h.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                {" — "}{h.action.charAt(0).toUpperCase() + h.action.slice(1)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && editTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "24px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Customize EOD Template</h2>
              <button onClick={() => setShowTemplateEditor(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0, fontSize: 16 }}>{"✕"}</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>Add, remove, reorder sections. Changes affect all future EOD reports for this location.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {editTemplate.map((sec, idx) => (
                <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.bg, border: `1.5px solid ${C.border}` }}>
                  <input value={sec.emoji} onChange={e => updateTemplateSection(idx, "emoji", e.target.value)} style={{ width: 36, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px", fontSize: 16, background: C.surface, fontFamily: "inherit" }} />
                  <input value={sec.title} onChange={e => updateTemplateSection(idx, "title", e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }} />
                  <select value={sec.type} onChange={e => updateTemplateSection(idx, "type", e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, background: C.surface, color: C.text, fontFamily: "inherit" }}>
                    <option value="text">Text</option>
                    <option value="checklist">Checklist</option>
                  </select>
                  <button onClick={() => moveTemplateSection(idx, -1)} disabled={idx === 0} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveTemplateSection(idx, 1)} disabled={idx === editTemplate.length - 1} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === editTemplate.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editTemplate.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editTemplate.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => removeTemplateSection(idx)} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={addTemplateSection}>+ Add Section</Btn>
              <div style={{ flex: 1 }} />
              <button onClick={resetTemplate} disabled={templateSaving} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset to Default</button>
              <Btn onClick={saveTemplate} disabled={!templateDirty || templateSaving}>{templateSaving ? "Saving\u2026" : "Save Template"}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {activeTemplate.map(sec => {
          const content = editSections[sec.id] ?? "";
          const isChecklist = (sec.type || "text") === "checklist";

          // Checklist helpers
          const parseChecklistItems = (text) => {
            if (!text) return [];
            return text.split("\n").filter(l => l.trim()).map(line => {
              const checked = line.startsWith("[x] ");
              const label = line.replace(/^\[[ x]\] /, "");
              return { checked, label };
            });
          };
          const toggleCheckItem = (idx) => {
            const items = parseChecklistItems(content);
            items[idx] = { ...items[idx], checked: !items[idx].checked };
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const removeCheckItem = (idx) => {
            const items = parseChecklistItems(content);
            items.splice(idx, 1);
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const editCheckItemLabel = (idx, newLabel) => {
            const items = parseChecklistItems(content);
            items[idx] = { ...items[idx], label: newLabel };
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const addCheckItem = (label) => {
            if (!label.trim()) return;
            const items = parseChecklistItems(content);
            items.push({ checked: false, label: label.trim() });
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const checklistItems = isChecklist ? parseChecklistItems(content) : [];
          const checkedCount = checklistItems.filter(it => it.checked).length;

          return (
            <Card key={sec.id} style={{ padding: 0, overflow: "visible" }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0" }}>
                <span style={{ fontSize: 16 }}>{sec.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{sec.title}</span>
                {isChecklist && checklistItems.length > 0 && <Badge color={checkedCount === checklistItems.length ? "success" : "default"} size="sm">{checkedCount}/{checklistItems.length}</Badge>}
                {/* Copy from previous day */}
                {!isLocked && (() => {
                  const prevSec = (prevDayEntry?.sections || []).find(s => s.id === sec.id);
                  const prevContent = prevSec?.content || "";
                  const hasPrev = prevContent.trim().length > 0;
                  return (
                    <button disabled={!hasPrev}
                      onClick={(e) => { e.stopPropagation(); if (!hasPrev) return; if (!content.trim() || window.confirm(`Replace current content in "${sec.title}" with content from ${new Date(prevDateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}?`)) { updateSection(sec.id, prevContent); } }}
                      title={hasPrev ? `Copy from ${new Date(prevDateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "No content from previous day"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: hasPrev ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 600, color: C.textSec, fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", opacity: hasPrev ? 1 : 0.4 }}
                      onMouseEnter={e => { if (hasPrev) { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; e.currentTarget.style.borderColor = C.pri; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.textSec; e.currentTarget.style.borderColor = C.border; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy prev day
                    </button>
                  );
                })()}
              </div>

              {/* Section body */}
              <div style={{ padding: "12px 16px", position: "relative" }}>
                {isChecklist ? (
                  /* Checklist mode */
                  <div>
                    {checklistItems.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {checklistItems.map((item, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderRadius: 8, transition: "background 0.1s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <button onClick={() => !isLocked && toggleCheckItem(idx)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.checked ? C.suc : C.border}`, background: item.checked ? C.suc : "transparent", cursor: isLocked ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, transition: "all 0.15s" }}>
                              {item.checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </button>
                            {!isLocked && editingCheckItem && editingCheckItem.secId === sec.id && editingCheckItem.idx === idx ? (
                              <input autoFocus value={item.label} onChange={e => editCheckItemLabel(idx, e.target.value)}
                                onBlur={() => setEditingCheckItem(null)}
                                onKeyDown={e => { if (e.key === "Enter") setEditingCheckItem(null); }}
                                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", background: "transparent", padding: 0 }} />
                            ) : (
                              <span onClick={() => { if (!isLocked) setEditingCheckItem({ secId: sec.id, idx }); }} style={{ flex: 1, fontSize: 13, color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", cursor: isLocked ? "default" : "text", whiteSpace: "pre-wrap" }}>{item.label}</span>
                            )}
                            {!isLocked && (
                              <button onClick={() => removeCheckItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: "2px 4px", fontSize: 14, lineHeight: 1, opacity: 0.5, transition: "opacity 0.1s" }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = C.textMut; }}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!isLocked && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: checklistItems.length > 0 ? 6 : 0, padding: "4px 4px" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <input placeholder="Add item..." onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { addCheckItem(e.target.value); e.target.value = ""; } }}
                          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: C.text, background: "transparent", padding: 0 }} />
                      </div>
                    )}
                    {isLocked && checklistItems.length === 0 && <span style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No items</span>}
                  </div>
                ) : isLocked ? (
                  /* Text mode: locked */
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, minHeight: 24, whiteSpace: "pre-wrap" }}>
                    {content || <span style={{ color: C.textMut, fontStyle: "italic" }}>Empty</span>}
                  </div>
                ) : (
                  /* Text mode: editable */
                  <textarea value={content} onChange={(e) => updateSection(sec.id, e.target.value)}
                    onFocus={() => setFocusedSecId(sec.id)} onBlur={() => setFocusedSecId(f => f === sec.id ? null : f)}
                    placeholder={sec.defaultContent || "Type here..."}
                    style={{ width: "100%", minHeight: 40, padding: 0, border: "none", outline: "none", fontSize: 13, color: C.text, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", background: "transparent", boxSizing: "border-box" }} />
                )}
                {/* Edited-by attribution */}
                {(() => { const secData = (entry.sections || []).find(s => s.id === sec.id); return secData?.editedBy ? (
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 6, fontStyle: "italic" }}>Last edited by {secData.editedBy.name}{secData.editedBy.at ? ` · ${new Date(secData.editedBy.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</div>
                ) : null; })()}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, padding: "16px 0", borderTop: `1px solid ${C.border}` }}>
        <Btn variant="secondary" size="sm" onClick={() => setShowAuditLog(v => !v)}>
          {showAuditLog ? "Hide Audit Log" : "Audit Log"} {eodAuditEntries.length > 0 && `(${eodAuditEntries.length})`}
        </Btn>
        {!isLocked && <Btn variant="secondary" onClick={toggleLock}>Lock Day</Btn>}
      </div>

      {/* Audit Log Panel */}
      {showAuditLog && (
        <Card style={{ marginTop: 8, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Audit Log</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{viewDateLabel} — {eodAuditEntries.length} audit {eodAuditEntries.length === 1 ? "entry" : "entries"}</div>
            </div>
          </div>
          {eodAuditEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>
              No audit entries yet for this day. All edits and lock/unlock actions will be recorded here.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {eodAuditEntries.map((ae, idx) => {
                const actionColors = {
                  EDIT_SECTION: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
                  ADD_CONTENT: { bg: "#D1FAE5", color: "#059669", label: "Added" },
                  COPY_PREV_DAY: { bg: "#E0F2FE", color: "#0369A1", label: "Copied" },
                  LOCK_DAY: { bg: "#FEF3C7", color: "#D97706", label: "Locked" },
                  UNLOCK_DAY: { bg: "#FEE2E2", color: "#DC2626", label: "Unlocked" },
                };
                const ac = actionColors[ae.auditAction] || { bg: C.bg, color: C.textSec, label: ae.auditAction || "Action" };
                const formatTs = (ts) => { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }); };
                const expanded = expandedAuditId === (ae.id || idx);
                return (
                  <div key={ae.id || idx} style={{ borderBottom: idx < eodAuditEntries.length - 1 ? `1px solid ${C.border}` : "none", padding: "12px 20px", cursor: ae.previousValue || ae.newValue ? "pointer" : "default", transition: "background 0.1s" }}
                    onClick={() => { if (ae.previousValue || ae.newValue) setExpandedAuditId(expanded ? null : (ae.id || idx)); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFC"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 90, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{formatTs(ae.ts)}</div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ae.userName}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: ac.bg, color: ac.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{ac.label}</span>
                      </div>
                      <div style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{ae.details}</div>
                      {(ae.previousValue || ae.newValue) && <div style={{ flexShrink: 0, fontSize: 10, color: C.textMut, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>}
                    </div>
                    {expanded && (ae.previousValue || ae.newValue) && (
                      <div style={{ marginTop: 10, marginLeft: 102, display: "flex", gap: 16, fontSize: 11 }}>
                        {ae.previousValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#FEE2E2", border: "1px solid #FECACA" }}>
                            <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Previous</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 11, color: "#7F1D1D" }}>{typeof ae.previousValue === "string" ? ae.previousValue : JSON.stringify(ae.previousValue, null, 2)}</pre>
                          </div>
                        )}
                        {ae.newValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>New</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 11, color: "#064E3B" }}>{typeof ae.newValue === "string" ? ae.newValue : JSON.stringify(ae.newValue, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── DAILY OPERATIONS PAGE (from POS App) ───────────────────────────────────
function DailyOpsPage({ data, save, sub, nav, profile, addGlobalToast, params }) {
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

  // ─── Custom template support ───
  const [customTemplate, setCustomTemplate] = useState(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Load custom template from Supabase on mount
  useEffect(() => {
    if (!isTemplate) return;
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_checklist_templates").select("*").eq("location_id", locationId).eq("template_type", sub).then(({ data: rows }) => {
      if (rows && rows.length > 0 && Array.isArray(rows[0].items) && rows[0].items.length > 0) {
        setCustomTemplate(rows[0].items);
      }
    });
  }, [sub]);

  // Template-based items for today (use custom if available)
  const baseTemplate = isTemplate ? (customTemplate || data[meta.key] || meta.def) : [];
  const template = baseTemplate;
  const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);

  // Template editor functions
  const openTemplateEditor = () => {
    setEditTemplate(template.map(t => ({ ...t })));
    setTemplateDirty(false);
    setShowTemplateEditor(true);
  };

  const moveTemplateSec = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editTemplate.length) return;
    const items = [...editTemplate];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const updateTemplateSec = (idx, field, value) => {
    const items = [...editTemplate];
    items[idx] = { ...items[idx], [field]: value };
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const removeTemplateSec = (idx) => {
    setEditTemplate(editTemplate.filter((_, i) => i !== idx));
    setTemplateDirty(true);
  };

  const addTemplateSec = () => {
    const newId = `${sub}_custom_${Date.now()}`;
    setEditTemplate([...editTemplate, { id: newId, label: "New Task", time: meta.showTime ? "08:00" : undefined }]);
    setTemplateDirty(true);
  };

  const saveTemplateToDb = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_checklist_templates").upsert({
      location_id: locationId,
      template_type: sub,
      items: editTemplate,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,template_type" });
    if (!error) {
      setCustomTemplate(editTemplate.map(t => ({ ...t })));
      setTemplateDirty(false);
      setShowTemplateEditor(false);
      if (addGlobalToast) addGlobalToast("Checklist template saved", "success");
    }
    setTemplateSaving(false);
  };

  const resetTemplateToDefault = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    await supabase.from("lite_checklist_templates").delete().eq("location_id", locationId).eq("template_type", sub);
    setCustomTemplate(null);
    setTemplateDirty(false);
    setShowTemplateEditor(false);
    setTemplateSaving(false);
    if (addGlobalToast) addGlobalToast("Checklist template reset to defaults", "success");
  };

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

  // PP checklist: checked-in dogs with Private Play add-on OR day boarding dogs
  const ppReservations = data.reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare" || r.type === "dayboarding") &&
    r.status === "checked-in" &&
    r.checkIn <= viewDate && r.checkOut >= viewDate &&
    (resSvcIncludes(r, "Private Play") || r.type === "dayboarding")
  ).map(r => ({
    ...r,
    _ppSource: r.type === "dayboarding"
      ? (resSvcIncludes(r, "Private Play") ? "Day Boarding + Add-On" : "Day Boarding")
      : "Private Play Add-On"
  })).sort((a, b) => {
    const aNum = a.room ? (a.room.match(/(\d+)/) || [])[1] || "" : "";
    const bNum = b.room ? (b.room.match(/(\d+)/) || [])[1] || "" : "";
    return aNum.localeCompare(bNum, undefined, { numeric: true });
  });

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
        {isTemplate && <Btn variant="secondary" size="sm" onClick={openTemplateEditor}>Customize</Btn>}
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
  const fmtTimeShort = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };
  const renderRoomCleaning = () => {
    const roomItems = items;

    // ─── Previous-day missed cleaning detection ───
    const prevDateObj = new Date(viewDate + "T12:00:00");
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().slice(0, 10);
    const prevEntryId = `ops_room_cleaning_${prevDate}`;
    const prevEntry = allOps.find(e => e.id === prevEntryId);
    const prevItems = prevEntry ? (prevEntry.items || {}) : {};

    // Figure out which rooms needed disinfect / as-needed yesterday
    const prevBoardingCheckedOut = data.reservations.filter(r => r.type === "boarding" && r.checkOut === prevDate && r.status === "checked-out");
    const prevBoardingToday = data.reservations.filter(r => r.type === "boarding" && r.checkIn <= prevDate && r.checkOut >= prevDate && (r.status === "checked-in" || r.status === "upcoming" || r.status === "checked-out"));

    // Build a map: room → { missedDisinfect, missedAsNeeded }
    const missedMap = {};
    Object.keys(allRooms).forEach(rt => {
      (allRooms[rt] || []).forEach(rm => {
        const prevRi = prevItems[rm] || {};
        const prevCoRes = prevBoardingCheckedOut.find(r => r.room === rm);
        const prevActiveRes = prevBoardingToday.find(r => r.room === rm);
        const prevIsLastDay = prevActiveRes && prevActiveRes.checkOut === prevDate;
        const prevNeededDisinfect = !!prevCoRes || !!(prevActiveRes && prevIsLastDay);
        const prevAsNeededFlagged = !!prevRi.asNeeded;
        const prevAsNeededCompleted = !!prevRi.asNeededDone;

        let missedDisinfect = false;
        let missedAsNeeded = false;

        // Disinfect missed: was needed yesterday but not done
        if (prevNeededDisinfect && !prevRi.disinfect) {
          missedDisinfect = true;
        }
        // As-needed missed: was flagged yesterday but not marked done
        if (prevAsNeededFlagged && !prevAsNeededCompleted) {
          missedAsNeeded = true;
        }

        if (missedDisinfect || missedAsNeeded) {
          missedMap[rm] = { missedDisinfect, missedAsNeeded };
        }
      });
    });

    // Count occupied rooms and rooms needing action
    let totalOccupied = 0, totalRefresh = 0, totalDisinfect = 0, doneRefresh = 0, doneDisinfect = 0;
    Object.keys(allRooms).forEach(rt => {
      (allRooms[rt] || []).forEach(rm => {
        const ri = roomItems[rm] || {};
        const activeRes = boardingToday.find(r => r.room === rm);
        const coRes = boardingCheckedOut.find(r => r.room === rm);
        if (activeRes || coRes) totalOccupied++;
        const notFirst = activeRes && activeRes.checkIn < viewDate;
        const notLast = activeRes && activeRes.checkOut > viewDate;
        if (activeRes && notFirst && notLast) { totalRefresh++; if (ri.refresh) doneRefresh++; }
        if (coRes) { totalDisinfect++; if (ri.disinfect) doneDisinfect++; }
      });
    });
    const totalNeeded = totalRefresh + totalDisinfect;
    const totalDone = doneRefresh + doneDisinfect;
    return (
      <div>
        {/* Missed cleaning alert banner */}
        {Object.keys(missedMap).length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "rgba(220, 38, 38, 0.08)", border: "1.5px solid rgba(220, 38, 38, 0.25)", borderRadius: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>Missed Cleaning from {new Date(prevDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <div style={{ fontSize: 11, color: "#DC2626", opacity: 0.8 }}>
              {Object.values(missedMap).filter(m => m.missedDisinfect).length > 0 && `${Object.values(missedMap).filter(m => m.missedDisinfect).length} full disinfect${Object.values(missedMap).filter(m => m.missedDisinfect).length > 1 ? "s" : ""} missed`}
              {Object.values(missedMap).filter(m => m.missedDisinfect).length > 0 && Object.values(missedMap).filter(m => m.missedAsNeeded).length > 0 && " · "}
              {Object.values(missedMap).filter(m => m.missedAsNeeded).length > 0 && `${Object.values(missedMap).filter(m => m.missedAsNeeded).length} as-needed missed`}
            </div>
          </div>
        </div>}
        {/* Summary bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{totalOccupied}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Rooms Occupied</span>
          </div>
          {totalRefresh > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{doneRefresh}/{totalRefresh}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Refreshes Done</span>
          </div>}
          {totalDisinfect > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.dan }}>{doneDisinfect}/{totalDisinfect}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Disinfects Done</span>
          </div>}
        </div>
        {totalNeeded > 0 && <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: totalNeeded ? `${(totalDone / totalNeeded) * 100}%` : "0%", height: "100%", background: totalDone === totalNeeded ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: totalDone === totalNeeded ? C.suc : C.text }}>{totalDone}/{totalNeeded}</span>
          </div>
        </div>}
        {Object.keys(allRooms).map(rt => {
          const rooms = allRooms[rt] || [];
          if (!rooms.length) return null;
          const occupiedCount = rooms.filter(rm => boardingToday.find(r => r.room === rm) || boardingCheckedOut.find(r => r.room === rm)).length;
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{occupiedCount}/{rooms.length} occupied</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 1fr 1fr 80px", borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
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
                  const isFirstDay = activeRes && activeRes.checkIn === viewDate;
                  const isLastDay = activeRes && activeRes.checkOut === viewDate;
                  const needsRefresh = !!(activeRes && notFirst && notLast);
                  const needsDisinfect = !!(activeRes && isLastDay) || !!coRes;
                  const canDisinfect = !!coRes;
                  const currentRes = activeRes || coRes;
                  const aDog = currentRes ? dogName(currentRes.dogId) : null;
                  const aOwner = currentRes ? (currentRes._ownerName || ownerName(currentRes.clientId)) : null;
                  const isOccupied = !!currentRes;
                  // Checkout time: actual if checked out, or scheduled if it's checkout day
                  const coTimeDisplay = coRes ? fmtTimeShort(coRes.checkOutTime) : (isLastDay && activeRes) ? fmtTimeShort(activeRes.scheduledCheckOutTime) : null;
                  return (
                    <div key={rm} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 1fr 1fr 80px", padding: "8px 12px", borderBottom: i < rooms.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center", background: isOccupied ? undefined : undefined }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rm}</span>
                        {isOccupied ? <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.pri, marginTop: 1 }}>{aDog}</div>
                          {aOwner && <div style={{ fontSize: 10, color: C.textMut }}>{aOwner}</div>}
                          {isFirstDay && !isLastDay && <div style={{ fontSize: 9, color: C.acc, fontWeight: 600, marginTop: 1 }}>Check-in day</div>}
                          {isLastDay && !canDisinfect && <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 600, marginTop: 1 }}>{coTimeDisplay ? `Checkout ${coTimeDisplay}` : "Checkout day"}</div>}
                          {canDisinfect && <div style={{ fontSize: 9, color: C.dan, fontWeight: 600, marginTop: 1 }}>{coRes.checkOutTime ? `Checked out ${fmtTimeShort(coRes.checkOutTime)}` : "Checked out"}</div>}
                          {needsRefresh && <div style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>Day {Math.ceil((new Date(viewDate + "T12:00:00") - new Date(activeRes.checkIn + "T12:00:00")) / 86400000)} of {Math.ceil((new Date(activeRes.checkOut + "T12:00:00") - new Date(activeRes.checkIn + "T12:00:00")) / 86400000)}</div>}
                          {missedMap[rm]?.missedDisinfect && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 2 }}>⚠ Full disinfect missed</div>}
                          {missedMap[rm]?.missedAsNeeded && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 1 }}>⚠ As needed missed</div>}
                        </div> : <div>
                          {(missedMap[rm]?.missedDisinfect || missedMap[rm]?.missedAsNeeded) ? <div>
                            <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>
                            {missedMap[rm]?.missedDisinfect && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 2 }}>⚠ Full disinfect missed</div>}
                            {missedMap[rm]?.missedAsNeeded && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 1 }}>⚠ As needed missed</div>}
                          </div> : <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>}
                        </div>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsRefresh ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.refresh} disabled={isLocked} onChange={e => toggleItem(rm, "refresh", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.suc }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: ri.refresh ? C.suc : C.pri }}>{ri.refresh ? "Done" : "Required"}</span>
                          </div>
                          {ri.refresh && ri.refreshBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.refreshBy}</div>}
                        </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsDisinfect ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.disinfect} disabled={isLocked} onChange={e => toggleItem(rm, "disinfect", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.dan }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: ri.disinfect ? C.suc : C.dan }}>{ri.disinfect ? "Done" : "Required"}</span>
                          </div>
                          {ri.disinfect && ri.disinfectBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.disinfectBy}</div>}
                        </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
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
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>ROOM</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>SOURCE</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>OWNER</th>
                  {sesLabels.map((s, si) => (
                    <th key={si} colSpan={3} style={{ padding: "10px 6px", textAlign: "center", fontWeight: isRequired(si) ? 800 : 500, color: isRequired(si) ? C.pri : C.textMut, fontSize: 11, borderBottom: `2px solid ${isRequired(si) ? C.pri : C.border}`, borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : C.surfaceHover }}>
                      {s}{isRequired(si) ? <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, marginLeft: 4, textTransform: "uppercase" }}>REQ</span> : <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginLeft: 4, fontStyle: "italic" }}>extra</span>}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: C.surfaceHover }}>
                  <th /><th /><th /><th />
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
                      <td style={{ padding: "8px 12px", color: C.pri, fontWeight: 700, fontSize: 11 }}>{r.room ? (r.room.match(/(\d+)/) || [])[1] || r.room : "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, color: r._ppSource === "Day Boarding" ? C.acc : r._ppSource === "Day Boarding + Add-On" ? C.warn : C.pri }}>
                        <span style={{ padding: "2px 7px", borderRadius: 6, background: r._ppSource === "Day Boarding" ? C.acc + "18" : r._ppSource === "Day Boarding + Add-On" ? C.warn + "18" : C.priLt, whiteSpace: "nowrap" }}>{r._ppSource}</span>
                      </td>
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


  // ─── Service Helper: extract service names from _services (handles both formats) ──
  const getSvcNames = (svcs) => {
    if (!svcs) return [];
    const arr = Array.isArray(svcs) ? svcs : [];
    return arr.map(s => typeof s === "string" ? s : (s && s.name ? s.name : "")).filter(Boolean);
  };
  const hasSvc = (svcs, name) => getSvcNames(svcs).some(n => n.toLowerCase() === name.toLowerCase());
  const hasSvcIncludes = (svcs, partial) => getSvcNames(svcs).some(n => n.toLowerCase().includes(partial.toLowerCase()));

  // ─── Bathing Report (auto-pulled from Gingr) ───────────────────────────────
  const [bathTypeMap, setBathTypeMap] = useState({});
  const [bathTypeLoading, setBathTypeLoading] = useState(false);
  const [bathCompleted, setBathCompleted] = useState({});

  // Load bath completions from Supabase
  useEffect(() => {
    if (sub !== "bathing" || !profile?.location_id) return;
    const entryId = `ops_bathing_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setBathCompleted(rows[0].setting_value);
        } else {
          setBathCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  // Auto-fetch bath types from Gingr existing_reservation_estimate
  useEffect(() => {
    if (sub !== "bathing") return;
    const reservations = data.reservations || [];
    const inHouse = reservations.filter(r =>
      (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );
    const bathRes = inHouse.filter(r => hasSvc(r._services, "Bath"));
    if (bathRes.length === 0) return;

    const needsFetch = bathRes.filter(r => !bathTypeMap[r.id]);
    if (needsFetch.length === 0) return;

    setBathTypeLoading(true);
    const locationId = profile?.location_id;
    if (!locationId) { setBathTypeLoading(false); return; }

    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "gingr_config")
      .limit(1)
      .then(async ({ data: cfgRows }) => {
        if (!cfgRows || cfgRows.length === 0) { setBathTypeLoading(false); return; }
        const cfg = cfgRows[0].setting_value;
        const subdomain = cfg.subdomain;
        const apiKey = cfg.api_key;
        if (!subdomain || !apiKey) { setBathTypeLoading(false); return; }

        const BATH_ADDON_MAP = {
          38: "Premium", 39: "Hypoallergenic - NO SPRAY",
          79: "Hypoallergenic - WITH SPRAY", 40: "Medicated",
          75: "Whitening", 76: "Shampoo From Home",
        };

        const newMap = { ...bathTypeMap };
        for (let i = 0; i < needsFetch.length; i += 5) {
          const batch = needsFetch.slice(i, i + 5);
          await Promise.all(batch.map(async (res) => {
            try {
              const gingrId = String(res.gingrId || "").replace(/^g/, "");
              if (!gingrId) { newMap[res.id] = "Premium"; return; }
              const resp = await fetch(
                `https://${subdomain}.gingrapp.com/api/v1/existing_reservation_estimate?key=${apiKey}&id=${gingrId}`
              );
              const json = await resp.json();
              if (json.error) { newMap[res.id] = "Premium"; return; }
              const resSvcs = json.data?.reservations?.[0]?.reservation_services || [];
              let foundBathType = null;
              for (const svc of resSvcs) {
                const sid = parseInt(svc.s_id);
                if (BATH_ADDON_MAP[sid]) { foundBathType = BATH_ADDON_MAP[sid]; break; }
              }
              newMap[res.id] = foundBathType || "Premium";
            } catch (err) {
              console.error("Failed to fetch bath type for", res.id, err);
              newMap[res.id] = "Premium";
            }
          }));
        }
        setBathTypeMap(newMap);
        setBathTypeLoading(false);
      });
  }, [sub, viewDate, data.reservations, profile?.location_id]);

  const saveBathCompleted = async (newCompleted) => {
    setBathCompleted(newCompleted);
    if (!profile?.location_id) return;
    const entryId = `ops_bathing_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderBathing = () => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    // Any in-house reservation (boarding OR daycare) with Bath service
    const inHouse = reservations.filter(r =>
      (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );
    const bathRows = [];
    inHouse.forEach(res => {
      if (!hasSvc(res._services, "Bath")) return;
      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || res.room : "—";
      const bathType = bathTypeMap[res.id] || (bathTypeLoading ? "Loading…" : "Premium");
      const coTime = res.scheduledCheckOutTime || res.checkOutTime || "—";
      const completedInfo = bathCompleted[res.id];
      const isDone = !!completedInfo;
      bathRows.push({ resId: res.id, dogName, roomNum, bathType, coTime, isDone, completedInfo, resType: res.type });
    });
    bathRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    const totalBaths = bathRows.length;
    const doneBaths = bathRows.filter(r => r.isDone).length;

    const toggleBath = (resId) => {
      const newCompleted = { ...bathCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveBathCompleted(newCompleted);
    };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Bathing Report</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{doneBaths}/{totalBaths} complete</span>
            </div>
            {bathTypeLoading && <span style={{ fontSize: 12, color: C.pri, fontWeight: 600 }}>Fetching bath types from Gingr…</span>}
          </div>
          {totalBaths > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${totalBaths > 0 ? Math.round((doneBaths / totalBaths) * 100) : 0}%`, height: "100%", borderRadius: 3, background: doneBaths === totalBaths ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {totalBaths === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut }}>No baths scheduled for today</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>DOG</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>ROOM</th>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>BATH TYPE</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>CHECKOUT</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>COMPLETED</th>
                  </tr>
                </thead>
                <tbody>
                  {bathRows.map((row, i) => (
                    <tr key={row.resId} style={{
                      borderBottom: i < bathRows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      background: row.isDone ? "#F0FDF4" : "transparent",
                      transition: "background 0.2s",
                    }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>
                        {row.dogName}
                        {row.resType === "daycare" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEF3C7", color: "#D97706" }}>DC</span>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri }}>{row.roomNum}</td>
                      <td style={{ padding: "12px 14px", color: C.text }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: row.bathType === "Loading…" ? "#F3F4F6" : row.bathType === "Premium" ? "#DBEAFE" : row.bathType.includes("Hypoallergenic") ? "#FEF3C7" : row.bathType === "Medicated" ? "#FEE2E2" : row.bathType === "Whitening" ? "#F3E8FF" : row.bathType === "Shampoo From Home" ? "#ECFDF5" : "#F3F4F6",
                          color: row.bathType === "Loading…" ? "#9CA3AF" : row.bathType === "Premium" ? "#1D4ED8" : row.bathType.includes("Hypoallergenic") ? "#D97706" : row.bathType === "Medicated" ? "#DC2626" : row.bathType === "Whitening" ? "#7C3AED" : row.bathType === "Shampoo From Home" ? "#059669" : "#6B7280",
                        }}>
                          {row.bathType}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", color: C.textSec, fontSize: 12 }}>{row.coTime}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <button onClick={() => toggleBath(row.resId)} style={{
                          width: 28, height: 28, borderRadius: 8,
                          border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                          background: row.isDone ? "#10B981" : "transparent",
                          cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: row.isDone ? "#fff" : "transparent",
                          fontSize: 14, fontWeight: 700, transition: "all 0.15s",
                        }}>
                          {row.isDone ? "✓" : ""}
                        </button>
                        {row.isDone && row.completedInfo && (
                          <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                            {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ─── Pamper Package Plus Report ─────────────────────────────────────────────
  const [pamperCompleted, setPamperCompleted] = useState({});

  useEffect(() => {
    if (sub !== "pamper" || !profile?.location_id) return;
    const entryId = `ops_pamper_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setPamperCompleted(rows[0].setting_value);
        } else {
          setPamperCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  const savePamperCompleted = async (newCompleted) => {
    setPamperCompleted(newCompleted);
    if (!profile?.location_id) return;
    const entryId = `ops_pamper_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderPamper = () => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const inHouse = reservations.filter(r =>
      r.type === "boarding" && (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );

    const pamperRows = [];
    const seenDogs = new Set();
    inHouse.forEach(res => {
      if (seenDogs.has(res.dogId)) return;
      const isLuxurySuite = res._resTypeId == 5 || (res._resTypeName || "").toLowerCase().includes("luxury suite");
      const hasPPAddon = hasSvcIncludes(res._services, "pamper");

      if (!isLuxurySuite && !hasPPAddon) return;
      seenDogs.add(res.dogId);

      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || res.room : "—";
      const ownerName = res._ownerName || "Unknown";
      const source = isLuxurySuite ? (hasPPAddon ? "Luxury Suite + Add-On" : "Luxury Suite") : "Add-On";
      const completedInfo = pamperCompleted[res.id];
      const isDone = !!completedInfo;
      pamperRows.push({ resId: res.id, dogName, roomNum, ownerName, source, isDone, completedInfo });
    });
    pamperRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    // Group by room for display
    const roomGroups = {};
    pamperRows.forEach(row => {
      if (!roomGroups[row.roomNum]) roomGroups[row.roomNum] = [];
      roomGroups[row.roomNum].push(row);
    });

    const totalPamper = pamperRows.length;
    const donePamper = pamperRows.filter(r => r.isDone).length;

    const togglePamper = (resId) => {
      const newCompleted = { ...pamperCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      savePamperCompleted(newCompleted);
    };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Pamper Package Plus</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{donePamper}/{totalPamper} complete</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>Luxury Suite dogs (automatic) + Pamper Package add-on dogs</div>
          {totalPamper > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${totalPamper > 0 ? Math.round((donePamper / totalPamper) * 100) : 0}%`, height: "100%", borderRadius: 3, background: donePamper === totalPamper ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {totalPamper === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut }}>No Pamper Package dogs for today</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>DOG</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>ROOM</th>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>OWNER</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>SOURCE</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>COMPLETED</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(roomGroups).map(([roomNum, groupRows], gi) => (
                    groupRows.map((row, ri) => (
                      <tr key={row.resId} style={{
                        borderBottom: (gi < Object.keys(roomGroups).length - 1 || ri < groupRows.length - 1) ? `1px solid ${C.borderLight}` : "none",
                        background: row.isDone ? "#F0FDF4" : "transparent",
                        transition: "background 0.2s",
                      }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>{row.dogName}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri }}>
                          {ri === 0 ? roomNum : ""}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.textSec }}>{row.ownerName}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: row.source.includes("Luxury") ? "#EDE9FE" : "#DBEAFE",
                            color: row.source.includes("Luxury") ? "#7C3AED" : "#1D4ED8",
                          }}>
                            {row.source}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <button onClick={() => togglePamper(row.resId)} style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                            background: row.isDone ? "#10B981" : "transparent",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: row.isDone ? "#fff" : "transparent",
                            fontSize: 14, fontWeight: 700, transition: "all 0.15s",
                          }}>
                            {row.isDone ? "✓" : ""}
                          </button>
                          {row.isDone && row.completedInfo && (
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                              {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ─── Generic Service Report ─────────────────────────────────────────────────
  const [genericSvcCompleted, setGenericSvcCompleted] = useState({});
  const svcName = typeof params === "object" ? params.svcName : null;

  useEffect(() => {
    if (!sub?.startsWith?.("svc") || !svcName || !profile?.location_id) return;
    const entryId = `ops_svc_${svcName.replace(/[^a-zA-Z0-9]/g, "_")}_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setGenericSvcCompleted(rows[0].setting_value);
        } else {
          setGenericSvcCompleted({});
        }
      });
  }, [sub, svcName, viewDate, profile?.location_id]);

  const saveGenericSvcCompleted = async (newCompleted) => {
    setGenericSvcCompleted(newCompleted);
    if (!profile?.location_id || !svcName) return;
    const entryId = `ops_svc_${svcName.replace(/[^a-zA-Z0-9]/g, "_")}_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderGenericService = () => {
    if (!svcName) return <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown service</div></Card>;

    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const inHouse = reservations.filter(r =>
      (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );
    const svcRows = [];
    inHouse.forEach(res => {
      const names = getSvcNames(res._services);
      const matchCount = names.filter(n => n === svcName).length;
      if (matchCount === 0) return;

      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || res.room : "—";
      const ownerName = res._ownerName || "Unknown";
      const completedInfo = genericSvcCompleted[res.id];
      const isDone = !!completedInfo;
      svcRows.push({ resId: res.id, dogName, roomNum, ownerName, isDone, completedInfo, matchCount, resType: res.type });
    });
    svcRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    const total = svcRows.length;
    const done = svcRows.filter(r => r.isDone).length;

    const toggleSvc = (resId) => {
      const newCompleted = { ...genericSvcCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveGenericSvcCompleted(newCompleted);
    };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{svcName}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{done}/{total} complete</span>
          </div>
          {total > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`, height: "100%", borderRadius: 3, background: done === total ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {total === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut }}>No dogs with {svcName} today</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>DOG</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>ROOM</th>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>OWNER</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>QTY</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>COMPLETED</th>
                  </tr>
                </thead>
                <tbody>
                  {svcRows.map((row, i) => (
                    <tr key={row.resId} style={{
                      borderBottom: i < svcRows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      background: row.isDone ? "#F0FDF4" : "transparent",
                      transition: "background 0.2s",
                    }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>
                        {row.dogName}
                        {row.resType === "daycare" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEF3C7", color: "#D97706" }}>DC</span>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri }}>{row.roomNum}</td>
                      <td style={{ padding: "12px 14px", color: C.textSec }}>{row.ownerName}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.text }}>{row.matchCount > 1 ? `×${row.matchCount}` : "—"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <button onClick={() => toggleSvc(row.resId)} style={{
                          width: 28, height: 28, borderRadius: 8,
                          border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                          background: row.isDone ? "#10B981" : "transparent",
                          cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: row.isDone ? "#fff" : "transparent",
                          fontSize: 14, fontWeight: 700, transition: "all 0.15s",
                        }}>
                          {row.isDone ? "✓" : ""}
                        </button>
                        {row.isDone && row.completedInfo && (
                          <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                            {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("ops-hub")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>← Operations</button>
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
        : sub === "pictures" ? renderPictures()
        : sub === "pp" ? renderPP()
        : sub === "bathing" ? renderBathing()
        : sub === "pamper" ? renderPamper()
        : sub === "svc" ? renderGenericService()
        : <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown checklist type</div></Card>}
      {dirty && !isLocked && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", marginTop: 20 }}>
        <Btn onClick={saveEntry} style={{ padding: "10px 40px", fontSize: 14 }}>Save Changes</Btn>
      </div>}

      {/* Template Editor Modal */}
      {showTemplateEditor && editTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "24px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Customize {meta.title}</h2>
              <button onClick={() => setShowTemplateEditor(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0, fontSize: 16 }}>{"✕"}</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>Add, remove, reorder tasks. Changes affect all future checklists for this location.</p>
            {customTemplate && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#DBEAFE", marginBottom: 12, fontSize: 12, color: "#1D4ED8", fontWeight: 600 }}>CUSTOMIZED — this checklist has been modified from the default template.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {editTemplate.map((task, idx) => (
                <div key={task.id || idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.bg, border: `1.5px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.textMut, fontWeight: 700, minWidth: 24 }}>{idx + 1}</span>
                  <input value={task.label} onChange={e => updateTemplateSec(idx, "label", e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }} />
                  {meta.showTime && <input value={task.time || ""} onChange={e => updateTemplateSec(idx, "time", e.target.value)} placeholder="HH:MM" style={{ width: 70, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit", textAlign: "center" }} />}
                  <button onClick={() => moveTemplateSec(idx, -1)} disabled={idx === 0} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>{"↑"}</button>
                  <button onClick={() => moveTemplateSec(idx, 1)} disabled={idx === editTemplate.length - 1} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === editTemplate.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editTemplate.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editTemplate.length - 1 ? 0.4 : 1 }}>{"↓"}</button>
                  <button onClick={() => removeTemplateSec(idx)} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{"✕"}</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={addTemplateSec}>+ Add Task</Btn>
              <div style={{ flex: 1 }} />
              <button onClick={resetTemplateToDefault} disabled={templateSaving} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset to Default</button>
              <Btn onClick={saveTemplateToDb} disabled={!templateDirty || templateSaving}>{templateSaving ? "Saving…" : "Save Template"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client Detail Page ────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// DOG DETAIL PAGE
// ════════════════════════════════════════════════════════════════════════════
function DogDetailPage({ data, clientId, dogId, nav }) {
  const client = data.clients.find(c => c.id === clientId);
  const dog = data.dogs.find(d => d.id === dogId);
  if (!dog || !client) return <div style={{ padding: 40, textAlign: "center", color: C.textSec }}>Dog not found</div>;
  const df = dog.fields || {}; // safe access to dog fields

  const allReservations = (data.reservations || []).filter(r => r.dogId === dogId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const activeRes = allReservations.filter(r => r.status === "checked-in" || r.status === "upcoming");
  const pastRes = allReservations.filter(r => r.status === "checked-out" || r.status === "completed" || r.status === "no-show");
  const today = todayStr();

  // Build service list from all active reservations
  const activeServices = [];
  activeRes.forEach(r => {
    const svcs = r._services;
    if (!svcs) return;
    const arr = Array.isArray(svcs) ? svcs : [];
    arr.forEach(s => {
      const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
      if (name && !activeServices.includes(name)) activeServices.push(name);
    });
  });

  const labelStyle = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 };
  const valStyle = { fontSize: 14, fontWeight: 600, color: C.text };
  const sectionTitle = { fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 10px" };

  // Gender label
  const genderLabel = dog._gender === "male" ? "Male" : dog._gender === "female" ? "Female" : dog._gender || "";
  const fixedLabel = df.spayed_neutered ? (dog._gender === "male" ? "Neutered" : "Spayed") : "Intact";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Back button */}
      <button onClick={() => nav("client-detail", { clientId })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16, fontFamily: "inherit" }}>
        ← Back to {client.fields.first_name} {client.fields.last_name}
      </button>

      {/* Hero Card */}
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          {/* Dog Avatar */}
          {dog._image ? (
            <img src={dog._image} alt={dog.fields.name} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", border: `2px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 16, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: C.pri }}>
              {(dog.fields.name || "?")[0]}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>{dog.fields.name}</h2>
              {dog._vip && <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>VIP</span>}
              {dog._banned && <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, background: C.danLt, color: C.dan, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>BANNED</span>}
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginTop: 4 }}>
              {dog.fields.breed}{dog.fields.weight ? ` · ${dog.fields.weight} lbs` : ""}{genderLabel ? ` · ${genderLabel}` : ""}{dog.fields.age ? ` · ${dog.fields.age} yrs` : ""} · {fixedLabel}
            </div>
            {/* Tags: active services as pills */}
            {activeServices.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {activeServices.map(svc => (
                  <span key={svc} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 6, background: C.priLt, color: C.pri, fontSize: 11, fontWeight: 600 }}>{svc}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Immunization notice */}
        {dog._nextImm && typeof dog._nextImm === "string" && (() => {
          const immDate = dog._nextImm.split("T")[0];
          const isExpired = immDate < today;
          const isSoon = !isExpired && immDate <= (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })();
          if (!isExpired && !isSoon) return null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: isExpired ? C.danLt : "#FEF3C7", border: `1px solid ${isExpired ? C.dan + "30" : "#F59E0B30"}`, marginTop: 16 }}>
              <span style={{ fontSize: 16 }}>{isExpired ? "⚠️" : "📋"}</span>
              <div style={{ fontSize: 13, color: isExpired ? C.dan : "#92400E", fontWeight: 600 }}>
                {isExpired ? "Immunizations expired" : "Immunizations expiring soon"} — next expiration: {immDate}
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Detail Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Notes Card */}
        {(dog._notes || dog._allergies || dog._medicines || dog._groomingNotes) && (
          <Card style={{ padding: "18px 22px", gridColumn: dog._notes && dog._notes.length > 100 ? "1 / -1" : undefined }}>
            <div style={sectionTitle}>Notes & Care</div>
            {dog._notes && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>General Notes</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{dog._notes}</div>
              </div>
            )}
            {dog._allergies && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Allergies</div>
                <div style={{ fontSize: 13, color: C.dan, fontWeight: 600 }}>{dog._allergies}</div>
              </div>
            )}
            {dog._medicines && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Medications</div>
                <div style={{ fontSize: 13, color: C.text }}>{dog._medicines}</div>
              </div>
            )}
            {dog._groomingNotes && (
              <div>
                <div style={labelStyle}>Grooming Notes</div>
                <div style={{ fontSize: 13, color: C.text }}>{dog._groomingNotes}</div>
              </div>
            )}
          </Card>
        )}

        {/* Owner Card */}
        <Card style={{ padding: "18px 22px" }}>
          <div style={sectionTitle}>Owner</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: C.pri }}>
              {(client.fields.first_name || "?")[0]}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, cursor: "pointer" }} onClick={() => nav("client-detail", { clientId })}>
                {client.fields.first_name} {client.fields.last_name}
              </div>
              {client.fields.phone && <div style={{ fontSize: 12, color: C.textSec }}>{client.fields.phone}</div>}
              {client.fields.email && <div style={{ fontSize: 12, color: C.textSec }}>{client.fields.email}</div>}
            </div>
          </div>
        </Card>
      </div>

      {/* Active Reservations */}
      {activeRes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={sectionTitle}>Active Reservations</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeRes.map(r => {
              const svcs = r._services;
              const svcNames = svcs ? (Array.isArray(svcs) ? svcs : []).map(s => typeof s === "string" ? s : (s && s.name ? s.name : "")).filter(Boolean) : [];
              return (
                <Card key={r.id} style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r._resTypeName || titleCase(r.type)}</span>
                        <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: r.status === "checked-in" ? C.sucLt : C.priLt, color: r.status === "checked-in" ? C.suc : C.pri, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{r.status}</span>
                        {r.room && <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: C.accLt, color: C.acc, fontSize: 10, fontWeight: 700 }}>Room {(r.room.match(/(\d+)/) || [])[1] || r.room}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec }}>{r.checkIn} → {r.checkOut}{r.pricing?.total ? ` · $${r.pricing.total.toFixed(2)}` : ""}</div>
                    </div>
                    {svcNames.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {svcNames.slice(0, 5).map(s => <span key={s} style={{ padding: "2px 8px", borderRadius: 5, background: C.surfaceHover, fontSize: 10, color: C.textSec, fontWeight: 600 }}>{s}</span>)}
                        {svcNames.length > 5 && <span style={{ fontSize: 10, color: C.textMut }}>+{svcNames.length - 5}</span>}
                      </div>
                    )}
                  </div>
                  {r._notes && <div style={{ fontSize: 12, color: C.acc, marginTop: 6, fontStyle: "italic" }}>Note: {r._notes}</div>}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Reservations */}
      {pastRes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={sectionTitle}>Reservation History ({pastRes.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pastRes.slice(0, 20).map(r => (
              <Card key={r.id} style={{ padding: "10px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textSec }}>{r._resTypeName || titleCase(r.type)}</span>
                    <span style={{ fontSize: 11, color: C.textMut }}>{r.checkIn} → {r.checkOut}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {r.pricing?.total > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>${r.pricing.total.toFixed(2)}</span>}
                    <span style={{ display: "inline-flex", padding: "2px 6px", borderRadius: 4, background: r.status === "checked-out" ? C.surfaceHover : C.danLt, color: r.status === "checked-out" ? C.textMut : C.dan, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{r.status}</span>
                  </div>
                </div>
              </Card>
            ))}
            {pastRes.length > 20 && <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 8 }}>+ {pastRes.length - 20} older reservations</div>}
          </div>
        </div>
      )}

      {activeRes.length === 0 && pastRes.length === 0 && (
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.textSec }}>No reservations found for {dog.fields.name}</div>
        </Card>
      )}
    </div>
  );
}


function ClientDetailPage({ data, save, clientId, nav, profile, openReservationId, addGlobalToast }) {
  const client = data.clients.find(c=>c.id===clientId);
  const dogs = data.dogs.filter(d=>d.clientId===clientId);
  const reservations = data.reservations.filter(r=>r.clientId===clientId).sort((a,b)=>b.checkIn.localeCompare(a.checkIn));
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editRecurringDiscountId, setEditRecurringDiscountId] = useState(null);
  const [inlineFields, setInlineFields] = useState(() => ({...client.fields}));
  const [inlineRecurringDiscountId, setInlineRecurringDiscountId] = useState(client.recurringDiscountId || null);
  const [inlineDirty, setInlineDirty] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  useEffect(() => {
    if (!inlineDirty) {
      setInlineFields({...client.fields});
      setInlineRecurringDiscountId(client.recurringDiscountId || null);
    }
  }, [client.fields, client.recurringDiscountId]);
  const updateInlineField = (fid, val) => { setInlineFields(prev => ({...prev, [fid]: val})); setInlineDirty(true); };
  const saveInlineEdit = async () => {
    setInlineSaving(true);
    const diffs = [];
    (data.clientFields||[]).forEach(f => {
      const oldVal = client.fields[f.id] || "";
      const newVal = inlineFields[f.id] || "";
      if (oldVal !== newVal) diffs.push({ field: f.name, oldVal: oldVal || "(empty)", newVal: newVal || "(empty)" });
    });
    if ((client.recurringDiscountId || null) !== (inlineRecurringDiscountId || null)) {
      const oldDisc = (data.discounts || []).find(d => d.id === client.recurringDiscountId);
      const newDisc = (data.discounts || []).find(d => d.id === inlineRecurringDiscountId);
      diffs.push({ field: "Recurring Discount", oldVal: oldDisc ? oldDisc.name : "None", newVal: newDisc ? newDisc.name : "None" });
    }
    const auditEntries = diffs.length > 0 ? [{
      id: gid(), tableName: 'k9_clients', recordId: clientId, reservationId: clientId,
      timestamp: new Date().toISOString(),
      userName: profile ? (profile.full_name || profile.email || "Staff") : "System",
      changedBy: profile ? (profile.full_name || profile.email || "Staff") : "System",
      action: "Updated Client Profile", details: diffs,
    }] : [];
    await save({
      ...data,
      clients: data.clients.map(c => c.id === clientId ? { ...c, fields: inlineFields, recurringDiscountId: inlineRecurringDiscountId || null } : c),
      auditLog: [...(data.auditLog || []), ...auditEntries],
    });
    setInlineDirty(false);
    setInlineSaving(false);
  };
  const cancelInlineEdit = () => { setInlineFields({...client.fields}); setInlineRecurringDiscountId(client.recurringDiscountId || null); setInlineDirty(false); };
  const [activeTab, setActiveTab] = useState("dogs");
  const [resSubTab, setResSubTab] = useState("upcoming");
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [textNotify, setTextNotify] = useState(null);
  const [vetSearch, setVetSearch] = useState("");
  const [vetDropOpen, setVetDropOpen] = useState(false);
  const vetDropRef = useRef(null);
  useEffect(() => {
    if (!vetDropOpen) return;
    const handler = (e) => { if (vetDropRef.current && !vetDropRef.current.contains(e.target)) setVetDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [vetDropOpen]);

  if (!client) return <div style={{padding:40,textAlign:"center",color:C.textSec}}>Client not found</div>;

  const startEdit = () => { setEditFields({...client.fields}); setEditRecurringDiscountId(client.recurringDiscountId || null); setEditing(true); };
  const saveEdit = async () => { await save({...data,clients:data.clients.map(c=>c.id===clientId?{...c,fields:editFields,recurringDiscountId:editRecurringDiscountId||null}:c)}); setEditing(false); };

  const showTextNotifyToast = (client, dog, diffs) => {
    const clientName = `${client?.fields?.first_name || ""} ${client?.fields?.last_name || ""}`.trim() || "Client";
    const dogName = dog?.fields?.name || "your dog";
    const phone = client?.fields?.phone || "";
    const changeLines = diffs.map(d => `${d.field}: ${d.oldVal} → ${d.newVal}`).join("\n");
    const msg = `Hi ${clientName.split(" ")[0]}, this is K9 Resorts! We've updated ${dogName}'s reservation:\n${changeLines}\nPlease let us know if you have any questions!`;
    setTextNotify({ clientName, clientPhone: phone, dogName, diffs, message: msg, showPreview: false, sending: false });
  };
  const sendTextNotify = async () => {
    if (!textNotify) return;
    setTextNotify(prev => ({ ...prev, sending: true }));
    const newMsg = { id: gid(), type: "outbound", channel: "sms", to: textNotify.clientPhone, toName: textNotify.clientName, body: textNotify.message, sentAt: new Date().toISOString(), sentBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff", status: "sent" };
    await save({ ...data, messages: [...(data.messages || []), newMsg] });
    setTextNotify(null);
  };

  const sendAgreementLink = async (agrId) => {
    console.log("sendAgreementLink (no-op):", agrId);
  };

  const markAgreementSigned = async (agrId) => {
    const agrs = { ...(client.agreements || {}) };
    agrs[agrId] = { signed: true, date: todayStr(), status: 'signed' };
    await save({...data, clients: data.clients.map(c => c.id === clientId ? { ...c, agreements: agrs } : c)});
  };

  const [boardingPreviewId, setBoardingPreviewId] = useState(openReservationId || null);
  const [earlyCheckInModal, setEarlyCheckInModal] = useState(null);

  const handleCheckIn = async (rid) => {
    console.log("handleCheckIn (no-op):", rid);
  };
  const handleCheckOut = async (rid) => {
    console.log("handleCheckOut (no-op):", rid);
  };

  const reactivateReservation = async (rid) => {
    console.log("reactivateReservation (no-op):", rid);
  };

  const dn=(did)=>{const d=data.dogs.find(x=>x.id===did);return d?d.fields.name:"Unknown";};
  const tl=(t)=>t==="boarding"?"Boarding":t==="dayboarding"?"Day Board":t==="daycare"?"Daycare":t==="evaluation"?"Evaluation":"Tour";
  const sc=(s)=>s==="checked-in"?"success":s==="upcoming"?"info":"default";
  const isFieldRequired = () => false;

  // Stats calculations
  const stats = useMemo(() => {
    const pmts = (data.payments || []).filter(p => p.clientId === clientId);
    const totalSpent = pmts.filter(p => p.status === "completed" && p.type !== "refund").reduce((s, p) => s + p.amount, 0);
    const sorted = [...reservations].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const lastRes = sorted.find(r => r.checkIn <= todayStr());
    let daysSince = null;
    if (lastRes) {
      const lastDate = new Date(lastRes.checkIn + "T00:00:00");
      const now = new Date(); now.setHours(0,0,0,0);
      daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }
    return { totalSpent, totalRes: reservations.length, daysSince };
  }, [reservations, data.payments, clientId]);

  // Notes data
  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const entry = { id: gid(), text: newNote.trim(), timestamp: new Date().toISOString(), addedBy: profile?.full_name || profile?.email || "Staff" };
    const updated = { ...client, clientNotes: [...(client.clientNotes || []), entry] };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
    setNewNote("");
    setNoteSaving(false);
  };
  const handleDeleteNote = async (noteId) => {
    const updated = { ...client, clientNotes: (client.clientNotes || []).filter(n => n.id !== noteId) };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
  };

  // EOD mentions
  const dogIds = dogs.map(d => d.id);
  const eodMentions = useMemo(() => (data.eodEntries || []).flatMap(e => (e.mentions || []).filter(m => (m.entityType === "client" && m.entityId === clientId) || (m.entityType === "dog" && dogIds.includes(m.entityId))).map(m => ({ ...m, date: e.date, eodId: e.id, sections: e.sections }))).sort((a, b) => b.date.localeCompare(a.date)), [data.eodEntries, clientId, dogIds.join(",")]);

  // Payments
  const pmts = useMemo(() => (data.payments || []).filter(p => p.clientId === clientId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [data.payments, clientId]);
  const statusClr = { completed: C.suc, pending: "#f59e0b", refunded: C.dan, failed: C.dan };
  const typeClr = { payment: C.pri, deposit: "#0ea5e9", tip: "#ec4899", refund: C.dan };

  // Reservation subtabs
  const upcomingRes = reservations.filter(r => r.status === "upcoming");
  const currentRes = reservations.filter(r => r.status === "checked-in");
  const pastRes = reservations.filter(r => r.status === "checked-out");
  const cancelledRes = reservations.filter(r => r.status === "cancelled");

  // Tab config
  const clientNotes = client.clientNotes || [];
  const notesCount = clientNotes.length + eodMentions.length;
  const clientSalesForCount = (data.packageSales || []).filter(s => s.clientId === clientId);
  const activePkgCount = clientSalesForCount.filter(s => (s.quantity || 0) - (s.used || 0) > 0).length;
  const tabs = [
    { id: "dogs", label: "Dogs", count: dogs.length, color: C.pri },
    { id: "reservations", label: "Reservations", count: reservations.length, color: C.acc },
    { id: "payments", label: "Payments", count: pmts.length, color: C.info },
    { id: "packages", label: "Packages", count: activePkgCount, color: "#EC4899" },
    { id: "lifecycle", label: "Lifecycle", count: (() => { const le = (client.lifecycleEvents || []).length; const cu = (client.lifecycle?.conversion?.updates || []).length; const ru = (client.lifecycle?.retention?.updates || []).length; return le + cu + ru; })(), color: "#8B5CF6" },
    { id: "notes", label: "Notes", count: notesCount, color: "#F59E0B" },
    { id: "history", label: "History", count: ((data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId)).length, color: "#6B7280" },
  ];

  // Reservation card renderer
  const renderResCard = (res) => (
    <Card key={res.id} style={{padding:"12px 18px",cursor:(res.type==="boarding"||res.type==="dayboarding")?"pointer":"default"}} onClick={()=>{if(res.type==="boarding"||res.type==="dayboarding")setBoardingPreviewId(res.id);}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:700,color:C.pri}}>{dn(res.dogId)}</span>
            <Badge color={tl(res.type)==="Tour"?"accent":tl(res.type)==="Daycare"?"success":tl(res.type)==="Evaluation"?"warning":"primary"} size="sm">{tl(res.type)}</Badge>
            {res.roomType && <Badge color="default" size="sm">{res.roomType}</Badge>}
            {res.type==="evaluation" && res.evalResult && res.evalResult !== "pending" && <Badge color={res.evalResult==="passed_group"?"success":"info"} size="sm">{res.evalResult==="passed_group"?"Passed Group":"Passed Private"}</Badge>}
          </div>
          <div style={{fontSize:13,color:C.textSec,marginTop:4}}>{fmtDate(res.checkIn)}{res.type!=="tour"&&res.type!=="evaluation"&&res.checkIn!==res.checkOut?` \u2192 ${fmtDate(res.checkOut)}`:""}{res.notes?` \u00B7 ${res.notes}`:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,minWidth:90}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>IN</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkInTime)}</span></div>
            {res.actualCheckInTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>OUT</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkOutTime)}</span></div>
            {res.actualCheckOutTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckOutTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {res.status==="upcoming"&&<Btn size="sm" variant="success" onClick={e=>{e.stopPropagation();handleCheckIn(res.id);}} icon={<I.LogIn/>}>Check In</Btn>}
          {res.status==="checked-in"&&<Btn size="sm" variant="accent" onClick={e=>{e.stopPropagation();handleCheckOut(res.id);}} icon={<I.LogOut/>}>Check Out</Btn>}
          {res.status==="cancelled"&&<Btn size="sm" variant="primary" onClick={e=>{e.stopPropagation();reactivateReservation(res.id);}} icon={<I.RefreshCw/>}>Re-activate</Btn>}
        </div>
      </div>
      {res.status==="cancelled"&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:C.dan+"08",border:`1px solid ${C.dan}20`}}>
        <div style={{fontSize:11,color:C.dan,fontWeight:700}}>Cancelled {res.cancelledAt ? new Date(res.cancelledAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""}</div>
        <div style={{fontSize:11,color:C.textSec,marginTop:2}}>{res.cancelledBy==="System (Auto)"?"Auto-cancelled — check-in date lapsed":`Cancelled by ${res.cancelledBy||"Unknown"}`}{res.cancelReason&&res.cancelledBy!=="System (Auto)"?` · ${res.cancelReason}`:""}</div>
      </div>}
    </Card>
  );

  return (
    <div>
      {/* Header */}
      <Card style={{marginBottom:16,padding:"24px 28px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <h2 style={{margin:0,fontSize:22,fontWeight:800,color:C.text}}>{client.fields.first_name} {client.fields.last_name}</h2>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,fontSize:14,color:C.textSec}}><I.Phone/><span>{fmtPhone(client.fields.phone)}</span>{client.fields.email&&<span>&middot; {client.fields.email}</span>}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={() => { if (addGlobalToast) addGlobalToast({ message: "Push to Gingr coming soon — requires Gingr API connection" }); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid #F59E0B`, background: "#FEF3C7", color: "#92400E", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              ↗ Push to Gingr
            </button>
            <Btn variant="primary" onClick={()=>nav("new-reservation",{clientId})} icon={<I.Plus/>} size="sm">New</Btn>
            <Btn variant="ghost" onClick={()=>nav("messages")} icon={<I.MessageSquare/>} size="sm">Message</Btn>
          </div>
        </div>

        {/* Inline Editable Client Fields */}
        <div style={{ padding: "14px 18px", background: C.bg, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Client Information</div>
            {inlineDirty && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" size="sm" onClick={cancelInlineEdit}>Cancel</Btn>
                <Btn variant="primary" size="sm" onClick={saveInlineEdit} disabled={inlineSaving}>{inlineSaving ? "Saving..." : "Save Changes"}</Btn>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(data.clientFields||[]).filter(f => f.type !== "textarea").map(f => (
              <div key={f.id} style={f.type === "checkbox" ? { display: "flex", alignItems: "end" } : {}}>
                <Inp label={f.name} type={f.type} value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} required={isFieldRequired(f, "create")} options={f.options} />
              </div>
            ))}
            {(() => {
              const recurringDiscounts = (data.discounts || []).filter(d => d.discountKind === "recurring" && d.active !== false);
              return recurringDiscounts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Recurring Discount</label>
                  <select value={inlineRecurringDiscountId || ""} onChange={e => { setInlineRecurringDiscountId(e.target.value || null); setInlineDirty(true); }} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, cursor: "pointer" }}>
                    <option value="">None</option>
                    {recurringDiscounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type === "percentage" ? `${d.value}%` : `$${d.value}`} off)</option>)}
                  </select>
                </div>
              ) : null;
            })()}
          </div>
          {(data.clientFields||[]).filter(f => f.type === "textarea").map(f => (
            <div key={f.id} style={{ marginTop: 12 }}>
              <Inp label={f.name} type="textarea" value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} />
            </div>
          ))}
        </div>

        {/* Agreement Status Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Agreement Status</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(data.agreements || []).map(agr => {
              const raw = client.agreements && client.agreements[agr.id];
              const isSigned = raw && (raw === true || raw.signed === true);
              const isPending = raw && !isSigned && (raw.status === 'sent' || raw.status === 'pending');
              const dateFmt = raw && raw.date ? new Date(raw.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : null;
              const sentFmt = raw && raw.sentAt ? new Date(raw.sentAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" }) : null;
              const sentByName = raw?.sentBy || null;

              if (isSigned) {
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: C.sucLt, border: `1.5px solid #A7F3D0` }}>
                    <span style={{ color: C.suc }}><I.CheckCircle /></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>{agr.name}</span>
                    {dateFmt && <span style={{ fontSize: 11, color: C.textMut }}>Signed {dateFmt}</span>}
                  </div>
                );
              } else if (isPending) {
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEF3C7", border: "1.5px solid #F59E0B40", cursor: "pointer" }}
                    onClick={() => sendAgreementLink(agr.id)} title="Click to resend">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>{agr.name}</span>
                    <span style={{ fontSize: 11, color: "#78350F" }}>Pending</span>
                    {sentFmt && <span style={{ fontSize: 10, color: "#B45309" }}>sent {sentFmt}{sentByName ? ` by ${sentByName}` : ''}</span>}
                  </div>
                );
              } else {
                return (
                  <button key={agr.id} onClick={() => sendAgreementLink(agr.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEE2E2", border: "1.5px solid #EF444440", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FECACA"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#FEE2E2"; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Send {agr.name}</span>
                  </button>
                );
              }
            })}
          </div>
        </div>

        {/* Preferred Veterinarian Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Preferred Veterinarian</div>
          <div ref={vetDropRef} style={{ position: "relative" }}>
            <input
              type="text"
              value={vetSearch}
              onChange={(e) => setVetSearch(e.target.value)}
              onFocus={() => setVetDropOpen(true)}
              placeholder="Search veterinarians..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            {vetDropOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 8, zIndex: 10, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {(() => {
                  const filtered = (data.vets || []).filter(v => v.isActive !== false && (v.vetName || '').toLowerCase().includes(vetSearch.toLowerCase()));
                  return (
                    <div>
                      {filtered.map(vet => (
                        <div
                          key={vet.id}
                          onClick={async () => {
                            await save({ ...data, clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: vet.id } : c) });
                            setVetSearch("");
                            setVetDropOpen(false);
                          }}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = C.priLt}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{vet.vetName}</div>
                          {vet.clinicName && <div style={{ fontSize: 12, color: C.textSec }}>{vet.clinicName}</div>}
                          {vet.phone && <div style={{ fontSize: 11, color: C.textMut }}>{vet.phone}</div>}
                        </div>
                      ))}
                      {filtered.length === 0 && <div style={{ padding: "10px 12px", color: C.textMut, fontSize: 13 }}>No vets found</div>}
                      <div
                        onClick={async () => {
                          const name = vetSearch.trim();
                          if (!name) return;
                          const newVet = { id: crypto.randomUUID(), vetName: name, clinicName: '', phone: '', email: '', notes: '', isActive: true };
                          await save({ ...data, vets: [...(data.vets || []), newVet], clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: newVet.id } : c) });
                          setVetSearch("");
                          setVetDropOpen(false);
                        }}
                        style={{ padding: "10px 12px", cursor: "pointer", borderTop: `1.5px solid ${C.border}`, background: C.priLt, transition: "background 0.1s", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = C.pri + "20"}
                        onMouseLeave={(e) => e.currentTarget.style.background = C.priLt}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>{vetSearch.trim() ? `Add "${vetSearch.trim()}" as new vet` : "Add New Vet"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          {client.preferredVetId && (() => {
            const vet = (data.vets || []).find(v => v.id === client.preferredVetId);
            return vet ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.priLt, borderRadius: 6, border: `1px solid ${C.pri}20` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.pri }}>{vet.vetName}</div>
                {vet.clinicName && <div style={{ fontSize: 11, color: C.text }}>{vet.clinicName}</div>}
              </div>
            ) : null;
          })()}
        </div>
      </Card>

      {/* Stats Bar */}
      <Card style={{marginBottom:16,padding:"16px 24px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            { label: "Referral Source", value: client.fields.referral_source || "Not set", color: client.fields.referral_source ? C.text : C.textMut },
            { label: "Client Since", value: (() => { const firstRes = reservations.length > 0 ? reservations[reservations.length - 1] : null; return firstRes ? fmtDate(firstRes.checkIn) : "N/A"; })(), color: C.text },
            { label: "Total Spent", value: `$${stats.totalSpent.toFixed(2)}`, color: C.suc },
            { label: "Total Reservations", value: String(stats.totalRes), color: C.pri },
            { label: "Days Since Last Visit", value: stats.daysSince === null ? "N/A" : stats.daysSince === 0 ? "Today" : `${stats.daysSince} days`, color: stats.daysSince !== null && stats.daysSince <= 7 ? C.suc : stats.daysSince !== null && stats.daysSince <= 30 ? C.warn : C.textSec },
          ].map(st => (
            <div key={st.label} style={{flex:"1 1 140px",padding:"10px 14px",background:C.bg,borderRadius:10,textAlign:"center",minWidth:120}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{st.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:st.color}}>{st.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: `2px solid ${C.borderLight}`, background: C.bg, borderRadius: "12px 12px 0 0", marginBottom: 0 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", border: "none", borderBottom: `3px solid ${active ? tab.color : "transparent"}`, background: active ? C.surface : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", marginBottom: -2 }}>
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec }}>{tab.label}</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, padding: "0 8px", borderRadius: 12, fontSize: 13, fontWeight: 800, background: active ? tab.color : C.surfaceHover, color: active ? "#fff" : C.textSec, transition: "all 0.15s" }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{marginTop:16}}>

        {/* ──── DOGS TAB ──── */}
        {activeTab === "dogs" && (
        <div>
          {dogs.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No dogs yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {dogs.map(dog => (
                <Card key={dog.id} style={{ padding: "16px 20px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                  onClick={() => nav("dog-detail", { clientId, dogId: dog.id })}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${C.pri}30`}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                      {dog._image ? (
                        <img src={dog._image} alt={dog.fields?.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `2px solid ${C.border}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: C.pri, flexShrink: 0 }}>
                          {(dog.fields?.name || "?")[0]}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{dog.fields?.name || "Unknown Dog"}</div>
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{dog.fields?.breed || "Breed unknown"} {dog.fields?.weight ? `• ${dog.fields.weight} lbs` : ""}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.pri, fontWeight: 600, flexShrink: 0 }}>
                      View <I.ChevronRight />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reservations Tab */}
      {activeTab === "reservations" && (
        <div>
          {reservations.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No reservations yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reservations.map(res => (
                <Card key={res.id} style={{ padding: "12px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{res.roomType || "Standard"}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{fmtDateFull(res.checkIn)} to {fmtDateFull(res.checkOut)}</div>
                    </div>
                    <Badge color={res.status === "checked-in" ? "success" : res.status === "upcoming" ? "info" : "default"}>{titleCase(res.status || "upcoming")}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Payment History</h3>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>Total: ${stats.totalSpent.toFixed(2)}</span>
          </div>
          {pmts.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No payments yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pmts.map(p => (
                <Card key={p.id} style={{ padding: "10px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: C.info + "18", color: C.info }}>{p.type}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>${p.amount?.toFixed(2) || "0.00"}</span>
                    <span style={{ fontSize: 12, color: C.textMut }}>{p.method || "Unknown"}</span>
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: "auto" }}>{fmtDate(p.timestamp)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages Tab */}
      {activeTab === "packages" && (
        <Card style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 14, color: C.textSec }}>Package management coming soon</div>
        </Card>
      )}

      {/* Lifecycle Tab */}
      {activeTab === "lifecycle" && (
        <div>
          {(client.lifecycleEvents || []).length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No lifecycle events yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(client.lifecycleEvents || []).map(evt => (
                <Card key={evt.id || `${evt.event}-${evt.date}`} style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.pri, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{titleCase(evt.event || "Event")}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{evt.details || ""}</div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMut, whiteSpace: "nowrap" }}>{fmtDate(evt.date)}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.surface, color: C.text }} onKeyDown={(e) => e.key === "Enter" && handleSaveNote()} />
              <Btn variant="primary" onClick={handleSaveNote} disabled={!newNote.trim() || noteSaving}>{noteSaving ? "Saving..." : "Add"}</Btn>
            </div>
          </div>
          {(client.clientNotes || []).length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No notes yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(client.clientNotes || []).map(note => (
                <Card key={note.id} style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: C.text }}>{note.text}</div>
                      <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>{note.addedBy} • {fmtDate(note.timestamp)}</div>
                    </div>
                    <button onClick={() => handleDeleteNote(note.id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: C.danLt, color: C.dan, cursor: "pointer", fontFamily: "inherit", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div>
          {((data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId) || []).length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No history yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId).map(entry => (
                <Card key={entry.id} style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{entry.action}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>by {entry.changedBy}</div>
                      {Array.isArray(entry.details) && entry.details.length > 0 && (
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 6, paddingLeft: 12, borderLeft: `2px solid ${C.border}` }}>
                          {entry.details.map((d, i) => (
                            <div key={i}>{d.field}: {d.oldVal} → {d.newVal}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMut, whiteSpace: "nowrap" }}>{fmtDate(entry.timestamp)}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────
// ─── Gingr Integration Tab (extracted from old SettingsPage) ────────────────
function GingrIntegrationTab() {
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testMessage, setTestMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'success' | 'error'
  const [syncMessage, setSyncMessage] = useState("");
  const [syncState, setSyncState] = useState([]);
  const [lastErrorLog, setLastErrorLog] = useState(null);
  const [errorCopied, setErrorCopied] = useState(false);
  const { profile } = useAuth();

  const extractEdgeFnError = async (fnError) => {
    if (!fnError) return null;
    try {
      if (fnError.context?.body) {
        const reader = fnError.context.body.getReader?.();
        if (reader) {
          const { value } = await reader.read();
          const text = new TextDecoder().decode(value);
          try { const j = JSON.parse(text); return j.error || j.message || text; } catch (_) { return text; }
        }
      }
      if (typeof fnError.message === "string" && fnError.message !== "Edge Function returned a non-2xx status code") return fnError.message;
    } catch (_) {}
    return fnError.message || "Unknown edge function error";
  };

  useEffect(() => {
    if (!profile?.location_id) return;
    // Load from lite_settings (gingr_config)
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", "gingr_config")
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          const cfg = rows[0].setting_value;
          setSubdomain(cfg.subdomain || "");
          setApiKey(cfg.api_key || "");
          setLocationId(cfg.gingr_location_id || "");
        }
      });
    // Load sync state
    supabase
      .from("gingr_sync_state")
      .select("*")
      .eq("location_id", profile.location_id)
      .then(({ data }) => { if (data) setSyncState(data); });
  }, [profile?.location_id]);

  const handleSave = async () => {
    if (!profile?.location_id) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");

    // Save to lite_settings as gingr_config (used by Edge Function)
    const gingrConfig = {
      subdomain: subdomain.trim().toLowerCase(),
      api_key: apiKey.trim(),
      gingr_location_id: locationId.trim() || "1",
    };
    const { error } = await supabase
      .from("lite_settings")
      .upsert({
        location_id: profile.location_id,
        setting_key: "gingr_config",
        setting_value: gingrConfig,
      }, { onConflict: "location_id,setting_key" });

    setSaving(false);
    if (error) {
      setSaveError(error.message || "Failed to save credentials.");
      console.error("Save error:", error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
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
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: profile?.location_id || "test",
          sync_type: "test",
          test_credentials: {
            subdomain: subdomain.trim().toLowerCase(),
            api_key: apiKey.trim(),
          },
        },
      });
      if (fnError) {
        const detail = await extractEdgeFnError(fnError);
        throw new Error(detail);
      }
      if (fnData?.success) {
        setTestStatus("success");
        const names = fnData.location_names || [];
        setTestMessage(`Connected! ${fnData.locations} location${fnData.locations !== 1 ? "s" : ""} found${names.length ? ": " + names.join(", ") : ""}.`);
      } else {
        setTestStatus("error");
        setTestMessage(fnData?.error || "Connection failed. Check your credentials.");
      }
    } catch (e) {
      setTestStatus("error");
      setTestMessage(e.message || "Could not reach Gingr. Make sure the Edge Function is deployed.");
      setLastErrorLog({ timestamp: new Date().toISOString(), error: e.message, context: "test_connection" });
    }
  };

  const handleSync = async () => {
    if (!profile?.location_id) return;
    setSyncStatus("syncing");
    setSyncMessage("Starting full sync from Gingr...");
    try {
      let backfillComplete = false;
      let totalResSynced = 0;
      let iteration = 0;
      const startTime = Date.now();
      while (!backfillComplete) {
        iteration++;
        const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
          body: { location_id: profile.location_id, sync_type: "full" },
        });
        if (fnError) {
          const detail = await extractEdgeFnError(fnError);
          throw new Error(detail);
        }
        const resResult = fnData?.results?.reservations;
        totalResSynced += resResult?.synced || 0;
        if (resResult && resResult.backfill_complete === false && resResult.chunks_remaining > 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          setSyncMessage(`Backfilling history... ${totalResSynced.toLocaleString()} reservations synced (batch ${iteration}, ~${resResult.chunks_remaining} batches left, ${elapsed}s elapsed)`);
          await new Promise(r => setTimeout(r, 500));
        } else {
          backfillComplete = true;
        }
      }
      const r = (await supabase.functions.invoke("gingr-sync", { body: { location_id: profile.location_id, sync_type: "full" } }))?.data?.results || {};
      const parts = [];
      if (r.owners?.synced) parts.push(`${r.owners.synced} owners`);
      if (r.animals?.synced) parts.push(`${r.animals.synced} animals`);
      parts.push(`${totalResSynced.toLocaleString()} reservations`);
      if (r.reservation_types?.synced) parts.push(`${r.reservation_types.synced} reservation types`);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setSyncStatus("success");
      setSyncMessage(`Sync complete! Imported ${parts.join(", ")} in ${iteration} batches (${elapsed}s).`);
      const { data: newState } = await supabase.from("gingr_sync_state").select("*").eq("location_id", profile.location_id);
      if (newState) setSyncState(newState);
    } catch (err) {
      setSyncStatus("error");
      setSyncMessage(`Sync failed: ${err.message || "Unknown error"}`);
      setLastErrorLog({ timestamp: new Date().toISOString(), error: err.message, context: "settings_sync" });
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
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>
        Gingr Integration
      </h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Connect your Gingr account to pull customer, reservation, and operational data into K9 Operations. Your API key is stored
        securely per location.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle}>Gingr Subdomain</label>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span style={{padding: "12px 10px 12px 14px",background: C.bg,border: `1.5px solid ${C.border}`,borderRight: "none",borderRadius: "10px 0 0 10px",fontSize: 14,color: C.textMut,whiteSpace: "nowrap",}}>https://</span>
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="your-facility" style={{ ...inputStyle, borderRadius: 0, borderLeft: "none", borderRight: "none" }} />
            <span style={{padding: "12px 14px 12px 10px",background: C.bg,border: `1.5px solid ${C.border}`,borderLeft: "none",borderRadius: "0 10px 10px 0",fontSize: 14,color: C.textMut,whiteSpace: "nowrap",}}>.gingrapp.com</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>API Key</label>
          <div style={{ position: "relative" }}>
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your Gingr API key" style={{ ...inputStyle, paddingRight: 44 }} />
            <button onClick={() => setShowKey(!showKey)} type="button" style={{position: "absolute",right: 10,top: "50%",transform: "translateY(-50%)",background: "none",border: "none",cursor: "pointer",color: C.textMut,padding: 4,}}>
              {showKey ? <Icons.EyeOff /> : <Icons.Eye />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Find this in your Gingr admin panel under Settings → API Keys.</div>
        </div>

        <div>
          <label style={labelStyle}>Gingr Location ID <span style={{ fontWeight: 400, color: C.textMut }}>(optional)</span></label>
          <input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="e.g. 1" style={inputStyle} />
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Only needed if your Gingr account has multiple locations. Leave blank for single-location setups.</div>
        </div>
      </div>

      {testStatus && (
        <div style={{marginTop: 20,padding: "12px 16px",borderRadius: 10,fontSize: 14,fontWeight: 500,display: "flex",alignItems: "center",gap: 8,background: testStatus === "success" ? C.sucLt : testStatus === "error" ? C.danLt : C.infoLt,color: testStatus === "success" ? C.suc : testStatus === "error" ? C.dan : C.info,}}>
          {testStatus === "testing" && "Testing connection..."}
          {testStatus === "success" && (<><Icons.Check /> {testMessage}</> )}
          {testStatus === "error" && (<><Icons.AlertTriangle /> {testMessage}</> )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button onClick={handleTest} disabled={!subdomain || !apiKey} style={{padding: "12px 24px",borderRadius: 10,border: `1.5px solid ${C.pri}`,background: "transparent",color: C.pri,fontSize: 14,fontWeight: 600,cursor: !subdomain || !apiKey ? "default" : "pointer",fontFamily: "inherit",opacity: !subdomain || !apiKey ? 0.4 : 1,transition: "all 0.15s",display: "flex",alignItems: "center",gap: 6,}}>
          <Icons.Link /> Test Connection
        </button>
        <button onClick={handleSave} disabled={saving || !subdomain || !apiKey} style={{padding: "12px 24px",borderRadius: 10,border: "none",background: saving || !subdomain || !apiKey ? C.textMut : C.pri,color: "#fff",fontSize: 14,fontWeight: 600,cursor: saving || !subdomain || !apiKey ? "default" : "pointer",fontFamily: "inherit",transition: "all 0.15s",}}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Credentials"}
        </button>
      </div>

      {saveError && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: C.danLt, color: C.dan, fontSize: 13, fontWeight: 500 }}>
          Save failed: {saveError}
        </div>
      )}

      {/* ── Data Sync Section ── */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1.5px solid ${C.borderLight}` }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: C.text }}>Data Sync</h4>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
          Sync pulls all owners, animals, and reservations from Gingr into K9 Operations. Auto-syncs every 15 minutes when the app is open.
        </p>

        {syncState.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            {syncState.map(s => (
              <div key={s.entity_type} style={{ padding: "12px 16px", background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "capitalize", marginBottom: 4 }}>{s.entity_type}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>
                  {s.records_synced ? `${s.records_synced.toLocaleString()} records` : "Not synced yet"}
                </div>
                {s.last_sync_at && (
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>
                    Last: {new Date(s.last_sync_at).toLocaleString()}
                  </div>
                )}
                {s.status === "error" && (
                  <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{s.error_message}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {syncStatus === "syncing" && (
          <div style={{ marginBottom: 16, padding: "24px 16px", borderRadius: 10, background: C.infoLt, border: `1px solid ${C.borderLight}`, textAlign: "center" }}>
            <K9LoadingAnimation size={48} message="Syncing from Gingr..." subMessage={syncMessage} />
          </div>
        )}
        {syncStatus && syncStatus !== "syncing" && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, background: syncStatus === "success" ? C.sucLt : C.danLt, color: syncStatus === "success" ? C.suc : C.dan }}>
            {syncStatus === "success" && (<><Icons.Check /> {syncMessage}</>)}
            {syncStatus === "error" && (<><Icons.AlertTriangle /> {syncMessage}</>)}
          </div>
        )}

        {lastErrorLog && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.borderLight}`, fontSize: 12, fontFamily: "monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: C.textSec, fontFamily: "inherit" }}>Error Log</span>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastErrorLog, null, 2)); setErrorCopied(true); setTimeout(() => setErrorCopied(false), 2000); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${errorCopied ? C.suc : C.borderLight}`, background: errorCopied ? C.sucLt : C.bg, color: errorCopied ? C.suc : C.textSec, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 4 }}>{errorCopied ? <><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied</> : "Copy"}</button>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: C.dan, fontSize: 11, lineHeight: 1.4 }}>{JSON.stringify(lastErrorLog, null, 2)}</pre>
          </div>
        )}

        <button onClick={handleSync} disabled={syncStatus === "syncing" || !subdomain || !apiKey} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: syncStatus === "syncing" || !subdomain || !apiKey ? C.textMut : C.suc, color: "#fff", fontSize: 14, fontWeight: 600, cursor: syncStatus === "syncing" || !subdomain || !apiKey ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8 }}>
          <Icons.RefreshCw /> {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* ── Room Configuration Section ── */}
      <RoomConfig locationId={profile?.location_id} />
    </div>
  );
}

// ─── Room Configuration (actual room names per type) ───────────────────────
function RoomConfig({ locationId }) {
  const [roomNames, setRoomNames] = useState({}); // { "Luxury Suite": ["Luxury - 101", ...], ... }
  const [roomTypes, setRoomTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newRoomInputs, setNewRoomInputs] = useState({}); // per-type input field value
  const [expandedType, setExpandedType] = useState(null);

  useEffect(() => {
    if (!locationId) return;
    const load = async () => {
      setLoading(true);
      // Fetch boarding reservation types from Gingr sync
      const { data: resTypes } = await supabase
        .from("gingr_reservation_types").select("*").eq("location_id", locationId);
      // Filter to lodging types, excluding single-day (Day Boarding)
      const boarding = (resTypes || []).filter(rt => {
        const raw = rt.raw_data || {};
        const hasLodging = raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1;
        const isSingleDay = raw.single_day === "1" || raw.single_day === 1;
        return hasLodging && !isSingleDay;
      });
      const types = boarding.map(bt => {
        const name = (bt.name || bt.type_label || "").replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim();
        return name;
      }).filter(Boolean);
      const defaultTypes = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];
      setRoomTypes(types.length > 0 ? types : defaultTypes);
      // Fetch saved room names config
      const { data: setting } = await supabase
        .from("lite_settings").select("setting_value")
        .eq("location_id", locationId).eq("setting_key", "room_names").maybeSingle();
      setRoomNames(setting?.setting_value || {});
      setLoading(false);
    };
    load();
  }, [locationId]);

  const handleSave = async () => {
    if (!locationId) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "room_names",
      setting_value: roomNames,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,setting_key" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addRoom = (type) => {
    const name = (newRoomInputs[type] || "").trim();
    if (!name) return;
    setRoomNames(prev => {
      const list = [...(prev[type] || []), name];
      return { ...prev, [type]: list };
    });
    setNewRoomInputs(prev => ({ ...prev, [type]: "" }));
  };

  const removeRoom = (type, idx) => {
    setRoomNames(prev => {
      const list = [...(prev[type] || [])];
      list.splice(idx, 1);
      return { ...prev, [type]: list };
    });
  };

  if (loading) return null;

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1.5px solid ${C.borderLight}` }}>
      <h4 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.text }}>Room Configuration</h4>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
        Configure the exact room names for each boarding type. These must match the room names in Gingr for cleaning tracking to work correctly.
      </p>
      {roomTypes.map(rt => {
        const rooms = roomNames[rt] || [];
        const isExpanded = expandedType === rt;
        return (
          <div key={rt} style={{ marginBottom: 12, borderRadius: 10, border: `1px solid ${C.borderLight}`, background: C.bg, overflow: "hidden" }}>
            <div onClick={() => setExpandedType(isExpanded ? null : rt)} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{rt}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, background: C.surfaceHover, borderRadius: 6, padding: "2px 8px" }}>{rooms.length} rooms</span>
              </div>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {isExpanded && (
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.borderLight}` }}>
                {rooms.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                    {rooms.map((rm, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.surfaceHover, border: `1px solid ${C.borderLight}`, fontSize: 12, fontWeight: 600, color: C.text }}>
                        {rm}
                        <button onClick={() => removeRoom(rt, i)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: C.textMut, fontSize: 14 }} title="Remove">×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: "12px 0", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No rooms configured. Add rooms below.</p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text" placeholder={`e.g. ${rt === "Luxury Suite" ? "Luxury - 101" : rt === "Executive Room" ? "Executive - 201" : rt === "Double Compartment" ? "Double - 1C" : "Single - 1A"}`}
                    value={newRoomInputs[rt] || ""}
                    onChange={e => setNewRoomInputs(prev => ({ ...prev, [rt]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") addRoom(rt); }}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }}
                  />
                  <button onClick={() => addRoom(rt)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add Room</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: saved ? C.suc : C.pri, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Room Config"}
        </button>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11, color: C.textMut }}>
        Room names must match exactly what’s in Gingr. Changes take effect after the next page refresh.
      </p>
    </div>
  );
}


// ─── Team Management Tab ──────────────────────────────────────────────────
function TeamManagementTab({ profile, data, save }) {
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("pct");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteCredentials, setInviteCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Determine current user's Lite role for permission gating
  const myRole = profile?.role || "pct";
  const canManage = ["manager", "location_admin", "enterprise_admin", "owner"].includes(myRole);
  const canCreateEnterprise = ["enterprise_admin", "owner"].includes(myRole);

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    setTeamLoading(true);
    const { data: members, error } = await supabase
      .from("lite_profiles")
      .select("*")
      .eq("location_id", profile?.location_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (!error) setTeam(members || []);
    else setTeam([]);
    setTeamLoading(false);
  };

  const updateRole = async (profileId, newRole) => {
    const { error } = await supabase
      .from("lite_profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (!error) fetchTeam();
  };

  const removeMember = async (profileId) => {
    // Soft-delete: set is_active = false
    const { error } = await supabase
      .from("lite_profiles")
      .update({ is_active: false })
      .eq("id", profileId);
    if (!error) {
      setConfirmRemove(null);
      fetchTeam();
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteCredentials(null);

    // Enterprise admin check
    if (inviteRole === "enterprise_admin" && !canCreateEnterprise) {
      setInviteError("Only Enterprise Admins can create other Enterprise Admins.");
      setInviting(false);
      return;
    }

    try {
      // Call server-side RPC — creates auth user + lite_profiles row in one shot
      // Uses SECURITY DEFINER + Supabase Vault service_role_key, so the
      // caller's session is NOT affected (no accidental sign-out).
      const { data: result, error: rpcError } = await supabase.rpc('send_lite_invite', {
        invite_email: inviteEmail.trim().toLowerCase(),
        invite_name: inviteName.trim(),
        invite_role: inviteRole,
        invite_location: profile?.location_id || null,
      });

      if (rpcError) {
        setInviteError("RPC error: " + rpcError.message);
        setInviting(false);
        return;
      }

      if (result && !result.success) {
        setInviteError(result.error || "Invite failed.");
        setInviting(false);
        return;
      }

      setInviteCredentials({
        email: inviteEmail.trim().toLowerCase(),
        password: result.temp_password,
        name: inviteName.trim(),
      });
      setInviteEmail("");
      setInviteName("");
      setInviteRole("pct");
      fetchTeam();
    } catch (err) {
      setInviteError("Unexpected error: " + err.message);
    }
    setInviting(false);
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getRoleColor = (role) => {
    const map = { enterprise_admin: "#8B5CF6", location_admin: "#3B82F6", manager: "#0891B2", supervisor: "#F59E0B", csr: "#10B981", pct: "#6B7280" };
    return map[role] || "#6B7280";
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Team Management</h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.textSec }}>Manage your K9 Operations Lite team members and roles.</p>

      {teamLoading ? (
        <div style={{ padding: "40px", textAlign: "center", color: C.textMut }}>Loading team...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Team members table */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1.5fr 120px 1fr 80px", gap: 12, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div>Name</div><div>Email</div><div>Role</div><div>Last Active</div><div/>
            </div>
            {team.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No team members yet. Invite your first member below.</div>
            )}
            {team.map(m => (
              <div key={m.id} style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: "1fr 1.5fr 120px 1fr 80px", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.full_name || "—"}</div>
                <div style={{ fontSize: 13, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                <div>
                  {canManage && m.user_id !== profile?.id ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.text, cursor: "pointer" }}>
                      {LEAN_ROLES.filter(r => r.id !== "enterprise_admin" || canCreateEnterprise).map(r => (
                        <option key={r.id} value={r.id}>{r.shortName}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: getRoleColor(m.role) + "18", color: getRoleColor(m.role), textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {(LEAN_ROLES.find(r => r.id === m.role) || {}).shortName || m.role}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textSec }}>{m.last_active ? new Date(m.last_active).toLocaleDateString() : "—"}</div>
                <div>
                  {canManage && m.user_id !== profile?.id && (
                    confirmRemove === m.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", color: C.dan, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}>Confirm</button>
                        <button onClick={() => setConfirmRemove(null)} style={{ background: "none", border: "none", color: C.textMut, cursor: "pointer", fontSize: 11, fontWeight: 500, padding: 0 }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRemove(m.id)} style={{ background: "none", border: "none", color: C.dan, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>Remove</button>
                    )
                  )}
                </div>
              </div>
            ))}
          </Card>

          {/* Invite new member */}
          {canManage && (
            <Card style={{ padding: "20px 24px" }}>
              <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: C.text }}>Invite New Member</h4>

              {inviteCredentials ? (
                <div style={{ padding: "16px 20px", background: "#F0FDF4", border: "1.5px solid #A7F3D0", borderRadius: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#065F46", marginBottom: 12 }}>Account created for {inviteCredentials.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#065F46", minWidth: 70 }}>Email:</span>
                      <code style={{ flex: 1, fontSize: 13, color: "#065F46", background: "#ECFDF5", padding: "4px 8px", borderRadius: 4 }}>{inviteCredentials.email}</code>
                      <button onClick={() => copyToClipboard(inviteCredentials.email, "email")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: copiedField === "email" ? "#10B981" : "#065F46" }}>{copiedField === "email" ? "Copied!" : "Copy"}</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#065F46", minWidth: 70 }}>Password:</span>
                      <code style={{ flex: 1, fontSize: 13, color: "#065F46", background: "#ECFDF5", padding: "4px 8px", borderRadius: 4 }}>{inviteCredentials.password}</code>
                      <button onClick={() => copyToClipboard(inviteCredentials.password, "pw")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: copiedField === "pw" ? "#10B981" : "#065F46" }}>{copiedField === "pw" ? "Copied!" : "Copy"}</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#065F46", opacity: 0.7 }}>Share these credentials with the new team member. They should change their password after first login.</div>
                  <button onClick={() => setInviteCredentials(null)} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, border: `1px solid #A7F3D0`, background: "transparent", color: "#065F46", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px auto", gap: 12, alignItems: "flex-end" }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</label>
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Full Name</label>
                      <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</label>
                      <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: C.surface, boxSizing: "border-box" }}>
                        {LEAN_ROLES.filter(r => r.id !== "enterprise_admin" || canCreateEnterprise).map(r => (
                          <option key={r.id} value={r.id} disabled={r.id === "enterprise_admin" && !canCreateEnterprise}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim() || !inviteName.trim()} style={{ padding: "10px 20px", background: inviting || !inviteEmail.trim() || !inviteName.trim() ? C.textMut : C.pri, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: inviting ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {inviting ? "Creating..." : "Invite"}
                    </button>
                  </div>
                  {inviteError && <div style={{ marginTop: 10, fontSize: 12, color: C.dan, fontWeight: 500 }}>{inviteError}</div>}
                </>
              )}
            </Card>
          )}

          {!canManage && (
            <div style={{ padding: "16px 20px", background: C.bg, borderRadius: 10, fontSize: 13, color: C.textMut, textAlign: "center" }}>
              You need Manager or higher permissions to invite or manage team members.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Permissions Matrix Tab ───────────────────────────────────────────────
function PermissionsTab() {
  // Editable permission state — starts from the built-in matrix
  const [permMatrix, setPermMatrix] = useState(() => {
    const m = {};
    LEAN_ROLES.forEach(r => { m[r.id] = { ...LEAN_PERMISSION_MATRIX[r.id] }; });
    return m;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load persisted overrides from Supabase on mount
  useEffect(() => {
    supabase.from("lite_permissions").select("*").then(({ data: rows }) => {
      if (rows && rows.length > 0) {
        const m = {};
        LEAN_ROLES.forEach(r => { m[r.id] = { ...LEAN_PERMISSION_MATRIX[r.id] }; });
        rows.forEach(r => { if (m[r.role_id]) m[r.role_id][r.permission_key] = r.granted; });
        // Enterprise admin always full access
        LEAN_PERMISSION_AREAS.forEach(k => { m.enterprise_admin[k] = true; });
        setPermMatrix(m);
      }
    });
  }, []);

  const LITE_PERM_CATEGORIES = [
    { key: "pages", label: "Page Access", permissions: [
      { key: "Customer Lifecycle", label: "Customer Lifecycle", desc: "View and manage customer lifecycle stages" },
      { key: "Operations Hub", label: "Operations Hub", desc: "Access daily operations checklists" },
      { key: "Photos Module", label: "Photos", desc: "View and manage pet photos" },
    ]},
    { key: "settings", label: "Settings & Admin", permissions: [
      { key: "Gingr Integration", label: "Gingr Integration", desc: "Configure Gingr API connection" },
      { key: "User Management", label: "User Management", desc: "Manage team members and invites" },
      { key: "Permissions Management", label: "Permissions", desc: "View and edit roles permissions" },
    ]},
    { key: "ops", label: "Operations", permissions: [
      { key: "EOD Reports", label: "EOD Reports", desc: "View end-of-day financial reports" },
      { key: "Attendance Tracker", label: "Attendance", desc: "Track team attendance and records" },
      { key: "Checklist Templates", label: "Checklist Templates", desc: "Customize operation checklists" },
      { key: "Enterprise View", label: "Enterprise View", desc: "Access cross-location enterprise dashboard" },
    ]},
  ];

  const allPermKeys = LITE_PERM_CATEGORIES.flatMap(c => c.permissions.map(p => p.key));

  const ROLE_COLORS = {
    pct: { bg: "#F3F4F6", text: "#6B7280" },
    csr: { bg: "#D1FAE5", text: "#059669" },
    supervisor: { bg: "#FEF3C7", text: "#D97706" },
    manager: { bg: "#DBEAFE", text: "#2563EB" },
    location_admin: { bg: "#E0E7FF", text: "#4F46E5" },
    enterprise_admin: { bg: "#F5F3FF", text: "#7C3AED" },
  };

  const enabledCount = (roleId) => allPermKeys.filter(k => permMatrix[roleId]?.[k]).length;
  const isEntAdmin = (roleId) => roleId === "enterprise_admin";

  const togglePerm = (roleId, permKey) => {
    if (isEntAdmin(roleId)) return; // Enterprise admin is always full
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId], [permKey]: !prev[roleId][permKey] } };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const toggleAllForRole = (roleId) => {
    if (isEntAdmin(roleId)) return;
    const allOn = allPermKeys.every(k => permMatrix[roleId]?.[k]);
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId] } };
      allPermKeys.forEach(k => { next[roleId][k] = !allOn; });
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const toggleCatForRole = (roleId, catKey) => {
    if (isEntAdmin(roleId)) return;
    const cat = LITE_PERM_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const allOn = cat.permissions.every(p => permMatrix[roleId]?.[p.key]);
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId] } };
      cat.permissions.forEach(p => { next[roleId][p.key] = !allOn; });
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build rows for all non-enterprise-admin permissions
      const rows = [];
      LEAN_ROLES.filter(r => r.id !== "enterprise_admin").forEach(role => {
        allPermKeys.forEach(k => {
          rows.push({ role_id: role.id, permission_key: k, granted: !!permMatrix[role.id]?.[k] });
        });
      });
      const { error } = await supabase.from("lite_permissions").upsert(rows, { onConflict: "role_id,permission_key" });
      if (error) console.log("[K9 Lite] Permission save error:", error.message);
      // Also update the in-memory LEAN_PERMISSION_MATRIX so other components see changes
      LEAN_ROLES.filter(r => r.id !== "enterprise_admin").forEach(role => {
        allPermKeys.forEach(k => { LEAN_PERMISSION_MATRIX[role.id][k] = !!permMatrix[role.id]?.[k]; });
      });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.log("[K9 Lite] Permission save error:", err.message);
    }
    setSaving(false);
  };

  const Chk = ({ on, onClick, disabled }) => (
    <button onClick={disabled ? undefined : onClick} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${disabled ? C.border + "60" : on ? C.pri : C.border}`, background: disabled ? (on ? C.pri + "40" : C.surfaceHover) : on ? C.pri : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.12s", opacity: disabled ? 0.5 : 1 }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={disabled ? "#fff" : "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </button>
  );

  const colW = Math.max(100, Math.min(130, Math.floor(700 / LEAN_ROLES.length)));
  const labelW = 220;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Roles & Permissions</div>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>Configure permissions for each role. Enterprise Admin always has full access.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, fontWeight: 600, color: C.suc }}>✓ Saved</span>}
          {dirty && <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>}
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: labelW + LEAN_ROLES.length * colW }}>
            <thead>
              <tr style={{ background: `linear-gradient(135deg, ${C.pri}08, ${C.bg})` }}>
                <th style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, width: labelW, minWidth: labelW, padding: "16px 20px", textAlign: "left", borderBottom: `2px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Permission</div>
                </th>
                {LEAN_ROLES.map(role => {
                  const ec = enabledCount(role.id);
                  const rc = ROLE_COLORS[role.id] || ROLE_COLORS.pct;
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <th key={role.id} style={{ width: colW, minWidth: colW, padding: "12px 8px", textAlign: "center", borderBottom: `2px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, verticalAlign: "bottom", background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.text, whiteSpace: "nowrap" }}>{role.shortName}</span>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>{ec}/{allPermKeys.length}</div>
                        {isEnt && <div style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.04em" }}>Full Access</div>}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Toggle All row */}
              <tr style={{ background: C.bg }}>
                <td style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, padding: "8px 20px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.pri, textTransform: "uppercase" }}>
                  Toggle All
                </td>
                {LEAN_ROLES.map(role => {
                  const allOn = allPermKeys.every(k => permMatrix[role.id]?.[k]);
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <td key={role.id} style={{ padding: "8px", textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      {isEnt ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", opacity: 0.5 }}>Always On</span>
                      ) : (
                        <button onClick={() => toggleAllForRole(role.id)} style={{ fontSize: 10, fontWeight: 700, color: allOn ? C.dan : C.suc, background: "none", border: `1.5px solid ${allOn ? C.dan + "40" : C.suc + "40"}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                          {allOn ? "None" : "All"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {LITE_PERM_CATEGORIES.map(cat => (
                <React.Fragment key={cat.key}>
                  <tr>
                    <td colSpan={1 + LEAN_ROLES.length} style={{ position: "sticky", left: 0, padding: "10px 20px", background: `linear-gradient(90deg, ${C.pri}0A, ${C.bg})`, borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat.label}</div>
                        <div style={{ flex: 1, height: 1, background: C.border }} />
                        <div style={{ display: "flex", gap: 4 }}>
                          {LEAN_ROLES.map(role => {
                            const isEnt = isEntAdmin(role.id);
                            const catAllOn = cat.permissions.every(p => permMatrix[role.id]?.[p.key]);
                            const catSomeOn = cat.permissions.some(p => permMatrix[role.id]?.[p.key]);
                            return (
                              <button key={role.id} onClick={() => !isEnt && toggleCatForRole(role.id, cat.key)} title={isEnt ? "Enterprise Admin: always full access" : `${catAllOn ? "Deselect" : "Select"} all ${cat.label} for ${role.name}`}
                                style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${isEnt ? "#7C3AED40" : catAllOn ? C.suc : catSomeOn ? C.pri + "60" : C.border}`, background: isEnt ? "#7C3AED20" : catAllOn ? C.suc : catSomeOn ? C.pri + "20" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: isEnt ? "not-allowed" : "pointer", fontSize: 9, color: isEnt ? "#7C3AED" : catAllOn ? "#fff" : C.textMut, fontWeight: 700, opacity: isEnt ? 0.5 : 1 }}>
                                {(catAllOn || isEnt) ? "✓" : catSomeOn ? "•" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {cat.permissions.map((perm, pi) => (
                    <tr key={perm.key} style={{ background: pi % 2 === 0 ? C.surface : C.bg }}>
                      <td style={{ position: "sticky", left: 0, background: pi % 2 === 0 ? C.surface : C.bg, zIndex: 1, padding: "10px 20px", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{perm.label}</div>
                        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.3, marginTop: 1 }}>{perm.desc}</div>
                      </td>
                      {LEAN_ROLES.map(role => {
                        const isEnt = isEntAdmin(role.id);
                        const on = isEnt ? true : (permMatrix[role.id]?.[perm.key] === true);
                        return (
                          <td key={role.id} style={{ padding: "10px 8px", textAlign: "center", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                            <Chk on={on} onClick={() => togglePerm(role.id, perm.key)} disabled={isEnt} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.bg }}>
                <td style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, padding: "14px 20px", borderTop: `2px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Enabled</div>
                </td>
                {LEAN_ROLES.map(role => {
                  const ec = enabledCount(role.id);
                  const pct = Math.round((ec / allPermKeys.length) * 100);
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <td key={role.id} style={{ padding: "14px 8px", textAlign: "center", borderTop: `2px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: pct === 100 ? C.suc : pct > 50 ? C.pri : C.warn }}>{ec}</div>
                      <div style={{ fontSize: 11, color: C.textMut }}>of {allPermKeys.length}</div>
                      <div style={{ width: "80%", height: 4, borderRadius: 2, background: C.surfaceHover, margin: "6px auto 0", overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", borderRadius: 2, background: pct === 100 ? C.suc : pct > 50 ? C.pri : pct > 0 ? C.warn : C.border, transition: "width 0.3s" }} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Required Fields Tab ──────────────────────────────────────────────────
function RequiredFieldsTab() {
  const clientFields = DEF_CLIENT_FIELDS;
  const dogFields = DEF_DOG_FIELDS;
  const ACTION_LEVELS_FULL = ["create", "tour", "eval", "reservation"];
  const ACTION_LABELS_FULL = { create: "Create", tour: "Tour", eval: "Eval", reservation: "Res" };

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Required Fields</h3>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.textSec }}>Configure which fields are required at each stage of the customer lifecycle.</p>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1.5px solid ${C.pri}20`, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}><strong>How it works:</strong> Fields required at a lower level are automatically required at higher levels. Only the "Create" column is active in K9 Operations Lite. Other columns show the POS configuration for reference.</div>
      </div>

      {[{ label: "Client Fields", fields: clientFields }, { label: "Dog Fields", fields: dogFields }].map(section => {
        const colW = "1fr 70px 58px 52px 62px";
        return (
          <Card key={section.label} style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>{section.label}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: colW, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", alignItems: "center" }}>
              <div>Field</div>
              <div>Type</div>
              {ACTION_LEVELS_FULL.map(lvl => (
                <div key={lvl} style={{ textAlign: "center", opacity: lvl === "create" ? 1 : 0.4 }}>{ACTION_LABELS_FULL[lvl]}</div>
              ))}
            </div>
            {section.fields.map(f => {
              const rf = f.requiredFor || [];
              return (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: colW, padding: "10px 20px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                  <div><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: C.surfaceHover, color: C.textSec }}>{f.type}</span></div>
                  {ACTION_LEVELS_FULL.map(lvl => {
                    const isActive = rf.includes(lvl);
                    const minLevel = rf.length > 0 ? Math.min(...rf.map(a => ACTION_LEVELS_FULL.indexOf(a)).filter(i => i >= 0)) : 999;
                    const isInherited = !isActive && ACTION_LEVELS_FULL.indexOf(lvl) > minLevel && minLevel < 999;
                    const filled = isActive || isInherited;
                    const isCreateCol = lvl === "create";
                    const isLocked = f.isKey && lvl === "create";
                    return (
                      <div key={lvl} style={{ textAlign: "center", opacity: isCreateCol ? 1 : 0.35 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${filled ? C.pri : C.border}`, background: filled ? (isInherited ? C.priLt : C.pri) : (isCreateCol ? "#fff" : "#f3f3f3"), display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: isCreateCol && !isLocked ? "pointer" : "not-allowed", opacity: isLocked ? 0.6 : 1 }}>
                          {filled && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isInherited ? C.pri : "#fff"} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Checklist Templates Tab ──────────────────────────────────────────────
function ChecklistTemplatesTab() {
  const { profile } = useAuth();
  const TEMPLATE_DEFS = [
    { id: "opening", label: "Opening Checklist", def: DEF_OPENING_TEMPLATE },
    { id: "fe", label: "Front-End Checklist", def: DEF_FE_TEMPLATE },
    { id: "be", label: "Back-End Checklist", def: DEF_BE_TEMPLATE },
    { id: "closing", label: "Closing Checklist", def: DEF_CLOSING_TEMPLATE },
  ];

  const [templates, setTemplates] = useState(() => {
    const m = {};
    TEMPLATE_DEFS.forEach(t => { m[t.id] = t.def.map(item => ({ ...item })); });
    return m;
  });
  const [editing, setEditing] = useState(null); // which template id is being edited
  const [editItems, setEditItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addTime, setAddTime] = useState("");

  // Load persisted templates from Supabase on mount
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_checklist_templates").select("*").eq("location_id", locationId).then(({ data: rows }) => {
      if (rows && rows.length > 0) {
        const m = {};
        TEMPLATE_DEFS.forEach(t => { m[t.id] = t.def.map(item => ({ ...item })); });
        rows.forEach(r => {
          if (m[r.template_type] && Array.isArray(r.items)) {
            m[r.template_type] = r.items;
          }
        });
        setTemplates(m);
      }
    });
  }, []);

  const startEdit = (id) => {
    setEditing(id);
    setEditItems(templates[id].map(item => ({ ...item })));
    setDirty(false);
    setSaved(false);
    setAddLabel("");
    setAddTime("");
  };

  const cancelEdit = () => { setEditing(null); setEditItems([]); setDirty(false); };

  const moveItem = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editItems.length) return;
    const items = [...editItems];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditItems(items);
    setDirty(true);
  };

  const removeItem = (idx) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateItem = (idx, field, value) => {
    const items = [...editItems];
    items[idx] = { ...items[idx], [field]: value };
    setEditItems(items);
    setDirty(true);
  };

  const addItem = () => {
    if (!addLabel.trim()) return;
    const newId = `${editing}_custom_${Date.now()}`;
    setEditItems([...editItems, { id: newId, label: addLabel.trim(), ...(addTime ? { time: addTime } : {}) }]);
    setAddLabel("");
    setAddTime("");
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_checklist_templates").upsert({
      location_id: locationId,
      template_type: editing,
      items: editItems,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,template_type" });
    if (!error) {
      setTemplates(prev => ({ ...prev, [editing]: editItems.map(item => ({ ...item })) }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const resetToDefault = () => {
    const def = TEMPLATE_DEFS.find(t => t.id === editing);
    if (def) {
      setEditItems(def.def.map(item => ({ ...item })));
      setDirty(true);
    }
  };

  // ── Editing view ──
  if (editing) {
    const tpl = TEMPLATE_DEFS.find(t => t.id === editing);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={cancelEdit} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back
          </button>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>{tpl.label}</h3>
        </div>

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {editItems.map((item, idx) => (
            <div key={item.id || idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.textMut, fontWeight: 700, minWidth: 24 }}>{idx + 1}</span>
              <input
                value={item.label}
                onChange={e => updateItem(idx, "label", e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit" }}
              />
              <input
                value={item.time || ""}
                onChange={e => updateItem(idx, "time", e.target.value)}
                placeholder="HH:MM"
                style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit", textAlign: "center" }}
              />
              <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
              <button onClick={() => moveItem(idx, 1)} disabled={idx === editItems.length - 1} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: idx === editItems.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editItems.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editItems.length - 1 ? 0.4 : 1 }}>↓</button>
              <button onClick={() => removeItem(idx)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
          ))}
        </div>

        {/* Add new task */}
        <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Add New Task</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Task description"
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit" }}
            />
            <input
              value={addTime}
              onChange={e => setAddTime(e.target.value)}
              placeholder="HH:MM"
              style={{ width: 70, padding: "8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit", textAlign: "center" }}
            />
            <button onClick={addItem} disabled={!addLabel.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: !addLabel.trim() ? C.surfaceHover : C.pri, color: !addLabel.trim() ? C.textMut : "#fff", fontSize: 12, fontWeight: 700, cursor: !addLabel.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </Card>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
          </button>
          <button onClick={resetToDefault} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Reset to Default
          </button>
          {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Checklist Templates</h3>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.textSec }}>View and customize your operation checklists. Click Edit to modify tasks, reorder items, or add new ones.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TEMPLATE_DEFS.map(cl => {
          const items = templates[cl.id] || cl.def;
          const isCustomized = JSON.stringify(items) !== JSON.stringify(cl.def);
          return (
            <Card key={cl.id} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{cl.label}</span>
                    {isCustomized && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#DBEAFE", color: "#1D4ED8" }}>CUSTOMIZED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{items.length} tasks</div>
                </div>
                <button onClick={() => startEdit(cl.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: "transparent", color: C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Retention Thresholds Tab (mirrors POS Resort Policies) ─────────────────
function RetentionThresholdsTab() {
  const { profile } = useAuth();
  const [dcDays, setDcDays] = useState(90);
  const [bdDays, setBdDays] = useState(180);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted thresholds from lite_settings
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "resort_policies").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) {
        const val = rows[0].setting_value;
        if (val.retentionDaycareDays != null) setDcDays(val.retentionDaycareDays);
        if (val.retentionBoardingDays != null) setBdDays(val.retentionBoardingDays);
      }
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "resort_policies",
      setting_value: { retentionDaycareDays: dcDays, retentionBoardingDays: bdDays },
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center" }}><K9LoadingAnimation size={48} message="Loading settings..." /></div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Customer Lifecycle — Retention Thresholds</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>Configure how many days of inactivity trigger a client moving from Active to Retention. Separate thresholds for primarily-daycare vs primarily-boarding clients.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Daycare Retention */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Daycare Retention</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input type="number" value={dcDays} min={1} max={365} onChange={e => { setDcDays(parseInt(e.target.value) || 90); setDirty(true); }}
              style={{ width: 80, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>days</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>Clients whose reservations are primarily daycare will move to Retention after this many days of inactivity.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[30, 60, 90, 120].map(d => (
              <button key={d} onClick={() => { setDcDays(d); setDirty(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${dcDays === d ? C.pri : C.border}`, background: dcDays === d ? C.priLt : "transparent", color: dcDays === d ? C.pri : C.textSec, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{d}d</button>
            ))}
          </div>
        </Card>

        {/* Boarding Retention */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Boarding Retention</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input type="number" value={bdDays} min={1} max={730} onChange={e => { setBdDays(parseInt(e.target.value) || 180); setDirty(true); }}
              style={{ width: 80, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>days</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>Clients whose reservations are primarily boarding will move to Retention after this many days of inactivity.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[90, 120, 180, 365].map(d => (
              <button key={d} onClick={() => { setBdDays(d); setDirty(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${bdDays === d ? C.pri : C.border}`, background: bdDays === d ? C.priLt : "transparent", color: bdDays === d ? C.pri : C.textSec, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{d}d</button>
            ))}
          </div>
        </Card>
      </div>

      {/* How it works explainer */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Retention Classification Works</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>A client moves from <span style={{ fontWeight: 700, color: C.text }}>Active</span> to <span style={{ fontWeight: 700, color: "#D97706" }}>Retention</span> when:</div>
          <div style={{ paddingLeft: 14 }}>
            <div>1. They have a booking history and have spent money</div>
            <div>2. They have no upcoming reservations</div>
            <div>3. Their last visit exceeds the threshold for their primary service type:</div>
            <div style={{ paddingLeft: 14, marginTop: 4 }}>
              <div>If <span style={{ fontWeight: 600 }}>&gt;50%</span> of bookings are boarding → uses <span style={{ fontWeight: 700, color: C.pri }}>Boarding threshold ({bdDays} days)</span></div>
              <div>If <span style={{ fontWeight: 600 }}>&ge;50%</span> of bookings are daycare → uses <span style={{ fontWeight: 700, color: C.pri }}>Daycare threshold ({dcDays} days)</span></div>
              <div>Mixed use → defaults to <span style={{ fontWeight: 700, color: C.pri }}>Daycare threshold ({dcDays} days)</span></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
        {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>Changes take effect immediately for all lifecycle calculations.</span>
      </div>
    </div>
  );
}

// ─── Main Settings Page with Tabs ──────────────────────────────────────────
function SettingsPage({ profile: parentProfile, addGlobalToast }) {
  const [tab, setTab] = useState(null); // null = show grid, set = show detail
  const [searchQuery, setSearchQuery] = useState("");
  const { profile: authProfile } = useAuth();
  const profile = parentProfile || authProfile;
  const data = useGingrData(profile?.location_id || "cherry-hill");
  const save = useCallback(() => {}, []);

  const sections = [
    {
      id: "integrations",
      label: "Integrations",
      cards: [
        { id: "gingr", label: "Gingr Integration", desc: "Connect and configure Gingr POS" },
      ],
    },
    {
      id: "team-security",
      label: "Team & Security",
      cards: [
        { id: "team", label: "Team Management", desc: "Manage team members and roles" },
        { id: "permissions", label: "Permissions", desc: "Configure access controls" },
      ],
    },
    {
      id: "lifecycle",
      label: "Customer Lifecycle",
      cards: [
        { id: "retention-thresholds", label: "Retention Thresholds", desc: "Configure days of inactivity before a client moves from Active to Retention" },
      ],
    },
    {
      id: "data",
      label: "Data & Fields",
      cards: [
        { id: "required-fields", label: "Required Fields", desc: "Configure which fields are required when creating records" },
        { id: "checklist-templates", label: "Checklist Templates", desc: "Customize opening, closing, FE, and BE checklists" },
      ],
    },
  ];

  // Filter cards by search
  const filteredSections = sections.map(section => ({
    ...section,
    cards: section.cards.filter(card =>
      card.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.desc.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(section => section.cards.length > 0);

  // Tab detail components
  const renderDetail = () => {
    switch (tab) {
      case "gingr":
        return <GingrIntegrationTab />;
      case "team":
        return <TeamManagementTab profile={profile} data={data} save={save} />;
      case "permissions":
        return <PermissionsTab />;
      case "retention-thresholds":
        return <RetentionThresholdsTab />;
      case "required-fields":
        return <RequiredFieldsTab />;
      case "checklist-templates":
        return <ChecklistTemplatesTab />;
      default:
        return null;
    }
  };

  return (
    <div>
      {tab === null ? (
        // Grid view
        <div>
          <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Settings</h2>

          {/* Search Bar */}
          <div style={{ marginBottom: 32 }}>
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: 400,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1.5px solid ${C.border}`,
                fontSize: 14,
                fontFamily: "inherit",
                background: C.surface,
                color: C.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Categorized Card Grid */}
          {filteredSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.textSec }}>
              <p style={{ fontSize: 14 }}>No settings found matching your search.</p>
            </div>
          ) : (
            filteredSections.map((section) => (
              <div key={section.id} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 }}>
                  {section.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {section.cards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => setTab(card.id)}
                      style={{
                        background: C.surface,
                        borderRadius: 12,
                        padding: "18px 20px",
                        border: `1.5px solid ${C.pri}40`,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{card.label}</div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{card.desc}</div>
                      </div>
                      <span style={{ color: C.textMut, fontSize: 16, flexShrink: 0, marginLeft: 12 }}>›</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Detail view
        <div>
          <button
            onClick={() => setTab(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              marginBottom: 24,
              border: "none",
              background: "none",
              color: C.pri,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            ← Back to Settings
          </button>
          {renderDetail()}
        </div>
      )}
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

// ATTENDANCE TRACKER PAGE
// ═══════════════════════════════════════════════════════════════════════════
const ATTENDANCE_TYPES = ["Tardy", "Early Release", "Call Out (2+ hrs)", "Late Call Out (<2 hrs)", "No Call / No Show"];
const ATTENDANCE_TYPE_COLORS = { "Tardy": "#F0AD4E", "Early Release": "#E67E22", "Call Out (2+ hrs)": "#E74C3C", "Late Call Out (<2 hrs)": "#C0392B", "No Call / No Show": "#922B21" };

function AttendanceTrackerPage({ data, save, nav, profile }) {
  const [tab, setTab] = useState("roster");
  const hp = (k) => true; // Always allow in Lite version
  const canEdit = true;
  const canEditRoster = true;
  const today = new Date().toISOString().slice(0, 10);
  const userName = profile?.full_name || profile?.email || "Unknown";
  const userInitials = (profile?.full_name || "").split(" ").map(n => n[0]).join("").toUpperCase() || "—";

  // Attendance data from data store
  const roster = data.attendanceRoster || [];
  const entries = data.attendanceEntries || [];
  const auditLog = data.attendanceAuditLog || [];
  const activeRoster = roster.filter(r => !r.endDate);
  const inactiveRoster = roster.filter(r => !!r.endDate);

  // ── Audit Logging Helper ──
  const logAudit = (action, category, details, prev, next) => {
    const entry = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      userId: profile?.id || "unknown",
      userName,
      userInitials,
      action,
      category,
      details,
      previousValue: prev || null,
      newValue: next || null,
    };
    return [...auditLog, entry];
  };

  const saveWithAudit = (changes, action, category, details, prev, next) => {
    const newAudit = logAudit(action, category, details, prev, next);
    save({ ...data, ...changes, attendanceAuditLog: newAudit });
  };

  const tabs = [
    { id: "roster", label: "Roster" },
    { id: "input", label: "Attendance Log" },
    { id: "summary", label: "Summary" },
    { id: "policy", label: "Policy Reference" },
    { id: "audit", label: "Audit Log" },
  ];

  // ── Roster Tab (state lifted to parent to survive re-renders) ──
  const [rosterShowAdd, setRosterShowAdd] = useState(false);
  const [rosterEditingField, setRosterEditingField] = useState(null);
  const [rosterEditValue, setRosterEditValue] = useState("");
  const [rosterForm, setRosterForm] = useState({ name: "", title: "", phone: "", email: "", startDate: today });
  const [rosterSortCol, setRosterSortCol] = useState("name");
  const [rosterSortDir, setRosterSortDir] = useState("asc");
  function RosterTab() {
    const showAdd = rosterShowAdd, setShowAdd = setRosterShowAdd;
    const editingField = rosterEditingField, setEditingField = setRosterEditingField;
    const editValue = rosterEditValue, setEditValue = setRosterEditValue;
    const form = rosterForm, setForm = setRosterForm;
    const sortCol = rosterSortCol, setSortCol = setRosterSortCol;
    const sortDir = rosterSortDir, setSortDir = setRosterSortDir;

    const sorted = useMemo(() => {
      return [...roster].sort((a, b) => {
        let va, vb;
        if (sortCol === "status") { va = a.endDate ? "Inactive" : "Active"; vb = b.endDate ? "Inactive" : "Active"; }
        else if (sortCol === "days") { va = Math.floor((Date.now() - new Date(a.startDate).getTime()) / 86400000); vb = Math.floor((Date.now() - new Date(b.startDate).getTime()) / 86400000); }
        else { va = (a[sortCol] || "").toLowerCase(); vb = (b[sortCol] || "").toLowerCase(); }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }, [roster, sortCol, sortDir]);

    const toggleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
    const sortIcon = (col) => col === sortCol ? (sortDir === "asc" ? <I.SortAsc /> : <I.SortDesc />) : <I.SortNone />;

    const addMember = () => {
      if (!form.name.trim()) return;
      const newMember = { id: uuid(), ...form, name: form.name.trim(), createdAt: new Date().toISOString() };
      saveWithAudit(
        { attendanceRoster: [...roster, newMember] },
        "ADD_ROSTER_MEMBER", "Roster",
        `Added team member: ${form.name.trim()} (${form.title || "No title"})`,
        null,
        { name: form.name.trim(), title: form.title, phone: form.phone, email: form.email, startDate: form.startDate }
      );
      setForm({ name: "", title: "", phone: "", email: "", startDate: today });
      setShowAdd(false);
    };

    const startEdit = (memberId, field, currentValue) => {
      setEditingField({ id: memberId, field });
      setEditValue(currentValue || "");
    };

    const commitEdit = (memberId, field) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const oldVal = member[field] || "";
      const newVal = editValue.trim();
      if (oldVal === newVal) { setEditingField(null); return; }
      const fieldLabel = { name: "Name", title: "Title", phone: "Phone", email: "Email" }[field] || field;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, [field]: newVal } : r);
      // If name changed, also update attendance entries to match
      let newEntries = entries;
      if (field === "name" && oldVal !== newVal) {
        newEntries = entries.map(e => e.name === oldVal ? { ...e, name: newVal } : e);
      }
      saveWithAudit(
        { attendanceRoster: newRoster, attendanceEntries: newEntries },
        "EDIT_ROSTER_FIELD", "Roster",
        `Updated ${fieldLabel} for ${member.name}: "${oldVal}" → "${newVal}"`,
        { [field]: oldVal },
        { [field]: newVal }
      );
      setEditingField(null);
    };

    const setEndDate = (memberId, endDate) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, endDate } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "SET_END_DATE", "Roster",
        `Set end date for ${member.name}: ${endDate}`,
        { endDate: member.endDate || null },
        { endDate }
      );
    };

    const clearEndDate = (memberId) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, endDate: undefined } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "REACTIVATE_MEMBER", "Roster",
        `Reactivated ${member.name} (cleared end date ${member.endDate})`,
        { endDate: member.endDate },
        { endDate: null }
      );
    };

    const setStartDate = (memberId, startDate) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const oldDate = member.startDate;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, startDate } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "EDIT_ROSTER_FIELD", "Roster",
        `Updated Start Date for ${member.name}: "${oldDate}" → "${startDate}"`,
        { startDate: oldDate },
        { startDate }
      );
    };

    const cols = [
      { id: "name", label: "Name", w: "15%", editable: true },
      { id: "status", label: "Status", w: "8%" },
      { id: "title", label: "Title", w: "14%", editable: true },
      { id: "phone", label: "Phone", w: "11%", editable: true },
      { id: "email", label: "Email", w: "16%", editable: true },
      { id: "startDate", label: "Start Date", w: "12%" },
      { id: "endDate", label: "End Date", w: "12%" },
      { id: "days", label: "Days", w: "5%" },
    ];

    const isEditing = (id, field) => editingField && editingField.id === id && editingField.field === field;
    const inputSt = { padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.pri}`, fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box", outline: "none" };

    return (
      <div>
        <button
          onClick={() => nav("ops-hub")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            marginBottom: 24,
            border: "none",
            background: "none",
            color: C.pri,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          ← Back to Operations
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: "#D1FAE5", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{activeRoster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>Active</span>
              </div>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{inactiveRoster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>Inactive</span>
              </div>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{roster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Total</span>
              </div>
            </div>
          </div>
          {canEditRoster && <Btn variant="primary" icon={<I.Plus />} onClick={() => setShowAdd(true)}>Add Team Member</Btn>}
        </div>

        {/* Add member form */}
        {showAdd && (
          <Card style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>New Team Member</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <input placeholder="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Start Date:</span>
              <MiniDatePicker value={form.startDate} onChange={v => setForm({ ...form, startDate: v || today })} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addMember}>Add</Btn>
            </div>
          </Card>
        )}

        {/* Roster table */}
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1B3A5C" }}>
                  {cols.map(col => (
                    <th key={col.id} onClick={() => toggleSort(col.id)} style={{ padding: "10px 12px", textAlign: col.id === "name" ? "left" : "center", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", width: col.w, userSelect: "none", letterSpacing: "0.03em" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{col.label} {sortIcon(col.id)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((member, idx) => {
                  const isActive = !member.endDate;
                  const endTs = member.endDate ? new Date(member.endDate + "T12:00:00").getTime() : Date.now();
                  const days = Math.max(0, Math.floor((endTs - new Date(member.startDate).getTime()) / 86400000));
                  const bgColor = idx % 2 === 0 ? "#E8F0FE" : "#FFFFFF";
                  return (
                    <tr key={member.id} style={{ background: bgColor, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#dde8f8"}
                      onMouseLeave={e => e.currentTarget.style.background = bgColor}>
                      {/* Name */}
                      <td style={{ padding: "9px 12px", fontWeight: 500 }}>
                        {isEditing(member.id, "name") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "name")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "name"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "name", member.name)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.name}</span>
                        )}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        <span onClick={() => { if (canEditRoster && !isActive) clearEndDate(member.id); }} style={{ fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isActive ? "#D1FAE5" : "#FEE2E2", color: isActive ? "#059669" : "#DC2626", cursor: canEditRoster && !isActive ? "pointer" : "default" }} title={canEditRoster && !isActive ? "Click to reactivate" : ""}>{isActive ? "Active" : "Inactive"}</span>
                      </td>
                      {/* Title */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec }}>
                        {isEditing(member.id, "title") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "title")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "title"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "title", member.title)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.title || "—"}</span>
                        )}
                      </td>
                      {/* Phone */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec }}>
                        {isEditing(member.id, "phone") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "phone")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "phone"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "phone", member.phone)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.phone || "—"}</span>
                        )}
                      </td>
                      {/* Email */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec, fontSize: 11 }}>
                        {isEditing(member.id, "email") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "email")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "email"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "email", member.email)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.email || "—"}</span>
                        )}
                      </td>
                      {/* Start Date */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {canEditRoster ? (
                          <MiniDatePicker value={member.startDate} onChange={v => { if (v) setStartDate(member.id, v); }} />
                        ) : (
                          member.startDate ? new Date(member.startDate + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      {/* End Date */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {canEditRoster && isActive ? (
                          <MiniDatePicker value="" onChange={v => { if (v) setEndDate(member.id, v); }} placeholder="—" />
                        ) : canEditRoster && !isActive ? (
                          <MiniDatePicker value={member.endDate} onChange={v => { if (v) { const m = roster.find(r => r.id === member.id); const old = m?.endDate; const newRoster = roster.map(r => r.id === member.id ? { ...r, endDate: v } : r); saveWithAudit({ attendanceRoster: newRoster }, "EDIT_ROSTER_FIELD", "Roster", `Updated End Date for ${member.name}: "${old}" → "${v}"`, { endDate: old }, { endDate: v }); } }} />
                        ) : (
                          member.endDate ? new Date(member.endDate + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      {/* Days */}
                      <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600 }}>{days}</td>
                    </tr>
                  );
                })}
                {roster.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No team members yet. Click "Add Team Member" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Input Tab (Attendance Log) ──
  function InputTab() {
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: "", type: "", date: today, coverage: "No", notes: "", loggedBy: userName });
    const [editingEntry, setEditingEntry] = useState(null);
    const [editForm, setEditForm] = useState({});

    const sortedEntries = useMemo(() => [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")), [entries]);

    const addEntry = () => {
      if (!form.name || !form.type || !form.date) return;
      const newEntry = { id: uuid(), ...form, loggedBy: userName, loggedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      saveWithAudit(
        { attendanceEntries: [...entries, newEntry] },
        "ADD_ATTENDANCE_ENTRY", "Attendance Log",
        `Logged ${form.type} for ${form.name} on ${form.date}`,
        null,
        { name: form.name, type: form.type, date: form.date, coverage: form.coverage, notes: form.notes }
      );
      setForm({ name: "", type: "", date: today, coverage: "No", notes: "", loggedBy: userName });
      setShowAdd(false);
    };

    const deleteEntry = (entry) => {
      saveWithAudit(
        { attendanceEntries: entries.filter(e => e.id !== entry.id) },
        "DELETE_ATTENDANCE_ENTRY", "Attendance Log",
        `Deleted ${entry.type} entry for ${entry.name} on ${entry.date}`,
        { name: entry.name, type: entry.type, date: entry.date, coverage: entry.coverage, notes: entry.notes },
        null
      );
    };

    const startEditEntry = (entry) => {
      setEditingEntry(entry.id);
      setEditForm({ name: entry.name, type: entry.type, date: entry.date, coverage: entry.coverage || "No", notes: entry.notes || "" });
    };

    const commitEditEntry = (entryId) => {
      const original = entries.find(e => e.id === entryId);
      if (!original) return;
      const changes = [];
      if (editForm.name !== original.name) changes.push(`Name: "${original.name}" → "${editForm.name}"`);
      if (editForm.type !== original.type) changes.push(`Type: "${original.type}" → "${editForm.type}"`);
      if (editForm.date !== original.date) changes.push(`Date: "${original.date}" → "${editForm.date}"`);
      if (editForm.coverage !== (original.coverage || "No")) changes.push(`Coverage: "${original.coverage || "No"}" → "${editForm.coverage}"`);
      if (editForm.notes !== (original.notes || "")) changes.push(`Notes updated`);
      if (changes.length === 0) { setEditingEntry(null); return; }
      const newEntries = entries.map(e => e.id === entryId ? { ...e, ...editForm, lastEditedBy: userName, lastEditedAt: new Date().toISOString() } : e);
      saveWithAudit(
        { attendanceEntries: newEntries },
        "EDIT_ATTENDANCE_ENTRY", "Attendance Log",
        `Edited entry for ${original.name}: ${changes.join("; ")}`,
        { name: original.name, type: original.type, date: original.date, coverage: original.coverage, notes: original.notes },
        { ...editForm }
      );
      setEditingEntry(null);
    };

    const editInputSt = { padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.pri}`, fontSize: 11, fontFamily: "inherit", width: "100%", boxSizing: "border-box", outline: "none" };

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ padding: "6px 14px", borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{entries.length}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Total Entries</span>
            </div>
          </div>
          {canEdit && <Btn variant="primary" icon={<I.Plus />} onClick={() => setShowAdd(true)}>Log Incident</Btn>}
        </div>

        {showAdd && (
          <Card style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>New Attendance Entry</div>
            {/* Employee */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Employee</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeRoster.map(r => (
                  <button key={r.id} onClick={() => setForm({ ...form, name: r.name })}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${form.name === r.name ? C.pri : C.border}`, background: form.name === r.name ? C.priLt : C.surface, color: form.name === r.name ? C.pri : C.text, fontSize: 12, fontWeight: form.name === r.name ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (form.name !== r.name) e.currentTarget.style.borderColor = C.pri + "80"; }}
                    onMouseLeave={e => { if (form.name !== r.name) e.currentTarget.style.borderColor = C.border; }}>
                    {r.name}
                  </button>
                ))}
                {activeRoster.length === 0 && <span style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No active employees. Add team members in the Roster tab first.</span>}
              </div>
            </div>
            {/* Absence Type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Absence Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ATTENDANCE_TYPES.map(t => {
                  const clr = ATTENDANCE_TYPE_COLORS[t];
                  const sel = form.type === t;
                  return (
                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                      style={{ padding: "7px 16px", borderRadius: 8, border: `2px solid ${sel ? clr : C.border}`, background: sel ? clr + "18" : C.surface, color: sel ? clr : C.textSec, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                      onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = clr; e.currentTarget.style.color = clr; } }}
                      onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; } }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Coverage + Date row */}
            <div style={{ display: "flex", gap: 24, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Coverage Secured?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setForm({ ...form, coverage: "Yes" })}
                    style={{ padding: "6px 18px", borderRadius: 8, border: `1.5px solid ${form.coverage === "Yes" ? C.suc : C.border}`, background: form.coverage === "Yes" ? "#D1FAE5" : C.surface, color: form.coverage === "Yes" ? "#059669" : C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>Yes</button>
                  <button onClick={() => setForm({ ...form, coverage: "No" })}
                    style={{ padding: "6px 18px", borderRadius: 8, border: `1.5px solid ${form.coverage === "No" ? C.dan : C.border}`, background: form.coverage === "No" ? "#FEE2E2" : C.surface, color: form.coverage === "No" ? "#DC2626" : C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>No</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Shift Date</div>
                <MiniDatePicker value={form.date} onChange={v => setForm({ ...form, date: v || today })} />
              </div>
            </div>
            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMut, marginRight: "auto" }}>Logged by: {form.loggedBy}</span>
              <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addEntry}>Save Entry</Btn>
            </div>
          </Card>
        )}

        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1B3A5C" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 11 }}>Name</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Absence Type</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Shift Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Coverage?</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 11 }}>Notes</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Logged By</th>
                  {canEdit && <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11, width: 70 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => {
                  const isEd = editingEntry === entry.id;
                  return (
                    <tr key={entry.id} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 500 }}>
                        {isEd ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {activeRoster.map(r => {
                              const sel = editForm.name === r.name;
                              return (
                                <button key={r.id} onClick={() => setEditForm({ ...editForm, name: r.name })}
                                  style={{ padding: "3px 9px", borderRadius: 6, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.text, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}>
                                  {r.name}
                                </button>
                              );
                            })}
                          </div>
                        ) : entry.name}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                            {ATTENDANCE_TYPES.map(t => {
                              const clr = ATTENDANCE_TYPE_COLORS[t];
                              const sel = editForm.type === t;
                              return (
                                <button key={t} onClick={() => setEditForm({ ...editForm, type: t })}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${sel ? clr : C.border}`, background: sel ? clr + "18" : C.surface, color: sel ? clr : C.textSec, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}>
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: (ATTENDANCE_TYPE_COLORS[entry.type] || "#999") + "20", color: ATTENDANCE_TYPE_COLORS[entry.type] || "#999" }}>{entry.type}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <MiniDatePicker value={editForm.date} onChange={v => setEditForm({ ...editForm, date: v || editForm.date })} />
                        ) : (
                          entry.date ? new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                            <button onClick={() => setEditForm({ ...editForm, coverage: "Yes" })}
                              style={{ padding: "3px 10px", borderRadius: 6, border: `1.5px solid ${editForm.coverage === "Yes" ? C.suc : C.border}`, background: editForm.coverage === "Yes" ? "#D1FAE5" : C.surface, color: editForm.coverage === "Yes" ? "#059669" : C.textMut, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>Yes</button>
                            <button onClick={() => setEditForm({ ...editForm, coverage: "No" })}
                              style={{ padding: "3px 10px", borderRadius: 6, border: `1.5px solid ${editForm.coverage === "No" ? C.dan : C.border}`, background: editForm.coverage === "No" ? "#FEE2E2" : C.surface, color: editForm.coverage === "No" ? "#DC2626" : C.textMut, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>No</button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600, color: entry.coverage === "Yes" ? C.suc : C.dan }}>{entry.coverage || "No"}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", color: C.textSec, minWidth: 200, maxWidth: 400 }}>
                        {isEd ? (
                          <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} style={{ ...editInputSt, minHeight: 60, resize: "vertical" }} placeholder="Notes..." rows={3} />
                        ) : (
                          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", display: "block", fontSize: 12, lineHeight: 1.5 }}>{entry.notes || "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11 }}>
                        <div style={{ fontWeight: 600, color: C.text }}>{entry.loggedBy || "—"}</div>
                        {entry.loggedAt && <div style={{ fontSize: 9, color: C.textMut, fontWeight: 400 }}>{new Date(entry.loggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(entry.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
                        {entry.lastEditedBy && <div style={{ fontSize: 9, color: C.textMut, fontWeight: 400, marginTop: 2, borderTop: `1px solid ${C.border}`, paddingTop: 2 }}>edited by {entry.lastEditedBy}{entry.lastEditedAt && <span> · {new Date(entry.lastEditedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(entry.lastEditedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>}</div>}
                      </td>
                      {canEdit && (
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          {isEd ? (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => commitEditEntry(entry.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.suc, fontSize: 14 }} title="Save">✓</button>
                              <button onClick={() => setEditingEntry(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, fontSize: 12 }} title="Cancel">✕</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => startEditEntry(entry)} style={{ border: "none", background: "none", cursor: "pointer", color: C.pri, opacity: 0.6, fontSize: 11 }} title="Edit entry">
                                <I.Edit />
                              </button>
                              <button onClick={() => deleteEntry(entry)} style={{ border: "none", background: "none", cursor: "pointer", color: C.dan, opacity: 0.5, fontSize: 11 }} title="Delete entry">
                                <I.Trash />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr><td colSpan={canEdit ? 7 : 6} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No attendance entries yet. Click "Log Incident" to record an occurrence.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Summary Tab ──
  function SummaryTab() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const summaryData = useMemo(() => {
      return activeRoster.map(member => {
        const memberEntries = entries.filter(e => e.name === member.name);
        const byType = {};
        ATTENDANCE_TYPES.forEach(type => {
          const allTime = memberEntries.filter(e => e.type === type).length;
          const last30 = memberEntries.filter(e => e.type === type && e.date > thirtyDaysAgo).length;
          byType[type] = { allTime, last30 };
        });
        const total30 = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].last30, 0);
        const totalAll = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].allTime, 0);
        return { ...member, byType, total30, totalAll };
      }).sort((a, b) => b.totalAll - a.totalAll);
    }, [activeRoster, entries, thirtyDaysAgo]);

    const grandTotals = useMemo(() => {
      const gt = {};
      ATTENDANCE_TYPES.forEach(type => {
        gt[type] = { last30: summaryData.reduce((s, m) => s + m.byType[type].last30, 0), allTime: summaryData.reduce((s, m) => s + m.byType[type].allTime, 0) };
      });
      gt.total30 = summaryData.reduce((s, m) => s + m.total30, 0);
      gt.totalAll = summaryData.reduce((s, m) => s + m.totalAll, 0);
      return gt;
    }, [summaryData]);

    return (
      <div>
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "left", fontSize: 11, verticalAlign: "bottom", borderRight: "1px solid rgba(255,255,255,0.1)" }}>Name</th>
                  {ATTENDANCE_TYPES.map(type => (
                    <th key={type} colSpan={2} style={{ padding: "6px 8px", background: ATTENDANCE_TYPE_COLORS[type], color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10, borderRight: "1px solid rgba(255,255,255,0.2)" }}>{type}</th>
                  ))}
                  <th colSpan={2} style={{ padding: "6px 8px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10 }}>Total Marks</th>
                </tr>
                <tr>
                  {ATTENDANCE_TYPES.map(type => (
                    <React.Fragment key={type}>
                      <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                      <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9, borderRight: "1px solid rgba(255,255,255,0.1)" }}>All Time</th>
                    </React.Fragment>
                  ))}
                  <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                  <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>All Time</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((member, idx) => (
                  <tr key={member.id} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500, borderRight: "1px solid #E5E7EB" }}>{member.name}</td>
                    {ATTENDANCE_TYPES.map(type => (
                      <React.Fragment key={type}>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: member.byType[type].last30 > 0 ? C.text : C.textMut, fontWeight: member.byType[type].last30 > 0 ? 700 : 400 }}>{member.byType[type].last30 || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #E5E7EB", color: member.byType[type].allTime > 0 ? C.text : C.textMut, fontWeight: member.byType[type].allTime > 0 ? 700 : 400 }}>{member.byType[type].allTime || "—"}</td>
                      </React.Fragment>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: member.total30 > 0 ? C.text : C.textMut }}>{member.total30 || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: member.totalAll > 0 ? C.text : C.textMut }}>{member.totalAll || "—"}</td>
                  </tr>
                ))}
                {summaryData.length === 0 && (
                  <tr><td colSpan={2 + ATTENDANCE_TYPES.length * 2 + 2} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 12 }}>No active roster members. Add team members in the Roster tab first.</td></tr>
                )}
              </tbody>
              {summaryData.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#1B3A5C" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fff" }}>Total</td>
                    {ATTENDANCE_TYPES.map(type => (
                      <React.Fragment key={type}>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals[type].last30 || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{grandTotals[type].allTime || "—"}</td>
                      </React.Fragment>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.total30 || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.totalAll || "—"}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Policy Tab ──
  function PolicyTab() {
    const sections = [
      {
        title: "ATTENDANCE TYPES",
        subtitle: "Use these categories when logging incidents on the Attendance Log tab. Listed from least to most severe.",
        items: [
          { type: "Tardy", def: "Employee arrived 5 or more minutes after their scheduled shift start time." },
          { type: "Early Release", def: "Employee left their shift before the scheduled end time (and was not sent home early by a MOD due to overstaffing)." },
          { type: "Call Out (2+ hrs)", def: "Employee called out at least 2 hours before shift start." },
          { type: "Late Call Out (<2 hrs)", def: "Employee called out with less than 2 hours notice before shift start. This is a violation of company policy." },
          { type: "No Call / No Show", def: "Employee did not report to work and did not contact management at all." },
        ],
      },
      {
        title: "PROGRESSIVE COUNSELING PROCESS",
        subtitle: "Discipline escalates with repeated violations. Each step requires documentation. Always consult your director when counseling is required.",
        items: [
          { type: "1. Verbal Warning (Documented)", def: "2 tardies OR 1 uncovered call-out in a rolling 30-day period. Document the conversation and save in employee file." },
          { type: "2. Written Warning", def: "Repeated incidents or any new attendance violation within 60 days of the Verbal Warning. Requires a formal written document signed by the employee." },
          { type: "3. Final Written Warning", def: "Ongoing attendance issues despite previous counseling steps. Employee is made aware that any further violation will result in termination." },
          { type: "4. Termination", def: "Repeated violations after Final Written Warning, or a single major offense such as a No Call / No Show." },
        ],
      },
      {
        title: "IMPORTANT NOTES",
        subtitle: null,
        items: [
          { type: "Emergencies", def: "Emergency situations will be reviewed on a case-by-case basis in partnership with HR. Documentation may be required (e.g., hospital discharge, doctor's note, return-to-work release)." },
          { type: "Voluntary Resignation", def: "An employee who fails to report to work or call in for 3 or more consecutive scheduled shifts is considered to have voluntarily resigned their employment." },
          { type: "Coverage Responsibility", def: "Employees are expected to actively seek coverage from other trained staff when calling out. Failure to attempt coverage may result in formal counseling." },
        ],
      },
    ];

    return (
      <div>
        {sections.map((section, si) => (
          <Card key={si} style={{ marginBottom: 20, overflow: "hidden" }}>
            <div style={{ background: "#1B3A5C", padding: "12px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "0.03em" }}>{section.title}</div>
            </div>
            {section.subtitle && <div style={{ padding: "10px 18px", fontSize: 12, color: C.textSec, fontStyle: "italic", borderBottom: `1px solid ${C.borderLight}` }}>{section.subtitle}</div>}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#2C3E50" }}>
                  <th style={{ padding: "8px 18px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11, width: si === 0 ? "22%" : "28%" }}>{si === 0 ? "Type" : "Step"}</th>
                  <th style={{ padding: "8px 18px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>{si === 0 ? "Definition & When to Use" : "Trigger"}</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 700, textAlign: "center", verticalAlign: "top", fontSize: 12, borderRight: `1px solid ${C.borderLight}` }}>{item.type}</td>
                    <td style={{ padding: "12px 18px", fontSize: 12, lineHeight: 1.6, color: C.textSec }}>{item.def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    );
  }

  // ── Audit Log Tab ──
  function AuditTab() {
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterUser, setFilterUser] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedEntry, setExpandedEntry] = useState(null);

    const categories = useMemo(() => [...new Set(auditLog.map(e => e.category))].sort(), [auditLog]);
    const users = useMemo(() => [...new Set(auditLog.map(e => e.userName))].sort(), [auditLog]);

    const filteredLog = useMemo(() => {
      return [...auditLog]
        .filter(e => filterCategory === "all" || e.category === filterCategory)
        .filter(e => filterUser === "all" || e.userName === filterUser)
        .filter(e => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (e.details || "").toLowerCase().includes(q) || (e.action || "").toLowerCase().includes(q) || (e.userName || "").toLowerCase().includes(q);
        })
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    }, [auditLog, filterCategory, filterUser, searchQuery]);

    const actionColors = {
      ADD_ROSTER_MEMBER: { bg: "#D1FAE5", color: "#059669", label: "Added" },
      EDIT_ROSTER_FIELD: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
      SET_END_DATE: { bg: "#FEE2E2", color: "#DC2626", label: "Deactivated" },
      REACTIVATE_MEMBER: { bg: "#D1FAE5", color: "#059669", label: "Reactivated" },
      ADD_ATTENDANCE_ENTRY: { bg: "#FEF3C7", color: "#D97706", label: "Logged" },
      EDIT_ATTENDANCE_ENTRY: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
      DELETE_ATTENDANCE_ENTRY: { bg: "#FEE2E2", color: "#DC2626", label: "Deleted" },
    };

    const formatTs = (ts) => {
      if (!ts) return "—";
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    };

    return (
      <div>
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Category:</span>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface }}>
              <option value="all">All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>User:</span>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface }}>
              <option value="all">All</option>
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input placeholder="Search audit log..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{filteredLog.length} entries</div>
        </div>

        {/* Log entries */}
        <Card style={{ overflow: "hidden" }}>
          {filteredLog.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>
              {auditLog.length === 0 ? "No audit log entries yet. All changes to the Attendance Tracker will be recorded here." : "No entries match your filters."}
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {filteredLog.map((entry, idx) => {
                const ac = actionColors[entry.action] || { bg: C.bg, color: C.textSec, label: entry.action };
                const isExpanded = expandedEntry === entry.id;
                return (
                  <div key={entry.id} style={{ borderBottom: idx < filteredLog.length - 1 ? `1px solid ${C.borderLight}` : "none", padding: "12px 16px", cursor: "pointer", background: isExpanded ? C.bg : "transparent", transition: "background 0.1s" }}
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#FAFBFC"; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Timestamp + User */}
                      <div style={{ width: 160, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{formatTs(entry.timestamp)}</div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>by {entry.userName} ({entry.userInitials})</div>
                      </div>
                      {/* Action badge */}
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: ac.bg, color: ac.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{ac.label}</span>
                      </div>
                      {/* Category */}
                      <div style={{ flexShrink: 0, width: 100 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase" }}>{entry.category}</span>
                      </div>
                      {/* Details */}
                      <div style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                        {entry.details}
                      </div>
                      {/* Expand indicator */}
                      <div style={{ flexShrink: 0, fontSize: 10, color: C.textMut, transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>
                    </div>
                    {/* Expanded detail */}
                    {isExpanded && (entry.previousValue || entry.newValue) && (
                      <div style={{ marginTop: 12, marginLeft: 172, display: "flex", gap: 20, fontSize: 11 }}>
                        {entry.previousValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#FEE2E2", border: "1px solid #FECACA" }}>
                            <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Previous Value</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'GT Eesti', monospace", fontSize: 11, color: "#7F1D1D" }}>{JSON.stringify(entry.previousValue, null, 2)}</pre>
                          </div>
                        )}
                        {entry.newValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>New Value</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'GT Eesti', monospace", fontSize: 11, color: "#064E3B" }}>{JSON.stringify(entry.newValue, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <button onClick={() => nav("ops-hub")} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, display: "flex", alignItems: "center", padding: 4 }}><I.Back /></button>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Attendance Tracker</h2>
      </div>
      <div style={{ fontSize: 12, color: C.textSec, marginBottom: 20, marginLeft: 36 }}>
        {(data?.locationName) || "Location"}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `2px solid ${C.borderLight}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 20px", border: "none", borderBottom: `3px solid ${tab === t.id ? C.pri : "transparent"}`, background: tab === t.id ? C.priLt : "transparent", color: tab === t.id ? C.pri : C.textSec, fontWeight: tab === t.id ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", borderRadius: "8px 8px 0 0", marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "roster" && <RosterTab />}
      {tab === "input" && <InputTab />}
      {tab === "summary" && <SummaryTab />}
      {tab === "policy" && <PolicyTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}


// ─── AUDIT LOG PAGE (from POS App) ────────────────────────────────────────
function AuditLogPage({ data, save, nav, profile }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("7d");

  const allLogs = useMemo(() => {
    const logs = (data.auditLog || []).slice().sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const now = new Date();
    const cutoff = dateRange === "7d" ? new Date(now - 7*86400000) :
                   dateRange === "30d" ? new Date(now - 30*86400000) :
                   dateRange === "90d" ? new Date(now - 90*86400000) : null;
    const dated = cutoff ? logs.filter(l => new Date(l.timestamp) >= cutoff) : logs;
    const typed = filter === "all" ? dated :
                  filter === "logins" ? dated.filter(l => l.action === "Employee Sign-In" || l.action === "Account Switch") :
                  filter === "reservations" ? dated.filter(l => l.reservationId) :
                  filter === "settings" ? dated.filter(l => l.action?.includes("Settings") || l.action?.includes("Config")) :
                  dated;
    if (search.trim()) {
      const q = search.toLowerCase();
      return typed.filter(l =>
        (l.userName || "").toLowerCase().includes(q) ||
        (l.action || "").toLowerCase().includes(q) ||
        JSON.stringify(l.details || []).toLowerCase().includes(q)
      );
    }
    return typed;
  }, [data.auditLog, filter, dateRange, search]);

  const actionColor = (action) => {
    if (action === "Employee Sign-In") return C.suc;
    if (action === "Account Switch") return C.warn;
    if (action === "Checked In") return "#22C55E";
    if (action === "Checked Out") return "#3B82F6";
    if (action === "Collected Payment") return "#8B5CF6";
    if (action === "Cancelled") return C.dan;
    return C.textSec;
  };

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, marginBottom: 4 }}>Audit Log</h2>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Employee logins, reservation changes, and system activity.</p>
        </div>
        <button onClick={() => nav("ops-hub")} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.textSec }}>← Back to Operations</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, action, or detail..." style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none" }} />
        {["all", "logins", "reservations", "settings"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${filter === f ? C.pri : C.border}`, background: filter === f ? C.priLt : "transparent", color: filter === f ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{f === "all" ? "All Activity" : f}</button>
        ))}
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text }}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", value: allLogs.length, color: C.pri },
          { label: "Logins", value: allLogs.filter(l => l.action === "Employee Sign-In").length, color: C.suc },
          { label: "Account Switches", value: allLogs.filter(l => l.action === "Account Switch").length, color: C.warn },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 18px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}`, minWidth: 130 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Log entries */}
      <div style={{ background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
        {allLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No audit log entries found for the selected filters.</div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Time</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>User</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Action</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.slice(0, 200).map((log, i) => {
                  const details = Array.isArray(log.details) ? log.details : [];
                  const ts = log.timestamp ? new Date(log.timestamp) : null;
                  return (
                    <tr key={log.id || i} style={{ borderBottom: `1px solid ${C.border}20` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: C.textSec, fontSize: 12 }}>
                        {ts ? `${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{log.userName || log.changedBy || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: actionColor(log.action) + "18", color: actionColor(log.action) }}>{log.action || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSec, fontSize: 12, maxWidth: 400 }}>
                        {details.length > 0 ? details.map((d, j) => (
                          <span key={j}>
                            {j > 0 && " · "}
                            <span style={{ fontWeight: 600 }}>{d.field}:</span> {d.oldVal && d.oldVal !== "—" ? <><span style={{ textDecoration: "line-through", opacity: 0.6 }}>{d.oldVal}</span> → </> : ""}{d.newVal || "—"}
                          </span>
                        )) : log.reservationId ? `Reservation ${log.reservationId.slice(0, 8)}...` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {allLogs.length > 200 && <div style={{ padding: "12px 14px", textAlign: "center", color: C.textMut, fontSize: 12 }}>Showing first 200 of {allLogs.length} entries</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Client Page ──────────────────────────────────────────────────────
function NewClientPage({ data, save, nav, profile, addGlobalToast }) {
  const clientFields = data.clientFields || DEF_CLIENT_FIELDS;
  const dogFields = data.dogFields || DEF_DOG_FIELDS;
  const [fields, setFields] = useState({});
  const [dogFields_, setDogFields_] = useState({});
  const [errors, setErrors] = useState({});
  const [addDog, setAddDog] = useState(false);

  const handleSave = async () => {
    const errs = validateClientFields(clientFields, fields);
    if (fields.phone) {
      const ex = data.clients.find(c => c.fields.phone === (fields.phone || "").replace(/\D/g, ""));
      if (ex) errs.phone = "Phone already exists";
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const nc = { id: "lc_" + Date.now() + "_" + Math.random().toString(36).slice(2,8), fields: { ...fields, phone: (fields.phone || "").replace(/\D/g, "") }, createdAt: new Date().toISOString().slice(0,10), agreements: {} };
    const newClients = [...data.clients, nc];
    let newDogs = data.dogs;
    if (addDog && dogFields_.name) {
      const nd = { id: "ld_" + Date.now() + "_" + Math.random().toString(36).slice(2,8), clientId: nc.id, fields: { ...dogFields_ }, tags: [] };
      newDogs = [...data.dogs, nd];
    }
    await save({ ...data, clients: newClients, dogs: newDogs });
    const name = `${nc.fields.first_name || ""} ${nc.fields.last_name || ""}`.trim();
    if (addGlobalToast) addGlobalToast({ message: `Client "${name}" created` });
    nav("client-detail", { clientId: nc.id });
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 800, color: C.text }}>New Client</h2>
      <Card style={{ padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Client Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {clientFields.filter(f => f.type !== "textarea").map(f => (
            <div key={f.id}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>
                {f.name}{isFieldRequired(f, "create") && <span style={{ color: C.dan }}> *</span>}
              </label>
              {f.type === "select" ? (
                <select value={fields[f.id] || ""} onChange={e => { setFields({ ...fields, [f.id]: e.target.value }); setErrors({ ...errors, [f.id]: undefined }); }}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${errors[f.id] ? C.dan : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text }}>
                  <option value="">Select...</option>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type || "text"} value={fields[f.id] || ""} onChange={e => { setFields({ ...fields, [f.id]: e.target.value }); setErrors({ ...errors, [f.id]: undefined }); }}
                  placeholder={f.isKey ? "Primary key - must be unique" : ""}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${errors[f.id] ? C.dan : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none", boxSizing: "border-box" }} />
              )}
              {errors[f.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors[f.id]}</div>}
            </div>
          ))}
        </div>
        {clientFields.filter(f => f.type === "textarea").map(f => (
          <div key={f.id} style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
            <textarea value={fields[f.id] || ""} onChange={e => setFields({ ...fields, [f.id]: e.target.value })}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
          </div>
        ))}

        {/* Add Dog Section */}
        <div style={{ marginTop: 24, borderTop: `1.5px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dog Information</div>
            <button onClick={() => setAddDog(!addDog)} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${addDog ? C.dan : C.pri}`, background: addDog ? C.danLt : C.priLt, color: addDog ? C.dan : C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {addDog ? "Remove Dog" : "+ Add Dog"}
            </button>
          </div>
          {addDog && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {dogFields.filter(f => f.type !== "textarea").map(f => (
                <div key={f.id}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
                  {f.type === "select" ? (
                    <select value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text }}>
                      <option value="">Select...</option>
                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type || "text"} value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none", boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              {dogFields.filter(f => f.type === "textarea").map(f => (
                <div key={f.id} style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
                  <textarea value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 28 }}>
          <button onClick={() => nav("lifecycle")} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: C.textSec }}>Cancel</button>
          <Btn onClick={handleSave}>Create Client</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Enterprise Operations Matrix ─────────────────────────────────────────
function EnterpriseOpsMatrix() {
  const locations = [
    { id: "ch", name: "Cherry Hill", opening: 92, frontend: 88, backend: 95, closing: 85, rooms: 100, pictures: 70, privatePlay: 78 },
    { id: "demo", name: "Demo Location", opening: 65, frontend: 70, backend: 72, closing: 60, rooms: 80, pictures: 45, privatePlay: 55 },
  ];

  const categories = ["Opening", "Front-End", "Back-End", "Closing", "Rooms", "Pictures", "Private Play"];

  const getColor = (val) => {
    if (val >= 80) return C.suc;
    if (val >= 50) return C.warn;
    return C.dan;
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Enterprise Operations Overview</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>Completion percentages across all locations.</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1.5px solid ${C.border}` }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: C.text, minWidth: 140 }}>Location</th>
              {categories.map(cat => (
                <th key={cat} style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text, minWidth: 100 }}>{cat}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc, idx) => (
              <tr key={loc.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.surface : "rgba(245,246,248,0.5)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: C.text }}>{loc.name}</td>
                {categories.map(cat => {
                  const key = cat.toLowerCase().replace(/\s+/g, "").replace("-", "");
                  const val = loc[key] || 0;
                  return (
                    <td key={cat} style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "inline-block", padding: "6px 12px", borderRadius: 6, background: `${getColor(val)}15`, color: getColor(val), fontWeight: 600 }}>{val}%</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Enterprise Attendance ────────────────────────────────────────────────
function EnterpriseAttendance() {
  const locationStats = [
    { id: "ch", name: "Cherry Hill", activeStaff: 12, tardies: 3, callOuts: 2, perfectAttendance: 83 },
    { id: "demo", name: "Demo Location", activeStaff: 8, tardies: 1, callOuts: 1, perfectAttendance: 88 },
  ];

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Enterprise Attendance</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>Aggregated attendance data across all locations (30-day period).</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1.5px solid ${C.border}` }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: C.text }}>Location</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Active Staff</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Tardies (30d)</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Call Outs (30d)</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Perfect Attendance %</th>
            </tr>
          </thead>
          <tbody>
            {locationStats.map((loc, idx) => (
              <tr key={loc.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.surface : "rgba(245,246,248,0.5)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: C.text }}>{loc.name}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.activeStaff}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.tardies}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.callOuts}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: loc.perfectAttendance >= 80 ? C.sucLt : C.warnLt, color: loc.perfectAttendance >= 80 ? C.suc : C.warn, fontWeight: 600, fontSize: 12 }}>{loc.perfectAttendance}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Enterprise User Management ───────────────────────────────────────────
function EnterpriseUserManagement({ profile }) {
  const isEnterpriseAdmin = profile?.role === "enterprise_admin" || profile?.role === "owner";
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  const enterprises = [
    { id: "ch", name: "Cherry Hill", adminName: "Alice Johnson", adminEmail: "alice@k9resorts.com" },
    { id: "demo", name: "Demo Location", adminName: "Bob Smith", adminEmail: "bob@k9resorts.com" },
  ];

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>User Management</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: C.text }}>Enterprise Admins</h3>
          <Card style={{ padding: "16px 20px", background: C.bg, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 12 }}>Current Enterprise Admins can add new Enterprise Admins. {!isEnterpriseAdmin && "You don't have permission to create Enterprise Admins."}</div>
            {isEnterpriseAdmin && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Full name" style={{ padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Email" style={{ padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                <button style={{ padding: "10px 20px", background: isEnterpriseAdmin ? C.pri : C.textMut, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isEnterpriseAdmin ? "pointer" : "default", fontFamily: "inherit", opacity: isEnterpriseAdmin ? 1 : 0.5 }}>Create Admin</button>
              </div>
            )}
          </Card>
        </div>

        <div>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: C.text }}>Locations & Admins</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {enterprises.map(loc => (
              <Card key={loc.id} style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{loc.name}</div>
                    <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>Admin: {loc.adminName} ({loc.adminEmail})</div>
                  </div>
                  <button style={{ padding: "8px 16px", background: C.pri, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Manage Users</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Revenue Intelligence Reports (Lite) ────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// CHECKOUT TV PAGE
// ════════════════════════════════════════════════════════════════════════════
function CheckoutTVPage({ data, nav }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = todayStr();
  const reservations = data.reservations || [];
  const dogs = data.dogs || [];
  const clients = data.clients || [];

  // All checked-in daycare + boarding dogs
  const checkedIn = reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare") &&
    r.status === "checked-in" &&
    r.checkIn <= today && r.checkOut >= today
  );

  // Deduplicate by dogId (one dog could have overlapping reservations)
  const seen = new Set();
  const uniqueDogs = checkedIn.filter(r => {
    if (seen.has(r.dogId)) return false;
    seen.add(r.dogId);
    return true;
  }).sort((a, b) => {
    const aD = dogs.find(d => d.id === a.dogId);
    const bD = dogs.find(d => d.id === b.dogId);
    return ((aD?.fields?.name || "").localeCompare(bD?.fields?.name || ""));
  });

  const daycareDogs = uniqueDogs.filter(r => r.type === "daycare");
  const boardingDogs = uniqueDogs.filter(r => r.type === "boarding");

  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const DogCard = ({ res }) => {
    const dog = dogs.find(d => d.id === res.dogId);
    const client = clients.find(c => c.id === res.clientId);
    const name = dog?.fields?.name || res._animalName || "Unknown";
    const breed = dog?.fields?.breed || "";
    const ownerLast = client?.fields?.last_name || res._ownerName?.split(" ").pop() || "";
    const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || "" : "";

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px",
        background: "rgba(255,255,255,0.06)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
        minWidth: 140, transition: "transform 0.2s",
      }}>
        {dog?._image ? (
          <img src={dog._image} alt={name} style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", border: "2px solid rgba(255,255,255,0.15)", marginBottom: 8 }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 14, background: "rgba(175,141,84,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#AF8D54", marginBottom: 8 }}>
            {name[0]}
          </div>
        )}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2 }}>{name}</div>
        {breed && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, textAlign: "center" }}>{breed}</div>}
        <div style={{ fontSize: 11, color: "rgba(175,141,84,0.8)", marginTop: 4, fontWeight: 600 }}>{ownerLast}</div>
        {roomNum && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Room {roomNum}</div>}
      </div>
    );
  };

  const SectionLabel = ({ label, count, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, marginTop: 24 }}>
      <div style={{ width: 6, height: 28, borderRadius: 3, background: color }} />
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>({count})</div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #001A33 0%, #00112A 50%, #000A1A 100%)",
      padding: "32px 40px", fontFamily: "'GT Eesti', -apple-system, sans-serif", overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>K9 Cherry Hill</div>
          <div style={{ fontSize: 13, color: "rgba(175,141,84,0.7)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>Checkout Board</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{dateStr}</div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 24, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Daycare: <span style={{ fontWeight: 800, color: "#0EA5E9" }}>{daycareDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Boarding: <span style={{ fontWeight: 800, color: "#AF8D54" }}>{boardingDogs.length}</span></div>
      </div>

      {/* Daycare section */}
      {daycareDogs.length > 0 && (
        <div>
          <SectionLabel label="Daycare" count={daycareDogs.length} color="#0EA5E9" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {daycareDogs.map(r => <DogCard key={r.id} res={r} />)}
          </div>
        </div>
      )}

      {/* Boarding section */}
      {boardingDogs.length > 0 && (
        <div>
          <SectionLabel label="Boarding" count={boardingDogs.length} color="#AF8D54" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {boardingDogs.map(r => <DogCard key={r.id} res={r} />)}
          </div>
        </div>
      )}

      {uniqueDogs.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>No dogs checked in today</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations Lite · Auto-refreshes in real-time</div>
      </div>

      {/* Floating Exit Button — subtle, top-left corner */}
      <button
        onClick={() => nav("operations")}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0.3; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        style={{
          position: "fixed", top: 16, left: 16, zIndex: 100,
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700, opacity: 0.3,
          transition: "opacity 0.2s, background 0.2s",
        }}
        title="Exit Checkout TV"
      >
        ✕
      </button>
    </div>
  );
}

function LiteReportsPage({ data, nav }) {
  const today = todayStr();
  const [timeRange, setTimeRange] = useState("month");
  const [compareMode, setCompareMode] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [animEpoch, setAnimEpoch] = useState(0);
  const [nlpQuery, setNlpQuery] = useState("");
  const [nlpResults, setNlpResults] = useState(null);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [showNLPSuggestions, setShowNLPSuggestions] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [accrualSortConfig, setAccrualSortConfig] = useState({ key: "checkIn", direction: "desc" });
  const [cashTableOpen, setCashTableOpen] = useState(false);
  const [accrualTableOpen, setAccrualTableOpen] = useState(false);


  const changeTimeRange = (range) => { setTimeRange(range); setAnimEpoch(e => e + 1); };

  const nlpSuggestionsBank = [
    { cat: "Revenue", q: "Revenue by suite type" },
    { cat: "Revenue", q: "Revenue by category" },
    { cat: "Revenue", q: "Revenue trend over time" },
    { cat: "Revenue", q: "MoM revenue growth" },
    { cat: "Clients", q: "Top 10 clients by spend" },
    { cat: "Clients", q: "New clients this period" },
    { cat: "Operations", q: "Occupancy rate by room type" },
    { cat: "Operations", q: "Average length of stay" },
    { cat: "Operations", q: "Busiest day of the week" },
    { cat: "Analysis", q: "Discount impact analysis" },
    { cat: "Analysis", q: "Add-on attach rate" },
    { cat: "Analysis", q: "Payment method breakdown" },
    { cat: "Analysis", q: "Booking source breakdown" },
    { cat: "Analysis", q: "RevPAR analysis" },
  ];

  const _SYN = {
    revenue: ["revenue", "income", "earnings", "sales", "money", "made", "earned", "brought in", "collected", "gross", "net"],
    client: ["client", "customer", "owner", "pet parent", "person", "people", "who"],
    dog: ["dog", "pet", "pup", "puppy", "animal", "canine", "fur baby"],
    boarding: ["boarding", "stay", "stayed", "overnight", "boarded", "nights", "sleepover"],
    daycare: ["daycare", "day care", "day-care", "daytime", "day visit"],
    room: ["room", "suite", "compartment", "kennel", "unit", "space"],
    occupancy: ["occupancy", "occupied", "full", "empty", "availability", "utilization", "capacity"],
    discount: ["discount", "coupon", "promo", "promotion", "deal", "savings", "markdown", "reduction"],
    addon: ["add-on", "addon", "add on", "extra", "upsell", "service", "bath", "groom", "upgrade"],
    payment: ["payment", "pay", "paid", "charge", "transaction", "card", "cash", "check"],
    category: ["category", "type", "kind", "breakdown", "segment", "group"],
    trend: ["trend", "over time", "growth", "change", "trajectory", "direction", "progress", "history"],
    top: ["top", "best", "highest", "most", "biggest", "leading", "largest"],
    bottom: ["bottom", "worst", "lowest", "least", "smallest", "fewest"],
    average: ["average", "avg", "mean", "typical", "per"],
    compare: ["compare", "vs", "versus", "compared", "against", "difference"],
    busiest: ["busiest", "busiest", "peak", "popular", "high traffic", "most active"],
    source: ["source", "booking source", "channel", "where", "online", "phone", "walk-in", "walk in"],
    breed: ["breed", "species", "type of dog"],
    frequency: ["frequency", "often", "frequent", "repeat", "returning", "loyal", "retention"],
    new: ["new", "first time", "first-time", "new client", "new customer", "acquired"],
    length: ["length", "duration", "how long", "nights", "days", "stay length"],
    revpar: ["revpar", "rev par", "revenue per available room"],
  };

  const _matchScore = (q, terms) => terms.reduce((sc, t) => sc + (q.includes(t) ? (t.includes(" ") ? 3 : 1) : 0), 0);

  const _INTENTS = useMemo(() => [
    { id: "rev_by_suite", keywords: ["revenue", "suite", "room type", "room", "boarding revenue"], requiredAny: ["suite", "room", "type"], score: 0 },
    { id: "rev_by_category", keywords: ["revenue", "category", "breakdown", "by category", "segment"], requiredAny: ["category", "segment", "breakdown"], score: 0 },
    { id: "rev_trend", keywords: ["revenue", "trend", "over time", "growth", "trajectory", "history", "month over month", "mom", "week over week"], requiredAny: ["trend", "over time", "growth", "history", "mom", "trajectory"], score: 0 },
    { id: "rev_total", keywords: ["total revenue", "how much", "made", "earned", "total sales", "gross revenue"], requiredAny: ["total", "how much", "made", "earned"], score: 0 },
    { id: "top_clients", keywords: ["top", "client", "customer", "spend", "best", "highest", "most", "biggest spender"], requiredAny: ["client", "customer", "spend", "spender"], score: 0 },
    { id: "new_clients", keywords: ["new", "first time", "acquired", "client", "customer"], requiredAny: ["new", "first time", "first-time"], score: 0 },
    { id: "client_frequency", keywords: ["repeat", "returning", "loyal", "frequent", "retention", "client", "customer", "how often"], requiredAny: ["repeat", "returning", "loyal", "frequent", "retention", "how often"], score: 0 },
    { id: "payment_methods", keywords: ["payment", "method", "card", "cash", "check", "how", "paid"], requiredAny: ["payment", "method", "card", "cash", "check", "paid"], score: 0 },
    { id: "booking_sources", keywords: ["booking", "source", "channel", "online", "phone", "walk-in", "where", "booked"], requiredAny: ["source", "channel", "where", "booked", "online", "walk-in"], score: 0 },
    { id: "occupancy", keywords: ["occupancy", "occupied", "full", "empty", "capacity", "utilization", "availability"], requiredAny: ["occupancy", "occupied", "full", "empty", "capacity", "utilization"], score: 0 },
    { id: "occupancy_by_room", keywords: ["occupancy", "room", "suite", "type", "by room", "by suite"], requiredAny: ["occupancy", "occupied"], requiredAll: ["room", "suite", "type"], score: 0 },
    { id: "avg_stay", keywords: ["average", "length", "stay", "duration", "nights", "how long", "typical"], requiredAny: ["length", "duration", "how long", "stay", "nights"], score: 0 },
    { id: "busiest_day", keywords: ["busiest", "peak", "popular", "day of week", "which day", "day", "most active"], requiredAny: ["busiest", "peak", "which day", "day of week", "most active"], score: 0 },
    { id: "discount_impact", keywords: ["discount", "coupon", "promo", "impact", "analysis", "savings", "leakage"], requiredAny: ["discount", "coupon", "promo"], score: 0 },
    { id: "addon_analysis", keywords: ["add-on", "addon", "add on", "attach", "upsell", "extra", "bath", "groom", "service"], requiredAny: ["add-on", "addon", "add on", "attach", "upsell", "bath", "groom"], score: 0 },
    { id: "revpar", keywords: ["revpar", "rev par", "revenue per available room", "per room"], requiredAny: ["revpar", "rev par", "per room", "per available"], score: 0 },
    { id: "top_dogs", keywords: ["top", "dog", "pet", "most", "frequent", "popular", "booked"], requiredAny: ["dog", "pet", "pup"], score: 0 },
    { id: "breed_breakdown", keywords: ["breed", "type of dog", "breakdown", "mix"], requiredAny: ["breed"], score: 0 },
    { id: "rev_by_service", keywords: ["revenue", "service", "boarding", "daycare", "by service"], requiredAny: ["service", "boarding vs", "daycare vs"], score: 0 },
  ], []);

  const getDateRange = (range) => {
    if (range === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    let from = today;
    if (range === "today") from = today;
    else if (range === "week") from = addDays(today, -7);
    else if (range === "month") from = addDays(today, -30);
    else if (range === "quarter") from = addDays(today, -90);
    else if (range === "year") from = addDays(today, -365);
    return { from, to: today };
  };

  const { from: dateFrom, to: dateTo } = getDateRange(timeRange);
  const days = (() => {
    if (timeRange === "custom" && customFrom && customTo) {
      return Math.max(1, Math.round((new Date(customTo) - new Date(customFrom)) / 86400000));
    }
    return timeRange === "today" ? 1 : timeRange === "week" ? 7 : timeRange === "month" ? 30 : timeRange === "quarter" ? 90 : 365;
  })();
  const prevFrom = addDays(dateFrom, -days);
  const prevTo = addDays(dateFrom, -1);

  const fmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
  const fmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : fmt$(v);
  const fmtPercent = (v) => `${typeof v === "number" ? v.toFixed(1) : "0.0"}%`;
  const fmtDateLabel = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`; };

  const cashBasisData = useMemo(() => {
    const allRes = (data.reservations || []).filter(r => r.status !== "cancelled" && r.pricing?.total > 0);
    const calcMetrics = (resInRange) => {
      const total = resInRange.reduce((sum, r) => sum + (r.pricing?.total || 0), 0);
      const byCategory = {}, byMethod = { "gingr": 0 }, bySource = { "gingr": 0 }, byDate = {};
      resInRange.forEach(r => {
        const cat = r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : r.type === "evaluation" ? "Evaluation" : "Other";
        byCategory[cat] = (byCategory[cat] || 0) + (r.pricing?.total || 0);
        byMethod["gingr"] += 1;
        bySource["gingr"] += (r.pricing?.total || 0);
        const dt = r.checkIn || today;
        byDate[dt] = (byDate[dt] || 0) + (r.pricing?.total || 0);
      });
      return { total, count: resInRange.length, byCategory, byMethod, bySource, byDate, avgTransaction: resInRange.length > 0 ? total / resInRange.length : 0, payments: resInRange.map(r => ({
        id: r.id, amount: r.pricing?.total || 0, timestamp: r.checkIn + "T12:00:00", method: "gingr",
        category: r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : "Other",
        reservationId: r.id,
      })) };
    };
    const currentRes = allRes.filter(r => r.checkIn >= dateFrom && r.checkIn <= dateTo);
    const previousRes = compareMode ? allRes.filter(r => r.checkIn >= prevFrom && r.checkIn <= prevTo) : [];
    const current = calcMetrics(currentRes);
    const previous = calcMetrics(previousRes);
    return {
      current, previous,
      trend: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0,
      trendAvg: previous.count > 0 ? ((current.avgTransaction - previous.avgTransaction) / previous.avgTransaction) * 100 : 0,
    };
  }, [data.reservations, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  const accrualData = useMemo(() => {
    const reservations = data.reservations || [];
    const processDateRange = (from, to) => {
      const daysList = []; let cur = from;
      while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }
      const dayData = {};
      daysList.forEach(d => { dayData[d] = { boardingRevenue: 0, daycareRevenue: 0, feedingRevenue: 0, medicationRevenue: 0, addOnRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 }; });
      reservations.forEach(res => {
        if (res.status === "cancelled") return;
        if (res.type === "boarding" && res.checkIn && res.checkOut) {
          const totalNights = countNights(res.checkIn, res.checkOut);
          if (totalNights <= 0) return;
          const perNightRate = (res.pricing?.total || 0) / totalNights;
          let night = res.checkIn;
          while (night < res.checkOut) {
            if (night >= from && night <= to && dayData[night]) {
              dayData[night].boardingRevenue += perNightRate;
              dayData[night].roomsOccupied += 1;
            }
            night = addDays(night, 1);
          }
        } else if (res.type === "daycare" && res.checkIn && res.checkIn >= from && res.checkIn <= to) {
          if (dayData[res.checkIn]) dayData[res.checkIn].daycareRevenue += (res.pricing?.total || 0);
        }
      });
      daysList.forEach(d => {
        dayData[d].totalRevenue = dayData[d].boardingRevenue + dayData[d].daycareRevenue;
        dayData[d].netRevenue = dayData[d].totalRevenue - dayData[d].discounts;
      });
      const totals = { boardingRevenue: 0, daycareRevenue: 0, feedingRevenue: 0, medicationRevenue: 0, addOnRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
      daysList.forEach(d => { Object.keys(totals).forEach(k => { totals[k] += dayData[d][k]; }); });
      return { dayData, totals, days: daysList };
    };
    const current = processDateRange(dateFrom, dateTo);
    const previous = compareMode ? processDateRange(prevFrom, prevTo) : { dayData: {}, totals: { totalRevenue: 0, discounts: 0 }, days: [] };
    const allRooms = data.rooms || {};
    const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
    const revenueTrend = previous.totals.totalRevenue > 0 ? ((current.totals.totalRevenue - previous.totals.totalRevenue) / previous.totals.totalRevenue) * 100 : 0;
    const occupancyRate = totalRoomCount > 0 && current.days.length > 0 ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 : 0;
    const revPAR = totalRoomCount > 0 && current.days.length > 0 ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) : 0;
    return { current, previous, revenueTrend, occupancyRate, revPAR, days: current.days };
  }, [data.reservations, data.rooms, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  const discountBreakdown = useMemo(() => {
    // Estimate discounts by comparing actual price to rack rate × nights
    const rackRates = LITE_DEF_PRICING.boardingRates;
    const reservations = (data.reservations || []).filter(r =>
      r.status !== "cancelled" && r.type === "boarding" &&
      r.checkIn >= dateFrom && r.checkIn <= dateTo
    );
    let discounted = 0, atRack = 0, totalRackRevenue = 0, totalActualRevenue = 0;
    reservations.forEach(res => {
      const nights = countNights(res.checkIn, res.checkOut);
      if (nights <= 0) return;
      const actual = res.pricing?.total || 0;
      // Determine rack rate from reservation type name
      const typeName = res._resTypeName || "";
      const rackRate = Object.entries(rackRates).find(([k]) => typeName.toLowerCase().includes(k.toLowerCase()))?.[1] || 0;
      const expectedRack = rackRate * nights;
      totalRackRevenue += expectedRack;
      totalActualRevenue += actual;
      if (expectedRack > 0 && actual < expectedRack * 0.98) { // 2% tolerance
        discounted++;
      } else {
        atRack++;
      }
    });
    const totalDiscounts = Math.max(0, totalRackRevenue - totalActualRevenue);
    const grossRevenue = accrualData.current.totals.totalRevenue;
    return {
      byType: { none: atRack, percent: 0, flat: 0, coupon: 0, multidog: discounted },
      byAmount: { none: 0, percent: 0, flat: 0, coupon: 0, multidog: totalDiscounts },
      grossRevenue,
      totalDiscounts,
      hasEstimates: true,
    };
  }, [accrualData.current, data.reservations, dateFrom, dateTo]);

  const transactionsData = useMemo(() => {
    let transactions = (cashBasisData.current.payments || []).map(p => {
      const res = (data.reservations || []).find(r => r.id === p.reservationId);
      const dog = res ? (data.dogs || []).find(d => d.id === res.dogId) : null;
      const client = res ? (data.clients || []).find(c => c.id === res.clientId) : null;
      return { id: p.id, date: p.timestamp?.split("T")[0] || "—", clientName: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : (res?._ownerName || "—"), dogName: dog?.fields?.name || (res?._animalName || "—"), service: p.category || "—", room: res?.room || "—", amount: p.amount || 0, method: "Gingr", source: "Gingr", reservationId: p.reservationId };
    });
    if (transactionSearch) {
      const q = transactionSearch.toLowerCase();
      transactions = transactions.filter(t => t.clientName.toLowerCase().includes(q) || t.dogName.toLowerCase().includes(q) || t.date.includes(q));
    }
    transactions.sort((a, b) => {
      const aVal = a[sortConfig.key], bVal = b[sortConfig.key];
      const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortConfig.direction === "desc" ? -cmp : cmp;
    });
    return transactions;
  }, [cashBasisData.current.payments, data.reservations, data.dogs, data.clients, sortConfig, transactionSearch]);

  const accrualReservationsData = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => {
      if (r.status === "cancelled") return false;
      if (r.checkOut < dateFrom || r.checkIn > dateTo) return false;
      return r.type === "boarding";
    });
    let processed = reservations.map(res => {
      const dog = (data.dogs || []).find(d => d.id === res.dogId);
      const client = (data.clients || []).find(c => c.id === res.clientId);
      const nights = countNights(res.checkIn, res.checkOut);
      const retailTotal = res.pricing?.total || 0;
      const nightlyRate = nights > 0 ? retailTotal / nights : 0;
      return {
        id: res.id, dogName: dog?.fields?.name || (res._animalName || "—"),
        clientName: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : (res._ownerName || "—"),
        roomType: res._resTypeName || "Boarding", checkIn: res.checkIn, checkOut: res.checkOut, nights, nightlyRate,
        retailTotal, discountType: "none", discountAmount: 0, netTotal: retailTotal,
        status: res.checkOut <= today ? "checked-out" : res.checkIn <= today ? "active" : "upcoming",
        reservationId: res.id,
      };
    });
    processed.sort((a, b) => {
      const aVal = a[accrualSortConfig.key], bVal = b[accrualSortConfig.key];
      const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return accrualSortConfig.direction === "desc" ? -cmp : cmp;
    });
    return processed;
  }, [data.reservations, data.dogs, data.clients, accrualSortConfig, dateFrom, dateTo]);

  const classifyIntent = useCallback((query) => {
    const q = query.toLowerCase().trim();
    let best = null, bestScore = 0;
    for (const intent of _INTENTS) {
      let score = _matchScore(q, intent.keywords);
      if (intent.requiredAny && intent.requiredAny.some(t => q.includes(t))) score += 5;
      else if (intent.requiredAny) score = Math.max(0, score - 10);
      if (intent.requiredAll && !intent.requiredAll.some(t => q.includes(t))) score = Math.max(0, score - 5);
      if (score > bestScore) { bestScore = score; best = intent.id; }
    }
    return { intent: best, confidence: bestScore };
  }, [_INTENTS]);

  const extractEntities = useCallback((query) => {
    const q = query.toLowerCase().trim();
    const entities = {};
    const limitMatch = q.match(/(?:top|bottom|first|last)\s+(\d+)/);
    entities.limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    entities.sortDir = (q.includes("bottom") || q.includes("least") || q.includes("lowest") || q.includes("worst")) ? "asc" : "desc";
    if (q.includes("luxury")) entities.roomType = "Luxury Suite";
    else if (q.includes("executive")) entities.roomType = "Executive Room";
    else if (q.includes("double")) entities.roomType = "Double Compartment";
    else if (q.includes("single")) entities.roomType = "Single Compartment";
    return entities;
  }, []);

  const _agg = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.type === "boarding" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const allReservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const payments = cashBasisData.current.payments || [];
    const dogs = data.dogs || [];
    const clients = data.clients || [];
    const pricing = LITE_DEF_PRICING;
    const br = LITE_DEF_PRICING.boardingRates;
    const allRooms = data.rooms || {};
    const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
    return {
      revBySuite: () => {
        const byType = {};
        reservations.forEach(res => { const n = countNights(res.checkIn, res.checkOut); byType[res.roomType] = (byType[res.roomType] || 0) + ((br[res.roomType] || 0) * n); });
        const total = Object.values(byType).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Boarding Revenue by Suite Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Suite Type", "Revenue", "Share", "Reservations"],
          rows: Object.entries(byType).sort(([, a], [, b]) => b - a).map(([type, rev]) => {
            const cnt = reservations.filter(r => r.roomType === type).length;
            return [type, fmt$(rev), fmtPercent(total > 0 ? (rev / total) * 100 : 0), String(cnt)];
          }),
          followUps: ["Occupancy rate by room type", "Revenue trend over time", "Average length of stay"] };
      },
      revByCategory: () => {
        const cats = cashBasisData.current.byCategory;
        const total = cashBasisData.current.total;
        return { type: "table", title: "Revenue by Category", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Category", "Amount", "Share"],
          rows: Object.entries(cats).sort(([, a], [, b]) => b - a).map(([cat, amt]) => [cat, fmt$(amt), fmtPercent(total > 0 ? (amt / total) * 100 : 0)]),
          followUps: ["Revenue by suite type", "Revenue trend over time", "Top 10 clients by spend"] };
      },
      revTrend: () => {
        const curTotal = cashBasisData.current.total;
        const prevTotal = cashBasisData.previous.total;
        const growthPct = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : 0;
        const curAvg = cashBasisData.current.avgTransaction;
        const prevAvg = cashBasisData.previous.avgTransaction;
        const avgGrowth = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;
        const chartPoints = [];
        let cur = dateFrom;
        while (cur <= dateTo) { chartPoints.push({ date: cur, label: fmtDateLabel(cur), value: cashBasisData.current.byDate?.[cur] || 0 }); cur = addDays(cur, 1); }
        return { type: "summary", title: "Revenue Trend Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Current Period", value: fmt$(curTotal) },
            { label: "Previous Period", value: fmt$(prevTotal) },
            { label: "Growth", value: `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`, color: growthPct >= 0 ? C.suc : C.dan },
            { label: "Avg Txn Change", value: `${avgGrowth >= 0 ? "+" : ""}${avgGrowth.toFixed(1)}%`, color: avgGrowth >= 0 ? C.suc : C.dan },
            { label: "Daily Avg", value: fmt$(days > 0 ? curTotal / days : 0) },
            { label: "Transactions", value: String(cashBasisData.current.count) },
          ],
          followUps: ["Revenue by category", "Top 10 clients by spend", "Busiest day of the week"] };
      },
      revTotal: () => {
        const cashTotal = cashBasisData.current.total;
        const accrualTotal = accrualData.current.totals.totalRevenue;
        const accrualNet = accrualData.current.totals.netRevenue;
        return { type: "summary", title: "Total Revenue Summary", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Cash Collected", value: fmt$(cashTotal) },
            { label: "Accrual Gross", value: fmt$(accrualTotal) },
            { label: "Accrual Net", value: fmt$(accrualNet) },
            { label: "Transactions", value: String(cashBasisData.current.count) },
            { label: "Avg Transaction", value: fmt$(cashBasisData.current.avgTransaction) },
            { label: "Daily Avg", value: fmt$(days > 0 ? cashTotal / days : 0) },
          ],
          followUps: ["Revenue by category", "Revenue trend over time", "MoM revenue growth"] };
      },
      topClients: (limit = 10, dir = "desc") => {
        const byClient = {};
        const clientVisits = {};
        payments.forEach(p => {
          const res = (data.reservations || []).find(r => r.id === p.reservationId);
          const client = res ? clients.find(c => c.id === res.clientId) : null;
          const name = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
          byClient[name] = (byClient[name] || 0) + (p.amount || 0);
          clientVisits[name] = (clientVisits[name] || 0) + 1;
        });
        const sorted = Object.entries(byClient).sort(([, a], [, b]) => dir === "desc" ? b - a : a - b).slice(0, limit);
        const total = cashBasisData.current.total;
        return { type: "table", title: `${dir === "desc" ? "Top" : "Bottom"} ${limit} Clients by Spend`, subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Client", "Spend", "Share", "Visits"],
          rows: sorted.map(([name, amt]) => [name, fmt$(amt), fmtPercent(total > 0 ? (amt / total) * 100 : 0), String(clientVisits[name] || 0)]),
          followUps: ["New clients this period", "Client retention rate", "Revenue by category"] };
      },
      newClients: () => {
        const allPayments = (data.payments || []).filter(p => p.status === "completed" && p.type !== "refund");
        const firstPayByClient = {};
        allPayments.forEach(p => {
          const res = (data.reservations || []).find(r => r.id === p.reservationId);
          const cId = res?.clientId;
          if (!cId) return;
          const dt = p.timestamp?.split("T")[0];
          if (!firstPayByClient[cId] || dt < firstPayByClient[cId]) firstPayByClient[cId] = dt;
        });
        const newIds = Object.entries(firstPayByClient).filter(([, dt]) => dt >= dateFrom && dt <= dateTo);
        const newList = newIds.map(([cId, dt]) => {
          const client = clients.find(c => c.id === cId);
          const name = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
          const spent = payments.filter(p => { const r = (data.reservations || []).find(r2 => r2.id === p.reservationId); return r?.clientId === cId; }).reduce((s, p) => s + (p.amount || 0), 0);
          return { name, date: dt, spent };
        }).sort((a, b) => b.spent - a.spent);
        return { type: "table", title: "New Clients This Period", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} — ${newList.length} new client${newList.length !== 1 ? "s" : ""}`,
          columns: ["Client", "First Visit", "Spend"],
          rows: newList.slice(0, 20).map(c => [c.name, fmtDateLabel(c.date), fmt$(c.spent)]),
          followUps: ["Top 10 clients by spend", "Client retention rate", "Revenue trend over time"] };
      },
      clientFrequency: () => {
        const visits = {};
        allReservations.forEach(res => {
          const cId = res.clientId;
          if (!cId) return;
          visits[cId] = (visits[cId] || 0) + 1;
        });
        const freq = Object.values(visits);
        const once = freq.filter(f => f === 1).length;
        const repeat = freq.filter(f => f > 1).length;
        const avgVisits = freq.length > 0 ? freq.reduce((s, v) => s + v, 0) / freq.length : 0;
        const topRepeaters = Object.entries(visits).sort(([, a], [, b]) => b - a).slice(0, 5).map(([cId, cnt]) => {
          const client = clients.find(c => c.id === cId);
          return { name: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown", count: cnt };
        });
        return { type: "summary", title: "Client Retention & Frequency", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Unique Clients", value: String(freq.length) },
            { label: "First-Time", value: String(once) },
            { label: "Returning", value: String(repeat) },
            { label: "Retention Rate", value: fmtPercent(freq.length > 0 ? (repeat / freq.length) * 100 : 0) },
            { label: "Avg Visits", value: avgVisits.toFixed(1) },
          ],
          extra: topRepeaters.length > 0 ? { type: "mini-table", title: "Most Frequent Clients", columns: ["Client", "Visits"], rows: topRepeaters.map(r => [r.name, String(r.count)]) } : null,
          followUps: ["Top 10 clients by spend", "New clients this period", "Average length of stay"] };
      },
      paymentMethods: () => {
        const mc = {};
        const ma = {};
        payments.forEach(p => {
          const m = p.method || "other";
          mc[m] = (mc[m] || 0) + 1;
          ma[m] = (ma[m] || 0) + (p.amount || 0);
        });
        const total = Object.values(mc).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Payment Method Breakdown", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Method", "Count", "Share", "Amount"],
          rows: Object.entries(mc).sort(([, a], [, b]) => b - a).map(([m, c]) => [m.charAt(0).toUpperCase() + m.slice(1), String(c), fmtPercent(total > 0 ? (c / total) * 100 : 0), fmt$(ma[m] || 0)]),
          followUps: ["Revenue by category", "Top 10 clients by spend", "Booking source breakdown"] };
      },
      bookingSources: () => {
        const src = cashBasisData.current.bySource;
        const total = cashBasisData.current.total;
        return { type: "table", title: "Booking Source Breakdown", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Source", "Revenue", "Share"],
          rows: Object.entries(src).sort(([, a], [, b]) => b - a).map(([s, v]) => [s === "online" ? "Online" : s === "phone" ? "Phone" : s === "walk-in" ? "Walk-In" : s, fmt$(v), fmtPercent(total > 0 ? (v / total) * 100 : 0)]),
          followUps: ["Payment method breakdown", "Revenue by category", "New clients this period"] };
      },
      occupancy: () => {
        const dayCount = accrualData.days.length || 1;
        const totalOcc = accrualData.current.totals.roomsOccupied;
        const rate = totalRoomCount > 0 ? (totalOcc / (totalRoomCount * dayCount)) * 100 : 0;
        const available = Math.max(0, totalRoomCount * dayCount - totalOcc);
        const dailyRates = accrualData.days.map(d => {
          const occ = accrualData.current.dayData[d]?.roomsOccupied || 0;
          return totalRoomCount > 0 ? (occ / totalRoomCount) * 100 : 0;
        });
        const peakDay = dailyRates.length > 0 ? accrualData.days[dailyRates.indexOf(Math.max(...dailyRates))] : null;
        return { type: "summary", title: "Occupancy Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Avg Occupancy", value: fmtPercent(rate) },
            { label: "Room-Nights Sold", value: String(totalOcc) },
            { label: "Room-Nights Available", value: String(available) },
            { label: "Total Rooms", value: String(totalRoomCount) },
            { label: "Peak Day", value: peakDay ? fmtDateLabel(peakDay) : "—" },
            { label: "Peak Occupancy", value: dailyRates.length > 0 ? fmtPercent(Math.max(...dailyRates)) : "—" },
          ],
          followUps: ["Occupancy rate by room type", "RevPAR analysis", "Revenue by suite type"] };
      },
      occupancyByRoom: () => {
        const roomTypes = Object.keys(allRooms);
        const dayCount = accrualData.days.length || 1;
        const byType = {};
        roomTypes.forEach(rt => { byType[rt] = { count: allRooms[rt]?.length || 0, occupied: 0 }; });
        reservations.forEach(res => {
          const segments = res.roomSegments || [{ startDate: res.checkIn, endDate: res.checkOut, roomType: res.roomType }];
          segments.forEach(seg => {
            const rt = seg.roomType || res.roomType;
            if (!byType[rt]) byType[rt] = { count: 0, occupied: 0 };
            let d = seg.startDate || res.checkIn;
            while (d < (seg.endDate || res.checkOut)) {
              if (d >= dateFrom && d <= dateTo) byType[rt].occupied++;
              d = addDays(d, 1);
            }
          });
        });
        return { type: "table", title: "Occupancy by Room Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Room Type", "Rooms", "Room-Nights Sold", "Occupancy Rate"],
          rows: roomTypes.map(rt => {
            const cap = (byType[rt]?.count || 0) * dayCount;
            const occ = byType[rt]?.occupied || 0;
            return [rt, String(byType[rt]?.count || 0), String(occ), fmtPercent(cap > 0 ? (occ / cap) * 100 : 0)];
          }),
          followUps: ["Occupancy rate", "Revenue by suite type", "RevPAR analysis"] };
      },
      avgStay: () => {
        const stays = reservations.map(r => countNights(r.checkIn, r.checkOut)).filter(n => n > 0);
        const avg = stays.length > 0 ? stays.reduce((s, v) => s + v, 0) / stays.length : 0;
        const median = stays.length > 0 ? stays.sort((a, b) => a - b)[Math.floor(stays.length / 2)] : 0;
        const max = stays.length > 0 ? Math.max(...stays) : 0;
        const min = stays.length > 0 ? Math.min(...stays) : 0;
        const dist = {};
        stays.forEach(n => { const bucket = n >= 7 ? "7+" : String(n); dist[bucket] = (dist[bucket] || 0) + 1; });
        return { type: "summary", title: "Length of Stay Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} — ${stays.length} reservation${stays.length !== 1 ? "s" : ""}`,
          items: [
            { label: "Average", value: `${avg.toFixed(1)} nights` },
            { label: "Median", value: `${median} nights` },
            { label: "Shortest", value: `${min} night${min !== 1 ? "s" : ""}` },
            { label: "Longest", value: `${max} nights` },
          ],
          extra: Object.keys(dist).length > 0 ? { type: "mini-table", title: "Stay Distribution", columns: ["Nights", "Count"],
            rows: Object.entries(dist).sort(([a], [b]) => (a === "7+" ? 99 : +a) - (b === "7+" ? 99 : +b)).map(([n, c]) => [`${n} night${n === "1" ? "" : "s"}`, String(c)]) } : null,
          followUps: ["Top 10 clients by spend", "Occupancy rate", "Revenue by suite type"] };
      },
      busiestDay: () => {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const byDay = [0, 0, 0, 0, 0, 0, 0];
        const revByDay = [0, 0, 0, 0, 0, 0, 0];
        Object.entries(cashBasisData.current.byDate || {}).forEach(([dt, amt]) => {
          const dow = new Date(dt + "T12:00:00").getDay();
          byDay[dow]++;
          revByDay[dow] += amt;
        });
        const peakIdx = byDay.indexOf(Math.max(...byDay));
        const peakRevIdx = revByDay.indexOf(Math.max(...revByDay));
        return { type: "table", title: "Activity by Day of Week", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Day", "Transactions", "Revenue"],
          rows: dayNames.map((d, i) => [d, String(byDay[i]), fmt$(revByDay[i])]),
          highlight: { row: peakIdx, label: "Peak day" },
          followUps: ["Occupancy rate", "Revenue trend over time", "Average length of stay"] };
      },
      discountImpact: () => {
        const gross = discountBreakdown.grossRevenue;
        const disc = discountBreakdown.totalDiscounts;
        const net = gross - disc;
        const rate = gross > 0 ? (disc / gross) * 100 : 0;
        return { type: "summary", title: "Discount Impact Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Gross Revenue", value: fmt$(gross) },
            { label: "Total Discounts", value: fmt$(disc), color: C.dan },
            { label: "Net Revenue", value: fmt$(net) },
            { label: "Discount Rate", value: fmtPercent(rate), color: rate > 15 ? C.dan : rate > 8 ? C.warn : C.suc },
            { label: "% Discounts", value: `${discountBreakdown.byType.percent}` },
            { label: "Flat Discounts", value: `${discountBreakdown.byType.flat}` },
            { label: "Coupons", value: `${discountBreakdown.byType.coupon}` },
            { label: "Multi-Dog", value: `${discountBreakdown.byType.multidog}` },
          ],
          followUps: ["Revenue by category", "Top 10 clients by spend", "RevPAR analysis"] };
      },
      addonAnalysis: () => {
        const addOnPrices = LITE_DEF_PRICING.addOns || {};
        const boardingRes = reservations;
        const withAddOns = boardingRes.filter(r => r.selectedAddOns && r.selectedAddOns.length > 0);
        const attachRate = boardingRes.length > 0 ? (withAddOns.length / boardingRes.length) * 100 : 0;
        const addOnCounts = {};
        const addOnRev = {};
        withAddOns.forEach(r => {
          const nights = countNights(r.checkIn, r.checkOut);
          (r.selectedAddOns || []).forEach(a => {
            addOnCounts[a] = (addOnCounts[a] || 0) + 1;
            addOnRev[a] = (addOnRev[a] || 0) + ((addOnPrices[a] || 0) * nights);
          });
        });
        const totalAddOnRev = Object.values(addOnRev).reduce((s, v) => s + v, 0);
        return { type: "summary", title: "Add-On Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Attach Rate", value: fmtPercent(attachRate) },
            { label: "Total Add-On Revenue", value: fmt$(totalAddOnRev) },
            { label: "Reservations w/ Add-Ons", value: `${withAddOns.length} of ${boardingRes.length}` },
            { label: "Avg Add-On Rev", value: fmt$(withAddOns.length > 0 ? totalAddOnRev / withAddOns.length : 0) },
          ],
          extra: Object.keys(addOnCounts).length > 0 ? { type: "mini-table", title: "Popular Add-Ons", columns: ["Add-On", "Count", "Revenue"],
            rows: Object.entries(addOnCounts).sort(([, a], [, b]) => b - a).map(([a, c]) => [a, String(c), fmt$(addOnRev[a] || 0)]) } : null,
          followUps: ["Revenue by category", "Average length of stay", "Discount impact analysis"] };
      },
      revpar: () => {
        const dayCount = accrualData.days.length || 1;
        const totalOcc = accrualData.current.totals.roomsOccupied;
        const boardingRev = accrualData.current.totals.boardingRevenue;
        const revPAR = totalRoomCount > 0 && dayCount > 0 ? boardingRev / (totalRoomCount * dayCount) : 0;
        const adr = totalOcc > 0 ? boardingRev / totalOcc : 0;
        const occRate = totalRoomCount > 0 ? (totalOcc / (totalRoomCount * dayCount)) * 100 : 0;
        return { type: "summary", title: "RevPAR Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "RevPAR", value: fmt$(revPAR) },
            { label: "ADR", value: fmt$(adr) },
            { label: "Occupancy", value: fmtPercent(occRate) },
            { label: "Boarding Revenue", value: fmt$(boardingRev) },
            { label: "Room-Nights Sold", value: String(totalOcc) },
            { label: "Available Room-Nights", value: String(totalRoomCount * dayCount) },
          ],
          followUps: ["Revenue by suite type", "Occupancy rate by room type", "Revenue trend over time"] };
      },
      topDogs: (limit = 10, dir = "desc") => {
        const byDog = {};
        reservations.forEach(res => {
          const dog = dogs.find(d => d.id === res.dogId);
          const name = dog?.fields?.name || "Unknown";
          if (!byDog[name]) byDog[name] = { nights: 0, visits: 0, breed: dog?.fields?.breed || "—" };
          byDog[name].nights += countNights(res.checkIn, res.checkOut);
          byDog[name].visits++;
        });
        const sorted = Object.entries(byDog).sort(([, a], [, b]) => dir === "desc" ? b.nights - a.nights : a.nights - b.nights).slice(0, limit);
        return { type: "table", title: `${dir === "desc" ? "Top" : "Bottom"} ${limit} Dogs by Stay`, subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Dog", "Breed", "Nights", "Visits"],
          rows: sorted.map(([name, d]) => [name, d.breed, String(d.nights), String(d.visits)]),
          followUps: ["Top 10 clients by spend", "Average length of stay", "Breed breakdown"] };
      },
      breedBreakdown: () => {
        const byBreed = {};
        reservations.forEach(res => {
          const dog = dogs.find(d => d.id === res.dogId);
          const breed = dog?.fields?.breed || "Unknown";
          byBreed[breed] = (byBreed[breed] || 0) + 1;
        });
        const total = Object.values(byBreed).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Reservations by Breed", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Breed", "Reservations", "Share"],
          rows: Object.entries(byBreed).sort(([, a], [, b]) => b - a).slice(0, 15).map(([b, c]) => [b, String(c), fmtPercent(total > 0 ? (c / total) * 100 : 0)]),
          followUps: ["Top 10 dogs by stay", "Average length of stay", "Revenue by suite type"] };
      },
      revByService: () => {
        const boarding = accrualData.current.totals.boardingRevenue;
        const daycare = accrualData.current.totals.daycareRevenue;
        const feeding = accrualData.current.totals.feedingRevenue;
        const meds = accrualData.current.totals.medicationRevenue;
        const addOns = accrualData.current.totals.addOnRevenue;
        const total = boarding + daycare + feeding + meds + addOns;
        const rows = [
          ["Boarding", fmt$(boarding), fmtPercent(total > 0 ? (boarding / total) * 100 : 0)],
          ["Daycare", fmt$(daycare), fmtPercent(total > 0 ? (daycare / total) * 100 : 0)],
          ["Feeding", fmt$(feeding), fmtPercent(total > 0 ? (feeding / total) * 100 : 0)],
          ["Medication Admin", fmt$(meds), fmtPercent(total > 0 ? (meds / total) * 100 : 0)],
          ["Add-Ons", fmt$(addOns), fmtPercent(total > 0 ? (addOns / total) * 100 : 0)],
        ].filter(r => r[1] !== fmt$(0));
        return { type: "table", title: "Revenue by Service Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Service", "Revenue", "Share"], rows,
          followUps: ["Revenue by category", "Add-on attach rate", "Revenue trend over time"] };
      },
    };
  }, [data, cashBasisData, accrualData, discountBreakdown, dateFrom, dateTo, days]);

  const processNLPQuery = useCallback((query) => {
    const q = query.toLowerCase().trim();
    setNlpLoading(true);
    setTimeout(() => {
      const { intent, confidence } = classifyIntent(q);
      const entities = extractEntities(q);
      let result = null;
      const dispatch = {
        rev_by_suite: () => _agg.revBySuite(),
        rev_by_category: () => _agg.revByCategory(),
        rev_trend: () => _agg.revTrend(),
        rev_total: () => _agg.revTotal(),
        top_clients: () => _agg.topClients(entities.limit, entities.sortDir),
        new_clients: () => _agg.newClients(),
        client_frequency: () => _agg.clientFrequency(),
        payment_methods: () => _agg.paymentMethods(),
        booking_sources: () => _agg.bookingSources(),
        occupancy: () => _agg.occupancy(),
        occupancy_by_room: () => _agg.occupancyByRoom(),
        avg_stay: () => _agg.avgStay(),
        busiest_day: () => _agg.busiestDay(),
        discount_impact: () => _agg.discountImpact(),
        addon_analysis: () => _agg.addonAnalysis(),
        revpar: () => _agg.revpar(),
        top_dogs: () => _agg.topDogs(entities.limit, entities.sortDir),
        breed_breakdown: () => _agg.breedBreakdown(),
        rev_by_service: () => _agg.revByService(),
      };
      if (intent && confidence >= 5 && dispatch[intent]) {
        result = dispatch[intent]();
        setNlpResults(result);
        setNlpLoading(false);
      } else {
        if (intent && dispatch[intent]) {
          result = dispatch[intent]();
        } else {
          result = {
            type: "message",
            title: "I'm not sure what you're looking for",
            message: `Try one of these: "Revenue by suite type", "Top 10 clients by spend", "Occupancy rate", "Average length of stay", "Discount impact", or "Busiest day of the week".`,
            followUps: ["Revenue by category", "Top 10 clients by spend", "Occupancy rate", "Discount impact analysis"],
          };
        }
        setNlpResults(result);
        setNlpLoading(false);
      }
    }, 150);
  }, [classifyIntent, extractEntities, _agg]);

  const getQuarter = (dateStr) => { const m = new Date(dateStr + "T00:00:00").getMonth(); return m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4"; };
  const getMonthLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
  const getMonthYearLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

  const bucketMode = useMemo(() => {
    if (timeRange === "year" || days > 180) return "monthly";
    if (timeRange === "quarter" || days > 60) return "weekly";
    return "daily";
  }, [timeRange, days]);

  const bucketDays = useCallback((daysList, getValueForDay, getPrevValueForDay) => {
    if (bucketMode === "daily") {
      return daysList.map(d => ({
        date: d,
        label: fmtDateLabel(d),
        value: getValueForDay(d),
        prevValue: getPrevValueForDay ? getPrevValueForDay(d) : 0,
      }));
    }
    if (bucketMode === "monthly") {
      const monthBuckets = {};
      daysList.forEach(d => {
        const key = d.slice(0, 7);
        if (!monthBuckets[key]) {
          const q = getQuarter(d);
          monthBuckets[key] = { date: d, label: `${getMonthLabel(d)} (${q})`, value: 0, prevValue: 0 };
        }
        monthBuckets[key].value += getValueForDay(d);
        if (getPrevValueForDay) monthBuckets[key].prevValue += getPrevValueForDay(d);
      });
      return Object.values(monthBuckets);
    }
    const weekBuckets = [];
    for (let i = 0; i < daysList.length; i += 7) {
      const chunk = daysList.slice(i, i + 7);
      const first = chunk[0], last = chunk[chunk.length - 1];
      const q = getQuarter(first);
      const label = chunk.length >= 5
        ? `${getMonthLabel(first)} ${new Date(first + "T00:00:00").getDate()}–${new Date(last + "T00:00:00").getDate()} (${q})`
        : `${fmtDateLabel(first)} (${q})`;
      weekBuckets.push({
        date: first,
        label,
        value: chunk.reduce((s, d) => s + getValueForDay(d), 0),
        prevValue: getPrevValueForDay ? chunk.reduce((s, d) => s + getPrevValueForDay(d), 0) : 0,
      });
    }
    return weekBuckets;
  }, [bucketMode]);

  const cashChartData = useMemo(() => {
    const daysList = [];
    let cur = dateFrom;
    while (cur <= dateTo) { daysList.push(cur); cur = addDays(cur, 1); }
    return bucketDays(
      daysList,
      (d) => cashBasisData.current.byDate?.[d] || 0,
      compareMode ? (d) => cashBasisData.previous.byDate?.[addDays(d, -days)] || 0 : null
    );
  }, [cashBasisData, dateFrom, dateTo, days, compareMode, bucketDays]);

  const accrualChartData = useMemo(() => {
    const daysList = accrualData.days;
    return bucketDays(
      daysList,
      (d) => accrualData.current.dayData[d]?.netRevenue || 0,
      compareMode ? (d) => {
        const idx = daysList.indexOf(d);
        const prevDay = accrualData.previous.days[idx];
        return prevDay ? (accrualData.previous.dayData[prevDay]?.netRevenue || 0) : 0;
      } : null
    );
  }, [accrualData, compareMode, bucketDays]);

  const categoryData = useMemo(() => {
    const cats = cashBasisData.current.byCategory;
    const total = cashBasisData.current.total;
    const colors = ["#003462", "#AF8D54", "#0D7A56", "#1A5EC4", "#C4720C", "#6366F1", "#C42B2B", "#059669"];
    return Object.entries(cats).map(([label, value], idx) => ({ label, value, percent: total > 0 ? (value / total) * 100 : 0, color: colors[idx % colors.length] })).sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  const bookingSourceData = useMemo(() => {
    const src = cashBasisData.current.bySource;
    const total = cashBasisData.current.total;
    return Object.entries(src).map(([label, value]) => ({ label: label === "online" ? "Online" : label === "phone" ? "Phone" : label === "walk-in" ? "Walk-In" : label, value, percent: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  const paymentMethodData = useMemo(() => {
    const methods = cashBasisData.current.byMethod;
    const total = Object.values(methods).reduce((s, v) => s + v, 0);
    const items = Object.entries(methods).map(([m, count]) => ({ label: m.charAt(0).toUpperCase() + m.slice(1), value: count, percent: total > 0 ? (count / total) * 100 : 0 }));
    return items.sort((a, b) => b.value - a.value);
  }, [cashBasisData.current.byMethod]);

  const MiniDonut = ({ items, size = 120, id = "donut" }) => {
    const total = items.reduce((s, v) => s + v.value, 0);
    const circumference = 2 * Math.PI * (size / 2 - 8);
    let offset = 0;
    const segments = items.map((item, idx) => {
      const pct = total > 0 ? item.value / total : 0;
      const len = pct * circumference;
      const seg = <circle key={idx} cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="none" stroke={[C.pri, C.acc, C.suc, C.warn, C.dan][idx % 5]} strokeWidth="12" strokeDasharray={`${len} ${circumference}`} strokeDashoffset={-offset} opacity="0.9" style={{ transition: "opacity 200ms" }} />;
      offset += len;
      return seg;
    });
    const legend = items.map((item, idx) => (
      <div key={idx} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: [C.pri, C.acc, C.suc, C.warn, C.dan][idx % 5] }}></div>
        <span style={{ color: C.textSec }}>{item.label}</span>
      </div>
    ));
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <svg width={size} height={size}>
          {segments}
        </svg>
        <div style={{ fontSize: 11 }}>{legend}</div>
      </div>
    );
  };

  const KPI = ({ label, value, displayValue, trend, accentColor, icon, delay }) => (
    <div style={{ padding: 16, background: C.surface, borderRadius: 14, borderTop: `3px solid ${accentColor}`, animation: `rptFadeUp 500ms ease-out ${delay * 80}ms backwards`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "box-shadow 200ms" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"}>
      <div style={{ fontSize: 11, color: C.textMut, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 4 }}>{displayValue || fmt$k(value)}</div>
      {trend !== undefined && <div style={{ fontSize: 11, color: trend >= 0 ? C.suc : C.dan }}>{trend >= 0 ? "+" : ""}{trend.toFixed(1)}%</div>}
    </div>
  );

  const CollapsibleSection = ({ title, open, onToggle, count, children }) => (
    <div style={{ marginBottom: 16 }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: 600, fontSize: 14, color: C.text }}>
        <span>{title} {count !== undefined && <span style={{ marginLeft: 8, fontSize: 12, color: C.textMut }}>({count})</span>}</span>
        <span style={{ transition: "transform 200ms", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 8, animation: "rptFadeUp 300ms ease-out" }}>{children}</div>}
    </div>
  );

  const ReservationDrawer = ({ reservation, onClose }) => {
    if (!reservation) return null;
    const res = (data.reservations || []).find(r => r.id === reservation);
    if (!res) return null;
    const dog = (data.dogs || []).find(d => d.id === res.dogId);
    const client = (data.clients || []).find(c => c.id === res.clientId);
    const nights = countNights(res.checkIn, res.checkOut);
    const total = res.pricing?.total || 0;
    const perNight = nights > 0 ? total / nights : 0;
    return ReactDOM.createPortal(
      <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 400, background: C.surface, height: "100%", overflowY: "auto", padding: 20, boxShadow: "-4px 0 16px rgba(0,0,0,0.1)", animation: `rptSlideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Reservation Details</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.textSec, padding: 0 }}>×</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              ["DOG", dog?.fields?.name || "—"],
              ["OWNER", client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "—"],
              ["CHECK-IN", res.checkIn],
              ["CHECK-OUT", res.checkOut],
              ["NIGHTS", String(nights)],
              ["ROOM TYPE", res._resTypeName || "—"],
              ["NIGHTLY RATE", fmt$(perNight)],
              ["TOTAL", fmt$(total)],
              ["TYPE", res.type?.charAt(0).toUpperCase() + res.type?.slice(1) || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: 12, background: C.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: C.textMut, marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ width: "100%", marginTop: 24, padding: "12px 16px", background: C.pri, color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 200ms" }} onMouseEnter={e => (e.target.style.background = C.priL)} onMouseLeave={e => (e.target.style.background = C.pri)}>Close</button>
        </div>
      </div>,
      document.body
    );
  };

  const MiniTable = ({ title, columns, rows }) => (
    <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {title && <div style={{ padding: 12, background: C.bg, fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          <tr>{columns.map((col, i) => <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textMut }}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>{row.map((cell, j) => <td key={j} style={{ padding: "8px 12px", color: C.text }}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );

  const FollowUpSuggestions = ({ suggestions }) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      {suggestions?.map((s, i) => (
        <button key={i} onClick={() => setNlpQuery(s)} style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, fontSize: 12, cursor: "pointer", color: C.text, transition: "all 200ms" }} onMouseEnter={e => { e.target.style.background = C.pri; e.target.style.color = "white"; }} onMouseLeave={e => { e.target.style.background = C.bg; e.target.style.color = C.text; }}>
          {s}
        </button>
      ))}
    </div>
  );

  const NLPResults = () => {
    if (!nlpResults) return null;
    if (nlpResults.type === "table") {
      return (
        <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
          <p style={{ margin: "0 0 12px 0", fontSize: 11, color: C.textMut }}>{nlpResults.subtitle}</p>
          <MiniTable columns={nlpResults.columns} rows={nlpResults.rows} />
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    }
    if (nlpResults.type === "summary") {
      return (
        <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
          <p style={{ margin: "0 0 16px 0", fontSize: 11, color: C.textMut }}>{nlpResults.subtitle}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {nlpResults.items?.map((item, i) => (
              <div key={i} style={{ padding: 12, background: C.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: C.textMut, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: item.color || C.text }}>{item.value}</div>
              </div>
            ))}
          </div>
          {nlpResults.extra && <div style={{ marginTop: 12 }}><MiniTable title={nlpResults.extra.title} columns={nlpResults.extra.columns} rows={nlpResults.extra.rows} /></div>}
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
        <p style={{ margin: "0 0 12px 0", fontSize: 12, color: C.text }}>{nlpResults.message}</p>
        <FollowUpSuggestions suggestions={nlpResults.followUps} />
      </div>
    );
  };

  const InteractiveBarChart = ({ items, height = 220, onBarClick }) => {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!items || items.length === 0) return <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>No data</div>;
    const max = Math.max(...items.map(i => i.value), 1);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.slice(0, 8).map((item, idx) => (
          <div key={idx}
            style={{ cursor: "pointer", padding: "6px 0", transition: "all 0.2s", opacity: hoverIdx !== null && hoverIdx !== idx ? 0.5 : 1 }}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => onBarClick?.(item)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</span>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmt$(item.value)}</span>
                <span style={{ fontSize: 10, color: C.textMut, minWidth: 36, textAlign: "right" }}>{fmtPercent(item.percent)}</span>
              </div>
            </div>
            <div style={{ width: "100%", height: 20, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(item.value / max) * 100}%`,
                background: hoverIdx === idx ? `${item.color}dd` : item.color,
                borderRadius: 4,
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s",
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: "16px 20px" }}>
      <style>{`
        @keyframes rptFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rptSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes rptShimmer { from { background-position: -600px 0; } to { background-position: 600px 0; } }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "Canela, serif", color: C.text }}>Revenue Intelligence</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: C.textMut }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} {compareMode && `vs ${fmtDateLabel(prevFrom)} – ${fmtDateLabel(prevTo)}`}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", background: C.surfaceHover, borderRadius: 8, padding: 2, gap: 2 }}>
            {["today", "week", "month", "quarter", "year", "custom"].map(range => (
              <button key={range} onClick={() => { changeTimeRange(range); setNlpResults(null); }} style={{ padding: "6px 12px", background: timeRange === range ? C.pri : "transparent", color: timeRange === range ? "white" : C.text, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 200ms" }}>
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
          {timeRange === "custom" && (
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface }} />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.text }}>Compare</span>
            <div onClick={() => setCompareMode(!compareMode)} style={{ width: 44, height: 24, background: compareMode ? C.pri : C.border, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", padding: "2px", transition: "background 200ms" }}>
              <div style={{ width: 20, height: 20, background: "white", borderRadius: "50%", transition: "transform 200ms", transform: compareMode ? "translateX(20px)" : "translateX(0)" }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 14px", background: C.surface, borderRadius: 10, marginBottom: 16, border: `1px solid ${C.border}`, position: "relative" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input placeholder="Ask anything..." value={nlpQuery} onChange={e => setNlpQuery(e.target.value)} onFocus={() => setShowNLPSuggestions(true)} onBlur={() => setTimeout(() => setShowNLPSuggestions(false), 200)} onKeyDown={e => { if (e.key === "Enter" && nlpQuery.trim()) { processNLPQuery(nlpQuery); setShowNLPSuggestions(false); } }} style={{ flex: 1, border: "none", background: "transparent", color: C.text, fontSize: 14, outline: "none", padding: 0 }} />
          {nlpLoading && <div style={{ width: 16, height: 16, background: `linear-gradient(90deg, transparent, ${C.pri}, transparent)`, backgroundSize: "200% 100%", animation: "rptShimmer 1.5s infinite", borderRadius: 2 }} />}
        </div>
        {showNLPSuggestions && !nlpQuery && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 300, overflowY: "auto", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
            {nlpSuggestionsBank.reduce((acc, item) => { const cat = item.cat; if (!acc[cat]) acc[cat] = []; acc[cat].push(item.q); return acc; }, {}) && Object.entries(nlpSuggestionsBank.reduce((acc, item) => { const cat = item.cat; if (!acc[cat]) acc[cat] = []; acc[cat].push(item.q); return acc; }, {})).map(([cat, qs]) => (
              <div key={cat}>
                <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: C.textMut, background: C.bg, borderBottom: `1px solid ${C.border}` }}>{cat.toUpperCase()}</div>
                {qs.map((q, i) => (
                  <div key={i} onClick={() => { setNlpQuery(q); processNLPQuery(q); setShowNLPSuggestions(false); }} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", color: C.text, fontSize: 12, transition: "background 200ms" }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {q}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {nlpResults && <NLPResults />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ padding: 12, background: `${C.priLt}15`, borderLeft: `3px solid ${C.pri}`, borderRadius: "0 8px 8px 0", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.pri }}>Cash Basis Revenue</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <KPI label="Total Revenue" value={cashBasisData.current.total} trend={cashBasisData.trend} accentColor={C.pri} delay={0} />
            <KPI label="Avg Transaction" value={cashBasisData.current.avgTransaction} trend={cashBasisData.trendAvg} accentColor={C.acc} delay={1} />
            <KPI label="Transactions" value={0} displayValue={String(cashBasisData.current.count)} accentColor={C.suc} delay={2} />
            <KPI label="Top Category" displayValue={Object.entries(cashBasisData.current.byCategory || {}).sort(([, a], [, b]) => b - a)[0]?.[0] || "—"} value={0} accentColor={C.info} delay={3} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Cash Revenue Trend</h3>
            <InteractiveLineChart chartData={cashChartData} color={C.pri} showCompare={compareMode} height={210} id="rpt-cash" animationEpoch={animEpoch} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Revenue by Category</h3>
            <InteractiveBarChart items={categoryData} onBarClick={item => setNlpQuery(`Revenue for ${item.label}`)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Booking Source</h3>
              <MiniDonut items={bookingSourceData} />
            </div>
            <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Payment Methods</h3>
              <MiniDonut items={paymentMethodData} />
            </div>
          </div>
          <CollapsibleSection title="Transactions" open={cashTableOpen} onToggle={() => setCashTableOpen(!cashTableOpen)} count={transactionsData.length}>
            <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
              <input placeholder="Search..." value={transactionSearch} onChange={e => setTransactionSearch(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.bg }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead style={{ borderBottom: `1px solid ${C.border}` }}>
                  <tr>{["Date", "Client", "Dog", "Service", "Amount"].map((h, i) => <th key={i} onClick={() => { const newDir = sortConfig.key === ["date", "clientName", "dogName", "service", "amount"][i] ? (sortConfig.direction === "desc" ? "asc" : "desc") : "desc"; setSortConfig({ key: ["date", "clientName", "dogName", "service", "amount"][i], direction: newDir }); }} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textMut, cursor: "pointer", userSelect: "none" }}>{h} {sortConfig.key === ["date", "clientName", "dogName", "service", "amount"][i] && (sortConfig.direction === "desc" ? "▼" : "▲")}</th>)}</tr>
                </thead>
                <tbody>
                  {transactionsData.slice(0, 10).map((t, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}><td style={{ padding: "8px 12px", color: C.text }}>{t.date}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.clientName}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.dogName}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.service}</td><td style={{ padding: "8px 12px", color: C.suc, fontWeight: 600 }}>{fmt$(t.amount)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {transactionsData.length > 10 && <div style={{ marginTop: 12, fontSize: 12, color: C.textMut }}>Showing 10 of {transactionsData.length}</div>}
          </CollapsibleSection>
        </div>

        <div>
          <div style={{ padding: 12, background: `${C.accLt}15`, borderLeft: `3px solid ${C.acc}`, borderRadius: "0 8px 8px 0", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.accDk }}>Accrual Revenue</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <KPI label="Total Accrual" value={accrualData.current.totals.totalRevenue} trend={accrualData.revenueTrend} accentColor={C.acc} delay={0} />
            <KPI label="Occupancy" displayValue={fmtPercent(accrualData.occupancyRate)} value={0} accentColor={C.info} delay={1} />
            <KPI label="RevPAR" value={accrualData.revPAR} accentColor={C.warn} delay={2} />
            <KPI label="Net Revenue" value={accrualData.current.totals.netRevenue} accentColor={C.suc} delay={3} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Accrual Revenue Trend</h3>
            <InteractiveLineChart chartData={accrualChartData} color={C.acc} compareColor={C.pri} showCompare={compareMode} height={210} id="rpt-accrual" animationEpoch={animEpoch} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Revenue Composition</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { label: "Boarding", value: accrualData.current.totals.boardingRevenue, color: C.pri },
                { label: "Daycare", value: accrualData.current.totals.daycareRevenue, color: C.acc },
              ].filter(x => x.value > 0).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color }} />
                    <span style={{ fontSize: 12, color: C.text }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt$k(item.value)}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Net Revenue</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.suc }}>{fmt$k(accrualData.current.totals.netRevenue)}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px 0" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>Discount Transparency</h3>
              <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>(estimated from rack rates)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "At Rack Rate", count: discountBreakdown.byType.none },
                { label: "Discounted", count: discountBreakdown.byType.multidog },
                { label: "Est. Discount", count: discountBreakdown.totalDiscounts > 0 ? `$${Math.round(discountBreakdown.totalDiscounts).toLocaleString()}` : "$0" },
              ].map((item, i) => (
                <div key={i} style={{ textAlign: "center", padding: 12, background: C.bg, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: C.textMut, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: i === 2 && discountBreakdown.totalDiscounts > 0 ? C.dan : C.text }}>{item.count}</div>
                </div>
              ))}
            </div>
          </div>
          <CollapsibleSection title="Reservations" open={accrualTableOpen} onToggle={() => setAccrualTableOpen(!accrualTableOpen)} count={accrualReservationsData.length}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead style={{ borderBottom: `1px solid ${C.border}` }}>
                  <tr>{["Dog", "Room", "In", "Nts", "Retail", "Disc", "Net"].map((h, i) => <th key={i} onClick={() => { const keys = ["dogName", "roomType", "checkIn", "nights", "retailTotal", "discountAmount", "netTotal"]; const newDir = sortConfig.key === keys[i] ? (sortConfig.direction === "desc" ? "asc" : "desc") : "desc"; setSortConfig({ key: keys[i], direction: newDir }); }} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: C.textMut, fontSize: 10, cursor: "pointer", userSelect: "none" }}>{h} {sortConfig.key === ["dogName", "roomType", "checkIn", "nights", "retailTotal", "discountAmount", "netTotal"][i] && (sortConfig.direction === "desc" ? "▼" : "▲")}</th>)}</tr>
                </thead>
                <tbody>
                  {accrualReservationsData.slice(0, 8).map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}><td style={{ padding: "6px 8px", color: C.text }}>{r.dogName}</td><td style={{ padding: "6px 8px", color: C.text }}>{r.roomType}</td><td style={{ padding: "6px 8px", color: C.text, fontSize: 10 }}>{r.checkIn}</td><td style={{ padding: "6px 8px", color: C.text }}>{r.nights}</td><td style={{ padding: "6px 8px", color: C.text }}>{fmt$(r.retailTotal)}</td><td style={{ padding: "6px 8px", color: r.discountAmount > 0 ? C.dan : C.textMut }}>{fmt$(r.discountAmount)}</td><td style={{ padding: "6px 8px", color: C.suc, fontWeight: 600 }}>{fmt$(r.netTotal)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {accrualReservationsData.length > 8 && <div style={{ marginTop: 12, fontSize: 12, color: C.textMut }}>Showing 8 of {accrualReservationsData.length}</div>}
          </CollapsibleSection>
        </div>
      </div>

      {selectedReservation && <ReservationDrawer reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />}
    </div>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────
class LeanAppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("K9 Lite Error:", error, info); this.setState({ info }); }
  render() {
    if (this.state.error) {
      return <div style={{padding:40,fontFamily:"monospace"}}>
        <h2 style={{color:"red"}}>K9 Operations Lite crashed</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:13,background:"#f5f5f5",padding:20,borderRadius:8}}>{this.state.error.toString()}{"\n\n"}{this.state.info?.componentStack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

// ─── Navigation Config ───────────────────────────────────────────────────
const LEAN_NAV_ITEMS = [
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Users" },
  { id: "funnel", label: "Funnel", icon: "TrendingUp" },
  { id: "ops-hub", label: "Operations", icon: "Clipboard" },
  { id: "reports", label: "Reports", icon: "BarChart" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "checkout-tv", label: "Checkout TV", icon: "Monitor" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const LEAN_ENTERPRISE_NAV_ITEMS = [
  { id: "enterprise-ops", label: "Operations Matrix", icon: "Dashboard" },
  { id: "enterprise-attendance", label: "Attendance", icon: "Calendar" },
  { id: "enterprise-users", label: "User Management", icon: "Users" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const K9_LEAN_LOCATIONS = [
  { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
  { id: "8ea382b0-63f7-44ac-b6f8-83243c03d946", name: "Cherry Hill", slug: "cherry-hill" },
  { id: "demo-pos", name: "Demo POS", slug: "demo", isPOS: true },
];

// ─── Main App Component ───────────────────────────────────────────────────
function LeanAppInner() {
  const { user, profile: authProfile } = useAuth();
  const [page, setPage] = useState("lifecycle");
  const [params, setParams] = useState({});
  const [navStack, setNavStack] = useState([{ page: "lifecycle", params: {} }]);
  const [lcFilters, setLcFilters] = useState({});
  const [lcFilterOpen, setLcFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sbExpanded = sidebarOpen;

  // Use the auth profile's location_id (UUID) so it matches Supabase data
  const [currentLocation, setCurrentLocation] = useState(() => authProfile?.location_id || "8ea382b0-63f7-44ac-b6f8-83243c03d946");
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [teamAccounts, setTeamAccounts] = useState([]);

  // Sync currentLocation with auth profile when it loads
  useEffect(() => {
    if (authProfile?.location_id && authProfile.location_id !== currentLocation) {
      setCurrentLocation(authProfile.location_id);
    }
  }, [authProfile?.location_id]);

  // Gingr data from Supabase (clients, dogs, reservations, rooms, etc.)
  const mockData = useGingrData(currentLocation);

  // Live Supabase data for ops & audit (layered on top of mock data)
  const [liveDailyOps, setLiveDailyOps] = useState([]);
  const [liveAuditLog, setLiveAuditLog] = useState([]);
  const [liveEodEntries, setLiveEodEntries] = useState([]);
  const [liveResortPolicies, setLiveResortPolicies] = useState(null);

  // Load persisted resort policies (retention thresholds) from lite_settings
  useEffect(() => {
    supabase.from("lite_settings").select("setting_value").eq("location_id", currentLocation).eq("setting_key", "resort_policies").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) setLiveResortPolicies(rows[0].setting_value);
    });
  }, [currentLocation]);

  // Merged data object — mock + live Supabase
  const data = useMemo(() => ({
    ...mockData,
    dailyOps: liveDailyOps.length > 0 ? liveDailyOps : mockData.dailyOps,
    auditLog: liveAuditLog,
    eodEntries: liveEodEntries,
    ...(liveResortPolicies ? { resortPolicies: { ...mockData.resortPolicies, ...liveResortPolicies } } : {}),
  }), [mockData, liveDailyOps, liveAuditLog, liveEodEntries, liveResortPolicies]);

  // Mock profile
  const profile = {
    id: "mock-user",
    role: "owner",
    email: user?.email || "user@example.com",
    full_name: user?.user_metadata?.full_name || "Demo User",
    name: user?.user_metadata?.full_name || "Demo User",
    location_id: currentLocation,
  };

  // Load ops data from Supabase on mount & location change
  useEffect(() => {
    const loadOpsData = async () => {
      try {
        const [opsResult, auditResult] = await Promise.all([
          supabase.from("lite_daily_ops").select("*").eq("location_id", currentLocation).order("date", { ascending: false }),
          supabase.from("lite_audit_log").select("*").eq("location_id", currentLocation).order("timestamp", { ascending: false }).limit(500),
        ]);

        if (opsResult.data) {
          const allOps = opsResult.data.map(r => ({
            id: r.id,
            type: r.type_sub || r.type,
            typeSub: r.type_sub,
            date: r.date,
            locked: r.locked,
            completedBy: r.completed_by,
            items: r.items || {},
            sections: r.sections,
            mentions: r.mentions,
            history: r.history || [],
          }));
          setLiveDailyOps(allOps.filter(d => d.type !== 'eod'));
          setLiveEodEntries(allOps.filter(d => d.type === 'eod'));
        }

        if (auditResult.data) {
          setLiveAuditLog(auditResult.data.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            userId: r.user_id,
            userName: r.user_name,
            action: r.action,
            resourceType: r.resource_type,
            resourceId: r.resource_id,
            details: r.details || [],
            reservationId: r.resource_type === 'reservation' ? r.resource_id : null,
          })));
        }
      } catch (err) {
        console.log("[K9 Lite] Failed to load ops data:", err.message);
      }
    };
    loadOpsData();
  }, [currentLocation]);

  // Save function — persists dailyOps and auditLog to Supabase
  const save = useCallback(async (newData) => {
    try {
      // Save dailyOps changes
      if (newData.dailyOps) {
        const opsRows = newData.dailyOps.map(d => ({
          id: d.id,
          location_id: currentLocation,
          type: d.type === 'checklist' || ['opening','closing','fe','be','fe_checklist','be_checklist'].includes(d.typeSub || d.type) ? 'checklist' : (d.typeSub || d.type),
          type_sub: d.typeSub || d.type,
          date: d.date,
          locked: d.locked || false,
          completed_by: d.completedBy || null,
          items: d.items || {},
          history: d.history || [],
        }));

        if (opsRows.length > 0) {
          const { error } = await supabase.from("lite_daily_ops").upsert(opsRows, { onConflict: "id" });
          if (error) console.log("[K9 Lite] Ops save error:", error.message);
        }

        setLiveDailyOps(newData.dailyOps.filter(d => (d.typeSub || d.type) !== 'eod'));
      }

      // Save eodEntries changes
      if (newData.eodEntries) {
        const eodRows = newData.eodEntries.map(d => ({
          id: d.id,
          location_id: currentLocation,
          type: 'eod',
          type_sub: 'eod',
          date: d.date,
          locked: d.locked || false,
          completed_by: d.completedBy || null,
          items: d.items || {},
          sections: d.sections || null,
          mentions: d.mentions || null,
          history: d.history || [],
        }));

        if (eodRows.length > 0) {
          const { error } = await supabase.from("lite_daily_ops").upsert(eodRows, { onConflict: "id" });
          if (error) console.log("[K9 Lite] EOD save error:", error.message);
        }

        setLiveEodEntries(newData.eodEntries);
      }

      // Save audit log entries (new ones only — append)
      if (newData.auditLog && newData.auditLog.length > liveAuditLog.length) {
        const newEntries = newData.auditLog.slice(liveAuditLog.length);
        const auditRows = newEntries.map(a => ({
          location_id: currentLocation,
          timestamp: a.timestamp || new Date().toISOString(),
          user_id: user?.id || null,
          user_name: a.userName || profile.name,
          action: a.action,
          resource_type: a.resourceType || null,
          resource_id: a.resourceId || a.reservationId || null,
          details: a.details || [],
        }));

        if (auditRows.length > 0) {
          const { error } = await supabase.from("lite_audit_log").insert(auditRows);
          if (error) console.log("[K9 Lite] Audit save error:", error.message);
        }

        setLiveAuditLog(newData.auditLog);
      }

      // Save client lifecycle changes (followUp, notes, cold, etc.)
      if (newData.clients && mockData?.clients) {
        const changed = [];
        newData.clients.forEach(c => {
          if (!c.gingrId) return;
          const old = mockData.clients.find(o => o.id === c.id);
          if (c.lifecycle && JSON.stringify(c.lifecycle) !== JSON.stringify(old?.lifecycle)) {
            changed.push({ location_id: currentLocation, gingr_id: String(c.gingrId), lifecycle_data: c.lifecycle, updated_at: new Date().toISOString() });
          }
        });
        if (changed.length > 0) {
          const { error } = await supabase.from("lite_client_lifecycle").upsert(changed, { onConflict: "location_id,gingr_id" });
          if (error) console.log("[K9 Lite] Lifecycle save error:", error.message);
        }
      }
    } catch (err) {
      console.log("[K9 Lite] Save error:", err.message);
    }
    return true;
  }, [currentLocation, user?.id, liveAuditLog.length, mockData?.clients]);

  // Navigation function with breadcrumb stack
  const TOP_LEVEL_PAGES = useMemo(() => new Set(["lifecycle", "funnel", "ops-hub", "reports", "photos", "settings", "enterprise-ops", "enterprise-attendance", "enterprise-users"]), []);
  const nav = useCallback((newPage, newParams = {}) => {
    setPage(newPage);
    setParams(newParams);
    if (TOP_LEVEL_PAGES.has(newPage)) {
      setNavStack([{ page: newPage, params: newParams }]);
    } else {
      setNavStack(s => [...s, { page: newPage, params: newParams }]);
    }
  }, [TOP_LEVEL_PAGES]);

  // Breadcrumb label formatter
  const breadcrumbLabel = useCallback((pg, prms) => {
    switch(pg) {
      case "lifecycle": return "Customer Lifecycle";
      case "funnel": return "Conversion Funnel";
      case "ops-hub": return "Operations";
      case "ops-opening": return "Opening Checklist";
      case "ops-fe": return "FE Checklist";
      case "ops-be": return "BE Checklist";
      case "ops-rooms": return "Room Cleaning";
      case "ops-pictures": return "Pictures";
      case "ops-pp": return "Private Play";
      case "ops-closing": return "Closing Checklist";
      case "ops-bathing": return "Bathing Report";
      case "ops-pamper": return "Pamper Package Plus";
      case "ops-svc": return params?.svcName || "Service Report";
      case "eod": return "End of Day";
      case "daily-ops": return "Daily Ops";
      case "attendance": case "mgmt-attendance": return "Attendance Tracker";
      case "mgmt-audit-log": return "Audit Log";
      case "client-detail": {
        const c = (mockData?.clients||[]).find(cl => cl.id === prms?.clientId);
        return c ? `${c.fields?.first_name||""} ${c.fields?.last_name||""}`.trim() || "Client" : "Client";
      }
      case "new-client": return "New Client";
      case "photos": return "Photos";
      case "settings": return "Settings";
      case "enterprise-ops": return "Operations Matrix";
      case "enterprise-attendance": return "Attendance";
      case "enterprise-users": return "User Management";
      default: return pg;
    }
  }, [mockData]);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const addGlobalToast = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Load fonts
  useEffect(() => {
    if (!document.getElementById("k9-lite-fonts")) {
      const style = document.createElement("style");
      style.id = "k9-lite-fonts";
      style.textContent = `
        @font-face{font-family:'Canela';font-weight:700;font-style:normal;src:url('/fonts/Canela-Bold-Web.woff2') format('woff2'),url('/fonts/Canela-Bold-Web.woff') format('woff'),url('/fonts/Canela-Bold.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'Canela';font-weight:700;font-style:italic;src:url('/fonts/Canela-BoldItalic-Web.woff2') format('woff2'),url('/fonts/Canela-BoldItalic-Web.woff') format('woff'),url('/fonts/Canela-BoldItalic.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:300;font-style:normal;src:url('/fonts/GT-Eesti-Text-Light.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:300;font-style:italic;src:url('/fonts/GT-Eesti-Text-Light-Italic.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:500;font-style:normal;src:url('/fonts/GT-Eesti-Text-Medium.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:500;font-style:italic;src:url('/fonts/GT-Eesti-Text-Medium-Italic.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:700;font-style:normal;src:url('/fonts/GT-Eesti-Text-Bold.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti';font-weight:700;font-style:italic;src:url('/fonts/GT-Eesti-Text-Bold-Italic.otf') format('opentype');font-display:swap;}
        @font-face{font-family:'GT Eesti Display';font-weight:500;font-style:normal;src:url('/fonts/GT-Eesti-Display-Medium.otf') format('opentype');font-display:swap;}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:#C4C8D0;border-radius:3px;} ::-webkit-scrollbar-track{background:transparent;}
        input:focus,select:focus,textarea:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px rgba(0,52,98,0.08);}
        h1,h2,h3,h4,h5,h6,.brand-headline{font-family:'Canela', Georgia, serif !important;font-weight:700;}
        body { margin: 0; padding: 0; font-family: 'GT Eesti', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes k9-toast-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Handle location change
  const handleLocationChange = useCallback((locId) => {
    // Demo POS redirects to the full POS app
    const loc = K9_LEAN_LOCATIONS.find(l => l.id === locId);
    if (loc?.isPOS) {
      window.location.href = "/pos/" + (loc.slug || "demo");
      return;
    }
    setCurrentLocation(locId);
    try { localStorage.setItem("k9_lite_location", locId); } catch {}
  }, []);

  // Fetch team accounts for quick-switch
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from("lite_profiles").select("id,user_id,full_name,email,role").eq("location_id", currentLocation).eq("is_active", true)
      .then(({ data: members }) => { if (members) setTeamAccounts(members.filter(m => m.id !== profile.id)); });
  }, [currentLocation, profile?.id]);

  // Handle account switch
  const handleAccountSwitch = async () => {
    if (!switchTarget || !switchPassword) return;
    setSwitchLoading(true);
    setSwitchError("");
    const { error } = await supabase.auth.signInWithPassword({ email: switchTarget.email, password: switchPassword });
    setSwitchLoading(false);
    if (error) { setSwitchError("Invalid password. Please try again."); return; }
    setSwitchTarget(null);
    setSwitchPassword("");
  };

  // Main content area
  const renderPage = () => {
    // Permission area mapping: page id → LEAN_PERMISSION_AREAS key
    const PAGE_PERM_MAP = {
      "lifecycle": "Customer Lifecycle",
      "client-detail": "Customer Lifecycle",
      "dog-detail": "Customer Lifecycle",
      "ops-hub": "Operations Hub",
      "daily-ops": "Operations Hub",
      "attendance": "Attendance Tracker",
      "reports": null,
      "photos": "Photos Module",
      "settings": null, // settings handles its own per-tab permissions
      "enterprise-ops": "Enterprise View",
      "enterprise-attendance": "Enterprise View",
      "enterprise-users": "Enterprise View",
    };
    const requiredPerm = PAGE_PERM_MAP[page];
    if (requiredPerm && currentLocation !== "enterprise" && !hasLeanPermission(profile, requiredPerm)) {
      return <div style={{ padding: 40, textAlign: "center", color: C.dan }}><h2 style={{ margin: 0, color: C.dan }}>Access Denied</h2><p style={{ marginTop: 12, color: C.textSec }}>You don't have permission to access this area.</p></div>;
    }

    switch (page) {
      case "lifecycle":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Customer Lifecycle not available on Enterprise view</div> : (
          <ClientsPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
            lcFilters={lcFilters}
            setLcFilters={setLcFilters}
            lcFilterOpen={lcFilterOpen}
            setLcFilterOpen={setLcFilterOpen}
            locationSlug={currentLocation}
          />
        );
      case "funnel":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Funnel not available on Enterprise view</div> : (
          <FunnelPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />
        );
      case "ops-hub":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Operations Hub not available on Enterprise view</div> : (
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
            sub={params.sub || "opening"}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
          />
        );
      case "ops-opening":
        return <DailyOpsPage data={data} save={save} sub="opening" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-fe":
        return <DailyOpsPage data={data} save={save} sub="fe" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-be":
        return <DailyOpsPage data={data} save={save} sub="be" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-rooms":
        return <DailyOpsPage data={data} save={save} sub="room_cleaning" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pictures":
        return <DailyOpsPage data={data} save={save} sub="pictures" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pp":
        return <DailyOpsPage data={data} save={save} sub="pp" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-closing":
        return <DailyOpsPage data={data} save={save} sub="closing" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-bathing":
        return <DailyOpsPage data={data} save={save} sub="bathing" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pamper":
        return <DailyOpsPage data={data} save={save} sub="pamper" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-svc":
        return <DailyOpsPage data={data} save={save} sub="svc" nav={nav} profile={profile} addGlobalToast={addGlobalToast} params={params} />;
      case "eod":
        return <LiteEODPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "mgmt-audit-log":
        return <AuditLogPage data={data} save={save} nav={nav} profile={profile} />;
      case "mgmt-attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} />;
      case "attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} />;
      case "dog-detail":
        return <DogDetailPage data={data} clientId={params.clientId} dogId={params.dogId} nav={nav} />;
      case "checkout-tv":
        return <CheckoutTVPage data={data} nav={nav} />;
      case "client-detail":
        return <ClientDetailPage data={data} save={save} clientId={params.clientId} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "new-client":
        return <NewClientPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "reports":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Reports not available on Enterprise view</div> : (
          <LiteReportsPage data={data} nav={nav} />
        );
      case "photos":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Photos not available on Enterprise view</div> : <PhotosPage />;
      case "enterprise-ops":
        return <EnterpriseOpsMatrix />;
      case "enterprise-attendance":
        return <EnterpriseAttendance />;
      case "enterprise-users":
        return <EnterpriseUserManagement profile={profile} />;
      case "settings":
        return <SettingsPage profile={profile} addGlobalToast={addGlobalToast} />;
      default:
        return <div>Page not found</div>;
    }
  };

  const isFullscreenPage = page === "checkout-tv";

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'GT Eesti', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Sidebar — hidden on fullscreen pages like Checkout TV */}
      {!isFullscreenPage && <div
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        style={{
          width: sbExpanded ? 240 : 68,
          background: `linear-gradient(180deg, ${C.pri} 0%, #002347 100%)`,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.15s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* Logo Header */}
        <div style={{ padding: "22px 15px 18px", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, height: 40, boxSizing: "content-box" }}>
          <div style={{ flexShrink: 0, width: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sbExpanded ? <K9Logo size={38} /> : <K9LogoMini size={34} />}
          </div>
          <div style={{ overflow: "hidden", opacity: sbExpanded ? 1 : 0, transition: "opacity 0.1s", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.acc, fontFamily: "'Canela', Georgia, serif", letterSpacing: "0.02em" }}>K9 Resorts</div>
            <div style={{ fontSize: 10, color: "rgba(175,141,84,0.6)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>Luxury Pet Hotel</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: "0 14px 8px", height: 1, background: "rgba(175,141,84,0.12)" }} />

        {/* Location Selector */}
        <div style={{ padding: "0 10px 8px", height: 44, boxSizing: "border-box" }}>
          <LocationSelector
            currentLocation={currentLocation}
            onLocationChange={handleLocationChange}
            collapsed={!sbExpanded}
            allLocations={K9_LEAN_LOCATIONS}
            profile={profile}
          />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" }}>
          {(currentLocation === "enterprise" ? LEAN_ENTERPRISE_NAV_ITEMS : LEAN_NAV_ITEMS).map(item => {
            const act = page === item.id;
            const IconComp = I[item.icon];
            return (
              <button
                key={item.id}
                onMouseEnter={e => { if (!act) e.currentTarget.style.background = "rgba(175,141,84,0.08)"; }}
                onMouseLeave={e => { if (!act) e.currentTarget.style.background = act ? "rgba(175,141,84,0.15)" : "transparent"; }}
                onClick={() => nav(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 14px",
                  justifyContent: "flex-start",
                  border: "none",
                  borderRadius: 10,
                  background: act ? "rgba(175,141,84,0.15)" : "transparent",
                  color: act ? C.acc : "rgba(255,255,255,0.85)",
                  fontSize: 13,
                  fontWeight: act ? 600 : 500,
                  cursor: "pointer",
                  marginBottom: 3,
                  fontFamily: "inherit",
                  transition: "background 0.12s, color 0.12s",
                  whiteSpace: "nowrap",
                  position: "relative",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ flexShrink: 0, width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {IconComp && <IconComp />}
                </div>
                <span style={{ overflow: "hidden", opacity: sbExpanded ? 1 : 0, transition: "opacity 0.1s" }}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom: Account Switcher */}
        <div style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
          {sbExpanded && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setAccountSwitchOpen(!accountSwitchOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 8, background: accountSwitchOpen ? "rgba(175,141,84,0.15)" : "transparent", color: "rgba(175,141,84,0.6)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left", transition: "background 0.15s" }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: "rgba(175,141,84,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.acc }}>{(user?.email || "U")[0].toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(175,141,84,0.55)", fontSize: 11 }}>{user?.email || "User"}</div>
                <span style={{ fontSize: 8, color: "rgba(175,141,84,0.3)", transform: accountSwitchOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9650;</span>
              </button>

              {accountSwitchOpen && (
                <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 6, background: "#0B2545", border: "1px solid rgba(175,141,84,0.2)", borderRadius: 10, boxShadow: "0 -8px 32px rgba(0,0,0,0.4)", overflow: "hidden", zIndex: 200, maxHeight: 280, overflowY: "auto" }}>
                  <div style={{ padding: "10px 12px 6px", fontSize: 9, fontWeight: 700, color: "rgba(175,141,84,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Switch Account</div>
                  {teamAccounts.length === 0 ? (
                    <div style={{ padding: "12px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", fontStyle: "italic" }}>No other accounts at this location</div>
                  ) : teamAccounts.map(acct => (
                    <button key={acct.id} onClick={() => { setSwitchTarget(acct); setSwitchPassword(""); setSwitchError(""); setAccountSwitchOpen(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: "transparent", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textAlign: "left", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(175,141,84,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: "rgba(175,141,84,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: C.acc }}>{(acct.full_name || acct.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acct.full_name || acct.email}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acct.email}</div>
                      </div>
                      <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(175,141,84,0.1)", color: "rgba(175,141,84,0.5)", fontWeight: 600, textTransform: "uppercase" }}>{acct.role}</div>
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(175,141,84,0.1)", padding: "6px 12px" }}>
                    <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "8px", border: "none", borderRadius: 6, background: "rgba(239,68,68,0.12)", color: "rgba(255,150,150,0.8)", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>Sign Out</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!sbExpanded && <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "7px 14px", border: "none", borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "rgba(255,150,150,0.8)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 500, textAlign: "center", boxSizing: "border-box" }}>&#9211;</button>}
          {sbExpanded && <div style={{ textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.4 }}>&copy; 2026 K9 Operations LLC<br/>All Rights Reserved</div>}

          {switchTarget && ReactDOM.createPortal(
            /* NOTE: closing </div> for sidebar is inside the !isFullscreenPage conditional */
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>
              <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, padding: 28, width: 380, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Switch Account</div>
                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>Enter password for <strong>{switchTarget.full_name || switchTarget.email}</strong></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.pri }}>{(switchTarget.full_name || switchTarget.email || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{switchTarget.full_name || "Team Member"}</div>
                    <div style={{ fontSize: 11, color: C.textMut }}>{switchTarget.email}</div>
                  </div>
                </div>
                <input type="password" value={switchPassword} onChange={e => setSwitchPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAccountSwitch()} placeholder="Password" autoFocus style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${switchError ? "#EF4444" : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", marginBottom: switchError ? 8 : 16 }} />
                {switchError && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 12, fontWeight: 500 }}>{switchError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Btn variant="secondary" onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>Cancel</Btn>
                  <Btn variant="primary" onClick={handleAccountSwitch} disabled={!switchPassword || switchLoading}>{switchLoading ? "Signing in..." : "Switch"}</Btn>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              background: t.type === "success" ? C.suc : t.type === "error" ? C.dan : t.type === "warning" ? C.warn : C.pri,
              color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              animation: "k9-toast-in 0.25s ease",
              display: "flex", alignItems: "center", gap: 8, maxWidth: 380,
            }}>
              <span>{t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : t.type === "warning" ? "\u26A0" : "\u2139"}</span>
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto", background: isFullscreenPage ? "transparent" : C.bg, padding: isFullscreenPage ? 0 : "32px 40px" }}>
        <div style={{ maxWidth: isFullscreenPage ? "none" : 1440, margin: "0 auto" }}>
          {navStack.length > 1 && !isFullscreenPage && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13,flexWrap:"wrap"}}>
              {navStack.map((entry, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{color:C.border,fontSize:11,userSelect:"none"}}>›</span>}
                  {i < navStack.length - 1 ? (
                    <span onClick={() => { setPage(entry.page); setParams(entry.params); setNavStack(s => s.slice(0, i + 1)); }}
                      style={{cursor:"pointer",color:C.pri,fontWeight:500,padding:"2px 6px",borderRadius:6,transition:"background 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.priLt}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {breadcrumbLabel(entry.page, entry.params)}
                    </span>
                  ) : (
                    <span style={{fontWeight:600,color:C.text,padding:"2px 6px"}}>{breadcrumbLabel(entry.page, entry.params)}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

export default function LiteApp() {
  return <LeanAppErrorBoundary><LeanAppInner /></LeanAppErrorBoundary>;
}
