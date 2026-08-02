# H1-F2 — Positive Ticker Validation (the Display Policy build)
## Status: RATIFIED — August 2, 2026, by Robert ("Positive validation") · planned by Fabio · to be built by Clyde

Base: `main` at the PR #68 merge. Trigger: S-H1 sweep report of August 2 (in repo with
this order) — three pattern-cure cycles each killed their named tickers and the vendor's
candidate lists served the next junk line (HONGBP→HONGBX, TRI4EUR→TRI4CAD). ~138 rows,
~33 weight-points across 8+ funds, including Medtronic as "0Y6X.L" at 4.54% of MADFX.

## THE RULING OF RECORD (Robert, August 2, 2026)

"The Ticker column shows an identifier a member could type into a quote site and find
the security — or an honest dash." Negative filtering (reject known junk) is replaced by
positive validation (display only what we can affirmatively vouch for):

1. **US listing** where one exists (MDT, not 0Y6X.L).
2. Else the **OTC code** (ASMLF, SSNLF — the house convention).
3. Else the **bare home-market code** where the code's venue matches the security's home
   country — 000660, RELIANCE, and suffixed forms stripped to bare (TVSMOTOR.NS →
   TVSMOTOR; 9433.T → 9433; 2222.SR → 2222). A venue that contradicts the home country
   never displays.
4. **Corporate-bond rows** display the ISSUER's ticker by rules 1–3 (BAC, not BAC.SW) —
   the issuer mapping exists for enrichment already.
5. **Sovereign/government rows** always display a dash. A government has no ticker, and
   an ETF is not a government.
6. Anything that passes none of these: **a dash.** A dash is honest; a wrong or cryptic
   code is not.

## Build shape (Clyde proposes exact commits; one file per commit; Evidence Gate first)

- **v0** — this order + the S-H1 sweep report, committed verbatim.
- **v-core** `src/engine/holdings.ts` — a display-validation pass at the same post-cache
  point as h5 (so it governs every built holding, cached or fresh, forever):
  - tier 'us': shape `^[A-Z]{1,5}([.-][A-Z])?$`; where an FMP profile exists for the
    ticker, h6 name agreement is required (a profile that disagrees = no vouch).
  - tier 'otc': shape `^[A-Z]{4,5}$`; same h6 requirement where a profile exists.
  - tier 'home': strip a venue suffix when its country matches the security's home
    country (ISIN prefix, CINS letter — the f4 machinery); bare result must be
    `^[A-Z0-9]{1,8}$`. Mismatched venue, `.XD`, currency tails, digit-lead Frankfurt
    codes: no vouch → null.
  - Sovereign detection for rule 5: name-pattern heuristic (country-name-only rows,
    REPUBLIC OF / KINGDOM OF / GOVERNMENT / COMMONWEALTH / MINISTRY OF FINANCE, et al.)
    — Clyde verifies the pattern set against the 75 flagged D-class rows and discloses
    coverage on the PR; misses fall through to rule 6's dash anyway (fail-safe).
- **v-proof** — cases added to scripts/h1-guards-proof.ts: every example in the sweep
  report resolves to its ruled display (MDT, BAC, dash for VGB.AX-on-Australia, bare
  TVSMOTOR, 000660 unchanged, ASMLF unchanged), plus no-false-demotion cases (CICHF
  class, SAP.DE→SAP under rule 3, OTEX.TO→OTEX for a Canadian issuer).
- **v-followups** `FOLLOWUPS.md` — pipeline run panel shows no resolution-phase progress
  (today's healthy 20-minute quiet stretch read as a hang and drew a cancel); H2 panel
  keys on validated tickers only (synergy note for the H2 build).

## Scope guards

No DDL. cusip_cache untouched (validation is display-time, post-cache — the cache keeps
raw vendor truth; the member sees the vouched-for view). h3/h4/f2 stay as built — they
still keep junk out of the cache; this pass governs what leaves it. No change to
enrichment plumbing: FMP lookups still key on the resolved ticker even where the
displayed ticker is a dash.

## Sequence after merge

One Refresh Analysis → Fabio's sweeps (target: zero rows in classes A/C/D/F/G; no
regression on the H1/H1-F1 pass list) → **the 23 exhaustive review sheets** → Robert's
fund-by-fund walk → HR. This is the last planned build before the sheets.

*— Drafted by Fabio, August 2, 2026, recording Robert's ruling of the same date.
Fabio, for the record.*
