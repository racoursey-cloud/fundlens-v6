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

### BUG-2: Money market composite ≠ 50
**Severity:** MEDIUM
**Found in:** Task 14.3 (Scoring Validation)
**Spec reference:** §2.7
**Description:** Spec says money market funds get "fixed composite 50." FDRXX and ADAXX have correct raw factor scores (all 50), but their composite is 33, not 50.
**Expected behavior:** Money market funds display composite score = 50.
**Actual behavior:** Composite = 33. Raw 50s are fed through z-standardization with the rest of the universe, yielding negative z-scores (universe mean is pulled up by non-MM funds), which maps to composite 33 via CDF.
**Suggested fix:** Exclude MM funds from z-standardization and set composite = 50 directly, OR override composite to 50 post-scoring in `scoreAndRankFunds()`.
**Files likely affected:** `src/engine/scoring.ts`

### BUG-3: 0% holdings coverage on multiple funds
**Severity:** MEDIUM
**Found in:** Task 14.3 (Scoring Validation)
**Spec reference:** §2.4.1
**Description:** VFWAX (international index, 50 holdings) and WFPRX (bond fund, 10 holdings) have 0% quality coverage — zero holdings scored. VFWAX: CUSIP resolver cannot resolve non-US holdings to FMP tickers. WFPRX: pure bond fund with no equity fundamentals.
**Expected behavior:** International holdings should be resolved where possible. Bond funds should use bond quality scoring (§2.4.2).
**Actual behavior:** Both funds default to quality = 50 (neutral). The quality factor is effectively inert for any fund with international or bond-heavy holdings.
**Suggested fix:** For VFWAX, investigate whether OpenFIGI/FMP can resolve international CUSIPs (many large international companies have US ADRs). For WFPRX, confirm bond quality scoring from NPORT-P debt fields is firing. Low urgency — the z-score + CDF pipeline handles this gracefully by normalizing quality = 50 to a neutral position.
**Files likely affected:** `src/engine/cusip.ts`, `src/engine/quality.ts`, `src/engine/holdings.ts`

### BUG-10: Editorial policy fallback says "research analyst"
**Severity:** MEDIUM
**Found in:** Task 14.5 (Brief Generation Test)
**Spec reference:** §7.3
**Description:** If `editorial-policy.md` cannot be found on the filesystem, `brief-scheduler.ts` line 92 falls back to: "You are a research analyst writing an Investment Brief for a 401(k) participant." This is the opposite of the spec §7.3 voice ("buddy who's good at markets"). The fallback also has no 4-section structure guidance and no behind-the-curtain rule.
**Expected behavior:** Fallback should use correct voice and include minimal structure guidance.
**Actual behavior:** Fallback uses research analyst voice with no structural or editorial constraints.
**Suggested fix:** Rewrite the fallback string to match the spec voice and include the 4 W section names at minimum. Also add a startup log warning if the editorial policy file is not found, so the issue is visible in Railway logs.
**Files likely affected:** `src/engine/brief-scheduler.ts`

### BUG-11: Voice still too Wall Street
**Severity:** MEDIUM
**Found in:** Task 14.5 (Brief Generation Test)
**Spec reference:** §7.3
**Description:** The Brief voice, while improved from the Sonnet-era Briefs, still uses Wall Street jargon that the "buddy at the cookout" wouldn't: "dry powder," "negative real returns," "margin headwind," "rate-sensitive." Spec §7.3 says the voice should be "a knowledgeable friend who does well in the market" who "explains it over coffee without dumbing it down or showing off."
**Expected behavior:** Plain English explanations accessible to someone who's smart but not a financial professional.
**Actual behavior:** Reads more like a polished financial advisor than a buddy at work.
**Suggested fix:** Add explicit jargon avoidance list to editorial-policy.md with alternatives: "dry powder" → "cash on hand," "negative real returns" → "losing money after inflation," "margin headwind" → "pressure on profits," etc. Also add 2-3 more positive voice examples to anchor the tone. This may also improve naturally once BUG-9 is deployed and Claude has real financial data to cite instead of relying on abstract characterizations.
**Files likely affected:** `src/prompts/editorial-policy.md`

### BUG-12: Stalled pipeline run in database
**Severity:** LOW
**Found in:** Task 14.6 (Performance Measurement)
**Spec reference:** §5.4
**Description:** Pipeline run `e6f6b1e5` is stuck in "running" status with 0 funds processed. This blocks new pipeline runs from starting (the guard in `cron.ts` prevents overlapping runs).
**Expected behavior:** Runs that crash or stall should be automatically detected and cleaned up.
**Actual behavior:** Stalled run persists indefinitely, blocking the cron job.
**Suggested fix:** Add a staleness check: if a run has been "running" for >15 minutes, automatically mark it as failed. This is the same issue Robert fixed manually earlier in the session. Immediate fix: `UPDATE pipeline_runs SET status = 'failed', completed_at = now() WHERE id = 'e6f6b1e5-...'`
**Files likely affected:** `src/engine/cron.ts`, `src/engine/pipeline.ts`

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
| MEDIUM | 3 | 2 | 5 |
| LOW | 2 | 1 | 3 |
| **Total** | **5** | **7** | **12** |

**Remaining open bugs:** BUG-2 (MM composite ≠ 50), BUG-3 (0% coverage on intl/bond funds), BUG-10 (editorial policy fallback), BUG-11 (voice too Wall Street), BUG-12 (stalled pipeline run). All MEDIUM or LOW — no HIGH or CRITICAL issues remain.
