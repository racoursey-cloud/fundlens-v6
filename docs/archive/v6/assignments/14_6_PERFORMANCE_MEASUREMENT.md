# Assignment 14.6: Performance Measurement

**Session:** 14
**Estimate:** 15 minutes
**Depends on:** 14.2 (pipeline has completed at least once)

---

## Spec Reference

- **§5.3** — API call delay 250ms, Claude call delay 1200ms
- **MISSING-13 (resolved)** — Pipeline performance target: <3 minutes (was 9 minutes pre-Session 10)

## Purpose

Measure pipeline execution time and identify bottlenecks. The target is <5 minutes for a full 18-fund pipeline run (with warm caches, <3 minutes).

## What to Do

### 1. Record first-run timing

From the 14.2 pipeline run, calculate total runtime:
```
Total = completed_at - started_at
```

This was a cold-cache run (first run after Session 13 changes). Note it as the "cold" baseline.

### 2. Run the pipeline a second time (warm cache)

```bash
curl -X POST http://localhost:3000/api/pipeline/run \
  -H "Authorization: Bearer <your-jwt>"
```

Time this run. Cache layers should be warm (FMP 7-day, Tiingo 1-day, Finnhub 90-day, sector classifications 15-day), so this run should be significantly faster.

### 3. Identify time-consuming steps

From server logs, identify which steps take the most time:
- EDGAR fetches (network-bound, 18 fetches)
- FMP fundamentals (sequential, 250ms delay between calls)
- Claude classification (sequential, 1200ms delay per batch)
- Claude thesis generation (single call, ~10-30 seconds)
- Claude Brief generation (single call, ~30-60 seconds)

### 4. Document findings

```
## Performance Measurement

### Cold Cache Run (First Run)
- Total time: [minutes:seconds]
- Funds processed: [N]

### Warm Cache Run (Second Run)
- Total time: [minutes:seconds]
- Funds processed: [N]

### Bottleneck Analysis
| Step | Approx Time | Notes |
|------|-------------|-------|
| EDGAR fetches | [time] | [cached? network issues?] |
| FMP fundamentals | [time] | [cache hits?] |
| Claude classification | [time] | [N batches × 1.2s each] |
| Claude thesis | [time] | [single call] |
| Scoring + persist | [time] | [compute-bound] |

### Meets Target?
- Cold cache: [time] vs <5 min target — PASS/FAIL
- Warm cache: [time] vs <3 min target — PASS/FAIL

### Optimization Opportunities (if any)
[List any obvious bottlenecks that could be improved]
```

## What NOT to Do

- Do NOT modify any source code to "optimize" during this task — just measure
- Do NOT run more than 2 pipeline runs (API rate limits)
- Do NOT skip the warm-cache run — it's the more realistic benchmark

## Verification

Both cold and warm timings recorded. Bottlenecks identified. Findings documented.
