# FundLens v6 — Bug Tracker
## Created: Session 14 Integration Testing — April 8–9, 2026

---

## Severity Definitions

- **CRITICAL:** Blocks core functionality. Must fix before v6 can ship.
- **HIGH:** Produces wrong results or broken UX. Should fix in Session 15.
- **MEDIUM:** Works but could be better. Fix if time permits.
- **LOW:** Cosmetic or nice-to-have. Defer to later.

---

## Open Bugs

None. All 12 bugs resolved.

---

## Resolved in Session 16

### BUG-3: 0% holdings coverage on multiple funds (RESOLVED — Session 16)
**Severity was:** MEDIUM
**Found in:** Task 14.3 (Scoring Validation)
**Fix:** International CUSIPs failed OpenFIGI resolution because only `ID_CUSIP` was used. EDGAR provides ISINs for most holdings, and OpenFIGI's `ID_ISIN` lookup has much better coverage for non-US securities. Added Step 2b to `resolveCusips()`: after CUSIP-based resolution, retry unresolved holdings using `ID_ISIN` from EDGAR data. Also improved FMP search fallback to use EDGAR holding names when OpenFIGI returns no name (international holdings often have no OpenFIGI name but EDGAR always provides one). `holdings.ts` now builds ISIN and name maps from EDGAR data and passes them to the resolver. `FigiMappingJob` type expanded to support `'ID_CUSIP' | 'ID_ISIN'`.
**Files changed:** `src/engine/cusip.ts`, `src/engine/holdings.ts`, `src/engine/types.ts`

### BUG-11: Voice still too Wall Street (RESOLVED — Session 16)
**Severity was:** MEDIUM
**Found in:** Task 14.5 (Brief Generation Test)
**Fix:** Added two new sections to `editorial-policy.md` (v2.0 → v2.1): (1) "Voice Anchor — The Archetype" describing the confident-professional-at-a-cookout persona with specific cadence rules (declarative sentences, concrete over abstract, one idea per sentence, plain words over jargon); (2) "Jargon Blacklist" with 23 banned Wall Street phrases and their plain-English alternatives (e.g., "dry powder" → "cash on the sidelines," "margin headwind" → "profits getting squeezed"). Includes the cookout test: "If your neighbor at a cookout would furrow their brow, rewrite it."
**Files changed:** `src/prompts/editorial-policy.md`

---

## Resolved in Session 15

### BUG-4: Only 15 of 22 funds scored (RESOLVED — Session 15)
**Severity was:** HIGH
**Found in:** Task 14.3 / 14.6
**Fix:** Pipeline silently skipped funds that failed EDGAR holdings fetch — quality and positioning scoring only iterated over `fundHoldings` (successful EDGAR fetches), so funds without holdings had no quality/positioning scores and were dropped at composite validation (line 642). Fixed by iterating over `scorableFunds` instead of `fundHoldings` in both quality (step 6) and positioning (step 12) scoring loops, providing neutral fallback scores (quality=50, positioning=50) for funds without EDGAR data. These funds now flow through z-standardization and receive composite scores like all other funds.
**Files changed:** `src/engine/pipeline.ts`

### BUG-5: Briefs.tsx does not render Brief content (RESOLVED — Session 15)
**Severity was:** HIGH
**Found in:** Task 14.5
**Fix:** `loadBriefs()` auto-selected the latest brief from the list endpoint (`GET /api/briefs`), which intentionally excludes `content_md` for performance. The auto-selected brief object had no content, so the renderer showed "Brief content not available." Fixed by fetching the full brief via `GET /api/briefs/:id` when auto-selecting on page load.
**Files changed:** `client/src/pages/Briefs.tsx`

### BUG-6: BRIEF and HISTORY tab labels are swapped (RESOLVED — Session 15)
**Severity was:** MEDIUM
**Found in:** Task 14.1 (ISSUE-3), confirmed Task 14.5
**Fix:** Updated TABS array in AppShell.tsx: "Brief" → "Thesis" for `/thesis` path, "History" → "Briefs" for `/briefs` path. Now matches spec §6.7: Portfolio | Thesis | Briefs | Settings.
**Files changed:** `client/src/components/AppShell.tsx`

