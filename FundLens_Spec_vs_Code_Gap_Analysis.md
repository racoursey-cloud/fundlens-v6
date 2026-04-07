# FundLens v7 Spec-vs-Code Gap Analysis

**Generated:** April 7, 2026 (overnight Session 0 → Session 1)
**Spec version:** FUNDLENS_SPEC.md v7.0
**Codebase:** fundlens-v6 (current main branch)

---

## Summary

After a line-by-line comparison of every section of FUNDLENS_SPEC.md against the actual codebase, I identified **20 gaps** — 7 Critical (math/logic wrong), 8 High (missing features per spec), and 5 Medium (cosmetic or deferred).

### Critical Count by Session

| Session | Fixes Required |
|---------|---------------|
| Session 1: Constants/Types/Kelly | 5 (factor weights, risk scale, Kelly table, tier badges, Brief model) |
| Session 4: Scoring Engine | 2 (z-space + CDF composite, momentum z-score + CDF) |
| Session 5: Factor Upgrades | 3 (12b-1 fee, bond scoring, coverage confidence) |
| Session 6: Thesis Overhaul | 3 (1-10 scale, FRED commodities, deterministic priors) |
| Session 7: Allocation Engine | 1 (full Kelly rewrite) |
| Session 8: UI Alignment | 1 (risk slider 1-7) |

---

## CRITICAL Gaps (Math or Logic Wrong)

### C-1: Default Factor Weights Swapped (§2.2)
**File:** `constants.ts` line 11-16
**Spec:** Cost 25%, Quality 30%, **Momentum 25%**, **Positioning 20%**
**Code:** Cost 25%, Quality 30%, **Positioning 25%**, **Momentum 20%**
**Impact:** Momentum and Positioning weights are reversed. Every composite score calculated with defaults has been wrong. Momentum (strongest academic evidence per spec rationale) is underweighted vs Positioning.
**Fix:** Swap values in `DEFAULT_FACTOR_WEIGHTS`.

### C-2: Scoring Engine Missing Z-Space + CDF (§2.1)
**File:** `scoring.ts` lines 95-106
**Spec:** 4-step process: (1) raw scores, (2) z-standardize each factor (Bessel-corrected), (3) weighted composite in z-space, (4) map via normal CDF back to 0-100.
**Code:** Simple weighted average: `raw.cost * w.cost + raw.quality * w.quality + ...` then clamp to 0-100.
**Impact:** This is the single most important formula in the system. Without z-standardization, factors with wider natural ranges dominate the composite. Without CDF mapping, scores cluster linearly instead of following the S-curve distribution the spec requires.
**Fix:** Implement `computeComposite()` as z-standardize → weight → CDF. This affects both server-side pipeline scoring AND client-side slider rescoring.

### C-3: Risk Scale 1-9 Instead of 1-7 (§3.4, §6.4)
**Files:** `types.ts` line 297, `routes.ts` lines 360-368 and 402-404, `brief-engine.ts` lines 43-48 and 357 and 434
**Spec:** 7-point slider labeled "Investment Style", "Very Conservative" (1) to "Very Aggressive" (7), default 4.
**Code:** Validates 1-9 everywhere. `riskLabel()` maps 1-9. Allocation threshold `(riskTolerance - 1) / 8` assumes 1-9.
**Impact:** All allocation calculations use wrong scale. User profiles stored with wrong range.
**Fix:** Change all validation to 1-7, update riskLabel(), update allocation math. Requires DB migration for existing profiles.

### C-4: Allocation Engine Wrong Algorithm (§3.1-3.6)
**File:** `brief-engine.ts` lines 318-413
**Spec:** MAD-based modified z-scores → quality gate (4+ fallbacks excluded) → exponential curve `e^(k × mod_z)` using Kelly fraction k → normalize → 5% de minimis floor → rounding with error absorption into largest position.
**Code:** Standard z-scores (not MAD, not Bessel) → linear threshold `(rt-1)/8` → proportional `z - threshold` weighting → 0.5% floor.
**Impact:** Completely different allocation behavior. The exponential curve creates dramatically different concentration profiles at each risk level. The 5% de minimis floor is industry standard; 0.5% is meaningless.
**Fix:** Full rewrite of `computeAllocation()`. Add Kelly k-parameter table.

