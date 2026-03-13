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

// ─── Icons ──────────────────────────────────────────────────────────────────
const Icons = {
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Lifecycle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  OpsHub: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>,
  Photos: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  AlertTriangle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Link: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Menu: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  ChevronUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  ChevronDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevronLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Calendar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ─── Font Faces ─────────────────────────────────────────────────────────────
const fontFaces = `
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'Canela'; src: url('/fonts/Canela-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
`;

// ─── Utility Functions ──────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const fmtPhone = (p) => {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || "";
};

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

const daysSince = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// ─── Shared UI Components ───────────────────────────────────────────────────
function Card({ children, style = {}, onClick, hoverable }) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: C.surface,
        borderRadius: 14,
        border: `1px solid ${h && hoverable ? C.priL : C.border}`,
        padding: 20,
        transition: "all 0.2s",
        cursor: onClick ? "pointer" : "default",
        transform: h && hoverable ? "translateY(-1px)" : "none",
        boxShadow: h && hoverable ? "0 4px 12px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.02)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children, color = "default", size = "sm" }) {
  const cm = {
    default: { bg: C.surfaceHover, text: C.textSec },
    primary: { bg: C.priLt, text: C.pri },
    success: { bg: C.sucLt, text: C.suc },
    warning: { bg: C.warnLt, text: C.warn },
    danger: { bg: C.danLt, text: C.dan },
    info: { bg: C.infoLt, text: C.info },
    accent: { bg: C.accLt, text: C.accDk },
  };
  const s = cm[color] || cm.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: size === "sm" ? "2px 10px" : "4px 14px",
        borderRadius: 20,
        fontSize: size === "sm" ? 11 : 13,
        fontWeight: 600,
        background: s.bg,
        color: s.text,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Btn({ children, variant = "primary", size = "md", onClick, disabled, style = {}, icon }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontFamily: "inherit",
    borderRadius: 10,
    transition: "all 0.15s",
    opacity: disabled ? 0.5 : 1,
    letterSpacing: "0.01em",
  };
  const sz = {
    sm: { padding: "6px 14px", fontSize: 13 },
    md: { padding: "10px 20px", fontSize: 14 },
    lg: { padding: "12px 24px", fontSize: 15 },
  };
  const vr = {
    primary: { background: C.pri, color: "#fff" },
    accent: { background: C.acc, color: "#fff" },
    secondary: { background: C.surfaceHover, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.textSec },
    danger: { background: C.danLt, color: C.dan },
    success: { background: C.suc, color: "#fff" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...sz[size], ...vr[variant], ...style }}
    >
      {icon && icon}
      {children}
    </button>
  );
}

// ─── Mock Data Hook (useGingrData) ──────────────────────────────────────────
// TODO: Wire in real Gingr API calls using credentials from k9_gingr_credentials
function useGingrData() {
  const [clients, setClients] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay
    setTimeout(() => {
      setClients(MOCK_CLIENTS);
      setDogs(MOCK_DOGS);
      setReservations(MOCK_RESERVATIONS);
      setLoading(false);
    }, 500);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setClients(MOCK_CLIENTS);
      setDogs(MOCK_DOGS);
      setReservations(MOCK_RESERVATIONS);
      setLoading(false);
    }, 500);
  }, []);

  return { clients, dogs, reservations, loading, error: null, refresh };
}

