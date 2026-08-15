# H3 — Company Panel Everywhere & Cross-Fund Holdings Search

## Status: RATIFIED — August 15, 2026, by Robert · planned by Fabio · to be built by Clyde · merges are Robert's alone, every PR, every size

> **GOVERNING PRINCIPLE — Robert, August 15, 2026, verbatim:**
> *"At any point that I see something — oh, tell me more about that — I want to be a click away from that."*
>
> This principle governs both slices the way "one app, one truth" governed U1. Every holding row, everywhere the shared panel renders, opens the company panel. Every search result is one click from the same panel. No dead ends.

Base: main, post-M1 (PR #76 merged and verified 9/10, August 15 — v17). Clyde states the actual pin at Evidence Gate before writing a line. M1-F1 (profile triple-fetch micro-order) is separate work and neither blocks nor is blocked by H3; if both are in flight, Clyde reports the overlap rather than resolving it silently.

---

## 1. Rulings of Record

1. **The governing principle** (Robert, August 15, quoted above) — credited and dated at the top of this order, as U1 carried "one app, one truth."
2. **SEARCH PLACEMENT — RULED by Robert, August 15, 2026, this session: two homes, two scopes.** Verbatim in substance (voice): search belongs *"above the [fund] list"* on the **Funds page**, scoped to **all 23 funds** — *"of these twenty-three funds, which ones hold the following company? That might just make them immediately on or off the list for some people."* And it belongs on **My Mix**, scoped to **only the funds in the mix on screen** — the member has built *"a facsimile of their existing selections or any other hypothetical set of allocations,"* and looking at it should be able to ask *"if I have this, do I have any of X Y Z company?"* — whether because they particularly want that company or particularly do not, for personal reasons. Same search, two scopes; the surface determines the scope. (Supersedes the single-home options prepared in the handoff; this ruling is the union that serves both use cases.)
3. **Both tiers see the company drill-in on the shared panel** — already ratified by H2 ruling 2; carried here, not re-decided. requireAuth on the new search route, both tiers, no tier wall (the fund lineup and filed holdings are the same truth for everyone; nothing full-tier enters the payload).
4. **B2 law — the search response is a ruled allowlist ADDITION** to reference-shape.ts, exactly as H2 p2 was: every field explicitly enumerated, display-ticker honesty (the m8 "OTC · OTC quote" convention) carried through. Nothing serves that isn't named in §5 t2.
5. **h3-3 — MY MIX PAGE SEPARATION, added on Robert's word, August 15, 2026.** Verbatim in substance (voice): the move from the fund list, Total, and Save straight into combined expense ratio and the donut is *"a harsh jump… no explanation of what someone's looking at… it all seems to kinda run together."* No separate tab. The page should read as: *"here are the funds you can choose and enter what percentages you want — and then: this is what that result looks like."* Drafted as slice t8, presentational only.

## 2. Standing Laws (all in force, restated for this wave)

- Evidence Gate: Clyde reads every context file and states findings before writing. One file per commit; every commit message cites its task number.
- v8 Protection Law: no H3 file touches src/engine/regime*, race*, french*, contenders/. **The fence is untouched. Generation is untouched. No Claude call is added anywhere in H3 — this wave is pure stored-data plumbing and UI.**
- **No DDL.** No migrations, nothing for Robert to run in the SQL Editor. The search route reads holdings_cache as it stands.
- The nightly pipeline is untouched and never enters this wave.
- Env names, Claude call patterns, constants.ts: untouched (nothing in this order authorizes any change to them).
- Findings law: blocking findings fixed in-slice; cosmetic → FOLLOWUPS.md.
- All production probes target www.fundlens.app — never the bare apex.
- Merge authority (v16 reaffirmation): Robert's alone, every PR, every size. **Clyde opens the PR and never merges it.** Fabio's S-H3 battery runs before Robert's merge decision.
- Relay law: this order reaches Clyde only as the committed file (t0) or in fenced blocks addressed "CLYDE —". Nothing outside such a block is an instruction to Clyde.

## 3. Evidence of Record (Fabio, August 15 — DB facts from read-only Supabase MCP reads today; repo facts from the verified record v13–v17, to be re-proven by Clyde at Evidence Gate)

- **The shared FundExposurePanel** (born U1-B t3) renders on three surfaces: every fund's Sectors tab; My Mix, both tiers (M1 m3); the Brief allocation card. Since M1 it already shows the per-company "held through more than one fund" look-through with per-fund contributions — H3's opening argument, live in production.
- **H2's drill-in machinery exists and is proven:** /api/holdings/company endpoint; the h6 serve-time name-guard (refuses on mismatch); the ruled fallback — dash/no-ticker rows open to filed-name + Wikipedia link, zero network calls. S-H2 passed with the member payload byte-identical across the deploy (v13).
- **holdings_cache today (read-only, August 15):** 9,502 rows across **21 of 23 funds**. ADAXX and FDRXX — both money market funds — have **zero holdings rows**; search must be honest about that in copy (§6), not silent. Latest report_date on file: 2026-06-30.
- **3,108 of 9,502 rows (~33%) have no usable ticker** (NULL or dash). The h6 fallback path is a third of the data, not an edge case. Search must match these rows by name, and their result rows open the fallback panel exactly as their holding rows do.
- **The motivating example is true in production data** (proper SQL join, per the v17 misjoin rule): Dollar General is held by VADFX at 0.1442% (filed as "Dollar General Corp.", ticker DG) and FXAIX at 0.0374% (filed as "DOLLAR GEN CORP NEW", ticker DG). **Two filed names, one ticker** — so matching is on name OR display ticker, and result grouping keys on display ticker when present, else exact filed name (§5 t3, disclosed as judgment call §7-c).
- **Mix state is per-account and can be legitimately unsaved/hypothetical** (confirmed today: the two live accounts hold two different saved mixes, each persisting correctly). Only the client knows the mix on screen at any moment. Therefore the My Mix scope (ruling 2) is applied **client-side** over the all-funds response — the server stays stateless and one endpoint serves both homes (§7-d).
- **Zero media queries app-wide** (M2 probe fact, v17). h3-3 changes structure and labels, not responsive behavior — mobile M2 stays parked and untouched.

## 4. Database

None. No DDL, no seeds, no SQL for Robert to run. Read-only queries against holdings_cache and funds happen inside the one new route.

## 5. The Build (one file per commit, dependency order; commit messages cite task numbers)

- **t0** — FUNDLENS_H3_ASSIGNMENT.md: this order, committed verbatim (docs reach the repo only through Clyde).
- **t1 — h3-1, COMPANY PANEL EVERYWHERE** — client/src/components/FundExposurePanel.tsx (or the actual filename Clyde confirms at Evidence Gate): the company drill-in wired onto holding rows in **both** the sector-drill list and the top-holdings list. Pure reuse: same /api/holdings/company endpoint, same h6 serve-time name-guard, same dash/no-ticker fallback (filed-name + Wikipedia, zero network). No new endpoint, no new component — the existing company panel opens from rows that today are inert. One wiring; the fund Sectors tabs, My Mix both tiers, and the Brief allocation card all light up at once.
- **t2 — the allowlist addition (B2 law)** — reference-shape.ts: the search response enumerated exactly. Fields, and no others:
  - `query` (the echoed search string, trimmed)
  - `companies[]`: `companyName` (filed name as stored), `displayTicker` (nullable; carries the m8 OTC-honesty convention exactly as the panel shows it)
  - `companies[].funds[]`: `fundTicker`, `fundName`, `pctOfNav`, `reportDate`
  - Explicitly absent, forever unless separately ruled: cusip, value_usd, sector, industry, country, accession_number, is_look_through, and every scoring/full-tier field. The enumeration audit (S-H3 leg 2) checks against this list byte-for-byte.
- **t3 — the search route** — src/routes/routes.ts: `GET /api/holdings/search?q=` — requireAuth (both tiers, ruling 3) + holdingsSearchRateLimit (new, the standing member-cadence shape; **30/hour per user**, judgment call §7-b). Validation: q trimmed, 2–80 chars, else 400 JSON. One SQL read, **joined in SQL** (the v17 law): holdings_cache JOIN funds ON fund_id, WHERE name ILIKE '%q%' OR upper(ticker) = upper(q); group per company by displayTicker-else-filed-name (§7-c); within each company, funds ordered by pctOfNav descending; response capped at 20 companies (§7-b), serialized through the t2 allowlist and nothing else.
- **t4 — client API** — client/src/api.ts: `searchHoldings(q)` + response types matching t2.
- **t5 — the shared search component** — client/src/components/HoldingsSearch.tsx (new): input + submit (Enter or button — **no per-keystroke calls**, §7-b), result list grouped per company, each fund row showing "held by {fundTicker} at {pct}%" with the fund name; **every company result opens the company panel in one click** (the t1 machinery, fallback included — the governing principle applies to search results too). Takes a scope prop: `all`, or a set of fund tickers to keep. Loading, error, and empty states from §6.
- **t6 — Funds page home** — the Funds page file: HoldingsSearch mounted **above the grid**, scope `all` (ruling 2: all 23, the on-or-off-the-list question). Coverage line from §6 beneath the input.
- **t7 — My Mix home** — the My Mix page file: HoldingsSearch mounted in the results region, scoped **client-side to the funds with nonzero allocation on screen at that moment** (ruling 2: the facsimile question; works identically for saved, edited, and never-saved mixes). Zero-allocation state: the search renders disabled with the §6 zero-state line.
- **t8 — h3-3, the separation (ruling 5)** — the My Mix page file: the page restructured into two labeled regions, no new tab, no new component logic: **"Build your mix"** (the sortable fund list, percentage entry, Total, Save, badge — all M1 behavior untouched) and **"What this mix holds"** (the combined expense line, sector bars, donut, top holdings — the shared panel — plus the t7 search), with the §6 explainer line opening the second region. Structural markup and headings only; m1 sorting, m2 badge lifecycle, and panel internals byte-equivalent in behavior.

## 6. Copy (ratify or edit, Robert — every line vetoable)

- **Search placeholder, both homes:** "Look up a company — e.g. Dollar General or DG"
- **Coverage line (Funds page, under the input):** "Searches the holdings each fund files with the SEC. Money market funds (ADAXX, FDRXX) hold cash instruments, not companies, and aren't included."
- **Empty state, Funds page:** "No fund in the lineup files a holding matching '{q}'."
- **Empty state, My Mix:** "None of the funds in this mix hold '{q}'. To search all 23 funds, use the Funds page." (the cross-link is one click, §7-e)
- **Zero-allocation state, My Mix:** "Enter percentages above to search what your mix would hold."
- **Region heading 1 (t8):** "Build your mix"
- **Region heading 2 (t8):** "What this mix holds"
- **Explainer line under heading 2:** "Everything below is what the mix you've entered above would actually hold — its combined cost, sectors, and companies. It updates as you change your percentages."
- **As-of framing:** search results carry each fund's reportDate exactly as the panel's existing convention shows it; no new date language invented.

## 7. Judgment calls, disclosed (each vetoable at ratification)

- **(a) Mix-first is NOT drafted.** Robert's second placement message superseded the mix-first blend Fabio floated in chat: the two homes have clean, distinct scopes instead. Recorded so the chat trail and the file can't disagree.
- **(b) Rate ceiling 30/hour, submit-style search, 20-company cap.** The standing member cadence is 20/hour (helpChat/helpAsk); search is a cheap indexed read a member may repeat while screening a list, so Fabio drafted 30. If the logs show walls, a micro-order moves the number.
- **(c) Grouping keys on display ticker when present, else exact filed name** — forced by the evidence (Dollar General files under two names, one ticker). Cost: a company with no ticker filed under two spellings shows as two results; accepted, honest to the filings.
- **(d) My Mix scope applied client-side** over the all-funds response (evidence §3: only the client knows the on-screen, possibly unsaved mix). One endpoint, one allowlist, zero server state.
- **(e) The My Mix empty state names the Funds page** — serves the "particularly does not want" screening without adding UI; strike the sentence if it reads as clutter.

## 8. Explicitly out of scope (scope discipline)

The fence files (v8 law) · generation and every Claude call path · any DDL · /api/scores and every existing payload (byte-diff proves it) · the nightly pipeline · M1-F1 (separate micro-order) · mobile M2 (parked; zero media queries stays true) · Help, dossiers, Brief/Research content · a global header search (considered in the handoff options, not chosen — revisit only by new ruling) · typeahead/per-keystroke search · fuzzy matching beyond ILIKE substring + exact ticker.

## 9. Robert's actions

1. **Done — RATIFIED by Robert, August 15, 2026, no edits.** The status line is flipped, this final text is banked to Drive, and this ratified file is what Clyde receives. The §6 copy and §7 judgment calls stand as drafted, by ratification.
2. Relay to Clyde in a fenced block addressed "CLYDE —" (Fabio prepares it on Robert's word).
3. Nothing to run in the SQL Editor this wave.
4. After Clyde's PR is open and Fabio's S-H3 battery is green: Robert decides the merge. Nobody else merges anything.

## 10. STOP S-H3 — acceptance battery (written for Fabio, against production at www.fundlens.app, post-merge)

1. **Panel from all three surfaces, member-tested:** on the member account (Robert authenticates, Fabio drives, per the shared-tab protocol): a holding row opens the company panel from (i) a fund's Sectors tab sector-drill list, (ii) My Mix top-holdings list, (iii) the Brief allocation card. Full-tier spot-check on one surface. A dash/no-ticker row proven to open the fallback (filed-name + Wikipedia, zero network — network tab evidence). **h6 mismatch refusal proven on every new path:** the guard refuses a mismatched name via a search-opened panel exactly as it does via a holding-row-opened one.
2. **Search member payload enumeration audit:** the response contains exactly the t2 fields and nothing else — audited key-by-key against §5 t2; forbidden-substrings sweep (cusip, value_usd, scoring vocabulary, full-tier nouns) zero hits; unauth 401 JSON; rate limiter observed live (31st call walls).
3. **/api/scores byte-diff, pre/post-merge, per the standing protocol.** The old baseline (sha c3c163a2…, asOf 2026-08-15T02:25:04Z) is dead after tonight's 02:00 UTC refresh — Fabio captures a fresh same-data-day baseline before Robert merges. If the merge outruns the ping again, the accepted fallback applies: 11-fund0Keys shape audit + forbidden substrings + ?shape=full identity + 401/403 walls + zero-relevant-server-lines from Clyde's diff.
4. **Acceptance probes, live:** "Dollar General" → VADFX 0.14% and FXAIX 0.04%, unified under DG despite the two filed names; "DG" → same result; "dollar" (partial, lowercase) → matches; ADAXX and FDRXX absent from all results; a no-match probe renders the §6 empty state. **My Mix scope:** with only FXAIX allocated on screen, the DG result shows FXAIX only; with the mix cleared, the zero-state renders; an unsaved hypothetical scopes identically to a saved one.
5. **h3-3 regression spot:** both regions labeled per §6; m1 name-sort still proves (BlackRock before BrandywineGLOBAL); m2 badge lifecycle intact (dirty → gates Save at ≠100% → clears on revert); Total and Save untouched.
6. **Battery green:** health 200; the 401-JSON trio; tier walls unchanged elsewhere (pipeline 403, dossiers 403, /api/thesis/latest 403 for a member); Clyde's diff shows zero server lines beyond t3's named route and zero engine files.

## 11. The scoreboard framing

M1 gave the mix a mirror; H2 taught one list to answer questions. H3 makes the answer universal: every company name in the app — in a sector drill, a top-ten list, a search result — is a door, and the same door everywhere. And the question Robert built the tier for — "do I own any Dollar General?" — gets answered in one box, honestly, from the funds' own filings, at both the places a member would think to ask it.

*— Drafted by Fabio, August 15, 2026, from the outgoing session's handoff, the v13–v17 record, today's read-only DB evidence, and Robert's two placement rulings of this afternoon. Ratified by Robert the same afternoon, without edits — the §7 judgment calls stand as drafted. Fabio, for the record.*
