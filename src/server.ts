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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes/routes.js';
import { SERVER, ENV_KEYS, CRITICAL_ENV_KEYS } from './engine/constants.js';
import { startCronJobs, stopCronJobs } from './engine/cron.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Railway runs behind a reverse proxy — trust it for correct IP resolution.
// Required by express-rate-limit to read X-Forwarded-For headers.
app.set('trust proxy', 1);

// ─── Middleware ──────────────────────────────────────────────────────────────

// Parse JSON request bodies
app.use(express.json());

// SESSION 0 SECURITY: Helmet sets security headers (CSP, X-Frame-Options, etc.)
// In production, configure CSP to allow Supabase auth/API connections.
// The Supabase JS client makes fetch requests directly from the browser
// for magic link auth, session refresh, etc. Helmet's default CSP blocks
// cross-origin requests (connect-src 'self'), which breaks auth entirely.
app.use(helmet({
  contentSecurityPolicy: SERVER.IS_PRODUCTION
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: [
            "'self'",
            'https://*.supabase.co',   // Supabase auth + REST API
            'wss://*.supabase.co',     // Supabase realtime (future use)
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      }
    : false, // Disable CSP in dev (Vite HMR)
}));

// CORS — allow the React client to talk to the API during development.
// SESSION 0 SECURITY: Explicit production origins, default restrictive.
app.use(cors({
  origin: SERVER.IS_PRODUCTION
    ? ['https://fundlens.app', 'https://www.fundlens.app']
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// SESSION 0 SECURITY: Global rate limiting — 100 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
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

// SESSION 0 SECURITY: Critical env vars crash the server. Others warn.
function validateEnv(): void {
  // Critical keys: server MUST NOT start without these
  const missingCritical: string[] = [];
  for (const key of CRITICAL_ENV_KEYS) {
    if (!process.env[key]) {
      missingCritical.push(key);
    }
  }
  if (missingCritical.length > 0) {
    console.error(
      `[server] FATAL: Missing critical environment variables: ${missingCritical.join(', ')}. ` +
      `Server cannot start safely without these.`
    );
    process.exit(1);
  }

  // Non-critical keys: warn but continue
  const missingOther: string[] = [];
  for (const key of ENV_KEYS) {
    if (!process.env[key] && !CRITICAL_ENV_KEYS.includes(key)) {
      missingOther.push(key);
    }
  }
  if (missingOther.length > 0) {
    console.warn(
      `[server] Warning: Missing environment variables: ${missingOther.join(', ')}. ` +
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
