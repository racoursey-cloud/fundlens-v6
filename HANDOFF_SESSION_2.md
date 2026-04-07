# FundLens v6 Pipeline Debugging — Session 2 Handoff

**Date**: April 6, 2026
**Owner**: Robert Coursey (racoursey@gmail.com)
**Status**: Pipeline producing partial real scores — 4/12 funds differentiated, rest defaulting to 50

---

## What We Did This Session

### 1. Restored OpenFIGI CUSIP Resolver (was broken — FMP CUSIP endpoint returns 403 on Starter plan)

The v6 rebuild switched CUSIP-to-ticker resolution from OpenFIGI (used in v5.1) to FMP's CUSIP endpoint. That endpoint requires the Professional plan ($99/mo) — it returns HTTP 403 on the $19/mo Starter plan. This was the root cause of every fund scoring 50/100 (no tickers → no fundamentals → all defaults).

**Files changed:**

- `src/engine/cusip.ts` — Full rewrite. Restored OpenFIGI v3 batch POST implementation from git commit 9098ee4. Sends CUSIPs in batches of 100 to `POST https://api.openfigi.com/v3/mapping`, with conditional `X-OPENFIGI-APIKEY` header. Prefers US-listed equities when multiple results returned. Includes persistent Supabase cache (cusip_cache table).

- `src/engine/constants.ts` — Added OPENFIGI constant block:
  ```typescript
  export const OPENFIGI = {
    BASE_URL: 'https://api.openfigi.com/v3/mapping',
    BATCH_SIZE: 100,
  } as const;
  ```
  Also added `'OPENFIGI_API_KEY'` to the `ENV_KEYS` array.

- `src/engine/pipeline.ts` — Changed line 116 from `process.env.FMP_API_KEY` to `process.env.OPENFIGI_API_KEY`. Variable renamed from `fmpKey` to `openFigiKey`. Passed to `runHoldingsPipeline()`.

- `src/engine/types.ts` — Added `FigiMappingJob` and `FigiResult` interfaces. Updated `CusipResolution` comment from "FMP" to "OpenFIGI".

**Environment**: `OPENFIGI_API_KEY=274b6dd6-2401-4557-88f5-bc4dfafda806` added to Railway.

### 2. Fixed Coverage Cutoff Bug (previous session, confirmed working)

`HOLDINGS_COVERAGE.TARGET_WEIGHT_PCT` was `0.65` but NPORT-P pctVal reports whole percentages (4.89 = 4.89%). Changed to `65` in `src/engine/constants.ts`. Now correctly including ~65% of fund weight before cutoff.

### 3. OpenFIGI API Key Setup

Robert's original OpenFIGI key (from v5.1) was missing/expired. OpenFIGI requires a corporate email for registration. We set up:
- **ImprovMX** email forwarding on fundlens.app domain (MX records in GoDaddy DNS)
- robert@fundlens.app → racoursey@gmail.com
- Signed up at OpenFIGI with new corporate email
- New API key: `274b6dd6-2401-4557-88f5-bc4dfafda806`

### 4. Reverted seriesId Filtering (previous session)

An overengineered seriesId filter was added to `edgar.ts` that caused fund count to drop from 18→12 and runtime to spike from 2min→9min. Reverted to simple first-match `findLatestNportFiling()`.

---

## Current Pipeline Results (post-OpenFIGI restore)

Pipeline run completed with 12 scored funds. OpenFIGI CUSIP resolution is working:

| Fund | CUSIP Resolution | Cost | Quality | Position | Momentum | Score |
|------|-----------------|------|---------|----------|----------|-------|
| FXAIX | High | 50 | 99 | 65 | 75 | 73.5 |
| RTRIX | 3/3 | 50 | 89 | 55 | 50 | ~61 |
| BGHIX | High | 50 | 80 | 75 | 54 | ~65 |
| FSPGX | High | 50 | 32 | 74 | 95 | ~58 |
| PRPFX | 21/21 | 50 | 50 | 75 | 50 | 56.3 |
| HRAUX | ? | 50 | 50 | 75 | 50 | 56.3 |
| VFWAX | 0/13 | 50 | 50 | 50 | 50 | 50.0 |
| WEGRX | ? | 50 | 50 | 47 | 50 | 49.3 |
| TGEPX | ? | 50 | 50 | 45 | 50 | 48.8 |
| VADFX | 34/45 | 50 | 50 | 39 | 50 | 47.3 |
| MWTSX | ? | 50 | 50 | 35 | 50 | 46.3 |
| WFPRX | 10/10 | 50 | 50 | 25 | 50 | ~43.8 |

### Key Observations

**Only 4 funds have differentiated Quality scores.** After FXAIX/RTRIX/BGHIX/FSPGX, Quality is 50 for everything else — even PRPFX (21/21 CUSIPs resolved) and WFPRX (10/10 resolved).

**Cost Efficiency is 50 for ALL funds.** This factor is independent of CUSIP resolution — it uses `fund.expense_ratio` passed directly. Either expense_ratio is null for all funds, or the scoring function has an issue. See `scoreCostEfficiency()` in pipeline.ts step 7.

**Position scores vary** — this factor works off sector classifications (Claude Haiku) and macro thesis alignment. Some differentiation happening.

**Momentum is mostly 50** — depends on FMP historical prices. Only FXAIX (75) and FSPGX (95) show non-default. Others likely can't fetch prices for their holding tickers.

---

## Open Issues to Investigate

### Issue 1: Quality score defaults to 50 even with resolved tickers

**Root cause theory**: FMP's `/stable/ratios` and `/stable/key-metrics` endpoints return empty arrays for non-equity holdings (ETFs, bonds, treasuries, gold, REITs). When `fetchFundamentalsBundle()` gets empty arrays, it sets `ratios: null, keyMetrics: null`, and the quality scorer skips those holdings.

