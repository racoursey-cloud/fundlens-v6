# Regime Harness — Per-Source Vintage & Replay Policies (A1 Task 5)

**Authority:** `FUNDLENS_V8_CHARTER.md` §4.2·6 (documented per-source vintage/replay policy is a precondition of race use), §2.5 (regime-of-record law), §2.3 (race law: "no contender ever sees a revision before its publication date").
**Status:** Drafted July 6, 2026 for STOP S3 review. Each section states: how the publisher treats its own history, how replay works for us, and the earliest honestly-replayable date.
**Standing rule:** `never_revised` is a *policy statement placed under watch*, not an article of faith — the Task 7 integrity alert fires the same day any new vintage arrives for a series whose policy says it can't happen.

---

## 1. FRED-hosted series, policy `alfred`

**Series:** CFNAI, SAHMREALTIME, GDPNOW, WEI, CPILFESL, PCEPILFE, CPIAUCSL, PCEPI, NFCI, (dormant: STLFSI4, EXPINF1YR, EXPINF10YR)

- **Revision behavior:** these series revise — some heavily (NFCI republishes its whole history weekly; CPI takes annual seasonal revisions). That is why they carry the `alfred` policy.
- **Replay mechanism:** FRED's own vintage archive (ALFRED) via the `realtime_start`/`realtime_end` parameters — ask for "the series as published on date D" and the API returns exactly that. This is mechanical, publisher-maintained, and citable (https://alfred.stlouisfed.org).
- **One honesty caveat, handled in code:** when a vintage window is requested, FRED clamps a returned observation's `realtime_start` to the window start if the value was published earlier. A clamped date is a window artifact, not a publication date — so ingest **dedupes by value comparison** against held vintages and never blind-inserts (`alfred.ts` header; Task 6).
- **Earliest honestly-replayable date:** per-series ALFRED coverage, verified per series at backfill time (S4 presents the actual earliest vintage date for each — e.g. GDPNow vintages archive back to Q3 2011 per Record 01 §6.2). Before a series' first ALFRED vintage, no as-published replay exists; the as-of interface (Task 8) refuses rather than substitutes.
- **ERRATA (July 7, 2026, found by the first backfill execute; corrected same day by Fabio's completion verification):** FRED's "The series does not exist in ALFRED" 400 is a **misleading publisher error — it also fires for realtime requests that predate a series' archive window.** The first execute's CFNAI failure was a pre-archive request (grid date 1990-01-31), not absence: **CFNAI is in ALFRED from 2011-05-23**, its registry `alfred` label stands untouched and correct, and its as-published replay begins 2011-05-23 (earlier history is revised-basis — same shape as the §4 OFR note, corrected for the race assignment accordingly). The operational fix stands on its own merit: the backfill discovers each series' true archive at runtime, clamps the replay grid to the first vintage date, and falls back to today-dated snapshot storage — reported as a finding, never papered over — for any series genuinely absent. Verified live at completion: 79,843 vintage rows, per-run sums exact, clamps confirmed (WEI: 76 vintages). Also corrected here: **GDPNow's ALFRED archive begins 2016-05-17**, not the Q3 2011 stated in Record 01 §6.2.

## 2. FRED-hosted series, policy `never_revised`

**Series:** T10YIE, T5YIFR (H.15 breakevens, ~16:15 ET), VIXCLS (daily close), T10Y3M

- **Revision behavior:** none once published — a breakeven or an index close is final the day it prints (Record 01 §6.4: "gold for determinism").
- **Replay mechanism:** trivial — the current value *is* the as-published value; `realtime_start` = observation date.
- **Watch:** acceptance item 5 requires `T10YIE` to show exactly one vintage per observation, and the Task 7 never-revised alert turns any violation into a same-day email. If a violation ever fires, the series' policy is re-examined on the record — the claim is enforced, not assumed.
- **Earliest honestly-replayable date:** the start of each series' history (T10YIE daily since Jan 2003; VIXCLS since Jan 1990).

## 3. FRED-hosted series, policy `alfred_windowed`

**Series:** BAMLH0A0HYM2 (HY OAS)

- **Revision behavior / constraint:** FRED clamps ICE BofA series to a rolling three-year window (April 2026 platform change, Record 01 §6.1). Values older than the window are *unavailable*, not revised.
- **Replay mechanism:** within the rolling window, same as `never_revised` in practice. Outside it, the as-of interface (Task 8) **refuses with a pointer to the documented mitigation** — stress replay past the window rides the OFR FSI (charter §5). No silent substitution, ever.
- **Earliest honestly-replayable date:** today minus ~3 years, moving daily. The registry row says "LIVE DUTY ONLY" for exactly this reason.

## 4. OFR Financial Stress Index, policy `snapshot_custom`

**Series:** OFR_FSI (headline; category/regional subindexes are Stage 3 flag-flips)

- **Format, verified July 6, 2026** from an operator-downloaded `fsi.csv`: daily CSV, full history 2000-01-03 → present (~6,700 rows), headline + 5 category + 3 regional columns; data current through ~2 business days prior. Parser proven against the real file (6,706 rows parsed).
- **Revision behavior — the honest finding:** the publisher reissues the **entire history in one file every business day**, and the index is model-based. That means past values *can* change inside the file, and today's file shows history **as today's model sees it**, not as it was published on past dates. No public as-published archive is known.
- **Replay policy:** as-published replay begins at **our first stored snapshot** (the day the harness's first sweep runs). Each sweep stamps its fetch date as the vintage; a changed past value becomes a new vintage row; unchanged values insert nothing. Before our first snapshot, OFR values are usable only as labeled `revised_study`-grade history — **never** as-published race input.
- **Consequence for the charter §5 mitigation:** "HY-OAS backtesting rides OFR FSI" holds for *current-model* history (fine for threshold calibration, which is offline design work under §4.2·8) — but a race replay of pre-snapshot dates using today's OFR file must be labeled as revised-basis, and the race's honesty notes must say so. **This is an S3 escalation item for Robert's eyes.**
- **Earliest honestly-replayable date:** first sweep date (expected: A1 deploy week).

## 5. Cleveland Fed daily inflation nowcasts, policy `snapshot_custom`

**Series:** CLEV_CPI_NOWCAST, CLEV_PCE_NOWCAST (headline columns; Core columns are Stage 3 flag-flips)

- **Format, verified July 6, 2026** from an operator-downloaded `QuarterlyAnnualizedPercentChange2026q3.csv`: one file per target quarter; one row per business day (Label = MM/DD); columns CPI / Core CPI / PCE / Core PCE, quarterly annualized percent change. Parser proven against the real file (4 daily vintages extracted for each series, mapped to the 2026-09-30 quarter-end observation).
- **Revision behavior — the good news, upgraded July 6 (Fabio's live pull of the JSON feed):** the feed is a top-level array of quarter blocks, **one per quarter from 2013:Q3 to the present**, each carrying its own day-by-day nowcast rows and a publication stamp. The feed is therefore its own as-published archive — every daily estimate back to 2013:Q3 reconstructs honestly from a single fetch, including days long before our first sweep.
- **Former S4 verification item — RESOLVED:** past quarters need no separate files; the archive ships inside the live feed. Today's block (07/01–07/06) was confirmed against the operator-downloaded CSV of the same data.
- **Earliest honestly-replayable date:** **2013:Q3** (the first block in the live feed).
- **ERRATA (July 10, 2026, A2 F2 — found at the race's S1 evidence gate, diagnosed by Fabio):** the adapter's original label-year rule dated every *post-quarter trailing* nowcast label exactly one year early (e.g. the 2013:Q3 block's October updates stored as 2012-10-01), which made production's earliest stored vintage appear to predate the archive. The parser was fixed (A2 F2 fix, `cleveland.ts`), the misdated rows repaired under the Database law, and **this section's 2013:Q3 claim stands vindicated** — the feed's archive begins where this policy always said it did.

## 6. Cboe VIX history file, policy `never_revised` (backstop duty only)

**Series:** none directly — this is the designated backstop behind FRED's VIXCLS (charter §5 "belt and suspenders") and a Task 9 backfill source.

- **Revision behavior:** daily closes are final at publication.
- **Replay mechanism:** trivial (`realtime_start` = observation date); full daily history 1990-present in one public file.
- **Role discipline:** never called by the daily sweep; used at backfill (S4-gated) and if VIXCLS goes dark.
- **Earliest honestly-replayable date:** January 1990.

## 7. D2 library (Ken French) race rail, policy `never_revised` — FROZEN AT ADOPTION (A2 Task 5, S4-ratified)

**Series:** RACE_EQ_TR (dormant registry row, `enabled=false` by design — never swept, never expectation-checked; `asOf()` serves it regardless of the flag). Registered by migration `v8_a2_task5_rail_series.sql` under the Database law.

- **Authority:** the S4 ruling (July 10, 2026) on `CONTENDER_B.md` §4.2–§4.3 (frozen at blob `c7e21270…`): the one-time ingest at adoption is the frozen as-published record for the race; same upstream file, two lawful channels — this registered signal series through `asOf()`, and the runner's metric-3 rail cache (Task 6), which never touches the regime tables.
- **Format, verified July 10, 2026 by primary print** (Fabio-side fetch, 22:41 UTC; this build container's 403 is in the register below): daily three-factor CSV inside a ZIP — prose banner, header `,Mkt-RF,SMB,HML,RF`, `YYYYMMDD` data rows, prose tail. First data row, verbatim: `19260701,    0.09,   -0.25,   -0.27,    0.01`. The file carries its own dated provenance — build note *"This file was created by using the 202605 CRSP database."* — SHA-256 `f051e37d30c129359c6801d9d2a715c929b19aa3be0ffe684b93995ede9ffebb`. Companion monthly file (verification evidence only; the rail ingests the daily file): first row `192607,   2.89,  -2.55,  -2.39,   0.22`, build note *"This file was created using the 202605 CRSP database."*, SHA-256 `a26fcdeb09199d29bf79d40bb34ce0ffe41798d08feff1190a2c532b4742e88e`. Parser and ZIP reader proven against synthetic bytes in this format (scratch smoke test, July 10); the real-bytes proof is the adoption run's own gate — same honesty class as the A1 address register.
- **Revision behavior — the honest statement:** exchange-level closes are final when printed, but the library's *computed* factor files are rebuilt monthly against the then-current CRSP database and may restate history marginally. No public vintage archive exists. The build note is the file's own vintage stamp — carried as evidence on every fetch.
- **Replay policy (the S4 ruling, mechanically):** ONE ingest, ever — `french.ts` loads the full daily history with `realtime_start = obs_date` (`never_revised` mechanics), then every later boot sees stored rows and skips. Because the series is never refetched, our stored copy is immutable by construction — the library's rebuilds can never reach it, so within the race "as-published" means "as frozen at adoption," and the restatement caveat rides the race's honesty notes rather than our data. Index construction per `CONTENDER_B` §4.2: base 100 immediately before the verified start; each stored value is the post-return index, rounded to 6 decimals for byte-identical re-runs.
- **Reconciliation protocol (S4 ruling: a mismatch is a finding, never a silent overwrite):** the adoption ingest REFUSES to write anything unless the fetched file's first data row reconciles against the S4 primary print above — values are the law; spacing and hash drift from monthly rebuilds are logged as evidence, never gated on. On refusal the run row fails and the alert email carries the finding for a ruling.
- **Adoption fetch evidence (production run, July 10, 2026 — EXECUTED; Fabio-verified against production and an independent fetch):** run window 23:44:24–27Z (`regime_ingest_runs`, kind `manual`, the RAIL ADOPTION marker; one minute after PR #42 merged at 23:43:33Z — migration → merge → boot, in order). Gate opened on first-row values; **26,253 rows written, 1926-07-01 → 2026-05-29**, build note *"This file was created by using the 202605 CRSP database."* SHA-256 of the extracted CSV: `f051e37d30c129359c6801d9d2a715c929b19aa3be0ffe684b93995ede9ffebb` — byte-identical to the S4 print. SHA-256 of the zip as fetched: `af8aec07…` (full digest in the adoption email of 23:44:27Z; confirmed byte-identical across two independent fetches — zips are stable per rebuild, correcting the earlier per-fetch assumption on the record). The email's own first-row rendering is whitespace-collapsed by its HTML; the raw row is the §4.4 print quoted in the format bullet above, and the gate reconciled it at ingest. Clyde's independent production read (same day, read-only): 26,253 rows, first observation 1926-07-01 valued 100.1 (base 100 × the S4 first-row return, exactly), terminal observation 2026-05-29 valued 1782547.139733, zero rows where `realtime_start ≠ obs_date`, zero closed vintages — single-vintage `never_revised` law holding whole.
- **Hash identity, clarified (S4 follow-through):** the S4 SHA-256s are of the **extracted CSVs** — the CSV digest is the file's identity, reproduced byte-identically across three independent fetches (the S4 print 22:41Z, the Fabio re-fetch, the adoption run 23:44Z). Zip digests are logged as supporting evidence and proved stable per rebuild.
- **License: READ AT ADOPTION (July 10, 2026, Fabio-side primary read; charter §4.2·7 satisfied).** Both files end with the line *"Copyright 2026 Eugene F. Fama and Kenneth R. French"* — the library's only in-file statement of terms. The site posts no terms document, requires no fee and no registration, and its only restriction comment covers site images/code, not the data files. Not a paid series — no STOP (§4.2·9). FundLens carries attribution wherever the rail is cited: the race's return series are the Fama/French research factors from the Kenneth R. French Data Library, © 2026 Eugene F. Fama and Kenneth R. French.
- **Bond-side series (A2 Task 5: "name and verify the same way"):** the adopted rail carries U.S. equity total return and the 1-month T-bill risk-free — no bond total-return series exists in it. None is required: every ratified contender's race instrumentation is two-asset equity + risk-free (`CONTENDER_A` §3.8, `CONTENDER_B` §3.8, C by composition, D §1 — all frozen). Free candidates surveyed and found inadequate: the D2 library has none; FRED hosts bond *yields*, not total-return indexes; synthesizing bond returns from yields is new machinery no ratified spec names. If a future ratified spec requires bond returns, that is its own named trigger, and the known-adequate sources (CRSP/SBBI-class) cost money — a STOP, not a purchase.
- **Rail limits (completing the RACE_RULES §7 honesty-note cross-reference):** the rail prices honestly — U.S. equity total return from 1926-07-01 and cash (1-month T-bill) from 1926-07, both pending the production ingest's own print. It cannot price bonds, international equity, commodities, or any menu fund. Metric-3 arithmetic is therefore two-asset, and RACE_RESULTS says so wherever tilt outcomes are quoted.
- **Earliest honestly-replayable date:** 1926-07-01 under the frozen-at-adoption policy — confirmed in production by the adoption run (first stored observation 1926-07-01, evidence above).

---

## Address-verification register (honesty note, July 6, 2026)

The build sandbox's network policy blocks direct connections to the OFR, Cleveland Fed, FRED, and Cboe hosts, so the four adapters' fetch addresses could not be exercised from the build environment. What WAS verified: both non-FRED **file formats, against real operator-downloaded files** (parsers proven on the actual bytes), and FRED's parameter semantics against its published documentation. The addresses themselves are proven by the first Railway sweep — A1 acceptance item 3 — and a wrong address fails loudly through the Task 7 ingest-failure alert, never silently. This is recorded so no future session mistakes "format-verified" for "address-verified."

**A2 Task 5 addendum (July 10, 2026):** the same block covers `mba.tuck.dartmouth.edu` (the D2 library host) — CONNECT 403 from the build container, logged ~22:15 UTC, both for direct fetch and the harness-side page fetch. The §7 primary prints therefore moved to the Fabio channel at the S4 ruling (22:41 UTC), the §7 parser was proven on synthetic bytes in the printed format, and the address itself is proven by the production adoption run — whose reconciliation gate refuses on any first-row mismatch, so a wrong or changed source fails loudly, never silently. The license read is likewise channel-blocked and stands PENDING in §7.
