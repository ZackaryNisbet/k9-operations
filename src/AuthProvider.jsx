import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSet(true);
      }
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existing) {
      setProfile(existing);
      setLoading(false);
      return;
    }

    // No profile yet — auto-create one (for new sign-ups)
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    const newProfile = {
      id: userId,
      email: authUser?.email || '',
      full_name: authUser?.user_metadata?.full_name || '',
      role: 'staff',
    };
    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (created) {
      setProfile(created);
    } else {
      // If insert fails (e.g. RLS policy not set up), use a minimal profile
      console.warn('Could not auto-create profile:', insertErr);
      setProfile({ id: userId, email: authUser?.email || '', full_name: authUser?.user_metadata?.full_name || '', role: 'staff', location_id: null });
    }
    setLoading(false);
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error };
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error };
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setNeedsPasswordSet(false);
    return { error };
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data: updated } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (updated) setProfile(updated);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setNeedsPasswordSet(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, resetPassword, updatePassword, needsPasswordSet, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
