# B-Series — FundLens Reference Tier (HR Edition)
## Ratified July 27, 2026 — Robert (final authority), planned by Fabio, built by Clyde

Base: `main` (production). v8 remains untouched and separate; Robert + Fabio finish it later.

---

## 1. Scope & Rulings of Record

1. **Build on `main`.** No second branch, no second Railway service, no second database.
   Production continuity preserved; the v7 surfaces on main carry the A0 fixes
   (donut honesty, heartbeat, fund #23) that `v7-stable` predates.
2. **Two account tiers, server-enforced.** `user_profiles.access_tier`:
   `'reference'` (default for every new signup) | `'full'` (Robert + explicit opt-ins,
   flipped by Robert only). `is_admin` continues to exist unchanged on top of tiers.
   Reference accounts can never receive: composite scores, tiers/badges, z-scores,
   factor scores, allocation output, Briefs, thesis/sector-outlook content, weighting
   or risk controls, or any generated verdict. Rankings by cost/momentum exist only
   as user-driven sorting of factual columns — the server always returns alphabetical.
3. **Signup restricted to the company email domain**, enforced in our server API layer
   (not Supabase config, not the client), with an `access_exceptions` allowlist table —
   empty at launch, rows added by Robert only.
4. **HR link = second domain alias on the same service.** The alias is packaging;
   the account tier is the enforcement. HR materials only ever carry the alias.
5. **Zero AI-generated text in the reference tier at launch.** The neutral summary
   system is built flag-OFF (B7): batch-generated, Robert-reviewed, served as static
   copy, regenerated only on Robert's explicit click — never by the nightly pipeline.

## 2. Standing Laws for this Series

- **v8 Protection Law.** No B-series assignment lists any of these as a deliverable,
  and Clyde never edits them: `src/engine/regime*`, `src/engine/race*`,
  `src/engine/race-boot*`, `src/engine/french*`, `src/engine/contenders/`.
  Two shared files — `src/engine/cron.ts` and `src/engine/types.ts` — may be edited
  only with a mandatory pre-merge diff review (Fabio) confirming v8 sections are
  byte-untouched.
- **Existing laws remain in force**: Evidence Gate (read all files → state findings →
  confirm → write), one file per commit, all Supabase access via `supaFetch()`,
  no `localStorage` in engine files, sequential Claude calls with 1.2s delays,
  `TINNGO_KEY` typo stays, `CLAUDE_MODEL` lives in `constants.js`.
- **Allowlist principle.** Anything a reference account receives must be explicitly
  enumerated in `src/engine/reference-shape.ts`. Nothing reaches the reference tier
  by omission. This file is the single artifact shown to HR/legal.
- **New-files-over-forks.** Reference UI is a new page set. Existing full-tier pages
  (`YourBrief`, `Research`, `FundLens`, `Settings`, `SetupWizard`, `FundDetail`,
  `AppShell`) are not edited except where an assignment names them explicitly.

## 3. Assignment Sequence

Order is strict: B1 → B2 → B3 → B4 → B5 → B6 → (B7 any time after B2) → B8.
One assignment per Clyde session. STOP verifications after B2, B6, B8.

---

### B1 — Migration: tiers, exceptions, example allocations
**Robert executes SQL. No code deploy. Must run before B2 merges.**

Deliverable: `migrations/b1_access_tier_example_allocations.sql`, containing:

1. `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL
   DEFAULT 'reference' CHECK (access_tier IN ('reference','full'));` + COMMENT.
2. `UPDATE user_profiles SET access_tier = 'full' WHERE email = '<Robert's email>';`
3. `access_exceptions` table: `email TEXT PRIMARY KEY`, `note TEXT`,
   `added_at TIMESTAMPTZ DEFAULT now()`. RLS enabled, no anon policies
   (service-role access only). Purpose comment: non-company-domain plan
   participants (e.g., former employees with balances).
4. `example_allocations` table: `id UUID PK DEFAULT gen_random_uuid()`,
   `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE`,
   `allocations JSONB NOT NULL` (array of `{fund_id, pct}`),
   `created_at` / `updated_at TIMESTAMPTZ DEFAULT now()`.
   RLS enabled; policies patterned exactly on
   `migrations/session9_continuous_risk_and_alloc_history.sql`
   ("users read own" via `auth.uid() = user_id`; writes via service role).

Acceptance (Robert runs the verify queries at the bottom of the file):
- Exactly one `access_tier = 'full'` row (Robert's).
- Both new tables exist with `rls_enabled = true`.

---

### B2 — Server enforcement: serializer, tier middleware, domain gate, guards
**The load-bearing assignment. STOP S-B2 verification follows.**

Clyde context files: `src/routes/routes.ts`, `src/engine/auth.ts`,
`src/engine/types.ts`, `src/engine/constants.ts`, `src/engine/dossier.ts`,
`src/engine/fund-summaries.ts`, `migrations/b1_...sql`, this plan.

Evidence Gate first act (findings stated before any write):
- Enumerate the exact keys inside `fund_scores.factor_details` from a live
  production row (read-only), and identify which carry pure facts
  (sector exposure, top holdings, raw trailing returns, fallback counts)
  vs. verdicts/scores.
- Confirm where per-fund AI summaries are stored today (column/table),
  for B7's benefit.
- Confirm the join path for the latest `fund_dossiers` grade per fund.

Commits (one file each):
1. **`src/engine/reference-shape.ts` (new).** Exports
   `shapeFundForReference(fund, score, dossier)` and
   `REFERENCE_ALLOWLIST` (the enumerated fields). Included: ticker, name,
   expense_ratio, holdings (name/ticker/pct/sector), sector exposure,
   raw trailing return figures, holdings count, HHI inputs, dossier coverage
   (resolved %, classified %, pass), as-of dates (EDGAR report_date, NAV date,
   scored_at). Excluded forever: `composite_default`, `tier`, `tier_color`,
   all `z_*`, the four factor scores, and any evaluative string.
   Output array is sorted alphabetically by ticker. Reference summaries field
   exists but is emitted only when `REFERENCE_SUMMARIES_ENABLED` (B7) is true.
2. **`src/engine/auth.ts`.** `AuthenticatedRequest` gains `accessTier`.
   Tier resolved per request with a cache mirroring `adminCache`/TTL pattern.
   Domain gate: on profile fetch/auto-create, if the account email's domain is
   not in `ALLOWED_SIGNUP_DOMAINS` (constants) and the email is not in
   `access_exceptions`, respond 403 `{ error: 'Access restricted' }` — the
   Supabase auth user may exist, but no API route ever serves it.
3. **`src/routes/routes.ts`.**
   - New `requireFullTier` middleware (403 for reference), applied to:
     `/api/briefs`, `/api/briefs/:id`, `POST /api/briefs/generate`,
     `/api/thesis/latest`.
   - `PUT /api/profile`: for reference accounts, strip/reject `weight_*` and
     `risk_tolerance` (allow `display_name`).
   - Reference accounts skip the wizard: profile auto-create sets
     `setup_completed = true` for reference tier (SetupWizard is never edited
     and never shown to them — pairs with B3 routing).
   - `GET /api/scores` and `GET /api/scores/:ticker`: when tier is reference,
     responses pass through `shapeFundForReference` (including dossier grade);
     full-tier responses are byte-identical to today.

Acceptance (Fabio verifies at STOP S-B2):
- Reference JWT: 403 on all four full-tier routes; weight/risk write rejected.
- Reference `/api/scores` body contains zero occurrences of `composite`,
  `tier`, `z_`, and is alphabetically ordered; every emitted key ∈ allowlist.
- Full-tier `/api/scores` response diffed pre/post-merge: identical.
- Non-domain, non-exception account: 403 on every route.
- Brief scheduler (`brief-scheduler.ts`) confirmed to select only accounts
  that would pass `requireFullTier` (read-check; fix in-scope if not).

---

### B3 — Client: tier routing, reference shell, Funds grid, Help, footer

Clyde context files: `client/src/App.tsx`, `client/src/api.ts`,
`client/src/components/AppShell.tsx` (read-only reference),
`client/src/pages/FundLens.tsx` (read-only reference), `client/src/theme.ts`.

Commits:
1. `client/src/api.ts` — `UserProfile` type gains `access_tier`; new reference
   payload types. (Type additions only; no behavior change for full tier.)
2. `client/src/components/ReferenceFooter.tsx` (new) — the ratified
   educational/not-advice boilerplate, mounted on every reference page.
   Final legal copy supplied/approved by Robert; placeholder text until then.
3. `client/src/components/ReferenceShell.tsx` (new) — header + tabs:
   **Funds | My Mix | Help**. No Refresh Analysis, no source badge, no
   pipeline polling.
4. `client/src/pages/reference/Funds.tsx` (new) — the sortable grid.
   Columns: Ticker, Name, Expense ratio (also as ~$/yr per $10,000 —
   Main Street register), 1Y return (raw figure), Top holding, # holdings,
   Concentration (HHI label via `utils/hhi.ts`), Data as-of.
   Default order alphabetical; any column sortable both directions by click;
   no default ranking, no colors implying good/bad.
5. `client/src/pages/reference/Help.tsx` (new) — FAQ-only. Reuses the FAQ
   content from the existing Help page; **no chat UI, no `/api/help/chat`
   calls**. Adds plain-language glossary entries (expense ratio,
   diversification, index vs. active, concentration).
6. `client/src/App.tsx` — tier fork: reference accounts route into
   ReferenceShell (index = Funds); any full-tier path (`/`, `/research`,
   `/fundlens`, `/settings`, `/pipeline`, `/setup`) redirects reference
   users to reference home. Full-tier routing unchanged.

Acceptance: reference account sees only the three tabs; deep links to full
pages redirect; full-tier UI pixel-identical (Robert eyeball + Fabio diff).

---

### B4 — Reference fund detail

Clyde context files: `client/src/components/FundDetail.tsx` (read-only
reference), `client/src/components/DonutChart.tsx`, B2's reference payload.

Commit: `client/src/pages/reference/FundDetail.tsx` (new; inline expansion
from the Funds grid).
- Tabs: **Holdings | Sectors** only. No Overview tab, no factor bars,
  no tier badge, no summary text (until B7 flips).
- Provenance block on both tabs: "Holdings from SEC EDGAR N-PORT filing dated
  {report_date}. Prices as of {NAV date}. Data coverage: {resolved}% of assets
  identified, {classified}% sector-classified." (dossier fields from B2).
- Money-market special case (FDRXX, ADAXX): no holdings report exists;
  render the identity/expenses/NAV card with a one-line explanation instead
  of an empty table.
- `DonutChart` may be imported as-is (shared presentational component;
  not edited).

Acceptance: renders correctly for all 23 funds including both money markets;
no evaluative word or color coding anywhere in the reference detail.

---

### B5 — Example Mix: endpoints + composite math

Clyde context files: `src/routes/routes.ts`, `migrations/b1_...sql`,
`client/src/engine/allocation.ts` (pattern reference only — NOT reused),
`client/src/utils/hhi.ts`.

Commits:
1. `src/routes/routes.ts` — three endpoints, all `requireAuth` (both tiers
   may use them; it's their own data):
   - `GET /api/example-allocation` → the caller's saved mix or 404.
   - `PUT /api/example-allocation` → validates: every `fund_id` ∈ active
     funds; pcts numeric, ≥ 0, one-decimal max; sum = 100 ± 0.05. Upserts
     the caller's single row. Never touched by pipeline or Briefs.
   - `DELETE /api/example-allocation` → removes the caller's row
     (the delete-my-data ruling).
2. `client/src/engine/example-mix.ts` (new, pure functions, no API calls):
   given the reference funds payload + a `{fund_id → pct}` map, computes
   blended expense ratio (% and $/yr per $10,000), weighted look-through
   sector exposure, aggregated top holdings across funds with **overlap
   detection** (same ticker in 2+ chosen funds, combined weight), and HHI
   of the combined exposure. No recommendations, no target comparisons,
   no scoring of the mix.

Acceptance: hand-computed 3-fund mix matches engine output to rounding;
sum-validation rejections verified; user A cannot read/write user B's mix
(server scopes by JWT userId).

---

### B6 — My Mix UI

Clyde context files: B5 engine, `client/src/pages/reference/Funds.tsx`,
`ReferenceFooter.tsx`.

Commit: `client/src/pages/reference/MyMix.tsx` (new).
- Percent input per plan fund, **starting blank** (no prefill of any kind —
  ratified), live running total with "must equal 100%" state.
- Composite panel from `example-mix.ts`: blended cost (%, and $/yr per
  $10,000), mix sector donut, aggregate top holdings, overlap list, HHI label.
- **Save** (explicit click only — nothing persists otherwise) and
  **Delete my saved mix** buttons. Copy states plainly: informational
  example only; stored for your own reference; used for nothing else.
- The app never comments on, grades, or compares the mix.

Acceptance: blank on first visit; unsaved edits vanish on refresh; saved mix
restores; delete clears; footer present. **STOP S-B6** — feature-complete
reference product; Fabio full-pass verification before B7/B8.

---

### B7 — Neutral reference summaries (flag OFF)

Clyde context files: `src/engine/fund-summaries.ts`,
`src/prompts/editorial-policy.md` (contrast only), B2 evidence on summary
storage, `src/engine/constants.ts`, `src/routes/routes.ts`,
`src/engine/reference-shape.ts`.

Commits:
1. Migration `b7_reference_summaries.sql` — storage for `summary_reference`
   (+ `reference_summary_generated_at`), at the location B2's evidence
   confirmed.
2. `src/engine/fund-summaries.ts` — second generation mode with a **neutral
   register prompt**: describe, never evaluate. States only names, numbers,
   category, and what the fund holds. Banned vocabulary enforced in-prompt
   and post-checked in code: cheap, expensive, strong, weak, good, bad,
   best, worst, attractive, opportunity, avoid, top, laggard, winner,
   should, recommend (and inflections).
3. `src/routes/routes.ts` — `POST /api/reference-summaries/generate`,
   `requireAuth + requireAdmin`, batch-generates all funds for Robert's
   review. **The nightly pipeline never writes `summary_reference`.**
4. `src/engine/reference-shape.ts` — emit `summary_reference` only when
   `REFERENCE_SUMMARIES_ENABLED = true` in constants. **Ships `false`.**

Acceptance: flag false → key absent from reference payload; nightly pipeline
run leaves `summary_reference` untouched; admin click regenerates all 23;
post-check rejects any summary containing banned vocabulary.
Launch posture: flag stays OFF until HR sign-off; Robert reviews the full
generated set first (it doubles as the phase-2 exhibit in the HR pitch).

---

### B8 — Hardening, packaging, launch

Clyde context files: `src/routes/routes.ts`, `src/server.ts`,
`client/src/components/AppShell.tsx`, `client/src/components/PipelineOverlay.tsx`.

Commits:
1. `client/src/components/AppShell.tsx` — replace the `sendBeacon` abort call
   with `fetch(..., { keepalive: true })` carrying the Authorization header.
   (Named-file exception to the no-edit rule; v8-shared sections untouched.)
2. `src/routes/routes.ts` —
   - `POST /api/pipeline/abort`: now `requireAuth + requireAdmin`
     (only admins run pipelines; the anonymous hole closes).
   - `GET /api/pipeline/status`: admin gets today's payload; non-admin
     full-tier gets shaped `{ status, completedAt }` only (badge keeps
     working, run IDs stop leaking); reference tier: 403 (their shell
     never calls it).
3. `src/server.ts` — add the reference domain alias to the production CORS
   origin list.
4. RLS policy audit (read-only, Fabio + Clyde): list actual policies on
   `user_profiles`, `investment_briefs`, `example_allocations`,
   `allocation_history`; confirm user-scoping; report findings; fixes (if
   any) authorized by Robert as SQL.

Robert's actions: Railway domain click for the alias; final footer/legal
copy approval; flip chosen coworkers to `full` (SQL); launch checklist:
non-domain signup rejected, fresh domain signup lands on reference Funds
page, tier-flip procedure documented, HR demo walk-through.

**STOP S-B8 — launch gate.** Fabio re-runs the full S-B2 + S-B6 acceptance
suites against production before the HR link goes anywhere.

---

## 4. What HR/Legal Sees (the packaging summary)

One reviewable file defines everything a reference account can receive
(`reference-shape.ts`). Zero generated text at launch. No recommendation,
ranking-by-default, or verdict reachable by any reference account, enforced
at the API. Company-domain-only access. Public-source provenance and data
coverage disclosed on every fund. Employee example mixes: self-authored,
explicitly saved, private, deletable. Disclaimer on every page.
