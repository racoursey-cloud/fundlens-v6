# Assignment A2 — Stabilization

**Repo:** racoursey-cloud/fundlens-v6 · branch `main` (A1 merged)
**Authority:** FUNDLENS_V7_FOUNDING.md (repo root). Read it first; cite principles by number.
**Operator:** Robert reviews and merges the PR. Nothing merges without his approval.
**Note:** This assignment replaces the original "A2 — Dossier Contract" from Founding §6; the Dossier contract becomes A3 (see Task 9). Tonight's field findings (July 1, 2026) take priority.

## Context — what the July 1 diagnostic found

The live site was verified healthy after the A1 merge. A field diagnostic then uncovered:

- **Brief generation had failed 193 consecutive times since ~April 9** — root cause was an empty API credit balance at console.anthropic.com (error: "credit balance is too low"). Robert refilled credits July 1; brief #195 generated successfully. **The generation code path is NOT broken — do not "fix" it.** The remaining problem is that 193 failures were silent (Founding Principle 1).
- **Robert's ratified decisions (July 1):** kill the daily automatic Brief generation; Dossier pass thresholds ratified at 90% NAV resolved / 95% classified.
- Coverage percentages appear inflated ×100 in pipeline logs ("9503.7% coverage") AND in pie-chart drill-down percentages in the UI — the inflation travels through data, not just log text.
- Log errors during the July 1 pipeline run: `[supaFetch] GET pipeline_runs failed: Cannot coerce the result to a single JSON object` (at run start) and repeated `[supaFetch] POST holdings_cache failed: duplicate key value violates unique constraint "idx_holdings_unique"` (persist step reported "9 errors").
- Brief #195 reported "Specific macro indicators aren't available this month" — the FRED macro packet came back empty and the brief silently worked around it.
- The Research tab's aggregate sector donut renders all-grayscale (all "Not Classified"). Likely a symptom of the credit-starvation era (classification calls failing silently → holdings never classified). May self-heal after the first fully funded pipeline run.
- `client/src/engine/allocation.ts` is a stale hand-mirror of the server allocation engine (old k-table 0.30–1.85 vs server 0.42–2.25; 5% de minimis vs server 4%; superseded Session-22 MM cash sweep vs proportional redistribution). It drives the live slider rescore on YourBrief and Research — users see different portfolios than the server computes.

## Tasks — in order, one commit each unless noted

1. **Create `CLAUDE.md` at repo root** with exactly this content:

   > **The operator, Robert, is not a developer.** He is a capable, careful reviewer who works entirely through browsers — GitHub web UI, Railway, Supabase dashboards. Never assume he can run terminal commands, and never ask him to. Explain everything in plain English; when a technical term is unavoidable, define it in the same sentence.
   >
   > **Authority:** `FUNDLENS_V7_FOUNDING.md` at the repo root governs all product and architecture decisions. Read it at the start of every session and cite its principles by number. Work only from written assignments (files named `A2_...`, `A3_...`, etc. or pasted assignment text).
   >
   > **Scope discipline:** Do exactly what the assignment says — nothing more. If you notice other problems, improvements, or refactoring opportunities, list them at the end of your report as suggestions; never act on them. No "while I'm here" changes, ever.
   >
   > **Commits:** One file per commit for code changes. Bulk file moves with unchanged content may share one commit. Every commit message cites the assignment task number.
   >
   > **Hard rules, no exceptions:** Never rename, correct, or touch environment variable names. Never modify Claude API call patterns — all Claude calls in engine code are sequential with delays, never parallel. Never change model constants, delays, or anything in `constants.ts` unless the assignment explicitly says so.
   >
   > **When uncertain, stop and ask.** A question costs a minute; a wrong assumption costs a session. Robert would always rather answer a question than review a surprise.
   >
   > **Reporting:** End every session with a plain-English summary: what was done, what was verified, what needs Robert's decision. Write it like a briefing to a smart boss who doesn't code — short, concrete, no jargon.

