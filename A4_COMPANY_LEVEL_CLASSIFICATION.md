# Assignment A4 — Company-Level Industry Classification

**Status:** DRAFT — do not start until the precondition below is filled in.
**Depends on:** A3 (Scoring Integrity + Dossier Contract) merged, deployed, and one full pipeline run completed.
**Author of record:** Robert Coursey. Drafted 2026-07-02 from live production evidence (see Appendix).

---

## Precondition — FILLED IN (production run of 2026-07-02, 4:56 PM, post-A3 deploy)

Resolution rates measured as % of *included* NAV resolved (the honest denominator — total-NAV figures in parentheses):

- VFWAX: 49.3% of included NAV resolved (34.0% of total NAV; 400 of 3,918 holdings examined = 69.0% of NAV)
- RNWGX: 48.4% of included NAV resolved (46.0% of total; 355 of 613 holdings = 95.0% of NAV)
- VWIGX: 50.0% of included NAV resolved (47.6% of total; 96 of 128 holdings = 95.1% of NAV)
- QFVRX: 66.3% of included NAV resolved (63.2% of total; 53 of 60 holdings = 95.4% of NAV)

The original tripwire ("STOP if any fund resolves below 50%") is retired as answered: RNWGX and VFWAX sit just below 50%, but the cause is diagnosed, not mysterious — foreign holdings resolving to home-exchange tickers FMP Starter cannot serve, name-search failures, and no ISIN-direct path. Those causes are precisely Tasks 1 and 2 of this assignment. Contrast group: the seven other gate-failing funds resolve 98.9–100% of included NAV — the resolution machinery itself is healthy; the gap is specific to foreign-listed securities.

---

## Why this assignment exists (plain English)

The scoring model's real goal has always been to know **what companies a fund actually owns and whether those companies fit the current market regime.** Today the Positioning factor works at the level of ~11 broad sectors. "Technology" lumps a world-class chipmaker together with a struggling IT reseller — the signal is mushy.

On 2026-07-02 we confirmed by direct test against production FMP credentials (Starter plan) that:

1. **FMP's company profile endpoint returns a fine-grained `industry` field** (100+ categories, e.g. "Internet Content & Information", "Consumer Electronics") alongside the broad `sector`, for any symbol the plan covers.
2. **The Starter plan covers OTC-listed ADRs**, not just NYSE/Nasdaq. Tencent (TCEHY) and even the nearly-dead Samsung ticker (SSNLF, ~200 shares/day volume) both returned full profiles with sector and industry populated.
3. **Home-exchange foreign tickers are a dead end on this plan** (Taiwan, Korea, Hong Kong listings return nothing). The path to foreign-company data runs exclusively through US-listed symbols.

Conclusion locked in: **industry-level classification is achievable with the data we already pay for.** Estimated coverage after this assignment: 85%+ of equity weight in the international funds carries a real FMP industry tag; the remainder is classified by Haiku against the same industry menu.

## What this assignment is NOT

- It does **not** change the Positioning factor's math or the thesis format. Capturing industry data comes first; redesigning the factor that consumes it is a separate future assignment, decided after we see real coverage numbers (see Task 7, report-only).
- It does **not** add any new paid data source. FMP Starter, Tiingo, OpenFIGI (free), and Haiku via the existing proxy — nothing else.

---

## Hard constraints (unchanged from prior assignments)

- Evidence Gate Protocol: read every relevant file completely before writing any code; state findings and a full plan; wait for approval per STOP task.
- One file per commit. Never batch.
- All Claude API calls sequential with 1.2s delays. Never `Promise.all()` for Claude calls.
- All Claude calls through `/api/claude`; all Supabase through `/api/supabase` via `supaFetch()`.
- No `localStorage` in engine files.
- Any migration SQL ships as its own file, one migration per task, with the run order stated in the PR. Robert runs migrations in Supabase BEFORE merging the code that depends on them — the PR must say this explicitly.
- Plain English throughout: Robert is not a developer.

