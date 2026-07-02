**STATUS: COMPLETED** — April 8, 2026 (Session 14)

# Assignment 14.1: Pre-Flight Checks

**Session:** 14
**Estimate:** 20 minutes
**Depends on:** Session 13 complete (all 13.x assignments marked COMPLETED)

---

## Spec Reference

- **§5.6** — Environment variables (all must be set)
- **§5.1** — Stack (Express, Supabase, etc.)
- **§5.4** — Pipeline steps (all 17 steps must have their dependencies available)

## Purpose

Before running the full pipeline, verify that the environment is correctly configured. This prevents wasting time debugging pipeline failures that are actually missing config.

## What to Do

### 1. Verify environment variables

Check that all env vars from §5.6 are set. Run:

```bash
node -e "
  const required = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY',
    'SUPABASE_JWT_SECRET', 'ANTHROPIC_API_KEY', 'FMP_API_KEY',
    'OPENFIGI_API_KEY', 'TINNGO_KEY', 'FINNHUB_KEY', 'FRED_API_KEY',
    'RESEND_API_KEY'
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.log('MISSING:', missing.join(', '));
    process.exit(1);
  } else {
    console.log('All env vars present');
  }
"
```

If running locally, ensure `.env` file exists with all keys. If running on Railway, verify via Railway dashboard.

If any are missing, ask Robert for the values before proceeding.

### 2. Verify server starts

```bash
npx tsc --noEmit && echo "TypeScript OK"
npm run dev
```

Server should start without errors. Check for:
- "Server listening on port 3000" (or whatever PORT is set to)
- No "missing env var" errors
- No Supabase connection errors

### 3. Verify database tables exist

Check that the cache tables from Session 10 migrations exist:

```bash
# Via the API (server must be running)
curl -s http://localhost:3000/api/monitor/health | jq .
```

Or check Supabase directly if the health endpoint reports issues. The key tables:
- `funds` (seed data: ~18 TerrAscend funds)
- `fund_scores` (may be empty if pipeline hasn't run)
- `pipeline_runs`
- `user_profiles`
- `fmp_cache`
- `tiingo_price_cache`
- `finnhub_fee_cache`
- `sector_classifications`
- `holdings_cache`
- `allocation_history`

### 4. Verify fund seed data

```bash
curl -s http://localhost:3000/api/funds \
  -H "Authorization: Bearer <your-jwt>" | jq '.funds | length'
```

Should return ~18 funds. If 0, the `seed_funds.sql` may need to be run.

### 5. Document findings

Create a brief status report at the top of a new file `SESSION_14_PREFLIGHT.md`:

```
# Session 14 Pre-Flight Report
Date: [date]

## Environment
- [ ] All env vars present
- [ ] Server starts clean
- [ ] TypeScript compiles clean
- [ ] Database tables exist
- [ ] Fund seed data present (~18 funds)

## Issues Found
[List any issues, or "None"]
```

## What NOT to Do

- Do NOT run the pipeline yet — that's Task 14.2
- Do NOT modify any source code
- Do NOT create or run migrations — just verify they've been applied
- Do NOT expose API keys in any output or files

## Verification

All checklist items in the pre-flight report are checked. If any fail, document the issue and ask Robert before proceeding to 14.2.

## Rollback

This task makes no code changes. Delete `SESSION_14_PREFLIGHT.md` if needed.
