# Assignment A3 — Scoring Integrity + Dossier Contract (rev. July 2, 2026)

**Repo:** racoursey-cloud/fundlens-v6 · branch `main` (A2, A2.1, A2.2, A2.3 merged — verify A2.3's PR is merged before starting; if not, STOP and tell Robert)
**Authority:** FUNDLENS_V7_FOUNDING.md and CLAUDE.md at repo root. Evidence Gate applies to every task: read all relevant files completely, present findings and plan, wait for Robert's confirmation before writing.
**Context:** A2 stabilized the platform; A2.1–A2.3 fixed UI honesty and the persist merge blob. A3 fixes the known defects that corrupt scoring inputs and establishes the Dossier contract with ratified thresholds (90% NAV resolved / 95% classified, July 1, 2026).

## Tasks — in order, one commit per file

1. **Fix the sector cache cross-contamination (highest priority — distorts a 25%-weight factor today).** Verified July 2 against production data: FSPGX shows 19.5% "Fixed Income" because bond funds' holdings (bonds issued by Amazon, Alphabet, Meta, Mastercard, Oracle, American Tower, Amex, Zoetis, Citigroup, Bristol-Myers) share issuer names with stocks, and `sector_classifications` is keyed by `holding_name` alone. The poisoned entries override Haiku classification for equity holdings and refresh every run. Fix design, subject to your Evidence Gate findings: (a) make the cache key distinguish asset types — preferred: add an `asset_type` column ('equity'/'debt'/'other', derived from EDGAR's isDebt/assetCategory flags) to the cache key on both save and lookup; (b) add a guardrail — a holding with a resolved stock ticker must never receive 'Fixed Income' from a name-cache hit; (c) provide a SQL migration for the schema change plus a one-time cleanup that deletes the contaminated rows so the next run reclassifies fresh. **STOP condition: this changes Positioning inputs and therefore scores. Present the full fix plan, including expected direction of score changes for affected funds, and wait for Robert's approval before writing code.**

2. **Fix the placeholder-CUSIP blind spot upstream (from the A2.3 PR's suggestions — read that PR's suggestions section first).** A2.3 fixed persist; the same "N/A-is-an-identifier" assumption remains in three upstream places: (a) the in-memory fund-of-funds dedupe merges by cusip — distinct "N/A" foreign holdings collapse before scoring; (b) the ISIN-retry map is keyed by cusip, so all "N/A" holdings share one ISIN slot; (c) `cusip_cache` uses cusip as its primary key, so one cached resolution is shared by every "N/A" holding across all funds — likely a contributor to the international funds' poor resolution rates (VFWAX resolved 68/400 on July 2). Fix each with the A2.3 pattern (placeholder detection; key by name or name+ISIN where cusip is a placeholder), including any needed `cusip_cache` migration and cleanup of contaminated cache rows. **STOP condition: (a) and (b) change scoring inputs for international and fund-of-funds holdings — present expected impact and wait for approval.**

3. **Fix the fund-of-funds look-through inflation (plan already written in the A2 PR).** The look-through multiplies two whole-percentage numbers (parent weight × child weight), producing values 100× too large, and the 1% sub-fund threshold behaves as 0.01%. Implement per the A2 PR's documented plan. **Same STOP condition: scoring inputs change for WFPRX, WEGRX, and any fund where look-through fires — present expected impact and wait for approval.**

4. **Dossier Contract.** Define and implement the per-fund Dossier: a persisted, versioned record of each fund's data-quality state per pipeline run — NAV resolved %, classified %, holdings count, look-through status, fallback counts, coverage-scaling applied (the July 2 run scaled 4 funds: VFWAX 12%, RNWGX 23%, VWIGX 13%, QFVRX 5% coverage), and pass/fail against the ratified thresholds (90% NAV resolved / 95% classified). Funds failing the gate are flagged in pipeline output and the admin email (extend the A2 Task 3 alert wiring — one summary email when any fund fails its gate, rate-limited per A2 conventions, not one email per fund).

5. **Scorecard surface.** Expose the Dossier in the UI read-only: a simple per-fund data-quality view (location per your Evidence Gate findings — likely the Pipeline tab) showing each fund's latest Dossier and pass/fail. No design flourishes; function over form; this is Robert's diagnostic instrument.

6. **Small fixes, one commit each:** (a) rename pipeline step 11's progress label from "Generating investment brief" to "Generating macro thesis" — the label is wrong and caused a false alarm July 2; (b) the pipeline has no protection against deploy-restarts — a Railway deploy mid-run kills the run silently, leaving it eternally "running" (observed July 2; the 30-minute stale-run cron eventually cleans up, but the death is silent). Minimal fix: on server startup, mark any run still in 'running' status as 'failed' with a note, and send the admin alert — a killed run should be loudly dead (Principle 1).

7. **EDGAR skip-if-unchanged (efficiency, last priority — cut this task first if the session runs long).** At pipeline start, fetch EDGAR's lightweight filing index per fund, compare the latest accession number against the stored one, and skip download/parse for unchanged filings **only when** the stored holdings pass a completeness check (row count > 0 and NAV coverage above the Dossier threshold — this dependency is why this task comes after Task 4). A new filing, a failed completeness check, or any doubt → full fetch, current behavior. Log skips explicitly ("FXAIX: filing unchanged (accession X), reusing stored holdings").

8. **Report-only:** (a) sector taxonomy decision — Haiku classifies Alphabet/Meta as Technology; the standard scheme (GICS) calls them Communication Services. Document the discrepancy and present options (adopt GICS names in the classifier prompt vs. keep colloquial labels) with tradeoffs; Robert decides, nothing implemented. (b) International holdings resolution — after Task 2(c), report whether ISIN-based resolution for foreign holdings is worth a future assignment, with expected coverage gains for VFWAX/RNWGX/VWIGX/QFVRX. (c) Any other observations as suggestions only.

## Hard constraints

- Tasks 1, 2, and 3 are scoring-input changes: **no code before Robert approves each fix plan individually.**
- Do NOT modify `scoring.ts` weights, `constants.ts` values, Claude API call patterns, or environment variable names.
- All Claude calls remain sequential with delays. One file per commit. Suggestions in the report, never the diff.
- If the session runs long, cut from the bottom: Task 7 first, then Task 6, then Task 5. Tasks 1–4 are the core.

## Acceptance criteria

- Both TypeScript checks 0 errors; build succeeds.
- After Tasks 1–3 and one pipeline run: FSPGX sector breakdown in `holdings_cache` shows no equity holdings labeled Fixed Income (SQL spot-check documented in PR); Amazon/Alphabet/Meta appear under their correct sectors; international funds persist distinct foreign holdings (no shared-key collapse anywhere in the flow).
- Dossier rows persisted per fund per run; threshold pass/fail visible in UI and admin email.
- PR description: per-task findings, expected vs. observed score changes for Tasks 1–3, each commit listed with task number.