2. **Kill daily automatic Brief generation (Robert's July 1 decision).** Remove the `regenerateBriefsForAllUsers()` calls from the post-pipeline hooks in `src/routes/routes.ts` and `src/engine/cron.ts`. Keep the function itself in `brief-scheduler.ts` (it may return with the parked layer). Do NOT touch the 06:00 UTC `scheduledBriefDelivery` / `checkAndSendBriefs` path — the monthly email delivery cadence stays. On-demand generation via `POST /api/briefs/generate` stays. (Two files = two commits.)

3. **Make API failures loud (Principle 1).** Investigate the existing `src/engine/admin-alert.ts` module. Wire it so that a Claude API error in `brief-engine.ts`, `help-agent.ts`, or `classify.ts` sends Robert an admin email — rate-limited to at most one alert per error type per 24 hours (a nightly failure should produce one email, not 193). If `admin-alert.ts` lacks what's needed, extend it minimally. Alert content: which feature failed, the API error message verbatim, and a one-line plain-English hint (e.g., "credit balance errors are fixed at console.anthropic.com → Billing").

4. **Trace the ×100 weight/coverage inflation.** Follow a holding's weight from EDGAR parse (`edgar.ts`) through the cutoff logic (`holdings.ts`) to `factor_details` persistence and the UI drill-down. Determine: (a) where the double ×100 happens, (b) whether the cutoff decision math compares inflated-to-inflated (self-consistent) or inflated-to-correct (walk stops at the wrong place, affecting which holdings get scored). **Report findings in the PR before fixing.** If the fix is isolated (display/log only), apply it. If it changes which holdings pass the cutoff, STOP and present the fix plan for Robert's approval first — that alters scoring inputs.

5. **Re-port `client/src/engine/allocation.ts` from the server engine.** Update to match `src/engine/allocation.ts` exactly: k-table 0.42–2.25, 4% de minimis via `DE_MINIMIS_PCT` semantics, proportional redistribution of swept weight, remove the Session-22 MM cash sweep (`MM_CASH_CAP`) entirely. Verify the slider rescore on YourBrief and Research produces the same allocation as the server for the same inputs (document one worked comparison in the PR). Note in the PR, as a future suggestion only: serving these constants from an API endpoint would prevent re-drift (Principle 3).

6. **Fix `supaFetch GET pipeline_runs — Cannot coerce the result to a single JSON object`.** Likely a single-object coercion on an empty result set at run start. Fix so a missing prior run is handled as a normal case, not an error log.

7. **Fix `holdings_cache` duplicate-key spam.** The persist step conflicts with existing rows on `idx_holdings_unique`. Convert the insert to an upsert (or delete-then-insert per fund/date — choose whichever matches the existing supaFetch helper's capabilities) so re-runs don't log errors. The July 1 run reported "9 errors" at persist; after this fix a re-run should report 0.

8. **Investigate the empty FRED macro packet (report-only unless trivial).** Brief #195 said macro indicators were unavailable. Check `fred.ts` and the brief data-packet assembly: is `FRED_API_KEY` read correctly, are the series calls failing, is it cached-empty from the starvation era? If the fix is a one-liner, apply it; otherwise report findings and a proposed fix for A3.

9. **Update `FUNDLENS_V7_FOUNDING.md`:** in §5, mark decisions 1 and 2 as ratified July 1, 2026 (daily briefs killed — implemented this assignment; thresholds 90/95 ratified). In §6, renumber: A2 = Stabilization (this assignment), A3 = Dossier Contract + Scorecard, shifting the rest down one.

10. **Report-only items (no code):** In the final PR description, note the status of: (a) the grayscale aggregate donut — state whether the first fully funded pipeline run reduced the "Not Classified" share (compare `sector_classifications` cache growth), and whether a data-matching bug remains; (b) the Generate button's empty half-second click (generation runs but UI shows nothing until refresh) — describe the cause in one paragraph for a future UI assignment; (c) any other observations, as suggestions only (scope discipline).

## Hard constraints

- Do **NOT** modify `scoring.ts`, server `allocation.ts`, `thesis.ts`, `constants.ts` values, or any model constants.
- Do **NOT** change any Claude API call patterns — sequential with delays, never parallel (CLAUDE.md hard rules).
- Do **NOT** rename or touch environment variable names or `env.example`.
- Task 4: no scoring-input changes without Robert's explicit approval, per the STOP condition.
- No refactors beyond the tasks. Suggestions go in the report, not the diff.

## Acceptance criteria

- Root `npx tsc --noEmit`: 0 errors. Client `npx tsc --noEmit`: 0 errors. `npm run build` succeeds.
- `CLAUDE.md` exists at root with the exact content from Task 1.
- Grep confirms no post-pipeline call sites for `regenerateBriefsForAllUsers` remain in `routes.ts`/`cron.ts`; the function still exists in `brief-scheduler.ts`; `checkAndSendBriefs` path untouched.
- Client allocation module contains k values 0.42–2.25, 4% de minimis, no `MM_CASH_CAP`.
- PR description includes: the Task 4 trace findings, the Task 5 worked comparison, Task 8 findings, Task 10 report items, and each commit listed with its task number.
