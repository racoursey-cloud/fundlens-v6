# A2 — THE RACE

**Status:** RATIFIED — July 10, 2026, by Robert; all three §5 decisions ruled as proposed, same session. Drafted July 10, 2026, by Fabio.
**Authority:** `FUNDLENS_V8_CHARTER.md` §6 item 2 — "The race — write Contender A's Stages 2–4 plus B/C/D specs deterministically; run 30+ years as-published; publish results in-repo; Robert rules." Race law: charter §2.3. Vintage law: §2.5, §4.2·6. Measurement law: §7.
**Operator:** Robert Coursey — not a developer, browser-only, plain English throughout (CLAUDE.md).
**Builder:** Clyde, under Evidence Gate/STOP law (charter §0, §3). One file per commit; docs reach the repo only through Clyde commits; Findings law applies (CLAUDE.md, ratified July 10).
**Predecessor:** A1 (PRs #28–#39 era) — the harness is complete: registry, vintage memory (79,843 rows at backfill close, growing daily), scheduler, watchdog, and the as-of door. Nothing in A1 classified a regime; A2 is where classification rules are written — as auditioners, not incumbents.
**Successor:** the mix (charter §6 item 3). Sequencing after the race may be re-ordered by what wins (§6).

---

## §0 — Mission, in plain English

Four ways of reading the economic weather audition against decades of history, each seeing only what an investor could actually have seen on each date — through one door, `asOf()`. Nobody gets the engine room by argument (charter §2.3). A do-nothing baseline runs in the same race, because if tilting can't beat not-tilting after realistic costs, the product ships the null and says so proudly (§2.3). The replay can prove a rule bad; it can never prove one good — survivors earn shadow mode, not trust (§2.3 disqualify-not-validate). Robert rules the winner from results published in the repo, and the deterministic path stays Claude-free forever (§2.3).

---

## §1 — Ground truth (verified July 10, 2026: repo read at main `64a69d7`; read-only production queries same day)

- **The door exists:** `src/engine/regime/asof.ts` — `asOf(seriesCode, onDate, windowLength)` returns the trailing observations exactly as published on `onDate`, refusing rather than silently substituting (`alfred_windowed` past FRED's ~3-year window; `snapshot_custom` before its first stored vintage). One behavior contenders must handle: for `alfred`-policy series, a date before the series' first stored vintage returns an **empty result, not an error** — empty means "this input did not exist as-published on that date" and must never be silently defaulted (see Task 6).
- **The results table exists and is race-shaped:** `regime_classifications` (empty) carries `basis` (`record` | `replay` | `revised_study`), `engine`, `rules_version`, `inputs` (jsonb), unique on (`classification_date`, `basis`, `engine`, `rules_version`); `record` rows are trigger-immutable (A1 §5 D2). The race writes `replay` and `revised_study` rows only; `record` stays untouched until a winner ships.
- **The honest replay windows, pulled from production** (earliest *stored* as-published vintage per enabled series; the race runs on stored vintages):

| Series | Axis | Policy | As-published from |
|---|---|---|---|
| T10Y3M | rates | never_revised | 1982-01-04 |
| VIXCLS | stress | never_revised | 1990-01-02 |
| CPIAUCSL | inflation | alfred | 1990-01-31 |
| CPILFESL | inflation | alfred | 1996-12-31 |
| PCEPI / PCEPILFE | inflation | alfred | 2000-08-31 |
| T10YIE / T5YIFR | inflation | never_revised | 2003-01-02 |
| CFNAI | growth | alfred | 2011-05-31 * |
| NFCI | stress | alfred | 2011-05-31 |
| CLEV_CPI / CLEV_PCE nowcasts | inflation | snapshot_custom | 2013-08-20 (the feed is its own archive) *(corrected July 10, 2026: the 2012-10-01 first printed here was the F2 parser year-shift, not a vintage — repaired under the named authorizations and re-verified in production July 10; the policies doc's 2013:Q3 claim stands vindicated)* |
| GDPNOW | growth | alfred | 2016-05-31 |
| SAHMREALTIME | growth | alfred | 2019-09-30 |
| WEI | growth | alfred | 2020-04-30 |
| OFR_FSI | stress | snapshot_custom | 2026-07-07 (pre-snapshot history is revised-basis only — `SOURCE_VINTAGE_POLICIES.md` §4) |
| BAMLH0A0HYM2 | stress | alfred_windowed | live duty only (~3-year rolling window) |

\* ALFRED's CFNAI archive begins 2011-05-23 (vintage policies ERRATA); the backfill's month-end grid makes 2011-05-31 the earliest stored vintage, which is what `asOf` can serve.

- **The consequence, stated plainly:** a strict as-published replay reaches only as far back as the *youngest* input a contender requires. Never-revised market series reach 1990 and earlier; CPI vintages reach 1990; the growth composites reach 2011; the OFR stress index's as-published record began last week. "30+ years as-published for every input at once" is physically impossible — which is why decision D1 exists, and why the A1 schema already holds a `revised_study` label waiting for exactly this.
- **Not in scope by charter:** no Claude call anywhere in this assignment (§2.3). EODHD recon and the WEGRX slice stay banked on named trigger (§4.2·9). The July 12 expiry check rides whichever session that date hits (§6).

---

## §2 — Architecture at a glance

Four pieces, in strict order — law before specs, specs before code, code before execution:

1. **Race rules** — one law file, `docs/regime/RACE_RULES.md`: the two legs, per-contender honest starts, decision tempo, the constraint and whipsaw-cost model, metrics, disqualification criteria, proof cases. Ratified before any contender spec is written.
2. **Contender specs** — `docs/regime/contenders/CONTENDER_A.md` … `CONTENDER_D.md`: frozen, citable, deterministic rules. For A this is the charter's "Stages 2–4" (taxonomy, indicator set, classification rules — the Record 01 §1 stage map). Each spec states its own inputs, its honest start date computed from §1, and its constraint handling.
3. **Contender code + runner** — `src/engine/regime/contenders/` (one pure, deterministic module per contender) and `src/engine/regime/race.ts`, which walks the decision grid, feeds contenders history only through the sanctioned readers, and writes `regime_classifications` rows with `rules_version` = the spec's version hash.
4. **Results** — `docs/regime/RACE_RESULTS.md`: generated tables plus honesty notes, committed in-repo. Robert rules from this document (§2.3, §6·2).

---

## §3 — Tasks

### Task 0 — Clyde's Evidence Gate *(charter §3 operating law; CLAUDE.md)*
Read in full before anything else: `FUNDLENS_V8_CHARTER.md`, this assignment, `docs/sessions/v8-regime-session-01.md` (especially §3–§5: the framework survey, Contender A's Stage 1 shape, and the honesty flags), `docs/regime/SOURCE_VINTAGE_POLICIES.md` (including the ERRATA and §4's OFR finding), `CLAUDE.md`, `src/engine/regime/asof.ts`, `src/engine/regime/ingest.ts`, `src/engine/types.ts`, and the four regime migrations for schema truth. *(Corrected July 10, 2026 at S1 — finding F1, Fabio's drafting error, caught by Clyde: A1 shipped four migration files, `regime_ingest_runs` included; "three" understated the read list.)* State findings: the stage vocabulary in your own words, the asOf refusal-and-empty semantics, and any conflict between this assignment and main. **STOP S1 — wait for Robert.**

### Task 1 — RACE_RULES.md *(charter §2.3 race law; §2.5; §7)*
One plain-English law file the whole race obeys. It must pin down, each in its own section:
- **The two legs (per D1):** Leg 1 — as-published, `basis='replay'`, history through `asOf()` exclusively, each contender starting at its honest start (the latest earliest-vintage among its required inputs, computed and printed, never hand-waved). Leg 2 — revised-basis, `basis='revised_study'`, current-vintage history from 1990-01 forward, labeled as such on every surface it touches. Leg 1 alone carries disqualification authority; Leg 2 supplies the 30-year span as labeled context (§2.5: recomputations on revised data are labeled).
- **Decision tempo:** proposed — base classification on a month-end grid (charter "monthly-ish tempo"); the stress override may be *evaluated* at its inputs' daily/weekly cadence but portfolio *action* obeys the constraint model below. Clyde proposes exact grid mechanics in the file.
- **Constraint + whipsaw model:** 401(k)-realistic frictions — no intraday action, next-available-trade-date execution, a stated per-switch cost assumption, and a frequent-trading posture consistent with fund roundtrip restrictions. Whipsaw costs stated per contender in results (§2.3).
- **Metrics, in disqualify-not-validate order:** (1) behavior at the named proof cases — the 2008 credit collapse (or the window-limited honest equivalent per contender), Feb–Mar 2020, calendar-2022 inflationary bear (the case that kills stress-only logic — Record 01 §3C), the 2022–24 curve inversion with no recession (Record 01 honesty flag 1), and the Oct 2025 CPI blackout (does classification degrade gracefully?); (2) stability — switch counts, dwell times, flap incidents (hysteresis is load-bearing — Record 01 honesty flag 3); (3) tilt outcome versus Contender D under the constraint model on the shared returns rail (D2), reported with the rail's limits stated; (4) coverage honesty — the share of grid dates each contender could classify strictly as-published.
- **Comparability:** head-to-head only on overlapping honest windows; longer solo windows reported as additional evidence, labeled as such.
**STOP S2 — Robert ratifies the race rules. No contender spec is written before this.**

### Task 2 — Contender A spec *(charter §2.3 "exactly as specified by Regime Session Record 01 (Stage 1)"; §4.2·2)*
`CONTENDER_A.md` — the quadrant + stress override, its Stages 2–4 written as race preparation:
- **Stage 2 (taxonomy):** 4 base states (growth × inflation) + 1 override = 5 regimes, mutually exclusive and collectively exhaustive; Stage 2 may split one base cell to reach 6, staying within the charter's 4–6 (Record 01 §4). These names also govern the narration vocabulary for whichever engine wins (§4.2·2).
- **Stage 3 (indicator set):** drawn from the §1 registry — growth from CFNAI/Sahm/GDPNow/WEI; inflation from core CPI/PCE anchored by breakevens and the Cleveland nowcasts; stress per D3 (VIX for deep history, OFR FSI live-duty forward). Every chosen series' honest start printed; the composite's honest start derived from them.
- **Stage 4 (classification rules):** explicit thresholds, entry/exit hysteresis buffers and minimum dwell times, tie-breaks, and vintage handling — including what the rule does when an input's `asOf` read comes back empty. Offline statistical calibration is free (§4.2·8); the shipped spec is frozen, citable, deterministic.
**STOP S3 — Robert ratifies Contender A's spec.**

### Task 3 — Contenders B and C specs *(charter §2.3)*
- **`CONTENDER_B.md` — trend / volatility / stress stack:** time-series trend per asset class (above/below a long moving average) on never-revised price series; volatility-managed exposure scaling at the mix level (the Barroso–Santa-Clara logic already in our momentum math, §2.3); a stress override on top (shared with A's override definition or its own — the spec states which and why). **Price-history sourcing is a named verification item inside this spec:** candidate rails are Tiingo ETF/fund NAV history and the D2 library; every price series' actual start date is verified and printed before the spec is declared complete — no assumed histories.
- **`CONTENDER_C.md` — the blend:** quadrant narrates the weather; trend/vol computes the tilts; stress overrides both (§2.3). Written strictly as a composition of A's and B's ratified pieces — no new machinery.
**STOP S4 — Robert ratifies B, C, and D together (D below).**

### Task 4 — Contender D spec — the null *(charter §2.3: "The null runs in the race or the race is dishonest")*
`CONTENDER_D.md`: a static risk-and-horizon-appropriate category mix (proposed: three fixed reference mixes — conservative, balanced, growth), annually rebalanced, cheapest-adequate assumption, no tilting, same constraint model as everyone else. If the null wins, the product ships the null and says so proudly (§2.3). Included in the S4 ratification.

### Task 5 — The shared returns rail *(D2; charter §4.2·7)*
Adopt the Ken French data library for the race's return series (equity market + risk-free at minimum), **license read at adoption and its terms quoted in the spec** (§4.2·7). Name and verify the bond-side series the same way. Rail data is fetched and cached by the runner — never committed as bulk data, never written to the regime tables, and never touching the production scoring path. The rail's limits (what asset classes it can and cannot price honestly, and from when) are stated in RACE_RULES' honesty notes. If any required return series turns out to cost money, that is a STOP, not a purchase (§4.2·9).

### Task 6 — Contender code + race runner *(charter §2.3; §2.5)*
`src/engine/regime/contenders/a.ts` … `d.ts` — pure, deterministic functions from as-of inputs to a regime label; and `src/engine/regime/race.ts` — the runner that walks the grid and writes rows.
- **Leg 1 reads history exclusively through `asOf()`** — provable by inspection: contender modules import no other data access. An empty `asOf` return is handled as "input unavailable as-published" per the ratified Stage 4 rules and counts against coverage — never silently defaulted.
- **Leg 2 reads through one separate, loudly-named revised-basis reader** that is mechanically incapable of writing anything but `basis='revised_study'` rows.
- `rules_version` = the ratified spec file's content hash; `inputs` jsonb cites every value used with its vintage date. **Determinism check:** two consecutive full Leg-1 runs must produce byte-identical classification output.
- No schema changes are expected. If one proves necessary, it goes through the Database law in full: exact file text presented, one migration at a time, Robert applies or explicitly approves by name, committed file byte-matches. Uncertain approval is no approval (CLAUDE.md).
**STOP S5 — before first full execution:** grid size, expected `regime_classifications` row counts per leg, and runtime estimate. Expected shape: the race reads our own database — no external API volume beyond the one-time rail fetch; minutes, not hours.

### Task 7 — Execute and publish *(charter §6·2 "publish results in-repo"; §7)*
Run both legs. Generate `docs/regime/RACE_RESULTS.md`: per-contender tables for every RACE_RULES metric, honest windows printed, proof-case narratives in plain English, honesty notes (OFR pre-snapshot posture, rail limits, coverage gaps). One PR carries the results doc; nothing else rides it.
**STOP S6 — Robert rules the winner (or the null, proudly), on the record, from the published results.** The ruling and its rationale are recorded; survivors earn shadow mode, not the engine room (§2.3).

### Task 8 — Session record + report *(charter §3 session law; CLAUDE.md reporting)*
Commit the A2 session record: what shipped, what was verified, the ruling, and a suggestions list for anything noticed but not touched (Findings law: blocking fixed in-slice; cosmetic to FOLLOWUPS.md, one line each). Close with the scoreboard.

---

## §4 — STOP register

| STOP | Where | What Robert sees before anything proceeds |
|---|---|---|
| S1 | After Task 0 | Clyde's findings on the ground truth |
| S2 | After Task 1 | RACE_RULES.md — the race's law, ratified before any spec |
| S3 | After Task 2 | Contender A's Stages 2–4 spec |
| S4 | After Tasks 3–4 | Contenders B, C, and D specs |
| S5 | Before Task 7 executes | Grid size, row counts, runtime estimate |
| S6 | After Task 7 | Published results; Robert rules the winner |

---

## §5 — Ratified rulings (Robert, July 10, 2026)

- **D1 — The two-leg race: RATIFIED as proposed.** Leg 1 (as-published, `replay` basis, through `asOf` only, per-contender honest starts) carries all disqualification authority; Leg 2 (revised-basis, `revised_study` basis, 1990→present, labeled everywhere) supplies the charter's 30-year span as context and pattern evidence. *Alternative considered:* as-published only — declined to recommend, because it silently shrinks "30+ years" to ~15 for Contender A and erases 2008 from the race entirely; the schema's own `revised_study` vocabulary exists for exactly this.
- **D2 — Ken French library as the shared returns rail: RATIFIED as proposed** (free, citable, decades-deep; license read at adoption per §4.2·7), cached not committed, quarantined from production paths. *Alternative considered:* a Tiingo-only rail — shorter history, fund-shaped rather than asset-class-shaped.
- **D3 — Stress replay posture: RATIFIED as proposed.** Contender specs use VIX (never-revised, honest to 1990) as the deep-history stress instrument; OFR FSI is the live-duty, load-bearing stress input going forward (§5 charter), and its pre-snapshot history appears only in Leg 2, labeled. *Alternative considered:* OFR-only stress — declined to recommend, because it caps every contender's Leg-1 stress history at July 2026.

---

## §6 — Out of scope *(scope discipline, CLAUDE.md; charter §6 sequencing)*

No shipping engine — winner integration, tilts into Positioning, and the mix are §6 items 3+. No `record`-basis rows; the regime-of-record stays empty until a winner ships. No UI or `client/` changes of any kind. No Claude API call anywhere — the deterministic path is Claude-free forever (§2.3). No new registry rows or flag-flips except those a ratified spec names explicitly. No touching the v7 fund pipeline or the thesis-lane FRED integration. No EODHD, no WEGRX (§4.2·9). No new spend without a STOP.

---

## §7 — Acceptance — what Fabio verifies before A2 closes *(charter §7 measurement law)*

1. Contender modules reach history only through `asOf()` — verified by reading every import and grepping for any other data access.
2. Determinism: two consecutive full Leg-1 runs byte-identical.
3. Every `replay` row's `inputs` jsonb cites only vintage dates ≤ its `classification_date`.
4. Honest start dates in RACE_RESULTS match the §1 production vintage table.
5. Leg hygiene: no revised-basis value appears anywhere in Leg-1 output; every Leg-2 surface carries the label.
6. Every RACE_RULES metric appears in RACE_RESULTS; every proof case is addressed per contender, including the ones a contender's window cannot honestly reach (stated, not skipped).
7. Spec hashes match `rules_version` on every row; `npx tsc --noEmit` clean; no `client/` diffs in any PR.

---

## §8 — Budget *(charter §3 ceiling; §4.2·9)*

Expected new spend: **$0.** The race reads our own vintage memory; the French library is free with license read at adoption; Tiingo/FMP untouched. The $250/month ceiling is unmoved. Any task that turns out to require money is a STOP, not a purchase.

---

*Session law rides along: half-page opening briefing, plain English, one decision at a time, scoreboard close (charter §3). — Drafted by Fabio and ratified by Robert, July 10, 2026, under the governing charter at main `64a69d7`.*