---

## Task 1 — US-symbol-preferred resolution (STOP: full plan + approval before code)

When resolving a holding's identity (built in A3), the resolver must prefer symbols in this order:

1. NYSE/Nasdaq listing or ADR
2. OTC ADR
3. Home-exchange listing (kept as identity only — it cannot be enriched on our plan)

OpenFIGI can return multiple listings for one ISIN; today the pipeline takes whatever comes back. The STOP plan must state exactly where the preference logic goes, how ties are broken, and what is stored when only a home listing exists.

**Confirmed trap to handle:** FMP profiles are inconsistent about which ISIN they carry. Tencent's profile stores the US ADR ISIN; Samsung's stores the Korean home-listing ISIN (`KR7005930003`) — the very identifier that appears in SEC fund filings. Design accordingly (see Task 2).

**Known bad resolutions observed in production 2026-07-02 (use as regression test cases):**
- VFWAX: "Bank of China Ltd" resolved to `601398.SS` — that is Industrial & Commercial Bank of China's ticker, a different bank. Almost certainly a fuzzy name-search match. ISIN-first resolution must fix this.
- VFWAX: "Shell PLC" resolved to `RDSA.L` — a ticker retired in 2022. Stale mapping.
- Multiple holdings resolved to home-exchange tickers FMP Starter cannot serve (`HY9H.F` for SK Hynix, `.T`, `.DE`, `.KS`, `.SW`, `.SR` suffixes throughout) — resolution "succeeding" into a dead end for enrichment.

## Task 2 — Direct ISIN-to-FMP lookup before OpenFIGI (STOP: full plan + approval before code)

