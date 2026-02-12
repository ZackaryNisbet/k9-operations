// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ═══════════════════════════════════════════════════════════════════════════
// BRAND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const B = {
  navy: '#003462',
  navyDark: '#00243F',
  navyLight: '#0A4A82',
  gold: '#AF8D54',
  goldLight: '#C9AB74',
  goldPale: '#F5EFE3',
  bronze: '#59504B',
  bg: '#F8F7F4',
  surface: '#FFFFFF',
  text: '#1A1D23',
  textSec: '#6B7280',
  textMut: '#9CA3AF',
  suc: '#10B981',
  warn: '#F59E0B',
  err: '#EF4444',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
};

// High-quality Unsplash images for the booking experience
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1920&q=85&auto=format',
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920&q=85&auto=format',
  'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=1920&q=85&auto=format',
];

const ROOM_IMAGES = {
  'Luxury Suite': 'https://images.unsplash.com/photo-1583337130417-13104dec14c5?w=800&q=80&auto=format',
  'Executive Room': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80&auto=format',
  'Double Compartment': 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80&auto=format',
  'Single Compartment': 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=800&q=80&auto=format',
};

const ROOM_INFO = {
  'Luxury Suite': {
    size: "8' × 8'",
    desc: 'Our most spacious cage-free suite featuring Kuranda luxury bedding, flat-screen TV tuned to Dog TV, glass privacy doors, and a sound-resistant environment.',
    features: ['Cage-free', 'Kuranda bed', 'Flat-screen TV', 'Glass privacy doors', 'Sound-resistant', 'Best for families with multiple pets'],
    tier: 4,
  },
  'Executive Room': {
    size: "5' × 7'",
    desc: 'A generous cage-free room with Kuranda bedding, glass privacy doors, and top-of-the-line Snyder enclosures. Ideal for one or two dogs.',
    features: ['Cage-free', 'Kuranda bed', 'Glass privacy doors', 'Snyder enclosures', 'Great for 1-2 dogs'],
    tier: 3,
  },
  'Double Compartment': {
    size: 'Double-wide',
    desc: 'A comfortable compartment with comfort mat bedding, perfect for dogs up to 100 lbs or those who participate in daycare during the day.',
    features: ['Comfort mat bedding', 'Up to 100 lbs', 'Great for daycare dogs', 'Blue Buffalo meals included'],
    tier: 2,
  },
  'Single Compartment': {
    size: 'Standard',
    desc: 'A cozy compartment ideal for smaller dogs under 35 lbs or those who are comfortably crate-trained at home.',
    features: ['Comfort mat bedding', 'Up to 35 lbs', 'Perfect for crate-trained dogs', 'Blue Buffalo meals included'],
    tier: 1,
  },
};

const ROOM_ORDER = ['Luxury Suite', 'Executive Room', 'Double Compartment', 'Single Compartment'];
const BATH_OPTIONS = ['Standard Bath', 'Hypo Bath', 'Medicated Bath', 'Whitening Bath'];

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL STYLES (injected once)
// ═══════════════════════════════════════════════════════════════════════════
const GLOBAL_CSS = `
@font-face{font-family:'Canela';src:url('/fonts/Canela-Bold-Web.woff2') format('woff2'),url('/fonts/Canela-Bold-Web.woff') format('woff');font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:'Canela';src:url('/fonts/Canela-BoldItalic-Web.woff2') format('woff2'),url('/fonts/Canela-BoldItalic-Web.woff') format('woff');font-weight:700;font-style:italic;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Light.otf') format('opentype');font-weight:300;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Medium.otf') format('opentype');font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Bold.otf') format('opentype');font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti Display';src:url('/fonts/GT-Eesti-Display-Medium.otf') format('opentype');font-weight:500;font-style:normal;font-display:swap}

*{margin:0;padding:0;box-sizing:border-box}
html,body{overflow-x:hidden;scroll-behavior:smooth}
body{font-family:'GT Eesti',system-ui,-apple-system,sans-serif;background:${B.bg};color:${B.text};-webkit-font-smoothing:antialiased}

/* Page transition container */
.bk-page-container{position:relative;width:100%;min-height:100vh;overflow:hidden}
.bk-page{position:absolute;top:0;left:0;width:100%;min-height:100vh;will-change:transform,opacity}

/* Slide transitions */
.bk-slide-enter-right{animation:slideInRight .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-left{animation:slideOutLeft .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-enter-left{animation:slideInLeft .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-right{animation:slideOutRight .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-enter-up{animation:slideInUp .7s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-down{animation:slideOutDown .7s cubic-bezier(.16,1,.3,1) forwards}

@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOutLeft{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
@keyframes slideInUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes slideOutDown{from{transform:translateY(0);opacity:1}to{transform:translateY(-100%);opacity:0}}

/* Fade in animations */
.bk-fade-in{animation:bkFadeIn .8s ease forwards}
.bk-fade-up{animation:bkFadeUp .8s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
.bk-fade-up-d1{animation-delay:.1s}
.bk-fade-up-d2{animation-delay:.2s}
.bk-fade-up-d3{animation-delay:.3s}
.bk-fade-up-d4{animation-delay:.4s}
.bk-fade-up-d5{animation-delay:.5s}
.bk-fade-up-d6{animation-delay:.6s}

@keyframes bkFadeIn{from{opacity:0}to{opacity:1}}
@keyframes bkFadeUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}

/* Scale in for cards */
.bk-scale-in{animation:bkScaleIn .6s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
@keyframes bkScaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}

/* Smooth question transitions */
.bk-question-enter{animation:questionEnter .5s cubic-bezier(.16,1,.3,1) forwards}
.bk-question-exit{animation:questionExit .3s ease forwards}
@keyframes questionEnter{from{opacity:0;transform:translateY(30px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes questionExit{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-20px)}}

/* Parallax hero */
.bk-hero{position:relative;height:100vh;overflow:hidden;display:flex;align-items:center;justify-content:center}
.bk-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transition:opacity 1.5s ease}
.bk-hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,52,98,.45) 0%,rgba(0,52,98,.85) 100%)}

/* Scroll reveal */
.bk-reveal{opacity:0;transform:translateY(50px);transition:all .9s cubic-bezier(.16,1,.3,1)}.bk-reveal.visible{opacity:1;transform:none}

/* Gold underline accent */
.bk-gold-line{width:60px;height:3px;background:${B.gold};margin:0 auto;border-radius:2px}

/* Button styles */
.bk-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;font-family:'GT Eesti',sans-serif;cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);border:none;text-decoration:none;letter-spacing:.02em}
.bk-btn:active{transform:scale(.97)}
.bk-btn-primary{background:${B.gold};color:#fff}.bk-btn-primary:hover{background:${B.goldLight};transform:translateY(-2px);box-shadow:0 8px 30px rgba(175,141,84,.35)}
.bk-btn-navy{background:${B.navy};color:#fff}.bk-btn-navy:hover{background:${B.navyLight};transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,52,98,.35)}
.bk-btn-outline{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}.bk-btn-outline:hover{border-color:#fff;background:rgba(255,255,255,.1);transform:translateY(-2px)}
.bk-btn-ghost{background:rgba(255,255,255,.1);color:#fff;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2)}.bk-btn-ghost:hover{background:rgba(255,255,255,.2);transform:translateY(-2px)}
.bk-btn-gold-outline{background:transparent;color:${B.gold};border:2px solid ${B.gold}}.bk-btn-gold-outline:hover{background:${B.goldPale};transform:translateY(-2px)}

/* Room card */
.bk-room-card{background:#fff;border-radius:20px;overflow:hidden;transition:all .4s cubic-bezier(.16,1,.3,1);cursor:pointer;border:2px solid transparent;position:relative}
.bk-room-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.12)}
.bk-room-card.selected{border-color:${B.gold};box-shadow:0 0 0 3px ${B.gold}30}
.bk-room-card.disabled{opacity:.45;pointer-events:none;filter:grayscale(.3)}
.bk-room-card .bk-rec-badge{position:absolute;top:16px;right:16px;background:${B.gold};color:#fff;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;z-index:2;box-shadow:0 4px 15px rgba(175,141,84,.4)}

/* Floating input */
.bk-input{width:100%;padding:14px 18px;border:2px solid ${B.border};border-radius:12px;font-size:16px;font-family:'GT Eesti',sans-serif;color:${B.text};background:#fff;outline:none;transition:border .2s,box-shadow .2s}
.bk-input:focus{border-color:${B.navy};box-shadow:0 0 0 3px ${B.navy}15}
.bk-input::placeholder{color:${B.textMut}}
.bk-label{display:block;font-size:13px;font-weight:600;color:${B.textSec};margin-bottom:6px;letter-spacing:.03em}

/* Hero image carousel indicator */
.bk-hero-dots{display:flex;gap:8px;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);z-index:5}
.bk-hero-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.4);transition:all .3s}.bk-hero-dot.active{background:#fff;transform:scale(1.2)}

/* CTA card on hero */
.bk-cta-card{background:rgba(255,255,255,.08);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:28px 32px;cursor:pointer;transition:all .4s cubic-bezier(.16,1,.3,1);text-align:left;min-width:280px}
.bk-cta-card:hover{background:rgba(255,255,255,.15);transform:translateY(-4px);border-color:rgba(255,255,255,.3);box-shadow:0 20px 60px rgba(0,0,0,.2)}

/* Scrollbar */
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${B.border};border-radius:3px}::-webkit-scrollbar-thumb:hover{background:${B.textMut}}

/* Selection chip */
.bk-chip{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:14px;border:2px solid ${B.border};background:#fff;font-size:16px;font-weight:600;font-family:'GT Eesti',sans-serif;color:${B.text};cursor:pointer;transition:all .25s cubic-bezier(.16,1,.3,1)}
.bk-chip:hover{border-color:${B.gold};background:${B.goldPale};transform:translateY(-2px)}
.bk-chip.selected{border-color:${B.gold};background:${B.goldPale};color:${B.navy};box-shadow:0 4px 15px ${B.gold}25}

/* Feature badge */
.bk-feature{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;background:${B.bg};font-size:12px;color:${B.textSec};font-weight:500}

/* Progress dots */
.bk-progress{display:flex;align-items:center;gap:4px}.bk-progress-dot{width:8px;height:8px;border-radius:50%;background:${B.border};transition:all .3s}.bk-progress-dot.active{background:${B.gold};width:24px;border-radius:4px}.bk-progress-dot.done{background:${B.gold}}

/* Add-on card */
.bk-addon-card{background:#fff;border:2px solid ${B.border};border-radius:16px;padding:20px;transition:all .3s;cursor:pointer}
.bk-addon-card:hover{border-color:${B.gold};transform:translateY(-2px)}.bk-addon-card.added{border-color:${B.suc};background:${B.suc}08}

@media(max-width:768px){.bk-btn{padding:14px 28px;font-size:15px}.bk-cta-card{min-width:auto;padding:20px 24px}}
`;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
function gid() { return 'bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function getMinDate(days = 1) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function countNights(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.ceil((new Date(b) - new Date(a)) / 864e5));
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
}

