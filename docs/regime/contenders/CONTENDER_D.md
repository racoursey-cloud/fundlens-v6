# CONTENDER D — The Null Hypothesis (Three Static Mixes, Annually Rebalanced)

**Authority:** `A2_THE_RACE.md` Task 4; charter §2.3 ("The null runs in the race or the race is dishonest" — and "if the null wins, the product ships the null and says so proudly"). Obeys `RACE_RULES.md` **as frozen at blob `ea44a7dc0cdcf473035528849234b39258c39f4a`** (commit `e546da7`) — same constraint model as everyone (Task 4 order).
**Status:** DRAFTED for STOP S4 (ratified together with B and C; Fabio rules under the Delegation ruling, Robert's veto standing). Upon ratification this file is frozen and its SHA-256 content hash becomes `rules_version` on every row Contender D writes.
**Plain-English shape:** do nothing, on purpose, three ways. Pick a mix that fits your risk, rebalance once a year, and never react to anything. Every other contender must visibly earn its complexity against this — after costs.

---

## §1 — The three reference mixes (D's mixes are its own tilt map — Task 4 order)

Two-asset instrumentation on the shared returns rail (D2), identical to every other contender's metric-3 instrumentation:

| Mix | Equity | Risk-free | Why this number |
|---|---|---|---|
| `static_conservative` | **30%** | 70% | The tilt ladders' storm floor (A §3.8, B §3.8) — held permanently |
| `static_balanced` | **60%** | 40% | The classic 60/40 — the industry's own null hypothesis |
| `static_growth` | **80%** | 20% | The tilt ladders' ceiling — held permanently |

The three mixes deliberately bracket the exact operating range of A's and B's ladders (30–80% equity): a tilting contender that cannot beat *its own range's endpoints held statically, plus the classic middle*, after RACE_RULES §3 costs, has demonstrated that its movement subtracts value. That is precisely the question charter §2.3 orders the race to ask. Risk-and-horizon appropriateness (the charter's phrase) maps conservative → short-horizon dollars, balanced → the middle, growth → long-horizon dollars; the race-scoped instrument for all three is the same two-asset rail everyone shares.

## §2 — The only rule D has: the annual rebalance

- At the **first monthly grid date of each calendar year** (the January month-end), each mix resets to its fixed weights. Execution and costs per RACE_RULES §3 exactly as for every other contender: T+1 execution, 0.10% per switched dollar on the turnover the reset requires (|Δ equity weight|), no intraday action.
- **No other trading exists.** No signal, no tilt, no reaction — by definition. The 30-day roundtrip restriction (RACE_RULES §3) cannot bind at an annual cadence; stated for completeness.
- Between rebalances, weights drift with returns. The drift is the point: the null holds its course exactly the way a real do-nothing participant would.

## §3 — Inputs, honest start, coverage

- **D takes no as-of inputs.** No macro series, no price *signal* — the rail prices its returns in the runner's metric-3 arithmetic, but nothing D does depends on reading any history. Consequences, each stated plainly per the Task 3/4 order:
  - **Empty-`asOf` behavior: satisfied vacuously.** There is no read that could come back empty; no defaulting is possible because there is nothing to default. A missing rail date is a runner/rail matter (Task 5), not a classification event.
  - **F3: obeyed vacuously and absolutely.** `BAMLH0A0HYM2` appears nowhere in Leg 1 — D reads nothing at all (RACE_RULES §5).
  - **Coverage (RACE_RULES §6 metric 4): 100% of its window by construction.** D classifies every grid date it exists on; it is the coverage yardstick the others are read against.
- **Honest start: the rail's verified start date, no warm-up** — D needs no trailing window. This is pending the same primary print as Contender B's §4.4 rows 1–2 (documented 1926-07-01 daily / July 1926 monthly; primary fetch blocked from this session's container — same evidence, same protocol, printed at Task 5 rail adoption). Head-to-head comparisons run only on overlapping honest windows regardless (RACE_RULES §7), so D meets every opponent on that opponent's own window.

## §4 — Rows the null writes (proposed; final shape ridable at S5)

D writes one row per grid date per leg per mix, `regime_label = 'static'`, `inputs` jsonb carrying the mix name and its standing weights — so the determinism check (two byte-identical Leg-1 runs, RACE_RULES §8), row-count audits, and leg hygiene apply to the null exactly as to everyone. *Alternative — D writes no classification rows and exists only in RACE_RESULTS arithmetic — stated for the S4/S5 record; declined here because a contender with no auditable output is a contender the acceptance checklist cannot reach.*

## §5 — Measurement against D (how metric 3 reads this spec)

- **Primary comparison: `static_balanced` (60/40)** — the single number quoted first in RACE_RESULTS for each contender, because 60/40 is the mix a do-nothing participant most plausibly holds and both tilt ladders center near it. All three mixes are reported in full alongside. *Judgment call, flagged for S4; alternative — pair each contender against the mix nearest its realized average equity weight — stated; declined as a data-dependent pairing rule that couldn't be frozen before results exist.*
- **Cheapest-adequate, honestly scoped:** on the race rail there are no funds and no expense ratios, so cheapest-adequate cannot be *priced* here; it is the charter's product-level clause (§2.1, §2.2) and the instrumentation is identical across all contenders, so vehicle-cost differences cancel out of every comparison by construction. The rail's limits are stated in RACE_RULES §7 honesty notes, completed at Task 5.
- Losing to D after costs is evidence Robert weighs at S6; beating D proves nothing (disqualify-not-validate, RACE_RULES §6 metric 3). If D wins, the product ships the null and says so proudly (charter §2.3) — this spec is that product's seed.

## §6 — Determinism notes and RACE_RULES conflict check (recorded per the order)

- A pure function of the calendar: same grid → same rows, byte-identical across runs. No wall-clock reads; nothing to cite in `inputs` beyond the standing weights (§4).
- **No conflict.** Grid and tempo (§2 — one action per year, far inside the monthly cap), constraint model (§3, adopted whole), envelope (§4 — no as-of reads, nothing to re-backfill), F3 (§5 — vacuous), metrics (§6 — D is the metric-3 baseline and reports its own switch costs like everyone), comparability (§7 — overlapping windows). Frozen law cited by anchor throughout.

---

*Drafted July 10, 2026 by Clyde for STOP S4. Frozen only upon Fabio's ruling, Robert's veto standing.*
