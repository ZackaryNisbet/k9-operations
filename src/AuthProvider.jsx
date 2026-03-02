// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

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
      const u = session?.user ?? null;
      setUser(u);
      // Check if user needs to set a permanent password (invited with temp password)
      if (u && u.user_metadata?.force_password_change === true) {
        setNeedsPasswordSet(true);
      }
      if (u) fetchProfile(u.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSet(true);
      }
      const u = session?.user ?? null;
      setUser(u);
      // Also check force_password_change on sign-in (temp password invite flow)
      if (u && u.user_metadata?.force_password_change === true) {
        setNeedsPasswordSet(true);
      }
      if (u) fetchProfile(u.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data: rpcRows } = await supabase.rpc('get_my_profile');
    const existing = rpcRows?.[0] || null;

    if (existing) {
      setProfile(existing);
      setLoading(false);
      // Stamp last_accessed_at (fire-and-forget)
      supabase.from('profiles').update({ last_accessed_at: new Date().toISOString() }).eq('id', userId).then(() => {});
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
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { force_password_change: false }
    });
    if (!error) setNeedsPasswordSet(false);
    return { error };
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data: rpcRows } = await supabase.rpc('get_my_profile');
    const updated = rpcRows?.[0] || null;
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
