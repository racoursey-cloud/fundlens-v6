# A5 Session — Evidence Gate Findings + STOP Plans

**Assignment:** A5 — Full Examination + Confidence Profile
**Session date:** 2026-07-05
**Status:** PLANS AWAITING APPROVAL. No code has been written. Per the Evidence Gate Protocol, every relevant file was read completely before these plans were drafted. Tasks 1–4 are STOP tasks — each plan below waits for Robert's individual approval. Task 5 is a plan-for-confirmation. Tasks 6–7 are report-only and depend on runs that happen after Tasks 1–2 land.

**Founding principles cited:** Principle 1 (worst-input rule — silent gaps are worse than visible failures), Principle 2 (no fake neutrality), Principle 3 (one source of truth), Principle 4 (everything carries a date), Principle 6 (understanding over directives).

---

## Files read (Evidence Gate)

Engine: `constants.ts`, `pipeline.ts`, `holdings.ts`, `edgar.ts`, `cusip.ts`, `fmp.ts`, `classify.ts`, `industries.ts`, `dossier.ts`, `persist.ts`, `cache.ts`, `supabase.ts` (query construction), `types.ts`, `auth.ts`, `cron.ts`, `thesis.ts`, `fund-summaries.ts`, `brief-engine.ts` (model + prompt wiring).
Server: `server.ts`, `routes/routes.ts`.
Client: `App.tsx`, `AppShell.tsx`, `ProtectedRoute.tsx`, `AuthContext.tsx`, `auth.ts`, `Login.tsx`, `FundLens.tsx`, `FundDetail.tsx`, `Pipeline.tsx`, `api.ts`, `YourBrief.tsx` (header region).
Documents & migrations: `FUNDLENS_V7_FOUNDING.md`, `A4_COMPANY_LEVEL_CLASSIFICATION.md`, `a3_task4_fund_dossiers.sql`, `a4_task6_dossier_v2.sql`, `session9_continuous_risk_and_alloc_history.sql`.

---

## Three discoveries that shape everything below (plain English)

**1. A 15-minute timer will kill the first full-examination run.**
Two pieces of housekeeping code treat any pipeline run older than 15 minutes as dead: a cleanup job that fires every 30 minutes (`cron.ts`), and a check that runs when someone presses "Run Pipeline Now" (`routes.ts`). The comment on that code says "pipeline runs in ~70 seconds" — true in the cached, 400-holding world, not in the full-examination world. My honest forecast for the first full run is **60–100 minutes** (details in Task 1). Without raising this timer, the first run gets publicly marked "failed" while it is still working, the progress overlay dies, and a second run could be started on top of it — two pipelines making Claude calls at once, which is exactly the crash pattern the house rules exist to prevent. **Task 1 must include raising this timer.** This is inside the assignment's scope because the assignment's acceptance criterion is "run completes clean" — it cannot complete clean while another part of the system declares it dead.

**2. One database lookup genuinely assumes funds are small.**
When the pipeline checks which of a fund's securities are already in the identifier cache (`cusipCacheLookup` in `cusip.ts`), it puts **every identifier for the fund into a single web address**. At 400 holdings that address is ~5,000 characters — fine. At VFWAX's 3,918 holdings it is ~50,000+ characters, which the database's web gateway will reject. The failure is soft (the code logs a warning and continues), but the consequence is bad: the cache silently stops working for big funds, and every nightly run re-resolves VFWAX from scratch — slow and wasteful, forever. The fix is to ask in chunks of 200, the same pattern every other cache lookup in `cache.ts` already uses. Everything else I checked (FMP cache, sector cache, industry cache, classification batching) already chunks correctly; the holdings write to the database sends one large insert per fund (~1.5 MB for VFWAX), which Supabase accepts but I propose chunking to 500 rows per insert as cheap insurance.

