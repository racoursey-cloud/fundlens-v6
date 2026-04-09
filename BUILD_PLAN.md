# FundLens v6 — Granular Build Plan

## Created: April 8, 2026 (Session 13 Planning)

---

## Overview

FundLens v6 is ~85% complete. The scoring engine math is correct. Three critical gaps remain to match v5.1 functionality, plus two optional features for full spec compliance.

**What remains:**

| Priority | Gap | Spec Reference | Impact |
|----------|-----|---------------|--------|
| CRITICAL | Allocation engine uses capture threshold instead of 5% de minimis floor | §3.5, CRITICAL-6 | Every allocation is wrong |
| CRITICAL | Portfolio page does not display allocations | §6.4, MISSING-14 | Users can't see their allocation without generating a Brief |
| CRITICAL | No end-to-end integration testing with real data | §5.4 | 12 sessions of changes never tested together |
| Medium | HHI concentration display missing | §6.6, MISSING-7 | Informational only, no scoring impact |
| Medium | Documentation cleanup | MISSING-16 | fund-summaries.ts not in spec file inventory |
| Optional | Help section (FAQs + Claude chat) | MISSING-9 | Not in spec yet |
| Optional | Fund-of-funds look-through | §2.4.4, MISSING-15 | Stub exists, cannot fire |

**Estimated effort:** 3 focused sessions to match v5.1 (Sessions 13–15). 2 additional optional sessions (16–17) for full spec compliance.

**How this plan works:** Each task is a self-contained assignment file in the `assignments/` directory. A new session reads `SESSION_PROMPT.md`, finds the next incomplete assignment, executes it, updates the spec and changelogs, commits, and pushes. No session needs to remember anything from previous sessions.

---

## Session 13: Allocation Fix + Portfolio Allocation Display

**Goal:** Fix the allocation engine to match spec §3.5, then display real Kelly-computed allocations on the Portfolio page.

| Task | File | Description | Estimate |
|------|------|-------------|----------|
| 13.1 | `assignments/13_1_CONSTANTS_DE_MINIMIS.md` | Replace capture threshold constants with DE_MINIMIS_PCT | 15 min |
| 13.2 | `assignments/13_2_ALLOCATION_DE_MINIMIS_FLOOR.md` | Rewrite allocation.ts Step 4 to use de minimis floor | 30 min |
| 13.3 | `assignments/13_3_CLIENT_ALLOCATION_MODULE.md` | Port computeAllocations() to client-side module | 30 min |
| 13.4 | `assignments/13_4_PORTFOLIO_ALLOCATION_DISPLAY.md` | Add allocation column + real donut + slider hooks to Portfolio.tsx | 45 min |
| 13.5 | `assignments/13_5_VERIFY_ALLOCATION.md` | Verify allocation with manual calculation + tsc --noEmit | 20 min |

**Dependencies:** 13.1 → 13.2 → 13.3 → 13.4 → 13.5 (strictly sequential)

**Session 13 Definition of Done:**
- `tsc --noEmit` passes
- constants.ts has `DE_MINIMIS_PCT: 0.05`, no `CAPTURE_HIGH`/`CAPTURE_STEP`
- allocation.ts Step 4 drops funds below 5% and renormalizes (single pass)
- Portfolio.tsx shows allocation % per fund in table
- Fund Allocation donut powered by real Kelly allocations
- Risk slider and weight sliders both trigger allocation recomputation
- Spec §9 updated (CRITICAL-6 resolved, MISSING-14 resolved)

---

## Session 14: End-to-End Integration Testing

**Goal:** Run the full pipeline against the real 18-fund TerrAscend universe. Verify every component works together. Document any bugs found.

| Task | File | Description | Estimate |
|------|------|-------------|----------|
| 14.1 | `assignments/14_1_PREFLIGHT_CHECKS.md` | Verify env vars, migrations, cache tables, server startup | 20 min |
| 14.2 | `assignments/14_2_PIPELINE_EXECUTION.md` | Run full pipeline, capture output, note failures | 30 min |
| 14.3 | `assignments/14_3_SCORING_VALIDATION.md` | Spot-check scoring math against manual calculation | 30 min |
| 14.4 | `assignments/14_4_ALLOCATION_VALIDATION.md` | Verify allocation output against manual calculation | 20 min |
| 14.5 | `assignments/14_5_BRIEF_GENERATION_TEST.md` | Generate a Brief, verify 4-section structure + editorial policy | 20 min |
| 14.6 | `assignments/14_6_PERFORMANCE_MEASUREMENT.md` | Measure pipeline execution time, identify bottlenecks | 15 min |
| 14.7 | `assignments/14_7_BUG_DOCUMENTATION.md` | Catalog all failures into BUGS.md with severity + fix plan | 20 min |

