# Session Record — July 6, 2026: The UI Honesty Interlude — Six Hincky Surfaces Made Truthful

**Operator:** Robert Coursey. **Planner/verifier:** Fabio (chat Claude). **Builder:** Clyde (Claude Code).
Assignment of record: `UI_HONESTY_ASSIGNMENT.md` (ratified July 5, committed `6a9eb9e`-era, Task 0). House law held throughout: evidence → plan → STOP → one file per commit → Robert's click on every merge.

---

## 1. Task 1 — the abort-path evidence (the deepest hincky was the Stop button itself)

- **`POST /api/pipeline/abort` was mark-failed-while-work-continues.** It deleted in-memory step data and wrote `status='failed'` on the row; **no signal of any kind reached the running pipeline** — zero abort/cancel checks existed in `pipeline.ts`. A "stopped" run kept working at full speed for up to an hour. Code evidence was decisive; no live test needed.
- **Three hazards documented:** (1) persist wrote `status='completed'` unconditionally — an aborted-then-finished zombie resurrected its row from failed to completed (`persist.ts:418`, also a standing bug for stale-marked slow runs, no abort involved); (2) the heartbeat stamped by run id regardless of status — a "failed" row kept receiving fresh heartbeats; (3) abort freed the already-running guard while the zombie still worked — two concurrent pipelines, interleaved delete-then-insert on `holdings_cache`, doubled Claude traffic. Fabio's ruling, adopted: **hazards 1 and 3 are unconditional fixes under any cancel philosophy.**
- Mid-write cleanliness: abort itself could never tear a write (it stopped nothing); the torn-state risk was process death or the hazard-3 collision.
- Wiring map: overlay and Stop existed only for header-started same-session runs; the Pipeline tab polled but had no runId, no cancel; step data lived in server memory and existed only for web-triggered runs (nightly/retry pass no progress callback); the header opened the overlay optimistically before the POST returned (the item-2 flash); the 409 body already carried the active runId, unused.

## 2. The design, the second opinion, and the evidence that priced it

