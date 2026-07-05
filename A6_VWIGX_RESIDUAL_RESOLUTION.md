# Assignment A6 — VWIGX Residual Resolution

**Charter:** FundLens v7 (final assignment of the trust era; closes v7's last open promise)
**Repo:** `racoursey-cloud/fundlens-v6` · Railway auto-deploy on merge to main
**Date ratified:** 2026-07-05
**Operator:** Robert (browser-only, no local terminal; reviews and merges PRs via GitHub web UI)

---

## Mission

VWIGX is the one fund of 22 that did not clear the 90/95 trust gate after the first full-examination run (2026-07-05, ~64 min, 10,135 holdings). Its holdings picture carries an unexplained residual, which means its look-through exposure is wrong by an unknown amount. The v8 charter's two-decision architecture depends on look-through matching, so this residual is a structural dependency, not housekeeping.

**A6 succeeds when VWIGX passes the 90/95 gate with true numbers, or when the residual is fully characterized and its irreducible remainder is disclosed honestly in the confidence ladder.** An honest, well-documented "this slice cannot be resolved and here is why" also satisfies this assignment — what does not satisfy it is silence.

## Administrative record (read before anything else)

- **Task 6 and Task 7 reports from A5 are deliberately retired by Robert's decision on 2026-07-05.** They were not abandoned; they were cut out loud. Do not go looking for the A6 dossier that Task 6 would have produced — it does not exist. The evidence-gathering it would have done is now Task 1 of this assignment.
- The benchmark numbers those reports would have memorialized (87.8% sector / 56.0% industry agreement, 400 out-of-sample equities vs FMP reference labels) are recorded here so they survive the retirement.
- A6 runs under the v7 charter. The ratified v8 charter (`FUNDLENS_V8_FOUNDING.md`) governs everything after this assignment closes.

## Known baseline (evidence, not to be re-litigated)

| Fact | Value | Source |
|---|---|---|
| Pre-full-examination VWIGX | FAIL — 86.2% of resolvable (gate 90); Examined 95.1% (gate 95) | Run 2e777edc, 2026-07-05 11:00 AM ET |
| Post-full-examination | 21/22 pass; VWIGX sole holdout; VFWAX cleared | Full-examination run, ~1:34 PM ET 2026-07-05 |
| Leading fix candidate | Deferred Bloomberg-ticker-hint lookup (riding in the register since A5) | A5 deferred register |
| Companion deferred item | Share-class FIGI hop (home listing → US twin, e.g. 9988 HK → BABA) — enrichment, not identity | A5 deferred register |

The exact post-examination residual (count, weight, identifier types on failing rows) is **not known** and must be pulled from the census log — that is Task 1, not an assumption.

---

## Task 1 — Evidence Gate: characterize the residual (report in PR description, no code)

**STOP: no code may be written until Task 1 findings are posted and Robert confirms.**

From the latest full-examination run's census log and `holdings_cache`:

1. VWIGX unresolved holdings: count, aggregate `pct_of_nav` weight, and per-row identifier inventory (which identifier types are present on each failing row — SEDOL, ISIN, local ticker, none).
2. Distinguish the two failure surfaces: rows that are *unresolvable* (no path to identity) vs rows that resolved but were *unexamined* (identity known, fundamentals missing).
3. State the arithmetic: what weight must move from unresolved → resolved for VWIGX to clear 90% of resolvable, and whether Examined stays ≥95 after any changes.
4. Check for `NA:`-prefixed synthetic placeholder keys among the failing rows and report the count.
5. Assess fit: does the Bloomberg-ticker-hint lookup plausibly address the identifier types actually found? If the evidence points elsewhere, say so — the candidate fix rides with this assignment; it is not pre-approved.

## Task 2 — Proposed fix (plan only, then STOP)

Based strictly on Task 1 findings, state the fix: which file(s), which resolution path, what the identifier-hint logic does, expected weight recovered. One file per commit — plan the commit sequence explicitly. Wait for Robert's confirmation before writing.

## Task 3 — Implement

House rules apply in full:

- One file per commit. No ride-alongs, including comment-only touches.
- All Claude API calls in engine files remain **sequential with 1.2s delays** — `Promise.all()` for Claude calls has crashed production 5+ times. This is permanent.
- All Claude calls → `/api/claude` proxy. All Supabase calls → `supaFetch()`. The `TINNGO_KEY` typo is intentional — never correct it.
- **STOP before any scoring-adjacent code.** Resolution and identity work is in scope; if the fix would touch anything that alters a score, halt and report first.
- No new external paid dependencies without a STOP — if the fix requires an API not already in the stack (FMP Starter, Tiingo, OpenFIGI, CFBD is a different project), stop and quote the cost.

## Task 4 — Verify

1. Re-run the pipeline for VWIGX (targeted run if supported; full run if not — note nightly steady-state budget is ~12 min, full examination ~64 min).
2. Report VWIGX's new gate numbers against the baseline table above, anchored by `pipeline_runs` UUIDs (before/after).
3. Confirm no other fund's gate outcome regressed — 21 passes must still be 21 or better.
4. Confirm the confidence ladder still reconciles to 100% for VWIGX and that any irreducible residual is represented honestly on the fund card and detail view per A5's tone rules ("estimated" vocabulary where applicable).

## Acceptance criteria

1. Task 1 residual characterization posted and confirmed before any code.
2. VWIGX passes 90/95 with true numbers, **or** the irreducible residual is characterized, disclosed in the ladder, and Robert ratifies the disclosure as the closing state.
3. No regression on the other 21 funds, verified against pipeline_runs UUID anchors.
4. One file per commit throughout; every STOP honored.
5. Task 6/7 retirement recorded (this document is that record; PR description should reference it).

## Deferred register (carried, not lost)

- Share-class FIGI hop (enrichment — buys fundamentals for resolved foreign listings)
- Two-tier Positioning upgrade + 152-disagreement Precious Metals taxonomy pattern
- Per-equity-weight industry denominator
- `classify.ts` DCR set alignment (final-sweep item)
- Dollar-volume firewall refinement (v8 Pulse layer)
- Fund #23 onboarding (awaiting ticker from Robert; scalability test: one row + one run)
- Launch conversation (audience, comms, Principle 6 framing)
- SIC code integration (long-deferred; revisit only if classification costs become a concern)

## What comes after

A6 closing = v7 charter fully discharged. Next session opens the v8 A-series under `FUNDLENS_V8_FOUNDING.md`, beginning with the charter commit to the repo if not already landed.
