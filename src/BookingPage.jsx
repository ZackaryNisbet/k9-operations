// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import React, { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import { supabase } from './supabaseClient';
import { B } from './shared/bookingTheme';
import { HERO_IMAGES, ROOM_IMAGES, ROOM_INFO, ROOM_ORDER, BATH_OPTIONS, GLOBAL_CSS, DEF_BREEDS } from './booking/constants';
import { gid, getMinDate, countNights, fmtDate, fmtCurrency, getAvailableCount } from './booking/lib';
import { Icons } from './booking/components/Icons';
import { K9Logo } from './booking/components/K9Logo';
import { RevealSection } from './booking/components/RevealSection';
import { QuestionTransition } from './booking/components/QuestionTransition';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY — catches render errors and shows useful info
// ═══════════════════════════════════════════════════════════════════════════
class BookingErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('BookingPage Error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F4', fontFamily: "'GT Eesti', sans-serif", padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 500 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🐾</div>
            <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: '#003462', marginBottom: 12 }}>Something went wrong</h2>
            <p style={{ color: '#6B7280', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>We encountered an unexpected error. Please try refreshing the page.</p>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, textAlign: 'left', marginBottom: 20, maxHeight: 120, overflow: 'auto' }}>
              <code style={{ fontSize: 12, color: '#EF4444', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error?.message || 'Unknown error'}</code>
            </div>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 28px', background: '#003462', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Refresh Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Brand constants imported from shared/bookingTheme.js (K9 Resorts franchise theme)







// Page transitions handled via key-based remount with bk-fade-in CSS class


// ═══════════════════════════════════════════════════════════════════════════
// INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
// Format raw digits into (xxx) xxx-xxxx
function formatPhoneDisplay(val) {
  const d = (val || '').replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

function BkInput({ label, required, ...props }) {
  // Phone mask: strip non-digits, format as (xxx) xxx-xxxx
  if (props.type === 'tel') {
    const handlePhoneChange = (e) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
      // Create a synthetic event-like object with the raw digits
      props.onChange?.({ target: { value: raw } });
    };
    const displayVal = formatPhoneDisplay(props.value);
    return (
      <div>
        {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
        <input className="bk-input" {...props} type="tel" value={displayVal} onChange={handlePhoneChange} placeholder={props.placeholder || '(555) 123-4567'} maxLength={14} />
      </div>
    );
  }
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


function BkBreedSearch({ value, onChange, breeds }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [hlIdx, setHlIdx] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  const allBreeds = breeds && breeds.length > 0 ? breeds : DEF_BREEDS;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allBreeds.slice(0, 20);
    return allBreeds.filter(b => b.toLowerCase().includes(s)).slice(0, 20);
  }, [q, allBreeds]);

  useEffect(() => { setHlIdx(0); }, [q]);

  // Sync external value changes (e.g. returning client pre-fill)
  useEffect(() => { if (value !== q) setQ(value || ''); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = listRef.current.children;
    if (items[hlIdx]) items[hlIdx].scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  const select = (b) => { setQ(b); onChange(b); setOpen(false); };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && filtered.length > 0) { e.preventDefault(); select(filtered[hlIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label className="bk-label">Breed <span style={{ color: B.err }}>*</span></label>
      <input className="bk-input" value={q}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={handleKeyDown}
        placeholder="Search breeds…"
        autoComplete="off" />
      {open && filtered.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: `2px solid ${B.border}`, borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.12)', zIndex: 100,
          maxHeight: 220, overflow: 'auto'
        }}>
          {filtered.map((b, i) => (
            <button key={b} onClick={() => select(b)} onMouseEnter={() => setHlIdx(i)}
              style={{
                display: 'block', width: '100%', padding: '10px 16px', border: 'none',
                background: hlIdx === i ? B.navy + '10' : 'transparent',
                cursor: 'pointer', fontFamily: "'GT Eesti', sans-serif", textAlign: 'left',
                fontSize: 14, fontWeight: b === 'Unknown / Not Sure' || b === 'Mixed Breed' ? 700 : 500,
                color: hlIdx === i ? B.navy : B.text, transition: 'background 0.1s'
              }}>
              {b === 'Unknown / Not Sure' && <span style={{ color: B.textMut, fontSize: 12 }}>⚡ </span>}{b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI CALENDAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function BookingCalendar({ label, value, onChange, minDate, required }) {
  const today = new Date();
  const minD = minDate ? new Date(minDate + 'T12:00:00') : today;
  const initDate = value ? new Date(value + 'T12:00:00') : today;
  const [month, setMonth] = useState(initDate.getMonth());
  const [year, setYear] = useState(initDate.getFullYear());

  // Update displayed month when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00');
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    }
  }, [value]);

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [month, year]);

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goPrev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const goNext = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const isDisabled = (day) => {
    if (!day) return true;
    const d = new Date(year, month, day);
    d.setHours(12, 0, 0, 0);
    const min = new Date(minD);
    min.setHours(0, 0, 0, 0);
    return d < min;
  };

  const isSelected = (day) => {
    if (!day || !value) return false;
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return value === `${year}-${m}-${d}`;
  };

  const isToday = (day) => {
    if (!day) return false;
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const selectDay = (day) => {
    if (isDisabled(day)) return;
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${year}-${m}-${d}`);
  };

  // Prevent going to months before minDate
  const canGoPrev = !(year === minD.getFullYear() && month <= minD.getMonth());

  const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div style={{ textAlign: 'left' }}>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <div style={{
        background: B.surface, border: `1.5px solid ${value ? B.gold : B.border}`, borderRadius: 16,
        padding: '16px 18px', minWidth: 260, transition: 'border-color .2s',
      }}>
        {/* Month nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button type="button" onClick={goPrev} disabled={!canGoPrev}
            style={{ background: 'none', border: 'none', cursor: canGoPrev ? 'pointer' : 'default', padding: 4, color: canGoPrev ? B.navy : B.border, fontSize: 18, fontWeight: 700, borderRadius: 8 }}>
            ‹
          </button>
          <span style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 16, fontWeight: 700, color: B.navy }}>{monthLabel}</span>
          <button type="button" onClick={goNext}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: B.navy, fontSize: 18, fontWeight: 700, borderRadius: 8 }}>
            ›
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: B.textMut, padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.05em' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {days.map((day, i) => {
            const disabled = isDisabled(day);
            const selected = isSelected(day);
            const todayMark = isToday(day);
            return (
              <div key={i}
                onClick={() => day && !disabled && selectDay(day)}
                style={{
                  textAlign: 'center', padding: '8px 0', fontSize: 14, fontWeight: selected ? 700 : 500, borderRadius: 10,
                  cursor: day && !disabled ? 'pointer' : 'default',
                  background: selected ? B.gold : 'transparent',
                  color: selected ? '#fff' : disabled ? B.border : todayMark ? B.gold : B.text,
                  border: todayMark && !selected ? `1.5px solid ${B.gold}` : '1.5px solid transparent',
                  transition: 'all .15s',
                }}>
                {day || ''}
              </div>
            );
          })}
        </div>

        {/* Selected date display */}
        {value && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: 600, color: B.navy }}>
            {new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>
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
  const learnRef = useRef(null);

  // Availability flow state
  const [serviceType, setServiceType] = useState(null); // 'boarding' | 'daycare' | 'tour'
  const [availStep, setAvailStep] = useState(0); // 0=service, 1=dates, 2=rooms/tour-time, 3=recommend
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [dogSizeGroup, setDogSizeGroup] = useState(''); // 'small' | 'large' for daycare

  // Tour booking
  const [tourDate, setTourDate] = useState('');
  const [tourTime, setTourTime] = useState('');

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
  const [feedingChoice, setFeedingChoice] = useState(null); // 'bluebuffalo' | 'fromhome' | 'skip'
  const [feedingMeals, setFeedingMeals] = useState([]); // ['AM', 'PM'] or subset
  const [feedingNotes, setFeedingNotes] = useState('');
  const [bbProtein, setBbProtein] = useState(''); // 'chicken' | 'salmon'
  const [bbQty, setBbQty] = useState('');
  const [bbQtyOverride, setBbQtyOverride] = useState(false);
  const [medicationNotes, setMedicationNotes] = useState('');
  const [medications, setMedications] = useState([]); // [{name, dosage, times:[], instructions}]
  const [medChoice, setMedChoice] = useState(null); // 'has_meds' | 'none' | 'skip'
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [selectedBath, setSelectedBath] = useState('');

  // Add-ons
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [addOnDates, setAddOnDates] = useState({}); // { [addOnName]: [date1, date2] }

  // Add-ons that are per-night (no date selection) vs one-time (allow date selection)
  const PER_NIGHT_ADDONS = ['Couch', 'Sofa', 'Bed', 'Cot', 'TV', 'Webcam', 'Music'];
  const HIDDEN_ADDONS = ['Lunch', 'lunch']; // #16: remove lunch from self-booking

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [confirmationId, setConfirmationId] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  // ISSUE 2: Track if we need to ask about saving profile changes
  const [askSaveChanges, setAskSaveChanges] = useState(false);

  // Account portal state
  const [accountStep, setAccountStep] = useState('phone'); // 'phone' | 'otp' | 'portal'
  const [accountPhone, setAccountPhone] = useState('');
  const [accountOtp, setAccountOtp] = useState('');
  const [accountData, setAccountData] = useState(null);
  const [accountTab, setAccountTab] = useState('overview');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountEditing, setAccountEditing] = useState(null);
  const [pkgCheckout, setPkgCheckout] = useState(null); // { pkg, qty }
  const [checkoutStep, setCheckoutStep] = useState('details'); // 'details' | 'success'
  // Portal sub-states (must be at component top level for hooks rules)
  const [editSection, setEditSection] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [expandedRes, setExpandedRes] = useState(null);
  const [expandedDog, setExpandedDog] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [saveBanner, setSaveBanner] = useState(null);
  const [vaccineUploadDog, setVaccineUploadDog] = useState(null);
  const [vaccineUploadFile, setVaccineUploadFile] = useState(null);
  const [vaccineUploadName, setVaccineUploadName] = useState('');
  const [vaccineUploadExpiry, setVaccineUploadExpiry] = useState('');
  const [vaccineUploading, setVaccineUploading] = useState(false);

  // Existing client recognition
  const [existingClientMode, setExistingClientMode] = useState(false);
  const [existingClientPhone, setExistingClientPhone] = useState('');
  const [existingClientLoading, setExistingClientLoading] = useState(false);
  const [existingClientError, setExistingClientError] = useState('');
  const [existingClientData, setExistingClientData] = useState(null); // matched client+dogs from data
  const [isExistingClient, setIsExistingClient] = useState(false);

  // Accelerated flow for existing clients
  const [skipToCheckout, setSkipToCheckout] = useState(false); // Jump existing clients directly to step 5 (cart)
  const [showPostPaymentVerification, setShowPostPaymentVerification] = useState(false); // Show quick verification modal after payment

  // ISSUE 2: Track original profile values for "Modified from Profile" indicator
  const [clientOriinalValues, setClientOriinalValues] = useState(null); // original values from profile
  const [modifiedFields, setModifiedFields] = useState(new Set()); // set of field names that were modified

  const lookupExistingClient = async () => {
    setExistingClientLoading(true);
    setExistingClientError('');
    const normalizedPhone = existingClientPhone.replace(/\D/g, '');
    if (normalizedPhone.length < 10) {
      setExistingClientError('Please enter a valid phone number.');
      setExistingClientLoading(false);
      return;
    }
    // Look up in data (loaded via RPC)
    try {
      const { data: result } = await supabase.rpc('get_customer_portal_data', { p_phone: existingClientPhone, p_slug: slug });
      if (result?.success && result?.client) {
        const cl = result.client;
        // ISSUE 1 FIX: Populate ALL client fields from profile
        const populatedClient = {
          firstName: cl.first_name || '',
          lastName: cl.last_name || '',
          phone: cl.phone || existingClientPhone,
          email: cl.email || '',
          address: cl.address || '',
          emergencyContact: cl.emergency_contact || '',
          emergencyPhone: cl.emergency_phone || '',
          vetName: cl.vet_name || '',
          vetPhone: cl.vet_phone || '',
          referralSource: cl.referral_source || '',
          notes: cl.notes || ''
        };
        // Store original values for "Modified from Profile" tracking
        setClientOriinalValues(populatedClient);
        setClient(populatedClient);
        // Pre-fill dog info from first dog if available
        if (result.dogs && result.dogs.length > 0) {
          const d = result.dogs[0];
          setDog({
            name: d.name || '', breed: d.breed || '', weight: d.weight || '',
            sex: d.sex || '', spayedNeutered: d.spayed_neutered || '', dob: d.dob || '', bathType: ''
          });
        }
        setExistingClientData(result);
        setIsExistingClient(true);
        setExistingClientMode(false);

        // Accelerated flow: Skip straight to checkout (step 5) for existing clients
        if (serviceType === 'tour') {
          // For tours: only need confirmation
          setTimeout(() => setRegStep(5), 200);
        } else {
          // For boarding/daycare: skip straight to checkout for FAST booking
          setSkipToCheckout(true);
          setTimeout(() => setRegStep(5), 200);
        }
      } else {
        setExistingClientError('No account found for this phone number. Please register as a new client.');
      }
    } catch (err) {
      setExistingClientError('Could not look up account. Please try again or register as a new client.');
    }
    setExistingClientLoading(false);
  };

  // ISSUE 2: Helper to track field modifications
  const handleClientFieldChange = (field, value) => {
    setClient({ ...client, [field]: value });
    // Track if this field was modified from the original profile value
    if (clientOriinalValues && clientOriinalValues[field] !== value) {
      setModifiedFields(prev => new Set([...prev, field]));
    } else if (clientOriinalValues && clientOriinalValues[field] === value) {
      // Remove from modified set if changed back to original
      setModifiedFields(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  };

  // Real-time draft capture
  const [sessionId] = useState(() => {
    let sid = sessionStorage.getItem('k9_booking_session');
    if (!sid) { sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); sessionStorage.setItem('k9_booking_session', sid); }
    return sid;
  });
  const stepTimeline = useRef([]);
  const stepEnterTime = useRef(Date.now());
  const draftTimer = useRef(null);

  // Load data (and refresh function for availability checks)
  const refreshLocationData = useCallback(async () => {
    if (!slug) return;
    try {
      const { data, error: e } = await supabase.rpc('get_public_booking_data', { p_slug: slug });
      if (e) throw e;
      if (data?.success) setLocationData(data);
    } catch (err) { /* silent refresh */ }
  }, [slug]);
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

  // Step timeline tracking
  const currentStepLabel = currentPage === 'splash' ? 'splash'
    : currentPage === 'availability' ? `avail_step_${availStep}`
    : currentPage === 'register' ? `reg_step_${regStep}`
    : currentPage;

  useEffect(() => {
    const now = Date.now();
    // Record exit time for previous step
    if (stepTimeline.current.length > 0) {
      const last = stepTimeline.current[stepTimeline.current.length - 1];
      if (!last.exitedAt) last.exitedAt = new Date(now).toISOString();
      last.duration = Math.round((now - new Date(last.enteredAt).getTime()) / 1000);
    }
    // Record entry for new step
    stepTimeline.current.push({ step: currentStepLabel, enteredAt: new Date(now).toISOString(), exitedAt: null, duration: 0 });
    stepEnterTime.current = now;
  }, [currentStepLabel]);

  // Debounced draft sync — captures all fields on every change
  const syncDraft = useCallback(() => {
    if (!slug) return;
    const requiredFields = ['firstName', 'lastName', 'phone', 'email'];
    const filledRequired = requiredFields.filter(f => client[f]?.trim()).length;
    const totalRequired = serviceType === 'tour' ? requiredFields.length : requiredFields.length + 2; // +dog name, breed
    const dogFilled = (dog.name ? 1 : 0) + (dog.breed ? 1 : 0);
    const pct = Math.round(((filledRequired + (serviceType !== 'tour' ? dogFilled : 0)) / totalRequired) * 100);

    const draft = {
      session_id: sessionId,
      location_slug: slug,
      service_type: serviceType,
      current_step: currentStepLabel,
      completion_pct: Math.min(pct, 100),
      step_timeline: stepTimeline.current,
      client_data: client,
      dog_data: serviceType !== 'tour' ? dog : {},
      booking_data: { checkIn, checkOut, selectedRoom, tourDate, tourTime, feedingChoice, medChoice },
    };
    // Fire-and-forget RPC — use .then() with error handler (Supabase v2 thenable doesn't expose .catch)
    supabase.rpc('upsert_booking_draft', { p_draft: draft }).then(
      (res) => { if (res.error) console.log('Draft sync error:', res.error.message); },
      () => {} // network error — ignore silently
    );
  }, [slug, sessionId, serviceType, currentStepLabel, client, dog, checkIn, checkOut, selectedRoom, tourDate, tourTime, feedingChoice, medChoice]);

  // Trigger debounced sync on registration field changes
  useEffect(() => {
    if (currentPage !== 'register') return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(syncDraft, 500);
    return () => clearTimeout(draftTimer.current);
  }, [client, dog, feedingChoice, medChoice, syncDraft, currentPage]);

  // Also sync on page/step changes
  useEffect(() => {
    if (serviceType) syncDraft();
  }, [currentStepLabel, serviceType]);

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
    window.scrollTo(0, 0);
    // Refresh location data when entering availability to get fresh room counts
    if (page === 'availability') refreshLocationData();
  }, [refreshLocationData]);

  const goBack = useCallback(() => {
    if (pageHistory.length <= 1) {
      // Fallback to splash if no history
      setCurrentPage('splash');
      setPageHistory(['splash']);
      window.scrollTo(0, 0);
      return;
    }
    const prev = pageHistory[pageHistory.length - 2];
    setTransDir('right');
    setCurrentPage(prev);
    setPageHistory(h => h.slice(0, -1));
    window.scrollTo(0, 0);
  }, [pageHistory]);

  // Pricing computation
  const pricing = useMemo(() => {
    if (!locationData?.pricing || !selectedRoom || !checkIn || !checkOut) return null;
    const nights = countNights(checkIn, checkOut);
    const rate = locationData.pricing.boardingRates?.[selectedRoom] || 0;
    let roomCost = rate * nights;

    // ISSUE 3: Apply multi-dog discount (20% off 2nd dog) if applicable
    let multiDogDiscount = 0;
    if (dogCount === 'multiple' && locationData.pricing.multiDogDiscount > 0) {
      const discountAmount = Math.round(roomCost * (locationData.pricing.multiDogDiscount / 100) * 100) / 100;
      multiDogDiscount = discountAmount;
      roomCost = Math.max(0, roomCost - discountAmount);
    }

    let bathCost = 0;
    if (selectedBath && locationData.pricing.addOns?.[selectedBath]) bathCost = locationData.pricing.addOns[selectedBath];
    let addOnCost = 0;
    selectedAddOns.forEach(a => {
      const unitPrice = locationData.pricing.addOns?.[a] || 0;
      const isPerNight = PER_NIGHT_ADDONS.some(p => a.toLowerCase().includes(p.toLowerCase()));
      if (isPerNight) {
        addOnCost += unitPrice * nights;
      } else {
        // One-time add-on: use selected dates count, or all nights if none selected
        const selDates = addOnDates[a];
        const dayCount = selDates && selDates.length > 0 ? selDates.length : nights;
        addOnCost += unitPrice * dayCount;
      }
    });
    let subtotal = roomCost + bathCost + addOnCost;

    // ISSUE 4: Apply recurring discount to self-booking if existing client
    let discount = 0;
    if (isExistingClient && existingClientData?.client?.recurringDiscountId) {
      const disc = existingClientData.discounts?.find(d => d.id === existingClientData.client.recurringDiscountId);
      if (disc) {
        discount = disc.type === 'percentage' ? Math.round(subtotal * (disc.value / 100) * 100) / 100 : Math.min(disc.value, subtotal);
      }
    }
    subtotal = Math.max(0, subtotal - discount);

    const depositPct = locationData.pricing.paymentRules?.boarding?.depositPercent || 50;
    const deposit = Math.round(subtotal * depositPct / 100 * 100) / 100;
    const balance = Math.round((subtotal - deposit) * 100) / 100;
    return { nights, rate, roomCost, bathCost, addOnCost, subtotal, discount, deposit, balance, depositPct, multiDogDiscount };
  }, [locationData, selectedRoom, checkIn, checkOut, selectedBath, selectedAddOns, isExistingClient, existingClientData, dogCount]);

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
      const isTourBooking = serviceType === 'tour';
      const nights = isTourBooking ? 0 : countNights(checkIn, checkOut);

      // ISSUE 2: Include modified fields in booking for potential profile update
      const modifiedFieldsData = isExistingClient && modifiedFields.size > 0
        ? Object.fromEntries(
            Array.from(modifiedFields).map(field => [field, client[field]])
          )
        : null;

      const booking = isTourBooking ? {
        type: 'tour',
        client,
        checkIn: tourDate,
        checkOut: tourDate,
        tourTime,
        tourDuration: locationData?.settings?.tourSettings?.duration || 30,
        notes: bookingNotes || client.notes,
        modifiedFields: modifiedFieldsData,
      } : {
        type: serviceType || 'boarding',
        client,
        dog: {
          ...dog,
          feedingChoice,
          feedingMeals,
          feedingNotes: feedingChoice === 'bluebuffalo'
            ? `Blue Buffalo ${bbProtein || 'chicken'}, ${bbQtyOverride && bbQty ? bbQty : 'recommended'} cups/day (${feedingMeals.join(' & ')})`
            : feedingChoice === 'fromhome' ? `${feedingNotes} (${feedingMeals.join(' & ')})`
            : 'Skipped',
          feedingDetails: feedingChoice === 'bluebuffalo' ? { protein: bbProtein, qty: bbQtyOverride ? bbQty : 'recommended', override: bbQtyOverride } : null,
          medications: medChoice === 'has_meds' ? medications : [],
          medicationNotes: medChoice === 'has_meds' ? medications.map(m => `${m.name} ${m.dosageQty || ''} ${m.dosageUnit || ''} (${m.times.join(',')})`).join('; ') : medChoice === 'none' ? 'No medications' : 'Skipped',
          bathType: selectedBath,
        },
        checkIn, checkOut,
        checkInTime: checkInTime && checkInTime !== 'unknown' ? checkInTime : '',
        checkOutTime: checkOutTime && checkOutTime !== 'unknown' ? checkOutTime : '',
        roomType: selectedRoom,
        notes: bookingNotes,
        pricing: pricing ? { ...pricing, total: pricing.subtotal } : {},
        addOns: selectedAddOns,
        addOnDates,
        isExistingClient,
        vaccineChoice,
        modifiedFields: modifiedFieldsData,
      };
      const { data: result, error: e } = await supabase.rpc('submit_online_booking', { p_slug: slug, p_booking: booking });
      if (e) throw e;
      if (result?.bookingId || result?.success) {
        setConfirmationId(result.bookingId || 'confirmed');
        // For existing clients who used fast checkout, show verification modal first
        if (skipToCheckout) {
          setShowPostPaymentVerification(true);
        } else {
          navigateTo('confirmation', 'left');
        }
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
        <K9Logo size={64} />
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
  const locName = loc?.location_name || loc?.name || 'K9 Resorts';

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
            <K9Logo size={56} />
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
            <button className="bk-cta-card" style={{ border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left' }} onClick={() => navigateTo('availability', 'left')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Icons.Calendar size={22} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>View Availability</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', marginBottom: 12, lineHeight: 1.5, margin: 0 }}>
                Have dates in mind? See what's open and book your stay.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: B.gold, fontSize: 14, fontWeight: 600, marginTop: 12 }}>
                Check Availability <Icons.Arrow size={16} color={B.gold} />
              </div>
            </button>

            <button className="bk-cta-card" style={{ border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left' }} onClick={() => navigateTo('account', 'left')}>
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
            </button>

            <button className="bk-cta-card" style={{ border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left' }} onClick={() => learnRef.current?.scrollIntoView({ behavior: 'smooth' })}>
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
            </button>
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

      {/* Why K9 Resorts Section (scroll target) */}
      <div ref={learnRef} style={{ background: '#fff' }}>
        <div style={{ background: B.navy, padding: '80px 24px', textAlign: 'center' }}>
          <RevealSection>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 16 }}>Welcome to the New Gold Standard</div>
            <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(32px, 5vw, 56px)', color: '#fff', lineHeight: 1.1, marginBottom: 16 }}>
              Not All Pet Care Facilities<br />Are Created Equal
            </h2>
            <div className="bk-gold-line" style={{ marginBottom: 20 }} />
            <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 18, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
              K9 Resorts is a multi-award-winning, internationally recognized luxury pet hotel offering resort-style vacations and doggie daycare.
            </p>
          </RevealSection>
        </div>

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
      </div>

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
      // rooms is { "Luxury Suite": ["101","102",...], ... }
      totalRoomCounts[rt] = Array.isArray(loc?.rooms?.[rt]) ? loc.rooms[rt].length : 0;
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
                    { key: 'tour', emoji: '👀', label: 'Facility Tour', desc: '30-minute guided tour of our resort' },
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
                <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>
                  {serviceType === 'tour' ? 'Step 2 of 3' : 'Step 2 of 4'}
                </div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 38px)', color: B.navy, marginBottom: 8, lineHeight: 1.2 }}>
                  {serviceType === 'boarding' ? 'When does your pup need a room?' : serviceType === 'tour' ? 'When would you like to visit?' : 'What day works best?'}
                </h2>
                <p style={{ color: B.textSec, fontSize: 16, marginBottom: 36 }}>
                  {serviceType === 'boarding' ? "Don't worry if you're still finalizing plans — we can adjust later."
                    : serviceType === 'tour' ? 'Pick a day and we\'ll show you available time slots.'
                    : "Pick a day to bring your pup in for some fun."}
                </p>
                <div className="bk-mobile-stack" style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
                  {serviceType === 'tour' ? (
                    <BookingCalendar
                      label="Tour Date"
                      value={tourDate}
                      onChange={setTourDate}
                      minDate={getMinDate()}
                      required
                    />
                  ) : (
                    <>
                      <BookingCalendar
                        label={serviceType === 'boarding' ? 'Check-in Date' : 'Date'}
                        value={checkIn}
                        onChange={(val) => { setCheckIn(val); if (serviceType === 'boarding' && checkOut && val >= checkOut) setCheckOut(''); }}
                        minDate={getMinDate()}
                        required
                      />
                      {serviceType === 'boarding' && (
                        <BookingCalendar
                          label="Check-out Date"
                          value={checkOut}
                          onChange={setCheckOut}
                          minDate={checkIn || getMinDate()}
                          required
                        />
                      )}
                    </>
                  )}
                </div>
                {serviceType === 'boarding' && checkIn && checkOut && countNights(checkIn, checkOut) > 0 && (
                  <div style={{ fontSize: 15, color: B.navy, fontWeight: 600, marginBottom: 24 }}>
                    {countNights(checkIn, checkOut)} night{countNights(checkIn, checkOut) > 1 ? 's' : ''} · {fmtDate(checkIn)} → {fmtDate(checkOut)}
                  </div>
                )}
                {/* Drop-off / Pick-up time selection */}
                {serviceType === 'boarding' && checkIn && checkOut && (
                  <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: B.navy, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Drop-off Time</div>
                      {checkInTime && checkInTime !== 'unknown' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} className="bk-input" style={{ padding: '12px 16px', fontSize: 16, textAlign: 'center', width: 160 }} />
                          <button onClick={() => setCheckInTime('')} style={{ background: 'none', border: 'none', color: B.textMut, cursor: 'pointer', fontSize: 18, padding: 4 }} title="Clear">&times;</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="bk-chip" style={checkInTime === 'unknown' ? { borderColor: B.navy, background: B.navy + '10', color: B.navy } : {}} onClick={() => setCheckInTime('unknown')}>I don't know yet</button>
                          <button className="bk-chip" onClick={() => setCheckInTime('09:00')}>Choose a time</button>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: B.navy, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Pick-up Time</div>
                      {checkOutTime && checkOutTime !== 'unknown' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} className="bk-input" style={{ padding: '12px 16px', fontSize: 16, textAlign: 'center', width: 160 }} />
                          <button onClick={() => setCheckOutTime('')} style={{ background: 'none', border: 'none', color: B.textMut, cursor: 'pointer', fontSize: 18, padding: 4 }} title="Clear">&times;</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="bk-chip" style={checkOutTime === 'unknown' ? { borderColor: B.navy, background: B.navy + '10', color: B.navy } : {}} onClick={() => setCheckOutTime('unknown')}>I don't know yet</button>
                          <button className="bk-chip" onClick={() => setCheckOutTime('12:00')}>Choose a time</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Daycare capacity check */}
                {serviceType === 'daycare' && checkIn && (() => {
                  const resArr = Array.isArray(loc?.reservations) ? loc.reservations : [];
                  const dcCount = resArr.filter(r =>
                    (r.type === 'daycare' || r.type === 'dayboarding') &&
                    r.checkIn <= checkIn && r.checkOut >= checkIn &&
                    r.status !== 'cancelled' && r.status !== 'checked-out'
                  ).length;
                  // Calculate total capacity from facility settings (same logic as internal dashboard)
                  const fs = loc?.facilitySettings || { largeDogDaycareSF: 0, smallDogDaycareSF: 0 };
                  const lgCap = Math.floor((fs.largeDogDaycareSF || 0) / 18);
                  const smCap = Math.floor((fs.smallDogDaycareSF || 0) / 12);
                  const capacity = lgCap + smCap;
                  const atCapacity = dcCount >= capacity;
                  if (atCapacity) return (
                    <div style={{ background: `${B.err}10`, borderRadius: 14, padding: '18px 22px', marginBottom: 20, border: `1px solid ${B.err}30` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Icons.Alert size={20} color={B.err} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: B.err }}>Daycare is full for this date</span>
                      </div>
                      <p style={{ fontSize: 13, color: B.textSec, lineHeight: 1.5 }}>
                        We've reached capacity on {fmtDate(checkIn)}. Please try a different date or give us a call at the resort.
                      </p>
                    </div>
                  );
                  return null;
                })()}
                <button className="bk-btn bk-btn-primary"
                  disabled={serviceType === 'tour' ? !tourDate : (!checkIn || (serviceType === 'boarding' && (!checkOut || countNights(checkIn, checkOut) < 1)))}
                  style={{ opacity: (serviceType === 'tour' ? !tourDate : (!checkIn || (serviceType === 'boarding' && !checkOut))) ? 0.4 : 1 }}
                  onClick={() => {
                    if (serviceType === 'daycare') { setCheckOut(checkIn); }
                    refreshLocationData(); // Refresh to get latest room availability
                    setAvailStep(2);
                  }}>
                  {serviceType === 'tour' ? 'See Available Times' : serviceType === 'daycare' ? 'Check Availability' : 'See Available Rooms'} <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 2 (Tour): Time slot picker */}
            {availStep === 2 && serviceType === 'tour' && (() => {
              const tourSettings = loc?.settings?.tourSettings || {};
              const duration = tourSettings.duration || 30;
              const allowConcurrent = tourSettings.allowConcurrent !== false ? true : false;
              const startTime = tourSettings.startTime || "09:00";
              const endTime = tourSettings.endTime || "16:30";
              const [startH, startM] = startTime.split(":").map(Number);
              const [endH, endM] = endTime.split(":").map(Number);
              const startMin = startH * 60 + startM;
              const endMin = endH * 60 + endM;
              const interval = duration || 30;
              // Generate slots from configured start to end time
              const slots = [];
              for (let mins = startMin; mins <= endMin; mins += interval) {
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                const ampm = h >= 12 ? 'PM' : 'AM';
                const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
                const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                // Check conflicts with existing tour reservations
                const resArr = Array.isArray(loc?.reservations) ? loc.reservations : [];
                const conflict = !allowConcurrent && resArr.some(r =>
                  r.type === 'tour' && r.checkIn === tourDate && r.tourTime === val &&
                  r.status !== 'cancelled' && r.status !== 'checked-out'
                );
                slots.push({ label, val, conflict });
              }
              return (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Step 3 of 3</div>
                  <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 36px)', color: B.navy, marginBottom: 8 }}>
                    Pick a time for your tour
                  </h2>
                  <p style={{ color: B.textSec, fontSize: 16, marginBottom: 8 }}>
                    {fmtDate(tourDate)} · {duration}-minute guided tour
                  </p>
                  <p style={{ color: B.textMut, fontSize: 13, marginBottom: 32 }}>
                    Tours available {(() => { const fmt = (t) => { const [hh,mm] = t.split(":"); const hr = parseInt(hh); return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${mm} ${hr >= 12 ? "PM" : "AM"}`; }; return `${fmt(startTime)} – ${fmt(endTime)}`; })()}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 500, margin: '0 auto 32px' }}>
                    {slots.map(s => (
                      <button key={s.val} type="button" disabled={s.conflict}
                        className={`bk-chip ${tourTime === s.val ? 'selected' : ''}`}
                        style={{ padding: '12px 20px', fontSize: 14, opacity: s.conflict ? 0.35 : 1, cursor: s.conflict ? 'not-allowed' : 'pointer' }}
                        onClick={() => !s.conflict && setTourTime(s.val)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {tourTime && (
                    <button className="bk-btn bk-btn-primary" onClick={() => { setRegStep(0); navigateTo('register', 'left'); }}>
                      Continue to Your Info <Icons.Arrow size={18} />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Step 2: Room selection with live availability */}
            {/* Step 2 (Daycare): Play group capacity */}
            {availStep === 2 && serviceType === 'daycare' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 30 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.gold, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>Step 3 of 4</div>
                  <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 'clamp(24px, 4vw, 36px)', color: B.navy, marginBottom: 8 }}>Play Group Availability</h2>
                  <p style={{ color: B.textSec, fontSize: 16 }}>{fmtDate(checkIn)}</p>
                </div>

                {/* Size selection for new clients */}
                {!isExistingClient && !dogSizeGroup && (
                  <div style={{ textAlign: 'center', marginBottom: 30 }}>
                    <p style={{ fontSize: 16, color: B.navy, fontWeight: 600, marginBottom: 16 }}>Is your dog over or under 35 lbs?</p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                      <button className="bk-btn bk-btn-gold-outline" style={{ padding: '14px 32px', fontSize: 15 }} onClick={() => setDogSizeGroup('small')}>
                        Under 35 lbs (Small Play)
                      </button>
                      <button className="bk-btn bk-btn-gold-outline" style={{ padding: '14px 32px', fontSize: 15 }} onClick={() => setDogSizeGroup('large')}>
                        35+ lbs (Large Play)
                      </button>
                    </div>
                  </div>
                )}

                {/* Show capacity when size is known */}
                {(isExistingClient || dogSizeGroup) && (() => {
                  const resArr = Array.isArray(loc?.reservations) ? loc.reservations : [];
                  // Calculate capacity from facility settings (same logic as internal dashboard)
                  const fs = loc?.facilitySettings || { largeDogDaycareSF: 0, smallDogDaycareSF: 0 };
                  const lgCap = Math.floor((fs.largeDogDaycareSF || 0) / 18);
                  const smCap = Math.floor((fs.smallDogDaycareSF || 0) / 12);
                  const dcOnDate = resArr.filter(r =>
                    (r.type === 'daycare' || r.type === 'dayboarding' || r.type === 'evaluation') &&
                    r.checkIn <= checkIn && (r.checkOut >= checkIn || r.checkIn === checkIn) &&
                    r.status !== 'cancelled' && r.status !== 'checked-out'
                  );
                  const lgCount = dcOnDate.filter(r => r.daycareSize === 'large' || (!r.daycareSize)).length;
                  const smCount = dcOnDate.filter(r => r.daycareSize === 'small').length;
                  const lgAvail = Math.max(0, lgCap - lgCount);
                  const smAvail = Math.max(0, smCap - smCount);
                  const effectiveSize = isExistingClient && existingClientData?.dogs?.[0]?.weight
                    ? (parseFloat(existingClientData.dogs[0].weight) >= 35 ? 'large' : 'small')
                    : dogSizeGroup;
                  const myGroupAvail = effectiveSize === 'large' ? lgAvail : smAvail;
                  const myGroupName = effectiveSize === 'large' ? 'Large Play' : 'Small Play';

                  return (
                    <div>
                      {/* Play group capacity bars */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}>
                        {[
                          { label: 'Large Play (35+ lbs)', count: lgCount, cap: lgCap, avail: lgAvail, active: effectiveSize === 'large' },
                          { label: 'Small Play (Under 35 lbs)', count: smCount, cap: smCap, avail: smAvail, active: effectiveSize === 'small' },
                        ].map(g => (
                          <div key={g.label} style={{ padding: '24px 20px', borderRadius: 16, background: g.active ? `${B.gold}08` : '#f8f9fa', border: g.active ? `2px solid ${B.gold}` : '1px solid #e5e7eb', textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 12 }}>{g.label}</div>
                            <div style={{ position: 'relative', height: 12, borderRadius: 6, background: '#e5e7eb', overflow: 'hidden', marginBottom: 12 }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (g.count / g.cap) * 100)}%`, borderRadius: 6, background: g.avail === 0 ? B.err : g.avail <= 3 ? '#f59e0b' : B.suc, transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: g.avail === 0 ? B.err : B.suc }}>{g.avail}</div>
                            <div style={{ fontSize: 12, color: B.textSec }}>spots available out of {g.cap}</div>
                            <div style={{ fontSize: 11, color: B.textMut, marginTop: 4 }}>{g.count} currently booked</div>
                          </div>
                        ))}
                      </div>

                      {/* Availability result */}
                      {myGroupAvail > 0 ? (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ padding: '16px 24px', borderRadius: 12, background: `${B.suc}10`, border: `1px solid ${B.suc}30`, marginBottom: 20 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: B.suc }}>Your pup can join {myGroupName}! {myGroupAvail} spot{myGroupAvail > 1 ? 's' : ''} available.</span>
                          </div>
                          <button className="bk-btn bk-btn-primary" onClick={() => { setRegStep(0); navigateTo('register', 'left'); }}>
                            Continue to Registration <Icons.Arrow size={18} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ padding: '16px 24px', borderRadius: 12, background: `${B.err}10`, border: `1px solid ${B.err}30`, marginBottom: 20 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: B.err }}>{myGroupName} is full for {fmtDate(checkIn)}</span>
                            <p style={{ fontSize: 13, color: B.textSec, marginTop: 6 }}>Please try a different date or give us a call.</p>
                          </div>
                          <button className="bk-btn bk-btn-gold-outline" onClick={() => setAvailStep(1)}>
                            <Icons.Back size={16} /> Change Date
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  <button className="bk-btn bk-btn-gold-outline" onClick={() => setAvailStep(1)}>
                    <Icons.Back size={16} /> Back
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 (Boarding): Room selection */}
            {availStep === 2 && serviceType !== 'tour' && serviceType !== 'daycare' && (
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
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                      <button className="bk-btn bk-btn-gold-outline" onClick={() => setAvailStep(3)}>
                        I'm not sure — help me choose
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
                      {ROOM_ORDER.map((rt, i) => {
                        const info = ROOM_INFO[rt];
                        const avail = availCounts[rt];
                        const sold = avail === 0;
                        return (
                          <div key={rt} className={`bk-room-card bk-scale-in ${selectedRoom === rt ? 'selected' : ''} ${sold ? 'disabled' : ''}`}
                            style={{ animationDelay: `${i * 0.1}s` }}
                            onClick={() => !sold && setSelectedRoom(rt)}>
                            <div style={{ height: 180, position: 'relative', overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
                              <img src={ROOM_IMAGES[rt]} alt={rt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {sold && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />}
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

                    {selectedRoom && (
                      <div style={{ textAlign: 'center' }}>
                        <button className="bk-btn bk-btn-primary" onClick={() => { setRegStep(0); navigateTo('register', 'left'); }}>
                          Continue with {selectedRoom} <Icons.Arrow size={18} />
                        </button>
                      </div>
                    )}
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
    const isTour = serviceType === 'tour';
    const stepTitles = isTour
      ? ['Your Information', 'Review & Book']
      : ['Your Information', 'Dog Information', 'Vaccine Records', 'Feeding & Care', 'Stay Details', 'Review & Book'];
    const totalSteps = stepTitles.length;
    // Map internal regStep to display index for tours (step 0 → 0, step 5 → 1)
    const displayStep = isTour ? (regStep === 0 ? 0 : 1) : regStep;

    return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title={stepTitles[displayStep]} onBack={() => {
          if (regStep === 0) goBack();
          else if (isTour) setRegStep(0);
          else setRegStep(s => s - 1);
        }} />

        {/* Step progress */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {stepTitles.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= displayStep ? B.gold : B.border, transition: 'background .3s' }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: B.textMut, textAlign: 'right' }}>Step {displayStep + 1} of {totalSteps}</div>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '30px 24px 60px' }}>
          <QuestionTransition questionKey={`reg-${regStep}`}>
            {/* Step 0: Client info */}
            {regStep === 0 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Tell us about yourself</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 8 }}>We'll use this to set up your account.</p>

                {/* Existing client lookup */}
                {!isExistingClient && !existingClientMode && (
                  <button onClick={() => setExistingClientMode(true)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: 20, borderRadius: 12, border: `1.5px dashed ${B.gold}`, background: `${B.gold}08`, color: B.navy, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all .15s' }}>
                    Already a K9 Resorts client? Click here to look up your account
                  </button>
                )}
                {existingClientMode && (
                  <div style={{ padding: '16px 20px', marginBottom: 20, borderRadius: 12, border: `1.5px solid ${B.gold}40`, background: `${B.gold}08` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 10 }}>Look up your account</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={existingClientPhone} onChange={e => setExistingClientPhone(e.target.value)} placeholder="Enter your phone number" style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${B.border}`, fontSize: 15, fontFamily: 'inherit' }} onKeyDown={e => e.key === 'Enter' && lookupExistingClient()} />
                      <button onClick={lookupExistingClient} disabled={existingClientLoading} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: B.gold, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: existingClientLoading ? 0.6 : 1 }}>
                        {existingClientLoading ? 'Looking up...' : 'Look Up'}
                      </button>
                      <button onClick={() => { setExistingClientMode(false); setExistingClientError(''); }} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${B.border}`, background: 'transparent', color: B.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                    {existingClientError && <div style={{ fontSize: 13, color: '#DC2626', marginTop: 8 }}>{existingClientError}</div>}
                  </div>
                )}
                {isExistingClient && (
                  <div style={{ padding: '12px 16px', marginBottom: 20, borderRadius: 12, border: '1.5px solid #10B98140', background: '#10B98108', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#10B981', fontSize: 18 }}>&#10003;</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: B.navy }}>Welcome back, {client.firstName}! Your info has been pre-filled. Please confirm your details below.</span>
                    </div>
                    <button onClick={() => { setIsExistingClient(false); setExistingClientData(null); setClient({ firstName: '', lastName: '', phone: '', email: '', address: '', emergencyContact: '', emergencyPhone: '', vetName: '', vetPhone: '', referralSource: '', notes: '' }); setDog({ name: '', breed: '', weight: '', sex: '', spayedNeutered: '', dob: '', bathType: '' }); }} style={{ background: 'none', border: 'none', color: B.textMut, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Clear</button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <BkInput label="First Name" required value={client.firstName} onChange={e => handleClientFieldChange('firstName', e.target.value)} placeholder="Jane" />
                    {isExistingClient && modifiedFields.has('firstName') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                  <div>
                    <BkInput label="Last Name" required value={client.lastName} onChange={e => handleClientFieldChange('lastName', e.target.value)} placeholder="Smith" />
                    {isExistingClient && modifiedFields.has('lastName') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <BkInput label="Phone Number" required type="tel" value={client.phone} onChange={e => handleClientFieldChange('phone', e.target.value)} />
                    {isExistingClient && modifiedFields.has('phone') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                  <div>
                    <BkInput label="Email" required type="email" value={client.email} onChange={e => handleClientFieldChange('email', e.target.value)} placeholder="jane@email.com" />
                    {isExistingClient && modifiedFields.has('email') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <BkInput label="Address" required value={client.address} onChange={e => handleClientFieldChange('address', e.target.value)} placeholder="123 Main St, Stamford, CT 06901" />
                  {isExistingClient && modifiedFields.has('address') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <BkInput label="Emergency Contact" required value={client.emergencyContact} onChange={e => handleClientFieldChange('emergencyContact', e.target.value)} placeholder="John Smith" />
                    {isExistingClient && modifiedFields.has('emergencyContact') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                  <div>
                    <BkInput label="Emergency Phone" required type="tel" value={client.emergencyPhone} onChange={e => handleClientFieldChange('emergencyPhone', e.target.value)} />
                    {isExistingClient && modifiedFields.has('emergencyPhone') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <BkInput label="Veterinarian Name" required value={client.vetName} onChange={e => handleClientFieldChange('vetName', e.target.value)} placeholder="Dr. Johnson, ABC Vet" />
                    {isExistingClient && modifiedFields.has('vetName') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                  <div>
                    <BkInput label="Vet Phone" required type="tel" value={client.vetPhone} onChange={e => handleClientFieldChange('vetPhone', e.target.value)} />
                    {isExistingClient && modifiedFields.has('vetPhone') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <BkSelect label="How did you hear about us?" required options={['Google', 'Instagram', 'Facebook', 'Friend/Family', 'Veterinarian', 'Drive-by', 'Other']} value={client.referralSource} onChange={e => handleClientFieldChange('referralSource', e.target.value)} />
                  {isExistingClient && modifiedFields.has('referralSource') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label className="bk-label">Notes</label>
                  <textarea className="bk-input" rows={3} placeholder="Anything else we should know..." value={client.notes} onChange={e => handleClientFieldChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
                  {isExistingClient && modifiedFields.has('notes') && <div style={{ fontSize: 12, color: B.warn, marginTop: 4, fontWeight: 500 }}>Modified from Profile</div>}
                </div>
                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
                  disabled={!client.firstName || !client.lastName || !client.phone || !client.email}
                  onClick={() => setRegStep(isTour ? 5 : 1)}>
                  {isTour ? 'Review & Confirm' : 'Continue to Dog Info'} <Icons.Arrow size={18} />
                </button>
              </div>
            )}

            {/* Step 1: Dog info */}
            {regStep === 1 && (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Tell us about your dog</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Help us get to know your furry family member.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Dog's Name" required value={dog.name} onChange={e => setDog({ ...dog, name: e.target.value })} placeholder="Buddy" />
                  <BkBreedSearch value={dog.breed} onChange={v => setDog({ ...dog, breed: v })} breeds={locationData?.breedOptions} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <BkInput label="Weight (lbs)" type="number" value={dog.weight || dogWeight} onChange={e => setDog({ ...dog, weight: e.target.value })} placeholder="65" />
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
            {regStep === 3 && (() => {
              // Blue Buffalo daily feeding chart (cups per day based on weight)
              const getBBRecommendation = (weightLbs) => {
                const w = parseFloat(weightLbs) || 0;
                if (w <= 0) return '';
                if (w <= 15) return '½ – 1¼';
                if (w <= 25) return '1¼ – 1¾';
                if (w <= 40) return '1¼ – 2¼';
                if (w <= 60) return '2¼ – 3½';
                if (w <= 80) return '3½ – 4½';
                if (w <= 100) return '4¼ – 5¼';
                const extra = Math.ceil((w - 100) / 20);
                return `5¼ + ${extra * 0.5} cups`;
              };
              const dogW = dog.weight || dogWeight;
              const recQty = getBBRecommendation(dogW);

              const COMMON_MEDS = ['Apoquel', 'Benadryl', 'Carprofen', 'Cephalexin', 'Gabapentin', 'Heartgard', 'Metronidazole', 'Prednisone', 'Trazodone', 'Simparica'];
              const TIME_OPTIONS = ['Morning', 'Noon', 'Evening', 'Bedtime'];
              const addMed = () => setMedications(m => [...m, { name: '', dosageQty: '', dosageUnit: 'pill', times: [], instructions: '' }]);
              const updateMed = (idx, field, val) => setMedications(m => m.map((med, i) => i === idx ? { ...med, [field]: val } : med));
              const toggleMedTime = (idx, time) => setMedications(m => m.map((med, i) => i === idx ? { ...med, times: med.times.includes(time) ? med.times.filter(t => t !== time) : [...med.times, time] } : med));
              const removeMed = (idx) => setMedications(m => m.filter((_, i) => i !== idx));

              return (
              <div>
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>Feeding & Care</h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>Let us know about {dog.name || 'your dog'}'s dining and medication needs.</p>

                {/* Feeding section */}
                <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginBottom: 8 }}>What will {dog.name || 'your dog'} eat during their stay?</div>
                  <p style={{ fontSize: 13, color: B.textSec, marginBottom: 20, lineHeight: 1.6 }}>
                    We provide premium <strong style={{ color: B.navy }}>Blue Buffalo vet-grade formula</strong> at no extra charge, designed for sensitive stomachs.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    {[
                      { key: 'bluebuffalo', label: '🍽️ Blue Buffalo (Included)' },
                      { key: 'fromhome', label: '🏠 Food From Home' },
                      { key: 'skip', label: '⏭️ Skip for now' },
                    ].map(opt => (
                      <div key={opt.key} className={`bk-chip ${feedingChoice === opt.key ? 'selected' : ''}`} style={{ padding: '12px 20px' }}
                        onClick={() => setFeedingChoice(opt.key)}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* AM/PM feeding selection */}
                  {feedingChoice && feedingChoice !== 'skip' && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: B.navy, marginBottom: 8 }}>Feeding schedule</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {['AM', 'PM'].map(meal => {
                          const sel = feedingMeals.includes(meal);
                          return (
                            <div key={meal} className={`bk-chip ${sel ? 'selected' : ''}`} style={{ padding: '10px 24px', flex: 1, justifyContent: 'center' }}
                              onClick={() => setFeedingMeals(prev => sel ? prev.filter(m => m !== meal) : [...prev, meal])}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{meal === 'AM' ? '🌅 Morning (AM)' : '🌙 Evening (PM)'}</span>
                            </div>
                          );
                        })}
                      </div>
                      {feedingMeals.length === 0 && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Please select at least one meal time</div>}
                    </div>
                  )}

                  {/* Blue Buffalo expanded options */}
                  {feedingChoice === 'bluebuffalo' && (
                    <div style={{ background: B.goldPale, borderRadius: 12, padding: 20, marginTop: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 12 }}>Choose a protein</div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                        {['Chicken', 'Salmon'].map(p => (
                          <div key={p} className={`bk-chip ${bbProtein === p.toLowerCase() ? 'selected' : ''}`}
                            style={{ padding: '12px 28px', flex: 1, justifyContent: 'center' }}
                            onClick={() => setBbProtein(p.toLowerCase())}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{p === 'Chicken' ? '🍗' : '🐟'} {p}</span>
                          </div>
                        ))}
                      </div>

                      {dogW && recQty && (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 8 }}>Daily amount</div>
                          <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', marginBottom: 12, border: `1px solid ${B.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: 13, color: B.textMut }}>Recommended for {dogW} lbs</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: B.navy }}>{recQty} cups/day</div>
                              </div>
                              <button type="button" style={{ fontSize: 12, color: B.gold, background: 'none', border: `1px solid ${B.gold}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => setBbQtyOverride(!bbQtyOverride)}>
                                {bbQtyOverride ? 'Use Recommended' : 'Override'}
                              </button>
                            </div>
                            {bbQtyOverride && (
                              <div style={{ marginTop: 12 }}>
                                <BkInput label="Custom amount (cups/day)" value={bbQty} onChange={e => setBbQty(e.target.value)} placeholder="e.g. 2 cups" />
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {feedingChoice === 'fromhome' && (
                    <div style={{ marginTop: 12 }}>
                      <label className="bk-label">Feeding instructions</label>
                      <textarea className="bk-input" rows={2} value={feedingNotes} onChange={e => setFeedingNotes(e.target.value)} placeholder="Brand, amount, frequency, any special instructions..." />
                    </div>
                  )}
                </div>

                {/* Medication section */}
                <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginBottom: 12 }}>Does {dog.name || 'your dog'} take any medications?</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    {[
                      { key: 'has_meds', label: '💊 Yes, has medications' },
                      { key: 'none', label: '✅ No medications' },
                      { key: 'skip', label: '⏭️ Skip for now' },
                    ].map(opt => (
                      <div key={opt.key} className={`bk-chip ${medChoice === opt.key ? 'selected' : ''}`} style={{ padding: '12px 20px' }}
                        onClick={() => { setMedChoice(opt.key); if (opt.key === 'has_meds' && medications.length === 0) addMed(); }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
                      </div>
                    ))}
                  </div>

                  {medChoice === 'has_meds' && (
                    <div>
                      {medications.map((med, idx) => (
                        <div key={idx} style={{ background: B.bg, borderRadius: 12, padding: 18, marginBottom: 12, position: 'relative' }}>
                          {medications.length > 1 && (
                            <button type="button" onClick={() => removeMed(idx)}
                              style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: B.textMut, padding: 4 }}>
                              <Icons.X size={16} />
                            </button>
                          )}
                          <div style={{ fontSize: 13, fontWeight: 700, color: B.navy, marginBottom: 10 }}>Medication {idx + 1}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div>
                              <label className="bk-label">Medication name</label>
                              <input className="bk-input" list={`med-list-${idx}`} value={med.name} onChange={e => updateMed(idx, 'name', e.target.value)} placeholder="Start typing..." />
                              <datalist id={`med-list-${idx}`}>{COMMON_MEDS.map(m => <option key={m} value={m} />)}</datalist>
                            </div>
                            <div>
                              <label className="bk-label">Dosage</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input className="bk-input" type="number" value={med.dosageQty} onChange={e => updateMed(idx, 'dosageQty', e.target.value)} placeholder="Qty" style={{ width: 70 }} min="0" />
                                <select className="bk-input" value={med.dosageUnit || 'pill'} onChange={e => updateMed(idx, 'dosageUnit', e.target.value)} style={{ flex: 1 }}>
                                  <option value="pill">Pill(s)</option>
                                  <option value="tablet">Tablet(s)</option>
                                  <option value="capsule">Capsule(s)</option>
                                  <option value="ml">mL</option>
                                  <option value="mg">mg</option>
                                  <option value="drop">Drop(s)</option>
                                  <option value="scoop">Scoop(s)</option>
                                  <option value="chew">Chew(s)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label className="bk-label">When to give</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {TIME_OPTIONS.map(t => (
                                <div key={t} className={`bk-chip ${med.times.includes(t) ? 'selected' : ''}`}
                                  style={{ padding: '8px 16px', fontSize: 13 }}
                                  onClick={() => toggleMedTime(idx, t)}>
                                  {t}
                                </div>
                              ))}
                            </div>
                          </div>
                          <BkInput label="Special instructions" value={med.instructions} onChange={e => updateMed(idx, 'instructions', e.target.value)} placeholder="e.g. with food, on empty stomach" />
                        </div>
                      ))}
                      <button type="button" className="bk-btn bk-btn-gold-outline" style={{ fontSize: 13, padding: '10px 20px' }}
                        onClick={addMed}>
                        <Icons.Plus size={14} /> Add another medication
                      </button>
                    </div>
                  )}
                </div>

                <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
                  disabled={!feedingChoice && !medChoice}
                  onClick={() => setRegStep(4)}>
                  Continue to Stay Details <Icons.Arrow size={18} />
                </button>
              </div>
              );
            })()}

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
                      A standard bath is required for all dogs boarding 2+ nights. You may upgrade to a premium bath if you'd like.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Standard Bath', ...BATH_OPTIONS.filter(b => b !== 'Standard Bath')].map(b => (
                        <div key={b} className={`bk-chip ${selectedBath === b ? 'selected' : ''}`} style={{ padding: '10px 18px', fontSize: 14 }}
                          onClick={() => setSelectedBath(b)}>
                          {b}
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
                <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 6 }}>
                  {isTour ? 'Confirm Your Tour' : 'Review & Book'}
                </h2>
                <p style={{ color: B.textSec, fontSize: 15, marginBottom: 28 }}>
                  {isTour ? "Here's what we have for your visit." : "Here's a summary of your reservation."}
                </p>

                {/* Summary card */}
                <div style={{ background: '#fff', borderRadius: 20, border: `2px solid ${B.border}`, overflow: 'hidden', marginBottom: 24 }}>
                  <div style={{ background: B.navy, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: B.gold, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                        {isTour ? 'Tour Confirmation' : 'Reservation Summary'}
                      </div>
                      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: "'Canela', Georgia, serif", marginTop: 4 }}>
                        {isTour ? 'Facility Tour' : selectedRoom}
                      </div>
                    </div>
                    {!isTour && (
                      <div style={{ textAlign: 'right', color: '#fff' }}>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{pricing ? fmtCurrency(pricing.subtotal) : '—'}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{pricing?.nights} night{pricing?.nights > 1 ? 's' : ''}</div>
                      </div>
                    )}
                    {isTour && (
                      <div style={{ textAlign: 'right', color: '#fff' }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Free</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>30 minutes</div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 14 }}>
                      <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Guest</span><div style={{ fontWeight: 600 }}>{client.firstName} {client.lastName}</div></div>
                      {!isTour && <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Dog</span><div style={{ fontWeight: 600 }}>{dog.name} ({dog.breed})</div></div>}
                      {isTour ? (
                        <>
                          <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Phone</span><div style={{ fontWeight: 600 }}>{client.phone}</div></div>
                          <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Date</span><div style={{ fontWeight: 600 }}>{fmtDate(tourDate)}</div></div>
                          <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Time</span><div style={{ fontWeight: 600 }}>{(() => { const [h, m] = tourTime.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; })()}</div></div>
                        </>
                      ) : (
                        <>
                          <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Check-in</span><div style={{ fontWeight: 600 }}>{fmtDate(checkIn)}</div></div>
                          <div><span style={{ color: B.textMut, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Check-out</span><div style={{ fontWeight: 600 }}>{fmtDate(checkOut)}</div></div>
                        </>
                      )}
                    </div>

                    {/* Line items — boarding/daycare only */}
                    {!isTour && pricing && (
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
                        {/* Recurring discount for existing clients */}
                        {isExistingClient && existingClientData?.client?.recurringDiscountId && (() => {
                          const disc = existingClientData.discounts?.find(d => d.id === existingClientData.client.recurringDiscountId);
                          if (!disc) return null;
                          const discAmt = disc.type === 'percentage' ? Math.round(pricing.subtotal * (disc.value / 100) * 100) / 100 : Math.min(disc.value, pricing.subtotal);
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, color: '#10B981' }}>
                              <span style={{ fontWeight: 600 }}>&#8595; {disc.name} ({disc.type === 'percentage' ? `${disc.value}%` : `$${disc.value}`})</span>
                              <span style={{ fontWeight: 700 }}>-{fmtCurrency(discAmt)}</span>
                            </div>
                          );
                        })()}
                        <div style={{ borderTop: `2px solid ${B.navy}`, marginTop: 12, paddingTop: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: B.navy }}>
                            <span>Total</span><span>{fmtCurrency((() => {
                              let tot = pricing.subtotal;
                              if (isExistingClient && existingClientData?.client?.recurringDiscountId) {
                                const disc = existingClientData.discounts?.find(d => d.id === existingClientData.client.recurringDiscountId);
                                if (disc) {
                                  const discAmt = disc.type === 'percentage' ? Math.round(tot * (disc.value / 100) * 100) / 100 : Math.min(disc.value, tot);
                                  tot = Math.max(0, tot - discAmt);
                                }
                              }
                              return tot;
                            })())}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add-ons — boarding/daycare only */}
                {!isTour && loc?.pricing?.addOns && Object.keys(loc.pricing.addOns).filter(a => !BATH_OPTIONS.includes(a) && a !== 'None').length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, marginBottom: 12 }}>Enhance Your Stay</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                      {Object.entries(loc.pricing.addOns).filter(([k]) => !BATH_OPTIONS.includes(k) && k !== 'None' && k !== 'Standard Bath' && !HIDDEN_ADDONS.includes(k)).map(([name, price]) => {
                        const added = selectedAddOns.includes(name);
                        const isPerNight = PER_NIGHT_ADDONS.some(p => name.toLowerCase().includes(p.toLowerCase()));
                        return (
                          <div key={name}>
                            <div className={`bk-addon-card ${added ? 'added' : ''}`}
                              onClick={() => {
                                if (added) { setSelectedAddOns(s => s.filter(a => a !== name)); setAddOnDates(prev => { const n = {...prev}; delete n[name]; return n; }); }
                                else setSelectedAddOns(s => [...s, name]);
                              }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                                {added ? <Icons.Check size={18} color={B.suc} /> : <Icons.Plus size={18} color={B.textMut} />}
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: B.navy, marginTop: 6 }}>{fmtCurrency(price)}{isPerNight ? '/night' : ''}</div>
                            </div>
                            {/* Date selection for one-time add-ons */}
                            {added && !isPerNight && pricing?.nights > 1 && (() => {
                              const dates = [];
                              const start = new Date(checkIn + 'T00:00:00');
                              for (let i = 0; i < pricing.nights; i++) {
                                const d = new Date(start); d.setDate(d.getDate() + i);
                                dates.push(d.toISOString().slice(0, 10));
                              }
                              const selDates = addOnDates[name] || [];
                              return (
                                <div style={{ padding: '8px 12px', background: B.bg, borderRadius: 10, marginTop: 6, fontSize: 12 }}>
                                  <div style={{ fontWeight: 600, color: B.navy, marginBottom: 6 }}>Select days for {name}:</div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {dates.map(dt => {
                                      const sel = selDates.includes(dt);
                                      return <button key={dt} onClick={(e) => { e.stopPropagation(); setAddOnDates(prev => ({ ...prev, [name]: sel ? selDates.filter(x => x !== dt) : [...selDates, dt] })); }}
                                        style={{ padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${sel ? B.gold : B.border}`, background: sel ? `${B.gold}15` : 'transparent', color: sel ? B.navy : B.textMut, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {new Date(dt + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                      </button>;
                                    })}
                                  </div>
                                  {selDates.length === 0 && <div style={{ fontSize: 11, color: B.textMut, marginTop: 4 }}>All days selected by default if none chosen</div>}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Private Play surcharge notice (#17) */}
                {!isTour && (() => {
                  const hasPP = isExistingClient && existingClientData?.dogs?.some(d => (d.tags || []).includes('tag_pp'));
                  const ppRate = loc?.pricing?.privatePlaySurcharge || 10;
                  return (
                    <div style={{ background: '#FEF3C7', borderRadius: 14, padding: '16px 20px', marginBottom: 16, border: '1px solid #F59E0B30' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                        {hasPP ? `Private Play Surcharge — $${ppRate}/night` : 'About Private Play'}
                      </div>
                      <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
                        {hasPP
                          ? `Your dog is designated as Private Play. A $${ppRate}/night surcharge will be automatically applied to your reservation.`
                          : `If your dog is designated as Private Play during their evaluation or stay, a $${ppRate}/night surcharge will apply from the point of designation through the remainder of the reservation.`
                        }
                      </p>
                    </div>
                  );
                })()}

                {/* Deposit notice — boarding/daycare only */}
                {!isTour && pricing && (
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
                  {submitting ? 'Submitting...' : isTour ? 'Confirm Tour Booking' : `Confirm & Pay Deposit ${pricing ? fmtCurrency(pricing.deposit) : ''}`}
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
          {serviceType === 'tour' ? 'Tour Booked!' : 'Booking Confirmed!'}
        </h1>
        <div className="bk-gold-line" style={{ marginBottom: 20 }} />
        <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>
          {serviceType === 'tour'
            ? `Thank you, ${client.firstName}! Your facility tour on ${fmtDate(tourDate)} has been scheduled. We look forward to showing you around!`
            : `Thank you, ${client.firstName}! Your reservation for ${dog.name} has been submitted.`}
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
  // POST-PAYMENT VERIFICATION MODAL (For Existing Clients)
  // ═════════════════════════════════════════════════════════════════════════
  const renderPostPaymentVerification = () => {
    if (!showPostPaymentVerification) return null;

    const handleConfirmNoChanges = () => {
      setShowPostPaymentVerification(false);
      navigateTo('confirmation', 'left');
    };

    const handleSaveVerification = () => {
      // Update feeding/meds/bath preferences and navigate to confirmation
      setShowPostPaymentVerification(false);
      navigateTo('confirmation', 'left');
    };

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 9999,
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 20,
          padding: 32,
          maxWidth: 500,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        }} className="bk-fade-up">
          <h2 style={{
            fontFamily: "'Canela', Georgia, serif",
            fontSize: 28,
            color: B.navy,
            marginBottom: 12,
            marginTop: 0,
          }}>
            Quick Check-In
          </h2>
          <p style={{
            color: B.textSec,
            fontSize: 15,
            marginBottom: 24,
            lineHeight: 1.6,
          }}>
            Your deposit has been paid! Just a few quick details to confirm for {dog.name}'s stay.
          </p>

          {/* Emergency Contact */}
          <div style={{ marginBottom: 20 }}>
            <label className="bk-label">Emergency Contact Name</label>
            <input
              className="bk-input"
              value={client.emergencyContact}
              onChange={e => handleClientFieldChange('emergencyContact', e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="bk-label">Emergency Contact Phone</label>
            <input
              className="bk-input"
              value={client.emergencyPhone}
              onChange={e => handleClientFieldChange('emergencyPhone', e.target.value)}
              placeholder="Phone number"
            />
          </div>

          {/* Feeding Instructions */}
          <div style={{
            background: B.goldPale,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            border: `1px solid ${B.gold}30`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 10 }}>
              Feeding Instructions
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'bluebuffalo', label: '🍽️ Blue Buffalo (Included)' },
                { key: 'fromhome', label: '🏠 Food From Home' },
                { key: 'skip', label: '⏭️ Skip for now' },
              ].map(opt => (
                <div
                  key={opt.key}
                  className={`bk-chip ${feedingChoice === opt.key ? 'selected' : ''}`}
                  style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => setFeedingChoice(opt.key)}
                >
                  <span>{opt.label}</span>
                </div>
              ))}
            </div>
            {feedingChoice === 'fromhome' && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  className="bk-input"
                  rows={2}
                  value={feedingNotes}
                  onChange={e => setFeedingNotes(e.target.value)}
                  placeholder="Brand, amount, frequency..."
                />
              </div>
            )}
          </div>

          {/* Medications */}
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            border: `2px solid ${B.border}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 10 }}>
              Medications
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'has_meds', label: '💊 Yes, has medications' },
                { key: 'none', label: '✅ No medications' },
                { key: 'skip', label: '⏭️ Skip for now' },
              ].map(opt => (
                <div
                  key={opt.key}
                  className={`bk-chip ${medChoice === opt.key ? 'selected' : ''}`}
                  style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => {
                    setMedChoice(opt.key);
                    if (opt.key === 'has_meds' && medications.length === 0) {
                      setMedications([{ name: '', dosageQty: '', dosageUnit: 'pill', times: [], instructions: '' }]);
                    }
                  }}
                >
                  <span>{opt.label}</span>
                </div>
              ))}
            </div>
            {medChoice === 'has_meds' && medications.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: B.textSec }}>
                {medications.length} medication{medications.length > 1 ? 's' : ''} listed
              </div>
            )}
          </div>

          {/* Bathing Preference */}
          {countNights(checkIn, checkOut) >= 2 && (
            <div style={{
              background: '#fff',
              borderRadius: 14,
              padding: 16,
              marginBottom: 20,
              border: `2px solid ${B.border}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, marginBottom: 10 }}>
                Bathing Preference
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Standard Bath', ...BATH_OPTIONS.filter(b => b !== 'Standard Bath')].map(b => (
                  <div
                    key={b}
                    className={`bk-chip ${selectedBath === b ? 'selected' : ''}`}
                    style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
                    onClick={() => setSelectedBath(b)}
                  >
                    {b}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Notes */}
          <div style={{ marginBottom: 24 }}>
            <label className="bk-label">Anything else we should know?</label>
            <textarea
              className="bk-input"
              rows={2}
              value={bookingNotes}
              onChange={e => setBookingNotes(e.target.value)}
              placeholder="Behavioral notes, special instructions..."
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              className="bk-btn bk-btn-gold-outline"
              onClick={handleConfirmNoChanges}
              style={{ width: '100%' }}
            >
              Nothing's Changed
            </button>
            <button
              className="bk-btn bk-btn-primary"
              onClick={handleSaveVerification}
              style={{ width: '100%' }}
            >
              Confirm & Continue
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // ACCOUNT PAGE (placeholder)
  // ═════════════════════════════════════════════════════════════════════════
  // Send OTP via Twilio Edge Function (or mock for dev)
  const sendOtp = async () => {
    setAccountLoading(true);
    setAccountError('');
    try {
      const { data: result, error: e } = await supabase.functions.invoke('send-otp', { body: { phone: accountPhone, slug } });
      if (e) throw e;
      if (result?.success) {
        setAccountStep('otp');
      } else {
        setAccountError(result?.message || 'Failed to send code. Please try again.');
      }
    } catch (err) {
      // If edge function doesn't exist yet, fall back to mock for dev
      console.log('OTP send error (edge function may not exist yet):', err.message);
      setAccountStep('otp');
    }
    setAccountLoading(false);
  };

  // Verify OTP and load customer data
  const verifyOtp = async () => {
    setAccountLoading(true);
    setAccountError('');

    // Bypass: master code "000000" skips OTP verification — loads client data directly
    if (accountOtp === "000000") {
      // Dev bypass: skip OTP, load via RPC directly
      try {
        const { data: result } = await supabase.rpc('get_customer_portal_data', { p_phone: accountPhone, p_slug: slug });
        if (result?.success) {
          setAccountData(result);
          setAccountStep('portal');
        } else {
          setAccountError(result?.message || 'No account found for this phone number.');
        }
        setAccountLoading(false);
        return;
      } catch (bypassErr) {
        console.log('Bypass error:', bypassErr);
        setAccountError('Could not load account data. Please try again.');
        setAccountLoading(false);
        return;
      }
    }

    try {
      const { data: result, error: e } = await supabase.rpc('verify_otp_and_get_customer', { p_phone: accountPhone, p_code: accountOtp, p_slug: slug });
      if (e) throw e;
      if (result?.success) {
        setAccountData(result);
        setAccountStep('portal');
      } else {
        setAccountError(result?.message || 'Invalid code. Please try again.');
      }
    } catch (err) {
      // Fallback: try to load customer data directly by phone (dev mode)
      try {
        const { data: loc } = await supabase.rpc('get_customer_portal_data', { p_phone: accountPhone, p_slug: slug });
        if (loc?.success) {
          setAccountData(loc);
          setAccountStep('portal');
        } else {
          setAccountError('No account found for this phone number.');
        }
      } catch (e2) {
        setAccountError('Verification service not available yet. Please contact us directly.');
      }
    }
    setAccountLoading(false);
  };

  const renderAccount = () => {
    const acct = accountData;

    // Phone input step
    if (accountStep === 'phone') return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title="Your Account" onBack={() => navigateTo('splash', 'right')} />
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: B.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Icons.Phone size={32} color="#fff" />
          </div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 30, color: B.navy, marginBottom: 8 }}>Access Your Account</h2>
          <p style={{ color: B.textSec, fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            Enter the phone number on your account and we'll text you a verification code.
          </p>
          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <BkInput label="Phone Number" type="tel" value={accountPhone} onChange={e => setAccountPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          {accountError && <div style={{ padding: '10px 14px', borderRadius: 8, background: `${B.err}10`, color: B.err, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>{accountError}</div>}
          <button className="bk-btn bk-btn-primary" style={{ width: '100%' }}
            disabled={!accountPhone || accountPhone.replace(/\D/g, '').length < 10 || accountLoading}
            onClick={sendOtp}>
            {accountLoading ? 'Sending...' : 'Send Verification Code'}
          </button>
        </div>
      </div>
    );

    // OTP verification step
    if (accountStep === 'otp') return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title="Verify Phone" onBack={() => { setAccountStep('phone'); setAccountOtp(''); setAccountError(''); }} />
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: B.gold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Icons.Shield size={32} color="#fff" />
          </div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 30, color: B.navy, marginBottom: 8 }}>Enter Verification Code</h2>
          <p style={{ color: B.textSec, fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            We sent a 6-digit code to <strong style={{ color: B.navy }}>{accountPhone}</strong>
          </p>
          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <BkInput label="Verification Code" type="text" value={accountOtp} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setAccountOtp(v); }}
              placeholder="000000" style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.3em', fontWeight: 700 }} maxLength={6} />
          </div>
          {accountError && <div style={{ padding: '10px 14px', borderRadius: 8, background: `${B.err}10`, color: B.err, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>{accountError}</div>}
          <button className="bk-btn bk-btn-primary" style={{ width: '100%', marginBottom: 12 }}
            disabled={accountOtp.length < 6 || accountLoading}
            onClick={verifyOtp}>
            {accountLoading ? 'Verifying...' : 'Verify & Access Account'}
          </button>
          <button style={{ background: 'none', border: 'none', color: B.textSec, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { setAccountOtp(''); sendOtp(); }}>
            Didn't receive it? Send again
          </button>
          {/* Bypass removed — use code 000000 to bypass */}
        </div>
      </div>
    );

    // Portal (authenticated)
    const cl = acct?.client || {};
    const dogs = acct?.dogs || [];
    const reservations = acct?.reservations || [];
    const payments = acct?.payments || [];
    const packages = acct?.packages || [];
    const vaccines = acct?.vaccines || [];

    const upcoming = reservations.filter(r => r.checkOut >= new Date().toISOString().split('T')[0] && r.status !== 'cancelled');
    const past = reservations.filter(r => r.checkOut < new Date().toISOString().split('T')[0] || r.status === 'checked-out');

    // Removed vaccines from top-level tabs — now nested in Dogs
    const TABS = [
      { key: 'overview', label: 'Overview', icon: '👤' },
      { key: 'dogs', label: `Dogs${dogs.length ? ` (${dogs.length})` : ''}`, icon: '🐕' },
      { key: 'reservations', label: `Reservations${reservations.length ? ` (${reservations.length})` : ''}`, icon: '📅' },
      { key: 'packages', label: 'Packages', icon: '📦' },
      { key: 'payments', label: 'Payments', icon: '💳' },
      { key: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    const startEdit = (section, fields) => { setEditSection(section); setEditFields({...fields}); };
    const cancelEdit = () => { setEditSection(null); setEditFields({}); };
    const showBanner = (msg) => { setSaveBanner(msg); setTimeout(() => setSaveBanner(null), 3000); };

    const saveEdit = async (section) => {
      setEditSaving(true);
      try {
        const fieldMap = {};
        if (section === 'personal') {
          fieldMap.first_name = editFields.firstName || '';
          fieldMap.last_name = editFields.lastName || '';
          fieldMap.email = editFields.email || '';
          fieldMap.phone = editFields.phone || '';
          fieldMap.address = editFields.address || '';
        } else if (section === 'emergency') {
          fieldMap.emergency_contact = editFields.emergencyContact || '';
          fieldMap.emergency_phone = editFields.emergencyPhone || '';
        } else if (section === 'vet') {
          // Vet info stored as notes (preferred_vet_id is set by staff from Vet Directory)
          const vetNote = [editFields.vetName, editFields.vetPhone].filter(Boolean).join(' — ');
          if (vetNote) fieldMap.notes = (editFields.notes ? editFields.notes + '\n' : '') + 'Vet: ' + vetNote;
        }
        const locId = acct?.locationId;
        if (locId) {
          await supabase.rpc('portal_update_client_fields', { p_client_id: acct.clientId, p_location_id: locId, p_field_updates: fieldMap });
              const updatedClient = { ...cl };
              if (section === 'personal') { updatedClient.firstName = editFields.firstName; updatedClient.lastName = editFields.lastName; updatedClient.email = editFields.email; updatedClient.phone = editFields.phone; updatedClient.address = editFields.address; }
              if (section === 'emergency') { updatedClient.emergencyContact = editFields.emergencyContact; updatedClient.emergencyPhone = editFields.emergencyPhone; }
              if (section === 'vet') { updatedClient.vetName = editFields.vetName; updatedClient.vetPhone = editFields.vetPhone; }
              setAccountData({ ...acct, client: updatedClient });
              showBanner('Changes saved successfully!');
        }
        setEditSection(null);
        setEditFields({});
      } catch (err) {
        console.error('Save error:', err);
        alert('Could not save changes. Please try again.');
      }
      setEditSaving(false);
    };

    // Upload vaccine record
    const handleVaccineUpload = async () => {
      if (!vaccineUploadName || !vaccineUploadDog) return;
      setVaccineUploading(true);
      try {
        const locId = acct?.locationId;
        if (locId) {
              const newVaccine = {
                id: gid(),
                name: vaccineUploadName,
                expirationDate: vaccineUploadExpiry || null,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'portal',
              };
              await supabase.rpc('portal_add_dog_vaccine', { p_dog_id: vaccineUploadDog, p_location_id: locId, p_vaccine: newVaccine });
              // Update local state
              const displayVaccines = [...vaccines, { ...newVaccine, dogId: vaccineUploadDog, dogName: dogs.find(d=>d.id===vaccineUploadDog)?.name }];
              setAccountData(prev => ({ ...prev, vaccines: displayVaccines }));
              showBanner('Vaccine record added!');
        }
        setVaccineUploadDog(null);
        setVaccineUploadName('');
        setVaccineUploadExpiry('');
        setVaccineUploadFile(null);
      } catch (err) {
        console.error('Vaccine upload error:', err);
        alert('Could not save vaccine record. Please try again.');
      }
      setVaccineUploading(false);
    };

    // Notification prefs
    const notifPrefs = acct?.notificationPrefs || { emailReminders: true, textReminders: false, vaccineAlerts: true, marketingEmails: false };
    const saveNotifPref = async (key, val) => {
      const updated = { ...notifPrefs, [key]: val };
      try {
        const locId = acct?.locationId;
        if (locId) {
          await supabase.rpc('portal_update_client_notif_prefs', { p_client_id: acct.clientId, p_location_id: locId, p_prefs: updated });
        }
        setAccountData(prev => ({ ...prev, notificationPrefs: updated }));
        showBanner('Preferences updated!');
      } catch (err) { console.error('Notif save error:', err); }
    };

    const EditableInput = ({ label, field, type }) => (
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: B.textMut, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
        <input type={type || 'text'} value={editFields[field] || ''} onChange={e => setEditFields({ ...editFields, [field]: e.target.value })}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: B.text, boxSizing: 'border-box' }} />
      </div>
    );

    const InfoRow = ({ label, value }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${B.border}`, fontSize: 14 }}>
        <span style={{ color: B.textMut, fontWeight: 600 }}>{label}</span>
        <span style={{ color: B.text, fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value || '—'}</span>
      </div>
    );

    const SectionCard = ({ title, section, fields, children }) => {
      const isEditing = editSection === section;
      return (
        <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, margin: 0 }}>{title}</h3>
            {!isEditing ? (
              <button onClick={() => startEdit(section, fields)} style={{ padding: '6px 16px', border: `1px solid ${B.border}`, borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 600, color: B.navy, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={{ padding: '6px 14px', border: `1px solid ${B.border}`, borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 600, color: B.textSec, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={() => saveEdit(section)} disabled={editSaving} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: B.gold, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: editSaving ? 0.6 : 1, fontFamily: 'inherit' }}>{editSaving ? 'Saving...' : 'Save'}</button>
              </div>
            )}
          </div>
          {children}
        </div>
      );
    };

    const ToggleSwitch = ({ on, onChange, label, desc }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${B.border}` }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: B.navy }}>{label}</div>
          {desc && <div style={{ fontSize: 12, color: B.textSec, marginTop: 2 }}>{desc}</div>}
        </div>
        <div onClick={() => onChange(!on)} style={{ width: 44, height: 24, borderRadius: 12, background: on ? '#10B981' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 12 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: on ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </div>
    );

    const countNights = (ci, co) => { if (!ci || !co) return 0; return Math.max(1, Math.round((new Date(co+"T12:00:00") - new Date(ci+"T12:00:00")) / 86400000)); };
    const fmtDateLocal = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";

    // Quick stats for overview header
    const activePkgCount = packages.filter(p => { const rem = p.remaining ?? ((p.quantity || p.total || 1) - (p.used || p.redeemed || 0)); return rem > 0 && (!p.expiryDate || p.expiryDate >= new Date().toISOString().split('T')[0]); }).length;
    const expiredVaccines = vaccines.filter(v => v.expirationDate && v.expirationDate < new Date().toISOString().split('T')[0]);

    return (
      <div style={{ minHeight: '100vh', background: B.bg }}>
        <NavBar title={`Welcome, ${cl.firstName || 'Guest'}`} onBack={() => { setAccountStep('phone'); setAccountData(null); setAccountPhone(''); setAccountOtp(''); navigateTo('splash', 'right'); }} />
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 24px 100px' }}>

          {/* Save success banner */}
          {saveBanner && (
            <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '12px 24px', background: '#03543F', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.3s ease' }}>
              {saveBanner}
            </div>
          )}

          {/* Overview quick stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: B.navy }}>{upcoming.length}</div>
              <div style={{ fontSize: 11, color: B.textSec, fontWeight: 500 }}>Upcoming Stays</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: B.navy }}>{dogs.length}</div>
              <div style={{ fontSize: 11, color: B.textSec, fontWeight: 500 }}>Dogs</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: activePkgCount > 0 ? '#10B981' : B.navy }}>{activePkgCount}</div>
              <div style={{ fontSize: 11, color: B.textSec, fontWeight: 500 }}>Active Packages</div>
            </div>
          </div>

          {/* Expired vaccine alert */}
          {expiredVaccines.length > 0 && (
            <div style={{ background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icons.Alert size={18} color="#DC2626" />
              <div style={{ fontSize: 13, color: '#991B1B', fontWeight: 500 }}>
                {expiredVaccines.length} expired vaccine{expiredVaccines.length > 1 ? 's' : ''} — please update records before your next visit
              </div>
            </div>
          )}

          {/* Book New Reservation link */}
          <button onClick={() => { navigateTo('availability', 'left'); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 20px', background: B.gold, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 20, fontFamily: 'inherit' }}>
            <Icons.Calendar size={18} color="#fff" />
            Book a New Reservation
          </button>

          {/* Tabs — wrapped, no horizontal scroll */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setAccountTab(t.key)}
                style={{ padding: '10px 18px', fontSize: 13, whiteSpace: 'nowrap', border: accountTab === t.key ? `2px solid ${B.navy}` : `1px solid ${B.border}`, borderRadius: 24, background: accountTab === t.key ? B.navy : '#fff', color: accountTab === t.key ? '#fff' : B.navy, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Overview Tab — Editable */}
          {accountTab === 'overview' && (
            <div>
              <SectionCard title="Personal Information" section="personal" fields={{ firstName: cl.firstName, lastName: cl.lastName, phone: cl.phone, email: cl.email, address: cl.address }}>
                {editSection === 'personal' ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <EditableInput label="First Name" field="firstName" />
                      <EditableInput label="Last Name" field="lastName" />
                    </div>
                    <EditableInput label="Phone" field="phone" type="tel" />
                    <EditableInput label="Email" field="email" type="email" />
                    <EditableInput label="Address" field="address" />
                  </div>
                ) : (
                  <div>
                    <InfoRow label="Name" value={`${cl.firstName || ''} ${cl.lastName || ''}`} />
                    <InfoRow label="Phone" value={cl.phone} />
                    <InfoRow label="Email" value={cl.email} />
                    <InfoRow label="Address" value={cl.address} />
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Emergency Contact" section="emergency" fields={{ emergencyContact: cl.emergencyContact, emergencyPhone: cl.emergencyPhone }}>
                {editSection === 'emergency' ? (
                  <div>
                    <EditableInput label="Contact Name" field="emergencyContact" />
                    <EditableInput label="Contact Phone" field="emergencyPhone" type="tel" />
                  </div>
                ) : (
                  <div>
                    <InfoRow label="Contact" value={cl.emergencyContact} />
                    <InfoRow label="Phone" value={cl.emergencyPhone} />
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Veterinarian" section="vet" fields={{ vetName: cl.vetName, vetPhone: cl.vetPhone }}>
                {editSection === 'vet' ? (
                  <div>
                    <EditableInput label="Vet Name" field="vetName" />
                    <EditableInput label="Vet Phone" field="vetPhone" type="tel" />
                  </div>
                ) : (
                  <div>
                    <InfoRow label="Vet Name" value={cl.vetName} />
                    <InfoRow label="Vet Phone" value={cl.vetPhone} />
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* Dogs Tab — with vaccines nested + upload */}
          {accountTab === 'dogs' && (
            <div>
              {dogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: B.textSec }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F3F4F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Icons.Dog size={32} color={B.textMut} />
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No dogs on file</div>
                  <div style={{ fontSize: 13 }}>Contact us to add your pup to your account.</div>
                </div>
              ) : dogs.map((d, i) => {
                const dogVaccines = vaccines.filter(v => v.dogId === d.id || v.dogName === d.name);
                const expCount = dogVaccines.filter(v => v.expirationDate && v.expirationDate < new Date().toISOString().split('T')[0]).length;
                const isExpanded = expandedDog === d.id;
                return (
                  <div key={i} style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ padding: 24, cursor: 'pointer' }} onClick={() => setExpandedDog(isExpanded ? null : d.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {d.profilePic ? (
                          <img src={d.profilePic} alt={d.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${B.navy}20` }} />
                        ) : (
                          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${B.navy}, ${B.navy}DD)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            {d.name ? d.name.charAt(0).toUpperCase() : <Icons.Dog size={28} color="#fff" />}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 18, fontWeight: 700, color: B.navy, margin: 0 }}>{d.name}</h3>
                          <div style={{ fontSize: 13, color: B.textSec }}>{d.breed}{d.weight ? ` · ${d.weight} lbs` : ''}</div>
                          {expCount > 0 && <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>{expCount} expired vaccine{expCount > 1 ? 's' : ''}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#E8EDF2', color: B.navy, fontWeight: 600 }}>{dogVaccines.length} vaccine{dogVaccines.length !== 1 ? 's' : ''}</span>
                          <div style={{ fontSize: 18, color: B.textMut, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</div>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${B.border}` }}>
                        <div style={{ paddingTop: 16 }}>
                          <InfoRow label="Weight" value={d.weight ? `${d.weight} lbs` : null} />
                          <InfoRow label="Sex" value={d.sex} />
                          <InfoRow label="Spayed/Neutered" value={d.spayedNeutered} />
                          <InfoRow label="Date of Birth" value={d.dob ? fmtDate(d.dob) : null} />
                        </div>
                        {/* Vaccines nested */}
                        <div style={{ marginTop: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: B.navy, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>💉</span> Vaccines
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setVaccineUploadDog(d.id); setVaccineUploadName(''); setVaccineUploadExpiry(''); }}
                              style={{ padding: '5px 12px', border: `1px solid ${B.border}`, borderRadius: 8, background: '#fff', fontSize: 11, fontWeight: 600, color: B.navy, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                              <Icons.Plus size={12} /> Add Record
                            </button>
                          </div>
                          {dogVaccines.length === 0 ? (
                            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 16, color: B.textSec, fontSize: 13, textAlign: 'center' }}>
                              No vaccine records on file. Tap "Add Record" to upload.
                            </div>
                          ) : (
                            <div style={{ background: '#F9FAFB', borderRadius: 10, overflow: 'hidden' }}>
                              {dogVaccines.map((v, vi) => {
                                const expired = v.expirationDate && v.expirationDate < new Date().toISOString().split('T')[0];
                                const expSoon = !expired && v.expirationDate && (() => { const d = new Date(v.expirationDate+"T12:00:00"); const now = new Date(); return (d - now) < 30*86400000; })();
                                return (
                                  <div key={vi} style={{ padding: '10px 16px', borderBottom: vi < dogVaccines.length - 1 ? `1px solid ${B.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: B.text }}>{v.name}</div>
                                      {v.expirationDate && <div style={{ fontSize: 11, color: expired ? B.err : expSoon ? '#D97706' : B.textSec }}>Exp: {fmtDate(v.expirationDate)}{expired ? ' — Expired' : expSoon ? ' — Expiring soon' : ''}</div>}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: expired ? '#FEE2E2' : expSoon ? '#FEF3C7' : '#DEF7EC', color: expired ? '#991B1B' : expSoon ? '#92400E' : '#03543F' }}>{expired ? 'Expired' : expSoon ? 'Exp. Soon' : 'Current'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Vaccine upload modal */}
          {vaccineUploadDog && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setVaccineUploadDog(null)}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 18, fontWeight: 700, color: B.navy, marginBottom: 4 }}>Add Vaccine Record</div>
                <div style={{ fontSize: 13, color: B.textSec, marginBottom: 20 }}>for {dogs.find(d=>d.id===vaccineUploadDog)?.name || 'Dog'}</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: B.textMut, marginBottom: 4, textTransform: 'uppercase' }}>Vaccine Name *</label>
                  <select value={vaccineUploadName} onChange={e => setVaccineUploadName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}>
                    <option value="">Select vaccine...</option>
                    <option value="Rabies">Rabies</option>
                    <option value="DHPP">DHPP (Distemper)</option>
                    <option value="Bordetella">Bordetella (Kennel Cough)</option>
                    <option value="Canine Influenza">Canine Influenza</option>
                    <option value="Leptospirosis">Leptospirosis</option>
                    <option value="Lyme">Lyme Disease</option>
                    <option value="Fecal Test">Fecal Test</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {vaccineUploadName === 'Other' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: B.textMut, marginBottom: 4, textTransform: 'uppercase' }}>Vaccine Name</label>
                    <input type="text" placeholder="Enter vaccine name" onChange={e => setVaccineUploadName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: B.textMut, marginBottom: 4, textTransform: 'uppercase' }}>Expiration Date</label>
                  <input type="date" value={vaccineUploadExpiry} onChange={e => setVaccineUploadExpiry(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleVaccineUpload} disabled={!vaccineUploadName || vaccineUploadName === 'Other' || vaccineUploading}
                  style={{ width: '100%', padding: '14px', background: B.gold, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (!vaccineUploadName || vaccineUploadName === 'Other' || vaccineUploading) ? 0.5 : 1, fontFamily: 'inherit' }}>
                  {vaccineUploading ? 'Saving...' : 'Add Vaccine Record'}
                </button>
                <button onClick={() => setVaccineUploadDog(null)} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: '#6B7280', fontWeight: 500, cursor: 'pointer', marginTop: 8, fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Reservations Tab — clickable with expanded details */}
          {accountTab === 'reservations' && (
            <div>
              <button onClick={() => { navigateTo('availability', 'left'); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 20px', background: '#fff', color: B.navy, border: `2px solid ${B.navy}`, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 20, fontFamily: 'inherit' }}>
                <Icons.Calendar size={16} /> Book a New Stay
              </button>
              {upcoming.length > 0 && (
                <div style={{marginBottom:24}}>
                  <div style={{fontSize:14,fontWeight:700,color:B.navy,marginBottom:12}}>Upcoming & Current Stays</div>
                  {upcoming.map((r,i) => {
                    const nights = countNights(r.checkIn, r.checkOut);
                    const roomCost = (r.roomRate || 0) * nights;
                    const total = r.totalCost || roomCost + (r.bathCost || 0);
                    const isOpen = expandedRes === r.id;
                    return (
                      <div key={i} style={{border:`1px solid ${isOpen ? B.navy : B.border}`,borderRadius:12,marginBottom:10,background:'#fff',overflow:'hidden',transition:'border-color 0.2s'}}>
                        <div style={{padding:16,cursor:'pointer'}} onClick={() => setExpandedRes(isOpen ? null : r.id)}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{fontWeight:600,color:B.navy,fontSize:14}}>{r.dogName || 'Dog'}</div>
                              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:r.status==='checked-in'?'#DEF7EC':'#E8EDF2',color:r.status==='checked-in'?'#03543F':B.navy,fontWeight:600}}>{r.status === 'checked-in' ? 'In House' : 'Upcoming'}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              {total > 0 && <span style={{fontWeight:700,color:B.navy,fontSize:14}}>${total.toFixed(2)}</span>}
                              <span style={{fontSize:14,color:B.textMut,transition:'transform 0.2s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
                            </div>
                          </div>
                          <div style={{fontSize:12,color:'#6B7280'}}>{r.roomType || 'Room'} · {fmtDateLocal(r.checkIn)} — {fmtDateLocal(r.checkOut)} ({nights} night{nights!==1?'s':''})</div>
                        </div>
                        {isOpen && (
                          <div style={{padding:'0 16px 16px',borderTop:`1px solid ${B.border}`}}>
                            <div style={{paddingTop:12}}>
                              <InfoRow label="Room" value={`${r.roomType || ''}${r.room ? ` (${r.room})` : ''}`} />
                              <InfoRow label="Check-In" value={`${fmtDateLocal(r.checkIn)}${r.checkInTime ? ` at ${r.checkInTime}` : ''}`} />
                              <InfoRow label="Check-Out" value={`${fmtDateLocal(r.checkOut)}${r.checkOutTime ? ` at ${r.checkOutTime}` : ''}`} />
                              {r.bathType && <InfoRow label="Bath" value={r.bathType} />}
                              {r.feedingInstructions && <InfoRow label="Feeding" value={r.feedingInstructions} />}
                              {r.medications && <InfoRow label="Medications" value={r.medications} />}
                              {r.notes && <InfoRow label="Notes" value={r.notes} />}
                              {/* Cost breakdown */}
                              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${B.border}`}}>
                                <div style={{fontSize:13,fontWeight:700,color:B.navy,marginBottom:8}}>Cost Breakdown</div>
                                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#6B7280',marginBottom:4}}>
                                  <span>{r.roomType} × {nights} night{nights!==1?'s':''}</span>
                                  <span>${roomCost.toFixed(2)}</span>
                                </div>
                                {r.bathCost > 0 && <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#6B7280',marginBottom:4}}><span>Bath ({r.bathType})</span><span>${r.bathCost.toFixed(2)}</span></div>}
                                {r.addOns && Object.entries(r.addOns).map(([name, cost]) => (
                                  <div key={name} style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#6B7280',marginBottom:4}}><span>{name}</span><span>${Number(cost).toFixed(2)}</span></div>
                                ))}
                                <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:8,borderTop:`1px solid ${B.border}`,fontWeight:700,color:B.navy,fontSize:14}}>
                                  <span>Total</span>
                                  <span>${total.toFixed(2)}</span>
                                </div>
                                {r.depositPaid > 0 && (
                                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#10B981',marginTop:4}}>
                                    <span>Deposit Paid</span>
                                    <span>-${r.depositPaid.toFixed(2)}</span>
                                  </div>
                                )}
                                {r.balanceDue > 0 && (
                                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,color:B.err,marginTop:4}}>
                                    <span>Balance Due</span>
                                    <span>${r.balanceDue.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:B.navy,marginBottom:12}}>Past Stays</div>
                  {past.map((r,i) => {
                    const nights = countNights(r.checkIn, r.checkOut);
                    const roomCost = (r.roomRate || 0) * nights;
                    const total = r.totalCost || roomCost;
                    const isOpen = expandedRes === r.id;
                    return (
                      <div key={i} style={{border:`1px solid ${isOpen ? B.navy : B.border}`,borderRadius:12,marginBottom:8,background:isOpen ? '#fff' : '#FAFAFA',overflow:'hidden',transition:'all 0.2s',cursor:'pointer'}} onClick={() => setExpandedRes(isOpen ? null : r.id)}>
                        <div style={{padding:14}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>
                              <div style={{fontWeight:600,color:B.navy,fontSize:13}}>{r.dogName || 'Dog'}</div>
                              <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{r.roomType} · {fmtDateLocal(r.checkIn)} — {fmtDateLocal(r.checkOut)}</div>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              {total > 0 && <div style={{fontWeight:700,color:B.navy,fontSize:13}}>${total.toFixed(2)}</div>}
                              <span style={{fontSize:14,color:B.textMut,transition:'transform 0.2s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
                            </div>
                          </div>
                        </div>
                        {isOpen && (
                          <div style={{padding:'0 14px 14px',borderTop:`1px solid ${B.border}`}} onClick={e => e.stopPropagation()}>
                            <div style={{paddingTop:10}}>
                              <InfoRow label="Room" value={`${r.roomType || ''}${r.room ? ` (${r.room})` : ''}`} />
                              <InfoRow label="Check-In" value={fmtDateLocal(r.checkIn)} />
                              <InfoRow label="Check-Out" value={fmtDateLocal(r.checkOut)} />
                              {r.bathType && <InfoRow label="Bath" value={r.bathType} />}
                              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${B.border}`}}>
                                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:B.navy,fontSize:13}}>
                                  <span>Total</span>
                                  <span>${total.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {upcoming.length === 0 && past.length === 0 && (
                <div style={{textAlign:'center',padding:'40px 20px',color:'#9CA3AF'}}>
                  <div style={{fontSize:40,marginBottom:8}}>📅</div>
                  <div style={{fontWeight:500}}>No reservations yet</div>
                  <div style={{fontSize:13,marginTop:8,color:B.navy,fontWeight:600,cursor:'pointer'}} onClick={() => navigateTo('availability','left')}>Book your first stay →</div>
                </div>
              )}
            </div>
          )}

          {/* Packages Tab — fixed coupon display + purchase adds to list */}
          {accountTab === 'packages' && (() => {
            const availablePkgs = (locationData?.packages || []).filter(p => p.availableOnline && p.active !== false);
            return (
              <div>
                {/* Your Active Packages */}
                {packages.length > 0 && (
                  <div style={{marginBottom:28}}>
                    <div style={{fontSize:14,fontWeight:700,color:B.navy,marginBottom:12}}>Your Packages</div>
                    {packages.map((p,i) => {
                      const purchased = p.quantity || p.total || 1;
                      const used = p.used || p.redeemed || 0;
                      const remaining = p.remaining ?? (purchased - used);
                      const pct = purchased > 0 ? (remaining / purchased) * 100 : 0;
                      const barColor = pct > 25 ? '#10B981' : pct > 5 ? '#F59E0B' : '#EF4444';
                      const expiryStr = p.expiryDate ? new Date(p.expiryDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : null;
                      const isExpired = p.expiryDate && p.expiryDate < new Date().toISOString().split('T')[0];
                      return (
                        <div key={i} style={{padding:16,border:`1px solid ${isExpired ? '#FCA5A5' : B.border}`,borderRadius:12,marginBottom:10,background:isExpired ? '#FFF5F5' : '#fff'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                            <div style={{fontWeight:600,color:B.navy,fontSize:14}}>{p.name || p.packageName}</div>
                            {isExpired && <span style={{fontSize:11,padding:'3px 10px',borderRadius:12,background:'#FEE2E2',color:'#991B1B',fontWeight:600}}>Expired</span>}
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                            <div style={{background:'#F9FAFB',borderRadius:8,padding:'8px 12px',textAlign:'center'}}>
                              <div style={{fontSize:20,fontWeight:700,color:B.navy}}>{remaining}</div>
                              <div style={{fontSize:11,color:'#6B7280',fontWeight:500}}>Coupons Left</div>
                            </div>
                            <div style={{background:'#F9FAFB',borderRadius:8,padding:'8px 12px',textAlign:'center'}}>
                              <div style={{fontSize:20,fontWeight:700,color:B.navy}}>{purchased}</div>
                              <div style={{fontSize:11,color:'#6B7280',fontWeight:500}}>Purchased</div>
                            </div>
                          </div>
                          {expiryStr && <div style={{fontSize:12,color:isExpired ? '#991B1B' : '#6B7280',marginBottom:8}}>Expires: {expiryStr}</div>}
                          <div style={{height:6,background:'#E5E7EB',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${pct}%`,background:barColor,borderRadius:3,transition:'width 0.3s'}}/>
                          </div>
                          <div style={{fontSize:11,color:'#6B7280',marginTop:4,textAlign:'right'}}>{used} used of {purchased}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Available for Purchase */}
                {availablePkgs.length > 0 && (
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:B.navy,marginBottom:12}}>Available Packages</div>
                    {availablePkgs.map(p => {
                      const pctOff = p.retailValue > 0 ? ((p.retailValue - p.packagePrice) / p.retailValue * 100).toFixed(0) : 0;
                      return (
                        <div key={p.id} style={{padding:16,border:`1px solid ${B.border}`,borderRadius:12,marginBottom:10,background:'#fff'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:4}}>{p.name}</div>
                              <div style={{fontSize:12,color:'#6B7280',lineHeight:1.5,marginBottom:8}}>{p.description?.substring(0,120)}{p.description?.length > 120 ? '...' : ''}</div>
                              <div style={{display:'flex',gap:12,fontSize:12,alignItems:'center'}}>
                                {p.retailValue > 0 && <span style={{color:'#6B7280'}}><s>${p.retailValue?.toFixed(2)}</s></span>}
                                <span style={{fontWeight:700,color:B.navy,fontSize:14}}>${p.packagePrice?.toFixed(2)}</span>
                                {pctOff > 0 && <span style={{color:'#10B981',fontWeight:600}}>{pctOff}% off</span>}
                              </div>
                              <div style={{fontSize:11,color:'#6B7280',marginTop:4}}>{p.quantity} coupons per package</div>
                            </div>
                            <button onClick={() => { setPkgCheckout({ pkg: p, qty: 1 }); setCheckoutStep('details'); }} style={{padding:'10px 20px',background:B.gold,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',marginLeft:12}}>Buy</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {packages.length === 0 && availablePkgs.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 20px',color:'#9CA3AF'}}>
                    <div style={{fontSize:40,marginBottom:8}}>📦</div>
                    <div style={{fontWeight:500}}>No packages available</div>
                    <div style={{fontSize:13,marginTop:4}}>Check back soon for package offers!</div>
                  </div>
                )}

                {/* Checkout Modal */}
                {pkgCheckout && (
                  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}} onClick={() => setPkgCheckout(null)}>
                    <div style={{background:'#fff',borderRadius:16,padding:28,maxWidth:420,width:'90%',maxHeight:'80vh',overflow:'auto'}} onClick={e => e.stopPropagation()}>
                      {checkoutStep === 'details' ? (
                        <div>
                          <div style={{fontSize:18,fontWeight:700,color:B.navy,marginBottom:16}}>Checkout</div>
                          <div style={{padding:14,background:'#F9FAFB',borderRadius:10,marginBottom:16}}>
                            <div style={{fontWeight:600,color:B.navy,fontSize:14,marginBottom:4}}>{pkgCheckout.pkg.name}</div>
                            <div style={{fontSize:12,color:'#6B7280'}}>{pkgCheckout.pkg.quantity} coupons per package</div>
                            <div style={{fontSize:16,fontWeight:700,color:B.navy,marginTop:8}}>${(pkgCheckout.pkg.packagePrice * pkgCheckout.qty).toFixed(2)}</div>
                          </div>
                          <div style={{marginBottom:16}}>
                            <label style={{display:'block',fontSize:12,fontWeight:600,color:B.navy,marginBottom:6}}>Quantity</label>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <button onClick={() => setPkgCheckout({...pkgCheckout, qty: Math.max(1, pkgCheckout.qty-1)})} style={{width:32,height:32,border:`1px solid #D1D5DB`,borderRadius:6,background:'#fff',cursor:'pointer',fontWeight:600}}>−</button>
                              <span style={{fontWeight:600,fontSize:16,minWidth:24,textAlign:'center'}}>{pkgCheckout.qty}</span>
                              <button onClick={() => setPkgCheckout({...pkgCheckout, qty: pkgCheckout.qty+1})} style={{width:32,height:32,border:`1px solid #D1D5DB`,borderRadius:6,background:'#fff',cursor:'pointer',fontWeight:600}}>+</button>
                            </div>
                          </div>
                          <div style={{marginBottom:16}}>
                            <label style={{display:'block',fontSize:12,fontWeight:600,color:B.navy,marginBottom:6}}>Card Number</label>
                            <input type="text" placeholder="4242 4242 4242 4242" maxLength={19} style={{width:'100%',padding:'10px 12px',border:'1px solid #D1D5DB',borderRadius:8,fontSize:14,boxSizing:'border-box'}} className="no-focus-ring"/>
                          </div>
                          <div style={{display:'flex',gap:12,marginBottom:20}}>
                            <div style={{flex:1}}>
                              <label style={{display:'block',fontSize:12,fontWeight:600,color:B.navy,marginBottom:6}}>Expiry</label>
                              <input type="text" placeholder="MM/YY" maxLength={5} style={{width:'100%',padding:'10px 12px',border:'1px solid #D1D5DB',borderRadius:8,fontSize:14,boxSizing:'border-box'}} className="no-focus-ring"/>
                            </div>
                            <div style={{flex:1}}>
                              <label style={{display:'block',fontSize:12,fontWeight:600,color:B.navy,marginBottom:6}}>CVC</label>
                              <input type="text" placeholder="123" maxLength={4} style={{width:'100%',padding:'10px 12px',border:'1px solid #D1D5DB',borderRadius:8,fontSize:14,boxSizing:'border-box'}} className="no-focus-ring"/>
                            </div>
                          </div>
                          <div style={{fontSize:11,color:'#9CA3AF',textAlign:'center',marginBottom:16,fontStyle:'italic'}}>This is a demo checkout. No payment will be processed.</div>
                          <button onClick={() => {
                            // Add purchased package to the local packages list
                            const newPkg = {
                              id: gid(),
                              name: pkgCheckout.pkg.name,
                              packageName: pkgCheckout.pkg.name,
                              quantity: (pkgCheckout.pkg.quantity || 1) * pkgCheckout.qty,
                              total: (pkgCheckout.pkg.quantity || 1) * pkgCheckout.qty,
                              used: 0,
                              redeemed: 0,
                              remaining: (pkgCheckout.pkg.quantity || 1) * pkgCheckout.qty,
                              expiryDate: pkgCheckout.pkg.expirationDate || null,
                              purchaseDate: new Date().toISOString().split('T')[0],
                              packagePrice: pkgCheckout.pkg.packagePrice * pkgCheckout.qty,
                            };
                            setAccountData(prev => ({ ...prev, packages: [...(prev?.packages || []), newPkg] }));
                            setCheckoutStep('success');
                          }} style={{width:'100%',padding:'14px',background:B.gold,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer'}}>Place Order — ${(pkgCheckout.pkg.packagePrice * pkgCheckout.qty).toFixed(2)}</button>
                          <button onClick={() => setPkgCheckout(null)} style={{width:'100%',padding:'10px',background:'none',border:'none',color:'#6B7280',fontWeight:500,cursor:'pointer',marginTop:8,fontSize:13}}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{textAlign:'center',padding:'20px 0'}}>
                          <div style={{width:48,height:48,borderRadius:'50%',background:'#DEF7EC',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
                            <span style={{fontSize:24,color:'#03543F'}}>✓</span>
                          </div>
                          <div style={{fontSize:18,fontWeight:700,color:B.navy,marginBottom:8}}>Order Confirmed!</div>
                          <div style={{fontSize:13,color:'#6B7280',marginBottom:4}}>{pkgCheckout.qty}× {pkgCheckout.pkg.name}</div>
                          <div style={{fontSize:12,color:'#6B7280',marginBottom:4}}>{(pkgCheckout.pkg.quantity || 1) * pkgCheckout.qty} coupons added to your account</div>
                          <div style={{fontSize:16,fontWeight:700,color:B.navy,marginBottom:16}}>${(pkgCheckout.pkg.packagePrice * pkgCheckout.qty).toFixed(2)}</div>
                          <div style={{fontSize:11,color:'#9CA3AF',fontStyle:'italic',marginBottom:20}}>Demo mode — no payment was processed</div>
                          <button onClick={() => { setPkgCheckout(null); setCheckoutStep('details'); }} style={{padding:'12px 32px',background:B.gold,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer'}}>Done</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Payments Tab */}
          {accountTab === 'payments' && (
            <div>
              {payments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: B.textSec }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F3F4F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>💳</span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No payment history</div>
                  <div style={{ fontSize: 13 }}>Payment records will appear here after your first stay.</div>
                </div>
              ) : payments.map((p, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${B.border}`, padding: 16, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: B.navy }}>{fmtDate(p.date)}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: B.navy }}>{fmtCurrency(p.amount)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: B.textSec }}>
                    {p.type}{p.nights ? ` · ${p.nights} night${p.nights > 1 ? 's' : ''}` : ''}
                    {p.status && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: p.status === 'paid' ? B.suc : B.textMut }}>{p.status}</span>}
                  </div>
                </div>
              ))}
              <div style={{ background: B.goldPale, borderRadius: 14, padding: '18px 22px', marginTop: 20, border: `1px solid ${B.gold}30` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Icons.Shield size={16} color={B.bronze} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: B.navy }}>Card on File</span>
                </div>
                <p style={{ fontSize: 13, color: B.bronze, lineHeight: 1.5 }}>
                  Secure card storage is coming soon. For now, please contact us to update your payment method.
                </p>
              </div>
            </div>
          )}

          {/* Settings Tab — notification preferences */}
          {accountTab === 'settings' && (
            <div>
              <div style={{ background: '#fff', borderRadius: 16, border: `2px solid ${B.border}`, padding: 24, marginBottom: 20 }}>
                <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, marginBottom: 4 }}>Notification Preferences</h3>
                <p style={{ fontSize: 13, color: B.textSec, marginBottom: 16 }}>Choose how you'd like to hear from us.</p>
                <ToggleSwitch label="Email Reminders" desc="Get email reminders before upcoming stays" on={notifPrefs.emailReminders} onChange={v => saveNotifPref('emailReminders', v)} />
                <ToggleSwitch label="Text Reminders" desc="SMS reminders 24 hours before check-in" on={notifPrefs.textReminders} onChange={v => saveNotifPref('textReminders', v)} />
                <ToggleSwitch label="Vaccine Expiration Alerts" desc="Get notified when vaccines are about to expire" on={notifPrefs.vaccineAlerts} onChange={v => saveNotifPref('vaccineAlerts', v)} />
                <ToggleSwitch label="Promotions & Offers" desc="Package deals, seasonal offers, and news" on={notifPrefs.marketingEmails} onChange={v => saveNotifPref('marketingEmails', v)} />
              </div>

              {/* Sign out */}
              <button onClick={() => { setAccountStep('phone'); setAccountData(null); setAccountPhone(''); setAccountOtp(''); setAccountTab('overview'); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 20px', background: '#fff', color: '#DC2626', border: '2px solid #FCA5A5', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Floating contact button */}
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
          {contactOpen && (
            <div style={{ position: 'absolute', bottom: 64, right: 0, background: '#fff', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', padding: 8, width: 220, marginBottom: 8 }}>
              <a href="tel:+1" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, textDecoration: 'none', color: B.navy, fontWeight: 600, fontSize: 14, transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <Icons.Phone size={18} color={B.navy} /> Call Us
              </a>
              <a href={`mailto:info@${slug || 'k9resorts'}.com`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, textDecoration: 'none', color: B.navy, fontWeight: 600, fontSize: 14, transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <Icons.Mail size={18} color={B.navy} /> Email Us
              </a>
              <div style={{ borderTop: `1px solid ${B.border}`, margin: '4px 16px' }} />
              <button onClick={() => { navigateTo('availability', 'left'); setContactOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', color: B.gold, fontWeight: 600, fontSize: 14, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <Icons.Calendar size={18} color={B.gold} /> Book a Stay
              </button>
            </div>
          )}
          <button onClick={() => setContactOpen(!contactOpen)}
            style={{ width: 56, height: 56, borderRadius: '50%', background: B.navy, border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s, background 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}>
            {contactOpen ? <Icons.X size={24} color="#fff" /> : <Icons.Phone size={24} color="#fff" />}
          </button>
        </div>
      </div>
    );
  };

  // renderLearnMore removed — content now inline in splash page

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
      default: return renderSplash();
    }
  };

  return (
    <BookingErrorBoundary>
      <div style={{ minHeight: '100vh' }}>
        {currentPage === 'splash' && renderSplash()}
        {currentPage === 'availability' && renderAvailability()}
        {currentPage === 'register' && renderRegistration()}
        {currentPage === 'confirmation' && renderConfirmation()}
        {currentPage === 'account' && renderAccount()}
        {renderPostPaymentVerification()}
      </div>
    </BookingErrorBoundary>
  );
}