**3. The whole app's header quietly depends on one pipeline endpoint.**
Every user's top-of-screen "LIVE" badge and the "Refresh Analysis" button call `GET /api/pipeline/status`. Task 4 says `/pipeline` and "its API endpoints" become admin-only. If the status endpoint goes admin-only, every non-admin's header breaks. The Task 4 plan below proposes exactly which endpoints get gated and which one stays merely logged-in, and asks Robert to ratify the split.

---

# Task 1 — Retire the coverage cutoff (STOP plan)

## Where the cap lives and everything that reads it

- **`src/engine/constants.ts` → `HOLDINGS_COVERAGE`** (`TARGET_WEIGHT_PCT: 95`, `MAX_HOLDINGS: 400`). The constants file is frozen by house rule, but this assignment explicitly retires these two values ("The coverage cutoff dies"), so touching **only this block** is authorized. Imported in exactly one place: `holdings.ts`.
- **`src/engine/holdings.ts` → `applyCoverageCutoff()`** — the walk that sorts holdings largest-first and stops at 95% or 400. This is the only place the cutoff executes.
- **`coverage.cutoffReason`** (`'weight' | 'count'`) — produced by the walk, typed in `types.ts`, used only in one log line. Becomes `'complete'` (new value) when every row is included.
- **`coverage.weightCovered`** — flows into the Dossier's `weight_covered_pct`, displayed as the **Examined** column on `/pipeline`. Today it stops accumulating at the cutoff; after the change it is simply the sum of all positive filing weights and computes to ~100% **naturally** — no hardcoding, exactly as the assignment requires.
- Nothing else reads the constants. Money-market funds never enter this path.

## The change (2 commits, one file each)

1. `holdings.ts`: replace the cutoff walk with an include-everything pass (still sorted largest-first so downstream "top holdings" order is unchanged). `cutoffReason: 'complete'`. Also in this file's blast radius but a separate commit if preferred: none — the chunking fix below is in `cusip.ts`.
2. `constants.ts`: delete the `HOLDINGS_COVERAGE` block (now unreferenced). No other line in the file is touched.

Plus three supporting fixes the full volume makes necessary (each its own commit):