### C-5: Momentum Missing Volatility Adjustment (§2.5.2)
**File:** `momentum.ts`
**Spec:** Divide blended return by realized volatility before cross-sectional ranking. `vol_adjusted_return = blended_return / period_vol`.
**Code:** Uses raw blended returns directly for ranking.
**Impact:** High-volatility funds dominate the momentum signal. A fund with 15% return and 25% vol should score LOWER than 12% return and 8% vol, but the current code ranks by raw return.
**Fix:** Add daily volatility calculation from price history, compute period vol, divide blended return by it.

### C-6: Momentum Missing Z-Score + CDF Scoring (§2.5.3)
**File:** `momentum.ts` lines 147-218
**Spec:** Cross-sectional z-score (Bessel) → winsorize at ±3 sigma → CDF map to 0-100.
**Code:** Linear rank-to-score: `95 - (rank / (n-1)) * 90`. Single fund = 75. No data = 50.
**Impact:** Linear mapping doesn't produce the S-curve distribution the spec requires. Doesn't handle edge cases per spec (all identical → 50, fewer than 2 → 50).
**Fix:** Replace linear scoring with z-score + winsorize + CDF.

### C-7: Positioning Wrong Scale — -2/+2 vs 1-10 (§2.6.1)
**Files:** `thesis.ts` lines 30-46 and 248-249, `positioning.ts` lines 82-84
**Spec:** Sector scores on **1.0 to 10.0 scale** (one decimal place). Range anchoring: ≥2 sectors ≥7.0, ≥2 sectors ≤4.0, spread ≥4.0.
**Code:** Uses **-2 to +2 integer** scale. Prompt asks Claude for `-2 to +2`. Positioning normalizes `(preference + 2) / 4`.
**Impact:** Completely different scale with different resolution. 5 discrete values (-2,-1,0,1,2) vs continuous 1.0-10.0. Positioning scores compressed into a narrower effective range.
**Fix:** Update thesis prompt to 1-10 scale, update `SectorPreference.preference` type, update `clampPreference()`, update positioning normalization to `(score - 1) / 9`, add range anchoring validation.

---

## HIGH Gaps (Missing Features Per Spec)

### H-1: Kelly Fraction Constants Missing (§3.4)
**File:** `constants.ts`
**Spec:** 7-level table with specific k parameters: 0.30, 0.50, 0.70, 0.95, 1.20, 1.50, 1.85
**Code:** No Kelly constants. `RISK_LEVELS` has generic strings ('conservative', 'moderate', 'aggressive').
**Fix:** Add `KELLY_RISK_TABLE` constant with all 7 levels, labels, and k parameters.

### H-2: Tier Badge Constants Missing (§6.3)
**Spec:** BREAKAWAY (z ≥ 2.0, amber/gold), STRONG (z ≥ 1.2, green), SOLID (z ≥ 0.3, blue), NEUTRAL (z ≥ -0.5, gray), WEAK (z < -0.5, red), MONEY MARKET (muted), LOW DATA (muted).
**Code:** No tier badge logic anywhere.
**Fix:** Add `TIER_BADGES` constant with z-score thresholds and colors.

### H-3: Cost Efficiency Missing 12b-1 Fee Penalty (§2.3)
**File:** `cost-efficiency.ts`
**Spec:** When Tiingo provides 12b-1 fees: -5 points per 0.10%, capped at -15.
**Code:** Only uses headline expense ratio.
**Fix:** Accept optional 12b-1 fee parameter, apply penalty after base score.

### H-4: Holdings Quality Missing Bond Scoring (§2.4.2, §2.4.3)
**File:** `quality.ts`
**Spec:** Issuer Category Quality Map (UST=1.00, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50). Distressed adjustments (isDefault → 0.10, fairValLevel 3 → 0.35, debtInArrears → 0.35). Blended scoring for mixed equity/bond funds.
**Code:** Only equity dimension scoring. No bond quality map. No blend.
**Fix:** Add bond quality scoring function, blended fund aggregation.

