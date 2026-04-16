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
import { summarizeAuthFailure } from './authRuntime';
import Login from './Login';
import SignupPage from './SignupPage';
import App from './App';
import LiteApp from './kol/KolApp';
import BookingPage from './BookingPage';
import PublicPage from './PublicPages';
import LandingPage from './LandingPage';
import { AppCrashScreen, BrandedErrorBoundary } from './shared/AppCrashScreen';

function RuntimeCrashManager({ children }) {
  const [runtimeError, setRuntimeError] = useState(null);

  useEffect(() => {
    const handleWindowError = (event) => {
      setRuntimeError({
        title: 'Unexpected application error',
        description: 'The app caught a runtime error and stayed mounted so you do not have to hard-refresh the entire session.',
        error: event.error || new Error(event.message || 'Unknown runtime error'),
        details: `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`,
      });
    };

    const handleUnhandledRejection = (event) => {
      // Supabase auth-js uses navigator.locks internally. When a lock is orphaned
      // (e.g. React double-mount, tab backgrounding), the library recovers by
      // stealing it. The evicted holder throws this AbortError — it's expected
      // recovery behavior, not a real error. Suppress it.
      if (event.reason?.name === 'AbortError' && String(event.reason?.message || '').includes('steal')) {
        event.preventDefault();
        console.warn('[Auth] Lock recovered via steal — this is normal');
        return;
      }

      setRuntimeError({
        title: 'Background action failed',
        description: 'The app intercepted an unhandled promise rejection. Reload if the current screen still behaves unexpectedly.',
        error: event.reason || new Error('Unhandled promise rejection'),
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  if (runtimeError) {
    return (
      <AppCrashScreen
        title={runtimeError.title}
        description={runtimeError.description}
        error={runtimeError.error}
        details={runtimeError.details}
        onRetry={() => setRuntimeError(null)}
        retryLabel="Return to App"
      />
    );
  }

  return children;
}

function AuthStatusScreen({ title, description, authError, onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#14532D', fontFamily: "'Outfit', sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#166534', borderRadius: 20, padding: '36px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F0F2F5', letterSpacing: '-0.02em' }}>K9 Operations</div>
          <div style={{ fontSize: 11, color: '#84CC16', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 6 }}>
            Service Status
          </div>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: '#F0F2F5', marginBottom: 10, textAlign: 'center' }}>{title}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, textAlign: 'center', marginBottom: 16 }}>{description}</div>

        {authError?.stage && (
          <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#84CC16', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Diagnostic</div>
            <div style={{ fontSize: 12, color: '#F0F2F5' }}>{summarizeAuthFailure(authError)}</div>
            {authError?.requestHint && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{authError.requestHint}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onRetry}
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: 'none',
              background: '#84CC16',
              color: '#14532D',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Retry
          </button>
          <a
            href="/welcome"
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: '1.5px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#F0F2F5',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Go to Welcome
          </a>
        </div>
      </div>
    </div>
  );
}

const PASSWORD_REQUIREMENT = 'Use at least 8 characters with one uppercase letter and one number.';

function validatePermanentPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return '';
}

function formatPasswordUpdateError(error) {
  const message = error?.message || '';
  if (/weak|guess|known|leaked|breached|common/i.test(message)) {
    return 'That password is too common. Choose a less obvious password that still has at least 8 characters, one uppercase letter, and one number.';
  }
  if (/8|characters|length/i.test(message)) {
    return 'Password must be at least 8 characters.';
  }
  return message || 'Password could not be updated.';
}

function Root() {
  // Route detection — evaluated on each render so refreshes work correctly
  const path = window.location.pathname;
  const isBookingPage = path.startsWith('/book/') || path === '/book';
  const isPublicLink = path.startsWith('/sign/') || path.startsWith('/form/');
  const isPublicRoadmap = path === '/public-roadmap';
  const isWelcomePage = path === '/welcome';
  const isLoginPage = path === '/login';
  const isSignupPage = path === '/signup';
  const isPublicPricing = path === '/pricing';
  const isLandingPage = path === '/' || path === '';
  const isPOS = path.startsWith('/pos');
  const isLite = !isPOS; // Base app handles everything except /pos

  // Public pages — no auth required
  if (isBookingPage) return <BookingPage />;
  if (isPublicLink) return <PublicPage />;
  if (isWelcomePage) return <LandingPage />;
  if (isSignupPage) return <SignupPage />;
  if (isPublicPricing) return <LandingPage />;

  const { user, profile, loading, authStatus, authError, retryBootstrap, needsPasswordSet, updatePassword } = useAuth();

  // Auto-claim invitation in the background (assigns location + role)
  const [claimAttempted, setClaimAttempted] = useState(false);
  useEffect(() => {
    if (authStatus === 'ready' && profile && !profile.location_id && !claimAttempted && !needsPasswordSet) {
      setClaimAttempted(true);
      supabase.rpc('claim_invitation', { user_email: user.email })
        .then(({ data: result }) => {
          if (result && result.success) window.location.reload();
        })
        .catch(() => {});
    }
  }, [authStatus, profile, claimAttempted, needsPasswordSet, user?.email]);

  // Password set form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    const passwordError = validatePermanentPassword(newPassword);
    if (passwordError) { setPwError(passwordError); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    const { error } = await updatePassword(newPassword);
    if (error) { setPwError(formatPasswordUpdateError(error)); setPwLoading(false); return; }
    setPwSuccess(true);
    setPwLoading(false);
    // After a brief moment, continue to the app
    setTimeout(() => window.location.reload(), 1500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#14532D', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Outfit', sans-serif" }}>K9 Operations</div>
          <div style={{ fontSize: 13, color: '#D9F99D', marginTop: 8 }}>Loading...</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>&copy; 2026 K9 Operations LLC</div>
        </div>
      </div>
    );
  }

  if (authStatus === 'auth_unavailable') {
    return (
      <AuthStatusScreen
        title="Authentication Service Unavailable"
        description="We could not reach the authentication service. The app is up, but sign-in and session bootstrap are temporarily unavailable."
        authError={authError}
        onRetry={retryBootstrap}
      />
    );
  }

  if (authStatus === 'profile_unavailable') {
    return (
      <AuthStatusScreen
        title="Profile Load Unavailable"
        description="Authentication completed, but we could not load the staff profile needed to enter the app."
        authError={authError}
        onRetry={retryBootstrap}
      />
    );
  }

  // Not logged in
  if (!user) {
    // Show login page at /login, landing page everywhere else
    if (isLoginPage) return <Login />;
    return <LandingPage />;
  }

  // User needs to set a password (came from reset link or invite link)
  if (needsPasswordSet) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#14532D', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 420, background: '#166534', borderRadius: 20, padding: '40px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Outfit', sans-serif" }}>K9 Operations</div>
            <div style={{ fontSize: 11, color: '#84CC16', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>The Operating System for Pet Care</div>
          </div>

          {pwSuccess ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#10B981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#F0F2F5' }}>Password set!</h3>
              <p style={{ fontSize: 14, color: '#8B95A8' }}>Taking you to the app...</p>
            </div>
          ) : (
            <>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#F0F2F5' }}>Set Your Password</h3>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: '#8B95A8', lineHeight: 1.5 }}>
                Welcome! Please set a permanent password for your account.
              </p>
              <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8B95A8', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="8+ chars, uppercase, number" autoFocus autoComplete="new-password"
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 15, color: '#F0F2F5', background: 'rgba(255,255,255,0.08)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <div style={{ marginTop: 7, fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 1.45 }}>
                    {PASSWORD_REQUIREMENT}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8B95A8', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Type it again" autoComplete="new-password"
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 15, color: '#F0F2F5', background: 'rgba(255,255,255,0.08)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                {pwError && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13, fontWeight: 500 }}>{pwError}</div>}
                <button type="submit" disabled={pwLoading}
                  style={{ width: '100%', padding: '13px', background: pwLoading ? 'rgba(255,255,255,0.4)' : '#84CC16', color: '#14532D', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: pwLoading ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                  {pwLoading ? 'Saving...' : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 20 }}>Signed in as {user.email}</p>
          <p style={{ textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</p>
        </div>
      </div>
    );
  }

  // Logged-in user hitting landing page or login -> continue to Lite after
  // any required first-login password setup has been handled.
  if (isLandingPage || isLoginPage) {
    return <LiteApp />;
  }

  // All good → route to POS or Lite app based on URL
  if (isPOS) return <App />;
  // Lite app handles /lite/* routes and any other authenticated path
  return <LiteApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrandedErrorBoundary
    title="K9 Operations could not finish rendering this screen"
    description="A render-time error was caught before the app could fully crash. You can retry, reload, or go back to the welcome screen."
    returnHref="/welcome"
  >
    <RuntimeCrashManager>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </RuntimeCrashManager>
  </BrandedErrorBoundary>
);
