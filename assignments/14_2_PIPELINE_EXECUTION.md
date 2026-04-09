# Assignment 14.2: Run Full Pipeline Against Real Data

**Session:** 14
**Estimate:** 30 minutes (pipeline runtime + monitoring)
**Depends on:** 14.1 (pre-flight passed)

---

## Spec Reference

- **§5.4** — Pipeline steps 1–17
- **§5.3** — API call delay 250ms, Claude call delay 1200ms, sequential Claude calls

## Purpose

Run the full scoring pipeline against the real ~18-fund TerrAscend universe. This is the first end-to-end test after 12 sessions of changes.

## What to Do

### 1. Trigger the pipeline

With the server running, trigger a pipeline run:

```bash
curl -X POST http://localhost:3000/api/pipeline/run \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json"
```

Note the `runId` from the response.

### 2. Monitor progress

Watch the server console output for progress. The pipeline should log each step:
- Step 1: Fund list fetched
- Step 2: EDGAR holdings fetched per fund
- Step 3: CUSIP resolution
- Step 4: FMP fundamentals (may hit cache)
- Step 5: Claude classification (sequential, 1.2s delays)
- Step 6: Holdings quality scored
- Step 7: Fee data fetched (Finnhub, may hit cache)
- Step 8: Prices fetched (Tiingo, may hit cache)
- Step 9: Momentum scored
- Step 10: RSS + FRED data fetched
- Step 11: FRED sector priors computed
- Step 12: Thesis generated (Claude Sonnet)
- Step 13: Positioning scored
- Step 14: Composite scoring (z-space + CDF)
- Step 15: Persist to Supabase
- Step 16: Brief generation (if triggered)
- Step 17: Allocation history persisted

### 3. Record the outcome

For each step, note:
- **Pass/Fail** — did the step complete?
- **Cache hit/miss** — did caching work? (Steps 4, 7, 8, 5 should hit cache on second run)
- **Warnings** — any non-fatal issues? (e.g., CUSIP resolution failures, fallback data used)
- **Errors** — any errors caught by try/catch? (Pipeline should continue with fallbacks)
- **Timing** — approximate time per step if visible in logs

### 4. Check pipeline status

```bash
curl -s http://localhost:3000/api/pipeline/status \
  -H "Authorization: Bearer <your-jwt>" | jq .
```

Should show status: "completed" with `fundsProcessed` ≈ 18 and `fundsSucceeded` > 0.

### 5. Check scores exist

```bash
curl -s http://localhost:3000/api/scores \
  -H "Authorization: Bearer <your-jwt>" | jq '.scores | length'
```

Should return ~18 (one score per fund).

### 6. Document results

Add to `SESSION_14_PREFLIGHT.md` (or create a new section):

```
## Pipeline Execution
- Start time: [time]
- End time: [time]
- Total runtime: [minutes]
- Funds processed: [N]
- Funds succeeded: [N]
- Funds failed: [N]

### Step-by-Step Results
| Step | Status | Notes |
|------|--------|-------|
| 1. Fund list | PASS/FAIL | [notes] |
| 2. EDGAR holdings | PASS/FAIL | [notes] |
... (all 17 steps)

### Errors / Warnings
[List any errors or warnings observed]
```

## What NOT to Do

- Do NOT modify any source code during this task — just observe and document
- Do NOT retry failed steps manually — document the failure for 14.7
- Do NOT stop the pipeline if individual funds fail — let it complete
- Do NOT run the pipeline multiple times unless the first run crashes entirely

## Verification

Pipeline completes (status: "completed"). At least some funds have scores in the database. All observations documented.

## Rollback

This task makes no code changes. Pipeline results are in the database; they can be re-run if needed.
