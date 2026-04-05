/**
 * FundLens v6 — Express Server
 *
 * Minimal entry point for Railway deployment.
 * This file will grow as we add API routes in later sessions.
 *
 * Destination: src/server.ts
 */

import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Health check — confirms the server is running
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '6.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`FundLens v6 server running on port ${PORT}`);
});
