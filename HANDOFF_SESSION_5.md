# Session 5 Handoff: Factor Upgrades (Momentum + Bond Quality + Coverage Scaling)

## Directive

Read `FUNDLENS_SPEC.md` at the repo root before doing anything. Pay special attention to Section 9 (Implementation Status). The spec is the single source of truth — if code and spec disagree, fix the code.

**Set up GitHub push access first** (spec preamble, "Repository & Git Setup"). Robert will provide the PAT at session start. Configure it before writing any code:
```
cd <repo-root>
git remote set-url origin https://racoursey-cloud:<GITHUB_PAT>@github.com/racoursey-cloud/fundlens-v6.git
```

## What This Session Must Accomplish

**Primary: Fix CRITICAL-2 + CRITICAL-3 — Momentum volatility adjustment and z-score/CDF scoring.**

These are in `src/engine/momentum.ts`. The current code has two problems:

1. **CRITICAL-2 (§2.5.2):** Momentum uses raw blended returns for ranking. The spec requires dividing by realized volatility first: `vol_adjusted_return = blended_return / period_vol` where `period_vol = daily_vol × √(trading_days)`. Without this, high-volatility funds dominate the momentum signal.

2. **CRITICAL-3 (§2.5.3):** Momentum scoring uses linear rank-to-score (`95 - (rank / (n-1)) * 90`). The spec requires: z-score (Bessel-corrected) → winsorize ±3 sigma → CDF map to 0–100 via `normalCDF()`. Edge cases: <2 funds → all 50, all identical → all 50, single fund → 75, no price data → 50 with dataQuality flag.

**Important:** You now have a working `normalCDF()` and `zStandardize()` in `src/engine/scoring.ts` from Session 4. You can import and reuse these rather than reimplementing them. They are tested against the §2.8 worked example.

**Secondary: Implement MISSING-2 — Bond quality scoring (§2.4.2, §2.4.3).**

Currently `src/engine/quality.ts` only scores equity holdings. The spec requires:
- Issuer Category Quality Map: UST=1.00, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50
- Distressed bond adjustments: isDefault=Y → 0.10, fairValLevel=3 → 0.35, debtInArrears=Y → 0.35
- Blended scoring for funds with both equity and bond holdings (§2.4.3)

Bond issuer categories come from EDGAR NPORT-P filings — check what fields `edgar.ts` already parses.

**Tertiary: Implement MISSING-3 — Coverage-based confidence scaling (§2.4.1).**

When holdings data coverage < 40%, quality factor weight should be reduced proportionally (floor 10% of base weight) and freed weight goes to momentum. This prevents low-confidence quality scores from distorting composites. Quality needs to return `coverage_pct` for this to work.

## Spec Sections to Cite

- §2.5.2 (Volatility Adjustment — the full formula)
- §2.5.3 (Cross-Sectional Z-Score + CDF — scoring curve and edge cases)
- §2.4.2 (Bond Holdings — Issuer Category Quality Map)
- §2.4.3 (Blended Fund Scoring — equity/bond weighting)
- §2.4.1 (Coverage-Based Confidence Scaling — the weight redistribution formula)

## Key Constraints

- **Reuse `normalCDF()` and `zStandardize()` from `scoring.ts`.** Do not reimplement. They are validated.
- **Bessel correction everywhere.** Divide by (n-1), not n.
- **Winsorize momentum z-scores to ±3 sigma** before CDF mapping (§2.5.3). The composite scoring in `scoring.ts` does NOT winsorize (that's the correct behavior for the composite). Momentum's per-factor z-scores are winsorized.
- **Edge cases matter.** The spec lists specific behaviors for <2 funds, identical returns, single fund with data, and no price data. Test all of them.
- **Bond data availability.** Check what EDGAR NPORT-P fields are already parsed in `edgar.ts`. The issuer category and distressed flags may already be in the parsed output — verify before building new parsing.

## What's Already Done (Don't Redo)

- Session 0: Security hardening
- Session 1: Constants, types, Kelly risk model aligned
- Session 2: CUSIP resolver audited and fixed
- Session 3: Tiingo integration (prices + fees), 12b-1 fee penalty, pipeline wired
- Session 4: Scoring engine rewritten — z-space + CDF composite, normalCDF(), zStandardize(), z-scores persisted for client rescore

## Files You'll Touch

- **MODIFY:** `src/engine/momentum.ts` — add vol adjustment, rewrite scoring to z-score + CDF
- **MODIFY:** `src/engine/quality.ts` — add bond quality scoring, blended scoring, return coverage_pct
- **POSSIBLY MODIFY:** `src/engine/pipeline.ts` — if coverage-based weight redistribution needs to happen at pipeline level
- **IMPORT FROM:** `src/engine/scoring.ts` — `normalCDF()`, `zStandardize()`
- **VERIFY:** `src/engine/edgar.ts` — check what bond fields are already parsed from NPORT-P

## What Session 4 Learned (Tips for Success)

1. **Read the full spec before writing any code.** Project drift has been a real problem. Robert is clear: the spec is the single source of truth. Cite specific sections for every decision.

2. **The Abramowitz & Stegun CDF coefficients approximate `erf(x)`, not `Φ(x)` directly.** The relationship is `Φ(z) = 0.5 × (1 + erf(z/√2))`. Session 4 got this wrong initially and had to debug. You don't need to worry about this — just import the working `normalCDF()` from `scoring.ts`.

3. **Validate against worked examples early.** Write a standalone test script before wiring into the pipeline. Catch math errors before they propagate.

4. **Don't touch things outside your scope.** Session 4 was strictly scoring engine only. Your scope is momentum + bond quality + coverage scaling. Don't fix CRITICAL-4 (positioning scale) or CRITICAL-5 (allocation) — those are Sessions 6 and 7.

5. **Commit after each logical unit.** Prefix with `Session 5:`. Push to main. Update the spec (§9 + §10) and write HANDOFF_SESSION_6.md as your final commit.

6. **Run `tsc --noEmit` after every change.** Both server and client (`cd client && npx tsc --noEmit`). Don't let type errors accumulate.

## Verification

- `tsc --noEmit` must pass clean (server and client)
- Momentum: construct a test case with funds of varying returns and volatilities. Verify that a fund with 12% return / 8% vol scores higher than one with 15% return / 25% vol.
- Bond quality: construct a test case with UST, CORP, and distressed holdings. Verify scores match the issuer category map.
- Coverage scaling: test with coverage_pct = 0.30 and verify quality weight is reduced and momentum weight is increased.
- Update FUNDLENS_SPEC.md: §9.2 (mark CRITICAL-2, CRITICAL-3 resolved), §9.3 (mark MISSING-2, MISSING-3 resolved), §9.5 (Session 5 → DONE), §10 (changelog)
- Write HANDOFF_SESSION_6.md

## What I Think Is Most Important

After this session, the remaining CRITICALs are:
- **CRITICAL-4:** Positioning scale change from -2/+2 to 1.0–10.0 (Session 6)
- **CRITICAL-5:** Allocation engine rewrite (Session 7)

With Sessions 4 and 5 done, the scoring pipeline will be mathematically correct for the first time. Session 6 (thesis overhaul) fixes the positioning input, and Session 7 (allocation) fixes how scores translate to portfolio weights. After that, the engine is spec-compliant end to end.

## Database Migration Note

Session 4 created `migrations/session4_add_z_scores.sql` which adds z-score columns to `fund_scores`. Robert needs to run this in Supabase SQL Editor before the next pipeline run. Remind him if it hasn't been done.
