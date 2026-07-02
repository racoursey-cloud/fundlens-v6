# Session 3 Handoff: Tiingo Integration

## Directive

Read `FUNDLENS_SPEC.md` at the repo root before doing anything. Pay special attention to Section 9 (Implementation Status). The spec is the single source of truth — if code and spec disagree, fix the code.

## What This Session Must Accomplish

**Primary:** Create `src/engine/tiingo.ts` from scratch and wire it into the pipeline.

Tiingo is the primary source for two things (spec §4.1, §4.6):

1. **Fund NAV prices** (split-adjusted, back to 1970s) — used by `momentum.ts` for return calculations. FMP becomes the fallback for prices, not the primary.

2. **Fund fee data** (net/gross expense ratio, 12b-1 fees, load fees, all fee components) — used by `cost-efficiency.ts` for the enhanced expense analysis.

**Secondary:** Implement the 12b-1 fee penalty in `cost-efficiency.ts` (spec §2.3, listed as MISSING-1):
- When Tiingo provides 12b-1 fees, apply -5 points per 0.10% of 12b-1, capped at -15.

## Spec Sections to Cite

- §4.1 (Paid Sources — Tiingo row)
- §4.6 (Data Fallback Chain — Fund NAV/prices and Fund expense data rows)
- §2.3 (Cost Efficiency — Enhanced expense analysis paragraph)
- §2.5.1 (Momentum — price data source)
- §5.3 (Key Patterns — API call delays)
- §5.6 (Environment Variables — TINNGO_KEY, intentional typo, do not correct)

## Key Constraints

- The env var is `TINNGO_KEY` (intentional typo per spec §5.6 — do NOT correct it)
- All API calls need 500ms delays between sequential requests (`PIPELINE.API_CALL_DELAY_MS`)
- Tiingo mutual fund endpoints: check their docs for `/tiingo/mutual-funds/` API paths
- `pipeline.ts` Steps 7 and 8 need updating to use Tiingo as primary, FMP as fallback
- The `tiingo.ts` file should follow the same patterns as `fmp.ts` — thin wrapper, typed responses, delay-aware

## Files You'll Touch

- **CREATE:** `src/engine/tiingo.ts` (new file — Tiingo API client)
- **MODIFY:** `src/engine/pipeline.ts` (wire Tiingo into Steps 7-8)
- **MODIFY:** `src/engine/cost-efficiency.ts` (add 12b-1 fee penalty, accept Tiingo fee data)
- **MODIFY:** `src/engine/momentum.ts` (accept Tiingo price data as primary input)
- **MODIFY:** `src/engine/constants.ts` (add Tiingo endpoint config if needed)
- **MODIFY:** `src/engine/types.ts` (add Tiingo response types if needed)

## What's Already Done (Don't Redo)

- Session 0: Security hardening
- Session 1: Constants, types, Kelly risk model aligned
- Session 2: CUSIP resolver audited and fixed (cache wired, FMP fallback added, depth=1)

## Verification

- `tsc --noEmit` must pass clean
- Update FUNDLENS_SPEC.md: Section 9.1 (new Working items), Section 9.3 (mark MISSING-1 and MISSING-8 as resolved or partially resolved), Section 9.5 roadmap (Session 3 → DONE), Section 10 changelog (add Session 3 entry)

## What I Think Is Most Important

After Tiingo, the **CRITICAL items** (Section 9.2) are what matter most. The scoring engine (CRITICAL-1) is the mathematical heart — without z-space + CDF, every composite score in the system is wrong. I'd recommend Session 4 (Scoring Engine) immediately after this one. The five CRITICALs should be prioritized over any MISSING items because they produce *wrong results*, not just *incomplete results*.
