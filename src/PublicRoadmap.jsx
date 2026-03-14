// © 2026 K9 Operations LLC. All Rights Reserved.
import React, { useState, useMemo, useCallback } from "react";

// ─── Playfair Display font ─────────────────────────────────────────────────────
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap');`;

// ─── Dark Luxury Color System ─────────────────────────────────────────────────
const D = {
  bg: '#0A0F1C',
  bgAlt: '#0D1425',
  surface: '#141B2D',
  surfaceHover: '#1A2340',
  border: '#1E2A42',
  borderLight: '#2A3A5C',
  text: '#F0F2F5',
  textSec: '#8B95A8',
  textMut: '#5A647A',
  gold: '#AF8D54',
  goldLight: '#C4A46A',
  goldDark: '#8B6F3C',
  goldGlow: 'rgba(175,141,84,0.15)',
  navy: '#003462',
  navyLight: '#0A4D8A',
};

// ─── Category Colors (dark theme) ─────────────────────────────────────────────
const CATEGORY_COLORS = {
  'Customer Lifecycle': { bg: '#1e3a5f', text: '#93c5fd' },
  'Operations Hub':     { bg: '#064e3b', text: '#6ee7b7' },
  'Checkout TV':        { bg: '#3b1f7c', text: '#c4b5fd' },
  'Ignite':             { bg: '#7c2d12', text: '#fdba74' },
  'Enterprise':         { bg: '#312e81', text: '#a5b4fc' },
  'Data Expansion':     { bg: '#134e4a', text: '#5eead4' },
  'Dashboard':          { bg: '#78350f', text: '#fcd34d' },
  'Settings':           { bg: '#374151', text: '#d1d5db' },
};

// ─── Priority Colors (dark-friendly) ──────────────────────────────────────────
const PRIORITY_COLORS = {
  P0: { bg: 'rgba(220,38,38,0.15)', text: '#f87171', border: 'rgba(248,113,113,0.3)', dot: '#ef4444' },
  P1: { bg: 'rgba(234,88,12,0.15)', text: '#fb923c', border: 'rgba(251,146,60,0.3)',  dot: '#f97316' },
  P2: { bg: 'rgba(37,99,235,0.15)', text: '#60a5fa', border: 'rgba(96,165,250,0.3)',  dot: '#3b82f6' },
  P3: { bg: 'rgba(75,85,99,0.2)',   text: '#9ca3af', border: 'rgba(156,163,175,0.3)', dot: '#6b7280' },
};

// ─── Status Colors (dark-friendly) ────────────────────────────────────────────
const STATUS_COLORS = {
  backlog:      { bg: 'rgba(71,85,105,0.2)',   text: '#94a3b8' },
  in_progress:  { bg: 'rgba(37,99,235,0.15)',  text: '#60a5fa' },
  needs_review: { bg: 'rgba(217,119,6,0.15)',  text: '#fbbf24' },
  completed:    { bg: 'rgba(22,163,74,0.15)',  text: '#4ade80' },
};

const STATUS_LABELS = {
  backlog:      'Backlog',
  in_progress:  'In Progress',
  needs_review: 'Needs Review',
  completed:    'Completed',
};

const COLUMN_ACCENT = {
  backlog:      '#64748b',
  in_progress:  D.gold,
  needs_review: '#fbbf24',
  completed:    '#4ade80',
};

