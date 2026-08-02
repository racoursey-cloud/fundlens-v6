# H1-F1 ADDENDUM — CINS Country Fallback (f4) + f3 Delivery
## Status: RATIFIED under the Findings law (blocking, in-slice) — August 2, 2026 · planned by Fabio · to be built by Clyde on the same branch

Trigger: Fabio's independent review of the pushed f1/f2, August 2. f1 and f2 verified
correct as built (proof: CICHF class passes, all seven currency-line codes reject,
ASMH/HONGBP/TVS-bond/TITUSD cache rows verdict stale, Vanguard fund row does not).
One gap, proven by proof-case failure: **the four venue-suffix rows escape f2** —
DGE.PA (G42089113), BAY.WA (D0712D163), BMW.SW (D12096109), REN.AS (G7493L105) are
keyed by raw CINS, `isinCountry()` reads only "ISIN:" keys, so homeCountry comes back
null and the venue-contradiction check cannot judge. They would survive the next
refresh. The fresh CUSIP-batch paths share the blind spot where no ISIN is mapped.

## Build order (one file per commit, on claude/new-session-03feap)

- **f4a** — this addendum, committed verbatim.

- **f4** `src/engine/cusip.ts` — `cinsCountry(id)`: the first character of a CINS is a
  country/region code. Map the single-country letters only:
  A=AT, B=BE, C=CA, D=DE, E=ES, F=FR, G=GB, H=CH, J=JP, K=DK, L=LU, N=NL, Q=AU,
  R=NO, S=ZA, T=IT, W=SE. Regional letters (M Mideast, P S.America, U US-other,
  V Africa-other, X Europe-other, Y Asia) return null — a region is not a country,
  and null keeps the guard honest (cannot judge → passes; the Y-keyed Asian lines
  are OTC F-codes anyway). Digit-leading (domestic US/CA CUSIP) → null.
  Wire as fallback everywhere homeCountry is derived: `cachedResolutionIsStale`
  (raw-CINS keys), the OpenFIGI CUSIP-batch path (`isinMap` miss → cinsCountry),
  and the ISIN-pair merge path. isinCountry stays first where an ISIN exists.

- **f3 (delivery)** — the f3 ordered by H1-F1 is NOT on the branch: the proof
  additions were run in-session but never committed, while the briefing described
  the 49-case proof as part of the wave. Per house practice the proof must live in
  the record: commit the standalone proof file (all cases, H1 + H1-F1 + f4 — the
  four venue-suffix staleness cases turn PASS with f4), or disclose on the PR why
  it stays session-local. Fabio's independent proof is on the session record either
  way; the order's letter says commit.

## Record-keeping item for Robert (no build action)

PR #67 was merged (main d492e4b) BEFORE the H1-F1 push — f0/f1/f2 sit on the branch
past the merge point and are NOT in main. Clyde's "review and merge PR #67" cannot be
executed twice: open a NEW PR from `claude/new-session-03feap` (it is exactly f0–f2
plus this addendum's commits ahead of main) and merge that. **No Refresh Analysis
until the new PR merges** — a refresh now would churn against the un-cured cache.

## Verification (Fabio, post-merge + refresh)

The four venue-suffix cache rows verdict stale in the committed proof; post-refresh
sweeps show zero rows from the known-bad list (now thirteen named tickers), CICHF
class intact at 5 chars, ASML=ASMLF in VFWAX and VWIGX. Then the 23-fund sheets.

*— Drafted by Fabio, August 2, 2026, from review findings of the same hour.
Fabio, for the record.*
