# B9 — Reference Enrichment: Official Text, Visuals, Full-List Mix
## Status: RATIFIED — July 31, 2026, by Robert · planned by Fabio · built by Clyde

Base: `main` at `ed782b6808b7caa173a5c561dcb92a3bb4217727` (the post-B8 pin).
**Merge gate for this wave:** nothing merges to main until the August 1 02:00Z
nightly proof lands clean (first nightly on the post-B8 build) AND Robert has
reviewed the PR. The build may proceed to a reviewed PR before the proof.

---

## 1. Rulings of Record (Robert, July 31, 2026 — this session)

1. **The conduit principle** (governing sentence for the whole feature, verbatim):
   *"We never change their data and only help explain it, we are only the
   conduit or vehicle for the info, conveniently gathered in one central app
   for them. We don't direct. We only inform."*
2. **Per-fund description box** with the industry's official section labels,
   exactly as filings carry them: **Investment Objective** and **Principal
   Investment Strategies** — both verbatim from SEC EDGAR — plus
   **Translation**, the only section we author. Grouped box, thin rule lines
   between sections.
3. **Voice-separation convention** (Fabio ruling under delegated authority,
   app-wide in the reference tier): verbatim source material renders as a
   quotation block — upright type, hairline left rule, slight indent, small
   attribution line naming source and date, semantic `<blockquote>`. Our
   voice (translations, explainers) renders in italics with an explicit label
   ("Translation — plain English"). At least two signals always (typography +
   structure/label), never color alone. Long our-voice passages rely on label
   and layout, not walls of italics. Rule of construction: **inside a quote
   block with attribution = untouched source; anything else = ours and says so.**
4. **Box placement:** new **About** tab in the reference fund expansion,
   opening first. Tabs become About | Holdings | Sectors.
5. **Translation shipping posture:** verbatim text goes live when built;
   translations ship **behind a new flag, OFF** (`REFERENCE_TRANSLATIONS_ENABLED`),
   served only after Robert reviews every line and HR signs off. The
   zero-AI-text-at-launch ruling stays intact.
6. **Strategies length:** all of it, word for word — no excerpting (choosing
   sentences is editorial). Long sections open partially with a plain
   "Show the full strategies" expander; collapsing is furniture, the text
   behind it is always complete. Objectives always display in full.
7. **The 110% ruling:** values above 100% that are faithful to filings
   (offsetting positions / leverage) stand as filed; the cure is an explainer,
   never a changed number. Hover text on desktop, tap/footnote on phones.
8. **Shorts in pies:** donuts draw long positions only, with a one-line
   disclosure when short positions exist; tables stay faithful to every row,
   negatives included, with the not-an-error explainer.
9. **Donut pair:** the reference fund view gains a holdings donut beside the
   existing sector donut — "the same two donuts as the engine version."
   UX polish ports from the full tier; the verdict layer (scores, rankings,
   good/bad colors) never does.
10. **My Mix full lists:** the mix aggregates over funds' complete holdings
    lists, not the stored top-ten; the aggregated list is fully scrollable.
11. **Verbatim purity:** the SEC dataset flattening drops typographic
    apostrophes (16 of 23 funds affected). Restore only that punctuation,
    list every restoration (see `B9_RESTORATION_LEDGER.md`, 40 restorations),
    disclose in the seed file header, and Robert verifies each fund's box
    against its linked EDGAR filing.

## 2. Standing Laws (all in force, restated for this wave)

- Evidence Gate: Clyde reads every context file and states findings before
  writing. One file per commit; every commit message cites its task number.
- v8 Protection Law: no B9 file touches `src/engine/regime*`, `race*`,
  `french*`, `contenders/`; `cron.ts` and `types.ts` are not deliverables here.
- Database law: Robert executes all SQL himself in the Supabase SQL Editor
  (migration c1, seed c2), before the PR merges. Committed .sql files must
  byte-match what ran.
- Never touch env names, Claude call patterns (sequential, 1.2s delays), or
  `constants.ts` beyond what this assignment explicitly names (c3 names it).
