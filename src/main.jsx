import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthProvider';
import Login from './Login';
import App from './App';

function Root() {
  const { user, profile, loading } = useAuth();

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

  // Logged in but no location assigned → show setup message
  if (!profile?.location_id) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F9FB', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 40 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#003462', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: 12 }}>Almost there!</div>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
            Your account has been created, but you haven't been assigned to a location yet.
            Ask your manager (Zack) to assign you in the Supabase dashboard.
          </p>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 16 }}>Signed in as {user.email}</p>
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
