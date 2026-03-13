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
import LeanApp from './LeanApp';
import BookingPage from './BookingPage';
import PublicPage from './PublicPages';

// Route detection — determine which app to render
const path = window.location.pathname;
const isBookingPage = path.startsWith('/book/') || path === '/book';
const isPublicLink = path.startsWith('/sign/') || path.startsWith('/form/');
const isPOS = path.startsWith('/pos');

function Root() {
  // Public booking page — no auth required
  if (isBookingPage) return <BookingPage />;
  // Public agreement signing & questionnaire pages — no auth required
  if (isPublicLink) return <PublicPage />;

  const { user, profile, loading, signOut, needsPasswordSet, updatePassword } = useAuth();

  // Auto-claim invitation in the background (assigns location + role)
  const [claimAttempted, setClaimAttempted] = useState(false);
  useEffect(() => {
    if (!loading && profile && !profile.location_id && !claimAttempted && !needsPasswordSet) {
      setClaimAttempted(true);
      supabase.rpc('claim_invitation', { user_email: user.email })
        .then(({ data: result }) => {
          if (result && result.success) window.location.reload();
        })
        .catch(() => {});
    }
  }, [loading, profile, claimAttempted, needsPasswordSet]);

  // Password set form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

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

  // All good → route to POS or Lean app based on URL
  if (isPOS) return <App />;
  return <LeanApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
