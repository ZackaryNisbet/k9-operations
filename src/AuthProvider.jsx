// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  AUTH_TIMEOUTS,
  classifyAuthFailure,
  isAuthTransportError,
  resolveAuthStateTransition,
  withAuthTimeout,
} from './authRuntime';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState('loading');
  const [authError, setAuthError] = useState(null);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);
  const runIdRef = useRef(0);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const isRunActive = useCallback((runId) => runIdRef.current === runId, []);

  const beginRun = useCallback(() => {
    runIdRef.current += 1;
    return runIdRef.current;
  }, []);

  const setSignedOutState = useCallback((runId = runIdRef.current) => {
    if (!isRunActive(runId)) return;
    setUser(null);
    setProfile(null);
    setNeedsPasswordSet(false);
    setAuthError(null);
    setAuthStatus('signed_out');
    setLoading(false);
  }, [isRunActive]);

  const fetchProfile = useCallback(async (userId) => {
    const profileResult = await withAuthTimeout(
      () => supabase.rpc('get_my_profile'),
      { stage: 'get_my_profile', ms: AUTH_TIMEOUTS.getProfile }
    );
    if (profileResult?.error) {
      throw classifyAuthFailure(profileResult.error, { stage: 'get_my_profile' });
    }

    const rpcRows = profileResult?.data;
    const existing = rpcRows?.[0] || null;

    if (existing) {
      // Stamp last_accessed_at (fire-and-forget)
      const now = new Date().toISOString();
      supabase.from('profiles').update({ last_accessed_at: now }).eq('id', userId).then(() => {});
      supabase.from('lite_profiles').update({ last_active: now }).eq('user_id', userId).eq('is_active', true).then(() => {});
      return existing;
    }

    // No profile yet — auto-create one (for new sign-ups)
    const authUserResult = await withAuthTimeout(
      () => supabase.auth.getUser(),
      { stage: 'profile_bootstrap', ms: AUTH_TIMEOUTS.profileBootstrap }
    );
    if (authUserResult?.error) {
      throw classifyAuthFailure(authUserResult.error, { stage: 'profile_bootstrap' });
    }

    const authUser = authUserResult?.data?.user;
    const newProfile = {
      id: userId,
      email: authUser?.email || '',
      full_name: authUser?.user_metadata?.full_name || '',
      role: 'staff',
    };

    const insertResult = await withAuthTimeout(
      () => supabase.from('profiles').insert(newProfile).select().single(),
      { stage: 'profile_bootstrap', ms: AUTH_TIMEOUTS.profileBootstrap }
    );

    const { data: created, error: insertErr } = insertResult;

    if (created) {
      return created;
    }
    // If insert fails (e.g. RLS policy not set up), use a minimal profile
    console.warn('Could not auto-create profile:', insertErr);
    return {
      id: userId,
      email: authUser?.email || '',
      full_name: authUser?.user_metadata?.full_name || '',
      role: 'staff',
      location_id: null,
    };
  }, []);

  const hydrateUser = useCallback(async (nextUser, runId = runIdRef.current) => {
    if (!isRunActive(runId)) return;
    setUser(nextUser);
    setNeedsPasswordSet(nextUser?.user_metadata?.force_password_change === true);

    try {
      const nextProfile = await fetchProfile(nextUser.id);
      if (!isRunActive(runId)) return;
      setProfile(nextProfile);
      setAuthError(null);
      setAuthStatus('ready');
      setLoading(false);
    } catch (error) {
      const failure = classifyAuthFailure(error, { stage: error?.stage || 'get_my_profile' });
      if (!isRunActive(runId)) return;
      setProfile(null);
      setAuthError(failure);
      setAuthStatus(failure.kind);
      setLoading(false);
    }
  }, [fetchProfile, isRunActive]);

  const bootstrapAuth = useCallback(async () => {
    const runId = beginRun();
    setLoading(true);
    setAuthStatus('loading');
    setAuthError(null);

    try {
      const sessionResult = await withAuthTimeout(
        () => supabase.auth.getSession(),
        { stage: 'get_session', ms: AUTH_TIMEOUTS.getSession }
      );
      if (sessionResult?.error) {
        throw classifyAuthFailure(sessionResult.error, { stage: 'get_session' });
      }

      const nextUser = sessionResult?.data?.session?.user ?? null;
      if (!nextUser) {
        setSignedOutState(runId);
        return;
      }

      await hydrateUser(nextUser, runId);
    } catch (error) {
      const failure = classifyAuthFailure(error, { stage: error?.stage || 'get_session' });
      if (!isRunActive(runId)) return;
      setUser(null);
      setProfile(null);
      setNeedsPasswordSet(false);
      setAuthError(failure);
      setAuthStatus(failure.kind);
      setLoading(false);
    }
  }, [beginRun, hydrateUser, isRunActive, setSignedOutState]);

  useEffect(() => {
    let cancelled = false;

    bootstrapAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSet(true);
      }

      const nextUser = session?.user ?? null;
      const transition = resolveAuthStateTransition(event, {
        currentUserId: userRef.current?.id ?? null,
        nextUserId: nextUser?.id ?? null,
      });

      if (transition === 'ignore') return;

      if (transition === 'signed_out') {
        setSignedOutState(beginRun());
        return;
      }

      if (transition === 'quiet_refresh') {
        setUser(nextUser);
        setNeedsPasswordSet(nextUser?.user_metadata?.force_password_change === true);
        setAuthError(null);
        return;
      }

      setAuthStatus('loading');
      setLoading(true);
      setAuthError(null);
      hydrateUser(nextUser, beginRun());
    });

    return () => {
      cancelled = true;
      runIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [beginRun, bootstrapAuth, hydrateUser, setSignedOutState]);

  const signIn = async (email, password) => {
    try {
      const result = await withAuthTimeout(
        () => supabase.auth.signInWithPassword({ email, password }),
        { stage: 'sign_in', ms: AUTH_TIMEOUTS.signIn }
      );

      return {
        error: result?.error || null,
        timedOut: false,
        unavailable: !!result?.error && isAuthTransportError(result.error),
      };
    } catch (error) {
      const failure = classifyAuthFailure(error, { stage: 'sign_in' });
      return {
        error: failure,
        timedOut: !!failure.timedOut,
        unavailable: failure.kind === 'auth_unavailable',
      };
    }
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
    try {
      const result = await withAuthTimeout(
        () => supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        }),
        { stage: 'reset_password', ms: AUTH_TIMEOUTS.resetPassword }
      );

      return {
        error: result?.error || null,
        timedOut: false,
        unavailable: false,
      };
    } catch (error) {
      const failure = classifyAuthFailure(error, { stage: 'reset_password' });
      return {
        error: failure,
        timedOut: !!failure.timedOut,
        unavailable: failure.kind === 'auth_unavailable',
      };
    }
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
    const result = await withAuthTimeout(
      () => supabase.rpc('get_my_profile'),
      { stage: 'get_my_profile', ms: AUTH_TIMEOUTS.getProfile }
    );
    if (result?.error) {
      throw classifyAuthFailure(result.error, { stage: 'get_my_profile' });
    }
    const updated = result?.data?.[0] || null;
    if (updated) setProfile(updated);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSignedOutState(beginRun());
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      authStatus,
      authError,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      needsPasswordSet,
      refreshProfile,
      retryBootstrap: bootstrapAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
