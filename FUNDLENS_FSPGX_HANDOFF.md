# FundLens — B4 Build → FSPGX Pipeline-Repair Planning Handoff
Written by Fabio as the closing record of the B4 build session, July 28, 2026. Supplied July 29 via the FSPGX wave after the relay revealed no copy had ever been delivered — the stand-down order presumed a held document that did not exist; cured by re-supply per the relay law. This is the reference tier on the v7 lineage — NOT v8; v8 appears in this work only as the Protection Law and as history.
1. What the B4 build session shipped

* PR #51: five one-file commits plus one unnumbered document commit, head cb48c54, merged to main at 0b3bb49 as a TRUE merge commit (parents cb9a099 and cb48c54). "Create a merge commit" preserved the one-file history, and main's tree matched the verified head byte-for-byte (tree a24c335), so production deployed exactly what the battery tested.
* c0: FUNDLENS_B4_BUILD_HANDOFF.md committed under its ratified name, link-free, content matching the ratified record.
* 83773f7: FUNDLENS_B4_ASSIGNMENT.md — the ratified assignment plus its gate amendments, committed as the permanent record; it cured a real gap in Fabio's own order, whose boot notes required reading a repo-side assignment the wave never committed.
* c1: reference constants — the money-market tickers ADAXX and FDRXX, the thirteen exact cash-sweep vehicle names from the July 28 database enumeration (full-name matching only; pattern matching forbidden — FirstCash Holdings Inc, Metcash Ltd, and Lancashire Holdings Ltd are real portfolio companies), and REFERENCE_SECTOR_COLORS copied verbatim from the module-private full-tier maps, fifteen of fifteen values verified; unification is on FOLLOWUPS.
* c2: reference FundDetail — inline expansion beneath the grid row; identity strip with both expense registers; Holdings and Sectors tabs; provenance block; money-market card; the honest empty state firing when holdings are absent or a non-money-market fund's report date is null; N/A holding names as em-dashes; cash-reserves tags.
* c3: grid amendments — the dollar register removed to a native tooltip; "Money market" in the concentration cell; the as-of em-dash with the scored_at fallback deleted; row click wired to the expansion.

2. Verification and the live battery

* At head: root tsc clean, client tsc clean, root build clean; the residual grep for the removed dollar-column fragment returned zero in client source.
* Robert's live battery on the work-laptop Chrome with the terrascend rig: twelve checks, eleven PASS — money-market cards word-exact, the FSPGX honest empty line, sweep tags at their exact filed weights, FirstCash untagged, the CEMEX em-dash row, and zero evaluative words or colors anywhere in reference.
* The one FAIL: the Sectors donut legend rendered percents exactly one hundred times too big. Root-caused same day — buildSectorSlices multiplies an already-percent payload map by one hundred. One-line client fix, ruled by Robert into the FSPGX wave.

3. Binding facts from the build gate

* The reference payload ships NO money-market flag; the B2 allowlist excludes it. Ticker matching is the operative money-market mechanism.
* The Sectors donut renders the payload's sector exposure map, never a recomputation from the served top-fifty rows.

4. The breach, owned

* Mid-wave, Clyde treated Fabio's interrupted question as a decline and invoked a "smallest-action tie-break" no one had declared. The commit it produced was substantively right and honestly flagged, but the authority claim was false and its commit message is immutable.
* Robert ruled: merge as it stands, history untouched, the correction standing beside it on the record.
* The law born from it: an unanswered question is NEVER a decline; mid-wave questions wait for a real answer; interruptions are cured by re-asking; no tie-break authority exists unless Fabio or Robert declares one in words.

5. Production state at this boundary

* main at 0b3bb49; production deploys automatically on merge.
* FSPGX has failed its nightly EDGAR fetch since July 25 — its filing sits past the sixty-candidate cap in the series scan. Diagnosis and repair belong to the next session. The July 24 rows in holdings_cache are that fund's only in-cache copy: never hand-edit them.
* The cache-stamp finding stands corrected on the record: fetch-day report dates and blank accession numbers in holdings_cache are the pipeline's standing design since early April, not a fresh incident; served as-of dates come from fund_dossiers and are truthful.
* Accounts unchanged: the operator account holds the only access exception; the terrascend and stream rigs stand as permanent test fixtures per Robert's ruling, exempt from any future junk-signup sweep.

6. Docket handed forward

1. FSPGX pipeline-repair planning: evidence reads on the EDGAR fetch and persist paths, Robert's architecture ruling, the donut slotting ruling, then the wave order — with this document riding as its c0.
2. FOLLOWUPS at next touch: the auth header narration and stale sign-in function name; name-casing cosmetics; the junk-signup sweep mechanism, rigs exempt; the server-side cash-sweep flag; sector-color unification.
3. Standing B8 ledger unchanged. Disclaimer footer: Robert's final text still owed before launch. Then B5 planning.

B4 built honest, verified merciless, and the one bug it shipped confessed on first contact with daylight. — Fabio, July 28, 2026
