import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_TIMEOUTS,
  authKindForStage,
  authStageLabel,
  classifyAuthFailure,
  createAuthFailure,
  summarizeAuthFailure,
  withAuthTimeout,
} from '../authRuntime';

describe('authRuntime', () => {
  it('maps auth stages to stable labels and kinds', () => {
    expect(authStageLabel('get_session')).toBe('Session bootstrap');
    expect(authStageLabel('get_my_profile')).toBe('Profile load');
    expect(authKindForStage('get_session')).toBe('auth_unavailable');
    expect(authKindForStage('get_my_profile')).toBe('profile_unavailable');
  });

  it('classifies profile failures separately from auth failures', () => {
    const profileFailure = classifyAuthFailure(new Error('rpc failed'), { stage: 'get_my_profile' });
    const authFailure = classifyAuthFailure(new Error('fetch failed'), { stage: 'sign_in' });

    expect(profileFailure.kind).toBe('profile_unavailable');
    expect(authFailure.kind).toBe('auth_unavailable');
  });

  it('preserves structured auth failures', () => {
    const timeout = createAuthFailure({
      stage: 'get_session',
      message: 'Session bootstrap timed out after 8000ms.',
      timedOut: true,
    });

    expect(classifyAuthFailure(timeout, { stage: 'get_session' })).toBe(timeout);
  });

  it('summarizes timeout failures cleanly', () => {
    const timeout = createAuthFailure({
      stage: 'sign_in',
      message: 'Sign in timed out after 10000ms.',
      timedOut: true,
    });

    expect(summarizeAuthFailure(timeout)).toBe('Sign in timed out');
  });

  it('resolves successful auth work before the timeout', async () => {
    const result = await withAuthTimeout(
      () => Promise.resolve({ ok: true }),
      { stage: 'get_session', ms: AUTH_TIMEOUTS.getSession }
    );

    expect(result).toEqual({ ok: true });
  });

  it('times out stalled auth work with a classified failure', async () => {
    vi.useFakeTimers();
    try {
      const pending = withAuthTimeout(
        () => new Promise(() => {}),
        { stage: 'sign_in', ms: 10 }
      );

      const asserted = expect(pending).rejects.toMatchObject({
        kind: 'auth_unavailable',
        stage: 'sign_in',
        timedOut: true,
      });

      await vi.advanceTimersByTimeAsync(11);
      await asserted;
    } finally {
      vi.useRealTimers();
    }
  });
});
