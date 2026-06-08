/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function localApiRoutesPlugin() {
  return {
    name: 'k9-local-api-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/interview-normalize-audio', async (req, res) => {
        try {
          const { default: handler } = await import('./api/interview-normalize-audio.js');
          await handler(req, res);
        } catch (error) {
          console.error('Local interview audio API failed', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(JSON.stringify({ error: error?.message || 'Local interview audio API failed.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] == null) process.env[key] = value;
  }

  return {
    plugins: [react(), localApiRoutesPlugin()],
    test: {
      globals: true,
      environment: 'node',
      // Harmless defaults so modules that build the Supabase client at import time
      // (src/supabaseClient.js) can load in a bare checkout / CI with no .env present.
      // Tests never hit a real backend (they mock Supabase or test pure logic), so
      // these dummy values only stop createClient() from throwing "supabaseUrl is
      // required" and breaking unrelated test files at import time.
      env: {
        VITE_SUPABASE_URL: 'http://localhost:54321',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
      // Heavy PDF/ffmpeg tests can exceed the 5s default under constrained CPU
      // (CI / build containers), causing flaky timeouts. Give them headroom.
      testTimeout: 30000,
      hookTimeout: 30000,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2020',
      rollupOptions: {
        output: {
          // Mangle all property names starting with _ to obscure internals
          manualChunks: undefined,
        },
      },
    },
    esbuild: {
      // Strip console.log, console.warn, console.error, debugger in production
      drop: ['console', 'debugger'],
      // Aggressive minification
      legalComments: 'none',
    },
  };
});
