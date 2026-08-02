# FOLLOWUPS — Cosmetic Findings Ledger

Governed by the Findings law (CLAUDE.md, ratified July 10, 2026). One line per item.
Cosmetic items only — dead code, stale comments, naming, structural aesthetics. Blocking
findings never land here; they are fixed in the slice that finds them. Items are cleared
in dedicated housekeeping sessions at boundaries Robert picks, never inside build sessions.

| Logged | Item | Cleared |
|---|---|---|
| 2026-07-10 | `docs/archive/v8/` creation deferred until a second spent v8 instrument exists (July 10 ruling) | — |
| 2026-07-10 | Research sector drill truncates at 20 contributors, so slice reconciliation can be off by pennies in extreme fragmentation (noted at PR #36 review) | — |
| 2026-07-10 | Builder branch names are reused across assignments — consider fresh names per assignment (cosmetic hygiene, July 10) | — |
| 2026-07-10 | Ingest dedupe open-tracking map keeps only the last open vintage per obs-date — harmless post-guard, inelegant (A2 F4 dedupe report) | — |
| 2026-07-10 | ~23,000 redundant value-identical OFR/Cleveland vintages from the capped-read era chain validly — honest, harmless; dedupe only via certified statement if storage ever matters (F6 residue, Fabio ruling) | — |
| 2026-07-10 | ingest.ts fetchSeries has no explicit 'french' case — a wrongly-enabled RACE_EQ_TR fails loud but generic ("unknown source"); a cboe-style named refusal would read better (A2 Task 5) | — |
| 2026-07-27 | App.tsx c9 header comment states reference profiles are born setup_completed=false — stale once b3_birth_state.sql runs; comment-only fix (ruled cosmetic, B3 amendment wave) | — |
| 2026-07-27 | TierRouter + ProtectedRoute each fetch the profile at full-tier boot — dedupe candidate (context or prop-pass) (B3 amendment wave) | — |
| 2026-08-01 | B9 head-report table listed pre-replay shas for c5–c10 — pushed chain coherent, report-accuracy only (B9 review) | — |
| 2026-08-01 | Reference sector drill panel lists per-row holdings whose sum can differ from the slice's filed map value — two honest provenances, no fix mandated (B9 review) | — |
| 2026-08-01 | DonutChart hover shows share-of-chart on normalized >100% sector rings while the legend prints filed values — optional filed-value hover, future wave (B9 review) | — |
| 2026-08-01 | ADAXX About attribution shows filing date and EDGAR link but not the SEC-filed series name (no schema column) — add only if Robert wants it shown (B9 review) | — |
| 2026-08-01 | Apex fundlens.app misroutes; production serves at www.fundlens.app — probes and docs must target www; rides the pending alias-hostname decision (S-B9 §8.1) | — |
| 2026-08-01 | B9 F5-E: ® symbols dropped from filed fund names in the seeded fund_descriptions text — restore only if Robert wants the marks shown (B9 F5 amendment; entry logged late per B10 D2) | — |
| 2026-08-01 | OIBIX −5.41% twelve-month figure queued as an acceptance-battery spot-check target — B9 queue item never landed here; entry logged late per B10 D2 | — |
| 2026-08-01 | Dossier column industry_haiku_pct (and siblings, incl. the client mirror fields) names a model no longer in the classifier seat post-CB-S — cosmetic rename at a housekeeping boundary (CB-S s4) | — |
| 2026-08-01 | Sector parser coerces unrecognized model replies to "Other" with no raw-reply record (CB finding, Sonnet runs) — raw-reply logging or synonym tolerance, future wave (CB-S s4) | — |
| 2026-08-01 | B7 summaries machinery (REFERENCE_SUMMARIES_ENABLED, reference-shape emission path, generate route, Pipeline button, drafting half of fund-summaries.ts, reference_summaries table) is dead inventory ruled for dismantling — dedicated housekeeping wave; table drop by Database-law ceremony (B9-T t2) | — |
| 2026-08-02 | Home-tier codes colliding with major US tickers across funds (KMB, BHE, 3M class) — qualified display (e.g. "KMB · NSE") awaits a ruling; not cured in H1 (h5 note) | — |
| 2026-08-02 | OpenFIGI placeholder lines ("Samsung Episholdings" / 0126Z0-class) and garbled vendor names surface as holding names — vendor-data hygiene, future wave (H1 h7) | — |
| 2026-08-02 | BASA.DE (BASF) venue-code oddity survives h3 by design (matching venue country) — display question for a later ruling (H1 h7) | — |
| 2026-08-02 | Pipeline run panel shows no resolution-phase progress — a healthy 20-minute quiet stretch reads as a hang and drew a user cancel; add phase progress, future wave (H1-F2) | — |
| 2026-08-02 | H2 company panel must key on validated display tickers only — synergy note for the H2 build (H1-F2) | — |
