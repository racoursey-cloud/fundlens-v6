# RACE_RULES — The Law of the Regime Race (A2 Task 1)

**Authority:** `A2_THE_RACE.md` Task 1; charter §2.3 (race law), §2.5 (vintage law), §7 (measurement law). Rulings D1–D3 (Robert, July 10, 2026) and R3 (Fabio under the Delegation ruling, July 10, 2026) are written in below as law.
**Status:** DRAFTED for STOP S2 — Fabio rules under the Delegation ruling, Robert's veto standing. Once ratified this file is frozen; the contender specs and the runner obey it verbatim, and `rules_version` hashes bind every classification row to the spec that produced it.
**Plain-English rule of the whole file:** every contender sees history only as an investor on that date could have seen it, every cost a real 401(k) participant would pay is charged, and the replay can only ever prove a rule bad — never good.

---

## §1 — The two legs (ruling D1)

**Leg 1 — the as-published leg. This is the race.**
- Basis: every row written `basis='replay'`.
- History reaches contenders through **`asOf()` exclusively** — no other data access exists in any contender module (verified by inspection at acceptance).
- Each contender starts at its **honest start**: the latest earliest-vintage date among the inputs its ratified spec requires, computed from the production vintage table (`A2_THE_RACE.md` §1, as corrected July 10) and printed in its spec and in RACE_RESULTS — never hand-waved.
- An empty `asOf` read means "this input did not exist as-published on that date." It is handled per the contender's ratified Stage-4 rules, counts against coverage (§6 metric 4), and is **never silently defaulted**.
- **Leg 1 alone carries disqualification authority.**

**Leg 2 — the revised-basis study. This is labeled context, never authority.**
- Basis: every row written `basis='revised_study'`.
- History comes through one separate, loudly-named revised-basis reader that is mechanically incapable of writing anything but `revised_study` rows.
- Span: current-vintage history from **1990-01 forward** — this is where the charter's 30-year span lives, as labeled pattern evidence (§2.5: recomputations on revised data are labeled).
- The label rides every surface Leg 2 touches: every table, every narrative, every honesty note.

## §2 — Decision tempo (grid mechanics, proposed by Clyde per Task 1)

- **Base classification grid: the last calendar day of every month**, from each contender's honest start through the last full month before the run. Month-ends align with the vintage memory's own backfill grid, so as-of reads at grid dates are maximally informed.
- Each grid date D gets one classification row per contender per leg, computed strictly from `asOf(…, D, …)` reads (Leg 1) or the revised reader (Leg 2).
- **The stress override is evaluated every business day** — including every grid date — using the same as-of discipline. *(Amended at S2, Fabio's ruling: the override exists for speed — Feb–Mar 2020 is its proof case — and the shipped engine sees data at the daily sweep tempo; the race auditions the rule at the tempo it will live at. Portfolio action still obeys §3 in full.)* An override transition (entry or exit, subject to the spec's hysteresis and dwell rules) writes one additional classification row dated the evaluation day.
- Portfolio **action** never outruns §3: a classification change on date D acts at the next available trade date, and base-regime tilts change at most once per calendar month; override entries/exits may act at the weekly tempo.

## §3 — Constraint and whipsaw model (401(k)-realistic)

- **No intraday action.** Signals computed on date D execute at the **next business day's close** (T+1).
- **Per-switch cost: 0.10% of every switched dollar**, charged on both legs of a move (a conservative stand-in for spread, timing drift, and cash-in-transit while switching funds inside a plan).
- **Roundtrip restriction:** a position sold cannot be repurchased for **30 calendar days** (typical fund frequent-trading policy). A contender whose rules would demand a forbidden repurchase holds its current position and the incident is counted (§6 metric 2).
- **Tempo cap:** base-regime portfolio changes at most monthly; override-driven changes at most weekly.
- **Whipsaw accounting:** every switch's cost is accumulated per contender and stated in RACE_RESULTS — a contender that flaps pays for it in the arithmetic, visibly.

## §4 — Vintage coverage envelope (ruling R3 — mandatory section)

The vintage memory does not hold every revision of every observation; it holds what the A1 backfill's grid captured and what the daily sweeps capture going forward. Stated plainly:

