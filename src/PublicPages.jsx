// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import React, { useState, useEffect, Component } from 'react';
import { supabase } from './supabaseClient';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════
class PublicErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('PublicPage Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F4', fontFamily: "'GT Eesti', sans-serif", padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 500 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🐾</div>
            <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: '#003462', marginBottom: 12 }}>Something went wrong</h2>
            <p style={{ color: '#6B7280', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>We encountered an unexpected error. Please try refreshing the page.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 28px', background: '#003462', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Refresh Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAND COLORS
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

// K9 logo
const K9Logo = ({ size = 40 }) => (
  <img src="/k9-logo.png" alt="K9 Resorts" style={{ width: size, height: 'auto', objectFit: 'contain' }} />
);

// ═══════════════════════════════════════════════════════════════════════════
// AGREEMENT SIGNING PAGE
// ═══════════════════════════════════════════════════════════════════════════
function AgreementSigningPage({ linkId, data }) {
  const [signature, setSignature] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreedToTerms) {
      setError('Please confirm that you have read and agree to the terms');
      return;
    }
    if (!signature.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: result, error: err } = await supabase.rpc('sign_public_agreement', {
        p_link_id: linkId,
        p_signature: signature,
      });

      if (err) {
        setError(err.message || 'Failed to sign agreement');
        setLoading(false);
        return;
      }

      if (result?.success) {
        setSuccess(true);
      } else {
        setError(result?.message || 'Failed to sign agreement');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg, padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 12, fontWeight: 400 }}>Agreement Signed</h2>
          <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>Thank you! Your agreement has been successfully signed and recorded.</p>
          <p style={{ color: B.textMut, fontSize: 14 }}>You can close this window or visit the K9 Resorts website.</p>
        </div>
      </div>
    );
  }

  // Already signed check
  if (data?.alreadySigned) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg, padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 12, fontWeight: 400 }}>Already Signed</h2>
          <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6 }}>This agreement has already been signed. Thank you!</p>
        </div>
      </div>
    );
  }

  const agreement = data?.agreement || {};
  const agreementBody = agreement.body || agreement.content || '';
  const agreementName = agreement.name || 'Customer Agreement';

  return (
    <div style={{ minHeight: '100vh', background: B.bg, padding: 20 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 20 }}>
          <K9Logo size={48} />
          <h1 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 8, marginTop: 16, fontWeight: 400 }}>
            {data?.locationName}
          </h1>
        </div>

        {/* Greeting */}
        <p style={{ fontSize: 18, color: B.text, marginBottom: 28, textAlign: 'center', fontFamily: "'Canela', Georgia, serif" }}>
          Hi {data?.clientFirstName},
        </p>

        {/* Card with Agreement */}
        <div style={{ background: B.surface, borderRadius: 12, padding: 28, marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 20, color: B.navy, marginBottom: 20, fontWeight: 400 }}>
            {agreementName}
          </h2>

          {/* Agreement Body */}
          <div style={{
            background: B.bg,
            border: `1px solid ${B.border}`,
            borderRadius: 8,
            padding: 20,
            marginBottom: 24,
            maxHeight: 300,
            overflowY: 'auto',
            fontSize: 14,
            lineHeight: 1.7,
            color: B.text,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontFamily: "'GT Eesti', sans-serif",
          }}>
            {agreementBody || 'No agreement content available'}
          </div>

          {/* Checkbox */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                cursor: 'pointer',
                accentColor: B.navy,
              }}
            />
            <label style={{ fontSize: 14, color: B.text, cursor: 'pointer', flex: 1 }}>
              I have read and agree to the above terms
            </label>
          </div>

          {/* Signature Field */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: B.text, marginBottom: 8 }}>
              Your Name (Signature)
            </label>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Type your name"
              style={{
                width: '100%',
                padding: 12,
                fontSize: 14,
                border: `1px solid ${B.border}`,
                borderRadius: 8,
                fontFamily: "'GT Eesti', sans-serif",
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Date Field */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: B.text, marginBottom: 8 }}>
              Date
            </label>
            <input
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
              disabled
              style={{
                width: '100%',
                padding: 12,
                fontSize: 14,
                border: `1px solid ${B.border}`,
                borderRadius: 8,
                background: B.bg,
                fontFamily: "'GT Eesti', sans-serif",
                boxSizing: 'border-box',
                cursor: 'not-allowed',
                color: B.textMut,
              }}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              background: '#FEE2E2',
              border: `1px solid #FCA5A5`,
              color: '#DC2626',
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              background: B.navy,
              color: B.surface,
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: "'GT Eesti', sans-serif",
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => !loading && (e.target.style.background = B.navyDark)}
            onMouseOut={(e) => !loading && (e.target.style.background = B.navy)}
          >
            {loading ? 'Signing...' : 'Sign Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE PAGE
// ═══════════════════════════════════════════════════════════════════════════
function QuestionnairePage({ linkId, data }) {
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleResponseChange = (fieldId, value) => {
    setResponses(prev => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: result, error: err } = await supabase.rpc('submit_public_questionnaire', {
        p_link_id: linkId,
        p_responses: responses,
      });

      if (err) {
        setError(err.message || 'Failed to submit questionnaire');
        setLoading(false);
        return;
      }

      if (result?.success) {
        setSuccess(true);
      } else {
        setError(result?.message || 'Failed to submit questionnaire');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg, padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 12, fontWeight: 400 }}>Thank You!</h2>
          <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>Your questionnaire has been successfully submitted. We appreciate the information!</p>
          <p style={{ color: B.textMut, fontSize: 14 }}>You can close this window or visit the K9 Resorts website.</p>
        </div>
      </div>
    );
  }

  // Already submitted check
  if (data?.alreadySubmitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg, padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
          <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 32, color: B.navy, marginBottom: 12, fontWeight: 400 }}>Already Submitted</h2>
          <p style={{ color: B.textSec, fontSize: 16, lineHeight: 1.6 }}>This questionnaire has already been submitted. Thank you!</p>
        </div>
      </div>
    );
  }

  const questionnaire = data?.questionnaire || {};
  // The questionnaire template has "questions" which is the raw JSONB sections array
  // In the app, this is structured as dogSections/clientSections, but in the DB it's just a flat array
  const sections = questionnaire.questions || [];

  return (
    <div style={{ minHeight: '100vh', background: B.bg, padding: 20 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 20 }}>
          <K9Logo size={48} />
          <h1 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 8, marginTop: 16, fontWeight: 400 }}>
            {data?.locationName}
          </h1>
        </div>

        {/* Greeting */}
        <p style={{ fontSize: 18, color: B.text, marginBottom: 28, textAlign: 'center', fontFamily: "'Canela', Georgia, serif" }}>
          Hi {data?.clientFirstName}, tell us about {data?.dogNames}!
        </p>

        {/* Questionnaire Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: B.surface, borderRadius: 12, padding: 28, marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {sections.length > 0 ? (
              sections.map((section, sIdx) => (
                <div key={sIdx} style={{ marginBottom: 32 }}>
                  {section.title && (
                    <h3 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 18, color: B.navy, marginBottom: 16, fontWeight: 400 }}>
                      {section.title}
                    </h3>
                  )}
                  {section.description && (
                    <p style={{ fontSize: 13, color: B.textSec, marginBottom: 20, lineHeight: 1.5 }}>
                      {section.description}
                    </p>
                  )}

                  {(section.fields || []).map((field, fIdx) => {
                    const shouldShow = !field.showIf || responses[field.showIf.field] === field.showIf.value;
                    if (!shouldShow) return null;

                    return (
                      <div key={fIdx} style={{ marginBottom: 20 }}>
                        <label style={{
                          display: 'block',
                          fontSize: 14,
                          fontWeight: 500,
                          color: B.text,
                          marginBottom: 8,
                        }}>
                          {field.label}
                          {field.required && <span style={{ color: B.err }}> *</span>}
                        </label>

                        {field.type === 'text' && (
                          <input
                            type="text"
                            value={responses[field.id] || ''}
                            onChange={(e) => handleResponseChange(field.id, e.target.value)}
                            placeholder={field.placeholder || ''}
                            required={field.required}
                            style={{
                              width: '100%',
                              padding: 10,
                              fontSize: 13,
                              border: `1px solid ${B.border}`,
                              borderRadius: 6,
                              fontFamily: "'GT Eesti', sans-serif",
                              boxSizing: 'border-box',
                            }}
                          />
                        )}

                        {field.type === 'phone' && (
                          <input
                            type="tel"
                            value={responses[field.id] || ''}
                            onChange={(e) => handleResponseChange(field.id, e.target.value)}
                            placeholder="(123) 456-7890"
                            required={field.required}
                            style={{
                              width: '100%',
                              padding: 10,
                              fontSize: 13,
                              border: `1px solid ${B.border}`,
                              borderRadius: 6,
                              fontFamily: "'GT Eesti', sans-serif",
                              boxSizing: 'border-box',
                            }}
                          />
                        )}

                        {field.type === 'textarea' && (
                          <textarea
                            value={responses[field.id] || ''}
                            onChange={(e) => handleResponseChange(field.id, e.target.value)}
                            placeholder={field.placeholder || ''}
                            required={field.required}
                            rows={4}
                            style={{
                              width: '100%',
                              padding: 10,
                              fontSize: 13,
                              border: `1px solid ${B.border}`,
                              borderRadius: 6,
                              fontFamily: "'GT Eesti', sans-serif",
                              boxSizing: 'border-box',
                              resize: 'vertical',
                            }}
                          />
                        )}

                        {field.type === 'select' && (
                          <select
                            value={responses[field.id] || ''}
                            onChange={(e) => handleResponseChange(field.id, e.target.value)}
                            required={field.required}
                            style={{
                              width: '100%',
                              padding: 10,
                              fontSize: 13,
                              border: `1px solid ${B.border}`,
                              borderRadius: 6,
                              fontFamily: "'GT Eesti', sans-serif",
                              boxSizing: 'border-box',
                              background: B.surface,
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">Select an option</option>
                            {(field.options || []).map((opt, oIdx) => (
                              <option key={oIdx} value={opt.value || opt}>
                                {opt.label || opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {field.type === 'radio' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {(field.options || []).map((opt, oIdx) => (
                              <label key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={field.id}
                                  value={opt.value || opt}
                                  checked={responses[field.id] === (opt.value || opt)}
                                  onChange={(e) => handleResponseChange(field.id, e.target.value)}
                                  style={{ cursor: 'pointer', accentColor: B.navy }}
                                />
                                <span style={{ fontSize: 13, color: B.text }}>
                                  {opt.label || opt}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}

                        {field.type === 'checkbox' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={responses[field.id] === true}
                              onChange={(e) => handleResponseChange(field.id, e.target.checked)}
                              style={{ cursor: 'pointer', accentColor: B.navy }}
                            />
                            <span style={{ fontSize: 13, color: B.text }}>
                              {field.checkedLabel || 'Yes'}
                            </span>
                          </label>
                        )}

                        {field.type === 'multiselect' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {(field.options || []).map((opt, oIdx) => {
                              const selected = Array.isArray(responses[field.id]) ? responses[field.id] : [];
                              return (
                                <label key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value || opt)}
                                    onChange={(e) => {
                                      const newVals = e.target.checked
                                        ? [...selected, opt.value || opt]
                                        : selected.filter(v => v !== (opt.value || opt));
                                      handleResponseChange(field.id, newVals);
                                    }}
                                    style={{ cursor: 'pointer', accentColor: B.navy }}
                                  />
                                  <span style={{ fontSize: 13, color: B.text }}>
                                    {opt.label || opt}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <p style={{ color: B.textMut, textAlign: 'center' }}>No questionnaire sections available</p>
            )}

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#FEE2E2',
                border: `1px solid #FCA5A5`,
                color: '#DC2626',
                padding: 12,
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 20,
                marginTop: 20,
              }}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: 14,
                background: B.navy,
                color: B.surface,
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: "'GT Eesti', sans-serif",
                transition: 'all 0.2s',
                marginTop: 20,
              }}
              onMouseOver={(e) => !loading && (e.target.style.background = B.navyDark)}
              onMouseOut={(e) => !loading && (e.target.style.background = B.navy)}
            >
              {loading ? 'Submitting...' : 'Submit Questionnaire'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVALID/EXPIRED LINK PAGE
// ═══════════════════════════════════════════════════════════════════════════
function InvalidLinkPage({ message }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg, padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
        <h2 style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 28, color: B.navy, marginBottom: 12, fontWeight: 400 }}>Link Invalid</h2>
        <p style={{ color: B.textSec, fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </p>
        <a
          href="https://k9resorts.com"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            background: B.navy,
            color: B.surface,
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "'GT Eesti', sans-serif",
          }}
        >
          Back to K9 Resorts
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════════════════════════════
function LoadingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.bg }}>
      <div style={{ textAlign: 'center' }}>
        <K9Logo size={64} />
        <p style={{ marginTop: 20, color: B.textMut, fontSize: 14, fontFamily: "'GT Eesti', sans-serif" }}>Loading...</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PUBLIC PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function PublicPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Parse URL to get linkId and type
  const pathname = window.location.pathname;
  const match = pathname.match(/\/(sign|form)\/([a-f0-9-]+)/i);
  const pageType = match ? match[1] : null;
  const linkId = match ? match[2] : null;

  useEffect(() => {
    const fetchLinkData = async () => {
      if (!linkId) {
        setError('Invalid link');
        setLoading(false);
        return;
      }

      try {
        const { data: result, error: err } = await supabase.rpc('get_public_link_data', {
          p_link_id: linkId,
        });

        if (err) {
          setError(err.message || 'Failed to load link data');
          setLoading(false);
          return;
        }

        if (!result?.success) {
          setError(result?.message || 'Invalid or expired link');
          setLoading(false);
          return;
        }

        setData(result);
        setError('');
      } catch (err) {
        setError('An error occurred while loading the link');
        console.error(err);
      }

      setLoading(false);
    };

    fetchLinkData();
  }, [linkId]);

  if (loading) {
    return (
      <PublicErrorBoundary>
        <LoadingPage />
      </PublicErrorBoundary>
    );
  }

  if (error || !data?.success) {
    return (
      <PublicErrorBoundary>
        <InvalidLinkPage message={error || data?.message || 'This link is invalid or has expired'} />
      </PublicErrorBoundary>
    );
  }

  return (
    <PublicErrorBoundary>
      {data.linkType === 'agreement' && <AgreementSigningPage linkId={linkId} data={data} />}
      {data.linkType === 'questionnaire' && <QuestionnairePage linkId={linkId} data={data} />}
    </PublicErrorBoundary>
  );
}
