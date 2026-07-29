# FUNDLENS FSPGX CLOSING HANDOFF — FSPGX Wave and the July 29 Heal, to the Repair Record Wave

Authored by Fabio at the July 29, 2026 session boundary. This document is the permanent repository record of the FSPGX wave's closure and the same-morning production heal, and it is the opening context for the wave that follows. It rides as commit c0 of that wave, committed verbatim to the repository root under the filename FUNDLENS_FSPGX_CLOSING_HANDOFF.md.

Structure pins for paste verification: the first line of this file is the title heading above; the last line is the Fabio sign-off. This document contains zero web links and zero bare domains by design. The expected count of the two-character sequence right-bracket-then-open-parenthesis in this file is ZERO. Per the standing commit rule for handoffs, Clyde declares the expected count from the received copy before committing, and the committed file's grep count must equal that declaration. If a pasted copy of this document shows a clickable link anywhere, the paste mutated in transit and must be re-supplied, never repaired by guesswork.

## 1. Where production stands

Main is commit 8bf987c, a true merge commit of pull request 52 with parents 0b3bb49 and 22b3938, and its tree is byte-identical to the reviewed pull request head. The five one-file wave commits are reachable on main at their exact identifiers: c0 d98f15e (the prior handoff), c1 2cd61a5 (the assignment record with its gate amendments), c2 c26e32b (the series-direct EDGAR lookup in edgar.ts), c3 855cdee (real filing stamps and insert-then-scoped-purge in persist.ts), c4 22b3938 (the sector donut pass-through fix in the reference fund detail page). The hosting service deploys main, and the live client bundle was verified to carry the c4 change byte-for-byte, which proves the deployed build is the merge.

## 2. What happened on the morning of July 29 — the heal, start to finish

The merge landed at 02:17:02 UTC, seventeen minutes after the 02:00 UTC scheduled run had already started on the old code. That old-code run failed FSPGX one final time and sent the last old-code alert email at about 02:06 UTC. That email was expected and was not a defect.

Robert then triggered four runs through the admin Refresh Analysis button between 02:29 and 03:03 UTC, confirmed in his own words. All four resolved FSPGX perfectly: accession 0000035402-26-004115, report date 2026-04-30, 392 of 392 holdings, gate passing. The c2 lookup repair is proven in production four times over.

But zero holdings rows reached the database from those four runs. Root cause, pinned by direct reads of the live database catalog: a second uniqueness rule existed on holdings_cache — a UNIQUE constraint named holdings_cache_fund_cusip_uq on the pair fund_id and cusip. It was present only in the live database and appears in no migration, no code, and no document anywhere in the repository. It was schema drift, most likely hand-added in the dashboard long ago. It forbade a fund from holding rows from two filings at once, which is exactly the brief side-by-side state the new persist creates on purpose before purging the old filing. The old code never tripped it only because its blanket pre-insert wipe emptied each fund first. The c3 safety design absorbed the failure exactly as intended: every insert chunk failed, the purge was skipped, every fund kept serving its existing rows, and nothing was lost.

A reporting gap was found in the same investigation: the admin route discards the persist step's error list — routes.ts line 773 awaits persistPipelineResults without capturing its result — so the four run rows showed an empty error list while the real failure messages went nowhere. The constraint name survives only in the hosting dashboard's console logs, in lines beginning with the supaFetch failure prefix, should anyone ever want the independent trace.

Robert ruled the fix and executed it himself in the Supabase SQL editor:

    alter table public.holdings_cache
      drop constraint if exists holdings_cache_fund_cusip_uq;

Fabio verified the catalog afterward: the stray constraint is gone; the intended unique index idx_holdings_unique on fund_id, accession_number, and cusip is intact; the primary key, the foreign key to the funds table, and both lookup indexes are intact.

Proof run acd00349, triggered by Robert through Refresh Analysis, ran 14:18:51 to 14:25:12 UTC: completed 23 of 23 with an empty and this time truthful error list. The census after it: all 21 equity funds carry exactly one cache group each, stamped with a real accession and a true filing report date (month-ends from February 28 through May 31 of 2026); zero blank-accession rows remain anywhere; FSPGX carries its real April 30 filing with 391 stored rows (392 fetched, one pair merged by the standing duplicate handling), its July 24 legacy group purged; cache total 9,497 rows; both money market funds absent by design.

## 3. Standing truths changed by the heal

Cache stamps and served as-of dates now agree — the cache carries real filing provenance for the first time since April. The FSPGX alert staying quiet is a meaningful health signal again. The night of July 29 to 30 at 02:00 UTC is the first scheduled-path run of the new code and is expected clean. FSPGX's cohort files quarterly; its next filing is expected around late September 2026, and the series-direct lookup makes the old candidate-list arms race irrelevant to it.

## 4. The next wave — the Repair Record wave, ordered queue

One pull request off main at 8bf987c, one file per commit, standard laws in force.

c0 — this document, committed verbatim to the repository root under its stated filename, grep declaration honored.

c1 — a migration file recording the already-executed constraint drop, so the repository's paper trail matches the live schema. Suggested path: migrations, filename drop_holdings_cache_fund_cusip_uq.sql. Content: the exact statement shown in section 2, preceded by a comment stating that Robert executed it by hand in the Supabase SQL editor on July 29, 2026, that the file is the record of that executed action and not a pending migration, and a one-line summary of why the constraint had to go. Fabio's next session writes the exact order; this entry stages it.

c2 — the reporting gap: capture the result of persistPipelineResults in the admin route at the routes.ts line 773 region and merge its errors into the run row, so a persist failure can never again hide behind an empty error list. Smallest change that accomplishes it, one file, Fabio reviews the diff before merge.

FOLLOWUPS note for the next touch of that file: the standing lesson from this incident — index and constraint claims are verified against the live database catalog, never against repository files alone.

## 5. Process notes for the incoming session

Lane roles unchanged: Fabio plans, verifies, and reads only; Clyde builds, one file per commit; Robert relays between them, merges with a merge commit, and personally executes anything that touches the production database. The relay law, the evidence gate, one instruction at a time in plain words, and the v8 protection law all stand. The memory record for this session was written before this document, and this document is authoritative where the two ever disagree about repository facts, because it is the copy that lives beside the code.

Fabio, July 29, 2026 — FSPGX wave closed, production healed, record staged.
