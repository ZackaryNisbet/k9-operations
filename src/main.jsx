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

  // When user has profile but no location_id, try to auto-claim an invitation
  useEffect(() => {
    if (!loading && profile && !profile.location_id && !claimChecked) {
      setClaiming(true);
      supabase.rpc('claim_invitation', { user_email: user.email })
        .then(({ data: result }) => {
          if (result && result.success) {
            // Invitation claimed! Reload to pick up the new location
            window.location.reload();
          } else {
            setClaiming(false);
            setClaimChecked(true);
          }
        })
        .catch(() => {
          // RPC not available yet — that's OK
          setClaiming(false);
          setClaimChecked(true);
        });
    }
  }, [loading, profile, claimChecked]);

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
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 40 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: 12 }}>Almost there!</div>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
            Your account has been created, but you haven't been assigned to a location yet.
            Ask your manager to invite you from <strong>Settings &rarr; Team Management</strong> in the app, then refresh this page.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <button onClick={() => window.location.reload()}
              style={{ padding: '10px 24px', background: '#003462', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Refresh
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