### H-5: Coverage-Based Confidence Scaling Missing (§2.4.1)
**File:** `quality.ts`
**Spec:** If coverage_pct < 0.40: quality_weight_adj = base × max(coverage/0.40, 0.10), freed weight goes to momentum, renormalize.
**Code:** No coverage-based weight adjustment.
**Fix:** Return coverage_pct from quality scoring, implement weight adjustment in pipeline.

### H-6: FRED Commodity Series Missing (§4.4)
**File:** `fred.ts`, `constants.ts`
**Spec:** DCOILWTICO, DCOILBRENTEU, GOLDAMGBD228NLBM, DTWEXBGS, copper.
**Code:** Only 9 economic indicators.
**Fix:** Add commodity series to `FRED.SERIES` and `INDICATOR_META`.

### H-7: Deterministic FRED-Based Sector Priors Missing (§2.6.2)
**File:** `thesis.ts`
**Spec:** Computed before Claude. Yield curve inverted → Financials -1.0. CPI > 4% → Energy +1.0, Precious Metals +1.0. Fed tightening → Real Estate -0.5, Utilities -0.5. Unemployment > 5% → Consumer Disc -0.5, Consumer Staples +0.5.
**Code:** No prior computation. FRED data goes straight to Claude prompt.
**Fix:** Add `computeSectorPriors()` function, pass priors in thesis prompt.

### H-8: Brief Model Wrong (§4.2, §5.1)
**File:** `constants.ts` line 48
**Spec:** Claude Opus for Investment Brief writing.
**Code:** `BRIEF_MODEL: 'claude-sonnet-4-6'` — should be Opus.
**Fix:** Change to `'claude-opus-4-6'`.

---

## MEDIUM Gaps (Cosmetic or Deferred)

### M-1: Money Market Handling Incomplete (§2.7)
**Spec:** Fixed composite 50, skip ALL factor scoring, display "MM" tier, weight 0 in allocation.
**Code:** Category detection exists in cost-efficiency.ts but no global skip logic in pipeline.ts.

### M-2: Score Color Thresholds Not in Constants (§6.2)
**Spec:** Green ≥75, Blue ≥50, Amber ≥25, Red <25.
**Code:** Not defined server-side. May be in client theme.

### M-3: HHI Concentration Display Missing (§6.6)
**Spec:** HHI of sector exposure per fund in detail view. Informational only.
**Code:** Not implemented.

### M-4: Fund-of-Funds Recursion Cap (§2.4.4)
**Spec:** Depth 1 only, top 10 sub-fund holdings by weight, cache shared.
**Code:** `isInvestmentCompany` flag exists in EdgarHolding, `fundOfFunds` tracking in HoldingsPipelineResult. Implementation status unclear — needs CUSIP review session.

### M-5: Quality Earnings Dimension Weight in Spec vs Code
**Spec (§2.4.1 table):** Lists "Earnings Quality 0.15" — consistent with dimensions in quality.ts ratios section.
**Code:** Uses 0.15. ✓ Matches.

---

## What's Already Correct

The following items match the spec and need no changes:

- Quality dimension weights (0.25, 0.20, 0.20, 0.15, 0.20) ✓
- Holdings cutoff (65% weight OR 50 holdings) ✓
- Claude call delay (1.2s sequential, never Promise.all) ✓
- API call delay (500ms) ✓
- RSS feeds (5 feeds, 120min cache, 20 headlines each) ✓
- SEC EDGAR User-Agent header ✓
- OpenFIGI batch size (100) ✓
- FMP endpoint paths (/stable/) ✓
- 14 standard sectors list ✓
- UI theme colors (#0e0f11 bg, #16181c surface, #3b82f6 accent) ✓
- Font choices (Inter + JetBrains Mono) ✓
- Brief delivery interval (30 days) ✓
- Category benchmarks for cost efficiency (all 6 categories) ✓
- Piecewise linear cost scoring curve ✓
- Weight redistribution slider logic ✓
- Weight validation (sum to 1.0) ✓
- Security hardening (Session 0, now complete) ✓
