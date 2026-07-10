# CONTENDER B — Trend / Volatility / Stress Stack

**Authority:** `A2_THE_RACE.md` Task 3; charter §2.3 ("time-series trend per asset class … volatility-managed exposure scaling (the Barroso–Santa-Clara logic already in our momentum math, applied at the mix level), stress override on top"). Obeys `RACE_RULES.md` **as frozen at blob `ea44a7dc0cdcf473035528849234b39258c39f4a`** (commit `e546da7`) — verbatim, by anchor. Shares Contender A's storm override **as frozen at blob `08bbdc363aabb5a14c6a49e24a1b9db045c55268`** (commit `6f2574a`), §3.3 — see §3.3 below for why.
**Status:** DRAFTED for STOP S4 (ratified together with C and D; Fabio rules under the Delegation ruling, Robert's veto standing). **This spec is not complete until the two PENDING rows in §4.4 carry primary prints** — the named verification item, per the Task 3 order: no assumed histories. Upon ratification this file is frozen and its SHA-256 content hash becomes `rules_version` on every row Contender B writes.
**Plain-English shape:** two questions read straight off market prices — is the market above or below its own long-term path, and is it moving calmly or violently — plus the same storm warning Contender A uses. No economic statistics at all: where A reads the economy's instruments, B reads only the market's own behavior.

---

## §1 — Taxonomy (5 states)

Two binary axes partition all non-storm conditions into four cells; the storm override has absolute priority. Mutually exclusive and collectively exhaustive by construction (same construction as A §1).

| `regime_label` | Trend | Volatility | Plain-English reading |
|---|---|---|---|
| `uptrend_calm` | above path | calm | Market rising steadily |
| `uptrend_volatile` | above path | volatile | Market rising, but swinging hard |
| `downtrend_calm` | below path | calm | Market drifting down without panic |
| `downtrend_volatile` | below path | volatile | Market falling and swinging — the classic bear |
| `stress` | (any) | (any) | Storm Warning — acute stress; overrides the forecast |

**Narration mapping — deferred, honestly.** The ratified narration vocabulary is Contender A's weather names (charter §4.2·2). B has no inflation axis, so its cells do not map one-to-one onto that vocabulary; if B survives to shadow mode, the mapping is a Stage 5 contract question, not a fact this spec can invent. Flagged for the S4 record.

## §2 — Indicator set (honest starts printed; verification state in §4.4)

**Required inputs** (an empty or insufficient as-published read of any of these makes a grid date unclassifiable — §3.6):

| Role | Series | Honest start | Verification state (July 10, 2026) |
|---|---|---|---|
| Trend + volatility reading | `RACE_EQ_TR` — daily U.S. equity total-return index built from the D2 library (new registry series, §4.2–§4.3) | documented 1926-07-01 | **VERIFIED** (§4.4 rows 1–2, primary print 2026-07-10) |
| Stress instrument, deep history | `VIXCLS` — per D3 and RACE_RULES §5 | **1990-01-02** | **VERIFIED** — re-checked read-only in production this session: earliest vintage = earliest observation = 1990-01-02, policy `never_revised` |

**Confirmatory inputs** (empty = unused, no coverage effect):

| Role | Series | Honest start | Use |
|---|---|---|---|
| Stress, live duty | `OFR_FSI` | 2026-07-07 (Leg 1) | Joins VIX in the shared override from its snapshot start; pre-snapshot history Leg 2 only, labeled (D3; RACE_RULES §5) |

**Declined from v1, alternatives stated:** Tiingo NAV histories as the signal rail (§4.1 — the declined candidate rail); `NFCI` (an economic-statistics composite — admitting it would dilute B's identity as the pure market-price contender, and A already carries it as narrative confirmation); `BAMLH0A0HYM2` appears nowhere in Leg 1 (RACE_RULES §5, F3 law — stated per the Task 3 order).

**Contender B's honest start: 1990-01-02, expected first classifiable grid date 1990-01-31** — *conditional on the §4.4 primary print.* Derivation: the trend reading needs 10 month-end index observations (§3.1) and the volatility reading needs 126 daily observations (§3.2); from the rail's documented 1926-07-01 start both warm-ups complete by mid-1927, so the binding constraint is the required VIX instrument at 1990-01-02 — the latest required-input earliest-vintage, computed from the production table per RACE_RULES §1. The runner prints the actual first classified date. Deeper rail history (1926→1990) appears in Leg 2 only, labeled.

**Proof-case reachability, stated now (RACE_RULES §6 metric 1):** B's honest window, unlike A's, reaches the **2008 credit collapse as-published** — the only contender whose Leg-1 record can face that case directly (conditional on §4.4). Feb–Mar 2020: reached; the shared override is the instrument on trial. Calendar-2022: reached — and it is *B's* hardest case, because B has no inflation axis and must read 2022 purely as trend/volatility. 2022–24 curve inversion: B takes no yield-curve input, so the humility rule is satisfied by construction. Oct 2025 CPI blackout: B is immune by construction — no official statistic feeds it; classification proceeds normally, which is itself evidence the case exists to surface.

## §3 — Classification rules (frozen, citable, deterministic)

### 3.0 Prior state, defined
*Prior state* means the state at the most recent classified date; it persists across unclassifiable gaps. When no prior state exists, an in-band reading resolves to the nearer marker; equidistant resolves to the cautious state (below path; volatile). *(Same construction as A §3.0, adapted to B's axes.)*

### 3.1 Trend axis
- Reading: at each monthly grid date D, from the as-of read of `RACE_EQ_TR`: the newest index value `I`, and `SMA10` = the mean of the index at the last available trading day of each of the 10 most recent calendar months ending with D's month (the 10-month simple moving average — Faber's shape, *A Quantitative Approach to Tactical Asset Allocation*, 2007).
- **Below path** when `I` ≤ **0.99 × SMA10**; **back to above path** when `I` ≥ **1.00 × SMA10**. Between the markers the prior trend state holds (the hysteresis band — a 1% penetration is required to call the trend down; a plain recross calls it back up, mirroring A §3.1's asymmetric band shape).

### 3.2 Volatility axis
- Reading: realized volatility `σ` = the annualized standard deviation (×√252) of the trailing **126 daily log returns** of `RACE_EQ_TR` in the as-of read — the ~6-month realized-volatility window of Barroso & Santa-Clara (*Momentum Has Its Moments*, JFE 2015), the logic charter §2.3 names.
- **Volatile** when σ ≥ **20%**; **back to calm** when σ ≤ **16%** (long-run U.S. equity realized volatility sits near 16%; 20% requires distinctly elevated conditions). Between the markers the prior state holds.
- **Judgment call, flagged for S4:** Barroso–Santa-Clara scale exposure *continuously* (target σ ÷ realized σ). B discretizes to two states with hysteresis because the race demands frozen, citable rules and the flap-control law (§3.4) needs states to hold. The continuous multiplier survives in the tilt arithmetic: the volatile-state weights in §3.8 are the calm weights scaled by the multiplier evaluated at the band (16/20 = 0.75). Alternative — continuous scaling — stated and declined: an unfrozen continuum defeats hysteresis and citability.

### 3.3 Storm override — shared with Contender A, by anchor
B adopts A's §3.3 **verbatim** (blob `08bbdc363aabb5a14c6a49e24a1b9db045c55268`): entry VIX ≥ 35 or non-empty OFR FSI ≥ 2.0, evaluated every business day; exit only when every available instrument sits below its exit marker (VIX ≤ 25 and, when available, OFR FSI < 1.0) for 5 consecutive business-day evaluations, minimum storm dwell 10 business days; base axes still computed and recorded during a storm; exit seeds the base state from the exit-day computation.
**Why shared, not its own (the question the Task 3 order requires answered):** (1) it isolates the experiment — with one storm detector, the race measures quadrant-versus-trend/vol, not two competing storm definitions; (2) Contender C must compose exactly one override (charter §2.3: "stress overrides both"), which sharing makes definitional rather than a reconciliation; (3) A's override was hardened at S3 (F7 a–d) and is ratified machinery — reusing it is the smallest action. Alternative — a price-native override (e.g., a drawdown trigger from the rail itself) — stated and declined for v1: it would put the override on the §4.4-pending rail instead of the production-verified VIX, weakening the stack's most safety-critical layer.

### 3.4 Base-state dwell and flap suppression
- Base states change only by band crossing at monthly grid dates, except as seeded by a §3.3 storm exit. A base state must hold **2 consecutive grid dates** before it may revert to the immediately-prior state. *(A §3.4's law, same numbers, same reason: hysteresis is load-bearing — Record 01 honesty flag 3.)*

### 3.5 Tie-breaks
- Both axes crossing at the same grid date is one transition to the diagonal cell (one switch). Storm priority is absolute.

### 3.6 Empty as-of reads (the law RACE_RULES §1 requires — stated per the Task 3 order)
- A **required** input returning empty — or `RACE_EQ_TR` returning fewer than 10 month-end observations for the SMA, or fewer than 126 daily observations for the volatility window — makes that date **unclassifiable**: no row written, counts against coverage (RACE_RULES §6 metric 4). Never defaulted, never carried silently.
- A **confirmatory** input returning empty is simply unused that day.
- VIX empty on an override evaluation day (a market holiday) means no override evaluation that day — not a coverage event; base classification is unaffected. *(A §3.6's rule, unchanged.)*

### 3.7 Staleness
- If the newest as-published `RACE_EQ_TR` observation is more than **10 business days** before the evaluation date, the rail has failed and the date is **unclassifiable** per §3.6. Prices have no nowcast substitute and no legitimate blackout: unlike A §3.7's CPI degradation ladder, an honest coverage hit beats a stale hold. Alternative — prior-state hold flagged `stale-held` — stated and declined: it would classify on nothing.

### 3.8 Race-scoped tilt map (for RACE_RULES §6 metric 3 only — Stage 5 writes the real portfolio law later)
Two-asset instrumentation on the shared rail, switching under RACE_RULES §3 costs: `uptrend_calm` **80%** equity · `uptrend_volatile` **60%** · `downtrend_calm` **50%** · `downtrend_volatile` **40%** · `stress` **30%**.
The ladder deliberately reuses A §3.8's values — same ceiling, same floor, same rungs — so metric-3 differences between A and B come from *when the states fire*, never from one ladder being more generous. The volatile rungs are the calm rungs × the §3.2 multiplier at the band (80 × 0.75 = 60; 50 × 0.75 = 37.5, rounded up to A's existing 40 rung). Explicitly race-scoped: audition tilts, not product advice.

### 3.9 Determinism notes
- Every number above is frozen at ratification; offline calibration before S4 is free (§4.2·8), after S4 any change is a new `rules_version`.
- No wall-clock reads anywhere: every evaluation is a pure function of (evaluation date, as-of reads).
- `inputs` jsonb on every row cites each value used: series, observation date, value, vintage date — every Leg-1 vintage date ≤ the classification date (RACE_RULES §8).

## §4 — Price-history sourcing (THE NAMED VERIFICATION ITEM — Task 3 order)

### 4.1 The two candidate rails, compared
- **Tiingo NAV history — DECLINED as the signal rail.** Verified read-only in production this session: `tiingo_price_cache` holds 21 tickers spanning **2025-06-04 → 2026-07-07 only** — thirteen-month momentum windows, no deep history in-house. Deep pulls would be new keyed fetches of *fund-shaped* series (menu funds carry inception dates, mergers, and adjustment conventions), and ruling D1 already recorded the Tiingo rail as "shorter history, fund-shaped" when declining it for the shared returns rail. Same reasoning binds here.
- **The D2 library (Ken French) — ADOPTED.** Already the ratified shared returns rail (ruling D2: free, citable, decades-deep, license read at adoption per §4.2·7). Riding one rail for both B's signal and everyone's metric-3 arithmetic means one set of limits, stated once.

### 4.2 The constructed series
`RACE_EQ_TR`: a daily U.S. equity total-return index. `I₀ = 100` at the rail's verified start; `Iₜ = Iₜ₋₁ × (1 + (Mkt-RFₜ + RFₜ)/100)` from the library's daily three-factor file (market excess return plus risk-free, the library's own decomposition of the total market return). Deterministic from the file; no judgment anywhere.

### 4.3 How the series reaches the contender — the channel ruling S4 must make
RACE_RULES §1 (frozen) says Leg-1 history reaches contenders through `asOf()` **exclusively**; A2 Task 5 (rail law) says runner-cached rail data is **never written to the regime tables**. B needs prices as a *signal input*, so this spec proposes the only reading that satisfies both laws: **`RACE_EQ_TR` becomes a registered series in the vintage memory** — named here explicitly, as A2 §6 requires a ratified spec to do — ingested once from the D2 source and served through `asOf()` like every other series, **while the runner's metric-3 rail cache stays quarantined outside the regime tables exactly as Task 5 orders.** Same upstream file, two lawful channels, two different roles.
- Proposed registry row: `series_code = 'RACE_EQ_TR'`, source `french` (new source value), axis `price` (new axis value), cadence `daily`, vintage policy `never_revised` — reusing the existing policy VIX and the breakevens run under, so **no schema change and no new reader code** are implied. If either new column *value* trips a database constraint, that is DDL and goes through the Database law in full — presented, Robert applies; this spec authorizes nothing else.
- **Replay-posture caveat, flagged for S4 (the load-bearing judgment call):** exchange closes are never revised in the economic sense, but the library's *computed* factor files are rebuilt monthly and can restate history marginally (upstream CRSP corrections). Proposal: the one-time ingest at rail adoption is the frozen as-published record for the race, under a documented per-source vintage/replay policy added to `SOURCE_VINTAGE_POLICIES.md` at Task 5 (charter §4.2·6 requires exactly this for non-FRED sources), with the restatement caveat carried in every honesty note. Alternative — OFR-style `snapshot_custom` posture (Leg 1 begins at snapshot date) — stated and declined: it would give B no honest Leg-1 window at all and make the race vacuous for this contender.

### 4.4 Verification table (the spec is incomplete until every row reads VERIFIED)

| # | Item | State (July 10, 2026) | Evidence |
|---|---|---|---|
| 1 | D2 library **daily** three-factor file: actual first data row | **VERIFIED — primary print (Fabio-side fetch, 2026-07-10 22:41 UTC)** | First data row: `19260701,    0.09,   -0.25,   -0.27,    0.01` (columns ,Mkt-RF,SMB,HML,RF). File's own build note: "This file was created by using the 202605 CRSP database." SHA-256 of fetched file: f051e37d30c129359c6801d9d2a715c929b19aa3be0ffe684b93995ede9ffebb. Clyde's 403 stands logged (2026-07-10 ~22:15 UTC); the Task 5 adoption fetch prints its own first row and reconciles against this print |
| 2 | D2 library **monthly** three-factor file: actual first data row | **VERIFIED — primary print (Fabio-side fetch, 2026-07-10 22:41 UTC)** | First data row: `192607,   2.89,  -2.55,  -2.39,   0.22` (columns ,Mkt-RF,SMB,HML,RF). File's own build note: "This file was created using the 202605 CRSP database." SHA-256: a26fcdeb09199d29bf79d40bb34ce0ffe41798d08feff1190a2c532b4742e88e. Same reconciliation protocol at Task 5 |
| 3 | Tiingo in-house NAV depth (the declined rail, stated not assumed) | **VERIFIED read-only in production** — 21 tickers, 2025-06-04 → 2026-07-07 windows only; no deep history held; no Tiingo key present in this container | Production query, this session |
| 4 | `VIXCLS` honest start | **VERIFIED read-only in production** — earliest vintage = earliest observation = 1990-01-02, `never_revised` | Production query, this session |

## §5 — RACE_RULES conflict check (recorded per the Task 3 order)

Drafting surfaced **one item requiring an S4 ruling and no conflict otherwise**: the §4.3 channel design is this spec's *reading* of the frozen §1 exclusivity clause together with Task 5's quarantine clause — it obeys both as written, but the reading itself deserves an explicit ruling on the record. All else conforms as anchored: grid and tempo (§2 as amended — the shared override evaluates daily), constraint model, coverage accounting, and F3 (`BAMLH0A0HYM2` nowhere in Leg 1). Envelope (RACE_RULES §4): B's longest lookbacks — ten month-ends (~305 calendar days) and 126 trading days — ride series whose values never change once written (`never_revised` class), so the last-captured-vintage limitation has no bite and **no re-backfill trigger fires**.

---

*Drafted July 10, 2026 by Clyde for STOP S4. Frozen only upon Fabio's ruling, Robert's veto standing — and not before every §4.4 row reads VERIFIED.*
