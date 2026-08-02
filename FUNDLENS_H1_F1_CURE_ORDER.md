# H1-F1 — In-Slice Cure: Cache Hygiene + Currency-Tail Amendment
## Status: RATIFIED under the Findings law (blocking, fixed in current slice) — August 2, 2026 · planned by Fabio · to be built by Clyde

Base: PR #67 head (post tokenizer-fold cure). Trigger: S-H1 post-refresh sweep,
August 2, 2026 — partial pass. h5/h6 verified cured in production data (Torrent→dash,
Fubon→Financials, TCC→Materials). h3/h4 did NOT reach production data: `cusip_cache`
short-circuits resolution, so resolutions cached before H1 never re-enter the guarded
paths. Persisting member-visible rows include ASMH (VFWAX 1.43%, VWIGX 3.44%), DGE.PA,
BAY.WA, BMW.SW, REN.AS, TRI4EUR, TITUSD, SQNEUR, PLZLUSD, the TVS bond string
(VFWAX, RNWGX) — plus the same class in the US index funds: HONGBP (FXAIX 0.23%,
VADFX 0.19%), CCL1EUR and APLSUSD (FSPGX).

## Finding 2, owned by Fabio on the record

The h3 currency-tail rule as ordered (`length > 4` + `/(USD|EUR|GBP|CHF)$/`) is WRONG:
it false-flags legitimate 5-letter OTC tickers ending in "CHF" — CICHF (China
Construction Bank; a 3.03% CEMEX row), OVCHF, BACHF, LICHF, UNCHF, WTCHF, NNCHF,
AHCHF, DACHF, BJCHF, MXCHF, YZCHF all live in production and are all correct. Fabio
authored the rule and the proof never tested a legitimate CHF-ender. Every observed
garbage code is ≥6 chars; every observed legitimate collision is exactly 5. The cure
must land BEFORE f2 exposes cached rows to the guard, in the same PR.

## Build order (one file per commit)

- **f0** — this order, committed verbatim.

- **f1** `src/engine/cusip.ts` — currency-tail threshold amendment: the rule in
  `isDisplayableTicker()` becomes `ticker.length >= 6 && /(USD|EUR|GBP|CHF)$/`.
  Comment records the CICHF class by name.

- **f2** `src/engine/cusip.ts` — cache-hygiene re-resolution in `cusipCacheLookup()`:
  a cached row is treated as STALE — returned as a cache miss so the identifier
  re-enters the guarded resolution paths and the fresh result overwrites the cache
  row via the existing `cusipCacheSave()` — when EITHER:
  (a) its ticker fails `isDisplayableTicker(ticker, homeCountry-from-ISIN-where-known)`
      (amended rule; catches TRI4EUR/TITUSD/SQNEUR/PLZLUSD/HONGBP/CCL1EUR/APLSUSD,
      whitespace bond-ID strings on equity lines, and wrong-country venue codes), OR
  (b) its cached NAME carries a wrapper marker — case-insensitive contains
      'ADRHEDGED', or word-boundary 'ETP'/'ETN' — catching the ASMH class, whose
      ticker alone looks clean. Plain 'ETF'/'FUND' names are NOT markers here: real
      fund-of-funds holdings carry those words legitimately (Vanguard Market
      Liquidity Fund); the wrapper penalty h4 already governs fresh ranking.
  One log line per stale row: `[cusip] cache-hygiene re-resolve: <ticker|name> for <id>`.
  Negative-cache rows (resolved=false) are untouched — A6 Task 3 hygiene governs those.

- **f3** — proof additions, same standalone proof file: CICHF/OVCHF/UNCHF/WTCHF pass
  the amended rule; TITUSD/SQNEUR/TRI4EUR/HONGBP/CCL1EUR/APLSUSD/PLZLUSD still reject;
  staleness verdicts for the ASMH cached row (name 'ASML Holding NV ADRhedged' → stale)
  and a legitimate fund row ('Vanguard Market Liquidity Fund' → NOT stale).

## What this order deliberately does not do

No manual row edits (Robert's ruling stands); no cache purge ceremony — staleness
re-resolution IS the no-hands cure, durable against any future stale entry. No change
to h5/h6 (verified working). No negative-cache change.

## Sequence after merge

Merge → **one more Refresh Analysis** (the re-resolutions run inside it; expect extra
OpenFIGI/FMP calls on ~30-40 stale identifiers, well inside rate limits) → Fabio re-runs
S-H1 sweeps with amended criteria (equity-line whitespace only; currency-tail at ≥6;
ASML=ASMLF in VFWAX+VWIGX; known-bad list = zero rows) → 23-fund review sheets → Robert's
walk → HR.

*— Drafted by Fabio, August 2, 2026. Finding 2 is Fabio's error, disclosed the hour it
was found, per house practice. Fabio, for the record.*