**But**: PRPFX has 21 resolved tickers and still scores 50. Need to verify whether those tickers are equity tickers that FMP should have data for, or if they're all ETFs/non-equity.

**The deeper problem**: The pipeline has **no logging for FMP fundamentals results**. The try/catch in pipeline.ts lines 151-157 silently swallows all errors:
```typescript
try {
  const bundle = await fetchFundamentalsBundle(ticker);
  fundamentals.set(ticker, bundle);
} catch (err) {
  fundamentals.set(ticker, { ratios: null, keyMetrics: null });
}
```

`fmpFetch()` in fmp.ts DOES log HTTP errors (`[fmp] HTTP ${status}`), but returns null for empty arrays without logging. We need to add logging to see: how many tickers get ratios vs null, and which tickers fail.

### Issue 2: Cost Efficiency stuck at 50 for all funds

Check `scoreCostEfficiency()` — it receives `fund.expense_ratio`. If that field is null for all funds in the `funds` array passed to the pipeline, Cost will always default. Where does expense_ratio come from? The `funds` table in Supabase. Need to verify those rows have expense_ratio populated.

### Issue 3: Momentum mostly defaulting

Similar to quality — FMP historical price API needs valid equity tickers. Bond fund tickers, money market tickers, etc. won't have price histories in FMP.

### Issue 4: Coverage display bug (cosmetic)

Log output shows "6585.1% coverage" instead of "65.85%". The cumulative pctVal sum is correct (whole percentages) but the display multiplies by 100 again. Cosmetic only — cutoff logic works correctly.

### Issue 5: Log still says "Resolving CUSIPs via FMP"

Old log message in `holdings.ts` — should say "via OpenFIGI". Cosmetic only.

### Issue 6: 5 funds still fail EDGAR lookup

- OIBIX, BPLBX, ADAXX: Not in SEC mutual fund ticker list (company_tickers_mf.json)
- FDRXX: Files N-MFP2 (money market form) not NPORT-P
- 1 more unknown

---

## Architecture Reference

### Pipeline Steps (14 total)
1. Fund list (from Supabase `funds` table)
2. EDGAR NPORT-P: fetch holdings + resolve CUSIPs via OpenFIGI
3. Holdings summary
4. FMP fundamentals: fetch ratios + key metrics per unique ticker
5. Sector classification: Claude Haiku classifies each holding
6. Score Holdings Quality factor
7. Score Cost Efficiency factor
8. Fetch momentum data (FMP historical prices)
9. Score Momentum factor (cross-sectional)
10. Score Positioning factor (thesis alignment)
11. Composite scoring (weighted: Cost 25%, Quality 30%, Position 25%, Momentum 20%)
12. Persist to Supabase (fund_scores, holdings_cache, pipeline_runs)
13. Generate Investment Brief (Claude Sonnet)
14. Complete

### Key Files
- `src/engine/pipeline.ts` — 14-step orchestrator
- `src/engine/cusip.ts` — OpenFIGI CUSIP→ticker resolver (just restored)
- `src/engine/holdings.ts` — Holdings pipeline: EDGAR fetch → cutoff → CUSIP resolve
- `src/engine/edgar.ts` — SEC EDGAR NPORT-P XML parser
- `src/engine/fmp.ts` — FMP API client (ratios, key metrics, prices, profiles)
- `src/engine/quality.ts` — Holdings Quality scoring (5 dimensions, 25+ ratios)
- `src/engine/cost.ts` — Cost Efficiency scoring
- `src/engine/momentum.ts` — Momentum factor scoring
- `src/engine/positioning.ts` — Positioning/thesis alignment scoring
- `src/engine/constants.ts` — All thresholds, weights, API config
- `src/engine/types.ts` — Shared TypeScript interfaces

### Environment Variables (Railway)
- `OPENFIGI_API_KEY` — 274b6dd6-... (just added)
- `FMP_API_KEY` — Still needed for fundamentals, prices, profiles
- `ANTHROPIC_API_KEY` — For Claude Haiku (classification) and Sonnet (briefs)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `FRED_API_KEY` — Macro data
- `TINNGO_KEY` — (intentional typo, do not correct)
- `RESEND_API_KEY` — Email delivery

### Workflow
Robert edits files locally → commits via GitHub Desktop → pushes → Railway auto-deploys from GitHub.

---

## v5.1 Context

Robert reported that v5.1 was producing differentiated scores as of Saturday morning (April 4) but now also shows flat 5.0 scores (v5.1 uses a 1-10 scale, so 5.0 = 50/100). This suggests the original OpenFIGI key expired or was invalidated when the new account was created. The new OpenFIGI key should fix both v5.1 and v6 if added to both Railway environments.

Robert is considering comparing v5.1 output vs v6 output to evaluate whether v6 is worth continuing or if rolling back to v5.1 is the better path. The next session should be prepared to support that comparison.

---

## Recommended Next Steps

1. **Add diagnostic logging to FMP fundamentals fetch** — Log how many tickers get ratios vs null, and log any HTTP errors. This is the biggest blind spot right now.

2. **Check Supabase `funds` table for expense_ratio values** — If they're all null, Cost Efficiency will never score above 50.

3. **Investigate PRPFX holding types** — This fund resolved 21/21 CUSIPs but scored Quality 50. Need to know if those tickers are equities (FMP should have data) or ETFs/bonds/commodities (FMP won't have ratios).

4. **Consider graceful degradation for non-equity funds** — Bond funds, money markets, and international funds will never have FMP fundamentals. The scoring engine should handle these differently rather than defaulting everything to 50.

5. **Run v5.1 vs v6 comparison** — Robert wants to see both side by side to decide the path forward.