- Findings law: blocking findings fixed in-slice; cosmetic → FOLLOWUPS.md.
- The nightly pipeline never writes descriptions or translations.

## 3. Evidence of Record (Fabio, July 31 session — verified, not assumed)

- **Sourcing proven for 23 of 23 funds.** SEC Mutual Fund Prospectus
  Risk/Return Summary Data Sets (quarterly XBRL extracts), trailing four
  quarters (2025q3–2026q2): every fund's `ObjectivePrimaryTextBlock` and
  `StrategyNarrativeTextBlock` captured with accession + prospectus date.
  Text lengths: objectives 39–304 chars; strategies 548–5,644 chars
  (shortest VWIGX, longest PRPFX). Nineteen funds resolved via the SEC's own
  ticker map; BPLBX/OIBIX/CEMEX via the app's `TICKER_OVERRIDES` in
  `src/engine/edgar.ts`; ADAXX resolved by EDGAR full-text search to
  **Invesco Government Money Market Fund, series S000000253, CIK 842790**
  (latest 485BPOS accession 0001104659-26-077782, June 25, 2026).
- **ADAXX naming note for Robert (no action unless you say so):** the plan
  menu's display name "Adaptive Money Market Fund" differs from the SEC-filed
  series name above. The About box attribution will show the filed name;
  the grid keeps the menu name. Both are honest; flag raised for awareness.
- **Detail endpoint caps at 50 rows:** `GET /api/scores/:ticker` queries
  `holdings_cache` with `limit: '50'` (routes.ts ~line 343). Funds average
  ~450 holdings. The reference detail table and any full-list math are
  currently top-50 bounded.
- **My Mix aggregates the stored top-ten:** `example-mix.ts` consumes
  `top_holdings` (from `fund_scores.factor_details.topHoldings`), so overlap
  detection today cannot see below each fund's top ten. The results panel has
  no aggregated-holdings section at all (expense, sector donut, overlaps,
  concentration only).
- **Dust render defect (tweak 1):** `MyMix.tsx` lines ~503/509 render
  contributions with `toFixed(1)` and no floor — 0.04% prints "0.0%".
- **Silent negative-drop:** `FundDetail.tsx` `buildSectorSlices` skips
  `pct <= 0` with no disclosure; a sector map that sums past 100 (the
  faithful 110% fixed-income case) would walk DonutChart's cumulative arc
  past 360°. Both cured by ruling 7/8 below.
- **Money-market state bypasses tabs:** reference detail State 1 (ADAXX,
  FDRXX) renders one line and no tabs. B9 gives MM funds the About tab —
  their filed objective/strategies are exactly the description B4 lacked.
- **DonutChart** (`components/DonutChart.tsx`): slices contract is 0–100
  positive; supports `title`, `onSliceClick`, and a `drillData` map that
  opens a per-slice item panel — the drill-in machinery B9 uses as-is.
  Component is shared and already imported by reference pages (precedent:
  B4/B6). `BarBreakdown` also available.
- **Bundle fingerprints will move:** B9 rebuilds the client, so the B6
  fingerprint law is superseded at merge; §8 defines the new pins.

## 4. Database (Robert runs both, in order, before merge)

**c1 — `migrations/b9_fund_descriptions.sql`** (exact file text):

```sql
-- B9 c1 — Official fund descriptions (SEC-filed verbatim text + translation)
CREATE TABLE IF NOT EXISTS fund_descriptions (
  fund_id UUID PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
  objective_text TEXT NOT NULL,
  strategies_text TEXT NOT NULL,
  source_accession TEXT NOT NULL,
  source_series_id TEXT NOT NULL,
  filing_ddate DATE NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  translation_text TEXT,
  translation_generated_at TIMESTAMPTZ,
  translation_model TEXT
);
COMMENT ON TABLE fund_descriptions IS
  'B9: per-fund SEC-filed Investment Objective + Principal Investment Strategies (verbatim; conduit principle) plus the app-authored plain-English translation (flag-gated). Seeded by operator-run SQL; never written by the nightly pipeline.';
ALTER TABLE fund_descriptions ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'fund_descriptions';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'fund_descriptions';  -- expect 0
```

