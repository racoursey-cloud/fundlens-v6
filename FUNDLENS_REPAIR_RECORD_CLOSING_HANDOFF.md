# FUNDLENS REPAIR RECORD CLOSING HANDOFF — The Repair Record Wave, Built, Verified, and Merged

Authored by Fabio at the July 29, 2026 session boundary, hours after the FSPGX closing handoff opened this wave. This document is the permanent repository record of the Repair Record wave and the opening context for whatever wave follows. It rides as commit c0 of that wave, committed verbatim to the repository root under the filename FUNDLENS_REPAIR_RECORD_CLOSING_HANDOFF.md.

Structure pins for paste verification: the first line of this file is the title heading above; the last line is the Fabio sign-off. This document contains zero web links and zero bare domains by design. The expected count of the two-character sequence right-bracket-then-open-parenthesis in this file is ZERO. Per the standing commit rule, Clyde declares the expected count from the received copy before committing, and the committed file's grep count must equal that declaration. Handoffs now travel as files rather than pastes, so a full-file checksum stated by Fabio at delivery is the primary gate, with the grep count and the pinned first and last lines standing alongside as the ratified checks.

## 1. Where production stands

Main is commit b21a9cadc3c10e7b8d649d03700dc7da98d0a804, a true merge commit of pull request 53 with parents 8bf987c44bb0d585a7097852f67563376fad13df and 19873684dfabb7f62478c096c2138c74b468e674, and its tree ee6a6d2a2bd2f1329e104f7ad49d4e1af250bb9d is byte-identical to the reviewed, battery-passed wave head. The hosting service deploys main. The five one-file wave commits are reachable on main at their exact identifiers: c0 22c2b28d1460d23495c26c746437773197925f46, c1 4ace51f1b822f65ba01da666f6db22a413974a1c, c2 cfa0b2113bf22444663dfbc1b759bd20eaef060d, c3 30311052cd6191db59b1e368c39a368679f00857, c4 19873684dfabb7f62478c096c2138c74b468e674.

## 2. What the wave did

c0 committed the FSPGX closing handoff verbatim at the repository root, byte-identical to the canonical copy, grep declaration of zero honored.

c1 committed the migration paper trail: a file recording the constraint drop Robert executed by hand in the Supabase SQL editor on July 29, 2026 — the record of an executed action, never a pending migration.

c2 was RELOCATED BY RULING from the staged admin-route capture into the save step itself: persist now merges its own failure list into the run row's error field at the single place that field is written. This cures all three runner paths at once — the admin button, the retry path, and the nightly job — where the staged location would have cured one of three. Reason: the session's reads showed the retry path also discarded the save step's result, the nightly only printed a count to the console, and the run row's error field was written by the save step itself from pipeline errors alone.

c3 taught the shared insert helper an optional setting that names the unique columns defining a duplicate, passed through to the database's conflict-target parameter. c4 put it to use: the holdings save now names fund_id, accession_number, cusip. Together they close the finding that upserts had been falling back to the primary key — harmless under the old wipe design, but a nightly collision generator under the new insert-in-place design, whose in-code idempotency claim is now true instead of aspirational. The wave was EXTENDED BY RULING to include these two commits.

Every code commit was double-checksum pinned: Fabio authored the exact bytes and stated the file's hash both before and after the change, Clyde verified the before-hash prior to touching anything and the after-hash prior to committing, and Fabio verified byte-identity of every committed file independently from the repository. The fresh-container battery at the head passed in full: install clean, root type check zero errors, root build clean end to end, client type check zero errors.

## 3. Process events of record

Mid-c0, Clyde's environment requested permission to edit the uploaded handoff source file. DENIED as a matter of principle: the received copy is chain of custody and stays byte-untouched forever; a copy reads the source and creates the destination; any believed defect in a received document is stated in words and cured by re-supply from Robert, never repaired in place. The second permission request — plain copy plus read-only pre-commit declarations — was the cured form and was approved. The double-checksum order format is now the standing method for code commits.

## 4. Standing truths after this wave

An empty error list on a run row is meaningful again: save-step failures surface from all three runner paths. Same-filing re-runs update holdings rows in place; new filings insert cleanly and the scoped purge retires the old accession. The night of July 29 to 30 at 02:00 UTC is the first scheduled run of the fully merged repair and is expected genuinely clean: 23 of 23, a truthfully empty error list, holdings written in place with cache totals steady near 9,497, real filing stamps preserved, and the FSPGX alert quiet — with the alert's silence once again a real health signal. Any errors that do appear in that run row are real and visible, which is the fix working. FSPGX's next filing is expected around late September 2026 and resolves by the series-direct path.

## 5. The next wave — c0 staged, the rest for Robert's choosing

c0 — this document, committed verbatim to the repository root under its stated filename, grep declaration honored.

Nothing beyond c0 is staged as law. The first duty of the next session, before any new work: verify the overnight scheduled run in the database — the run row and the holdings census — against the expectations in section 4. Queue candidates awaiting Robert's ruling, in no ruled order: the FOLLOWUPS rider recording the standing lesson that index and constraint claims are verified against the live database catalog and never against repository files alone; the B8 hardening ledger; the server-side cash-sweep flag; the auth file narration sweep; sector-color unification; the final disclaimer copy owed before launch.

## 6. Process notes for the incoming session

Lane roles unchanged: Fabio plans, verifies, and reads only; Clyde builds, one file per commit; Robert relays, merges with a merge commit, and personally executes anything touching the production database. The relay law, the evidence gate, one instruction at a time in plain words, and the v8 protection law all stand. The memory record for this session was written before this document, and this document is authoritative where the two ever disagree about repository facts, because it is the copy that lives beside the code.

Fabio, July 29, 2026 — Repair Record wave closed and merged; the pipeline now tells the truth about itself.