### BUG-7: Brief subtitle exposes "Claude Opus" model name (RESOLVED — Session 15)
**Severity was:** LOW
**Found in:** Task 14.5
**Fix:** Removed all "written by Claude Opus" text from Briefs.tsx (3 occurrences). Changed subtitle to "Your personalized investment brief." Removed `model_used` display from brief detail header. Removed "Claude Opus" from the generating overlay. No model names visible in the UI.
**Files changed:** `client/src/pages/Briefs.tsx`

### BUG-2: Money market composite ≠ 50 (RESOLVED — Session 15)
**Severity was:** MEDIUM
**Found in:** Task 14.3
**Fix:** MM funds (FDRXX, ADAXX) were included in z-standardization despite having fixed raw scores of 50. Universe mean pulled above 50 by high-scoring equity funds, giving MM funds negative z-scores and composite = 33. Fixed by overriding MM fund composites to exactly 50 with zeroed z-scores in `scoreAndRankFunds()`, bypassing z-standardization for these tickers.
**Files changed:** `src/engine/scoring.ts`

### BUG-10: Editorial policy fallback says "research analyst" (RESOLVED — Session 15)
**Severity was:** MEDIUM
**Found in:** Task 14.5
**Fix:** Rewrote the fallback string in `brief-scheduler.ts` to match spec §7.3 voice ("buddy who's good at investing") with 4 W section structure, behind-the-curtain rule, and anti-jargon guidance. Added startup warning log when editorial-policy.md is not found. Previous fallback said "research analyst" — the opposite of the spec voice.
**Files changed:** `src/engine/brief-scheduler.ts`

### BUG-12: Stalled pipeline run blocks cron (RESOLVED — Session 15)
**Severity was:** LOW
**Found in:** Task 14.6
**Fix:** Reduced stale run cleanup threshold from 2 hours to 15 minutes in `cleanupStaleRuns()`. Pipeline runs in ~70 seconds, so 15 minutes is generous but catches stalls much faster. The cleanup already ran every 30 minutes and at startup — only the threshold was too lenient.
**Files changed:** `src/engine/cron.ts`

---

## Resolved in Session 14

### BUG-1: Quality raw scores >100 (RESOLVED — commit be49b1d)
**Severity was:** HIGH
**Found in:** Task 14.1 / 14.3
**Fix:** Three ratio scoring functions in quality.ts (`scoreCurrentRatio`, `scoreQuickRatio`, `scoreIncomeQuality`) treated `linearScore()` output (0–100) as a 0–1 value, producing scores up to 3087. Added `× 0.01` correction and safety clamps throughout the aggregation chain. All factor scores now guaranteed 0–100.

### BUG-8: Prior Brief allocation mismatch — 2 funds vs 6 (RESOLVED — consequence of BUG-1)
**Severity was:** MEDIUM
**Found in:** Task 14.5
**Root cause:** The April 8 cron Brief was generated from pipeline run `ee95587f` which used pre-quality-fix scores. Unclamped quality scores (FXAIX=996, DRRYX=958) caused extreme z-score distortion, concentrating the allocation to just 2 funds. After BUG-1 was fixed and the pipeline re-ran, the allocation correctly produces 6 funds matching the Portfolio page.

### BUG-9: extractRatioValue() name mismatch — zero financial data reaches Claude (RESOLVED — commit ac1409c)
**Severity was:** CRITICAL
**Found in:** Task 14.5
**Fix:** `extractHoldingFinancials()` in brief-engine.ts searched for camelCase FMP identifiers (e.g., `"grossProfitMargin"`) but `factor_details` stores human-readable names (e.g., `"Gross Profit Margin"`). All 13 ratio name strings corrected to match stored names. Claude will now receive actual holding-level financial data (margins, ROE, P/E, debt ratios, cash flow) for the first time.

### Sonnet Briefs (EXPLAINED — not a current bug)
3 of 5 historical Briefs used `claude-sonnet-4-6` because `BRIEF_MODEL` was Sonnet prior to Session 1. Fixed in commit `72b5d29` (April 7). All current Briefs correctly use Claude Opus.

---

## Summary

| Severity | Open | Resolved | Total |
|----------|------|----------|-------|
| CRITICAL | 0 | 1 | 1 |
| HIGH | 0 | 3 | 3 |
| MEDIUM | 0 | 6 | 6 |
| LOW | 0 | 2 | 2 |
| **Total** | **0** | **12** | **12** |

**All bugs resolved.** Zero open bugs remaining.
