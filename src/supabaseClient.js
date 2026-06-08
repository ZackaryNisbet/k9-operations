// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import { createClient } from '@supabase/supabase-js';
import { isBlockedWrite, shouldScrubResponse, scrubPiiDeep, isComposedNameEndpoint, scrubComposedNames } from './shared/demoMode';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo-mode network chokepoint. Every Supabase query goes through this fetch, so a
// single wrapper can (a) scrub PII out of REST read responses before the app ever
// sees it, and (b) block writes so a Demo account is strictly read-only. When demo
// mode is off this is a transparent passthrough. See src/shared/demoMode.js.
async function demoGuardedFetch(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

  if (isBlockedWrite(url, method)) {
    return new Response(
      JSON.stringify({ message: 'Demo mode is read-only', code: 'DEMO_READONLY' }),
      { status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' } },
    );
  }

  const response = await fetch(input, init);
  if (!shouldScrubResponse(url, method, response.headers.get('content-type'), response.ok)) {
    return response;
  }

  try {
    const data = await response.clone().json();
    let scrubbed = scrubPiiDeep(data);
    if (isComposedNameEndpoint(url)) scrubbed = scrubComposedNames(scrubbed);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(JSON.stringify(scrubbed), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response; // never break the app if a body can't be parsed/scrubbed
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lockAcquireTimeout: 5000, // 5 seconds, then steal orphaned lock to recover
  },
  global: { fetch: demoGuardedFetch },
});