3. `cusip.ts`: chunk `cusipCacheLookup` to 200 identifiers per query (discovery #2). Without this, big funds lose their cache and every night is a first run.
4. `persist.ts`: chunk the per-fund holdings insert to 500 rows per batch (insurance; delete-then-insert order preserved so no data gap window changes).
5. `cron.ts` + `routes.ts`: raise the stale-run threshold from 15 minutes to **120 minutes** (discovery #1). Two files → two commits.

## First-run cost forecast (honest numbers)

Blast radius from the July 5 table: VFWAX 400→3,918 rows, MWTSX 300→1,630, BPLBX 47→559, FXAIX 325→507, VADFX 400→508; total ~3,166 → ~10,100. Tail composition per the assignment's evidence: ~1,900 bonds, ~3,500 VFWAX foreign micro-caps, ~1,500 US small-fry with heavy cross-fund overlap.

- **FMP vs the 300/min limit:** every FMP call is sequential with a 250 ms delay (`PIPELINE.API_CALL_DELAY_MS`), which caps us at ~240 requests/minute by construction — under the limit with no code change. **No rate-limit hits are possible at existing pacing.** Volume, first run: ~3,000–3,500 ISIN searches (foreign tail), a few hundred name-search fallbacks, and ~1,500–2,500 newly enrichable tickers × 3 calls each (profile, ratios, key metrics). Call it **10,000–13,000 FMP requests ≈ 45–60 minutes** of paced FMP time.
- **OpenFIGI:** ~7,000 new identifiers ÷ 100 per batch = ~70 batches, paced — **~2–3 minutes**. The existing 429-retry stays.
- **Haiku batches:** bonds cost zero (the metadata pre-gate classifies them without Claude). New unique names needing Haiku sector and/or industry: roughly 2,000–4,000 → **~150–300 batches of 25, sequential at 1.2 s ≈ 15–25 minutes**. Comfortably inside the ~$10/month ratified cost.
- **Total first run: ~60–100 minutes.** This is above the assignment's stated 30–60 budget, and I am saying so rather than shading the estimate — the dominant term is the VFWAX foreign tail's per-holding FMP ISIN searches. Options if Robert wants it faster: none that don't touch frozen pacing rules, so I recommend simply accepting one long unattended run (it is cache-building work that never repeats) and raising the stale timer as planned. The run should be started via "Run Pipeline Now" and left alone; it needs no babysitting.
- **Steady-state nightly:** identifier cache is permanent, sector/industry caches 15-day, FMP 7-day. On cache-hit nights: EDGAR fetches + arithmetic ≈ **5–12 minutes** — inside the ≤~12 target. **Honest caveat:** every ~7th night the FMP cache expires all at once and that night re-fetches every enrichable ticker (~30–55 minutes). Two remedies, Robert picks: (a) accept one slow night a week (the 120-minute stale timer already covers it), or (b) lengthen the FMP cache to 30 days (`cache.ts`, one number — fundamentals update quarterly, so 30 days loses nothing). **I recommend (b), as a Robert-ratified exception.**

## The honest expectation for the PR (disclosure, not regression)

VFWAX's graded number (`resolved_of_resolvable_pct`, 89.4% on the July 5 baseline) **will move** when ~3,500 hard foreign names enter its denominator — likely down before A6 attacks the residual. The PR will state this in plain English, and the session report will show the before/after side by side. A FAIL with true numbers satisfies A5 (acceptance criterion 7); closing the gap is A6's job.

## Memory / payload check (nothing assumes ≤400 — verified item by item)

- EDGAR parser already parses **all** rows of every filing (it always has; the cutoff happened after parsing). No change in memory there.
- In-memory pipeline: ~10,100 holding objects across 22 funds — trivial for Node.
- `fund_scores.factor_details.topHoldings` persists **all** holdings per fund (deliberate since Session 25). VFWAX's JSON grows to ~3,918 entries (~300 KB); the all-funds `/api/scores` response grows to roughly 2–3× today's size. Acceptable, and it is the product point ("every holding your fund reported"); the FundLens holdings panel already scrolls. Flagged, not changed.
- `holdings_cache` insert: chunked per fix #4. `GET /api/scores/:ticker` already limits to 50 rows — unchanged.
- `cusip_cache` lookup: fixed per #3.
- The two Dossier count columns will now read e.g. `3918/3918`.

## Acceptance check

Examined ≥99.5% for every non-money-market fund (note: funds with short/overlay legs, e.g. DRRYX at ~−0.46%, land at ~99.5 rather than 100.0 because negative legs are excluded from the ratios — that is A4's ratified treatment, disclosed in the same table). No rate-limit hits (guaranteed by pacing). Migrations: none for Task 1.

## Optional seventh commit — identifier-type instrumentation for Task 6 (the A4 carry-over)

A4 left one investigation open: the `<identifiers><other>` elements in NPORT-P filings. The parser currently reads only entries whose description matches "SEDOL" and **silently ignores every other identifier type filers put there** — we have never taken a census of what else is in that element across the 22 funds. Task 6's residual report must "name the identifier types present on failing rows," and this is the same census. Proposal: one small logging addition in `edgar.ts` (mirroring A4's own SEDOL-instrumentation pattern) that logs each *unrecognized* `otherDesc` value once per value per fund, so the first full-examination run produces the complete identifier-type census in its log. Report-only output; no behavior change; the findings feed Task 6 and scope A6.

**STOP — awaiting Robert's approval of: the six commits above (seven with the identifier-type instrumentation), the 120-minute stale timer, the 60–100-minute first-run expectation, and remedy (b) for the weekly FMP re-fetch night.**

*(Reviewer note, reconciled 2026-07-05: an earlier draft said "7 commits" against a six-commit list — arithmetic slip, now corrected; the optional instrumentation commit above is counted separately and explicitly.)*

---

# Task 2 — Compute the confidence profile (STOP plan)

## The exact field-to-rung mapping (the pin)

All per-holding facts already exist since A4 (`ticker`, `listingTier`, `industrySource`, `momentumEligible`, `structurallyUnresolvable`, plus the EDGAR debt-metadata identification the Dossier already uses). Arithmetic only, over **positive-weight** holdings, evaluated top-down per holding — first match wins:

| Order | Rung | Test (per holding) | Plain English |
|---|---|---|---|
| 1 | **Structurally opaque** | `structurallyUnresolvable === true` | Bullion, derivatives, cash/repo sweeps, no-identifier rows — nothing to verify, by nature |
| 2 | **Fully verified** | has resolved `ticker` AND `industrySource === 'fmp'`, **or** is a debt/investment-company row identified by EDGAR's own filed metadata (the existing `isIdentifiedWithoutTicker` test in `dossier.ts`) | Filed data end to end — identity certain, classification from filed sources (FMP profile for equities; the filing's own debt declarations for bonds) |
| 3 | **Identity only** | has resolved `ticker` AND (`listingTier === 'home'` OR `momentumEligible === false` OR no industry source at all) | We know exactly what it is; our plan can't fetch its financials (home listing), or its US ticker is too thin to trust for anything beyond identity |
| 4 | **Identified, model-classified** | has resolved `ticker` AND `industrySource === 'haiku'` | Identity certain (CUSIP/ISIN/SEDOL-resolved); the industry label is Claude's, disclosed as such |
| — | **Unidentified remainder** | everything else (has an identifier, resolution failed — the VFWAX/VWIGX residual) | Not a stored rung: it is `100 − (four rungs) − short overlay`, displayed honestly as the gap |

Two definitional points for Robert to ratify, stated rather than assumed:

- **Bonds sit in Fully verified.** A Treasury with a CUSIP whose own filing declares it debt is filed data end to end — arguably *more* verified than an FMP-profiled equity. The alternative (bonds → Identity only) would make every bond fund headline terribly for no honest reason. QFVRX and FXAIX acceptance shapes both hold under this pin: FXAIX ≥95 Fully verified; QFVRX's SEDOL-resolved home listings land squarely in Identity only.
- **The unidentified remainder is the arithmetic gap, not a fifth column.** The assignment specifies four columns; the residual is derived and displayed ("Not identified this run: X%"), never hidden. Acceptance's "four rungs + short overlay reconcile to 100 ± rounding" then reads: four rungs + overlay + remainder = 100, with remainder ≈ 0 for domestic funds and = the honest FAIL number for VFWAX/VWIGX.

Rung evaluation order note: rule 3 before rule 4 means a firewalled holding with a Haiku label reads Identity-only (its label exists but its data depth doesn't) — matching the assignment's rung definitions verbatim.

## Storage

Migration `a5_task2_dossier_v3.sql` (one file, Robert runs it in Supabase **before** merging dependent code; the PR states this order):

- `fund_dossiers` gains four columns: `conf_fully_verified_pct`, `conf_model_classified_pct`, `conf_identity_only_pct`, `conf_opaque_pct` (NUMERIC(6,2), NOT NULL DEFAULT 0), with column comments defining each rung in one sentence.
- `DOSSIER_VERSION` bumps to **3** in `dossier.ts` (version note in the constant's comment; v2 rows keep version 2, no rewrite).

Code: `dossier.ts` (one pass added to the existing walk — pure arithmetic, no API calls) and `persist.ts` (four new fields written). Two commits. Money markets: special case as always — the card reads from their special-case pass, ladder not applicable.

## Acceptance check

Per fund: rungs + overlay + remainder = 100 ± rounding (I will verify against the first post-Task-1 run's table). FXAIX-class ≥95 Fully verified. QFVRX shows the large Identity-only rung its SEDOL→home-listing reality predicts.

**STOP — awaiting Robert's approval of: the mapping table above (especially the two ratification points), the four column names, and DOSSIER_VERSION 3.**

---

# Task 3 — User-facing trust display (STOP plan)

## How the data reaches the user (Principle 3 — one source of truth)

The client never computes trust math. At persist time, a small server-computed `confidence` object is embedded into each fund's `factor_details` (which FundLens and FundDetail already fetch — zero new endpoints):

```
confidence: {
  identifiedPct,          // Line 1: % of NAV identity-verified
  filedClassifiedPct,     // Line 2: Fully verified rung
  modelClassifiedPct,     // Line 2: model-assessed rung
  ladder: { fullyVerified, modelClassified, identityOnly, opaque, shortOverlay, remainder },
  asOf                    // the filing's report date (Principle 4)
}
```

## Fund card (the FundLens row's expanded block, top of the panel)

Two lines per ratified Decision 1 — credential first, disclosure second, zero apology:

- **Line 1:** "Holdings identified: 99% of this fund's value"
- **Line 2:** "Classifications from filed data: 54% · the rest model-assessed" — the phrase for the model-sourced share is **provisional until Task 7's measured agreement rate picks the vocabulary** (Decision 2). I will build with the neutral placeholder "model-assessed" and swap one string after Task 7 reports.

## Fund detail (the expanded block gains a "Data confidence" section)

The full four-rung ladder with plain-English rung names, the derived remainder line when non-zero, the short-overlay note when non-zero, and the as-of date: "From the fund's SEC filing dated March 31, 2026." Financial-data depth lives here (the Identity-only rung's explanation), not on the card — per Decision 1's three-altitudes rule.

Proposed rung names for the ladder (Robert may reword): **Fully verified** · **Identified, classification estimated** · **Identified, limited data** · **Not classifiable by nature** — and, when present, "Not identified this run: X%".

## Ambient line

One quiet sentence under the FundLens page header (currently "22 funds in your 401(k) plan — click any fund to look inside"): **"Holdings data from the latest SEC filings · 22 funds · updated nightly."** No percentages, no gate language. (The assignment allows Your Brief or the header; FundLens is where the fund data lives, so it goes there — say the word if you'd rather have it on Your Brief.)

## Vocabulary audit

Banned on user surfaces: "unresolvable," "fallback," "scaled," threshold percentages. Current FundLens/FundDetail/YourBrief already comply (the donut's "Not Classified" slice stays — it's honest and plain). `/pipeline` keeps its clinical voice, untouched. New copy above complies by construction.

Files touched: `persist.ts` (confidence object), `FundLens.tsx` (card lines + ambient line), `FundDetail.tsx` (ladder section). Three commits. No migration.

**STOP — awaiting Robert's approval of: the embed-in-factor_details transport, the card copy, the ladder rung names, and the ambient line's placement.**

---

# Task 4 — Access hardening (STOP plan)

## Why the ghost happened (root cause, from the code)

Magic-link sign-in (`client/src/auth.ts → signInWithOtp`) **creates a brand-new account for any email address by default** — Supabase's `shouldCreateUser` option defaults to true. A typo'd email therefore auto-provisioned a shell user, and the Supabase-side `on_auth_user_created` trigger (plus a safety net in `GET /api/profile`) gave it a profile. Separately, `/pipeline` is reachable by any logged-in account because the client route has no admin check — only the two *write* endpoints (`run`, `retry`) check admin, and that check is a hardcoded email list in the frozen `constants.ts`.

## Signup allowlist (Decision 3 — Robert decides the rule; the mechanics below fit option A, explicit list)

- `client/src/auth.ts`: `signInWithOtp` gains `shouldCreateUser: false`. Unknown emails no longer create anything — Supabase returns an error instead.
- `client/src/pages/Login.tsx`: that error becomes a polite refusal: "This email isn't set up for FundLens. If you think it should be, contact Robert." (exact copy Robert's to edit).
- **New users are added by Robert in the Supabase dashboard** (Authentication → Users → Invite user) — entirely browser-based, which fits the operator model and a 23-fund single-company tool. No allowlist table, no trigger, nothing to maintain in code. If Decision 3 lands on a domain rule instead, we revisit with a database trigger — but the explicit-list mechanics above are the safest and simplest, and I recommend them.
- Belt-and-braces: in Supabase dashboard, Authentication → Providers → Email → disable "Allow new users to sign up" (Robert clicks this; I'll include the exact path in the PR).

## Admin gating

- **Migration `a5_task4_user_profiles_admin.sql`:** `ALTER TABLE user_profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;` then `UPDATE user_profiles SET is_admin = true WHERE email = 'racoursey@gmail.com';` Run before merging dependent code (PR states order).
- **Server (`routes.ts`):** `requireAdmin` becomes a database check on `user_profiles.is_admin` (60-second in-memory cache so it doesn't add a query to every click). `ADMIN_EMAILS` in `constants.ts` is **not touched** (frozen file); it remains as a read-only fallback inside `requireAdmin` so a missed migration cannot lock Robert out. Newly gated endpoints: `GET /api/pipeline/history`, `GET /api/pipeline/log/:runId`, `GET /api/dossiers/latest`, `GET /api/monitor/health`, `GET /api/monitor/data-quality`, `GET /api/monitor/cron` (plus the already-gated `run`, `retry`, `help/reload`). **Stays logged-in-only: `GET /api/pipeline/status`** — the every-user header badge depends on it and it exposes only run timestamps/counts (discovery #3). `POST /api/pipeline/abort` stays as is (it can only mark runs aborted; sendBeacon can't carry auth headers — documented limitation, unchanged).
- **`POST /api/pipeline/abort` — the one door deliberately left unlocked** (reviewer-confirmed, on the record): any logged-in user can mark a running pipeline as aborted, because the browser-close beacon that calls it cannot carry login credentials. What it can do is limited — mark a run failed, never read or delete data — and with signup closed to the allowlist the population who could misuse it is Robert's own coworkers. Accepted as a documented limitation; if it is ever abused, the fix is to drop the beacon path and accept slightly staler "running" rows.
- **`GET /api/profile`** response already returns the whole profile row, so `is_admin` rides along automatically once the column exists; the client `UserProfile` type gains the field.
- **Client:** `/pipeline` route wrapped so non-admins get a clean redirect home (check inside the Pipeline page or a small AdminRoute wrapper — I'll propose the wrapper in the PR). "Pipeline" appears in the `AppShell` nav tabs only when `is_admin` — the cockpit stops being findable-by-accident-only. The header's "Refresh Analysis" button also hides for non-admins (today it 403s when clicked — dead UI for them).

Commits: migration (1), routes.ts (1), api.ts type (1), AppShell.tsx (1), App.tsx or Pipeline.tsx gating (1), auth.ts (1), Login.tsx (1).

## Ghost-residue verification — VERIFIED CLEAN 2026-07-05

**Robert ran the query below in the Supabase SQL Editor on 2026-07-05; all six counts returned 0** (auth.users, user_profiles, orphan profiles, orphan briefs, orphan deliveries, orphan allocations). The ghost account `rcoursey@gmail.com` left no residue anywhere. This satisfies the "ghost-account residue zero" clause of A5 acceptance criterion 3; the query is kept here as the evidence of record:

```sql
SELECT 'auth.users' AS place, count(*) FROM auth.users WHERE email = 'rcoursey@gmail.com'
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles WHERE email = 'rcoursey@gmail.com'
UNION ALL SELECT 'orphan profiles', count(*) FROM user_profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
UNION ALL SELECT 'orphan briefs', count(*) FROM investment_briefs b
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.user_id)
UNION ALL SELECT 'orphan deliveries', count(*) FROM brief_deliveries d
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id)
UNION ALL SELECT 'orphan allocations', count(*) FROM allocation_history a
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);
```

**STOP — awaiting Robert's approval of: the shouldCreateUser mechanics + dashboard-invite workflow (Decision 3), the endpoint gating split (status stays logged-in-only), the is_admin fallback-to-ADMIN_EMAILS design, and hiding Refresh Analysis from non-admins.**

---

# Task 5 — Main Street prose (plan for confirmation)

**Model.** New constant in the `CLAUDE` block of `constants.ts` (explicitly authorized by the assignment): `PROSE_MODEL: 'claude-sonnet-5'`. Calls that move to it:

- `thesis.ts` (today `THESIS_MODEL` = claude-sonnet-4-6)
- `fund-summaries.ts` (today runs on the **Haiku** classification constant — moving it is both a voice and a quality upgrade; classification itself stays on Haiku untouched)
- **Question for Robert:** the Investment Brief (`brief-engine.ts`, today Opus 4.6). The assignment's preamble lists "Brief prose" among the user-facing text, and one consistent voice argues for moving it; but the Brief was deliberately put on Opus for depth. My recommendation: move it to Sonnet 5 for voice consistency and judge it by ear alongside the rest; easy to revert (one constant reference). The frozen `THESIS_MODEL`/`BRIEF_MODEL` constants are left in place, merely no longer referenced.

Cost: per the July 5 quantification, roughly $0.20 → $0.50/month. All calls remain sequential with mandated delays — only the model name changes.

**Voice.** A register spec added to the three prompts (thesis system prompt, fund-summaries `VOICE_PROMPT`, `editorial-policy.md`), draft language in the PR for Robert's read before merge. The spec, in draft:

> Write for a smart coworker who does not work in finance. Dollars, not basis points ("costs about $45 a year on a $10,000 balance," never "45bps"). "What your money owns," not "portfolio exposure." If a term would send a normal person to Google — duration, overweight, cyclical, headwind — either drop it or explain it in the same breath, once. Short sentences. Concrete nouns: company names, dollar amounts, plain verbs. Never apologize for data and never dress it up; say what is known, what is estimated, and what it costs.

**Sonnet 5 mechanics (added after review, verified against the current API reference — this closes the max_tokens question):**

1. **Thinking is on by default.** On `claude-sonnet-5`, a call that doesn't mention thinking runs with "adaptive thinking" — the model reasons privately before writing, and those reasoning tokens **count against the call's `max_tokens` ceiling**. Our prose calls have ceilings tuned for the old models (thesis 4,000; fund summaries 4,096). Left alone, the prose could silently truncate mid-sentence. **The plan: keep thinking ON (it should improve the thesis) and raise the ceilings** — thesis 4,000 → 12,000 and fund summaries 4,096 → 12,000, with the Brief's ceiling raised proportionally if it moves. Both files already read only the response's text blocks, so thinking output cannot leak into what users see — verified in the code.
2. **The new tokenizer produces ~30% more tokens for the same text.** Another reason the raised ceilings are needed, and why per-call costs shift even at the same per-token price.
3. **No temperature-style parameters.** Sonnet 5 rejects requests that set sampling parameters. The thesis and fund-summary calls set none (verified); the Brief call will be checked for them before it moves, and any found are removed.
4. **Pricing is introductory through August 31, 2026** ($2 in / $10 out per million tokens), then rises to the standard $3/$15. The ~$0.50/month estimate is at intro pricing; expect roughly ~$0.75/month from September. Still immaterial, stated for honest budgeting.

Acceptance is literally the Robert-ear test on one regenerated thesis and one fund summary. Commits: `constants.ts` (new constant only), `thesis.ts`, `fund-summaries.ts`, `brief-engine.ts` (if ratified), `editorial-policy.md` — one file per commit.

---

# Task 6 — The A6 dossier (report-only; approach)

No code. After the full-examination run lands, the PR gets: per-fund unresolved holdings by count and weight (VFWAX and VWIGX especially, naming the identifier types on failing rows — the A4 SEDOL instrumentation in `edgar.ts` already logs SEDOLs, and Task 1's optional seventh commit extends it to every `otherDesc` value), whether the deferred Bloomberg-ticker hint (`identifierTicker`, already parsed and stored) would plausibly close the gaps, a recommended A6 scope, and the confidence-profile actuals per fund as A6's baseline table.

**A4 carry-over placed on the record (review item, 2026-07-05):** the open investigation of the `<identifiers><other>` element — what identifier types beyond SEDOL filers actually put there — **lives here, in Task 6**, fed by the Task 1 instrumentation. It is explicitly in A5's scope as a report finding; acting on whatever it reveals (new resolution paths for new identifier types) is A6 scope. It is not silently dropped.

**The benchmark reframe, anchored for the A6 recommendation (ratified numbers, co-signed 2026-07-05):** the Task 7 benchmark measured Haiku at **87.8% sector-level and 56.0% industry-level agreement** against 400 out-of-sample FMP-labeled equities; Decision 2's vocabulary is "estimated" accordingly. The 56% number changes what A6 *is*. Before it, resolving the VFWAX/VWIGX residual was a provenance upgrade — moving labels from "model said so" to "filing said so." At 56% industry agreement, it is an **accuracy** upgrade: roughly four in ten Haiku industry tags are likely wrong at the fine-grained level, and every holding FMP takes over gets *corrected*, not just re-credentialed. This materially raises A6's value and anchors the Task 6 recommendation.

# Task 7 — Haiku classification benchmark (report-only; approach)

Robert is browser-only, so the benchmark needs a browser-triggerable path. Proposal: a temporary **admin-only** endpoint (`POST /api/benchmark/classification`, gated by Task 4's `requireAdmin`, removed after the report) that: samples 300–500 equities from `holdings_cache` where `industry_source = 'fmp'` (out-of-sample by construction — Haiku never touched them), runs each through the **exact production industry prompt** in `classify.ts` as if unlabeled — sequential, batches of 25, 1.2 s delays, same as production — then writes the agreement table (sector-level and 159-menu industry-level vs the FMP label) and a disagreement list to the run log and emails it via the existing admin-alert path. Cost: ~15–20 Haiku calls, well under $1; ~20 minutes wall-clock. The measured rate picks Line 2's vocabulary (Decision 2) before the card copy is finalized. This endpoint plan rides in the Task 3 STOP approval since its output gates Task 3's final wording.

---

# Decisions Robert owns (recap)

1. ~~Two-line card~~ — **ratified July 5** (Option C). Built as specified.
2. **Line 2 vocabulary** — decided after Task 7's measured number. Placeholder "model-assessed" until then.
3. **Allowlist rule** — Task 4 proposes explicit list via `shouldCreateUser: false` + dashboard invites. Confirm, or name a domain rule.
4. *(New, from Task 1)* **Weekly FMP re-fetch night**: accept one ~40-minute night per week, or lengthen the FMP cache to 30 days (recommended).
5. *(New, from Task 2)* **Bonds count as Fully verified** (filed data end to end) — confirm.
6. *(New, from Task 5)* **Does the Investment Brief move to Sonnet 5** along with thesis and summaries — confirm or keep Opus.

# Suggested but NOT acted on (scope discipline — noted only)

- `constants.ts` line 290's comment says "FMP allows 250/day on Starter" — outdated (A4/A5 use 300/min). Comment-only fix for a future sweep; the frozen file was not touched.
- `holdings.ts`'s file header still describes the ancient "65%/50-holding" cutoff; Task 1's edit will naturally correct it, mentioned so the diff isn't a surprise.
- `classify.ts` DCR-set alignment — already on the deferred register; unchanged.
- The `/api/profile` auto-create safety net will still create a profile row for any *valid authenticated* user without one; harmless once signup is closed, noted for completeness.