// ─── Sanitized Public Roadmap Data (51 tasks, public fields only) ─────────────
const PUBLIC_TASKS = [
  // ─── Customer Lifecycle ───
  { id: 'CLM-001', title: 'Old From Gingr Sync Tab', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Implement 14-day threshold for conversion records on initial Gingr sync.' },
  { id: 'CLM-002', title: 'Remove Mass Text Button', category: 'Customer Lifecycle', priority: 'P2', status: 'backlog', description: 'Remove the non-functional mass text button from K9 Ops Lite.' },
  { id: 'CLM-003', title: 'New Client Form', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Build a fully functional new client form matching the POS app UI.' },
  { id: 'CLM-004', title: 'Required Fields / Field Mapping Module', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Two-column field mapping UI between K9 Ops Lite and Gingr fields in Settings.' },
  { id: 'CLM-005', title: 'Push to Gingr Button', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Add a button on client pages to push K9 Ops Lite data to production Gingr.' },
  { id: 'CLM-006', title: 'Dog Detail Page Enhancement', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Match POS app dog detail UI and add vaccination data + all Gingr dog data.' },
  { id: 'CLM-007', title: 'Remove Message Button', category: 'Customer Lifecycle', priority: 'P3', status: 'backlog', description: 'Remove the non-functional message button from client pages in K9 Ops Lite.' },
  { id: 'CLM-008', title: 'Lifecycle Event Logging', category: 'Customer Lifecycle', priority: 'P1', status: 'backlog', description: 'Auto-log lifecycle events on sync, stage transitions, and display on client pages.' },
  { id: 'CLM-009', title: 'Remove Online Booking Button', category: 'Customer Lifecycle', priority: 'P3', status: 'backlog', description: 'Remove irrelevant online booking button from Customer Lifecycle module.' },
  { id: 'CLM-010', title: "Investigate 'Standard' Reservation Types", category: 'Customer Lifecycle', priority: 'P2', status: 'backlog', description: "Research what 'Standard' reservation types are in past reservations data." },
  { id: 'CLM-011', title: 'Fix Total Spent on Client Page', category: 'Customer Lifecycle', priority: 'P2', status: 'backlog', description: 'Sync the total spent value between Customer Lifecycle table and individual client pages.' },
  { id: 'CLM-012', title: "Review 'More Columns' Button Relevance", category: 'Customer Lifecycle', priority: 'P3', status: 'backlog', description: "Evaluate whether the 'More Columns' button makes sense for K9 Ops Lite." },

  // ─── Operations Hub ───
  { id: 'OPS-001', title: 'Dashboard Consolidation', category: 'Operations Hub', priority: 'P0', status: 'backlog', description: "Merge Today's Progress + Revenue Intelligence + Funnel into one master Dashboard page." },
  { id: 'OPS-002', title: 'Move Dashboard to Top of Navbar', category: 'Operations Hub', priority: 'P1', status: 'backlog', description: 'Reposition Dashboard as the first/top item in the navigation bar.' },
  { id: 'OPS-003', title: 'Revenue Intelligence Timeframe Selectors', category: 'Operations Hub', priority: 'P1', status: 'backlog', description: 'Replace current timeframe selectors with WTD, Past Week, MTD, Past 30, QTD, YTD, Lifetime, Custom.' },
  { id: 'OPS-004', title: 'Remove Top Category from Revenue Intelligence', category: 'Operations Hub', priority: 'P3', status: 'backlog', description: 'Remove the Top Category metric from the Revenue Intelligence report.' },
  { id: 'OPS-005', title: 'Consolidate Accrual/Net Revenue', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Investigate and merge Total Accrual Revenue and Net Revenue if they\'re the same metric.' },
  { id: 'OPS-006', title: 'Remove Booking Source & Payment Method', category: 'Operations Hub', priority: 'P3', status: 'backlog', description: 'Remove Booking Source and Payment Method metrics from Revenue Intelligence.' },
  { id: 'OPS-007', title: 'Checklist Timestamp Logging', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Log timestamps when checklist items are completed, not just the user who completed them.' },
  { id: 'OPS-008', title: 'Checklist Auto-Save', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: "Auto-save checklist selections instead of prompting 'Save Changes'." },
  { id: 'OPS-009', title: 'Standardize Checkbox UI Across Reports', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Ensure consistent checkbox styling across all reports and checklists.' },
  { id: 'OPS-010', title: 'Front-End/Back-End Checklist Template Import', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Import POS app checklist templates as defaults for K9 Ops Lite.' },
  { id: 'OPS-011', title: "Remove 'Today: 0/6 Completed' Section", category: 'Operations Hub', priority: 'P3', status: 'backlog', description: "Remove the 'Today: 0/6 Completed' section and 'View Analytics' button from Ops Hub." },
  { id: 'OPS-012', title: 'Fix EOD @ Mention Dog Suggest', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Fix the broken @ mention dog suggestion feature in the EOD report.' },
  { id: 'OPS-013', title: 'Daily Email Reports', category: 'Operations Hub', priority: 'P1', status: 'backlog', description: 'Automated 8 PM daily email summarizing dashboard metrics to configurable distribution groups.' },
  { id: 'OPS-014', title: 'Weekly Email Reports', category: 'Operations Hub', priority: 'P2', status: 'backlog', description: 'Weekly email summary report with aggregated metrics.' },

  // ─── Checkout TV ───
  { id: 'TV-001', title: 'Fix 0 in Daycare Count', category: 'Checkout TV', priority: 'P1', status: 'backlog', description: 'Debug and fix the Checkout TV showing 0 dogs in daycare.' },
  { id: 'TV-002', title: 'Show Dog Check-Out Status', category: 'Checkout TV', priority: 'P1', status: 'backlog', description: 'Display real-time check-out status for dogs on the Checkout TV.' },
  { id: 'TV-003', title: 'Large vs Small Dog Differentiation', category: 'Checkout TV', priority: 'P1', status: 'backlog', description: 'Use custom_animal_icons to differentiate large and small dogs on TV display.' },
  { id: 'TV-004', title: 'Verify Room Numbers', category: 'Checkout TV', priority: 'P2', status: 'backlog', description: 'Verify that room numbers displayed on Checkout TV match actual resort rooms.' },
  { id: 'TV-005', title: 'TV Navigation', category: 'Checkout TV', priority: 'P1', status: 'backlog', description: 'Add view buttons: All, Small Daycare, Large Daycare, Private Play.' },
  { id: 'TV-006', title: 'Checkout Highlight Animation', category: 'Checkout TV', priority: 'P1', status: 'backlog', description: 'Enlarge and highlight a dog on TV when checked out, with 60-second countdown and fade.' },

  // ─── Ignite ───
  { id: 'IGN-001', title: 'Email Parser Setup', category: 'Ignite', priority: 'P0', status: 'backlog', description: 'Set up auto-forward email parsing for Ignite lead notifications.' },
  { id: 'IGN-002', title: 'Client Matching Logic', category: 'Ignite', priority: 'P1', status: 'backlog', description: 'Match incoming Ignite leads to existing clients or create new records.' },
  { id: 'IGN-003', title: 'Ignite Section on Client Page', category: 'Ignite', priority: 'P1', status: 'backlog', description: "Add an 'Ignite' section to client pages showing all captured lead data and call recordings." },
  { id: 'IGN-004', title: 'Ignite Settings', category: 'Ignite', priority: 'P1', status: 'backlog', description: 'Settings page to configure Ignite profile number per location.' },

  // ─── Enterprise ───
  { id: 'ENT-001', title: 'Enterprise Dashboard Aggregation', category: 'Enterprise', priority: 'P1', status: 'backlog', description: 'Aggregate dashboard data across all locations with resort selection controls.' },
  { id: 'ENT-002', title: 'Enterprise Checklist Template Management', category: 'Enterprise', priority: 'P2', status: 'backlog', description: 'Customize checklist templates at enterprise level and push to individual locations.' },
  { id: 'ENT-003', title: 'Multi-Resort Quick Setup', category: 'Enterprise', priority: 'P1', status: 'backlog', description: 'Bulk create and configure multiple resort locations with Gingr + Ignite integration.' },

  // ─── Dashboard ───
  { id: 'DASH-001', title: 'Dashboard UI Design', category: 'Dashboard', priority: 'P0', status: 'backlog', description: 'Design the consolidated Dashboard UI inspired by the referenced X post.' },
  { id: 'DASH-002', title: 'Permission-Based Dashboard Views', category: 'Dashboard', priority: 'P1', status: 'backlog', description: 'Restrict CSRs/PCTs from seeing revenue and funnel data on the Dashboard.' },

  // ─── Settings ───
  { id: 'SET-001', title: "Rename Required Fields to 'Field Mapping'", category: 'Settings', priority: 'P2', status: 'backlog', description: "Rename the 'Required Fields' module in Settings to 'Field Mapping'." },
  { id: 'SET-002', title: 'Remove Dayboarding Section from Settings', category: 'Settings', priority: 'P3', status: 'completed', description: 'Remove the irrelevant Dayboarding section from Settings.' },

  // ─── Data Expansion ───
  { id: 'DE-001', title: 'Phase 0 — Form Reference Tables', category: 'Data Expansion', priority: 'P1', status: 'backlog', description: 'Sync gingr_form_definitions and gingr_icon_templates reference tables.' },
  { id: 'DE-002', title: 'Phase 1 — Reference Tables', category: 'Data Expansion', priority: 'P1', status: 'backlog', description: 'Sync breeds, species, immunization types, and temperament reference tables from Gingr.' },
  { id: 'DE-003', title: 'Phase 2 — Financial Data', category: 'Data Expansion', priority: 'P1', status: 'backlog', description: 'Sync invoices and transactions tables from Gingr.' },
  { id: 'DE-004', title: 'Phase 3 — Animal Enrichment', category: 'Data Expansion', priority: 'P1', status: 'backlog', description: 'Sync feeding, medications, immunizations, vets, and animal icon data from Gingr.' },
  { id: 'DE-005', title: 'Phase 4 — Client Enrichment', category: 'Data Expansion', priority: 'P2', status: 'backlog', description: 'Sync enhanced owner/animal fields and subscription data from Gingr.' },
  { id: 'DE-006', title: 'Phase 5 — Verify & Test All Existing Features', category: 'Data Expansion', priority: 'P0', status: 'backlog', description: 'Comprehensive verification that all existing features work correctly with expanded data.' },
  { id: 'DE-007', title: 'Phase 6 — Application Feature Tables', category: 'Data Expansion', priority: 'P1', status: 'backlog', description: 'Create app-specific tables: lifecycle_events, field_mappings, ignite, email, enterprise, checklists.' },
  { id: 'DE-008', title: 'Data Expansion Proposal Document', category: 'Data Expansion', priority: 'P1', status: 'needs_review', description: 'Comprehensive data expansion proposal document for review.' },
];

const COLUMNS = ['backlog', 'in_progress', 'needs_review', 'completed'];
const CATEGORIES = ['All', ...Object.keys(CATEGORY_COLORS)];
const PRIORITIES = ['All', 'P0', 'P1', 'P2', 'P3'];

// ─── Sub-components ────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const colors = CATEGORY_COLORS[category] || { bg: D.surface, text: D.textSec };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: colors.bg, color: colors.text, whiteSpace: 'nowrap',
    }}>
      {category}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS.P3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: colors.bg, color: colors.text,
      border: `1px solid ${colors.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.backlog;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: colors.bg, color: colors.text,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function TaskCard({ task, onClick }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onClick={() => onClick(task)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: D.surface,
        border: `1px solid ${hovered ? D.borderLight : D.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${D.borderLight}`
          : '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: D.textMut, fontFamily: 'monospace' }}>{task.id}</span>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: D.text, lineHeight: 1.4, marginBottom: 8 }}>
        {task.title}
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: D.textSec, lineHeight: 1.5, marginBottom: 10,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {task.description}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <CategoryBadge category={task.category} />
      </div>
    </div>
  );
}

function TaskModal({ task, onClose }) {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(5,8,16,0.75)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1001,
        width: '100%', maxWidth: 480,
        background: D.surface,
        borderLeft: `1px solid ${D.border}`,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        animation: 'slideIn 0.25s ease',
        overflowY: 'auto',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: D.textMut, fontFamily: 'monospace', marginBottom: 6 }}>
              {task.id}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: D.text, lineHeight: 1.3 }}>
              {task.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: `1.5px solid ${D.border}`, background: D.bgAlt,
              color: D.textSec, fontSize: 18, lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Badges row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <CategoryBadge category={task.category} />
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Description
            </div>
            <p style={{ margin: 0, fontSize: 14, color: D.textSec, lineHeight: 1.7 }}>
              {task.description}
            </p>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${D.border}` }} />

          {/* Meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: D.textMut, width: 80, flexShrink: 0 }}>Category</span>
              <CategoryBadge category={task.category} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: D.textMut, width: 80, flexShrink: 0 }}>Priority</span>
              <PriorityBadge priority={task.priority} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: D.textMut, width: 80, flexShrink: 0 }}>Status</span>
              <StatusBadge status={task.status} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────
function NavBar() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(10,15,28,0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${D.border}`,
      padding: '0 24px',
      height: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Left: Logo + Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
            <defs>
              <linearGradient id="pubNxG" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C4A46A" />
                <stop offset="100%" stopColor="#AF8D54" />
              </linearGradient>
            </defs>
            <g transform="translate(20,20)">
              <line x1="0" y1="0" x2="-9" y2="-10" stroke={D.border} strokeWidth="1.5" />
              <line x1="0" y1="0" x2="10" y2="-6" stroke={D.border} strokeWidth="1.5" />
              <line x1="0" y1="0" x2="1" y2="11" stroke={D.border} strokeWidth="1.5" />
              <circle cx="0" cy="0" r="6" fill="url(#pubNxG)" />
              <circle cx="-9" cy="-10" r="3.5" fill={D.navyLight} />
              <circle cx="10" cy="-6" r="3.5" fill={D.navyLight} />
              <circle cx="1" cy="11" r="3.5" fill={D.navyLight} />
            </g>
          </svg>
          <span style={{
            fontSize: 15, fontWeight: 700, color: D.text,
            fontFamily: "'Playfair Display', Georgia, serif",
            letterSpacing: '0.02em',
          }}>
            K9 Operations
          </span>
        </div>

        {/* Back link */}
        <a
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, color: D.textSec, textDecoration: 'none',
            padding: '5px 10px', borderRadius: 6,
            border: `1px solid ${D.border}`,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = D.text; e.currentTarget.style.borderColor = D.borderLight; }}
          onMouseLeave={e => { e.currentTarget.style.color = D.textSec; e.currentTarget.style.borderColor = D.border; }}
        >
          <span style={{ fontSize: 11 }}>←</span>
          <span>Back to Home</span>
        </a>
      </div>

      {/* Right: Log In */}
      <a
        href="/login"
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 18px', borderRadius: 8,
          background: D.gold, color: '#0A0F1C',
          fontSize: 13, fontWeight: 700, textDecoration: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = D.goldLight; }}
        onMouseLeave={e => { e.currentTarget.style.background = D.gold; }}
      >
        Log In
      </a>
    </nav>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ tasks }) {
  const total = tasks.length;
  const byStatus = {
    backlog:      tasks.filter(t => t.status === 'backlog').length,
    in_progress:  tasks.filter(t => t.status === 'in_progress').length,
    needs_review: tasks.filter(t => t.status === 'needs_review').length,
    completed:    tasks.filter(t => t.status === 'completed').length,
  };
  const completedPct = total > 0 ? Math.round((byStatus.completed / total) * 100) : 0;

  const stats = [
    { label: 'Total Items', value: total, color: D.text },
    { label: 'In Progress', value: byStatus.in_progress, color: D.gold },
    { label: 'Needs Review', value: byStatus.needs_review, color: '#fbbf24' },
    { label: 'Completed', value: byStatus.completed, color: '#4ade80' },
    { label: '% Complete', value: `${completedPct}%`, color: D.goldLight },
  ];

  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24,
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: '1 1 140px', minWidth: 120,
          background: D.surface, border: `1px solid ${D.border}`,
          borderRadius: 10, padding: '14px 18px',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 11, color: D.textMut, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ status, tasks, onCardClick }) {
  const accent = COLUMN_ACCENT[status];
  const count = tasks.length;

  return (
    <div style={{
      flex: '1 1 240px', minWidth: 220,
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Column Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: `2px solid ${accent}`,
        background: D.bgAlt,
        borderRadius: '10px 10px 0 0',
        border: `1px solid ${D.border}`,
        borderBottomColor: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>
          {STATUS_LABELS[status]}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: accent,
          background: `${accent}22`, border: `1px solid ${accent}44`,
          borderRadius: 99, padding: '1px 8px',
        }}>
          {count}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: D.textMut, fontSize: 12,
            border: `1px dashed ${D.border}`, borderRadius: 10,
          }}>
            No items
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PublicRoadmap() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [selectedTask, setSelectedTask] = useState(null);

  const filteredTasks = useMemo(() => {
    return PUBLIC_TASKS.filter(t => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'All' || t.category === categoryFilter;
      const matchPri = priorityFilter === 'All' || t.priority === priorityFilter;
      return matchSearch && matchCat && matchPri;
    });
  }, [search, categoryFilter, priorityFilter]);

  const tasksByColumn = useMemo(() => {
    const result = {};
    COLUMNS.forEach(col => { result[col] = filteredTasks.filter(t => t.status === col); });
    return result;
  }, [filteredTasks]);

  const handleCardClick = useCallback((task) => setSelectedTask(task), []);
  const handleModalClose = useCallback(() => setSelectedTask(null), []);

  const inputStyle = {
    background: D.surface, border: `1px solid ${D.border}`,
    borderRadius: 8, padding: '9px 14px',
    fontSize: 13, color: D.text, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color 0.15s',
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
    paddingRight: 30,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235A647A' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  };

  return (
    <>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        body { margin: 0; background: ${D.bg}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${D.bg}; }
        ::-webkit-scrollbar-thumb { background: ${D.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${D.borderLight}; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: D.bg,
        color: D.text,
        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
      }}>
        <NavBar />

        <main style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 24px 80px' }}>

          {/* Page Header */}
          <div style={{ marginBottom: 36, textAlign: 'center' }}>
            <h1 style={{
              margin: '0 0 10px',
              fontSize: 36, fontWeight: 700, color: D.text,
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: '0.01em',
            }}>
              Product Roadmap
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: D.textSec }}>
              Track our progress and see what's next
            </p>
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '4px 16px', borderRadius: 99,
              background: D.goldGlow, border: `1px solid rgba(175,141,84,0.25)`,
              fontSize: 12, color: D.gold, fontWeight: 500,
            }}>
              Last updated March 14, 2026
            </div>
          </div>

          {/* Stats Bar */}
          <StatsBar tasks={PUBLIC_TASKS} />

          {/* Filters */}
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
            alignItems: 'center', marginBottom: 28,
          }}>
            {/* Search */}
            <div style={{ flex: '1 1 220px', position: 'relative', minWidth: 180 }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: D.textMut, fontSize: 14, pointerEvents: 'none',
              }}>
                ⌕
              </span>
              <input
                type="text"
                placeholder="Search tasks..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  ...inputStyle,
                  width: '100%', paddingLeft: 32,
                  '::placeholder': { color: D.textMut },
                }}
                onFocus={e => { e.target.style.borderColor = D.gold; }}
                onBlur={e => { e.target.style.borderColor = D.border; }}
              />
            </div>

            {/* Category filter */}
            <div style={{ position: 'relative' }}>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ ...selectStyle, minWidth: 180 }}
                onFocus={e => { e.target.style.borderColor = D.gold; }}
                onBlur={e => { e.target.style.borderColor = D.border; }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
              </select>
            </div>

            {/* Priority filter */}
            <div style={{ position: 'relative' }}>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                style={{ ...selectStyle, minWidth: 140 }}
                onFocus={e => { e.target.style.borderColor = D.gold; }}
                onBlur={e => { e.target.style.borderColor = D.border; }}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p === 'All' ? 'All Priorities' : `Priority ${p}`}</option>)}
              </select>
            </div>

            {/* Clear button */}
            {(search || categoryFilter !== 'All' || priorityFilter !== 'All') && (
              <button
                onClick={() => { setSearch(''); setCategoryFilter('All'); setPriorityFilter('All'); }}
                style={{
                  ...inputStyle, cursor: 'pointer',
                  color: D.textSec, border: `1px solid ${D.border}`,
                  background: 'transparent',
                }}
              >
                Clear filters
              </button>
            )}

            {/* Result count */}
            <span style={{ fontSize: 12, color: D.textMut, marginLeft: 4 }}>
              {filteredTasks.length} of {PUBLIC_TASKS.length} items
            </span>
          </div>

          {/* Kanban Board */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            overflowX: 'auto', paddingBottom: 16,
          }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col}
                status={col}
                tasks={tasksByColumn[col]}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer style={{
          borderTop: `1px solid ${D.border}`,
          padding: '24px',
          textAlign: 'center',
          color: D.textMut, fontSize: 12,
        }}>
          <div>&copy; 2026 K9 Operations LLC. All Rights Reserved.</div>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
            Luxury Pet Hotel Management Platform
          </div>
        </footer>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskModal task={selectedTask} onClose={handleModalClose} />
      )}
    </>
  );
}