**c2 — `migrations/b9_seed_fund_descriptions.sql`** — produced by Fabio this
session (73.6 KB, 23 INSERT … ON CONFLICT rows, verify queries at bottom;
delivered alongside this order). Header discloses the 40 punctuation
restorations; `B9_RESTORATION_LEDGER.md` (committed with this order) lists
each one. Expected verify results: 23 rows, zero missing, per-fund lengths
matching §3.

## 5. Build order (one file per commit, dependency order)

- **c0** `FUNDLENS_B9_ASSIGNMENT.md` + **c0b** `B9_RESTORATION_LEDGER.md` —
  this order and its ledger, committed verbatim (docs reach the repo only
  through Clyde).
- **c1** `migrations/b9_fund_descriptions.sql` — §4 text, byte-exact.
- **c2** `migrations/b9_seed_fund_descriptions.sql` — the delivered file, byte-exact.
- **c3** `src/engine/constants.ts` — add `export const REFERENCE_TRANSLATIONS_ENABLED = false;`
  (this assignment explicitly authorizes exactly this one addition; nothing
  else in the file moves).
- **c4** `src/engine/translations.ts` (new) — translation generation:
  batch over active funds, input = the fund's stored verbatim text, neutral
  register ("translate the legal language into plain English; explain, never
  evaluate"), B7's banned-vocabulary list enforced in-prompt and post-checked
  in code (rejects write on hit), sequential calls with 1.2s delays,
  writes `translation_text`/`translation_generated_at`/`translation_model`.
- **c5** `src/routes/routes.ts` —
  (a) `GET /api/scores/:ticker` gains `?all=1`: when present, the
  holdings_cache query drops the 50 cap (hard ceiling 1000). Without the
  param, byte-identical behavior for both tiers.
  (b) `POST /api/reference-translations/generate` — `requireAuth +
  requireAdmin`, invokes c4, returns per-fund generated/rejected counts
  (B7 route pattern).
  (c) description join: the scores list payload (and :ticker) attaches each
  fund's `fund_descriptions` row for reference shaping.
- **c6** `src/engine/reference-shape.ts` — emit `description` block
  (objective_text, strategies_text, source_accession, source_series_id,
  filing_ddate) whenever the row exists; emit `translation_text` **only when
  `REFERENCE_TRANSLATIONS_ENABLED` is true**. Full-tier payloads unchanged —
  descriptions are reference-shaped output only this wave (full-tier adoption
  logged as a suggestion, not built).
- **c7** `client/src/api.ts` — types for the description block; `?all=1`
  variants: `fetchReferenceFundDetailFull(ticker)` and reuse for My Mix.
- **c8** `client/src/components/SourceQuote.tsx` (new) — the voice-separation
  primitives: `<SourceQuote>` (semantic blockquote, hairline left rule,
  upright type, attribution line "From the fund's prospectus, filed with the
  SEC — {date}" linking the EDGAR filing) and `<OurVoice label="Translation —
  plain English">` (italic, labeled). One place styles both voices forever.
- **c9** `client/src/pages/reference/FundDetail.tsx` —
  About tab first and default (About | Holdings | Sectors); the description
  box via c8 with rule-line separation and the "Show the full strategies"
  expander (collapsed past ~900 chars); money-market funds now render tabs
  with About (+ their existing no-holdings-report line inside About);
  the donut pair side by side (stacking on mobile): **Holdings** donut (top 8
  positive positions + "Everything else" at true combined weight) beside the
  existing **Sectors** donut; long-only disclosure line whenever any negative
  row exists ("Chart shows long positions; this fund also reports short
  positions — see the holdings table"); sector-donut geometry normalized when
  the map sums past 100 while the legend prints the filed values with the
  110% explainer; sector slice click drills to that sector's holdings
  (DonutChart `drillData`, empty-state message provided); Holdings tab
  fetches `?all=1` (scrollable, count line "Showing all N holdings as
  filed"); negative rows render as filed with the not-an-error explainer;
  header comment updated (B4's "no Overview tab" sentence is superseded by
  this order — cite it).
- **c10** `client/src/engine/example-mix.ts` — optional
  `fullHoldingsByTicker` input: when supplied for a fund, holdings
  aggregation and overlap detection use the complete list (same combined-
  weight math); absent, current top-ten behavior (unit findings comment
  updated).
- **c11** `client/src/pages/reference/MyMix.tsx` — fetch `?all=1` per chosen
  fund (client-cached per session); new "All holdings across the mix" section:
  full aggregated list, ranked by combined weight, scrollable, with a plain
  count line; overlaps computed from full lists; dust floor everywhere a mix
  percentage renders: values below 0.05% print "<0.1%", never "0.0%"; one
  explainer sentence where the full list begins ("Small slivers are normal —
  a fund holds hundreds of positions, and your mix holds a slice of each");
  holdings sections show a loading state until full lists arrive (the cost,
  sector, and concentration panels never wait on them).

Copy for the two explainers (ratify or edit, Robert):
- **Over-100 / shorts:** *"Totals can exceed 100% when a fund uses offsetting
  positions (short sales or leverage). These are the fund's own reported
  numbers — not an error."*
- **Negative row:** *"A negative percentage is a short position, reported by
  the fund itself."*

## 6. Explicitly out of scope (scope discipline)

Full-tier pages and payloads (byte-identical this wave); any evaluative
word, color, ranking, or default sort anywhere reference; SetupWizard;
the 23 B7 draft summaries (superseded in place — locked table untouched,
flag stays false); any runtime SEC fetching (descriptions are seeded data;
refresh is a documented quarterly operator procedure, next due when the
2026q3 dataset publishes in October).

## 7. Robert's actions

1. Ratify this order (or edit anything — the copy in §5, the tab name, all of it).
2. Run c1, then c2, in the SQL Editor; paste the verify outputs.
3. After the nightly proof lands clean and the PR review passes: merge.
4. Post-deploy, at your pace: click the translations generate route from an
   admin session when you're ready to review the 23 translations (they store
   flag-off; nothing serves until you and HR say so).
5. Spot-check About boxes against their linked EDGAR filings (the conduit
   certification — §1 ruling 11).

## 8. STOP S-B9 — acceptance battery (Fabio, against production, post-merge)

1. Pins: health 200 at 6.0.0; the 401-JSON trio unchanged (example-allocation,
   reference-summaries generate, pipeline status); **new bundle fingerprints:**
   `Principal Investment Strategies` ≥ 1, `Show the full strategies` = 1,
   `Everything else` ≥ 1, `coming-soon` = 0; the new translations route
   answers 401 as JSON unauthenticated (deploy fingerprint).
2. About tab renders for all 23 funds including both money markets; three
   spot funds (FXAIX, ADAXX, PRPFX) byte-match the seeded text; attribution
   dates and EDGAR links correct.
3. Translations flag proven off on the serving path (key absent from a
   reference payload); generate route refuses non-admin.
4. Donut pair renders; the short-position fund shows the disclosure line and
   its table shows the negative row as filed; the >100% sector fund renders a
   closed donut with filed values in the legend and the explainer present.
5. My Mix: a three-fund mix's full-list aggregation hand-checked against SQL;
   a below-top-ten overlap provably surfaced (SQL-selected pair); dust rows
   print "<0.1%"; unsaved-edits-vanish and one-row upsert invariants re-held.
6. Tier flip both directions (70s cache wait) with the shaped payload;
   cross-rig isolation probe both directions — live evidence, per the S-B8
   lesson. Full-tier list payload diffed byte-identical pre/post-merge.
7. Battery artifacts cleaned; mix table back to operator-only rows.

## 9. The scoreboard framing

v7 made the data trustworthy; B1–B8 built and gated the reference tier; B9
makes the reference tier *speak* — in the funds' own filed words, with our
voice clearly marked as ours, every number faithful, every oddity explained.
We don't direct. We only inform.

*— Drafted by Fabio, July 31, 2026, for Robert's ratification. Fabio, for the record.*
