FABIO'S RATIFIED B4 ASSIGNMENT — REFERENCE FUND DETAIL, CHART-FORWARD (ratified by Robert, July 28, 2026)

Scope: ONE pull request, client files only — no server files, no SQL, no v8-protected files. Verdict surfaces (scores, tiers, thesis, Briefs) appear nowhere in reference detail. Colors and charts show what a fund IS, never whether it's good.

Plan of record: B_REFERENCE_TIER_PLAN.md §B4. This assignment extends it with Robert's rulings and the July 28 data findings.

EVIDENCE GATE — read, report, then WAIT for Robert's confirm before any write:
1. Read plan §B4; the B3 reference grid page and reference api types files; client/src/components/FundDetail.tsx and DonutChart.tsx (full-tier, READ-ONLY reference — never edited); src/reference-shape.ts and the detail route in src/routes.ts (READ-ONLY — server files are out of scope; you read them only to learn the payload).
2. Report the exact reference detail payload: every field on fund and holdings rows — specifically whether report_date, a NAV/price date, the dossier coverage percentages, and any money-market flag survive the allowlist.
3. Report DonutChart's props and palette (import-as-is contract), and the grid file's current structure: the dollar column, the concentration cell, the as-of cell, row click behavior.
4. Propose the single home file for two shared reference constants (money-market tickers; sweep-vehicle names — no list duplicated across files) and the component structure for inline row expansion. Then stop for confirm.

THE WAVE — one-file commits in this order (exact paths confirmed at the gate):

c0 — commit FUNDLENS_B4_BUILD_HANDOFF.md to the repo root, content EXACTLY as between the BEGIN and END marker lines at the bottom of this paste — byte-for-byte, markers excluded. The file contains zero markdown links; if any line arrives mangled, reconstruct it from structure. Acceptance: grep -F '](' on the committed file returns nothing.

c1 — shared reference constants, one file:
  MONEY_MARKET_TICKERS: ADAXX, FDRXX (used only if the payload ships no money-market flag — gate decides which mechanism).
  CASH_SWEEP_HOLDING_NAMES — thirteen exact strings from Fabio's July 28 database enumeration, matched case-insensitively on the FULL name, never on substrings:
    BlackRock Liquidity Funds
    State Street Institutional US Government Money Market Fund
    Dreyfus Institutional Preferred Government Plus Money Market Fund
    Dreyfus Institutional Preferred Money Market Funds
    TCW Central Cash Fund
    Invesco Private Prime Fund
    UMB Money Market Special II
    Capital Group Central Cash Fund
    Morgan Stanley Invst Mgt Inc - Morgan Stanley Instl Liquidity Fund - Govt Prtflo
    Fidelity Institutional Money Market Funds - Government Portfolio
    Dreyfus Cash Management Funds - Dreyfus Treasury and Agency Cash Management
    US Government Money Market Fund
    Vanguard Cmt Funds-Vanguard Market Liquidity Fund
  The file comment must cite the enumeration date and the rule: exact full-name match only; pattern matching is FORBIDDEN — FirstCash Holdings Inc, Metcash Ltd, and Lancashire Holdings Ltd are real portfolio companies whose names contain the letters c-a-s-h.

c2 — client/src/pages/reference/FundDetail.tsx (new), the inline expansion:
  - Opens beneath its grid row on click or tap; second click closes it.
  - Identity strip on every fund: name, ticker, expense in both registers — e.g. "0.23% (≈ $23 per year per $10,000 invested)". This is the dollar register's new home per Robert's grid-density ruling.
  - Tabs: Holdings | Sectors. Nothing else — no Overview, no factor bars, no tier badge, no summary text (B7 flips that later).
  - HOLDINGS tab: table of the served holdings (name, ticker, %, sector) in served order. Names equal to 'N/A' render as an em-dash (F4 — seven funds carry them, including a 6.52% CEMEX row). Rows whose full name matches CASH_SWEEP_HOLDING_NAMES get a muted inline tag reading "cash reserves" (F3, ruled). The data itself is untouched.
  - SECTORS tab: DonutChart imported as-is, full color, with a sector/percent legend. Categorical colors only.
  - Provenance block on both tabs, only when report_date is present: "Holdings from SEC EDGAR N-PORT filing dated {report_date}. Prices as of {NAV date}. Data coverage: {resolved}% of assets identified, {classified}% sector-classified." Drop gracefully any field the payload doesn't ship — never invent one.
  - MONEY-MARKET special case (ADAXX, FDRXX): no tabs — the identity strip plus one line: "Money market funds hold cash-equivalent instruments; there is no portfolio holdings report to show."
  - EMPTY-HOLDINGS state (FSPGX today, any gap tomorrow): tabs replaced by one honest line: "Holdings data isn't available for this fund yet." Never a fabricated date, never a blank pane. The FSPGX server-side root cause is on the docket and is NOT part of this wave.

c3 — reference grid amendments, one file:
  - Remove the ~$/yr per $10,000 column entirely (Robert's density ruling).
  - The expense % cell gains a native browser title tooltip: "≈ $X per year per $10,000 invested" — no tooltip library, no JS.
  - Concentration cell for money-market funds renders the words "Money market", muted, instead of any HHI label (F1 — "Highly Concentrated" must never render for a money market).
  - As-of cell: when report_date is null, render an em-dash and DELETE the scored_at fallback (F2 — the three affected funds are the emptiest, not the freshest).
  - Wire the row click to the FundDetail expansion.

VERIFY at head, then PR: tsc --noEmit clean; npm run build clean; residual grep proving the removed dollar-column strings are gone (report the exact strings and their zero-match output); the c0 link grep. Report — for Robert's live battery, don't perform it — the acceptance list: all 23 funds open; ADAXX/FDRXX show the money-market card; FSPGX shows the honest empty line; VADFX shows Invesco Private Prime Fund tagged "cash reserves" at 2.26% and MWTSX shows TCW Central Cash Fund tagged at 13.66%; FirstCash, Metcash, and Lancashire rows are never tagged; the CEMEX 6.52% row shows an em-dash name; no evaluative word or color anywhere in reference detail. Then report the head SHA and stop. Fabio reviews pre-merge; Robert merges.

AMENDMENTS AT GATE — July 28, 2026

2. THIRD CONSTANT: approved. c1 carries REFERENCE_SECTOR_COLORS, values copied verbatim from the full-tier map, comment citing the source file and the FOLLOWUPS unification plan; any sector missing from the map renders the house #71717a gray and legends as "Other".

3. FSPGX TRIGGER: your recommendation is ruled in. The honest empty state fires when holdings are absent OR when a non-money-market fund's as_of.report_date is null. FSPGX's undated, gate-failed rows stay hidden until the pipeline repair lands. The acceptance line now reads: "FSPGX shows the honest empty line via the null-report-date trigger." This holds whichever way the route behaves, so it is robust by construction.

Build facts now binding: the Sectors donut renders the payload's sector_exposure map, never a recomputation from the top-50 rows; the provenance "Prices as of" field is as_of.priced_as_of; c3's dollar removal means fmtExpense renders percent only and the dollars move to the native title tooltip — your residual grep targets the old combined-format fragment ("/yr per $10,000").
