# H1 — Holdings Display & Resolver Cure Wave
## Status: RATIFIED — August 2, 2026, by Robert ("let's fix the issues you identified") · planned by Fabio · to be built by Clyde

Base: `main` at the PR #66 merge. Source of findings: FUNDLENS_VFWAX_TICKER_AUDIT.md
(August 2, 2026 session; commits with h0). Sequence ruled by Robert: **fix → refresh →
manual review of all 23 funds' holdings lists → then HR.** No manual row edits — every
data cure flows through code so the next refresh applies and preserves it.

## Corrections to the audit, on the record

Two audit findings are RETRACTED before this order:
- "Fundcash reserves" concatenation is NOT a defect. The UI renders a separate muted
  "cash reserves" tag (F3 mechanism, FundDetail.tsx); the run-together text appears only
  when copying page text. No cure.
- "Precious Metals" is NOT an off-taxonomy leak. It is a designed member of the app's
  sector taxonomy (`src/engine/classify.ts` SECTORS). No cure.

## Build order (one file per commit)

- **h0** — this order + the audit file, committed verbatim.

- **h1** `client/src/pages/reference/FundDetail.tsx` — count-line honesty. The reference
  payload already carries `holdings_count` (dossier `holdings_total`, reference-shape.ts:307).
  When `holdings_count > holdings.length`, render:
  `Showing the {holdings.length} largest of {holdings_count} filed holdings` —
  otherwise keep `Showing all {holdings.length} holdings as filed`, verbatim.
  Affected funds today: VFWAX (3,918 filed) and MWTSX (1,512); all others sit under the
  B9 c5(a) 1,000-row ceiling and keep the "all" line.

- **h2** `client/src/pages/reference/MyMix.tsx` — same guard for the mix view: when any
  contributing fund was capped, "Showing all N holdings across the mix" must not say "all".
  Wording: `Showing the N largest holdings across the mix, ranked by combined weight.`
  (unconditional wording swap is acceptable here if plumbing the capped flag is invasive —
  Clyde's call, stated in the PR).

- **h3** `src/engine/cusip.ts` — candidate-ticker sanity gate. Before a resolution is
  accepted (all paths: OpenFIGI by-ID, OpenFIGI search, FMP search fallback), the candidate
  ticker must pass a `isDisplayableTicker()` guard. Reject, and fall through to the next
  candidate (or resolve with null ticker = em-dash display), when the candidate:
  (a) contains whitespace — kills bond-ID strings ("TVSLIN 6 09/01/26");
  (b) ends in a currency-line code `/(USD|EUR|GBP|CHF)$/` on a candidate longer than 4
      chars — kills TRI4EUR, TITUSD, SQNEUR, PLZLUSD;
  (c) carries a venue suffix (`.XD`, `.PA`, `.WA`, `.SW`, `.F`, `.AS`, `.DE`, `.L`, etc.)
      whose venue country contradicts the security's home country — kills DGE.PA (GB),
      BAY.WA (DE), BMW.SW (DE), stale REN.AS; a matching-venue suffix code is allowed only
      when no US/OTC-tier candidate exists.
  Rejects logged one line each (`[cusip] display-guard reject: <ticker> for <name>`).

- **h4** `src/engine/cusip.ts` — wrong-line guard (the ASMH class). When ranking OpenFIGI
  candidates for a filed equity holding (asset_category EC), skip candidates whose FIGI
  securityType/securityType2 marks an ETP/ETF/fund or hedged-receipt line. ASML's ordinary
  shares must resolve to the ordinary/OTC line (ASMLF), never a third-party wrapper product
  (ASMH). Also kills future recurrences, VWIGX included, at refresh.

- **h5** `src/engine/cusip.ts` — same-fund ticker collision guard. After a fund's holdings
  resolve, any ticker held by two different holding names within one fund (TRP: TC Energy
  + Torrent Pharmaceuticals) demotes the lower-weight claimant to null ticker with a log
  line. A null ticker is honest; a wrong one is not. Cross-name collisions against major US
  tickers for home-tier codes (KMB, BHE, 3M) are listed in FOLLOWUPS for a later ruling on
  qualified display (e.g. "KMB · NSE") — NOT cured in this wave.

- **h6** `src/engine/fmp.ts` — wrong-company profile guard. Before consuming an FMP
  profile's sector/industry for a holding (and before any future company panel serves its
  text), require a name-agreement check between the holding name and `profile.companyName`
  (normalized token overlap; exact rule Clyde's, stated in code comment). On mismatch:
  treat the profile as absent, log `[fmp] profile mismatch: <ticker> filed=<name>
  fmp=<companyName>`, and fall through to the existing classification path. Known wrong
  today: FUISF (Fubon → FMP says Fujitsu; sector shows Technology), TGBMF (TCC Group →
  FMP says Taseko Mines). Fubon's sector self-cures at the rebuild after this guard.

- **h7** `FOLLOWUPS.md` — one line each: home-tier US-collision display question (h5);
  OpenFIGI "Samsung Episholdings"/0126Z0-class placeholder lines; garbled vendor names;
  BASA.DE (BASF) venue-code oddity if it survives h3.

## Hard rules honored

No DDL, no migrations, no model constants touched, no env names touched. All cures are
code; data corrects itself at the next holdings refresh. One file per commit; commit
messages cite h-numbers.

## Sequence after merge (Robert's ruling of record)

1. Clyde builds h0–h7 → PR → Robert reviews → merge → deploy.
2. Robert clicks **Refresh Analysis** (or the nightly picks it up).
3. Fabio re-runs the audit sweeps read-only against the rebuilt tables and posts results:
   zero whitespace/currency-code tickers; zero same-fund ticker collisions; ASML=ASMLF in
   VFWAX and VWIGX; Fubon sector=Financials; FUISF/TGBMF profile-mismatch log lines present.
4. **Manual review, all 23 funds:** Robert (with Fabio driving queries on his word) walks
   each fund's holdings list top-to-bottom in the app. Fabio prepares one review sheet per
   fund: top-50 rows with name/ticker/%/sector plus every row the sweeps flag. Findings
   sort under the Findings law (blocking → fixed before HR; cosmetic → FOLLOWUPS).
5. Only after 23/23 pass: HR sees the feature (ruling 7 posture — their call, their timetable).

## Verification (S-H1, Fabio, post-refresh)

The SQL sweeps from the August 2 audit, re-run verbatim, plus spot-checks in the live app
at www.fundlens.app (never the bare apex): VFWAX count line, VFWAX/VWIGX ASML rows, VFWAX
Fubon sector, MWTSX count line, one Thai /F row (convention preserved — those are real).

*— Drafted by Fabio, August 2, 2026, recording Robert's ruling of the same date.
Fabio, for the record.*
