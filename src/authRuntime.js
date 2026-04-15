// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

export const AUTH_TIMEOUTS = Object.freeze({
  getSession: 8_000,
  getProfile: 8_000,
  profileBootstrap: 8_000,
  signIn: 10_000,
  resetPassword: 10_000,
});

const DEFAULT_HINTS = {
  get_session: 'Initial auth session bootstrap',
  get_my_profile: 'Profile bootstrap via get_my_profile RPC',
  profile_bootstrap: 'Fallback profile bootstrap',
  sign_in: 'Password sign-in request',
  reset_password: 'Password reset request',
};

const DEFAULT_MESSAGES = {
  auth_unavailable: 'Authentication service is unavailable right now.',
  profile_unavailable: 'We could not load your staff profile.',
};

export function authStageLabel(stage) {
  switch (stage) {
    case 'get_session':
      return 'Session bootstrap';
    case 'get_my_profile':
      return 'Profile load';
    case 'profile_bootstrap':
      return 'Profile bootstrap';
    case 'sign_in':
      return 'Sign in';
    case 'reset_password':
      return 'Password reset';
    default:
      return 'Authentication';
  }
}

export function authKindForStage(stage) {
  switch (stage) {
    case 'get_my_profile':
    case 'profile_bootstrap':
      return 'profile_unavailable';
    default:
      return 'auth_unavailable';
  }
}

export function createAuthFailure({
  stage,
  kind = authKindForStage(stage),
  message = DEFAULT_MESSAGES[kind] || DEFAULT_MESSAGES.auth_unavailable,
  timedOut = false,
  requestHint,
  status = null,
  cause = null,
}) {
  return {
    __authFailure: true,
    stage,
    kind,
    message,
    timedOut,
    requestHint: requestHint || DEFAULT_HINTS[stage] || 'Authentication request',
    status,
    cause,
  };
}

export function isAuthTransportError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  return (
    name.includes('Fetch') ||
    name.includes('Abort') ||
    name.includes('Timeout') ||
    name.includes('Network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timed out') ||
    error?.status === 0
  );
}

export function classifyAuthFailure(error, { stage, kind, requestHint } = {}) {
  if (error?.__authFailure) return error;

  const resolvedKind = kind || authKindForStage(stage);
  const fallbackMessage = DEFAULT_MESSAGES[resolvedKind] || DEFAULT_MESSAGES.auth_unavailable;
  const message = isAuthTransportError(error)
    ? fallbackMessage
    : String(error?.message || fallbackMessage);

  return createAuthFailure({
    stage,
    kind: resolvedKind,
    message,
    timedOut: false,
    requestHint,
    status: error?.status ?? null,
    cause: error ?? null,
  });
}

export async function withAuthTimeout(task, { stage, ms, kind, requestHint } = {}) {
  const startedAt = Date.now();
  console.info(`[Auth] ${stage} start`);

  let timeoutId;

  try {
    const result = await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createAuthFailure({
            stage,
            kind: kind || authKindForStage(stage),
            message: `${authStageLabel(stage)} timed out after ${ms}ms.`,
            timedOut: true,
            requestHint,
          }));
        }, ms);
      }),
    ]);

    console.info(`[Auth] ${stage} complete in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    const failure = classifyAuthFailure(error, { stage, kind, requestHint });
    if (failure.timedOut) {
      console.error(`[Auth] ${stage} timed out after ${ms}ms`);
    } else {
      console.error(`[Auth] ${stage} failed`, error);
    }
    throw failure;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function summarizeAuthFailure(error) {
  if (!error) return '';
  if (error.timedOut) return `${authStageLabel(error.stage)} timed out`;
  return `${authStageLabel(error.stage)} failed`;
}

export function resolveAuthStateTransition(event, { currentUserId = null, nextUserId = null } = {}) {
  if (event === 'INITIAL_SESSION') return 'ignore';
  if (!nextUserId) return 'signed_out';

  const isSameUser = !!currentUserId && currentUserId === nextUserId;

  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    return isSameUser ? 'quiet_refresh' : 'hydrate';
  }

  if (event === 'SIGNED_IN') {
    return isSameUser ? 'quiet_refresh' : 'hydrate';
  }

  if (event === 'PASSWORD_RECOVERY') {
    return isSameUser ? 'quiet_refresh' : 'hydrate';
  }

  return isSameUser ? 'quiet_refresh' : 'hydrate';
}
