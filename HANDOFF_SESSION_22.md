# Handoff to Session 22

## What happened in Session 21

Session 21 (April 9, 2026) was split between UI polish and a critical data pipeline fix.

### The big fix: EDGAR was fetching the wrong fund's holdings

We discovered that the SEC EDGAR NPORT-P pipeline had a fundamental flaw. When a fund family files under a single CIK (registrant), each fund series files its own separate NPORT-P. Our code grabbed the first NPORT-P it found without checking which series it belonged to. For TCW FUNDS INC (11 series), Fidelity Concord Street Trust (19 series), Allspring Funds Trust (25 series), and others, we were potentially scoring funds with the wrong holdings data.

TGEPX was the visible symptom — it showed "no holdings" because the wrong filing's data didn't match downstream expectations. But FXAIX, WFPRX, WEGRX, BGHIX, HRAUX, and RTRIX were all at risk of silent data corruption.

The fix in `src/engine/edgar.ts` now passes the target `seriesId` through to `findLatestNportFiling()`, which checks each candidate filing's XML header (first 12KB via HTTP Range request) to find the correct series match.

### Ticker overrides for BPLBX and OIBIX

Two fund tickers — BPLBX (BlackRock Inflation Protected Bond K) and OIBIX (Invesco International Bond R6) — aren't in the SEC's `company_tickers_mf.json` file at all. Their share classes simply aren't registered there, even though the funds are active and file NPORT-P quarterly. We added a `TICKER_OVERRIDES` map in `edgar.ts` with their correct CIK and series IDs, with inline documentation for how to add future overrides. The overrides are:
- BPLBX → CIK 1738078 (BlackRock Funds V), series S000062365
- OIBIX → CIK 826644 (AIM/Invesco Investment Funds), series S000064709

### Admin alert emails

New module `src/engine/admin-alert.ts` sends operational alert emails via Resend to rcoursey@gmail.com when:
- A pipeline run fails or completes with per-fund errors
- Brief delivery has failures
- The stale run watchdog catches a stuck pipeline

All alerts are fire-and-forget — they never block or break the calling code. `RESEND_API_KEY` is confirmed set on Railway.

### UI work (earlier in the session)

- Three-panel fund explorer on Brief tab (sector bars | donut | holdings table)
- Horizontal bar charts replacing busy donut legends on Research tab
- Tier rename from "Breakaway" to "Top Pick" across 8 files
- Bold sector names and parenthetical jargon explainers in narratives
- Various layout fixes (tab flash, text wrapping, table padding)

---

## Key decisions made with Robert

### Money market funds need real scoring
Robert reviewed the pipeline output and flagged that FDRXX and ADAXX showing flat 50/50/50/50 is oversimplified. These are real investment options in the user's 401(k) and deserve real evaluation — just not on the same axis as equity or bond funds. We agreed on this approach:

- **Cost Efficiency** — score normally (expense ratios differ meaningfully)
- **Quality** — repurpose as credit quality/safety (WAM, WAL, government vs prime)
- **Momentum** — replace with 7-day SEC yield comparison
- **Positioning** — neutralize at 50

### De minimis swept weight should go to the best MM fund
Currently, when funds fall below the 5% de minimis floor, their weight is redistributed upward to surviving funds. Robert proposed instead routing that residual weight to the top-scoring money market fund. This creates a natural cash buffer — concentrated portfolios sweep less, dispersed portfolios sweep more — which is directionally correct. We agreed this needs research first (Part 0) before implementation.

### Admin should be emailed on all failures
Robert requested that any pipeline errors, failed runs, or issues that need attention get emailed to rcoursey@gmail.com. This is now implemented and live.

---

## Your assignments

Read `SESSION_21_NOTES.md` for full detail. In summary:

### Assignment 1: Money Market Scoring & Cash Allocation (three parts)

**Part 0 — Research first, code second.** Research how institutional portfolio construction frameworks handle cash allocation from de minimis sweeps. Is routing residual weight to a top-scoring MM fund consistent with accepted practice (MPT, Kelly, risk parity, target-date fund methodologies)? What are the edge cases? Should there be a cap? Come back to Robert with a recommendation before writing any code.

**Part 1 — Score MM funds on real factors.** Replace the hard-coded 50/50/50/50 with real scoring using the factor mapping described above. Data sources: FMP fund profile, Finnhub, potentially SEC N-MFP filings for yield/WAM data.

**Part 2 — Route de minimis swept weight to top MM fund.** Modify the allocation engine so residual weight goes to the best cash option instead of being redistributed upward. Implement any cap recommended in Part 0.

### Assignment 2: Data Pipeline Redundancy Review

Review the entire data pipeline and research ways to add redundancy and failsafes for the primary data sources (Tiingo, FMP, EDGAR, Finnhub, FRED, OpenFIGI). Consider fallback providers, retry logic, graceful degradation when a source is down, and alerting when data staleness exceeds acceptable thresholds. This is a research-and-recommend assignment — present findings to Robert before implementing.

---

## Pending items carried forward

- **WATCH-1 (Medium-High):** Risk tolerance changes don't affect Brief allocation. Needs investigation in `brief-engine.ts`. Deferred since Session 18.
- **Re-enable pipeline rate limiter:** Line ~505 of `src/routes/routes.ts` — commented out during debugging.
- **FUNDLENS_SPEC.md update:** §9 + §10 should be updated for sessions 18–21.

---

## Architecture context for new session

All data is batch — the pipeline runs daily at 2:00 AM UTC. No real-time data anywhere. Client reads from Supabase tables populated by the pipeline. Brief delivery runs separately at 6:00 AM UTC. Stale run cleanup every 30 minutes.

Current data sources and cache TTLs:
- **Tiingo** (NAV prices): 1-day cache
- **FMP** (fundamentals): 7-day cache
- **EDGAR** (holdings): quarterly filings, no cache
- **Finnhub** (expense ratios): 90-day cache
- **OpenFIGI** (CUSIP resolution): 7-day cache
- **FRED** (macro indicators): no cache, always fresh
- **RSS feeds** (news): 120-min in-memory cache
- **Claude** (classification): 15-day cache; thesis and briefs not cached

Money market funds (FDRXX, ADAXX) are currently excluded from the pipeline entirely — defined in `MONEY_MARKET_TICKERS` set in `src/engine/constants.ts`, filtered out at pipeline line 127. They get fixed composite 50 injected at line 641.
