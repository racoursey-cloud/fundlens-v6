# FundLens v6 — Session 5 Handoff

**Date:** April 7, 2026
**Previous session:** Session 4 (z-space + CDF scoring engine) + Session 4 continuation (production fixes + Finnhub integration)
**Repo:** `racoursey-cloud/fundlens-v6` on GitHub (private)
**Branch:** `main`
**Spec:** `FUNDLENS_SPEC.md` (read it first — it is the single source of truth)

---

## What Was Done in Session 4 + Continuation

### Session 4 (Primary)
Rewrote the composite scoring engine in `scoring.ts` to implement the z-space + CDF pipeline from spec §2.1. This is the mathematical heart of FundLens. Key deliverables:
- `normalCDF()` — Abramowitz & Stegun 7.1.26 approximation
- `zStandardize()` — Bessel-corrected (n-1)
- `scoreAndRankFunds()` — full z-space + CDF pipeline
- `computeCompositeFromZScores()` — client-side rescore function
- Z-scores persisted to `fund_scores` table for client-side slider rescore
- Client-side `Portfolio.tsx` uses z-scores + CDF for instant slider feedback
- Validated against §2.8 worked example: Fund A=84, B=41, C=40, D=31

### Session 4 Continuation (Production Fixes)
Diagnosed and fixed three production issues after deploying Session 4:

1. **Helmet CSP blocking Supabase auth** — App stuck on "Loading..." in production. The default Helmet CSP blocked cross-origin Supabase requests. Fixed with explicit CSP directives in `server.ts` allowing `https://*.supabase.co` and `wss://*.supabase.co`.

2. **Empty sector exposure donut chart** — Client reads `factor_details.sectorExposure` but pipeline wasn't populating it. Fixed in `pipeline.ts` (builds sectorExposure map from classified holdings) and `scoring.ts` (added field to interface).