- **Historical capture (the A1 backfill grid):** each month-end grid vintage re-checked observations within a trailing window per cadence — **daily 45 days, weekly 120 days, monthly 425 days, irregular 190 days** — plus one full current-vintage pass on July 7, 2026.
- **Forward capture (the daily sweeps):** daily 14 days, weekly 730 days, monthly 425 days, irregular 190 days.
- **The honest consequence:** a read of an observation *older* than its capture window, as-of a date beyond that window, serves the **last-captured vintage** — the value as the memory last saw it, not any later revision the publisher shipped that the grid never sampled. Trailing-window reads inside the envelope are complete; deep-lookback reads are not.
- **The named-trigger rule:** a ratified contender spec whose lookback exceeds the envelope for any series is **the named trigger** for a targeted re-backfill of exactly those series, opened as its own ordered slice with S4-style row and API-call estimates — never a blanket re-backfill bought as insurance (charter §4.2·9).

## §5 — Input exclusions (finding F3, written in as law)

**HY OAS (`BAMLH0A0HYM2`) is never a Leg 1 input.** It is live-duty only: FRED clamps it to a rolling ~3-year window, and its refusal boundary moves with the wall clock — both disqualify it from deterministic replay. Deep-history stress duty in Leg 1 rides **VIX** (never-revised, honest to 1990-01-02) per ruling D3; **OFR FSI** is the live-duty stress instrument going forward, and its pre-snapshot (before 2026-07-07) history appears **only in Leg 2, labeled** (`SOURCE_VINTAGE_POLICIES.md` §4).

## §6 — Metrics, in disqualify-not-validate order

**Metric 1 — behavior at the named proof cases.** Each contender's conduct at each case is narrated in plain English in RACE_RESULTS. A case outside a contender's honest Leg-1 window is addressed with the window-limited honest equivalent and in Leg 2, labeled — stated, never skipped.

| Proof case | What it tests |
|---|---|
| The 2008 credit collapse | Does stress logic catch the fast panic official data missed? (Leg 1 honest equivalent per contender; full case in Leg 2) |
| Feb–Mar 2020 | Speed: the override's reason to exist |
| Calendar-2022 inflationary bear | The case that kills stress-only logic — stocks and bonds fell together (Record 01 §3C) |
| 2022–24 curve inversion, no recession | Yield-curve humility: an input, never a sole trigger (Record 01 honesty flag 1) |
| Oct 2025 CPI blackout | Graceful degradation when an official series goes dark — the Cleveland nowcasts were built for exactly this |

**Metric 2 — stability.** Switch counts, dwell times per regime, and flap incidents (a regime held shorter than the spec's own minimum dwell, or a forbidden-repurchase incident under §3). Hysteresis is load-bearing (Record 01 honesty flag 3); a contender that cannot hold a label is disqualifiable on this metric alone.

**Metric 3 — tilt outcome versus Contender D** (the null) under the §3 constraint model on the shared returns rail (D2), reported with the rail's limits stated (§7 honesty notes). Beating the null proves nothing (disqualify-not-validate); *losing* to the null after costs is evidence Robert weighs at S6.

**Metric 4 — coverage honesty.** The share of grid dates in each contender's honest window it could classify strictly as-published (empty as-of reads counted against, per §1). Coverage below **90%** of a contender's own honest window is a disqualification review.

**Disqualification requires a named, documented failure** — a catastrophic proof-case misread (e.g., risk-on through March 2020), flap rates violating the spec's own dwell law, or a coverage collapse — recorded in RACE_RESULTS with the evidence. Nothing in this race validates a winner; survivors earn shadow mode, not trust (charter §2.3).

## §7 — Comparability and honesty notes

- **Head-to-head comparisons run only on overlapping honest windows.** A contender's longer solo window is reported as additional evidence, labeled as such — never as a head-to-head score.
- RACE_RESULTS carries a standing honesty-notes section: the OFR pre-snapshot posture (§5), the returns rail's limits (what asset classes it prices honestly and from when — completed at Task 5 with the license quoted), the §4 coverage envelope, and every coverage gap metric 4 surfaces.

## §8 — Determinism and leg hygiene (mechanics the runner obeys)

- `rules_version` = the SHA-256 content hash of the ratified spec file that produced the row; the hash on every row must match the spec in-repo (acceptance §7.7).
- `inputs` jsonb cites every value used: series, observation date, value, and vintage date (`realtime_start`). In Leg 1, every cited vintage date ≤ the row's `classification_date` (acceptance §7.3).
- **Two consecutive full Leg-1 runs must produce byte-identical classification output** (acceptance §7.2).
- The race writes `replay` and `revised_study` rows only; `record` stays empty until a winner ships (out of scope, `A2_THE_RACE.md` §6).
- No Claude call exists anywhere in the race path — the deterministic path is Claude-free forever (charter §2.3).

---

*Drafted July 10, 2026 by Clyde for STOP S2. Nothing below Task 1 proceeds until Fabio rules on this file under the Delegation ruling, on the record, Robert's veto standing.*
