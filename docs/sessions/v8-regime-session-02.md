# FundLens v8 — Regime Harness: Session Record 02

**Session:** A1 build — the regime harness, end to end (charter §6 item 1)
**Dates:** July 6–9, 2026 — A1 was ratified July 6 and Tasks 0–8 landed that same evening (PRs #28–#29); the build-and-operations days ran July 7–9 (PRs #30–#35, backfill, first live sweep, first delivered Brief)
**Participants:** Robert Coursey (product owner) · Fabio (chat Claude — planner/verifier) · Clyde (Claude Code — builder)
**Status:** RECORD OF COMPLETED WORK — A1 ruled **COMPLETE** by Robert at session close. Nothing in this document authorizes new build work.
**Verification:** every fact below was checked at record-writing (July 10, 2026) against the merged pull requests #28–#35 on `main` (head `bff94c5`), the repo tree, and read-only production queries under the database law — no DDL, reads only.

Relationship to the deliverable: A1 built the plumbing the race runs on. `REGIME_SPEC.md` still does not exist; no engine classifies anything yet. `regime_classifications` sits empty by design, waiting for a race winner.

---

## 1. Where this sits in the v8 arc

Session Record 01 (July 6) surveyed frameworks and re-surveyed data sources; Robert ratified its decisions and the A1 instrument the same day. This record closes A1: the harness is built, backfilled, running on schedule, and alarmed. Next in the charter's build order (§6 item 2): **the race** — Contenders A–D replayed over 30+ years of as-published data, results in-repo, Robert rules.

---

## 2. What was built — the PR ledger

All A1 code reached `main` through eight pull requests. One file per commit throughout; the four schema migrations were applied by Robert in the Supabase dashboard per the database law (ratified July 6, in `CLAUDE.md`) before their PRs merged.

| PR | Merged | Contents |
|---|---|---|
| #28 | July 6 | Tasks 0–5: `A1_REGIME_HARNESS.md` at root; **four migrations** (`v8_a1_regime_series` + 20-row seed, `v8_a1_regime_ingest_runs`, `v8_a1_regime_observations`, `v8_a1_regime_classifications` with the D2 immutability trigger); regime types; **four source adapters** — `alfred.ts` (current/vintage/as-of/vintagedates modes), `ofr.ts` (FSI daily CSV snapshot), `cleveland.ts` (quarterly nowcast vintages), `cboe.ts` (VIX full-history backstop); per-source vintage and replay policies |
| #29 | July 6 | Tasks 6–8: ingestion engine (daily sweep, expectations check, vintage-honest writes, four alert conditions); cron registration — **sweep 17:30 ET, expectations check 09:00 ET** (`cron.ts`); `runIsStale`/heartbeat widened to one shared rule across tables; asOf replay interface (the race's only door to history, with policy refusals and a CPI self-test); Cleveland parser locked to the Fabio-verified quarter-block schema; the database-law rider into `CLAUDE.md` |
| #30 | July 7 | Tasks 8–10: boot tasks (self-test + S4 estimate pass) wired into `startCronJobs`; **backfill runner** (S4-gated behind the approval constant); stale `env.example` Tiingo comment fixed |
| #31 | July 7 | S4 discharged on Robert's go: `REGIME_BACKFILL_APPROVED=true`; FRED pacing 250ms → 600ms (Fabio's rider — sustained ~100 calls/min, honestly under the ~120/min ceiling) |
| #32 | July 7 | Backfill grid walk discovers true ALFRED coverage — clamps to first vintage; snapshot fallback documented for series absent from ALFRED |
| #33 | July 7 | Fabio's July 7 requirements: vintage inserts conflict-tolerant (ignore-duplicates on the unique key); populated snapshot series skip outright on backfill resume |
| #34 | July 7 | Task 5 errata corrected under Fabio's completion verification: CFNAI in ALFRED from 2011-05-23; the misleading FRED 400 explained; GDPNow archive from 2016-05-17 |
| #35 | July 8 | **Brief sender domain fix** — Brief delivery switched to the verified subdomain `brief@updates.fundlens.app` (every prior delivery attempt since April had failed on the unverified apex domain) |

---

## 3. The harness in operation (production, verified by read-only query July 10)

- **Backfill (July 7):** after the S4 go and the #32/#33 fixes, the backfill completed and loaded **79,843 vintage rows across 17 series** (verified: 92,265 total rows in `regime_observations` minus the 12,422 written by the three live sweeps to date; 17 distinct series carry data of the 20 registered — the remaining three are registered but not yet backfill-eligible).
- **First live sweep, July 7, 17:30 ET:** completed, 17 series attempted, **539 rows written**.
- **Subsequent sweeps:** July 8 wrote 5,926 rows; July 9 wrote 5,957 rows — the memory grows daily, every value carrying both the date it describes and the date it was published.
- **Expectations checks:** ran 09:00 ET on July 7, 8, 9 — all clean (no breaches) — and July 10 recorded the deliberate breach described in §5.
- **Watchdog:** every ingest run heartbeats on the A0 pattern; the four Task 7 alert conditions route through the existing admin email path.

---

## 4. First FundLens Brief delivered — July 9

With PR #35's verified sender subdomain live, the July 9 cron Brief **sent successfully at 06:00 UTC (02:00 ET) — the first Brief ever delivered** to Robert's inbox. Production shows exactly one delivery with status `sent`; every earlier attempt back to April 2026 failed with "domain is not verified." A v7-era wound, closed during the A1 session as a micro-slice.

---

## 5. Cadence alarm test — armed at close, fired on schedule

At session close the team armed a live test of the watchdog: **CFNAI was deliberately set to `daily` cadence in `regime_series`** (CFNAI is a monthly series, so a daily expectation must breach), with the breach expected **Friday, July 10, 09:00 ET**.

Verified at record-writing: the July 10, 09:00 ET expectations check completed and recorded **exactly one missed publication** — the alarm fired precisely when and as designed. The registry read after the test (July 10) shows CFNAI back at `monthly`, its correct cadence. The watchdog is not decorative; it has now caught a (planted) quiet feed in production.

---

## 6. Standing constraints (reaffirmed)

- This document authorizes **no build work**; it is the closing record only, committed by Clyde, one file per commit.
- The regime path stays deterministic and **Claude-free forever** (charter §2.3): nothing in A1 classifies a regime, and the Claude API sits nowhere in the ingestion or replay path.
- Database law stands: no AI-run DDL against production, ever; Robert applies migrations in the Supabase dashboard; read-only verification queries remain permitted (and were the only queries used for this record).
- Vintage law stands: revisions become new rows, nothing is overwritten, and the asOf interface is the race's only door to history.

---

*— End of Session Record 02. A1 is COMPLETE. Next action: the race (charter §6 item 2) — Contender specs, 30+ years of as-published replay, results in-repo, Robert rules.*