3. **Cost=50 for ALL funds** — Root cause: no expense ratio data. The spec incorrectly claimed Tiingo provides fee data (endpoint returns 404) and NPORT-P contains expense ratios (it doesn't). The actual working source was **Finnhub** (`/api/v1/mutual-fund/profile`), which was the primary in v5.1 but was incorrectly dropped during the v6 rebuild planning. Created `finnhub.ts` with full lookup chain: Finnhub → FMP → static fallback. Added pipeline Step 7a to auto-fetch and persist expense ratios.

---

## Pre-Flight Checklist (Do These BEFORE Coding)

### 1. Add FINNHUB_KEY to Railway Environment Variables
The Finnhub API key needs to be set in Railway for the v6 deployment:
```
FINNHUB_KEY=d6nmeapr01qse5qm8t70d6nmeapr01qse5qm8t7g
```
Without this, Step 7a will skip Finnhub and fall back to FMP/static data.

### 2. Run the Pipeline
After adding the Finnhub key, trigger a pipeline run to verify:
- Finnhub returns expense ratios for TerrAscend fund tickers
- Expense ratios are persisted to the `funds` table
- Cost scores now differentiate (no longer all 50)
- Sector exposure donut chart populates
- All existing functionality still works

### 3. Optional: Run Seed SQL as Immediate Unblock
If Finnhub verification takes time, `migrations/populate_expense_ratios.sql` can be run in Supabase SQL Editor to seed all 22 funds with prospectus expense ratios immediately.

---

## Session 5 Scope (from §9.5 Build Roadmap)

### Primary: Factor Upgrades

**CRITICAL-2: Momentum — Missing Volatility Adjustment (§2.5.2)**
- File: `src/engine/momentum.ts`
- Spec requires: `vol_adjusted_return = blended_return / period_vol` where `period_vol = daily_vol × √(trading_days)`
- Code does: uses raw blended returns for ranking
- Impact: High-volatility funds dominate the momentum signal

**CRITICAL-3: Momentum — Missing Z-Score + CDF Scoring (§2.5.3)**
- File: `src/engine/momentum.ts`, function `scoreMomentumCrossSectional()`
- Spec requires: z-score (Bessel) → winsorize ±3 sigma → CDF map to 0-100
- Code does: linear rank-to-score `95 - (rank / (n-1)) * 90`
- Impact: Wrong distribution shape, doesn't handle edge cases per spec

**MISSING-2: Bond Quality Scoring (§2.4.2, §2.4.3)**
- File: `src/engine/quality.ts`
- Spec: Issuer Category Quality Map (UST=1.00, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50)
- Distressed adjustments: isDefault=Y → 0.10, fairValLevel=3 → 0.35, debtInArrears=Y → 0.35
- Blended equity/bond scoring for mixed funds

**MISSING-3: Coverage-Based Confidence Scaling (§2.4.1)**
- File: `src/engine/quality.ts`, `src/engine/pipeline.ts`
- Spec: If coverage_pct < 0.40, reduce quality weight proportionally, freed weight → momentum

### Secondary: Finnhub Fee Data Enhancement

Finnhub's `/api/v1/mutual-fund/profile` returns more than just `expenseRatio`. It also provides:
- `fee12b1` — 12b-1 marketing fees (percentage)
- `frontLoad` — front-end load fees
- `category` — fund category (e.g. "Large Blend", "Intermediate Bond")

The 12b-1 penalty logic already exists in `cost-efficiency.ts` (Session 3). What's needed:
1. Have `fetchFinnhubExpenseRatio()` in `finnhub.ts` return `fee12b1` and `frontLoad` alongside `expenseRatio`
2. Wire these into the `NormalizedFeeData` path that `scoreCostEfficiency()` already accepts
3. This completes the "enhanced expense analysis" feature from §2.3

### Cleanup (Nice to Have)
- Remove dead `fetchFundFees()` from `tiingo.ts` (the fee endpoint doesn't exist)
- Remove the Tiingo fee data path from pipeline Step 7b (currently logs but returns no data)

---

## Architecture Notes for Session 5

### Files You'll Touch
- `src/engine/momentum.ts` — CRITICAL-2 and CRITICAL-3 (vol adjustment + z-score/CDF)
- `src/engine/quality.ts` — MISSING-2 (bond scoring) and MISSING-3 (coverage scaling)
- `src/engine/pipeline.ts` — wire coverage scaling, possibly update momentum call
- `src/engine/finnhub.ts` — extend return type to include fee12b1, frontLoad
- `src/engine/cost-efficiency.ts` — wire Finnhub fee data into NormalizedFeeData path
- `src/engine/tiingo.ts` — cleanup dead fee code (optional)

### Key Patterns
- All Claude calls sequential with 1.2s delays (CLAUDE_CALL_DELAY_MS). NEVER Promise.all().
- All API calls have 500ms delays (API_CALL_DELAY_MS).
- Scoring operates in z-space (Session 4). Raw scores → z-standardize → weighted composite → CDF → 0-100.
- Client-side rescore uses pre-computed z-scores from Supabase. Only the weighted sum + CDF runs client-side.

### Supabase Project
- Project ID: `ymrcbpfoveqpvucsmoyv`
- Access via Supabase dashboard or `supaFetch()` pattern in code
- All server queries use service_role key via Express proxy

### Data Source Summary
| Data | Source | File |
|------|--------|------|
| Fund holdings | SEC EDGAR NPORT-P | edgar.ts, holdings.ts |
| CUSIP → ticker | OpenFIGI → FMP search fallback | cusip.ts |
| Company fundamentals | FMP Starter (/stable/) | fmp.ts |
| Fund NAV prices | Tiingo (primary) → FMP (fallback) | tiingo.ts, fmp.ts |
| Expense ratios | Finnhub (primary) → FMP → static map | finnhub.ts |
| Sector classification | Claude Haiku | classify.ts |
| Macro thesis | Claude Sonnet + FRED + RSS | thesis.ts, fred.ts, rss.ts |
| Investment Brief | Claude Opus | brief-engine.ts |

---

## Session 5 Handoff Prompt

```
You are continuing the FundLens v6 build. This is Session 5.

Read FUNDLENS_SPEC.md first — it is the single source of truth. Pay special attention to:
- §2.5 (Momentum factor — vol adjustment + z-score/CDF)
- §2.4.2, §2.4.3 (Bond quality scoring + blended scoring)
- §2.4.1 (Coverage-based confidence scaling)
- §9.2 (CRITICAL-2, CRITICAL-3) and §9.3 (MISSING-2, MISSING-3)
- §10 changelog (Session 4 continuation — explains Finnhub integration and what changed)

Pre-flight:
1. Verify FINNHUB_KEY is set in Railway environment variables
2. Run pipeline to verify Session 4 continuation fixes (expense ratios, sector donut, CSP)
3. Confirm Cost scores now differentiate across funds

Primary deliverables:
1. CRITICAL-2: Add volatility adjustment to momentum scoring (§2.5.2)
2. CRITICAL-3: Replace linear rank scoring with z-score + CDF in momentum (§2.5.3)
3. MISSING-2: Implement bond quality scoring with issuer category map (§2.4.2)
4. MISSING-3: Implement coverage-based quality weight redistribution (§2.4.1)

Secondary:
5. Wire Finnhub fee12b1 data into the NormalizedFeeData path for cost-efficiency scoring
6. Clean up dead Tiingo fee code

Repo: racoursey-cloud/fundlens-v6 (GitHub, private)
Branch: main
GitHub PAT: (ask Robert if not configured)

After completing all deliverables:
- Update FUNDLENS_SPEC.md §9 status and §10 changelog
- Run tsc --noEmit to verify clean compilation
- Commit and push all changes
- Write HANDOFF_SESSION_6.md
```
