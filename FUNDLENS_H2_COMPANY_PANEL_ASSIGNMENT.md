# H2 — Holding Drill-In: Company Panel (FMP-sourced, attributed)
## Status: RATIFIED — August 2, 2026, by Robert (all three decision points ruled; recorded below) · planned by Fabio · handed to Clyde August 13, 2026, post U1-A verification

Robert's ruling of record (August 2, 2026): the drill-in serves FMP company data in-app —
"We already use FMP within the app, why stop now? We will reference the source, as we do
others in the app." Wikipedia stays as the independent second door. **Gate: H2 builds only
after H1 is merged, the refresh has run, and the 23-fund manual review has passed** — the
h6 wrong-company guard is a hard prerequisite (without it the panel would show Fujitsu's
description under Fubon).

## AMENDMENT — August 13, 2026, by Robert

The **Fallback** bullet under "What the member gets" is amended: **"country" is struck.**
It was never in the reference holdings payload — a drafting error, Fabio's, August 2. The
allowlisted holdings shape carries name, ticker, percent of fund, and sector only, so
there was never a country for the panel to display. The fallback ships the filed name and
sector as already displayed, plus the Wikipedia search link.

Ruled on Clyde's H2 Evidence Gate disclosure (PR #71, disclosure 5) after Clyde declined
to add the field on his own judgment: doing so would have been a B2 allowlist addition to
the holdings payload and would have broken S-H2's own expectation that `/api/scores`
byte-diffs IDENTICAL against the August 13 baseline. **The record is corrected, not the
payload — no allowlist change was made.** Everything else in this assignment stands as
ratified.

## BASE AT HANDOFF (added August 13, 2026)

The gate above was satisfied August 2 (H1 merged at PR #69, refresh run, 23-fund review
passed). Sequencing cleared tonight: U1-A is merged (PR #70), deployed, and VERIFIED —
all six wave-A probe items passed live, including the raw member-payload read (Status
Note v12). The reference pages are now the shared base for both tiers, so the reference
FundDetail is THE fund detail this panel builds into — once, no port, as sequenced.
Two notes for the Evidence Gate: (1) confirm p3's file target — the reference pages
survived U1-A in place, so the path is expected unchanged; (2) the U1 scope guard
("reference-shape.ts untouched") bound the U1 waves only — p2's explicit allowlist
addition is the ratified path under B2 law and does not conflict with it.

## What the member gets

Click any holding row in a fund's Holdings tab → the row expands into a panel:

- **Description** — FMP's company description, verbatim, clearly attributed. Precedent:
  the About tabs serve SEC text verbatim under attribution; same posture, same framing.
- **Facts line** — headquarters (city, country), sector/industry, listing exchange,
  website (external link), IPO date where present. All from the cached profile. No price,
  no market cap, no ratings — nothing that moves or evaluates.
- **Attribution line** — "Company data: Financial Modeling Prep" + "Search Wikipedia ↗"
  (name-based search URL; lands on a search page for obscure names, which is honest).
- **Fallback** — no cached profile (or h6 mismatch): panel shows the filed name and
  sector as already displayed, plus the Wikipedia search link alone. No FMP fetch-on-click
  in v1 — cache-only, so the panel is instant and adds zero vendor load. Coverage as of
  Aug 2: ~2,464 of ~4,400 cached tickers carry profiles, skewed toward exactly the large
  names members will click (Nestlé, Samsung, TSMC, CCB verified present).

## Decision points — ALL RULED at ratification (August 2, 2026)

1. **Fence posture for FMP descriptions — RULED (a).** Verbatim under attribution, SEC
   precedent; fence-swept in reporting mode only — Fabio posts trips to the record
   pre-launch, no gate, no suppression. (Option (b), fence-as-gate, was declined: it
   would silently blank many large-cap descriptions.)
2. **Tiers — RULED: both.** The plumbing is tier-neutral; both tiers see the panel (it
   evaluates nothing), served through each tier's existing shape.
3. **Placement — RULED: inline row expansion.** Layout judgment calls still disclosed on
   the PR per house practice.

## Build slices (one file per commit, Clyde)

- **p0** — this assignment, committed verbatim (post-ratification).
- **p1** `src/routes/routes.ts` — `GET /api/holdings/company?ticker=` — auth-gated (both
  tiers, per ruling 2), reads `fmp_cache.profile` only, h6 name-guard re-checked at serve
  time, standard rate limiter. 404-shape when no profile.
- **p2** `src/engine/reference-shape.ts` — allowlist the panel fields explicitly (B2 law:
  nothing ships that isn't enumerated): description, city, country, sector, industry,
  exchange, website, ipoDate, companyName, plus a `source: 'fmp'` literal.
- **p3** `client/src/pages/reference/FundDetail.tsx` — row expand + panel + attribution +
  Wikipedia link (`https://en.wikipedia.org/wiki/Special:Search?search=<url-encoded name>`,
  `target="_blank" rel="noopener"`).
- **p4** — fence-report script over all cached descriptions (reporting mode, per ruling
  1): stem sweep posted to the record before launch, Robert eyeballs.
- **p5** `FOLLOWUPS.md` — coverage line (profiles missing for local-code tickers — mostly
  Shenzhen/Shanghai/KRX lines), revisit after a future FMP tier decision.

## Out of scope

Live FMP fetches on click; price/valuation data; EDGAR links (separately decided: search
link only, not built now); any change to holdings resolution (that is H1); any DDL.

## Verification (S-H2, Fabio, post-merge)

Nestlé/Samsung/TSMC panels render with correct companies and attribution; Fubon renders
fallback (until FMP corrects their FUISF profile) — proving the guard; a no-profile
local-code row renders the Wikipedia-only fallback; unauthenticated request → 401 JSON;
fence report posted. Added post-U1-A: `/api/scores` for a member byte-diffed against the
August 13 baseline (expected IDENTICAL — H2 ships nothing through it), and the new
`/api/holdings/company` response field-audited with a member token against p2's
enumeration — the nine fields plus the source literal, nothing else.

*— Drafted by Fabio, August 2, 2026, for Robert's ratification. Ratified same day, all
three decision points ruled by Robert (banked, Status Notes v9–v10). Status line updated
and base-at-handoff recorded by Fabio, August 13, 2026, at handoff to Clyde. Fabio, for
the record.*
