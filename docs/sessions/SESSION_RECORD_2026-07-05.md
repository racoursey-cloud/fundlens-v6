# Session Record — July 5, 2026: v7 Closed, v8 Chartered, A0 Discharged

**Operator:** Robert Coursey. **Planner/verifier:** Fabio (chat Claude). **Builder:** Clyde (Claude Code).
Every claim below was independently verified by Fabio against the repo, the production database, or both, before being accepted.

---

## 1. v7 charter discharged (the trust era ends)

- **A6 — VWIGX residual resolution.** Task 1 (PR #14) characterized the residual: eleven identifier-bearing holdings (Spotify, Tencent, Samsung, L'Oréal, LVMH, Nu Holdings, MakeMyTrip + four more; 12.84% of the fund) frozen by a single 40-second API outage at 8:56 AM ET, cached as permanent "unresolved" verdicts — negative caching by design, no expiry, service errors indistinguishable from genuine no-matches. The cache-deletion test proved the theory: all eleven resolved on the first fresh attempt. Task 3 (PR #15) shipped the permanent fix in `cusip.ts`: transient lookup errors are never cached; genuine negatives expire after 7 days. VFWAX improved to 96.7% as a side effect (eight shared identifiers).
- **Final v7 state:** 22/22 funds through the 90/95 gate (run `eae268c2`).
- **Task 6 and Task 7 reports: deliberately retired** by Robert's ruling (record: `A6_VWIGX_RESIDUAL_RESOLUTION.md`). Benchmark numbers preserved there and in the v8 charter.
- **Recovery point published:** tag `v7.0.0` and branch `v7-stable`, both at commit `c7cae34` (the PR #15 merge). Verified.

## 2. v8 charter ratified and committed

- `FUNDLENS_V8_FOUNDING.md` ratified by Robert in the morning; amended same day pre-commit (status line; 21/22→22/22; §7 rewritten as a resolution record carrying the orphaned items). Committed byte-verified in PR #16 (`3ca33e6`).
- `WRAPPER_LOOKTHROUGH_EVIDENCE.md` (the five GGA/Alta Trust CIT fact sheets: mapping, parser spec, underlying census) committed standalone in PR #17 (`926e5d9`).
- Mission carried into force: data computes the regime, Claude narrates; Pulse promoted; the two-decision split (mix, then vehicle) with look-through matching.

## 3. A0 — Stabilization + Housekeeping: DISCHARGED (PRs #18, #19, #20)

**Item 1 — the stabilization pile (PR #18, ten commits, one file each):**
- `sendAdminAlert` returns its true send outcome; every failure log names the lost subject; benchmark "emailed" logs gated on reality (success AND failure paths).
- Health report gained an alert-email section — a disconnected alarm bell now degrades the light instead of hiding.
- Benchmark visibility: `GET /api/benchmark/status` + Pipeline tab display.
- **Heartbeat liveness:** `pipeline_runs.heartbeat_at` (migration applied pre-merge, independently verified in production), 60-second stamps from all three runner sites, one shared `runIsStale` rule (10-minute silence, 6-hour ceiling) replacing both 120-minute wall clocks. First heartbeat observed live on run `099799a8` — beats on the :15 of each minute, last stamp 24s before completion.

**Item 2 — trigger-button consolidation (PR #19, two commits):**
- Settings tab's duplicate trigger retired — which also closed an accidental exposure: the section was never admin-gated, so every user saw a button the server 403s.
- Pipeline tab relabeled to the one vocabulary: "Refresh Analysis" / "Analyzing…" (matching the header), empty-state text updated.

**Item 3 — CEMEX onboarding, Fund #23 (PR #20, three commits + two authorized data statements):**
- **Evidence gate results:** Tiingo resolves CEMEX to "Cullen Emerging" (NMFQS) — collision with the cement company (CX) ruled out; FMP does not carry the symbol at all — **CEMEX rides the Tiingo rail alone, no price fallback** (recorded asymmetry). CEMEX absent from the SEC ticker file (R6 pattern); override values verified from EDGAR NPORT-P primary docs: **CIK 1109957, series S000038162**. Tiingo history starts **2026-03-16** (~76 trading days) despite Aug 5, 2025 inception — only the 3-month momentum window fills.
- **Robert's Option C ruling:** "CEMEX is too new for us to make an evaluation." Implemented as `MIN_TRADING_DAYS_FOR_MOMENTUM = 240` — the v7 charter §3 threshold that was written but never coded, now paid. Short-history funds take the existing synthetic-neutral path (50, `isFallback`, disclosed in the dossier and on the fund surface: "Too new to evaluate…"). Cost/Quality/Positioning score fully. Protects all 23 funds against truncated histories, not just CEMEX.
- Registry row + expense ratio 0.0090 (decimal convention verified against `populate_expense_ratios.sql`).

**The finale run (`594afa57`, ~6 min, heartbeat healthy):**
- **23 of 23 funds pass the 90/95 gate.** CEMEX passed on FIRST examination: resolvable 93.54%, resolved-of-resolvable 100.00%, 78/78 holdings, empty fail_reasons, `fallback_count = 1` (the momentum neutral — Option C visibly working).
- Incumbent regression check: **zero movement** — all 22 incumbents identical to two decimals against anchor `099799a8` (Fabio verified independently by per-fund SQL comparison; empty diff).
- Run `2d379f30` (22:34 UTC) identified: a standard 22-fund manual run during the merge window; doubles as the pre-CEMEX control.
- Anchor chain for the day: `b8e87c9c` (VWIGX FAIL, 86.83%) → `eae268c2` (22/22) → `099799a8` (heartbeat first observed) → `2d379f30` (pre-CEMEX control) → `594afa57` (23/23 finale).

## 4. Rulings made today (all Robert's, all on the record)

1. Task 6/7 reports retired (not abandoned — cut out loud).
2. A0 approved as v8's opener; CEMEX placed inside A0, last, to exercise the repaired alert path.
3. Option C for short-history momentum (the 240-day rule).
4. Examined >100% — **Path 2 ratified:** explain in place (footnote/tooltip: values over 100% mean leverage/derivatives; gross exposure exceeds net value; all positions examined). Path 3 (redefine Examined as coverage-of-gross + separate "Gross exposure" fact) considered and deferred — cheapest to do pre-launch if ever. **Path 1 (capping the number) rejected on the record** — a fund's leverage is exactly what FundLens exists to show.

## 5. The register, as it stands (nothing lost)

- **NEXT — "UI honesty" assignment** (one session, before A1), five items, term of record *hincky*: (a) duplicate Refresh Analysis buttons on the Pipeline tab; (b) header-trigger flash/reset when clicked mid-run; (c) universal cancel — overlay/Stop currently exist only for header-started same-session runs; Task 1 must establish what `/api/pipeline/abort` truly does mid-run (halt vs mark-failed; mid-write cleanliness); (d) YourBrief stale-banner race (risk placeholder 4.0 vs profile load; gate staleness on profile-loaded); (e) run-completion display asymmetry — three specimens of completed runs shown as stuck/silent; (f) the Examined >100% footnote (Path 2).
- **July 12 expiry check:** first run after that date — Flipkart ×2 and Brandtech negatives should carry fresh `cusip_cache` dates (the A6 7-day TTL visibly working). One line in that session's evidence.
- **MM funds join the regime (rides A4/A5):** FDRXX/ADAXX positioning from the regime's Cash & Equivalents score instead of hardcoded 50; cash allocation from the mix; vehicle contest by 7-day N-MFP yield; surface N-MFP facts on the card. (N-MFP3 live fetch already exists.)
- **Notification doctrine (post-A6 season, fully designed in conversation, retrievable):** notify on output change, not calendar; four dials (dead band, dwell, Pulse two-key confirmation, cooldown that silences repeats but never escalations); target = whole-balance match to the new recommended mix (remind users to update contributions AND exchange the balance); calibration by 30-year point-in-time replay (ALFRED vintages) → disqualify-not-validate → shadow mode before voice mode; high-evidence alerts (fees, Pulse divergence, menu changes) ship first and earn the channel. Robert's amendment on the record: past is not written to predict the future.
- **240-day rule reached CEMEX milestone:** CEMEX crosses 240 Tiingo trading days ~Feb 2027 and self-heals to a real momentum score.
- Charter §7's larger carried items stand as placed (classification rungs → A3; wrappers after A3).
- WEGRX `fallback_count = 1` is pre-A0, present in all three compared runs — noted so no one rediscovers it as new.

## 6. Build-order position

**A0 ✅ done · [UI-honesty interlude] · A1 regime engine — next charter assignment** · A2 Pulse · A3 classification · A4 mix · A5 vehicle solver · A6 two-decision UI · A7 hypothetical portfolio · A8 per-holding card.

*One Sunday: two eras, one heartbeat, twenty-three funds, zero open items.*
