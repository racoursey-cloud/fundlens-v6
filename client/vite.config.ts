/**
 * FundLens v6 — Vite Configuration
 *
 * Builds the React client SPA. In development, Vite runs on port 5173
 * and proxies API calls to the Express server on port 3000. In production,
 * the build output (client/dist/) is served by Express directly.
 *
 * Session 8 deliverable. Destination: client/vite.config.ts
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to Express during development
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