// Mock data for Adair Forsythe K9 Resorts
const MOCK_CLIENTS = [
  {
    id: "c1",
    name: "Casey Johnson",
    phone: "8565551234",
    email: "sarah.j@email.com",
    dogs: ["d1", "d2"],
    totalSpent: 2850.00,
    conversions: [],
    cold: false,
  },
  {
    id: "c2",
    name: "Michael Chen",
    phone: "8565552345",
    email: "mchen@email.com",
    dogs: ["d3"],
    totalSpent: 1200.50,
    conversions: [],
    cold: false,
  },
  {
    id: "c3",
    name: "Emma Bennett",
    phone: "8565553456",
    email: "emma.m@email.com",
    dogs: ["d4"],
    totalSpent: 0,
    conversions: ["eval"],
    cold: false,
  },
  {
    id: "c4",
    name: "James Wilson",
    phone: "8565554567",
    email: "jw@email.com",
    dogs: ["d5"],
    totalSpent: 3450.75,
    conversions: [],
    cold: false,
  },
  {
    id: "c5",
    name: "Lisa Anderson",
    phone: "8565555678",
    email: "lisa.a@email.com",
    dogs: ["d6", "d7"],
    totalSpent: 890.25,
    conversions: ["tour"],
    cold: false,
  },
  {
    id: "c6",
    name: "David Brown",
    phone: "8565556789",
    email: "dbrown@email.com",
    dogs: ["d8"],
    totalSpent: 0,
    conversions: ["eval", "tour"],
    cold: false,
  },
  {
    id: "c7",
    name: "Jennifer Lee",
    phone: "8565557890",
    email: "jen.lee@email.com",
    dogs: ["d9"],
    totalSpent: 2100.00,
    conversions: [],
    cold: false,
  },
  {
    id: "c8",
    name: "Robert Taylor",
    phone: "8565558901",
    email: "rtaylor@email.com",
    dogs: ["d10"],
    totalSpent: 1575.50,
    conversions: [],
    cold: false,
  },
  {
    id: "c9",
    name: "Patricia White",
    phone: "8565559012",
    email: "pwhite@email.com",
    dogs: [],
    totalSpent: 0,
    conversions: ["tour"],
    cold: false,
  },
  {
    id: "c10",
    name: "Christopher Harris",
    phone: "8565560123",
    email: "c.harris@email.com",
    dogs: ["d11"],
    totalSpent: 4200.00,
    conversions: [],
    cold: false,
  },
  {
    id: "c11",
    name: "Angela Clark",
    phone: "8565561234",
    email: "aclark@email.com",
    dogs: ["d12"],
    totalSpent: 750.00,
    conversions: [],
    cold: false,
  },
  {
    id: "c12",
    name: "Daniel Garcia",
    phone: "8565562345",
    email: "dgarcia@email.com",
    dogs: ["d13"],
    totalSpent: 0,
    conversions: ["eval"],
    cold: false,
  },
  {
    id: "c13",
    name: "Michelle Rodriguez",
    phone: "8565563456",
    email: "mrodriguez@email.com",
    dogs: ["d14"],
    totalSpent: 2250.75,
    conversions: [],
    cold: false,
  },
  {
    id: "c14",
    name: "Quinn Thompson",
    phone: "8565564567",
    email: "kthompson@email.com",
    dogs: ["d15"],
    totalSpent: 3100.00,
    conversions: [],
    cold: false,
  },
  {
    id: "c15",
    name: "Brenda Martin",
    phone: "8565565678",
    email: "bmartin@email.com",
    dogs: [],
    totalSpent: 0,
    conversions: ["online"],
    cold: true,
  },
];

const MOCK_DOGS = [
  { id: "d1", name: "Max", breed: "Golden Retriever", clientId: "c1" },
  { id: "d2", name: "Bella", breed: "Labrador", clientId: "c1" },
  { id: "d3", name: "Charlie", breed: "German Shepherd", clientId: "c2" },
  { id: "d4", name: "Daisy", breed: "Beagle", clientId: "c3" },
  { id: "d5", name: "Duke", breed: "Boxer", clientId: "c4" },
  { id: "d6", name: "Lucy", breed: "Poodle", clientId: "c5" },
  { id: "d7", name: "Buddy", breed: "Dachshund", clientId: "c5" },
  { id: "d8", name: "Bailey", breed: "Cocker Spaniel", clientId: "c6" },
  { id: "d9", name: "Rocky", breed: "Pitbull", clientId: "c7" },
  { id: "d10", name: "Molly", breed: "Pomeranian", clientId: "c8" },
  { id: "d11", name: "Cooper", breed: "Husky", clientId: "c10" },
  { id: "d12", name: "Sadie", breed: "Shih Tzu", clientId: "c11" },
  { id: "d13", name: "Jackson", breed: "Rottweiler", clientId: "c12" },
  { id: "d14", name: "Abby", breed: "Collie", clientId: "c13" },
  { id: "d15", name: "Milo", breed: "Schnauzer", clientId: "c14" },
];

