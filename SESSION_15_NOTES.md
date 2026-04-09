# Session 15 Notes

## Date: April 9, 2026

## Status
All 4 assignments (15.1–15.4) completed, committed, and pushed to main. Additionally, 3 more bugs (BUG-2, BUG-10, BUG-12) were fixed beyond the original assignment scope.

## Commits
| Commit | Description |
|--------|-------------|
| `2c1e4d0` | Session 15: HHI concentration display + 4 bugfixes (BUG-4/5/6/7) |
| `644e9ef` | Session 15: Fix BUG-2, BUG-10, BUG-12 — 3 more bugs resolved |

## What Was Done

### Assignment 15.1 — HHI Computation Utility
Created `client/src/utils/hhi.ts` with:
- `computeHHI()` — computes Herfindahl-Hirschman Index from sector weight record
- `hhiLabel()` — maps HHI to plain-language labels using DOJ thresholds (Diversified / Moderately Concentrated / Highly Concentrated)
- Pure math, no dependencies, client-side only

### Assignment 15.2 — HHI Display in FundDetail
- Imported HHI utility into `FundDetail.tsx`
- HHI computed from `sectorGroups` (already available in component)
- Displayed in Sectors tab header: "HHI 1847 — Moderately Concentrated"
- Shows DOJ-scale value (0–10,000) with color-coded label
- Informational only — not connected to scoring or allocation

### Assignment 15.3 — Session 14 Bugfixes (7 bugs resolved total)

**BUG-4 (HIGH): 7 funds not scoring — RESOLVED**
- Root cause: Quality and positioning scoring loops iterated over `fundHoldings` map (only funds with successful EDGAR fetches), not `scorableFunds` (all non-MM funds). Funds without EDGAR data had no quality/positioning scores and were dropped at composite validation (line 642 `continue`).
- Fix: Both loops now iterate over `scorableFunds`. Funds without EDGAR holdings get neutral fallback scores (quality=50, positioning=50, coveragePct=0). These flow through z-standardization and receive composite scores.
- File: `src/engine/pipeline.ts`

**BUG-5 (HIGH): Brief content not rendering — RESOLVED**
- Root cause: `loadBriefs()` auto-selected the latest brief from the list endpoint (`GET /api/briefs`) which intentionally excludes `content_md` for performance (line 799: `select: 'id,title,status,generated_at,model_used'`). The auto-selected brief object had no content, so the renderer showed "Brief content not available."
- Fix: After auto-selecting, fetch the full brief via `fetchBrief(latest.id)` to get `content_md`.
- File: `client/src/pages/Briefs.tsx`

**BUG-6 (MEDIUM): Tab labels swapped — RESOLVED**
- Root cause: AppShell.tsx TABS array had `{ path: '/thesis', label: 'Brief' }` and `{ path: '/briefs', label: 'History' }`.
- Fix: Changed to `label: 'Thesis'` and `label: 'Briefs'` per spec §6.7.
- File: `client/src/components/AppShell.tsx`

**BUG-7 (LOW): Model name exposed in UI — RESOLVED**
- Fix: Removed "written by Claude Opus" from 3 subtitle strings. Removed `model_used` from brief detail header. Changed generating overlay text. No model names visible in UI.
- File: `client/src/pages/Briefs.tsx`

**BUG-2 (MEDIUM): Money market composite = 33 instead of 50 — RESOLVED**
- Root cause: MM funds (FDRXX, ADAXX) had raw factor scores of 50 but were included in z-standardization. Universe mean pulled above 50 by high-scoring equity funds, giving MM funds negative z-scores → composite 33.
- Fix: In `scoreAndRankFunds()`, MM tickers detected early in the mapping loop. They get forced composite=50 and zeroed z-scores, bypassing z-standardization entirely.
- File: `src/engine/scoring.ts`

**BUG-10 (MEDIUM): Editorial policy fallback uses wrong voice — RESOLVED**
- Root cause: Fallback string said "You are a research analyst" — opposite of spec §7.3 ("buddy who's good at investing"). No 4-section structure, no behind-the-curtain rule.
- Fix: Rewrote fallback to match spec voice with 4 W sections, anti-jargon guidance. Added console.warn when fallback is used.
- File: `src/engine/brief-scheduler.ts`

