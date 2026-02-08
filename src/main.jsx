import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthProvider';
import { supabase } from './supabaseClient';
import Login from './Login';
import App from './App';

function Root() {
  const { user, profile, loading, signOut } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [claimChecked, setClaimChecked] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // When user has profile but no location_id, try to auto-claim an invitation
  useEffect(() => {
    if (!loading && profile && !profile.location_id && !claimChecked) {
      setClaiming(true);
      setClaimError(null);
      supabase.rpc('claim_invitation', { user_email: user.email })
        .then(({ data: result, error }) => {
          if (error) {
            console.log('claim_invitation RPC not available:', error.message);
            setClaiming(false);
            setClaimChecked(true);
            setClaimError('pending');
          } else if (result && result.success) {
            window.location.reload();
          } else {
            setClaiming(false);
            setClaimChecked(true);
            setClaimError('no_invite');
          }
        })
        .catch(() => {
          setClaiming(false);
          setClaimChecked(true);
          setClaimError('pending');
        });
    }
  }, [loading, profile, claimChecked, retryCount]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Playfair Display', Georgia, serif" }}>K9 Operations</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Loading...</div>
        </div>
      </div>
    );
  }

  // Not logged in → show login page
  if (!user) return <Login />;

  // Claiming invitation in progress
  if (claiming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Playfair Display', Georgia, serif" }}>K9 Operations</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Setting up your account...</div>
        </div>
      </div>
    );
  }

  // Logged in but no location assigned → show waiting message
  if (!profile?.location_id) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#003462', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: 8 }}>Welcome to K9 Operations!</div>
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
