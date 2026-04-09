# Session 21 Notes

## Date: April 9, 2026

## Status
All work committed and pushed to main. Four commits this session covering UI improvements, data pipeline fixes, and operational alerting.

## Commits
| Commit | Description |
|--------|-------------|
| `3666708` | Fund explorer, chart legends, tier rename, prompt polish |
| `fb43132` | Fix fund explorer data: correct sector/holdings paths and unit math |
| `08febc0` | Fix EDGAR series mismatch: filter NPORT-P filings by series ID |
| `2eb8d3a` | Admin alert emails for pipeline failures, brief errors, stale runs |

## What Was Done

### UI Improvements (commits 3666708, fb43132)

**Tab flash fix (Research tab)**
- Loading gate used `&&` instead of `||`, causing partial render when one fetch finished before the other. One-character fix.

**Chart legend overhaul (Research tab)**
- Replaced busy wrapped flex-based DonutLegend with sorted horizontal `BarBreakdown` component for both allocation and sector charts. Cleaner, aligned, scannable.

**Three-panel fund explorer (Brief tab)**
- Replaced old allocation card (donut + 5-column table) with interactive fund explorer: sector exposure bars | donut chart | top holdings table.
- Click-to-select fund chips below donut. Desktop: CSS Grid three-panel layout. Mobile: stacked detail card.
- Fixed data extraction bugs: sector exposure auto-detects decimal vs percentage format; holdings read from correct `holdingsQuality.holdingScores` path.
- Fixed pctOfNav unit confusion (whole-percent, not 0-1 decimal) in both sector and holdings display.

**Tier rename: Breakaway → Top Pick**
- Renamed across 8 files (constants, allocation, pipeline, portfolio, research, editorial policy, help agent, brief scheduler).

**Narrative formatting improvements**
- Bold sector/asset class names on first mention (same treatment as fund names).
- Parenthetical jargon explainers for concepts over a general reader's head.
- Removed maxWidth:720 on Research narrative to fix premature text wrapping.
- Tightened fund scores table padding from 10px 16px to 8px 10px.

### EDGAR Series Mismatch Fix (commit 08febc0)

**Root cause identified:** `findLatestNportFiling()` grabbed the first NPORT-P filing for a CIK without checking which fund series it belonged to. For fund families where one registrant files separate NPORT-P for each fund (TCW has 11, Fidelity has 19, Allspring has 25), we were often getting the wrong fund's holdings.

**Impact:** 6 of ~20 funds sit under multi-series CIKs — FXAIX, WFPRX, WEGRX, BGHIX, HRAUX, RTRIX, and TGEPX. TGEPX was the obvious symptom ("no holdings"), but others may have been silently using incorrect data.

**Fix:** New series-aware filing lookup checks each candidate's XML header (first 12KB via HTTP Range request) for the target series ID. For single-series CIKs, no extra requests needed.

**Ticker override table:** Added `TICKER_OVERRIDES` map for BPLBX (BlackRock Inflation Protected Bond K, CIK 1738078, series S000062365) and OIBIX (Invesco International Bond R6, CIK 826644, series S000064709) — both active funds whose share classes are missing from SEC's `company_tickers_mf.json`.

### Admin Alert Emails (commit 2eb8d3a)

**New module:** `src/engine/admin-alert.ts` sends operational alerts via Resend to rcoursey@gmail.com.

**Three failure paths covered:**
- Pipeline run crashes or completes with per-fund errors
- Brief delivery failures (per-user or scheduler-level)
- Stale pipeline runs cleaned up by 15-min watchdog

All alerts are fire-and-forget (`.catch(() => {})`) — never block the calling code.

## Files Changed
- `src/engine/edgar.ts` — Series-aware NPORT-P lookup + ticker overrides
- `src/engine/admin-alert.ts` — New admin alert email module
- `src/engine/cron.ts` — Wired alerts into all three failure paths
- `src/engine/constants.ts` — Tier rename (Top Pick)
- `src/engine/allocation.ts` — Tier rename
- `src/engine/pipeline.ts` — Tier rename
- `src/engine/thesis.ts` — Bold sectors, parenthetical explainers in voice rules
- `src/engine/brief-engine.ts` — Formatting reminders for bold/explainers
- `src/engine/brief-scheduler.ts` — Tier rename + formatting rules
- `src/engine/types.ts` — Tier label comment update
- `src/prompts/editorial-policy.md` — Bold sectors, accessibility rule, Top Pick tier
- `src/prompts/help-agent.md` — Top Pick tier badge
- `client/src/components/DonutChart.tsx` — New BarBreakdown export
- `client/src/pages/Research.tsx` — Bar charts, loading fix, narrative formatting, table tightening
- `client/src/pages/YourBrief.tsx` — Three-panel fund explorer
- `client/src/pages/Portfolio.tsx` — Tier rename

## Pending Items

### WATCH-1 (Medium-High)
Risk tolerance changes don't affect Brief allocation. Needs investigation in `brief-engine.ts`.

### Re-enable pipeline rate limiter
Line ~505 of `src/routes/routes.ts` — rate limit commented out during debugging, not yet re-enabled.

### FUNDLENS_SPEC.md update
§9 + §10 should be updated for sessions 18–21.

## Next Session Assignment: Money Market Scoring & Cash Allocation

### Part 0: Research & Recommendation
Research how institutional portfolio construction frameworks handle cash allocation from de minimis sweeps. Is routing residual weight to a top-scoring money market fund consistent with accepted practice (MPT, Kelly, risk parity, target-date fund methodologies)? What are the edge cases — should there be a cap on cash allocation? Come back with a recommendation before writing any code.

### Part 1: Score MM Funds on Real Factors
Currently FDRXX and ADAXX are hard-coded at 50/50/50/50 with zero data. Score them on factors that actually apply:
- **Cost Efficiency** — score normally (FDRXX 0.015% vs ADAXX 0.52% is a real difference)
- **Quality** — repurpose as credit quality/safety (WAM, WAL, government-only vs prime)
- **Momentum** — replace with 7-day SEC yield comparison (the MM equivalent of returns)
- **Positioning** — neutralize at 50 (macro positioning doesn't apply to cash)

Data sources: FMP fund profile, Finnhub, potentially SEC N-MFP filings.

### Part 2: Route De Minimis Swept Weight to Top MM Fund
Instead of redistributing de minimis swept weight upward to surviving funds, allocate it to the top-scoring MM fund. This creates a natural cash buffer sized by portfolio characteristics (concentrated portfolios sweep less, dispersed portfolios sweep more). Consider whether a cap is needed.

### Also: Data Pipeline Redundancy Review
Review the data pipeline and research ways to add redundancy and failsafes for primary data sources (Tiingo, FMP, EDGAR, Finnhub, FRED, OpenFIGI). Consider fallback providers, retry logic, graceful degradation when a source is down, and alerting when data staleness exceeds acceptable thresholds.
