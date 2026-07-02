# Session 4 Handoff: Scoring Engine (Z-Space + CDF)

## Directive

Read `FUNDLENS_SPEC.md` at the repo root before doing anything. Pay special attention to Section 9 (Implementation Status). The spec is the single source of truth — if code and spec disagree, fix the code.

## What This Session Must Accomplish

**Primary:** Fix CRITICAL-1 — rewrite `computeComposite()` in `src/engine/scoring.ts` to implement the z-space + CDF scoring pipeline from spec §2.1.

This is the mathematical heart of FundLens. Without it, every composite score in the system is wrong. The current code does a simple weighted average and clamp. The spec requires:

1. Raw factor scores (0–100) → z-standardize across fund universe (Bessel-corrected stdev, n-1)
2. Weighted composite in z-space (not in raw space)
3. Map back to 0–100 via normal CDF (Abramowitz & Stegun approximation, max error ≈ 7.5 × 10⁻⁸)

**Secondary:** Ensure the client-side `computeComposite()` (used for real-time rescore when users adjust weight sliders) is also updated. This function is shared — it must produce identical results on both server and client.

## Spec Sections to Cite

- §2.1 (Composite Formula — the entire z-space + CDF pipeline)
- §2.2 (Factor Weights — 25/30/25/20)
- §2.8 (Worked Example — use this to verify your implementation)
- §5.2 (Architecture Principle — server-side scoring engine, client-side rescore)

## Key Constraints

- The normal CDF approximation must use Abramowitz & Stegun (spec §2.1). Do NOT use a lookup table or a third-party stats library.
- Bessel correction: divide by (n-1), not n, when computing stdev.
- The worked example in §2.8 is your acceptance test. Your implementation must produce the same composite scores: Fund A = 84, Fund B = 41, Fund C = 40, Fund D = 31.
- Weight validation: weights must sum to 1.0 (±0.02 tolerance). Minimum 5% per factor.
- If the fund universe has < 2 funds, z-standardization is undefined → fall back to raw weighted average.

## Files You'll Touch

- **MODIFY:** `src/engine/scoring.ts` — rewrite `computeComposite()`, add `normalCDF()`, add `zStandardize()`
- **VERIFY:** Client-side rescore function (check where `computeComposite` is imported/used in `client/src/`)
- **POSSIBLY MODIFY:** `src/engine/pipeline.ts` — if the scoring call signature changes

## What's Already Done (Don't Redo)

- Session 0: Security hardening
- Session 1: Constants, types, Kelly risk model aligned
- Session 2: CUSIP resolver audited and fixed
- Session 3: Tiingo integration (prices + fees), 12b-1 fee penalty, pipeline wired

## Verification

- `tsc --noEmit` must pass clean
- Run the worked example from §2.8 through your implementation and verify output
- Update FUNDLENS_SPEC.md: Section 9.2 (mark CRITICAL-1 resolved), Section 9.5 roadmap (Session 4 → DONE), Section 10 changelog (add Session 4 entry)
- Write HANDOFF_SESSION_5.md

## What I Think Is Most Important

After the scoring engine, the remaining CRITICALs are:
- **CRITICAL-2 + CRITICAL-3:** Momentum vol-adjustment + z-score/CDF scoring (Session 5)
- **CRITICAL-4:** Positioning scale change from -2/+2 to 1.0–10.0 (Session 6)
- **CRITICAL-5:** Allocation engine rewrite (Session 7)

These all produce *wrong results* today — they're higher priority than any MISSING item. The scoring engine (this session) is the foundation that all other factors feed into, so it must be correct first.
