// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// ── Production Security Guard ──────────────────────────────────────────────
if (import.meta.env.PROD) {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  // Block dev tools keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return false; }
    // Ctrl+Shift+I (Elements), Ctrl+Shift+J (Console), Ctrl+Shift+C (Inspect)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) { e.preventDefault(); return false; }
    // Ctrl+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return false; }
  });
}

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthProvider';
import { supabase } from './supabaseClient';
import Login from './Login';
import App from './App';
import BookingPage from './BookingPage';

// Public route check — render booking page without auth
const path = window.location.pathname;
const isBookingPage = path.startsWith('/book/') || path === '/book';

function Root() {
  // Public booking page — no auth required
  if (isBookingPage) return <BookingPage />;

  const { user, profile, loading, signOut, needsPasswordSet, updatePassword } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [claimChecked, setClaimChecked] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [claimDebug, setClaimDebug] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Password set form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  // When user has profile but no location_id, try to auto-claim an invitation
  useEffect(() => {
    if (!loading && profile && !profile.location_id && !claimChecked && !needsPasswordSet) {
      setClaiming(true);
      setClaimError(null);
      setClaimDebug(null);
      supabase.rpc('claim_invitation', { user_email: user.email })
        .then(({ data: result, error }) => {
          if (error) {
            console.log('claim_invitation RPC error:', error.message);
            setClaiming(false);
            setClaimChecked(true);
            setClaimError('pending');
            setClaimDebug('RPC error: ' + error.message);
          } else if (result && result.success) {
            window.location.reload();
          } else {
            setClaiming(false);
            setClaimChecked(true);
            setClaimError('no_invite');
            setClaimDebug(result ? result.message : 'No result returned');
          }
        })
        .catch((e) => {
          setClaiming(false);
          setClaimChecked(true);
          setClaimError('pending');
          setClaimDebug('Catch: ' + e.message);
        });
    }
  }, [loading, profile, claimChecked, retryCount, needsPasswordSet]);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    const { error } = await updatePassword(newPassword);
    if (error) { setPwError(error.message); setPwLoading(false); return; }
    setPwSuccess(true);
    setPwLoading(false);
    // After a brief moment, continue to the app
    setTimeout(() => window.location.reload(), 1500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'GT Eesti', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Canela', Georgia, serif" }}>K9 Operations</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Loading...</div>
          <div style={{ fontSize: 9, color: '#D1D5DB', marginTop: 16 }}>&copy; 2026 K9 Operations LLC</div>
        </div>
      </div>
    );
  }

  // Not logged in → show login page
  if (!user) return <Login />;

  // User needs to set a password (came from reset link or invite link)
  if (needsPasswordSet) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'GT Eesti', sans-serif" }}>
        {/* fonts loaded via App.jsx @font-face */}
        <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, padding: '40px 36px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Canela', Georgia, serif" }}>K9 Operations</div>
            <div style={{ fontSize: 11, color: '#AF8D54', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>Luxury Pet Hotel Management</div>
          </div>

          {pwSuccess ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#10B981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1A1D23' }}>Password set!</h3>
              <p style={{ fontSize: 14, color: '#6B7280' }}>Taking you to the app...</p>
            </div>
          ) : (
            <>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#1A1D23' }}>Set Your Password</h3>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                Welcome! Please set a permanent password for your account.
              </p>
              <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A1D23', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters" autoFocus
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 15, color: '#1A1D23', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A1D23', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Type it again"
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 15, color: '#1A1D23', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                {pwError && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 13, fontWeight: 500 }}>{pwError}</div>}
                <button type="submit" disabled={pwLoading}
                  style={{ width: '100%', padding: '13px', background: pwLoading ? '#6B7280' : '#003462', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: pwLoading ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                  {pwLoading ? 'Saving...' : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 20 }}>Signed in as {user.email}</p>
          <p style={{ textAlign: 'center', fontSize: 9, color: '#D1D5DB', marginTop: 12 }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</p>
        </div>
      </div>
    );
  }

  // Claiming invitation in progress
  if (claiming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'GT Eesti', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Canela', Georgia, serif" }}>K9 Operations</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Setting up your account...</div>
          <div style={{ fontSize: 9, color: '#D1D5DB', marginTop: 16 }}>&copy; 2026 K9 Operations LLC</div>
        </div>
      </div>
    );
  }

  // Logged in but no location assigned → show waiting message
  if (!profile?.location_id) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'GT Eesti', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#003462', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Canela', Georgia, serif", marginBottom: 8 }}>Welcome to K9 Operations!</div>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, margin: '0 0 24px' }}>
            Your account is set up and ready to go. You just need to be assigned to a location by your manager.
          </p>

          <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #E5E7EB', padding: '20px 24px', textAlign: 'left', marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#003462', marginBottom: 12 }}>What to do next:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
                <span style={{ fontSize: 13, color: '#6B7280' }}>Account created</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
                <span style={{ fontSize: 13, color: '#6B7280' }}>Email confirmed</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: claimError === 'no_invite' ? '#F59E0B' : '#E5E7EB', color: claimError === 'no_invite' ? '#fff' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</div>
                <div>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Waiting for team assignment</span>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Ask your manager to add you from <strong>Settings → Team Management</strong></div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => { setClaimChecked(false); setRetryCount(c => c + 1); }}
              style={{ padding: '10px 28px', background: '#003462', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Check Again
            </button>
            <button onClick={signOut}
              style={{ padding: '10px 24px', background: '#fff', color: '#6B7280', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign Out
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 20 }}>Signed in as {user.email}</p>
          {claimDebug && <p style={{ fontSize: 11, color: '#D1D5DB', marginTop: 8 }}>Debug: {claimDebug}</p>}
          <p style={{ textAlign: 'center', fontSize: 9, color: '#D1D5DB', marginTop: 12 }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</p>
        </div>
      </div>
    );
  }

  // All good → show the app
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
