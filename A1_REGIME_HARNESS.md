# A1 — THE REGIME HARNESS

**Status:** COMPLETE — ruled by Robert at the A1 session close (status recorded July 10, 2026). Ratified July 6, 2026, by Robert; both §5 decisions ruled as proposed, same session.
**Authority:** `FUNDLENS_V8_CHARTER.md` §6 item 1 — "The harness — ingestion scheduler per source cadence, per-source vintage policies, regime-of-record schema, ALFRED replay plumbing, A0-pattern heartbeat and admin alerts."
**Operator:** Robert Coursey — not a developer, browser-only, plain English throughout (CLAUDE.md).
**Builder:** Clyde, under Evidence Gate/STOP law (charter §0, §3). One file per commit; migrations before merges; docs reach the repo only through Clyde commits (charter §3).
**Predecessor pattern:** A0 (PRs #18–#20) — heartbeat liveness, shared staleness rule, admin alert email. This assignment inherits that pattern by name (charter §6·1).
**Successor:** the race (charter §6 item 2). Nothing in this assignment classifies a regime; A1 builds the ground the race runs on.

---

## §0 — Mission, in plain English

Before any engine can audition, the building needs plumbing that no engine can argue with: a scheduler that fetches every approved data series on its own publication rhythm, a memory that stores each number **as it was published on the day we saw it**, a written policy per source saying how we replay history honestly, and a watchdog that emails Robert when a feed goes quiet. The race (charter §2.3) is only honest if every contender sees exactly what an investor could have seen on each historical date — never a revised number before its revision existed (charter §2.5, §4.2·4). A1 makes that physically true in the database before a single rule is written.

---

## §1 — Ground truth (verified on main at `dcddc92`, July 6, 2026)

- **A0 pattern to inherit:** `pipeline_runs.heartbeat_at` (migration `v8_a0_pipeline_runs_heartbeat.sql`), `startRunHeartbeat()` stamping ~60s, `runIsStale()` as THE shared liveness rule read by both `cron.ts` and `monitor.ts`, `getSystemHealth()` + the repaired admin alert email path.
- **Scheduler home:** `src/engine/cron.ts` (node-cron on Railway, 24/7, overlap guards).
- **Source law:** charter §4.2·5 quality bar (ratified): official statistical sources (Federal Reserve System incl. FRED/ALFRED; OFR; BLS; BEA; Treasury; Cboe public index files) plus licensed market prices (Tiingo, FMP). Charter §5 names the tiers; Regime Session Record 01 §6 (in `docs/sessions/v8-regime-session-01.md`) holds the July 6 live-verified series IDs, cadences, and platform facts (FRED API v2 keyed access; ICE BofA 3-year window).
- **Vintage law:** ALFRED governs FRED-hosted series; every non-FRED source needs a documented per-source vintage/replay policy **before race use** (charter §4.2·6).
- **Existing FRED integration (found at amendment, July 6):** the repo already holds `FRED_API_KEY` (env.example lines 24–26, live in Railway — the daily pipeline's thesis step consumes FRED macro data through `src/engine/fred.ts`). That integration serves the thesis lane, which is Claude-adjacent; the regime house builds its own separate adapter and shares only the key.
- **Not in scope by charter:** Claude sits nowhere in the deterministic path, ever (§2.3); EODHD recon and the WEGRX slice stay banked on named trigger (§4.2·9).

---

## §2 — Architecture at a glance

Four small pieces, all server-side TypeScript in a new `src/engine/regime/` module, wired into the existing cron and monitor machinery:

1. **Registry** — a `regime_series` table listing every approved series: source, ID, axis, tier, cadence, vintage policy, enabled flag. Stage 3 later turns series on or off by flag, never by schema change.
2. **Memory** — a `regime_observations` table shaped like ALFRED itself: every value carries the date it describes *and* the date it was published (`realtime_start`). Revisions become new rows; nothing is overwritten. A `regime_classifications` table (empty until an engine ships) gives the regime-of-record a home under §2.5 law from day one.
3. **Scheduler** — one daily sweep (17:30 ET) fetches every enabled series after the day's publications land, plus one morning expectations check (09:00 ET) that alerts on anything that failed to arrive when its cadence said it should. Two cron jobs total; per-series expectations do the calendar work.
4. **Watchdog** — A0 heartbeats on every ingest run, the shared staleness rule, and four alert conditions (§3, Task 7) through the existing admin email path.

---

## §3 — Tasks

### Task 0 — Clyde's Evidence Gate *(charter §3 operating law; CLAUDE.md)*
Read in full before anything else: `FUNDLENS_V8_CHARTER.md`, this assignment, `docs/sessions/v8-regime-session-01.md`, `CLAUDE.md`, `src/engine/cron.ts`, `src/engine/monitor.ts`, `src/engine/types.ts`, `src/engine/fred.ts` (the existing thesis-lane FRED integration — read-only reference), the FRED section of `src/engine/constants.ts`, `env.example`, and two existing migrations for house SQL style (`v8_a0_pipeline_runs_heartbeat.sql`, `a5_task2_dossier_v3.sql`). State findings: file purposes, the A0 liveness mechanics in your own words, and any conflict between this assignment and what you find on main. **STOP S1 — wait for Robert.**

### Operator Task O1 — FRED API key: RESOLVED, no action *(amended at ratification, July 6)*
The key already exists and is proven live: `FRED_API_KEY` sits in `env.example` (lines 24–26) and the production pipeline's thesis step fetches FRED data with it daily. Nothing to register, nothing to add in Railway, nothing to add to `env.example`. One key serves both lanes; FRED keys are free, per-user, and don't expire. No environment variable is added, touched, renamed, or corrected anywhere in A1 (CLAUDE.md hard rule).

### Task 1 — Registry migration + seed *(charter §4.2·5, §5)*
Migration `v8_a1_regime_series.sql`: create `regime_series` with columns — `id`, `source` (`fred` | `ofr` | `cleveland` | `cboe`), `series_code`, `display_name`, `axis` (`growth` | `inflation` | `stress` | `rates`), `tier` (`load_bearing` | `timeliness` | `confirmation` | `insurance`), `cadence` (`daily` | `weekly` | `monthly` | `irregular`), `vintage_policy` (`alfred` | `never_revised` | `alfred_windowed` | `snapshot_custom`), `fallback_channel` (nullable text), `enabled` (boolean), `notes`, `created_at`. Seed exactly this table — every ID below was live-verified in Regime Session Record 01 §6:

| Series | Source | Code | Axis | Tier | Cadence | Vintage policy | Enabled |
|---|---|---|---|---|---|---|---|
| CFNAI | fred | `CFNAI` | growth | load_bearing | monthly | alfred | yes |
| Sahm rule (real-time) | fred | `SAHMREALTIME` | growth | timeliness | monthly | alfred | yes |
| GDPNow | fred | `GDPNOW` | growth | timeliness | irregular | alfred | yes |
| Weekly Economic Index | fred | `WEI` | growth | confirmation | weekly | alfred | yes |
| Core CPI | fred | `CPILFESL` | inflation | load_bearing | monthly | alfred | yes |
| Core PCE | fred | `PCEPILFE` | inflation | load_bearing | monthly | alfred | yes |
| Headline CPI | fred | `CPIAUCSL` | inflation | load_bearing | monthly | alfred | yes |
| Headline PCE | fred | `PCEPI` | inflation | load_bearing | monthly | alfred | yes |
| 10-yr breakeven | fred | `T10YIE` | inflation | timeliness | daily | never_revised | yes |
| 5y5y forward breakeven | fred | `T5YIFR` | inflation | timeliness | daily | never_revised | yes |
| Cleveland CPI nowcast | cleveland | (adapter-defined) | inflation | timeliness | daily | snapshot_custom | yes |
| Cleveland PCE nowcast | cleveland | (adapter-defined) | inflation | timeliness | daily | snapshot_custom | yes |
| OFR Financial Stress Index | ofr | (adapter-defined) | stress | load_bearing | daily | snapshot_custom | yes |
| HY OAS | fred | `BAMLH0A0HYM2` | stress | confirmation | daily | alfred_windowed | yes |
| VIX | fred | `VIXCLS` | stress | confirmation | daily | never_revised | yes |
| NFCI | fred | `NFCI` | stress | confirmation | weekly | alfred | yes |
| 10y–3m Treasury spread | fred | `T10Y3M` | rates | confirmation | daily | never_revised | yes |
| STLFSI4 | fred | `STLFSI4` | stress | insurance | weekly | alfred | **no** |
| Cleveland inflation expectations | fred | `EXPINF1YR`, `EXPINF10YR` | inflation | insurance | monthly | alfred | **no** |
| ADS Index · NY Fed Nowcast · FCI-G | — | *unverified — registry rows only after Stage 3 verifies* (§4.2·7) | — | insurance | — | — | **no** |

Row notes to carry in `notes`: HY OAS is **live duty only** — FRED clamps it to a rolling 3-year window; replay past the window rides OFR FSI per charter §5. VIX has the Cboe full-history public file as backstop (§5). `T10Y3M` is an input, **never a sole trigger** (§5 yield-curve clause; Record 01 honesty flag 1); Stage 3 may swap it for Treasury-direct or GSW curves (§4.2·7). BLS/BEA direct APIs are recorded as `fallback_channel` on the four CPI/PCE rows — channels, not rows (§5 insurance; see ⚖ D1). The Cleveland expectations pair (`EXPINF1YR`, `EXPINF10YR`) seeds as **two separate registry rows**, both dormant — one series code per row (confirmed at S1, July 6).

### Task 2 — Observations + ingest-runs migrations *(charter §2.5, §4.2·6)*
Migration `v8_a1_regime_observations.sql`: create `regime_observations` — `id`, `series_id` (FK), `obs_date`, `value` (numeric), `realtime_start` (the publication/vintage date — the load-bearing column), `realtime_end` (nullable; ALFRED semantics — null means "still current"), `fetched_at`, `ingest_run_id` (FK), unique on (`series_id`, `obs_date`, `realtime_start`). Revisions insert new rows and close the old row's `realtime_end`; **no row is ever updated in place except to close `realtime_end`**.
Migration `v8_a1_regime_ingest_runs.sql`: create `regime_ingest_runs` mirroring the `pipeline_runs` liveness shape — `id`, `kind` (`sweep` | `expectations_check` | `backfill` | `manual`), `started_at`, `heartbeat_at`, `completed_at` (matching the `pipeline_runs` vocabulary — amended at S1, July 6), `status`, `series_attempted`, `rows_written`, `error`.

### Task 3 — Regime-of-record migration *(charter §2.5, §4.2·4)*
Migration `v8_a1_regime_classifications.sql`: create `regime_classifications` — `id`, `classification_date`, `regime_label` (text — taxonomy is Stage 2's; no enum yet), `basis` (`record` | `replay` | `revised_study`), `engine` (text — contender/winner name), `rules_version` (text — spec version or hash), `inputs` (jsonb — the as-published values used), `computed_at`. Unique on (`classification_date`, `basis`, `engine`, `rules_version`). The table stays empty until the race writes `replay` rows and a shipped winner writes `record` rows — §2.5 law gets its home before anyone needs it. Immutability of `record` rows is enforced per ⚖ D2.
**STOP S2 — present all four migration files' SQL in plain English to Robert. Robert applies them in the Supabase dashboard. No code PR merges until he confirms applied (charter §3 migrations-before-merges; A0 precedent).** *(Corrected July 6 per Fabio's whenever-item: Tasks 1–3 produce four migration files, not three.)*

### Task 4 — Fetch adapters *(charter §4.2·5, §4.2·6, §5)*
`src/engine/regime/sources/` — one adapter per source, each returning normalized observations `{obs_date, value, realtime_start}`:
- **alfred.ts** — the regime house's own FRED adapter, named for its defining capability so it can never be confused with the existing thesis-lane `src/engine/fred.ts` (which stays untouched). Keyed FRED API v2 via the existing `FRED_API_KEY`; two modes: *current* (latest window) and *vintage* (as-published via realtime parameters — this **is** the ALFRED replay plumbing of §6·1, plus `series/vintagedates` for revision maps). Pacing: sequential calls with a 250ms delay constant — courtesy far below FRED's ~120/min ceiling (Record 01 §6.2). This is an API-courtesy constant, distinct from and unrelated to the 1.2s Claude-call law (§3), which does not apply here because no Claude call exists anywhere in this assignment (§2.3).
- **ofr.ts** — OFR monitor open JSON API (no registration; Record 01 §6.5).
- **cleveland.ts** — Cleveland Fed daily nowcast downloads (~10:00 ET business days; Record 01 §6.4).
- **cboe.ts** — VIX full-history public file, backfill/backstop duty only (§5).
All Supabase writes via `supaFetch()`; no localStorage; no new external libraries without listing them in findings (charter §3 operating law; CLAUDE.md).

### Task 5 — Per-source vintage policy document *(charter §4.2·6, §2.5)*
New file `docs/regime/SOURCE_VINTAGE_POLICIES.md`, one section per source in the registry: revision behavior (with evidence links), how replay works for it, and its **earliest honestly-replayable date**. FRED-hosted sections cite ALFRED coverage. The two non-FRED sources (OFR, Cleveland) require original findings: does the publisher revise history? Can any past-published state be reconstructed from their archives, or does replay begin the day our own snapshots begin? Never-revised claims (breakevens per Record 01 §6.4, VIX closes) get stated as policy and then **watched** by the Task 7 integrity alert rather than trusted forever. **STOP S3 — present the drafted policy per source. If any source cannot support a replay-grade policy, escalate with options; do not paper over it (§4.2·6: documented policy is a precondition of race use, and the race is dishonest without it, §2.3).**

### Task 6 — Ingestion scheduler *(charter §6·1, §3 cadence law)*
Extend the cron module (new `src/engine/regime/ingest.ts`, jobs registered from `cron.ts`) with exactly two jobs, both scheduled in `America/New_York` because every publication clock in Record 01 §6 is Eastern; all stored timestamps stay UTC:
1. **Daily sweep, 17:30 ET** — fetch every `enabled` series. One evening pass catches the whole day's publications: NFCI (Wed 8:30 ET), Cleveland (~10:00 ET), H.15 breakevens (~16:15 ET), VIX close, OFR (which runs ~2 business days lagged regardless), GDPNow's irregular updates, and monthly series on their release days. For revising series, fetch a trailing window (not just the newest point) and upsert by (`series_id`, `obs_date`, `realtime_start`) so recent revisions land as new vintage rows; propose per-series window sizes in findings.
2. **Expectations check, 09:00 ET** — for each enabled series, compare newest `realtime_start` against its cadence plus grace (proposed: daily +1 business day, weekly +2 days, monthly +5 days; GDPNow `irregular` exempt) and raise the Task 7 missed-publication alert on breach. Cadence drives *expectation*; the sweep drives *fetching* — no release calendar is ever hard-coded.
Both jobs take A0-style overlap guards (in-memory flag + DB check for a running `regime_ingest_runs` row), create a run row, stamp heartbeats, and close the row in a finally block — the A0 shape, exactly (§6·1).

### Task 7 — Liveness + admin alerts *(charter §6·1; §2.5 for condition 4)*
Generalize `runIsStale()` **non-breakingly** so the one shared liveness rule (A0's explicit design) also reads `regime_ingest_runs` rows — no forked second rule. Wire four alert conditions into the existing A0 admin-email path (reuse; do not build a new sender):
1. **Ingest failure** — a series fails after 3 attempts, 30s apart, within a sweep.
2. **Missed publication** — the 09:00 expectations check finds a breach (the Oct 2025 CPI blackout is the motivating case — Record 01 §6.4/§6.6; the harness's job is to *notice*, loudly, same morning).
3. **Stale ingest run** — heartbeat silence per the shared rule (A0 pattern).
4. **Never-revised violation** — a new vintage arrives for a series whose policy says `never_revised`. That is a data-integrity event under §2.5 and Robert hears about it the same day.
Alert emails in plain English: series name, what was expected, what happened, and what the harness will do next (retry at next sweep).

### Task 8 — As-of replay interface *(charter §2.3 race law, §4.2·6)*
`src/engine/regime/asof.ts`: one function — `asOf(seriesCode, onDate, windowLength)` — returning the trailing observations **exactly as published on `onDate`**: ALFRED-backed for `alfred` policy series, trivially for `never_revised`, from our own snapshots for `snapshot_custom` (refusing dates earlier than the Task 5 earliest-replayable date with a clear error, never a silent substitution), and refusing past-window dates for `alfred_windowed` (HY OAS) with a pointer to the documented OFR mitigation (§5). This function is the only door the race's contenders may use to see history (§2.3: "no contender ever sees a revision before its publication date"). Include a small self-test that fetches one known-revised CPI observation and proves the as-of value differs from the current value.

### Task 9 — Backfill runner *(charter §2.3 — "run 30+ years as-published")*
`kind='backfill'` manual-trigger run (admin-gated route or script, Clyde proposes) that loads full available history + needed vintages for enabled series. **STOP S4 — before executing any backfill, present per-series row-count and API-call estimates and the fetch order. Bulk history lands only after Robert's go**, sequentially, paced, heartbeat-stamped. NFCI's weekly full-history revisions are the known volume risk (Record 01 §6.5): the estimate must state the bounded as-of strategy (store the windows the race needs, not every vintage of every observation) rather than discovering the problem mid-run.

### Task 10 — Register riders *(charter §5 register; handoff authorization July 6)*
One-file, one-hunk commit: in `env.example`, fix the stale line-21 comment describing Tiingo as "backup" — Tiingo is a paid rail and the NAV backbone (§5). **Change the comment only. The variable name `TINNGO_KEY` on line 22 is intentional and untouchable — never correct, rename, or mention it in code or commit messages (charter §3 frozen constants; CLAUDE.md hard rule).** No FRED line is needed — it already exists (O1).
Operator checks, browser-only, reported in-session and recorded by Clyde in the Task 11 session record: **O2** — confirm no Finnhub billing remains (code runs its free tier with static-map fallback, §5); **O3** — record Tiingo and FMP renewal dates (§5).

### Task 11 — Session record + report *(charter §3 session law; CLAUDE.md reporting)*
Commit `docs/sessions/A1_SESSION_RECORD_<date>.md`: what shipped, what was verified, O2/O3 answers, the vintage-policy findings summary, and a suggestions list for anything noticed but not touched (scope discipline — never acted on). Close with the scoreboard.

---

## §4 — STOP register

| STOP | Where | What Robert sees before anything proceeds |
|---|---|---|
| S1 | After Task 0 | Clyde's findings on the ground truth |
| S2 | After Task 3 | All migration SQL, plain English; Robert applies in Supabase first (§3) |
| S3 | After Task 5 | Per-source vintage policies; escalation if any source can't replay honestly (§4.2·6) |
| S4 | Before Task 9 executes | Row-count + API-volume estimates for the backfill |

---

## §5 — Ratified rulings (Robert, July 6, 2026)

- **D1 — Insurance posture: RATIFIED as proposed.** Insurance-tier rows are seeded **dormant** (`enabled=false`). BLS/BEA fallback *adapters* are not built in A1 — the registry records the channel, and a missed-publication alert is the named trigger that opens a build slice (§4.2·9 spirit: act on a named trigger, never for insurance). The alternative — building the adapters now — was considered and declined.
- **D2 — Mechanical immutability: RATIFIED as proposed.** The Task 3 migration includes a ~10-line trigger blocking UPDATE/DELETE on `regime_classifications` rows where `basis='record'` — §2.5 says "stored immutably," and law deserves enforcement, not convention. The alternative — code-level convention only — was considered and declined.

---

## §6 — Out of scope (scope discipline, CLAUDE.md; charter §6 sequencing)

No regime rules, thresholds, taxonomy, or classification of any kind (Stages 2–4 unwritten; the race is §6 item 2). No contender code. No Claude API call anywhere — the deterministic path is Claude-free forever (§2.3). No UI or client changes of any kind; a touched `client/` file is a scope violation. No Ken French library (fund-side race prep, §4.2·7). No EODHD calls, no WEGRX work — banked, named-trigger only (§4.2·9). No changes to the fund pipeline beyond the non-breaking `runIsStale()` generalization; the existing thesis-lane FRED integration (`src/engine/fred.ts`, `FRED_COMMODITY_SERIES`, and the `FRED` block in `constants.ts`) is untouched. No touching `constants.ts` beyond adding new regime-module constants in the regime module's own files.

---

## §7 — Acceptance — what Fabio verifies before A1 closes *(charter §7 measurement law)*

1. Migrations on production match the reviewed SQL; applied before the code merged (§3).
2. `regime_series` seed count and contents match the Task 1 table exactly.
3. One full scheduled sweep on Railway writes observations for every enabled daily series; run row shows heartbeats and clean close.
4. As-of proof: the Task 8 self-test shows a known CPI revision — as-published value ≠ current value, both cited by vintage date.
5. Never-revised watch armed: `T10YIE` shows exactly one vintage per observation.
6. A deliberately induced missed-publication condition (dry-run flag or one-off expectation tweak, Clyde proposes) produces the plain-English admin email through the A0 path.
7. `npx tsc --noEmit` clean; no `client/` diffs anywhere in the PRs.
8. `docs/regime/SOURCE_VINTAGE_POLICIES.md` exists with an earliest-replayable date per source.

---

## §8 — Budget *(charter §3 ceiling; §4.2·9)*

Expected new spend: **$0.** FRED key free, OFR open JSON, Cleveland downloads free, Cboe public file free. Tiingo/FMP untouched. The $250/month ceiling is unmoved. Any task that turns out to require spending money is a STOP, not a purchase (§4.2·9: buy only when a named computation is blocked — and then only Robert buys).

---

*Session law rides along: half-page opening briefing, plain English, one decision at a time, scoreboard close (§3). — Drafted by Fabio and ratified by Robert, July 6, 2026, under the governing charter at `dcddc92`.*
