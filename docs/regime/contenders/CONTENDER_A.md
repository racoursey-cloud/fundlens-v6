# CONTENDER A — Quadrant + Stress Override (Stages 2–4)

**Authority:** `A2_THE_RACE.md` Task 2; charter §2.3 ("exactly as specified by Regime Session Record 01 (Stage 1)"); Record 01 §4 (the ratified Stage 1 shape). Obeys `RACE_RULES.md` **as frozen at blob `ea44a7dc0cdcf473035528849234b39258c39f4a`** (commit `e546da7`) — verbatim, by anchor.
**Status:** RATIFIED WITH AMENDMENTS at S3 (Fabio's ruling, July 10, 2026; Robert's veto standing) — F7(a)–(d) and F8 applied below; S3 clears on Fabio's repo-side diff verification, upon which this file is frozen and its SHA-256 content hash becomes `rules_version` on every row Contender A writes.
**Plain-English shape:** four kinds of economic weather from two questions — is growth above or below trend, is inflation pressure above or below the anchor — plus a storm warning that overrides the forecast (Record 01 §4).

---

## §1 — Stage 2: the taxonomy (5 regimes)

Two binary axes partition all non-storm conditions into four cells; the storm override has absolute priority. Mutually exclusive and collectively exhaustive by construction: every date has exactly one growth state, one inflation state, and one storm state, and storm priority resolves the only possible overlap.

