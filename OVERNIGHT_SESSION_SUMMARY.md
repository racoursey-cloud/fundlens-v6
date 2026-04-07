# Overnight Session Summary — April 7-8, 2026

## What I Did

### 1. Spec-vs-Code Gap Analysis (20 gaps found)

I read every section of FUNDLENS_SPEC.md v7.0 and compared it line-by-line against every engine file in the codebase. The result is saved as **FundLens_Spec_vs_Code_Gap_Analysis.md** in the repo root.

The headline finding: **7 Critical gaps** where the math or logic is wrong, **8 High gaps** where spec features are missing entirely, and **5 Medium gaps** that are cosmetic or deferred.

The biggest discoveries:

- **Default factor weights were swapped** — Momentum and Positioning weights were reversed (Momentum was 20% instead of 25%). Every composite score computed with defaults has been slightly wrong. Fixed now.
- **The scoring engine is missing z-space standardization + CDF mapping** — The spec's core formula (§2.1) is a 4-step process: raw scores → z-standardize → weighted composite in z-space → CDF map to 0-100. The code does a simple weighted average. This is the single biggest architectural fix remaining and will need to happen in a dedicated scoring session.
- **The allocation engine uses a completely different algorithm** — The spec calls for MAD-based modified z-scores → exponential Kelly curve → 5% de minimis floor. The code uses standard z-scores → linear threshold → proportional weighting → 0.5% floor. Full rewrite needed.
- **Positioning uses -2/+2 scale but spec requires 1-10** — Different scale, different resolution, different normalization.
- **Momentum is missing volatility adjustment** — The spec explicitly requires dividing blended returns by realized volatility before ranking.

### 2. Session 1 Code Changes (Constants, Types, Risk Scale)

I implemented the safe, foundational fixes that don't break any dependent logic:

**constants.ts changes:**
- Swapped `DEFAULT_FACTOR_WEIGHTS` — Momentum is now 0.25, Positioning is now 0.20 (spec §2.2)
- Changed `BRIEF_MODEL` from `claude-sonnet-4-6` to `claude-opus-4-6` (spec §4.2)
- Added complete `KELLY_RISK_TABLE` — all 7 levels with labels, Kelly fractions, and k parameters (spec §3.4)
- Added `RISK_MIN` (1) and `RISK_MAX` (7) constants
- Added `TIER_BADGES` — 5 tiers with z-score thresholds and colors (spec §6.3)
- Added `SPECIAL_TIERS` — Money Market and Low Data badges
- Added `SCORE_COLORS` — Green/Blue/Amber/Red thresholds (spec §6.2)
- Added `ALLOCATION` constants — MAD consistency factor, 5% de minimis floor, quality gate threshold (spec §3)
- Added `FRED_COMMODITY_SERIES` — WTI, Brent, Gold, Dollar Index (spec §4.4)

**routes.ts changes:**
- Changed risk tolerance validation from 1-9 to 1-7 in both PUT /api/profile and POST /api/profile/setup
- Uses imported `RISK_MIN` and `RISK_MAX` constants (not hardcoded)

**brief-engine.ts changes:**
- Rewrote `riskLabel()` to use `KELLY_RISK_TABLE` for labels instead of hardcoded 1-9 ranges
- Updated `profileSummary()` for 7-point descriptions
- Changed risk tolerance display from `/9` to `/7`

**types.ts changes:**
- Updated `risk_tolerance` field comment to document the 1-7 range with spec citation

### Build Verification

TypeScript compiles clean (`tsc --noEmit` passes with 0 errors).
Full build passes (`npm run build` — both server TS and Vite client succeed).

---

## What I Did NOT Touch (Needs Separate Sessions)

These are the remaining critical gaps that require more invasive changes. Each one needs its own focused session because they involve multi-file rewrites and careful testing:

1. **Scoring engine z-space + CDF** (scoring.ts) — The composite formula rewrite. Affects both server pipeline and client-side slider logic.
2. **Momentum vol-adjustment + z-score + CDF** (momentum.ts) — Replace linear ranking with vol-adjusted z-score + CDF.
3. **Positioning 1-10 scale** (thesis.ts, positioning.ts) — Change prompt from -2/+2 to 1-10, update normalization.
4. **Allocation engine Kelly rewrite** (brief-engine.ts) — Full replacement of `computeAllocation()` with MAD + exponential Kelly + de minimis.
5. **Cost efficiency 12b-1 fee penalty** (cost-efficiency.ts) — Depends on Tiingo fee data integration.
6. **Bond quality scoring** (quality.ts) — New function for issuer category mapping + distressed adjustments.
7. **Coverage confidence scaling** (quality.ts, pipeline.ts) — Weight redistribution when coverage < 40%.
8. **FRED commodities** (fred.ts) — Add 4-5 commodity series to fetch + prompt.
9. **Deterministic sector priors** (thesis.ts) — New function computing priors from FRED data before Claude call.
10. **CUSIP resolver** — Robert flagged this for dedicated review.

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `src/engine/constants.ts` | Factor weights corrected, Brief model, Kelly table, tier badges, score colors, allocation constants, FRED commodity series |
| `src/routes/routes.ts` | Risk validation 1-7, imported RISK_MIN/RISK_MAX |
| `src/engine/brief-engine.ts` | Risk labels from Kelly table, profile summary for 7-point, display /7 |
| `src/engine/types.ts` | risk_tolerance comment updated |
| `FundLens_Spec_vs_Code_Gap_Analysis.md` | NEW — complete gap analysis document |
| `OVERNIGHT_SESSION_SUMMARY.md` | NEW — this file |

---

## Recommended Next Steps

When you're ready to continue, I'd suggest tackling the gaps in this order (matching the build plan sessions):

1. **Session 4: Scoring Engine** — Implement z-space + CDF in scoring.ts. This is the heart of the system.
2. **Session 5: Factor Upgrades** — Vol-adjusted momentum, 12b-1 fees, bond scoring.
3. **Session 6: Thesis Overhaul** — 1-10 scale, FRED commodities, deterministic priors.
4. **Session 7: Allocation Engine** — Kelly fraction exponential curve rewrite.

The gap analysis document has the full details for each fix, including the exact file, line numbers, spec sections, and impact.