function fmtCurrency(n) { return '$' + (n || 0).toFixed(2); }

function getAvailableCount(roomType, rooms, checkIn, checkOut, reservations) {
  const total = (rooms || []).filter(r => r.type === roomType).length;
  if (!checkIn || !checkOut) return total;
  const booked = (reservations || []).filter(r => {
    if (r.type !== 'boarding' || r.roomType !== roomType) return false;
    if (r.status === 'cancelled' || r.status === 'checked-out') return false;
    return r.checkIn <= checkOut && r.checkOut >= checkIn;
  }).length;
  return Math.max(0, total - booked);
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════
const Icons = {
  Arrow: ({ dir = 'right', size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'right' && <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}
      {dir === 'left' && <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}
      {dir === 'down' && <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
      {dir === 'up' && <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}
    </svg>
  ),
  Calendar: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  User: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Star: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={B.gold} stroke={B.gold} strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Check: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Dog: ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .137 1.217 1.2 1.5 2.5 1.5s2.5-1 3-2.5M14 5.172C14 3.782 15.577 2.679 17.5 3c2.823.47 4.113 6.006 4 7-.137 1.217-1.2 1.5-2.5 1.5s-2.5-1-3-2.5"/><path d="M8 14v.5M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a13.152 13.152 0 0 0-.42-3.31"/></svg>,
  Shield: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Sparkle: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={B.gold} stroke="none"><path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z"/></svg>,
  Home: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Phone: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Mail: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Upload: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Plus: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Back: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  X: ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// K9 Logo as SVG
const K9Logo = ({ size = 48, color = '#fff' }) => (
  <svg width={size} height={size * 1.15} viewBox="0 0 100 115" fill={color}>
    <path d="M50 5C45 5 40 8 38 15L35 25C33 28 30 30 27 30C22 30 18 34 18 39C18 42 19 44 21 46L25 50C22 55 20 61 20 68C20 90 33 105 50 105C67 105 80 90 80 68C80 61 78 55 75 50L79 46C81 44 82 42 82 39C82 34 78 30 73 30C70 30 67 28 65 25L62 15C60 8 55 5 50 5ZM42 65C44.2 65 46 66.8 46 69C46 71.2 44.2 73 42 73C39.8 73 38 71.2 38 69C38 66.8 39.8 65 42 65ZM58 65C60.2 65 62 66.8 62 69C62 71.2 60.2 73 58 73C55.8 73 54 71.2 54 69C54 66.8 55.8 65 58 65ZM47 78H53L50 82L47 78Z"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL REVEAL HOOK
// ═══════════════════════════════════════════════════════════════════════════
function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('visible'); obs.unobserve(el); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, style, className = '' }) {
  const ref = useScrollReveal();
  return <div ref={ref} className={`bk-reveal ${className}`} style={style}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE TRANSITION WRAPPER
// ═══════════════════════════════════════════════════════════════════════════
function PageTransition({ pageKey, direction, children }) {
  const [pages, setPages] = useState([{ key: pageKey, content: children, anim: 'bk-fade-in' }]);
  const prevKey = useRef(pageKey);

  useEffect(() => {
    if (pageKey === prevKey.current) return;
    const enterClass = direction === 'left' ? 'bk-slide-enter-right' : direction === 'right' ? 'bk-slide-enter-left' : direction === 'up' ? 'bk-slide-enter-up' : 'bk-slide-enter-right';
    const exitClass = direction === 'left' ? 'bk-slide-exit-left' : direction === 'right' ? 'bk-slide-exit-right' : direction === 'up' ? 'bk-slide-exit-down' : 'bk-slide-exit-left';
    setPages(prev => [
      { key: prevKey.current, content: prev[prev.length - 1]?.content, anim: exitClass },
      { key: pageKey, content: children, anim: enterClass },
    ]);
    prevKey.current = pageKey;
    const t = setTimeout(() => setPages(p => p.filter(pg => pg.key === pageKey)), 750);
    return () => clearTimeout(t);
  }, [pageKey]);

  // Update content for current page
  useEffect(() => {
    setPages(p => p.map(pg => pg.key === pageKey ? { ...pg, content: children } : pg));
  }, [children]);

  return (
    <div className="bk-page-container" style={{ minHeight: '100vh' }}>
      {pages.map(pg => (
        <div key={pg.key} className={`bk-page ${pg.anim}`} style={{ position: pages.length > 1 ? 'absolute' : 'relative' }}>
          {pg.content}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION TRANSITION (fade out old → fade in new)
// ═══════════════════════════════════════════════════════════════════════════
function QuestionTransition({ questionKey, children }) {
  const [current, setCurrent] = useState({ key: questionKey, content: children });
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (questionKey === current.key) {
      setCurrent(c => ({ ...c, content: children }));
      return;
    }
    setFading(true);
    const t = setTimeout(() => {
      setCurrent({ key: questionKey, content: children });
      setFading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [questionKey, children]);

  return (
    <div className={fading ? 'bk-question-exit' : 'bk-question-enter'} key={current.key}>
      {current.content}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function BkInput({ label, required, ...props }) {
  return (
    <div>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <input className="bk-input" {...props} />
    </div>
  );
}

function BkSelect({ label, required, options, ...props }) {
  return (
    <div>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <select className="bk-input" style={{ cursor: 'pointer' }} {...props}>
        <option value="">Select...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BOOKING PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function BookingPage() {
  // Inject global CSS
  useEffect(() => {
    if (document.getElementById('bk-global-css')) return;
    const style = document.createElement('style');
    style.id = 'bk-global-css';
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => { const s = document.getElementById('bk-global-css'); if (s) s.remove(); };
  }, []);

  // Extract slug
  const slug = useMemo(() => window.location.pathname.split('/')[2] || '', []);

  // Data
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Navigation
  const [currentPage, setCurrentPage] = useState('splash');
  const [transDir, setTransDir] = useState('left');
  const [pageHistory, setPageHistory] = useState(['splash']);

  // Hero carousel
  const [heroIdx, setHeroIdx] = useState(0);

  // Availability flow state
  const [serviceType, setServiceType] = useState(null); // 'boarding' | 'daycare'
  const [availStep, setAvailStep] = useState(0); // 0=service, 1=dates, 2=rooms, 3=recommend
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');

  // Recommendation engine
  const [dogCount, setDogCount] = useState(null); // 1 | 2+
  const [dogWeight, setDogWeight] = useState('');
  const [isCrated, setIsCrated] = useState(null);
  const [recommendedRoom, setRecommendedRoom] = useState('');

  // Registration flow
  const [regStep, setRegStep] = useState(0); // 0=client, 1=dog, 2=vaccines, 3=feeding, 4=details, 5=cart
  const [client, setClient] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', emergencyContact: '', emergencyPhone: '', vetName: '', vetPhone: '', referralSource: '', notes: '' });
  const [dog, setDog] = useState({ name: '', breed: '', weight: '', sex: '', spayedNeutered: '', dob: '', bathType: '' });
  const [vaccineFiles, setVaccineFiles] = useState([]);
  const [vaccineChoice, setVaccineChoice] = useState(null); // 'now' | 'later'
  const [feedingChoice, setFeedingChoice] = useState(null); // 'bluebuffalo' | 'fromhome'
  const [feedingNotes, setFeedingNotes] = useState('');
  const [medicationNotes, setMedicationNotes] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [selectedBath, setSelectedBath] = useState('');

  // Add-ons
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [confirmationId, setConfirmationId] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');

  // Load data
  useEffect(() => {
    if (!slug) { setError('No location specified'); setLoading(false); return; }
    (async () => {
      try {
        const { data, error: e } = await supabase.rpc('get_public_booking_data', { p_slug: slug });
        if (e) throw e;
        if (!data?.success) { setError('Location not found'); setLoading(false); return; }
        setLocationData(data);
        setLoading(false);
      } catch (err) { setError(err.message); setLoading(false); }
    })();
  }, [slug]);

  // Hero carousel auto-advance
  useEffect(() => {
    const t = setInterval(() => setHeroIdx(i => (i + 1) % HERO_IMAGES.length), 6000);
    return () => clearInterval(t);
  }, []);

  // Navigate helper
  const navigateTo = useCallback((page, dir = 'left') => {
    setTransDir(dir);
    setCurrentPage(page);
    setPageHistory(h => [...h, page]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const goBack = useCallback(() => {
    if (pageHistory.length <= 1) return;
    const prev = pageHistory[pageHistory.length - 2];
    setTransDir('right');
    setCurrentPage(prev);
    setPageHistory(h => h.slice(0, -1));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pageHistory]);

  // Pricing computation
  const pricing = useMemo(() => {
    if (!locationData?.pricing || !selectedRoom || !checkIn || !checkOut) return null;
    const nights = countNights(checkIn, checkOut);
    const rate = locationData.pricing.boardingRates?.[selectedRoom] || 0;
    const roomCost = rate * nights;
    let bathCost = 0;
    if (selectedBath && locationData.pricing.addOns?.[selectedBath]) bathCost = locationData.pricing.addOns[selectedBath];
    let addOnCost = 0;
    selectedAddOns.forEach(a => { addOnCost += (locationData.pricing.addOns?.[a] || 0) * nights; });
    const subtotal = roomCost + bathCost + addOnCost;
    const depositPct = locationData.pricing.paymentRules?.boarding?.depositPercent || 50;
    const deposit = Math.round(subtotal * depositPct / 100);
    return { nights, rate, roomCost, bathCost, addOnCost, subtotal, deposit, balance: subtotal - deposit, depositPct };
  }, [locationData, selectedRoom, checkIn, checkOut, selectedBath, selectedAddOns]);

  // Room recommendation logic
  const computeRecommendation = useCallback(() => {
    const w = parseFloat(dogWeight) || 0;
    if (dogCount === 'multiple') {
      setRecommendedRoom('Executive Room');
    } else if (w <= 35 && isCrated === true) {
      setRecommendedRoom('Single Compartment');
    } else if (w <= 35 && isCrated === false) {
      setRecommendedRoom('Double Compartment');
    } else if (w <= 100) {
      setRecommendedRoom('Double Compartment');
    } else {
      setRecommendedRoom('Executive Room');
    }
  }, [dogCount, dogWeight, isCrated]);

  // Minimum room tier based on weight
  const getMinTier = useCallback(() => {
    const w = parseFloat(dogWeight) || 0;
    if (w > 100) return 3; // Must be exec or luxury
    if (w > 35) return 2;  // Must be double or higher
    return 1;
  }, [dogWeight]);

  // Submit booking
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const nights = countNights(checkIn, checkOut);
      const booking = {
        type: serviceType || 'boarding',
        client,
        dog: { ...dog, feedingNotes: feedingChoice === 'bluebuffalo' ? 'Blue Buffalo (resort provided)' : feedingNotes, medicationNotes, bathType: selectedBath },
        checkIn, checkOut,
        roomType: selectedRoom,
        notes: bookingNotes,
        pricing: pricing ? { ...pricing, total: pricing.subtotal } : {},
        addOns: selectedAddOns,
        vaccineChoice,
      };
      const { data: result, error: e } = await supabase.rpc('submit_online_booking', { p_slug: slug, p_booking: booking });
      if (e) throw e;
      if (result?.bookingId || result?.success) {
        setConfirmationId(result.bookingId || 'confirmed');
        navigateTo('confirmation', 'left');
      } else {
        setError(result?.message || 'Failed to create booking');
      }
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // LOADING / ERROR STATES
  // ═════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.navy }}>
      <div style={{ textAlign: 'center' }}>
        <K9Logo size={64} color={B.gold} />
        <div style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, fontWeight: 700, color: '#fff', marginTop: 20 }}>K9 Resorts</div>
        <div style={{ fontSize: 12, color: B.gold, letterSpacing: '.15em', textTransform: 'uppercase', marginTop: 6 }}>Luxury Pet Hotel</div>
        <div style={{ width: 40, height: 3, background: B.gold, borderRadius: 2, margin: '24px auto 0', animation: 'bkFadeIn 1s ease infinite alternate' }} />
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg }}>
      <div style={{ textAlign: 'center', maxWidth: 500, padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🐾</div>
        <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 12 }}>Something went wrong</h2>
        <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{error}</p>
        <button className="bk-btn bk-btn-navy" onClick={() => window.location.reload()}>Try Again</button>
      </div>
    </div>
  );

  const loc = locationData;
  const locName = loc?.location_name || 'K9 Resorts';

  // ═════════════════════════════════════════════════════════════════════════
  // SPLASH PAGE
  // ═════════════════════════════════════════════════════════════════════════
  const renderSplash = () => (
    <div style={{ background: B.navy }}>
      {/* Hero */}
      <div className="bk-hero">
        {HERO_IMAGES.map((img, i) => (
          <div key={i} className="bk-hero-bg" style={{ backgroundImage: `url(${img})`, opacity: heroIdx === i ? 1 : 0 }} />
        ))}
        <div className="bk-hero-overlay" />

        <div style={{ position: 'relative', zIndex: 3, textAlign: 'center', padding: '0 24px', maxWidth: 900 }}>
          <div className="bk-fade-up" style={{ marginBottom: 20 }}>
            <K9Logo size={56} color={B.gold} />
          </div>
          <h1 className="bk-fade-up bk-fade-up-d1" style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 700, color: '#fff', lineHeight: 1.1, marginBottom: 12 }}>
            {locName}
          </h1>
          <div className="bk-fade-up bk-fade-up-d2 bk-gold-line" style={{ marginBottom: 20 }} />
          <p className="bk-fade-up bk-fade-up-d2" style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', color: 'rgba(255,255,255,.85)', fontWeight: 300, lineHeight: 1.5, maxWidth: 600, margin: '0 auto 50px' }}>
            The gold standard in luxury pet hospitality. Award-winning care your dog deserves.
          </p>

          {/* Three CTAs */}
          <div className="bk-fade-up bk-fade-up-d3" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <div className="bk-cta-card" onClick={() => navigateTo('availability', 'left')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Icons.Calendar size={22} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>View Availability</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', marginBottom: 12, lineHeight: 1.5 }}>
                Have dates in mind? See what's open and book your stay.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: B.gold, fontSize: 14, fontWeight: 600 }}>
                Check Availability <Icons.Arrow size={16} color={B.gold} />
              </div>
            </div>

            <div className="bk-cta-card" onClick={() => navigateTo('account', 'left')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Icons.User size={22} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Your Account</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', marginBottom: 12, lineHeight: 1.5 }}>
                Review receipts, upcoming reservations, or package balances.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: B.gold, fontSize: 14, fontWeight: 600 }}>
                Access Account <Icons.Arrow size={16} color={B.gold} />
              </div>
            </div>

            <div className="bk-cta-card" onClick={() => navigateTo('learn', 'up')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Icons.Sparkle size={22} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Why K9 Resorts?</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', marginBottom: 12, lineHeight: 1.5 }}>
                Discover what makes us the #1 rated pet care service.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: B.gold, fontSize: 14, fontWeight: 600 }}>
                Learn More <Icons.Arrow dir="down" size={16} color={B.gold} />
              </div>
            </div>
          </div>
        </div>

        {/* Hero dots */}
        <div className="bk-hero-dots">
          {HERO_IMAGES.map((_, i) => <div key={i} className={`bk-hero-dot ${heroIdx === i ? 'active' : ''}`} onClick={() => setHeroIdx(i)} />)}
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{ textAlign: 'center', padding: '40px 0', background: B.navy }}>
        <div style={{ animation: 'bkFadeUp 1s ease infinite alternate', color: 'rgba(255,255,255,.4)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          Scroll to explore
        </div>
        <Icons.Arrow dir="down" size={20} color="rgba(255,255,255,.3)" />
      </div>

      {/* Features section */}
      <div style={{ background: '#fff', padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <RevealSection style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 12 }}>Award-Winning Excellence</div>
            <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(28px, 4vw, 48px)', color: B.navy, lineHeight: 1.2, marginBottom: 16 }}>
              The New Gold Standard<br />for Pet Hospitality
            </h2>
            <div className="bk-gold-line" />
          </RevealSection>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 30 }}>
            {[
              { icon: '🏆', title: 'Multi-Award Winning', desc: 'Nationally recognized as the #1 rated pet care service three years running by IBPSA.' },
              { icon: '🐾', title: 'Cage-Free Luxury', desc: 'Spacious suites with Kuranda beds, flat-screen TVs, and glass privacy doors.' },
              { icon: '🍽️', title: 'Gourmet Dining', desc: 'Premium Blue Buffalo vet-grade meals designed for sensitive stomachs included with every stay.' },
              { icon: '👨‍⚕️', title: 'Professionally Trained Staff', desc: 'Every team member is certified and chosen for their love of pets and dedication to excellence.' },
              { icon: '🛁', title: 'Premium Grooming', desc: 'Ultra-premium Les Pooches shampoo imported from Paris for the most luxurious bath experience.' },
              { icon: '🌿', title: 'State-of-the-Art Facility', desc: 'Hospital-grade disinfectants, Aerapy UV air purification, and anti-microbial flooring throughout.' },
            ].map((f, i) => (
              <RevealSection key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                <div style={{ background: B.bg, borderRadius: 20, padding: '36px 30px', height: '100%', transition: 'transform .3s, box-shadow .3s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                  <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, marginBottom: 10 }}>{f.title}</h3>
                  <p style={{ color: B.textSec, fontSize: 15, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>

      {/* Media mentions bar */}
      <RevealSection style={{ background: B.bg, padding: '50px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: B.textMut, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 20 }}>Featured In</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', opacity: 0.4 }}>
          {['Entrepreneur', 'Forbes', 'CNN Money', 'Yahoo!', 'Fox', 'NBC', 'ABC'].map(m => (
            <span key={m} style={{ fontSize: 18, fontWeight: 700, color: B.text, fontFamily: "'GT Eesti Display', sans-serif" }}>{m}</span>
          ))}
        </div>
      </RevealSection>

      {/* CTA footer */}
      <div style={{ background: B.navy, padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 40px)', color: '#fff', marginBottom: 16 }}>
          Ready to Book Your Dog's Vacation?
        </h2>
        <div className="bk-gold-line" style={{ marginBottom: 30 }} />
        <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 16, maxWidth: 500, margin: '0 auto 30px', lineHeight: 1.6 }}>
          Give your pup the 5-star experience they deserve.
        </p>
        <button className="bk-btn bk-btn-primary" onClick={() => navigateTo('availability', 'left')}>
          Check Availability <Icons.Arrow size={18} />
        </button>
        <div style={{ marginTop: 40, fontSize: 11, color: 'rgba(255,255,255,.3)' }}>© 2026 K9 Resorts Luxury Pet Hotel. All Rights Reserved.</div>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // BACK NAVIGATION BAR
  // ═════════════════════════════════════════════════════════════════════════
  const NavBar = ({ title, onBack }) => (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${B.border}`, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={onBack || goBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: B.navy, fontSize: 15, fontWeight: 600, fontFamily: "'GT Eesti', sans-serif", padding: '6px 0' }}>
        <Icons.Back size={18} /> Back
      </button>
      <div style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 18, fontWeight: 700, color: B.navy }}>{title || 'K9 Resorts'}</div>
      <div style={{ width: 60 }} />
    </nav>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // AVAILABILITY PAGE
  // ═════════════════════════════════════════════════════════════════════════
  const renderAvailability = () => {
    const totalRoomCounts = {};
    ROOM_ORDER.forEach(rt => {
      totalRoomCounts[rt] = (loc?.rooms || []).filter(r => r.type === rt).length;
    });
    const availCounts = {};
    ROOM_ORDER.forEach(rt => {
      availCounts[rt] = getAvailableCount(rt, loc?.rooms, checkIn, checkOut, loc?.reservations);
    });
    const totalAvail = ROOM_ORDER.reduce((s, rt) => s + availCounts[rt], 0);
    const availableTypes = ROOM_ORDER.filter(rt => availCounts[rt] > 0);

    return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title="View Availability" />

        <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 24px' }}>
          <QuestionTransition questionKey={`avail-${availStep}`}>
            {/* Step 0: Boarding or Daycare? */}
            {availStep === 0 && (
              <div style={{ textAlign: 'center' }}>
                <div className="bk-fade-up" style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Let's get started</div>
                <h2 className="bk-fade-up bk-fade-up-d1" style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(28px, 5vw, 44px)', color: B.navy, marginBottom: 12, lineHeight: 1.2 }}>
                  What are you interested in?
                </h2>
                <p className="bk-fade-up bk-fade-up-d2" style={{ color: B.textSec, fontSize: 17, marginBottom: 40 }}>
                  Choose the service that's right for your pup.
                </p>
                <div className="bk-fade-up bk-fade-up-d3" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {[
                    { key: 'boarding', emoji: '🏨', label: 'Overnight Boarding', desc: 'Luxury cage-free overnight stays' },
                    { key: 'daycare', emoji: '☀️', label: 'Doggie Daycare', desc: 'Fun-filled days of play & socialization' },
                  ].map(opt => (
                    <div key={opt.key} className={`bk-chip ${serviceType === opt.key ? 'selected' : ''}`}
                      style={{ flexDirection: 'column', alignItems: 'center', padding: '30px 40px', minWidth: 200 }}
                      onClick={() => { setServiceType(opt.key); setTimeout(() => setAvailStep(1), 400); }}>
                      <span style={{ fontSize: 40, marginBottom: 8 }}>{opt.emoji}</span>
                      <span style={{ fontSize: 18, fontWeight: 700 }}>{opt.label}</span>
                      <span style={{ fontSize: 13, color: B.textSec, marginTop: 4 }}>{opt.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Date selection */}
            {availStep === 1 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Step 2 of 4</div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 38px)', color: B.navy, marginBottom: 8, lineHeight: 1.2 }}>
                  {serviceType === 'boarding' ? 'When does your pup need a room?' : 'What day works best?'}
                </h2>
                <p style={{ color: B.textSec, fontSize: 16, marginBottom: 36 }}>
                  {serviceType === 'boarding' ? "Don't worry if you're still finalizing plans — we can adjust later." : "Pick a day to bring your pup in for some fun."}
                </p>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
                  <div style={{ textAlign: 'left', minWidth: 200 }}>
                    <BkInput label={serviceType === 'boarding' ? 'Check-in Date' : 'Date'} type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} min={getMinDate()} required />
                  </div>
                  {serviceType === 'boarding' && (
                    <div style={{ textAlign: 'left', minWidth: 200 }}>
                      <BkInput label="Check-out Date" type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={checkIn || getMinDate()} required />
                    </div>
                  )}
                </div>
                {serviceType === 'boarding' && checkIn && checkOut && countNights(checkIn, checkOut) > 0 && (
                  <div style={{ fontSize: 15, color: B.navy, fontWeight: 600, marginBottom: 24 }}>
                    {countNights(checkIn, checkOut)} night{countNights(checkIn, checkOut) > 1 ? 's' : ''} · {fmtDate(checkIn)} → {fmtDate(checkOut)}
                  </div>
                )}
                <button className="bk-btn bk-btn-primary"
                  disabled={!checkIn || (serviceType === 'boarding' && (!checkOut || countNights(checkIn, checkOut) < 1))}
                  style={{ opacity: (!checkIn || (serviceType === 'boarding' && !checkOut)) ? 0.4 : 1 }}
                  onClick={() => {
                    if (serviceType === 'daycare') { setCheckOut(checkIn); }
                    setAvailStep(2);
                  }}>
                  See Available Rooms <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 2: Room selection with live availability */}
            {availStep === 2 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Step 3 of 4</div>
                  {totalAvail > 0 ? (
                    <>
                      <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 36px)', color: B.navy, marginBottom: 8 }}>
                        Great news! We have {availableTypes.length} room type{availableTypes.length > 1 ? 's' : ''} available
                      </h2>
                      <p style={{ color: B.textSec, fontSize: 16 }}>Which one sounds best for your pup?</p>
                    </>
                  ) : (
                    <>
                      <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 30, color: B.navy, marginBottom: 8 }}>We're fully booked for those dates</h2>
                      <p style={{ color: B.textSec, fontSize: 16 }}>Try different dates or give us a call.</p>
                      <button className="bk-btn bk-btn-gold-outline" style={{ marginTop: 20 }} onClick={() => setAvailStep(1)}>
                        <Icons.Back size={16} /> Change Dates
                      </button>
                    </>
                  )}
                </div>

                {totalAvail > 0 && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, marginBottom: 30 }}>
                      {ROOM_ORDER.map((rt, i) => {
                        const info = ROOM_INFO[rt];
                        const avail = availCounts[rt];
                        const sold = avail === 0;
                        return (
                          <div key={rt} className={`bk-room-card bk-scale-in ${selectedRoom === rt ? 'selected' : ''} ${sold ? 'disabled' : ''}`}
                            style={{ animationDelay: `${i * 0.1}s` }}
                            onClick={() => !sold && setSelectedRoom(rt)}>
                            <div style={{ height: 180, background: `linear-gradient(135deg, ${B.navy}15, ${B.gold}10)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                              <Icons.Dog size={60} />
                              {selectedRoom === rt && (
                                <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, borderRadius: '50%', background: B.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Icons.Check size={16} color="#fff" />
                                </div>
                              )}
                            </div>
                            <div style={{ padding: '20px 22px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 18, color: B.navy }}>{rt}</h3>
                                <span style={{ fontSize: 14, fontWeight: 700, color: sold ? B.err : B.suc }}>
                                  {sold ? 'Sold Out' : `${avail} left`}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: B.textSec, marginBottom: 8 }}>{info.size}</div>
                              <p style={{ fontSize: 14, color: B.textSec, lineHeight: 1.5, marginBottom: 12 }}>{info.desc}</p>
                              {loc?.pricing?.boardingRates?.[rt] && (
                                <div style={{ fontSize: 20, fontWeight: 700, color: B.navy }}>
                                  {fmtCurrency(loc.pricing.boardingRates[rt])} <span style={{ fontSize: 13, fontWeight: 500, color: B.textMut }}>/night</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <button className="bk-btn bk-btn-gold-outline" style={{ marginBottom: 16 }} onClick={() => setAvailStep(3)}>
                        I'm not sure — help me choose
                      </button>
                      {selectedRoom && (
                        <div>
                          <button className="bk-btn bk-btn-primary" onClick={() => { setRegStep(0); navigateTo('register', 'left'); }}>
                            Continue with {selectedRoom} <Icons.Arrow size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Room recommendation engine */}
            {availStep === 3 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Room Finder</div>

                {dogCount === null ? (
                  <>
                    <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 8 }}>Is this for one dog or more?</h2>
                    <p style={{ color: B.textSec, fontSize: 16, marginBottom: 36 }}>This helps us find the perfect room size.</p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <div className="bk-chip" style={{ padding: '24px 40px', flexDirection: 'column' }} onClick={() => setDogCount('single')}>
                        <span style={{ fontSize: 32 }}>🐕</span>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>Just one</span>
                      </div>
                      <div className="bk-chip" style={{ padding: '24px 40px', flexDirection: 'column' }} onClick={() => { setDogCount('multiple'); setRecommendedRoom('Executive Room'); }}>
                        <span style={{ fontSize: 32 }}>🐕🐕</span>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>Two or more</span>
                      </div>
                    </div>
                  </>
                ) : dogCount === 'single' && !dogWeight ? (
                  <>
                    <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 8 }}>How much does your pup weigh?</h2>
                    <p style={{ color: B.textSec, fontSize: 16, marginBottom: 30 }}>An approximate weight is fine.</p>
                    <div style={{ maxWidth: 240, margin: '0 auto', marginBottom: 30 }}>
                      <BkInput type="number" placeholder="Weight in lbs" value={dogWeight} onChange={e => setDogWeight(e.target.value)} style={{ textAlign: 'center', fontSize: 24 }} />
                    </div>
                    {dogWeight && (
                      <button className="bk-btn bk-btn-primary" onClick={() => {
                        const w = parseFloat(dogWeight);
                        if (w <= 35) { /* ask about crate */ }
                        else { computeRecommendation(); }
                      }}>
                        {parseFloat(dogWeight) <= 35 ? 'Next' : 'Find My Room'} <Icons.Arrow size={18} />
                      </button>
                    )}
                  </>
                ) : dogCount === 'single' && dogWeight && parseFloat(dogWeight) <= 35 && isCrated === null ? (
                  <>
                    <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 8 }}>Is your dog crate-trained at home?</h2>
                    <p style={{ color: B.textSec, fontSize: 16, marginBottom: 36 }}>Dogs comfortable with crates may prefer our cozy compartments.</p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                      <div className="bk-chip" style={{ padding: '20px 36px' }} onClick={() => { setIsCrated(true); setTimeout(computeRecommendation, 50); }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>Yes, crate-trained</span>
                      </div>
                      <div className="bk-chip" style={{ padding: '20px 36px' }} onClick={() => { setIsCrated(false); setTimeout(computeRecommendation, 50); }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>No / not sure</span>
                      </div>
                    </div>
                  </>
                ) : recommendedRoom ? (
                  <>
                    <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 8 }}>
                      Based on what you've told us, we recommend:
                    </h2>
                    <p style={{ color: B.textSec, fontSize: 16, marginBottom: 36 }}>
                      {dogCount === 'multiple'
                        ? "For families with multiple dogs, our larger rooms give everyone plenty of space."
                        : parseFloat(dogWeight) > 100
                        ? "For dogs over 100 lbs, our spacious rooms ensure maximum comfort."
                        : isCrated
                        ? "Since your pup is comfortable in a crate, our compartments are a cozy fit."
                        : "We think this room will be the perfect fit."}
                      {' '}Select whichever you prefer!
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 30 }}>
                      {ROOM_ORDER.map((rt, i) => {
                        const info = ROOM_INFO[rt];
                        const isRec = rt === recommendedRoom;
                        const minTier = getMinTier();
                        const disabled = info.tier < minTier;
                        const avail = availCounts[rt];
                        return (
                          <div key={rt} className={`bk-room-card ${selectedRoom === rt ? 'selected' : ''} ${disabled || avail === 0 ? 'disabled' : ''}`}
                            onClick={() => !disabled && avail > 0 && setSelectedRoom(rt)}>
                            {isRec && <div className="bk-rec-badge">Recommended</div>}
                            {disabled && <div style={{ position: 'absolute', top: 16, left: 16, background: B.textMut, color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, zIndex: 2 }}>Not available for {dogWeight} lbs</div>}
                            <div style={{ height: 120, background: isRec ? `linear-gradient(135deg, ${B.gold}20, ${B.navy}10)` : `linear-gradient(135deg, ${B.bg}, ${B.border}40)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icons.Dog size={40} />
                            </div>
                            <div style={{ padding: '16px 18px' }}>
                              <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 16, color: B.navy, marginBottom: 4 }}>{rt}</h3>
                              <div style={{ fontSize: 12, color: B.textMut, marginBottom: 6 }}>{info.size}</div>
                              {loc?.pricing?.boardingRates?.[rt] && (
                                <div style={{ fontSize: 18, fontWeight: 700, color: B.navy }}>{fmtCurrency(loc.pricing.boardingRates[rt])}/night</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {selectedRoom && (
                      <button className="bk-btn bk-btn-primary" onClick={() => { setRegStep(0); navigateTo('register', 'left'); }}>
                        Continue with {selectedRoom} <Icons.Arrow size={18} />
                      </button>
                    )}
                  </>
                ) : (
                  <div>
                    <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy }}>Finding your perfect room...</h2>
                  </div>
                )}
              </div>
            )}
          </QuestionTransition>

          {/* Progress indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 50 }}>
            <div className="bk-progress">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`bk-progress-dot ${availStep === i ? 'active' : availStep > i ? 'done' : ''}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // REGISTRATION FLOW
  // ═════════════════════════════════════════════════════════════════════════
  const renderRegistration = () => {
    const stepTitles = ['Your Information', 'Dog Information', 'Vaccine Records', 'Feeding & Care', 'Stay Details', 'Review & Book'];
    const totalSteps = stepTitles.length;

    return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title={stepTitles[regStep]} onBack={() => {
          if (regStep === 0) goBack();
          else setRegStep(s => s - 1);
        }} />

        {/* Step progress */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {stepTitles.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= regStep ? B.gold : B.border, transition: 'background .3s' }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: B.textMut, textAlign: 'right' }}>Step {regStep + 1} of {totalSteps}</div>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '30px 24px 60px' }}>
          <QuestionTransition questionKey={`reg-${regStep}`}>
            {/* Step 0: Client info */}
            {regStep === 0 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Tell us about yourself</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>We'll use this to set up your account.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="First Name" required value={client.firstName} onChange={e => setClient({ ...client, firstName: e.target.value })} />
                  <BkInput label="Last Name" required value={client.lastName} onChange={e => setClient({ ...client, lastName: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Phone Number" required type="tel" value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} />
                  <BkInput label="Email" required type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <BkInput label="Address" required value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Emergency Contact" required value={client.emergencyContact} onChange={e => setClient({ ...client, emergencyContact: e.target.value })} />
                  <BkInput label="Emergency Phone" required type="tel" value={client.emergencyPhone} onChange={e => setClient({ ...client, emergencyPhone: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Veterinarian Name" required value={client.vetName} onChange={e => setClient({ ...client, vetName: e.target.value })} />
                  <BkInput label="Vet Phone" required type="tel" value={client.vetPhone} onChange={e => setClient({ ...client, vetPhone: e.target.value })} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <BkSelect label="How did you hear about us?" required options={['Google', 'Instagram', 'Facebook', 'Friend/Family', 'Veterinarian', 'Drive-by', 'Other']} value={client.referralSource} onChange={e => setClient({ ...client, referralSource: e.target.value })} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label className="bk-label">Notes</label>
                  <textarea className="bk-input" rows={3} placeholder="Anything else we should know..." value={client.notes} onChange={e => setClient({ ...client, notes: e.target.value })} style={{ resize: 'vertical' }} />
                </div>
                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
                  disabled={!client.firstName || !client.lastName || !client.phone || !client.email}
                  onClick={() => setRegStep(1)}>
                  Continue to Dog Info <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 1: Dog info */}
            {regStep === 1 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Tell us about your dog</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Help us get to know your furry family member.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Dog's Name" required value={dog.name} onChange={e => setDog({ ...dog, name: e.target.value })} />
                  <BkInput label="Breed" required value={dog.breed} onChange={e => setDog({ ...dog, breed: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Weight (lbs)" type="number" value={dog.weight || dogWeight} onChange={e => setDog({ ...dog, weight: e.target.value })} />
                  <BkSelect label="Sex" options={['Male', 'Female']} value={dog.sex} onChange={e => setDog({ ...dog, sex: e.target.value })} />
                  <BkSelect label="Spayed/Neutered" options={dog.sex === 'Male' ? ['Neutered', 'Intact'] : ['Spayed', 'Intact']} value={dog.spayedNeutered} onChange={e => setDog({ ...dog, spayedNeutered: e.target.value })} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <BkInput label="Date of Birth" type="date" value={dog.dob} onChange={e => setDog({ ...dog, dob: e.target.value })} />
                </div>
                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
                  disabled={!dog.name || !dog.breed}
                  onClick={() => setRegStep(2)}>
                  Continue to Vaccines <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 2: Vaccines (simplified) */}
            {regStep === 2 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💉</div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 8 }}>Vaccine Records</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 32, maxWidth: 450, margin: '0 auto 32px' }}>
                  We require up-to-date vaccine records for all guests. You can upload them now or bring them before check-in.
                </p>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 30 }}>
                  <div className={`bk-chip ${vaccineChoice === 'now' ? 'selected' : ''}`} style={{ padding: '20px 32px', flexDirection: 'column' }}
                    onClick={() => setVaccineChoice('now')}>
                    <Icons.Upload size={28} />
                    <span style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Upload Now</span>
                    <span style={{ fontSize: 12, color: B.textSec }}>Attach files from your device</span>
                  </div>
                  <div className={`bk-chip ${vaccineChoice === 'later' ? 'selected' : ''}`} style={{ padding: '20px 32px', flexDirection: 'column' }}
                    onClick={() => setVaccineChoice('later')}>
                    <Icons.Calendar size={28} />
                    <span style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Before Check-in</span>
                    <span style={{ fontSize: 12, color: B.textSec }}>We'll remind you before your visit</span>
                  </div>
                </div>
                {vaccineChoice === 'now' && (
                  <div style={{ maxWidth: 400, margin: '0 auto 24px', padding: 24, border: `2px dashed ${B.border}`, borderRadius: 16, background: '#fff' }}>
                    <input type="file" multiple accept="image/*,.pdf" onChange={e => setVaccineFiles([...e.target.files])} style={{ fontSize: 14 }} />
                    {vaccineFiles.length > 0 && <div style={{ fontSize: 13, color: B.suc, fontWeight: 600, marginTop: 8 }}>{vaccineFiles.length} file(s) selected</div>}
                  </div>
                )}
                {vaccineChoice && (
                  <button className="bk-btn bk-btn-primary" onClick={() => setRegStep(3)}>
                    Continue <Icons.Arrow size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Step 3: Feeding & medications */}
            {regStep === 3 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Feeding & Care</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Let us know about your dog's dining preferences.</p>

                <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginBottom: 8 }}>What will {dog.name || 'your dog'} eat during their stay?</div>
                  <p style={{ fontSize: 13, color: B.textSec, marginBottom: 20, lineHeight: 1.6 }}>
                    We recommend our premium <strong style={{ color: B.navy }}>Blue Buffalo vet-grade formula</strong> — included at no extra charge and designed for sensitive stomachs. You're also welcome to bring food from home (a small supply fee applies).
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className={`bk-chip ${feedingChoice === 'bluebuffalo' ? 'selected' : ''}`} style={{ padding: '14px 24px' }}
                      onClick={() => setFeedingChoice('bluebuffalo')}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>🍽️ Blue Buffalo (Included)</span>
                    </div>
                    <div className={`bk-chip ${feedingChoice === 'fromhome' ? 'selected' : ''}`} style={{ padding: '14px 24px' }}
                      onClick={() => setFeedingChoice('fromhome')}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>🏠 Food From Home</span>
                    </div>
                  </div>
                  {feedingChoice === 'fromhome' && (
                    <div style={{ marginTop: 16 }}>
                      <label className="bk-label">Feeding instructions</label>
                      <textarea className="bk-input" rows={2} value={feedingNotes} onChange={e => setFeedingNotes(e.target.value)} placeholder="Amount, frequency, brand, any special instructions..." />
                    </div>
                  )}
                </div>

                <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginBottom: 8 }}>Does {dog.name || 'your dog'} take any medications?</div>
                  <textarea className="bk-input" rows={2} value={medicationNotes} onChange={e => setMedicationNotes(e.target.value)} placeholder="List any medications, dosages, and timing (or leave blank if none)..." />
                </div>

                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
                  disabled={!feedingChoice}
                  onClick={() => setRegStep(4)}>
                  Continue to Stay Details <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 4: Stay details */}
            {regStep === 4 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Stay Details</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Almost there! Just a few final details.</p>

                {/* Dates (pre-filled, shown read-only) */}
                <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.navy, marginBottom: 12 }}>Your Reservation</div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 15 }}>
                    <div><span style={{ color: B.textMut, fontSize: 12, fontWeight: 600 }}>CHECK-IN</span><div style={{ fontWeight: 600 }}>{fmtDate(checkIn)}</div></div>
                    <div><span style={{ color: B.textMut, fontSize: 12, fontWeight: 600 }}>CHECK-OUT</span><div style={{ fontWeight: 600 }}>{fmtDate(checkOut)}</div></div>
                    <div><span style={{ color: B.textMut, fontSize: 12, fontWeight: 600 }}>ROOM</span><div style={{ fontWeight: 600 }}>{selectedRoom}</div></div>
                    <div><span style={{ color: B.textMut, fontSize: 12, fontWeight: 600 }}>NIGHTS</span><div style={{ fontWeight: 600 }}>{countNights(checkIn, checkOut)}</div></div>
                  </div>
                </div>

                {/* Operating hours note */}
                <div style={{ background: B.goldPale, borderRadius: 12, padding: '14px 20px', marginBottom: 20, fontSize: 13, color: B.bronze, lineHeight: 1.6 }}>
                  <strong>Operating Hours:</strong> Our resort is open 7:00 AM – 7:00 PM daily. Check-in is available anytime during operating hours. Standard checkout is by 12:30 PM — a late checkout fee (half-day daycare rate) applies after 12:30 PM.
                </div>

                {/* Bath preference */}
                {countNights(checkIn, checkOut) >= 2 && (
                  <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginBottom: 6 }}>Bathing Preference</div>
                    <p style={{ fontSize: 13, color: B.textSec, marginBottom: 16, lineHeight: 1.5 }}>
                      All dogs boarding 2+ nights receive a complimentary standard bath. Upgrade to a premium bath if you'd like.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Standard Bath', ...BATH_OPTIONS.filter(b => b !== 'Standard Bath')].map(b => (
                        <div key={b} className={`bk-chip ${selectedBath === b ? 'selected' : ''}`} style={{ padding: '10px 18px', fontSize: 14 }}
                          onClick={() => setSelectedBath(b)}>
                          {b}{b === 'Standard Bath' && ' (Included)'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 24 }}>
                  <label className="bk-label">Any special notes for our team?</label>
                  <textarea className="bk-input" rows={3} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Behavioral notes, pickup/dropoff instructions, anything else..." />
                </div>

                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }} onClick={() => setRegStep(5)}>
                  Review Your Booking <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 5: Cart / Review */}
            {regStep === 5 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Review & Book</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Here's a summary of your reservation.</p>

                {/* Summary card */}
                <div style={{ background: '#fff', borderRadius: 20, border: `2px solid ${B.border}`, overflow: 'hidden', marginBottom: 24 }}>
                  <div style={{ background: B.navy, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: B.gold, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Reservation Summary</div>
                      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: "'Canela', Georgia, serif", marginTop: 4 }}>{selectedRoom}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: '#fff' }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{pricing ? fmtCurrency(pricing.subtotal) : '—'}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{pricing?.nights} night{pricing?.nights > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 14 }}>
                      <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Guest</span><div style={{ fontWeight: 600 }}>{client.firstName} {client.lastName}</div></div>
                      <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Dog</span><div style={{ fontWeight: 600 }}>{dog.name} ({dog.breed})</div></div>
                      <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Check-in</span><div style={{ fontWeight: 600 }}>{fmtDate(checkIn)}</div></div>
                      <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Check-out</span><div style={{ fontWeight: 600 }}>{fmtDate(checkOut)}</div></div>
                    </div>

                    {/* Line items */}
                    {pricing && (
                      <div style={{ borderTop: `1px solid ${B.border}`, paddingTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                          <span>{selectedRoom} × {pricing.nights} nights</span>
                          <span style={{ fontWeight: 600 }}>{fmtCurrency(pricing.roomCost)}</span>
                        </div>
                        {pricing.bathCost > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                            <span>{selectedBath}</span>
                            <span style={{ fontWeight: 600 }}>{fmtCurrency(pricing.bathCost)}</span>
                          </div>
                        )}
                        {selectedAddOns.map(a => (
                          <div key={a} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                            <span>{a} × {pricing.nights} days</span>
                            <span style={{ fontWeight: 600 }}>{fmtCurrency((loc?.pricing?.addOns?.[a] || 0) * pricing.nights)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: `2px solid ${B.navy}`, marginTop: 12, paddingTop: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: B.navy }}>
                            <span>Total</span><span>{fmtCurrency(pricing.subtotal)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add-ons */}
                {loc?.pricing?.addOns && Object.keys(loc.pricing.addOns).filter(a => !BATH_OPTIONS.includes(a) && a !== 'None').length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, marginBottom: 12 }}>Enhance Your Stay</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                      {Object.entries(loc.pricing.addOns).filter(([k]) => !BATH_OPTIONS.includes(k) && k !== 'None' && k !== 'Standard Bath').map(([name, price]) => {
                        const added = selectedAddOns.includes(name);
                        return (
                          <div key={name} className={`bk-addon-card ${added ? 'added' : ''}`}
                            onClick={() => setSelectedAddOns(s => added ? s.filter(a => a !== name) : [...s, name])}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                              {added ? <Icons.Check size={18} color={B.suc} /> : <Icons.Plus size={18} color={B.textMut} />}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginTop: 6 }}>{fmtCurrency(price)}/day</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Deposit notice */}
                {pricing && (
                  <div style={{ background: B.goldPale, borderRadius: 14, padding: '18px 22px', marginBottom: 28, border: `1px solid ${B.gold}30` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: B.navy }}>Deposit Due Today</span>
                      <span style={{ fontSize: 22, fontWeight: 700, color: B.navy }}>{fmtCurrency(pricing.deposit)}</span>
                    </div>
                    <p style={{ fontSize: 13, color: B.bronze, lineHeight: 1.5 }}>
                      A {pricing.depositPct}% deposit ({fmtCurrency(pricing.deposit)}) is required to confirm your reservation.
                      The remaining balance of {fmtCurrency(pricing.balance)} is due at check-in.
                      Deposits are non-refundable but can be applied to future reservations.
                    </p>
                  </div>
                )}

                <button className="bk-btn bk-btn-primary" style={{ width: '100%', padding: '18px', fontSize: 18 }}
                  disabled={submitting}
                  onClick={handleSubmit}>
                  {submitting ? 'Submitting...' : `Confirm & Pay Deposit ${pricing ? fmtCurrency(pricing.deposit) : ''}`}
                </button>
              </div>
            )}
          </QuestionTransition>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // CONFIRMATION PAGE
  // ═════════════════════════════════════════════════════════════════════════
  const renderConfirmation = () => (
    <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }} className="bk-fade-up">
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: B.suc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Icons.Check size={40} color="#fff" />
        </div>
        <h1 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 36, color: B.navy, marginBottom: 12 }}>
          Booking Confirmed!
        </h1>
        <div className="bk-gold-line" style={{ marginBottom: 20 }} />
        <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>
          Thank you, {client.firstName}! Your reservation for {dog.name} has been submitted.
        </p>
        {confirmationId && confirmationId !== 'confirmed' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', display: 'inline-block', marginBottom: 20, border: `1px solid ${B.border}` }}>
            <div style={{ fontSize: 11, color: B.textMut, fontWeight: 600, textTransform: 'uppercase' }}>Confirmation ID</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: B.navy, fontFamily: 'monospace' }}>{confirmationId}</div>
          </div>
        )}
        <p style={{ color: B.textSec, fontSize: 14, lineHeight: 1.6, marginBottom: 30 }}>
          Our team will review your booking and send a confirmation email to {client.email}. If you have any questions, call us at (908) 889-PETS.
        </p>
        <button className="bk-btn bk-btn-navy" onClick={() => {
          window.scrollTo({ top: 0 });
          setCurrentPage('splash');
          setPageHistory(['splash']);
        }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // ACCOUNT PAGE (placeholder)
  // ═════════════════════════════════════════════════════════════════════════
  const renderAccount = () => (
    <div style={{ minHeight: '100vh', background: B.bg }}>
      <NavBar title="Your Account" />
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 12 }}>Account Access</h2>
        <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 30 }}>
          Account features are coming soon. For now, please contact us to review receipts, upcoming reservations, or package balances.
        </p>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: `1px solid ${B.border}`, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Icons.Phone size={20} color={B.navy} />
            <span style={{ fontSize: 16, fontWeight: 600, color: B.navy }}>(908) 889-PETS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icons.Mail size={20} color={B.navy} />
            <span style={{ fontSize: 16, fontWeight: 600, color: B.navy }}>info@k9resorts.com</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // LEARN MORE PAGE
  // ═════════════════════════════════════════════════════════════════════════
  const renderLearnMore = () => (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <NavBar title="Why K9 Resorts?" />

      {/* Hero */}
      <div style={{ background: B.navy, padding: '80px 24px', textAlign: 'center' }}>
        <div className="bk-fade-up">
          <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 16 }}>Welcome to the New Gold Standard</div>
          <h1 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(32px, 5vw, 56px)', color: '#fff', lineHeight: 1.1, marginBottom: 16 }}>
            Not All Pet Care Facilities<br />Are Created Equal
          </h1>
          <div className="bk-gold-line" style={{ marginBottom: 20 }} />
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 18, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
            K9 Resorts is a multi-award-winning, internationally recognized luxury pet hotel offering resort-style vacations and doggie daycare.
          </p>
        </div>
      </div>

      {/* Why We're #1 */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px' }}>
        <RevealSection>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 36, color: B.navy, textAlign: 'center', marginBottom: 40 }}>Why We're #1</h2>
        </RevealSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {[
            'Cage-Free Luxury Boarding Options',
            'Veterinarian Recommended',
            'Multi-Award-Winning and Internationally Recognized',
            '"Ritz Carlton of Dog Hotels"',
            'Anti-Microbial Flooring',
            'Aerapy UV Air Purification System',
            'Hospital Grade Disinfectants',
            'Professionally-Trained and Loving Staff',
            'Ultra Clean Facility',
            'Designer Brand Pet Suites',
            'Outdoor "Pet-Safe" Courtyard',
            'Premium Kuranda Dog Beds',
            "TV's in All Luxury Suites",
            'Ultra Premium Les Pooches Dog Shampoo',
          ].map((item, i) => (
            <RevealSection key={i} style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: B.bg, borderRadius: 12 }}>
                <Icons.Check size={18} color={B.gold} />
                <span style={{ fontSize: 14, fontWeight: 500, color: B.text }}>{item}</span>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: B.navy, padding: '60px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: '#fff', marginBottom: 16 }}>Ready to Experience the Difference?</h2>
        <button className="bk-btn bk-btn-primary" onClick={() => navigateTo('availability', 'left')}>
          Book Now <Icons.Arrow size={18} />
        </button>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'splash': return renderSplash();
      case 'availability': return renderAvailability();
      case 'register': return renderRegistration();
      case 'confirmation': return renderConfirmation();
      case 'account': return renderAccount();
      case 'learn': return renderLearnMore();
      default: return renderSplash();
    }
  };

  return (
    <PageTransition pageKey={currentPage} direction={transDir}>
      {renderCurrentPage()}
    </PageTransition>
  );
}
