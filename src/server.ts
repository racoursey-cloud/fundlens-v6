/**
 * FundLens v6 — Express Server
 *
 * Entry point for Railway deployment. Serves the Express API routes
 * and (eventually) the React client build.
 *
 * Updated in Session 5 to wire up API routes and middleware.
 * Updated in Session 7 to start cron jobs on boot.
 * Updated in Session 8 to serve the React client build.
 * Destination: src/server.ts
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes/routes.js';
import { SERVER, ENV_KEYS } from './engine/constants.js';
import { startCronJobs, stopCronJobs } from './engine/cron.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────

// Parse JSON request bodies
app.use(express.json());

// CORS — allow the React client to talk to the API during development.
// In production, the React build is served from the same Express server,
// so CORS isn't needed. But during development, Vite runs on a different port.
app.use(cors({
  origin: SERVER.IS_PRODUCTION
    ? false                    // Same-origin in production
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,           // Allow cookies/auth headers
}));

// ─── Health Check ───────────────────────────────────────────────────────────
// Public endpoint — no auth required. Used by Railway to verify deployment.

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '6.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
// All /api/* routes are defined in routes.ts

app.use(router);

// ─── Static Files (React Client) ───────────────────────────────────────────
// In production, serve the Vite build output. The React client is a
// single-page app — all non-API routes serve index.html so that
// React Router can handle client-side navigation.

if (SERVER.IS_PRODUCTION) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));

  // SPA fallback — any route that isn't /api/* or /health serves index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── Startup ────────────────────────────────────────────────────────────────

// Validate environment variables at startup (warn, don't crash)
function validateEnv(): void {
  const missing: string[] = [];
  for (const key of ENV_KEYS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.warn(
      `[server] Warning: Missing environment variables: ${missing.join(', ')}. ` +
      `Some features may not work.`
    );
  }
}

validateEnv();

const server = app.listen(SERVER.PORT, () => {
  console.log(
    `FundLens v6 server running on port ${SERVER.PORT} ` +
    `(${SERVER.IS_PRODUCTION ? 'production' : 'development'})`
  );

  // Start cron jobs after server is listening.
  // In production, this schedules the pipeline and Brief delivery runs.
  // In development, cron jobs still run (useful for testing), but the
  // pipeline won't produce real results without valid API keys.
  startCronJobs();
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────
// Railway sends SIGTERM before stopping the container. Clean up cron jobs
// and close the server so in-flight requests can finish.

function gracefulShutdown(signal: string): void {
  console.log(`[server] Received ${signal} — shutting down gracefully`);
  stopCronJobs();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 30 seconds if server doesn't close cleanly
  setTimeout(() => {
    console.error('[server] Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