**Dependencies:** 14.1 → 14.2 → (14.3, 14.4, 14.5, 14.6 can run in parallel) → 14.7

**Prerequisites:** Session 13 must be complete. Railway environment must be accessible with all API keys from spec §5.6.

**Session 14 Definition of Done:**
- Pipeline completes against real 18-fund universe without fatal errors
- At least 3 fund scores spot-checked against manual calculation
- At least 1 allocation spot-checked against manual calculation
- Brief generated with correct 4-section structure
- Pipeline runtime measured and documented
- All bugs cataloged in BUGS.md with severity ratings

---

## Session 15: HHI + Documentation + Polish

**Goal:** Implement HHI concentration display, fix any bugs found in Session 14, clean up documentation.

| Task | File | Description | Estimate |
|------|------|-------------|----------|
| 15.1 | `assignments/15_1_HHI_COMPUTATION.md` | Create HHI utility function | 20 min |
| 15.2 | `assignments/15_2_HHI_DISPLAY.md` | Add HHI to FundDetail sidebar | 30 min |
| 15.3 | `assignments/15_3_SESSION_14_BUGFIXES.md` | Fix bugs documented in Session 14's BUGS.md | 60 min |
| 15.4 | `assignments/15_4_DOCUMENTATION_CLEANUP.md` | Update spec §5.5, §9, §10 with final status | 20 min |

**Dependencies:** 15.1 → 15.2. 15.3 depends on Session 14's BUGS.md. 15.4 is last.

**Session 15 Definition of Done:**
- HHI displayed per fund in FundDetail sidebar
- All Session 14 bugs with severity "high" or "critical" are fixed
- Spec §5.5 lists fund-summaries.ts
- Spec §9 reflects final state of all features
- `tsc --noEmit` passes

---

## Session 16 (Optional): Help Section

**Goal:** Add FAQs and Claude Haiku chat scoped to FundLens questions.

| Task | File | Description | Estimate |
|------|------|-------------|----------|
| 16.1 | `assignments/16_1_HELP_PAGE_FAQS.md` | Static FAQ content + Help page component | 30 min |
| 16.2 | `assignments/16_2_HELP_CHAT_ENDPOINT.md` | Server endpoint for Claude Haiku chat | 30 min |
| 16.3 | `assignments/16_3_HELP_CHAT_UI.md` | Chat UI component on Help page | 30 min |

**Dependencies:** 16.1 → 16.2 → 16.3

---

## Session 17 (Optional): Fund-of-Funds Look-Through

**Goal:** Wire the existing look-through scaffolding to real FMP search so fund-of-funds holdings can be scored.

| Task | File | Description | Estimate |
|------|------|-------------|----------|
| 17.1 | `assignments/17_1_SUBFUND_TICKER_RESOLUTION.md` | Wire resolveSubFundTicker() to FMP search | 30 min |
| 17.2 | `assignments/17_2_FUND_OF_FUNDS_TESTING.md` | Test against real fund-of-funds tickers, verify depth=1 | 30 min |

**Dependencies:** 17.1 → 17.2

---

## Definition of Done: "v6 Matches v5.1"

All of the following must be true:

1. **Scoring:** 4-factor composite (Cost 25%, Quality 30%, Momentum 25%, Positioning 20%) produces scores on 0–100 scale via z-space + CDF pipeline. Validated against §2.8 worked example.
2. **Allocation:** Kelly exponential with 5% de minimis floor produces personalized allocations from universal scores. Fund count emerges from math, not hard-coded.
3. **Portfolio page:** Shows fund scores AND allocation percentages. Fund Allocation donut powered by real Kelly allocations. Both risk slider and weight sliders trigger instant recomputation.
4. **Brief:** 4-section "W" structure, advisor voice, raw data feed (no model internals), allocation delta from history.
5. **Pipeline:** Completes against real 18-fund universe without fatal errors. Caching layers functional. Runtime < 5 minutes.
6. **No regressions:** `tsc --noEmit` passes. All existing features from Sessions 0–12 still work.