| `regime_label` | Growth | Inflation | Narration name (governs the winner's vocabulary, §4.2·2) |
|---|---|---|---|
| `recovery` | at/above trend | at/below anchor | **Clear Skies** — the economy growing without price pressure |
| `overheat` | at/above trend | above anchor | **Heat Advisory** — growth with rising price pressure |
| `stagflation` | below trend | above anchor | **Stagflation Watch** — slowing growth, stubborn prices |
| `slowdown` | below trend | at/below anchor | **Cooling Front** — slowing growth, easing prices |
| `stress` | (any) | (any) | **Storm Warning** — markets under acute stress; overrides the forecast |

**The 6th-cell split: considered and declined.** Stage 2 may split one base cell to reach 6 (Record 01 §4). Declined for v1: the candidate split (slowdown into early-cooling vs. deep-contraction) adds narration nuance but no deterministic decision value the tilt map uses, and the stagflation cell's historical sample is already thin (Record 01 honesty flag 2). Smallest action; a future ratified amendment can split with evidence.

## §2 — Stage 3: the indicator set (from the §1 registry, honest starts printed)

**Required inputs** (an empty as-published read of any of these makes a grid date unclassifiable — §3.6):

| Role | Series | Honest start (production, July 10) |
|---|---|---|
| Growth reading | CFNAI (3-month moving average, the Chicago Fed's own convention) | 2011-05-31 |
| Inflation reading | Priority chain: Core PCE (`PCEPILFE`, 2000-08-31) → Core CPI (`CPILFESL`, 1996-12-31) → headline CPI (`CPIAUCSL`, 1990-01-31); first non-empty as-of read wins | 1990-01-31 (chain) |
| Stress instrument, deep history | VIX (`VIXCLS`) — per D3 and RACE_RULES §5 | 1990-01-02 |

**Confirmatory inputs** (used when their as-of read is non-empty; empty = silently unused, no coverage effect):

| Role | Series | Honest start | Use |
|---|---|---|---|
| Recession fail-safe | `SAHMREALTIME` | 2019-09-30 | ≥ 0.50 forces growth below-trend (the citable Sahm trigger) |
| Band tie-break | `T10YIE` (10-yr breakeven) | 2003-01-02 | Resolves the inflation hysteresis band, §3.2 |
| Blackout fallback | `CLEV_CPI_NOWCAST` | 2013-08-20 (F2-corrected) | Inflation reading when official prints are stale, §3.7 |
| Stress, live duty | `OFR_FSI` | 2026-07-07 (Leg 1) | Joins VIX in the override from its snapshot start; pre-snapshot history Leg 2 only, labeled (D3) |
| Stress confirmation | `NFCI` | 2011-05-31 | Recorded in `inputs` for the narrative; not a trigger |

**Declined from v1, alternatives stated:** GDPNow (irregular cadence, 2016 honest start, redundant with CFNAI's 85-indicator composite) and WEI (2020 honest start, same redundancy) — both remain registry flag-flip candidates for a future amendment. `BAMLH0A0HYM2` appears nowhere in Leg 1 (RACE_RULES §5, F3 law).

**Contender A's honest start: 2011-05-31** (the latest required-input earliest-vintage — CFNAI). *(Corrected at S3 — F8, Clyde's slip, Fabio's production evidence: the first stored CFNAI vintage carries 13 observations, 2010-04-01 through 2011-04-01, so the MA3 computes on day one — no warm-up exists. Expected first classifiable grid date 2011-05-31; the runner prints the actual; §3.6's fewer-than-three rule guards the thin case.)* Deeper history (1990→2011) appears only in Leg 2, labeled.

## §3 — Stage 4: the classification rules (frozen, citable, deterministic)

### 3.0 Prior state, defined *(added at S3 — F7(a), Fabio's amendment, exact text)*
*Prior state* means the state at the most recent classified date; it persists across unclassifiable and stale-held gaps. When no prior state exists, an in-band reading resolves to the nearer marker; equidistant resolves to the cautious state (below trend; above anchor). The inflation cold start consults the §3.2 breakeven tie-break first when available.

### 3.1 Growth axis
- Reading: CFNAI-MA3 as-published on the evaluation date (mean of the three newest observations in the as-of read).
- **Below trend** when MA3 ≤ **−0.35**; **back to at/above trend** when MA3 ≥ **0.00**. Between the markers the prior growth state holds (the hysteresis band). Zero is the CFNAI's own definition of trend growth; −0.35 sits between trend and the Chicago Fed's −0.70 recession marker.
- Sahm fail-safe: a non-empty `SAHMREALTIME` read ≥ **0.50** forces below-trend regardless of the band.

### 3.2 Inflation axis
- Reading: year-over-year percent change of the §2 priority chain's series, computed from the as-of read (newest observation vs. the observation 12 months prior, same vintage).
- **Above anchor** when YoY ≥ **3.0%**; **back to at/below anchor** when YoY ≤ **2.5%** (the Fed's 2% target plus a citable margin). Between the markers the prior state holds — **unless** a non-empty `T10YIE` read tie-breaks: breakeven ≥ 2.5% tips above-anchor, ≤ 2.2% tips at/below; otherwise hold.
- A chain link is usable only if its as-of read yields a computable YoY — both the newest and the year-ago observation present; otherwise the next link, then §3.7. *(Added at S3 — F7(d), Fabio's amendment, exact text.)*

### 3.3 Storm override (evaluated every business day per RACE_RULES §2 as amended; all dwell in business days)
- **Entry** (immediate — speed is the override's reason to exist): VIX close ≥ **35**, or a non-empty OFR FSI read ≥ **2.0**. Either instrument triggers.
- **Exit:** every available instrument below its exit marker — VIX ≤ **25** and (when available) OFR FSI < **1.0** — held for **5 consecutive business-day evaluations**, and no exit before a **minimum storm dwell of 10 business days**.
- During a storm the base axes are still computed and recorded in `inputs` (continuity for exit), but the regime label is `stress`. On exit, the label is the base cell computed that same day.
- Storm exit seeds the base state from the exit-day computation; §3.4 governs thereafter. *(Added at S3 — F7(b), Fabio's amendment, exact text.)*

### 3.4 Base-state dwell and flap suppression
- Base states change only by band crossing (the hysteresis above) at monthly grid dates, except as forced by the §3.1 Sahm fail-safe or seeded by a §3.3 storm exit. *(Reworded at S3 — F7(c).)*
- A base state must hold **2 consecutive grid dates** before it may revert to the immediately-prior state — a one-month look is never allowed to flap back.

### 3.5 Tie-breaks
- Both axes crossing at the same grid date is one transition to the diagonal cell (legal, counted as one switch).
- Storm priority is absolute and needs no tie-break.

### 3.6 Empty as-of reads (the law RACE_RULES §1 requires)
- A **required** input returning empty (or, for the growth reading, fewer than 3 observations) makes that date **unclassifiable**: no classification row is written, and the date counts against coverage (RACE_RULES §6 metric 4). Never defaulted, never carried silently.
- A **confirmatory** input returning empty is simply unused that day.
- VIX empty on an override evaluation day (a market holiday) means no override evaluation that day — not a coverage event; base classification is unaffected.

### 3.7 Staleness and blackout degradation (the Oct 2025 proof case)
- If the inflation chain's newest as-published observation describes a month more than **75 days** before the evaluation date, the reading is stale: substitute the Cleveland CPI nowcast's as-of value (when non-empty), recorded in `inputs` as the degraded source.
- If the nowcast is also unavailable, the prior inflation state holds, flagged `stale-held` in `inputs`.
- If there is no prior state to hold, the date is unclassifiable per §3.6.

### 3.8 Race-scoped tilt map (for RACE_RULES §6 metric 3 only — Stage 5 writes the real portfolio law later)
Two-asset instrumentation on the shared rail (equity index + risk-free), switching under RACE_RULES §3 costs: `recovery` 80% equity · `overheat` 60% · `slowdown` 50% · `stagflation` 40% · `stress` 30%. Explicitly race-scoped: these are audition tilts for measuring behavior against Contender D, not product advice and not the shipped Stage 5.

### 3.9 Determinism notes
- Every number above is frozen at ratification; offline calibration before S3 was free (§4.2·8), after S3 any change is a new `rules_version`.
- No wall-clock reads anywhere: every evaluation is a pure function of (evaluation date, as-of reads).
- `inputs` jsonb on every row cites each value used: series, observation date, value, vintage date — with every Leg-1 vintage date ≤ the classification date (RACE_RULES §8).

## §4 — RACE_RULES conflict check (per the S2 clearance order)

Drafting Stages 2–4 surfaced **no conflict** with the frozen law: the grid, tempo, constraint model, coverage accounting, envelope (this spec's longest lookback is the 13-month YoY window — inside the monthly 425-day capture envelope, so no re-backfill trigger fires), and the F3 exclusion are all obeyed as anchored.

---

*Drafted July 10, 2026 by Clyde for STOP S3. Frozen only upon Fabio's ruling, Robert's veto standing.*