Because FMP sometimes stores the home-listing ISIN, a holding's filing ISIN may match an FMP profile **directly**, skipping OpenFIGI entirely. Plan: try FMP's search-by-ISIN first; on miss, fall back to OpenFIGI as A3 built it; on that miss, FMP name search; last resort, synthetic name key (A2.3 pattern). Cache every result under the resolution key — never under a placeholder literal (A3's rule stands).

The STOP plan must include the expected FMP request volume per pipeline run and confirm it fits comfortably inside Starter's rate limit (300 requests/minute) with the existing pacing.

## Task 3 — Harvest and store industry (STOP: full plan + approval before code)

For every holding that resolves to an FMP-covered symbol, capture from the profile already being fetched for the quality factor:

- `industry` (new: fine-grained, ~100+ values)
- `sector` (existing pipeline concept — reconcile FMP's label with ours; the plan must say how conflicts are handled)
- `isAdr`, `exchange`, `averageVolume` (needed by Task 4)

Storage: extend `holdings_cache` (migration) with `industry` and the liquidity fields, or propose better. Dossier (A3 Task 4) gains one metric: % of weight carrying an FMP-sourced industry tag vs Haiku-sourced vs none.

## Task 4 — Liquidity firewall for Momentum (STOP: full plan + approval before code)

Thin OTC tickers are good for classification and poisonous for prices. Samsung's OTC symbol showed average volume of ~11 shares — any price series from it is noise. Rule: a symbol below a liquidity threshold (proposed: average volume < 10,000 — the plan may argue for a different line) contributes **classification data only**. It is excluded from Tiingo momentum fetches, and the Momentum factor's coverage math must account for the exclusion honestly rather than treating missing-as-zero.

The STOP plan must state exactly how Momentum coverage is reported in the Dossier when holdings are firewalled.

## Task 5 — Haiku fallback on the industry menu (no STOP; plan for confirmation)

**Includes the GICS pin (ratified 2026-07-02):** Alphabet and Meta are Communication Services per GICS. The post-wipe run landed there by Haiku's own judgment, but it is unpinned discretion — add the placement explicitly to the classification prompt so it cannot drift on a future run.

For holdings with no FMP-coverable symbol (expected: roughly the smallest 15% of weight — small Indian, Philippine, Vietnamese names, etc.), Haiku classifies as today but against the **same industry list FMP uses**, so the whole dataset speaks one taxonomy. Cache under the A3 keying scheme (name + asset_type). The prompt lists the industry menu explicitly; a response outside the menu is retried once, then falls to "Other" (which the Dossier counts as unclassified, per the A3 decision).

## Task 6 — Dossier v2: resolvable-NAV grading (STOP: full plan + approval before code)

**Root-cause finding (A3 session, 2026-07-02):** the EDGAR parser has silently dropped every no-CUSIP holding since Session 2 — DRRYX's missing 54% of NAV and PRPFX's bullion were never parsed in at all, not parsed-and-set-aside. The v2 work therefore starts at the parser: keep those rows, classify them as structurally unresolvable, then grade against resolvable NAV. Changing the grading formula without fixing the parser would display an honest label on data that still isn't there.

Endorsed 2026-07-02 from the A3 session's proposal. The v1 gate conflates three different facts; v2 separates them into three visible numbers per fund: (1) % of NAV examined (the coverage cutoff's doing), (2) % of examined NAV that is structurally resolvable (excludes derivatives, bullion, cash/repo, and identifier-less holdings, per EDGAR asset-category metadata — Evidence Gate pass against DRRYX's and PRPFX's actual filings required first), (3) % of resolvable NAV resolved — the graded number, threshold 90%. Nothing hidden: the unresolvable slice appears as its own field in the table (Principle 1). Bump DOSSIER_VERSION to 2; one migration; changes confined to dossier.ts, pipeline.ts, and the UI table. Production evidence motivating this: seven funds (VADFX, PRPFX, WFPRX, DRRYX, RTRIX, TGEPX, WEGRX) resolve 98.9–100% of what they examine yet FAIL the v1 gate on denominator artifacts alone — PRPFX's "missing" 34% is its gold and silver bullion, working as designed.

A4's own acceptance criteria are graded against the v2 metric, not v1.

## Task 7 — Report-only: Positioning factor upgrade proposal

No code. In the PR, write the proposal for graduating the Positioning factor from ~11 sectors to industry groups, including: how the monthly thesis prompt changes, how many industry buckets a thesis can honestly hold an opinion on (recommend a two-tier scheme: headline sectors + scored industry groups, ~25–70 buckets, NOT all 100+), what the Editorial Policy needs to say about it, and observed industry-tag coverage per fund from the first post-A4 run. Robert decides whether that becomes A5.

---

## Acceptance criteria

1. One pipeline run completes with no errors and no rate-limit hits.
2. For RNWGX: 80%+ of equity weight carries an industry tag (FMP or Haiku source recorded per holding). Report actuals for all four international funds against the precondition numbers.
3. Tencent-class holdings (OTC ADR) show FMP-sourced industry; Samsung-class holdings show industry present AND momentum excluded by the firewall; home-listing-only holdings show Haiku-sourced industry.
4. No placeholder literal ever appears as a cache key (A3 invariant, re-verified).
5. Dossier shows the new industry-coverage metric per fund.
6. Momentum coverage reporting reflects firewalled holdings honestly.

## Evidence appendix (2026-07-02 tests, Robert's Starter key, browser)

- `TCEHY` (Tencent, OTC ADR): full profile returned. sector "Communication Services", industry "Internet Content & Information", isAdr true, ISIN returned was the **US ADR's** (US88032Q1094), not the Hong Kong listing's.
- `SSNLF` (Samsung, unsponsored OTC): full profile returned despite near-zero liquidity (volume 200, average ~11). sector "Technology", industry "Consumer Electronics", isAdr **false** (note: the flag is not reliable for unsponsored tickers — do not treat isAdr as the sole ADR signal). ISIN returned was the **Korean home listing's** (KR7005930003) — the same identifier class that appears in SEC filings, motivating Task 2.
- Home-exchange test (`2330.TW`) and the poisoned-cache production query are documented in the A3 materials.
