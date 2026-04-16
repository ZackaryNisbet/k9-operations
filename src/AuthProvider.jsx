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

const LITE_ROLE_RANK = Object.freeze({
  pct: 10,
  csr: 20,
  supervisor: 30,
  manager: 40,
  location_admin: 50,
  enterprise_admin: 60,
});

function pickLiteProfile(rows = []) {
  return [...rows]
    .filter(row => row?.is_active !== false)
    .sort((a, b) => {
      const aHasLocation = a?.location_id ? 1 : 0;
      const bHasLocation = b?.location_id ? 1 : 0;
      if (aHasLocation !== bHasLocation) return bHasLocation - aHasLocation;
      return (LITE_ROLE_RANK[b?.role] || 0) - (LITE_ROLE_RANK[a?.role] || 0);
    })[0] || null;
}

function mergeLiteProfile(baseProfile, liteProfile, userId, authUser) {
  const base = baseProfile || {};
  const fullName = liteProfile?.full_name
    || base.full_name
    || authUser?.user_metadata?.full_name
    || '';

  return {
    ...base,
    id: userId,
    user_id: userId,
    lite_profile_id: liteProfile?.id || base.lite_profile_id || null,
    email: liteProfile?.email || base.email || authUser?.email || '',
    full_name: fullName,
    name: fullName,
    role: liteProfile?.role || base.role || 'staff',
    location_id: liteProfile?.location_id ?? base.location_id ?? null,
  };
}

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
    const authUserResult = await withAuthTimeout(
      () => supabase.auth.getUser(),
      { stage: 'profile_bootstrap', ms: AUTH_TIMEOUTS.profileBootstrap }
    );
    if (authUserResult?.error) {
      throw classifyAuthFailure(authUserResult.error, { stage: 'profile_bootstrap' });
    }

    const authUser = authUserResult?.data?.user;
    const liteResult = await withAuthTimeout(
      () => supabase
        .from('lite_profiles')
        .select('id,user_id,email,full_name,role,location_id,is_active')
        .eq('user_id', userId)
        .eq('is_active', true),
      { stage: 'get_my_profile', ms: AUTH_TIMEOUTS.getProfile }
    );
    if (liteResult?.error) {
      throw classifyAuthFailure(liteResult.error, { stage: 'get_my_profile' });
    }

    const liteProfile = pickLiteProfile(liteResult?.data || []);

    let profileResult = null;
    try {
      profileResult = await withAuthTimeout(
        () => supabase.rpc('get_my_profile'),
        { stage: 'get_my_profile', ms: AUTH_TIMEOUTS.getProfile }
      );
    } catch (error) {
      if (!liteProfile) throw error;
      console.warn('Could not load legacy profile; using Lite profile:', error);
    }

    if (profileResult?.error && !liteProfile) {
      throw classifyAuthFailure(profileResult.error, { stage: 'get_my_profile' });
    }

    const rpcRows = profileResult?.data;
    const existing = rpcRows?.[0] || null;

    if (existing) {
      // Stamp last_accessed_at (fire-and-forget)
      const now = new Date().toISOString();
      supabase.from('profiles').update({ last_accessed_at: now }).eq('id', userId).then(() => {});
      supabase.from('lite_profiles').update({ last_active: now }).eq('user_id', userId).eq('is_active', true).then(() => {});
      return mergeLiteProfile(existing, liteProfile, userId, authUser);
    }

    if (liteProfile) {
      const now = new Date().toISOString();
      supabase.from('lite_profiles').update({ last_active: now }).eq('user_id', userId).eq('is_active', true).then(() => {});
      return mergeLiteProfile(null, liteProfile, userId, authUser);
    }

    // No profile yet — auto-create one (for new sign-ups)
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
      return mergeLiteProfile(created, null, userId, authUser);
    }
    // If insert fails (e.g. RLS policy not set up), use a minimal profile
    console.warn('Could not auto-create profile:', insertErr);
    return mergeLiteProfile({
      id: userId,
      email: authUser?.email || '',
      full_name: authUser?.user_metadata?.full_name || '',
      role: 'staff',
      location_id: null,
    }, null, userId, authUser);
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
    const updated = await fetchProfile(user.id);
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
