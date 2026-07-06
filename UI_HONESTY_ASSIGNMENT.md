# Assignment — UI Honesty: Trigger Unification, Universal Cancel, and Truthful Surfaces

**Charter:** FundLens v8 (housekeeping interlude between A0 and A1, banked by Robert's ruling July 5, 2026)
**Term of record:** *hincky* — Robert's word for UI that tells a story the system state doesn't.
**Operator:** Robert. **Planner/verifier:** Fabio. **Builder:** Clyde. All A0-era house law applies: Evidence Gate → plan → STOP → one file per commit → PR review before merge.

## Mission

Six defects, one theme: the interface sometimes lies about what the system is doing or what the numbers mean, even though the underlying state is always correct. Every item below makes a surface tell the truth. **Nothing in this assignment touches scoring math, the pipeline, or any server behavior except where Task 1's evidence requires it (the abort path).**

## The six items (all discovered/ruled July 5, 2026 — specimens in SESSION_RECORD_2026-07-05.md)

### 1. Duplicate trigger buttons
The Pipeline tab shows two identical "Refresh Analysis" buttons (the sticky header's and the page's own). Decide and implement one graceful resolution — e.g., the header button hides or defers on the Pipeline tab, or the two share one visual state. Consolidation of *presentation*, not new behavior.

### 2. Header-trigger collision flash
Clicking the header trigger while a run is active optimistically opens the overlay, gets the server's 409 ("run already in progress"), and resets — a flash. Handle the collision gracefully: detect the active run and say so instead of flashing.

### 3. Universal cancel — EVIDENCE GATE REQUIRED
Today the overlay and its Stop control exist only for header-started runs in the same browser session; runs started from the Pipeline tab or the nightly cannot be cancelled from any screen. **Task 1 must answer, from code and (if needed) a live test: what does `/api/pipeline/abort` actually do mid-run — true halt vs. mark-failed-while-work-continues, and does aborting mid-write leave clean state?** The Cancel feature's design depends entirely on that answer. STOP after the evidence, before design.

### 4. Run-completion display asymmetry (three specimens on July 5)
Completed runs shown as stuck or silent depending on which surface started them (header overlay vs. Pipeline tab vs. neither). Runs now carry a heartbeat and a status row — any surface can know the truth. Make run state readable from the Pipeline tab regardless of who started the run.

### 5. YourBrief stale-banner race
`risk` initializes to the 4.0 placeholder before the profile loads; the loading gate (`YourBrief.tsx` ~744) requires BOTH briefs and scores (`&&`); `isStale` (~725) momentarily evaluates true against the placeholder and the banner flashes. Fix: gate staleness on the profile having actually loaded.

### 6. Examined >100% — presentation per Wall Street convention (Robert ruled July 5–6)
**The number is correct and must not be capped** (Path 1 rejected on the record): weights are measured against *net* assets per SEC convention (the N-PORT filings the pipeline reads use the same denominator), and a leveraged fund's gross positions genuinely exceed its net value — MWTSX at 113% holds 113 cents of positions per net dollar, offset by ~13% of obligations. The industry's presentation norms, researched July 6:
- SEC Schedules of Investments print the >100% positions and add a reconciliation line ("Liabilities in excess of other assets: (13.0)%") so the table visibly nets to 100%.
- Morningstar presents Long / Short / Net columns — the retail gold standard for exactly this confusion.
- Institutional reporting names the pair: gross exposure vs. net exposure.
- No firm anywhere caps the display.

**The implementation (refined Path 2, borrowing Morningstar's reconciliation):** where Examined exceeds 100%, show the inline reconciliation using data the table already displays in fine print — e.g., *"Gross positions 113% − offsetting legs 13% = net 100%"* — plus a column tooltip in house tone: "Values over 100% mean the fund uses leverage or derivatives; its total positions exceed its net value. All positions were examined." **Path 3** (redefine Examined as coverage-of-gross + a separate labeled "Gross exposure" fact) remains banked as considered-and-deferred: it touches the frozen Dossier contract and needs its own ratification; the pre-launch window makes it cheapest now if ever chosen — surface this once at the session's start for Robert's final fresh-eyes call before implementing the refined Path 2.

## Suggested shape (Clyde amends per evidence)

- **Task 1 (evidence, no code):** the abort-path investigation (item 3) + read the current trigger/overlay/status wiring across AppShell, Pipeline, and the run endpoints. STOP.
- **Task 2 (plan):** per-item design + commit sequence, one file per commit. Items 5 and 6 are likely one commit each; items 1/2/4 may share files — sequence accordingly. STOP.
- **Task 3 (implement):** PR, Fabio review, merge.
- **Task 4 (verify):** Robert's eyeball per item + one triggered run observed from the Pipeline tab start-to-finish showing truthful state throughout; abort tested per Task 1's findings.

## Acceptance

1. One person, on the Pipeline tab, can start a run, watch its true state, and cancel it — regardless of which surface started it (scope of "cancel" per Task 1 evidence).
2. No surface flashes a state that isn't true (collision, stale banner, stuck display).
3. Examined >100% reads as informed disclosure, not alarm — reconciliation + tooltip live.
4. Zero scoring changes; 23/23 gate outcomes unchanged against anchor `594afa57`.

## Carried context

- July 12 expiry check rides whichever session runs after that date (Flipkart ×2, Brandtech — fresh `cusip_cache` dates).
- After this assignment closes: **A1 — the regime engine** opens the charter's instrument-building.
