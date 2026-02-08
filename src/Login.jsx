import { useState } from 'react';
import { useAuth } from './AuthProvider';

const C = {
  pri: '#003462', priHover: '#002347', acc: '#AF8D54',
  bg: '#F8F9FB', surface: '#FFFFFF', border: '#E5E7EB',
  text: '#1A1D23', textMut: '#6B7280', danger: '#EF4444',
};

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      if (!fullName.trim()) { setError('Full name is required'); setLoading(false); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
      const { error } = await signUp(email, password, fullName);
      if (error) setError(error.message);
      else setSignupSuccess(true);
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`,
    borderRadius: 10, fontSize: 15, color: C.text, background: C.surface,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${C.pri} 0%, #001a33 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', -apple-system, sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap');`}</style>
      <div style={{ width: '100%', maxWidth: 420, background: C.surface, borderRadius: 20, padding: '40px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '0.02em' }}>K9 Operations</div>
          <div style={{ fontSize: 11, color: C.acc, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>Luxury Pet Hotel Management</div>
        </div>

        {signupSuccess ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#9993;</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: C.text }}>Check your email</h3>
            <p style={{ fontSize: 14, color: C.textMut, lineHeight: 1.6, margin: 0 }}>
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back here to sign in.
            </p>
            <button onClick={() => { setMode('login'); setSignupSuccess(false); }} style={{ marginTop: 20, padding: '10px 24px', background: C.pri, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: 24, background: C.bg, borderRadius: 10, padding: 4 }}>
              {['login', 'signup'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); }}
                  style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: mode === m ? C.surface : 'transparent', color: mode === m ? C.pri : C.textMut, boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'signup' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Zack Nisbet" style={inputStyle} autoComplete="name" />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@k9resorts.com" style={inputStyle} autoComplete="email" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" style={inputStyle} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
              </div>

              {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: C.danger, fontSize: 13, fontWeight: 500 }}>{error}</div>}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', background: loading ? C.textMut : C.pri, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 4, transition: 'background 0.2s' }}>
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: C.textMut }}>
          K9 Operations v1.0 &middot; K9 Operations LLC
        </div>
      </div>
    </div>
  );
}
