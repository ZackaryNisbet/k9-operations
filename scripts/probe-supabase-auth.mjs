import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function loadEnvFile(fileName) {
  const filePath = path.join(cwd, fileName);
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

const fileEnv = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;
const timeoutMs = Number(process.env.AUTH_PROBE_TIMEOUT_MS || 10_000);

if (!supabaseUrl || !publishableKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

async function probe(label, relativePath, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout after ${timeoutMs}ms`), timeoutMs);
  const startedAt = new Date().toISOString();
  const started = Date.now();

  try {
    const response = await fetch(`${supabaseUrl}${relativePath}`, {
      ...init,
      headers: {
        apikey: publishableKey,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      label,
      startedAt,
      elapsedMs: Date.now() - started,
      status: response.status,
      requestId: response.headers.get('sb-request-id'),
      body: text.slice(0, 500),
    };
  } catch (error) {
    return {
      label,
      startedAt,
      elapsedMs: Date.now() - started,
      status: null,
      requestId: null,
      error: String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const probes = [
  await probe('auth.health', '/auth/v1/health'),
  await probe('auth.password.invalid', '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'nobody@example.com',
      password: 'wrongpassword123',
    }),
  }),
];

console.log(JSON.stringify({
  supabaseUrl,
  timeoutMs,
  probes,
}, null, 2));