**BUG-12 (LOW): Stale pipeline run cleanup too lenient — RESOLVED**
- Root cause: `cleanupStaleRuns()` threshold was 2 hours. Pipeline runs in ~70s, so stalled runs blocked cron for up to 2 hours.
- Fix: Reduced threshold to 15 minutes.
- File: `src/engine/cron.ts`

### Assignment 15.4 — Documentation Cleanup
- Spec §5.5: Added `engine/allocation.ts` and `utils/hhi.ts` to client file inventory
- Spec §9: Marked MISSING-7 as RESOLVED
- Spec §9.5: Marked Session 15 as DONE in roadmap
- Spec §10: Added Session 15 changelog entry
- BUGS.md: Updated with all 7 resolutions, summary table, deferral notes

## Bug Tracker Summary (End of Session 15)

| Severity | Open | Resolved | Total |
|----------|------|----------|-------|
| CRITICAL | 0 | 1 | 1 |
| HIGH | 0 | 3 | 3 |
| MEDIUM | 2 (deferred) | 4 | 6 |
| LOW | 0 | 2 | 2 |
| **Total** | **2** | **10** | **12** |

### Deferred Bugs
- **BUG-3 (MEDIUM):** 0% holdings coverage on international/bond funds. Requires CUSIP resolver improvements for international holdings and bond quality scoring investigation. Quality defaults to 50 (neutral) — graceful degradation, no incorrect behavior.
- **BUG-11 (MEDIUM):** Brief voice still too Wall Street. Evaluate after next Brief generates — BUG-9 (real financial data reaching Claude) and BUG-10 (correct editorial fallback) just deployed. Voice may improve naturally with real data.

## Files Changed
| File | Change |
|------|--------|
| `src/engine/pipeline.ts` | BUG-4: Neutral fallback scores for EDGAR-failed funds |
| `src/engine/scoring.ts` | BUG-2: MM composite override to 50, bypass z-standardization |
| `src/engine/cron.ts` | BUG-12: Stale run threshold 2h → 15min |
| `src/engine/brief-scheduler.ts` | BUG-10: Editorial policy fallback rewritten |
| `client/src/pages/Briefs.tsx` | BUG-5: Fetch full brief on auto-select. BUG-7: Remove model name |
| `client/src/components/AppShell.tsx` | BUG-6: Tab labels corrected |
| `client/src/components/FundDetail.tsx` | HHI display in Sectors tab |
| `client/src/utils/hhi.ts` | NEW: HHI computation utility |
| `BUGS.md` | Updated with all resolutions |
| `FUNDLENS_SPEC.md` | §5.5, §9, §10 updated |

## Reminders for Next Session
- [ ] **Re-enable `pipelineRateLimit`** in `src/routes/routes.ts` line 505. Currently commented out since commit `f2b451f` (Session 14). Robert said: "Remind me about rate limits when we are done with all testing."
- [ ] **Clean up stalled pipeline run** `e6f6b1e5` (if not already cleaned by the new 15-min stale check): `UPDATE pipeline_runs SET status = 'failed', completed_at = now() WHERE id = 'e6f6b1e5-...' AND status = 'running';`
- [ ] **Re-run pipeline** after deploy to verify BUG-4 fix (all 22 funds should now have scores) and BUG-2 fix (MM composites should be 50).
- [ ] **Generate a new Brief** to evaluate BUG-11 (voice quality) after BUG-9 + BUG-10 fixes are in production.

## Next Session Priority
**Two bugs remain open from Session 14/15 — fix these first in the next session:**
1. **BUG-3 (MEDIUM):** 0% holdings coverage on VFWAX (international) and WFPRX (bond). Requires investigating OpenFIGI/FMP international CUSIP resolution and NPORT-P bond quality scoring. Quality defaults to 50 (neutral) — graceful degradation but not ideal.
2. **BUG-11 (MEDIUM):** Brief voice still too Wall Street. Add jargon avoidance list to editorial-policy.md. Evaluate after next Brief generates with BUG-9 + BUG-10 fixes deployed.

**After bugs are resolved:**
- **Session 16 (optional):** Help Section — FAQs + Claude Haiku chat (MISSING-9)
- **Session 17 (optional):** Fund-of-Funds look-through (MISSING-15)
