# B9-T — Translations Go Live: the Flag Flips
## Status: RATIFIED — August 1, 2026, by Robert · planned by Fabio · to be built by Clyde
### Execution record (August 1, 2026 — everything but the flip is DONE)
- Summaries deletion ceremony ran on Robert's typed approval: 23 rows
  deleted, count exact, table empty.
- Translations COMPLETE: 23 of 23 stored. 21 generated first run; WEGRX
  clean on the re-click; MADFX fence-rejected twice on filed-language
  carry-over ("financially strong" / "decline in strength" / "more
  attractive") and was hand-drafted by Fabio, approved and written on
  Robert's typed word — provenance stamped in translation_model. (The
  re-click's "Failed to fetch" in the UI was the browser dropping the
  response; the server completed the run — noted for the record.)
- Fence sweep executed IN the database across all 23 stored
  translations: every banned stem and full-tier noun checked, ZERO hits.
  Verification §1's fence leg is green pre-flip; §1's payload pin and
  §2's render spot-checks remain for post-deploy.
- Remaining: Clyde builds t0–t2 → Robert reviews/merges → Railway
  deploys → Fabio runs the two remaining verification legs → Robert's
  live proofing tour begins.

Base: `main` at the PR #65 merge (post-CB-S).

## Ruling of record (Robert, August 1, 2026)

**Proof-after-serving.** Robert proofs the app manually, live, in place of
per-line pre-review. This supersedes B9 ruling 5's serving precondition
("served only after Robert reviews every line and HR signs off") for the
translations, in the spirit of rulings 7 and 8: the operator reviews the
finished, serving product; HR sees it on their own timetable; corrections
flow back through Fabio on Robert's word. **The B7 summaries are ruled
DELETED, not served** (Robert, same session): superseded content (B9 §6),
regenerated incidentally by today's Generate-panel test click, never
seen by Robert or any member. The data deletes now by ceremony (§ below);
the machinery (flag, serving path, generate route and button, drafting
engine) is dismantled in a housekeeping wave — until then the flag stays
false and a stray button click merely recreates harmless dark rows.

## Sequence (the flag serves nothing until step 1 runs)

1. **Robert, before or after merge:** Pipeline page → Generate → B9
   translations. 23 translations store flag-off (Sonnet seat, sequential,
   banned-vocab checked in prompt and code; rejected funds report by
   ticker and reroll on a re-click, same as the Help corpus did).
2. **Clyde builds the flip** (below); Robert reviews and merges; Railway
   deploys.
3. **Robert proofs live:** every reference fund's About tab now renders
   its Translation section (voice-separated, "Translation — plain
   English", our-voice styling per B9 ruling 3). Anything that reads
   wrong: tell Fabio, who reworded-and-updates the row on Robert's typed
   word (fence-checked before writing, provenance stamped), no deploy
   needed — translations serve from the table.

## Build order (one file per commit)

- **t0** `FUNDLENS_B9_T_ORDER.md` — this order, committed verbatim.
- **t1** `src/engine/constants.ts` —
  `REFERENCE_TRANSLATIONS_ENABLED` flips `false` → `true`, comment
  updated to cite this order and the proof-after-serving ruling. This is
  the assignment's one authorized constants change; the summaries flag
  above it does not move (it dies with its machinery at housekeeping).
- **t2** `FOLLOWUPS.md` — one line: B7 summaries machinery
  (REFERENCE_SUMMARIES_ENABLED, the reference-shape emission path, the
  generate route, the Pipeline button, the drafting half of
  fund-summaries.ts, and the reference_summaries table itself) is dead
  inventory ruled for dismantling — dedicated housekeeping wave, table
  drop by Database-law ceremony.

## Summaries data deletion (ceremony — no commit, runs on Robert's typed approval)

```sql
DELETE FROM reference_summaries;   -- expect 23 rows
```

## Verification (Fabio, post-deploy, at [www.fundlens.app](https://www.fundlens.app))

1. Bundle/payload pins: `translation_text` present in a reference fund
   payload (the B9 battery proved the key absent with the flag off — the
   same probe now proves presence); full-tier payloads byte-identical.
2. Spot-checks: three funds' Translation sections render with the
   voice-separation label; FXAIX/ADAXX/PRPFX translations read in
   register (banned-vocab regex over all 23 stored texts, on the record).
3. The generation counts: 23 of 23 stored, rejections rerolled to zero
   before the flip deploys (or Robert explicitly launches partial).

## Out of scope

`REFERENCE_SUMMARIES_ENABLED` (stays false; superseded content);
deletion of the B7 summaries table (housekeeping); any prompt or engine
change; HR sequencing (ruling 7 stands — they see the live feature).

*— Drafted by Fabio, August 1, 2026, for Robert's ratification.
Fabio, for the record.*
