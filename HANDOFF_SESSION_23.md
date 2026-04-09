# Handoff to Session 23

## What happened in Session 22

Session 22 (April 9, 2026) implemented money market fund scoring and the de minimis cash sweep — the first time FundLens treats MM funds as real investment options instead of fixed-score placeholders.

### Part 0: Research (completed in conversation, no code)

Researched how institutional portfolio construction frameworks handle cash allocation from de minimis sweeps. Findings:

- **Fractional Kelly** (our framework): un-allocated capital is inherent to the model — a safety buffer proportional to conviction. Routing swept weight to cash is consistent.
- **MPT**: Cash is the risk-free leg of the Capital Market Line — a legitimate portfolio position.
- **Risk parity**: Standard ~5-6% cash sleeve for rebalancing and volatility management.
- **Target-date funds**: Typically hold only 1-2% cash — argues for keeping cash allocation small.
- **Robo-advisors**: Schwab mandates 8-10% cash; Wealthfront/Betterment keep it minimal. No consensus.

Key insight: the cash allocation is **emergent** from the math — concentrated portfolios (aggressive risk) sweep less, dispersed portfolios (conservative risk) sweep more. This naturally mirrors risk tolerance without hard-coding fund counts or cash percentages.

Robert approved a 15% cap. At ~5.5% equity-MM opportunity cost, 15% cash = ~0.83% annual drag — the upper bound of acceptable.

### Part 1: Score MM funds on real factors

Replaced hard-coded 50/50/50/50 with real scoring adapted to MM characteristics:

- **Cost Efficiency**: scored normally using existing money market category benchmarks. FDRXX (0.015% ER) now scores dramatically higher than ADAXX (0.52% ER).
- **Quality → Credit Quality**: government-only MM funds score 85, prime funds score 65. Currently both FDRXX and ADAXX are government funds. Classification uses fund name heuristic + static `MM_FUND_DATA` map (90-day refresh cadence).
- **Momentum → 7-Day SEC Yield**: linear interpolation between 2% (score 20) and 6% (score 80). FDRXX at 4.06% → ~51, ADAXX at 3.87% → ~48.
- **Positioning**: neutralized at 50 for all MM funds.

Data approach: `MM_FUND_DATA` static map in constants.ts as fallback (90-day refresh, per Robert's instruction to avoid static data unless it genuinely doesn't change faster). API data from Finnhub/FMP preferred when available. The pipeline scores MM cost efficiency via the normal `scoreCostEfficiency()` path — no special casing needed there since the money market category benchmarks already exist.

### Part 2: De minimis cash sweep

Modified the allocation engine (both server and client):

1. After removing sub-5% funds, calculate total swept weight
2. Route `min(sweptPct, 15%)` to the top-scoring MM fund
3. Renormalize survivors to `(100 - cashPct)%`
4. If swept > 15%, excess redistributed proportionally to survivors (old behavior)
5. If no MM funds in universe, falls back to 100% redistribution (old behavior)

Result assembly updated so MM funds can receive non-zero allocation via the sweep.

### Spec updates

- **§2.7** rewritten: MM funds now scored on real adapted factors (approved by Robert, April 9, 2026 14:43 EDT)
- **§3.5** expanded: cash sweep logic, 15% cap rationale, monitoring thresholds (green ≤10%, yellow 10-15%, red >15%)
- **§9.5** roadmap: Sessions 18-21 added, Session 22 in progress
- **§10** changelog: Session 21 and Session 22 entries added

### Commit

`65f5d3d` — Session 22: MM fund scoring + de minimis cash sweep (5 files, +287/-49)

---

## Files changed

| File | Change |
|------|--------|
| `src/engine/constants.ts` | Added `MM_SCORING` config, `MM_FUND_DATA` static map, `MM_CASH_CAP: 0.15` in ALLOCATION |
| `src/engine/pipeline.ts` | MM funds scored with real factors instead of fixed 50s. Cost via `scoreCostEfficiency()`, quality via credit classification, momentum via SEC yield interpolation, positioning neutral 50 |
| `src/engine/allocation.ts` | Step 4 rewritten: cash sweep to top MM fund, 15% cap, logging. Result assembly allows MM allocation |
| `client/src/engine/allocation.ts` | Mirror of server allocation changes with inlined `MM_CASH_CAP` |
| `FUNDLENS_SPEC.md` | §2.7, §3.5, §9.5, §10 updated |

---

## Pending items carried forward

### WATCH-1 (Medium-High)
Risk tolerance changes don't affect Brief allocation. Needs investigation in `brief-engine.ts`. Deferred since Session 18.

### Re-enable pipeline rate limiter
Line ~505 of `src/routes/routes.ts` — rate limit commented out during debugging.

### Data Pipeline Redundancy Review (Assignment 2 from Session 21)
Not started this session. Research ways to add redundancy and failsafes for primary data sources (Tiingo, FMP, EDGAR, Finnhub, FRED, OpenFIGI). Consider fallback providers, retry logic, graceful degradation when a source is down, and alerting when data staleness exceeds acceptable thresholds.

### MM fund data freshness
The `MM_FUND_DATA` static map in constants.ts has 7-day SEC yield values dated 2026-04-09. These should be refreshed every 90 days (or sooner if rate environment changes materially). Consider wiring Finnhub/FMP API data for MM-specific fields (yield, WAM, WAL) to reduce reliance on manual updates. SEC N-MFP filings are another potential data source for MM fund metrics.

### Cash sweep monitoring
The monitoring thresholds (green ≤10%, yellow 10-15%, red >15%) are defined in the spec but not yet wired into admin alerting. The admin-alert.ts module (Session 21) could be extended to include cash allocation level in pipeline completion alerts.

---

## Verification needed

- [ ] **Run full pipeline** to verify MM funds score correctly (FDRXX should outscore ADAXX significantly on cost)
- [ ] **Check allocation output** to verify cash sweep routes weight to FDRXX (not ADAXX)
- [ ] **Test edge cases**: what happens when zero funds are swept (no cash allocation)? When all non-MM funds survive the 5% floor?
- [ ] **Brief generation**: verify the Brief engine handles MM fund allocation naturally in its narrative
- [ ] **Client-side Portfolio page**: verify the fund allocation donut includes the MM cash position
