// K9 Operations — Signup Page
// New user registration flow: Create Account → Select Plan → Stripe Checkout → Dashboard
// © 2026 K9 Operations LLC. All Rights Reserved.

import { useState } from 'react';
import { useAuth } from './AuthProvider';

// ─── Colors (matches Login.jsx light theme) ─────────────────────────────────
const C = {
  bg: '#FFFFFF',
  bgAlt: '#FAFBFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  text: '#0F172A',
  textSec: '#1E293B',
  textMut: '#475569',
  pri: '#14532D',
  priL: '#166534',
  acc: '#84CC16',
  accLt: '#D9F99D',
  accDk: '#4D7C0F',
  danger: '#EF4444',
  success: '#16A34A',
};

// ─── Legal Content (abbreviated — same as Login.jsx) ─────────────────────────
const TOS_SECTIONS = [
  { t: "1. Definitions", b: "\"Company\" refers to K9 Operations LLC, a New Jersey limited liability company. \"Service\" refers to the K9 Operations cloud-based software platform." },
  { t: "2. Description of Service", b: "K9 Operations provides a cloud-based SaaS platform for pet care facility management." },
  { t: "3. Account Registration", b: "Customers must create an account and designate at least one administrator. You are responsible for providing accurate registration information." },
  { t: "4. Intellectual Property", b: "The Service is the exclusive property of K9 Operations LLC, protected by U.S. copyright and trademark laws." },
  { t: "5. Fees and Payment", b: "Access requires a paid subscription. We may modify pricing with at least 60 days written notice." },
  { t: "6. Contact", b: "Questions? Contact us at zack.nisbet@k9operations.com" },
];

const PRIVACY_SECTIONS = [
  { t: "1. Information We Collect", b: "We collect account information, pet and client data, booking and service data, employee data, and usage data." },
  { t: "2. Data Security", b: "All data is encrypted at rest (AES-256) and in transit (TLS 1.2+). We use role-based access controls." },
  { t: "3. Contact", b: "For privacy inquiries: zack.nisbet@k9operations.com" },
];

function LegalModal({ type, onClose }) {
  const isTos = type === 'tos';
  const title = isTos ? 'Terms of Service' : 'Privacy Policy';
  const sections = isTos ? TOS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 640, maxHeight: '80vh',
        background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          padding: '20px 28px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: C.bgAlt,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.pri }}>{title}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${C.border}`, background: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.textSec, fontSize: 18, fontFamily: 'inherit', lineHeight: 1,
          }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          {sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>{s.b}</div>
            </div>
          ))}
          <div style={{
            textAlign: 'center', fontSize: 11, color: C.textMut, marginTop: 24,
            paddingTop: 16, borderTop: `1px solid ${C.border}`,
          }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Signup Component ────────────────────────────────────────────────────────
export default function SignupPage() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [legalModal, setLegalModal] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!email.trim()) { setError('Please enter your email address'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!agreedToTerms) { setError('Please agree to the Terms of Service and Privacy Policy'); return; }

    setLoading(true);
    const { error: signUpError } = await signUp(email, password, fullName);
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    setSuccess(true);
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px',
    border: `1.5px solid ${C.border}`,
    borderRadius: 10, fontSize: 15, color: C.text,
    background: C.bgAlt,
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const linkBtnStyle = {
    background: 'none', border: 'none', color: C.textMut,
    fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'underline', padding: 0,
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        input::placeholder { color: ${C.textMut}; }
        input:focus {
          border-color: ${C.pri} !important;
          box-shadow: 0 0 0 3px rgba(20,83,45,0.1) !important;
        }
      `}</style>

      <div style={{
        minHeight: '100vh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
        padding: 20, position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle radial glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,83,45,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Back to Home */}
        <a href="/" style={{
          position: 'fixed', top: 20, left: 20,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: C.textSec, textDecoration: 'none',
          padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)', zIndex: 10,
        }}>
          <span style={{ fontSize: 11 }}>&larr;</span>
          <span>Back to Home</span>
        </a>

        {/* Signup Card */}
        <div style={{
          width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20,
          padding: '40px 36px', border: `1px solid ${C.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          position: 'relative', zIndex: 1,
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ margin: '0 auto 14px', display: 'flex', justifyContent: 'center' }}>
              <img src="/k9-logo-full.svg" alt="K9 Operations" style={{ height: 56 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, letterSpacing: '-0.02em' }}>
              Create Account
            </div>
            <div style={{
              fontSize: 11, color: C.acc, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 5,
            }}>
              Start your 14-day free trial
            </div>
          </div>

          {/* Success State */}
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: C.success,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: C.text }}>Check your email</h3>
              <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: '0 0 8px' }}>
                We sent a confirmation link to <strong style={{ color: C.text }}>{email}</strong>.
              </p>
              <p style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
                Click the link to confirm your account, then you will be redirected to select a plan and start your trial.
              </p>
              <a href="/login" style={{
                display: 'inline-block', marginTop: 20, padding: '10px 24px', background: C.pri, color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                textDecoration: 'none', fontFamily: 'inherit',
              }}>Go to Sign In</a>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name" style={inputStyle} autoComplete="name" autoFocus required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Work Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@yourbusiness.com" style={inputStyle} autoComplete="email" required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters" style={inputStyle} autoComplete="new-password" required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Type it again" style={inputStyle} autoComplete="new-password" required />
                </div>

                {/* Terms checkbox */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 1, cursor: 'pointer', accentColor: C.pri }}
                  />
                  <label style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
                    I agree to the{' '}
                    <button type="button" onClick={() => setLegalModal('tos')} style={{
                      ...linkBtnStyle, fontSize: 13, color: C.pri, fontWeight: 600,
                    }}>Terms of Service</button>
                    {' '}and{' '}
                    <button type="button" onClick={() => setLegalModal('privacy')} style={{
                      ...linkBtnStyle, fontSize: 13, color: C.pri, fontWeight: 600,
                    }}>Privacy Policy</button>
                  </label>
                </div>

                {error && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                    color: C.danger, fontSize: 13, fontWeight: 500,
                  }}>{error}</div>
                )}
                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '13px', background: loading ? C.textMut : C.pri,
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
                  cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 4,
                  transition: 'background 0.2s', letterSpacing: '0.02em',
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(20,83,45,0.2)',
                }}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              {/* Already have an account */}
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <span style={{ fontSize: 13, color: C.textMut }}>Already have an account? </span>
                <a href="/login" style={{ fontSize: 13, color: C.pri, fontWeight: 600, textDecoration: 'none' }}>Sign In</a>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: C.textMut }}>
            <span style={{ fontSize: 10, opacity: 0.7 }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</span>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setLegalModal('tos')} style={linkBtnStyle}>Terms of Service</button>
              <span style={{ color: C.border, fontSize: 10 }}>|</span>
              <button onClick={() => setLegalModal('privacy')} style={linkBtnStyle}>Privacy Policy</button>
            </div>
          </div>
        </div>
      </div>

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
    </>
  );
}
