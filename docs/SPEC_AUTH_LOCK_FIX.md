# SPEC: Auth Lock Crash Fix

## Problem
Users see an unhandled promise rejection on app load:
```
Lock broken by another request with the 'steal' option.
AbortError: Lock broken by another request with the 'steal' option.
```

The app becomes unusable — white screen or error overlay.

## Root Cause
`@supabase/auth-js@2.99.1` uses the browser's `navigator.locks` API internally for all auth operations (`getSession()`, `signInWithPassword()`, etc.). The lock can become "orphaned" (never released) due to:

1. **React StrictMode** — double-mounts components in dev and production-like scenarios, causing `AuthProvider`'s `useEffect` to call `getSession()` twice simultaneously
2. **Tab backgrounding / mobile PWA** — browser kills the lock holder but doesn't release the lock
3. **Stale tabs** — multiple tabs competing for the same auth lock

When Supabase detects an orphaned lock (timeout after ~5s), it uses `{ steal: true }` to forcefully acquire it. This is actually the *recovery* mechanism — but the previous lock holder receives an unhandled `AbortError` that crashes the app because nothing catches it.

## Fix

### A. Add `lockAcquireTimeout` to Supabase client config
In `src/supabaseClient.js`, configure the client with a shorter lock timeout so recovery kicks in faster, and the error is expected behavior:

```js
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lockAcquireTimeout: 5000, // 5 seconds, then steal orphaned lock
  },
});
```

### B. Add global unhandled rejection catcher for lock errors
In `src/main.jsx`, add a handler that suppresses the `AbortError` from lock stealing — this error is expected and the auth library recovers automatically:

```js
// Suppress Supabase auth lock steal errors — these are expected recovery behavior
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.name === 'AbortError' && 
      event.reason?.message?.includes('steal')) {
    event.preventDefault(); // Suppress the error overlay
    console.warn('[Auth] Lock recovered via steal — this is normal');
  }
});
```

### C. Remove React.StrictMode in production (optional but recommended)
`React.StrictMode` double-mounts every component, which triggers two simultaneous `getSession()` calls. This is the primary cause of the lock contention in development and can occasionally affect production builds if the underlying auth state is stale. Consider either:
- Removing `<React.StrictMode>` entirely (simplest)
- Or wrapping it conditionally: `import.meta.env.DEV ? <StrictMode>...</StrictMode> : <Root />`

### D. Guard AuthProvider against double-mount race
Add an `AbortController` or cleanup flag in `AuthProvider.jsx` so that if the component unmounts during `getSession()`, the stale call doesn't compete with the fresh mount's call:

```jsx
useEffect(() => {
  let cancelled = false;
  
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (cancelled) return;
    // ... existing logic
  });
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (cancelled) return;
    // ... existing logic
  });
  
  return () => {
    cancelled = true;
    subscription.unsubscribe();
  };
}, []);
```

## Files to Modify
- `src/supabaseClient.js` — add auth config
- `src/main.jsx` — add unhandled rejection handler
- `src/AuthProvider.jsx` — add cancellation guard
- Optionally: remove `<React.StrictMode>` from `src/main.jsx`

## Testing
1. Clear browser storage / open incognito
2. Load the app — should authenticate without error overlay
3. Open a second tab — both should work without lock errors
4. Background the tab for 30s, return — should recover gracefully
5. Fast-refresh during development — should not crash