- **Cooperative cancel, ratified:** Cancel is a *request* — the endpoint stamps `cancel_requested_at` (new column) and never writes terminal status; the running pipeline checks the stamp at checkpoints (between steps, between funds, between per-ticker API calls — never inside a Claude call or a DB write) and terminates itself, recording "Cancelled by user." The row stays `running` until the process truly exits, so hazard 3 closes **by design, not by patch**. Only the running process writes terminal status.
- **Fabio's three conditions, all discharged:** (1) cancel propagates as a distinct `PipelineCancelledError`; all three runner sites catch it first — no failure-alert email, no message clobber; (2) latency copy priced from production logs, not vibes — July 5 cold-cache full examination: worst checkpoint gap is one classification pass, **7.2 minutes**; the 20.2-minute EDGAR stretch is a per-fund loop in `pipeline.ts` and got per-fund checkpoints (~1 min apart); warm runs cancel within ~2 minutes. Shipped copy: *"usually under two minutes; up to ten during a first-time full scan"*; (3) no auto-retry exists (`MAX_RETRIES`/`RETRY_DELAY_MS` are dead constants — register); the Retry button offering to re-run a cancelled run is coherent and stays.
- **Live-database verification (July 6):** `pipeline_runs.status` carries a CHECK constraint permitting only running/completed/failed (DDL absent from the repo — base tables predate the checked-in migrations). Hence: cancelled runs are `failed` + "Cancelled by user" underneath, displayed neutrally as **"cancelled"** on every surface — never a red error, and **degraded, not unhealthy**, in the health check (Fabio's rider, his words: "your reasoning was the winning argument").

## 3. Implementation — PR #23, thirteen commits, one file each (merge `2e66d63`)

- **Item 3 (universal cancel):** migration + `PipelineRunRow` type + checkpoints in `runFullPipeline` + shared `makeCancelChecker` (throttled, fail-safe: a flaky read never kills a run) + all three runner sites wired (web, **nightly**, retry) + admin-only cancel endpoint + overlay "Stopping…" state + Pipeline-tab Cancel.
- **Hazard 1:** persist marks completed **only if the row still says running**; declines are logged.
- **Item 1:** header Refresh Analysis stands down on the Pipeline tab — one button, the page's own.
- **Item 2:** collision adopts the active run — the header shows the real run's progress instead of flashing; Stop cancels it.
- **Item 4:** Pipeline tab status card for any active run, whoever started it: start time, heartbeat ("last sign of life"), step detail when available, an honest note when not (nightly/retry report no steps), Cancel button.
- **Item 5:** YourBrief staleness gated on the profile having actually loaded — no judgment against the 4.0 placeholder.
- **Item 6 (refined Path 2, per Robert's July 5 ruling — the assignment's opening question was pre-answered and not re-litigated):** Examined >100% leads its fine print with the SEC-style reconciliation ("Gross positions 113.0% − offsetting legs 13.0% = net 100.0%") from fields the row already shows, plus the house-tone tooltip. The number is never capped. **Path 3 stays banked** (considered-and-deferred; cheapest pre-launch if ever chosen).
- **Behavior change (Robert's ruling):** the browser-close abort beacon is **removed** — its stale-row justification died when the heartbeat shipped; runs are server jobs and survive a closed tab. Consequence: the cancel endpoint gained admin auth, closing the API's one deliberately unauthenticated door.
- **Migration paper trail:** Supabase's dashboard was unreachable for Robert (East Coast outage), so `ui_honesty_cancel_requested` was applied via the Supabase MCP connection **with Robert's explicit chat authorization**, July 6; column verified in production immediately after (timestamptz, nullable, no default). Migration-before-merge law satisfied.

## 4. Task 4 — verification (all on production, all in the data)

**Today's run chain:** `76fadd35` (02:00 UTC nightly, pre-merge control, 23/23) → `a62c0d75` (15:57 UTC, **first run on UI-honesty code**, 23/23, 10,213 holdings, ~5.3 min, observed truthfully from the Pipeline tab start to finish) → `5eb71a5b` (**the cancel test**).

- **The cancel test, timeline from the database:** run started 16:12:59; cancel requested 16:13:11 (12 seconds in); run self-terminated 16:13:16 — **five seconds after the request**, at a checkpoint. Recorded `failed` / "Cancelled by user", `cancel_requested_at` stamped, **0 funds processed, nothing written**. Every piece of the design visible in one row.
- **Acceptance #4 (scoring integrity):** gate outcomes unchanged — 23/23 pass, same as anchor `594afa57`; no scoring math, constants, or Claude call patterns were touched (the pipeline change is early-exit control flow only; checkpoints sit between units of work).
- **Fabio's three post-run notes, each resolved with data:**
  1. *WEGRX and CEMEX each show 1 fallback* — both are the **momentum factor at neutral 50**. CEMEX is the designed too-new path (Option C, 240-day rule, self-heals ~Feb 2027). WEGRX is the chronic no-price-series gap **already on the July 5 register** ("noted so no one rediscovers it as new") — the register worked.
  2. *QFVRX the only "scaled: yes"* — intentional and stable: identical on every recent run (quality coverage 15.19%), a carried-over condition, not new behavior.
  3. *Bond-heavy funds' high "none" industry tags* — confirmed correct: across MWTSX/OIBIX/BGHIX/CFSTX/TGEPX, the weight of **equity-type** holdings missing an industry tag is **0.0%**; every untagged holding is fixed income or cash, which carry no equity industry by definition. (MWTSX's holdings sum to 113.0% in the raw data — the item-6 fund, now reconciled on screen instead of alarming.)

## 5. What a cancelled run leaves behind (Fabio's rider, for the permanent record)

A cancelled run leaves behind any expense ratios already persisted to the funds table and any cache entries already warmed (sector/industry/FMP/fee) — each individually correct and self-healing on the next run (`pipeline.ts` fee/backfill paths); no scores, thesis, holdings, or dossiers are written for the cancelled run itself when the cancel lands before persist.

## 6. Rulings made today (all Robert's, all on the record)

1. Runs survive browser close; the beacon dies; cancel becomes admin-only.
2. Cancel means "stops at the next checkpoint, within minutes" — with copy matched to the measured worst case, per Fabio's condition.
3. Both Fabio riders adopted: the health-check filter ships; this section 5 sentence enters the record.
4. The production migration applied by Clyde via MCP under Robert's chat authorization (process exception, explicitly granted, logged on PR #23).

## 7. The register, as it stands (nothing lost)

- **NEXT — A1, the regime engine:** the charter's instrument-building opens.
- **July 12 expiry check** rides whichever session runs after that date: Flipkart ×2 and Brandtech negatives should carry fresh `cusip_cache` dates (A6's 7-day TTL visibly working). One line of evidence.
- **WEGRX has never had a real momentum score** (chronic, no price series from any source; disclosed on every surface) — promoted from "noted" to a candidate line-item for a future coverage pass.
- Dead constants `MAX_RETRIES`/`RETRY_DELAY_MS` in `monitor.ts` (never referenced); unused `current_step`/`step_message`/`total_steps` columns on `pipeline_runs` (step tracking moved to server memory) — trivia for a housekeeping sweep, useful if step data ever needs to survive restarts or serve the nightly.
- Overlay still simulates step progress when real data is absent; nightly/retry runs report no step detail (the status card says so honestly). Adjacent-honesty items, deliberately not smuggled into this assignment.
- **Path 3 for Examined** (coverage-of-gross + labeled "Gross exposure" fact) stays banked; touches the frozen Dossier contract; cheapest pre-launch.
- MM-funds-join-the-regime, notification doctrine, 240-day CEMEX milestone (~Feb 2027), charter §7 placements — all stand as recorded July 5.

## 8. Build-order position

**A0 ✅ · UI-honesty interlude ✅ done · A1 regime engine — OPENS NEXT** · A2 Pulse · A3 classification · A4 mix · A5 vehicle solver · A6 two-decision UI · A7 hypothetical portfolio · A8 per-holding card.

*Six lies retired in one day; the proof is a run that died five seconds after being asked to — and told the truth about it.*