const MOCK_RESERVATIONS = [
  {
    id: "r1",
    clientId: "c1",
    dogId: "d1",
    type: "boarding",
    checkIn: "2026-03-01",
    checkOut: "2026-03-05",
    cost: 400.00,
  },
  {
    id: "r2",
    clientId: "c1",
    dogId: "d2",
    type: "daycare",
    checkIn: "2026-03-10",
    checkOut: "2026-03-10",
    cost: 45.00,
  },
  {
    id: "r3",
    clientId: "c2",
    dogId: "d3",
    type: "boarding",
    checkIn: "2026-02-15",
    checkOut: "2026-02-19",
    cost: 320.00,
  },
  {
    id: "r4",
    clientId: "c3",
    dogId: "d4",
    type: "eval",
    checkIn: "2026-03-05",
    checkOut: "2026-03-05",
    cost: 0,
  },
  {
    id: "r5",
    clientId: "c4",
    dogId: "d5",
    type: "boarding",
    checkIn: "2026-02-01",
    checkOut: "2026-02-08",
    cost: 560.00,
  },
  {
    id: "r6",
    clientId: "c5",
    dogId: "d6",
    type: "daycare",
    checkIn: "2026-03-06",
    checkOut: "2026-03-06",
    cost: 45.00,
  },
  {
    id: "r7",
    clientId: "c6",
    dogId: "d8",
    type: "tour",
    checkIn: "2026-03-07",
    checkOut: "2026-03-07",
    cost: 0,
  },
  {
    id: "r8",
    clientId: "c7",
    dogId: "d9",
    type: "boarding",
    checkIn: "2026-01-10",
    checkOut: "2026-01-15",
    cost: 400.00,
  },
  {
    id: "r9",
    clientId: "c8",
    dogId: "d10",
    type: "daycare",
    checkIn: "2026-03-08",
    checkOut: "2026-03-08",
    cost: 35.00,
  },
  {
    id: "r10",
    clientId: "c10",
    dogId: "d11",
    type: "boarding",
    checkIn: "2026-03-02",
    checkOut: "2026-03-09",
    cost: 560.00,
  },
  {
    id: "r11",
    clientId: "c11",
    dogId: "d12",
    type: "daycare",
    checkIn: "2026-03-03",
    checkOut: "2026-03-03",
    cost: 35.00,
  },
  {
    id: "r12",
    clientId: "c13",
    dogId: "d14",
    type: "boarding",
    checkIn: "2026-01-20",
    checkOut: "2026-01-28",
    cost: 480.00,
  },
  {
    id: "r13",
    clientId: "c14",
    dogId: "d15",
    type: "boarding",
    checkIn: "2026-02-01",
    checkOut: "2026-02-10",
    cost: 630.00,
  },
];

// ─── Settings Page ──────────────────────────────────────────────────────────
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

