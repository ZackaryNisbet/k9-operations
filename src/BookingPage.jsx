import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';

const BRAND_COLORS = {
  navy: '#003462',
  gold: '#AF8D54',
  background: '#F8F9FB',
  surface: '#FFFFFF',
  text: '#1A1D23',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  border: '#E5E7EB',
};

const ROOM_DESCRIPTIONS = {
  'Luxury Suite': "Our premium 8'×8' cage-free suite with Kuranda bed, premium Blue Buffalo food, and all activities included. Perfect for dogs who love space.",
  'Executive Room': "A spacious 5'×7' cage-free room with Kuranda bed and all the same premium amenities. Great for most dogs.",
  'Double Compartment': "A comfortable shared-style accommodation ideal for two dogs from the same family, or a single dog who prefers a cozy space.",
  'Single Compartment': "A comfortable option for smaller dogs or those used to crate-style environments at home.",
};

const BATH_OPTIONS = ['None', 'Standard Bath', 'Hypo Bath', 'Medicated Bath', 'Whitening Bath'];

function getMinDate(daysFromNow = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function isDateClosed(dateStr, closedDates) {
  return closedDates.some(cd => cd.date === dateStr);
}

function getAvailableRooms(roomType, roomList, checkIn, checkOut, reservations) {
  const total = roomList.length;
  const booked = reservations.filter(res => {
    if (res.type !== 'boarding' || res.roomType !== roomType) return false;
    if (res.status === 'cancelled' || res.status === 'checked-out') return false;
    const resCheckIn = res.checkIn;
    const resCheckOut = res.checkOut;
    return resCheckIn <= checkOut && resCheckOut >= checkIn;
  }).length;
  return Math.max(0, total - booked);
}

function computePricing(bookingType, selectedRoomType, pricing, checkIn, checkOut, bathType) {
  if (bookingType === 'evaluation') {
    return {
      evaluationFee: pricing.evaluationFee || 0,
      total: pricing.evaluationFee || 0,
      deposit: 0,
      balance: 0,
    };
  }

  if (bookingType === 'boarding') {
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const roomRate = pricing.boardingRates[selectedRoomType] || 0;
    const roomCost = roomRate * nights;
    let bathCost = 0;
    if (bathType && bathType !== 'None' && pricing.addOns[bathType]) {
      bathCost = pricing.addOns[bathType];
    }
    const subtotal = roomCost + bathCost;
    const depositPercent = pricing.paymentRules?.boarding?.depositPercent || 50;
    const deposit = Math.round((subtotal * depositPercent) / 100);
    const balance = subtotal - deposit;

    return {
      roomCost,
      bathCost,
      subtotal,
      deposit,
      balance,
      nights,
      roomRate,
      depositPercent,
    };
  }

  return { total: 0 };
}

export default function BookingPage() {
  // Extract slug from URL
  const slug = useMemo(() => {
    const pathParts = window.location.pathname.split('/');
    return pathParts[2] || '';
  }, []);

  // Data & loading state
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Step state
  const [step, setStep] = useState('landing');
  const [bookingType, setBookingType] = useState(null);

  // Evaluation form state
  const [evalDate, setEvalDate] = useState('');
  const [evalTime, setEvalTime] = useState('');

  // Boarding form state
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState('');

  // Shared form state
  const [client, setClient] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    emergencyContact: '',
    emergencyPhone: '',
  });

  const [dog, setDog] = useState({
    name: '',
    breed: '',
    weight: '',
    sex: '',
    spayedNeutered: '',
    dob: '',
    bathType: 'None',
    feedingNotes: '',
    medicationNotes: '',
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationId, setConfirmationId] = useState(null);

  // Load location data on mount
  useEffect(() => {
    const loadData = async () => {
      if (!slug) {
        setError('No location specified');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_public_booking_data', {
          p_slug: slug,
        });

        if (rpcError) throw rpcError;
        if (!data || !data.success) {
          setError('Location not found');
          setLoading(false);
          return;
        }

        setLocationData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading booking data:', err);
        setError(err.message || 'Failed to load location data');
        setLoading(false);
      }
    };

    loadData();
  }, [slug]);

  const handleSubmitBooking = async () => {
    setSubmitting(true);
    try {
      const pricing =
        bookingType === 'boarding'
          ? computePricing(bookingType, selectedRoomType, locationData.pricing, checkIn, checkOut, dog.bathType)
          : computePricing(bookingType, null, locationData.pricing, null, null, null);

      const booking = {
        type: bookingType,
        client,
        dog,
        notes,
        ...(bookingType === 'evaluation' ? { evalDate, evalTime } : {}),
        ...(bookingType === 'boarding'
          ? {
              checkIn,
              checkOut,
              roomType: selectedRoomType,
              pricing,
            }
          : {}),
      };

      const { data: result, error: submitError } = await supabase.rpc('submit_online_booking', {
        p_slug: slug,
        p_booking: booking,
      });

      if (submitError) throw submitError;

      if (result && (result.bookingId || result.success)) {
        setConfirmationId(result.bookingId || 'confirmed');
        setStep(bookingType === 'evaluation' ? 'eval-confirm' : 'board-confirm');
      } else {
        setError(result?.message || 'Failed to create booking');
      }
    } catch (err) {
      console.error('Error submitting booking:', err);
      setError(err.message || 'Failed to submit booking');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('landing');
    setBookingType(null);
    setEvalDate('');
    setEvalTime('');
    setCheckIn('');
    setCheckOut('');
    setSelectedRoomType('');
    setClient({ firstName: '', lastName: '', phone: '', email: '', emergencyContact: '', emergencyPhone: '' });
    setDog({ name: '', breed: '', weight: '', sex: '', spayedNeutered: '', dob: '', bathType: 'None', feedingNotes: '', medicationNotes: '' });
    setNotes('');
    setConfirmationId(null);
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderLoadingError = () => {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_COLORS.background }}>
          <div style={{ textAlign: 'center', color: BRAND_COLORS.text }}>
            <div style={{ fontSize: '24px', marginBottom: '16px' }}>Loading...</div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_COLORS.background }}>
          <div style={{ textAlign: 'center', color: BRAND_COLORS.text, maxWidth: '600px', padding: '24px' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: BRAND_COLORS.error }}>Error</div>
            <div style={{ fontSize: '16px', marginBottom: '24px', color: BRAND_COLORS.textSecondary }}>{error}</div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderNav = () => (
    <nav style={{ backgroundColor: BRAND_COLORS.surface, borderBottom: `1px solid ${BRAND_COLORS.border}`, padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy }}>K9 Resorts</div>
      {locationData && <div style={{ fontSize: '16px', color: BRAND_COLORS.text, fontWeight: '500' }}>{locationData.location_name}</div>}
    </nav>
  );

  const renderLanding = () => {
    if (!locationData) return null;

    const googleRating = locationData.resortInfo?.googleRating || '5.0';
    const googleReviewCount = locationData.resortInfo?.googleReviewCount || '100+';
    const address = locationData.resortInfo?.address || '';

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh' }}>
        {renderNav()}

        {/* Hero Section */}
        <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '80px 32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '56px', fontWeight: '700', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, margin: '0 0 16px 0' }}>
            Welcome to {locationData.location_name}
          </h1>
          <div style={{ fontSize: '12px', height: '4px', width: '60px', backgroundColor: BRAND_COLORS.gold, margin: '0 auto 32px auto' }}></div>
          <p style={{ fontSize: '24px', color: BRAND_COLORS.textSecondary, margin: '0 0 40px 0', fontWeight: '400' }}>
            Award-winning luxury pet boarding & daycare
          </p>

          {/* Google Rating Badge */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '16px' }}>
            <span style={{ fontSize: '20px', color: BRAND_COLORS.gold }}>★</span>
            <span style={{ color: BRAND_COLORS.text, fontWeight: '600' }}>
              {googleRating} ({googleReviewCount} reviews)
            </span>
          </div>

          {/* Address */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '40px', color: BRAND_COLORS.text, fontSize: '14px' }}>
            <span>📍</span>
            <span>{address}</span>
          </div>

          {/* Google Maps Embed */}
          <div style={{ maxWidth: '800px', margin: '0 auto 60px auto', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }}>
            <iframe
              width="100%"
              height="300"
              frameBorder="0"
              style={{ border: 0 }}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
              allowFullScreen=""
              loading="lazy"
            ></iframe>
          </div>
        </div>

        {/* Room Showcase */}
        <div style={{ padding: '60px 32px', maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, textAlign: 'center', marginBottom: '50px' }}>
            Choose Your Perfect Suite
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
              marginBottom: '60px',
            }}
          >
            {Object.entries(locationData.rooms).map(([roomType, roomList]) => {
              const rate = locationData.pricing.boardingRates[roomType];
              return (
                <div
                  key={roomType}
                  style={{
                    backgroundColor: BRAND_COLORS.surface,
                    padding: '24px',
                    borderRadius: '16px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    border: `1px solid ${BRAND_COLORS.border}`,
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)')}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: BRAND_COLORS.navy, margin: '0 0 8px 0' }}>
                    {roomType}
                  </h3>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: BRAND_COLORS.gold, marginBottom: '16px' }}>
                    ${rate} <span style={{ fontSize: '14px', color: BRAND_COLORS.textMuted, fontWeight: '400' }}>/ night</span>
                  </div>
                  <p style={{ fontSize: '14px', color: BRAND_COLORS.textSecondary, lineHeight: '1.6', margin: '0' }}>
                    {ROOM_DESCRIPTIONS[roomType]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA Buttons */}
        <div
          style={{
            padding: '60px 32px',
            backgroundColor: BRAND_COLORS.surface,
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => {
              setBookingType('boarding');
              setStep('board-dates');
            }}
            style={{
              backgroundColor: BRAND_COLORS.navy,
              color: BRAND_COLORS.gold,
              border: 'none',
              padding: '16px 40px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(0, 52, 98, 0.2)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 52, 98, 0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 52, 98, 0.2)';
            }}
          >
            Book Boarding
          </button>
          <button
            onClick={() => {
              setBookingType('evaluation');
              setStep('eval-date');
            }}
            style={{
              backgroundColor: BRAND_COLORS.gold,
              color: BRAND_COLORS.navy,
              border: 'none',
              padding: '16px 40px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(175, 141, 84, 0.2)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(175, 141, 84, 0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(175, 141, 84, 0.2)';
            }}
          >
            Schedule Free Evaluation
          </button>
        </div>

        {/* Footer Disclaimer */}
        <div style={{ backgroundColor: BRAND_COLORS.background, padding: '40px 32px', textAlign: 'center', borderTop: `1px solid ${BRAND_COLORS.border}` }}>
          <p style={{ fontSize: '12px', color: BRAND_COLORS.textMuted, margin: '0' }}>
            All reservations are subject to approval. Deposit is non-refundable. Please review our cancellation policy before booking.
          </p>
        </div>
      </div>
    );
  };

  const renderStepIndicator = (currentStep, totalSteps) => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '40px', fontSize: '14px', color: BRAND_COLORS.textSecondary }}>
      <span style={{ fontWeight: '700', color: BRAND_COLORS.navy }}>{currentStep}</span>
      <span>/</span>
      <span>{totalSteps}</span>
    </div>
  );

  const renderEvalDate = () => {
    if (!locationData) return null;

    const minDate = getMinDate(1);
    const isDisabled = !evalDate || !evalTime;

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('1', '3')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Schedule Your Evaluation
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}>
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                Preferred Date *
              </label>
              <input
                type="date"
                value={evalDate}
                onChange={e => {
                  const newDate = e.target.value;
                  if (!isDateClosed(newDate, locationData.closedDates || [])) {
                    setEvalDate(newDate);
                  }
                }}
                min={minDate}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: `1.5px solid ${BRAND_COLORS.border}`,
                  borderRadius: '10px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.3s ease',
                }}
                onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
              />
            </div>

            <div style={{ marginBottom: '40px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '16px' }}>
                Preferred Time *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Morning (7–9 AM)', value: 'morning' },
                  { label: 'Midday (10 AM – 12 PM)', value: 'midday' },
                  { label: 'Afternoon (1–3 PM)', value: 'afternoon' },
                ].map(option => (
                  <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="evalTime"
                      value={option.value}
                      checked={evalTime === option.value}
                      onChange={e => setEvalTime(e.target.value)}
                      style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: BRAND_COLORS.navy }}
                    />
                    <span style={{ fontSize: '14px', color: BRAND_COLORS.text }}>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('landing')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep('eval-info')}
                disabled={isDisabled}
                style={{
                  flex: 1,
                  backgroundColor: isDisabled ? BRAND_COLORS.textMuted : BRAND_COLORS.navy,
                  color: BRAND_COLORS.surface,
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: isDisabled ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!isDisabled) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEvalInfo = () => {
    const isFormValid = client.firstName && client.lastName && client.phone && client.email && dog.name && dog.breed;

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('2', '3')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Tell Us About You & Your Dog
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '32px' }}>
              {/* Client Info */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy, marginBottom: '20px' }}>Your Information</h3>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={client.firstName}
                    onChange={e => setClient({ ...client, firstName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={client.lastName}
                    onChange={e => setClient({ ...client, lastName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={client.phone}
                    onChange={e => setClient({ ...client, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={client.email}
                    onChange={e => setClient({ ...client, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>
              </div>

              {/* Dog Info */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy, marginBottom: '20px' }}>Your Dog's Information</h3>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Dog's Name *
                  </label>
                  <input
                    type="text"
                    value={dog.name}
                    onChange={e => setDog({ ...dog, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Breed *
                  </label>
                  <input
                    type="text"
                    value={dog.breed}
                    onChange={e => setDog({ ...dog, breed: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    value={dog.weight}
                    onChange={e => setDog({ ...dog, weight: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Sex
                  </label>
                  <select
                    value={dog.sex}
                    onChange={e => setDog({ ...dog, sex: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                      backgroundColor: BRAND_COLORS.surface,
                      cursor: 'pointer',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Spayed/Neutered
                  </label>
                  <select
                    value={dog.spayedNeutered}
                    onChange={e => setDog({ ...dog, spayedNeutered: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                      backgroundColor: BRAND_COLORS.surface,
                      cursor: 'pointer',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  >
                    <option value="">Select...</option>
                    <option value="Neutered/Spayed">Neutered/Spayed</option>
                    <option value="Intact">Intact</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dog.dob}
                    onChange={e => setDog({ ...dog, dob: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Tell us anything else we should know about your dog or any special requests..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: `1.5px solid ${BRAND_COLORS.border}`,
                  borderRadius: '10px',
                  boxSizing: 'border-box',
                  minHeight: '120px',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.3s ease',
                  resize: 'vertical',
                }}
                onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('eval-date')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep('eval-review')}
                disabled={!isFormValid}
                style={{
                  flex: 1,
                  backgroundColor: isFormValid ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                  color: BRAND_COLORS.surface,
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: isFormValid ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  opacity: isFormValid ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (isFormValid) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEvalReview = () => {
    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('3', '3')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Review Your Information
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', marginBottom: '24px' }}>
            {/* Green Banner */}
            <div style={{ backgroundColor: BRAND_COLORS.success, color: BRAND_COLORS.surface, padding: '16px 20px', borderRadius: '10px', marginBottom: '32px', fontSize: '14px', fontWeight: '600', textAlign: 'center' }}>
              ✓ Complimentary Evaluation — No Payment Required
            </div>

            {/* Review Cards */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Information
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Name:</strong> {client.firstName} {client.lastName}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Phone:</strong> {client.phone}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Email:</strong> {client.email}
                </p>
              </div>

              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Dog
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Name:</strong> {dog.name}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Breed:</strong> {dog.breed}
                </p>
                {dog.weight && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Weight:</strong> {dog.weight} lbs
                  </p>
                )}
                {dog.sex && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Sex:</strong> {dog.sex}
                  </p>
                )}
                {dog.spayedNeutered && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Spayed/Neutered:</strong> {dog.spayedNeutered}
                  </p>
                )}
                {dog.dob && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Date of Birth:</strong> {dog.dob}
                  </p>
                )}
              </div>

              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Evaluation Details
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Date:</strong> {evalDate}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Time:</strong> {evalTime === 'morning' ? 'Morning (7–9 AM)' : evalTime === 'midday' ? 'Midday (10 AM – 12 PM)' : 'Afternoon (1–3 PM)'}
                </p>
              </div>

              {notes && (
                <>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Notes
                  </h3>
                  <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                    <p style={{ margin: '0', fontSize: '14px', color: BRAND_COLORS.text, whiteSpace: 'pre-wrap' }}>{notes}</p>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('eval-info')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={handleSubmitBooking}
                disabled={submitting}
                style={{
                  flex: 1,
                  backgroundColor: submitting ? BRAND_COLORS.textMuted : BRAND_COLORS.navy,
                  color: BRAND_COLORS.surface,
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: submitting ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!submitting) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Booking Request'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEvalConfirm = () => {
    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {renderNav()}
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <div style={{ fontSize: '60px', marginBottom: '24px', animation: 'fadeIn 0.6s ease-in' }}>✓</div>

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '16px' }}>
            Booking Request Submitted!
          </h1>

          <p style={{ fontSize: '16px', color: BRAND_COLORS.textSecondary, marginBottom: '32px', lineHeight: '1.6' }}>
            Thank you for scheduling an evaluation with K9 Resorts. Our team will confirm your appointment within 24 hours.
          </p>

          {confirmationId && (
            <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '24px', borderRadius: '12px', marginBottom: '32px', border: `1px solid ${BRAND_COLORS.border}` }}>
              <p style={{ fontSize: '12px', color: BRAND_COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Confirmation ID
              </p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: BRAND_COLORS.navy, margin: '0', fontFamily: 'monospace' }}>
                {confirmationId}
              </p>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              backgroundColor: BRAND_COLORS.navy,
              color: BRAND_COLORS.surface,
              border: 'none',
              padding: '14px 32px',
              fontSize: '14px',
              fontWeight: '700',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Book Another
          </button>
        </div>
      </div>
    );
  };

  const renderBoardDates = () => {
    if (!locationData) return null;

    const minCheckIn = getMinDate(1);
    const minCheckOut = checkIn ? new Date(checkIn) : new Date();
    minCheckOut.setDate(minCheckOut.getDate() + 1);
    const minCheckOutStr = minCheckOut.toISOString().split('T')[0];

    const nights =
      checkIn && checkOut ? Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) : 0;

    const isDisabled = !checkIn || !checkOut;

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('1', '4')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Select Your Dates
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}>
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                Check-In Date *
              </label>
              <input
                type="date"
                value={checkIn}
                onChange={e => {
                  const newDate = e.target.value;
                  if (!isDateClosed(newDate, locationData.closedDates || [])) {
                    setCheckIn(newDate);
                    if (checkOut && new Date(newDate) >= new Date(checkOut)) {
                      setCheckOut('');
                    }
                  }
                }}
                min={minCheckIn}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: `1.5px solid ${BRAND_COLORS.border}`,
                  borderRadius: '10px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.3s ease',
                }}
                onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                Check-Out Date *
              </label>
              <input
                type="date"
                value={checkOut}
                onChange={e => {
                  const newDate = e.target.value;
                  if (!isDateClosed(newDate, locationData.closedDates || [])) {
                    setCheckOut(newDate);
                  }
                }}
                min={minCheckOutStr}
                disabled={!checkIn}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: `1.5px solid ${BRAND_COLORS.border}`,
                  borderRadius: '10px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.3s ease',
                  opacity: !checkIn ? 0.5 : 1,
                }}
                onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
              />
            </div>

            {nights > 0 && (
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '32px', textAlign: 'center' }}>
                <p style={{ margin: '0', fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy }}>
                  {nights} night{nights !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('landing')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep('board-room')}
                disabled={isDisabled}
                style={{
                  flex: 1,
                  backgroundColor: isDisabled ? BRAND_COLORS.textMuted : BRAND_COLORS.navy,
                  color: BRAND_COLORS.surface,
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: isDisabled ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!isDisabled) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBoardRoom = () => {
    if (!locationData) return null;

    const availabilityMap = {};
    Object.entries(locationData.rooms).forEach(([roomType, roomList]) => {
      const available = getAvailableRooms(roomType, roomList, checkIn, checkOut, locationData.reservations || []);
      availabilityMap[roomType] = { available, total: roomList.length };
    });

    const getAvailabilityColor = availability => {
      if (availability === 0) return BRAND_COLORS.textMuted;
      if (availability <= (availabilityMap[selectedRoomType]?.total || 4) * 0.25) return BRAND_COLORS.error;
      if (availability <= (availabilityMap[selectedRoomType]?.total || 4) * 0.5) return BRAND_COLORS.warning;
      return BRAND_COLORS.success;
    };

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('2', '4')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '12px', textAlign: 'center' }}>
            Choose Your Room
          </h1>
          <p style={{ fontSize: '16px', color: BRAND_COLORS.textSecondary, textAlign: 'center', marginBottom: '40px' }}>
            Showing availability for {checkIn} — {checkOut}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
            {Object.entries(locationData.rooms).map(([roomType, roomList]) => {
              const { available, total } = availabilityMap[roomType];
              const isAvailable = available > 0;
              const rate = locationData.pricing.boardingRates[roomType];
              const barWidth = (available / total) * 100;
              const barColor = available === 0 ? BRAND_COLORS.textMuted : available <= total * 0.25 ? BRAND_COLORS.error : available <= total * 0.5 ? BRAND_COLORS.warning : BRAND_COLORS.success;

              return (
                <div
                  key={roomType}
                  onClick={() => isAvailable && setSelectedRoomType(roomType)}
                  style={{
                    backgroundColor: BRAND_COLORS.surface,
                    padding: '24px',
                    borderRadius: '16px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    border: selectedRoomType === roomType ? `3px solid ${BRAND_COLORS.gold}` : `1px solid ${BRAND_COLORS.border}`,
                    cursor: isAvailable ? 'pointer' : 'not-allowed',
                    opacity: isAvailable ? 1 : 0.6,
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={e => {
                    if (isAvailable) {
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                  }}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: BRAND_COLORS.navy, margin: '0 0 8px 0' }}>
                    {roomType}
                  </h3>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: BRAND_COLORS.gold, marginBottom: '16px' }}>
                    ${rate} <span style={{ fontSize: '12px', color: BRAND_COLORS.textMuted, fontWeight: '400' }}>/ night</span>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: BRAND_COLORS.text }}>
                        {available} of {total} available
                      </span>
                      {available === 0 && <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.error }}>SOLD OUT</span>}
                    </div>
                    <div style={{ height: '6px', backgroundColor: BRAND_COLORS.background, borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          backgroundColor: barColor,
                          width: `${barWidth}%`,
                          transition: 'width 0.3s ease',
                        }}
                      ></div>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: BRAND_COLORS.textSecondary, lineHeight: '1.5', margin: '0' }}>
                    {ROOM_DESCRIPTIONS[roomType]}
                  </p>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => setStep('board-dates')}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                color: BRAND_COLORS.navy,
                border: `1.5px solid ${BRAND_COLORS.navy}`,
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '700',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Back
            </button>
            <button
              onClick={() => setStep('board-info')}
              disabled={!selectedRoomType}
              style={{
                flex: 1,
                backgroundColor: !selectedRoomType ? BRAND_COLORS.textMuted : BRAND_COLORS.navy,
                color: BRAND_COLORS.surface,
                border: 'none',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '700',
                borderRadius: '12px',
                cursor: !selectedRoomType ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                opacity: !selectedRoomType ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (selectedRoomType) e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBoardInfo = () => {
    const isFormValid = client.firstName && client.lastName && client.phone && client.email && dog.name && dog.breed;

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('3', '4')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Tell Us About You & Your Dog
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '32px' }}>
              {/* Client Info */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy, marginBottom: '20px' }}>Your Information</h3>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={client.firstName}
                    onChange={e => setClient({ ...client, firstName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={client.lastName}
                    onChange={e => setClient({ ...client, lastName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={client.phone}
                    onChange={e => setClient({ ...client, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={client.email}
                    onChange={e => setClient({ ...client, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={client.emergencyContact}
                    onChange={e => setClient({ ...client, emergencyContact: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Emergency Phone
                  </label>
                  <input
                    type="tel"
                    value={client.emergencyPhone}
                    onChange={e => setClient({ ...client, emergencyPhone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>
              </div>

              {/* Dog Info */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy, marginBottom: '20px' }}>Your Dog's Information</h3>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Dog's Name *
                  </label>
                  <input
                    type="text"
                    value={dog.name}
                    onChange={e => setDog({ ...dog, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Breed *
                  </label>
                  <input
                    type="text"
                    value={dog.breed}
                    onChange={e => setDog({ ...dog, breed: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    value={dog.weight}
                    onChange={e => setDog({ ...dog, weight: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Sex
                  </label>
                  <select
                    value={dog.sex}
                    onChange={e => setDog({ ...dog, sex: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                      backgroundColor: BRAND_COLORS.surface,
                      cursor: 'pointer',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Spayed/Neutered
                  </label>
                  <select
                    value={dog.spayedNeutered}
                    onChange={e => setDog({ ...dog, spayedNeutered: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                      backgroundColor: BRAND_COLORS.surface,
                      cursor: 'pointer',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  >
                    <option value="">Select...</option>
                    <option value="Neutered/Spayed">Neutered/Spayed</option>
                    <option value="Intact">Intact</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dog.dob}
                    onChange={e => setDog({ ...dog, dob: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                    Bath Type
                  </label>
                  <select
                    value={dog.bathType}
                    onChange={e => setDog({ ...dog, bathType: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: `1.5px solid ${BRAND_COLORS.border}`,
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s ease',
                      backgroundColor: BRAND_COLORS.surface,
                      cursor: 'pointer',
                    }}
                    onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                    onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                  >
                    {BATH_OPTIONS.map(bath => (
                      <option key={bath} value={bath}>
                        {bath}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.navy, marginBottom: '16px' }}>Additional Details</h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                  Feeding Notes
                </label>
                <textarea
                  value={dog.feedingNotes}
                  onChange={e => setDog({ ...dog, feedingNotes: e.target.value })}
                  placeholder="Any dietary restrictions, preferred food, feeding schedule, etc."
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: `1.5px solid ${BRAND_COLORS.border}`,
                    borderRadius: '10px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.3s ease',
                    resize: 'vertical',
                  }}
                  onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                  onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                  Medication Notes
                </label>
                <textarea
                  value={dog.medicationNotes}
                  onChange={e => setDog({ ...dog, medicationNotes: e.target.value })}
                  placeholder="Any medications, allergies, medical conditions, etc."
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: `1.5px solid ${BRAND_COLORS.border}`,
                    borderRadius: '10px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.3s ease',
                    resize: 'vertical',
                  }}
                  onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                  onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.text, marginBottom: '8px' }}>
                  Additional Notes
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any other information we should know..."
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: `1.5px solid ${BRAND_COLORS.border}`,
                    borderRadius: '10px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.3s ease',
                    resize: 'vertical',
                  }}
                  onFocus={e => (e.target.style.borderColor = BRAND_COLORS.navy)}
                  onBlur={e => (e.target.style.borderColor = BRAND_COLORS.border)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('board-room')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep('board-review')}
                disabled={!isFormValid}
                style={{
                  flex: 1,
                  backgroundColor: isFormValid ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                  color: BRAND_COLORS.surface,
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: isFormValid ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  opacity: isFormValid ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (isFormValid) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBoardReview = () => {
    if (!locationData) return null;

    const pricing = computePricing(bookingType, selectedRoomType, locationData.pricing, checkIn, checkOut, dog.bathType);
    const nights = pricing.nights || 0;
    const rate = pricing.roomRate || 0;

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px' }}>
        {renderNav()}
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
          {renderStepIndicator('4', '4')}

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '40px', textAlign: 'center' }}>
            Review Your Booking
          </h1>

          <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '32px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', marginBottom: '24px' }}>
            {/* Summary */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Information
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Name:</strong> {client.firstName} {client.lastName}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Phone:</strong> {client.phone}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Email:</strong> {client.email}
                </p>
                {client.emergencyContact && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Emergency Contact:</strong> {client.emergencyContact} ({client.emergencyPhone})
                  </p>
                )}
              </div>

              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Dog
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Name:</strong> {dog.name}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Breed:</strong> {dog.breed}
                </p>
                {dog.weight && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Weight:</strong> {dog.weight} lbs
                  </p>
                )}
              </div>

              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Booking Details
              </h3>
              <div style={{ backgroundColor: BRAND_COLORS.background, padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Check-In:</strong> {checkIn}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Check-Out:</strong> {checkOut}
                </p>
                <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <strong>Room Type:</strong> {selectedRoomType}
                </p>
                {dog.bathType && dog.bathType !== 'None' && (
                  <p style={{ margin: '8px 0', fontSize: '14px', color: BRAND_COLORS.text }}>
                    <strong>Bath Type:</strong> {dog.bathType}
                  </p>
                )}
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div style={{ marginBottom: '32px', paddingTop: '24px', borderTop: `1px solid ${BRAND_COLORS.border}` }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.textMuted, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pricing
              </h3>

              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: BRAND_COLORS.text }}>
                <span>
                  {selectedRoomType} × {nights} night{nights !== 1 ? 's' : ''}
                </span>
                <strong>${pricing.roomCost}</strong>
              </div>

              {pricing.bathCost > 0 && (
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: BRAND_COLORS.text }}>
                  <span>{dog.bathType}</span>
                  <strong>${pricing.bathCost}</strong>
                </div>
              )}

              <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: `2px solid ${BRAND_COLORS.border}`, display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: BRAND_COLORS.text }}>
                <span>Subtotal</span>
                <strong>${pricing.subtotal}</strong>
              </div>

              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: BRAND_COLORS.navy, fontWeight: '700' }}>
                <span>{pricing.depositPercent}% Non-Refundable Deposit</span>
                <span style={{ color: BRAND_COLORS.gold }}>${pricing.deposit}</span>
              </div>

              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: BRAND_COLORS.text }}>
                <span>Balance due at check-out</span>
                <strong>${pricing.balance}</strong>
              </div>
            </div>

            {/* Warning Banner */}
            <div style={{ backgroundColor: BRAND_COLORS.error, color: BRAND_COLORS.surface, padding: '16px', borderRadius: '10px', marginBottom: '32px', fontSize: '13px', lineHeight: '1.5' }}>
              <strong style={{ display: 'block', marginBottom: '6px' }}>Important:</strong>
              The deposit is non-refundable. Full balance is due at check-out.
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setStep('board-info')}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: BRAND_COLORS.navy,
                  border: `1.5px solid ${BRAND_COLORS.navy}`,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = BRAND_COLORS.background;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={handleSubmitBooking}
                disabled={submitting}
                style={{
                  flex: 1,
                  backgroundColor: submitting ? BRAND_COLORS.textMuted : BRAND_COLORS.gold,
                  color: BRAND_COLORS.navy,
                  border: 'none',
                  padding: '14px 24px',
                  fontSize: '15px',
                  fontWeight: '700',
                  borderRadius: '12px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: submitting ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!submitting) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {submitting ? 'Processing...' : `Reserve Now — $${pricing.deposit} Deposit`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBoardConfirm = () => {
    const pricing = computePricing(bookingType, selectedRoomType, locationData.pricing, checkIn, checkOut, dog.bathType);

    return (
      <div style={{ backgroundColor: BRAND_COLORS.background, minHeight: '100vh', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {renderNav()}
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <div style={{ fontSize: '60px', marginBottom: '24px', animation: 'fadeIn 0.6s ease-in' }}>✓</div>

          <h1 style={{ fontSize: '40px', fontFamily: "'Canela', Georgia, serif", color: BRAND_COLORS.navy, marginBottom: '16px' }}>
            Your Boarding Reservation Request Has Been Submitted!
          </h1>

          <p style={{ fontSize: '16px', color: BRAND_COLORS.textSecondary, marginBottom: '32px', lineHeight: '1.6' }}>
            A deposit of <strong>${pricing.deposit}</strong> will be collected when our team contacts you to confirm your reservation.
          </p>

          {confirmationId && (
            <div style={{ backgroundColor: BRAND_COLORS.surface, padding: '24px', borderRadius: '12px', marginBottom: '32px', border: `1px solid ${BRAND_COLORS.border}` }}>
              <p style={{ fontSize: '12px', color: BRAND_COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Confirmation ID
              </p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: BRAND_COLORS.navy, margin: '0', fontFamily: 'monospace' }}>
                {confirmationId}
              </p>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              backgroundColor: BRAND_COLORS.navy,
              color: BRAND_COLORS.surface,
              border: 'none',
              padding: '14px 32px',
              fontSize: '14px',
              fontWeight: '700',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Book Another
          </button>
        </div>
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (loading || error) {
    return renderLoadingError();
  }

  switch (step) {
    case 'landing':
      return renderLanding();
    case 'eval-date':
      return renderEvalDate();
    case 'eval-info':
      return renderEvalInfo();
    case 'eval-review':
      return renderEvalReview();
    case 'eval-confirm':
      return renderEvalConfirm();
    case 'board-dates':
      return renderBoardDates();
    case 'board-room':
      return renderBoardRoom();
    case 'board-info':
      return renderBoardInfo();
    case 'board-review':
      return renderBoardReview();
    case 'board-confirm':
      return renderBoardConfirm();
    default:
      return renderLanding();
  }
}
