import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
});