// ─── Lifecycle Page ─────────────────────────────────────────────────────────
function LifecyclePage({ onSelectClient, setSelectedClientId }) {
  const { clients, dogs, reservations, loading } = useGingrData();
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [lifecycleData, setLifecycleData] = useState({});

  // TODO: Load lifecycle data from Supabase (k9_lean_lifecycle or similar)
  useEffect(() => {
    const initialData = {};
    clients.forEach((c) => {
      initialData[c.id] = {
        stage: computeStage(c, clients, dogs, reservations),
        cold: c.cold,
        followUpDate: computeFollowUpDate(c, clients, dogs, reservations),
        notes: "",
      };
    });
    setLifecycleData(initialData);
  }, [clients, dogs, reservations]);

  const computeStage = (client, allClients, allDogs, allResv) => {
    if (client.cold) return "cold";
    const hasRealBooking = allResv.some((r) => r.clientId === client.id && ["boarding", "daycare"].includes(r.type));
    const hasSpent = client.totalSpent > 0;
    if (!hasRealBooking && !hasSpent) return "conversion";
    if (!hasRealBooking && hasSpent) return "active";
    const lastResv = allResv
      .filter((r) => r.clientId === client.id && ["boarding", "daycare"].includes(r.type))
      .sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut))[0];
    if (!lastResv) return "active";
    const daysSinceCheckout = daysSince(lastResv.checkOut);
    const isLapsed =
      (lastResv.type === "daycare" && daysSinceCheckout > 90) || (lastResv.type === "boarding" && daysSinceCheckout > 180);
    return isLapsed && hasSpent ? "retention" : hasSpent ? "active" : "conversion";
  };

  const computeFollowUpDate = (client, allClients, allDogs, allResv) => {
    const lastResv = allResv
      .filter((r) => r.clientId === client.id)
      .sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut))[0];
    if (!lastResv) return null;
    const isLapsed =
      (lastResv.type === "daycare" && daysSince(lastResv.checkOut) > 90) ||
      (lastResv.type === "boarding" && daysSince(lastResv.checkOut) > 180);
    if (isLapsed) return addDays(lastResv.checkOut, 30);
    return null;
  };

  const tabsConfig = {
    conversion: { label: "Conversion", color: "info" },
    active: { label: "Active Customers", color: "success" },
    retention: { label: "Retention", color: "warning" },
    cold: { label: "Cold", color: "danger" },
    all: { label: "All", color: "default" },
  };

  const filtered = useMemo(() => {
    let result = clients.filter((c) => {
      const stage = lifecycleData[c.id]?.stage || "conversion";
      if (activeTab !== "all" && stage !== activeTab) return false;
      const searchLower = search.toLowerCase();
      const searchMatch =
        c.name.toLowerCase().includes(searchLower) ||
        c.phone.includes(searchLower) ||
        dogs.some((d) => d.clientId === c.id && d.name.toLowerCase().includes(searchLower));
      if (!searchMatch) return false;
      if (showOverdueOnly) {
        const followUpDate = lifecycleData[c.id]?.followUpDate;
        const isOverdue = followUpDate && new Date(followUpDate) < new Date();
        return isOverdue;
      }
      return true;
    });

    result.sort((a, b) => {
      let aVal, bVal;
      if (sortCol === "name") {
        aVal = a.name;
        bVal = b.name;
      } else if (sortCol === "phone") {
        aVal = a.phone;
        bVal = b.phone;
      } else if (sortCol === "totalSpent") {
        aVal = a.totalSpent;
        bVal = b.totalSpent;
      } else if (sortCol === "lastRes") {
        const aLastRes = reservations
          .filter((r) => r.clientId === a.id)
          .sort((x, y) => new Date(y.checkOut) - new Date(x.checkOut))[0];
        const bLastRes = reservations
          .filter((r) => r.clientId === b.id)
          .sort((x, y) => new Date(y.checkOut) - new Date(x.checkOut))[0];
        aVal = aLastRes ? new Date(aLastRes.checkOut).getTime() : 0;
        bVal = bLastRes ? new Date(bLastRes.checkOut).getTime() : 0;
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [clients, search, activeTab, sortCol, sortAsc, showOverdueOnly, lifecycleData, dogs, reservations]);

  const tabCounts = {
    conversion: clients.filter((c) => (lifecycleData[c.id]?.stage || "conversion") === "conversion").length,
    active: clients.filter((c) => (lifecycleData[c.id]?.stage || "conversion") === "active").length,
    retention: clients.filter((c) => (lifecycleData[c.id]?.stage || "conversion") === "retention").length,
    cold: clients.filter((c) => (lifecycleData[c.id]?.stage || "conversion") === "cold").length,
    all: clients.length,
  };

  const getClientDogs = (clientId) => dogs.filter((d) => d.clientId === clientId);
  const getLastReservation = (clientId) =>
    reservations
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut))[0];

  if (loading) {
    return (
      <div style={{ textAlign: "center", color: C.textMut, paddingTop: 60, fontSize: 14 }}>
        Loading customer data...
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        Customer Lifecycle
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Track customer journeys from evaluation to active to at-risk. Powered by Gingr data.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {Object.keys(tabsConfig).map((tabId) => {
          const cfg = tabsConfig[tabId];
          const isActive = activeTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? C.acc : C.border}`,
                background: isActive ? C.accLt : "transparent",
                color: isActive ? C.accDk : C.textSec,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              {cfg.label}
              <Badge color={cfg.color} size="sm">
                {tabCounts[tabId]}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search by name, phone, or dog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            fontSize: 14,
            fontFamily: "inherit",
            background: C.surface,
          }}
        />
        <button
          onClick={() => setShowOverdueOnly(!showOverdueOnly)}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: `1.5px solid ${showOverdueOnly ? C.warn : C.border}`,
            background: showOverdueOnly ? C.warnLt : "transparent",
            color: showOverdueOnly ? C.warn : C.textSec,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            transition: "all 0.15s",
          }}
        >
          Overdue Only
        </button>
        <Btn variant="primary" size="md">
          Mass Text
        </Btn>
      </div>

      {/* Table */}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, height: 40 }}>
                <th
                  onClick={() => {
                    setSortCol("name");
                    setSortAsc(sortCol === "name" ? !sortAsc : true);
                  }}
                  style={{
                    textAlign: "left",
                    fontWeight: 600,
                    color: C.textSec,
                    cursor: "pointer",
                    padding: "8px 12px",
                    userSelect: "none",
                  }}
                >
                  Name {sortCol === "name" && (sortAsc ? "↑" : "↓")}
                </th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Phone</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Dogs</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Total Reservations</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Last Reservation</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Days Since</th>
                <th
                  onClick={() => {
                    setSortCol("totalSpent");
                    setSortAsc(sortCol === "totalSpent" ? !sortAsc : true);
                  }}
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color: C.textSec,
                    cursor: "pointer",
                    padding: "8px 12px",
                    userSelect: "none",
                  }}
                >
                  Total Spent {sortCol === "totalSpent" && (sortAsc ? "↑" : "↓")}
                </th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Follow-Up</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px 12px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => {
                const clientDogs = getClientDogs(client.id);
                const lastRes = getLastReservation(client.id);
                const followUpDate = lifecycleData[client.id]?.followUpDate;
                const isOverdue = followUpDate && new Date(followUpDate) < new Date();
                return (
                  <tr key={client.id} style={{ borderBottom: `1px solid ${C.borderLight}`, height: 44 }}>
                    <td
                      onClick={() => {
                        setSelectedClientId(client.id);
                        onSelectClient(client.id);
                      }}
                      style={{
                        padding: "8px 12px",
                        color: C.pri,
                        cursor: "pointer",
                        fontWeight: 500,
                        textDecoration: "underline",
                      }}
                    >
                      {client.name}
                    </td>
                    <td style={{ padding: "8px 12px", color: C.text }}>{fmtPhone(client.phone)}</td>
                    <td style={{ padding: "8px 12px", color: C.text }}>
                      {clientDogs.length > 0 ? (
                        <span title={clientDogs.map((d) => d.name).join(", ")}>
                          {clientDogs.length} dog{clientDogs.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ color: C.textMut }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: C.text }}>
                      {reservations.filter((r) => r.clientId === client.id).length}
                    </td>
                    <td style={{ padding: "8px 12px", color: C.text }}>
                      {lastRes ? fmtDate(lastRes.checkOut) : <span style={{ color: C.textMut }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 12px", color: C.text }}>
                      {lastRes ? daysSince(lastRes.checkOut) + " days" : <span style={{ color: C.textMut }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 12px", color: C.text, textAlign: "right", fontWeight: 500 }}>
                      ${client.totalSpent.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: isOverdue ? C.dan : C.text,
                        fontWeight: isOverdue ? 600 : 400,
                      }}
                    >
                      {followUpDate ? (
                        <>
                          {fmtDate(followUpDate)}
                          {isOverdue && <span style={{ marginLeft: 8, fontSize: 11, color: C.dan }}>OVERDUE</span>}
                        </>
                      ) : (
                        <span style={{ color: C.textMut }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Btn variant="ghost" size="sm">
                        Log
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Client Detail Page ──────────────────────────────────────────────────────
function ClientDetailPage({ clientId, onBack, clients, dogs, reservations }) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return <div>Client not found</div>;

  const clientDogs = dogs.filter((d) => d.clientId === clientId);
  const clientResv = reservations.filter((r) => r.clientId === clientId).sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut));

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: C.pri,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 20,
        }}
      >
        <Icons.ChevronLeft /> Back
      </button>

      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        {client.name}
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>
        {fmtPhone(client.phone)} • {client.email}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20, marginBottom: 24 }}>
        <Card>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>DOGS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
            {clientDogs.length}
          </div>
          {clientDogs.length > 0 && (
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", fontSize: 13, color: C.text }}>
              {clientDogs.map((d) => (
                <li key={d.id} style={{ padding: "4px 0" }}>
                  {d.name} • {d.breed}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>TOTAL SPENT</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.suc }}>
            ${client.totalSpent.toFixed(2)}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>RESERVATIONS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.pri }}>
            {clientResv.length}
          </div>
        </Card>
      </div>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: C.text }}>Reservation History</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, height: 36 }}>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px" }}>Type</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px" }}>Check-In</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px" }}>Check-Out</th>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.textSec, padding: "8px" }}>Dog</th>
                <th style={{ textAlign: "right", fontWeight: 600, color: C.textSec, padding: "8px" }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {clientResv.map((r) => {
                const dog = dogs.find((d) => d.id === r.dogId);
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.borderLight}`, height: 40 }}>
                    <td style={{ padding: "8px" }}>
                      <Badge color="info" size="sm">
                        {r.type}
                      </Badge>
                    </td>
                    <td style={{ padding: "8px", color: C.text }}>{fmtDate(r.checkIn)}</td>
                    <td style={{ padding: "8px", color: C.text }}>{fmtDate(r.checkOut)}</td>
                    <td style={{ padding: "8px", color: C.text }}>{dog?.name || "—"}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: C.text, fontWeight: 500 }}>
                      ${r.cost.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Operations Hub Page ────────────────────────────────────────────────────
function OpsHubPage({ onSelectOpsPage }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [expandSnapshot, setExpandSnapshot] = useState(true);
  const [expandAnalytics, setExpandAnalytics] = useState(false);

  const OPS_CARDS = [
    { id: "opening", label: "Opening", icon: "▪", section: "Daily Operations" },
    { id: "fe", label: "Front-End", icon: "▪", section: "Daily Operations" },
    { id: "be", label: "Back-End", icon: "▪", section: "Daily Operations" },
    { id: "room_cleaning", label: "Room Cleaning", icon: "▪", section: "Daily Operations" },
    { id: "pictures", label: "Pictures", icon: "▪", section: "Daily Operations" },
    { id: "pp", label: "Private Play", icon: "▪", section: "Daily Operations" },
    { id: "closing", label: "Closing", icon: "▪", section: "Daily Operations" },
    { id: "eod", label: "EOD Report", icon: "▪", section: "Daily Operations" },
  ];

  const sections = [...new Set(OPS_CARDS.map((c) => c.section))];

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        Operations Hub
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Daily checklists, room cleaning, opening/closing procedures, and EOD reports.
      </p>

      {/* Date Navigation */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer" }}
        >
          <Icons.ChevronLeft />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.surface,
            fontFamily: "inherit",
            fontSize: 14,
          }}
        />
        <button
          onClick={() => setSelectedDate(todayStr())}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.surface,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Today
        </button>
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer" }}
        >
          <Icons.ChevronUp />
        </button>
      </div>

      {/* Today's Progress Snapshot */}
      <Card style={{ marginBottom: 24 }}>
        <button
          onClick={() => setExpandSnapshot(!expandSnapshot)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: expandSnapshot ? 16 : 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Today's Progress</h3>
          {expandSnapshot ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
        </button>

        {expandSnapshot && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>Dogs in House</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.pri }}>6</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>Going Home Today</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.suc }}>2</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>Checked Out</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>4</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>Overall Completion</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.acc }}>72%</div>
            </div>
          </div>
        )}
      </Card>

      {/* Summary Analytics */}
      <Card style={{ marginBottom: 24 }}>
        <button
          onClick={() => setExpandAnalytics(!expandAnalytics)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: expandAnalytics ? 16 : 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Summary Analytics</h3>
          {expandAnalytics ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
        </button>

        {expandAnalytics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, fontSize: 12 }}>
            {["Opening", "FE", "BE", "Closing"].map((name) => (
              <div key={name}>
                <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>{name}</div>
                <div style={{ color: C.textMut, marginBottom: 2 }}>7d Avg: 85%</div>
                <div style={{ color: C.suc, marginBottom: 2 }}>WoW: +5%</div>
                <div style={{ color: C.textMut }}>MTD: 82%</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Operations Cards */}
      {sections.map((section) => (
        <div key={section} style={{ marginBottom: 32 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {section}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {OPS_CARDS.filter((c) => c.section === section).map((card) => (
              <Card
                key={card.id}
                onClick={() => onSelectOpsPage(card.id)}
                hoverable
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 140 }}
              >
                <div>
                  <div style={{ fontSize: 12, color: C.textMut, marginBottom: 8, fontWeight: 600 }}>Status</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Badge color="success" size="sm">
                      In Progress
                    </Badge>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: 600 }}>{card.label}</div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: C.borderLight,
                      overflow: "hidden",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "65%",
                        background: C.suc,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: C.textMut }}>65% complete</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Daily Ops Page (Checklists) ────────────────────────────────────────────
function DailyOpsPage({ opsSubPage, onBack }) {
  const [checklist, setChecklist] = useState([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let template = [];
    if (opsSubPage === "opening") template = DEF_OPENING_TEMPLATE;
    else if (opsSubPage === "fe") template = DEF_FE_TEMPLATE;
    else if (opsSubPage === "be") template = DEF_BE_TEMPLATE;
    else if (opsSubPage === "closing") template = DEF_CLOSING_TEMPLATE;

    const initialized = template.map((t) => ({
      ...t,
      completed: false,
      completedBy: null,
      completedAt: null,
    }));
    setChecklist(initialized);
  }, [opsSubPage]);

  const toggleItem = (id) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            completed: !item.completed,
            completedAt: !item.completed ? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null,
            completedBy: !item.completed ? "You" : null,
          }
          : item
      )
    );
  };

  const completed = checklist.filter((i) => i.completed).length;
  const total = checklist.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const labelMap = {
    opening: "Opening Checklist",
    fe: "Front-End Checklist",
    be: "Back-End Checklist",
    closing: "Closing Checklist",
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: C.pri,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 20,
        }}
      >
        <Icons.ChevronLeft /> Back to Operations Hub
      </button>

      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
        {labelMap[opsSubPage]}
      </h2>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: C.borderLight,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  background: C.suc,
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, minWidth: 60 }}>
            {percent}%
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.textMut }}>
          {completed} of {total} tasks completed
        </div>
      </div>

      {/* Checklist */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {checklist.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: idx < checklist.length - 1 ? `1px solid ${C.borderLight}` : "none",
              }}
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => toggleItem(item.id)}
                disabled={locked}
                style={{
                  width: 20,
                  height: 20,
                  cursor: locked ? "not-allowed" : "pointer",
                  accentColor: C.suc,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: item.completed ? C.textMut : C.text,
                    textDecoration: item.completed ? "line-through" : "none",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </div>
                {item.time && (
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>
                    {item.time}
                  </div>
                )}
              </div>
              {item.completed && (
                <div style={{ fontSize: 12, color: C.textMut, textAlign: "right", flexShrink: 0 }}>
                  <div>{item.completedAt}</div>
                  <div>{item.completedBy}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        <Btn variant="primary" size="md">
          Save Checklist
        </Btn>
        <Btn
          variant="secondary"
          size="md"
          onClick={() => setLocked(!locked)}
        >
          {locked ? "Unlock" : "Lock"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Photos Page ────────────────────────────────────────────────────────────
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

// ─── Lean App Shell ─────────────────────────────────────────────────────────
export default function LeanApp() {
  const { user, profile, signOut } = useAuth();
  const [activePage, setActivePage] = useState("lifecycle");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [opsSubPage, setOpsSubPage] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const { clients, dogs, reservations } = useGingrData();

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    setActivePage("client-detail");
  };

  const handleSelectOpsPage = (subPage) => {
    setOpsSubPage(subPage);
    setActivePage("daily-ops");
  };

  const handleBackFromDetail = () => {
    setSelectedClientId(null);
    setActivePage("lifecycle");
  };

  const handleBackFromOps = () => {
    setOpsSubPage(null);
    setActivePage("ops-hub");
  };

  const renderPage = () => {
    switch (activePage) {
      case "lifecycle":
        return (
          <LifecyclePage
            onSelectClient={handleSelectClient}
            setSelectedClientId={setSelectedClientId}
          />
        );
      case "client-detail":
        return (
          <ClientDetailPage
            clientId={selectedClientId}
            onBack={handleBackFromDetail}
            clients={clients}
            dogs={dogs}
            reservations={reservations}
          />
        );
      case "ops-hub":
        return <OpsHubPage onSelectOpsPage={handleSelectOpsPage} />;
      case "daily-ops":
        return <DailyOpsPage opsSubPage={opsSubPage} onBack={handleBackFromOps} />;
      case "photos":
        return <PhotosPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <LifecyclePage onSelectClient={handleSelectClient} setSelectedClientId={setSelectedClientId} />;
    }
  };

  return (
    <div
      style={{
        fontFamily: "'GT Eesti', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: C.bg,
        minHeight: "100vh",
        display: "flex",
      }}
    >
      <style>{fontFaces}</style>

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          style={{
            width: 240,
            minHeight: "100vh",
            background: C.pri,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            position: isMobile ? "fixed" : "relative",
            zIndex: isMobile ? 999 : 1,
            boxShadow: isMobile ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
            transition: "width 0.2s",
          }}
        >
          {/* Logo area */}
          <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={K9_LOGO_SRC}
              alt="K9"
              style={{ width: 32, height: "auto", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            />
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "'Canela', Georgia, serif",
                  lineHeight: 1.2,
                }}
              >
                K9 Operations
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Lean
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div style={{ flex: 1, padding: "8px 8px" }}>
            {NAV_ITEMS.map((item) => {
              const Icon = Icons[item.icon];
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: isActive ? "rgba(175,141,84,0.2)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.15s",
                    marginBottom: 2,
                    textAlign: "left",
                  }}
                >
                  <Icon /> {item.label}
                </button>
              );
            })}
          </div>

          {/* User / Sign out */}
          <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
                marginBottom: 8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email}
            </div>
            <button
              onClick={signOut}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <Icons.LogOut /> Sign Out
            </button>
          </div>

          <div style={{ padding: "8px 16px 12px", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            &copy; 2026 K9 Operations LLC
          </div>
        </div>
      )}

      {/* Overlay for mobile sidebar */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top bar */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
            background: C.surface,
            borderBottom: `1px solid ${C.borderLight}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.textSec,
              padding: 4,
            }}
          >
            <Icons.Menu />
          </button>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {activePage === "client-detail"
              ? `${clients.find((c) => c.id === selectedClientId)?.name || "Client"}`
              : activePage === "daily-ops"
                ? "Daily Operations"
                : NAV_ITEMS.find((n) => n.id === activePage)?.label || "K9 Operations"}
          </div>
          <div style={{ flex: 1 }} />
          <a
            href="/pos"
            style={{
              fontSize: 12,
              color: C.textMut,
              textDecoration: "none",
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${C.borderLight}`,
              transition: "all 0.15s",
            }}
          >
            Open POS →
          </a>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: "32px 24px", maxWidth: 1200, width: "100%" }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
